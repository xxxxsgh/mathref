/**
 * UAV de reconhecimento (3 abates).
 *
 * Um avião não tripulado procedural (fuselagem, asa reta longa, cauda em V,
 * hélice propulsora, bola de sensores, luzes de navegação piscando) circula
 * a ~90 m de altura sobre a área de combate durante 30 s. A cada 2,5 s uma
 * VARREDURA de radar (som de sonar) revela todos os inimigos vivos.
 *
 * Publicação para a HUD (minimapa) — `services.streaks`:
 *   revealed  [{ id, x, y, z, t, age, alpha, kind:'enemy', role }] — posição
 *             no momento do ping; `alpha` cai de 1 a 0 até o próximo ping
 *   uav       { active, remaining, sweep (rad, ângulo do traço da varredura,
 *             0 = norte/-Z, horário), period, center:{x,z}, radius, pingT }
 * Evento 'uav:ping' { count, t }.
 * Sem `services.hud.handlesReveal`, um radar de reserva aparece no canto.
 */
import * as THREE from 'three';

import { mergeChildren } from './merge.js';

const PERIOD = 2.5;

function buildUavModel() {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.55, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.1, metalness: 0.9 });
  // fuselagem (cápsula esticada ao longo de Z) com nariz bulboso
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 4.6, 6, 16), paint);
  fus.rotation.x = Math.PI / 2;
  g.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), paint);
  nose.scale.set(1, 0.95, 1.4);
  nose.position.set(0, 0.12, 2.3);
  g.add(nose);
  // bola de sensores sob o nariz
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 10), dark);
  ball.position.set(0, -0.45, 1.9);
  g.add(ball);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 14), glass);
  lens.position.set(0, -0.47, 2.15);
  g.add(lens);
  // asa reta longa (afina na ponta)
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, -0.55);
  wingShape.lineTo(8.2, -0.25);
  wingShape.lineTo(8.2, 0.2);
  wingShape.lineTo(0, 0.55);
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: false });
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(wingGeo, paint);
    w.rotation.set(Math.PI / 2, 0, 0);
    w.scale.x = s;
    w.position.set(0, 0.25, 0.2);
    g.add(w);
  }
  // cauda em V
  for (const s of [1, -1]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.7), paint);
    t.position.set(s * 0.75, 0.45, -2.5);
    t.rotation.z = s * 0.7;
    g.add(t);
  }
  // hélice propulsora
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 12), dark);
  hub.rotation.x = -Math.PI / 2;
  hub.position.set(0, 0, -2.95);
  g.add(hub);
  const prop = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.03), dark);
    b.position.y = 0.55;
    const arm = new THREE.Group();
    arm.rotation.z = (k / 3) * Math.PI * 2;
    arm.add(b);
    prop.add(arm);
  }
  prop.position.set(0, 0, -3.1);
  g.add(prop);
  g.userData.prop = prop;
  // luzes de navegação (sprites aditivos)
  const lights = [];
  const dot = (c, x, y, z) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(0.9);
    g.add(sp);
    lights.push(sp);
    return sp;
  };
  dot(0xff2a1a, -8.2, 0.3, 0.1);
  dot(0x2aff5a, 8.2, 0.3, 0.1);
  g.userData.strobe = dot(0xffffff, 0, -0.5, -1.5);
  g.userData.lights = lights;
  mergeChildren(g, { castShadow: false, receiveShadow: false });
  mergeChildren(prop, { castShadow: false, receiveShadow: false });
  for (const arm of prop.children) mergeChildren(arm, { castShadow: false, receiveShadow: false });
  g.traverse((o) => o.isMesh && (o.castShadow = false));
  return g;
}

export class Uav {
  constructor(feat) {
    this.f = feat;
    this.ctx = feat.ctx;
    this.active = false;
    this.state = { active: false, remaining: 0, sweep: 0, period: PERIOD, center: { x: 0, z: 0 }, radius: 70, pingT: -1 };
    this.revealed = [];
  }

  start(duration) {
    const ctx = this.ctx;
    const c = ctx.player.position;
    const st = this.state;
    st.active = true;
    st.remaining = duration;
    st.center = { x: c.x, z: c.z - 20 };
    st.pingT = -1;
    this.t0 = ctx.time.now;
    this.nextPing = 0.6;
    if (!this.model) {
      this.model = buildUavModel();
      this.model.name = 'uav';
    }
    ctx.scene.add(this.model);
    this.angle = 0;
    this.motor = this.f.sfx.motor(this.model.position, { base: 95, gain: 0.12 });
    // inimigos percebem
    const en = ctx.services.enemies;
    const e = en?.list?.find((x) => x.alive);
    if (e && en.squad) en.squad.callout(e, 'uav', ctx.time.now, true);
  }

  stop() {
    this.state.active = false;
    this.state.remaining = 0;
    this.model?.removeFromParent();
    this.motor?.stop();
    this.motor = null;
    this.revealed.length = 0;
  }

  ping() {
    const ctx = this.ctx;
    const now = ctx.time.now;
    this.revealed.length = 0;
    for (const e of ctx.services.enemies?.list || []) {
      if (!e.alive) continue;
      const p = e.group.position;
      this.revealed.push({ id: e.id, x: p.x, y: p.y, z: p.z, t: now, age: 0, alpha: 1, kind: 'enemy', role: e.role?.id || (e.boss ? 'boss' : 'rifleman') });
    }
    this.state.pingT = now;
    this.f.sfx.ping();
    ctx.bus.emit('uav:ping', { count: this.revealed.length, t: now });
  }

  update(dt) {
    const st = this.state;
    if (!st.active) return;
    st.remaining -= dt;
    this.nextPing -= dt;
    if (this.nextPing <= 0) {
      this.nextPing = PERIOD;
      this.ping();
    }
    if (st.remaining <= 0) {
      this.stop();
      this.f.ended('uav');
    }
  }

  frame(dt) {
    const st = this.state;
    if (!st.active) return;
    const ctx = this.ctx;
    const now = ctx.time.now;
    // traço da varredura: uma volta por período, sincronizado com o ping
    st.sweep = (((now - (st.pingT > 0 ? st.pingT : this.t0)) / PERIOD) % 1) * Math.PI * 2;
    for (const r of this.revealed) {
      r.age = now - r.t;
      r.alpha = Math.max(0, 1 - r.age / (PERIOD * 1.15));
    }
    // órbita (sentido horário visto de cima), inclinada na curva
    const m = this.model;
    const R = st.radius, H = 88;
    this.angle = (now - this.t0) * 0.09;
    const a = this.angle;
    m.position.set(st.center.x + Math.sin(a) * R, H, st.center.z + Math.cos(a) * R);
    const tangent = Math.atan2(Math.cos(a), -Math.sin(a));
    m.rotation.set(0, tangent, 0);
    m.rotateZ(-0.32);
    m.userData.prop.rotation.z += dt * 60;
    const blink = (now * 1.3) % 1 < 0.08;
    m.userData.strobe.visible = blink;
    for (const l of m.userData.lights) l.scale.setScalar(1.2 + 0.4 * Math.sin(now * 4));
    this.motor?.set(m.position, 1, 0.1);
  }
}

/**
 * Radar de reserva (sem HUD que leia `revealed`): círculo no canto superior
 * direito com o traço da varredura e os pontos revelados.
 */
export class FallbackRadar {
  constructor(root) {
    this.cv = document.createElement('canvas');
    this.cv.width = this.cv.height = 300;
    Object.assign(this.cv.style, { position: 'absolute', right: '22px', top: '74px', width: '150px', height: '150px', borderRadius: '50%', opacity: '0.95' });
    root.appendChild(this.cv);
    this.g = this.cv.getContext('2d');
  }
  set visible(v) {
    this.cv.style.display = v ? '' : 'none';
  }
  draw(ctx, uavState, revealed) {
    const g = this.g, S = 300, c = S / 2, R = c - 6;
    const pl = ctx.player;
    const range = 60;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = 'rgba(6,14,10,0.72)';
    g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(120,220,150,0.18)';
    g.lineWidth = 1.5;
    for (const k of [0.33, 0.66, 1]) {
      g.beginPath();
      g.arc(c, c, R * k, 0, Math.PI * 2);
      g.stroke();
    }
    g.beginPath();
    g.moveTo(c, 0);
    g.lineTo(c, S);
    g.moveTo(0, c);
    g.lineTo(S, c);
    g.stroke();
    // varredura (gira com o mundo: norte para cima, jogador no centro)
    const sw = uavState.sweep - Math.PI / 2;
    const grd = g.createConicGradient ? g.createConicGradient(sw - 0.9, c, c) : null;
    if (grd) {
      grd.addColorStop(0, 'rgba(120,230,150,0)');
      grd.addColorStop(0.14, 'rgba(120,230,150,0.35)');
      grd.addColorStop(0.145, 'rgba(120,230,150,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, S, S);
    }
    g.strokeStyle = 'rgba(160,255,190,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + Math.cos(sw) * R, c + Math.sin(sw) * R);
    g.stroke();
    // inimigos revelados
    for (const r of revealed) {
      const dx = (r.x - pl.position.x) / range, dz = (r.z - pl.position.z) / range;
      const x = c + dx * R, y = c + dz * R;
      g.fillStyle = `rgba(255,70,55,${0.25 + 0.75 * r.alpha})`;
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = `rgba(255,140,120,${0.6 * r.alpha})`;
      g.beginPath();
      g.arc(x, y, 7 + (1 - r.alpha) * 14, 0, Math.PI * 2);
      g.stroke();
    }
    // jogador (seta para onde olha)
    g.translate(c, c);
    g.rotate(-pl.yaw);
    g.fillStyle = '#e2b45a';
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(8, 9);
    g.lineTo(0, 4);
    g.lineTo(-8, 9);
    g.closePath();
    g.fill();
    g.restore();
    g.strokeStyle = 'rgba(160,255,190,0.5)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c, c, R, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(200,255,215,0.9)';
    g.font = 'bold 20px monospace';
    g.textAlign = 'center';
    g.fillText('UAV ' + Math.max(0, Math.ceil(uavState.remaining)), c, S - 22);
  }
}
