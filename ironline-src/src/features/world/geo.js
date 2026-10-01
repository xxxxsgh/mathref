/**
 * Construtor de geometria estática do mapa.
 *
 * Acumula triângulos por (material, chunk XZ) e no fim gera UMA malha por
 * par — poucas draw calls, com culling por chunk ainda funcionando.
 *
 * UVs: por padrão, projeção "box" em ESPAÇO DE MUNDO (eixo dominante da
 * normal de cada triângulo), em metros. Com o `repeat = 1/world` das
 * texturas isso dá densidade de texel uniforme em todo o mapa e emendas
 * perfeitas entre peças vizinhas. Peças com UV própria (letreiros, rodas)
 * passam { worldUV: false }.
 *
 * Cor de vértice: tinta (multiplica albedo) + AO falso de contato
 * (`ao: [y0, y1, kMin]` escurece perto do chão).
 */
import * as THREE from 'three';
import { SURFACE } from './materials.js';

// caixa unitária não indexada: faces px, nx, py, ny, pz, nz (6 vértices cada)
const UNIT = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
const FACE_NAMES = ['px', 'nx', 'py', 'ny', 'pz', 'nz'];
const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _nv = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _box = new THREE.Box3();

export class Builder {
  constructor(collision, { chunk = 40 } = {}) {
    this.collision = collision;
    this.chunk = chunk;
    this.buckets = new Map();
    this.tris = 0;
    /** Peças adicionadas com cast=false não projetam sombra (o proxy cobre). */
    this.cast = true;
    /** realShadows: fachadas projetam a própria geometria (recuos de janela,
     * sacadas, cornijas com sombra nítida) em vez do volume simplificado. */
    this.realShadows = false;
    this.proxies = [];
  }

  /** Caixa só de sombra (volume simplificado de um prédio). force: mesmo com realShadows. */
  proxy(min, max, force = false) {
    if (force || !this.realShadows) this.proxies.push([min, max]);
  }

  /**
   * Painel subdividido (para AO/luz assados por vértice): origem, eixos u e
   * v (vetores com o comprimento do lado), nu × nv quadriláteros. A normal é
   * u × v. opts.color pode ser função (p) → [r,g,b].
   */
  panel(o, u, v, nu, nv, mat, opts = {}) {
    const g = new THREE.BufferGeometry();
    const pos = [], nor = [];
    const n = new THREE.Vector3(...u).cross(new THREE.Vector3(...v)).normalize();
    const P = (i, j) => [o[0] + u[0] * (i / nu) + v[0] * (j / nv), o[1] + u[1] * (i / nu) + v[1] * (j / nv), o[2] + u[2] * (i / nu) + v[2] * (j / nv)];
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
        pos.push(...a, ...b, ...c, ...a, ...c, ...d);
        for (let k = 0; k < 6; k++) nor.push(n.x, n.y, n.z);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    this.add(g, mat, null, opts);
    return this;
  }

  _bucket(mat, x, z) {
    const cx = Math.floor(x / this.chunk), cz = Math.floor(z / this.chunk);
    const cast = this.cast || (this.realShadows && !this.noCastZone);
    const key = `${mat}|${cx}|${cz}|${cast ? 1 : 0}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { mat, cast, pos: [], nor: [], uv: [], col: [] };
      this.buckets.set(key, b);
    }
    return b;
  }

  /**
   * Adiciona uma BufferGeometry (indexada ou não) transformada por `matrix`.
   * opts: { color [r,g,b], ao [y0,y1,k], worldUV (true), uvScale, uvOffset [u,v],
   *         faceMats: (faceIndex) => matName | null, at: [x,z] (chunk) }
   */
  add(geo, mat, matrix = null, opts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const P = g.attributes.position, Nn = g.attributes.normal, U = g.attributes.uv, VC = g.attributes.color;
    const col = opts.color || [1, 1, 1];
    const ao = opts.ao;
    const worldUV = opts.worldUV !== false;
    const us = opts.uvScale || 1;
    if (matrix) _n.getNormalMatrix(matrix);
    // centro para escolher o chunk
    let cx = opts.at?.[0], cz = opts.at?.[1];
    if (cx === undefined || opts.uvRand) {
      _box.setFromBufferAttribute(P);
      if (matrix) _box.applyMatrix4(matrix);
      cx ??= (_box.min.x + _box.max.x) / 2;
      cz ??= (_box.min.z + _box.max.z) / 2;
    }
    // uvRand: deslocamento de UV por peça (portas de enrolar, placas,
    // props) — a mesma mancha de ferrugem não se repete em fila
    let uo = opts.uvOffset || [0, 0];
    if (opts.uvRand && !opts.uvOffset) {
      const hx = Math.sin(_box.min.x * 12.9898 + _box.min.y * 4.1414 + _box.min.z * 78.233) * 43758.5453;
      const hy = Math.sin(_box.min.x * 39.3468 + _box.min.y * 11.135 + _box.min.z * 7.817) * 24634.6345;
      uo = [(hx - Math.floor(hx)) * 13.7, (hy - Math.floor(hy)) * 9.3];
    }
    const tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const nrm = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const fn = new THREE.Vector3();
    for (let i = 0; i < P.count; i += 3) {
      let m = mat;
      if (opts.faceMats) {
        const fm = opts.faceMats(i / 3);
        if (fm === null) continue; // face omitida
        if (fm) m = fm;
      }
      const b = this._bucket(m, cx, cz);
      for (let k = 0; k < 3; k++) {
        tri[k].fromBufferAttribute(P, i + k);
        nrm[k].fromBufferAttribute(Nn, i + k);
        if (matrix) {
          tri[k].applyMatrix4(matrix);
          nrm[k].applyMatrix3(_n).normalize();
        }
      }
      // normal da face (para a projeção de UV)
      fn.subVectors(tri[1], tri[0]).cross(_v.subVectors(tri[2], tri[0])).normalize();
      const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z);
      for (let k = 0; k < 3; k++) {
        const p = tri[k];
        b.pos.push(p.x, p.y, p.z);
        b.nor.push(nrm[k].x, nrm[k].y, nrm[k].z);
        if (worldUV) {
          let u, v;
          if (ax >= ay && ax >= az) { u = fn.x > 0 ? -p.z : p.z; v = p.y; }
          else if (ay >= az) { u = p.x; v = fn.y > 0 ? -p.z : p.z; }
          else { u = fn.z > 0 ? p.x : -p.x; v = p.y; }
          b.uv.push(u * us + uo[0], v * us + uo[1]);
        } else if (U) {
          b.uv.push(U.getX(i + k) * us + uo[0], U.getY(i + k) * us + uo[1]);
        } else b.uv.push(0, 0);
        let kf = 1;
        if (ao) kf = ao[2] + (1 - ao[2]) * Math.min(1, Math.max(0, (p.y - ao[0]) / (ao[1] - ao[0])));
        const c = typeof col === 'function' ? col(p) : col;
        // vcolor: multiplica pela cor de vértice da própria geometria (AO de copa…)
        const vc = opts.vcolor && VC ? [VC.getX(i + k), VC.getY(i + k), VC.getZ(i + k)] : null;
        if (vc) b.col.push(c[0] * kf * vc[0], c[1] * kf * vc[1], c[2] * kf * vc[2]);
        else b.col.push(c[0] * kf, c[1] * kf, c[2] * kf);
      }
      this.tris++;
    }
    return this;
  }

  /**
   * Caixa alinhada aos eixos [x0,x1]×[y0,y1]×[z0,z1].
   * opts: { color, ao, faces: { px: 'mat'|null, … }, collide (true), surface, uvOffset,
   *         owner, blocksBullets, blocksPlayer }
   */
  box(x0, y0, z0, x1, y1, z1, mat, opts = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0];
    if (y1 < y0) [y0, y1] = [y1, y0];
    if (z1 < z0) [z0, z1] = [z1, z0];
    _m.compose(_v.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q.identity(), _s.set(x1 - x0, y1 - y0, z1 - z0));
    this.add(UNIT, mat, _m, { ...opts, faceMats: faceFn(opts.faces) });
    if (opts.collide !== false) this.collider([x0, y0, z0], [x1, y1, z1], mat, opts);
    return this;
  }

  /** Caixa orientada: centro, tamanho, rotação (Euler [x,y,z] ou só yaw). */
  obox(center, size, rot, mat, opts = {}) {
    const r = Array.isArray(rot) ? rot : [0, rot || 0, 0];
    _e.set(r[0], r[1], r[2], 'YXZ');
    _q.setFromEuler(_e);
    const M = new THREE.Matrix4().compose(_v.set(...center), _q, _s.set(...size));
    this.add(UNIT, mat, M, { ...opts, faceMats: faceFn(opts.faces) });
    if (opts.collide !== false && opts.collide !== undefined) {
      _box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1)).applyMatrix4(M);
      this.collider(_box.min.toArray(), _box.max.toArray(), mat, opts);
    }
    return M;
  }

  collider(min, max, mat, opts = {}) {
    if (!this.collision) return null;
    return this.collision.addBox(min, max, {
      material: opts.surface || SURFACE[mat] || 'concrete',
      tag: opts.tag || 'world',
      owner: opts.owner,
      blocksBullets: opts.blocksBullets,
      blocksPlayer: opts.blocksPlayer,
    });
  }

  /** Gera as malhas finais. mats: { nome: Material }. */
  build(root, mats, { noShadow = new Set(), noReceive = new Set() } = {}) {
    const meshes = [];
    for (const b of this.buckets.values()) {
      if (!b.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mat = mats[b.mat];
      if (!mat) {
        console.warn('[world] material inexistente', b.mat);
        continue;
      }
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = `world:${b.mat}`;
      mesh.castShadow = b.cast && !noShadow.has(b.mat);
      mesh.receiveShadow = !noReceive.has(b.mat);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    // proxies de sombra: invisíveis na cena (sem cor nem depth), só o
    // shadow map os enxerga — troca milhares de peças de fachada por 12 tri.
    if (this.proxies.length) {
      const pos = [];
      const g0 = UNIT;
      for (const [mn, mx] of this.proxies) {
        const P = g0.attributes.position;
        for (let i = 0; i < P.count; i++) {
          pos.push(
            mn[0] + (P.getX(i) + 0.5) * (mx[0] - mn[0]),
            mn[1] + (P.getY(i) + 0.5) * (mx[1] - mn[1]),
            mn[2] + (P.getZ(i) + 0.5) * (mx[2] - mn[2]),
          );
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      m.name = 'world:shadow-proxy';
      m.castShadow = true;
      m.receiveShadow = false;
      m.frustumCulled = false;
      m.renderOrder = -10;
      root.add(m);
      meshes.push(m);
      this.proxies = [];
    }
    return meshes;
  }
}

function faceFn(faces) {
  if (!faces) return null;
  const arr = FACE_NAMES.map((n) => (n in faces ? faces[n] : undefined));
  return (triIndex) => {
    const f = arr[Math.floor(triIndex / 2)];
    return f === undefined ? undefined : f;
  };
}

/** Geometria cacheada por chave (cilindros, esferas…). */
const CACHE = new Map();
export function cached(key, make) {
  let g = CACHE.get(key);
  if (!g) {
    g = make();
    CACHE.set(key, g);
  }
  return g;
}

/** Matriz a partir de posição, rotação Euler [x,y,z] (YXZ) e escala. */
export function mat4(pos, rot = [0, 0, 0], scale = [1, 1, 1]) {
  const r = Array.isArray(rot) ? rot : [0, rot, 0];
  _e.set(r[0], r[1], r[2], 'YXZ');
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(_e), new THREE.Vector3(...(Array.isArray(scale) ? scale : [scale, scale, scale])));
}

/**
 * Desloca vértices de uma geometria com ruído (pedras, entulho, sacos).
 * Determinístico pelo `seed`.
 */
export function jitterGeometry(geo, amount, seed = 1) {
  const g = geo.clone();
  const P = g.attributes.position;
  const key = new Map();
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < P.count; i++) {
    const k = `${P.getX(i).toFixed(3)},${P.getY(i).toFixed(3)},${P.getZ(i).toFixed(3)}`;
    let d = key.get(k);
    if (!d) {
      d = [(rnd() - 0.5) * amount, (rnd() - 0.5) * amount, (rnd() - 0.5) * amount];
      key.set(k, d);
    }
    P.setXYZ(i, P.getX(i) + d[0], P.getY(i) + d[1], P.getZ(i) + d[2]);
  }
  g.computeVertexNormals();
  return g;
}
