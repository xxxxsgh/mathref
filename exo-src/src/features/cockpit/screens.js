/**
 * Desenho em canvas das TELAS do painel e do HUD DIEGÉTICO do vidro.
 *
 * Atlas de telas (1024×1024): radar (centro), voo (esquerda), nave/escudo
 * (direita) e faixa de status (topo). HUD (1024×640, fundo transparente):
 * retícula, vetor de trajetória, escada de arfagem com rolagem, fita de
 * rumo, velocidade/altitude, escudo e colchetes de alvo — tudo em ângulo
 * real (o vidro fica num plano fixo no referencial da nave, então um ponto
 * do mundo cai em (x/−z, y/−z)·f).
 */

export const ATLAS = {
  size: 1024,
  radar: [0, 0, 512, 384],
  flight: [512, 0, 512, 384],
  status: [0, 384, 512, 384],
  strip: [512, 384, 512, 160],
  aux: [512, 544, 512, 224],
};

const ORANGE = '#ff9a3c';
const ORANGE_D = 'rgba(255,140,50,0.35)';
const CYAN = '#5fe8ff';
const CYAN_D = 'rgba(95,232,255,0.3)';
const WHITE = '#f4f8ff';
const RED = '#ff4a3a';
const FONT = "'DejaVu Sans Mono', 'Menlo', 'Consolas', monospace";

function frame(g, x, y, w, h, col, title) {
  // fundo da tela com vinheta e linhas de varredura
  const grd = g.createRadialGradient(x + w / 2, y + h / 2, 10, x + w / 2, y + h / 2, w * 0.75);
  grd.addColorStop(0, '#141a24');
  grd.addColorStop(1, '#05070b');
  g.fillStyle = grd;
  g.fillRect(x, y, w, h);
  g.globalAlpha = 0.07;
  g.fillStyle = '#9fd8ff';
  for (let yy = y; yy < y + h; yy += 4) g.fillRect(x, yy, w, 1);
  g.globalAlpha = 1;
  g.strokeStyle = col;
  g.lineWidth = 3;
  g.strokeRect(x + 10, y + 10, w - 20, h - 20);
  // cantos reforçados
  g.lineWidth = 7;
  const c = 26;
  for (const [cx, cy, dx, dy] of [[x + 10, y + 10, 1, 1], [x + w - 10, y + 10, -1, 1], [x + 10, y + h - 10, 1, -1], [x + w - 10, y + h - 10, -1, -1]]) {
    g.beginPath();
    g.moveTo(cx, cy + dy * c);
    g.lineTo(cx, cy);
    g.lineTo(cx + dx * c, cy);
    g.stroke();
  }
  if (title) {
    g.fillStyle = col;
    g.font = `bold 22px ${FONT}`;
    g.fillText(title, x + 28, y + 42);
    // tracinhos decorativos
    for (let i = 0; i < 14; i++) g.fillRect(x + w - 200 + i * 12, y + 26, 7, 16);
  }
}

/** Radar em perspectiva (anéis laranja, contatos com hastes). */
function drawRadar(g, d, t) {
  const [x, y, w, h] = ATLAS.radar;
  frame(g, x, y, w, h, ORANGE, 'RADAR · 2.5 km');
  const cx = x + w / 2;
  const cy = y + h * 0.6;
  const rx = w * 0.4;
  const ry = h * 0.3;
  g.save();
  g.shadowColor = ORANGE;
  g.shadowBlur = 12;
  g.strokeStyle = ORANGE;
  for (let i = 1; i <= 5; i++) {
    g.globalAlpha = i === 5 ? 0.95 : 0.55;
    g.lineWidth = i === 5 ? 4 : 2;
    g.beginPath();
    g.ellipse(cx, cy, (rx * i) / 5, (ry * i) / 5, 0, 0, Math.PI * 2);
    g.stroke();
  }
  // cúpula
  g.globalAlpha = 0.5;
  g.lineWidth = 2;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry * 2.1, 0, Math.PI, Math.PI * 2);
  g.stroke();
  g.beginPath();
  g.ellipse(cx, cy, rx * 0.45, ry * 2.1, 0, Math.PI, Math.PI * 2);
  g.stroke();
  // cone de visão
  g.globalAlpha = 0.9;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - rx * 0.7, cy - ry * 0.7);
  g.lineTo(cx, cy);
  g.lineTo(cx + rx * 0.7, cy - ry * 0.7);
  g.stroke();
  // varredura
  const a = (t * 1.6) % (Math.PI * 2);
  g.globalAlpha = 0.25;
  g.fillStyle = ORANGE;
  g.beginPath();
  g.moveTo(cx, cy);
  g.ellipse(cx, cy, rx, ry, 0, a - 0.5, a);
  g.closePath();
  g.fill();
  g.globalAlpha = 1;
  // contatos
  for (const c of d.contacts || []) {
    // c.rel: posição no referencial da nave (m); alcance 2500
    const k = 1 / 2500;
    const px = cx + c.rel.x * k * rx;
    const pz = cy + c.rel.z * k * ry;
    const py = pz - c.rel.y * k * ry * 1.6;
    if (Math.hypot(c.rel.x * k, c.rel.z * k) > 1.05) continue;
    const col = c.kind === 'hostile' ? RED : c.kind === 'asteroid' ? '#c9b48a' : CYAN;
    g.strokeStyle = col;
    g.fillStyle = col;
    g.shadowColor = col;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(px, pz);
    g.lineTo(px, py);
    g.stroke();
    g.beginPath();
    if (c.kind === 'hostile') {
      g.moveTo(px, py - 9);
      g.lineTo(px + 8, py);
      g.lineTo(px, py + 9);
      g.lineTo(px - 8, py);
    } else g.rect(px - 5, py - 5, 10, 10);
    g.fill();
  }
  // a nave no centro
  g.fillStyle = WHITE;
  g.shadowColor = WHITE;
  g.beginPath();
  g.moveTo(cx, cy - 12);
  g.lineTo(cx + 10, cy + 8);
  g.lineTo(cx - 10, cy + 8);
  g.closePath();
  g.fill();
  g.restore();
}

function bar(g, x, y, w, h, v, col, segs = 20) {
  const sw = w / segs;
  for (let i = 0; i < segs; i++) {
    g.fillStyle = i / segs < v ? col : 'rgba(255,255,255,0.08)';
    g.fillRect(x + i * sw + 1, y, sw - 3, h);
  }
}

/** Velocidade, acelerador, altitude, estado. */
function drawFlight(g, d) {
  const [x, y, w, h] = ATLAS.flight;
  const col = d.heat > 0.3 ? RED : CYAN;
  frame(g, x, y, w, h, col, d.pulse ? 'PULSO' : 'VOO');
  g.save();
  g.shadowColor = col;
  g.shadowBlur = 14;
  g.fillStyle = WHITE;
  g.font = `bold 96px ${FONT}`;
  const sp = Math.round(d.speed);
  g.textAlign = 'right';
  g.fillText(sp >= 10000 ? `${(sp / 1000).toFixed(1)}k` : `${sp}`, x + w - 120, y + 170);
  g.font = `bold 34px ${FONT}`;
  g.fillStyle = col;
  g.fillText('u/s', x + w - 40, y + 170);
  g.textAlign = 'left';
  // chevrons do acelerador
  g.strokeStyle = col;
  g.lineWidth = 5;
  for (let i = 0; i < 3; i++) {
    const on = d.throttle > (i + 0.5) / 3.5;
    g.globalAlpha = on ? 1 : 0.25;
    g.beginPath();
    g.moveTo(x + 46 + i * 26, y + 100);
    g.lineTo(x + 64 + i * 26, y + 125);
    g.lineTo(x + 46 + i * 26, y + 150);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.font = `22px ${FONT}`;
  g.fillStyle = col;
  g.fillText('EMPUXO', x + 40, y + 222);
  bar(g, x + 40, y + 234, w - 80, 18, d.throttle, col, 24);
  g.fillText('ALT', x + 40, y + 290);
  g.fillStyle = WHITE;
  g.font = `bold 34px ${FONT}`;
  const alt = d.altitude;
  g.fillText(alt > 9999 ? `${(alt / 1000).toFixed(1)} km` : `${Math.round(alt)} m`, x + 100, y + 292);
  g.font = `22px ${FONT}`;
  g.fillStyle = col;
  g.fillText(d.air > 0.01 ? `AR ${(d.air * 100).toFixed(0)}%` : 'VÁCUO', x + 330, y + 290);
  bar(g, x + 40, y + 316, w - 80, 10, Math.min(1, d.altitude / 3000), ORANGE_D, 32);
  g.restore();
}

/** Escudo, casco e silhueta da nave. */
function drawStatus(g, d) {
  const [x, y, w, h] = ATLAS.status;
  frame(g, x, y, w, h, ORANGE, 'ESCUDO');
  g.save();
  g.shadowColor = ORANGE;
  g.shadowBlur = 10;
  bar(g, x + 40, y + 62, w - 80, 22, d.shield, d.shield < 0.3 ? RED : CYAN, 26);
  g.font = `20px ${FONT}`;
  g.fillStyle = ORANGE;
  g.fillText('CASCO', x + 40, y + 118);
  bar(g, x + 140, y + 102, w - 180, 14, d.hull, ORANGE, 22);
  // silhueta em vista superior (linhas)
  const cx = x + w / 2;
  const cy = y + 250;
  const s = 13;
  g.strokeStyle = WHITE;
  g.lineWidth = 2.5;
  g.beginPath();
  const pts = [[0, -8.6], [0.8, -6.2], [1.2, -1.5], [2.9, -0.4], [7.5, 3.7], [7.7, 5.5], [3.1, 6.4], [2.3, 7.4], [1.5, 6.4], [0.7, 5.5]];
  g.moveTo(cx, cy - 8.6 * s);
  for (const [px, pz] of pts) g.lineTo(cx + px * s, cy + pz * s);
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(cx - pts[i][0] * s, cy + pts[i][1] * s);
  g.closePath();
  g.globalAlpha = 0.85;
  g.stroke();
  g.globalAlpha = 0.18;
  g.fillStyle = CYAN;
  g.fill();
  g.globalAlpha = 1;
  // anel do escudo ao redor
  g.strokeStyle = d.shield < 0.3 ? RED : CYAN;
  g.lineWidth = 4;
  g.beginPath();
  g.ellipse(cx, cy, 120, 120 * 0.95, 0, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * d.shield);
  g.stroke();
  g.restore();
}

function drawStrip(g, d, t) {
  const [x, y, w, h] = ATLAS.strip;
  frame(g, x, y, w, h, CYAN, null);
  g.save();
  g.fillStyle = CYAN;
  g.font = `bold 26px ${FONT}`;
  g.fillText(`RUMO ${String(Math.round(((d.heading % 360) + 360) % 360)).padStart(3, '0')}°`, x + 34, y + 62);
  g.fillText(d.state.toUpperCase(), x + 300, y + 62);
  g.font = `20px ${FONT}`;
  g.fillStyle = WHITE;
  g.fillText(`${d.lat >= 0 ? 'N' : 'S'} ${Math.abs(d.lat).toFixed(2)}  ${d.lon >= 0 ? 'L' : 'O'} ${Math.abs(d.lon).toFixed(2)}`, x + 34, y + 110);
  // luzes de estado
  const lights = [[d.gear > 0.5, '#ffb347'], [d.pulse, CYAN], [d.heat > 0.2, RED], [true, '#7dff8a']];
  lights.forEach(([on, c], i) => {
    g.fillStyle = on ? c : 'rgba(255,255,255,0.08)';
    g.fillRect(x + 340 + i * 36, y + 92, 26, 20);
  });
  g.restore();
}

function drawAux(g, d, t) {
  const [x, y, w, h] = ATLAS.aux;
  frame(g, x, y, w, h, ORANGE, 'SISTEMAS');
  g.save();
  // osciloscópio
  g.strokeStyle = ORANGE;
  g.shadowColor = ORANGE;
  g.shadowBlur = 8;
  g.lineWidth = 3;
  g.beginPath();
  for (let i = 0; i <= 120; i++) {
    const px = x + 30 + (i / 120) * (w * 0.55);
    const py = y + 130 + Math.sin(i * 0.33 + t * 5) * 28 * (0.4 + d.throttle) + Math.sin(i * 1.1 + t * 9) * 8;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
  // barras verticais
  for (let i = 0; i < 6; i++) {
    const v = 0.3 + 0.6 * Math.abs(Math.sin(i * 1.7 + t * (0.8 + i * 0.2)));
    g.fillStyle = i % 2 ? CYAN : ORANGE;
    g.fillRect(x + w * 0.66 + i * 26, y + 190 - v * 120, 16, v * 120);
  }
  g.restore();
}

export function drawAtlas(g, d, t) {
  g.clearRect(0, 0, ATLAS.size, ATLAS.size);
  drawRadar(g, d, t);
  drawFlight(g, d);
  drawStatus(g, d);
  drawStrip(g, d, t);
  drawAux(g, d, t);
}

// ─────────────────────────────────────────────────────────────── HUD
/**
 * HUD no vidro. `f` = px por unidade de tangente (projeção do plano do vidro),
 * (cx, cy) = centro óptico em px. Elementos com posição no mundo usam
 * d.proj(dirNave) → [x, y] | null.
 */
export function drawHUD(g, W, H, d, t) {
  g.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H * d.centerY;
  const f = d.f;
  const col = d.heat > 0.35 ? '#ffb070' : CYAN;
  g.save();
  g.lineCap = 'round';
  g.shadowColor = col;
  g.shadowBlur = 10;
  g.strokeStyle = col;
  g.fillStyle = col;

  // retícula central
  g.lineWidth = 3;
  g.beginPath();
  g.arc(cx, cy, 16, 0, Math.PI * 2);
  g.moveTo(cx - 40, cy);
  g.lineTo(cx - 24, cy);
  g.moveTo(cx + 24, cy);
  g.lineTo(cx + 40, cy);
  g.moveTo(cx, cy + 24);
  g.lineTo(cx, cy + 36);
  g.stroke();

  // escada de arfagem (rola com a nave)
  g.save();
  g.translate(cx, cy);
  g.rotate(-d.roll);
  g.lineWidth = 2;
  g.font = `bold 16px ${FONT}`;
  for (let pd = -60; pd <= 60; pd += 10) {
    const ang = ((pd - d.pitchDeg) * Math.PI) / 180;
    if (Math.abs(ang) > 0.75) continue;
    const yy = Math.tan(ang) * -f;
    const half = pd === 0 ? 300 : 70;
    g.globalAlpha = pd === 0 ? 0.85 : 0.55;
    g.beginPath();
    if (pd === 0) {
      g.moveTo(-half, yy);
      g.lineTo(-60, yy);
      g.moveTo(60, yy);
      g.lineTo(half, yy);
    } else {
      g.setLineDash(pd < 0 ? [10, 8] : []);
      g.moveTo(-half - 60, yy);
      g.lineTo(-60, yy);
      g.lineTo(-60, yy + (pd > 0 ? 10 : -10));
      g.moveTo(half + 60, yy);
      g.lineTo(60, yy);
      g.lineTo(60, yy + (pd > 0 ? 10 : -10));
    }
    g.stroke();
    g.setLineDash([]);
    if (pd !== 0) {
      g.fillText(String(pd), -half - 98, yy + 6);
      g.fillText(String(pd), half + 70, yy + 6);
    }
  }
  g.restore();
  g.globalAlpha = 1;

  // vetor de trajetória
  if (d.fpm) {
    const [px, py] = d.fpm;
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(px, py, 10, 0, Math.PI * 2);
    g.moveTo(px - 24, py);
    g.lineTo(px - 10, py);
    g.moveTo(px + 10, py);
    g.lineTo(px + 24, py);
    g.moveTo(px, py - 10);
    g.lineTo(px, py - 20);
    g.stroke();
  }

  // fita de rumo
  g.font = `bold 18px ${FONT}`;
  g.textAlign = 'center';
  const ty = cy - f * 0.36;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx - 250, ty);
  g.lineTo(cx + 250, ty);
  g.stroke();
  for (let hd = Math.floor(d.heading / 10) * 10 - 40; hd <= d.heading + 40; hd += 10) {
    const xx = cx + ((hd - d.heading) / 40) * 250;
    g.beginPath();
    g.moveTo(xx, ty);
    g.lineTo(xx, ty - (hd % 30 === 0 ? 14 : 7));
    g.stroke();
    if (hd % 30 === 0) {
      const v = ((hd % 360) + 360) % 360;
      const lbl = { 0: 'N', 90: 'L', 180: 'S', 270: 'O' }[v] ?? String(v).padStart(3, '0');
      g.fillText(lbl, xx, ty - 22);
    }
  }
  g.beginPath();
  g.moveTo(cx, ty + 4);
  g.lineTo(cx - 8, ty + 16);
  g.lineTo(cx + 8, ty + 16);
  g.closePath();
  g.fill();

  // velocidade (esq.) e altitude (dir.) em caixas
  const box = (x, label, val, align) => {
    g.lineWidth = 2;
    g.strokeRect(x - 70, cy - 26, 140, 52);
    g.font = `bold 30px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(val, x, cy + 11);
    g.font = `14px ${FONT}`;
    g.fillText(label, x, cy - 34);
    // escala vertical
    g.globalAlpha = 0.5;
    for (let i = -6; i <= 6; i++) {
      const yy = cy + i * 22;
      if (Math.abs(i) < 2) continue;
      g.beginPath();
      g.moveTo(x + align * 76, yy);
      g.lineTo(x + align * (i % 2 ? 84 : 94), yy);
      g.stroke();
    }
    g.globalAlpha = 1;
  };
  const sp = Math.round(d.speed);
  box(cx - f * 0.5, 'VEL u/s', sp >= 10000 ? `${(sp / 1000).toFixed(0)}k` : String(sp), 1);
  const alt = d.altitude;
  box(cx + f * 0.5, 'ALT m', alt > 99999 ? `${(alt / 1000).toFixed(0)}k` : String(Math.round(alt)), -1);

  // escudo: arco inferior
  g.lineWidth = 6;
  g.globalAlpha = 0.3;
  g.beginPath();
  g.arc(cx, cy, f * 0.27, Math.PI * 0.62, Math.PI * 0.38, true);
  g.stroke();
  g.globalAlpha = 1;
  g.strokeStyle = d.shield < 0.3 ? '#ff5040' : col;
  g.beginPath();
  g.arc(cx, cy, f * 0.27, Math.PI * 0.62, Math.PI * 0.62 - Math.PI * 0.24 * d.shield, true);
  g.stroke();

  // alvo
  if (d.target && d.target.screen) {
    const [px, py] = d.target.screen;
    const s = Math.max(22, Math.min(80, d.target.size || 30));
    g.strokeStyle = '#ff5a48';
    g.fillStyle = '#ff5a48';
    g.shadowColor = '#ff5a48';
    g.lineWidth = 3;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.beginPath();
      g.moveTo(px + sx * s, py + sy * (s - 12));
      g.lineTo(px + sx * s, py + sy * s);
      g.lineTo(px + sx * (s - 12), py + sy * s);
      g.stroke();
    }
    g.font = `bold 16px ${FONT}`;
    g.textAlign = 'left';
    g.fillText(`${d.target.name}`, px + s + 8, py - 6);
    g.fillText(`${Math.round(d.target.distance)} m`, px + s + 8, py + 14);
    // barra de vida
    g.fillRect(px - s, py + s + 8, 2 * s * (d.target.hp ?? 1), 5);
    if (d.target.lead) {
      const [lx, ly] = d.target.lead;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(lx, ly, 7, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // indicadores de borda para contatos fora da vista
  for (const e of d.edges || []) {
    g.fillStyle = e.kind === 'hostile' ? '#ff5a48' : col;
    g.save();
    g.translate(e.x, e.y);
    g.rotate(e.a);
    g.beginPath();
    g.moveTo(14, 0);
    g.lineTo(-8, -9);
    g.lineTo(-8, 9);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.restore();
}
