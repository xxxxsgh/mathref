/**
 * Texturas de decalques e detalhes desenhadas em <canvas>: escorridos de
 * sujeira, fuligem, rachaduras, marcas de bala, cartazes, letreiros,
 * pichações, pintura de rua, folhas e um atlas de lixo miúdo.
 *
 * Tudo inventado aqui — textos genéricos (palavras comuns em russo/árabe:
 * "farmácia", "pão", "café"…), nenhuma marca real.
 */
import * as THREE from 'three';
import { mulberry } from './noise.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Escorridos verticais (sujeira/água) — alfa decai para baixo. */
export function streakTexture(seed = 3) {
  const r = mulberry(seed);
  const [c, g] = canvas(256, 512);
  for (let i = 0; i < 70; i++) {
    const x = r() * 256;
    const w = 2 + r() * 16;
    const len = 120 + r() * 380;
    const a = 0.05 + r() * 0.2;
    const grd = g.createLinearGradient(0, 0, 0, len);
    grd.addColorStop(0, `rgba(28,22,16,${a})`);
    grd.addColorStop(0.7, `rgba(28,22,16,${a * 0.5})`);
    grd.addColorStop(1, 'rgba(28,22,16,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x - w / 2, 0);
    g.lineTo(x + w / 2, 0);
    g.lineTo(x + w * 0.2 + (r() - 0.5) * 6, len);
    g.lineTo(x - w * 0.2, len);
    g.fill();
  }
  // faixa escura no topo (onde a água acumula)
  const top = g.createLinearGradient(0, 0, 0, 40);
  top.addColorStop(0, 'rgba(20,16,12,0.45)');
  top.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = top;
  g.fillRect(0, 0, 256, 40);
  // bordas laterais suaves
  const fade = g.createLinearGradient(0, 0, 256, 0);
  g.globalCompositeOperation = 'destination-in';
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(0.15, 'rgba(0,0,0,1)');
  fade.addColorStop(0.85, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fade;
  g.fillRect(0, 0, 256, 512);
  return tex(c);
}

/** Fuligem de incêndio subindo de uma janela (pluma). */
export function sootTexture(seed = 5) {
  const r = mulberry(seed);
  const [c, g] = canvas(256, 512);
  for (let i = 0; i < 260; i++) {
    const t = r();
    const y = 512 - t * 480 - 20;
    const spread = 30 + t * 90;
    const x = 128 + (r() - 0.5) * spread * 1.4;
    const rad = 10 + t * 45 * r() + 8;
    const a = 0.05 * (1 - t * 0.7);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(8,7,6,${a})`);
    grd.addColorStop(1, 'rgba(8,7,6,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return tex(c);
}

/** Altura (canvas em tons de cinza, 128 = plano) → normal map tangente. */
function canvasNormal(c, strength = 2) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);
  const H = (x, y) => src[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      // canvas: y para baixo → v para cima (flipY da textura)
      const i = ((h - 1 - y) * w + x) * 4;
      out[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      out[i + 2] = (inv * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(out, w, h);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Polígono irregular (lasca) centrado em (x, y). */
function blob(g, r, x, y, rad, n = 11, jag = 0.45) {
  g.beginPath();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const q = rad * (1 - jag * 0.5 + r() * jag);
    g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
  }
  g.closePath();
}

/**
 * Rachaduras ramificadas com borda lascada + mapa normal (sulco fundo).
 * Retorna { map, normalMap }.
 */
export function crackTexture(seed = 7) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  const [hc, hg] = canvas(512, 512);
  hg.fillStyle = 'rgb(128,128,128)';
  hg.fillRect(0, 0, 512, 512);
  g.lineCap = hg.lineCap = 'round';
  g.lineJoin = hg.lineJoin = 'round';
  const segs = [];
  const branch = (x, y, ang, len, w, depth) => {
    let cx = x, cy = y;
    const steps = Math.ceil(len / 7);
    for (let i = 0; i < steps; i++) {
      ang += (r() - 0.5) * 0.8;
      const nx = cx + Math.cos(ang) * 7, ny = cy + Math.sin(ang) * 7;
      const ww = w * (1 - (i / steps) * 0.7);
      segs.push([cx, cy, nx, ny, ww]);
      cx = nx; cy = ny;
      if (depth < 3 && r() < 0.09) branch(cx, cy, ang + (r() - 0.5) * 1.9, len * 0.5, Math.max(0.6, ww * 0.6), depth + 1);
    }
  };
  for (let i = 0; i < 6; i++) branch(256, 256, r() * Math.PI * 2, 110 + r() * 150, 3.2, 0);
  // halo claro (reboco esmagado) → sulco escuro
  for (const [a, b, cc, d, w] of segs) {
    g.strokeStyle = 'rgba(185,175,160,0.35)';
    g.lineWidth = w * 3.2;
    g.beginPath(); g.moveTo(a, b); g.lineTo(cc, d); g.stroke();
    hg.strokeStyle = 'rgb(110,110,110)';
    hg.lineWidth = w * 2.6;
    hg.beginPath(); hg.moveTo(a, b); hg.lineTo(cc, d); hg.stroke();
  }
  for (const [a, b, cc, d, w] of segs) {
    g.strokeStyle = 'rgba(14,11,9,0.85)';
    g.lineWidth = w;
    g.beginPath(); g.moveTo(a, b); g.lineTo(cc, d); g.stroke();
    hg.strokeStyle = 'rgb(20,20,20)';
    hg.lineWidth = w;
    hg.beginPath(); hg.moveTo(a, b); hg.lineTo(cc, d); hg.stroke();
  }
  // lasca central (reboco arrancado, cimento por baixo)
  blob(g, r, 256, 256, 34, 16, 0.6);
  g.fillStyle = 'rgba(120,112,102,0.9)';
  g.fill();
  blob(hg, r, 256, 256, 34, 16, 0.6);
  hg.fillStyle = 'rgb(70,70,70)';
  hg.fill();
  for (let i = 0; i < 40; i++) {
    const x = 256 + (r() - 0.5) * 60, y = 256 + (r() - 0.5) * 60;
    g.fillStyle = `rgba(${60 + r() * 60},${55 + r() * 55},${50 + r() * 50},0.6)`;
    g.fillRect(x, y, 1 + r() * 3, 1 + r() * 3);
  }
  return { map: tex(c), normalMap: canvasNormal(hc, 3) };
}

/**
 * Marcas de tiro: rajadas (linhas de impactos) e grupos, cada buraco com
 * miolo fundo, cratera de reboco lascado (cimento claro) e trincas radiais.
 * Retorna { map, normalMap } — o relevo pega luz rasante do sol.
 */
export function bulletHolesTexture(seed = 9) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  const [hc, hg] = canvas(512, 512);
  hg.fillStyle = 'rgb(128,128,128)';
  hg.fillRect(0, 0, 512, 512);
  const holes = [];
  // 2 rajadas inclinadas + impactos soltos
  for (let b = 0; b < 2; b++) {
    const x0 = 80 + r() * 200, y0 = 120 + r() * 280, ang = (r() - 0.5) * 1.2, n = 5 + Math.floor(r() * 6);
    for (let i = 0; i < n; i++) holes.push([x0 + Math.cos(ang) * i * (24 + r() * 16) + (r() - 0.5) * 14, y0 + Math.sin(ang) * i * 26 + (r() - 0.5) * 18, 5 + r() * 7]);
  }
  for (let i = 0; i < 9; i++) holes.push([40 + r() * 432, 40 + r() * 432, 4 + r() * 9]);
  for (const [x, y, s] of holes) {
    if (x < 20 || x > 492 || y < 20 || y > 492) continue;
    // cratera lascada
    blob(g, r, x, y, s * 2.3, 12, 0.55);
    g.fillStyle = `rgba(${150 + r() * 25},${142 + r() * 20},${128 + r() * 18},0.92)`;
    g.fill();
    blob(hg, r, x, y, s * 2.3, 12, 0.55);
    hg.fillStyle = 'rgb(88,88,88)';
    hg.fill();
    // borda escura fina (sombra da quebra)
    g.strokeStyle = 'rgba(40,35,30,0.35)';
    g.lineWidth = 1.2;
    g.stroke();
    // trincas radiais
    for (let k = 0; k < 4; k++) {
      const a = r() * Math.PI * 2, l = s * (2.2 + r() * 2.5);
      g.strokeStyle = 'rgba(25,20,16,0.55)';
      g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    // miolo
    blob(g, r, x, y, s * 0.75, 9, 0.5);
    g.fillStyle = 'rgba(10,8,7,0.97)';
    g.fill();
    blob(hg, r, x, y, s * 0.75, 9, 0.5);
    hg.fillStyle = 'rgb(0,0,0)';
    hg.fill();
  }
  return { map: tex(c), normalMap: canvasNormal(hc, 4) };
}

/**
 * Lascas grandes de reboco (atlas 2×2): reboco arrancado expondo tijolo e
 * cimento, com borda de tinta descolando. Para quinas, vergas e rombos.
 */
export function chipsTexture(seed = 15) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 1024);
  const [hc, hg] = canvas(1024, 1024);
  hg.fillStyle = 'rgb(128,128,128)';
  hg.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 4; i++) {
    const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 512;
    g.save(); hg.save();
    g.beginPath(); g.rect(ox, oy, 512, 512); g.clip();
    hg.beginPath(); hg.rect(ox, oy, 512, 512); hg.clip();
    // contorno orgânico (soma de senoides)
    const ph = [r() * 6, r() * 6, r() * 6];
    const shape = (gg, grow) => {
      gg.beginPath();
      for (let k = 0; k <= 64; k++) {
        const a = (k / 64) * Math.PI * 2;
        const q = (150 + 40 * Math.sin(a * 2 + ph[0]) + 25 * Math.sin(a * 5 + ph[1]) + 12 * Math.sin(a * 11 + ph[2]) + (r() - 0.5) * 14) * grow;
        gg.lineTo(ox + 256 + Math.cos(a) * q, oy + 256 + Math.sin(a) * q * 0.75);
      }
      gg.closePath();
    };
    // anel de reboco descolado (claro) e área exposta
    shape(g, 1.06);
    g.fillStyle = 'rgba(175,165,150,0.85)';
    g.fill();
    shape(g, 1.0);
    g.fillStyle = 'rgb(118,112,104)';
    g.fill();
    shape(hg, 1.0);
    hg.fillStyle = 'rgb(70,70,70)';
    hg.fill();
    // tijolos expostos dentro (metade dos casos)
    if (i % 2 === 0) {
      g.save(); shape(g, 0.92); g.clip();
      hg.save(); shape(hg, 0.92); hg.clip();
      for (let y = 0; y < 512; y += 22) {
        const off = (y / 22) % 2 ? 0 : 33;
        for (let x = -66; x < 512; x += 66) {
          const t = r();
          g.fillStyle = `rgb(${110 + t * 40},${62 + t * 22},${48 + t * 15})`;
          g.fillRect(ox + x + off + 2, oy + y + 2, 62, 18);
          hg.fillStyle = 'rgb(100,100,100)';
          hg.fillRect(ox + x + off + 3, oy + y + 3, 60, 16);
        }
      }
      g.restore(); hg.restore();
    }
    // granulado / pó
    for (let k = 0; k < 900; k++) {
      const x = ox + 256 + (r() - 0.5) * 380, y = oy + 256 + (r() - 0.5) * 300;
      g.fillStyle = `rgba(${r() < 0.5 ? '40,36,32' : '190,182,170'},${0.15 + r() * 0.25})`;
      g.fillRect(x, y, 1 + r() * 3, 1 + r() * 3);
    }
    g.restore(); hg.restore();
  }
  return { map: tex(c), normalMap: canvasNormal(hc, 5) };
}

/** Queimado de explosão em parede/chão (fuligem radial + respingos). */
export function scorchTexture(seed = 19) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  for (let i = 0; i < 220; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 1.6) * 200;
    const x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d;
    const rad = 14 + r() * 50 * (1 - d / 260);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const al = 0.13 * (1 - d / 240);
    grd.addColorStop(0, `rgba(6,5,4,${al})`);
    grd.addColorStop(1, 'rgba(6,5,4,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = 'rgba(5,4,3,0.4)';
  for (let k = 0; k < 70; k++) {
    const a = r() * Math.PI * 2, l0 = 40 + r() * 40, l1 = l0 + 60 + r() * 140;
    g.lineWidth = 1 + r() * 4;
    g.beginPath();
    g.moveTo(256 + Math.cos(a) * l0, 256 + Math.sin(a) * l0);
    g.lineTo(256 + Math.cos(a) * l1, 256 + Math.sin(a) * l1);
    g.stroke();
  }
  return tex(c);
}

/** Atlas 4×2 de cartazes colados/rasgados (sem texto real — blocos e tipos). */
export function postersTexture(seed = 11) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 512);
  const pal = ['#c8382c', '#e8d9b8', '#2b4f7a', '#d9a531', '#1c1c1c', '#5f7b4a', '#efefe6', '#8a3b6b'];
  const words = ['ВЫБОРЫ', 'РАБОТА', 'КОНЦЕРТ', 'СДАЕТСЯ', 'تخفيضات', 'مطلوب', 'НОВОСТИ', 'إعلان'];
  for (let i = 0; i < 8; i++) {
    const x = (i % 4) * 256, y = Math.floor(i / 4) * 256;
    g.save();
    g.beginPath();
    g.rect(x + 8, y + 8, 240, 240);
    g.clip();
    g.fillStyle = pal[(i * 3) % pal.length];
    g.fillRect(x, y, 256, 256);
    g.fillStyle = pal[(i * 5 + 1) % pal.length];
    g.fillRect(x + 20, y + 30 + r() * 40, 216, 60 + r() * 50);
    g.fillStyle = pal[(i * 7 + 2) % pal.length];
    g.font = 'bold 40px "DejaVu Sans", sans-serif';
    g.textAlign = 'center';
    g.fillText(words[i], x + 128, y + 200);
    g.font = '14px "DejaVu Sans", sans-serif';
    for (let l = 0; l < 3; l++) g.fillRect(x + 30, y + 214 + l * 9, 196 * (0.5 + r() * 0.5), 3);
    // envelhecimento: desbotado + rasgos (pedaços transparentes)
    g.fillStyle = 'rgba(230,220,200,0.25)';
    g.fillRect(x, y, 256, 256);
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      const sx = x + r() * 256, sy = y + (r() < 0.5 ? 0 : 200) + r() * 56;
      g.moveTo(sx, sy);
      for (let q = 0; q < 6; q++) g.lineTo(sx + (r() - 0.3) * 120, sy + (r() - 0.5) * 70);
      g.fill();
    }
    g.restore();
  }
  return tex(c);
}

/**
 * Atlas de letreiros de loja: 16 faixas 1024×128 em 1024×2048, estilos
 * variados (caixa de luz, chapa pintada à mão, letras sobre faixa, placa
 * enferrujada), bilíngues. Textos genéricos (sem marcas).
 */
export const SIGN_COUNT = 16;
export function signsTexture(seed = 13) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 2048);
  const F = '"DejaVu Sans", "FreeSans", "Liberation Sans", sans-serif';
  const FS = '"DejaVu Serif", "Liberation Serif", serif';
  const signs = [
    { t: 'АПТЕКА', bg: '#1f6b3a', fg: '#f2f2ea', st: 'box', sub: '+' },
    { t: 'ПРОДУКТЫ 24', bg: '#e8e1cf', fg: '#b3261e', st: 'paint' },
    { t: 'مخبز', bg: '#2a3f6b', fg: '#f5d76e', st: 'box', sub: 'ХЛЕБ' },
    { t: 'КАФЕ', bg: '#7b2a1f', fg: '#f0e0c0', st: 'letters' },
    { t: 'صيدلية', bg: '#f0efe8', fg: '#1d6b3a', st: 'box' },
    { t: 'РЕМОНТ ОБУВИ', bg: '#c99a2e', fg: '#1b1b1b', st: 'paint' },
    { t: 'مطعم الشام', bg: '#1b1b1b', fg: '#e8c25a', st: 'letters' },
    { t: 'ГОСТИНИЦА', bg: '#5b6e7a', fg: '#f2f2f2', st: 'rust' },
    { t: 'ХОЗТОВАРЫ', bg: '#3c5a7a', fg: '#f4e9c8', st: 'paint' },
    { t: 'حلويات', bg: '#8a2b4b', fg: '#f6e7d2', st: 'box', sub: 'СЛАДОСТИ' },
    { t: 'ШИНОМОНТАЖ', bg: '#232323', fg: '#f0c419', st: 'rust' },
    { t: 'مكتبة', bg: '#d8cfb8', fg: '#2a3f6b', st: 'paint' },
    { t: 'ПАРИКМАХЕРСКАЯ', bg: '#6d3d6b', fg: '#f3eadf', st: 'letters' },
    { t: 'ОПТИКА', bg: '#e9eef0', fg: '#1a4f8a', st: 'box' },
    { t: 'خضار وفواكه', bg: '#3f6b2a', fg: '#fbf3d9', st: 'paint' },
    { t: 'ТЕЛЕФОНЫ', bg: '#b02a2a', fg: '#ffffff', st: 'rust' },
  ];
  signs.forEach((sg, i) => {
    const y = i * 128;
    g.save();
    g.beginPath(); g.rect(0, y, 1024, 128); g.clip();
    g.fillStyle = sg.bg;
    g.fillRect(0, y, 1024, 128);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (sg.st === 'box') {
      // caixa de luz: moldura de alumínio + painel translúcido
      const grd = g.createLinearGradient(0, y, 0, y + 128);
      grd.addColorStop(0, 'rgba(255,255,255,0.18)');
      grd.addColorStop(1, 'rgba(0,0,0,0.18)');
      g.fillStyle = grd; g.fillRect(0, y, 1024, 128);
      g.strokeStyle = '#9a9a96'; g.lineWidth = 12; g.strokeRect(6, y + 6, 1012, 116);
      g.fillStyle = sg.fg;
      g.font = `bold ${sg.sub ? 64 : 78}px ${F}`;
      g.fillText(sg.t, 512, y + (sg.sub ? 54 : 68));
      if (sg.sub) { g.font = `bold 30px ${F}`; g.fillText(sg.sub, 512, y + 104); }
      if (sg.sub === '+') { g.fillStyle = '#d22'; g.fillRect(70, y + 40, 50, 16); g.fillRect(87, y + 23, 16, 50); }
    } else if (sg.st === 'paint') {
      // chapa pintada à mão: letras serifadas, sombra, borda dupla
      g.strokeStyle = sg.fg; g.lineWidth = 4; g.strokeRect(14, y + 14, 996, 100);
      g.font = `bold 72px ${FS}`;
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillText(sg.t, 516, y + 72);
      g.fillStyle = sg.fg; g.fillText(sg.t, 512, y + 68);
    } else if (sg.st === 'letters') {
      // letras recortadas sobre faixa escura, uma faltando/torta
      g.font = `bold 84px ${F}`;
      g.fillStyle = sg.fg;
      g.fillText(sg.t, 512, y + 70);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(0, y, 1024, 50);
      g.globalCompositeOperation = 'source-over';
    } else {
      // placa de metal enferrujada com rebites
      g.font = `bold 70px ${F}`;
      g.fillStyle = sg.fg; g.fillText(sg.t, 512, y + 68);
      for (const xx of [24, 1000]) for (const yy of [20, 108]) { g.fillStyle = '#555'; g.beginPath(); g.arc(xx, y + yy, 6, 0, 7); g.fill(); }
      for (let k = 0; k < 26; k++) {
        const x = r() * 1024;
        const grd = g.createLinearGradient(0, y + 20 + r() * 40, 0, y + 128);
        grd.addColorStop(0, 'rgba(120,55,18,0)');
        grd.addColorStop(1, 'rgba(120,55,18,0.65)');
        g.fillStyle = grd;
        g.fillRect(x, y, 2 + r() * 7, 128);
      }
    }
    // desgaste comum: desbotado, manchas, sujeira escorrendo, furos de bala
    for (let k = 0; k < 40; k++) {
      const x = r() * 1024, yy = y + r() * 128, rr = 4 + r() * 30;
      g.fillStyle = `rgba(${r() < 0.5 ? '90,50,25' : '220,215,200'},${0.06 + r() * 0.16})`;
      g.beginPath(); g.arc(x, yy, rr, 0, Math.PI * 2); g.fill();
    }
    const fade = g.createLinearGradient(0, y, 1024, y + 128);
    fade.addColorStop(0, `rgba(235,230,215,${0.05 + r() * 0.15})`);
    fade.addColorStop(1, 'rgba(235,230,215,0)');
    g.fillStyle = fade; g.fillRect(0, y, 1024, 128);
    for (let k = 0; k < 10; k++) {
      const x = r() * 1024;
      const grd = g.createLinearGradient(0, y + 100, 0, y + 128);
      grd.addColorStop(0, 'rgba(60,40,25,0)');
      grd.addColorStop(1, 'rgba(60,40,25,0.5)');
      g.fillStyle = grd;
      g.fillRect(x, y + 80, 3 + r() * 6, 48);
    }
    const nh = Math.floor(r() * 5);
    for (let k = 0; k < nh; k++) {
      const x = 40 + r() * 944, yy = y + 20 + r() * 88;
      g.fillStyle = 'rgba(200,195,185,0.7)'; g.beginPath(); g.arc(x, yy, 7, 0, 7); g.fill();
      g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(x, yy, 3.5, 0, 7); g.fill();
    }
    g.restore();
  });
  return tex(c, { aniso: 8 });
}

/**
 * Pichações: atlas 4×4 (512×256 cada) em 2048×1024. Tags cursivas,
 * "throw-ups" de letras-bolha com contorno, estênceis militares/avisos
 * (cirílico/árabe — "ДЕТИ", "НЕ СТРЕЛЯТЬ", setas, X de busca), símbolos
 * e respingos com escorrido. Palavras inventadas ou genéricas.
 */
export const GRAFFITI_N = 16;
export function graffitiRect(i) {
  const c = i % 4, rr = Math.floor(i / 4);
  return [c / 4, 1 - (rr + 1) / 4, (c + 1) / 4, 1 - rr / 4];
}
export function graffitiTexture(seed = 17) {
  const r = mulberry(seed);
  const [c, g] = canvas(2048, 1024);
  const F = '"DejaVu Sans", "FreeSans", "Liberation Sans", sans-serif';
  const cols = ['#c8261e', '#141414', '#1f7a3e', '#1d47b8', '#e9e6dc', '#e08a10', '#8d2bb0', '#2aa6b8'];
  const words = ['ZEKO', 'RAVN', 'KRS', 'MAOZ', 'TOXA', 'ВИТЯ', 'SEKT', 'DUSE', 'GORA', 'NIX', 'ОЛЕГ', 'BRAK'];
  const drips = (x0, x1, y, col, n) => {
    g.strokeStyle = col; g.lineCap = 'round';
    for (let k = 0; k < n; k++) {
      const x = x0 + r() * (x1 - x0);
      g.lineWidth = 1.5 + r() * 2.5;
      g.globalAlpha = 0.75;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y + 10 + r() * 50); g.stroke();
    }
    g.globalAlpha = 1;
  };
  const kinds = ['tag', 'bubble', 'stencil', 'tag', 'sym', 'bubble', 'stencil', 'tag', 'tag', 'bubble', 'stencil', 'sym', 'tag', 'bubble', 'stencil', 'tag'];
  const stencils = ['ДЕТИ', 'НЕ СТРЕЛЯТЬ', 'ЛЮДИ', 'МИН НЕТ', 'أطفال', 'ВЫХОД →'];
  let si = 0, wi = 0;
  for (let i = 0; i < 16; i++) {
    const ox = (i % 4) * 512, oy = Math.floor(i / 4) * 256;
    g.save();
    g.beginPath(); g.rect(ox, oy, 512, 256); g.clip();
    g.translate(ox + 256, oy + 128);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round'; g.lineCap = 'round';
    const kind = kinds[i];
    const col = cols[Math.floor(r() * cols.length)];
    if (kind === 'tag') {
      const w = words[wi++ % words.length];
      g.rotate((r() - 0.5) * 0.35);
      g.transform(1, 0, -0.35 - r() * 0.2, 1, 0, 0);
      g.font = `italic bold ${70 + r() * 40}px ${F}`;
      g.strokeStyle = col; g.lineWidth = 5 + r() * 4; g.globalAlpha = 0.9;
      g.strokeText(w, 0, 0);
      // sublinhado/floreio
      g.beginPath(); g.moveTo(-170, 45); g.quadraticCurveTo(0, 75 + r() * 20, 180, 30); g.stroke();
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
      drips(ox + 120, ox + 400, oy + 150, col, 5);
    } else if (kind === 'bubble') {
      const w = words[wi++ % words.length].slice(0, 4);
      const fill = cols[Math.floor(r() * cols.length)];
      g.rotate((r() - 0.5) * 0.2);
      g.font = `bold ${110 + r() * 20}px ${F}`;
      g.strokeStyle = '#111'; g.lineWidth = 26; g.strokeText(w, 0, 6);
      g.strokeStyle = '#eee'; g.lineWidth = 14; g.strokeText(w, 0, 6);
      g.fillStyle = fill; g.fillText(w, 0, 6);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-200, -30, 400, 10);
      g.setTransform(1, 0, 0, 1, 0, 0);
      drips(ox + 140, ox + 380, oy + 175, fill, 4);
    } else if (kind === 'stencil') {
      const w = stencils[si++ % stencils.length];
      g.font = `bold ${w.length > 8 ? 54 : 84}px ${F}`;
      g.fillStyle = r() < 0.5 ? '#151515' : '#c8261e';
      g.globalAlpha = 0.88;
      g.fillText(w, 0, 0);
      // pontes do estêncil
      g.globalCompositeOperation = 'destination-out';
      for (let x = -240; x < 240; x += 30 + r() * 20) g.fillRect(x, -60, 3, 120);
      g.globalCompositeOperation = 'source-over';
      // overspray
      for (let k = 0; k < 500; k++) {
        g.fillStyle = 'rgba(20,20,20,0.12)';
        g.fillRect((r() - 0.5) * 460, (r() - 0.5) * 140, 1.5, 1.5);
      }
      g.globalAlpha = 1;
    } else {
      // símbolos: X de busca com data/números, alvo, seta e cruz
      g.strokeStyle = col; g.lineWidth = 9; g.globalAlpha = 0.9;
      const v = Math.floor(r() * 3);
      if (v === 0) {
        g.beginPath(); g.moveTo(-90, -90); g.lineTo(90, 90); g.moveTo(90, -90); g.lineTo(-90, 90); g.stroke();
        g.font = `bold 34px ${F}`; g.fillStyle = col;
        g.fillText(String(10 + Math.floor(r() * 20)) + '/0' + (1 + Math.floor(r() * 9)), 0, -72);
        g.fillText(String(Math.floor(r() * 5)), -72, 0);
      } else if (v === 1) {
        g.beginPath(); g.arc(0, 0, 80, 0, 7); g.moveTo(-110, 0); g.lineTo(110, 0); g.moveTo(0, -110); g.lineTo(0, 110); g.stroke();
      } else {
        g.beginPath(); g.moveTo(-180, 0); g.lineTo(140, 0); g.moveTo(90, -50); g.lineTo(150, 0); g.lineTo(90, 50); g.stroke();
      }
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
      drips(ox + 160, ox + 360, oy + 160, col, 3);
    }
    g.restore();
    // poeira por cima: tinta velha desbotada e falhada
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 250; k++) {
      g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.5})`;
      g.fillRect(ox + r() * 512, oy + r() * 256, 1 + r() * 4, 1 + r() * 4);
    }
    g.restore();
  }
  return tex(c, { aniso: 4 });
}

/** Tinta de rua gasta (branca), alfa com falhas. 256×256, repetível em v. */
export function roadPaintTexture(seed = 19) {
  const r = mulberry(seed);
  const [c, g] = canvas(128, 512);
  // tinta branca-creme suja (albedo ~0.6, não "brilha"), gasta pelos pneus
  g.fillStyle = 'rgba(196,190,172,0.9)';
  g.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 400; i++) {
    const x = r() * 128, y = r() * 512, rr = 2 + r() * 10;
    g.fillStyle = `rgba(${90 + r() * 40},${85 + r() * 35},${75 + r() * 30},${0.08 + r() * 0.18})`;
    g.beginPath();
    g.arc(x, y, rr, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'destination-out';
  // lascas: muitas pequenas, algumas placas grandes, bordas roídas
  for (let i = 0; i < 1600; i++) {
    const x = r() * 128, y = r() * 512, rr = 0.8 + r() * (r() < 0.06 ? 26 : 5);
    g.fillStyle = `rgba(0,0,0,${0.35 + r() * 0.65})`;
    g.beginPath();
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const q = rr * (0.5 + r() * 0.8);
      g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q);
    }
    g.fill();
  }
  for (let y = 0; y < 512; y += 2) {
    g.fillStyle = 'rgba(0,0,0,0.9)';
    g.fillRect(0, y, 3 + r() * 9, 2);
    g.fillRect(128 - 3 - r() * 9, y, 12, 2);
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Manchas no chão (óleo, queimado, poça seca) — atlas 2×2. */
export function stainsTexture(seed = 23) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  const kinds = [
    [12, 10, 8, 0.5],   // óleo
    [6, 5, 4, 0.75],    // queimado (explosão)
    [60, 50, 38, 0.35], // poeira/areia
    [20, 18, 15, 0.4],  // mancha úmida
  ];
  kinds.forEach(([rr, gg, bb, a], i) => {
    const ox = (i % 2) * 256 + 128, oy = Math.floor(i / 2) * 256 + 128;
    for (let k = 0; k < 60; k++) {
      const ang = r() * Math.PI * 2, d = Math.pow(r(), 1.5) * 90;
      const x = ox + Math.cos(ang) * d, y = oy + Math.sin(ang) * d;
      const rad = 10 + r() * 40 * (1 - d / 120);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(${rr},${gg},${bb},${a * 0.35})`);
      grd.addColorStop(1, `rgba(${rr},${gg},${bb},0)`);
      g.fillStyle = grd;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    if (i === 1) {
      // raios da explosão
      g.strokeStyle = 'rgba(5,4,3,0.35)';
      for (let k = 0; k < 40; k++) {
        const ang = r() * Math.PI * 2;
        g.lineWidth = 1 + r() * 4;
        g.beginPath();
        g.moveTo(ox + Math.cos(ang) * 30, oy + Math.sin(ang) * 30);
        g.lineTo(ox + Math.cos(ang) * (80 + r() * 45), oy + Math.sin(ang) * (80 + r() * 45));
        g.stroke();
      }
    }
  });
  return tex(c);
}

/** Folhagem: aglomerado de folhas com alfa (para cartões instanciados). */
export function leavesTexture(seed = 29, palm = false) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  if (palm) {
    // fronde de palmeira: ráquis central + folíolos
    g.translate(256, 500);
    g.strokeStyle = '#4a4a22';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(20, -250, 0, -490);
    g.stroke();
    for (let i = 0; i < 46; i++) {
      const t = i / 46;
      const y = -t * 480;
      const x = Math.sin(t * 3) * 8;
      const len = 150 * Math.sin(t * Math.PI) + 30;
      for (const s of [-1, 1]) {
        const hue = 70 + r() * 25;
        g.strokeStyle = `hsl(${hue},${35 + r() * 20}%,${20 + r() * 14}%)`;
        g.lineWidth = 5 + r() * 3;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + s * len * 0.5, y - 20, x + s * len, y + 30 + r() * 30);
        g.stroke();
      }
    }
    return tex(c);
  }
  for (let i = 0; i < 520; i++) {
    const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * 220;
    const x = 256 + Math.cos(ang) * d, y = 256 + Math.sin(ang) * d * 0.9;
    const l = 14 + r() * 16, w = l * 0.45;
    const hue = 60 + r() * 45;
    const lit = 18 + r() * 22 + (y < 256 ? 8 : -4);
    g.fillStyle = `hsl(${hue},${30 + r() * 25}%,${lit}%)`;
    g.save();
    g.translate(x, y);
    g.rotate(r() * Math.PI * 2);
    g.beginPath();
    g.ellipse(0, 0, l, w, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // galhinhos
  g.strokeStyle = '#3b2e22';
  g.lineWidth = 3;
  for (let i = 0; i < 12; i++) {
    g.beginPath();
    g.moveTo(256, 256);
    const ang = r() * Math.PI * 2;
    g.lineTo(256 + Math.cos(ang) * 150, 256 + Math.sin(ang) * 150);
    g.stroke();
  }
  return tex(c);
}

/** Mato/capim seco em tufos (cartões cruzados). */
export function grassTexture(seed = 31) {
  const r = mulberry(seed);
  const [c, g] = canvas(256, 256);
  for (let i = 0; i < 90; i++) {
    const x = 20 + r() * 216;
    const h = 60 + r() * 180;
    const bend = (r() - 0.5) * 60;
    const dry = r();
    g.strokeStyle = `hsl(${45 + dry * 40},${25 + r() * 25}%,${22 + dry * 22}%)`;
    g.lineWidth = 1.5 + r() * 2.5;
    g.beginPath();
    g.moveTo(x, 256);
    g.quadraticCurveTo(x + bend * 0.3, 256 - h * 0.5, x + bend, 256 - h);
    g.stroke();
  }
  return tex(c);
}

/**
 * Caixa de munição de madeira (face 0..1): tábuas horizontais pintadas de
 * verde-oliva, juntas escuras, tinta lascada mostrando madeira, estêncil
 * amarelo (calibre/lote) e marcas de manuseio. Retorna { map, normalMap }.
 */
export function crateTexture(seed = 43) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  const [hc, hg] = canvas(512, 512);
  hg.fillStyle = 'rgb(140,140,140)';
  hg.fillRect(0, 0, 512, 512);
  const planks = 4;
  for (let i = 0; i < planks; i++) {
    const y = (i * 512) / planks;
    const t = r();
    g.fillStyle = `rgb(${98 + t * 16},${108 + t * 14},${70 + t * 12})`;
    g.fillRect(0, y, 512, 512 / planks);
    // veio da madeira sob a tinta
    for (let k = 0; k < 40; k++) {
      g.strokeStyle = `rgba(30,35,20,${0.05 + r() * 0.08})`;
      g.lineWidth = 1 + r() * 2;
      const yy = y + r() * (512 / planks);
      g.beginPath(); g.moveTo(0, yy); g.bezierCurveTo(170, yy + (r() - 0.5) * 8, 340, yy + (r() - 0.5) * 8, 512, yy + (r() - 0.5) * 6); g.stroke();
    }
    hg.fillStyle = 'rgb(40,40,40)';
    hg.fillRect(0, y, 512, 5);
    g.fillStyle = 'rgba(15,15,10,0.85)';
    g.fillRect(0, y, 512, 4);
  }
  // lascas de tinta (madeira clara aparecendo)
  for (let k = 0; k < 160; k++) {
    const x = r() * 512, y = r() * 512, rr = 1 + r() * (r() < 0.1 ? 10 : 4);
    blob(g, r, x, y, rr, 7, 0.6);
    g.fillStyle = `rgba(${150 + r() * 40},${120 + r() * 30},${80 + r() * 20},0.9)`;
    g.fill();
  }
  // estêncil
  g.fillStyle = 'rgba(214,190,90,0.92)';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 54px "DejaVu Sans Mono", "Liberation Mono", monospace';
  g.fillText('7,62×39', 256, 200);
  g.font = 'bold 34px "DejaVu Sans Mono", "Liberation Mono", monospace';
  g.fillText('ПС  1×440', 256, 262);
  g.font = '26px "DejaVu Sans Mono", "Liberation Mono", monospace';
  g.fillText('17-' + (10 + Math.floor(r() * 80)) + '-24', 256, 312);
  g.globalCompositeOperation = 'destination-out';
  for (let k = 0; k < 500; k++) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(140 + r() * 240, 170 + r() * 160, 2, 2); }
  g.globalCompositeOperation = 'source-over';
  // faixa de manuseio / sujeira na base
  const grd = g.createLinearGradient(0, 380, 0, 512);
  grd.addColorStop(0, 'rgba(40,30,20,0)');
  grd.addColorStop(1, 'rgba(40,30,20,0.55)');
  g.fillStyle = grd; g.fillRect(0, 380, 512, 132);
  return { map: tex(c), normalMap: canvasNormal(hc, 3) };
}

/** Cacos de vidro espalhados (triângulos claros, alguns grandes). */
export function shardsTexture(seed = 47) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  for (let i = 0; i < 420; i++) {
    const d = Math.pow(r(), 0.7) * 240, a = r() * Math.PI * 2;
    const x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d;
    const s = (r() < 0.08 ? 16 : 4) + r() * 8;
    g.fillStyle = `rgba(${200 + r() * 55},${215 + r() * 40},${220 + r() * 35},${0.35 + r() * 0.4})`;
    g.beginPath();
    g.moveTo(x + (r() - 0.5) * s, y + (r() - 0.5) * s);
    g.lineTo(x + (r() - 0.5) * s, y + (r() - 0.5) * s);
    g.lineTo(x + (r() - 0.5) * s, y + (r() - 0.5) * s);
    g.fill();
  }
  return tex(c);
}

/** Atlas de lixo miúdo: papéis, papelão, sacos — 4×4. */
export function trashTexture(seed = 37) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  for (let i = 0; i < 16; i++) {
    const ox = (i % 4) * 128 + 64, oy = Math.floor(i / 4) * 128 + 64;
    g.save();
    g.translate(ox, oy);
    g.rotate(r() * Math.PI);
    const kind = i % 4;
    if (kind === 0) { g.fillStyle = `hsl(40,${10 + r() * 15}%,${70 + r() * 15}%)`; g.fillRect(-30, -40, 60, 80); g.fillStyle = 'rgba(40,40,40,0.5)'; for (let l = 0; l < 6; l++) g.fillRect(-22, -30 + l * 10, 40 * r() + 4, 2); }
    if (kind === 1) { g.fillStyle = `hsl(30,${35 + r() * 10}%,${38 + r() * 12}%)`; g.fillRect(-50, -40, 100, 80); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.strokeRect(-50, -40, 100, 80); }
    if (kind === 2) { g.fillStyle = r() < 0.5 ? '#a8a294' : '#d6d4c8'; g.beginPath(); g.ellipse(0, 0, 40 + r() * 15, 25 + r() * 15, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(-10, -8, 15, 6, 0.5, 0, 7); g.fill(); }
    if (kind === 3) { g.fillStyle = `hsl(${r() * 360},22%,42%)`; g.fillRect(-12, -30, 24, 60); g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(-12, -10, 24, 14); }
    g.restore();
  }
  return tex(c);
}

/** Céu: nuvens cúmulo/estrato em mapa cilíndrico (u = azimute, v = altura). */
export function cloudTexture(seed = 41) {
  const r = mulberry(seed);
  const [c, g] = canvas(2048, 512);
  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0, 0, 2048, 512);
  const puff = (x, y, rad, a) => {
    for (const ox of [0, -2048, 2048]) {
      const grd = g.createRadialGradient(x + ox, y, 0, x + ox, y, rad);
      grd.addColorStop(0, `rgba(255,255,255,${a})`);
      grd.addColorStop(0.6, `rgba(255,255,255,${a * 0.5})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x + ox - rad, y - rad, rad * 2, rad * 2);
    }
  };
  // bancos de nuvens: aglomerados perto do horizonte, mais esparsos no alto
  for (let k = 0; k < 34; k++) {
    const cx = r() * 2048;
    const cy = 300 + Math.pow(r(), 0.6) * 170;
    const n = 20 + Math.floor(r() * 30);
    const wide = 60 + r() * 220;
    for (let i = 0; i < n; i++) {
      const x = cx + (r() - 0.5) * wide * 2;
      const y = cy + (r() - 0.5) * wide * 0.25 - r() * 25;
      puff(x, y, 14 + r() * 40 * (1 - (512 - cy) / 400), 0.12 + r() * 0.12);
    }
  }
  // estratos finos altos
  for (let i = 0; i < 80; i++) {
    const x = r() * 2048, y = 80 + r() * 200;
    g.save();
    g.translate(x, y);
    g.scale(6, 1);
    puff(0, 0, 10 + r() * 25, 0.05 + r() * 0.06);
    g.restore();
  }
  const t = tex(c, { aniso: 2 });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
