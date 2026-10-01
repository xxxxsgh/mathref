/**
 * Feature `weapon` — viewmodel em primeira pessoa e lógica de tiro do IRONLINE.
 *
 *  - Fuzil procedural KR-9 (rifle.js) com materiais PBR de desgaste (materials.js)
 *    e mira holográfica com retículo no infinito (optic.js).
 *  - Mãos enluvadas articuladas + mangas com dobras (arms.js).
 *  - Animação procedural (anim.js): respiração, balanço de passo/corrida,
 *    inércia do olhar, ADS alinhando a mira ao centro, recuo por molas com
 *    chute de câmera, recarga completa (carregador sai/entra, tapa no retém
 *    ou alavanca de manejo), inspeção e saque.
 *  - Iluminação própria da cena da viewmodel casada com o mundo: mesmo sol
 *    (direção, cor, intensidade), sombra própria arma↔mãos, oclusão do sol
 *    por raycast (sombra de prédios escurece a arma), IBL do céu girado com
 *    a câmera, luz do clarão de boca.
 *
 * Serviço `weapon` (CONTRACT.md): gun, muzzle, ammo, reserve, magSize, ads,
 * reloading, name — mais: state, sprint, recoil, fireRate, debugPose(),
 * debugView(), fire(), reload(), inspect(), equip().
 */
import * as THREE from 'three';
import { makeMaterials } from './materials.js';
import { buildRifle, buildMag, buildCasing, DIM } from './rifle.js';
import { makeLens } from './optic.js';
import { Hand, POSES, clonePose, blendPoses, buildSleeve } from './arms.js';
import { Spring, Track, ease, clamp, lerp, smoothstep, wobble } from './anim.js';

// ─── poses-base (posição do PIVÔ da arma no espaço da câmera, rot em rad) ──
const PIVOT = new THREE.Vector3(0, -0.035, -0.14); // perto do poço do carregador
const HIP = { pos: new THREE.Vector3(0.088, -0.128, -0.36), rot: new THREE.Euler(0.03, 0.06, -0.04) };
const EYE_RELIEF = 0.185; // distância olho → ponto de visada no ADS
const ADS = { pos: new THREE.Vector3(), rot: new THREE.Euler(0, 0, 0) };
const SPRINT = { pos: new THREE.Vector3(-0.03, -0.045, 0.03), rot: new THREE.Euler(-0.32, 0.62, 0.42) };
const VM_FOV = { hip: 52, ads: 42 };
const ADS_FOV = 0.8; // fator do FOV do mundo no ADS (1x holográfica)

// ─── mãos: transformações-base no espaço da arma ─────────────────────────
function basis(xAxis, yAxis, pos) {
  const x = new THREE.Vector3(...xAxis).normalize();
  const y0 = new THREE.Vector3(...yAxis);
  const z = new THREE.Vector3().crossVectors(x, y0).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return { pos: new THREE.Vector3(...pos), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
}
/** Base por direção dos dedos F (= −Z da mão) e do dorso D (= +Y). */
function basisFD(F, D, pos) {
  const z = new THREE.Vector3(...F).normalize().negate();
  const y = new THREE.Vector3(...D);
  y.addScaledVector(z, -y.dot(z)).normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  return { pos: new THREE.Vector3(...pos), quat: new THREE.Quaternion().setFromRotationMatrix(m) };
}
const HAND_R = basis([0.06, -1, -0.18], [1, 0.05, 0.12], [0.034, -0.088, 0.052]);
const HAND_L = {
  guard: basisFD([0.7, 0.45, -0.4], [-0.6, -0.8, 0.05], [-0.05, -0.075, -0.33]),
};

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _org = new THREE.Vector3();

// ─── animações de ação (trilhas de keyframes) ────────────────────────────
// Canais da arma: [px, py, pz, rx, ry, rz] (offset no espaço da câmera / rad)
// Carregador: [px, py, pz, rx, ry, rz] relativo ao encaixe
// Mão esquerda: pesos [guarda, carregador, tapa, retém] + offset da mão
function makeReload(empty) {
  const T = empty ? 2.75 : 2.3;
  const gun = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.3, v: [-0.095, 0.095, -0.035, 0.1, 0.4, -0.275], e: 'inOut' },
    { t: 0.6, v: [-0.1, 0.1, -0.03, 0.13, 0.43, -0.303] },
    { t: 1.15, v: [-0.105, 0.098, -0.03, 0.1, 0.44, -0.319] },
    { t: 1.42, v: [-0.101, 0.1, -0.03, 0.12, 0.42, -0.297], e: 'inOut' },
    { t: 1.5, v: [-0.101, 0.114, -0.032, 0.17, 0.41, -0.275], e: 'out' }, // encaixe: tranco p/ cima
    { t: 1.62, v: [-0.099, 0.104, -0.03, 0.13, 0.41, -0.286] },
    ...(empty
      ? [
          { t: 1.95, v: [-0.085, 0.09, -0.04, 0.06, 0.5, -0.165] },
          { t: 2.08, v: [-0.087, 0.096, -0.025, 0.1, 0.52, -0.154], e: 'out' }, // retém liberado
          { t: 2.75, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' },
        ]
      : [{ t: 2.3, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' }]),
  ]);
  const mag = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.42, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.52, v: [0, -0.05, 0.004, 0.05, 0, 0], e: 'in' },
    { t: 0.8, v: [-0.08, -0.32, 0.08, 0.5, 0.3, 0.6], e: 'in' },
    { t: 0.81, v: [-0.06, -0.34, 0.06, -0.3, 0.2, 0.4], e: 'linear' }, // troca fora da tela
    { t: 1.18, v: [0, -0.07, 0.006, 0.06, 0, 0.05], e: 'out3' },
    { t: 1.44, v: [0, -0.012, 0.0, 0.0, 0, 0], e: 'inOut' },
    { t: 1.5, v: [0, 0, 0, 0, 0, 0], e: 'out' },
    { t: 3, v: [0, 0, 0, 0, 0, 0] },
  ]);
  const hand = new Track([
    { t: 0, v: [1, 0, 0, 0] },
    { t: 0.4, v: [0, 1, 0, 0], e: 'inOut' },
    { t: 1.48, v: [0, 1, 0, 0] },
    { t: 1.56, v: [0, 0, 1, 0], e: 'out' },
    { t: 1.68, v: [0, 0, 1, 0] },
    ...(empty
      ? [
          { t: 1.95, v: [0, 0, 0, 1], e: 'inOut' },
          { t: 2.1, v: [0, 0, 0, 1] },
          { t: 2.55, v: [1, 0, 0, 0], e: 'inOut' },
        ]
      : [{ t: 2.12, v: [1, 0, 0, 0], e: 'inOut' }]),
  ]);
  // retém do ferrolho: pressionado no tapa (vazio)
  const catchT = new Track([{ t: 0, v: [0] }, { t: 2.02, v: [0] }, { t: 2.07, v: [1], e: 'out' }, { t: 2.2, v: [0] }]);
  return { name: empty ? 'reloadEmpty' : 'reload', duration: T, gun, mag, hand, catchT, insertAt: 1.5, swapAt: 0.81 };
}

function makeInspect() {
  const gun = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.55, v: [-0.075, 0.06, 0.02, 0.12, 0.75, -0.28], e: 'inOut5' }, // lado esquerdo virado p/ câmera
    { t: 1.5, v: [-0.08, 0.065, 0.015, 0.16, 0.82, -0.3] },
    { t: 2.1, v: [-0.03, 0.06, 0.03, 0.25, -0.35, 0.75], e: 'inOut5' }, // gira: lado direito
    { t: 2.9, v: [-0.028, 0.062, 0.028, 0.28, -0.4, 0.8] },
    { t: 3.6, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' },
  ]);
  return { name: 'inspect', duration: 3.6, gun };
}

function makeEquip() {
  const gun = new Track([
    { t: 0, v: [0.05, -0.28, 0.05, -0.9, 0.25, 0.5] },
    { t: 0.5, v: [0, 0.006, 0, 0.03, 0, -0.02], e: 'out3' },
    { t: 0.68, v: [0, 0, 0, 0, 0, 0], e: 'inOut' },
  ]);
  return { name: 'equip', duration: 0.68, gun };
}

export default {
  name: 'weapon',
  order: 40,

  init(ctx) {
    const { vm, bus, input, quality } = ctx;
    this.ctx = ctx;
    const M = (this.M = makeMaterials());

    // ─── rig: câmera da viewmodel → rig → pivô animado → arma ─────────────
    vm.camera.fov = VM_FOV.hip;
    vm.camera.near = 0.01;
    vm.camera.updateProjectionMatrix();
    const rig = (this.rig = new THREE.Group());
    rig.name = 'weapon-rig';
    vm.camera.add(rig);
    const pivot = (this.pivot = new THREE.Group());
    rig.add(pivot);

    const R = (this.R = buildRifle(M));
    R.root.position.copy(PIVOT).negate();
    pivot.add(R.root);
    // lente holográfica no meio do capô
    const ow = R.opticWindow;
    const lens = makeLens({ w: ow.w, h: ow.h });
    lens.position.set(0, ow.y, (ow.z0 + ow.z1) / 2 + 0.02);
    R.root.add(lens);
    this.lens = lens;
    // posição de ADS: o ponto de visada vai para (0, 0, −alívio)
    ADS.pos.set(0, 0, -EYE_RELIEF).sub(_v.copy(R.sight).sub(PIVOT));

    // carregador reserva (aparece na mão durante a troca)
    this.magSpare = buildMag(M);
    this.magSpare.visible = false;
    R.root.add(this.magSpare);

    // ─── mãos e mangas ───────────────────────────────────────────────────
    this.handR = new Hand(M, { left: false });
    this.handL = new Hand(M, { left: true });
    R.root.add(this.handR.root, this.handL.root);
    this.handR.root.position.copy(HAND_R.pos);
    this.handR.root.quaternion.copy(HAND_R.quat);
    this.poseR = clonePose(POSES.grip);
    this.poseL = clonePose(POSES.guard);
    this.sleeveR = buildSleeve(M, { left: false });
    this.sleeveL = buildSleeve(M, { left: true, watch: true });
    rig.add(this.sleeveR, this.sleeveL);
    // "ombros" (âncoras dos antebraços) no espaço do rig
    this.anchorR = new THREE.Vector3(0.24, -0.46, -0.06);
    this.anchorL = new THREE.Vector3(-0.07, -0.5, -0.32);

    // ─── luzes da viewmodel ──────────────────────────────────────────────
    const vs = vm.scene;
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = !!quality.shadows;
    this.sun.shadow.mapSize.setScalar(quality.level === 'ultra' ? 2048 : 1024);
    Object.assign(this.sun.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.05, far: 4 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.0025;
    this.sun.shadow.radius = 3;
    vs.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd2ff, 0x4a3f33, 0.25);
    vs.add(this.hemi);
    // luz de recorte artificial suave (leitura da silhueta em sombra)
    this.rim = new THREE.DirectionalLight(0xdfe8ff, 0.35);
    this.rim.position.set(-1, 0.6, 0.4);
    vm.camera.add(this.rim);
    vm.camera.add(this.rim.target);
    this.rim.target.position.set(0, 0, -1);
    // clarão de boca
    this.flash = new THREE.PointLight(0xffa457, 0, 2.2, 2);
    R.muzzle.add(this.flash);
    this.flash.position.set(0, 0.01, 0.06);
    // ambiente fallback (sem a feature rendering)
    if (!ctx.service('rendering')?.environment && !vs.environment) {
      import('three/addons/environments/RoomEnvironment.js').then(({ RoomEnvironment }) => {
        if (vs.environment) return;
        const pm = new THREE.PMREMGenerator(ctx.renderer);
        vs.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
        vs.environmentIntensity = 0.6;
        this.ownEnv = true;
      });
    }

    // ─── cápsulas ejetadas (pool) ────────────────────────────────────────
    const casingProto = buildCasing(M);
    this.casings = Array.from({ length: 14 }, () => {
      const c = casingProto.clone();
      c.visible = false;
      c.userData = { v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 };
      vm.camera.add(c);
      return c;
    });
    this.ci = 0;

    // ─── estado ──────────────────────────────────────────────────────────
    const st = (this.st = {
      ammo: 30, magSize: 30, reserve: 150, rpm: 760, damage: 34, cooldown: 0,
      ads: 0, adsLin: 0, adsTarget: false, sprint: 0, sprintLin: 0,
      action: null, actionT: 0, actionDone: {},
      shots: 0, lastShot: -9, triggerHeld: false, burstCount: 0,
      sunVis: 1, indoor: 0, sunTimer: 0,
      bobPhase: 0, bobAmt: 0, prevYaw: null, prevPitch: null, landing: 0,
      magOut: false, flashT: 0, wantAuto: true,
    });
    this.spr = {
      recZ: new Spring(9, 0.55), recX: new Spring(7, 0.45), recY: new Spring(6, 0.55), recR: new Spring(6, 0.5),
      kickP: new Spring(5.5, 0.8), kickY: new Spring(5, 0.8), kickR: new Spring(7, 0.5),
      swayX: new Spring(5, 0.65), swayY: new Spring(5, 0.65), swayPX: new Spring(4, 0.7), swayPY: new Spring(4, 0.7),
      land: new Spring(7, 0.45), jolt: new Spring(10, 0.4),
    };
    this.climb = { p: 0, y: 0 }; // subida acumulada de recuo (volta devagar)
    this.myKick = { pitch: 0, yaw: 0, roll: 0 };
    this.lastKickTotal = null;
    this.anims = {
      reload: makeReload(false), reloadEmpty: makeReload(true), inspect: makeInspect(), equip: makeEquip(),
    };
    this.debug = null;
    this.trackOut = new Array(6).fill(0);

    if (!input.bindings.inspect) input.bindings.inspect = ['KeyI'];

    const preset = ctx.shot?.preset;
    if (preset?.ads) st.ads = st.adsLin = 1;
    if (!ctx.shot) bus.on('game:start', () => this.startAction('equip'));
    bus.on('player:land', (e) => this.spr.land.impulse(-Math.min(1.2, (e?.speed || 6) * 0.08)));
    bus.on('player:jump', () => this.spr.land.impulse(0.35));
    // ?wanim=reload:0.6 congela uma ação num instante (QA visual)
    const wa = ctx.params.get('wanim');
    if (wa) {
      const [n, t] = wa.split(':');
      this.debugPose(n, Number(t) || 0);
    }
    this.whand = ctx.params.get('whand');
    const wv = ctx.params.get('wview');
    if (wv) {
      const [y, p, d, ox, oy, oz] = wv.split(',').map(Number);
      this.debugView(y, p, d, ox, oy, oz);
    }

    const self = this;
    ctx.provide('weapon', {
      gun: R.root,
      muzzle: R.muzzle,
      get ammo() { return st.ammo; },
      get reserve() { return st.reserve; },
      get magSize() { return st.magSize; },
      get ads() { return st.ads; },
      get reloading() { return !!st.action && st.action.name.startsWith('reload'); },
      get state() { return st.action?.name || (st.sprint > 0.5 ? 'sprint' : st.ads > 0.5 ? 'ads' : 'idle'); },
      get sprint() { return st.sprint; },
      get recoil() { return self.spr.recX.x; },
      get fireRate() { return st.rpm; },
      name: 'KR-9',
      fire: () => self.fire(ctx),
      reload: () => self.tryReload(ctx),
      inspect: () => self.startAction('inspect'),
      equip: () => self.startAction('equip'),
      debugPose: (n, t) => self.debugPose(n, t),
      debugView: (y, p, d) => self.debugView(y, p, d),
    });
  },

  // ─── ações ───────────────────────────────────────────────────────────
  startAction(name) {
    const a = this.anims[name];
    if (!a) return;
    const st = this.st;
    st.action = a;
    st.actionT = 0;
    st.actionDone = {};
  },
  debugPose(name, t) {
    this.debug = { ...(this.debug || {}), anim: name, t };
    if (this.anims[name]) {
      this.startAction(name);
      this.st.actionT = t;
    }
  },
  debugView(yaw, pitch, dist = 0.7, ox = 0, oy = 0, oz = 0) {
    // gira a arma diante da câmera; (ox, oy, oz) = ponto da arma (espaço da
    // arma) que fica no centro da tela
    this.debug = { ...(this.debug || {}), view: { yaw, pitch, dist, focus: new THREE.Vector3(ox || 0, oy || 0, oz || 0) } };
  },
  tryReload(ctx) {
    const st = this.st;
    if (st.action && st.action.name !== 'inspect') return false;
    if (st.ammo >= st.magSize || st.reserve <= 0) return false;
    this.startAction(st.ammo === 0 ? 'reloadEmpty' : 'reload');
    ctx.bus.emit('weapon:reload', { duration: st.action.duration, empty: st.ammo === 0 });
    return true;
  },

  fire(ctx) {
    const { bus, collision, camera, rng } = ctx;
    const st = this.st;
    st.ammo--;
    st.shots++;
    st.cooldown += 60 / st.rpm;
    st.lastShot = ctx.time.now;
    st.burstCount++;
    const a = st.ads;
    const S = this.spr;
    // ─ recuo visual da arma (molas) ─
    const k = lerp(1, 0.45, a);
    S.recZ.impulse(0.55 * k + 0.1);
    S.recX.impulse(lerp(0.9, 0.35, a) * (0.85 + rng.next() * 0.3));
    S.recY.impulse((rng.next() - 0.5) * 0.5 * k);
    S.recR.impulse((rng.next() - 0.35) * 1.2 * k);
    // ─ chute de câmera: subida que acumula + tremor ─
    const climbP = lerp(0.0042, 0.0032, a) * (st.burstCount < 3 ? 1.25 : 1);
    this.climb.p += climbP;
    this.climb.y += (Math.sin(st.shots * 1.7) * 0.6 + (rng.next() - 0.5)) * 0.0016;
    S.kickP.impulse(0.09 * lerp(1, 0.7, a));
    S.kickY.impulse((rng.next() - 0.5) * 0.05);
    S.kickR.impulse((rng.next() - 0.5) * 0.16);
    st.flashT = 0.05;
    // ─ bala: do olho, na direção da câmera (com chute), com dispersão ─
    camera.updateMatrixWorld();
    camera.getWorldPosition(_org);
    camera.getWorldDirection(_dir);
    const moving = ctx.player.state?.speed || 0;
    const spread = lerp(0.028, 0.0015, a) + Math.min(0.02, moving * 0.003) * (1 - a * 0.7);
    const ang = rng.next() * Math.PI * 2, rad = Math.sqrt(rng.next()) * spread;
    _v.set(Math.cos(ang) * rad, Math.sin(ang) * rad, 0).applyQuaternion(camera.quaternion);
    _dir.add(_v).normalize();
    bus.emit('weapon:fire', { origin: _org.clone(), dir: _dir.clone(), muzzle: this.R.muzzle, ads: a > 0.5 });
    const hit = collision.raycast(_org, _dir, 900, { filter: (c) => c.tag !== 'player' });
    if (hit) {
      const head = hit.part === 'head';
      const dmg = st.damage * (head ? 2.4 : 1) * (hit.distance > 40 ? 0.8 : 1);
      const info = { ...hit, dir: _dir.clone(), damage: dmg, source: 'player' };
      // no preset 'combat' o tiro é só visual (não mata o inimigo da cena)
      if (!ctx.shot?.preset?.combat) hit.collider.data?.damage?.(dmg, info);
      bus.emit('weapon:hit', info);
    }
    this.eject(ctx);
  },

  eject(ctx) {
    const c = this.casings[this.ci++ % this.casings.length];
    const rng = ctx.rng;
    this.pivot.updateMatrixWorld(true);
    this.R.ejectPort.getWorldPosition(_v);
    ctx.vm.camera.worldToLocal(c.position.copy(_v));
    c.quaternion.copy(this.pivot.quaternion);
    c.rotateY(Math.PI / 2);
    const d = c.userData;
    d.v.set(1.6 + rng.next() * 0.6, 1.0 + rng.next() * 0.5, 0.35 + rng.next() * 0.3);
    d.w.set(rng.range(-25, 25), rng.range(-35, -15), rng.range(-10, 10));
    d.life = 1.1;
    c.visible = true;
  },

  // ─── passo fixo: lógica ──────────────────────────────────────────────
  update(dt, ctx) {
    const { input, player, bus } = ctx;
    const st = this.st;
    const preset = ctx.shot?.preset;
    const sprinting = !!player.state?.sprinting && !preset;
    st.sprintLin = clamp(st.sprintLin + (sprinting ? dt / 0.28 : -dt / 0.2), 0, 1);

    // ação em andamento
    if (st.action && !this.debug?.anim) {
      const a = st.action;
      const t0 = st.actionT;
      st.actionT += dt;
      if (a.insertAt && t0 < a.insertAt && st.actionT >= a.insertAt) {
        const n = Math.min(st.magSize - st.ammo, st.reserve) + (st.ammo > 0 && a.name === 'reload' ? 0 : 0);
        st.ammo += n;
        st.reserve -= n;
      }
      if (st.actionT >= a.duration) {
        if (a.name.startsWith('reload')) bus.emit('weapon:reloaded', { ammo: st.ammo });
        st.action = null;
      }
    }
    const busy = !!st.action && st.action.name !== 'inspect';

    // mira
    st.adsTarget = preset ? !!preset.ads : input.action('ads') && !busy && st.sprintLin < 0.5;
    if (st.adsTarget && st.action?.name === 'inspect') st.action = null;
    st.adsLin = clamp(st.adsLin + (st.adsTarget ? dt / 0.24 : -dt / 0.2), 0, 1);
    st.ads = ease.inOut(st.adsLin);
    player.fovFactors.set('ads', lerp(1, ADS_FOV, st.ads));

    st.cooldown = Math.max(-0.05, st.cooldown - dt);
    if (!preset) {
      if (input.pressed('reload')) this.tryReload(ctx);
      if (input.pressed('inspect') && !st.action && st.ads < 0.1) this.startAction('inspect');
      if (input.pressed('weapon1') && !st.action) this.startAction('equip');
    }
    // gatilho
    let trig = preset ? !!preset.combat : input.action('fire');
    if (preset?.combat && ctx.time.now > 0.75) trig = (ctx.time.now % 0.9) < 0.6; // rajadas
    if (!trig) st.burstCount = 0;
    const canFire = !busy && st.sprintLin < 0.15 && st.cooldown <= 0;
    if (trig && canFire) {
      if (st.action?.name === 'inspect') st.action = null;
      if (st.ammo > 0) this.fire(ctx);
      else {
        // vazio: clique seco no aperto e recarga automática (também segurando)
        if (!st.triggerHeld) bus.emit('weapon:dry', {});
        st.cooldown = 0.2;
        if (!preset) this.tryReload(ctx);
      }
    }
    st.triggerHeld = trig;
    // carregador vazio: recarrega sozinho logo depois do último tiro
    if (!preset && st.ammo === 0 && !st.action && st.reserve > 0 && ctx.time.now - st.lastShot > 0.3) this.tryReload(ctx);
  },

  // ─── por frame: pose, animação, luz ──────────────────────────────────
  frame(dt, ctx) {
    const { player, vm, camera } = ctx;
    const st = this.st;
    const S = this.spr;
    const R = this.R;
    dt = Math.min(dt, 0.05);
    const tnow = ctx.time.now;
    if (!vm.visible && !ctx.shot) {
      // continua atualizando kick/estado mínimo
    }

    // a câmera da viewmodel gira junto com a do mundo: luz do sol e IBL
    // ficam no MESMO referencial do mundo (reflexos corretos ao olhar em volta)
    vm.camera.position.set(0, 0, 0);
    vm.camera.quaternion.copy(camera.quaternion);
    vm.camera.fov = lerp(VM_FOV.hip, VM_FOV.ads, st.ads);
    vm.camera.updateProjectionMatrix();

    // ─ entradas da animação procedural ─
    st.sprint = ease.inOut(st.sprintLin);
    const speed = player.state?.speed || 0;
    const grounded = player.onGround !== false;
    const moveAmt = clamp(speed / (player.walkSpeed || 4.6), 0, 1.8) * (grounded ? 1 : 0.2);
    st.bobAmt = lerp(st.bobAmt, moveAmt, 1 - Math.exp(-dt * 8));
    st.bobPhase += dt * (speed > 0.1 ? 2.1 + speed * 0.85 : 0) * (grounded ? 1 : 0.3);

    // inércia do olhar (velocidade angular → atraso da arma)
    if (st.prevYaw === null) (st.prevYaw = player.yaw), (st.prevPitch = player.pitch);
    let dy = player.yaw - st.prevYaw, dp = player.pitch - st.prevPitch;
    st.prevYaw = player.yaw;
    st.prevPitch = player.pitch;
    if (Math.abs(dy) > 1 || ctx.shot) dy = 0;
    if (Math.abs(dp) > 1 || ctx.shot) dp = 0;
    const inv = dt > 0 ? 1 / dt : 0;
    const swayK = lerp(1, 0.25, st.ads);
    S.swayY.target = clamp(dy * inv * 0.022, -0.09, 0.09) * swayK;
    S.swayX.target = clamp(-dp * inv * 0.02, -0.07, 0.07) * swayK;
    S.swayPX.target = clamp(-dy * inv * 0.006, -0.02, 0.02) * swayK;
    S.swayPY.target = clamp(dp * inv * 0.005, -0.015, 0.015) * swayK;
    for (const s of Object.values(S)) s.update(dt);

    // subida de recuo acumulada: volta devagar depois de soltar o gatilho
    const since = tnow - st.lastShot;
    if (since > 0.12) {
      const r = 1 - Math.exp(-dt * 3.2);
      this.climb.p -= this.climb.p * r;
      this.climb.y -= this.climb.y * r;
    }

    // ─ pose-base: hip ↔ ADS ↔ corrida ─
    const a = st.ads, sp = st.sprint;
    const pos = _v.lerpVectors(HIP.pos, ADS.pos, a);
    let rx = lerp(HIP.rot.x, ADS.rot.x, a), ry = lerp(HIP.rot.y, ADS.rot.y, a), rz = lerp(HIP.rot.z, ADS.rot.z, a);
    // arco do ADS: a arma passa um pouco mais baixa/inclinada no meio do caminho
    const arc = Math.sin(Math.PI * st.adsLin);
    pos.y -= arc * 0.012;
    rz += arc * 0.06 * (st.adsTarget ? 1 : -0.5);
    pos.addScaledVector(SPRINT.pos, sp);
    rx += SPRINT.rot.x * sp;
    ry += SPRINT.rot.y * sp;
    rz += SPRINT.rot.z * sp;

    // respiração (8 s de ciclo lento + micro tremor)
    const br = lerp(1, 0.35, a) * (1 - sp);
    pos.y += Math.sin(tnow * 1.35) * 0.0018 * br;
    pos.x += Math.sin(tnow * 0.7 + 1) * 0.0011 * br;
    rx += Math.sin(tnow * 1.35 + 0.6) * 0.004 * br;
    ry += wobble(tnow * 0.6, 2) * 0.003 * br;
    rz += wobble(tnow * 0.5, 4) * 0.004 * br;

    // balanço de passo (figura de 8) — maior na corrida
    const bk = st.bobAmt * lerp(1, 0.12, a) * (1 + sp * 1.4);
    const ph = st.bobPhase;
    pos.x += Math.sin(ph) * 0.0075 * bk;
    pos.y += -Math.abs(Math.cos(ph)) * 0.009 * bk + 0.0045 * bk;
    rz += Math.sin(ph) * 0.018 * bk;
    rx += (Math.abs(Math.cos(ph)) - 0.5) * 0.012 * bk;
    ry += Math.cos(ph) * 0.01 * bk;

    // inércia e pouso
    rx += S.swayX.x;
    ry += S.swayY.x;
    rz += S.swayY.x * 0.6;
    pos.x += S.swayPX.x;
    pos.y += S.swayPY.x + S.land.x * 0.035 * (1 - a * 0.6);
    rx += S.land.x * 0.04;

    // recuo
    const rk = lerp(1, 0.65, a);
    pos.z += S.recZ.x * 0.05 * rk;
    pos.y += S.recX.x * 0.006 * rk;
    rx += S.recX.x * 0.055 * rk;
    ry += S.recY.x * 0.03;
    rz += S.recR.x * 0.03 * rk;

    // ação (recarga/inspeção/saque)
    const act = st.action;
    let handW = [1, 0, 0, 0];
    let magOff = null;
    let catchP = 0;
    if (act) {
      const t = st.actionT;
      const o = act.gun.eval(t, this.trackOut);
      const damp = 1 - a;
      pos.x += o[0] * damp;
      pos.y += o[1] * damp;
      pos.z += o[2] * damp;
      rx += o[3] * damp;
      ry += o[4] * damp;
      rz += o[5] * damp;
      if (act.hand) handW = act.hand.eval(t, [0, 0, 0, 0]);
      if (act.mag) magOff = act.mag.eval(t, [0, 0, 0, 0, 0, 0]);
      if (act.catchT) catchP = act.catchT.eval(t, [0])[0];
      if (act.name === 'equip') {
        // equipar: a mão esquerda chega depois
        const w = smoothstep(0.25, 0.6, t);
        handW = [w, 0, 0, 0];
      }
    }

    // ─ aplica no pivô ─
    this.pivot.position.copy(pos);
    this.pivot.rotation.set(rx, ry, rz, 'YXZ');
    if (this.debug?.view) {
      const v = this.debug.view;
      this.pivot.rotation.set(v.pitch, v.yaw, 0, 'YXZ');
      _v.copy(v.focus).sub(PIVOT).applyEuler(this.pivot.rotation);
      this.pivot.position.set(0, 0, -v.dist).sub(_v);
      vm.camera.fov = 50;
      vm.camera.updateProjectionMatrix();
    }

    // carregador
    const mag = R.mag;
    if (magOff) {
      mag.position.set(PIVOT.x * 0 + 0 + magOff[0], -0.05 + magOff[1], -0.172 + magOff[2]);
      mag.rotation.set(magOff[3], magOff[4], magOff[5]);
      // carregador velho até a troca; depois, o novo (cheio)
      const swapped = st.actionT >= (act.swapAt || 99);
      mag.children[0].getObjectByName('rounds').visible = swapped || st.ammo > 0;
    } else {
      mag.position.set(0, -0.05, -0.172);
      mag.rotation.set(0, 0, 0);
      mag.children[0].getObjectByName('rounds').visible = true;
    }
    R.boltCatch.rotation.z = -catchP * 0.25;
    R.trigger.rotation.x = st.triggerHeld && st.ammo > 0 && !act ? -0.18 : 0;

    // ─ mão esquerda: mistura das pegas ─
    this.placeLeftHand(handW, mag);

    // poses de dedos
    const relax = act && act.name !== 'equip' ? 1 : 0; // dedo fora do gatilho em recarga/inspeção
    blendPoses(this.poseR, [[POSES.grip, relax], [POSES.trigger, 1 - relax]]);
    this.handR.apply(this.poseR);
    blendPoses(this.poseL, [[POSES.guard, handW[0]], [POSES.mag, handW[1]], [POSES.flat, handW[2] + handW[3]]]);
    this.handL.apply(this.poseL);

    // depuração: só as mãos, orientação identidade (?whand=yaw,pitch,pose)
    const wh = this.whand;
    if (wh) {
      const [y, p, pn] = wh.split(',');
      this.pivot.position.set(0, 0, -0.32);
      this.pivot.rotation.set(Number(p) || 0, Number(y) || 0, 0, 'YXZ');
      for (const c of R.root.children) if (c !== this.handR.root && c !== this.handL.root) c.visible = false;
      this.handR.root.position.set(0.06, 0, 0.04);
      this.handL.root.position.set(-0.06, 0, 0.04);
      this.handR.root.quaternion.identity();
      this.handL.root.quaternion.identity();
      const P = POSES[pn] || POSES.relaxed;
      this.handR.apply(P);
      this.handL.apply(P);
    }

    // ─ antebraços ─
    this.rig.updateMatrixWorld(true);
    let aR = this.anchorR, aL = this.anchorL;
    if (this.debug?.view) {
      // vista de depuração: os "ombros" acompanham a arma girada
      _m.compose(HIP.pos, _q.setFromEuler(_e.set(HIP.rot.x, HIP.rot.y, HIP.rot.z, 'YXZ')), ONE).invert();
      _m2.multiplyMatrices(this.pivot.matrix, _m);
      aR = this.anchorR.clone().applyMatrix4(_m2);
      aL = this.anchorL.clone().applyMatrix4(_m2);
    }
    this.placeSleeve(this.sleeveR, this.handR.root, aR, 0.3);
    this.placeSleeve(this.sleeveL, this.handL.root, aL, 0.35);

    // ─ chute de câmera (canal aditivo, sem sobrescrever outros donos) ─
    const kp = this.climb.p + S.kickP.x * 0.02;
    const ky = this.climb.y + S.kickY.x * 0.02;
    const kr = S.kickR.x * 0.02 * (1 - a * 0.5);
    this.writeKick(player, kp, ky, kr);

    // ─ cápsulas ─
    this.updateCasings(dt, ctx);

    // ─ luzes ─
    this.updateLights(dt, ctx);
  },

  placeLeftHand(w, mag) {
    const h = this.handL.root;
    const tot = w[0] + w[1] + w[2] + w[3] || 1;
    _v2.set(0, 0, 0);
    let first = true;
    const add = (pos, quat, wt) => {
      if (wt <= 1e-4) return;
      _v2.addScaledVector(pos, wt / tot);
      if (first) {
        _q.copy(quat);
        first = false;
      } else {
        // nlerp acumulado
        if (_q.dot(quat) < 0) _q2.set(-quat.x, -quat.y, -quat.z, -quat.w);
        else _q2.copy(quat);
        _q.set(_q.x + _q2.x * (wt / tot), _q.y + _q2.y * (wt / tot), _q.z + _q2.z * (wt / tot), _q.w + _q2.w * (wt / tot));
      }
    };
    const G = HAND_L.guard;
    if (first && w[0] > 1e-4) {
      _q.set(G.quat.x * (w[0] / tot), G.quat.y * (w[0] / tot), G.quat.z * (w[0] / tot), G.quat.w * (w[0] / tot));
      _v2.addScaledVector(G.pos, w[0] / tot);
      first = false;
    }
    // pega no carregador: transformação do carregador × pega local
    if (w[1] > 1e-4) {
      mag.updateMatrix();
      _m.compose(MAG_GRIP.pos, MAG_GRIP.quat, ONE);
      _m2.multiplyMatrices(mag.matrix, _m);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      _m2.decompose(p, q, s);
      add(p, q, w[1]);
    }
    if (w[2] > 1e-4) add(SLAP.pos, SLAP.quat, w[2]);
    if (w[3] > 1e-4) add(CATCH.pos, CATCH.quat, w[3]);
    _q.normalize();
    h.position.copy(_v2);
    h.quaternion.copy(_q);
    // o carregador reserva é o que a mão segura? (não usado: troca é fora da tela)
  },

  placeSleeve(sleeve, handRoot, anchor, follow = 0.4) {
    // punho no espaço do rig
    handRoot.getWorldPosition(_v);
    this.rig.worldToLocal(_v);
    // direção do dorso da mão no espaço do rig
    _q.copy(handRoot.getWorldQuaternion(_q2));
    this.rig.getWorldQuaternion(_q2).invert();
    _q.premultiply(_q2);
    const up = _v2.set(0, 1, 0).applyQuaternion(_q);
    // o antebraço segue o eixo da mão (+Z local = para trás do punho),
    // puxado em direção ao "ombro"
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
    const toAnchor = new THREE.Vector3().subVectors(anchor, _v).normalize();
    const dir = back.multiplyScalar(follow).add(toAnchor.multiplyScalar(1 - follow)).normalize();
    const L = 0.34;
    const elbow = new THREE.Vector3().copy(_v).addScaledVector(dir, L);
    _m.lookAt(elbow, _v, up);
    sleeve.quaternion.setFromRotationMatrix(_m);
    // a manga começa no fim do punho da luva (no eixo da mão) e segue p/ o cotovelo
    sleeve.position.copy(_v).addScaledVector(_v2.set(0, 0, 1).applyQuaternion(_q), 0.02).addScaledVector(dir, 0.008);
    sleeve.userData.sleeve.scale.z = L;
    const w = sleeve.userData.watch;
    if (w) w.position.set(0.0, 0.035, 0.055);
  },

  writeKick(player, p, y, r) {
    const k = player.viewKick;
    const last = this.lastKickTotal;
    // se outro dono reescreveu o canal neste frame, partimos do valor dele
    const base = { pitch: k.pitch, yaw: k.yaw, roll: k.roll };
    if (last && Math.abs(k.pitch - last.pitch) < 1e-9 && Math.abs(k.yaw - last.yaw) < 1e-9 && Math.abs(k.roll - last.roll) < 1e-9) {
      base.pitch -= this.myKick.pitch;
      base.yaw -= this.myKick.yaw;
      base.roll -= this.myKick.roll;
    }
    k.pitch = base.pitch + p;
    k.yaw = base.yaw + y;
    k.roll = base.roll + r;
    this.myKick.pitch = p;
    this.myKick.yaw = y;
    this.myKick.roll = r;
    this.lastKickTotal = { pitch: k.pitch, yaw: k.yaw, roll: k.roll };
  },

  updateCasings(dt, ctx) {
    // gravidade do mundo no espaço da câmera
    _q.copy(ctx.camera.quaternion).invert();
    const g = _v.set(0, -9.8, 0).applyQuaternion(_q);
    for (const c of this.casings) {
      if (!c.visible) continue;
      const d = c.userData;
      d.life -= dt;
      if (d.life <= 0) {
        c.visible = false;
        continue;
      }
      d.v.addScaledVector(g, dt);
      c.position.addScaledVector(d.v, dt);
      c.rotateX(d.w.x * dt);
      c.rotateY(d.w.y * dt);
      c.rotateZ(d.w.z * dt);
    }
  },

  updateLights(dt, ctx) {
    const st = this.st;
    const world = ctx.service('world');
    const rend = ctx.service('rendering');
    const sun = world?.sun;
    const vmScene = ctx.vm.scene;
    // direção do sol (posição − alvo) no referencial do mundo
    if (sun) {
      sun.updateMatrixWorld();
      sun.getWorldPosition(_v);
      sun.target.getWorldPosition(_v2);
      _dir.subVectors(_v, _v2).normalize();
    } else _dir.set(0.4, 0.8, 0.3).normalize();
    // oclusão do sol (prédios) e teto (interior) — raycasts a cada 3 frames
    st.sunTimer -= dt;
    if (st.sunTimer <= 0 && ctx.collision) {
      st.sunTimer = ctx.shot ? 0 : 0.05;
      const eye = ctx.player.eyePosition;
      const filt = { filter: (c) => c.tag !== 'player' && c.tag !== 'enemy' && c.blocksBullets !== false };
      let vis = 0;
      const offs = [[0, 0], [0.25, -0.25], [-0.2, -0.3]];
      for (const [ox, oy] of offs) {
        _org.copy(eye);
        _org.y += oy;
        _org.x += ox * Math.cos(ctx.player.yaw);
        _org.z -= ox * Math.sin(ctx.player.yaw);
        if (!ctx.collision.raycast(_org, _dir, 150, filt)) vis += 1 / offs.length;
      }
      const up = ctx.collision.raycast(eye, _v.set(0, 1, 0), 30, filt);
      st.sunVisTarget = sun ? vis : 1;
      st.indoorTarget = up ? 1 : 0;
    }
    const kv = ctx.shot ? 1 : 1 - Math.exp(-dt * 10);
    st.sunVis = lerp(st.sunVis, st.sunVisTarget ?? 1, kv);
    st.indoor = lerp(st.indoor, st.indoorTarget ?? 0, ctx.shot ? 1 : 1 - Math.exp(-dt * 4));

    const L = this.sun;
    const center = _v2.set(0, -0.1, -0.35).applyQuaternion(ctx.vm.camera.quaternion);
    L.position.copy(center).addScaledVector(_dir, 2);
    L.target.position.copy(center);
    L.target.updateMatrixWorld();
    if (sun) L.color.copy(sun.color);
    L.intensity = (sun ? sun.intensity : 3) * st.sunVis;
    L.castShadow = !!ctx.quality.shadows && st.sunVis > 0.02;
    // ambiente: mesma intensidade de IBL do mundo, menos no interior
    if (!this.ownEnv) {
      const base = rend?.environmentIntensity ?? 0.55;
      vmScene.environmentIntensity = base * 0.95 * lerp(1, 0.32, st.indoor);
    }
    // na sombra a arma perde o sol: preenchimento suave mantém a forma legível
    const shade = 1 - st.sunVis;
    this.hemi.intensity = lerp(0.22 + 0.18 * shade, 0.1, st.indoor);
    this.rim.intensity = lerp(0.3 + 0.45 * shade, 0.22, st.indoor);
    // clarão de boca
    st.flashT = Math.max(0, st.flashT - dt);
    const f = st.flashT > 0 ? st.flashT / 0.05 : 0;
    this.flash.intensity = f * f * 1.6;
    this.flash.color.setRGB(1, 0.62 + 0.2 * f, 0.32);
    // retículo: um pouco mais brilhante de dia
    this.lens.material.uniforms.uIntensity.value = lerp(7, 11, st.sunVis * (1 - st.indoor));
  },

  dispose(ctx) {
    ctx.vm.camera.remove(this.rig, this.rim, this.rim.target, ...this.casings);
    ctx.vm.scene.remove(this.sun, this.sun.target, this.hemi);
  },
};

// ─── pegas da mão esquerda durante a recarga (espaço da arma) ───────────
const ONE = new THREE.Vector3(1, 1, 1);
// pega no carregador (espaço do carregador): palma no lado esquerdo-frente
const MAG_GRIP = basisFD([0.1, -0.25, -1], [-1, 0.05, 0], [-0.034, -0.12, 0.06]);
// tapa na base do carregador
const SLAP = basisFD([0.3, 0.1, -1], [-0.2, -1, 0], [-0.01, -0.268, -0.11]);
// polegar no retém do ferrolho (lado esquerdo)
const CATCH = basisFD([0, 0.3, -1], [-1, 0, 0], [-0.042, -0.055, -0.075]);
void DIM;
