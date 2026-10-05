/**
 * Feature `weapon` — viewmodel em primeira pessoa, loadout e lógica de
 * combate do IRONLINE.
 *
 *  - Loadout (loadout.js): fuzil KR-9 (primária), pistola P-11 (secundária),
 *    faca de combate (corpo a corpo rápido), granadas de fragmentação e
 *    atordoantes. Troca por 1/2, roda do mouse ou tecla de troca, com
 *    animações de guarda e saque; cada arma guarda o próprio carregador.
 *  - Modelos procedurais: rifle.js, pistol.js, equipment.js; materiais PBR de
 *    desgaste (materials.js); holográfica com retículo no infinito (optic.js).
 *  - Mãos enluvadas anatômicas com skinning (arms.js), encaixadas contra a
 *    geometria real de cada arma/item (grip.js).
 *  - Animação procedural (anim.js): respiração, balanço de passo/corrida,
 *    inércia do olhar, ADS alinhando a mira, recuo por molas com chute de
 *    câmera, ferrolho da pistola, recargas, inspeção, saque/guarda, golpe de
 *    faca com investida e arremesso de granada com "cozimento".
 *  - Granadas no mundo (projectiles.js + grenade-sim.js): quique contra
 *    ctx.collision, espoleta, explosão pela vfx e dano em área pelo mesmo
 *    caminho do tiro (collider.data.damage).
 *  - Iluminação própria da cena da viewmodel casada com o mundo.
 *
 * Serviço `weapon` (CONTRACT.md): gun, muzzle, ammo, reserve, magSize, ads,
 * reloading, name — mais: state, sprint, recoil, fireRate, ejectPort,
 * brassByVfx, fire(), reload(), inspect(), equip(slot?), weapons, current,
 * slot, id, icon, grenades, tacticals, melee(), throwGrenade(kind), …
 * Eventos: weapon:fire/hit/reload/reloaded/dry (de sempre) + weapon:switch,
 * weapon:melee, weapon:throw, weapon:explode, weapon:flashbang.
 */
import * as THREE from 'three';
import { makeMaterials, OCC, OCC_MAX } from './materials.js';
import { POSES, clonePose, blendPoses, buildSleeve, Hand } from './arms.js';
import { makeRifle, makePistol } from './guns.js';
import { AuxRig, meleeTracks, nadeRaiseTracks, nadeThrowTracks } from './aux.js';
import { Loadout, WEAPON_DEFS, EQUIP_DEFS } from './loadout.js';
import { Throwables } from './projectiles.js';
import { throwVelocity } from './grenade-sim.js';
import { Spring, ease, clamp, lerp, smoothstep, wobble } from './anim.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _dir = new THREE.Vector3();
const _org = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
const SWITCH_ACTIONS = ['swap', 'switch', 'switchWeapon', 'weaponSwap', 'nextWeapon'];

export default {
  name: 'weapon',
  order: 40,

  init(ctx) {
    const { vm, bus, input, quality, params } = ctx;
    this.ctx = ctx;
    const M = (this.M = makeMaterials());

    // ─── rig: câmera da viewmodel → rig → pivô animado → arma ─────────────
    vm.camera.fov = 50;
    vm.camera.near = 0.01;
    vm.camera.updateProjectionMatrix();
    const rig = (this.rig = new THREE.Group());
    rig.name = 'weapon-rig';
    vm.camera.add(rig);
    const pivot = (this.pivot = new THREE.Group());
    rig.add(pivot);

    // ─── mãos e mangas (compartilhadas pelas armas) ───────────────────────
    this.handR = new Hand(M, { left: false });
    this.handL = new Hand(M, { left: true });
    this.sleeveR = buildSleeve(M, { left: false });
    this.sleeveL = buildSleeve(M, { left: true, watch: true });
    rig.add(this.sleeveR, this.sleeveL);

    // ─── armas do loadout (as pegas são resolvidas contra cada modelo) ────
    const rifle = makeRifle(M, this.handR, this.handL, params);
    const pistol = makePistol(M, this.handR, this.handL, params);
    this.guns = [rifle, pistol];
    for (const g of this.guns) {
      g.root.visible = false;
      pivot.add(g.root);
      // cápsulas ejetadas (pool por arma)
      g.casings = Array.from({ length: g.kind === 'pistol' ? 8 : 14 }, () => {
        const c = g.casing.clone();
        c.visible = false;
        c.userData = { v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 };
        vm.camera.add(c);
        return c;
      });
      g.ci = 0;
    }
    this.aux = new AuxRig(M, rig);
    this.throwables = new Throwables(ctx);

    // ─── loadout ─────────────────────────────────────────────────────────
    const lo = (this.lo = new Loadout(WEAPON_DEFS));
    // ?wgun=1 começa com a pistola (QA)
    const startSlot = clamp(Number(params.get('wgun')) || 0, 0, this.guns.length - 1);
    lo.index = startSlot;
    this.setGun(startSlot);

    // "ombros" (âncoras dos antebraços) no espaço do rig
    this.anchorR = new THREE.Vector3(0.3, -0.45, -0.08);
    // ?whip=x,y,z,rx,ry,rz — testa outro enquadramento de hip; ?warm=x,y,z,follow,wrist — ombro esquerdo (QA)
    const wh = params.get('whip');
    if (wh) {
      const v = wh.split(',').map(Number);
      this.g.hip.pos.set(v[0], v[1], v[2]);
      if (v.length > 3) this.g.hip.rot.set(v[3], v[4], v[5] || 0);
    }
    const wa2 = params.get('warm');
    if (wa2) {
      const v = wa2.split(',').map(Number);
      this.g.anchorL.set(v[0], v[1], v[2]);
      if (v.length > 3) this.g.followL = v[3];
      if (v.length > 4) this.g.wristL = v[4];
    }

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
    this.hemi = new THREE.HemisphereLight(0xd6dbe0, 0x4a3f33, 0.25);
    vs.add(this.hemi);
    // luz de recorte artificial suave (leitura da silhueta em sombra)
    this.rim = new THREE.DirectionalLight(0xe8ecf0, 0.35);
    this.rim.position.set(-1, 0.6, 0.4);
    vm.camera.add(this.rim);
    vm.camera.add(this.rim.target);
    this.rim.target.position.set(0, 0, -1);
    // rebatimento quente (fachadas ensolaradas, chão) vindo da direita/baixo
    this.bounce = new THREE.DirectionalLight(0xffdcb8, 0.4);
    this.bounce.position.set(1, 0.15, 0.7);
    vm.camera.add(this.bounce);
    vm.camera.add(this.bounce.target);
    this.bounce.target.position.set(0, 0, -1);
    // clarão de boca (acompanha a boca da arma ativa)
    this.flash = new THREE.PointLight(0xffa457, 0, 2.0, 2);
    this.g.R.muzzle.add(this.flash);
    this.flash.position.set(-0.012, 0.02, -0.04);
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

    // ─── estado ──────────────────────────────────────────────────────────
    const st = (this.st = {
      cooldown: 0,
      ads: 0, adsLin: 0, adsTarget: false, sprint: 0, sprintLin: 0,
      action: null, actionT: 0, actionDone: {},
      shots: 0, lastShot: -9, triggerHeld: false, burstCount: 0,
      sunVis: 1, indoor: 0, sunTimer: 0,
      bobPhase: 0, bobAmt: 0, prevYaw: null, prevPitch: null, landing: 0,
      flashT: 0, slideLock: false, nade: null, lunge: null,
    });
    // munição/cadência da arma ATIVA (delegam ao loadout: trocar não perde o carregador)
    Object.defineProperties(st, {
      ammo: { get: () => lo.current.ammo, set: (v) => (lo.current.ammo = v), enumerable: true },
      reserve: { get: () => lo.current.reserve, set: (v) => (lo.current.reserve = v), enumerable: true },
      magSize: { get: () => lo.def.magSize, enumerable: true },
      rpm: { get: () => lo.def.rpm, enumerable: true },
      damage: { get: () => lo.def.damage, enumerable: true },
    });
    this.spr = {
      recZ: new Spring(9, 0.55), recX: new Spring(7, 0.45), recY: new Spring(6, 0.55), recR: new Spring(6, 0.5),
      kickP: new Spring(5.5, 0.8), kickY: new Spring(5, 0.8), kickR: new Spring(7, 0.5),
      swayX: new Spring(5, 0.65), swayY: new Spring(5, 0.65), swayPX: new Spring(4, 0.7), swayPY: new Spring(4, 0.7),
      land: new Spring(7, 0.45), jolt: new Spring(10, 0.4),
    };
    this.climb = { p: 0, y: 0 };
    this.myKick = { pitch: 0, yaw: 0, roll: 0 };
    this.lastKickTotal = null;
    this.extraAnims = {
      melee: meleeTracks(EQUIP_DEFS.knife.time),
      nadeRaise: nadeRaiseTracks('frag'), nadeThrow: nadeThrowTracks('frag'),
      flashRaise: nadeRaiseTracks('flash', 0.28), flashThrow: nadeThrowTracks('flash'),
    };
    this.debug = null;
    this.tuneK = { env: 1.2, hemi: 1, rim: 1.3, bounce: 1, sun: 1 };
    this.trackOut = new Array(6).fill(0);
    this.auxOut = new Array(6).fill(0);
    this.poseR = clonePose(POSES.grip);
    this.poseL = clonePose(POSES.guard);

    if (!input.bindings.inspect) input.bindings.inspect = ['KeyI'];
    if (!input.bindings.tactical) input.bindings.tactical = ['KeyT'];
    if (!SWITCH_ACTIONS.some((n) => input.bindings[n])) input.bindings.swap = ['KeyX'];

    const preset = ctx.shot?.preset;
    if (preset?.ads) st.ads = st.adsLin = 1;
    if (!ctx.shot) {
      bus.on('game:start', () => {
        this.lo.drawNow(this.lo.index);
        this.startAction('equip');
      });
    }
    bus.on('player:land', (e) => this.spr.land.impulse(-Math.min(1.2, (e?.speed || 6) * 0.08)));
    bus.on('player:jump', () => this.spr.land.impulse(0.35));
    // respawn / nova partida: reabastece o loadout
    bus.on('player:respawn', () => this.lo.refill());
    bus.on('match:start', () => {
      this.lo.refill();
      this.throwables.clear();
    });
    // ?wanim=reload:0.6 congela uma ação num instante (QA visual)
    const wa = params.get('wanim');
    if (wa) {
      const [n, t] = wa.split(':');
      this.debugPose(n, Number(t) || 0);
    }
    this.whand = params.get('whand');
    const wc = params.get('wcrop');
    this.wcrop = wc ? wc.split(',').map(Number) : null;
    const wv = params.get('wview');
    if (wv) {
      const [y, p, d, ox, oy, oz] = wv.split(',').map(Number);
      this.debugView(y, p, d, ox, oy, oz);
    }

    const self = this;
    const def = () => self.lo.def;
    const weaponInfo = (w, i) => ({
      slot: i, id: w.def.id, name: w.def.name, icon: w.def.icon, kind: w.def.kind, slotName: w.def.slot,
      ammo: w.ammo, reserve: w.reserve, magSize: w.def.magSize, auto: w.def.auto, caliber: w.def.caliber,
    });
    ctx.provide('weapon', {
      // ─ campos do contrato (sempre da arma ATIVA) ─
      get gun() { return self.g.root; },
      get muzzle() { return self.g.R.muzzle; },
      get ammo() { return st.ammo; },
      get reserve() { return st.reserve; },
      get magSize() { return st.magSize; },
      get ads() { return st.ads; },
      get reloading() { return !!st.action && st.action.name.startsWith('reload'); },
      get name() { return def().name; },
      // ─ extras ─
      get state() { return st.action?.name || (st.sprint > 0.5 ? 'sprint' : st.ads > 0.5 ? 'ads' : 'idle'); },
      get sprint() { return st.sprint; },
      get recoil() { return self.spr.recX.x; },
      get fireRate() { return st.rpm; },
      get auto() { return def().auto; },
      get id() { return def().id; },
      get icon() { return def().icon; },
      get kind() { return def().kind; },
      get slot() { return self.lo.index; },
      get switching() { return self.lo.switching; },
      /** Definição da arma ativa: { id, name, icon, kind, magSize, rpm, auto, … }. */
      get current() { return { ...def(), ammo: st.ammo, reserve: st.reserve, slot: self.lo.index }; },
      /** Loadout: [{ slot, id, name, icon, kind, ammo, reserve, magSize }]. */
      get weapons() { return self.lo.weapons.map(weaponInfo); },
      get grenades() { return self.lo.grenades; },
      get tacticals() { return self.lo.tacticals; },
      get equipment() { return { frag: { ...EQUIP_DEFS.frag, count: self.lo.grenades }, flash: { ...EQUIP_DEFS.flash, count: self.lo.tacticals }, knife: { ...EQUIP_DEFS.knife } }; },
      get cooking() { return st.nade?.cookStart != null ? Math.max(0, ctx.time.now - st.nade.cookStart) : 0; },
      get liveGrenades() { return self.throwables.count; },
      // a ejeção de cápsulas visível fica com a arma; a vfx só cria a herdeira
      get ejectPort() { return self.g.R.ejectPort; },
      brassByVfx: false,
      fire: () => self.fire(ctx),
      reload: () => self.tryReload(ctx),
      inspect: () => self.startAction('inspect'),
      /** equip() saca de novo a arma ativa; equip(slot) troca para o slot (0 = primária, 1 = secundária). */
      equip: (slot) => (slot == null ? self.startAction('equip') : self.requestSlot(slot)),
      next: (dir = 1) => self.requestCycle(dir),
      /** Alterna primária ↔ secundária (botão de troca do toque). */
      swap: () => self.requestCycle(1),
      melee: () => self.startMelee(ctx),
      /** Arremesso pela API (bots/testes/toque): arma, puxa o pino e lança assim que levantar. */
      throwGrenade: (kind = 'frag') => {
        const ok = self.startThrow(ctx, kind);
        if (ok) self.st.nade.release = true;
        return ok;
      },
      /** Detona uma granada do jogador no ponto (QA/roteiros): mesmo dano/efeito do arremesso. */
      explodeAt: (point, kind = 'frag') => self.throwables.detonate(kind, new THREE.Vector3(point.x, point.y, point.z)),
      refill: () => self.lo.refill(),
      setGrenades: (n) => (self.lo.grenades = Math.max(0, n | 0)),
      debugPose: (n, t) => self.debugPose(n, t),
      debugView: (y, p, d) => self.debugView(y, p, d),
      get debugLight() { return { sunVis: st.sunVis, indoor: st.indoor }; },
      /** Multiplicadores de luz da viewmodel (QA/ajuste): { env, hemi, rim, bounce, sun }. */
      tune: (o) => Object.assign(self.tuneK, o),
      materials: M,
    });
  },

  // ─── troca de arma ───────────────────────────────────────────────────
  /** Ativa a arma do slot i (visual): reparenta mãos, pegas, oclusores. */
  setGun(i) {
    const g = this.guns[i];
    if (this.g === g) return;
    if (this.g) this.g.root.visible = false;
    this.g = g;
    this.R = g.R;
    this.lens = g.lens;
    g.root.visible = true;
    g.root.add(this.handR.root, this.handL.root);
    this.handR.root.position.copy(g.handR.pos);
    this.handR.root.quaternion.copy(g.handR.quat);
    if (this.flash) g.R.muzzle.add(this.flash);
    this.occ = g.occ(this.handL, this.handR).slice(0, OCC_MAX);
    OCC.uOccN.value = this.occ.length;
    if (this.st) this.st.slideLock = this.lo.current.ammo === 0;
  },
  requestSlot(i) {
    if (this.busyExclusive()) return false;
    const ok = this.lo.request(i);
    if (ok) this.onSwitchStart();
    return ok;
  },
  requestCycle(dir) {
    if (this.busyExclusive()) return false;
    const ok = this.lo.cycle(dir);
    if (ok) this.onSwitchStart();
    return ok;
  },
  onSwitchStart() {
    const lo = this.lo;
    if (lo.phase === 'holster') {
      this.startAction('holster');
      this.st.actionT = lo.t;
    } else if (lo.phase === 'draw') {
      // desistiu no meio da guarda: saca de novo do ponto em que estava
      this.startAction('equip');
      this.st.actionT = lo.t;
    }
  },
  /** Ações que não podem ser interrompidas por troca (faca, granada). */
  busyExclusive() {
    const n = this.st.action?.name;
    return n === 'melee' || n === 'nadeRaise' || n === 'nadeThrow' || n === 'flashRaise' || n === 'flashThrow';
  },
  emitSwitch(ctx) {
    const lo = this.lo;
    const d = lo.def;
    ctx.bus.emit('weapon:switch', {
      slot: lo.index, id: d.id, name: d.name, icon: d.icon, kind: d.kind,
      ammo: lo.current.ammo, reserve: lo.current.reserve, magSize: d.magSize, auto: d.auto,
    });
  },

  // ─── ações ───────────────────────────────────────────────────────────
  anim(name) {
    return this.g.anims[name] || this.extraAnims[name];
  },
  startAction(name) {
    const a = this.anim(name);
    if (!a) return;
    const st = this.st;
    st.action = a;
    st.actionT = 0;
    st.actionDone = {};
  },
  debugPose(name, t) {
    this.debug = { ...(this.debug || {}), anim: name, t };
    if (this.anim(name)) {
      this.startAction(name);
      this.st.actionT = t;
    }
  },
  debugView(yaw, pitch, dist = 0.7, ox = 0, oy = 0, oz = 0) {
    this.debug = { ...(this.debug || {}), view: { yaw, pitch, dist, focus: new THREE.Vector3(ox || 0, oy || 0, oz || 0) } };
  },
  tryReload(ctx) {
    const st = this.st;
    if (st.action && st.action.name !== 'inspect') return false;
    if (this.lo.switching || !this.lo.canReload()) return false;
    this.startAction(st.ammo === 0 ? 'reloadEmpty' : 'reload');
    ctx.bus.emit('weapon:reload', { duration: st.action.duration, empty: st.ammo === 0, id: this.lo.def.id });
    return true;
  },

  fire(ctx) {
    const { bus, collision, camera, rng } = ctx;
    const st = this.st;
    const d = this.lo.def;
    const g = this.g;
    st.ammo--;
    st.shots++;
    st.cooldown += 60 / st.rpm;
    st.lastShot = ctx.time.now;
    st.burstCount++;
    if (g.recoil.slide) st.slideLock = st.ammo === 0; // ferrolho trava aberto no último tiro
    const a = st.ads;
    const S = this.spr;
    const rc = g.recoil;
    // ─ recuo visual da arma (molas) ─
    const k = lerp(1, 0.45, a);
    S.recZ.impulse(rc.z * k + 0.1);
    S.recX.impulse(lerp(rc.x, rc.xAds, a) * (0.85 + rng.next() * 0.3));
    S.recY.impulse((rng.next() - 0.5) * 0.5 * k);
    S.recR.impulse((rng.next() - 0.35) * 1.2 * k);
    // ─ chute de câmera: subida que acumula + tremor ─
    const climbP = lerp(rc.climb, rc.climbAds, a) * (st.burstCount < 3 ? 1.25 : 1);
    this.climb.p += climbP;
    this.climb.y += (Math.sin(st.shots * 1.7) * 0.6 + (rng.next() - 0.5)) * 0.0016;
    S.kickP.impulse(rc.kick * lerp(1, 0.7, a));
    S.kickY.impulse((rng.next() - 0.5) * 0.05);
    S.kickR.impulse((rng.next() - 0.5) * 0.16);
    st.flashT = 0.055;
    // ─ bala: do olho, na direção da câmera (com chute), com dispersão ─
    camera.updateMatrixWorld();
    camera.getWorldPosition(_org);
    camera.getWorldDirection(_dir);
    const moving = ctx.player.state?.speed || 0;
    const spread = lerp(d.spread[0], d.spread[1], a) + Math.min(d.moveSpread, moving * 0.003) * (1 - a * 0.7);
    const ang = rng.next() * Math.PI * 2, rad = Math.sqrt(rng.next()) * spread;
    _v.set(Math.cos(ang) * rad, Math.sin(ang) * rad, 0).applyQuaternion(camera.quaternion);
    _dir.add(_v).normalize();
    bus.emit('weapon:fire', { origin: _org.clone(), dir: _dir.clone(), muzzle: g.R.muzzle, ads: a > 0.5, id: d.id });
    const hit = collision.raycast(_org, _dir, 900, { filter: (c) => c.tag !== 'player' });
    if (hit) {
      const head = hit.part === 'head';
      const dmg = st.damage * (head ? d.headMult : 1) * (hit.distance > d.falloff[0] ? d.falloff[1] : 1);
      const info = { ...hit, dir: _dir.clone(), damage: dmg, source: 'player', weapon: d.id };
      // no preset 'combat' o tiro é só visual (não mata o inimigo da cena)
      if (!ctx.shot?.preset?.combat) hit.collider.data?.damage?.(dmg, info);
      bus.emit('weapon:hit', info);
    }
    this.eject(ctx);
  },

  eject(ctx) {
    const g = this.g;
    const c = g.casings[g.ci++ % g.casings.length];
    const rng = ctx.rng;
    this.pivot.updateMatrixWorld(true);
    g.R.ejectPort.getWorldPosition(_v);
    ctx.vm.camera.worldToLocal(c.position.copy(_v));
    // sai já tombando em torno do eixo vertical, de LADO para a câmera
    c.quaternion.copy(this.pivot.quaternion);
    c.rotateY(1.25 + rng.next() * 0.45);
    const d = c.userData;
    const pk = g.kind === 'pistol' ? 0.8 : 1;
    d.v.set((3.0 + rng.next() * 0.8) * pk, (1.3 + rng.next() * 0.5) * pk + (g.kind === 'pistol' ? 0.6 : 0), 0.5 + rng.next() * 0.3);
    d.w.set(rng.range(-6, 6), rng.range(-30, -18), rng.range(-6, 6));
    d.life = 0.4;
    // modo shot: num quadro parado a cápsula ficaria suspensa — não mostra
    c.visible = !ctx.shot;
  },

  // ─── corpo a corpo ───────────────────────────────────────────────────
  startMelee(ctx) {
    const st = this.st;
    if (this.busyExclusive() || this.lo.switching) return false;
    if (st.action && st.action.name.startsWith('reload') && st.actionT > (st.action.insertAt || 0) - 0.05) return false;
    this.startAction('melee');
    this.aux.setItem('knife');
    st.adsTarget = false;
    // investida: inimigo à frente, perto e visível
    st.lunge = null;
    const target = this.meleeTarget(ctx);
    if (target) st.lunge = { to: target.pos, dist: target.dist };
    ctx.bus.emit('weapon:melee', { lunge: !!st.lunge });
    return true;
  },
  meleeTarget(ctx) {
    const en = ctx.services.enemies;
    if (!en?.list) return null;
    const eye = ctx.player.eyePosition;
    const aim = ctx.player.getAimDir(_v3);
    let best = null;
    for (const e of en.list) {
      if (!e.alive || !e.group) continue;
      const p = e.group.position;
      _v.set(p.x - eye.x, p.y + 1.2 - eye.y, p.z - eye.z);
      const dist = _v.length();
      if (dist > EQUIP_DEFS.knife.lunge || dist < 0.2) continue;
      if (_v.normalize().dot(aim) < Math.cos(0.45)) continue;
      if (!ctx.collision.lineOfSight(eye.clone(), new THREE.Vector3(p.x, p.y + 1.2, p.z), { filter: (c) => c.tag !== 'player' && c.tag !== 'enemy' })) continue;
      if (!best || dist < best.dist) best = { pos: new THREE.Vector3(p.x, p.y, p.z), dist };
    }
    return best;
  },
  meleeHit(ctx) {
    const eye = ctx.player.eyePosition;
    const aim = ctx.player.getAimDir(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(aim, new THREE.Vector3(0, 1, 0)).normalize();
    const range = EQUIP_DEFS.knife.range;
    let best = null;
    // leque de raios (o corte varre da direita para a esquerda)
    for (const [yo, po] of [[0, 0], [0.18, 0], [-0.18, 0], [0, -0.15], [0.1, 0.12], [-0.1, -0.25]]) {
      const d = aim.clone().addScaledVector(right, yo).add(new THREE.Vector3(0, po, 0)).normalize();
      const hit = ctx.collision.raycast(eye, d, range, { filter: (c) => c.tag !== 'player' });
      if (hit && (!best || (hit.collider.data?.damage && !best.collider.data?.damage) || hit.distance < best.distance)) {
        if (best?.collider.data?.damage && !hit.collider.data?.damage) continue;
        best = { ...hit, dir: d };
      }
    }
    if (!best) return;
    const dmg = EQUIP_DEFS.knife.damage;
    const info = { ...best, damage: dmg, source: 'player', weapon: 'knife', melee: true, ballistic: true };
    if (this.throwables.live) best.collider.data?.damage?.(dmg, info);
    ctx.bus.emit('weapon:hit', info);
    this.spr.jolt.impulse(1.2);
    this.spr.kickP.impulse(-0.05);
  },

  // ─── granadas ────────────────────────────────────────────────────────
  startThrow(ctx, kind = 'frag') {
    const st = this.st;
    if (this.busyExclusive() || this.lo.switching) return false;
    if (st.action && st.action.name.startsWith('reload') && st.actionT > (st.action.insertAt || 0) - 0.05) return false;
    if (!this.lo.useEquipment(kind)) return false;
    st.nade = { kind, cookStart: null, release: false, key: kind === 'flash' ? 'tactical' : 'grenade' };
    this.aux.setItem(kind);
    this.startAction(kind === 'flash' ? 'flashRaise' : 'nadeRaise');
    return true;
  },
  releaseNade(ctx) {
    const st = this.st;
    const n = st.nade;
    if (!n) return;
    const def = EQUIP_DEFS[n.kind];
    const eye = ctx.player.eyePosition;
    const aim = ctx.player.getAimDir(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(aim, new THREE.Vector3(0, 1, 0)).normalize();
    const pos = eye.clone().addScaledVector(aim, 0.35).addScaledVector(right, 0.12);
    pos.y -= 0.05;
    // não nasce dentro de parede: recua até o olho se houver obstáculo
    const block = ctx.collision.raycast(eye, pos.clone().sub(eye).normalize(), pos.distanceTo(eye) + 0.04, { filter: (c) => c.tag !== 'player' });
    if (block) pos.copy(eye).addScaledVector(block.point.clone().sub(eye).normalize(), Math.max(0, block.distance - 0.06));
    const vel = throwVelocity(aim, def.speed, ctx.player.velocity || { x: 0, y: 0, z: 0 });
    const cooked = n.cookStart != null ? ctx.time.now - n.cookStart : 0;
    const fuse = Math.max(0.05, def.fuse - cooked);
    this.throwables.spawn(n.kind, pos, vel, fuse);
    st.nade = null;
  },

  // ─── passo fixo: lógica ──────────────────────────────────────────────
  update(dt, ctx) {
    const { input, player, bus } = ctx;
    const st = this.st;
    const lo = this.lo;
    const preset = ctx.shot?.preset;
    const sprinting = !!player.state?.sprinting && !preset;
    st.sprintLin = clamp(st.sprintLin + (sprinting ? dt / 0.28 : -dt / 0.2), 0, 1);

    // ação em andamento
    if (st.action && !this.debug?.anim) {
      const a = st.action;
      const t0 = st.actionT;
      // granada armada: segura o último quadro enquanto a tecla está apertada
      const holding = a.hold && t0 >= a.duration && st.nade && !st.nade.release;
      if (!holding) st.actionT += dt;
      const t1 = st.actionT;
      const cross = (t) => t != null && t0 < t && t1 >= t;
      if (cross(a.insertAt)) lo.applyReload();
      if (cross(a.slideReleaseAt)) st.slideLock = false;
      if (a.name === 'melee') {
        // investida: aproxima o jogador do alvo até ~1 m
        if (st.lunge && t1 > 0.06 && t1 < 0.22) {
          const p = player.position;
          _v.set(st.lunge.to.x - p.x, 0, st.lunge.to.z - p.z);
          const d = _v.length();
          if (d > 1.0) {
            const step = Math.min(d - 1.0, (EQUIP_DEFS.knife.lunge / 0.16) * dt);
            _v.multiplyScalar(step / d);
            ctx.collision.moveCapsule(p, _v, { radius: player.radius || 0.35, height: player.height || 1.8, wasGrounded: player.onGround, filter: (c) => c.tag !== 'player' && c.tag !== 'enemy' });
          }
        }
        if (cross(a.hitAt)) this.meleeHit(ctx);
      }
      if (a.pinAt != null && cross(a.pinAt) && st.nade && st.nade.kind === 'frag') st.nade.cookStart = ctx.time.now;
      if (a.releaseAt != null && cross(a.releaseAt)) this.releaseNade(ctx);
      // segurou demais: explode na mão
      if (st.nade?.cookStart != null && ctx.time.now - st.nade.cookStart >= EQUIP_DEFS.frag.fuse) {
        const p = ctx.player.eyePosition.addScaledVector(ctx.player.getAimDir(_v), 0.4);
        this.throwables.detonate('frag', p);
        st.nade = null;
        st.action = null;
      }
      if (st.action && st.actionT >= a.duration && !holding && !(a.hold && st.nade)) {
        if (a.name.startsWith('reload')) bus.emit('weapon:reloaded', { ammo: st.ammo, id: lo.def.id });
        st.action = null;
      }
    }
    // granada: soltou a tecla depois de armar → arremessa
    if (st.nade && (!preset || st.nade.release)) {
      if (!preset && !input.action(st.nade.key)) st.nade.release = true;
      const a = st.action;
      if (st.nade.release && a && a.hold && st.actionT >= a.duration) this.startAction(st.nade.kind === 'flash' ? 'flashThrow' : 'nadeThrow');
    }
    // troca de arma (máquina do loadout)
    const ev = lo.step(dt);
    if (ev === 'swap') {
      this.setGun(lo.index);
      this.startAction('equip');
      this.emitSwitch(ctx);
    }
    const busy = !!st.action && st.action.name !== 'inspect';

    // mira
    st.adsTarget = preset ? !!preset.ads : input.action('ads') && !busy && st.sprintLin < 0.5;
    if (st.adsTarget && st.action?.name === 'inspect') st.action = null;
    st.adsLin = clamp(st.adsLin + (st.adsTarget ? dt / lo.def.adsTime : -dt / (lo.def.adsTime * 0.85)), 0, 1);
    st.ads = ease.inOut(st.adsLin);
    player.fovFactors.set('ads', lerp(1, lo.def.adsFov, st.ads));

    st.cooldown = Math.max(-0.05, st.cooldown - dt);
    if (!preset) {
      if (input.pressed('reload')) this.tryReload(ctx);
      if (input.pressed('inspect') && !st.action && st.ads < 0.1) this.startAction('inspect');
      if (input.pressed('weapon1')) {
        if (lo.index === 0 && !lo.switching && !st.action) this.startAction('equip');
        else this.requestSlot(0);
      }
      if (input.pressed('weapon2')) this.requestSlot(1);
      if (SWITCH_ACTIONS.some((n) => input.pressed(n))) this.requestCycle(1);
      const wheel = input.consumeWheel?.() || 0;
      if (wheel && !st.adsTarget) this.requestCycle(wheel > 0 ? 1 : -1);
      if (input.pressed('melee')) this.startMelee(ctx);
      if (input.pressed('grenade')) this.startThrow(ctx, 'frag');
      if (input.pressed('tactical')) this.startThrow(ctx, 'flash');
    }
    // gatilho (semiautomática dispara só na borda do aperto)
    const auto = lo.def.auto;
    let trig = preset ? !!preset.combat : input.action('fire');
    if (preset?.combat && ctx.time.now > 0.75) trig = auto ? (ctx.time.now % 0.9) < 0.6 : (ctx.time.now % 0.36) < 0.18;
    if (!trig) st.burstCount = 0;
    const edge = trig && !st.triggerHeld;
    const canFire = !busy && !lo.switching && st.sprintLin < 0.15 && st.cooldown <= 0;
    if (trig && canFire && (auto || edge)) {
      if (st.action?.name === 'inspect') st.action = null;
      if (st.ammo > 0) this.fire(ctx);
      else {
        // vazio: clique seco no aperto e recarga automática (também segurando)
        if (edge) bus.emit('weapon:dry', {});
        st.cooldown = 0.2;
        if (!preset) this.tryReload(ctx);
      }
    }
    st.triggerHeld = trig;
    // carregador vazio: recarrega sozinho logo depois do último tiro
    if (!preset && st.ammo === 0 && !st.action && st.reserve > 0 && !lo.switching && ctx.time.now - st.lastShot > 0.3) this.tryReload(ctx);

    // granadas no mundo
    this.throwables.update(dt);
  },

  // ─── por frame: pose, animação, luz ──────────────────────────────────
  frame(dt, ctx) {
    const { player, vm, camera } = ctx;
    const st = this.st;
    const S = this.spr;
    const g = this.g;
    const R = g.R;
    dt = Math.min(dt, 0.05);
    const tnow = ctx.time.now;

    // a câmera da viewmodel gira junto com a do mundo: luz do sol e IBL
    // ficam no MESMO referencial do mundo (reflexos corretos ao olhar em volta)
    vm.camera.position.set(0, 0, 0);
    vm.camera.quaternion.copy(camera.quaternion);
    vm.camera.fov = lerp(g.vmFov.hip, g.vmFov.ads, st.ads);
    // ?wcrop=x,y,w — recorte ampliado do enquadramento REAL (QA de mãos)
    if (this.wcrop) {
      const [cx, cy, cw] = this.wcrop;
      const fw = 1000 * vm.camera.aspect, fh = 1000;
      vm.camera.setViewOffset(fw, fh, cx * fw, cy * fh, cw * fw, cw * fh);
    }
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
    const HIP = g.hip, ADS = g.ads, SPRINT = g.sprint;
    const pos = _v.lerpVectors(HIP.pos, ADS.pos, a);
    let rx = lerp(HIP.rot.x, ADS.rot.x, a), ry = lerp(HIP.rot.y, ADS.rot.y, a), rz = lerp(HIP.rot.z, ADS.rot.z, a);
    const arc = Math.sin(Math.PI * st.adsLin);
    pos.y -= arc * 0.012;
    rz += arc * 0.06 * (st.adsTarget ? 1 : -0.5);
    pos.addScaledVector(SPRINT.pos, sp);
    rx += SPRINT.rot.x * sp;
    ry += SPRINT.rot.y * sp;
    rz += SPRINT.rot.z * sp;

    // respiração (ciclo lento + micro tremor)
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

    // ação (recarga/inspeção/saque/guarda/faca/granada)
    const act = st.action;
    let handW = [1, 0, 0, 0];
    let magOff = null;
    let catchP = 0;
    let auxVis = false;
    if (act) {
      const t = st.actionT;
      const o = act.gun.eval(t, this.trackOut);
      // recarga/inspeção amortecem no ADS; troca, faca e granada não
      const damp = act.busy && !act.hand ? 1 : 1 - a;
      pos.x += o[0] * damp;
      pos.y += o[1] * damp;
      pos.z += o[2] * damp;
      rx += o[3] * damp;
      ry += o[4] * damp;
      rz += o[5] * damp;
      if (act.hand) handW = act.hand.eval(t, [0, 0, 0, 0]);
      if (act.mag) magOff = act.mag.eval(t, [0, 0, 0, 0, 0, 0]);
      if (act.catchT) catchP = act.catchT.eval(t, [0])[0];
      if (act.leftIn) handW = [smoothstep(act.leftIn[0], act.leftIn[1], t), 0, 0, 0];
      if (act.aux) {
        if (act.item && this.aux.current !== act.item) this.aux.setItem(act.item);
        const ao = act.aux.eval(Math.min(t, act.duration), this.auxOut);
        auxVis = !act.auxVis || (t >= act.auxVis[0] && t <= act.auxVis[1]);
        this.aux.place(ao, auxVis);
        if (act.pinAt != null) this.aux.pullPin(smoothstep(act.pinAt - 0.04, act.pinAt + 0.08, t));
        else if (act.releaseAt != null) this.aux.pullPin(1);
        if (act.releaseAt != null && t >= act.releaseAt) {
          const it = this.aux.items[this.aux.current];
          if (it?.root) it.root.visible = false;
        }
      }
    }
    if (!auxVis) this.aux.place(null, false);

    // ─ aplica no pivô ─
    this.pivot.position.copy(pos);
    this.pivot.rotation.set(rx, ry, rz, 'YXZ');
    if (this.debug?.view) {
      const v = this.debug.view;
      this.pivot.rotation.set(v.pitch, v.yaw, 0, 'YXZ');
      _v.copy(v.focus).sub(g.pivot).applyEuler(this.pivot.rotation);
      this.pivot.position.set(0, 0, -v.dist).sub(_v);
      vm.camera.fov = 50;
      vm.camera.updateProjectionMatrix();
    }

    // carregador
    const mag = R.mag;
    const rest = g.magRest;
    const rounds = mag.children[0].getObjectByName('rounds');
    if (magOff) {
      mag.position.set(rest.pos.x + magOff[0], rest.pos.y + magOff[1], rest.pos.z + magOff[2]);
      mag.rotation.set(rest.rot.x + magOff[3], rest.rot.y + magOff[4], rest.rot.z + magOff[5]);
      const swapped = st.actionT >= (act.swapAt || 99);
      if (rounds) rounds.visible = swapped || st.ammo > 0;
    } else {
      mag.position.copy(rest.pos);
      mag.rotation.copy(rest.rot);
      if (rounds) rounds.visible = true;
    }
    g.catchRot(catchP);
    // gatilho e ferrolho da pistola
    const trigOn = st.triggerHeld && st.ammo > 0 && !act;
    if (g.kind === 'pistol') {
      R.trigger.rotation.x = trigOn && since < 0.1 ? -0.22 : 0;
      // ciclo do ferrolho: recua em ~25 ms, volta em ~45 ms; trava aberto vazio
      let sl = 0;
      if (since < 0.025) sl = since / 0.025;
      else if (since < 0.07) sl = 1 - (since - 0.025) / 0.045;
      if (st.slideLock && !(act && act.slideReleaseAt != null && st.actionT >= act.slideReleaseAt)) sl = 1;
      R.slide.position.z = 0.024 * clamp(sl, 0, 1);
    } else {
      R.trigger.rotation.x = trigOn ? -0.18 : 0;
    }

    // ─ mão esquerda: mistura das pegas ─
    this.placeLeftHand(handW, mag);

    // poses de dedos
    const relax = act && act.name !== 'equip' && act.name !== 'holster' ? 1 : 0; // dedo fora do gatilho em recarga/inspeção/faca/granada
    blendPoses(this.poseR, [[g.poseGrip, relax], [g.poseTrigger, 1 - relax]]);
    this.handR.apply(this.poseR);
    blendPoses(this.poseL, [[g.gripL.pose, handW[0] * (1 - st.ads)], [g.gripLAds.pose, handW[0] * st.ads], [POSES.mag, handW[1]], [POSES.flat, handW[2] + handW[3]]]);
    this.handL.apply(this.poseL);

    // depuração: só as mãos, orientação identidade (?whand=yaw,pitch,pose)
    const wh = this.whand;
    if (wh) {
      const [y, p, pn] = wh.split(',');
      this.pivot.position.set(0, 0, -0.32);
      this.pivot.rotation.set(Number(p) || 0, Number(y) || 0, 0, 'YXZ');
      for (const c of g.root.children) if (c !== this.handR.root && c !== this.handL.root) c.visible = false;
      this.handR.root.position.set(0.06, 0, 0.04);
      this.handL.root.position.set(-0.06, 0, 0.04);
      this.handR.root.quaternion.identity();
      this.handL.root.quaternion.identity();
      const P = pn === 'guard' ? g.gripL.pose : pn === 'trigger' ? g.poseTrigger : POSES[pn] || POSES.relaxed;
      this.handR.apply(pn === 'guard' ? g.poseTrigger : P);
      this.handL.apply(P);
    }

    // ─ antebraços ─
    this.rig.updateMatrixWorld(true);
    let aR = g.anchorR || this.anchorR, aL = g.anchorL;
    if (this.debug?.view) {
      _m.compose(HIP.pos, _q.setFromEuler(_e.set(HIP.rot.x, HIP.rot.y, HIP.rot.z, 'YXZ')), ONE).invert();
      _m2.multiplyMatrices(this.pivot.matrix, _m);
      aR = aR.clone().applyMatrix4(_m2);
      aL = aL.clone().applyMatrix4(_m2);
    }
    this.placeSleeve(this.sleeveR, this.handR.root, aR, 0.3, 0.4);
    this.placeSleeve(this.sleeveL, this.handL.root, aL, g.followL ?? 0.3, g.wristL ?? 0.4);
    if (auxVis) this.placeSleeve(this.aux.sleeve, this.aux.hand.root, this.aux.anchor, 0.35, 0.4);

    // ─ chute de câmera (canal aditivo, sem sobrescrever outros donos) ─
    const kp = this.climb.p + S.kickP.x * 0.02 + S.jolt.x * 0.004;
    const ky = this.climb.y + S.kickY.x * 0.02;
    const kr = S.kickR.x * 0.02 * (1 - a * 0.5);
    this.writeKick(player, kp, ky, kr);

    this.updateCasings(dt, ctx);
    this.throwables.frame(dt);
    this.updateLights(dt, ctx);
    this.updateOcclusion(ctx);
  },

  updateOcclusion(ctx) {
    const cam = ctx.vm.camera;
    cam.updateMatrixWorld(true);
    this.rig.updateMatrixWorld(true);
    const A = OCC.uOccA.value, B = OCC.uOccB.value;
    for (let i = 0; i < this.occ.length; i++) {
      const c = this.occ[i];
      const mw = c.o.matrixWorld;
      _v.copy(c.a).applyMatrix4(mw).applyMatrix4(cam.matrixWorldInverse);
      A[i].set(_v.x, _v.y, _v.z, c.r);
      B[i].copy(c.b).applyMatrix4(mw).applyMatrix4(cam.matrixWorldInverse);
    }
    // ocluidores das mãos só valem quando a mão está visível (depuração)
    OCC.uOccN.value = this.whand ? 0 : this.occ.length;
  },

  placeLeftHand(w, mag) {
    const g = this.g;
    const h = this.handL.root;
    const tot = w[0] + w[1] + w[2] + w[3] || 1;
    _v2.set(0, 0, 0);
    let first = true;
    const add = (pos, quat, wt) => {
      if (wt <= 1e-4) return;
      _v2.addScaledVector(pos, wt / tot);
      if (first) {
        _q.set(quat.x * (wt / tot), quat.y * (wt / tot), quat.z * (wt / tot), quat.w * (wt / tot));
        first = false;
      } else {
        // nlerp acumulado
        if (_q.dot(quat) < 0) _q2.set(-quat.x, -quat.y, -quat.z, -quat.w);
        else _q2.copy(quat);
        _q.set(_q.x + _q2.x * (wt / tot), _q.y + _q2.y * (wt / tot), _q.z + _q2.z * (wt / tot), _q.w + _q2.w * (wt / tot));
      }
    };
    // pega de hip ↔ pega de ADS
    const ga = this.st.ads;
    const G = this._gBlend || (this._gBlend = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    G.pos.lerpVectors(g.gripL.pos, g.gripLAds.pos, ga);
    G.quat.slerpQuaternions(g.gripL.quat, g.gripLAds.quat, ga);
    add(G.pos, G.quat, w[0]);
    // pega no carregador: transformação do carregador × pega local
    if (w[1] > 1e-4) {
      mag.updateMatrix();
      _m.compose(g.magGrip.pos, g.magGrip.quat, ONE);
      _m2.multiplyMatrices(mag.matrix, _m);
      const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
      _m2.decompose(p, q, s);
      add(p, q, w[1]);
    }
    add(g.slap.pos, g.slap.quat, w[2]);
    add(g.catchGrip.pos, g.catchGrip.quat, w[3]);
    _q.normalize();
    h.position.copy(_v2);
    h.quaternion.copy(_q);
  },

  placeSleeve(sleeve, handRoot, anchor, follow = 0.4, wristBlend = 0.4) {
    // punho no espaço do rig
    handRoot.getWorldPosition(_v);
    this.rig.worldToLocal(_v);
    // orientação da mão no espaço do rig
    _q.copy(handRoot.getWorldQuaternion(_q2));
    this.rig.getWorldQuaternion(_q2).invert();
    _q.premultiply(_q2);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
    // o antebraço segue o eixo da mão (+Z local), puxado para o "ombro"
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
    const toAnchor = new THREE.Vector3().subVectors(anchor, _v).normalize();
    const dir = back.clone().multiplyScalar(follow).add(toAnchor.multiplyScalar(1 - follow)).normalize();
    // manga com 2 ossos: punho alinhado à mão, antebraço apontando o cotovelo
    sleeve.position.copy(_v);
    sleeve.quaternion.identity();
    const elbow = new THREE.Vector3().copy(_v).addScaledVector(dir, 0.34);
    _m.lookAt(elbow, _v, up);
    sleeve.userData.bArm.quaternion.setFromRotationMatrix(_m);
    // punho: meio caminho entre o eixo da mão e o do antebraço (o pulso flexiona)
    sleeve.userData.bWrist.quaternion.copy(_q).slerp(sleeve.userData.bArm.quaternion, wristBlend);
    const w = sleeve.userData.watch;
    if (w) w.position.set(0.0, 0.03, 0.06);
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
    const gr = _v.set(0, -9.8, 0).applyQuaternion(_q);
    for (const g of this.guns) {
      for (const c of g.casings) {
        if (!c.visible) continue;
        const d = c.userData;
        d.life -= dt;
        if (d.life <= 0) {
          c.visible = false;
          continue;
        }
        d.v.addScaledVector(gr, dt);
        c.position.addScaledVector(d.v, dt);
        c.rotateX(d.w.x * dt);
        c.rotateY(d.w.y * dt);
        c.rotateZ(d.w.z * dt);
      }
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
    L.intensity = (sun ? sun.intensity : 3) * st.sunVis * this.tuneK.sun;
    L.castShadow = !!ctx.quality.shadows && st.sunVis > 0.02;
    // ambiente: mesma intensidade de IBL do mundo, menos no interior
    if (!this.ownEnv) {
      const base = rend?.environmentIntensity ?? 0.55;
      // a arma é preta: sem um pouco mais de ambiente ela vira silhueta chapada
      const shadeK = lerp(1.3, 1.9, 1 - st.sunVis);
      vmScene.environmentIntensity = base * 0.85 * shadeK * lerp(1, 0.4, st.indoor) * this.tuneK.env;
    }
    // na sombra a arma perde o sol: preenchimento suave mantém a forma legível
    const shade = 1 - st.sunVis;
    const T = this.tuneK;
    this.hemi.intensity = lerp(0.3 + 0.35 * shade, 0.16, st.indoor) * T.hemi;
    this.rim.intensity = lerp(0.3 + 0.45 * shade, 0.22, st.indoor) * T.rim;
    this.bounce.intensity = lerp(0.5 + 1.7 * shade, 0.6, st.indoor) * T.bounce;
    // clarão de boca: curto e quente (pico forte, cauda curta)
    st.flashT = Math.max(0, st.flashT - dt);
    const f = st.flashT > 0 ? st.flashT / 0.055 : 0;
    this.flash.intensity = f > 0 ? (0.35 + 0.65 * f) * 3.2 : 0;
    this.flash.color.setRGB(1, 0.62 + 0.24 * f, 0.36 + 0.24 * f);
    // retículo: um pouco mais brilhante de dia
    if (this.lens) this.lens.material.uniforms.uIntensity.value = lerp(1.3, 1.7, st.sunVis * (1 - st.indoor));
  },

  dispose(ctx) {
    const cas = this.guns.flatMap((g) => g.casings);
    ctx.vm.camera.remove(this.rig, this.rim, this.rim.target, this.bounce, this.bounce.target, ...cas);
    ctx.vm.scene.remove(this.sun, this.sun.target, this.hemi);
    this.throwables.clear();
  },
};
