// Partículas avaliadas na GPU. Cada partícula é escrita UMA vez (na emissão)
// num anel de atributos instanciados; posição, tamanho, cor e rotação são
// calculados no vertex/fragment shader em função da idade (forma fechada:
// arrasto exponencial + gravidade). Nada é simulado por frame na CPU, nada é
// reenviado — só a faixa recém-escrita do anel sobe para a GPU. Isso roda
// igual no WebGPU e no WebGL2 (o caminho "instanciado" É o caminho GPU), e é
// mais barato que compute para efeitos balísticos (faíscas, fumaça, brasas).
//
// Origem flutuante: posições são offsets em float relativos a uma âncora
// (fx/Anchors.js) guardada em double na CPU.
//
// Camadas:
//   spark  aditiva, esticada pela velocidade, cor de corpo negro que esfria
//   smoke  mistura alfa: fogo (emissivo HDR) → fumaça iluminada pelo sol
//   glow   aditiva redonda: brasas, clarões, rastros de motor, plasma
import * as THREE from 'three/webgpu';
import {
  Fn, attribute, uniform, vec2, vec3, vec4, float, int, exp, max, min, mix, clamp, smoothstep, length, normalize, cross, dot,
  positionGeometry, cameraWorldMatrix, cos, sin, pow, abs, select, sqrt, Discard, If,
} from 'three/tsl';
import { blackbody, vnoise3 } from '../tslib.js';

const LAYOUT = [['iA', 4], ['iB', 4], ['iC', 4], ['iD', 4], ['iE', 4]];

export class ParticleLayer {
  constructor(sys, kind, capacity) {
    this.sys = sys; this.kind = kind; this.capacity = capacity;
    this.cursor = 0;
    this.pending = [];
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.getAttribute('position'));
    geo.setAttribute('uv', quad.getAttribute('uv'));
    this.arrays = {};
    for (const [name, n] of LAYOUT) {
      const arr = new Float32Array(capacity * n);
      if (name === 'iA') for (let i = 0; i < capacity; i++) arr[i * 4 + 3] = -1e9; // nascidas há muito: mortas
      if (name === 'iB') for (let i = 0; i < capacity; i++) arr[i * 4 + 3] = 1;
      const a = new THREE.InstancedBufferAttribute(arr, n);
      a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute(name, a);
      this.arrays[name] = a;
    }
    geo.instanceCount = capacity;
    this.geometry = geo;
    this.material = this.makeMaterial();
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = kind === 'smoke' ? 10 : 12;
    this.mesh.name = 'rps.particles.' + kind;
    this.dirtyLo = Infinity; this.dirtyHi = -1;
    this.lastEmit = -1e9;
  }

  makeMaterial() {
    const S = this.sys.u;
    const kind = this.kind;
    const A = attribute('iA', 'vec4'), B = attribute('iB', 'vec4'), C = attribute('iC', 'vec4'), D = attribute('iD', 'vec4'), E = attribute('iE', 'vec4');
    const anchors = this.sys.anchors.node;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mat.fog = false;
    if (kind === 'smoke') { mat.blending = THREE.NormalBlending; mat.premultipliedAlpha = true; }
    else mat.blending = THREE.AdditiveBlending;

    // idade/vida comuns
    const age = S.now.sub(A.w);
    const life = B.w.max(1e-3);
    const t = age.div(life);
    const alive = t.greaterThanEqual(0).and(t.lessThan(1));
    const drag = C.z;
    const sDrag = select(drag.greaterThan(1e-3), float(1).sub(exp(drag.negate().mul(age))).div(drag.max(1e-3)), age);
    const grav = S.gravity.mul(C.w);
    const center = anchors.element(int(D.w)).add(A.xyz).add(B.xyz.mul(sDrag)).add(grav.mul(age.mul(age).mul(0.5)));
    const velNow = B.xyz.mul(exp(drag.negate().mul(age))).add(grav.mul(age));
    const sizeCurve = kind === 'smoke' ? float(1).sub(pow(float(1).sub(t), 2.2)) : t;
    const size = mix(C.x, C.y, clamp(sizeCurve, 0, 1)).mul(select(alive, float(1), float(0)));
    const corner = positionGeometry.xy;
    const right = cameraWorldMatrix[0].xyz, up = cameraWorldMatrix[1].xyz;

    mat.positionNode = Fn(() => {
      const viewDir = normalize(center);
      if (kind === 'spark') {
        // esticada ao longo da velocidade projetada na tela
        const vPerp = velNow.sub(viewDir.mul(dot(velNow, viewDir)));
        const vl = length(vPerp);
        const axis = select(vl.greaterThan(1e-3), vPerp.div(vl.max(1e-3)), up);
        const side = normalize(cross(axis, viewDir));
        const len = size.add(vl.mul(E.z).mul(select(alive, float(1), float(0))));
        return center.add(axis.mul(corner.y.mul(len))).add(side.mul(corner.x.mul(size)));
      }
      const rot = E.y.add(E.z.mul(age));
      const c = vec2(corner.x.mul(cos(rot)).sub(corner.y.mul(sin(rot))), corner.x.mul(sin(rot)).add(corner.y.mul(cos(rot))));
      return center.add(right.mul(c.x.mul(size))).add(up.mul(c.y.mul(size)));
    })();

    const q = corner.mul(2); // -1..1
    const r2 = dot(q, q);
    if (kind === 'spark') {
      mat.colorNode = Fn(() => {
        const across = exp(q.x.mul(q.x).mul(-5.5));
        const along = smoothstep(1.0, 0.2, abs(q.y)).mul(q.y.mul(0.35).add(0.65));
        const temp = D.x.mul(pow(float(1).sub(t), 1.3));
        const col = blackbody(temp).mul(pow(temp, 1.5).mul(D.y).add(0.02));
        const fade = smoothstep(1.0, 0.75, t);
        return vec4(col.mul(across).mul(along).mul(fade), 1);
      })();
    } else if (kind === 'glow') {
      mat.colorNode = Fn(() => {
        const g = exp(r2.mul(-4.5)).sub(0.011).max(0);
        const fadeIn = smoothstep(0, 0.06, t);
        const fade = pow(float(1).sub(t), E.w.max(0.3)).mul(fadeIn);
        return vec4(vec3(D.x, D.y, D.z).mul(g).mul(fade), 1);
      })();
    } else {
      // fumaça/fogo: esfera falsa com ruído, iluminada pelo sol
      mat.colorNode = Fn(() => {
        If(r2.greaterThan(1), () => { Discard(); });
        const seed = E.x;
        const n = vnoise3(vec3(q.mul(1.6), seed.mul(17.0).add(age.mul(0.35)))).mul(0.65)
          .add(vnoise3(vec3(q.mul(3.7), seed.mul(5.0).sub(age.mul(0.6)))).mul(0.35));
        const edge = smoothstep(1.0, 0.25, r2.add(n.sub(0.5).mul(0.9)));
        const dens = edge.mul(n.mul(0.8).add(0.35)).toVar();
        // normal aproximada da "bola" de fumaça (espaço de render)
        const zN = sqrt(float(1).sub(r2.min(1)));
        const viewDir = normalize(center);
        const nrm = normalize(right.mul(q.x).add(up.mul(q.y)).sub(viewDir.mul(zN)));
        const lit = dot(nrm, S.sunDir).mul(0.5).add(0.5);
        const smokeCol = vec3(D.x, D.y, D.z).mul(S.sunColor.mul(S.sunIntensity).mul(lit.mul(0.32).mul(S.sunVis)).add(S.ambient));
        // fogo nos primeiros instantes (E.w = calor inicial)
        const heat = E.w.mul(pow(float(1).sub(smoothstep(0, 0.32, t)), 2)).mul(smoothstep(0.3, 0.85, n).mul(0.9).add(0.1));
        const fire = blackbody(heat.mul(0.85).min(1)).mul(heat.mul(heat).mul(7));
        const fade = smoothstep(0, 0.08, t).mul(float(1).sub(smoothstep(0.55, 1, t)));
        const a = dens.mul(fade).mul(this.sys.smokeOpacity).clamp(0, 1);
        const col = smokeCol.add(fire);
        return vec4(col.mul(a), a);
      })();
    }
    return mat;
  }

  /**
   * Emite n partículas. `fill(i, o)` preenche o objeto o:
   * {x,y,z, vx,vy,vz, life, s0, s1, drag, g, a,b,c (cor/temp), seed, rot, spin|stretch, w}
   */
  emit(n, anchor, fill) {
    const o = this._o || (this._o = {});
    const now = this.sys.now;
    const { iA, iB, iC, iD, iE } = this.arrays;
    const a = iA.array, b = iB.array, c = iC.array, d = iD.array, e = iE.array;
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      o.x = o.y = o.z = o.vx = o.vy = o.vz = 0; o.life = 1; o.s0 = 1; o.s1 = 1; o.drag = 0; o.g = 0;
      o.a = 1; o.b = 1; o.c = 1; o.seed = Math.random(); o.rot = Math.random() * 6.283; o.spin = 0; o.w = 1; o.delay = 0;
      fill(k, o);
      const j = i * 4;
      a[j] = o.x; a[j + 1] = o.y; a[j + 2] = o.z; a[j + 3] = now + o.delay;
      b[j] = o.vx; b[j + 1] = o.vy; b[j + 2] = o.vz; b[j + 3] = o.life;
      c[j] = o.s0; c[j + 1] = o.s1; c[j + 2] = o.drag; c[j + 3] = o.g;
      d[j] = o.a; d[j + 1] = o.b; d[j + 2] = o.c; d[j + 3] = anchor;
      e[j] = o.seed; e[j + 1] = o.rot; e[j + 2] = o.spin; e[j + 3] = o.w;
      if (i < this.dirtyLo) this.dirtyLo = i;
      if (i > this.dirtyHi) this.dirtyHi = i;
    }
    this.lastEmit = now;
  }

  flush() {
    if (this.dirtyHi < 0) return;
    const lo = this.dirtyLo, cnt = this.dirtyHi - this.dirtyLo + 1;
    for (const [name, n] of LAYOUT) {
      const attr = this.arrays[name];
      attr.clearUpdateRanges();
      attr.addUpdateRange(lo * n, cnt * n);
      attr.needsUpdate = true;
    }
    this.dirtyLo = Infinity; this.dirtyHi = -1;
  }
}

export class ParticleSystem {
  constructor(ctx, anchors, fx, sun) {
    this.ctx = ctx; this.anchors = anchors; this.sun = sun;
    this.now = 0;
    this.u = {
      now: uniform(0),
      gravity: uniform(new THREE.Vector3()),
      sunDir: sun.uniforms.dir,
      sunColor: sun.uniforms.color,
      sunIntensity: uniform(1),
      sunVis: sun.uniforms.visibility,
      ambient: uniform(new THREE.Color(0.05, 0.055, 0.07)),
    };
    this.smokeOpacity = uniform(1);
    this.group = new THREE.Group();
    this.group.name = 'rps.particles';
    this.layers = {
      smoke: new ParticleLayer(this, 'smoke', fx.smokeCap),
      spark: new ParticleLayer(this, 'spark', fx.sparkCap),
      glow: new ParticleLayer(this, 'glow', Math.max(512, Math.floor(fx.smokeCap * 0.75))),
    };
    for (const l of Object.values(this.layers)) this.group.add(l.mesh);
    ctx.scene.add(this.group);
    this.budgetScale = 1;
  }

  /** Quantidade ajustada ao orçamento do preset. */
  n(count) { return Math.max(1, Math.round(count * this.budgetScale)); }

  update(dt, ctx) {
    this.now += dt;
    this.u.now.value = this.now;
    this.u.sunIntensity.value = Math.min(6, this.sun.intensity) * 0.35;
    // gravidade local (só dentro da atmosfera de um corpo)
    const p = ctx.player;
    const body = p.bodyId ? ctx.universe.system?.body?.(p.bodyId) : null;
    const g = this.u.gravity.value;
    if (body && Number.isFinite(p.altitude) && p.altitude < (body.atmosphere?.height ?? body.radius * 0.05) * 1.2) {
      g.copy(p.camWorld).sub(body.pos).normalize().multiplyScalar(-(body.gravity || 9.8));
    } else g.set(0, 0, 0);
    for (const l of Object.values(this.layers)) l.flush();
  }
}
