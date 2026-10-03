import { Box3, Vector3 } from 'three';

/**
 * Mundo de colisão simples e rápido, independente de malhas de render.
 *
 * - Colisores ESTÁTICOS são AABBs indexadas numa grade uniforme no plano XZ.
 * - Colisores DINÂMICOS fornecem getBox(target) e são consultados sempre
 *   (inimigos, portas, veículos). Podem ter um `ray(origin, dir, maxDist)`
 *   próprio para refinar o acerto (hitboxes de cabeça/tronco etc.).
 * - O jogador é tratado como uma cápsula vertical aproximada por uma AABB
 *   (raio + altura), resolvida eixo a eixo, com subida de degrau.
 *
 * Todo colisor tem: { id, tag, owner, material, trigger, enabled, data }.
 */
const EPS = 1e-4;
const _box = new Box3();
const _b2 = new Box3();
const _v = new Vector3();

export class Collision {
  constructor({ cellSize = 8 } = {}) {
    this.cellSize = cellSize;
    this.colliders = new Map();
    this.dynamic = new Set();
    this.grid = new Map();
    this.nextId = 1;
    this._stamp = 0;
  }

  // ─── registro ──────────────────────────────────────────────────────────
  /** AABB estática a partir de min/max (Vector3 ou [x,y,z]). Retorna o id. */
  addBox(min, max, opts = {}) {
    const box = new Box3(toV(min), toV(max));
    return this._addStatic(box, opts);
  }
  /** AABB estática centrada: center [x,y,z], size [w,h,d]. */
  addBoxCentered(center, size, opts = {}) {
    const c = toV(center), s = toV(size).multiplyScalar(0.5);
    return this._addStatic(new Box3(c.clone().sub(s), c.clone().add(s)), opts);
  }
  /**
   * Registra a AABB de mundo de um Object3D. Com { perMesh: true } registra
   * uma AABB por Mesh filho (melhor para grupos irregulares).
   */
  addObject(obj, opts = {}) {
    obj.updateWorldMatrix(true, true);
    if (!opts.perMesh) return [this._addStatic(new Box3().setFromObject(obj), { owner: obj, ...opts })];
    const ids = [];
    obj.traverse((m) => {
      if (m.isMesh) ids.push(this._addStatic(new Box3().setFromObject(m), { owner: m, ...opts }));
    });
    return ids;
  }
  /** Colisor dinâmico: getBox(targetBox3) é chamado a cada consulta. */
  addDynamic(getBox, opts = {}) {
    const c = this._make(new Box3(), opts);
    c.getBox = getBox;
    c.dynamic = true;
    this.colliders.set(c.id, c);
    this.dynamic.add(c);
    return c.id;
  }
  get(id) {
    return this.colliders.get(id);
  }
  remove(id) {
    const c = this.colliders.get(id);
    if (!c) return false;
    this.colliders.delete(id);
    if (c.dynamic) this.dynamic.delete(c);
    else for (const key of c.cells) this.grid.get(key)?.delete(c);
    return true;
  }
  removeByTag(tag) {
    let n = 0;
    for (const c of [...this.colliders.values()]) if (c.tag === tag && this.remove(c.id)) n++;
    return n;
  }
  clear() {
    this.colliders.clear();
    this.dynamic.clear();
    this.grid.clear();
  }

  _make(box, opts) {
    return {
      id: this.nextId++,
      box,
      tag: opts.tag ?? 'world',
      owner: opts.owner ?? null,
      material: opts.material ?? 'concrete',
      trigger: !!opts.trigger,
      enabled: opts.enabled ?? true,
      blocksPlayer: opts.blocksPlayer ?? true,
      blocksBullets: opts.blocksBullets ?? true,
      ray: opts.ray ?? null,
      data: opts.data ?? null,
      cells: [],
      _stamp: 0,
    };
  }
  _addStatic(box, opts) {
    const c = this._make(box, opts);
    const s = this.cellSize;
    const x0 = Math.floor(box.min.x / s), x1 = Math.floor(box.max.x / s);
    const z0 = Math.floor(box.min.z / s), z1 = Math.floor(box.max.z / s);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const key = x + ',' + z;
        if (!this.grid.has(key)) this.grid.set(key, new Set());
        this.grid.get(key).add(c);
        c.cells.push(key);
      }
    this.colliders.set(c.id, c);
    return c.id;
  }
  _box(c) {
    if (c.dynamic) c.getBox(c.box);
    return c.box;
  }

  // ─── consultas ─────────────────────────────────────────────────────────
  /** Colisores (habilitados) cuja AABB intersecta `box`. */
  queryBox(box, out = [], filter = null) {
    const stamp = ++this._stamp;
    const s = this.cellSize;
    const x0 = Math.floor(box.min.x / s), x1 = Math.floor(box.max.x / s);
    const z0 = Math.floor(box.min.z / s), z1 = Math.floor(box.max.z / s);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const set = this.grid.get(x + ',' + z);
        if (!set) continue;
        for (const c of set) {
          if (c._stamp === stamp || !c.enabled) continue;
          c._stamp = stamp;
          if (c.box.intersectsBox(box) && (!filter || filter(c))) out.push(c);
        }
      }
    for (const c of this.dynamic) {
      if (!c.enabled) continue;
      if (this._box(c).intersectsBox(box) && (!filter || filter(c))) out.push(c);
    }
    return out;
  }
  /** Colisores cuja AABB toca a esfera. */
  overlapSphere(center, radius, filter = null) {
    _b2.min.set(center.x - radius, center.y - radius, center.z - radius);
    _b2.max.set(center.x + radius, center.y + radius, center.z + radius);
    return this.queryBox(_b2, [], filter).filter((c) => c.box.distanceToPoint(center) <= radius);
  }

  /**
   * Raio contra o mundo. dir deve ser normalizado.
   * opts: { filter(c) => bool, ignoreOwner, bullets: true (respeita blocksBullets), triggers: false }
   * Retorna { point, normal, distance, collider, part } ou null.
   */
  raycast(origin, dir, maxDist = 1000, opts = {}) {
    const bullets = opts.bullets ?? true;
    const accept = (c) =>
      c.enabled &&
      (opts.triggers || !c.trigger) &&
      (!bullets || c.blocksBullets) &&
      (!opts.ignoreOwner || c.owner !== opts.ignoreOwner) &&
      (!opts.filter || opts.filter(c));
    let best = null;
    const test = (c) => {
      if (!accept(c)) return;
      const box = this._box(c);
      const hit = rayBox(origin, dir, box, best ? best.distance : maxDist);
      if (!hit) return;
      if (c.ray) {
        const r = c.ray(origin, dir, best ? best.distance : maxDist);
        if (!r) return;
        best = { point: r.point ?? origin.clone().addScaledVector(dir, r.distance), normal: r.normal ?? hit.normal, distance: r.distance, collider: c, part: r.part ?? null };
        return;
      }
      best = { point: origin.clone().addScaledVector(dir, hit.t), normal: hit.normal, distance: hit.t, collider: c, part: null };
    };
    // Percorre a grade ao longo do raio (DDA em XZ).
    const stamp = ++this._stamp;
    const s = this.cellSize;
    let cx = Math.floor(origin.x / s), cz = Math.floor(origin.z / s);
    const stepX = dir.x > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const tDx = dir.x !== 0 ? Math.abs(s / dir.x) : Infinity;
    const tDz = dir.z !== 0 ? Math.abs(s / dir.z) : Infinity;
    let tMx = dir.x !== 0 ? ((dir.x > 0 ? (cx + 1) * s - origin.x : origin.x - cx * s) / Math.abs(dir.x)) : Infinity;
    let tMz = dir.z !== 0 ? ((dir.z > 0 ? (cz + 1) * s - origin.z : origin.z - cz * s) / Math.abs(dir.z)) : Infinity;
    let t = 0;
    for (let guard = 0; guard < 4096; guard++) {
      const set = this.grid.get(cx + ',' + cz);
      if (set)
        for (const c of set) {
          if (c._stamp === stamp) continue;
          c._stamp = stamp;
          test(c);
        }
      if (best && best.distance <= t) break;
      if (tMx < tMz) {
        t = tMx;
        tMx += tDx;
        cx += stepX;
      } else {
        t = tMz;
        tMz += tDz;
        cz += stepZ;
      }
      if (t > maxDist) break;
    }
    for (const c of this.dynamic) test(c);
    return best;
  }

  /** Altura do chão sob (x,z) a partir de fromY, ou null. */
  groundHeight(x, z, fromY = 100, maxDrop = 200) {
    const hit = this.raycast(_v.set(x, fromY, z).clone(), new Vector3(0, -1, 0), maxDrop, { bullets: false });
    return hit ? hit.point.y : null;
  }

  /** Linha de visão livre entre dois pontos (só geometria que bloqueia tiros). */
  lineOfSight(a, b, opts = {}) {
    const d = b.clone().sub(a);
    const len = d.length();
    if (len < EPS) return true;
    const hit = this.raycast(a, d.divideScalar(len), len, opts);
    return !hit || hit.distance >= len - 0.05;
  }

  /**
   * Move uma cápsula vertical (pés em `pos`) por `delta`, resolvendo eixo a
   * eixo contra os colisores. Muta `pos`. Opções: radius, height, stepHeight,
   * wasGrounded. Retorna { onGround, hitCeiling, hitWall, groundCollider }.
   */
  moveCapsule(pos, delta, { radius = 0.35, height = 1.8, stepHeight = 0.45, wasGrounded = false, filter = null } = {}) {
    const res = { onGround: false, hitCeiling: false, hitWall: false, groundCollider: null };
    const len = Math.max(Math.abs(delta.x), Math.abs(delta.y), Math.abs(delta.z));
    const n = Math.min(16, Math.max(1, Math.ceil(len / (radius * 0.5))));
    const accept = (c) => !c.trigger && c.blocksPlayer && (!filter || filter(c));
    const cands = [];
    const playerBox = (b, p) => {
      b.min.set(p.x - radius, p.y, p.z - radius);
      b.max.set(p.x + radius, p.y + height, p.z + radius);
      return b;
    };
    for (let i = 0; i < n; i++) {
      for (const axis of ['x', 'z', 'y']) {
        const amt = delta[axis] / n;
        if (amt === 0 && axis !== 'y') continue;
        pos[axis] += amt;
        cands.length = 0;
        this.queryBox(playerBox(_box, pos), cands, (c) => accept(c) && overlaps(c.box, _box));
        for (const c of cands) {
          const b = c.box;
          playerBox(_box, pos);
          if (!overlaps(b, _box)) continue;
          if (axis === 'y') {
            if (amt <= 0) {
              pos.y = b.max.y;
              res.onGround = true;
              res.groundCollider = c;
            } else {
              pos.y = b.min.y - height - EPS;
              res.hitCeiling = true;
            }
          } else {
            // Subida de degrau: se o topo do obstáculo está ao alcance e há
            // espaço livre acima dele, sobe em vez de bloquear.
            const rise = b.max.y - pos.y;
            if ((wasGrounded || res.onGround) && rise > 0 && rise <= stepHeight) {
              const old = pos.y;
              pos.y = b.max.y + EPS;
              playerBox(_b2, pos);
              const free = this.queryBox(_b2, [], (k) => accept(k) && overlaps(k.box, _b2)).length === 0;
              if (free) continue;
              pos.y = old;
            }
            pos[axis] = amt > 0 ? b.min[axis] - radius - EPS : b.max[axis] + radius + EPS;
            res.hitWall = true;
          }
        }
      }
    }
    return res;
  }
}

/** Sobreposição ESTRITA (encostar não conta — senão ficar em pé no chão vira "parede"). */
function overlaps(a, b) {
  return (
    a.min.x < b.max.x - EPS && a.max.x > b.min.x + EPS &&
    a.min.y < b.max.y - EPS && a.max.y > b.min.y + EPS &&
    a.min.z < b.max.z - EPS && a.max.z > b.min.z + EPS
  );
}

function toV(a) {
  return a.isVector3 ? a.clone() : new Vector3(a[0], a[1], a[2]);
}

/** Teste de slab raio×AABB. Retorna { t, normal } ou null. Origem dentro → t=0. */
export function rayBox(o, d, box, maxT = Infinity) {
  let tmin = 0, tmax = maxT, axis = -1, sign = 0;
  const comps = ['x', 'y', 'z'];
  for (let i = 0; i < 3; i++) {
    const k = comps[i];
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < box.min[k] || o[k] > box.max[k]) return null;
      continue;
    }
    const inv = 1 / d[k];
    let t1 = (box.min[k] - o[k]) * inv, t2 = (box.max[k] - o[k]) * inv;
    let s = -1;
    if (t1 > t2) {
      const tmp = t1; t1 = t2; t2 = tmp; s = 1;
    }
    if (t1 > tmin) {
      tmin = t1; axis = i; sign = s;
    }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  const normal = new Vector3();
  if (axis >= 0) normal.setComponent(axis, sign);
  else normal.set(-d.x, -d.y, -d.z);
  return { t: tmin, normal };
}
