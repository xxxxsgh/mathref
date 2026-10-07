// Fundo do espaço profundo, desenhado todo frame atrás de tudo:
//   cubemap HDR assado (Via Láctea + nebulosa)  ×  detalhe fino por pixel
// + campo estelar procedural nítido no pixel (4 camadas, densidade pela faixa)
// + estrelas VIZINHAS reais da galáxia (sprites com espículas de difração)
// + efeitos que distorcem o céu inteiro:
//     · aberração relativística + Doppler (viagem quântica / salto)
//     · lente gravitacional fraca de um buraco negro (a forte fica em blackhole.js)
//
// `skySampler` é exportado para o buraco negro amostrar o MESMO céu na
// direção do raio curvado (as estrelas atrás dele aparecem distorcidas).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, min, abs, dot, sqrt,
  positionLocal, positionGeometry, cubeTexture, cross, acos, sin, cos, If, select, attribute, uv, instanceIndex, screenUV,
} from 'three/tsl';
import { n3, starField } from './tsl.js';

export const SKY_RADIUS = 1.2e9;

/**
 * Cria a função de amostragem do céu (cubo + estrelas) para uma direção.
 * U: uniforms compartilhados (exposure, starGain, pa, detail).
 */
export function makeSkySampler(cubeTex, U) {
  const cube = cubeTexture(cubeTex);
  return (d, pa) => {
    const c = cubeTexture(cube, d).toVar();
    // detalhe fino (filamentos) acima da resolução do cubo
    const det = n3(d.mul(9.0)).g.mul(0.7).add(n3(d.mul(23.0).add(3.3)).a.mul(0.3)).add(0.5);
    const neb = c.rgb.mul(mix(float(1), det, U.detail));
    const dens = c.a.mul(U.starDensity);
    const st = starField(d, pa, dens).mul(U.starGain);
    return neb.add(st);
  };
}

export class SkyDome {
  constructor(ctx, bake) {
    this.ctx = ctx;
    const mobile = ctx.quality.name === 'mobile';
    const U = this.u = {
      exposure: uniform(1),
      starGain: uniform(1),
      starDensity: uniform(2.2),
      detail: uniform(mobile ? 0.6 : 1),
      pa: uniform(0.001),
      // aberração (quântico/salto)
      beta: uniform(0),
      velDir: uniform(new THREE.Vector3(0, 0, -1)),
      hyper: uniform(0),   // 0..1 escurece o céu (dentro do túnel de salto)
      // lente fraca do buraco negro
      bhOn: uniform(0),
      bhDir: uniform(new THREE.Vector3(0, 0, -1)),
      bhDist: uniform(1e3), // distância em unidades de rs
    };
    this.sample = makeSkySampler(bake.texture, U);

    const eq = ctx.params.get('skyeq') === '1'; // depuração: céu inteiro em equiretangular na tela
    const node = Fn(() => {
      const d = normalize(positionLocal).toVar();
      if (eq) {
        const ph = screenUV.x.sub(0.5).mul(Math.PI * 2), th = float(0.5).sub(screenUV.y).mul(Math.PI);
        d.assign(vec3(cos(th).mul(cos(ph)), sin(th), cos(th).mul(sin(ph))));
      }
      // ── lente fraca: o raio observado veio de uma direção mais próxima do buraco ──
      If(U.bhOn.greaterThan(0.5), () => {
        const c = U.bhDir;
        const cs = dot(d, c);
        const perp = d.sub(c.mul(cs));
        const sn = length(perp);
        const b = max(U.bhDist.mul(sn), 1.2);
        const alpha = min(float(2).div(b), 1.4).mul(smoothstep(-0.2, 0.3, cs));
        const t = perp.div(max(sn, 1e-6));
        d.assign(normalize(d.mul(cos(alpha)).sub(t.mul(sin(alpha)))));
      });
      // ── aberração relativística (observador a velocidade beta) ──
      const dop = float(1).toVar();
      If(U.beta.greaterThan(0.001), () => {
        const v = U.velDir;
        const co = dot(d, v);
        const bt = U.beta;
        const cs = co.sub(bt).div(float(1).sub(bt.mul(co)));
        const perp = d.sub(v.mul(co));
        const pl = max(length(perp), 1e-5);
        const sn = sqrt(max(float(1).sub(cs.mul(cs)), 0));
        d.assign(normalize(v.mul(cs).add(perp.div(pl).mul(sn))));
        dop.assign(sqrt(float(1).add(bt.mul(co)).div(max(float(1).sub(bt.mul(co)), 0.02))));
      });
      const col = this.sample(d, U.pa.mul(dop.mul(0.5).add(0.5))).toVar();
      // Doppler: frente azulada e mais brilhante, traseira avermelhada e apagada
      If(U.beta.greaterThan(0.001), () => {
        const blue = vec3(0.55, 0.75, 1.35), red = vec3(1.3, 0.55, 0.35);
        const tint = mix(red, blue, smoothstep(0.6, 1.6, dop));
        const l = dot(col, vec3(0.3, 0.55, 0.15));
        col.assign(mix(col, tint.mul(l), clamp(abs(dop.sub(1)).mul(0.8), 0, 0.85)).mul(min(dop.mul(dop), 6.0)));
      });
      return vec4(col.mul(U.exposure).mul(float(1).sub(U.hyper)), 1);
    });

    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
    mat.colorNode = node();
    mat.fog = false;
    const mesh = this.mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 64, 32), mat);
    mesh.name = 'ceu';
    mesh.frustumCulled = false;
    mesh.renderOrder = -10000;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);

    this.neighbors = new NeighborStars(ctx, U);
  }

  setNeighbors(list) { this.neighbors.set(list); }

  frame(ctx) {
    const cam = ctx.camera;
    const h = ctx.renderer.domElement.height || innerHeight;
    // ângulo de um pixel do buffer de desenho (o campo estelar fica nítido em qualquer DPR)
    this.u.pa.value = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5) / Math.max(1, h);
    this.neighbors.frame(ctx);
  }
}

/**
 * Estrelas vizinhas reais (sistemas da galáxia num raio de ~140 a.l.): sprites
 * instanciados num raio fixo, tamanho em pixels constante, cor pelo tipo e
 * espículas de difração nas mais brilhantes. Ficam alinhadas ao mapa galáctico.
 */
class NeighborStars {
  constructor(ctx, U) {
    this.ctx = ctx; this.U = U;
    this.max = 160;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(2, 2);
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.aDir = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4); // dir.xyz, brilho
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4); // cor, fase
    g.setAttribute('sDir', this.aDir);
    g.setAttribute('sCol', this.aCol);
    g.instanceCount = 0;
    this.geo = g;
    const right = this.right = uniform(new THREE.Vector3(1, 0, 0));
    const up = this.up = uniform(new THREE.Vector3(0, 1, 0));
    const time = this.time = uniform(0);

    const sDir = attribute('sDir', 'vec4');
    const sCol = attribute('sCol', 'vec4');
    const bright = sDir.w;
    const sizePx = clamp(sqrt(bright).mul(7.0).add(4.0), 4.0, 46.0);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending });
    mat.positionNode = Fn(() => {
      const c = normalize(sDir.xyz).mul(SKY_RADIUS * 0.9);
      const s = U.pa.mul(SKY_RADIUS * 0.9).mul(sizePx);
      return c.add(right.mul(positionGeometry.x.mul(s))).add(up.mul(positionGeometry.y.mul(s)));
    })();
    mat.colorNode = Fn(() => {
      const p = uv().mul(2).sub(1).mul(sizePx);   // em pixels
      const r = length(p);
      const core = exp(r.mul(r).mul(-0.9));
      const halo = exp(r.mul(-0.45)).mul(0.12);
      const tw = sin(time.mul(sCol.w.mul(3.0).add(1.3)).add(sCol.w.mul(40.0))).mul(0.12).add(0.94);
      const spk = max(exp(abs(p.x).mul(-1.6)).mul(exp(abs(p.y).mul(-0.11))), exp(abs(p.y).mul(-1.6)).mul(exp(abs(p.x).mul(-0.11))))
        .mul(smoothstep(1.0, 6.0, bright)).mul(0.5);
      const edge = smoothstep(1.0, 0.7, length(uv().mul(2).sub(1)));
      const i = core.mul(bright.mul(1.8).add(1.0)).add(halo.mul(bright)).add(spk.mul(bright.mul(0.25)));
      return vec4(sCol.rgb.mul(i).mul(tw).mul(edge).mul(U.exposure).mul(float(1).sub(U.hyper)).mul(float(1).sub(U.beta.mul(1.5).clamp(0, 1))), 1);
    })();
    mat.fog = false;
    const mesh = this.mesh = new THREE.Mesh(g, mat);
    mesh.name = 'estrelas-vizinhas';
    mesh.frustumCulled = false;
    mesh.renderOrder = -9990;
    mesh.matrixAutoUpdate = false;
    ctx.scene.add(mesh);
  }
  set(list) {
    const n = Math.min(this.max, list.length);
    const D = this.aDir.array, C = this.aCol.array;
    for (let i = 0; i < n; i++) {
      const s = list[i];
      D[i * 4] = s.dir.x; D[i * 4 + 1] = s.dir.y; D[i * 4 + 2] = s.dir.z; D[i * 4 + 3] = Math.min(12, s.app);
      C[i * 4] = s.color.r; C[i * 4 + 1] = s.color.g; C[i * 4 + 2] = s.color.b; C[i * 4 + 3] = (i * 0.618) % 1;
    }
    this.aDir.needsUpdate = true; this.aCol.needsUpdate = true;
    this.geo.instanceCount = n;
  }
  frame(ctx) {
    const q = ctx.camera.quaternion;
    this.right.value.set(1, 0, 0).applyQuaternion(q);
    this.up.value.set(0, 1, 0).applyQuaternion(q);
    this.time.value = ctx.time.now;
  }
}
