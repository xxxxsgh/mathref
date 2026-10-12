/**
 * Efeitos de COMBATE (instanciados, poucas chamadas):
 *   Beams       feixes de laser (quads cruzados aditivos: núcleo branco +
 *               halo colorido), 1 chamada
 *   Explosions  bolas de fogo (esferas deformadas por ruído, cor por
 *               temperatura com a idade) + onda de choque, 2 chamadas
 *   Sparks      faíscas/detritos incandescentes (pontos), 1 chamada
 *   Rockets     foguetes (corpo instanciado) + rastro de fumaça (pontos)
 *
 * Tudo em coordenadas de MUNDO (double) guardadas aqui e convertidas para
 * render (câmera na origem) a cada frame.
 */
import * as THREE from 'three';

const LOGV = `#include <common>
#include <logdepthbuf_pars_vertex>`;
const LOGF = `#include <common>
#include <logdepthbuf_pars_fragment>`;
const NOISE3 = /* glsl */ `
float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
float f3(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
`;

function glowTex(size = 64, pow = 2) {
  const d = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.min(1, Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1));
      const i = (y * size + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.pow(1 - r, pow) * 255;
    }
  const t = new THREE.DataTexture(d, size, size);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// ─────────────────────────────────────────────────────────────── lasers
export class Beams {
  constructor(max = 48) {
    this.max = max;
    // dois quads cruzados ao longo de +Z (0..1)
    const g = new THREE.BufferGeometry();
    const P = [];
    const UV = [];
    for (const rot of [0, Math.PI / 2]) {
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const q = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];
      for (const [u, z] of q) {
        P.push(u * c, u * s, z);
        UV.push(u, z);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `${LOGV}
        varying vec2 vUv; varying vec3 vCol;
        void main(){
          vUv = uv;
          vCol = instanceColor;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGF}
        varying vec2 vUv; varying vec3 vCol;
        void main(){
          #include <logdepthbuf_fragment>
          float r = abs(vUv.x);
          float core = exp(-r * r * 60.0);
          float halo = exp(-r * r * 5.0) * 0.55;
          float ends = smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
          vec3 c = (vec3(1.0) * core * 2.0 + vCol * (halo + core)) * ends;
          gl_FragColor = vec4(c * 4.0, 1.0);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 10;
    this.list = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }
  /** a,b: posições de MUNDO; width m; life s; color THREE.Color */
  add(a, b, color, width = 0.35, life = 0.09) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ a: a.clone(), b: b.clone(), color: color.clone(), width, life, t: 0 });
  }
  frame(dt, space) {
    let n = 0;
    const Z = new THREE.Vector3(0, 0, 1);
    this.list = this.list.filter((L) => (L.t += dt) < L.life);
    for (const L of this.list) {
      space.toRender(L.a, this._a);
      space.toRender(L.b, this._b);
      const d = this._b.clone().sub(this._a);
      const len = d.length();
      if (len < 1e-3) continue;
      this._q.setFromUnitVectors(Z, d.multiplyScalar(1 / len));
      const fade = 1 - L.t / L.life;
      this._m.compose(this._a, this._q, new THREE.Vector3(L.width, L.width, len));
      this.mesh.setMatrixAt(n, this._m);
      this.mesh.instanceColor.setXYZ(n, L.color.r * fade, L.color.g * fade, L.color.b * fade);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = n > 0;
  }
}

// ─────────────────────────────────────────────────────────── explosões
export class Explosions {
  constructor(max = 12) {
    this.max = max;
    this.list = [];
    const geo = new THREE.IcosahedronGeometry(1, 4);
    this.fireMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `${LOGV}
        ${NOISE3}
        attribute float aAge; attribute float aSeed;
        varying float vAge; varying vec3 vN; varying vec3 vV; varying float vDisp; varying vec3 vP;
        void main(){
          vAge = aAge;
          vec3 p = position;
          float d = f3(p * 2.2 + aSeed * 13.0 + aAge * 1.5);
          vDisp = d;
          p *= 0.75 + d * 0.65;
          vP = position;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * mat3(instanceMatrix) * position);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGF}
        ${NOISE3}
        varying float vAge; varying vec3 vN; varying vec3 vV; varying float vDisp; varying vec3 vP;
        void main(){
          #include <logdepthbuf_fragment>
          float f = abs(dot(normalize(vN), normalize(vV)));
          float n = f3(vP * 4.0 + vAge * 3.0);
          // temperatura cai com a idade; núcleo (face frontal) mais quente
          float T = clamp(1.25 - vAge * 1.1 + (f - 0.5) * 0.6 + (n - 0.5) * 0.7, 0.0, 1.4);
          vec3 c = mix(vec3(0.25, 0.05, 0.02), vec3(1.0, 0.35, 0.05), smoothstep(0.1, 0.55, T));
          c = mix(c, vec3(1.0, 0.85, 0.5), smoothstep(0.6, 1.0, T));
          c = mix(c, vec3(1.0), smoothstep(1.05, 1.35, T));
          float a = pow(f, 0.8) * (1.0 - smoothstep(0.65, 1.0, vAge)) * smoothstep(0.25, 0.6, n + 0.3);
          gl_FragColor = vec4(c * a * (3.0 + 6.0 * (1.0 - vAge)), 1.0);
        }`,
    });
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = geo.index;
    ig.setAttribute('position', geo.attributes.position);
    ig.setAttribute('normal', geo.attributes.normal);
    this.age = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.seed = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    ig.setAttribute('aAge', this.age);
    ig.setAttribute('aSeed', this.seed);
    this.fire = new THREE.InstancedMesh(ig, this.fireMat, max);
    this.fire.frustumCulled = false;
    this.fire.count = 0;
    this.fire.renderOrder = 11;
    // onda de choque: anel plano (billboard orientado pela câmera)
    const ring = new THREE.RingGeometry(0.6, 1, 48, 1);
    this.ringMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `${LOGV}
        varying vec2 vUv; varying vec3 vCol;
        void main(){ vUv = uv; vCol = instanceColor;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGF}
        varying vec2 vUv; varying vec3 vCol;
        void main(){
          #include <logdepthbuf_fragment>
          float r = length(vUv - 0.5) * 2.0;
          float a = smoothstep(0.6, 0.9, r) * smoothstep(1.0, 0.92, r);
          gl_FragColor = vec4(vCol * a * 3.0, 1.0);
        }`,
    });
    this.ring = new THREE.InstancedMesh(ring, this.ringMat, max);
    this.ring.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.ring.frustumCulled = false;
    this.ring.count = 0;
    this.ring.renderOrder = 11;
    this.group = new THREE.Group();
    this.group.add(this.fire, this.ring);
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }
  /** pos MUNDO, size m, opcional age inicial (s) e duração */
  /** fixedK: idade normalizada congelada (encenação de screenshot) */
  add(pos, size = 12, { age = 0, life = 1.6, seed = Math.random(), fixedK = null } = {}) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ pos: pos.clone(), size, t: age, life, seed, fixedK });
  }
  frame(dt, space, camQuat) {
    this.list = this.list.filter((e) => e.fixedK != null || (e.t += dt) < e.life);
    let n = 0;
    for (const e of this.list) {
      const k = e.fixedK != null ? e.fixedK : e.t / e.life;
      space.toRender(e.pos, this._p);
      const s = e.size * (0.35 + 1.1 * Math.pow(k, 0.45));
      this._m.compose(this._p, this._q.identity(), new THREE.Vector3(s, s, s));
      this.fire.setMatrixAt(n, this._m);
      this.age.setX(n, k);
      this.seed.setX(n, e.seed);
      // anel: de frente para a câmera, expande rápido
      const rs = e.size * (0.5 + 4.5 * Math.pow(k, 0.6));
      this._m.compose(this._p, camQuat, new THREE.Vector3(rs, rs, rs));
      this.ring.setMatrixAt(n, this._m);
      const fade = Math.max(0, 1 - k * 1.6);
      this.ring.instanceColor.setXYZ(n, 1.0 * fade, 0.6 * fade, 0.35 * fade);
      n++;
    }
    this.fire.count = this.ring.count = n;
    this.fire.instanceMatrix.needsUpdate = true;
    this.ring.instanceMatrix.needsUpdate = true;
    this.ring.instanceColor.needsUpdate = true;
    this.age.needsUpdate = true;
    this.seed.needsUpdate = true;
    this.group.visible = n > 0;
  }
}

// ─────────────────────────────────────────────────── faíscas / fumaça
export class Particles {
  /** additive: faíscas incandescentes; senão fumaça (alfa) */
  constructor(max = 600, additive = true) {
    this.max = max;
    this.additive = additive;
    this.p = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tGlow: { value: glowTex(64, additive ? 2.5 : 1.3) } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */ `${LOGV}
        attribute vec4 aCol; attribute float aSize; varying vec4 vCol;
        void main(){ vCol = aCol;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * 800.0 / -mv.z, 1.0, 256.0);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGF}
        uniform sampler2D tGlow; varying vec4 vCol;
        void main(){
          #include <logdepthbuf_fragment>
          float a = texture2D(tGlow, gl_PointCoord).a;
          gl_FragColor = ${additive ? 'vec4(vCol.rgb * a * vCol.a, 1.0)' : 'vec4(vCol.rgb, a * vCol.a)'};
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 9;
    this._p = new THREE.Vector3();
  }
  /** pos MUNDO (Vector3 double), vel m/s, col [r,g,b] (HDR), life s, size m */
  emit(pos, vel, col, life, size, drag = 0.5, grow = 0) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ pos: pos.clone(), vel: vel.clone(), col, life, size, drag, grow, t: 0 });
  }
  frame(dt, space) {
    this.p = this.p.filter((q) => (q.t += dt) < q.life);
    let n = 0;
    for (const q of this.p) {
      q.vel.multiplyScalar(Math.exp(-q.drag * dt));
      q.pos.addScaledVector(q.vel, dt);
      space.toRender(q.pos, this._p);
      this.pos[n * 3] = this._p.x;
      this.pos[n * 3 + 1] = this._p.y;
      this.pos[n * 3 + 2] = this._p.z;
      const k = q.t / q.life;
      const fade = this.additive ? (1 - k) * (1 - k) : Math.sin(Math.PI * Math.min(1, k * 1.2 + 0.05)) * (1 - k);
      this.col[n * 4] = q.col[0];
      this.col[n * 4 + 1] = q.col[1];
      this.col[n * 4 + 2] = q.col[2];
      this.col[n * 4 + 3] = fade;
      this.size[n] = q.size * (1 + q.grow * k);
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    g.attributes.position.needsUpdate = true;
    g.attributes.aCol.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    this.points.visible = n > 0;
  }
}

// ─────────────────────────────────────────────────────────── foguetes
export class Rockets {
  constructor(max = 16) {
    this.max = max;
    this.list = [];
    const body = new THREE.CylinderGeometry(0.12, 0.16, 1.6, 10);
    body.rotateX(Math.PI / 2);
    const nose = new THREE.ConeGeometry(0.12, 0.45, 10);
    nose.rotateX(-Math.PI / 2);
    nose.translate(0, 0, -1.02);
    const merged = mergeGeos([body, nose]);
    this.mesh = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ color: 0xd8d4c8, metalness: 0.6, roughness: 0.35 }), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    // chama do motor
    this.flare = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 4, 1.5), toneMapped: false }), max);
    this.flare.frustumCulled = false;
    this.flare.count = 0;
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.flare);
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }
  add(pos, vel, target) {
    if (this.list.length >= this.max) this.list.shift();
    const r = { pos: pos.clone(), vel: vel.clone(), target, t: 0, life: 6, smokeAcc: 0 };
    this.list.push(r);
    return r;
  }
  frame(space) {
    let n = 0;
    const Z = new THREE.Vector3(0, 0, -1);
    for (const r of this.list) {
      space.toRender(r.pos, this._p);
      const d = r.vel.clone().normalize();
      this._q.setFromUnitVectors(Z, d);
      this._m.compose(this._p, this._q, new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(n, this._m);
      const fp = this._p.clone().addScaledVector(d, 1.0);
      this._m.compose(fp, this._q, new THREE.Vector3(1, 1, 2.4));
      this.flare.setMatrixAt(n, this._m);
      n++;
    }
    this.mesh.count = this.flare.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.flare.instanceMatrix.needsUpdate = true;
    this.group.visible = n > 0;
  }
}

function mergeGeos(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const arr = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].array.length, 0));
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

// ──────────────────────────────────────────────────── clarão do escudo
export class ShieldFlashes {
  constructor(max = 8) {
    this.max = max;
    this.list = [];
    const geo = new THREE.IcosahedronGeometry(1, 3);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `${LOGV}
        varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec3 vCol; varying vec3 vHit;
        attribute vec3 aHit;
        void main(){
          vCol = instanceColor; vP = position; vHit = aHit;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * mat3(instanceMatrix) * position);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGF}
        varying vec3 vN; varying vec3 vV; varying vec3 vP; varying vec3 vCol; varying vec3 vHit;
        void main(){
          #include <logdepthbuf_fragment>
          float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          // padrão hexagonal aproximado (três famílias de faixas)
          vec3 p = vP * 9.0;
          float hx = max(max(abs(fract(p.x + p.y * 0.5) - 0.5), abs(fract(p.y) - 0.5)), abs(fract(p.z * 0.9 + p.x * 0.3) - 0.5));
          float cell = smoothstep(0.42, 0.5, hx);
          float near = exp(-pow(distance(normalize(vP), vHit), 2.0) * 6.0);
          float a = (pow(f, 2.5) * 0.6 + near * (0.4 + cell * 1.2));
          gl_FragColor = vec4(vCol * a * 2.5, 1.0);
        }`,
    });
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = geo.index;
    ig.setAttribute('position', geo.attributes.position);
    ig.setAttribute('normal', geo.attributes.normal);
    this.hit = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    ig.setAttribute('aHit', this.hit);
    this.mesh = new THREE.InstancedMesh(ig, this.mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.renderOrder = 10;
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
  }
  /** owner: objeto com worldPos e quaternion; hitDir: direção local (unitária) do impacto */
  add(owner, radius, hitDirLocal, color, life = 0.35, age = 0) {
    const ex = this.list.find((s) => s.owner === owner);
    if (ex) {
      ex.t = age;
      ex.hit.copy(hitDirLocal);
      return;
    }
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ owner, radius, hit: hitDirLocal.clone(), color, life, t: age });
  }
  frame(dt, space) {
    this.list = this.list.filter((s) => (s.t += dt) < s.life && s.owner.alive !== false);
    let n = 0;
    for (const s of this.list) {
      space.toRender(s.owner.worldPos, this._p);
      this._m.compose(this._p, s.owner.quaternion, new THREE.Vector3(s.radius, s.radius * 0.55, s.radius * 1.1));
      this.mesh.setMatrixAt(n, this._m);
      const k = 1 - s.t / s.life;
      this.mesh.instanceColor.setXYZ(n, s.color.r * k, s.color.g * k, s.color.b * k);
      this.hit.setXYZ(n, s.hit.x, s.hit.y, s.hit.z);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.hit.needsUpdate = true;
    this.mesh.visible = n > 0;
  }
}
