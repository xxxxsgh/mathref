// Kit de asteroides: geometrias rochosas deformadas por ruído (várias
// formas × 3 níveis de detalhe, mesma função de forma em todos os LODs para
// a troca não "pular"), crateras com borda elevada, e o material PBR rochoso
// com estratos, veios minerais metálicos e brilho emissivo de minérios raros.

import * as THREE from 'three/webgpu';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Fn, float, vec3, vec4, positionGeometry, instancedBufferAttribute, mix, clamp, pow, abs, sin, max, normalize, fwidth, smoothstep,
} from 'three/tsl';
import { makeRng, fbm3, noise3 } from '../../core/Rng.js';
import { fbm, ridged, noise4, bumpNormal, camU, sstep } from './tslUtil.js';

export const SHAPES = 5;
export const LOD_DETAIL = [22, 9, 3];

/** Recursos de mineração: cor de base, cor do veio, emissivo, raridade. */
export const RESOURCES = {
  ferro: { label: 'Ferro', base: [0.198, 0.165, 0.149], vein: [0.55, 0.32, 0.2], glow: 0 },
  'níquel': { label: 'Níquel', base: [0.182, 0.176, 0.171], vein: [0.75, 0.74, 0.68], glow: 0 },
  gelo: { label: 'Gelo', base: [0.303, 0.341, 0.385], vein: [0.7, 0.88, 1.0], glow: 0.0 },
  'titânio': { label: 'Titânio', base: [0.165, 0.165, 0.182], vein: [0.8, 0.82, 0.9], glow: 0 },
  silicato: { label: 'Silicato', base: [0.231, 0.209, 0.182], vein: [0.6, 0.55, 0.45], glow: 0 },
  'irídio': { label: 'Irídio', base: [0.132, 0.127, 0.143], vein: [0.4, 0.75, 1.0], glow: 3.5 },
  'cristal-arquiteto': { label: 'Cristal dos Arquitetos', base: [0.110, 0.099, 0.132], vein: [0.75, 0.3, 1.0], glow: 6.0 },
  'plasma-fóssil': { label: 'Plasma fóssil', base: [0.121, 0.105, 0.099], vein: [1.0, 0.45, 0.12], glow: 5.0 },
};
export const RARE = ['irídio', 'cristal-arquiteto', 'plasma-fóssil'];

function shapeFn(variant) {
  const r = makeRng(9001 + variant * 77);
  const off = [r() * 50, r() * 50, r() * 50];
  const craters = [];
  const nc = 5 + Math.floor(r() * 6);
  for (let i = 0; i < nc; i++) {
    let x = r() * 2 - 1, y = r() * 2 - 1, z = r() * 2 - 1;
    const l = Math.hypot(x, y, z) || 1;
    craters.push({ d: [x / l, y / l, z / l], rad: r.range(0.12, 0.42), depth: r.range(0.04, 0.12) });
  }
  const lumpy = r.range(0.25, 0.45);
  return (x, y, z) => {
    // x,y,z = direção unitária
    let h = 1 + lumpy * fbm3(x * 1.3 + off[0], y * 1.3 + off[1], z * 1.3 + off[2], 4);
    h += 0.07 * fbm3(x * 4.5 + off[1], y * 4.5 + off[2], z * 4.5 + off[0], 3);
    // facetas angulosas (fraturas)
    h -= 0.06 * Math.abs(noise3(x * 2.2 + off[2], y * 2.2, z * 2.2 + off[0]));
    for (const c of craters) {
      const dot = x * c.d[0] + y * c.d[1] + z * c.d[2];
      const ang = Math.acos(Math.max(-1, Math.min(1, dot)));
      const t = ang / c.rad;
      if (t < 1.35) {
        if (t < 1) h -= c.depth * (1 - t * t);
        else h += c.depth * 0.35 * Math.sin(((t - 1) / 0.35) * Math.PI);
      }
    }
    return h;
  };
}

/** Geometria rochosa (normalizada para raio ~1). */
export function rockGeometry(variant, lod) {
  const f = shapeFn(variant);
  const r = makeRng(31 + variant);
  const ax = [r.range(0.7, 1.2), r.range(0.55, 0.95), r.range(0.8, 1.3)];
  let g = new THREE.IcosahedronGeometry(1, LOD_DETAIL[lod]);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g, 1e-5);
  const p = g.attributes.position;
  let maxR = 0;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const l = Math.hypot(x, y, z);
    const h = f(x / l, y / l, z / l);
    const nx = (x / l) * h * ax[0], ny = (y / l) * h * ax[1], nz = (z / l) * h * ax[2];
    p.setXYZ(i, nx, ny, nz);
    maxR = Math.max(maxR, Math.hypot(nx, ny, nz));
  }
  // normaliza para raio máximo 1 (o raio do registro = raio envolvente)
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) / maxR, p.getY(i) / maxR, p.getZ(i) / maxR);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/**
 * Material rochoso compartilhado. Atributos por instância:
 *   aRock (vec4) = cor base rgb, raio (m)
 *   aMin  (vec4) = cor do veio rgb, emissivo
 */
export function rockMaterial(rockAttr, minAttr) {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.9 });
  const aRock = instancedBufferAttribute(rockAttr);
  const aMin = instancedBufferAttribute(minAttr);
  const P = positionGeometry; // espaço da rocha (raio ~1)
  const seed = aRock.x.mul(13.7).add(aRock.z.mul(7.1)); // variação por tipo
  const veinMask = Fn(() => {
    const v = ridged(P.mul(0.3).add(vec3(seed, 0.3, 0.7)));
    const v2 = ridged(P.mul(0.75).add(vec3(0.2, seed, 1.1)));
    // minérios raros (emissivos) formam veios mais largos e cristalinos
    const wide = clamp(aMin.w.mul(0.03), 0.0, 0.14);
    return smoothstep(float(0.9).sub(wide), float(0.97).sub(wide.mul(0.5)), v).max(sstep(0.93, 0.985, v2).mul(0.8));
  });
  const vm = veinMask();
  m.colorNode = Fn(() => {
    const n1 = fbm(P.mul(0.8).add(seed));
    const n2 = fbm(P.mul(3.5).add(vec3(seed, 2.0, 1.0)));
    // estratos (camadas sedimentares) levemente distorcidos
    const strata = sin(P.y.mul(9.0).add(n1.mul(6.0))).mul(0.5).add(0.5);
    let c = aRock.xyz.mul(float(0.55).add(n1.mul(0.55)).add(n2.mul(0.25))).mul(float(0.9).add(strata.mul(0.15)));
    // poeira/regolito mais claro nas partes "altas", escuro nas crateras
    const dark = sstep(0.35, 0.2, n2);
    c = c.mul(float(1.0).sub(dark.mul(0.35)));
    return mix(c, aMin.xyz, vm.mul(0.85));
  })();
  m.roughnessNode = mix(float(0.92).sub(fbm(P.mul(5.0)).mul(0.15)), float(0.35), vm);
  m.metalnessNode = vm.mul(0.8);
  m.emissiveNode = Fn(() => {
    const pulse = sin(camU.time.mul(1.3).add(P.x.mul(4.0)).add(P.z.mul(3.0))).mul(0.25).add(0.85);
    return aMin.xyz.mul(aMin.w).mul(vm).mul(pulse);
  })();
  // microrrelevo (o bump escala com o raio da rocha)
  // (atenuado quando a rocha é pequena na tela, para não serrilhar)
  const fw = fwidth(P.x).add(fwidth(P.y)).max(1e-5);
  const bumpFade = clamp(float(0.012).div(fw), 0.0, 1.0);
  m.normalNode = bumpNormal(fbm(P.mul(3.5)).mul(0.6).add(ridged(P.mul(2.2)).mul(0.3)).sub(vm.mul(0.05)), aRock.w.mul(0.022).mul(bumpFade));
  return m;
}
