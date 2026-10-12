// HUD a pé (visor do capacete): retícula por arma com abertura dinâmica,
// marcador de acerto, bússola com marcadores, sinais vitais do traje
// (integridade, O₂, temperatura, toxinas, energia), combustível do jetpack,
// munição/carregador/granadas, modo da multiferramenta e pulso do scanner.
//
// Dados: services.foot.hud?.() || services.foot.state || hud.setFoot(dados);
// sem o sistema `foot`, os perigos vêm do bioma do planeta (reserva).
import * as THREE from 'three/webgpu';
import { PAL } from './style.js';
import { TAU, clamp, lerp, smooth, text, glow, noGlow, diamond, circle, line, triangle, segArc, segBar, fadePlate, fmtDist, hexA } from './draw.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(), _n = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();

export const WEAPON_INFO = {
  rifle: { name: 'RIFLE DE PULSO', mag: 32, reserve: 160, cross: 'rifle' },
  shotgun: { name: 'ESCOPETA DE PLASMA', mag: 8, reserve: 40, cross: 'shotgun' },
  sniper: { name: 'SNIPER DE TRILHO', mag: 5, reserve: 25, cross: 'sniper' },
  pistol: { name: 'PISTOLA DE ÍONS', mag: 14, reserve: 70, cross: 'pistol' },
  multitool: { name: 'MULTIFERRAMENTA', mag: 0, reserve: 0, cross: 'tool' },
};
const TOOL_NAMES = { scanner: 'SCANNER', mining: 'LASER DE MINERAÇÃO', light: 'LANTERNA', hack: 'HACKEAR' };

export class FootHud {
  constructor(hud) {
    this.hud = hud; this.ctx = hud.ctx;
    this.t = 0;
    this.pushed = null;
    this.crosshair = { kind: null, spread: 0, hit: 0, kill: false };
    this.spread = 0;
    this.scan = { t: -1, items: [] };
    this.pr = {};
  }
  setData(d) { this.pushed = d ? { ...(this.pushed || {}), ...d } : null; }
  hitMarker(kill = false) { this.crosshair.hit = 1; this.crosshair.kill = kill; }
  pulse() { this.scan.t = 0; }

  data() {
    const ctx = this.ctx;
    const ft = ctx.services.foot;
    let d = null;
    try { d = ft?.hud?.() || ft?.state || null; } catch { d = null; }
    d = { ...(this.envFallback()), ...(d || {}), ...(this.pushed || {}) };
    return d;
  }

  /** Perigos ambientais a partir do bioma (reserva sem o sistema foot). */
  envFallback() {
    const ctx = this.ctx;
    const sys = ctx.universe.system;
    const cam = ctx.player.camWorld;
    const b = sys?.dominantBody?.(cam) || null;
    const out = { health: 1, o2: 0.86, energy: 0.92, jetpack: 1, temp: 21, tox: 0, rad: 0, weapon: 'rifle', ammo: 26, mag: 32, reserve: 128, grenades: 3, tool: 'scanner', body: b };
    if (!b) return out;
    const hz = b.hazard || {};
    const day = this.dayInfo(b, cam);
    out.temp = Math.round((hz.temp >= 0 ? 18 + hz.temp * 110 : 18 + hz.temp * 95) + (day.elev > 0 ? day.elev * 22 : -14));
    out.tox = clamp(hz.tox || 0, 0, 1);
    out.rad = clamp(hz.rad || 0, 0, 1);
    out.o2 = b.atmosphere && (b.type === 'lush' || b.type === 'ocean') ? 0.96 : 0.82;
    out.day = day;
    return out;
  }
  dayInfo(b, cam) {
    _up.copy(cam).sub(b.pos).normalize();
    const sun = _v.copy(this.ctx.universe.system.star.pos).sub(cam).normalize();
    const elev = Math.asin(clamp(_up.dot(sun), -1, 1));
    const axis = _n.set(Math.sin(b.axialTilt || 0), Math.cos(b.axialTilt || 0), 0);
    const u = _up.clone().addScaledVector(axis, -_up.dot(axis)).normalize();
    const s = sun.clone().addScaledVector(axis, -sun.dot(axis)).normalize();
    const H = Math.atan2(_e.crossVectors(u, s).dot(axis), u.dot(s));
    const hour = ((12 - H / TAU * 24) % 24 + 24) % 24;
    return { elev, hour };
  }

  // ═════════════════════════════════════════════════════════════════════
  draw(g, P, dt, W, H, markers) {
    this.t += dt;
    const d = this.data();
    this.drawCrosshair(g, W, H, d, dt);
    this.drawCompass(g, P, W, H, markers, d);
    this.drawVitals(g, W, H, d);
    this.drawWeapon(g, W, H, d);
    this.drawScan(g, P, W, H, dt, d);
    this.drawEnv(g, W, H, d);
  }

  drawCrosshair(g, W, H, d, dt) {
    const ch = this.crosshair;
    const kind = ch.kind || (d.aiming && d.weapon === 'sniper' ? 'scope' : WEAPON_INFO[d.weapon]?.cross) || 'rifle';
    if (kind === 'none') return;
    const target = clamp(d.spread ?? (d.moving ? 0.5 : 0.15) + (d.firing ? 0.4 : 0), 0, 1.5);
    this.spread = lerp(this.spread, target, Math.min(1, dt * 10));
    const cx = W / 2, cy = H / 2;
    const s = 9 + this.spread * 22;
    const C = 'rgba(236,250,255,0.92)';
    g.strokeStyle = C; g.fillStyle = C; g.lineWidth = 1.6;
    glow(g, 'rgba(0,0,0,0.9)', 3);
    if (kind === 'rifle' || kind === 'pistol') {
      const L = kind === 'pistol' ? 6 : 9;
      g.beginPath();
      g.moveTo(cx - s - L, cy); g.lineTo(cx - s, cy); g.moveTo(cx + s, cy); g.lineTo(cx + s + L, cy);
      g.moveTo(cx, cy + s); g.lineTo(cx, cy + s + L);
      if (kind === 'pistol') { g.moveTo(cx, cy - s); g.lineTo(cx, cy - s - L); }
      g.stroke();
      circle(g, cx, cy, 1.3, true);
    } else if (kind === 'shotgun') {
      const r = 18 + this.spread * 26;
      for (let k = 0; k < 4; k++) { const a = k * TAU / 4 + TAU / 8; g.beginPath(); g.arc(cx, cy, r, a - 0.32, a + 0.32); g.stroke(); }
      circle(g, cx, cy, 1.6, true);
    } else if (kind === 'sniper') {
      g.beginPath(); g.moveTo(cx - 22, cy); g.lineTo(cx - 6, cy); g.moveTo(cx + 6, cy); g.lineTo(cx + 22, cy); g.moveTo(cx, cy + 6); g.lineTo(cx, cy + 30); g.stroke();
      for (let k = 1; k <= 3; k++) line(g, cx - 4, cy + 6 + k * 7, cx + 4, cy + 6 + k * 7);
      circle(g, cx, cy, 1.2, true);
    } else if (kind === 'scope') {
      noGlow(g);
      const R = Math.min(W, H) * 0.42;
      g.fillStyle = 'rgba(0,0,0,0.92)';
      g.beginPath(); g.rect(0, 0, W, H); g.arc(cx, cy, R, 0, TAU, true); g.fill('evenodd');
      g.strokeStyle = 'rgba(10,20,26,0.9)'; g.lineWidth = 2;
      line(g, cx - R, cy, cx - 8, cy); line(g, cx + 8, cy, cx + R, cy); line(g, cx, cy + 8, cx, cy + R);
      g.strokeStyle = PAL.bad; g.lineWidth = 1.2; circle(g, cx, cy, 3);
      text(g, `${fmtDist(d.range ?? 0)}`, cx + 40, cy + 30, { size: 11, weight: 600, color: PAL.bad, track: 0.1 });
    } else if (kind === 'tool' || kind === 'scanner' || kind === 'mining') {
      g.lineWidth = 1.4;
      g.beginPath(); g.arc(cx, cy, 14, -0.6, 0.6); g.stroke(); g.beginPath(); g.arc(cx, cy, 14, Math.PI - 0.6, Math.PI + 0.6); g.stroke();
      circle(g, cx, cy, 2, true);
      if (kind === 'mining' && d.mining) {
        segArc(g, cx, cy, 22, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(d.mining, 0, 1), 1, { n: 1, w: 2.5, on: PAL.warn });
      }
    }
    noGlow(g);
    // marcador de acerto
    if (ch.hit > 0) {
      const k = ch.hit;
      g.strokeStyle = ch.kill ? `rgba(255,90,72,${k})` : `rgba(255,255,255,${k})`; g.lineWidth = 2;
      const a = 7 + (1 - k) * 6, b = a + 7;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) line(g, cx + sx * a, cy + sy * a, cx + sx * b, cy + sy * b);
      ch.hit = Math.max(0, ch.hit - dt * 3.2);
    }
    // jetpack (arco à direita da retícula)
    const jp = d.jetpack ?? 1;
    if (jp < 0.995 || d.jetting) {
      segArc(g, cx, cy, 46, Math.PI * 0.2, -Math.PI * 0.2, jp, { n: 14, w: 3, on: jp < 0.25 ? PAL.warn : PAL.c, glowOn: d.jetting ? 8 : 0 });
      text(g, 'JET', cx + 52, cy + 26, { size: 8, weight: 700, color: PAL.c2, track: 0.24 });
    }
  }

  drawCompass(g, P, W, H, markers, d) {
    const ctx = this.ctx;
    const b = d.body;
    const cx = W / 2, y = 34, half = Math.min(300, W * 0.24);
    const cam = ctx.player.camWorld;
    _f.set(0, 0, -1).applyQuaternion(P.q);
    let up = null;
    if (b) up = _up.copy(cam).sub(b.pos).normalize(); else up = _up.set(0, 1, 0).applyQuaternion(P.q);
    const axis = b ? _n.set(Math.sin(b.axialTilt || 0), Math.cos(b.axialTilt || 0), 0) : _n.set(0, 0, -1);
    const north = axis.clone().addScaledVector(up, -axis.dot(up)).normalize();
    const east = _e.crossVectors(north, up);
    const hdg = Math.atan2(_f.dot(east), _f.dot(north));
    const hd = (hdg * 180 / Math.PI + 360) % 360;
    const ppd = half / 75;
    // fundo
    const gr = g.createLinearGradient(cx - half, 0, cx + half, 0);
    gr.addColorStop(0, 'rgba(5,12,21,0)'); gr.addColorStop(0.2, 'rgba(5,12,21,0.42)'); gr.addColorStop(0.8, 'rgba(5,12,21,0.42)'); gr.addColorStop(1, 'rgba(5,12,21,0)');
    g.fillStyle = gr; g.fillRect(cx - half, y - 16, half * 2, 30);
    g.strokeStyle = 'rgba(166,236,255,0.55)'; g.lineWidth = 1;
    const CARD = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' };
    for (let k = -80; k <= 80; k += 5) {
      const val = Math.round(hd / 5) * 5 + k;
      const x = cx + (val - hd) * ppd;
      if (Math.abs(x - cx) > half) continue;
      const a = 1 - smooth(half * 0.6, half, Math.abs(x - cx));
      g.globalAlpha = a;
      const v = ((val % 360) + 360) % 360;
      const c = CARD[v];
      line(g, x, y + 4, x, y + (c ? 12 : v % 15 === 0 ? 9 : 7));
      if (c) text(g, c, x, y - 2, { size: c.length === 1 ? 12 : 9.5, weight: 700, color: c === 'N' ? PAL.warn : '#fff', align: 'center', track: 0.06 });
      else if (v % 15 === 0) text(g, String(v), x, y - 3, { size: 8.5, weight: 500, color: PAL.c2, align: 'center' });
    }
    g.globalAlpha = 1;
    g.fillStyle = '#fff'; triangle(g, cx, y + 18, 4, -Math.PI / 2, true);
    // marcadores na bússola
    const list = markers ? markers.list('foot') : [];
    for (const m of list) {
      m.getPos(_v);
      const dir = _v.sub(cam);
      const dist = dir.length();
      dir.divideScalar(dist || 1);
      const bh = Math.atan2(dir.dot(east), dir.dot(north));
      let da = (bh - hdg) * 180 / Math.PI;
      da = ((da + 540) % 360) - 180;
      const x = cx + clamp(da, -75, 75) * ppd;
      const col = m.kind === 'objective' ? PAL.obj : m.color || (m.kind === 'ship' ? PAL.c : m.kind === 'hostile' ? PAL.bad : PAL.c);
      g.fillStyle = col; g.strokeStyle = col; g.lineWidth = 1.5;
      glow(g, col, 8);
      if (m.kind === 'objective') diamond(g, x, y + 26, 5, true);
      else if (m.kind === 'ship') { triangle(g, x, y + 26, 6, -Math.PI / 2, false); }
      else diamond(g, x, y + 26, 4, false);
      noGlow(g);
      if (Math.abs(da) < 75) text(g, fmtDist(dist), x, y + 44, { size: 9, weight: 600, color: hexA(col.startsWith('#') ? col : '#a6ecff', 0.85), align: 'center', track: 0.04 });
    }
  }

  drawVitals(g, W, H, d) {
    const x = 30, y = H - 34;
    fadePlate(g, x - 12, y - 118, 330, 136, 1, 0.42);
    g.fillStyle = PAL.c; g.fillRect(x - 12, y - 118, 30, 2);
    text(g, 'TRAJE EVA', x, y - 102, { size: 9.5, weight: 700, color: PAL.c, track: 0.34 });
    const hp = clamp(d.health ?? 1, 0, 1);
    text(g, `${Math.round(hp * 100)}`, x + 268, y - 98, { size: 22, weight: 300, color: hp < 0.3 ? PAL.bad : '#fff', align: 'right', display: true });
    text(g, '%', x + 280, y - 98, { size: 9, weight: 700, color: PAL.c2 });
    segBar(g, x, y - 86, 280, 6, hp, { n: 28, gap: 2, on: hp < 0.3 ? PAL.bad : '#eaf8ff', glowOn: 4 });
    // gauges
    const temp = d.temp ?? 21;
    const tempK = clamp(Math.abs(temp - 21) / 90, 0, 1);
    const items = [
      { lab: 'O₂', v: d.o2 ?? 1, txt: `${Math.round((d.o2 ?? 1) * 100)}%`, col: (d.o2 ?? 1) < 0.25 ? PAL.bad : PAL.c },
      { lab: 'TEMP', v: 1 - tempK, txt: `${temp > 0 ? '+' : ''}${temp}°`, col: tempK > 0.6 ? PAL.bad : tempK > 0.35 ? PAL.warn : PAL.c, warm: temp > 21 },
      { lab: 'TOX', v: 1 - (d.tox ?? 0), txt: `${Math.round((d.tox ?? 0) * 100)}%`, col: (d.tox ?? 0) > 0.6 ? PAL.bad : (d.tox ?? 0) > 0.25 ? '#c6f05a' : PAL.c },
      { lab: 'ENERGIA', v: d.energy ?? 1, txt: `${Math.round((d.energy ?? 1) * 100)}%`, col: (d.energy ?? 1) < 0.2 ? PAL.warn : PAL.c },
    ];
    items.forEach((it, i) => {
      const gx = x + 30 + i * 72, gy = y - 34;
      g.lineWidth = 1; g.strokeStyle = 'rgba(166,236,255,0.18)'; circle(g, gx, gy, 27);
      segArc(g, gx, gy, 22, Math.PI * 0.75, Math.PI * 2.25, it.v, { n: 18, w: 4, on: it.col, glowOn: 5 });
      text(g, it.txt, gx, gy + 4, { size: 11.5, weight: 600, color: '#fff', align: 'center' });
      text(g, it.lab, gx, gy + 40, { size: 8.5, weight: 700, color: it.col === PAL.c ? PAL.c2 : it.col, align: 'center', track: 0.22 });
    });
  }

  drawWeapon(g, W, H, d) {
    const x = W - 30, y = H - 34;
    fadePlate(g, x - 300, y - 118, 312, 136, -1, 0.42);
    g.fillStyle = PAL.c; g.fillRect(x - 18, y - 118, 30, 2);
    const wi = WEAPON_INFO[d.weapon] || WEAPON_INFO.rifle;
    text(g, (d.weaponName || wi.name).toUpperCase(), x, y - 102, { size: 9.5, weight: 700, color: PAL.c, align: 'right', track: 0.34 });
    if (d.weapon !== 'multitool') {
      const mag = d.mag ?? wi.mag, ammo = d.ammo ?? mag, res = d.reserve ?? wi.reserve;
      const low = ammo / Math.max(1, mag) < 0.25;
      text(g, String(ammo), x - 66, y - 46, { size: 46, weight: 200, color: low ? PAL.warn : '#ffffff', align: 'right', display: true });
      text(g, `/ ${res}`, x, y - 50, { size: 15, weight: 300, color: PAL.c2, align: 'right', display: true });
      // pentes (balas) do carregador
      const n = Math.min(mag, 40);
      const bw = Math.max(2, Math.min(5, 200 / n - 2));
      for (let i = 0; i < n; i++) {
        const on = i < Math.round(ammo / mag * n);
        g.fillStyle = on ? (low ? PAL.warn : '#eaf8ff') : 'rgba(166,236,255,0.13)';
        g.fillRect(x - (i + 1) * (bw + 2), y - 34, bw, 10);
      }
      if (d.reloading) {
        segBar(g, x - 200, y - 18, 200, 2, d.reloading, { n: 30, gap: 1, on: PAL.warn });
        text(g, 'RECARREGANDO', x - 200, y - 22, { size: 8.5, weight: 700, color: PAL.warn, track: 0.24 });
      } else if (low) text(g, `[${this.hud.comms?.keyLabel('reload')?.txt || 'R'}] RECARREGAR`, x - 200, y - 22, { size: 8.5, weight: 700, color: PAL.warn, track: 0.24 });
    }
    // granadas e ferramenta
    const gr = d.grenades ?? 0;
    for (let i = 0; i < 4; i++) {
      g.strokeStyle = i < gr ? '#ffffff' : 'rgba(166,236,255,0.2)'; g.lineWidth = 1.4;
      circle(g, x - 6 - i * 16, y + 2, 5);
      if (i < gr) { g.fillStyle = 'rgba(255,255,255,0.25)'; circle(g, x - 6 - i * 16, y + 2, 5, true); }
    }
    const tool = TOOL_NAMES[d.tool] || 'SCANNER';
    text(g, `FERRAMENTA · ${tool}`, x - 72, y + 6, { size: 9, weight: 700, color: PAL.c2, align: 'right', track: 0.22 });
  }

  drawScan(g, P, W, H, dt, d) {
    const sc = this.scan;
    if (d.scanning && sc.t < 0) sc.t = 0;
    if (sc.t < 0) return;
    sc.t += dt;
    const k = sc.t / 2.2;
    if (k > 1) { sc.t = -1; return; }
    const cx = W / 2, cy = H / 2;
    const R = Math.max(W, H) * 0.75 * smooth(0, 1, k);
    g.strokeStyle = `rgba(114,240,168,${0.55 * (1 - k)})`; g.lineWidth = 2;
    glow(g, PAL.ok, 16);
    g.beginPath(); g.ellipse(cx, cy + H * 0.12, R, R * 0.28, 0, 0, TAU); g.stroke();
    noGlow(g);
    g.globalAlpha = 1 - k;
    text(g, 'VARREDURA DO SCANNER', cx, cy - 70, { size: 11, weight: 700, color: PAL.ok, align: 'center', track: 0.42 });
    g.globalAlpha = 1;
  }

  drawEnv(g, W, H, d) {
    const b = d.body;
    if (!b) return;
    const x = W - 30, y = 28;
    const biome = this.ctx.universe.BIOMES[b.type]?.name || '';
    text(g, `${b.name.toUpperCase()}`, x, y + 12, { size: 13, weight: 300, color: '#fff', align: 'right', display: true, track: 0.22 });
    const hr = d.day?.hour ?? 12;
    const hh = Math.floor(hr), mm = Math.floor((hr - hh) * 60);
    text(g, `${biome.toUpperCase()}  ·  ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} LOCAL`, x, y + 28, { size: 9, weight: 600, color: PAL.c2, align: 'right', track: 0.24 });
    // alertas de perigo
    const warns = [];
    const temp = d.temp ?? 21;
    if (temp < -20) warns.push(['FRIO EXTREMO', `${temp} °C`]);
    else if (temp > 60) warns.push(['CALOR EXTREMO', `+${temp} °C`]);
    if ((d.tox ?? 0) > 0.4) warns.push(['ATMOSFERA TÓXICA', 'PROTEÇÃO ATIVA']);
    if ((d.rad ?? 0) > 0.4) warns.push(['RADIAÇÃO', `${Math.round(d.rad * 100)} mSv`]);
    if ((d.o2 ?? 1) < 0.2) warns.push(['OXIGÊNIO BAIXO', `${Math.round(d.o2 * 100)}%`]);
    warns.slice(0, 2).forEach(([a, bb], i) => {
      const yy = y + 56 + i * 34;
      const blink = (this.t * 2) % 1 < 0.75;
      g.fillStyle = 'rgba(40,20,4,0.5)'; g.fillRect(x - 196, yy - 14, 196, 28);
      g.fillStyle = blink ? PAL.warn : 'rgba(255,182,77,0.4)'; g.fillRect(x - 2, yy - 14, 2, 28);
      text(g, a, x - 12, yy + 1, { size: 10, weight: 700, color: PAL.warn, align: 'right', track: 0.26 });
      text(g, bb, x - 12, yy + 12, { size: 8.5, weight: 600, color: 'rgba(255,214,160,0.7)', align: 'right', track: 0.14 });
    });
  }
}
