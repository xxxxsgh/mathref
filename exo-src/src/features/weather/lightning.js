/**
 * RELÂMPAGOS — raio procedural (deslocamento de ponto médio + ramos), clarão
 * temporal com vários pulsos, luz direcional de clarão na cena e o ponto de
 * emissão que as nuvens usam para se iluminar por dentro.
 *
 * O raio é uma fita voltada para a câmera (expansão no vertex shader), com
 * núcleo branco-azulado e brilho largo, emissivo em HDR (o bloom do render
 * pega). Vértices relativos a uma âncora flutuante (origem de render), como
 * manda o contrato para malhas grandes.
 */
import * as THREE from 'three';

const VERT = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute vec3 aOther;
attribute vec3 aInfo;     // x = lado (−1/1), y = largura (m), z = brilho
varying float vSide;
varying float vB;
void main() {
  vec4 a = modelViewMatrix * vec4(position, 1.0);
  vec4 b = modelViewMatrix * vec4(aOther, 1.0);
  vec3 d = b.xyz - a.xyz;
  vec3 side = normalize(cross(d + vec3(1e-4, 0.0, 0.0), a.xyz));
  // largura mínima em pixels: o raio continua visível de longe
  float w = max(aInfo.y, -a.z * 0.0016);
  a.xyz += side * aInfo.x * w;
  vSide = aInfo.x;
  vB = aInfo.z;
  gl_Position = projectionMatrix * a;
  #include <logdepthbuf_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor;
uniform float uFlash;
varying float vSide;
varying float vB;
void main() {
  #include <logdepthbuf_fragment>
  float core = 1.0 - smoothstep(0.0, 1.0, abs(vSide));
  float a = core * core * vB * uFlash;
  if (a < 0.001) discard;
  gl_FragColor = vec4(uColor * a, 0.0);
}`;

/** Gera o caminho de um raio (lista de segmentos [p0, p1, largura, brilho]). */
function boltPath(start, end, rnd, depth, width, bright, out, branches) {
  let pts = [start.clone(), end.clone()];
  const len = start.distanceTo(end);
  let amp = len * 0.16;
  const axis = end.clone().sub(start).normalize();
  const tmp = new THREE.Vector3();
  for (let d = 0; d < depth; d++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const m = a.clone().add(b).multiplyScalar(0.5);
      tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
      tmp.addScaledVector(axis, -tmp.dot(axis)).multiplyScalar(2 * amp);
      m.add(tmp);
      next.push(m, b);
    }
    pts = next;
    amp *= 0.55;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const f = i / (pts.length - 1);
    out.push([pts[i], pts[i + 1], width * (1 - 0.5 * f), bright]);
    if (branches > 0 && rnd() < 0.045 && f < 0.85) {
      const dir = pts[i + 1].clone().sub(pts[i]).normalize();
      tmp.set(rnd() - 0.5, rnd() - 0.6, rnd() - 0.5).normalize();
      dir.add(tmp.multiplyScalar(1.2)).normalize();
      const blen = len * (0.08 + 0.2 * rnd());
      const bend = pts[i].clone().addScaledVector(dir, blen);
      boltPath(pts[i], bend, rnd, Math.max(3, depth - 2), width * 0.45, bright * 0.55, out, branches - 1);
    }
  }
}

export class Lightning {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'weather:lightning';
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uColor: { value: new THREE.Color(0.8, 0.86, 1.0).multiplyScalar(90) }, uFlash: { value: 0 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.group.add(this.mesh);
    this.anchor = null;
    // luz de clarão (sempre presente com 0 para não recompilar materiais)
    this.light = new THREE.DirectionalLight(0xc8d6ff, 0);
    this.light.name = 'weather:flash';
    ctx.scene.add(this.light, this.light.target);
    this.strike = null;
    this.flash = 0;
    this.worldPos = new THREE.Vector3();
    this.color = [0.78, 0.84, 1.0];
  }

  /**
   * Novo raio entre a base das nuvens e o solo. ground/top: WorldPos (double).
   * `hold` = clarão fixo (modo shot).
   */
  strikeAt(ground, top, seed, hold = null) {
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const anchorPos = new THREE.Vector3(ground.x, ground.y, ground.z);
    const start = new THREE.Vector3(top.x - ground.x, top.y - ground.y, top.z - ground.z);
    const end = new THREE.Vector3(0, 0, 0);
    const segs = [];
    boltPath(start, end, rnd, 8, 9, 1, segs, 3);
    const n = segs.length;
    const pos = new Float32Array(n * 4 * 3);
    const oth = new Float32Array(n * 4 * 3);
    const info = new Float32Array(n * 4 * 3);
    const idx = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
      const [a, b, w, br] = segs[i];
      // o "outro" ponto sempre adiante no sentido a→b: o lado não inverte
      const ahead = b.clone().multiplyScalar(2).sub(a);
      const v = [
        [a, b, -1],
        [a, b, 1],
        [b, ahead, 1],
        [b, ahead, -1],
      ];
      for (let k = 0; k < 4; k++) {
        const [p, o, side] = v[k];
        const j = (i * 4 + k) * 3;
        pos[j] = p.x;
        pos[j + 1] = p.y;
        pos[j + 2] = p.z;
        oth[j] = o.x;
        oth[j + 1] = o.y;
        oth[j + 2] = o.z;
        info[j] = side;
        info[j + 1] = w;
        info[j + 2] = br;
      }
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aOther', new THREE.BufferAttribute(oth, 3));
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    if (this.anchor) this.anchor.remove();
    this.anchor = this.ctx.space.registerFloating(this.group, anchorPos);
    // ponto de emissão nas nuvens: perto do topo do raio
    this.worldPos.set(ground.x + start.x * 0.85, ground.y + start.y * 0.85, ground.z + start.z * 0.85);
    this.strike = { t: 0, pulses: [0, 0.07 + rnd() * 0.05, 0.19 + rnd() * 0.08, 0.32 + rnd() * 0.1], hold, ground: anchorPos };
  }

  update(dt, ctx) {
    const st = this.strike;
    if (!st) {
      this.flash = 0;
      this.mesh.visible = false;
      this.light.intensity = 0;
      return;
    }
    let f;
    if (st.hold != null) f = st.hold;
    else {
      st.t += dt;
      f = 0;
      for (const p of st.pulses) {
        const x = st.t - p;
        if (x >= 0) f = Math.max(f, Math.exp(-x / 0.045) * (p === 0 ? 1 : 0.75));
      }
      if (st.t > 0.9) {
        this.strike = null;
        f = 0;
      }
    }
    this.flash = f;
    this.mat.uniforms.uFlash.value = f;
    this.mesh.visible = f > 0.02;
    // luz de clarão: do raio para a câmera
    const o = ctx.space.origin;
    const d = Math.hypot(st.ground.x - o.x, st.ground.y - o.y, st.ground.z - o.z);
    const prox = 1 / (1 + (d / 5000) ** 2);
    this.light.intensity = f * 9 * prox;
    this.light.position.set(this.worldPos.x - o.x, this.worldPos.y - o.y, this.worldPos.z - o.z).normalize().multiplyScalar(100);
    this.light.target.position.set(0, 0, 0);
    this.light.target.updateMatrixWorld();
  }

  dispose() {
    this.anchor?.remove();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.ctx.scene.remove(this.light, this.light.target);
  }
}
