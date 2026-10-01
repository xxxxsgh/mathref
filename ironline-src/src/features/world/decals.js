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

/** Rachaduras ramificadas + lascas (para paredes). */
export function crackTexture(seed = 7) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  g.lineCap = 'round';
  const branch = (x, y, ang, len, w, depth) => {
    g.strokeStyle = `rgba(15,12,10,${0.5 + w * 0.1})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    let cx = x, cy = y;
    const steps = Math.ceil(len / 8);
    for (let i = 0; i < steps; i++) {
      ang += (r() - 0.5) * 0.7;
      cx += Math.cos(ang) * 8;
      cy += Math.sin(ang) * 8;
      g.lineTo(cx, cy);
      if (depth < 3 && r() < 0.08) branch(cx, cy, ang + (r() - 0.5) * 1.8, len * 0.5, Math.max(0.6, w * 0.6), depth + 1);
    }
    g.stroke();
  };
  for (let i = 0; i < 5; i++) branch(256, 256, r() * Math.PI * 2, 120 + r() * 140, 2.5, 0);
  // lasca central (reboco arrancado)
  g.fillStyle = 'rgba(120,110,100,0.55)';
  g.beginPath();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const rr = 18 + r() * 26;
    g.lineTo(256 + Math.cos(a) * rr, 256 + Math.sin(a) * rr);
  }
  g.fill();
  return tex(c);
}

/** Marcas de tiro: grupo de buracos com halo de reboco lascado. */
export function bulletHolesTexture(seed = 9) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  for (let i = 0; i < 26; i++) {
    const x = 256 + (r() - 0.5) * 380, y = 256 + (r() - 0.5) * 380;
    const s = 6 + r() * 12;
    const halo = g.createRadialGradient(x, y, s * 0.4, x, y, s * 2.6);
    halo.addColorStop(0, 'rgba(170,160,145,0.7)');
    halo.addColorStop(1, 'rgba(170,160,145,0)');
    g.fillStyle = halo;
    g.beginPath();
    g.arc(x, y, s * 2.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(12,10,8,0.95)';
    g.beginPath();
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr = s * (0.35 + r() * 0.3);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
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

/** Atlas de letreiros de loja (8 linhas). Cada letreiro = faixa 1024×128. */
export const SIGN_COUNT = 8;
export function signsTexture(seed = 13) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 1024);
  const signs = [
    { t: 'АПТЕКА', bg: '#1f6b3a', fg: '#f2f2ea' },
    { t: 'ПРОДУКТЫ 24', bg: '#e8e1cf', fg: '#b3261e' },
    { t: 'مخبز', bg: '#2a3f6b', fg: '#f5d76e' },
    { t: 'КАФЕ', bg: '#7b2a1f', fg: '#f0e0c0' },
    { t: 'صيدلية', bg: '#f0efe8', fg: '#1d6b3a' },
    { t: 'РЕМОНТ ОБУВИ', bg: '#c99a2e', fg: '#1b1b1b' },
    { t: 'مطعم الشام', bg: '#1b1b1b', fg: '#e8c25a' },
    { t: 'ГОСТИНИЦА', bg: '#5b6e7a', fg: '#f2f2f2' },
  ];
  signs.forEach((s, i) => {
    const y = i * 128;
    g.fillStyle = s.bg;
    g.fillRect(0, y, 1024, 128);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 8;
    g.strokeRect(6, y + 6, 1012, 116);
    g.fillStyle = s.fg;
    g.font = 'bold 76px "DejaVu Sans", "FreeSans", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(s.t, 512, y + 68);
    // desgaste: manchas, ferrugem escorrendo, desbotado
    for (let k = 0; k < 40; k++) {
      const x = r() * 1024, yy = y + r() * 128, rr = 4 + r() * 30;
      g.fillStyle = `rgba(${r() < 0.5 ? '90,50,25' : '220,215,200'},${0.08 + r() * 0.2})`;
      g.beginPath();
      g.arc(x, yy, rr, 0, Math.PI * 2);
      g.fill();
    }
    for (let k = 0; k < 10; k++) {
      const x = r() * 1024;
      const grd = g.createLinearGradient(0, y + 100, 0, y + 128);
      grd.addColorStop(0, 'rgba(110,55,20,0)');
      grd.addColorStop(1, 'rgba(110,55,20,0.5)');
      g.fillStyle = grd;
      g.fillRect(x, y + 90, 3 + r() * 6, 38);
    }
  });
  return tex(c, { aniso: 8 });
}

/** Pichações abstratas (traços, sem texto legível) — atlas 2×2. */
export function graffitiTexture(seed = 17) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 512);
  const cols = ['#d22', '#111', '#2a6', '#24c', '#eee', '#e90'];
  for (let i = 0; i < 4; i++) {
    const ox = (i % 2) * 512, oy = Math.floor(i / 2) * 256;
    g.save();
    g.beginPath();
    g.rect(ox, oy, 512, 256);
    g.clip();
    g.lineCap = g.lineJoin = 'round';
    const col = cols[(i * 2) % cols.length];
    for (let s = 0; s < 6; s++) {
      g.strokeStyle = col;
      g.lineWidth = 6 + r() * 10;
      g.globalAlpha = 0.85;
      g.beginPath();
      let x = ox + 60 + s * 65, y = oy + 128 + (r() - 0.5) * 80;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (r() - 0.3) * 50;
        y += (r() - 0.5) * 110;
        g.quadraticCurveTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 60, x, y);
      }
      g.stroke();
    }
    // contorno fino + respingos
    g.strokeStyle = cols[(i * 2 + 1) % cols.length];
    g.lineWidth = 2;
    g.globalAlpha = 0.7;
    for (let k = 0; k < 30; k++) {
      g.beginPath();
      g.arc(ox + r() * 512, oy + 30 + r() * 200, 1 + r() * 2, 0, 7);
      g.stroke();
    }
    g.restore();
  }
  g.globalAlpha = 1;
  return tex(c);
}

/** Tinta de rua gasta (branca), alfa com falhas. 256×256, repetível em v. */
export function roadPaintTexture(seed = 19) {
  const r = mulberry(seed);
  const [c, g] = canvas(128, 512);
  g.fillStyle = 'rgba(235,232,220,0.92)';
  g.fillRect(0, 0, 128, 512);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    const x = r() * 128, y = r() * 512, rr = 1 + r() * (r() < 0.1 ? 22 : 6);
    g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`;
    g.beginPath();
    g.arc(x, y, rr, 0, Math.PI * 2);
    g.fill();
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
