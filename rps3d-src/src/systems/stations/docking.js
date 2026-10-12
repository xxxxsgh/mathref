// Pouso guiado e controle de tráfego.
//
// Fluxo: o piloto pede atracação (F perto da estação → flight.dockAt →
// stations.dockingPad, ou stations.requestDock(id) pela HUD/menu). O
// controle de tráfego responde pelo rádio, atribui um hangar livre e acende
// o CORREDOR HOLOGRÁFICO (pórticos animados do ponto de entrada até a boca
// do hangar + marcador da plataforma).
//
// Guiagem: o piloto automático do `flight` persegue um ponto {frame, pos}.
// Entregamos um referencial-âncora MÓVEL ("coelho"): ele desliza pelos
// pontos do corredor um pouco à frente da nave, então a aproximação nunca
// atravessa o casco; no fim a âncora coincide com a estação e a nave pousa
// na plataforma (o referencial do pouso fica estático).
import * as THREE from 'three/webgpu';
import {
  vec3, vec4, float, attribute, time, fract, smoothstep, sin, abs, dot, normalize, normalView, positionView, pow, uniform,
} from 'three/tsl';
import { V3 } from './geo.js';
import { vnoise } from './tsl.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

/** Material dos pórticos: onda de brilho correndo em direção ao hangar. */
function gateMaterial(color) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.fog = false;
  const U = { color: uniform(new THREE.Color(...color)), on: uniform(0) };
  m.userData.U = U;
  const ph = attribute('aPhase', 'float');
  const kind = attribute('aKind', 'float'); // 0 moldura, 1 seta, 2 plataforma
  const wave = pow(fract(ph.mul(-1).add(time.mul(0.55))), 6.0).mul(2.2).add(0.35);
  const flick = vnoise(vec3(time.mul(11.0), ph.mul(3.0), 0.0)).mul(0.25).add(0.85);
  const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
  const edge = pow(float(1).sub(facing), 1.5).mul(0.8).add(0.5);
  const arrow = smoothstep(0.5, 1.0, kind).mul(sin(time.mul(4.0).sub(ph.mul(20.0))).mul(0.3).add(0.9));
  const k = wave.mul(float(1).sub(smoothstep(0.5, 1.0, kind))).add(arrow);
  m.colorNode = vec4(U.color.mul(k).mul(flick).mul(edge).mul(U.on), 1.0);
  return m;
}

/** Monta a geometria do corredor (no espaço LOCAL da estação). */
function corridorGeometry(bay) {
  const pts = bay.path.slice(0, -1); // até a boca
  const pos = [], idx = [], phs = [], kinds = [];
  const quadBox = (c, ax, ay, az, sx, sy, sz, ph, kind) => {
    const base = pos.length / 3;
    const corners = [];
    for (const dz of [-1, 1]) for (const dy of [-1, 1]) for (const dx of [-1, 1]) corners.push(c.clone().addScaledVector(ax, dx * sx).addScaledVector(ay, dy * sy).addScaledVector(az, dz * sz));
    for (const p of corners) { pos.push(p.x, p.y, p.z); phs.push(ph); kinds.push(kind); }
    const f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    for (const [a, b, c2, d] of f) idx.push(base + a, base + b, base + c2, base + a, base + c2, base + d);
  };
  // comprimento total para fase
  let total = 0; const segL = [];
  for (let i = 0; i < pts.length - 1; i++) { const l = pts[i].distanceTo(pts[i + 1]); segL.push(l); total += l; }
  let acc = 0;
  const W = bay.kind === 'pad' ? 34 : bay.w * 0.82, H = bay.kind === 'pad' ? 34 : bay.h * 0.82;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = segL[i];
    const f = b.clone().sub(a).normalize();
    const upRef = Math.abs(f.dot(bay.up)) > 0.95 ? bay.fwd.clone() : bay.up.clone();
    const r = V3().crossVectors(f, upRef).normalize(), u = V3().crossVectors(r, f).normalize();
    const step = i === 0 ? 160 : i === 1 ? 90 : 45;
    const n = Math.max(1, Math.round(L / step));
    for (let j = 0; j < n; j++) {
      const s = (acc + (j / n) * L) / total;
      const c = a.clone().addScaledVector(f, (j / n) * L);
      const grow = 1 + (1 - s) * 0.6; // pórticos maiores longe da boca
      const w = W * grow / 2, h = H * grow / 2, t = 0.5 * grow;
      quadBox(c.clone().addScaledVector(u, h), r, u, f, w, t, t, s, 0);
      quadBox(c.clone().addScaledVector(u, -h), r, u, f, w, t, t, s, 0);
      quadBox(c.clone().addScaledVector(r, w), r, u, f, t, h, t, s, 0);
      quadBox(c.clone().addScaledVector(r, -w), r, u, f, t, h, t, s, 0);
      // cantoneiras (cantos mais grossos)
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) quadBox(c.clone().addScaledVector(r, sx * w).addScaledVector(u, sy * h), r, u, f, t * 2.2, t * 2.2, t * 1.2, s, 0);
      // seta (chevron) no centro inferior
      const ac = c.clone().addScaledVector(u, -h * 0.65);
      for (const sx of [-1, 1]) {
        const d = r.clone().multiplyScalar(sx).addScaledVector(f, -1).normalize();
        quadBox(ac.clone().addScaledVector(d, w * 0.12), d, u, V3().crossVectors(d, u), w * 0.14, t * 0.6, t * 0.6, s, 1);
      }
    }
    acc += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(phs, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Marcador holográfico da plataforma (anéis + coluna de luz). */
function padMarker(bay, mat) {
  const grp = new THREE.Group();
  const side = V3().crossVectors(bay.up, bay.out).normalize();
  grp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, bay.up, bay.out));
  grp.position.copy(bay.pad).addScaledVector(bay.up, 0.15);
  const mk = (geo, ph) => {
    const n = geo.attributes.position.count;
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(new Float32Array(n).fill(ph), 1));
    geo.setAttribute('aKind', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0.0), 1));
    const m = new THREE.Mesh(geo, mat); grp.add(m); return m;
  };
  const r1 = mk(new THREE.RingGeometry(9.6, 10.2, 64), 0.95); r1.rotation.x = -Math.PI / 2;
  const r2 = mk(new THREE.RingGeometry(6.6, 7.0, 64), 0.9); r2.rotation.x = -Math.PI / 2;
  const r3 = mk(new THREE.RingGeometry(12.6, 12.9, 6), 0.85); r3.rotation.x = -Math.PI / 2;
  const col = mk(new THREE.CylinderGeometry(10, 10, 14, 48, 1, true), 0.99); col.position.y = 7;
  grp.userData.spin = [r2, r3];
  return grp;
}

export class Docking {
  constructor(ctx, stations) {
    this.ctx = ctx; this.S = stations;
    this.state = 'idle'; // idle | granted | docked
    this.view = null; this.bay = null;
    this.anchor = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this.s = 0; this.total = 0; this.cum = [];
    this.wpts = [];
    this.msgs = new Set();
    this.vis = null;
    this.mat = gateMaterial([0.35, 1.6, 1.3]);
  }

  /** Escolhe um hangar livre (prefere o que tem interior). */
  pickBay(view) {
    const free = view.bays.filter((b) => !b.occupied);
    return free.find((b) => b.index === 0) || free[0] || view.bays[0] || null;
  }

  canDock(view) {
    const f = this.ctx.services.factions;
    let rep = 0;
    try { rep = f?.rep?.(view.st.faction) ?? f?.get?.(view.st.faction) ?? 0; } catch { rep = 0; }
    if (typeof rep === 'object') rep = rep?.value ?? 0;
    return !(rep < -50 && view.st.faction !== 'guilda');
  }

  speaker(view) {
    const st = view.st;
    if (view.arch === 'meridiana') return { faction: 'guilda', speaker: 'CONTROLE MERIDIANA' };
    if (view.arch === 'platform') return { faction: 'guilda', speaker: 'TORRE THARSOS' };
    if (view.arch === 'rebel') return { faction: 'frente', speaker: 'REFÚGIO CINZA' };
    if (st.faction === 'hegemonia') return { faction: 'hegemonia', speaker: 'CONTROLE ' + st.name.toUpperCase() };
    return { faction: st.faction || 'guilda', speaker: 'CONTROLE ' + st.name.toUpperCase() };
  }

  radio(view, text, priority = 1) {
    const sp = this.speaker(view);
    this.ctx.bus.emit('radio', { faction: sp.faction, speaker: sp.speaker, text, priority, station: view.st.id });
  }

  /**
   * Concede atracação e devolve o alvo do piloto automático:
   * { frame (âncora móvel), pos (local), up, fwd, hover, station, bay }.
   */
  grant(view, { silent = false } = {}) {
    const ctx = this.ctx;
    if (!this.canDock(view)) {
      if (!silent) this.radio(view, 'Atracação negada. Sua ficha com a nossa gente não permite pouso aqui. Afaste-se.', 2);
      return null;
    }
    if (this.state !== 'idle' && this.view === view && this.bay) return this.target();
    this.release();
    const bay = this.pickBay(view);
    if (!bay) return null;
    this.view = view; this.bay = bay; this.state = 'granted';
    this.msgs.clear();
    // pontos do caminho em mundo (+ desvio se a nave estiver do outro lado)
    const pts = bay.path.map((p) => view.toWorld(p, new THREE.Vector3()));
    const ship = ctx.player.pos;
    const c = view.frame.pos, R = view.radius;
    const p0 = pts[0];
    const toShip = ship.clone().sub(c), toP0 = p0.clone().sub(c);
    // o segmento nave→entrada passa por dentro da estação?
    const d = p0.clone().sub(ship), L = d.length();
    let hits = false;
    if (L > 1) {
      d.divideScalar(L);
      const tt = THREE.MathUtils.clamp(c.clone().sub(ship).dot(d), 0, L);
      hits = ship.clone().addScaledVector(d, tt).distanceTo(c) < R * 1.25;
    }
    if (hits && toShip.length() > R * 0.8) {
      let mid = toShip.clone().normalize().add(toP0.clone().normalize());
      if (mid.lengthSq() < 0.05) mid = V3().crossVectors(toShip, view.dirToWorld(V3(0, 1, 0))).normalize();
      mid.normalize().multiplyScalar(Math.max(R * 1.8, toP0.length()));
      pts.unshift(c.clone().add(mid));
    }
    this.wpts = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.total = this.cum[this.cum.length - 1];
    this.s = 0;
    this.anchor.quat.copy(view.frame.quat);
    this.updateAnchor();
    this.showCorridor(view, bay);
    const nn = String(bay.number).padStart(2, '0');
    if (!silent) {
      const lbl = bay.kind === 'pad' ? `plataforma ${nn}` : `hangar ${nn}`;
      this.radio(view, `Autorização concedida, piloto. Siga para o ${lbl} pelo corredor iluminado. Velocidade máxima no corredor: oitenta metros por segundo.`, 2);
    }
    ctx.bus.emit('dock:granted', { station: view.st, bay: bay.number, pad: this.target() });
    return this.target();
  }

  target() {
    const b = this.bay;
    return {
      frame: this.anchor, pos: b.pad.clone(), up: b.up.clone(), fwd: b.fwd.clone(), hover: b.hover,
      station: this.view.st, bay: b.number, kind: b.kind,
    };
  }

  /** Ponto do caminho no comprimento s (mundo). */
  pointAt(s, out) {
    const P = this.wpts, C = this.cum;
    if (s <= 0) return out.copy(P[0]);
    for (let i = 1; i < P.length; i++) {
      if (s <= C[i]) { const t = (s - C[i - 1]) / Math.max(1e-6, C[i] - C[i - 1]); return out.copy(P[i - 1]).lerp(P[i], t); }
    }
    return out.copy(P[P.length - 1]);
  }

  /** Projeção da nave no caminho (s mais próximo). */
  project(p) {
    const P = this.wpts, C = this.cum;
    let best = 0, bd = Infinity;
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      const ab = _v.copy(b).sub(a); const L = ab.length();
      const t = L > 1e-6 ? THREE.MathUtils.clamp(_w.copy(p).sub(a).dot(ab) / (L * L), 0, 1) : 0;
      const q = _w.copy(a).addScaledVector(ab, t);
      const d = q.distanceTo(p);
      if (d < bd) { bd = d; best = C[i - 1] + t * L; }
    }
    return { s: best, dist: bd };
  }

  /** Âncora = estação deslocada para o "coelho" ficar no ponto s do caminho. */
  updateAnchor() {
    const view = this.view, b = this.bay;
    const hold = view.toWorld(_v.copy(b.pad).addScaledVector(b.up, b.hover), new THREE.Vector3());
    const rabbit = this.pointAt(this.s, new THREE.Vector3());
    this.anchor.pos.copy(view.frame.pos).add(rabbit.sub(hold));
  }

  update(dt) {
    if (this.state !== 'granted') return;
    const ctx = this.ctx, view = this.view;
    const ship = ctx.player.ship;
    const p = ctx.player.pos;
    const pr = this.project(p);
    const remain = this.total - pr.s;
    const lead = THREE.MathUtils.clamp(remain * 0.25, 30, 260);
    const target = pr.dist < 600 ? pr.s + lead : pr.s;
    this.s = Math.min(this.total, Math.max(this.s, target));
    if (this.total - this.s < 40) this.s = this.total;
    this.updateAnchor();
    // rádio por fase
    const frac = pr.s / Math.max(1, this.total);
    const nn = String(this.bay.number).padStart(2, '0');
    if (frac > 0.3 && pr.dist < 600 && !this.msgs.has('corr')) { this.msgs.add('corr'); this.radio(view, `Corredor confirmado. Mantenha o vetor — campo de contenção do ${this.bay.kind === 'pad' ? 'pátio' : 'hangar ' + nn} ativo.`); }
    if (remain < 160 && !this.msgs.has('final')) { this.msgs.add('final'); this.radio(view, `Trem de pouso abaixado. Plataforma ${nn} livre — pode descer.`); }
    // nave destruída ou foi embora (> 60 km): cancela a autorização
    if ((ship && ship.hull <= 0) || p.distanceTo(view.frame.pos) > 60000) this.release();
    void dt;
  }

  onDocked(station) {
    if (!this.view || (station && station.id !== this.view.st.id)) {
      // atracação sem passar por nós (reserva/cena): ainda dá as boas-vindas
      const v = station ? this.S.viewOf(station.id) : null;
      if (v) { this.view = v; this.bay = this.pickBay(v); }
    }
    if (!this.view) return;
    this.state = 'docked';
    this.s = this.total;
    if (this.wpts.length) this.updateAnchor();
    this.hideCorridor();
    const v = this.view;
    const msg = v.arch === 'meridiana' ? 'Atracação confirmada. Bem-vindo à Estação Meridiana, piloto. A Guilda lembra: aqui dentro, ninguém saca arma.'
      : v.arch === 'rebel' ? 'Pouso confirmado. Bem-vindo ao Refúgio. Não chame atenção e não toque em nada vermelho.'
        : v.arch === 'platform' ? 'Plataforma travada. Bem-vindo à Tharsos — cuidado com os ventos no convés.'
          : `Atracação confirmada. Bem-vindo à ${v.st.name}.`;
    this.radio(v, msg, 1);
  }

  release() {
    this.state = 'idle';
    this.hideCorridor();
    this.view = null; this.bay = null;
  }

  showCorridor(view, bay) {
    this.hideCorridor();
    const g = corridorGeometry(bay);
    const grp = new THREE.Group(); grp.name = 'corredor-holografico';
    const mesh = new THREE.Mesh(g, this.mat); mesh.renderOrder = 8; mesh.frustumCulled = false;
    grp.add(mesh);
    grp.add(padMarker(bay, this.mat));
    view.group.add(grp);
    this.vis = grp;
    this.mat.userData.U.on.value = 1;
    this.mat.userData.U.color.value.setRGB(...(view.style === 'hegemonia' ? [1.6, 1.2, 0.5] : view.style === 'frente' ? [1.7, 0.8, 0.3] : [0.35, 1.6, 1.3]));
  }
  hideCorridor() {
    if (!this.vis) return;
    this.vis.removeFromParent();
    this.vis.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.vis = null;
  }

  frame(dt) {
    if (!this.vis) return;
    for (const g of this.vis.children) for (const r of g.userData.spin || []) r.rotation.z += dt * 0.6;
    // some quando a nave já está dentro do hangar
    void _q;
  }
}
