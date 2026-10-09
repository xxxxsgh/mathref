/**
 * OCEANO (nível do mar do planeta). Uma única malha: CALOTA centrada no
 * ponto sob a câmera, anéis em progressão geométrica até o horizonte —
 * 1 draw call cobre do pé do jogador à órbita. Vértices em double relativos
 * à âncora (R·(dir − u)), âncora flutuante.
 *
 * Profundidade do terreno sob cada vértice vem do worker (assíncrona) →
 * cor rasa/funda, transparência e espuma na costa. Ondas: normais das
 * texturas de detalhe (ondulações) rolando em duas escalas + reflexo do céu
 * por Fresnel (cor da neblina/céu do serviço sky) + especular do sol (PBR).
 */
import * as THREE from 'three';
import { TEX_PERIOD } from './material.js';

const RINGS = 72;
const SEGS = 120;

const FRAG_PARS = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray tNrm;
uniform sampler2D tMacro;
uniform vec3 uCamMod;
uniform vec3 uCenter;
uniform float uTime;
uniform vec3 uShallow, uDeep, uSkyCol, uEmis;
varying float vDepth;
varying vec3 vWP;
`;

export class Ocean {
  constructor(ctx, host) {
    this.ctx = ctx;
    this.host = host; // { cfg, pool, U, root, center }
    const nv = 1 + RINGS * SEGS;
    this.pos = new Float32Array(nv * 3);
    this.nor = new Float32Array(nv * 3);
    this.depth = new Float32Array(nv).fill(50);
    this.dirs = new Float32Array(nv * 3);
    const idx = [];
    for (let j = 0; j < SEGS; j++) idx.push(0, 1 + j, 1 + ((j + 1) % SEGS));
    for (let i = 0; i < RINGS - 1; i++) {
      for (let j = 0; j < SEGS; j++) {
        const a = 1 + i * SEGS + j, b = 1 + i * SEGS + ((j + 1) % SEGS);
        idx.push(a, a + SEGS, b, b, a + SEGS, b + SEGS);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    g.setAttribute('wdepth', new THREE.BufferAttribute(this.depth, 1));
    g.setIndex(idx);
    this.geo = g;
    const P = host.cfg.palette;
    this.uniforms = {
      tNrm: host.U.tNrm,
      tMacro: host.U.tMacro,
      uCamMod: host.U.uCamMod,
      uCenter: host.U.uCenter,
      uTime: { value: 0 },
      uShallow: { value: new THREE.Color(...P.water) },
      uDeep: { value: new THREE.Color(...P.deep) },
      uSkyCol: { value: new THREE.Color(...P.sky) },
      uEmis: { value: new THREE.Color(...(P.emissiveWater || [0, 0, 0])) },
    };
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0, transparent: true, depthWrite: true });
    mat.name = 'planet:ocean';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float wdepth;\nvarying float vDepth;\nvarying vec3 vWP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDepth = wdepth;\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
        .replace(
          '#include <color_fragment>',
          /* glsl */ `
          float wDist = length(vWP);
          vec3 wP = vWP + uCamMod;
          float wFade = 1.0 - smoothstep(300.0, 6000.0, wDist);
          float wd = max(vDepth, 0.0);
          float shallowK = 1.0 - exp(-wd * 0.18);
          diffuseColor.rgb = mix(uShallow * 1.15, uDeep, smoothstep(0.0, 1.0, 1.0 - exp(-wd * 0.04)));
          float foamN = texture(tMacro, wP.xz * 0.06 + uTime * 0.01).w;
          float foam = (1.0 - smoothstep(0.0, 0.9 + foamN * 0.8, wd)) * wFade;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8), foam * 0.85);
          `,
        )
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `
          {
            vec2 uvA = wP.xz * 0.05 + vec2(uTime * 0.013, uTime * 0.007);
            vec2 uvB = wP.zx * 0.017 - vec2(uTime * 0.006, -uTime * 0.009);
            vec2 nA = texture(tNrm, vec3(uvA, 2.0)).xy * 2.0 - 1.0;
            vec2 nB = texture(tNrm, vec3(uvB, 2.0)).xy * 2.0 - 1.0;
            vec2 nn = (nA * 0.6 + nB * 0.8) * (0.25 + 0.75 * wFade);
            vec3 up = normalize(vWP - uCenter);
            vec3 t1 = normalize(cross(up, vec3(0.0, 1.0, 0.0001)));
            vec3 t2 = cross(up, t1);
            vec3 nw = normalize(up + t1 * nn.x * 0.35 + t2 * nn.y * 0.35);
            normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
          }
          `,
        )
        .replace(
          '#include <opaque_fragment>',
          /* glsl */ `
          {
            vec3 V = normalize(-vWP);
            vec3 up = normalize(vWP - uCenter);
            float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0) * 0.95 + 0.03;
            outgoingLight = mix(outgoingLight, uSkyCol * 0.8, fr * 0.85 * (1.0 - foam));
            outgoingLight += uEmis;
            float a = mix(0.62 * shallowK + 0.3, 0.97, fr);
            a = max(a, foam);
            diffuseColor.a = clamp(a, 0.0, 1.0);
          }
          #include <opaque_fragment>
          `,
        );
    };
    mat.customProgramCacheKey = () => 'exo-planet-ocean-1';
    this.mat = mat;
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = 'planet:ocean';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.receiveShadow = true;
    host.root.add(this.mesh);
    this.anchor = new ctx.WorldPos();
    this.handle = ctx.space.registerFloating(this.mesh, this.anchor);
    this.anchorDir = new THREE.Vector3(2, 0, 0);
    this.anchorAlt = -1;
    this.job = null;
    this.depthReady = false;
  }

  get busy() {
    return !this.depthReady;
  }

  rebuild(u, alt) {
    const ctx = this.ctx;
    const R = this.host.cfg.radius + (this.host.cfg.seaLevel ?? 0);
    const a = Math.max(2, alt);
    const th1 = Math.max(0.4, a * 0.012) / R;
    const thMax = Math.min(Math.PI * 0.95, Math.acos(R / (R + a)) + Math.max(0.05, 6000 / R));
    const q = Math.pow(thMax / th1, 1 / (RINGS - 1));
    const fr = ctx.Geo.tangentFrame(u);
    const e = fr.east, n = fr.north;
    const c = this.host.center;
    this.anchor.set(c.x + u.x * R, c.y + u.y * R, c.z + u.z * R);
    const pos = this.pos, nor = this.nor, dirs = this.dirs;
    pos[0] = pos[1] = pos[2] = 0;
    nor[0] = u.x; nor[1] = u.y; nor[2] = u.z;
    dirs[0] = u.x; dirs[1] = u.y; dirs[2] = u.z;
    let th = th1;
    for (let i = 0; i < RINGS; i++) {
      const st = Math.sin(th), ct = Math.cos(th);
      for (let j = 0; j < SEGS; j++) {
        const ph = ((j + (i & 1) * 0.5) / SEGS) * Math.PI * 2;
        const cp = Math.cos(ph) * st, sp = Math.sin(ph) * st;
        const dx = ct * u.x + cp * e.x + sp * n.x;
        const dy = ct * u.y + cp * e.y + sp * n.y;
        const dz = ct * u.z + cp * e.z + sp * n.z;
        const o = (1 + i * SEGS + j) * 3;
        pos[o] = R * (dx - u.x);
        pos[o + 1] = R * (dy - u.y);
        pos[o + 2] = R * (dz - u.z);
        nor[o] = dx; nor[o + 1] = dy; nor[o + 2] = dz;
        dirs[o] = dx; dirs[o + 1] = dy; dirs[o + 2] = dz;
      }
      th *= q;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.anchorDir.copy(u);
    this.anchorAlt = a;
    // profundidade no worker
    this.job?.cancel?.();
    this.depthReady = false;
    const job = this.host.pool.run('water', { cfg: this.host.cfg, dirs: dirs.slice() }, { priority: 0, key: 'water' });
    this.job = job;
    job.then(
      (r) => {
        if (this.job !== job) return;
        this.depth.set(r.depth);
        this.geo.attributes.wdepth.needsUpdate = true;
        this.depthReady = true;
        this.job = null;
      },
      () => {},
    );
  }

  frame() {
    const ctx = this.ctx;
    const c = this.host.center;
    const o = ctx.space.origin;
    const u = this._u || (this._u = new THREE.Vector3());
    u.set(o.x - c.x, o.y - c.y, o.z - c.z);
    const r = u.length();
    u.multiplyScalar(1 / r);
    const R = this.host.cfg.radius + (this.host.cfg.seaLevel ?? 0);
    const alt = Math.max(2, Math.abs(r - R));
    const moved = this.anchorDir.x > 1 ? Infinity : this.anchorDir.angleTo(u) * R;
    if (moved > Math.max(20, alt * 0.35) || alt > this.anchorAlt * 1.35 || alt < this.anchorAlt / 1.35) this.rebuild(u, alt);
    this.uniforms.uTime.value = ctx.time.world;
    const sky = ctx.services.sky;
    const fog = sky?.fogAt?.(o)?.color || ctx.scene.fog?.color;
    if (fog) this.uniforms.uSkyCol.value.copy(fog).lerp(new THREE.Color(...this.host.cfg.palette.sky), 0.25).multiplyScalar(1.1);
  }

  dispose() {
    this.job?.cancel?.();
    this.handle.remove();
    this.host.root.remove(this.mesh);
    this.geo.dispose();
    this.mat.dispose();
  }
}
