/**
 * ESCALA PLANETÁRIA — posições em double e ORIGEM FLUTUANTE.
 *
 * Números de JS são double (53 bits de mantissa): uma posição guardada num
 * `Vector3` comum já é double enquanto vive no CPU. A precisão só se perde
 * quando vai para a GPU (float32, ~7 dígitos): 120 000 m em float32 têm
 * passo de 7,8 mm, e 1e7 m, passo de 1 m — por isso NADA do mundo vai para
 * a GPU em coordenadas absolutas.
 *
 * Renderização relativa à câmera: a cada frame o núcleo põe a ORIGEM DE
 * RENDER na posição (double) da câmera; a câmera three fica em (0,0,0) e
 * todo objeto é desenhado em `posiçãoMundo − origem` (subtração em double,
 * resultado pequeno perto da câmera → float32 exato onde importa).
 *
 *   ctx.space.toRender(worldPos, out)       → Vector3 em espaço de render
 *   ctx.space.toWorld(renderPos, out)       → WorldPos
 *   ctx.space.registerFloating(obj, worldPos, { compress }) → handle
 *       o núcleo reposiciona `obj.position` a cada frame (antes de
 *       features.frame). `worldPos` é VIVO: mova o objeto mutando-o.
 *       handle.remove() desfaz; handle.baseScale é a escala "real".
 *   ctx.space.origin                        → WorldPos (= câmera, só leitura)
 *   ctx.space.planetCenter                  → WorldPos do centro do planeta atual
 *
 * Geometria grande (um chunk de terreno) deve ter vértices RELATIVOS a uma
 * âncora própria (o centro do chunk), e a âncora é que é registrada como
 * flutuante. Assim os vértices ficam pequenos e a âncora é subtraída em double.
 *
 * COMPRESSÃO DE DISTÂNCIA (corpos celestes): com `compress: true`, um objeto
 * além de `compressBeyond` (5e7 m) é desenhado mais perto, a d' =
 * C·(1 + ln(d/C)), com a escala multiplicada por d'/d — o tamanho angular é
 * o mesmo, a ordem de profundidade entre corpos comprimidos é preservada
 * (d' é monótona) e tudo cabe com folga no far plane (CAMERA_FAR) e no
 * float32.
 */
import { Vector3 } from 'three';

/** Posição de mundo em double. É um Vector3 (que já é double no CPU) marcado. */
export class WorldPos extends Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    super(x, y, z);
    this.isWorldPos = true;
  }
  static from(v) {
    return new WorldPos(v.x, v.y, v.z);
  }
  clone() {
    return new WorldPos(this.x, this.y, this.z);
  }
}

/** Distância a partir da qual objetos com `compress` são aproximados. */
export const COMPRESS_BEYOND = 5e7;
/** Plano near/far da câmera do mundo (m). Ver core/Depth.js. */
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 1e10;

/** d → d' (compressão logarítmica além de C). */
export function compressDistance(d, C = COMPRESS_BEYOND) {
  return d <= C ? d : C * (1 + Math.log(d / C));
}

export class Space {
  constructor() {
    this.origin = new WorldPos();
    this.planetCenter = new WorldPos();
    this.compressBeyond = COMPRESS_BEYOND;
    this.items = new Map();
    /** contador de frames reposicionados (diagnóstico) */
    this.updates = 0;
  }

  /** Define a origem de render (o núcleo chama com a posição da câmera). */
  setOrigin(p) {
    this.origin.set(p.x, p.y, p.z);
  }

  toRender(wp, out = new Vector3()) {
    const o = this.origin;
    return out.set(wp.x - o.x, wp.y - o.y, wp.z - o.z);
  }

  toWorld(rp, out = new WorldPos()) {
    const o = this.origin;
    return out.set(rp.x + o.x, rp.y + o.y, rp.z + o.z);
  }

  /**
   * Posição de render com compressão; devolve o fator de escala (≤ 1).
   */
  toRenderCompressed(wp, out = new Vector3()) {
    this.toRender(wp, out);
    const d = out.length();
    const C = this.compressBeyond;
    if (d <= C) return 1;
    const k = compressDistance(d, C) / d;
    out.multiplyScalar(k);
    return k;
  }

  /** Distância (m) do ponto ao centro do planeta. */
  radiusOf(wp) {
    const c = this.planetCenter;
    return Math.hypot(wp.x - c.x, wp.y - c.y, wp.z - c.z);
  }

  /** Direção unitária do centro do planeta até wp. */
  upAt(wp, out = new Vector3()) {
    const c = this.planetCenter;
    out.set(wp.x - c.x, wp.y - c.y, wp.z - c.z);
    const l = out.length();
    return l > 0 ? out.multiplyScalar(1 / l) : out.set(0, 1, 0);
  }

  registerFloating(obj, worldPos = new WorldPos(), { compress = false } = {}) {
    if (!worldPos.isWorldPos) worldPos = WorldPos.from(worldPos);
    const h = {
      object: obj,
      worldPos,
      compress,
      baseScale: obj.scale.clone(),
      scaleK: 1,
      remove: () => this.unregister(obj),
    };
    this.items.set(obj, h);
    this._apply(h);
    return h;
  }

  unregister(obj) {
    const h = this.items.get(obj);
    if (!h) return false;
    if (h.compress) obj.scale.copy(h.baseScale);
    this.items.delete(obj);
    return true;
  }

  _apply(h) {
    if (h.compress) {
      const k = this.toRenderCompressed(h.worldPos, h.object.position);
      h.scaleK = k;
      h.object.scale.copy(h.baseScale).multiplyScalar(k);
    } else this.toRender(h.worldPos, h.object.position);
  }

  /**
   * Translada o referencial do mundo (troca de planeta atual): todo
   * worldPos REGISTRADO é deslocado por −offset. Emitido pelo universe via
   * bus 'space:recenter' { offset }; o núcleo chama isto e move o jogador.
   */
  recenter(offset) {
    const seen = new Set();
    for (const h of this.items.values()) {
      if (seen.has(h.worldPos)) continue;
      seen.add(h.worldPos);
      h.worldPos.sub(offset);
    }
    this.origin.sub(offset);
  }

  /** Reposiciona todos os objetos flutuantes (uma vez por frame). */
  update() {
    for (const h of this.items.values()) this._apply(h);
    this.updates++;
  }
}
