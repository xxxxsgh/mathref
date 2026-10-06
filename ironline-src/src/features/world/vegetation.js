/**
 * Vegetação: árvores de rua (galhos recursivos + centenas de cartões de
 * folhas com normais "esféricas" da copa → sombreado de volume), palmeiras
 * (estipe anelado, saia de folhas secas, frondes pinadas arqueadas),
 * mato/ervas em tufos (4 espécies), ervas nascendo nas rachaduras e
 * hera pendendo das fachadas.
 *
 * Materiais com patch de VENTO (vértice, em espaço de mundo) e
 * TRANSLUCIDEZ (folhas acendem contra o sol — subsurface aproximado) e
 * alpha-to-coverage (bordas suaves com MSAA/TAA).
 */
import * as THREE from 'three';
import { mulberry } from './noise.js';
import { cylBetween, decal } from './shapes.js';
import { cached, mat4 } from './geo.js';

export const FOLIAGE_U = {
  uTime: { value: 0 },
  uSunDirW: { value: new THREE.Vector3(-0.32, 0.6, -0.73).normalize() },
  uSunColF: { value: new THREE.Color(1.0, 0.86, 0.68) },
};

// canvas na escala da camada do aparelho (decals.js → setCanvasScale)
import { canvas } from './decals.js';
function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Folha ovalada com ponta, nervura e sombreado. */
function leaf(g, r, x, y, len, ang, hue, sat, lit) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  const w = len * (0.32 + r() * 0.12);
  const grd = g.createLinearGradient(-w, 0, w, 0);
  grd.addColorStop(0, `hsl(${hue},${sat}%,${lit - 6}%)`);
  grd.addColorStop(0.5, `hsl(${hue + 4},${sat + 5}%,${lit + 6}%)`);
  grd.addColorStop(1, `hsl(${hue},${sat}%,${lit - 10}%)`);
  g.fillStyle = grd;
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(w, -len * 0.35, 0, -len);
  g.quadraticCurveTo(-w, -len * 0.35, 0, 0);
  g.fill();
  g.strokeStyle = `hsla(${hue + 10},${sat}%,${lit + 14}%,0.5)`;
  g.lineWidth = Math.max(0.8, len * 0.04);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.92); g.stroke();
  g.restore();
}

/** Atlas 2×2 de ramos de folhas (2 verdes, 1 amarelado, 1 oliveira). */
function leavesTexture(seed = 29) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 1024);
  const kinds = [
    { hue: 88, sat: 34, lit: 26, len: 30 },
    { hue: 76, sat: 30, lit: 30, len: 26 },
    { hue: 62, sat: 38, lit: 33, len: 28 },
    { hue: 95, sat: 14, lit: 34, len: 22 }, // oliveira (prateada, estreita)
  ];
  kinds.forEach((k, i) => {
    const ox = (i % 2) * 512 + 256, oy = Math.floor(i / 2) * 512 + 256;
    g.save();
    g.beginPath(); g.rect(ox - 256, oy - 256, 512, 512); g.clip();
    // galhinhos irradiando de baixo
    g.strokeStyle = '#3a2e22';
    g.lineCap = 'round';
    const twigs = [];
    for (let t = 0; t < 9; t++) {
      const a = -Math.PI / 2 + (r() - 0.5) * 2.2;
      const l = 120 + r() * 110;
      const ex = ox + Math.cos(a) * l, ey = oy + 200 + Math.sin(a) * l;
      g.lineWidth = 3 + r() * 2;
      g.beginPath(); g.moveTo(ox, oy + 230); g.quadraticCurveTo((ox + ex) / 2 + (r() - 0.5) * 40, (oy + 230 + ey) / 2, ex, ey); g.stroke();
      twigs.push([ox, oy + 230, ex, ey]);
    }
    // folhas ao longo dos galhinhos + preenchimento
    for (let n = 0; n < 230; n++) {
      const tw = twigs[n % twigs.length];
      const t = 0.25 + r() * 0.8;
      const x = tw[0] + (tw[2] - tw[0]) * t + (r() - 0.5) * 70, y = tw[1] + (tw[3] - tw[1]) * t + (r() - 0.5) * 70;
      if (Math.hypot(x - ox, y - oy) > 245) continue;
      const dry = r() < 0.06;
      const len = k.len * (0.7 + r() * 0.6) * (i === 3 ? 1.3 : 1);
      leaf(g, r, x, y, len, r() * Math.PI * 2, dry ? 38 : k.hue + (r() - 0.5) * 14, dry ? 40 : k.sat, (dry ? 36 : k.lit) + (r() - 0.5) * 10 + (y < oy ? 4 : -3));
    }
    g.restore();
  });
  return tex(c);
}

/** Fronde de palmeira pinada (folíolos pendentes), 2 variantes lado a lado. */
function palmTexture(seed = 31) {
  const r = mulberry(seed);
  const [c, g] = canvas(1024, 1024);
  for (let v = 0; v < 2; v++) {
    g.save();
    g.translate(v * 512 + 256, 1010);
    g.strokeStyle = '#5a5530';
    g.lineWidth = 9;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(14, -480, 0, -990); g.stroke();
    for (let i = 0; i < 70; i++) {
      const t = i / 70;
      const y = -t * 980;
      const x = Math.sin(t * 3) * 7;
      const len = 210 * Math.sin(Math.min(1, t * 1.15) * Math.PI) * (0.8 + r() * 0.3) + 25;
      for (const s of [-1, 1]) {
        const dry = v === 1 ? r() < 0.55 : r() < 0.08;
        const hue = dry ? 38 + r() * 10 : 72 + r() * 20;
        g.strokeStyle = `hsl(${hue},${dry ? 35 : 34 + r() * 16}%,${dry ? 36 + r() * 10 : 22 + r() * 12}%)`;
        g.lineWidth = 7 + r() * 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + s * len * 0.55, y - 12, x + s * len, y + 55 + r() * 40);
        g.stroke();
      }
    }
    g.restore();
  }
  return tex(c);
}

/** Mato: atlas 2×2 (capim seco, erva verde, folha larga, cardo). */
function grassTexture(seed = 33) {
  const r = mulberry(seed);
  const [c, g] = canvas(512, 512);
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * 256, oy = Math.floor(k / 2) * 256;
    g.save();
    g.beginPath(); g.rect(ox, oy, 256, 256); g.clip();
    g.lineCap = 'round';
    if (k < 2) {
      for (let i = 0; i < 110; i++) {
        const x = ox + 40 + r() * 176, h = 70 + r() * 175, bend = (r() - 0.5) * 80;
        const dry = k === 0 ? 0.6 + r() * 0.4 : r() * 0.4;
        g.strokeStyle = `hsl(${40 + (1 - dry) * 48},${12 + r() * 18}%,${18 + dry * 24}%)`;
        g.lineWidth = 1.2 + r() * 2.2;
        g.beginPath(); g.moveTo(x, oy + 256); g.quadraticCurveTo(x + bend * 0.3, oy + 256 - h * 0.5, x + bend, oy + 256 - h); g.stroke();
        if (k === 0 && r() < 0.15) { g.fillStyle = 'hsl(40,30%,55%)'; g.beginPath(); g.ellipse(x + bend, oy + 256 - h, 3, 10, bend * 0.01, 0, 7); g.fill(); }
      }
    } else if (k === 2) {
      for (let i = 0; i < 26; i++) leaf(g, r, ox + 128 + (r() - 0.5) * 60, oy + 250, 70 + r() * 90, (r() - 0.5) * 2.2, 85 + r() * 20, 35, 26 + r() * 10);
    } else {
      for (let i = 0; i < 14; i++) {
        const a = (r() - 0.5) * 2.4, l = 80 + r() * 150;
        g.strokeStyle = `hsl(${55 + r() * 20},20%,${30 + r() * 15}%)`;
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(ox + 128, oy + 256); g.lineTo(ox + 128 + Math.sin(a) * l, oy + 256 - Math.cos(a) * l); g.stroke();
        g.fillStyle = `hsl(${280 + r() * 30},35%,45%)`;
        g.beginPath(); g.arc(ox + 128 + Math.sin(a) * l, oy + 256 - Math.cos(a) * l, 6 + r() * 4, 0, 7); g.fill();
      }
    }
    g.restore();
  }
  return tex(c);
}

/** Hera pendente (faixa vertical), folhas pequenas e caules. */
function ivyTexture(seed = 37) {
  const r = mulberry(seed);
  const [c, g] = canvas(256, 1024);
  for (let s = 0; s < 7; s++) {
    let x = 30 + r() * 196, y = 0;
    const end = 500 + r() * 520;
    g.strokeStyle = '#3d3122';
    g.lineWidth = 2;
    while (y < end) {
      const nx = x + (r() - 0.5) * 18, ny = y + 10 + r() * 14;
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      for (let k = 0; k < 2; k++) {
        const dens = 1 - y / 1100;
        if (r() < 0.85 * dens) leaf(g, r, nx + (r() - 0.5) * 30, ny + (r() - 0.5) * 12, 14 + r() * 12, r() * 6.28, 90 + r() * 25, 30 + r() * 15, 20 + r() * 12);
      }
      x = Math.min(250, Math.max(6, nx)); y = ny;
    }
  }
  return tex(c);
}

/** Patch: vento no vértice + translucidez (luz atravessando a folha). */
function foliagePatch(mat, { wind = 1, grass = false, transl = 0.6 } = {}) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, FOLIAGE_U);
    sh.uniforms.uWindK = { value: wind };
    sh.uniforms.uTransl = { value: transl };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWindK;\nvarying vec3 vFW;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec4 wp0 = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            wp0 = instanceMatrix * wp0;
          #endif
          wp0 = modelMatrix * wp0;
          float ph = wp0.x * 0.37 + wp0.z * 0.29;
          ${grass
            ? 'float amp = clamp(uv.y, 0.0, 1.0) * 0.06;'
            : 'float amp = clamp((wp0.y - 2.0) * 0.012, 0.0, 0.06);'}
          vec3 sway = vec3(sin(uTime * 1.3 + ph) + 0.4 * sin(uTime * 3.1 + ph * 2.3), 0.0, cos(uTime * 1.1 + ph * 0.7) * 0.6) * amp * uWindK;
          // flutter de folha individual
          sway += vec3(0.0, sin(uTime * 6.0 + ph * 9.0 + position.x * 7.0) * amp * 0.25, 0.0);
          transformed += sway;
        }`
      )
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDirW; uniform vec3 uSunColF; uniform float uTransl;\nvarying vec3 vFW;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 Vw = normalize(vFW - cameraPosition);
          float back = pow(clamp(dot(Vw, uSunDirW), 0.0, 1.0), 4.0);
          totalEmissiveRadiance += diffuseColor.rgb * vec3(1.05, 1.0, 0.55) * uSunColF * back * uTransl;
        }`
      );
  };
  mat.customProgramCacheKey = () => 'ironline-foliage' + (grass ? 'g' : 't');
  return mat;
}

/** Cria os materiais de vegetação (chamado pelo index). */
export function vegetationMaterials() {
  const base = (map, extra = {}) =>
    new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, metalness: 0, vertexColors: true, alphaToCoverage: true, ...extra });
  return {
    leaves: foliagePatch(base(leavesTexture()), { transl: 0.7 }),
    palm: foliagePatch(base(palmTexture(), { alphaTest: 0.38 }), { transl: 0.6 }),
    grass: foliagePatch(base(grassTexture(), { roughness: 0.9 }), { grass: true, transl: 0.5 }),
    ivy: foliagePatch(base(ivyTexture(), { alphaTest: 0.45 }), { wind: 0.3, transl: 0.4 }),
  };
}

// ─── geradores ─────────────────────────────────────────────────────────
/**
 * Árvore de rua: tronco e galhos recursivos (casca triplanar) + copa de
 * cartões agrupados nas pontas, com normais apontando para fora do centro
 * da copa (luz de volume, não de cartão chato).
 */
export function tree(W, x, z, opts = {}) {
  const { B, rng } = W;
  const h = opts.h || rng.range(5.5, 8);
  const bark = [0.6, 0.56, 0.5];
  const tips = [];
  const species = opts.species ?? rng.int(0, 2);
  const grow = (p, dir, len, r, depth) => {
    const end = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
    cylBetween(B, p, end, r, 'bark', { seg: depth ? 6 : 9, color: bark });
    if (depth >= 4 || r < 0.018) {
      tips.push(end);
      return;
    }
    const n = depth === 0 ? 3 : rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng.range(-0.6, 0.6);
      const up = rng.range(0.35, 0.75);
      const d = [Math.cos(a) * (1 - up) + dir[0] * 0.5, up + dir[1] * 0.3, Math.sin(a) * (1 - up) + dir[2] * 0.5];
      const l = Math.hypot(...d);
      grow(end, d.map((v) => v / l), len * rng.range(0.6, 0.78), r * 0.62, depth + 1);
    }
    if (depth > 1) tips.push(end);
  };
  grow([x, 0, z], [rng.range(-0.06, 0.06), 1, rng.range(-0.06, 0.06)], h * 0.38, 0.17, 0);
  // centro da copa
  const cc = tips.reduce((a, t) => [a[0] + t[0], a[1] + t[1], a[2] + t[2]], [0, 0, 0]).map((v) => v / tips.length);
  cc[1] -= 0.4;
  const q = W.quality.foliage ?? 1;
  const pos = [], nor = [], uv = [], col = [];
  const quad = new THREE.PlaneGeometry(1, 1).toNonIndexed();
  const P = quad.attributes.position, U = quad.attributes.uv;
  const cell = species === 1 ? 2 : species === 2 ? 3 : 0;
  const u0 = (cell % 2) * 0.5, v0 = 0.5 - Math.floor(cell / 2) * 0.5;
  const v3 = new THREE.Vector3();
  for (const t of tips) {
    const n = Math.max(3, Math.round(rng.int(8, 12) * q));
    for (let i = 0; i < n; i++) {
      const s = rng.range(0.9, 1.5);
      const M = mat4([t[0] + rng.range(-0.55, 0.55), t[1] + rng.range(-0.35, 0.5), t[2] + rng.range(-0.55, 0.55)], [rng.range(-1.3, 1.3), rng.range(0, 6.28), rng.range(-1.3, 1.3)], [s, s, s]);
      const tone = rng.range(0.78, 1.12);
      for (let k = 0; k < P.count; k++) {
        v3.fromBufferAttribute(P, k).applyMatrix4(M);
        pos.push(v3.x, v3.y, v3.z);
        // normal esférica (para fora da copa) com um pouco de variação
        const nx = v3.x - cc[0], ny = (v3.y - cc[1]) * 1.3, nz = v3.z - cc[2];
        const l = Math.hypot(nx, ny, nz) || 1;
        nor.push(nx / l, ny / l, nz / l);
        uv.push(u0 + U.getX(k) * 0.5, v0 + U.getY(k) * 0.5);
        // AO da copa: interior/baixo mais escuro
        const ao = 0.55 + 0.45 * Math.min(1, Math.max(0, (v3.y - cc[1] + 1.2) / 2.4));
        col.push(tone * ao, tone * ao, tone * ao * 0.92);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const c = B.cast;
  B.cast = true;
  B.add(g, 'leaves', null, { worldUV: false, vcolor: true });
  B.cast = c;
  B.collider([x - 0.2, 0, z - 0.2], [x + 0.2, h * 0.5, z + 0.2], 'wood');
}

/** Palmeira: estipe curvo anelado, saia de folhas secas, frondes arqueadas. */
export function palm(W, x, z, opts = {}) {
  const { B, rng } = W;
  const h = opts.h || rng.range(7, 10);
  const lean = [rng.range(-0.25, 0.25), rng.range(-0.25, 0.25)];
  let p = [x, 0, z];
  const segs = 14;
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / segs;
    const qp = [x + lean[0] * h * t * t, h * t, z + lean[1] * h * t * t];
    const r = 0.2 - t * 0.06;
    cylBetween(B, p, qp, r, 'bark', { seg: 9, color: [0.72, 0.66, 0.56] });
    // anel (cicatriz das folhas)
    cylBetween(B, [qp[0], qp[1] - 0.05, qp[2]], [qp[0], qp[1] + 0.02, qp[2]], r * 1.07, 'bark', { seg: 9, color: [0.55, 0.5, 0.42] });
    p = qp;
  }
  const top = p;
  const frond = cached('frond2', () => {
    const g = new THREE.PlaneGeometry(1.5, 4.0, 1, 10);
    g.translate(0, 2.0, 0);
    g.rotateX(-Math.PI / 2);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const d = -P.getZ(i);
      P.setY(i, P.getY(i) + 1.0 * d * (1 - d / 3.4) - 0.12 * d * d);
      // folíolos caem dos lados (V invertido)
      P.setY(i, P.getY(i) - Math.abs(P.getX(i)) * 0.35);
    }
    g.computeVertexNormals();
    return g;
  });
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const droop = rng.range(-0.15, 0.55);
    const old = i % 4 === 0;
    const M = mat4(top, [droop + (old ? 0.6 : 0), a, rng.range(-0.25, 0.25)], [1, 1, rng.range(0.85, 1.15)]);
    const g = frond.clone();
    // metade direita do atlas = fronde mais seca
    const U = g.attributes.uv;
    for (let k = 0; k < U.count; k++) U.setX(k, (old ? 0.5 : 0) + U.getX(k) * 0.5);
    B.add(g, 'palm', M, { worldUV: false, color: [1, 1, 1].map(() => rng.range(0.82, 1.05)) });
  }
  // saia de folhas secas pendentes sob a copa
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const M = mat4([top[0], top[1] - 0.3, top[2]], [2.3 + rng.range(-0.15, 0.15), a, 0], [0.7, 0.55, 0.7]);
    const g = frond.clone();
    const U = g.attributes.uv;
    for (let k = 0; k < U.count; k++) U.setX(k, 0.5 + U.getX(k) * 0.5);
    B.add(g, 'palm', M, { worldUV: false, color: [0.75, 0.62, 0.45] });
  }
  B.collider([x - 0.25, 0, z - 0.25], [x + 0.25, 3, z + 0.25], 'wood');
}

const grassGeo = () =>
  cached('grasstuft2', () => {
    const parts = [];
    for (let k = 0; k < 3; k++) {
      const a = new THREE.PlaneGeometry(1, 1, 1, 2);
      a.translate(0, 0.5, 0);
      a.rotateY((k / 3) * Math.PI);
      parts.push(a.toNonIndexed());
    }
    const pos = [], nor = [], uv = [];
    for (const g of parts) {
      pos.push(...g.attributes.position.array);
      uv.push(...g.attributes.uv.array);
      for (let i = 0; i < g.attributes.position.count; i++) nor.push(0, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  });
const grassVariant = (k) =>
  cached('grassv' + k, () => {
    const g = grassGeo().clone();
    const U = g.attributes.uv;
    for (let i = 0; i < U.count; i++) U.setXY(i, (k % 2) * 0.5 + U.getX(i) * 0.5, 0.5 - Math.floor(k / 2) * 0.5 + U.getY(i) * 0.5);
    return g;
  });

/** Tufos de mato (instanciados). opts: { dx, dz, y, kinds: [..] } */
export function grassTufts(W, x, z, r, n, opts = {}) {
  const { I, rng } = W;
  const q = W.quality.foliage ?? 1;
  const m = Math.round(n * q);
  const kinds = opts.kinds || [0, 0, 1, 1, 2, 3];
  for (let i = 0; i < m; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const px = x + (opts.dx !== undefined ? rng.range(-opts.dx, opts.dx) : Math.cos(a) * d);
    const pz = z + (opts.dz !== undefined ? rng.range(-opts.dz, opts.dz) : Math.sin(a) * d);
    const k = rng.pick(kinds);
    const s = rng.range(0.22, 0.55) * (k === 2 ? 0.7 : 1) * (opts.scale || 1);
    I.add('grassv' + k, grassVariant(k), 'grass', mat4([px, opts.y || 0, pz], [0, rng.range(0, 6), 0], [s * 1.3, s, s * 1.3]), [rng.range(0.85, 1.1), rng.range(0.85, 1.05), rng.range(0.8, 0.95)], { shadow: false });
  }
}

/**
 * Hera pendurada numa fachada: faixas verticais com alpha, a 2 cm da
 * parede, saindo de um beiral/sacada. F: { o, u, n } da face; u0..u1 faixa.
 */
export function ivy(W, p0, uDir, nDir, width, height) {
  const { B, rng } = W;
  const n = Math.max(1, Math.round(width / 0.7));
  for (let i = 0; i < n; i++) {
    const w = width / n;
    const hh = height * rng.range(0.55, 1.0);
    const c = [p0[0] + uDir[0] * (i + 0.5) * w + nDir[0] * (0.02 + i * 0.003), p0[1] - hh / 2, p0[2] + uDir[2] * (i + 0.5) * w + nDir[2] * (0.02 + i * 0.003)];
    const g = new THREE.PlaneGeometry(w * 1.25, hh);
    const U = g.attributes.uv;
    for (let k = 0; k < U.count; k++) U.setY(k, 1 - (1 - U.getY(k)) * (hh / height));
    const yaw = Math.atan2(nDir[0], nDir[2]);
    B.add(g, 'ivy', mat4(c, [0, yaw, 0]), { worldUV: false, color: [rng.range(0.8, 1.05), rng.range(0.85, 1.05), 0.85] });
  }
}

/** Ervas nascendo numa linha (rachadura, junta de meio-fio, base de muro). */
export function weedLine(W, a, b, y, dens = 1) {
  const { rng } = W;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.round(len * 1.2 * dens);
  for (let i = 0; i < n; i++) {
    if (!rng.chance(0.55)) continue;
    const t = rng.next();
    grassTufts(W, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0.12, rng.int(1, 3), { y, kinds: [0, 1, 1, 3] });
  }
}

/** Mancha de musgo/terra úmida para a base das plantas (decalque). */
export function plantBase(W, x, z, y, r) {
  decal(W.B, 'stains', [x, y + 0.013, z], 'py', [r * 2, r * 2], [0, 0.5, 0.5, 1], W.rng.range(0, 6), [0.8, 0.85, 0.7]);
}

/**
 * Arbusto/sebe: massa de cartões de folha em volta de um elipsoide, com
 * normais esféricas (luz de volume) e AO de baixo para cima; galhos secos
 * aparecendo. (x, z) centro, r raio horizontal, h altura, y cota do chão.
 */
export function bush(W, x, z, r, h, opts = {}) {
  const { B, rng } = W;
  const y = opts.y || 0;
  const q = W.quality.foliage ?? 1;
  const n = Math.max(6, Math.round(r * r * 26 * q * (opts.dens ?? 1)));
  const pos = [], nor = [], uv = [], col = [];
  const quad = new THREE.PlaneGeometry(1, 1).toNonIndexed();
  const P = quad.attributes.position, U = quad.attributes.uv;
  const cell = opts.cell ?? rng.pick([0, 2, 3]);
  const u0 = (cell % 2) * 0.5, v0 = 0.5 - Math.floor(cell / 2) * 0.5;
  const v3 = new THREE.Vector3();
  const cy = y + h * 0.45;
  const sx = opts.sx || 1;
  for (let i = 0; i < n; i++) {
    // ponto no volume (mais na casca)
    const a = rng.range(0, Math.PI * 2), e = Math.acos(rng.range(-0.35, 1));
    const rr = Math.pow(rng.next(), 0.35);
    const px = x + Math.cos(a) * Math.sin(e) * r * rr * sx, pz = z + Math.sin(a) * Math.sin(e) * r * rr;
    const py = y + h * (0.12 + 0.88 * (Math.cos(e) * 0.5 + 0.5) * rr);
    const s = rng.range(0.45, 0.8) * Math.min(1.2, 0.6 + r * 0.4);
    const M = mat4([px, py, pz], [rng.range(-1.2, 1.2), rng.range(0, 6.28), rng.range(-1.2, 1.2)], [s, s, s]);
    const tone = rng.range(0.75, 1.1) * (opts.dry ? 0.9 : 1);
    for (let k = 0; k < P.count; k++) {
      v3.fromBufferAttribute(P, k).applyMatrix4(M);
      pos.push(v3.x, v3.y, v3.z);
      const nx = (v3.x - x) / sx, ny = (v3.y - cy) * 1.4, nz = v3.z - z;
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
      uv.push(u0 + U.getX(k) * 0.5, v0 + U.getY(k) * 0.5);
      const ao = 0.45 + 0.55 * Math.min(1, Math.max(0, (v3.y - y) / h));
      const dry = opts.dry ? [1.12, 0.98, 0.7] : [1, 1, 0.92];
      col.push(tone * ao * dry[0], tone * ao * dry[1], tone * ao * dry[2]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const c = B.cast;
  B.cast = true;
  B.add(g, 'leaves', null, { worldUV: false, vcolor: true });
  B.cast = c;
  // galhos secos espetando
  for (let i = 0; i < Math.round(r * 3); i++) {
    const a = rng.range(0, 6.28);
    cylBetween(B, [x + Math.cos(a) * r * 0.2, y, z + Math.sin(a) * r * 0.2], [x + Math.cos(a) * r * 1.05 * sx, y + h * rng.range(0.6, 1.1), z + Math.sin(a) * r * 1.05], 0.012, 'bark', { seg: 4, color: [0.5, 0.45, 0.38] });
  }
  decal(B, 'contact', [x, y + 0.026, z], 'py', [r * 2.4 * sx, r * 2.4], [0, 0, 1, 1], 0, [1, 1, 1]);
}
