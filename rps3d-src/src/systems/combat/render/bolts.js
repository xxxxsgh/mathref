// Lote de "raios" HDR: disparos (risco esticado com núcleo branco e halo da
// cor da facção), clarões redondos (boca do cano, impactos, flares, motor de
// míssil) e anéis (estilhaço de flak). Tudo numa única malha dinâmica com
// quads expandidos na CPU, em coordenadas relativas à câmera (origem
// flutuante) — barato, idêntico no WebGPU e no WebGL2, e cada disparo some
// exatamente no quadro do impacto.
//
// Tamanho mínimo em pixels: raios a quilômetros não somem nem cintilam; a
// largura é limitada a ~1,4 px e a intensidade cai na mesma proporção
// (energia conservada), como um traçador real visto de longe.
import * as THREE from 'three/webgpu';
import { Fn, attribute, uv, vec3, vec4, float, exp, pow, smoothstep, abs, max, select, mix } from 'three/tsl';
import { sstep } from './tsl.js';

const _h2 = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Vector3();
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();

export class BoltBatch {
  constructor(ctx, capacity = 800) {
    this.ctx = ctx;
    this.cap = capacity;
    const nv = capacity * 4;
    this.pos = new Float32Array(nv * 3);
    this.uvs = new Float32Array(nv * 2);
    this.col = new Float32Array(nv * 4);
    const idx = new Uint32Array(capacity * 6);
    for (let i = 0; i < capacity; i++) {
      const v = i * 4, k = i * 6;
      idx[k] = v; idx[k + 1] = v + 1; idx[k + 2] = v + 2; idx[k + 3] = v + 2; idx[k + 4] = v + 1; idx[k + 5] = v + 3;
    }
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('uv', this.aUv);
    g.setAttribute('boltCol', this.aCol);
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e12);
    this.geometry = g;
    this.material = makeMaterial();
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    this.mesh.name = 'combat.bolts';
    ctx.scene.add(this.mesh);
    this.n = 0;
    this.pxAngle = 0.0015;
  }

  begin() {
    this.n = 0;
    const cam = this.ctx.camera;
    const h = this.ctx.renderer?.domElement?.height || 720;
    this.pxAngle = (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(200, h);
    cam.updateMatrixWorld();
    _r.setFromMatrixColumn(cam.matrixWorld, 0);
    _u.setFromMatrixColumn(cam.matrixWorld, 1);
    _f.setFromMatrixColumn(cam.matrixWorld, 2).negate();
  }

  _quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, r, g, b, kind) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    const p = this.pos, u = this.uvs, c = this.col;
    let o = i * 12;
    p[o] = ax; p[o + 1] = ay; p[o + 2] = az; p[o + 3] = bx; p[o + 4] = by; p[o + 5] = bz;
    p[o + 6] = cx; p[o + 7] = cy; p[o + 8] = cz; p[o + 9] = dx; p[o + 10] = dy; p[o + 11] = dz;
    o = i * 8;
    u[o] = -1; u[o + 1] = 1; u[o + 2] = 1; u[o + 3] = 1; u[o + 4] = -1; u[o + 5] = -1; u[o + 6] = 1; u[o + 7] = -1;
    o = i * 16;
    for (let k = 0; k < 4; k++) { c[o + k * 4] = r; c[o + k * 4 + 1] = g; c[o + k * 4 + 2] = b; c[o + k * 4 + 3] = kind; }
  }

  /**
   * Raio: cabeça em `head` (espaço de render), direção unitária `dir`,
   * comprimento `len`, largura `w`. rgb já multiplicado pela intensidade.
   */
  bolt(head, dir, len, w, r, g, b) {
    // recorta o raio no plano da câmera: um quad que atravessa o plano próximo
    // some com o depth logarítmico (profundidade inválida atrás da câmera)
    const NEAR = 0.6;
    const dh = head.dot(_f), dd = dir.dot(_f);
    const dt = dh - dd * len;
    if (dh < NEAR && dt < NEAR) return;
    if (dh < NEAR) { // cabeça atrás, cauda na frente (raio vindo na direção da câmera)
      const k = (dt - NEAR) / Math.max(1e-4, dt - dh);
      _h.copy(head).addScaledVector(dir, -len * (1 - k));
      len *= k;
      head = _h2.copy(_h);
    } else if (dt < NEAR) len = Math.max(0.01, (dh - NEAR) / Math.max(1e-4, dd));
    const dist = Math.max(1, head.length());
    const minW = dist * this.pxAngle * 1.4;
    let k = 1;
    if (w < minW) { k = w / minW; w = minW; }
    k = Math.max(k, 0.05);
    _t.copy(head).addScaledVector(dir, -len);
    _m.copy(head).add(_t).multiplyScalar(0.5).normalize();
    _s.crossVectors(dir, _m);
    let sl = _s.length();
    if (sl < 1e-4) { _s.copy(_r); sl = 1; }
    _s.multiplyScalar(w / sl);
    // capas arredondadas: estende cabeça e cauda por meia largura
    _h.copy(head).addScaledVector(dir, w * 0.5);
    _t.addScaledVector(dir, -w * 0.5);
    this._quad(
      _h.x - _s.x, _h.y - _s.y, _h.z - _s.z, _h.x + _s.x, _h.y + _s.y, _h.z + _s.z,
      _t.x - _s.x, _t.y - _s.y, _t.z - _s.z, _t.x + _s.x, _t.y + _s.y, _t.z + _s.z,
      r * k, g * k, b * k, 0,
    );
  }

  /** Clarão redondo virado para a câmera (kind 1) ou anel (kind 2). */
  glow(center, size, r, g, b, kind = 1) {
    const dist = Math.max(1, center.length());
    const minS = dist * this.pxAngle * 2.2;
    let k = 1;
    if (size < minS) { k = (size / minS) ** 2; size = minS; }
    const ux = _u.x * size, uy = _u.y * size, uz = _u.z * size;
    const rx = _r.x * size, ry = _r.y * size, rz = _r.z * size;
    const c = center;
    this._quad(
      c.x - rx + ux, c.y - ry + uy, c.z - rz + uz, c.x + rx + ux, c.y + ry + uy, c.z + rz + uz,
      c.x - rx - ux, c.y - ry - uy, c.z - rz - uz, c.x + rx - ux, c.y + ry - uy, c.z + rz - uz,
      r * k, g * k, b * k, kind,
    );
  }

  end() {
    const n = this.n;
    this.geometry.setDrawRange(0, n * 6);
    for (const [a, w] of [[this.aPos, 12], [this.aUv, 8], [this.aCol, 16]]) {
      a.clearUpdateRanges();
      if (n > 0) a.addUpdateRange(0, n * w);
      a.needsUpdate = n > 0;
    }
    this.mesh.visible = n > 0;
  }

  dispose() { this.mesh.removeFromParent(); this.geometry.dispose(); this.material.dispose(); }
}

function makeMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  mat.fog = false;
  mat.toneMapped = true;
  const C = attribute('boltCol', 'vec4');
  const q = uv(); // x: −1..1 através, y: −1 (cauda) .. 1 (cabeça)
  mat.colorNode = Fn(() => {
    const tint = C.xyz;
    // ── raio ────────────────────────────────────────────────────────────
    const across = exp(q.x.mul(q.x).mul(-5.5));
    const core = pow(across, 9.0);
    const tail = smoothstep(-1.0, 0.1, q.y);
    const head = sstep(1.0, 0.86, q.y);
    const along = tail.mul(head).mul(q.y.mul(0.3).add(0.75));
    const white = vec3(1.0, 0.97, 0.92);
    const boltCol = mix(tint, white.mul(max(max(tint.x, tint.y), tint.z)), core.mul(0.8)).mul(across.mul(0.55).add(core.mul(1.5))).mul(along);
    // ── clarão / anel ──────────────────────────────────────────────────
    const r2 = q.x.mul(q.x).add(q.y.mul(q.y));
    const halo = exp(r2.mul(-4.2)).sub(0.015).max(0);
    const hot = exp(r2.mul(-28.0));
    const glowCol = tint.mul(halo).add(white.mul(max(max(tint.x, tint.y), tint.z)).mul(hot).mul(0.9));
    const ring = exp(abs(r2.sqrt().sub(0.72)).mul(-14.0)).mul(sstep(1.0, 0.85, r2.sqrt()));
    const ringCol = tint.mul(ring).add(tint.mul(halo).mul(0.25));
    const col = select(C.w.lessThan(0.5), boltCol, select(C.w.lessThan(1.5), glowCol, ringCol));
    return vec4(col, float(1));
  })();
  return mat;
}
