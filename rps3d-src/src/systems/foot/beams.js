// Feixes e rastros de energia (instanciados, HDR aditivo): disparos de pulso,
// plasma, trilho (sniper), íons, laser de mineração, raios de sentinelas.
// Cada feixe é um segmento [a, b] em coordenadas de MUNDO (double na CPU);
// a cada frame as pontas viram coordenadas de render (relativas à câmera) e
// o vértice monta um quad virado para a câmera ao longo do segmento.
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, vec3, vec4, float, normalize, cross, length, positionGeometry, mix, exp, smoothstep, abs, pow, select, sin, time,
} from 'three/tsl';

export class Beams {
  constructor(ctx, capacity = 256) {
    this.ctx = ctx;
    this.cap = capacity;
    this.items = [];
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1); // x ∈ [−.5,.5] (através), y ∈ [−.5,.5] (ao longo)
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4); // início + largura
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4); // fim + intensidade
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4); // cor + estilo
    for (const a of [this.aA, this.aB, this.aC]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('bA', this.aA); geo.setAttribute('bB', this.aB); geo.setAttribute('bC', this.aC);
    geo.instanceCount = 0;
    this.geo = geo;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const A = attribute('bA', 'vec4'), B = attribute('bB', 'vec4'), C = attribute('bC', 'vec4');
    mat.positionNode = Fn(() => {
      const p0 = A.xyz, p1 = B.xyz;
      const corner = positionGeometry;
      const t = corner.y.add(0.5);
      const axis = p1.sub(p0);
      const mid = mix(p0, p1, t);
      const view = normalize(mid);
      const side = normalize(cross(axis, view));
      // capuz arredondado: estende metade da largura nas pontas
      const along = normalize(axis).mul(corner.y.sign().mul(A.w).mul(0.5));
      return mid.add(side.mul(corner.x.mul(A.w))).add(along);
    })();
    mat.colorNode = Fn(() => {
      const u = positionGeometry.x.mul(2); // −1..1 através
      const v = positionGeometry.y.add(0.5); // 0..1 ao longo
      const across = exp(u.mul(u).mul(-6.0));
      const core = pow(across, 8.0);
      // estilo: 0 = disparo (cabeça brilhante), 1 = contínuo (laser), 2 = trilho (espiral)
      const st = C.w;
      const head = select(st.lessThan(0.5), smoothstep(0.0, 1.0, v).mul(0.85).add(0.15), float(1));
      const spiral = select(st.greaterThan(1.5), sin(v.mul(90).add(time.mul(40)).add(u.mul(3))).mul(0.35).add(0.75), float(1));
      const flick = select(st.greaterThan(0.5).and(st.lessThan(1.5)), sin(time.mul(70).add(v.mul(20))).mul(0.12).add(0.95), float(1));
      const col = mix(C.xyz, vec3(1.0, 0.98, 0.95), core.mul(0.45));
      const ends = smoothstep(0.0, 0.03, v).mul(smoothstep(1.0, 0.97, v)).max(select(st.lessThan(0.5), float(1), float(0)));
      return vec4(col.mul(B.w).mul(across.add(core.mul(2))).mul(head).mul(spiral).mul(flick).mul(ends), 1);
    })();
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
    this.mesh.name = 'foot.feixes';
    ctx.scene.add(this.mesh);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
  }

  /**
   * Adiciona um feixe. o = { a, b (Vector3 mundo, referenciados ou getters),
   * get(outA, outB) opcional, width, color [r,g,b] HDR, intensity, life, style, fade }
   */
  add(o) {
    const it = Object.assign({ width: 0.05, color: [0.4, 0.8, 1.0], intensity: 20, life: 0.1, style: 0, t: 0, fade: true }, o);
    if (this.items.length >= this.cap) this.items.shift();
    this.items.push(it);
    it.remove = () => { const i = this.items.indexOf(it); if (i >= 0) this.items.splice(i, 1); };
    return it;
  }

  frame(dt) {
    const origin = this.ctx.world.origin;
    let n = 0;
    const A = this.aA.array, B = this.aB.array, C = this.aC.array;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.t += dt;
      if (it.life > 0 && it.t > it.life) { this.items.splice(i, 1); continue; }
    }
    for (const it of this.items) {
      if (n >= this.cap) break;
      const a = this._a, b = this._b;
      if (it.get) { if (!it.get(a, b)) continue; } else { a.copy(it.a); b.copy(it.b); }
      a.sub(origin); b.sub(origin);
      const k = it.life > 0 && it.fade ? Math.max(0, 1 - it.t / it.life) : 1;
      const j = n * 4;
      A[j] = a.x; A[j + 1] = a.y; A[j + 2] = a.z; A[j + 3] = it.width * (it.fade === 'shrink' ? k : 1);
      B[j] = b.x; B[j + 1] = b.y; B[j + 2] = b.z; B[j + 3] = it.intensity * (it.fade === 'shrink' ? 1 : k * k);
      C[j] = it.color[0]; C[j + 1] = it.color[1]; C[j + 2] = it.color[2]; C[j + 3] = it.style;
      n++;
    }
    this.geo.instanceCount = n;
    if (n) {
      for (const a of [this.aA, this.aB, this.aC]) { a.clearUpdateRanges(); a.addUpdateRange(0, n * 4); a.needsUpdate = true; }
    }
  }
  clear() { this.items.length = 0; }
  dispose() { this.mesh.removeFromParent(); this.geo.dispose(); }
}

export const COLORS = {
  blue: [0.35, 0.78, 1.0], orange: [1.0, 0.45, 0.12], violet: [0.78, 0.62, 1.0], green: [0.42, 1.0, 0.55],
  gold: [1.0, 0.72, 0.28], red: [1.0, 0.22, 0.12], cyan: [0.3, 1.0, 0.85], white: [1, 1, 1],
};
void length; void abs;
