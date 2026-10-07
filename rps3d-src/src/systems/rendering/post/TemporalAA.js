// TAA próprio, sem buffer de velocidade: reprojeção pela profundidade
// logarítmica + movimento da câmera (origem flutuante), clamp de vizinhança
// em YCoCg com clipping de variância e mistura ponderada por luminância
// (evita flicker de pontos HDR muito brilhantes — estrelas, faíscas).
//
// Funciona nos dois backends (WebGPU e WebGL2) porque não depende de MRT de
// velocidade (que exigiria que todo material de todos os sistemas
// escrevesse velocidade). Objetos que se movem por conta própria são
// tratados pelo clamp de vizinhança (ghosting mínimo).
//
// O jitter sub-pixel é aplicado pelo Pipeline com camera.setViewOffset antes
// do pass de cena (sequência de Halton 2,3 de 8 amostras).
import * as THREE from 'three/webgpu';
import { TempNode, NodeMaterial, NodeUpdateType, RenderTarget, HalfFloatType, QuadMesh, RendererUtils } from 'three/webgpu';
import { Fn, vec2, vec3, vec4, float, uv, passTexture, texture, max, min, mix, clamp, abs, dot, uniform, select } from 'three/tsl';
import { viewDistFromDepth, reprojectUv } from './common.js';

const _quad = new QuadMesh();
let _state;
const _size = new THREE.Vector2();

export const HALTON = Array.from({ length: 8 }, (_, i) => {
  const h = (b, n) => { let f = 1, r = 0; n += 1; while (n > 0) { f /= b; r += f * (n % b); n = Math.floor(n / b); } return r; };
  return [h(2, i) - 0.5, h(3, i) - 0.5];
});

const rgb2ycocg = (c) => vec3(
  dot(c, vec3(0.25, 0.5, 0.25)),
  dot(c, vec3(0.5, 0, -0.5)),
  dot(c, vec3(-0.25, 0.5, -0.25)),
);
const ycocg2rgb = (c) => vec3(c.x.add(c.y).sub(c.z), c.x.add(c.z), c.x.sub(c.y).sub(c.z));

export class TemporalAANode extends TempNode {
  static get type() { return 'RpsTemporalAANode'; }

  constructor(colorNode, depthNode, U) {
    super('vec4');
    this.colorNode = colorNode;   // TextureNode do pass de cena (HDR)
    this.depthNode = depthNode;   // TextureNode de profundidade (log)
    this.U = U;
    this.updateBeforeType = NodeUpdateType.FRAME;
    const opt = { depthBuffer: false, type: HalfFloatType };
    this._rt = [new RenderTarget(1, 1, opt), new RenderTarget(1, 1, opt)];
    this._rt[0].texture.name = 'rps.taa.a'; this._rt[1].texture.name = 'rps.taa.b';
    this._cur = 0;
    this._history = texture(this._rt[1].texture);
    this._out = passTexture(this, this._rt[0].texture);
    this._mat = new NodeMaterial();
    this._mat.name = 'rps.taa.resolve';
    this.reset = uniform(1);       // 1 = descarta histórico (corte de câmera, resize)
    this.feedback = uniform(0.9);
    this._fresh = true;
  }

  getTextureNode() { return this._out; }

  /** Corte de câmera / teleporte: começa histórico novo. */
  invalidate() { this._fresh = true; }

  updateBefore(frame) {
    const { renderer } = frame;
    renderer.getDrawingBufferSize(_size);
    const w = Math.max(1, _size.width), h = Math.max(1, _size.height);
    const a = this._rt[this._cur], b = this._rt[1 - this._cur];
    if (a.width !== w || a.height !== h) {
      a.setSize(w, h); b.setSize(w, h);
      this._fresh = true;
    }
    this._history.value = b.texture;
    this.reset.value = this._fresh ? 1 : 0;
    this._fresh = false;
    _state = RendererUtils.resetRendererState(renderer, _state);
    renderer.setRenderTarget(a);
    _quad.material = this._mat;
    _quad.name = 'rps.taa';
    _quad.render(renderer);
    RendererUtils.restoreRendererState(renderer, _state);
    this._out.value = a.texture;
    this._cur = 1 - this._cur;
  }

  setup() {
    const U = this.U, C = this.colorNode, D = this.depthNode, H = this._history;
    const resolve = Fn(() => {
      const p = uv();
      const px = U.invRes;
      const cur = C.sample(p).rgb.max(0).toVar();
      // vizinhança 3×3: momentos em YCoCg
      const c0 = rgb2ycocg(cur).toVar();
      const m1 = c0.toVar(), m2 = c0.mul(c0).toVar();
      const nearD = D.sample(p).r.toVar();
      const offs = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
      for (const [x, y] of offs) {
        const q = p.add(vec2(x, y).mul(px));
        const s = rgb2ycocg(C.sample(q).rgb.max(0));
        m1.addAssign(s); m2.addAssign(s.mul(s));
        if (x === 0 || y === 0) nearD.assign(min(nearD, D.sample(q).r)); // profundidade mais próxima (bordas)
      }
      const mean = m1.div(9);
      const sigma = m2.div(9).sub(mean.mul(mean)).max(0).sqrt().mul(1.15);
      const lo = mean.sub(sigma), hi = mean.add(sigma);
      // reprojeção
      const dist = viewDistFromDepth(U, nearD);
      const prevUv = reprojectUv(U, p, dist, float(1));
      const offscreen = prevUv.x.lessThan(0).or(prevUv.x.greaterThan(1)).or(prevUv.y.lessThan(0)).or(prevUv.y.greaterThan(1));
      const hist = rgb2ycocg(H.sample(prevUv).rgb.max(0)).toVar();
      // clipping em direção à média (AABB)
      const center = mean, ext = hi.sub(lo).mul(0.5).add(1e-4);
      const v = hist.sub(center);
      const unit = abs(v.div(ext));
      const ma = max(unit.x, max(unit.y, unit.z));
      hist.assign(select(ma.greaterThan(1), center.add(v.div(ma)), hist));
      const histRgb = ycocg2rgb(hist).max(0);
      // velocidade em pixels → menos histórico quando rápido
      const velPx = prevUv.sub(p).div(px).length();
      const fb = mix(this.feedback, float(0.72), clamp(velPx.div(24), 0, 1));
      // pesos de Karis (luminância)
      const lc = dot(cur, vec3(0.2126, 0.7152, 0.0722));
      const lh = dot(histRgb, vec3(0.2126, 0.7152, 0.0722));
      const wc = float(1).sub(fb).div(lc.add(1));
      const wh = fb.div(lh.add(1));
      const blended = cur.mul(wc).add(histRgb.mul(wh)).div(wc.add(wh));
      const useCur = offscreen.or(this.reset.greaterThan(0.5));
      return vec4(select(useCur, cur, blended), 1);
    });
    this._mat.fragmentNode = resolve();
    this._mat.needsUpdate = true;
    return this._out;
  }

  dispose() { this._rt[0].dispose(); this._rt[1].dispose(); this._mat.dispose(); }
}
