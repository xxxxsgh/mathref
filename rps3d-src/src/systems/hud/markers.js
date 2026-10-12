// Marcadores de mundo: corpos celestes, estações, objetivo, alvo quântico,
// pontos de interesse e marcadores registrados por outros sistemas via
// services.hud.marker(id, getWorldPos, opts).
import * as THREE from 'three/webgpu';
import { PAL } from './style.js';
import { text, glow, noGlow, diamond, hexagon, circle, triangle, fmtDist, fmtTime, hexA, TAU, clamp, smooth } from './draw.js';

const _p = new THREE.Vector3();
const KIND_COLOR = {
  planet: 'rgba(196,232,255,0.92)', moon: 'rgba(170,205,230,0.8)', gas: 'rgba(230,214,190,0.92)', station: PAL.st, objective: PAL.obj,
  quantum: PAL.c, poi: '#c9b8ff', hostile: PAL.bad, friendly: PAL.ok, ship: PAL.c, loot: PAL.gold, scan: PAL.ok, nav: PAL.c, waypoint: PAL.c,
};

export class Markers {
  constructor(hud) {
    this.hud = hud; this.ctx = hud.ctx;
    this.custom = new Map();
    this.auto = [];
    this.objective = null;
    this.proj = {};
    this.t = 0;
  }
  add(id, getPos, opts = {}) {
    const fn = typeof getPos === 'function' ? getPos : (out) => out.copy(getPos?.pos || getPos);
    this.custom.set(id, { id, getPos: fn, kind: opts.kind || 'nav', label: opts.label ?? '', sub: opts.sub || '', color: opts.color || null, maxDist: opts.maxDist ?? Infinity, minDist: opts.minDist ?? 0,
      offscreen: opts.offscreen ?? (opts.kind === 'objective' || opts.kind === 'hostile'), showDist: opts.showDist ?? true, modes: opts.modes || null, priority: opts.priority ?? 1, icon: opts.icon || null, pulse: !!opts.pulse });
    return { remove: () => this.remove(id), update: (o) => Object.assign(this.custom.get(id) || {}, o) };
  }
  remove(id) { this.custom.delete(id); }

  rebuild(sys) {
    this.auto = [];
    if (!sys) return;
    for (const b of sys.bodies) {
      const kind = b.kind === 'gas_giant' ? 'gas' : b.kind === 'moon' ? 'moon' : 'planet';
      this.auto.push({ id: b.id, ref: b, kind, label: b.name, sub: this.ctx.universe.BIOMES[b.type]?.name || '', getPos: (out) => out.copy(b.pos), radius: b.radius, priority: kind === 'moon' ? 0 : 1 });
    }
    for (const st of sys.stations) {
      this.auto.push({ id: st.id, ref: st, kind: 'station', label: st.name, sub: this.ctx.universe.FACTIONS[st.faction]?.name || '', getPos: (out) => out.copy(st.pos), radius: 0, priority: 2, hidden: () => st.hidden });
    }
  }
  setObjective(o) {
    this.objective = null;
    if (!o || (!o.pos && !o.bodyId)) return;
    const sys = this.ctx.universe.system;
    let getPos = null;
    if (o.pos) { const p = o.pos.clone ? o.pos.clone() : new THREE.Vector3(o.pos.x, o.pos.y, o.pos.z); getPos = (out) => out.copy(p); }
    else { const b = sys?.body(o.bodyId) || sys?.station(o.bodyId); if (b) getPos = (out) => out.copy(b.pos); }
    if (getPos) this.objective = { id: 'objective', kind: 'objective', label: o.label || o.mission || 'OBJETIVO', getPos, offscreen: true, priority: 9, showDist: true };
  }

  /** Lista de marcadores ativos no modo atual. */
  list(mode) {
    const out = [];
    const sys = this.ctx.universe.system;
    if (mode === 'ship') for (const a of this.auto) if (!a.hidden?.()) out.push(a);
    for (const c of this.custom.values()) if (!c.modes || c.modes.includes(mode)) out.push(c);
    if (this.objective) out.push(this.objective);
    void sys;
    return out;
  }

  /**
   * Desenha os marcadores. `qt` = alvo quântico do flight ({ref, name, eta}).
   * `dense` reduz rótulos (cockpit).
   */
  draw(g, P, mode, { qt = null, dt = 0, dim = 1, objDistCb = null } = {}) {
    this.t += dt;
    const cam = this.ctx.player.camWorld;
    const items = this.list(mode);
    const offs = [];
    const placed = [];
    for (const m of items) {
      m.getPos(_p);
      const dist = _p.distanceTo(cam);
      if (dist > m.maxDist || dist < m.minDist) continue;
      const pr = P.project(_p, this.proj, 64);
      const isQt = qt && (qt.ref === m.ref || qt.id === m.id);
      const kind = m.kind;
      const col = m.color || KIND_COLOR[kind] || PAL.c;
      if (m === this.objective && objDistCb) objDistCb(dist);
      // corpo grande demais na tela: o marcador sai (o planeta fala por si)
      const angR = m.radius ? Math.asin(Math.min(1, m.radius / Math.max(dist, m.radius + 1))) : 0;
      const radPx = angR * (P.H / 2) / Math.atan(P.ty);
      if (m.radius && radPx > 160 && !isQt && kind !== 'objective') continue;
      if (!pr.on) {
        if (m.offscreen || isQt) offs.push({ m, pr, dist, col, isQt });
        continue;
      }
      // evita sobreposição de rótulos: prioridade maior ganha
      const x = pr.x, y = m.radius ? pr.y : pr.y;
      placed.push({ m, x, y, dist, col, isQt, radPx, pri: (m.priority || 0) + (isQt ? 10 : 0) });
    }
    placed.sort((a, b) => b.pri - a.pri);
    const boxes = [];
    for (const it of placed) {
      const { m, x, y, dist, col, isQt, radPx } = it;
      const showLabel = !boxes.some((b) => Math.abs(b.x - x) < 120 && Math.abs(b.y - y) < 30);
      g.globalAlpha = dim;
      this.drawOne(g, m, x, y, dist, col, isQt, radPx, showLabel, qt);
      g.globalAlpha = 1;
      if (showLabel) boxes.push({ x, y });
    }
    // fora da tela
    for (const o of offs) this.drawOff(g, o.m, o.pr, o.dist, o.col, o.isQt);
  }

  drawOne(g, m, x, y, dist, col, isQt, radPx, showLabel, qt) {
    const kind = m.kind;
    g.lineWidth = 1.5; g.strokeStyle = col; g.fillStyle = col;
    if (kind === 'objective') {
      const bob = Math.sin(this.t * 3) * 2;
      glow(g, col, 12);
      diamond(g, x, y + bob, 9);
      g.globalAlpha *= 0.5; diamond(g, x, y + bob, 15); g.globalAlpha = 1;
      g.beginPath(); g.moveTo(x, y + bob + 19); g.lineTo(x - 5, y + bob + 26); g.lineTo(x + 5, y + bob + 26); g.closePath(); g.fill();
      noGlow(g);
      text(g, m.label.toUpperCase(), x, y - 26 + bob, { size: 10.5, weight: 700, color: col, align: 'center', track: 0.26 });
      text(g, fmtDist(dist), x, y + 44 + bob, { size: 12, weight: 500, color: '#fff6dc', align: 'center', track: 0.06 });
      return;
    }
    if (kind === 'station') {
      glow(g, col, 8); hexagon(g, x, y, 7, false, Math.PI / 6); noGlow(g);
      g.fillStyle = col; circle(g, x, y, 1.8, true);
    } else if (kind === 'hostile' || kind === 'friendly') {
      g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.strokeRect(-6, -6, 12, 12); g.restore();
    } else if (m.radius) {
      // corpo: anel do tamanho aparente (mín. 6 px) com ticks
      const r = clamp(radPx + 5, 6, 150);
      g.globalAlpha *= 0.85;
      g.beginPath(); g.arc(x, y, r, -0.5, 0.5); g.stroke();
      g.beginPath(); g.arc(x, y, r, Math.PI - 0.5, Math.PI + 0.5); g.stroke();
      g.globalAlpha /= 0.85;
      circle(g, x, y, 1.6, true);
    } else {
      glow(g, col, 8); diamond(g, x, y, 6); noGlow(g);
    }
    if (isQt) {
      const r = clamp(radPx + 14, 18, 170);
      g.strokeStyle = PAL.c; g.lineWidth = 1.5;
      glow(g, PAL.c, 10);
      g.setLineDash([3, 5]); g.lineDashOffset = -this.t * 12;
      circle(g, x, y, r); g.setLineDash([]);
      for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + this.t * 0.4; triangle(g, x + Math.cos(a) * (r + 7), y + Math.sin(a) * (r + 7), 4, a + Math.PI, true); }
      noGlow(g);
    }
    if (!showLabel && !isQt) return;
    const lx = x + (m.radius ? clamp(radPx + 5, 6, 150) * 0.72 + 10 : 13), ly = y - (m.radius ? clamp(radPx + 5, 6, 150) * 0.72 + 4 : 6);
    if (m.radius || kind === 'station') { g.strokeStyle = col; g.globalAlpha *= 0.6; g.beginPath(); g.moveTo(x + (m.radius ? clamp(radPx + 5, 6, 150) * 0.7 : 6), y - (m.radius ? clamp(radPx + 5, 6, 150) * 0.7 : 6)); g.lineTo(lx - 2, ly + 2); g.lineTo(lx + 40, ly + 2); g.stroke(); g.globalAlpha /= 0.6; }
    const label = (m.label || '').toUpperCase();
    text(g, label, lx, ly - 2, { size: isQt ? 12 : 10.5, weight: 700, color: isQt ? '#ffffff' : col, track: 0.2 });
    let sub = fmtDist(dist);
    if (isQt && qt?.eta > 0) sub += `  ·  QT ${fmtTime(qt.eta)}`;
    text(g, sub, lx, ly + 15, { size: 10.5, weight: 500, color: isQt ? PAL.c : 'rgba(210,232,248,0.72)', track: 0.08 });
  }

  drawOff(g, m, pr, dist, col, isQt) {
    const x = pr.ex, y = pr.ey, a = pr.ang;
    g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.5;
    glow(g, col, 10);
    triangle(g, x, y, 8, a, true);
    g.globalAlpha = 0.5; triangle(g, x - Math.cos(a) * 9, y - Math.sin(a) * 9, 5, a, false); g.globalAlpha = 1;
    noGlow(g);
    const tx = x - Math.cos(a) * 26, ty = y - Math.sin(a) * 26;
    const al = Math.cos(a) > 0.3 ? 'right' : Math.cos(a) < -0.3 ? 'left' : 'center';
    text(g, (m.kind === 'objective' ? m.label : m.label || '').toUpperCase(), tx, ty - 2, { size: 9.5, weight: 700, color: col, align: al, track: 0.2 });
    text(g, fmtDist(dist), tx, ty + 12, { size: 10, weight: 500, color: 'rgba(230,240,250,0.8)', align: al, track: 0.06 });
    void isQt;
  }
}

export { KIND_COLOR, smooth, hexA };
