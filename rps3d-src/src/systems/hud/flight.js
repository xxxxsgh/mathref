// HUD de voo (camada do capacete). No cockpit o combinador holográfico da
// nave (sistema ships) já desenha retícula, escada de arfagem e velocidade:
// aqui ficam as camadas que vivem no VISOR — caixas de alvo sobre as naves
// reais, indicador de antecipação, contatos, marcadores de navegação,
// alertas de trava/míssil, painéis de sistemas e armas, altímetro radar e
// guia de pouso. Na câmera externa, a HUD completa (retícula, vetor de voo,
// arcos de acelerador/boost, horizonte artificial, rumo) é desenhada aqui.
import * as THREE from 'three/webgpu';
import { PAL } from './style.js';
import {
  TAU, clamp, lerp, smooth, text, glow, noGlow, brackets, diamond, circle, line, triangle, segArc, segBar, plate, fadePlate, fmtDist, fmtTime, hexA,
} from './draw.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _up = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _n = new THREE.Vector3();
const REL = { hostile: PAL.bad, friendly: PAL.ok, neutral: '#ffd27a' };
const heatCol = (k) => (k < 0.55 ? PAL.c : k < 0.8 ? PAL.warn : PAL.bad);
const shCol = (v) => (v > 0.5 ? PAL.c : v > 0.25 ? PAL.warn : PAL.bad);

export class FlightHud {
  constructor(hud) {
    this.hud = hud; this.ctx = hud.ctx;
    this.t = 0;
    this.pr = {}; this.pr2 = {};
    this.tgt = null; this.tgtT = 0;
    this.hits = [];
    this.lockedBy = 0;
    this.altPrev = null; this.vs = 0;
    this.lastLock = 0;
    const bus = this.ctx.bus;
    bus.on('ship:hit', (e) => {
      const sh = this.ctx.player.ship;
      if (!sh || !e || (e.target !== 'player' && e.target !== sh.id)) return;
      if (this.hits.length > 6) this.hits.shift();
      this.hits.push({ t: 0, shield: !!e.shield, pos: e.pos?.clone?.() || null, amt: Math.min(1, (e.damage ?? 5) / 20) });
    });
    bus.on('missile:lock', (e) => { if (e?.target === 'player' || e?.target?.id === 'player' || e?.target?.isPlayer) this.lockedBy = 2.5; });
  }

  data() {
    const ctx = this.ctx, sh = ctx.player.ship;
    const cb = ctx.services.combat;
    let ch = null;
    try { ch = cb?.hud?.() || null; } catch { ch = null; }
    return { sh, cb, ch };
  }

  draw(g, P, dt, W, H, opts = {}) {
    this.t += dt;
    const { sh, cb, ch } = this.data();
    if (!sh) return;
    const third = !!sh.thirdPerson || !this.ctx.services.ships?.cockpit;
    const compact = W < 900;
    // ── contatos e alvo ─────────────────────────────────────────────────
    this.drawContacts(g, P, cb, ch, sh, W, H);
    // ── HUD externa completa ────────────────────────────────────────────
    if (third) this.drawCenter(g, P, sh, W, H, ch);
    // ── atmosfera / pouso ───────────────────────────────────────────────
    this.drawAltitude(g, P, sh, W, H, third, dt);
    // ── faixa de modo / quântico ────────────────────────────────────────
    this.drawModeStrip(g, sh, W, H, ch);
    // ── painéis ─────────────────────────────────────────────────────────
    if (!opts.noPanels) {
      this.drawSystems(g, sh, W, H, compact);
      this.drawWeapons(g, sh, ch, W, H, compact);
    } else if (opts.strip) this.drawStrip(g, sh, ch, W, H);
    // ── alertas ─────────────────────────────────────────────────────────
    this.drawAlerts(g, P, sh, ch, W, H, dt);
    this.drawHits(g, P, W, H, dt);
  }

  // ═════════════════════════════════════════════════════════════════════
  drawContacts(g, P, cb, ch, sh, W, H) {
    if (!cb) return;
    let ships = [];
    try { ships = cb.ships || []; } catch { ships = []; }
    let hostile = null;
    try { hostile = new Set(cb.targets()); } catch { hostile = new Set(); }
    const T = (() => { try { return cb.playerTarget; } catch { return null; } })();
    if (T !== this.tgt) { this.tgt = T; this.tgtT = 0; }
    this.tgtT += 1 / 60;
    const cam = this.ctx.player.camWorld;
    let offCount = 0;
    for (const s of ships) {
      if (!s || s.state === 'dead' || s === T || s.isPlayer || s.id === 'player') continue;
      const pos = s.renderPos || s.pos;
      const dist = pos.distanceTo(cam);
      if (dist > (s.capital ? 60000 : 9000)) continue;
      const rel = hostile.has(s) ? 'hostile' : (() => { try { return cb.relation('player', s.faction) === 'friendly' ? 'friendly' : 'neutral'; } catch { return 'neutral'; } })();
      const col = REL[rel];
      const pr = P.project(pos, this.pr, 40);
      if (pr.on) {
        const sz = clamp((s.radius || 9) * pr.ppm * 1.1, 7, 240);
        const k = Math.max(3, Math.min(8, sz * 0.35));
        g.strokeStyle = col; g.lineWidth = 1.3; g.globalAlpha = dist > 5000 ? 0.55 : 0.9;
        brackets(g, pr.x, pr.y, sz, sz * (s.capital ? 0.55 : 0.8), k);
        g.globalAlpha = 1;
        if (s.capital) {
          text(g, (s.name || s.label || '').toUpperCase(), pr.x, pr.y - sz * 0.55 - 8, { size: 10, weight: 700, color: col, align: 'center', track: 0.24 });
          text(g, `${fmtDist(dist)}${s.capital.aliveTurrets !== undefined ? ` · TORRES ${s.capital.aliveTurrets}` : ''}`, pr.x, pr.y + sz * 0.55 + 15, { size: 9.5, weight: 500, color: hexA(col, 0.8), align: 'center', track: 0.1 });
        } else if (dist < 3000) {
          text(g, fmtDist(dist), pr.x, pr.y + sz * 0.8 + 13, { size: 9, weight: 600, color: hexA(col, 0.75), align: 'center', track: 0.08 });
        }
        if (s.state === 'disabled') text(g, 'DESATIVADA', pr.x, pr.y - sz * 0.8 - 6, { size: 9, weight: 700, color: PAL.gold, align: 'center', track: 0.22 });
      } else if (rel === 'hostile' && dist < 4000 && offCount < 8) {
        offCount++;
        g.fillStyle = hexA(col, 0.7);
        triangle(g, pr.ex, pr.ey, 5, pr.ang, true);
      }
    }
    if (T && T.alive !== false && T.state !== 'dead') this.drawTarget(g, P, cb, ch, T, sh, W, H);
  }

  drawTarget(g, P, cb, ch, T, sh, W, H) {
    const pos = T.renderPos || T.pos;
    const cam = this.ctx.player.camWorld;
    const dist = pos.distanceTo(cam);
    const info = ch?.target || null;
    const rel = info?.rel || 'hostile';
    const col = REL[rel];
    const pr = P.project(pos, this.pr, 70);
    const appear = smooth(0, 0.35, this.tgtT);
    if (!pr.on) {
      // seta grande na borda
      glow(g, col, 14);
      g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 2;
      triangle(g, pr.ex, pr.ey, 13, pr.ang, true);
      triangle(g, pr.ex - Math.cos(pr.ang) * 14, pr.ey - Math.sin(pr.ang) * 14, 8, pr.ang, false);
      noGlow(g);
      const al = Math.cos(pr.ang) > 0.3 ? 'right' : Math.cos(pr.ang) < -0.3 ? 'left' : 'center';
      const tx = pr.ex - Math.cos(pr.ang) * 40, ty = pr.ey - Math.sin(pr.ang) * 40;
      text(g, 'ALVO', tx, ty - 4, { size: 9, weight: 700, color: col, align: al, track: 0.3 });
      text(g, fmtDist(dist), tx, ty + 11, { size: 11, weight: 600, color: '#fff', align: al, track: 0.06 });
      return;
    }
    const base = clamp((T.radius || 9) * pr.ppm * 1.25, 24, 280);
    const sz = base * lerp(1.7, 1, appear);
    const x = pr.x, y = pr.y;
    g.lineWidth = 2; g.strokeStyle = col;
    glow(g, col, 12);
    brackets(g, x, y, sz, sz * (T.capital ? 0.6 : 0.82), Math.max(7, sz * 0.32));
    noGlow(g);
    g.globalAlpha = 0.35; g.lineWidth = 1;
    brackets(g, x, y, sz + 6, sz * (T.capital ? 0.6 : 0.82) + 6, 4);
    g.globalAlpha = 1;
    g.fillStyle = col; circle(g, x, y, 1.6, true);
    // trava de míssil
    const lock = ch?.lock ?? 0;
    if (lock > 0.001) {
      const locked = lock >= 1;
      const r = locked ? sz * 0.62 : lerp(sz * 1.9, sz * 0.62, lock);
      g.save(); g.translate(x, y); g.rotate(locked ? Math.PI / 4 : this.t * 2.4);
      g.strokeStyle = locked ? PAL.bad : PAL.warn; g.lineWidth = locked ? 2.2 : 1.4;
      glow(g, g.strokeStyle, locked ? 14 : 6);
      g.strokeRect(-r, -r, r * 2, r * 2);
      noGlow(g); g.restore();
      const blink = !locked || (this.t * 3) % 1 < 0.7;
      if (blink) text(g, locked ? 'TRAVA' : `TRAVANDO ${Math.round(lock * 100)}%`, x, y - sz * 0.82 - 22, { size: 10.5, weight: 700, color: locked ? PAL.bad : PAL.warn, align: 'center', track: 0.3 });
    }
    // indicador de antecipação
    let L = null;
    try { L = cb.lead?.(T); } catch { L = null; }
    if (L?.pos && dist > 30) {
      const lp = P.project(L.pos, this.pr2, 20);
      if (lp.on) {
        const cx = P.W / 2, cy = P.H / 2;
        // no cockpit as armas apontam pelo nariz (centro da tela, salvo olhar livre)
        const aim = sh.thirdPerson ? this.boresight(P, sh) : { x: cx, y: cy };
        const off = Math.hypot(lp.x - aim.x, lp.y - aim.y);
        const solution = off < 16;
        g.strokeStyle = col; g.lineWidth = 1; g.globalAlpha = 0.55;
        g.setLineDash([2, 4]); line(g, x, y, lp.x, lp.y); g.setLineDash([]);
        g.globalAlpha = 1; g.lineWidth = 1.8;
        glow(g, col, solution ? 18 : 8);
        circle(g, lp.x, lp.y, 9);
        g.beginPath(); g.moveTo(lp.x - 14, lp.y); g.lineTo(lp.x - 9, lp.y); g.moveTo(lp.x + 9, lp.y); g.lineTo(lp.x + 14, lp.y); g.moveTo(lp.x, lp.y - 14); g.lineTo(lp.x, lp.y - 9); g.moveTo(lp.x, lp.y + 9); g.lineTo(lp.x, lp.y + 14); g.stroke();
        if (solution) { g.fillStyle = hexA(col, 0.55); circle(g, lp.x, lp.y, 5, true); }
        noGlow(g);
      }
    }
    // cartão de informações
    const name = (info?.name || T.label || T.name || 'CONTATO').toUpperCase();
    const fac = (info?.faction || this.ctx.universe.FACTIONS[T.faction]?.name || '').toUpperCase();
    const cx = x + sz + 16, cy = y - sz * 0.82;
    const right = cx + 210 < W;
    const bx = right ? cx : x - sz - 16 - 196;
    g.globalAlpha = appear;
    fadePlate(g, bx - 6, cy - 4, 210, 84, right ? 1 : -1, 0.5);
    g.fillStyle = col; g.fillRect(right ? bx - 6 : bx + 202, cy - 4, 2, 84);
    text(g, name, bx + 4, cy + 12, { size: 11.5, weight: 700, color: '#fff', track: 0.12 });
    text(g, fac, bx + 4, cy + 27, { size: 9, weight: 600, color: col, track: 0.26 });
    // velocidade de aproximação
    const rv = _v.copy(T.vel || _v2.set(0, 0, 0)).sub(sh.vel || _v3.set(0, 0, 0));
    const dir = _v2.copy(pos).sub(cam).normalize();
    const closing = -rv.dot(dir);
    text(g, fmtDist(dist), bx + 4, cy + 47, { size: 15, weight: 300, color: '#fff', display: true, track: 0.02 });
    text(g, `${closing >= 0 ? '▼' : '▲'} ${Math.abs(Math.round(closing))} m/s`, bx + 100, cy + 47, { size: 10.5, weight: 600, color: closing > 80 ? PAL.warn : PAL.c2, track: 0.06 });
    const shF = info?.shield ?? T.shieldFrac ?? 0, huF = info?.hull ?? T.hullFrac ?? 1;
    text(g, 'ESC', bx + 4, cy + 63, { size: 8.5, weight: 700, color: PAL.c2, track: 0.2 });
    segBar(g, bx + 30, cy + 57, 150, 4, shF, { n: 16, gap: 2, on: PAL.c });
    text(g, 'CAS', bx + 4, cy + 77, { size: 8.5, weight: 700, color: PAL.c2, track: 0.2 });
    segBar(g, bx + 30, cy + 71, 150, 4, huF, { n: 16, gap: 2, on: huF > 0.4 ? '#ffd9a8' : PAL.bad });
    if (info?.disabled || T.state === 'disabled') text(g, 'DESATIVADA · ABORDÁVEL', bx + 4, cy + 96, { size: 9.5, weight: 700, color: PAL.gold, track: 0.22 });
    else if (T.capital && T.capital.aliveTurrets !== undefined) text(g, `TORRES ATIVAS ${T.capital.aliveTurrets}`, bx + 4, cy + 96, { size: 9.5, weight: 700, color: col, track: 0.22 });
    g.globalAlpha = 1;
  }

  boresight(P, sh) {
    _f.set(0, 0, -1).applyQuaternion(sh.quat);
    _v.copy(sh.pos).addScaledVector(_f, 900);
    const p = P.project(_v, this.pr2, 0);
    return { x: p.x, y: p.y, on: p.on };
  }

  // ═════════════════════════════════════════════════════════════════════
  drawCenter(g, P, sh, W, H, ch) {
    const cx = W / 2, cy = H / 2;
    const C = PAL.c;
    // mira (eixo das armas)
    const b = this.boresight(P, sh);
    g.strokeStyle = C; g.lineWidth = 1.6;
    glow(g, C, 8);
    if (b.on) {
      const x = b.x, y = b.y;
      g.beginPath();
      g.moveTo(x - 18, y); g.lineTo(x - 6, y); g.moveTo(x + 6, y); g.lineTo(x + 18, y);
      g.moveTo(x, y - 18); g.lineTo(x, y - 6); g.moveTo(x, y + 6); g.lineTo(x, y + 18);
      g.stroke();
      g.fillStyle = C; circle(g, x, y, 1.4, true);
    }
    // vetor de voo
    if (sh.speed > 4 && sh.vel) {
      _v.copy(sh.pos).addScaledVector(_v2.copy(sh.vel).normalize(), 2000);
      const p = P.project(_v, this.pr2, 0);
      if (p.on) {
        circle(g, p.x, p.y, 7);
        g.beginPath(); g.moveTo(p.x - 7, p.y); g.lineTo(p.x - 17, p.y); g.moveTo(p.x + 7, p.y); g.lineTo(p.x + 17, p.y); g.moveTo(p.x, p.y - 7); g.lineTo(p.x, p.y - 13); g.stroke();
      }
    }
    noGlow(g);
    // arco do acelerador (esquerda) e boost (direita)
    const R = Math.min(170, H * 0.24);
    const thr = clamp(sh.throttle ?? 0, -1, 1);
    const a0 = Math.PI * 0.78, a1 = Math.PI * 1.22;
    g.lineWidth = 1; g.strokeStyle = 'rgba(166,236,255,0.2)';
    g.beginPath(); g.arc(cx, cy, R + 7, a0, a1); g.stroke();
    segArc(g, cx, cy, R, a1, a0, Math.max(0, thr), { n: 26, w: 5, on: (k) => (k > 0.85 ? '#ffffff' : C), glowOn: 6 });
    if (thr < 0) segArc(g, cx, cy, R, a0, a0 + 0.15, -thr, { n: 4, w: 5, on: PAL.warn });
    // ticks
    for (let i = 0; i <= 4; i++) {
      const a = a1 - (a1 - a0) * (i / 4);
      g.strokeStyle = 'rgba(166,236,255,0.5)'; g.lineWidth = 1;
      line(g, cx + Math.cos(a) * (R + 10), cy + Math.sin(a) * (R + 10), cx + Math.cos(a) * (R + 15), cy + Math.sin(a) * (R + 15));
    }
    const b0 = -Math.PI * 0.22, b1 = Math.PI * 0.22;
    g.strokeStyle = 'rgba(166,236,255,0.2)';
    g.beginPath(); g.arc(cx, cy, R + 7, b0, b1); g.stroke();
    segArc(g, cx, cy, R, b1, b0, sh.boostFuel ?? 1, { n: 20, w: 5, on: sh.boosting ? PAL.warn : 'rgba(255,196,110,0.85)', glowOn: sh.boosting ? 10 : 0 });
    // velocidade
    const spd = sh.mode === 'quantum' ? (sh.speed || 0) : sh.speed || 0;
    const sx = cx - R - 34, sy = cy + 6;
    const spdTxt = spd >= 10000 ? `${(spd / 1000).toFixed(1)}k` : String(Math.round(spd));
    text(g, spdTxt, sx, sy, { size: 30, weight: 300, color: '#ffffff', align: 'right', display: true });
    text(g, 'M/S', sx, sy + 17, { size: 9, weight: 700, color: PAL.c2, align: 'right', track: 0.3 });
    text(g, `${(sh.gforce ?? 1).toFixed(1)} G`, sx, sy - 34, { size: 10, weight: 600, color: Math.abs(sh.gforce ?? 1) > 6 ? PAL.warn : PAL.c2, align: 'right', track: 0.14 });
    text(g, `ACEL ${Math.round(Math.max(0, thr) * 100)}%`, sx, sy + 34, { size: 9, weight: 600, color: PAL.c3, align: 'right', track: 0.2 });
    text(g, 'BOOST', cx + R + 30, cy + 4, { size: 9, weight: 700, color: sh.boosting ? PAL.warn : PAL.c2, track: 0.3 });
    text(g, `${Math.round((sh.boostFuel ?? 1) * 100)}%`, cx + R + 30, cy + 20, { size: 13, weight: 400, color: '#fff', track: 0.04, display: true });
    // atmosfera: horizonte e escada de arfagem
    if (sh.body && sh.inAtmo) this.drawHorizon(g, sh, W, H, cx, cy);
  }

  attitude(sh) {
    const b = sh.body;
    if (!b) return null;
    _up.copy(sh.pos).sub(b.pos).normalize();
    _f.set(0, 0, -1).applyQuaternion(sh.quat);
    _r.set(1, 0, 0).applyQuaternion(sh.quat);
    const pitch = Math.asin(clamp(_f.dot(_up), -1, 1));
    const rh = _v.copy(_r).addScaledVector(_up, -_r.dot(_up));
    const roll = -Math.atan2(_r.dot(_up), rh.length());
    const axis = _v2.set(Math.sin(b.axialTilt || 0), Math.cos(b.axialTilt || 0), 0);
    _n.copy(axis).addScaledVector(_up, -axis.dot(_up));
    if (_n.lengthSq() < 1e-8) _n.set(1, 0, 0);
    _n.normalize();
    const east = _v3.crossVectors(_n, _up);
    const heading = Math.atan2(_f.dot(east), _f.dot(_n));
    return { pitch, roll, heading };
  }

  drawHorizon(g, sh, W, H, cx, cy) {
    const at = this.attitude(sh);
    if (!at) return;
    const ppd = H / (this.ctx.camera.fov) ; // px por grau (aprox.)
    g.save();
    g.translate(cx, cy); g.rotate(-at.roll);
    g.beginPath(); g.rect(-W * 0.22, -H * 0.3, W * 0.44, H * 0.6); g.clip();
    const pd = at.pitch * 180 / Math.PI;
    g.strokeStyle = 'rgba(166,236,255,0.55)'; g.lineWidth = 1.2;
    for (let d = -60; d <= 60; d += 10) {
      if (d === 0) continue;
      const y = (pd - d) * ppd;
      if (Math.abs(y) > H * 0.3) continue;
      g.setLineDash(d < 0 ? [6, 5] : []);
      g.beginPath(); g.moveTo(-150, y); g.lineTo(-80, y); g.lineTo(-80, y + (d > 0 ? 8 : -8)); g.moveTo(150, y); g.lineTo(80, y); g.lineTo(80, y + (d > 0 ? 8 : -8)); g.stroke();
      g.setLineDash([]);
      text(g, String(Math.abs(d)), -158, y + 4, { size: 9.5, weight: 600, color: 'rgba(166,236,255,0.6)', align: 'right' });
      text(g, String(Math.abs(d)), 158, y + 4, { size: 9.5, weight: 600, color: 'rgba(166,236,255,0.6)' });
    }
    const hy = pd * ppd;
    g.strokeStyle = PAL.c; g.lineWidth = 1.6; glow(g, PAL.c, 6);
    g.beginPath(); g.moveTo(-W * 0.22, hy); g.lineTo(-70, hy); g.moveTo(70, hy); g.lineTo(W * 0.22, hy); g.stroke();
    noGlow(g);
    g.restore();
    // rumo (fita superior)
    const hd = ((at.heading * 180 / Math.PI) % 360 + 360) % 360;
    const ty = 74;
    g.strokeStyle = 'rgba(166,236,255,0.5)'; g.lineWidth = 1;
    for (let k = -45; k <= 45; k += 5) {
      const val = Math.round(hd / 5) * 5 + k;
      const x = cx + (val - hd) * 5.2;
      if (Math.abs(x - cx) > 230) continue;
      const a = 1 - Math.abs(x - cx) / 240;
      g.globalAlpha = a;
      line(g, x, ty, x, ty + (val % 10 === 0 ? 9 : 5));
      if (val % 30 === 0) {
        const v = ((val % 360) + 360) % 360;
        const lab = { 0: 'N', 90: 'L', 180: 'S', 270: 'O' }[v] ?? String(v).padStart(3, '0');
        text(g, lab, x, ty - 6, { size: 10, weight: 700, color: lab.length === 1 ? '#fff' : PAL.c2, align: 'center', track: 0.1 });
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = PAL.c; triangle(g, cx, ty + 15, 5, -Math.PI / 2, true);
    text(g, String(Math.round(hd)).padStart(3, '0') + '°', cx, ty + 32, { size: 11, weight: 600, color: '#fff', align: 'center', track: 0.1 });
  }

  // ═════════════════════════════════════════════════════════════════════
  drawAltitude(g, P, sh, W, H, third, dt) {
    const alt = sh.altitude;
    if (!sh.body || !Number.isFinite(alt) || alt > 60000) { this.altPrev = null; return; }
    if (this.altPrev !== null && dt > 0) this.vs = lerp(this.vs, (alt - this.altPrev) / dt, Math.min(1, dt * 4));
    this.altPrev = alt;
    const x = third ? W / 2 + Math.min(170, H * 0.24) + 120 : W - 150, cy = H / 2;
    const h = 220;
    // fita de altitude (escala log abaixo de 1 km fica mais detalhada)
    const scale = alt < 1500 ? 0.25 : alt < 10000 ? 0.035 : 0.006; // px por metro
    const step = alt < 1500 ? 100 : alt < 10000 ? 1000 : 5000;
    g.save();
    g.beginPath(); g.rect(x - 6, cy - h / 2, 70, h); g.clip();
    fadePlate(g, x - 6, cy - h / 2, 70, h, 1, 0.28);
    g.strokeStyle = 'rgba(166,236,255,0.5)'; g.lineWidth = 1;
    const base = Math.floor(alt / step) * step;
    for (let k = -6; k <= 6; k++) {
      const v = base + k * step;
      if (v < 0) continue;
      const y = cy - (v - alt) * scale;
      line(g, x, y, x + (v % (step * 2) === 0 ? 12 : 7), y);
      if (v % (step * 2) === 0) text(g, v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(v), x + 16, y + 4, { size: 9.5, weight: 600, color: PAL.c2 });
    }
    // chão
    const gy = cy + alt * scale;
    if (gy < cy + h / 2) { g.fillStyle = 'rgba(255,182,77,0.18)'; g.fillRect(x, gy, 60, cy + h / 2 - gy); g.strokeStyle = PAL.warn; line(g, x, gy, x + 60, gy); }
    g.restore();
    // leitura atual
    g.fillStyle = 'rgba(5,12,21,0.75)'; g.strokeStyle = PAL.c; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x - 10, cy); g.lineTo(x - 2, cy - 13); g.lineTo(x + 78, cy - 13); g.lineTo(x + 78, cy + 13); g.lineTo(x - 2, cy + 13); g.closePath(); g.fill(); g.stroke();
    const at = alt >= 10000 ? `${(alt / 1000).toFixed(1)} km` : `${Math.round(alt)} m`;
    text(g, at, x + 72, cy + 5, { size: 13, weight: 600, color: '#fff', align: 'right', track: 0.02 });
    text(g, 'ALT RADAR', x, cy - h / 2 - 10, { size: 8.5, weight: 700, color: PAL.c2, track: 0.26 });
    // velocidade vertical
    const vs = this.vs;
    text(g, `${vs >= 0 ? '▲' : '▼'} ${Math.abs(vs).toFixed(Math.abs(vs) < 10 ? 1 : 0)} m/s`, x, cy + h / 2 + 18, { size: 10.5, weight: 600, color: vs < -25 && alt < 400 ? PAL.bad : PAL.c, track: 0.04 });
    // trem de pouso
    const gear = sh.gearT ?? (sh.gear ? 1 : 0);
    const gtxt = sh.landed ? 'POUSADO' : gear > 0.98 ? 'TREM ▼ BAIXADO' : gear > 0.02 ? 'TREM EM CURSO' : 'TREM ▲ RECOLHIDO';
    const gcol = sh.landed ? PAL.ok : gear > 0.98 ? PAL.ok : gear > 0.02 ? PAL.warn : alt < 300 ? PAL.warn : PAL.c2;
    text(g, gtxt, x, cy + h / 2 + 36, { size: 9.5, weight: 700, color: gcol, track: 0.2 });
    // guia de pouso perto do chão
    if (alt < 250 && !sh.landed) {
      const k = clamp(1 - alt / 250, 0, 1);
      const cx = W / 2, cy2 = H / 2 + 120;
      g.strokeStyle = hexA(PAL.ok, 0.4 + k * 0.5); g.lineWidth = 1.4;
      const s = 70 - k * 34;
      g.beginPath(); g.ellipse(cx, cy2, s * 1.8, s * 0.45, 0, 0, TAU); g.stroke();
      g.beginPath(); g.ellipse(cx, cy2, 18, 4.5, 0, 0, TAU); g.stroke();
      text(g, `POUSO · ${Math.round(alt)} m`, cx, cy2 + s * 0.45 + 18, { size: 10, weight: 700, color: PAL.ok, align: 'center', track: 0.26 });
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  drawModeStrip(g, sh, W, H, ch) {
    const cx = W / 2, y = sh.thirdPerson && sh.inAtmo ? 132 : 30;
    const q = sh.quantum || {};
    let mode = sh.mode === 'cruise' ? 'CRUZEIRO' : sh.mode === 'quantum' ? 'QUÂNTICO' : sh.mode === 'jump' ? 'SALTO' : sh.docked ? 'ATRACADO' : sh.landed ? 'POUSADO' : sh.boosting ? 'BOOST' : 'SCM';
    if (sh.autopilot) mode = 'PILOTO AUTOMÁTICO';
    const chips = [mode, sh.coupled === false ? 'DESACOPLADO' : 'ACOPLADO'];
    let w = 0;
    const cw = chips.map((c) => { g.font = '700 9.5px Inter, system-ui, sans-serif'; const tw = g.measureText(c).width + c.length * 2.6 + 22; w += tw + 6; return tw; });
    let x = cx - w / 2;
    chips.forEach((c, i) => {
      const hot = i === 0 && mode !== 'SCM';
      g.fillStyle = hot ? 'rgba(166,236,255,0.16)' : 'rgba(5,12,21,0.45)';
      g.fillRect(x, y - 13, cw[i], 20);
      g.strokeStyle = hot ? PAL.c : 'rgba(166,236,255,0.25)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y - 12.5, cw[i] - 1, 19);
      text(g, c, x + cw[i] / 2, y + 1, { size: 9.5, weight: 700, color: hot ? '#fff' : (i === 1 && sh.coupled === false ? PAL.warn : PAL.c2), align: 'center', track: 0.26 });
      x += cw[i] + 6;
    });
    // quântico
    if (q.state === 'spool' || q.state === 'travel' || (sh.target && q.eta > 0)) {
      const name = (q.name || sh.target?.name || '').toUpperCase();
      const yy = y + 30;
      const label = q.state === 'travel' ? `VIAGEM QUÂNTICA  ▸  ${name}` : q.state === 'spool' ? `CARREGANDO MOTOR QUÂNTICO  ▸  ${name}` : `ROTA  ▸  ${name}`;
      text(g, label, cx, yy, { size: 10.5, weight: 700, color: q.state ? '#ffffff' : PAL.c, align: 'center', track: 0.24 });
      const prog = q.state === 'travel' ? (q.progress ?? 0) : q.state === 'spool' ? (q.spool ?? 0) : 0;
      if (q.state) {
        segBar(g, cx - 140, yy + 8, 280, 3, prog, { n: 40, gap: 1.5, on: '#ffffff', glowOn: 6 });
      }
      if (q.eta > 0) text(g, `ETA ${fmtTime(q.eta)}`, cx, yy + 26, { size: 10, weight: 600, color: PAL.c2, align: 'center', track: 0.18 });
      else if (q.reason && !q.state) text(g, String(q.reason).toUpperCase(), cx, yy + 26, { size: 9.5, weight: 700, color: PAL.warn, align: 'center', track: 0.2 });
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  drawSystems(g, sh, W, H, compact) {
    const x0 = 28, y0 = H - 30;
    const w = compact ? 200 : 236, h = 132;
    const x = x0, y = y0 - h;
    fadePlate(g, x - 10, y - 18, w + 50, h + 26, 1, 0.42);
    g.fillStyle = PAL.c; g.fillRect(x - 10, y - 18, 30, 2);
    text(g, 'SISTEMAS', x, y - 4, { size: 9.5, weight: 700, color: PAL.c, track: 0.34 });
    text(g, `CASCO ${Math.round((sh.hull ?? 1) * 100)}%`, x + w, y - 4, { size: 9.5, weight: 700, color: (sh.hull ?? 1) < 0.35 ? PAL.bad : PAL.c2, align: 'right', track: 0.2 });
    // diagrama de escudos
    const cx = x + 52, cy = y + 60;
    const S = sh.shields || { f: 1, b: 1, l: 1, r: 1 };
    const hitSide = this.hitSides();
    const arc = (a0, a1, v, side) => {
      const flash = hitSide[side] || 0;
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(166,236,255,0.12)'; g.beginPath(); g.arc(cx, cy, 44, a0, a1); g.stroke();
      g.strokeStyle = flash > 0 ? '#ffffff' : shCol(v);
      g.globalAlpha = 0.35 + v * 0.65;
      glow(g, g.strokeStyle, 6 + flash * 18);
      const m = (a0 + a1) / 2, half = (a1 - a0) / 2 * clamp(v, 0, 1);
      g.beginPath(); g.arc(cx, cy, 44, m - half, m + half); g.stroke();
      noGlow(g); g.globalAlpha = 1;
    };
    const gp = 0.12;
    arc(-Math.PI * 0.75 + gp, -Math.PI * 0.25 - gp, S.f, 'f');
    arc(-Math.PI * 0.25 + gp, Math.PI * 0.25 - gp, S.r, 'r');
    arc(Math.PI * 0.25 + gp, Math.PI * 0.75 - gp, S.b, 'b');
    arc(Math.PI * 0.75 + gp, Math.PI * 1.25 - gp, S.l, 'l');
    // silhueta da nave (vista de cima)
    const hull = sh.hull ?? 1;
    g.strokeStyle = hull > 0.5 ? 'rgba(220,240,255,0.85)' : hull > 0.25 ? PAL.warn : PAL.bad;
    g.fillStyle = hull > 0.5 ? 'rgba(166,236,255,0.12)' : 'rgba(255,90,72,0.18)';
    g.lineWidth = 1.3;
    g.beginPath();
    const pts = [[0, -26], [5, -12], [7, -2], [24, 10], [24, 15], [8, 12], [6, 20], [12, 25], [-12, 25], [-6, 20], [-8, 12], [-24, 15], [-24, 10], [-7, -2], [-5, -12]];
    pts.forEach(([px, py], i) => (i ? g.lineTo(cx + px, cy + py) : g.moveTo(cx + px, cy + py)));
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = PAL.c; g.fillRect(cx - 1.5, cy - 14, 3, 6);
    // pips de energia
    const pips = sh.pips || { sys: 2, eng: 2, wep: 2 };
    const cols = [['sys', 'ESC'], ['eng', 'MOT'], ['wep', 'ARM']];
    const px0 = x + 122;
    cols.forEach(([k, lab], i) => {
      const px = px0 + i * (compact ? 26 : 34);
      for (let p = 0; p < 4; p++) {
        const on = p < (pips[k] ?? 0);
        g.fillStyle = on ? (k === 'wep' ? '#ffcf8a' : k === 'eng' ? '#9cf0c4' : PAL.c) : 'rgba(166,236,255,0.12)';
        if (on) glow(g, g.fillStyle, 6);
        g.fillRect(px, y + 86 - p * 15, 18, 11);
        noGlow(g);
      }
      text(g, lab, px + 9, y + 114, { size: 8.5, weight: 700, color: PAL.c2, align: 'center', track: 0.16 });
    });
    // energia / combustível
    text(g, 'ENERGIA', x, y + h + 2, { size: 8.5, weight: 700, color: PAL.c2, track: 0.24 });
    segBar(g, x + 54, y + h - 4, 90, 3, typeof sh.energy === 'number' ? sh.energy : 1, { n: 15, gap: 1.5, on: PAL.c });
    text(g, 'QT', x + 156, y + h + 2, { size: 8.5, weight: 700, color: PAL.c2, track: 0.24 });
    segBar(g, x + 174, y + h - 4, compact ? 30 : 54, 3, sh.qfuel ?? 1, { n: 8, gap: 1.5, on: '#c9b8ff' });
  }

  /** Faixa compacta (toque): escudo, casco, calor, mísseis, flares — sob a faixa de modo. */
  drawStrip(g, sh, ch, W, H) {
    const S = sh.shields || { f: 1, b: 1, l: 1, r: 1 };
    const shv = (S.f + S.b + S.l + S.r) / 4;
    const items = [
      ['ESC', shv, shCol(shv)], ['CAS', sh.hull ?? 1, (sh.hull ?? 1) < 0.35 ? PAL.bad : '#eaf8ff'], ['CALOR', Math.min(1, sh.heat ?? 0), heatCol(sh.heat ?? 0)],
    ];
    const w = 70, gap = 18;
    const total = items.length * (w + gap) + 120;
    let x = W / 2 - total / 2;
    const y = H - 26;
    fadePlate(g, x - 16, y - 22, total + 32, 34, 1, 0.0);
    g.fillStyle = 'rgba(5,12,21,0.5)'; g.fillRect(x - 14, y - 20, total + 28, 30);
    for (const [lab, v, col] of items) {
      text(g, lab, x, y - 6, { size: 8, weight: 700, color: PAL.c2, track: 0.24 });
      segBar(g, x, y, w, 4, v, { n: 10, gap: 1.5, on: col });
      x += w + gap;
    }
    const cm = ch?.cm || {};
    text(g, `MSL ${ch?.missiles ?? '—'}  ·  FLR ${cm.flare ?? '—'}`, x, y + 3, { size: 10, weight: 700, color: '#fff', track: 0.14 });
  }

  hitSides() {
    const out = { f: 0, b: 0, l: 0, r: 0 };
    const sh = this.ctx.player.ship;
    if (!sh) return out;
    _q.copy(sh.quat).invert();
    for (const h of this.hits) {
      if (!h.pos || h.t > 0.4) continue;
      const d = _v.copy(h.pos).sub(sh.pos).applyQuaternion(_q);
      const k = 1 - h.t / 0.4;
      if (Math.abs(d.z) > Math.abs(d.x)) out[d.z < 0 ? 'f' : 'b'] = Math.max(out[d.z < 0 ? 'f' : 'b'], k);
      else out[d.x > 0 ? 'r' : 'l'] = Math.max(out[d.x > 0 ? 'r' : 'l'], k);
    }
    return out;
  }

  drawWeapons(g, sh, ch, W, H, compact) {
    const w = compact ? 200 : 236, h = 132;
    const x = W - 28 - w, y = H - 30 - h;
    fadePlate(g, x - 40, y - 18, w + 50, h + 26, -1, 0.42);
    g.fillStyle = PAL.c; g.fillRect(x + w - 20, y - 18, 30, 2);
    text(g, 'ARMAMENTO', x + w, y - 4, { size: 9.5, weight: 700, color: PAL.c, align: 'right', track: 0.34 });
    const wname = (ch?.weapon || 'CANHÕES LASER').toUpperCase();
    text(g, wname, x + w, y + 22, { size: 14, weight: 300, color: '#fff', align: 'right', display: true, track: 0.08 });
    text(g, 'GRUPO 1 · LIGADO', x + w, y + 37, { size: 8.5, weight: 700, color: PAL.c2, align: 'right', track: 0.22 });
    // calor
    const heat = clamp(sh.heat ?? 0, 0, 1.2);
    const over = sh.overheat || heat >= 1;
    const blink = !over || (this.t * 3) % 1 < 0.6;
    text(g, over ? 'SUPERAQUECIDO' : 'CALOR', x, y + 58, { size: 8.5, weight: 700, color: over ? (blink ? PAL.bad : 'rgba(255,90,72,0.4)') : PAL.c2, track: 0.24 });
    text(g, `${Math.round(Math.min(1, heat) * 100)}%`, x + w, y + 58, { size: 10, weight: 600, color: heatCol(heat), align: 'right', track: 0.06 });
    segBar(g, x, y + 64, w, 6, Math.min(1, heat), { n: 30, gap: 1.5, on: (k) => heatCol(k), glowOn: heat > 0.8 ? 6 : 0 });
    // mísseis
    const n = ch?.missiles ?? 0;
    const kind = String(ch?.missileKind || 'ir').toUpperCase();
    text(g, `MÍSSEIS ${kind}`, x, y + 92, { size: 8.5, weight: 700, color: PAL.c2, track: 0.24 });
    for (let i = 0; i < 8; i++) {
      const on = i < n;
      const mx = x + w - 8 - i * 13;
      g.fillStyle = on ? '#ffffff' : 'rgba(166,236,255,0.15)';
      g.fillRect(mx, y + 82, 5, 14);
      g.beginPath(); g.moveTo(mx, y + 82); g.lineTo(mx + 2.5, y + 77); g.lineTo(mx + 5, y + 82); g.fill();
    }
    // contramedidas
    const cm = ch?.cm || {};
    text(g, 'CONTRAMEDIDAS', x, y + 118, { size: 8.5, weight: 700, color: PAL.c2, track: 0.24 });
    text(g, `FLR ${cm.flare ?? '—'}   ·   CHF ${cm.chaff ?? '—'}`, x + w, y + 118, { size: 10.5, weight: 600, color: (cm.flare ?? 1) === 0 ? PAL.warn : '#fff', align: 'right', track: 0.12 });
  }

  // ═════════════════════════════════════════════════════════════════════
  drawAlerts(g, P, sh, ch, W, H, dt) {
    const inc = ch?.incoming;
    if (this.lockedBy > 0) this.lockedBy -= dt;
    const missiles = (ch?.contacts || []).filter((c) => c.missile);
    if (inc || missiles.length) {
      const near = (inc?.dist ?? 9e9) < 1200;
      const pulse = 0.5 + 0.5 * Math.sin(this.t * (near ? 18 : 9));
      // vinheta vermelha nas bordas
      const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.72);
      gr.addColorStop(0, 'rgba(255,40,30,0)'); gr.addColorStop(1, `rgba(255,40,30,${0.1 + pulse * (near ? 0.22 : 0.12)})`);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // direção de cada míssil
      for (const m of missiles) {
        _v.copy(m.dir).applyQuaternion(sh.quat);
        const pr = P.projectDir(_v, this.pr2, 90);
        g.fillStyle = PAL.bad; g.strokeStyle = PAL.bad; g.lineWidth = 2;
        glow(g, PAL.bad, 14);
        if (pr.on) { circle(g, pr.x, pr.y, 12); line(g, pr.x - 18, pr.y, pr.x + 18, pr.y); line(g, pr.x, pr.y - 18, pr.x, pr.y + 18); }
        else for (let k = 0; k < 3; k++) triangle(g, pr.ex - Math.cos(pr.ang) * k * 11, pr.ey - Math.sin(pr.ang) * k * 11, 7 - k, pr.ang, k === 0);
        noGlow(g);
        text(g, fmtDist(m.dist), pr.on ? pr.x : pr.ex - Math.cos(pr.ang) * 46, (pr.on ? pr.y + 30 : pr.ey - Math.sin(pr.ang) * 46) + 4, { size: 10.5, weight: 700, color: '#ffd0c8', align: 'center', track: 0.06 });
      }
      // caixa de alerta central
      const y = H * 0.15;
      const msg = near ? 'MÍSSIL — CONTRAMEDIDAS!' : 'MÍSSIL TRAVADO';
      const blink = (this.t * (near ? 6 : 3)) % 1 < 0.65;
      g.fillStyle = `rgba(60,6,4,${0.55})`; g.fillRect(W / 2 - 170, y - 22, 340, 50);
      g.strokeStyle = blink ? PAL.bad : 'rgba(255,90,72,0.35)'; g.lineWidth = 1.5; g.strokeRect(W / 2 - 170 + 0.5, y - 21.5, 339, 49);
      glow(g, PAL.bad, blink ? 16 : 0);
      text(g, msg, W / 2, y, { size: 15, weight: 700, color: blink ? '#ff6a58' : '#a43a30', align: 'center', track: 0.3 });
      noGlow(g);
      const kb = this.hud.comms?.keyLabel('countermeasure')?.txt || 'X';
      text(g, inc ? `${fmtDist(inc.dist)}  ·  ${String(inc.kind || '').toUpperCase()}  ·  [${kb}] FLARES/CHAFF` : '', W / 2, y + 18, { size: 9.5, weight: 600, color: '#ffc2b8', align: 'center', track: 0.16 });
    } else if (this.lockedBy > 0) {
      const y = H * 0.24;
      const blink = (this.t * 4) % 1 < 0.6;
      text(g, 'ALERTA DE TRAVA', W / 2, y, { size: 14, weight: 700, color: blink ? PAL.warn : 'rgba(255,182,77,0.35)', align: 'center', track: 0.34 });
    }
    // avisos de voo
    const warns = [];
    if (sh.overheat) warns.push('SUPERAQUECIMENTO');
    if ((sh.hull ?? 1) < 0.3) warns.push('CASCO CRÍTICO');
    if ((sh.reentry ?? 0) > 0.35) warns.push('REENTRADA · CALOR NO CASCO');
    if ((sh.stall ?? 0) > 0.5 && sh.inAtmo) warns.push('ESTOL');
    if (sh.body && sh.altitude < 120 && this.vs < -40 && !sh.landed) warns.push('PUXE PARA CIMA');
    const cmp = (this.ctx.services.space?.ionStormAt?.(this.ctx.player.camWorld) || 0);
    if (cmp > 0.2) warns.push('TEMPESTADE DE ÍONS · SENSORES');
    if (warns.length) {
      const blink = (this.t * 2.5) % 1 < 0.7;
      warns.slice(0, 2).forEach((w, i) => {
        text(g, w, W / 2, H * 0.68 + i * 22, { size: 12.5, weight: 700, color: blink ? PAL.warn : 'rgba(255,182,77,0.35)', align: 'center', track: 0.32 });
      });
    }
  }

  drawHits(g, P, W, H, dt) {
    for (const h of this.hits) h.t += dt;
    this.hits = this.hits.filter((h) => h.t < 0.6);
    for (const h of this.hits) {
      const k = 1 - h.t / 0.6;
      let ang = Math.PI / 2;
      if (h.pos) { const pr = P.project(h.pos, this.pr2, 0); ang = pr.ang; }
      const col = h.shield ? `rgba(120,210,255,${0.45 * k})` : `rgba(255,70,40,${0.55 * k})`;
      const cx = W / 2 + Math.cos(ang) * W * 0.45, cy = H / 2 + Math.sin(ang) * H * 0.45;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * (0.35 + h.amt * 0.2));
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  }
}
