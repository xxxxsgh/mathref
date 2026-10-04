/**
 * Kit de modelagem de objetos de perto ("props de primeira linha").
 *
 * O que um crítico enxerga a 1–3 m e que caixas cruas não têm:
 *  - ARESTAS BOLEADAS: toda peça é uma caixa com bisel real (pega um
 *    filete de luz na quina), nunca uma aresta matemática;
 *  - UV EM METROS POR PEÇA, com o eixo u ao longo do maior lado de cada
 *    face (veio da madeira acompanha a tábua, chapa acompanha a dobra);
 *  - DESGASTE ASSADO EM COR DE VÉRTICE: quinas mais claras (tinta/verniz
 *    gasto), base mais escura (AO de contato), cavidades escuras;
 *  - VARIAÇÃO POR INSTÂNCIA: cada chamada sorteia tom, desbotamento de sol
 *    e sujeira — duas cadeiras iguais nunca saem idênticas.
 *
 * Tudo devolve geometrias com atributo `color` para o Builder (opts.vcolor)
 * ou para o Instancer (que multiplica pela cor de instância).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { cached } from './geo.js';

const q3 = (v) => Math.round(v * 1000) / 1000;

/**
 * Caixa boleada w×h×d com raio r e UV em metros (u ao longo do maior lado
 * da face). `wear` (0..1) clareia as quinas; `cav` escurece a face de baixo.
 * Cacheada por dimensões (geometria compartilhada entre peças iguais).
 */
export function bevelBox(w, h, d, r = 0.01, { wear = 0.25, seg = 2, uvScale = 1 } = {}) {
  w = q3(w); h = q3(h); d = q3(d);
  const rr = q3(Math.max(0.001, Math.min(r, w / 2.05, h / 2.05, d / 2.05)));
  return cached(`bbox_${w}_${h}_${d}_${rr}_${wear}_${seg}_${uvScale}`, () => {
    const g = new RoundedBoxGeometry(w, h, d, seg, rr).toNonIndexed();
    const P = g.attributes.position, N = g.attributes.normal;
    const uv = new Float32Array(P.count * 2);
    const col = new Float32Array(P.count * 3);
    const fn = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < P.count; i += 3) {
      a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
      fn.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
      for (let k = 0; k < 3; k++) {
        const x = P.getX(i + k), y = P.getY(i + k), z = P.getZ(i + k);
        let u, v;
        // face X: lados z (d) e y (h); face Y: x (w) e z (d); face Z: x e y
        if (ax >= ay && ax >= az) [u, v] = d >= h ? [z, y] : [y, z];
        else if (ay >= az) [u, v] = w >= d ? [x, z] : [z, x];
        else [u, v] = w >= h ? [x, y] : [y, x];
        uv[(i + k) * 2] = u * uvScale;
        uv[(i + k) * 2 + 1] = v * uvScale;
        // quina: normal do vértice fora dos eixos → desgaste claro
        const nx = Math.abs(N.getX(i + k)), ny = Math.abs(N.getY(i + k)), nz = Math.abs(N.getZ(i + k));
        const edge = 1 - Math.max(nx, ny, nz);
        const e = Math.min(1, edge * 3.2) * wear;
        // face de baixo e parte inferior mais escuras (AO próprio)
        const low = N.getY(i + k) < -0.6 ? 0.55 : 1 - 0.18 * Math.max(0, -y / (h / 2));
        const v0 = (1 + e * 0.9) * low;
        col[(i + k) * 3] = v0;
        col[(i + k) * 3 + 1] = v0 * (1 + e * 0.02);
        col[(i + k) * 3 + 2] = v0 * (1 - e * 0.05);
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
}

/**
 * Cilindro (perna torneada, tubo) com UV em metros e quinas desgastadas
 * nas tampas. rTop/rBot permitem pernas cônicas.
 */
export function bevelCyl(rTop, rBot, h, seg = 12) {
  return cached(`bcyl_${q3(rTop)}_${q3(rBot)}_${q3(h)}_${seg}`, () => {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, 2).toNonIndexed();
    const P = g.attributes.position;
    const uv = new Float32Array(P.count * 2), col = new Float32Array(P.count * 3);
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      uv[i * 2] = Math.atan2(z, x) * Math.max(rTop, rBot);
      uv[i * 2 + 1] = y;
      const v = 1 - 0.2 * Math.max(0, -y / (h / 2));
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  });
}

/**
 * Variação por instância: tom base × (desbotamento de sol, sujeira).
 * Devolve uma cor [r,g,b] para multiplicar o albedo.
 */
export function vary(rng, base, { tone = 0.12, fade = 0.25, dirt = 0.2 } = {}) {
  const t = 1 + (rng.next() - 0.5) * 2 * tone;
  const f = rng.next() * fade; // desbotado: puxa para cinza claro
  const d = rng.next() * dirt; // sujeira: puxa para marrom escuro
  const g = (base[0] + base[1] + base[2]) / 3;
  return base.map((c, i) => {
    let v = c * t;
    v = v + (g * 1.15 - v) * f;
    v = v * (1 - d) + [0.22, 0.19, 0.15][i] * d;
    return Math.max(0, Math.min(1.4, v));
  });
}

/**
 * Peça local de um objeto: adiciona `geo` com a matriz `M · local(pos, rot)`
 * e a cor de vértice da geometria multiplicada (`vcolor`).
 */
export function part(B, M, geo, mat, pos, rot, color, opts = {}) {
  const L = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  B.add(geo, mat, M.clone().multiply(L), { worldUV: false, vcolor: true, color, uvRand: true, ...opts });
}

/**
 * AO assada em geometria: escurece vértices pela altura relativa ao chão
 * do objeto (y0) — usado em sacos, montes e peças instanciadas.
 */
export function bakeHeightAO(geo, y0, y1, kMin = 0.45) {
  const P = geo.attributes.position;
  let C = geo.attributes.color;
  if (!C) {
    C = new THREE.BufferAttribute(new Float32Array(P.count * 3).fill(1), 3);
    geo.setAttribute('color', C);
  }
  for (let i = 0; i < P.count; i++) {
    const t = Math.min(1, Math.max(0, (P.getY(i) - y0) / (y1 - y0)));
    const k = kMin + (1 - kMin) * Math.pow(t, 0.7);
    C.setXYZ(i, C.getX(i) * k, C.getY(i) * k, C.getZ(i) * k);
  }
  return geo;
}

/** Regiões do atlas da caixa de munição (decals.crateTexture). */
export const CRATE_RECT = { sideA: [0, 0.5, 0.5, 1], sideB: [0.5, 0.5, 1, 1], end: [0, 0, 0.5, 0.5], lid: [0.5, 0, 1, 0.5] };

/**
 * Caixa boleada com UV de ATLAS por face: ±z → rects.pz/nz, ±x → rects.px/nx,
 * ±y → rects.py/ny (cada face ocupa a região inteira). Desgaste nas quinas
 * e base escura como em bevelBox.
 */
export function atlasBox(w, h, d, r, rects, key) {
  return cached(`abox_${key}_${q3(w)}_${q3(h)}_${q3(d)}_${q3(r)}`, () => {
    const g = new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.05, h / 2.05, d / 2.05)).toNonIndexed();
    const P = g.attributes.position, N = g.attributes.normal;
    const uv = new Float32Array(P.count * 2), col = new Float32Array(P.count * 3);
    const fn = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const map = (rc, s, t) => [rc[0] + (rc[2] - rc[0]) * Math.min(1, Math.max(0, s)), rc[1] + (rc[3] - rc[1]) * Math.min(1, Math.max(0, t))];
    for (let i = 0; i < P.count; i += 3) {
      a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
      fn.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
      for (let k = 0; k < 3; k++) {
        const x = P.getX(i + k) / w + 0.5, y = P.getY(i + k) / h + 0.5, z = P.getZ(i + k) / d + 0.5;
        let st;
        if (ax >= ay && ax >= az) st = map(fn.x > 0 ? rects.px : rects.nx, fn.x > 0 ? 1 - z : z, y);
        else if (ay >= az) st = map(fn.y > 0 ? rects.py : rects.ny, x, fn.y > 0 ? 1 - z : z);
        else st = map(fn.z > 0 ? rects.pz : rects.nz, fn.z > 0 ? x : 1 - x, y);
        uv[(i + k) * 2] = st[0];
        uv[(i + k) * 2 + 1] = st[1];
        const e = Math.min(1, (1 - Math.max(Math.abs(N.getX(i + k)), Math.abs(N.getY(i + k)), Math.abs(N.getZ(i + k)))) * 3.2) * 0.5;
        const low = N.getY(i + k) < -0.6 ? 0.5 : 1 - 0.22 * (1 - y);
        const v0 = (1 + e) * low;
        col[(i + k) * 3] = v0; col[(i + k) * 3 + 1] = v0; col[(i + k) * 3 + 2] = v0 * (1 - e * 0.1);
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
}

/**
 * Pneu de verdade (torno): perfil com flanco abaulado, ombro arredondado,
 * talão e banda de rodagem com BLOCOS (sulcos em V e canal central) —
 * deslocamento radial por ângulo × posição lateral. Eixo = Y (deitado).
 */
export const treadTire = (v = 0) =>
  cached('tire3_' + v, () => {
    const R = 0.33, Ri = 0.21, Wd = 0.2;
    const prof = [];
    // de dentro (talão, embaixo) → flanco → banda → flanco → talão (em cima)
    const n = 22;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = -Math.PI / 2 + t * Math.PI;
      // superelipse: banda larga e quase plana, ombro arredondado
      const c = Math.cos(a), s2 = Math.sin(a);
      const rr = Ri + (R - Ri) * Math.pow(Math.abs(c), 0.35);
      prof.push(new THREE.Vector2(rr, Math.sign(s2) * Math.pow(Math.abs(s2), 0.55) * Wd / 2));
    }
    const g = new THREE.LatheGeometry(prof, 72);
    const P = g.attributes.position;
    const seg = 36 + v * 4;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      const r = Math.hypot(x, z);
      if (r < R - 0.035) continue;
      const a = Math.atan2(z, x);
      const lat = y / (Wd / 2); // -1..1
      // sulcos em V alternados nas duas metades + canal central
      const ph = a * seg + Math.abs(lat) * 2.2 * (lat > 0 ? 1 : -1);
      const block = Math.sin(ph) > -0.35 ? 1 : 0;
      const groove = Math.abs(lat) < 0.12 ? 0 : block;
      const d = (1 - groove) * 0.012 * Math.min(1, (r - (R - 0.035)) / 0.02);
      const k = (r - d) / r;
      P.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals();
    return g;
  });

