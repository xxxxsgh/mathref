// Mapas holográficos: SISTEMA (órbitas, corpos sombreados pelo sol, estações,
// cinturão, sinais, posição do jogador e rota quântica) e GALÁXIA (420
// sistemas em 3D, braços espirais, nebulosas, rotas de salto, alcance do
// motor e rota multi-salto). Desenho em canvas 2D numa camada própria; a
// coluna de informação e a lista são DOM.
import * as THREE from 'three/webgpu';
import { STAR_TYPES } from '../../core/Universe.js';
import { PAL } from './style.js';
import { Layer, TAU, clamp, lerp, smooth, text, textWidth, glow, noGlow, brackets, diamond, hexagon, circle, triangle, fmtDist, fmtTime, hexA, rgbA, esc, ICONS } from './draw.js';

const STAR_COL = { red_dwarf: [1.0, 0.45, 0.25], yellow: [1.0, 0.86, 0.62], white: [0.9, 0.94, 1.0], blue_giant: [0.6, 0.74, 1.0], binary: [1.0, 0.78, 0.55], black_hole: [0.9, 0.55, 0.3] };
const FAC_COL = { hegemonia: '#f2d27a', frente: '#ff8a5a', corsarios: '#d26af0', guilda: '#5fd8c0', vigilantes: '#8cc4ff', nenhuma: '#8a97a6' };
const POI_NAMES = { derelict: 'Nave à deriva', distress: 'Sinal de socorro', ambush: 'Sinal fraco', ion_storm: 'Tempestade de íons', debris: 'Campo de destroços', convoy: 'Comboio', checkpoint: 'Posto de controle', opening_battle: 'Batalha', arrival: 'Ponto de chegada' };
const QT_SPEED = 2.0e6;

function hash(n) { let x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x); }
const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export class Maps {
  constructor(hud, root) {
    this.hud = hud; this.ctx = hud.ctx;
    this.modal = el('div', 'modal mapmodal');
    this.modal.style.background = 'radial-gradient(120% 100% at 50% 40%,rgba(3,10,20,.9),rgba(0,2,6,.97))';
    root.appendChild(this.modal);
    this.layer = new Layer(this.modal, { dprCap: hud.ctx.quality.name === 'mobile' ? 1.5 : 2 });
    this.layer.cv.style.pointerEvents = 'auto';
    this.layer.cv.style.touchAction = 'none';
    this.ui = el('div', 'mapui');
    this.modal.appendChild(this.ui);
    this.ui.innerHTML = `
      <div class="hdr"><div class="k"></div><div class="h"></div><div class="s"></div></div>
      <div class="switch"><div data-v="system">SISTEMA</div><div data-v="galaxy">GALÁXIA</div></div>
      <div class="info glass"><div class="gh"></div><div class="gb"></div></div>
      <div class="legend"></div>
      <div class="keys"></div>`;
    this.hdr = this.ui.querySelector('.hdr');
    this.info = this.ui.querySelector('.info');
    this.legend = this.ui.querySelector('.legend');
    this.keys = this.ui.querySelector('.keys');
    this.ui.querySelectorAll('.switch div').forEach((d) => d.addEventListener('click', () => this.open(d.dataset.v)));
    this.view = null;
    this.open_ = false;
    this.t = 0;
    // câmeras
    this.sys = { yaw: -0.5, pitch: 0.95, zoom: 1, tz: 1, sel: null, focus: new THREE.Vector3(), tfocus: new THREE.Vector3() };
    this.gal = { yaw: 0.6, pitch: 0.75, dist: 520, tdist: 520, sel: null, focus: new THREE.Vector3(), tfocus: new THREE.Vector3() };
    this.stars = Array.from({ length: 420 }, (_, i) => [hash(i + 1), hash(i + 7.3), hash(i + 13.1) * 0.8 + 0.2]);
    this.dust = null;
    this.bindPointer();
  }

  get isOpen() { return this.open_; }
  open(view = 'system') {
    this.view = view;
    this.open_ = true;
    this.modal.classList.add('on');
    this.ui.querySelectorAll('.switch div').forEach((d) => d.classList.toggle('on', d.dataset.v === view));
    if (view === 'system') this.enterSystem(); else this.enterGalaxy();
    this.dirtyInfo = true;
  }
  close() { this.open_ = false; this.modal.classList.remove('on'); }

  // ═════════════════════════════════════════════════════════════════════
  // SISTEMA
  enterSystem() {
    const sys = this.ctx.universe.system;
    if (!sys) return;
    let maxR = 0;
    for (const b of sys.bodies) maxR = Math.max(maxR, Math.hypot(b.pos.x, b.pos.z));
    for (const bl of sys.belts) maxR = Math.max(maxR, bl.radiusOuter);
    this.sys.maxR = maxR * 1.08;
    if (this.sysId !== sys.id) {
      this.sysId = sys.id; this.sys.zoom = this.sys.tz = 1; this.sys.focus.set(0, 0, 0); this.sys.tfocus.set(0, 0, 0);
      const tgt = this.ctx.player.ship?.target?.ref;
      this.sys.sel = tgt && tgt.pos ? tgt : (sys.bodies[0] || null);
    }
    const reg = sys.region || this.ctx.universe.galaxy.entry(sys.id)?.region || '';
    const fac = this.ctx.universe.FACTIONS[sys.faction]?.name || 'Sem dono';
    this.hdr.querySelector('.k').textContent = 'MAPA DO SISTEMA';
    this.hdr.querySelector('.h').textContent = sys.name.toUpperCase();
    this.hdr.querySelector('.s').innerHTML = `${esc(reg)} · ${esc(fac)}<br>${esc(sys.star.name)} · Segurança ${sys.security > 0.66 ? 'alta' : sys.security > 0.33 ? 'média' : 'baixa'}`;
    this.legend.innerHTML = `<span><i style="border-radius:50%;background:#7fb0d6"></i>Planeta</span><span><i style="transform:rotate(45deg);border:1.5px solid ${PAL.st}"></i>Estação</span><span><i style="background:${PAL.obj};transform:rotate(45deg)"></i>Objetivo</span><span><i style="border:1.5px dashed ${PAL.c};border-radius:50%"></i>Rota quântica</span><span><i style="background:#c9b8ff;transform:rotate(45deg)"></i>Sinal</span>`;
    this.keys.innerHTML = this.keyHints([['⇅', 'Selecionar'], ['ENTER', 'Traçar rota'], ['TAB', 'Galáxia'], ['ESC', 'Fechar']]);
  }
  keyHints(list) {
    const dev = this.ctx.input.device;
    if (dev === 'touch') return '<span>Arraste para girar · Pinça para zoom · Toque para selecionar</span>';
    if (dev === 'gamepad') list = list.map(([k, t]) => [{ ENTER: 'A', ESC: 'B', TAB: 'Y', '⇅': '◀▶' }[k] || k, t]);
    return list.map(([k, t]) => `<span><span class="k2">${esc(k)}</span>${esc(t)}</span>`).join('');
  }

  sysBodies() {
    const sys = this.ctx.universe.system;
    if (!sys) return [];
    const out = [];
    for (const b of sys.bodies) out.push({ kind: 'body', ref: b, pos: b.pos, name: b.name });
    for (const s of sys.stations) if (!s.hidden) out.push({ kind: 'station', ref: s, pos: s.pos, name: s.name });
    return out;
  }
  /** Escala radial comprimida (órbitas internas ganham espaço) — posição "de mapa". */
  remap(p, out = {}) {
    const R = this.sys.maxR || 3e7;
    const r = Math.hypot(p.x, p.z);
    const k = r > 1 ? (R * Math.pow(r / R, 0.55)) / r : 1;
    out.x = p.x * k; out.y = p.y * k * 0.5; out.z = p.z * k;
    return out;
  }
  /** Posição de mapa de um ponto de mundo: luas/estações/jogador exagerados em torno do pai. */
  mapWorld(p, out = {}) {
    const sys = this.ctx.universe.system;
    const b = sys?.dominantBody?.(p);
    if (!b) return this.remap(p, out);
    const base = this.mapBody(b, out);
    const d = _tmp.copy(p).sub(b.pos);
    const L = d.length();
    const kk = (this.sys.maxR || 3e7) * 0.045 * Math.min(1, Math.sqrt(L / b.soi) * 1.2) / Math.max(1, L);
    out.x = base.x + d.x * kk; out.y = base.y + d.y * kk * 0.3; out.z = base.z + d.z * kk;
    return out;
  }
  mapBody(b, out = {}) {
    if (!b.parent) return this.remap(b.pos, out);
    const par = this.ctx.universe.system.body(b.parent);
    if (!par) return this.remap(b.pos, out);
    this.remap(par.pos, out);
    const dx = b.pos.x - par.pos.x, dz = b.pos.z - par.pos.z, L = Math.hypot(dx, dz) || 1;
    const k = (this.sys.maxR || 3e7) * 0.05;
    out.x += dx / L * k; out.z += dz / L * k;
    return out;
  }
  mapStation(s, out = {}) {
    const b = s.body ? this.ctx.universe.system.body(s.body) : null;
    if (!b) return this.remap(s.pos, out);
    this.mapBody(b, out);
    const dx = s.pos.x - b.pos.x, dz = s.pos.z - b.pos.z, L = Math.hypot(dx, dz) || 1;
    const k = (this.sys.maxR || 3e7) * 0.028;
    out.x += dx / L * k; out.z += dz / L * k;
    return out;
  }
  sysProject(p, out) {
    const S = this.sys, W = this.layer.W, H = this.layer.H;
    const side = W > 900 ? Math.min(380, W * 0.3) : 0;
    const sp0 = Math.max(0.35, Math.sin(S.pitch));
    const scale = Math.min((W - side) * 0.42, H * 0.4 / sp0) / (S.maxR || 3e7) * S.zoom;
    const x = p.x - S.focus.x, y = p.y - S.focus.y, z = p.z - S.focus.z;
    const cy = Math.cos(S.yaw), sy = Math.sin(S.yaw);
    const X = x * cy - z * sy, Z = x * sy + z * cy;
    const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
    const Y = y * cp - Z * sp, D = y * sp + Z * cp;
    out.x = (W - side) * 0.5 + X * scale; out.y = H * 0.56 - Y * scale; out.d = D; out.s = scale;
    return out;
  }

  drawSystem(g, W, H, dt) {
    const sys = this.ctx.universe.system;
    if (!sys) return;
    const S = this.sys;
    S.zoom = lerp(S.zoom, S.tz, Math.min(1, dt * 8));
    S.focus.lerp(S.tfocus, Math.min(1, dt * 6));
    this.drawBackdrop(g, W, H);
    this.drawNebula(g, W, H, sys);
    const P = {}, Q = {}, M = {};
    const cam = this.ctx.player.camWorld;
    const R = S.maxR;
    // grade polar no plano orbital (anéis em distâncias reais "redondas")
    g.lineWidth = 1;
    const ringsR = [5e6, 1e7, 2e7, 3e7, 4.5e7, 6e7].filter((r) => r <= R * 1.02);
    ringsR.forEach((r, i) => {
      const rr = R * Math.pow(r / R, 0.55);
      g.strokeStyle = `rgba(166,236,255,${i === ringsR.length - 1 ? 0.14 : 0.06})`;
      this.ellipse(g, rr, 0, 120);
      this.sysProject({ x: rr * Math.cos(-0.62), y: 0, z: rr * Math.sin(-0.62) }, P);
      text(g, fmtDist(r), P.x + 5, P.y - 3, { size: 8.5, weight: 600, color: 'rgba(166,236,255,0.3)', track: 0.06 });
    });
    for (let k = 0; k < 12; k++) {
      const a = k * TAU / 12;
      this.sysProject({ x: Math.cos(a) * R * 0.06, y: 0, z: Math.sin(a) * R * 0.06 }, P);
      this.sysProject({ x: Math.cos(a) * R, y: 0, z: Math.sin(a) * R }, Q);
      g.strokeStyle = 'rgba(166,236,255,0.04)'; g.beginPath(); g.moveTo(P.x, P.y); g.lineTo(Q.x, Q.y); g.stroke();
    }
    // cinturões
    for (const bl of sys.belts) this.drawBelt(g, bl);
    // órbitas
    for (const b of sys.bodies) {
      if (b.parent) {
        const par = sys.body(b.parent);
        if (!par) continue;
        this.mapBody(par, M);
        g.strokeStyle = 'rgba(166,236,255,0.22)'; g.setLineDash([2, 3]);
        this.ellipse(g, R * 0.05, M.y, 48, M);
        g.setLineDash([]);
      } else {
        this.mapBody(b, M);
        const r = Math.hypot(M.x, M.z);
        const sel = S.sel === b || S.sel?.body === b.id;
        g.strokeStyle = sel ? 'rgba(166,236,255,0.6)' : 'rgba(166,236,255,0.24)';
        g.lineWidth = sel ? 1.6 : 1;
        this.ellipse(g, r, 0, 180);
        g.lineWidth = 1;
      }
    }
    // estrela
    this.sysProject(sys.star.pos, P);
    const sc = sys.star.color || [1, 0.9, 0.7];
    const gr = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, 90);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.07, rgbA(sc, 0.95)); gr.addColorStop(0.28, rgbA(sc, 0.2)); gr.addColorStop(1, rgbA(sc, 0));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = gr; g.beginPath(); g.arc(P.x, P.y, 90, 0, TAU); g.fill();
    for (let k = 0; k < 4; k++) { g.strokeStyle = rgbA(sc, 0.22); g.lineWidth = 1; const a = k * Math.PI / 4 + 0.2; g.beginPath(); g.moveTo(P.x - Math.cos(a) * 54, P.y - Math.sin(a) * 54); g.lineTo(P.x + Math.cos(a) * 54, P.y + Math.sin(a) * 54); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    const labels = [];
    const starP = { x: P.x, y: P.y };
    labels.push({ x: P.x - 40, y: P.y - 40, w: 80, h: 80 });
    // sinais (POIs)
    for (const p of sys.pois) {
      if (p.kind === 'arrival') continue;
      this.sysProject(this.mapWorld(p.pos, M), P);
      g.fillStyle = '#c9b8ff'; g.globalAlpha = 0.75; diamond(g, P.x, P.y, 3.2, true); g.globalAlpha = 1;
    }
    // corpos (ordenados por profundidade)
    const items = this.sysBodies().map((it) => {
      const m = it.kind === 'body' ? this.mapBody(it.ref, {}) : this.mapStation(it.ref, {});
      this.sysProject(m, it.P = {});
      return it;
    }).sort((a, b) => b.P.d - a.P.d);
    this.sysHits = [];
    const tgt = this.ctx.player.ship?.target?.ref;
    for (const it of items) {
      const p = it.P;
      if (it.kind === 'body') it.r = this.drawBodyIcon(g, it.ref, p, it.ref === S.sel, it.ref === tgt, starP);
      else { this.drawStationIcon(g, it.ref, p, it.ref === S.sel, it.ref === tgt); it.r = 7; }
      labels.push({ x: p.x - it.r, y: p.y - it.r, w: it.r * 2, h: it.r * 2 });
      this.sysHits.push({ x: p.x, y: p.y, ref: it.ref });
    }
    // jogador
    this.sysProject(this.mapWorld(cam, M), P);
    const me = { x: P.x, y: P.y };
    labels.push({ x: P.x - 10, y: P.y - 10, w: 20, h: 20 });
    // rota quântica
    if (S.sel && S.sel.pos) {
      const T = {};
      this.sysProject(S.sel.radius ? this.mapBody(S.sel, {}) : this.mapStation(S.sel, {}), T);
      const dist = cam.distanceTo(S.sel.pos);
      g.strokeStyle = PAL.c; g.lineWidth = 1.6; g.setLineDash([6, 6]); g.lineDashOffset = -this.t * 30;
      glow(g, PAL.c, 8);
      g.beginPath(); g.moveTo(me.x, me.y); g.lineTo(T.x, T.y); g.stroke(); g.setLineDash([]); noGlow(g);
      // caixa perpendicular à rota, longe da estrela
      const mx = (me.x + T.x) / 2, my = (me.y + T.y) / 2;
      let nx = -(T.y - me.y), ny = T.x - me.x; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      if ((mx + nx - starP.x) * nx + (my + ny - starP.y) * ny < 0) { nx = -nx; ny = -ny; }
      const bx = mx + nx * 34, by = my + ny * 30;
      g.strokeStyle = 'rgba(166,236,255,0.35)'; g.beginPath(); g.moveTo(mx, my); g.lineTo(bx, by); g.stroke();
      g.fillStyle = 'rgba(4,12,22,0.86)'; g.fillRect(bx - 76, by - 17, 152, 36);
      g.strokeStyle = 'rgba(166,236,255,0.4)'; g.strokeRect(bx - 75.5, by - 16.5, 151, 35);
      g.fillStyle = PAL.c; g.fillRect(bx - 76, by - 17, 2, 36);
      text(g, 'ROTA QUÂNTICA', bx, by - 3, { size: 8.5, weight: 700, color: PAL.c, align: 'center', track: 0.28 });
      text(g, `${fmtDist(dist)} · ETA ${fmtTime(dist / QT_SPEED + 4)}`, bx, by + 12, { size: 10.5, weight: 600, color: '#fff', align: 'center', track: 0.06 });
      labels.push({ x: bx - 76, y: by - 17, w: 152, h: 36 });
    }
    // objetivo
    const obj = this.hud.markers?.objective;
    if (obj) {
      obj.getPos(_tmp2); this.sysProject(this.mapWorld(_tmp2, M), P);
      const bob = Math.sin(this.t * 3) * 2;
      g.strokeStyle = PAL.obj; g.lineWidth = 1.5; glow(g, PAL.obj, 10);
      diamond(g, P.x, P.y - 26 + bob, 6); noGlow(g);
      g.fillStyle = PAL.obj; triangle(g, P.x, P.y - 15 + bob, 3.5, Math.PI / 2, true);
      labels.push({ x: P.x - 8, y: P.y - 34, w: 16, h: 22 });
    }
    // ícone do jogador
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.ctx.camera.quaternion);
    this.sysProject(this.mapWorld(_tmp.copy(cam).addScaledVector(f, 3e4), {}), Q);
    let ang = Math.atan2(Q.y - me.y, Q.x - me.x);
    if (!Number.isFinite(ang)) ang = 0;
    g.fillStyle = '#ffffff'; glow(g, PAL.c, 14);
    triangle(g, me.x, me.y, 8, ang, true); noGlow(g);
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1; circle(g, me.x, me.y, 14 + Math.sin(this.t * 2) * 2);
    // rótulos (com desvio de colisão)
    for (const it of items) {
      const b = it.ref, p = it.P;
      const moon = b.kind === 'moon';
      const name = b.name.toUpperCase();
      const sub = it.kind === 'body' ? (moon ? '' : (this.ctx.universe.BIOMES[b.type]?.name || '').toUpperCase()) : '';
      const col = it.kind === 'station' ? (FAC_COL[b.faction] || PAL.st) : it.ref === S.sel ? '#fff' : 'rgba(220,236,250,0.88)';
      const w = Math.max(textWidth(g, name, moon ? 8.5 : 10, 700, 0.26), sub ? textWidth(g, sub, 8, 600, 0.2) : 0) + 4;
      const h = sub ? 26 : 13;
      const cand = it.kind === 'station' ? [[1, -1], [1, 1], [-1, -1], [-1, 1]] : [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1]];
      const pos = placeLabel(labels, p.x, p.y, it.r + 7, w, h, cand);
      if (!pos) continue;
      if (pos.lead) { g.strokeStyle = hexA('#a6ecff', 0.25); g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(pos.ax, pos.ay); g.stroke(); }
      text(g, name, pos.x + w / 2, pos.y + 10, { size: moon ? 8.5 : 10, weight: 700, color: col, align: 'center', track: 0.26 });
      if (sub) text(g, sub, pos.x + w / 2, pos.y + 23, { size: 8, weight: 600, color: 'rgba(166,236,255,0.48)', align: 'center', track: 0.2 });
    }
    // nome da estrela e "VOCÊ"
    const sp = placeLabel(labels, starP.x, starP.y, 26, 90, 26, [[0, 1], [0, -1]]);
    if (sp) {
      text(g, sys.name.toUpperCase(), sp.x + 45, sp.y + 10, { size: 10, weight: 700, color: rgbA(sc, 0.95), align: 'center', track: 0.3 });
      text(g, sys.star.name.toUpperCase(), sp.x + 45, sp.y + 23, { size: 8, weight: 600, color: 'rgba(220,230,240,0.5)', align: 'center', track: 0.2 });
    }
    const yp = placeLabel(labels, me.x, me.y, 16, 42, 12, [[-1, -1], [1, -1], [-1, 1], [1, 1]]);
    if (yp) text(g, 'VOCÊ', yp.x + 21, yp.y + 10, { size: 9, weight: 700, color: '#fff', align: 'center', track: 0.3 });
  }

  ellipse(g, r, y, n, c = null) {
    const P = {};
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = i / n * TAU;
      this.sysProject({ x: (c?.x || 0) + Math.cos(a) * r, y, z: (c?.z || 0) + Math.sin(a) * r }, P);
      i ? g.lineTo(P.x, P.y) : g.moveTo(P.x, P.y);
    }
    g.stroke();
  }
  drawBelt(g, bl) {
    const P = {}, M = {};
    const n = this.ctx.quality.name === 'mobile' ? 600 : 1400;
    for (let i = 0; i < n; i++) {
      const a = hash(i * 3.1) * TAU, rr = lerp(bl.radiusInner, bl.radiusOuter, Math.pow(hash(i * 7.7), 0.8));
      this.remap({ x: Math.cos(a) * rr, y: (hash(i * 1.3) - 0.5) * bl.thickness * 6, z: Math.sin(a) * rr }, M);
      this.sysProject(M, P);
      const w = hash(i * 5.5);
      g.fillStyle = w < 0.2 ? 'rgba(255,214,170,0.9)' : 'rgba(205,196,182,0.9)';
      g.globalAlpha = 0.12 + hash(i * 9.1) * 0.38;
      const s = w > 0.93 ? 1.8 : 1.2;
      g.fillRect(P.x, P.y, s, s);
    }
    g.globalAlpha = 1;
    // rótulo no ângulo mais vazio
    const angs = this.ctx.universe.system.bodies.filter((b) => !b.parent).map((b) => Math.atan2(b.pos.z, b.pos.x));
    let best = 0, bs = -1;
    for (let k = 0; k < 24; k++) { const a = k / 24 * TAU; const d = Math.min(...angs.map((x) => Math.abs(((a - x + Math.PI * 3) % TAU) - Math.PI))); if (d > bs) { bs = d; best = a; } }
    const rr = (bl.radiusInner + bl.radiusOuter) / 2;
    this.sysProject(this.remap({ x: Math.cos(best) * rr, y: 0, z: Math.sin(best) * rr }, M), P);
    text(g, bl.name.toUpperCase(), P.x, P.y + 3, { size: 8.5, weight: 700, color: 'rgba(230,218,196,0.6)', align: 'center', track: 0.3 });
  }
  drawNebula(g, W, H, sys) {
    const e = this.ctx.universe.galaxy.entry(sys.id);
    const nb = e?.nebula;
    if (!nb) return;
    g.globalCompositeOperation = 'lighter';
    const blobs = [[0.18, 0.3, 0.55, nb.color, 0.1], [0.8, 0.72, 0.5, nb.color2 || nb.color, 0.08], [0.62, 0.18, 0.35, nb.color, 0.06], [0.3, 0.85, 0.4, nb.color2 || nb.color, 0.05]];
    for (const [x, y, r, c, a] of blobs) {
      const R = Math.max(W, H) * r;
      const gr = g.createRadialGradient(W * x, H * y, 0, W * x, H * y, R);
      gr.addColorStop(0, rgbA(c, a * (nb.density ?? 1))); gr.addColorStop(1, rgbA(c, 0));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    g.globalCompositeOperation = 'source-over';
  }
  drawBodyIcon(g, b, p, sel, tgt, starP) {
    const gas = b.kind === 'gas_giant', moon = b.kind === 'moon';
    const r = gas ? 17 : moon ? 5.5 : 10;
    const R = r * clamp(Math.sqrt(this.sys.zoom), 1, 2.4);
    const pal = b.palette || ['#888', '#aaa', '#ccc'];
    let lx = starP.x - p.x, ly = starP.y - p.y; const L = Math.hypot(lx, ly) || 1; lx /= L; ly /= L;
    if (gas && b.rings) {
      g.strokeStyle = 'rgba(230,214,190,0.4)'; g.lineWidth = 2.4;
      g.beginPath(); g.ellipse(p.x, p.y, R * 2.15, R * 0.6, -0.35, Math.PI, TAU); g.stroke();
      g.strokeStyle = 'rgba(200,180,150,0.25)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(p.x, p.y, R * 1.8, R * 0.5, -0.35, Math.PI, TAU); g.stroke();
    }
    // halo atmosférico
    if (b.atmosphere) {
      const sk = (b.atmosphere.rayleigh || [0.4, 0.6, 1]).map((v) => Math.min(1, v));
      const hg = g.createRadialGradient(p.x, p.y, R * 0.9, p.x, p.y, R * 1.6);
      hg.addColorStop(0, rgbA(sk, 0.35)); hg.addColorStop(1, rgbA(sk, 0));
      g.fillStyle = hg; circle(g, p.x, p.y, R * 1.6, true);
    }
    const gr = g.createRadialGradient(p.x + lx * R * 0.45, p.y + ly * R * 0.45, R * 0.05, p.x, p.y, R * 1.05);
    gr.addColorStop(0, pal[3] || pal[2]); gr.addColorStop(0.4, pal[2] || pal[1]); gr.addColorStop(0.78, pal[1] || pal[0]); gr.addColorStop(1, pal[0]);
    g.fillStyle = gr; circle(g, p.x, p.y, R, true);
    g.save(); g.beginPath(); g.arc(p.x, p.y, R, 0, TAU); g.clip();
    if (gas) for (let k = -4; k <= 4; k++) { g.fillStyle = k % 2 ? 'rgba(120,80,50,0.22)' : 'rgba(255,240,220,0.12)'; g.fillRect(p.x - R, p.y + k * R * 0.22 - R * 0.05, R * 2, R * 0.1); }
    else if (b.palette) { // manchas de continente
      for (let k = 0; k < 6; k++) { const a = hash(b.seed % 1000 + k) * TAU, d = hash(k * 3 + (b.seed % 97)) * R * 0.7; g.fillStyle = hexA(pal[k % 2 ? 0 : 4] || pal[0], 0.35); g.beginPath(); g.ellipse(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, R * 0.35, R * 0.22, a, 0, TAU); g.fill(); }
    }
    const sh = g.createLinearGradient(p.x + lx * R, p.y + ly * R, p.x - lx * R, p.y - ly * R);
    sh.addColorStop(0, 'rgba(255,255,255,0.08)'); sh.addColorStop(0.5, 'rgba(0,0,0,0.05)'); sh.addColorStop(0.72, 'rgba(0,0,0,0.6)'); sh.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = sh; g.fillRect(p.x - R, p.y - R, R * 2, R * 2);
    g.restore();
    if (b.atmosphere) {
      const sk = (b.atmosphere.rayleigh || [0.4, 0.6, 1]).map((v) => Math.min(1, v * 1.1));
      g.strokeStyle = rgbA(sk, 0.75); g.lineWidth = 1.3;
      g.beginPath(); g.arc(p.x, p.y, R + 0.8, Math.atan2(ly, lx) - 1.3, Math.atan2(ly, lx) + 1.3); g.stroke();
    }
    if (gas && b.rings) {
      g.strokeStyle = 'rgba(235,220,196,0.62)'; g.lineWidth = 2.4;
      g.beginPath(); g.ellipse(p.x, p.y, R * 2.15, R * 0.6, -0.35, 0, Math.PI); g.stroke();
      g.strokeStyle = 'rgba(200,180,150,0.3)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(p.x, p.y, R * 1.8, R * 0.5, -0.35, 0, Math.PI); g.stroke();
    }
    if (sel || tgt) {
      g.strokeStyle = tgt ? PAL.c : '#ffffff'; g.lineWidth = 1.5; glow(g, PAL.c, 10);
      brackets(g, p.x, p.y, R + 9, R + 9, 5);
      noGlow(g);
    }
    return R + (gas && b.rings ? R * 0.9 : 3);
  }
  drawStationIcon(g, s, p, sel, tgt) {
    const col = FAC_COL[s.faction] || PAL.st;
    g.strokeStyle = col; g.lineWidth = 1.5; glow(g, col, 8);
    hexagon(g, p.x, p.y, 6, false, Math.PI / 6); noGlow(g);
    g.fillStyle = col; circle(g, p.x, p.y, 1.8, true);
    if (sel || tgt) { g.strokeStyle = tgt ? PAL.c : '#fff'; g.lineWidth = 1.3; brackets(g, p.x, p.y, 13, 13, 4); }
  }

  sysInfo() {
    const S = this.sys, b = S.sel;
    const head = this.info.querySelector('.gh'), body = this.info.querySelector('.gb');
    if (!b) { head.innerHTML = 'SELEÇÃO'; body.innerHTML = '<div class="empty" style="min-height:90px">Nada selecionado</div>'; return; }
    const U = this.ctx.universe;
    const cam = this.ctx.player.camWorld;
    const dist = cam.distanceTo(b.pos);
    const eta = dist / QT_SPEED + 4;
    if (b.radius) {
      const bio = U.BIOMES[b.type];
      const hz = b.hazard || {};
      const chips = [];
      if (b.landable) chips.push('<span class="chip">Pousável</span>'); else chips.push('<span class="chip w">Não pousável</span>');
      if (hz.temp > 0.5) chips.push('<span class="chip w">Calor extremo</span>');
      if (hz.temp < -0.5) chips.push('<span class="chip w">Frio extremo</span>');
      if (hz.tox > 0.4) chips.push('<span class="chip b">Tóxico</span>');
      if (hz.rad > 0.4) chips.push('<span class="chip b">Radiação</span>');
      if (b.ruins) chips.push('<span class="chip" style="color:#8cc4ff">Ruínas</span>');
      const stations = this.ctx.universe.system.stations.filter((s) => s.body === b.id && !s.hidden).map((s) => s.name);
      head.innerHTML = `${b.kind === 'moon' ? 'LUA' : b.kind === 'gas_giant' ? 'GIGANTE GASOSO' : 'PLANETA'}<span>${esc(fmtDist(dist))}</span>`;
      body.innerHTML = `
        <div class="dt"><h3>${esc(b.name)}</h3><div class="kk">${esc(bio?.name || '')}</div></div>
        <div style="margin:4px 0 10px">${chips.join('')}</div>
        <div class="row"><span>Raio</span><b>${(b.radius / 1000).toFixed(1)} km</b></div>
        <div class="row"><span>Gravidade</span><b>${(b.gravity / 9.81).toFixed(2)} g</b></div>
        <div class="row"><span>Dia</span><b>${Math.round(b.rotationPeriod / 60)} min</b></div>
        <div class="row"><span>Atmosfera</span><b>${b.atmosphere ? (b.atmosphere.density > 1.25 ? 'Densa' : 'Respirável c/ filtro') : 'Nenhuma'}</b></div>
        <div class="row"><span>Recursos</span><b style="text-align:right">${esc((b.resources || []).slice(0, 3).join(' · '))}</b></div>
        ${stations.length ? `<div class="row"><span>Estações</span><b style="text-align:right">${esc(stations.join(', '))}</b></div>` : ''}
        <div class="row" style="margin-top:6px;border-top:1px solid rgba(166,236,255,.1);padding-top:12px"><span>Viagem quântica</span><b>${esc(fmtTime(eta))}</b></div>
        <div class="btn" data-act="route">${ICONS.quantum.replace('<svg', '<svg width="14" height="14" style="stroke:#06121d;fill:none;stroke-width:2"')}Traçar rota</div>`;
    } else {
      const fac = U.FACTIONS[b.faction];
      head.innerHTML = `ESTAÇÃO<span>${esc(fmtDist(dist))}</span>`;
      const svc = b.kind === 'trade' ? 'Mercado · Oficina · Missões · Bar' : b.kind === 'military' ? 'Posto militar · Acesso restrito' : b.kind === 'floating' ? 'Coleta de gás · Mercado' : b.kind === 'rebel' ? 'Base da Frente Livre · Missões' : 'Entreposto';
      body.innerHTML = `
        <div class="dt"><h3>${esc(b.name)}</h3><div class="kk" style="color:${FAC_COL[b.faction] || PAL.st}">${esc(fac?.name || '')}</div></div>
        <div class="row"><span>Serviços</span><b style="text-align:right">${esc(svc)}</b></div>
        <div class="row"><span>Órbita</span><b>${esc(this.ctx.universe.system.body(b.body)?.name || 'Espaço profundo')}</b></div>
        <div class="row" style="margin-top:6px;border-top:1px solid rgba(166,236,255,.1);padding-top:12px"><span>Viagem quântica</span><b>${esc(fmtTime(eta))}</b></div>
        <div class="btn" data-act="route">${ICONS.quantum.replace('<svg', '<svg width="14" height="14" style="stroke:#06121d;fill:none;stroke-width:2"')}Traçar rota</div>`;
    }
    body.querySelector('[data-act=route]')?.addEventListener('click', () => this.route());
  }
  route() {
    const f = this.ctx.services.flight;
    if (this.view === 'system') {
      const b = this.sys.sel; if (!b) return;
      try { f?.setTarget?.(b); } catch { /* */ }
      this.hud.notify(`ROTA TRAÇADA — ${b.name.toUpperCase()}`, 'info', { sub: 'Alinhe a nave e acione o motor quântico' });
    } else {
      const s = this.gal.sel; if (!s) return;
      try { f?.setTarget?.(s.id); } catch { /* */ }
      this.hud.notify(`DESTINO DE SALTO — ${s.name.toUpperCase()}`, 'info', { sub: this.galRoute?.length > 2 ? `${this.galRoute.length - 1} saltos` : 'Salto direto' });
    }
  }
  cycle(dir) {
    if (this.view === 'system') {
      const list = this.sysBodies().map((x) => x.ref);
      const i = list.indexOf(this.sys.sel);
      this.sys.sel = list[(i + dir + list.length) % list.length];
    } else {
      const near = this.galNear || [];
      if (!near.length) return;
      const i = near.indexOf(this.gal.sel);
      this.gal.sel = near[(i + dir + near.length) % near.length];
      this.computeRoute();
    }
    this.dirtyInfo = true;
  }

  // ═════════════════════════════════════════════════════════════════════
  // GALÁXIA
  galData() {
    const sp = this.ctx.services.space;
    let d = null;
    try { d = sp?.galaxyMap?.(70) || null; } catch { d = null; }
    if (d) return d;
    if (this._gd) return this._gd;
    const gx = this.ctx.universe.galaxy;
    const systems = gx.systems.map((s) => ({ id: s.id, name: s.name, pos: s.pos, starType: s.starType, color: STAR_COL[s.starType] || [1, 1, 1], faction: s.faction, factionName: this.ctx.universe.FACTIONS[s.faction]?.name || 'Nenhuma', security: s.security, region: s.region, nebula: s.nebula }));
    const lanes = [];
    for (const a of systems) {
      const near = systems.filter((b) => b !== a).map((b) => [Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z), b]).filter((x) => x[0] < 70).sort((x, y) => x[0] - y[0]).slice(0, 4);
      for (const [ly, b] of near) if (a.id < b.id) lanes.push({ a: a.id, b: b.id, ly });
    }
    this._gd = { systems, lanes };
    return this._gd;
  }
  enterGalaxy() {
    const d = this.galData();
    this.galById = new Map(d.systems.map((s) => [s.id, s]));
    const cur = this.galById.get(this.ctx.universe.systemId) || d.systems[0];
    this.gal.tfocus.set(cur.pos.x, cur.pos.y, cur.pos.z);
    if (!this.galInit) { this.gal.focus.copy(this.gal.tfocus); this.galInit = true; }
    const range = this.jumpRange();
    this.galNear = d.systems.filter((s) => s !== cur && Math.hypot(s.pos.x - cur.pos.x, s.pos.y - cur.pos.y, s.pos.z - cur.pos.z) < range * 2.2)
      .sort((a, b) => Math.atan2(a.pos.z - cur.pos.z, a.pos.x - cur.pos.x) - Math.atan2(b.pos.z - cur.pos.z, b.pos.x - cur.pos.x));
    if (!this.gal.sel || this.gal.sel === cur) {
      const tg = this.ctx.player.ship?.target;
      this.gal.sel = (tg?.kind === 'system' && this.galById.get(tg.id)) || this.galById.get(this.ctx.universe.systemId === 'halden' ? 'kessa' : 'halden') || this.galNear[0] || null;
    }
    this.computeRoute();
    this.hdr.querySelector('.k').textContent = 'MAPA GALÁCTICO';
    this.hdr.querySelector('.h').textContent = 'BRAÇO DE ÓRION';
    this.hdr.querySelector('.s').innerHTML = `${d.systems.length} sistemas catalogados<br>Alcance do motor de salto · ${range.toFixed(0)} anos-luz`;
    this.legend.innerHTML = Object.entries({ hegemonia: 'Hegemonia', frente: 'Frente Livre', corsarios: 'Corsários', guilda: 'Guilda' }).map(([k, v]) => `<span><i style="border-radius:50%;background:${FAC_COL[k]}"></i>${v}</span>`).join('') + `<span><i style="border:1px dashed ${PAL.c};border-radius:50%"></i>Alcance do salto</span>`;
    this.keys.innerHTML = this.keyHints([['⇅', 'Selecionar'], ['ENTER', 'Traçar salto'], ['TAB', 'Sistema'], ['ESC', 'Fechar']]);
  }
  jumpRange() { try { return this.ctx.services.flight?.jumpRange?.() || 75; } catch { return 75; } }
  computeRoute() {
    const d = this.galData();
    const cur = this.galById?.get(this.ctx.universe.systemId);
    const dst = this.gal.sel;
    this.galRoute = null;
    if (!cur || !dst || cur === dst) return;
    const R = this.jumpRange();
    const D = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z);
    if (D(cur, dst) <= R) { this.galRoute = [cur, dst]; return; }
    // A* simples no grafo "ao alcance" (limitado à região entre os dois)
    const cand = d.systems.filter((s) => D(s, cur) + D(s, dst) < D(cur, dst) * 1.5 + R);
    const open = new Map([[cur.id, { s: cur, g: 0, f: D(cur, dst), prev: null }]]);
    const closed = new Map();
    let it = 0;
    while (open.size && it++ < 3000) {
      let best = null; for (const n of open.values()) if (!best || n.f < best.f) best = n;
      open.delete(best.s.id); closed.set(best.s.id, best);
      if (best.s === dst) { const path = []; for (let n = best; n; n = n.prev) path.unshift(n.s); this.galRoute = path; return; }
      for (const s of cand) {
        if (closed.has(s.id)) continue;
        const dd = D(best.s, s);
        if (dd > R) continue;
        const gN = best.g + dd + 8; // custo por salto
        const o = open.get(s.id);
        if (!o || gN < o.g) open.set(s.id, { s, g: gN, f: gN + D(s, dst), prev: best });
      }
    }
  }
  galProject(p, out) {
    const G = this.gal, W = this.layer.W, H = this.layer.H;
    const x = p.x - G.focus.x, y = p.y - G.focus.y, z = p.z - G.focus.z;
    const cy = Math.cos(G.yaw), sy = Math.sin(G.yaw);
    const X = x * cy - z * sy, Z = x * sy + z * cy;
    const cp = Math.cos(G.pitch), sp = Math.sin(G.pitch);
    const Y = y * cp - Z * sp, D = y * sp + Z * cp;
    const depth = G.dist + D;
    const f = Math.min(W, H) * 1.05;
    const side = W > 900 ? Math.min(380, W * 0.3) : 0;
    out.x = (W - side) * 0.5 + X * f / Math.max(10, depth); out.y = H * 0.52 - Y * f / Math.max(10, depth);
    out.d = depth; out.k = f / Math.max(10, depth);
    return out;
  }
  drawGalaxy(g, W, H, dt) {
    const G = this.gal;
    G.dist = lerp(G.dist, G.tdist, Math.min(1, dt * 6));
    G.focus.lerp(G.tfocus, Math.min(1, dt * 5));
    if (this.ctx.shot === null) G.yaw += dt * 0.012;
    this.drawBackdrop(g, W, H, true);
    const d = this.galData();
    const P = {}, Q = {};
    // poeira dos braços espirais (determinística)
    if (!this.dust) {
      this.dust = [];
      for (let i = 0; i < 5200; i++) {
        const arm = i % 3, t = hash(i * 1.7);
        const ang = arm * TAU / 3 + t * 4.5 + (hash(i * 3.3) - 0.5) * 0.7;
        const rad = 40 + t * 560 + (hash(i * 5.1) - 0.5) * 60;
        const warm = hash(i * 9.9);
        this.dust.push({ x: Math.cos(ang) * rad, y: (hash(i * 2.2) - 0.5) * 20 * (1 - t * 0.5), z: Math.sin(ang) * rad, a: 0.06 + hash(i * 4.4) * 0.22, c: warm < 0.3 ? [1, 0.8, 0.6] : warm < 0.6 ? [0.7, 0.75, 1] : [0.85, 0.6, 1] });
      }
    }
    g.globalCompositeOperation = 'lighter';
    // núcleo galáctico
    this.galProject({ x: 0, y: 0, z: 0 }, P);
    const cr = 260 * P.k;
    if (cr > 2) {
      const gr = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, cr);
      gr.addColorStop(0, 'rgba(255,230,190,0.35)'); gr.addColorStop(0.3, 'rgba(200,150,120,0.12)'); gr.addColorStop(1, 'rgba(80,60,120,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(P.x, P.y, cr, 0, TAU); g.fill();
    }
    for (const p of this.dust) {
      this.galProject(p, P);
      if (P.d < 5) continue;
      g.fillStyle = rgbA(p.c, p.a * clamp(P.k * 1.6, 0.25, 1.4));
      const s = clamp(P.k * 1.8, 0.8, 2.6);
      g.fillRect(P.x, P.y, s, s);
    }
    // nebulosas
    for (const s of d.systems) {
      if (!s.nebula) continue;
      this.galProject(s.pos, P);
      if (P.d < 5) continue;
      const r = 26 * P.k;
      if (r < 3) continue;
      const gr = g.createRadialGradient(P.x, P.y, 0, P.x, P.y, r);
      gr.addColorStop(0, rgbA(s.nebula.color, 0.13)); gr.addColorStop(0.6, rgbA(s.nebula.color2 || s.nebula.color, 0.05)); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(P.x, P.y, r, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // alcance do salto (anel no plano)
    const cur = this.galById.get(this.ctx.universe.systemId) || d.systems[0];
    const R = this.jumpRange();
    g.strokeStyle = 'rgba(166,236,255,0.55)'; g.lineWidth = 1.2; g.setLineDash([5, 6]); g.lineDashOffset = -this.t * 10;
    g.beginPath();
    for (let i = 0; i <= 96; i++) { const a = i / 96 * TAU; this.galProject({ x: cur.pos.x + Math.cos(a) * R, y: cur.pos.y, z: cur.pos.z + Math.sin(a) * R }, P); i ? g.lineTo(P.x, P.y) : g.moveTo(P.x, P.y); }
    g.stroke(); g.setLineDash([]);
    g.fillStyle = 'rgba(166,236,255,0.035)'; g.fill();
    this.galProject({ x: cur.pos.x + R, y: cur.pos.y, z: cur.pos.z }, P);
    text(g, `${R.toFixed(0)} AL`, P.x + 6, P.y, { size: 9, weight: 700, color: PAL.c2, track: 0.2 });
    // rotas
    g.lineWidth = 1;
    for (const l of d.lanes) {
      const a = this.galById.get(l.a), b = this.galById.get(l.b);
      if (!a || !b) continue;
      this.galProject(a.pos, P); this.galProject(b.pos, Q);
      if (P.d < 5 || Q.d < 5) continue;
      const near = Math.min(Math.hypot(a.pos.x - cur.pos.x, a.pos.z - cur.pos.z), Math.hypot(b.pos.x - cur.pos.x, b.pos.z - cur.pos.z));
      g.strokeStyle = `rgba(166,236,255,${near < R * 2 ? 0.16 : 0.05})`;
      g.beginPath(); g.moveTo(P.x, P.y); g.lineTo(Q.x, Q.y); g.stroke();
    }
    // sistemas
    const pts = d.systems.map((s) => { const p = {}; this.galProject(s.pos, p); return [s, p]; }).filter(([, p]) => p.d > 5).sort((a, b) => b[1].d - a[1].d);
    this.galHits = [];
    g.globalCompositeOperation = 'lighter';
    for (const [s, p] of pts) {
      const dd = Math.hypot(s.pos.x - cur.pos.x, s.pos.y - cur.pos.y, s.pos.z - cur.pos.z);
      const inR = dd <= R;
      const col = s.color || [1, 1, 1];
      const rr = clamp(p.k * (s.starType === 'blue_giant' ? 2.4 : s.starType === 'red_dwarf' ? 1.2 : 1.7), 0.8, 6);
      const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 4.5);
      gr.addColorStop(0, rgbA([1, 1, 1], inR ? 0.95 : 0.6)); gr.addColorStop(0.2, rgbA(col, inR ? 0.75 : 0.35)); gr.addColorStop(1, rgbA(col, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, rr * 4.5, 0, TAU); g.fill();
      this.galHits.push({ x: p.x, y: p.y, ref: s });
    }
    g.globalCompositeOperation = 'source-over';
    // anéis de facção dos próximos
    const rects = [];
    { const c0 = {}; this.galProject(cur.pos, c0); rects.push({ x: c0.x - 60, y: c0.y - 44, w: 120, h: 84 }); }
    if (this.gal.sel) { const c1 = {}; this.galProject(this.gal.sel.pos, c1); rects.push({ x: c1.x - 20, y: c1.y - 20, w: 180, h: 40 }); }
    for (const [s, p] of pts) {
      const dd = Math.hypot(s.pos.x - cur.pos.x, s.pos.y - cur.pos.y, s.pos.z - cur.pos.z);
      if (dd > R * 2.2) continue;
      g.strokeStyle = hexA(FAC_COL[s.faction] || '#8a97a6', dd <= R ? 0.75 : 0.35); g.lineWidth = 1.2;
      circle(g, p.x, p.y, clamp(p.k * 6, 5, 11));
      if (dd <= R * 1.4 && s !== this.gal.sel && s !== cur) {
        const nm = s.name.toUpperCase();
        const w = textWidth(g, nm, 9, 700, 0.22) + 2;
        const pl = placeLabel(rects, p.x, p.y, 9, w, 11, [[1, -1], [1, 1], [-1, -1], [-1, 1]]);
        if (pl) text(g, nm, pl.x, pl.y + 9, { size: 9, weight: 700, color: dd <= R ? 'rgba(235,245,252,0.9)' : 'rgba(200,215,230,0.5)', track: 0.22 });
      }
    }
    // rota multi-salto
    if (this.galRoute?.length > 1) {
      g.strokeStyle = PAL.gold; g.lineWidth = 2; glow(g, PAL.gold, 10); g.setLineDash([7, 5]); g.lineDashOffset = -this.t * 24;
      g.beginPath();
      this.galRoute.forEach((s, i) => { this.galProject(s.pos, P); i ? g.lineTo(P.x, P.y) : g.moveTo(P.x, P.y); });
      g.stroke(); g.setLineDash([]); noGlow(g);
      this.galRoute.slice(1, -1).forEach((s) => { this.galProject(s.pos, P); g.fillStyle = PAL.gold; diamond(g, P.x, P.y, 4, true); });
    }
    // atual
    this.galProject(cur.pos, P);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; glow(g, PAL.c, 12);
    circle(g, P.x, P.y, 14 + Math.sin(this.t * 2.5) * 2);
    triangle(g, P.x, P.y - 24, 5, Math.PI / 2, true);
    noGlow(g);
    text(g, 'VOCÊ ESTÁ AQUI', P.x, P.y - 34, { size: 8.5, weight: 700, color: '#fff', align: 'center', track: 0.3 });
    text(g, cur.name.toUpperCase(), P.x, P.y + 30, { size: 11, weight: 700, color: PAL.c, align: 'center', track: 0.26 });
    // selecionado
    const sel = this.gal.sel;
    if (sel) {
      this.galProject(sel.pos, P);
      g.strokeStyle = PAL.gold; g.lineWidth = 1.6; glow(g, PAL.gold, 12);
      brackets(g, P.x, P.y, 18, 18, 6); noGlow(g);
      text(g, sel.name.toUpperCase(), P.x + 26, P.y - 4, { size: 12, weight: 700, color: '#fff', track: 0.24 });
      text(g, (sel.region || '').toUpperCase(), P.x + 26, P.y + 11, { size: 8.5, weight: 600, color: PAL.gold, track: 0.22 });
    }
  }
  galInfo() {
    const s = this.gal.sel;
    const head = this.info.querySelector('.gh'), body = this.info.querySelector('.gb');
    if (!s) { head.innerHTML = 'SELEÇÃO'; body.innerHTML = '<div class="empty" style="min-height:90px">Nada selecionado</div>'; return; }
    const cur = this.galById.get(this.ctx.universe.systemId);
    const ly = cur ? Math.hypot(s.pos.x - cur.pos.x, s.pos.y - cur.pos.y, s.pos.z - cur.pos.z) : 0;
    const R = this.jumpRange();
    const inR = ly <= R;
    const hops = this.galRoute ? this.galRoute.length - 1 : 0;
    const sec = s.security > 0.66 ? 'Alta' : s.security > 0.33 ? 'Média' : 'Baixa';
    head.innerHTML = `SISTEMA ESTELAR<span>${ly.toFixed(1)} AL</span>`;
    body.innerHTML = `
      <div class="dt"><h3>${esc(s.name)}</h3><div class="kk" style="color:${FAC_COL[s.faction] || '#8a97a6'}">${esc(s.factionName || '')}</div></div>
      <div style="margin:4px 0 10px">${inR ? '<span class="chip">Ao alcance</span>' : `<span class="chip w">${hops ? hops + ' saltos' : 'Fora de alcance'}</span>`}${s.nebula ? '<span class="chip" style="color:#d6b8ff">Nebulosa</span>' : ''}${s.starType === 'black_hole' ? '<span class="chip b">Buraco negro</span>' : ''}</div>
      <div class="row"><span>Estrela</span><b>${esc(s.starName || STAR_TYPES[s.starType]?.name || s.starType)}</b></div>
      <div class="row"><span>Região</span><b>${esc(s.region || '')}</b></div>
      <div class="row"><span>Segurança</span><b>${sec}</b></div>
      <div class="row"><span>Distância</span><b>${ly.toFixed(1)} anos-luz</b></div>
      <div class="btn" data-act="route">${ICONS.jump.replace('<svg', '<svg width="14" height="14" style="stroke:#06121d;fill:none;stroke-width:2"')}Traçar salto</div>`;
    body.querySelector('[data-act=route]')?.addEventListener('click', () => this.route());
  }

  // ═════════════════════════════════════════════════════════════════════
  drawBackdrop(g, W, H, deep = false) {
    const gr = g.createRadialGradient(W * 0.45, H * 0.5, 0, W * 0.45, H * 0.5, Math.max(W, H) * 0.8);
    gr.addColorStop(0, deep ? 'rgba(14,16,34,0.96)' : 'rgba(6,18,32,0.94)'); gr.addColorStop(1, 'rgba(1,3,7,0.98)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (const [x, y, b] of this.stars) { g.fillStyle = `rgba(220,232,255,${b * 0.35})`; g.fillRect(x * W, y * H, b > 0.85 ? 1.6 : 1, b > 0.85 ? 1.6 : 1); }
    // grade de fundo sutil
    g.strokeStyle = 'rgba(166,236,255,0.025)'; g.lineWidth = 1;
    for (let x = (W * 0.47) % 80; x < W; x += 80) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = (H * 0.52) % 80; y < H; y += 80) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  }

  frame(dt) {
    if (!this.open_) return;
    this.t += dt;
    const g = this.layer.fit();
    const W = this.layer.W, H = this.layer.H;
    if (this.view === 'system') this.drawSystem(g, W, H, dt); else this.drawGalaxy(g, W, H, dt);
    // moldura de vidro
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (this.dirtyInfo || (this.infoT = (this.infoT || 0) + dt) > 0.5) {
      this.infoT = 0; this.dirtyInfo = false;
      if (this.view === 'system') this.sysInfo(); else this.galInfo();
    }
  }

  // ── entrada ──────────────────────────────────────────────────────────
  bindPointer() {
    const cv = this.layer.cv;
    const pts = new Map();
    let moved = 0, pinch0 = 0;
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture?.(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); } });
    cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 2) {
        const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch0 > 0) this.zoom(d / pinch0); pinch0 = d;
        return;
      }
      this.rotate(dx * 0.006, dy * 0.005);
    });
    const up = (e) => {
      const p = pts.get(e.pointerId);
      pts.delete(e.pointerId);
      if (p && moved < 8 && pts.size === 0) this.pick(e.clientX, e.clientY);
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1 / 1.15 : 1.15); }, { passive: false });
  }
  rotate(dx, dy) {
    const C = this.view === 'system' ? this.sys : this.gal;
    C.yaw += dx;
    C.pitch = clamp(C.pitch + dy, 0.12, 1.45);
  }
  zoom(k) {
    if (this.view === 'system') this.sys.tz = clamp(this.sys.tz * k, 0.6, 30);
    else this.gal.tdist = clamp(this.gal.tdist / k, 60, 1600);
  }
  pick(x, y) {
    const hits = this.view === 'system' ? this.sysHits : this.galHits;
    let best = null, bd = 28;
    for (const h of hits || []) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } }
    if (!best) return;
    if (this.view === 'system') { this.sys.sel = best.ref; if (this.sys.tz > 2.5) this.sys.tfocus.copy(best.ref.pos); }
    else { this.gal.sel = best.ref; this.computeRoute(); }
    this.dirtyInfo = true;
  }
  onKey(code) {
    if (code === 'Tab' || code === 'KeyG') { this.open(this.view === 'system' ? 'galaxy' : 'system'); return true; }
    if (code === 'ArrowRight' || code === 'ArrowDown' || code === 'KeyD' || code === 'KeyS') { this.cycle(1); return true; }
    if (code === 'ArrowLeft' || code === 'ArrowUp' || code === 'KeyA' || code === 'KeyW') { this.cycle(-1); return true; }
    if (code === 'Enter' || code === 'Space') { this.route(); return true; }
    if (code === 'KeyQ' || code === 'Minus') { this.zoom(1 / 1.3); return true; }
    if (code === 'KeyE' || code === 'Equal') { this.zoom(1.3); return true; }
    return false;
  }
  /** Gamepad: eixos (−1..1) do analógico direito e gatilhos. */
  onPad(rx, ry, zin, zout, dt) {
    if (Math.abs(rx) > 0.15 || Math.abs(ry) > 0.15) this.rotate(rx * dt * 1.6, ry * dt * 1.2);
    if (zin > 0.1) this.zoom(1 + zin * dt * 2); if (zout > 0.1) this.zoom(1 / (1 + zout * dt * 2));
  }
}
const _tmp = new THREE.Vector3(), _tmp2 = new THREE.Vector3();
/** Acha uma posição livre para um rótulo w×h em torno de (x, y) a distância r. */
function placeLabel(rects, x, y, r, w, h, cand) {
  const hit = (a) => rects.some((b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
  for (let pass = 0; pass < 2; pass++) {
    for (const [cx, cy] of cand) {
      const rr = r + pass * 16;
      const box = { x: cx > 0 ? x + rr : cx < 0 ? x - rr - w : x - w / 2, y: cy > 0 ? y + rr - 2 : cy < 0 ? y - rr - h + 2 : y - h / 2, w, h };
      if (!hit(box)) { rects.push(box); return { x: box.x, y: box.y, lead: pass > 0, ax: box.x + (cx < 0 ? w : cx > 0 ? 0 : w / 2), ay: box.y + (cy < 0 ? h : cy > 0 ? 0 : h / 2) }; }
    }
  }
  return null;
}
void smooth; void QT_SPEED;
