/**
 * EFEITOS da nave (todos procedurais, em shader):
 *   EnginePlumes   chamas dos propulsores (cone aditivo volumétrico com
 *                  diamantes de choque, cintilação e núcleo branco) + halo
 *   ReentryPlasma  onda de choque de plasma (paraboloide aditivo orientado
 *                  pelo vento relativo), cauda incandescente e faíscas
 *   SpeedStreaks   estrias do pulso / poeira espacial em volta da câmera
 *                  (quads esticados ao longo da velocidade, 1 chamada)
 *   GroundDust     nuvem de poeira no pouso/decolagem (sprites)
 *
 * Todo ShaderMaterial inclui os chunks de logdepth (CONTRACT §4).
 */
import * as THREE from 'three';
import { makeGlowTexture, makePuffTexture } from './textures.js';
import { mulberry32 } from './util.js';

const LOGDEPTH_V = /* glsl */ `#include <common>
#include <logdepthbuf_pars_vertex>`;
const LOGDEPTH_F = /* glsl */ `#include <common>
#include <logdepthbuf_pars_fragment>`;

const NOISE = /* glsl */ `
float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
float fbm2(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * vn(p); p *= 2.07; a *= 0.5; } return s; }
`;

// ─────────────────────────────────────────────────────────────── chamas
export class EnginePlumes {
  constructor(engines, glow) {
    const geos = [];
    for (const e of engines) {
      // cone ao longo de +Z (para trás), base no bocal
      const g = new THREE.CylinderGeometry(1, 0.18, 1, 20, 12, true);
      g.translate(0, -0.5, 0);
      g.rotateX(-Math.PI / 2); // eixo Y → +Z ... (topo no bocal, ponta para trás)
      const n = g.attributes.position.count;
      const t = new Float32Array(n);
      const base = new Float32Array(n * 3);
      const rad = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        t[i] = g.attributes.position.getZ(i); // 0..1
        base[i * 3] = e.pos.x;
        base[i * 3 + 1] = e.pos.y;
        base[i * 3 + 2] = e.pos.z;
        rad[i] = e.r;
      }
      g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
      g.setAttribute('aBase', new THREE.BufferAttribute(base, 3));
      g.setAttribute('aRad', new THREE.BufferAttribute(rad, 1));
      geos.push(g);
    }
    const geo = mergeSimple(geos, ['position', 'normal', 'aT', 'aBase', 'aRad']);
    this.uniforms = {
      uTime: { value: 0 },
      uThrottle: { value: 0.5 },
      uLength: { value: 6 },
      uColor: { value: new THREE.Color(...glow) },
      uAir: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `${LOGDEPTH_V}
        attribute float aT; attribute vec3 aBase; attribute float aRad;
        uniform float uLength; uniform float uThrottle;
        varying float vT; varying vec3 vN; varying vec3 vV; varying vec2 vRing;
        void main(){
          vT = aT;
          // raio: abre um pouco logo após o bocal e afina na ponta
          float flare = 1.0 + 0.35 * sin(min(aT * 3.0, 3.14159));
          vec3 p = position;
          p.xy *= aRad * flare * mix(1.0, 0.85, uThrottle);
          p.z = aT * uLength * (0.35 + 0.65 * uThrottle);
          p += aBase;
          vRing = position.xy;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vN = normalize(normalMatrix * vec3(position.xy, 0.0));
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGDEPTH_F}
        ${NOISE}
        uniform float uTime; uniform float uThrottle; uniform vec3 uColor; uniform float uAir;
        varying float vT; varying vec3 vN; varying vec3 vV; varying vec2 vRing;
        void main(){
          #include <logdepthbuf_fragment>
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float core = pow(facing, 1.6);
          float along = pow(1.0 - vT, 1.7);
          // diamantes de choque (só em empuxo alto, mais visíveis no ar)
          float diamonds = 0.75 + 0.25 * sin(vT * 38.0 - uTime * 4.0) * uThrottle;
          float ang = atan(vRing.y, vRing.x);
          float flick = 0.75 + 0.5 * fbm2(vec2(ang * 1.5, vT * 6.0 - uTime * 18.0));
          float I = core * along * diamonds * flick * (0.35 + 1.4 * uThrottle);
          vec3 hot = mix(uColor, vec3(1.0), smoothstep(0.55, 0.95, core) * (1.0 - vT));
          // no ar a chama esquenta para laranja na ponta
          hot = mix(hot, vec3(1.0, 0.45, 0.15), vT * 0.5 * uAir);
          gl_FragColor = vec4(hot * I * 5.0, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'ship:plumes';
    // halos dos bocais (pontos com textura radial)
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(engines.flatMap((e) => [e.pos.x, e.pos.y, e.pos.z + 0.2]), 3));
    this.haloMat = new THREE.PointsMaterial({ map: makeGlowTexture(64, 2.4), size: 4, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(...glow).multiplyScalar(2) });
    this.halo = new THREE.Points(pg, this.haloMat);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 6;
    this.mesh.add(this.halo);
    this.glow = new THREE.Color(...glow);
  }
  update(time, throttle, air) {
    this.uniforms.uTime.value = time;
    this.uniforms.uThrottle.value = throttle;
    this.uniforms.uAir.value = air;
    this.uniforms.uLength.value = 7.5;
    this.haloMat.size = 2.5 + throttle * 4.5;
    this.haloMat.color.copy(this.glow).multiplyScalar(0.6 + throttle * 2.2);
  }
}

// ─────────────────────────────────────────────────────────────── plasma
export class ReentryPlasma {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'ship:plasma';
    this.uniforms = { uTime: { value: 0 }, uHeat: { value: 0 } };
    // onda de choque: paraboloide aberto para trás (−Z frente)
    const prof = [];
    for (let i = 0; i <= 28; i++) {
      const s = i / 28;
      const z = -11.5 + s * 34; // nariz −11.5 → cauda +22.5
      const r = 0.15 + 6.2 * Math.sqrt(s) * (1 - 0.25 * s);
      prof.push(new THREE.Vector2(r, z));
    }
    const lathe = new THREE.LatheGeometry(prof, 40);
    lathe.rotateX(Math.PI / 2); // eixo Y do lathe → Z (y=+z… conferido: y→z)
    // LatheGeometry ao longo de +Y; rotateX(+90°) leva y → z
    this.shock = new THREE.Mesh(lathe, this.makeMat(0));
    this.shock.frustumCulled = false;
    this.shock.renderOrder = 7;
    // cauda: cone longo e estreito
    const tprof = [];
    for (let i = 0; i <= 20; i++) {
      const s = i / 20;
      tprof.push(new THREE.Vector2(0.4 + 4.2 * Math.sqrt(s) * (1 - s * 0.6), -6 + s * 70));
    }
    const tail = new THREE.LatheGeometry(tprof, 28);
    tail.rotateX(Math.PI / 2);
    this.tail = new THREE.Mesh(tail, this.makeMat(1));
    this.tail.frustumCulled = false;
    this.tail.renderOrder = 7;
    this.group.add(this.shock, this.tail);
    // faíscas
    const N = 260;
    const rand = mulberry32(99);
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      seed[i * 4] = rand();
      seed[i * 4 + 1] = rand() * Math.PI * 2;
      seed[i * 4 + 2] = rand();
      seed[i * 4 + 3] = rand();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, tGlow: { value: makeGlowTexture(32, 1.5) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `${LOGDEPTH_V}
        attribute vec4 aSeed; uniform float uTime; uniform float uHeat; varying float vA;
        void main(){
          float life = fract(aSeed.x + uTime * (0.6 + aSeed.z));
          float r = 2.5 + 5.0 * sqrt(life) * (0.4 + aSeed.w);
          vec3 p = vec3(cos(aSeed.y) * r, sin(aSeed.y) * r * 0.7, -6.0 + life * 48.0);
          vA = (1.0 - life) * uHeat;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp((0.12 + aSeed.w * 0.25) * 900.0 / -mv.z, 1.0, 10.0) * step(0.01, uHeat);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGDEPTH_F}
        uniform sampler2D tGlow; varying float vA;
        void main(){
          #include <logdepthbuf_fragment>
          float a = texture2D(tGlow, gl_PointCoord).a;
          gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * a * vA * 3.0, 1.0);
        }`,
    });
    this.sparks = new THREE.Points(sg, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 8;
    this.group.add(this.sparks);
    this.group.visible = false;
  }
  makeMat(kind) {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.uniforms, uKind: { value: kind } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `${LOGDEPTH_V}
        varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){
          vP = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGDEPTH_F}
        ${NOISE}
        uniform float uTime; uniform float uHeat; uniform float uKind;
        varying vec3 vP; varying vec3 vN; varying vec3 vV;
        void main(){
          #include <logdepthbuf_fragment>
          float f = abs(dot(normalize(vN), normalize(vV)));
          float ang = atan(vP.y, vP.x);
          float s, rim, I;
          vec3 col;
          if (uKind < 0.5) {
            s = clamp((vP.z + 11.5) / 34.0, 0.0, 1.0);
            rim = pow(1.0 - f, 2.6) * 0.9 + pow(f, 4.0) * 0.03;
            float streak = fbm2(vec2(ang * 3.0, vP.z * 0.18 - uTime * 9.0));
            float streak2 = fbm2(vec2(ang * 9.0, vP.z * 0.07 - uTime * 5.0));
            float st = smoothstep(0.35, 0.75, streak * streak2 * 2.2);
            I = rim * (0.15 + 1.3 * st) * pow(1.0 - s, 1.6);
            // capa do nariz mais intensa
            I += pow(1.0 - s, 14.0) * 0.6;
            I *= smoothstep(0.0, 0.03, s) * 0.55;
            col = mix(vec3(1.0, 0.92, 0.75), vec3(1.0, 0.42, 0.12), smoothstep(0.02, 0.3, s));
            col = mix(col, vec3(0.9, 0.18, 0.35), smoothstep(0.4, 0.9, s));
          } else {
            s = clamp((vP.z + 6.0) / 70.0, 0.0, 1.0);
            float streak = fbm2(vec2(ang * 4.0, vP.z * 0.08 - uTime * 7.0));
            I = pow(f, 2.0) * pow(1.0 - s, 2.4) * smoothstep(0.3, 0.8, streak) * 0.45;
            col = mix(vec3(1.0, 0.5, 0.18), vec3(0.75, 0.15, 0.4), s);
          }
          gl_FragColor = vec4(col * I * uHeat * 4.0, 1.0);
        }`,
    });
  }
  update(time, heat) {
    this.uniforms.uTime.value = time;
    this.uniforms.uHeat.value = heat;
    this.group.visible = heat > 0.01;
  }
}

// ──────────────────────────────────────────────────────── estrias / poeira
export class SpeedStreaks {
  constructor(count = 420, box = 360) {
    const rand = mulberry32(5);
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.attributes.position);
    const off = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      off[i * 4] = rand();
      off[i * 4 + 1] = rand();
      off[i * 4 + 2] = rand();
      off[i * 4 + 3] = rand();
    }
    geo.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    geo.instanceCount = count;
    this.uniforms = {
      uShift: { value: new THREE.Vector3() },
      uDir: { value: new THREE.Vector3(0, 0, -1) },
      uStretch: { value: 1 },
      uBox: { value: box },
      uAlpha: { value: 0 },
      uColor: { value: new THREE.Color(0.7, 0.85, 1.0) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `${LOGDEPTH_V}
        attribute vec4 aOff;
        uniform vec3 uShift; uniform vec3 uDir; uniform float uStretch; uniform float uBox;
        varying float vA; varying float vY;
        void main(){
          // posição envolta numa caixa em volta da câmera (render: câmera na origem)
          vec3 p = (fract(aOff.xyz - uShift / uBox) - 0.5) * uBox;
          float d = length(p);
          vec3 side = normalize(cross(uDir, normalize(p + 1e-3)));
          float w = 0.04 + 0.05 * aOff.w;
          vec3 wp = p + uDir * position.y * uStretch * (0.5 + aOff.w) + side * position.x * w * max(1.0, d * 0.01);
          vA = smoothstep(uBox * 0.5, uBox * 0.15, d) * smoothstep(2.0, 12.0, d);
          vY = position.y;
          vec4 mv = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGDEPTH_F}
        uniform float uAlpha; uniform vec3 uColor; varying float vA; varying float vY;
        void main(){
          #include <logdepthbuf_fragment>
          float a = vA * uAlpha * (1.0 - vY) * smoothstep(0.0, 0.08, vY);
          gl_FragColor = vec4(uColor * a * 3.0, 1.0);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.name = 'ship:streaks';
    this.mesh.visible = false;
    this.shift = new THREE.Vector3();
  }
  /** move = deslocamento da câmera neste frame (m), dir = direção do movimento, k = 0..1 intensidade, stretch m */
  update(move, dir, k, stretch) {
    this.shift.add(move);
    // evita perda de precisão: mantém o deslocamento acumulado modulado pela caixa
    const B = this.uniforms.uBox.value;
    this.shift.set(this.shift.x % B, this.shift.y % B, this.shift.z % B);
    this.uniforms.uShift.value.copy(this.shift);
    this.uniforms.uDir.value.copy(dir).negate();
    this.uniforms.uStretch.value = stretch;
    this.uniforms.uAlpha.value = k;
    this.mesh.visible = k > 0.01;
  }
}

// ─────────────────────────────────────────────────────────────── poeira
export class GroundDust {
  constructor(count = 140) {
    this.N = count;
    const rand = mulberry32(17);
    this.seed = new Float32Array(count * 4);
    for (let i = 0; i < count * 4; i++) this.seed[i] = rand();
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.alpha = new Float32Array(count);
    this.size = new Float32Array(count);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.uniforms = { tPuff: { value: makePuffTexture(128, 4) }, uColor: { value: new THREE.Color(0.55, 0.48, 0.4) }, uLight: { value: 1 } };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `${LOGDEPTH_V}
        attribute float aAlpha; attribute float aSize; varying float vA;
        void main(){
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(aSize * 700.0 / -mv.z, 1.0, 400.0);
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `${LOGDEPTH_F}
        uniform sampler2D tPuff; uniform vec3 uColor; uniform float uLight; varying float vA;
        void main(){
          #include <logdepthbuf_fragment>
          vec4 t = texture2D(tPuff, gl_PointCoord);
          gl_FragColor = vec4(uColor * uLight * (0.8 + 0.25 * t.r), t.a * vA * 0.75);
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.name = 'ship:dust';
    this.points.visible = false;
    this.t = 0;
  }
  /**
   * Atualiza no referencial do grupo (origem = ponto do solo sob a nave, +Y = up local).
   * k = intensidade 0..1 (empuxo × proximidade do solo)
   */
  update(dt, k) {
    this.t += dt;
    const N = this.N;
    let any = false;
    for (let i = 0; i < N; i++) {
      const s0 = this.seed[i * 4];
      const s1 = this.seed[i * 4 + 1];
      const s2 = this.seed[i * 4 + 2];
      const s3 = this.seed[i * 4 + 3];
      const life = (this.t * (0.35 + s2 * 0.3) + s0) % 1;
      const ang = s1 * Math.PI * 2 + life * 0.6;
      const r = 2 + life * (14 + s3 * 12);
      this.pos[i * 3] = Math.cos(ang) * r;
      this.pos[i * 3 + 1] = 0.3 + life * (1.5 + s3 * 3.5);
      this.pos[i * 3 + 2] = Math.sin(ang) * r;
      this.alpha[i] = k * Math.sin(Math.PI * Math.min(1, life * 1.3)) * (0.5 + 0.5 * s2);
      this.size[i] = 2.5 + life * 7 + s3 * 3;
      if (this.alpha[i] > 0.01) any = true;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.aAlpha.needsUpdate = true;
    g.attributes.aSize.needsUpdate = true;
    this.points.visible = any;
  }
}

/** Fusão simples de geometrias não indexadas com atributos listados. */
export function mergeSimple(list, names) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(total * size);
    let o = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, o);
      o += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
