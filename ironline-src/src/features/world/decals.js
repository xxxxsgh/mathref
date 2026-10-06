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

// Escala das texturas de canvas (camadas mobile/lite: 0,5 → ¼ dos pixels,
// da memória e do tempo de rasterização). O desenho continua nas
// coordenadas lógicas (g.scale), então nenhum gerador precisa saber disso.
let SCALE = 1;
export function setCanvasScale(s) {
  SCALE = Math.max(0.25, Math.min(1, s || 1));
}

/** Canvas na escala da camada (também usado por vegetation.js e road.js). */
export function canvas(w, h, read = false) {
  const c = document.createElement('canvas');
  // só encolhe as grandes; as de 128² (contato, pintura) usam ImageData fixo
  const k = SCALE < 1 && Math.min(w, h) >= 256 ? SCALE : 1;
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.__k = k;
  // read: mapa de altura lido de volta (getImageData) → canvas em CPU. Num
  // canvas acelerado a leitura força a GPU a rasterizar e copiar tudo de
  // volta (segundos no SwiftShader, travadas no celular)
  const g = c.getContext('2d', read ? { willReadFrequently: true } : undefined);
  if (k !== 1) g.scale(k, k);
  return [c, g];
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
  // canvas reduzido: o mesmo relevo cabe em menos pixels (gradiente maior)
  strength *= c.__k || 1;
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
  const [hc, hg] = canvas(512, 512, true);
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
    g.strokeStyle = 'rgba(38,33,28,0.7)';
    g.lineWidth = w * 0.8;
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
  // atlas 2×2 de padrões DIFERENTES (rajada longa, grupo denso, impactos
  // soltos de calibre variado, metralhadora pesada) — nada se repete igual
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 1024);
  const [hc, hg] = canvas(1024, 1024, true);
  hg.fillStyle = 'rgb(128,128,128)';
  hg.fillRect(0, 0, 1024, 1024);
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * 512, oy = Math.floor(t / 2) * 512;
    const holes = [];
    if (t === 0) {
      // rajada longa levemente inclinada subindo (recuo)
      const x0 = 50 + r() * 60, y0 = 300 + r() * 80, ang = -0.25 - r() * 0.2, n = 9 + Math.floor(r() * 4);
      for (let i = 0; i < n; i++) holes.push([x0 + i * (34 + r() * 14), y0 + Math.sin(ang) * i * 34 + (r() - 0.5) * 24, 4 + r() * 4]);
      for (let i = 0; i < 4; i++) holes.push([60 + r() * 392, 60 + r() * 392, 3 + r() * 3]);
    } else if (t === 1) {
      // grupo denso (alguém se escondeu aqui)
      const cx = 256 + (r() - 0.5) * 80, cy = 256 + (r() - 0.5) * 80;
      for (let i = 0; i < 22; i++) {
        const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * 150;
        holes.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 3 + r() * 4.5]);
      }
    } else if (t === 2) {
      // poucos impactos espalhados, um de calibre grande
      for (let i = 0; i < 6; i++) holes.push([60 + r() * 392, 60 + r() * 392, 3.5 + r() * 4]);
      holes.push([200 + r() * 112, 200 + r() * 112, 14 + r() * 4]);
    } else {
      // metralhadora pesada: crateras grandes em linha
      const y0 = 220 + r() * 70;
      for (let i = 0; i < 5; i++) holes.push([70 + i * (80 + r() * 20), y0 + (r() - 0.5) * 60, 10 + r() * 7]);
    }
    for (const [hx, hy, s] of holes) {
      const x = ox + hx, y = oy + hy;
      if (hx < 24 || hx > 488 || hy < 24 || hy > 488) continue;
      // cratera lascada (cimento claro sob o reboco), tamanho/irregularidade variados
      const cr = s * (1.8 + r() * 1.1);
      blob(g, r, x, y, cr, 13, 0.5 + r() * 0.3);
      g.fillStyle = `rgba(${138 + r() * 30},${132 + r() * 24},${120 + r() * 20},${0.75 + r() * 0.2})`;
      g.fill();
      blob(hg, r, x, y, cr, 13, 0.55);
      hg.fillStyle = 'rgb(92,92,92)';
      hg.fill();
      g.strokeStyle = 'rgba(40,35,30,0.3)';
      g.lineWidth = 1.2;
      g.stroke();
      // trincas radiais finas
      const nk = 2 + Math.floor(r() * 4);
      for (let k = 0; k < nk; k++) {
        const a = r() * Math.PI * 2, l = s * (2 + r() * 3);
        g.strokeStyle = 'rgba(25,20,16,0.45)';
        g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      // fuligem de pó em volta (impacto recente) em alguns
      if (r() < 0.4) {
        const gr = g.createRadialGradient(x, y, cr * 0.6, x, y, cr * 2.4);
        gr.addColorStop(0, 'rgba(60,55,50,0.25)');
        gr.addColorStop(1, 'rgba(60,55,50,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(x, y, cr * 2.4, 0, Math.PI * 2); g.fill();
      }
      // miolo escuro
      blob(g, r, x, y, s * (0.55 + r() * 0.3), 9, 0.5);
      g.fillStyle = 'rgba(14,12,10,0.95)';
      g.fill();
      blob(hg, r, x, y, s * 0.7, 9, 0.5);
      hg.fillStyle = 'rgb(0,0,0)';
      hg.fill();
    }
  }
  return { map: tex(c), normalMap: canvasNormal(hc, 4) };
}
/**
 * Furos de bala em CHAPA (carros, caçambas, portas de aço): furo pequeno
 * e limpo, borda de metal nu repuxada (anel claro fino), tinta lascada em
 * volta e um escorrido de ferrugem em alguns. Mesmo layout 2×2 do atlas de
 * reboco (bulletRect serve para os dois).
 */
export function metalHolesTexture(seed = 31) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 1024);
  const [hc, hg] = canvas(1024, 1024, true);
  hg.fillStyle = 'rgb(128,128,128)';
  hg.fillRect(0, 0, 1024, 1024);
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * 512, oy = Math.floor(t / 2) * 512;
    const holes = [];
    const n = [10, 18, 6, 4][t];
    const cx = 256 + (r() - 0.5) * 120, cy = 256 + (r() - 0.5) * 120;
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), t === 1 ? 0.8 : 0.5) * (t === 0 ? 200 : 170);
      holes.push([cx + Math.cos(a) * d * (t === 0 ? 1.2 : 1), cy + Math.sin(a) * d * (t === 0 ? 0.35 : 0.8), t === 3 ? 7 + r() * 4 : 2.6 + r() * 2.2]);
    }
    for (const [hx, hy, s] of holes) {
      if (hx < 30 || hx > 482 || hy < 30 || hy > 482) continue;
      const x = ox + hx, y = oy + hy;
      // tinta lascada (mostra primer cinza) em volta
      blob(g, r, x, y, s * (2.2 + r() * 1.6), 11, 0.6);
      g.fillStyle = `rgba(${120 + r() * 25},${118 + r() * 20},${112 + r() * 15},${0.55 + r() * 0.3})`;
      g.fill();
      // escorrido de ferrugem abaixo (furos antigos)
      if (r() < 0.45) {
        const l = s * (6 + r() * 14);
        const grd = g.createLinearGradient(0, y, 0, y + l);
        grd.addColorStop(0, 'rgba(110,52,20,0.7)');
        grd.addColorStop(1, 'rgba(110,52,20,0)');
        g.fillStyle = grd;
        g.fillRect(x - s * 0.5, y, s * (0.8 + r() * 0.6), l);
      }
      // anel de metal nu repuxado (claro) + relevo saliente
      g.beginPath(); g.arc(x, y, s * 1.25, 0, Math.PI * 2);
      g.fillStyle = 'rgba(176,172,164,0.95)'; g.fill();
      hg.beginPath(); hg.arc(x, y, s * 1.35, 0, Math.PI * 2);
      hg.fillStyle = 'rgb(190,190,190)'; hg.fill();
      // furo
      blob(g, r, x, y, s * 0.8, 8, 0.25);
      g.fillStyle = 'rgba(6,5,4,1)'; g.fill();
      blob(hg, r, x, y, s * 0.8, 8, 0.25);
      hg.fillStyle = 'rgb(0,0,0)'; hg.fill();
    }
  }
  return { map: tex(c), normalMap: canvasNormal(hc, 3) };
}
/** Retângulo de UV de uma variante (0..3) do atlas de tiros. */
export const bulletRect = (q) => [(q % 2) * 0.5, 0.5 - Math.floor(q / 2) * 0.5, (q % 2) * 0.5 + 0.5, 1 - Math.floor(q / 2) * 0.5];

/**
 * Lascas grandes de reboco (atlas 2×2): reboco arrancado expondo tijolo e
 * cimento, com borda de tinta descolando. Para quinas, vergas e rombos.
 */
export function chipsTexture(seed = 15) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 1024);
  const [hc, hg] = canvas(1024, 1024, true);
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
    // ── guerra/tempo: desbotado pelo sol, encardido, escorridos, lascas, quebras ──
    g.globalCompositeOperation = 'saturation';
    g.fillStyle = `rgba(128,128,128,${0.3 + r() * 0.35})`;
    g.fillRect(0, y, 1024, 128);
    g.globalCompositeOperation = 'multiply';
    for (let k = 0; k < 14; k++) {
      const x = r() * 1024, yy = y + r() * 128, rr = 30 + r() * 120;
      const grd = g.createRadialGradient(x, yy, 0, x, yy, rr);
      const a = 0.12 + r() * 0.25;
      grd.addColorStop(0, `rgba(118,104,86,${a})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x - rr, yy - rr, rr * 2, rr * 2);
    }
    // escorridos de chuva a partir da borda de cima
    for (let k = 0; k < 22; k++) {
      const x = r() * 1024, l = 30 + r() * 98;
      const grd = g.createLinearGradient(0, y, 0, y + l);
      grd.addColorStop(0, `rgba(95,82,66,${0.25 + r() * 0.35})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x, y, 2 + r() * 10, l);
    }
    // fuligem subindo da base (incêndio na loja) em algumas
    if (r() < 0.4) {
      const grd = g.createLinearGradient(0, y + 128, 0, y);
      grd.addColorStop(0, 'rgba(30,26,22,0.75)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(r() * 500, y, 300 + r() * 500, 128);
    }
    g.globalCompositeOperation = 'source-over';
    // lascas de tinta (chapa cinza/ferrugem por baixo)
    for (let k = 0; k < 60; k++) {
      const x = r() * 1024, yy = y + r() * 128, rr = 1.5 + r() * (r() < 0.1 ? 14 : 5);
      g.fillStyle = r() < 0.5 ? `rgba(${120 + r() * 30},${118 + r() * 25},${112 + r() * 20},0.9)` : `rgba(${95 + r() * 30},${52 + r() * 15},${28 + r() * 10},0.85)`;
      g.beginPath();
      for (let q = 0; q < 6; q++) {
        const a = (q / 6) * Math.PI * 2;
        g.lineTo(x + Math.cos(a) * rr * (0.5 + r()), yy + Math.sin(a) * rr * (0.5 + r()));
      }
      g.fill();
    }
    // pedaço quebrado/arrancado (aparece a caixa escura atrás) numa borda
    if (r() < 0.45) {
      const x0 = r() < 0.5 ? r() * 200 : 824 + r() * 200, top = r() < 0.5;
      g.fillStyle = '#26241f';
      g.beginPath();
      g.moveTo(x0 - 40 - r() * 60, top ? y : y + 128);
      for (let q = 0; q < 5; q++) g.lineTo(x0 - 40 + q * 25 + (r() - 0.5) * 20, (top ? y : y + 128) + (top ? 1 : -1) * (20 + r() * 60));
      g.lineTo(x0 + 80 + r() * 60, top ? y : y + 128);
      g.fill();
    }
    // tinta das letras descascada: pedaços das letras somem (cor de fundo
    // desbotada por cima, contorno roído)
    for (let k = 0, nl = 4 + Math.floor(r() * 6); k < nl; k++) {
      const x = 150 + r() * 724, yy = y + 30 + r() * 70, rr = 8 + r() * 26;
      g.fillStyle = sg.bg;
      g.globalAlpha = 0.6 + r() * 0.35;
      g.beginPath();
      for (let q = 0; q < 9; q++) {
        const a = (q / 9) * Math.PI * 2;
        g.lineTo(x + Math.cos(a) * rr * (0.4 + r() * 0.9), yy + Math.sin(a) * rr * (0.4 + r() * 0.9));
      }
      g.fill();
      g.globalAlpha = 1;
    }
    // sol: metade de cima mais desbotada (lavada), cores menos saturadas
    g.globalCompositeOperation = 'screen';
    const sb = g.createLinearGradient(0, y, 0, y + 128);
    sb.addColorStop(0, `rgba(120,112,98,${0.25 + r() * 0.25})`);
    sb.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sb; g.fillRect(0, y, 1024, 128);
    // pó/fuligem geral em manchas grandes (não uniforme) + borda encardida
    g.globalCompositeOperation = 'multiply';
    for (let k = 0; k < 8; k++) {
      const x = r() * 1024, yy = y + r() * 128, rr = 60 + r() * 200;
      const grd = g.createRadialGradient(x, yy, 0, x, yy, rr);
      grd.addColorStop(0, `rgba(105,92,76,${0.3 + r() * 0.35})`);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(x - rr, yy - rr, rr * 2, rr * 2);
    }
    const eg = g.createLinearGradient(0, y, 0, y + 128);
    eg.addColorStop(0, 'rgba(80,70,58,0.55)'); eg.addColorStop(0.12, 'rgba(255,255,255,0)');
    eg.addColorStop(0.85, 'rgba(255,255,255,0)'); eg.addColorStop(1, 'rgba(70,60,50,0.7)');
    g.fillStyle = eg; g.fillRect(0, y, 1024, 128);
    g.globalCompositeOperation = 'source-over';
    const nh = 2 + Math.floor(r() * 7);
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
  // tinta spray desbotada pelo sol (realismo: nada de cor saturada "de jogo")
  const cols = ['#8e2d24', '#1b1a19', '#3f5a43', '#38507a', '#c9c4b6', '#9a6d32', '#58435f', '#4b7478'];
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
      g.strokeStyle = '#161514'; g.lineWidth = 26; g.strokeText(w, 0, 6);
      g.strokeStyle = '#cfcbbf'; g.lineWidth = 14; g.strokeText(w, 0, 6);
      g.fillStyle = fill; g.fillText(w, 0, 6);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-200, -30, 400, 10);
      g.setTransform(1, 0, 0, 1, 0, 0);
      drips(ox + 140, ox + 380, oy + 175, fill, 4);
    } else if (kind === 'stencil') {
      const w = stencils[si++ % stencils.length];
      g.font = `bold ${w.length > 8 ? 54 : 84}px ${F}`;
      g.fillStyle = r() < 0.5 ? '#171615' : '#8e2d24';
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
    // poeira por cima: tinta velha desbotada e falhada — manchas grandes
    // de desgaste (chuva/sol), lascas e poros do reboco aparecendo
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 7; k++) {
      const x = ox + r() * 512, y = oy + r() * 256, rr = 40 + r() * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, `rgba(0,0,0,${0.25 + r() * 0.35})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let k = 0; k < 1600; k++) {
      g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`;
      const w = 1 + r() * r() * 9;
      g.fillRect(ox + r() * 512, oy + r() * 256, w, w * (0.5 + r()));
    }
    // escorrido vertical de chuva lavando a tinta
    for (let k = 0; k < 40; k++) {
      g.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.15})`;
      g.fillRect(ox + r() * 512, oy + r() * 128, 2 + r() * 5, 60 + r() * 180);
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
 * Caixa de munição de madeira — ATLAS 1024×1024 com faces DIFERENTES:
 *   quadrante (0,0)-(.5,.5)  lateral longa, estêncil variante A
 *   quadrante (.5,0)-(1,.5)  lateral longa, estêncil variante B / sem texto
 *   quadrante (0,.5)-(.5,1)  cabeceira (tábuas verticais, sem texto)
 *   quadrante (.5,.5)-(1,1)  tampa (tábuas longas, marcas de bota/manuseio)
 * Tinta oliva fosca e desbotada (não verde de desenho), madeira crua nas
 * lascas e quinas, sujeira de mão, escorridos e pó nas juntas. O estêncil é
 * apagado em pontos (spray gasto). Retorna { map, normalMap, rect }.
 */
export function crateTexture(seed = 43) {
  const r = mulberry(seed);
  const S = 1024, Q = 512;
  const [c, g] = canvas(S, S);
  const [hc, hg] = canvas(S, S, true);
  hg.fillStyle = 'rgb(140,140,140)';
  hg.fillRect(0, 0, S, S);
  const quad = (qx, qy, vertical, planks, stencil) => {
    const X = qx * Q, Y = qy * Q;
    g.save(); hg.save();
    g.beginPath(); g.rect(X, Y, Q, Q); g.clip();
    hg.beginPath(); hg.rect(X, Y, Q, Q); hg.clip();
    for (let i = 0; i < planks; i++) {
      const t = r();
      const p0 = (i * Q) / planks, pw = Q / planks;
      // oliva militar fosco, cada tábua com tom próprio (lote de tinta/sol)
      const R = 84 + t * 18, G = 88 + t * 14, B = 60 + t * 10;
      g.fillStyle = `rgb(${R},${G},${B})`;
      if (vertical) g.fillRect(X + p0, Y, pw, Q); else g.fillRect(X, Y + p0, Q, pw);
      // veio da madeira sob a tinta + nós
      for (let k = 0; k < 60; k++) {
        g.strokeStyle = `rgba(${r() < 0.5 ? '25,28,15' : '150,140,100'},${0.04 + r() * 0.07})`;
        g.lineWidth = 0.6 + r() * 1.6;
        const o = p0 + r() * pw;
        g.beginPath();
        if (vertical) { g.moveTo(X + o, Y); g.bezierCurveTo(X + o + (r() - 0.5) * 8, Y + 170, X + o + (r() - 0.5) * 8, Y + 340, X + o + (r() - 0.5) * 6, Y + Q); }
        else { g.moveTo(X, Y + o); g.bezierCurveTo(X + 170, Y + o + (r() - 0.5) * 8, X + 340, Y + o + (r() - 0.5) * 8, X + Q, Y + o + (r() - 0.5) * 6); }
        g.stroke();
      }
      if (r() < 0.6) {
        const kx = vertical ? X + p0 + pw * (0.3 + r() * 0.4) : X + r() * Q, ky = vertical ? Y + r() * Q : Y + p0 + pw * (0.3 + r() * 0.4);
        g.fillStyle = 'rgba(40,35,20,0.35)';
        g.beginPath(); g.ellipse(kx, ky, vertical ? 5 : 12, vertical ? 12 : 5, 0, 0, Math.PI * 2); g.fill();
      }
      // junta entre tábuas: fenda escura + relevo
      g.fillStyle = 'rgba(18,16,10,0.9)';
      hg.fillStyle = 'rgb(30,30,30)';
      if (vertical) { g.fillRect(X + p0, Y, 3, Q); hg.fillRect(X + p0 - 1, Y, 5, Q); }
      else { g.fillRect(X, Y + p0, Q, 3); hg.fillRect(X, Y + p0 - 1, Q, 5); }
      // pregos
      for (const e of [0.06, 0.94]) for (const f of [0.3, 0.7]) {
        const nx = vertical ? X + p0 + pw * f : X + Q * e, ny = vertical ? Y + Q * e : Y + p0 + pw * f;
        g.fillStyle = 'rgba(40,32,24,0.9)'; g.beginPath(); g.arc(nx, ny, 3.2, 0, 6.3); g.fill();
        g.fillStyle = 'rgba(120,70,40,0.35)'; g.beginPath(); g.arc(nx, ny + 6, 4, 0, 6.3); g.fill();
        hg.fillStyle = 'rgb(170,170,170)'; hg.beginPath(); hg.arc(nx, ny, 3, 0, 6.3); hg.fill();
      }
    }
    if (stencil) {
      // estêncil de spray creme gasto (pontes do molde, bordas difusas)
      g.save();
      g.translate(X + Q / 2, Y + Q / 2);
      g.rotate((r() - 0.5) * 0.03);
      g.fillStyle = 'rgba(196,184,138,0.78)';
      g.shadowColor = 'rgba(196,184,138,0.5)'; g.shadowBlur = 3;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 50px "DejaVu Sans Mono", "Liberation Mono", monospace';
      g.fillText(stencil[0], 0, -70);
      g.font = 'bold 32px "DejaVu Sans Mono", "Liberation Mono", monospace';
      g.fillText(stencil[1], 0, -10);
      g.font = '24px "DejaVu Sans Mono", "Liberation Mono", monospace';
      g.fillText(stencil[2], 0, 36);
      g.restore();
      // falhas do spray (destination-out só no texto: pinta tinta oliva por cima)
      for (let k = 0; k < 900; k++) {
        const t = r();
        g.fillStyle = `rgba(${84 + t * 18},${88 + t * 14},${60 + t * 10},${0.35 + r() * 0.5})`;
        g.fillRect(X + 90 + r() * 330, Y + 150 + r() * 160, 1 + r() * 3, 1 + r() * 3);
      }
    }
    // lascas de tinta (madeira crua cinza-clara), mais nas bordas do quadrante
    for (let k = 0; k < 260; k++) {
      const edge = r() < 0.6;
      let x = X + r() * Q, y = Y + r() * Q;
      if (edge) { if (r() < 0.5) x = X + (r() < 0.5 ? r() * 30 : Q - r() * 30); else y = Y + (r() < 0.5 ? r() * 30 : Q - r() * 30); }
      const rr = 1 + r() * (r() < 0.1 ? 9 : 3.5);
      blob(g, r, x, y, rr, 7, 0.7);
      g.fillStyle = `rgba(${128 + r() * 30},${118 + r() * 24},${92 + r() * 18},0.92)`;
      g.fill();
      blob(hg, r, x, y, rr, 7, 0.7);
      hg.fillStyle = 'rgb(118,118,118)'; hg.fill();
    }
    // sujeira de mãos/manuseio, escorridos e pó (manchas grandes e suaves)
    for (let k = 0; k < 14; k++) {
      const x = X + r() * Q, y = Y + r() * Q, rad = 30 + r() * 110;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.6;
      grd.addColorStop(0, dark ? `rgba(30,26,18,${0.12 + r() * 0.15})` : `rgba(150,140,115,${0.1 + r() * 0.15})`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(X, Y, Q, Q);
    }
    for (let k = 0; k < 10; k++) {
      const x = X + r() * Q, y0 = Y + r() * Q * 0.5, len = 60 + r() * 220;
      const grd = g.createLinearGradient(0, y0, 0, y0 + len);
      grd.addColorStop(0, 'rgba(35,30,20,0.18)'); grd.addColorStop(1, 'rgba(35,30,20,0)');
      g.fillStyle = grd; g.fillRect(x, y0, 3 + r() * 8, len);
    }
    // base mais suja (respingo do chão)
    const grd = g.createLinearGradient(0, Y + Q * 0.75, 0, Y + Q);
    grd.addColorStop(0, 'rgba(48,38,26,0)'); grd.addColorStop(1, 'rgba(48,38,26,0.5)');
    g.fillStyle = grd; g.fillRect(X, Y + Q * 0.75, Q, Q * 0.25);
    g.restore(); hg.restore();
  };
  quad(0, 0, false, 4, ['7,62×39', 'ПС  1×440', '17-' + (10 + Math.floor(r() * 80)) + '-24']);
  quad(1, 0, false, 4, r() < 0.5 ? ['5,45×39', 'ПС  2×540', '21-' + (10 + Math.floor(r() * 80)) + '-23'] : null);
  quad(0, 1, true, 3, null);
  quad(1, 1, false, 5, null);
  const map = tex(c);
  // canvas: y para baixo; textura com flipY → v = 1 - y/S
  const rect = {
    sideA: [0, 0.5, 0.5, 1], sideB: [0.5, 0.5, 1, 1], end: [0, 0, 0.5, 0.5], lid: [0.5, 0, 1, 0.5],
  };
  return { map, normalMap: canvasNormal(hc, 3), rect };
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

/**
 * Atlas de lixo miúdo 4×4: folhas amassadas, jornal, papelão rasgado,
 * embalagens, latas amassadas, bitucas, panos — tudo sujo de poeira e
 * pisado (nada de recortes brancos limpos). Retorna { map, normalMap }:
 * o relevo de "amassado" pega a luz rasante do sol.
 */
export function trashTexture(seed = 37) {
  const r = mulberry(seed);
  const S = 512, C = 128;
  const [c, g] = canvas(S, S);
  const [hc, hg] = canvas(S, S, true);
  hg.fillStyle = 'rgb(128,128,128)';
  hg.fillRect(0, 0, S, S);
  const dirt = (x0, y0, w, h, a) => {
    for (let k = 0; k < 40; k++) {
      const x = x0 + r() * w, y = y0 + r() * h, rad = 3 + r() * 14;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(${60 + r() * 30},${52 + r() * 25},${40 + r() * 20},${a * r()})`);
      gr.addColorStop(1, 'rgba(60,52,40,0)');
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  };
  // amassado: facetas poligonais claras/escuras na altura
  const crumple = (pts, k = 1) => {
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const m = [cx + (r() - 0.5) * 20, cy + (r() - 0.5) * 20];
      const v = 128 + (r() - 0.5) * 90 * k;
      hg.fillStyle = `rgb(${v},${v},${v})`;
      hg.beginPath(); hg.moveTo(a[0], a[1]); hg.lineTo(b[0], b[1]); hg.lineTo(m[0], m[1]); hg.fill();
      const sh = (v - 128) / 128;
      g.fillStyle = sh > 0 ? `rgba(255,250,240,${sh * 0.12})` : `rgba(0,0,0,${-sh * 0.22})`;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(m[0], m[1]); g.fill();
    }
  };
  const poly = (cx, cy, rad, n, jag) => {
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.3;
      const q = rad * (1 - jag + r() * jag);
      pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q * (0.6 + r() * 0.5)]);
    }
    return pts;
  };
  const fillPoly = (pts, style) => {
    g.fillStyle = style;
    g.beginPath();
    pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.fill();
  };
  for (let i = 0; i < 16; i++) {
    const ox = (i % 4) * C, oy = Math.floor(i / 4) * C;
    const cx = ox + C / 2, cy = oy + C / 2;
    const kind = i % 8;
    g.save();
    hg.save();
    if (kind === 0 || kind === 4) {
      // folha amassada (papel sujo, amarelado)
      const pts = poly(cx, cy, 40 + r() * 10, 9, 0.45);
      fillPoly(pts, `hsl(${38 + r() * 12},${12 + r() * 12}%,${46 + r() * 10}%)`);
      crumple(pts, 1.2);
      g.fillStyle = 'rgba(30,30,30,0.35)';
      for (let l = 0; l < 7; l++) g.fillRect(cx - 24 + r() * 6, cy - 26 + l * 8, 30 + r() * 14, 1.5);
      dirt(cx - 40, cy - 40, 80, 80, 0.5);
    } else if (kind === 1 || kind === 5) {
      // papelão rasgado e pisado
      const pts = poly(cx, cy, 50 + r() * 8, 7, 0.3);
      fillPoly(pts, `hsl(${28 + r() * 6},${30 + r() * 10}%,${30 + r() * 8}%)`);
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 1;
      for (let l = 0; l < 12; l++) { g.beginPath(); g.moveTo(cx - 45, cy - 30 + l * 5); g.lineTo(cx + 45, cy - 30 + l * 5 + (r() - 0.5) * 4); g.stroke(); }
      crumple(pts, 0.6);
      hg.fillStyle = 'rgb(90,90,90)';
      hg.fillRect(cx - 2, cy - 40, 4, 80); // dobra
      dirt(cx - 50, cy - 50, 100, 100, 0.7);
    } else if (kind === 2) {
      // lata amassada (vista de cima, cilindro achatado)
      const hue = r() * 360;
      g.translate(cx, cy); hg.translate(cx, cy);
      const ang = r() * 3;
      g.rotate(ang); hg.rotate(ang);
      const grd = g.createLinearGradient(0, -14, 0, 14);
      grd.addColorStop(0, `hsl(${hue},40%,22%)`); grd.addColorStop(0.45, `hsl(${hue},45%,48%)`); grd.addColorStop(1, `hsl(${hue},40%,18%)`);
      g.fillStyle = grd; g.fillRect(-28, -13, 56, 26);
      g.fillStyle = 'rgba(190,190,185,0.8)'; g.fillRect(-32, -12, 5, 24); g.fillRect(27, -12, 5, 24);
      hg.fillStyle = 'rgb(200,200,200)'; hg.fillRect(-30, -12, 60, 24);
      hg.fillStyle = 'rgb(150,150,150)'; hg.fillRect(-6, -13, 8, 26);
      g.setTransform(1, 0, 0, 1, 0, 0); hg.setTransform(1, 0, 0, 1, 0, 0);
      dirt(cx - 30, cy - 20, 60, 40, 0.5);
    } else if (kind === 3) {
      // saco plástico rasgado, amarfanhado (escuro/azulado)
      const pts = poly(cx, cy, 44, 11, 0.55);
      fillPoly(pts, r() < 0.5 ? 'rgb(34,36,40)' : `hsl(${200 + r() * 30},18%,${26 + r() * 10}%)`);
      crumple(pts, 1.8);
      g.fillStyle = 'rgba(255,255,255,0.06)';
      for (let l = 0; l < 6; l++) g.fillRect(cx - 30 + r() * 40, cy - 30 + r() * 50, 14, 2);
    } else if (kind === 6) {
      // jornal (texto em colunas), úmido e manchado
      const pts = poly(cx, cy, 52, 6, 0.2);
      fillPoly(pts, `hsl(45,8%,${50 + r() * 8}%)`);
      g.fillStyle = 'rgba(25,25,25,0.4)';
      for (let col = 0; col < 3; col++) for (let l = 0; l < 10; l++) g.fillRect(cx - 38 + col * 26, cy - 34 + l * 7, 22, 2);
      g.fillStyle = 'rgba(25,25,25,0.55)'; g.fillRect(cx - 38, cy - 44, 70, 6);
      crumple(pts, 0.7);
      dirt(cx - 50, cy - 50, 100, 100, 0.8);
    } else {
      // pano/trapo + bitucas e lascas em volta
      const pts = poly(cx, cy, 36, 10, 0.5);
      fillPoly(pts, `hsl(${r() * 360},${15 + r() * 15}%,${22 + r() * 12}%)`);
      crumple(pts, 1.4);
      for (let k = 0; k < 6; k++) {
        const x = ox + 10 + r() * 108, y = oy + 10 + r() * 108;
        g.fillStyle = r() < 0.5 ? 'rgba(200,180,140,0.9)' : 'rgba(150,140,125,0.9)';
        g.fillRect(x, y, 7, 2.5);
      }
      dirt(cx - 40, cy - 40, 80, 80, 0.6);
    }
    g.restore();
    hg.restore();
  }
  const map = tex(c);
  return { map, normalMap: canvasNormal(hc, 2.5) };
}

/**
 * Sombra de contato (AO de chão sob objetos): mancha radial suave e
 * escura, retangular-arredondada — escurece onde o objeto toca o chão.
 */
export function contactTexture() {
  const [c, g] = canvas(128, 128);
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const u = (x + 0.5) / 64 - 1, v = (y + 0.5) / 64 - 1;
      // superelipse (cantos arredondados) para caber em caixas e carros
      const d = Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25);
      // núcleo escuro largo e queda curta: escurece JUSTO na linha de contato
      const t = Math.min(1, Math.max(0, (d - 0.45) / 0.55));
      const a = Math.pow(1 - t * t * (3 - 2 * t), 1.3) * 0.92;
      const i = (y * 128 + x) * 4;
      img.data[i] = 8; img.data[i + 1] = 7; img.data[i + 2] = 6;
      img.data[i + 3] = Math.min(255, a * 255 * 1.15);
    }
  }
  g.putImageData(img, 0, 0);
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
