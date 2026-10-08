// Decalques: insígnia da facção e matrícula pintadas no casco. Um atlas por
// facção (CanvasTexture 1024×512) e planos finos colados na superfície,
// fundidos numa malha por nave (um draw call). Desgaste por ruído no alfa.
//
// Atlas: [0, .5]–[.25, 1] insígnia (quadrada); seis faixas de matrícula 2:1:
//   faixas 0–1 no quadrante superior direito, 2–5 na metade inferior.
import * as THREE from 'three/webgpu';
import { texture, uv, float, vec3, positionLocal, smoothstep, mix } from 'three/tsl';
import { vnoise } from './tsl.js';

const atlasCache = new Map();
const matCache = new Map();

const PREFIX = { hegemonia: 'HS', frente: 'FL', corsarios: 'XV', guilda: 'GM', vigilantes: '' };

function emblem(g, faction, x, y, s) {
  g.save(); g.translate(x + s / 2, y + s / 2);
  const r = s * 0.42;
  if (faction === 'hegemonia') {
    // sol coroado: disco, 16 raios alternados e anel
    g.fillStyle = '#f2c66a';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, l = i % 2 ? r * 0.82 : r;
      g.beginPath(); g.moveTo(Math.cos(a - 0.09) * r * 0.45, Math.sin(a - 0.09) * r * 0.45); g.lineTo(Math.cos(a) * l, Math.sin(a) * l); g.lineTo(Math.cos(a + 0.09) * r * 0.45, Math.sin(a + 0.09) * r * 0.45); g.fill();
    }
    g.beginPath(); g.arc(0, 0, r * 0.4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1b2433'; g.lineWidth = s * 0.03; g.beginPath(); g.arc(0, 0, r * 0.28, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#1b2433'; g.beginPath(); g.arc(0, 0, r * 0.12, 0, Math.PI * 2); g.fill();
  } else if (faction === 'frente') {
    // estrela de estêncil quebrada (pintada à mão) sobre faixa
    g.fillStyle = '#e8e2d0';
    g.fillRect(-r, r * 0.55, r * 2, r * 0.16);
    g.fillStyle = '#d8532a';
    g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, l = i % 2 ? r * 0.38 : r * 0.92; g.lineTo(Math.cos(a) * l, Math.sin(a) * l); }
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0)'; g.globalCompositeOperation = 'destination-out';
    g.fillRect(-r, -r * 0.05, r * 2, r * 0.09); // pontes do estêncil
    g.fillRect(-r * 0.04, -r, r * 0.08, r * 2);
    g.globalCompositeOperation = 'source-over';
  } else if (faction === 'corsarios') {
    // presa / crescente agressivo
    g.fillStyle = '#d0244f';
    g.beginPath(); g.arc(0, 0, r * 0.95, Math.PI * 0.15, Math.PI * 1.85); g.arc(r * 0.35, 0, r * 0.7, Math.PI * 1.7, Math.PI * 0.3, true); g.closePath(); g.fill();
    g.fillStyle = '#e9e9ee';
    for (let i = 0; i < 3; i++) { const yy = -r * 0.4 + i * r * 0.4; g.beginPath(); g.moveTo(r * 0.05, yy - r * 0.12); g.lineTo(r * 0.55, yy); g.lineTo(r * 0.05, yy + r * 0.12); g.fill(); }
  } else if (faction === 'guilda') {
    // moeda hexagonal com balança
    g.fillStyle = '#f0a81a';
    g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill();
    g.strokeStyle = '#11312e'; g.lineWidth = s * 0.035;
    g.beginPath(); g.moveTo(0, -r * 0.55); g.lineTo(0, r * 0.5); g.moveTo(-r * 0.55, -r * 0.3); g.lineTo(r * 0.55, -r * 0.3); g.stroke();
    for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * 0.5, -r * 0.05, r * 0.22, 0, Math.PI); g.stroke(); }
    g.fillStyle = '#11312e'; g.fillRect(-r * 0.3, r * 0.45, r * 0.6, r * 0.1);
  } else {
    // Vigilantes: glifo (círculo partido com olho)
    g.strokeStyle = '#9fd8ff'; g.lineWidth = s * 0.03;
    g.beginPath(); g.arc(0, 0, r * 0.85, 0.3, Math.PI - 0.3); g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.85, Math.PI + 0.3, -0.3); g.stroke();
    g.fillStyle = '#9fd8ff'; g.beginPath(); g.arc(0, 0, r * 0.18, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

/** Atlas de decalques da facção (cache). */
export function decalAtlas(faction) {
  if (atlasCache.has(faction)) return atlasCache.get(faction);
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  emblem(g, faction, 0, 0, 256);
  const pre = PREFIX[faction] ?? '';
  const col = { hegemonia: '#1b2433', frente: '#efe6cf', corsarios: '#e9e9ee', guilda: '#132a28', vigilantes: '#9fd8ff' }[faction] || '#ddd';
  const strips = [[512, 0], [512, 128], [0, 256], [512, 256], [0, 384], [512, 384]];
  strips.forEach(([x, y], i) => {
    g.save();
    g.fillStyle = col;
    g.font = `700 86px "DejaVu Sans Condensed", "Arial Narrow", sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const txt = faction === 'vigilantes' ? '◇ ◇ ◇' : `${pre}-${String(7 + i * 13).padStart(3, '0')}`;
    g.fillText(txt, x + 256, y + 66);
    // faixa fina de leitura de serviço
    g.font = `600 22px "DejaVu Sans Mono", monospace`;
    g.globalAlpha = 0.85;
    if (faction !== 'vigilantes') g.fillText(faction === 'frente' ? 'NÃO PISE · COMBUSTÍVEL' : 'NÃO PISAR · RCS ATIVO', x + 256, y + 116);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true;
  atlasCache.set(faction, tex);
  return tex;
}

/** Material dos decalques (por facção): tinta fosca com desgaste no alfa. */
export function decalMaterial(faction, wear = 0.3) {
  const key = faction;
  if (matCache.has(key)) return matCache.get(key);
  const tex = decalAtlas(faction);
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false });
  const t = texture(tex, uv());
  const n = vnoise(positionLocal.mul(9.0)).mul(0.6).add(vnoise(positionLocal.mul(31.0)).mul(0.4));
  const keep = smoothstep(float(wear).mul(0.9), float(wear).mul(0.9).add(0.12), n.add(0.25));
  m.colorNode = t.rgb;
  m.opacityNode = t.a.mul(mix(float(1), keep, float(wear > 0 ? 1 : 0)));
  m.roughnessNode = float(0.55);
  m.metalnessNode = float(0.0);
  m.alphaTest = 0.02;
  matCache.set(key, m);
  return m;
}

/** UV do recorte: 'emblem' ou faixa de matrícula k (0..5). */
function rect(kind, k = 0) {
  if (kind === 'emblem') return [0, 0.5, 0.25, 1];
  const strips = [[0.5, 0.75], [0.5, 0.5], [0, 0.25], [0.5, 0.25], [0, 0], [0.5, 0]];
  const [u0, v0] = strips[k % 6];
  return [u0, v0, u0 + 0.5, v0 + 0.25];
}

/**
 * Geometria de um decalque: plano w×h centrado em pos, voltado para `normal`,
 * com o "cima" do desenho alinhado a `up` (projetado no plano).
 */
export function decalGeometry(pos, normal, w, h, kind, k = 0, up = new THREE.Vector3(0, 1, 0)) {
  const z = normal.clone().normalize();
  let y = up.clone().addScaledVector(z, -up.dot(z));
  if (y.lengthSq() < 1e-4) y = new THREE.Vector3(0, 0, -1).addScaledVector(z, z.z);
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, z);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(pos.clone().addScaledVector(z, Math.max(0.012, w * 0.004)));
  const g = new THREE.PlaneGeometry(w, h);
  const [u0, v0, u1, v1] = rect(kind, k);
  const a = g.attributes.uv;
  for (let i = 0; i < a.count; i++) a.setXY(i, u0 + a.getX(i) * (u1 - u0), v0 + a.getY(i) * (v1 - v0));
  g.applyMatrix4(m);
  return g.toNonIndexed();
}
