// Telas do cockpit desenhadas em canvas 2D (viram CanvasTexture): radar 3D,
// escudos/energia, alvo (wireframe girando), mapa do sistema e o HUD
// holográfico projetado no vidro. Estilo: linhas finas com brilho, ciano
// frio para informação, âmbar para avisos, vermelho para hostis.
const COL = {
  ink: '#8fe8ff', dim: 'rgba(120,210,255,0.35)', faint: 'rgba(120,210,255,0.14)', amber: '#ffb347', red: '#ff4a3a',
  green: '#6dff9a', gold: '#ffd27a', white: '#e8fbff', blue: '#7fb8ff', bg0: '#020a10', bg1: '#06141d',
};
const REL = { hostile: COL.red, friendly: COL.green, neutral: COL.gold, unknown: COL.white, vigil: COL.blue };
const FONT = (px, w = 600) => `${w} ${px}px "DejaVu Sans Mono", "Menlo", "Consolas", monospace`;

function glow(g, color, blur = 8) { g.shadowColor = color; g.shadowBlur = blur; }
function noGlow(g) { g.shadowBlur = 0; }

function frame(g, W, H, title, sub) {
  const gr = g.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.75);
  gr.addColorStop(0, COL.bg1); gr.addColorStop(1, COL.bg0);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // grade fina
  g.strokeStyle = 'rgba(80,170,220,0.06)'; g.lineWidth = 1;
  for (let i = 0; i <= W; i += W / 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); }
  for (let i = 0; i <= H; i += H / 16) { g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
  // cantos
  g.strokeStyle = COL.dim; g.lineWidth = 3;
  const c = W * 0.06, m = W * 0.025;
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    g.beginPath(); g.moveTo(x, y + sy * c); g.lineTo(x, y); g.lineTo(x + sx * c, y); g.stroke();
  }
  // rótulos dos botões laterais (OSB)
  g.font = FONT(W * 0.032, 500); g.fillStyle = COL.dim; g.textAlign = 'center';
  const lab = ['RDR', 'ESC', 'ALV', 'MAP', 'COM'];
  for (let i = 0; i < 5; i++) g.fillText(lab[i], W * (0.18 + i * 0.16), H - W * 0.035);
  // título
  glow(g, COL.ink, 6);
  g.font = FONT(W * 0.045); g.fillStyle = COL.ink; g.textAlign = 'left';
  g.fillText(title, W * 0.06, W * 0.085);
  g.textAlign = 'right'; g.fillStyle = COL.dim; g.font = FONT(W * 0.034, 500);
  if (sub) g.fillText(sub, W * 0.94, W * 0.085);
  noGlow(g);
}

function bar(g, x, y, w, h, v, color, segs = 10) {
  g.strokeStyle = COL.faint; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  const n = Math.round(v * segs);
  glow(g, color, 6); g.fillStyle = color;
  for (let i = 0; i < segs; i++) {
    if (i >= n) { g.fillStyle = 'rgba(120,210,255,0.08)'; noGlow(g); }
    if (w > h) g.fillRect(x + 2 + i * (w - 4) / segs, y + 2, (w - 4) / segs - 2, h - 4);
    else g.fillRect(x + 2, y + h - 2 - (i + 1) * (h - 4) / segs, w - 4, (h - 4) / segs - 2);
  }
  noGlow(g);
}

/** Radar 3D: plano em perspectiva, contatos com hastes de altura, varredura. */
export function drawRadar(g, W, H, d, t) {
  frame(g, W, H, 'RADAR 3D', `${(d.radarRange / 1000).toFixed(0)} KM`);
  const cx = W / 2, cy = H * 0.56, rx = W * 0.4, ry = H * 0.2;
  g.lineWidth = 2;
  for (let k = 1; k <= 3; k++) {
    g.strokeStyle = k === 3 ? COL.dim : COL.faint;
    g.beginPath(); g.ellipse(cx, cy, rx * k / 3, ry * k / 3, 0, 0, Math.PI * 2); g.stroke();
  }
  g.strokeStyle = COL.faint;
  for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(an) * rx, cy + Math.sin(an) * ry); g.stroke(); }
  // cone de visão à frente
  g.fillStyle = 'rgba(120,210,255,0.06)';
  g.beginPath(); g.moveTo(cx, cy); g.ellipse(cx, cy, rx, ry, 0, -Math.PI / 2 - 0.6, -Math.PI / 2 + 0.6); g.closePath(); g.fill();
  // varredura
  const sw = (t * 1.6) % (Math.PI * 2);
  for (let i = 0; i < 18; i++) {
    const a = sw - i * 0.035;
    g.strokeStyle = `rgba(140,230,255,${0.35 * (1 - i / 18)})`;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); g.stroke();
  }
  // nave do jogador
  glow(g, COL.white, 8); g.fillStyle = COL.white;
  g.beginPath(); g.moveTo(cx, cy - 10); g.lineTo(cx + 7, cy + 7); g.lineTo(cx, cy + 3); g.lineTo(cx - 7, cy + 7); g.closePath(); g.fill(); noGlow(g);
  // contatos
  const R = d.radarRange;
  const list = (d.contacts || []).slice().sort((a, b) => (b.dir?.z ?? 0) - (a.dir?.z ?? 0));
  for (const c of list) {
    const dist = Math.min(c.dist ?? R, R * 1.05);
    const dx = c.dir.x, dy = c.dir.y, dz = c.dir.z;
    const hl = Math.hypot(dx, dz) || 1;
    const k = dist / R;
    const px = cx + (dx / hl) * k * rx * Math.min(1, hl * 1.2 + 0.3);
    const pz = cy + (dz / hl) * k * ry * Math.min(1, hl * 1.2 + 0.3);
    const py = pz - dy * k * H * 0.32;
    const col = REL[c.rel] || COL.white;
    g.strokeStyle = col; g.globalAlpha = 0.55; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(px, pz); g.lineTo(px, py); g.stroke();
    g.beginPath(); g.ellipse(px, pz, 4, 2, 0, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 1;
    glow(g, col, 10); g.fillStyle = col;
    if (c.capital) g.fillRect(px - 7, py - 4, 14, 8);
    else { g.beginPath(); g.arc(px, py, c.selected ? 6 : 4.5, 0, Math.PI * 2); g.fill(); }
    if (c.selected) {
      g.strokeStyle = COL.amber; g.lineWidth = 2; glow(g, COL.amber, 8);
      const s = 13 + Math.sin(t * 8) * 2;
      g.strokeRect(px - s, py - s, s * 2, s * 2);
    }
    noGlow(g);
  }
  g.font = FONT(W * 0.034, 500); g.textAlign = 'left'; g.fillStyle = COL.dim;
  const hostiles = list.filter((c) => c.rel === 'hostile').length;
  g.fillText(`CONTATOS ${String(list.length).padStart(2, '0')}`, W * 0.06, H * 0.86);
  g.fillStyle = hostiles ? COL.red : COL.dim;
  g.textAlign = 'right'; g.fillText(`HOSTIS ${String(hostiles).padStart(2, '0')}`, W * 0.94, H * 0.86);
}

/** Silhueta (vista de cima) do caça. */
function shipOutline(g, cx, cy, s) {
  const pts = [[0, -1], [0.12, -0.7], [0.18, -0.25], [0.85, 0.35], [0.88, 0.62], [0.2, 0.6], [0.22, 0.85], [0.1, 0.92], [-0.1, 0.92], [-0.22, 0.85], [-0.2, 0.6], [-0.88, 0.62], [-0.85, 0.35], [-0.18, -0.25], [-0.12, -0.7]];
  g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(cx + x * s, cy + y * s) : g.moveTo(cx + x * s, cy + y * s))); g.closePath();
}

/** Escudos e energia (distribuição escudo/motor/armas, casco, calor). */
export function drawStatus(g, W, H, d, t) {
  frame(g, W, H, 'ESCUDOS · ENERGIA', d.shieldMode || 'EQUILIBRADO');
  const cx = W * 0.36, cy = H * 0.47, s = W * 0.2;
  // arcos de escudo
  const sh = d.shields;
  const arcs = [['f', -Math.PI / 2], ['r', 0], ['b', Math.PI / 2], ['l', Math.PI]];
  for (const [k, a] of arcs) {
    const v = sh[k] ?? 1;
    const col = v > 0.5 ? COL.ink : v > 0.2 ? COL.amber : COL.red;
    const hit = d.shieldHit === k ? 1 : 0;
    g.lineWidth = 7 + hit * 3; g.strokeStyle = col; glow(g, col, 10 + v * 10);
    g.globalAlpha = 0.25 + v * 0.75;
    g.beginPath(); g.arc(cx, cy, s * 1.32, a - 0.62, a + 0.62); g.stroke();
    g.globalAlpha = 1; noGlow(g);
  }
  g.lineWidth = 1; g.strokeStyle = COL.faint; g.beginPath(); g.arc(cx, cy, s * 1.15, 0, Math.PI * 2); g.stroke();
  // silhueta + dano do casco
  shipOutline(g, cx, cy, s * 0.95);
  const hull = d.hull ?? 1;
  g.fillStyle = hull > 0.6 ? 'rgba(120,210,255,0.16)' : hull > 0.3 ? 'rgba(255,180,70,0.22)' : 'rgba(255,74,58,0.3)';
  g.fill(); g.lineWidth = 2; g.strokeStyle = COL.ink; glow(g, COL.ink, 6); g.stroke(); noGlow(g);
  g.font = FONT(W * 0.05); g.fillStyle = COL.white; g.textAlign = 'center';
  g.fillText(`${Math.round(hull * 100)}%`, cx, cy + s * 0.28);
  g.font = FONT(W * 0.03, 500); g.fillStyle = COL.dim; g.fillText('CASCO', cx, cy + s * 0.5);
  // pips de energia
  const E = d.energy;
  const cols = [['ESC', E.shield, COL.blue], ['MOT', E.engine, COL.green], ['ARM', E.weapons, COL.amber]];
  cols.forEach(([lab, v, col], i) => {
    const x = W * 0.7 + i * W * 0.085, y = H * 0.2;
    bar(g, x, y, W * 0.06, H * 0.5, v, col, 8);
    g.font = FONT(W * 0.03); g.fillStyle = col; g.textAlign = 'center'; g.fillText(lab, x + W * 0.03, y + H * 0.56);
  });
  // calor das armas e combustível quântico
  g.textAlign = 'left'; g.font = FONT(W * 0.032, 500); g.fillStyle = COL.dim;
  g.fillText('CALOR', W * 0.06, H * 0.82);
  bar(g, W * 0.2, H * 0.79, W * 0.36, H * 0.04, d.heat ?? 0, (d.heat ?? 0) > 0.75 ? COL.red : COL.amber, 12);
  g.fillText('QUANT', W * 0.06, H * 0.88);
  bar(g, W * 0.2, H * 0.85, W * 0.36, H * 0.04, d.fuel ?? 1, COL.ink, 12);
}

// wireframe genérico de caça para a tela de alvo
const WF = (() => {
  const v = [[0, 0, -1], [0.14, 0.08, -0.5], [-0.14, 0.08, -0.5], [0.14, -0.08, -0.5], [-0.14, -0.08, -0.5], [0.22, 0.1, 0.5], [-0.22, 0.1, 0.5], [0.22, -0.1, 0.5], [-0.22, -0.1, 0.5], [0.9, -0.02, 0.35], [-0.9, -0.02, 0.35], [0.9, -0.02, 0.6], [-0.9, -0.02, 0.6], [0.2, 0.5, 0.6], [-0.2, 0.5, 0.6], [0.15, 0, 0.75], [-0.15, 0, 0.75], [0, 0.12, -0.3]];
  const e = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [3, 4], [1, 3], [2, 4], [1, 5], [2, 6], [3, 7], [4, 8], [5, 6], [7, 8], [5, 7], [6, 8], [5, 9], [7, 9], [9, 11], [11, 5], [6, 10], [8, 10], [10, 12], [12, 6], [5, 13], [13, 15], [6, 14], [14, 16], [5, 15], [6, 16], [1, 17], [2, 17]];
  return { v, e };
})();

/** Alvo: wireframe girando, identificação, distância, barras. */
export function drawTarget(g, W, H, d, t) {
  const T = d.target;
  frame(g, W, H, 'ALVO', T ? (T.locked ? 'TRAVADO' : 'RASTREANDO') : 'SEM ALVO');
  const cx = W / 2, cy = H * 0.42, s = W * 0.28;
  if (!T) {
    g.font = FONT(W * 0.045); g.fillStyle = COL.dim; g.textAlign = 'center';
    g.fillText('— NENHUM ALVO —', cx, cy);
    return;
  }
  const col = REL[T.rel] || COL.white;
  const yaw = t * 0.6, pitch = 0.45;
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const P = WF.v.map(([x, y, z]) => {
    const x1 = x * cyw - z * syw, z1 = x * syw + z * cyw;
    const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
    const f = 2.6 / (2.6 + z2);
    return [cx + x1 * s * f, cy - y2 * s * f];
  });
  g.lineWidth = 1.6; g.strokeStyle = col; glow(g, col, 8);
  g.beginPath(); for (const [a, b] of WF.e) { g.moveTo(...P[a]); g.lineTo(...P[b]); } g.stroke(); noGlow(g);
  // retícula de mira
  g.strokeStyle = COL.faint; g.lineWidth = 1;
  g.beginPath(); g.arc(cx, cy, s * 1.05, 0, Math.PI * 2); g.stroke();
  g.font = FONT(W * 0.04); g.textAlign = 'left'; g.fillStyle = col; glow(g, col, 6);
  g.fillText(T.name || 'DESCONHECIDO', W * 0.06, H * 0.7); noGlow(g);
  g.font = FONT(W * 0.03, 500); g.fillStyle = COL.dim;
  g.fillText((T.faction || '').toUpperCase(), W * 0.06, H * 0.75);
  g.textAlign = 'right'; g.fillStyle = COL.ink; g.font = FONT(W * 0.04);
  g.fillText(`${T.dist >= 1000 ? (T.dist / 1000).toFixed(2) + ' KM' : Math.round(T.dist) + ' M'}`, W * 0.94, H * 0.7);
  g.font = FONT(W * 0.03, 500); g.fillStyle = COL.dim; g.fillText(`${Math.round(T.speed || 0)} M/S`, W * 0.94, H * 0.75);
  g.textAlign = 'left'; g.fillText('ESC', W * 0.06, H * 0.83); g.fillText('CAS', W * 0.06, H * 0.89);
  bar(g, W * 0.16, H * 0.8, W * 0.78, H * 0.035, T.shield ?? 0, COL.blue, 16);
  bar(g, W * 0.16, H * 0.86, W * 0.78, H * 0.035, T.hull ?? 1, (T.hull ?? 1) > 0.3 ? COL.ink : COL.red, 16);
}

/** Mapa do sistema: órbitas, corpos, posição e rota. */
export function drawMap(g, W, H, d, t) {
  frame(g, W, H, 'MAPA', (d.systemName || '').toUpperCase());
  const bodies = d.map?.bodies || [];
  const cx = W / 2, cy = H * 0.52;
  let maxR = 1;
  for (const b of bodies) maxR = Math.max(maxR, Math.hypot(b.x, b.z));
  const k = (W * 0.4) / maxR;
  const tilt = 0.55;
  g.lineWidth = 1;
  for (const b of bodies) {
    if (b.parent) continue;
    const r = Math.hypot(b.x, b.z) * k;
    g.strokeStyle = b.highlight ? COL.dim : COL.faint;
    g.beginPath(); g.ellipse(cx, cy, r, r * tilt, 0, 0, Math.PI * 2); g.stroke();
  }
  // estrela
  const sg = g.createRadialGradient(cx, cy, 0, cx, cy, 18);
  sg.addColorStop(0, '#fff6d8'); sg.addColorStop(0.4, 'rgba(255,210,120,0.8)'); sg.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, 18, 0, Math.PI * 2); g.fill();
  g.font = FONT(W * 0.028, 500); g.textAlign = 'left';
  for (const b of bodies) {
    const x = cx + b.x * k, y = cy + b.z * k * tilt;
    const col = b.kind === 'station' ? COL.green : b.highlight ? COL.amber : COL.ink;
    glow(g, col, 6); g.fillStyle = col;
    if (b.kind === 'station') g.fillRect(x - 3, y - 3, 6, 6);
    else { g.beginPath(); g.arc(x, y, b.kind === 'gas_giant' ? 6 : b.kind === 'moon' ? 2.5 : 4, 0, Math.PI * 2); g.fill(); }
    noGlow(g);
    if (!b.parent || b.highlight) { g.fillStyle = b.highlight ? COL.amber : COL.dim; g.fillText(b.name.toUpperCase(), x + 8, y - 6); }
  }
  // jogador
  if (d.map?.player) {
    const p = d.map.player;
    const x = cx + p.x * k, y = cy + p.z * k * tilt;
    glow(g, COL.white, 10); g.strokeStyle = COL.white; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, 7 + Math.sin(t * 5) * 2, 0, Math.PI * 2); g.stroke(); noGlow(g);
    if (d.map.dest) {
      const q = d.map.dest;
      g.setLineDash([6, 6]); g.strokeStyle = COL.amber; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(cx + q.x * k, cy + q.z * k * tilt); g.stroke(); g.setLineDash([]);
    }
  }
  g.font = FONT(W * 0.03, 500); g.fillStyle = COL.dim; g.textAlign = 'left';
  g.fillText(d.location || '', W * 0.06, H * 0.88);
}

/**
 * HUD holográfico (plano diante do piloto). proj(dirLocal) → [u,v] em 0..1
 * no plano ou null. Desenha retícula, vetor de voo, escada de arfagem,
 * fita de rumo, velocidade/altitude, energia, alvo + indicador de antecipação.
 */
export function drawHud(g, W, H, d, t, proj) {
  g.clearRect(0, 0, W, H);
  const C = d.hudColor || 'rgba(140,240,255,0.95)';
  const Cd = 'rgba(140,240,255,0.45)';
  g.lineWidth = 2.2; g.strokeStyle = C; g.fillStyle = C;
  glow(g, C, 10);
  const cx = W / 2, cy = H * 0.5;
  // retícula de canhão
  g.beginPath();
  g.moveTo(cx - 26, cy); g.lineTo(cx - 9, cy); g.moveTo(cx + 9, cy); g.lineTo(cx + 26, cy);
  g.moveTo(cx, cy - 26); g.lineTo(cx, cy - 9); g.moveTo(cx, cy + 9); g.lineTo(cx, cy + 26);
  g.stroke();
  g.beginPath(); g.arc(cx, cy, 2.5, 0, Math.PI * 2); g.fill();
  // arco de calor em volta da retícula
  const heat = d.heat ?? 0;
  g.lineWidth = 4; g.strokeStyle = 'rgba(140,240,255,0.18)';
  g.beginPath(); g.arc(cx, cy, 48, Math.PI * 0.62, Math.PI * 1.38); g.stroke();
  g.strokeStyle = heat > 0.75 ? '#ff5a40' : '#ffb347';
  g.beginPath(); g.arc(cx, cy, 48, Math.PI * 1.38 - heat * Math.PI * 0.76, Math.PI * 1.38); g.stroke();
  g.strokeStyle = 'rgba(140,240,255,0.18)';
  g.beginPath(); g.arc(cx, cy, 48, -Math.PI * 0.38, Math.PI * 0.38); g.stroke();
  g.strokeStyle = C; const sh = ((d.shields?.f ?? 1) + (d.shields?.b ?? 1) + (d.shields?.l ?? 1) + (d.shields?.r ?? 1)) / 4;
  g.beginPath(); g.arc(cx, cy, 48, Math.PI * 0.38 - sh * Math.PI * 0.76, Math.PI * 0.38); g.stroke();
  g.lineWidth = 2.2;
  // escada de arfagem (em torno da retícula, gira com a rolagem)
  const pitch = d.pitch ?? 0, roll = d.roll ?? 0;
  g.save(); g.translate(cx, cy); g.rotate(-roll);
  g.font = FONT(15, 600); g.textAlign = 'right';
  for (let deg = -30; deg <= 30; deg += 10) {
    const y = (pitch * 180 / Math.PI - deg) * 7;
    if (Math.abs(y) > H * 0.36 || deg === 0) continue;
    g.strokeStyle = Cd; g.setLineDash(deg < 0 ? [8, 6] : []);
    g.beginPath(); g.moveTo(-170, y); g.lineTo(-90, y); g.lineTo(-90, y + (deg > 0 ? 10 : -10)); g.moveTo(170, y); g.lineTo(90, y); g.lineTo(90, y + (deg > 0 ? 10 : -10)); g.stroke();
    g.setLineDash([]); g.fillStyle = Cd; g.fillText(String(deg), -176, y + 5);
  }
  const hy = pitch * 180 / Math.PI * 7;
  if (Math.abs(hy) < H * 0.4) { g.strokeStyle = C; g.beginPath(); g.moveTo(-320, hy); g.lineTo(-110, hy); g.moveTo(110, hy); g.lineTo(320, hy); g.stroke(); }
  g.restore();
  // vetor de voo
  if (d.velLocal && proj) {
    const p = proj(d.velLocal);
    if (p) {
      const x = p[0] * W, y = p[1] * H;
      g.strokeStyle = C; g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2);
      g.moveTo(x - 9, y); g.lineTo(x - 20, y); g.moveTo(x + 9, y); g.lineTo(x + 20, y); g.moveTo(x, y - 9); g.lineTo(x, y - 17); g.stroke();
    }
  }
  // fita de rumo
  const hd = ((d.heading ?? 0) * 180 / Math.PI + 360) % 360;
  g.font = FONT(16, 600); g.textAlign = 'center'; g.fillStyle = Cd; g.strokeStyle = Cd;
  for (let k = -40; k <= 40; k += 5) {
    const val = Math.round(hd / 5) * 5 + k;
    const x = cx + (val - hd) * 6;
    if (Math.abs(x - cx) > 240) continue;
    g.beginPath(); g.moveTo(x, 34); g.lineTo(x, val % 10 === 0 ? 48 : 42); g.stroke();
    if (val % 10 === 0) g.fillText(String(((val % 360) + 360) % 360).padStart(3, '0'), x, 70);
  }
  g.fillStyle = C; g.beginPath(); g.moveTo(cx, 52); g.lineTo(cx - 7, 60); g.lineTo(cx + 7, 60); g.closePath(); g.fill();
  // velocidade (esq) e altitude (dir)
  const box = (x, y, label, val, sub, align) => {
    g.strokeStyle = C; g.lineWidth = 2; g.strokeRect(x - 70, y - 22, 140, 44);
    g.font = FONT(26, 700); g.fillStyle = C; g.textAlign = 'center'; g.fillText(val, x, y + 9);
    g.font = FONT(13, 600); g.fillStyle = Cd; g.fillText(label, x, y - 30);
    if (sub) g.fillText(sub, x, y + 40);
  };
  box(cx - 330, cy, 'VEL M/S', String(Math.round(d.speed ?? 0)), d.mode || 'SCM');
  const alt = d.altitude;
  box(cx + 330, cy, Number.isFinite(alt) && alt < 1e6 ? 'ALT M' : 'DIST', Number.isFinite(alt) && alt < 1e6 ? (alt > 9999 ? (alt / 1000).toFixed(1) + 'K' : String(Math.round(alt))) : '—', d.gear ? 'TREM ↓' : '');
  // acelerador (barra vertical)
  const thr = d.throttle ?? 0;
  g.strokeStyle = Cd; g.strokeRect(cx - 430, cy - 90, 14, 180);
  g.fillStyle = C; g.fillRect(cx - 428, cy + 88 - thr * 176, 10, thr * 176);
  if (d.boost) { g.fillStyle = '#ffb347'; g.fillRect(cx - 428, cy - 88, 10, 18); }
  // alvo + antecipação
  if (d.target && proj) {
    const T = d.target;
    const col = T.rel === 'hostile' ? '#ff5a46' : T.rel === 'friendly' ? '#6dff9a' : '#ffd27a';
    const p = T.dirLocal ? proj(T.dirLocal) : null;
    glow(g, col, 10); g.strokeStyle = col; g.fillStyle = col;
    if (p) {
      const x = p[0] * W, y = p[1] * H, s = 26;
      g.lineWidth = 2.4;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { g.moveTo(x + sx * s, y + sy * s * 0.5); g.lineTo(x + sx * s, y + sy * s); g.lineTo(x + sx * s * 0.5, y + sy * s); }
      g.stroke();
      g.font = FONT(14, 600); g.textAlign = 'left';
      g.fillText(`${T.name || ''}`, x + s + 6, y - s + 10);
      g.fillText(`${T.dist >= 1000 ? (T.dist / 1000).toFixed(1) + 'KM' : Math.round(T.dist) + 'M'}`, x + s + 6, y - s + 28);
      // barra de casco do alvo
      g.strokeRect(x - s, y + s + 6, s * 2, 5); g.fillRect(x - s, y + s + 6, s * 2 * (T.hull ?? 1), 5);
      if (T.locked) { g.beginPath(); g.arc(x, y, s * 1.5, 0, Math.PI * 2); g.stroke(); }
      if (T.leadLocal) {
        const l = proj(T.leadLocal);
        if (l) {
          const lx = l[0] * W, ly = l[1] * H;
          g.setLineDash([4, 5]); g.beginPath(); g.moveTo(x, y); g.lineTo(lx, ly); g.stroke(); g.setLineDash([]);
          g.beginPath(); g.arc(lx, ly, 11, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.moveTo(lx - 5, ly); g.lineTo(lx + 5, ly); g.moveTo(lx, ly - 5); g.lineTo(lx, ly + 5); g.stroke();
        }
      }
    }
  }
  noGlow(g); glow(g, C, 8);
  // mísseis e trava
  g.font = FONT(15, 600); g.textAlign = 'left'; g.fillStyle = Cd;
  g.fillText(`MSL ${d.missiles ?? 4}`, cx + 260, cy + 130);
  if ((d.lock ?? 0) > 0) {
    g.fillStyle = d.lock >= 1 ? '#ff5a46' : '#ffb347';
    g.fillText(d.lock >= 1 ? 'TRAVA ■' : `TRAVANDO ${Math.round(d.lock * 100)}%`, cx + 260, cy + 152);
  }
  // avisos
  const warns = d.warnings || [];
  if (warns.length) {
    const on = (t * 2.5) % 1 < 0.65;
    g.font = FONT(22, 700); g.textAlign = 'center';
    warns.slice(0, 2).forEach((w, i) => {
      g.fillStyle = on ? '#ff5a40' : 'rgba(255,90,64,0.35)'; glow(g, '#ff5a40', 14);
      g.fillText(w, cx, cy + 190 + i * 28);
    });
  }
  if (d.message) { g.font = FONT(16, 600); g.textAlign = 'center'; g.fillStyle = Cd; g.fillText(d.message, cx, H - 22); }
  noGlow(g);
}
