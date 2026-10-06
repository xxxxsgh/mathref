/**
 * Torreta sentinela (6 abates).
 *
 * Modelo procedural: tripé de 3 pernas tubulares com sapatas e travessas,
 * mastro, anel de giro com caixa do motor, berço com braços, receptor com
 * camisa ventilada do cano e freio de boca, caixa de munição verde com fita
 * de elos até o receptor, escudo balístico chanfrado, cabeça de sensores
 * (lente vermelha que acende ao travar), antena e LED de estado. Pintura
 * oliva com desgaste (textura em canvas). O cano esquenta: emissivo laranja
 * proporcional ao calor.
 *
 * Uso: ativar entra no modo POSICIONAR — fantasma verde (válido) ou
 * vermelho 1,8 m à frente; botão esquerdo / F / ativar de novo confirmam;
 * botão direito / X cancelam (devolve a streak). Montagem animada (pernas
 * abrem, cabeça sobe), depois varredura de ±70° com servo.
 *
 * Combate: alvo por `pickTurretTarget` (linha de visão do sensor, 42 m,
 * 360°, histerese), giro limitado (2,6 rad/s), rajadas de 800 rpm com
 * traçantes (vfx) e dano pelo caminho normal (`collider.data.damage`,
 * `source:'player'`, `weapon/streak:'sentry'`). Calor: +0,022 por tiro,
 * resfria 0,3/s; ao chegar a 1 SUPERAQUECE por 2,6 s (vapor, chiado,
 * cano em brasa). 400 tiros, 60 s.
 *
 * Destrutível: 350 de vida. Os inimigos a enxergam como alvo
 * (`services.streaks.decoys`) e atiram nela; granadas inimigas e explosões
 * também danificam (o fogo do próprio jogador não). Destruída: faíscas,
 * fumaça, cabeça tomba; some depois de 4 s.
 */
import * as THREE from 'three';
import { pickTurretTarget, turnToward } from './logic.js';

const RANGE = 42;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

let MAT = null;
function materials() {
  if (MAT) return MAT;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#4b5039';
  g.fillRect(0, 0, 256, 256);
  let s = 31;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '230,225,200' : '10,10,5'},${0.03 + r() * 0.05})`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  // lascas de tinta (metal aparecendo) nas bordas
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(120,118,110,${0.4 + r() * 0.4})`;
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  MAT = {
    paint: new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.35, metalness: 0.85 }),
    worn: new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.28, metalness: 0.9 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
    ammo: new THREE.MeshStandardMaterial({ color: 0x3d4630, roughness: 0.6, metalness: 0.2 }),
    brass: new THREE.MeshStandardMaterial({ color: 0x9c7a3a, roughness: 0.3, metalness: 0.9 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x220806, roughness: 0.05, metalness: 0.8, emissive: 0xff2010, emissiveIntensity: 0.4 }),
  };
  return MAT;
}

const box = (w, h, d, m, x, y, z, parent, rx = 0, ry = 0, rz = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  parent.add(o);
  return o;
};
const cyl = (r0, r1, h, m, parent, seg = 14) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m);
  parent.add(o);
  return o;
};
/** cilindro entre dois pontos */
const tube = (a, b, r, m, parent, seg = 10) => {
  const d = new THREE.Vector3().subVectors(b, a);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(o);
  return o;
};

/** Modelo da torreta. Retorna { root, legs:[{pivot}], head (giro), cradle (elevação), barrel, muzzle, sensor, led, lens }. */
export function buildSentryModel() {
  const M = materials();
  const root = new THREE.Group();
  root.name = 'sentry';
  const hubY = 0.74;
  // ── tripé ──
  const legs = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
    const pivot = new THREE.Group();
    pivot.position.set(Math.sin(a) * 0.06, hubY, Math.cos(a) * 0.06);
    pivot.rotation.y = a;
    root.add(pivot);
    const leg = new THREE.Group();
    pivot.add(leg);
    // perna aberta: inclinada ~38° para fora (o pivô gira em X na montagem)
    const foot = new THREE.Vector3(0, -hubY, 0.56);
    tube(new THREE.Vector3(0, 0, 0), foot.clone().multiplyScalar(0.55), 0.024, M.paint, leg);
    tube(foot.clone().multiplyScalar(0.53), foot, 0.019, M.worn, leg);
    const pad = cyl(0.05, 0.06, 0.025, M.rubber, leg);
    pad.position.copy(foot).add(new THREE.Vector3(0, 0.012, 0));
    // trava da perna
    box(0.05, 0.06, 0.06, M.metal, 0, -0.02, 0.03, leg);
    legs.push({ pivot, leg });
  }
  // mastro e anel de giro
  const mast = cyl(0.045, 0.05, 0.42, M.paint, root);
  mast.position.y = hubY + 0.1;
  const hubC = cyl(0.08, 0.09, 0.12, M.metal, root);
  hubC.position.y = hubY;
  const head = new THREE.Group();
  head.position.y = hubY + 0.34;
  root.add(head);
  const ring = cyl(0.13, 0.13, 0.06, M.metal, head, 20);
  ring.position.y = 0;
  box(0.12, 0.1, 0.14, M.paint, -0.15, 0.02, -0.02, head); // caixa do motor
  box(0.03, 0.03, 0.08, M.rubber, -0.21, 0.04, -0.02, head);
  // braços do berço
  for (const sx of [1, -1]) box(0.025, 0.2, 0.16, M.paint, sx * 0.11, 0.11, 0, head);
  const cradle = new THREE.Group();
  cradle.position.y = 0.17;
  head.add(cradle);
  // receptor + tampa
  box(0.14, 0.15, 0.48, M.paint, 0, 0, 0.02, cradle);
  box(0.145, 0.03, 0.3, M.metal, 0, 0.085, 0.06, cradle);
  box(0.03, 0.05, 0.08, M.metal, 0.085, 0.03, -0.12, cradle); // alavanca
  // camisa ventilada + cano + freio de boca
  const shroud = cyl(0.045, 0.045, 0.42, M.metal, cradle, 16);
  shroud.rotation.x = Math.PI / 2;
  shroud.position.set(0, -0.005, 0.45);
  for (let k = 0; k < 7; k++)
    for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const h = box(0.012, 0.006, 0.03, M.rubber, Math.cos(a) * 0.046, -0.005 + Math.sin(a) * 0.046, 0.29 + k * 0.05, cradle);
      h.rotation.z = a;
    }
  const barrelMat = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.35, metalness: 0.85, emissive: 0xff5a10, emissiveIntensity: 0 });
  const barrel = cyl(0.016, 0.016, 0.3, barrelMat, cradle, 12);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, -0.005, 0.8);
  const brake = cyl(0.026, 0.026, 0.08, M.metal, cradle, 12);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, -0.005, 0.97);
  for (const sx of [1, -1]) box(0.008, 0.02, 0.05, M.rubber, sx * 0.027, -0.005, 0.97, cradle);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, -0.005, 1.02);
  cradle.add(muzzle);
  // caixa de munição + fita de elos
  box(0.13, 0.15, 0.22, M.ammo, 0.16, -0.05, -0.02, cradle);
  box(0.135, 0.02, 0.225, M.metal, 0.16, 0.03, -0.02, cradle);
  for (let k = 0; k < 6; k++) {
    const t = k / 5;
    const c = box(0.012, 0.012, 0.05, M.brass, 0.16 - t * 0.09, 0.05 + Math.sin(t * Math.PI) * 0.06, 0.05 + t * 0.02, cradle);
    c.rotation.z = 0.4;
  }
  // escudo balístico chanfrado com fenda do cano
  const sh = new THREE.Group();
  sh.position.set(0, 0.02, 0.27);
  cradle.add(sh);
  box(0.2, 0.32, 0.018, M.paint, -0.15, 0, 0, sh, 0, 0.25, 0);
  box(0.2, 0.32, 0.018, M.paint, 0.15, 0, 0, sh, 0, -0.25, 0);
  box(0.12, 0.12, 0.018, M.paint, 0, 0.1, 0.012, sh);
  box(0.12, 0.08, 0.018, M.paint, 0, -0.12, 0.012, sh);
  // cabeça de sensores + lente + antena + LED
  const sensor = new THREE.Group();
  sensor.position.set(-0.02, 0.15, 0.12);
  cradle.add(sensor);
  box(0.1, 0.07, 0.12, M.metal, 0, 0, 0, sensor);
  const lensM = cyl(0.026, 0.026, 0.02, M.lens, sensor, 16);
  lensM.rotation.x = Math.PI / 2;
  lensM.position.z = 0.065;
  const lens2 = cyl(0.014, 0.014, 0.02, M.lens, sensor, 12);
  lens2.rotation.x = Math.PI / 2;
  lens2.position.set(0.034, 0.015, 0.065);
  tube(new THREE.Vector3(0.04, 0.03, -0.05), new THREE.Vector3(0.05, 0.32, -0.09), 0.004, M.rubber, sensor, 6);
  const led = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x40ff60, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  led.scale.setScalar(0.06);
  led.position.set(-0.05, 0.05, -0.06);
  sensor.add(led);
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { root, legs, head, cradle, barrel, barrelMat, muzzle, sensor, led, lens: lensM };
}

export class Sentry {
  constructor(feat) {
    this.f = feat;
    this.ctx = feat.ctx;
    this.list = [];
    this.placing = null;
  }

  // ─── posicionamento ────────────────────────────────────────────────────
  beginPlace() {
    const ctx = this.ctx;
    const m = buildSentryModel();
    // fantasma: material translúcido único
    this.ghostOk = new THREE.MeshBasicMaterial({ color: 0x4cff7a, transparent: true, opacity: 0.32, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.32, depthWrite: false });
    m.root.traverse((o) => {
      if (o.isMesh) {
        o.material = this.ghostOk;
        o.castShadow = false;
      }
      if (o.isSprite) o.visible = false;
    });
    ctx.scene.add(m.root);
    this.placing = { m, ok: false, pos: new THREE.Vector3(), yaw: 0 };
    this.f.lockActions(true, ['fire', 'ads', 'interact']);
    this.f.hint('<b>SENTRY GUN</b> · LMB / F PLACE · RMB / X CANCEL', 999);
    this.onDown = (e) => {
      if (!this.placing) return;
      if (e.button === 0 && document.pointerLockElement) this.place();
      else if (e.button === 2) this.cancelPlace();
    };
    this.onKey = (e) => {
      if (!this.placing) return;
      if (e.code === 'KeyF') this.place();
      else if (e.code === 'KeyX') this.cancelPlace();
    };
    document.addEventListener('mousedown', this.onDown);
    window.addEventListener('keydown', this.onKey);
  }

  endPlace() {
    if (!this.placing) return;
    this.placing.m.root.removeFromParent();
    this.placing = null;
    this.f.lockActions(false);
    this.f.hint(null);
    document.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('keydown', this.onKey);
  }

  cancelPlace() {
    if (!this.placing) return;
    this.endPlace();
    this.f.refund('sentry');
  }

  /** Confirma (também chamado por activate('sentry') de novo — toque). */
  place() {
    const p = this.placing;
    if (!p) return false;
    if (!p.ok) {
      this.f.sfx.beep(300, 0.12, 0.12);
      return false;
    }
    const pos = p.pos.clone(), yaw = p.yaw;
    this.endPlace();
    this.f.confirmed('sentry');
    this.spawn(pos, yaw);
    return true;
  }

  updatePlacing() {
    const p = this.placing;
    const ctx = this.ctx;
    const pl = ctx.player;
    const fwd = _v.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    const x = pl.position.x + fwd.x * 1.8, z = pl.position.z + fwd.z * 1.8;
    const gy = ctx.collision.groundHeight?.(x, z, pl.position.y + 1.2);
    let ok = Number.isFinite(gy) && Math.abs(gy - pl.position.y) < 0.9;
    if (ok) {
      // chão plano o bastante (3 pés) e espaço livre
      for (let k = 0; k < 3 && ok; k++) {
        const a = (k / 3) * Math.PI * 2;
        const fy = ctx.collision.groundHeight?.(x + Math.sin(a) * 0.5, z + Math.cos(a) * 0.5, gy + 0.6);
        if (!Number.isFinite(fy) || Math.abs(fy - gy) > 0.22) ok = false;
      }
      if (ok && ctx.collision.overlapSphere(new THREE.Vector3(x, gy + 0.75, z), 0.42, (o) => !o.trigger && o.blocksPlayer !== false && o.tag !== 'enemy').length) ok = false;
    }
    p.ok = ok;
    p.pos.set(x, Number.isFinite(gy) ? gy : pl.position.y, z);
    p.yaw = pl.yaw + Math.PI; // a frente do modelo (+Z) olha para onde o jogador olha
    p.m.root.position.copy(p.pos);
    p.m.root.rotation.y = p.yaw;
    const mat = ok ? this.ghostOk : this.ghostBad;
    p.m.root.traverse((o) => o.isMesh && (o.material = mat));
  }

  // ─── torreta ativa ─────────────────────────────────────────────────────
  spawn(pos, yaw, { instant = false } = {}) {
    const ctx = this.ctx;
    const m = buildSentryModel();
    m.root.position.copy(pos);
    m.root.rotation.y = yaw;
    ctx.scene.add(m.root);
    const t = {
      m, pos: pos.clone(), baseYaw: yaw, yaw: 0, pitch: 0, state: instant ? 'scan' : 'deploy', t: 0,
      heat: 0, ammo: 400, life: this.f.def('sentry').duration, health: 350, maxHealth: 350,
      target: null, targetId: null, retarget: 0, shotT: 0, shots: 0, scanDir: 1, kills: 0, lockK: 0,
    };
    // decoy para a IA inimiga + colisor (bloqueia o jogador; não as balas dele)
    const sensorWorld = new THREE.Vector3();
    t.decoy = {
      kind: 'sentry',
      radius: 0.55,
      get alive() { return t.state !== 'dead' && t.state !== 'gone'; },
      get position() { return t.m.sensor.getWorldPosition(sensorWorld); },
      damage: (amount, info) => this.damage(t, amount, info),
    };
    this.f.decoys.push(t.decoy);
    t.colliderId = ctx.collision.addBoxCentered(new THREE.Vector3(pos.x, pos.y + 0.6, pos.z), new THREE.Vector3(0.9, 1.2, 0.9), {
      tag: 'sentry',
      material: 'metal',
      blocksBullets: false,
      data: { kind: 'sentry', decoy: t.decoy, damage: (a, info) => this.damage(t, a, info) },
    });
    if (instant) for (const L of m.legs) L.pivot.rotation.x = 0;
    this.list.push(t);
    ctx.services.audio?.play?.('gear', { position: pos, volume: 0.9 });
    this.f.sfx.servo(pos, 0.6);
    return t;
  }

  damage(t, amount, info = {}) {
    if (t.state === 'dead' || t.state === 'gone') return;
    if (info.source === 'player' && !info.enemy) return; // fogo amigo do jogador
    t.health -= amount;
    t.hitFlash = 0.12;
    if (t.health <= 0) this.destroy(t);
  }

  destroy(t) {
    const ctx = this.ctx;
    t.state = 'dead';
    t.t = 0;
    const p = t.m.sensor.getWorldPosition(new THREE.Vector3());
    const vfx = ctx.services.vfx;
    for (let k = 0; k < 3; k++) vfx?.impact?.(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0, (Math.random() - 0.5) * 0.4)), new THREE.Vector3(0, 1, 0), 'metal', { scale: 1.6 });
    ctx.bus.emit('explosion', { point: p.clone(), radius: 2.2, source: 'sentry' });
    t.m.lens.material = t.m.lens.material.clone();
    t.m.lens.material.emissiveIntensity = 0;
    t.m.led.material.color.set(0x000000);
    this.f.hint('<b>SENTRY GUN</b> DESTROYED', 2);
    this.f.ended('sentry');
  }

  removeTurret(t) {
    t.state = 'gone';
    t.m.root.removeFromParent();
    if (t.colliderId != null) this.ctx.collision.remove(t.colliderId);
    const i = this.f.decoys.indexOf(t.decoy);
    if (i >= 0) this.f.decoys.splice(i, 1);
  }

  /** Candidatos visíveis para o sensor. */
  candidates(t) {
    const ctx = this.ctx;
    const eye = t.m.sensor.getWorldPosition(new THREE.Vector3());
    const out = [];
    for (const e of ctx.services.enemies?.list || []) {
      if (!e.alive) continue;
      const g = e.group.position;
      if (Math.hypot(g.x - eye.x, g.z - eye.z) > RANGE) continue;
      const chest = new THREE.Vector3(g.x, g.y + 1.25 - (e.anim?.p?.crouch || 0) * 0.45, g.z);
      const visible = ctx.collision.lineOfSight(eye, chest, { filter: (c) => !c.data?.enemy && c.tag !== 'player' && c.tag !== 'sentry' && c.tag !== 'enemy' });
      out.push({ id: e.id, x: g.x, z: g.z, alive: true, visible, threat: e.brain?.focus === t.decoy ? 1 : 0, e, chest });
    }
    return out;
  }

  update(dt) {
    if (this.placing) this.updatePlacing();
    const ctx = this.ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.t += dt;
      if (t.state === 'gone') {
        this.list.splice(i, 1);
        continue;
      }
      if (t.state === 'dead') {
        if (t.t > 4) this.removeTurret(t);
        continue;
      }
      if (t.state === 'deploy') {
        if (t.t > 1.1) t.state = 'scan';
        continue;
      }
      if (t.state === 'fold') {
        if (t.t > 1.2) this.removeTurret(t);
        continue;
      }
      t.life -= dt;
      if (t.life <= 0 || t.ammo <= 0) {
        t.state = 'fold';
        t.t = 0;
        this.f.sfx.beep(700, 0.15, 0.1, 'square', t.pos);
        this.f.ended('sentry');
        continue;
      }
      // calor
      if (t.overheat > 0) {
        t.overheat -= dt;
        t.heat = Math.max(0, t.heat - dt * 0.38);
        if (t.overheat <= 0) t.heat = Math.min(t.heat, 0.35);
      } else t.heat = Math.max(0, t.heat - dt * 0.3);
      // alvo
      t.retarget -= dt;
      if (t.retarget <= 0) {
        t.retarget = 0.22;
        const cands = this.candidates(t);
        const worldYaw = t.baseYaw + t.yaw;
        const best = pickTurretTarget({ x: t.pos.x, z: t.pos.z, yaw: worldYaw, range: RANGE, arc: null }, cands, t.targetId);
        if (best && best.id !== t.targetId) this.f.sfx.servo(t.pos, 0.25);
        t.target = best?.e || null;
        t.targetId = best?.id ?? null;
        t.aimPoint = best?.chest || null;
      }
      if (t.target && !t.target.alive) {
        t.target = null;
        t.targetId = null;
      }
      let wantYaw, wantPitch = 0;
      const eye = t.m.muzzle.getWorldPosition(_w);
      if (t.target) {
        const g = t.target.group.position;
        const cy = g.y + 1.2 - (t.target.anim?.p?.crouch || 0) * 0.45;
        const dx = g.x - t.pos.x, dz = g.z - t.pos.z;
        wantYaw = Math.atan2(dx, dz) - t.baseYaw;
        wantPitch = Math.atan2(cy - eye.y, Math.hypot(dx, dz));
        t.lockK = Math.min(1, t.lockK + dt * 4);
      } else {
        // varredura ±70°
        t.lockK = Math.max(0, t.lockK - dt * 2);
        const span = 1.2;
        if (Math.abs(t.yaw) > span) t.scanDir = -Math.sign(t.yaw);
        wantYaw = t.yaw + t.scanDir * 0.6;
        wantPitch = 0;
      }
      const rate = t.target ? 2.6 : 0.6;
      t.yaw = turnToward(t.yaw, wantYaw, rate, dt);
      t.pitch += Math.max(-dt * 2, Math.min(dt * 2, wantPitch - t.pitch));
      // fogo
      t.shotT -= dt;
      const err = Math.abs(Math.atan2(Math.sin(wantYaw - t.yaw), Math.cos(wantYaw - t.yaw)));
      if (t.target && err < 0.07 && !(t.overheat > 0) && t.shotT <= 0) {
        t.shotT = 0.075;
        this.shoot(t);
        t.heat += 0.022;
        if (t.heat >= 1) {
          t.overheat = 2.6;
          this.f.sfx.hiss(t.pos.clone().setY(t.pos.y + 1), 2.2, 0.22);
          this.f.sfx.beep(420, 0.25, 0.1, 'sawtooth', t.pos);
        }
      }
    }
  }

  shoot(t) {
    const ctx = this.ctx;
    t.m.root.updateMatrixWorld(true);
    const origin = t.m.muzzle.getWorldPosition(new THREE.Vector3());
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(t.m.cradle.getWorldQuaternion(_q));
    const sp = 0.012 + t.heat * 0.01;
    const dir = fwd.clone().add(new THREE.Vector3((Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp * 2, (Math.random() - 0.5) * sp * 2)).normalize();
    t.ammo--;
    t.shots++;
    t.recoil = 1;
    const vfx = ctx.services.vfx;
    vfx?.muzzleFlashWorld?.(origin, dir, {});
    const hit = ctx.collision.raycast(origin, dir, 80, { filter: (c) => c.tag !== 'player' && c.tag !== 'sentry' && !c.data?.decoy });
    const to = hit ? hit.point : origin.clone().addScaledVector(dir, 80);
    if (t.shots % 2 === 0) vfx?.tracer?.(origin.clone().addScaledVector(dir, 0.1), to, { speed: 400, length: 4 });
    ctx.services.audio?.play?.('shot_enemy', { position: origin, rate: 1.35, volume: 0.75, reverb: 0.25, cap: 8, jitter: 0.05 });
    if (!hit) return;
    if (hit.collider?.data?.damage) {
      const head = hit.part === 'head';
      const dmg = 16 * (head ? 1.6 : 1);
      const info = { ...hit, dir, damage: dmg, source: 'player', weapon: 'sentry', streak: 'sentry', ballistic: true };
      hit.collider.data.damage(dmg, info);
      // impacto visual (sangue/faíscas) pelo vfx
      vfx?.impact?.(hit.point, hit.normal, hit.collider.material || 'flesh', { dir, collider: hit.collider, scale: 0.8 });
    } else vfx?.impact?.(hit.point, hit.normal, hit.collider?.material || ctx.services.world?.materialAt?.(hit) || 'concrete', { dir, collider: hit.collider, scale: 0.8 });
  }

  /** Por frame: poses (montagem, giro, recuo, calor, LED). */
  frame(dt) {
    const now = this.ctx.time.now;
    for (const t of this.list) {
      const m = t.m;
      if (t.state === 'deploy' || t.state === 'fold') {
        // pernas de fechadas (~verticais) para abertas; cabeça sobe
        let k = Math.min(1, t.t / 1.0);
        if (t.state === 'fold') k = 1 - Math.min(1, t.t / 1.0);
        const e = k * k * (3 - 2 * k);
        for (const L of m.legs) L.pivot.rotation.x = (1 - e) * 0.62;
        m.head.position.y = 0.74 + 0.34 * (0.4 + 0.6 * e);
        m.head.rotation.y = 0;
      } else {
        for (const L of m.legs) L.pivot.rotation.x = 0;
      }
      if (t.state === 'dead') {
        // cabeça tomba
        const k = Math.min(1, t.t / 0.6);
        m.cradle.rotation.x = k * 0.7;
        m.head.rotation.z = k * 0.25;
        continue;
      }
      if (t.state !== 'deploy' && t.state !== 'fold') {
        m.head.rotation.y = t.yaw;
        m.cradle.rotation.x = -t.pitch;
      }
      t.recoil = Math.max(0, (t.recoil || 0) - dt * 18);
      m.cradle.position.z = -t.recoil * 0.025;
      m.barrelMat.emissiveIntensity = Math.max(0, t.heat - 0.35) * 2.2 + (t.overheat > 0 ? 0.6 : 0);
      m.lens.material.emissiveIntensity = 0.3 + t.lockK * 2.5;
      const blink = t.overheat > 0 ? (now * 6) % 1 < 0.5 : t.target ? (now * 9) % 1 < 0.5 : true;
      m.led.material.color.set(t.overheat > 0 ? 0xffa020 : t.target ? 0xff3020 : 0x40ff60);
      m.led.visible = blink;
    }
  }

  clear() {
    this.endPlace();
    for (const t of this.list) this.removeTurret(t);
    this.list.length = 0;
  }
}
