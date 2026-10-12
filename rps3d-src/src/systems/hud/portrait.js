// Retratos procedurais de transmissão (rádio/diálogo). Cada falante gera um
// busto determinístico a partir do nome: rosto com luz de recorte na cor da
// facção, cabelo/capacete/capuz conforme a facção, linhas de varredura e
// ruído de sinal. Os Vigilantes aparecem como um "olho" geométrico.
const cache = new Map();

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let s = seed || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export const FACTION_COLORS = { hegemonia: '#f2d27a', frente: '#ff8a5a', corsarios: '#d26af0', guilda: '#5fd8c0', vigilantes: '#8cc4ff', player: '#a6ecff', none: '#a6ecff' };

/** Desenha (ou reaproveita) o retrato num canvas 152×184. */
export function portrait(speaker = '', faction = 'none') {
  const key = `${speaker}|${faction}`;
  if (cache.has(key)) return cache.get(key);
  const W = 152, H = 184;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const fc = rgb(FACTION_COLORS[faction] || FACTION_COLORS.none);
  const r = rng(hash(speaker + faction));
  // fundo: gradiente na cor da facção, muito escuro
  const bg = g.createRadialGradient(W * 0.5, H * 0.38, 10, W * 0.5, H * 0.5, H * 0.8);
  bg.addColorStop(0, rgba(fc.map((v) => v * 0.28), 1)); bg.addColorStop(1, '#03070c');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // grade técnica sutil
  g.strokeStyle = rgba(fc, 0.07); g.lineWidth = 1;
  for (let x = 0; x <= W; x += 19) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); g.stroke(); }
  for (let y = 0; y <= H; y += 19) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke(); }

  if (faction === 'vigilantes') drawWatcher(g, W, H, fc, r);
  else drawBust(g, W, H, fc, r, faction);

  // varredura + ruído de sinal
  const img = g.getImageData(0, 0, W, H), d = img.data;
  // duotom holográfico: luminância → escuro · cor da facção · branco
  const dk = fc.map((v) => v * 0.06 + 3);
  for (let y = 0; y < H; y++) {
    const scan = y % 3 === 0 ? 0.7 : 1;
    const tear = r() < 0.012 ? (r() - 0.5) * 18 : 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      let L = (d[i] * 0.3 + d[i + 1] * 0.55 + d[i + 2] * 0.15) / 255;
      L = Math.min(1, Math.pow(L, 0.85) * 1.15) * scan + (r() - 0.5) * 0.07 + tear / 255;
      L = Math.max(0, Math.min(1, L));
      const a = Math.min(1, L * 1.6), b = Math.max(0, L * 1.6 - 1) / 0.6;
      for (let c = 0; c < 3; c++) d[i + c] = Math.min(255, dk[c] + (fc[c] - dk[c]) * a + (255 - fc[c]) * b * 0.8);
    }
  }
  g.putImageData(img, 0, 0);
  // vinheta e tinta holográfica
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'screen';
  g.fillStyle = rgba(fc, 0.08); g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  // marcas de canto
  g.strokeStyle = rgba(fc, 0.9); g.lineWidth = 2;
  const k = 12;
  g.beginPath(); g.moveTo(6, 6 + k); g.lineTo(6, 6); g.lineTo(6 + k, 6); g.moveTo(W - 6 - k, 6); g.lineTo(W - 6, 6); g.lineTo(W - 6, 6 + k); g.stroke();
  g.fillStyle = rgba(fc, 0.85); g.font = '600 11px Inter, system-ui, sans-serif'; g.textAlign = 'left';
  g.fillText(faction === 'vigilantes' ? '◇ ???' : '● LIVE', 12, H - 12);
  cache.set(key, cv);
  return cv;
}

function drawBust(g, W, H, fc, r, faction) {
  const skinTones = [[214, 168, 138], [176, 122, 92], [128, 86, 62], [230, 192, 164], [92, 62, 46], [196, 150, 112]];
  const skin = skinTones[Math.floor(r() * skinTones.length)];
  const cx = W * (0.5 + (r() - 0.5) * 0.04), headY = H * 0.43;
  const hw = W * (0.2 + r() * 0.035), hh = H * (0.2 + r() * 0.03);
  const lightL = r() < 0.5; // lado da luz de recorte
  // ombros / traje
  const suitCol = faction === 'hegemonia' ? [222, 222, 214] : faction === 'corsarios' ? [44, 30, 52] : faction === 'guilda' ? [36, 62, 66] : faction === 'frente' ? [72, 58, 48] : [40, 52, 66];
  const sh = g.createLinearGradient(0, H * 0.7, 0, H);
  sh.addColorStop(0, rgba(suitCol.map((v) => v * 0.55), 1)); sh.addColorStop(1, rgba(suitCol.map((v) => v * 0.2), 1));
  g.fillStyle = sh;
  g.beginPath();
  g.moveTo(cx - W * 0.48, H); g.bezierCurveTo(cx - W * 0.46, H * 0.8, cx - W * 0.3, H * 0.74, cx - W * 0.12, H * 0.72);
  g.lineTo(cx + W * 0.12, H * 0.72); g.bezierCurveTo(cx + W * 0.3, H * 0.74, cx + W * 0.46, H * 0.8, cx + W * 0.48, H); g.closePath(); g.fill();
  // gola / placas do traje
  g.strokeStyle = rgba(fc, 0.55); g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx - W * 0.16, H * 0.73); g.lineTo(cx - W * 0.09, H * 0.86); g.lineTo(cx + W * 0.09, H * 0.86); g.lineTo(cx + W * 0.16, H * 0.73); g.stroke();
  if (faction === 'hegemonia') { g.fillStyle = rgba([242, 210, 122], 0.85); g.fillRect(cx - W * 0.33, H * 0.84, W * 0.1, 3); g.fillRect(cx + W * 0.23, H * 0.84, W * 0.1, 3); }
  // pescoço
  g.fillStyle = rgba(skin.map((v) => v * 0.45), 1);
  g.fillRect(cx - hw * 0.42, headY + hh * 0.6, hw * 0.84, H * 0.16);
  // cabeça (elipse com sombreamento)
  const fg = g.createRadialGradient(cx + (lightL ? -hw * 0.5 : hw * 0.5), headY - hh * 0.3, 2, cx, headY, hw * 1.4);
  fg.addColorStop(0, rgba(skin, 1)); fg.addColorStop(0.55, rgba(skin.map((v) => v * 0.62), 1)); fg.addColorStop(1, rgba(skin.map((v) => v * 0.22), 1));
  g.fillStyle = fg;
  g.beginPath(); g.ellipse(cx, headY, hw, hh, 0, 0, Math.PI * 2); g.fill();
  // maxilar
  g.beginPath(); g.moveTo(cx - hw * 0.92, headY + hh * 0.1); g.quadraticCurveTo(cx - hw * 0.6, headY + hh * 1.05, cx, headY + hh * 1.08); g.quadraticCurveTo(cx + hw * 0.6, headY + hh * 1.05, cx + hw * 0.92, headY + hh * 0.1); g.fill();
  // olhos, sobrancelhas, nariz, boca (traços discretos)
  const ey = headY + hh * 0.02, ex = hw * 0.4;
  g.fillStyle = 'rgba(10,8,8,0.82)';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * ex, ey, hw * 0.13, hh * 0.05, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = rgba(fc, 0.9);
  for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * ex + hw * 0.02, ey, 1.6, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = 'rgba(20,12,10,0.7)'; g.lineWidth = 2.2;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * ex * 0.45, ey - hh * 0.16 - r() * 2); g.lineTo(cx + s * ex * 1.45, ey - hh * 0.13); g.stroke(); }
  g.strokeStyle = 'rgba(20,12,10,0.45)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx, ey + hh * 0.08); g.lineTo(cx - hw * 0.08, ey + hh * 0.36); g.lineTo(cx + hw * 0.04, ey + hh * 0.4); g.stroke();
  g.strokeStyle = 'rgba(40,14,12,0.6)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx - hw * 0.28, ey + hh * 0.62); g.quadraticCurveTo(cx, ey + hh * (0.66 + (r() - 0.5) * 0.08), cx + hw * 0.28, ey + hh * 0.62); g.stroke();
  // cabelo / capacete / capuz
  const kind = faction === 'hegemonia' ? 'helmet' : faction === 'corsarios' ? (r() < 0.6 ? 'hood' : 'mask') : faction === 'guilda' ? 'headset' : 'hair';
  if (kind === 'helmet') {
    const hg = g.createLinearGradient(cx - hw * 1.3, 0, cx + hw * 1.3, 0);
    hg.addColorStop(0, '#5d5a52'); hg.addColorStop(lightL ? 0.3 : 0.7, '#f4f1e6'); hg.addColorStop(1, '#4a4842');
    g.fillStyle = hg;
    g.beginPath(); g.ellipse(cx, headY - hh * 0.08, hw * 1.32, hh * 1.28, 0, Math.PI, 0); g.lineTo(cx + hw * 1.32, headY + hh * 0.75); g.lineTo(cx + hw * 1.0, headY + hh * 0.9); g.lineTo(cx + hw * 1.0, headY - hh * 0.05);
    g.lineTo(cx - hw * 1.0, headY - hh * 0.05); g.lineTo(cx - hw * 1.0, headY + hh * 0.9); g.lineTo(cx - hw * 1.32, headY + hh * 0.75); g.closePath(); g.fill();
    g.fillStyle = 'rgba(242,210,122,0.9)'; g.fillRect(cx - hw * 0.08, headY - hh * 1.3, hw * 0.16, hh * 0.9);
    // viseira levantada (reflexo)
    const vg = g.createLinearGradient(0, headY - hh * 0.6, 0, headY - hh * 0.1);
    vg.addColorStop(0, 'rgba(242,190,90,0.55)'); vg.addColorStop(1, 'rgba(80,50,20,0.65)');
    g.fillStyle = vg; g.fillRect(cx - hw * 1.02, headY - hh * 0.5, hw * 2.04, hh * 0.32);
  } else if (kind === 'hood') {
    g.fillStyle = 'rgba(26,14,32,0.97)';
    g.beginPath(); g.moveTo(cx - W * 0.4, H); g.quadraticCurveTo(cx - hw * 1.7, headY - hh * 0.2, cx, headY - hh * 1.5); g.quadraticCurveTo(cx + hw * 1.7, headY - hh * 0.2, cx + W * 0.4, H);
    g.lineTo(cx + hw * 0.95, H); g.quadraticCurveTo(cx + hw * 1.15, headY - hh * 0.2, cx, headY - hh * 1.08); g.quadraticCurveTo(cx - hw * 1.15, headY - hh * 0.2, cx - hw * 0.95, H); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(cx - hw, headY - hh * 1.1, hw * 2, hh * 0.85);
    g.fillStyle = rgba(fc, 0.9); for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * ex, ey, 2.2, 0, Math.PI * 2); g.fill(); }
  } else if (kind === 'mask') {
    g.fillStyle = 'rgba(30,22,36,0.96)';
    g.beginPath(); g.moveTo(cx - hw * 0.95, ey + hh * 0.2); g.lineTo(cx + hw * 0.95, ey + hh * 0.2); g.lineTo(cx + hw * 0.6, headY + hh * 1.1); g.lineTo(cx - hw * 0.6, headY + hh * 1.1); g.closePath(); g.fill();
    g.strokeStyle = rgba(fc, 0.8); g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(cx - hw * 0.5, ey + hh * (0.4 + i * 0.15)); g.lineTo(cx + hw * 0.5, ey + hh * (0.4 + i * 0.15)); g.stroke(); }
    hair(g, cx, headY, hw, hh, r, [30, 20, 30]);
  } else if (kind === 'headset') {
    hair(g, cx, headY, hw, hh, r, [40, 30, 26]);
    g.strokeStyle = 'rgba(30,36,40,1)'; g.lineWidth = 5;
    g.beginPath(); g.arc(cx, headY - hh * 0.05, hw * 1.08, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.fillStyle = 'rgba(40,52,58,1)'; g.fillRect(cx - hw * 1.18, headY - hh * 0.2, hw * 0.22, hh * 0.5);
    g.strokeStyle = rgba(fc, 0.9); g.lineWidth = 2; g.beginPath(); g.moveTo(cx - hw * 1.06, headY + hh * 0.2); g.quadraticCurveTo(cx - hw * 0.9, headY + hh * 0.8, cx - hw * 0.3, headY + hh * 0.72); g.stroke();
  } else if (kind === 'bandana') {
    hair(g, cx, headY, hw, hh, r, [50, 32, 22]);
    g.fillStyle = 'rgba(150,52,30,0.95)';
    g.beginPath(); g.ellipse(cx, headY - hh * 0.55, hw * 1.04, hh * 0.3, 0, Math.PI, 0); g.lineTo(cx + hw * 1.04, headY - hh * 0.42); g.lineTo(cx - hw * 1.04, headY - hh * 0.42); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,170,120,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - hw, headY - hh * 0.48); g.lineTo(cx + hw, headY - hh * 0.48); g.stroke();
  } else hair(g, cx, headY, hw, hh, r, r() < 0.5 ? [36, 26, 20] : [70, 50, 34]);
  // luz de recorte (rim) na cor da facção
  g.save();
  g.globalCompositeOperation = 'screen';
  const rimX = cx + (lightL ? -hw : hw);
  const rg = g.createRadialGradient(rimX, headY, 2, rimX, headY, hw * 1.1);
  rg.addColorStop(0, rgba(fc, 0.55)); rg.addColorStop(1, rgba(fc, 0));
  g.fillStyle = rg; g.fillRect(0, 0, W, H);
  g.restore();
}

function hair(g, cx, headY, hw, hh, r, col) {
  const style = Math.floor(r() * 3);
  g.fillStyle = rgba(col, 1);
  g.beginPath();
  if (style === 0) { // curto
    g.ellipse(cx, headY - hh * 0.28, hw * 1.05, hh * 0.82, 0, Math.PI * 1.02, Math.PI * 1.98);
    g.lineTo(cx + hw * 1.0, headY - hh * 0.1); g.quadraticCurveTo(cx, headY - hh * 0.62, cx - hw * 1.0, headY - hh * 0.1);
  } else if (style === 1) { // lateral raspada, topo alto
    g.ellipse(cx, headY - hh * 0.45, hw * 0.9, hh * 0.75, 0, Math.PI, 0);
    g.lineTo(cx + hw * 0.9, headY - hh * 0.35); g.quadraticCurveTo(cx, headY - hh * 0.7, cx - hw * 0.9, headY - hh * 0.35);
  } else { // longo preso
    g.ellipse(cx, headY - hh * 0.2, hw * 1.12, hh * 0.98, 0, Math.PI * 1.0, Math.PI * 2.0);
    g.lineTo(cx + hw * 1.12, headY + hh * 0.5); g.lineTo(cx + hw * 0.95, headY + hh * 0.4); g.quadraticCurveTo(cx + hw * 0.8, headY - hh * 0.5, cx, headY - hh * 0.6);
    g.quadraticCurveTo(cx - hw * 0.8, headY - hh * 0.5, cx - hw * 0.95, headY + hh * 0.4); g.lineTo(cx - hw * 1.12, headY + hh * 0.5);
  }
  g.closePath(); g.fill();
}

function drawWatcher(g, W, H, fc, r) {
  const cx = W / 2, cy = H * 0.46;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = rgba(fc, 0.12 + i * 0.09); g.lineWidth = 1 + (i === 5 ? 1.2 : 0);
    g.beginPath();
    const R = 18 + i * 9;
    for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3 + i * 0.12; const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R; k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }
  const eg = g.createRadialGradient(cx, cy, 1, cx, cy, 26);
  eg.addColorStop(0, 'rgba(255,255,255,1)'); eg.addColorStop(0.25, rgba(fc, 0.95)); eg.addColorStop(1, rgba(fc, 0));
  g.fillStyle = eg; g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx, cy - 12); g.lineTo(cx + 10, cy + 7); g.lineTo(cx - 10, cy + 7); g.closePath(); g.stroke();
  for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = 40 + r() * 40; g.fillStyle = rgba(fc, 0.3 + r() * 0.5); g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.5, 1.5); }
  g.restore();
}
