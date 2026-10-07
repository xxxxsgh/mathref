/**
 * Prévias isoladas (inventário: visualizador 3D, revelação da caixa).
 *
 * `buildPreview(item, { M })` → Promise<THREE.Group>, item =
 * { type: 'weapon'|'knife'|'charm', baseId, skin?, charm?, stickers?, counter? }.
 *
 * O modelo é montado do zero (sem mãos), com materiais PRÓPRIOS (a skin da
 * prévia não mexe na arma em jogo) e sem a oclusão de contato da viewmodel.
 * Centralizado na origem, escala real (m), cano para −Z; `userData` traz
 * { size: Vector3, length, type, baseId } para o enquadramento da câmera.
 * Lunetas mostram só o vidro (a imagem ampliada é da viewmodel).
 */
import * as THREE from 'three';
import { buildRifle } from './rifle.js';
import { buildPistol } from './pistol.js';
import { buildMX9 } from './smg.js';
import { buildBR12 } from './shotgun.js';
import { buildLR50 } from './sniper.js';
import { buildHM60 } from './lmg.js';
import { buildSR7 } from './dmr.js';
import { buildKnifeModel, KNIFE_MODELS } from './knives.js';
import { KR9_COSMETIC, P11_COSMETIC } from './guns.js';
import { makeLens } from './optic.js';
import { gunMaterials, applySkin, modelBounds } from './skin.js';
import { KillCounterView, applyStickers, Charm } from './cosmetics.js';
import { knifeId } from './loadout.js';

const BUILD = {
  kr9: (M) => {
    const R = buildRifle(M);
    const ow = R.opticWindow;
    const lens = makeLens({ w: ow.w, h: ow.h });
    lens.position.set(0, ow.y, (ow.z0 + ow.z1) / 2 + 0.006);
    R.optic.add(lens);
    R.cosmetic = KR9_COSMETIC;
    return R;
  },
  p11: (M) => Object.assign(buildPistol(M), { cosmetic: P11_COSMETIC }),
  mx9: (M) => buildMX9(M),
  br12: (M) => buildBR12(M),
  lr50: (M) => buildLR50(M, null),
  hm60: (M) => buildHM60(M),
  sr7: (M) => buildSR7(M, null),
};
/** Ids aceitos além do id real (chaves do catálogo do inventário / kind). */
const ALIAS = { rifle: 'kr9', pistol: 'p11', smg: 'mx9', shotgun: 'br12', sniper: 'lr50', lmg: 'hm60', dmr: 'sr7' };

function center(obj, type, baseId) {
  const box = new THREE.Box3().setFromObject(obj);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const wrap = new THREE.Group();
  wrap.name = `preview:${type}:${baseId}`;
  obj.position.sub(c);
  wrap.add(obj);
  wrap.userData = { size, length: Math.max(size.x, size.y, size.z), type, baseId };
  return wrap;
}

export async function buildPreview(item = {}, { M }) {
  const type = item.type || 'weapon';
  if (type === 'charm') {
    const holder = new THREE.Group();
    const c = new Charm(item.charm || {});
    holder.add(c.root);
    c.settle();
    c.root.scale.setScalar(1);
    return center(holder, 'charm', item.charm?.id || null);
  }
  if (type === 'knife') {
    const id = knifeId(item.baseId) || knifeId(item.model) || 'tk7';
    const mats = gunMaterials(M, { noOcc: true, keys: ['blade', 'alu', 'g10', 'micarta'] });
    const model = buildKnifeModel(mats.M, id);
    if (item.skin) applySkin(mats.painted, item.skin, KNIFE_MODELS[id]?.bounds);
    if (item.counter != null) {
      const info = model.userData.info;
      const v = new KillCounterView(mats.M, { scale: 0.62 });
      v.root.position.copy(info.handle.a.clone().lerp(info.handle.b, 0.6)).add(new THREE.Vector3(-(info.handle.r * 0.82 + 0.0008), 0, 0));
      v.set(item.counter);
      model.add(v.root);
    }
    model.traverse((o) => o.isMesh && (o.castShadow = o.receiveShadow = true));
    return center(model, 'knife', id);
  }
  const id = BUILD[item.baseId] ? item.baseId : ALIAS[item.baseId] || 'kr9';
  const mats = gunMaterials(M, { noOcc: true });
  const R = BUILD[id](mats.M);
  const root = R.root;
  root.position.set(0, 0, 0);
  root.updateMatrixWorld(true);
  const bounds = modelBounds(root);
  if (item.skin) applySkin(mats.painted, item.skin, bounds);
  const cos = R.cosmetic || {};
  if (item.stickers?.length && cos.stickers) {
    const painted = new Set(Object.values(mats.painted));
    const skip = new Set([R.mag, R.slide, R.bolt, R.pump, R.cover, R.optic, R.opticRoot].filter(Boolean));
    const targets = [];
    const walk = (o) => {
      if (skip.has(o)) return;
      if (o.isMesh && painted.has(o.material)) targets.push(o);
      for (const ch of o.children) walk(ch);
    };
    walk(root);
    applyStickers(root, targets, cos.stickers, item.stickers);
  }
  if (item.counter != null && cos.counter) {
    const v = new KillCounterView(mats.M, { scale: cos.counter.scale || 1 });
    v.root.position.copy(cos.counter.pos);
    v.set(item.counter);
    root.add(v.root);
  }
  if (item.charm && cos.charm) {
    const c = new Charm(item.charm);
    c.root.position.copy(cos.charm);
    root.add(c.root);
    c.settle();
  }
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.receiveShadow = true;
      o.frustumCulled = true;
    }
  });
  return center(root, 'weapon', id);
}
