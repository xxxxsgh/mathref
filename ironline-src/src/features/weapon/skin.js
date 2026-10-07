/**
 * Skins: materiais por arma/faca e aplicação da pintura (padrão + desgaste
 * + seed + acabamento) nos uniforms da camada de pintura de materials.js.
 *
 *  - `gunMaterials(M, opts)`: conjunto de materiais da arma — os PINTÁVEIS
 *    (receptor, telhas, trilhos, polímero, armação, ferrolho, lâmina, cabos)
 *    são clonados por arma (cada uma tem a própria skin); aço, latão,
 *    borracha etc. continuam compartilhados. `shareBase` mantém
 *    `receiver`/`tan` do KR-9 nos materiais da biblioteca — é onde a
 *    camuflagem de progressão do HUD (camo.js) injeta (fallback).
 *  - `applySkin(set, skin, bounds)`: liga/desliga a pintura. A textura do
 *    padrão é gerada na CPU (patterns.js) e cacheada por (padrão, paleta,
 *    seed, tamanho).
 */
import * as THREE from 'three';
import { cloneDetail } from './materials.js';
import { renderPattern, skinParams, wearProfile, PATTERN_TILE } from './patterns.js';

/** Materiais pintáveis e quanto cada peça gasta além da base (zona). */
export const PAINT_ZONES = {
  receiver: 0.9, tan: 1.0, rail: 1.25, polymer: 1.35, frame: 1.15, slide: 1.0, stipple: 1.3,
  blade: 1.0, alu: 1.1, g10: 1.2, micarta: 1.2,
};

/**
 * Proxy de materiais (Object.create(M)) com os pintáveis clonados.
 * opts.noOcc: prévias (sem oclusão de contato da viewmodel).
 */
export function gunMaterials(M, { shareBase = false, noOcc = false, keys = Object.keys(PAINT_ZONES) } = {}) {
  const P = Object.create(M);
  const painted = {};
  for (const k of keys) {
    if (!M[k]) continue;
    if (shareBase && !noOcc && (k === 'receiver' || k === 'tan')) {
      painted[k] = M[k];
      continue;
    }
    painted[k] = cloneDetail(M[k], { zone: PAINT_ZONES[k], ...(noOcc ? { noOcc: true } : {}) });
    P[k] = painted[k];
  }
  // prévias: TODOS os materiais com detalhe ganham uniforms de oclusão isolados
  if (noOcc) {
    for (const k of Object.keys(M)) {
      if (painted[k] || !M[k]?.userData?.detailOpts) continue;
      P[k] = cloneDetail(M[k], { noOcc: true });
    }
  }
  return { M: P, painted };
}

const texCache = new Map();
let PATTERN_N = 256;
/** Resolução das texturas de padrão (128 em aparelhos fracos). */
export function setPatternSize(n) {
  PATTERN_N = n;
}
function patternTexture(pattern, palette, seed, N = PATTERN_N) {
  const key = `${pattern}|${(palette || []).join(',')}|${seed}|${N}`;
  let t = texCache.get(key);
  if (t) {
    texCache.delete(key);
    texCache.set(key, t);
    return t;
  }
  const img = renderPattern(pattern, palette, seed, N);
  t = new THREE.DataTexture(new Uint8Array(img.data.buffer.slice(0)), N, N, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = img.mode === 1 ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  t.userData = { mode: img.mode, emissive: img.emissive };
  texCache.set(key, t);
  // LRU: no máximo 32 texturas vivas
  if (texCache.size > 32) {
    const [k0, t0] = texCache.entries().next().value;
    texCache.delete(k0);
    t0.dispose();
  }
  return t;
}

/** Normaliza o objeto skin do contrato (campos opcionais com padrão). */
export function normSkin(s) {
  if (!s) return null;
  const fin = s.finish || {};
  return {
    id: s.id || s.pattern || 'skin',
    name: s.name || '',
    pattern: s.pattern || 'solid',
    palette: Array.isArray(s.palette) && s.palette.length ? s.palette.slice(0, 6) : ['#5a5f64'],
    wear: Math.min(1, Math.max(0, Number(s.wear) || 0)),
    seed: Math.max(0, Math.round(Number(s.seed) || 0)),
    finish: { metalness: clamp01(fin.metalness ?? 0.3), roughness: Math.min(1, Math.max(0.05, fin.roughness ?? 0.55)) },
    rarity: s.rarity || null,
  };
}
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/**
 * Liga (skin) ou desliga (null) a pintura em todos os materiais `painted`.
 * bounds = { zRear, len } do modelo (para o degradê ao longo do comprimento).
 */
export function applySkin(painted, skin, bounds = { zRear: 0.1, len: 0.8 }) {
  const s = normSkin(skin);
  for (const mat of Object.values(painted)) {
    const u = mat.userData.detail;
    if (!u) continue;
    if (!s) {
      u.uSkinOn.value = 0;
      continue;
    }
    const p = skinParams(s);
    const tex = patternTexture(s.pattern, s.palette, s.seed);
    const tile = (PATTERN_TILE[s.pattern] || 0.25) / p.scale;
    const w = wearProfile(s.wear);
    u.tSkin.value = tex;
    u.uSkinOn.value = 1;
    u.uSkinMode.value = tex.userData.mode;
    u.uSkinScale.value = 1 / tile;
    u.uSkinXf.value.set(p.offset[0], p.offset[1], p.offset[2], p.rotation * 0.35);
    u.uSkinFade.value.set(bounds.zRear, bounds.len, (p.gradient - 0.5) * 0.3);
    u.uSkinWear.value.set(w.edge, w.blotch, w.scratch, w.grime);
    u.uSkinFin.value.set(s.finish.metalness, s.finish.roughness, tex.userData.emissive ? 3.5 : 0);
  }
  return s;
}

/** Limites (z de trás, comprimento) de um modelo para o degradê. */
export function modelBounds(root) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.geometry || o.material?.isShaderMaterial) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld).applyMatrix4(inv);
    box.union(tmp);
  });
  if (box.isEmpty()) return { zRear: 0.1, len: 0.8, box };
  return { zRear: box.max.z, len: Math.max(0.05, box.max.z - box.min.z), box };
}
