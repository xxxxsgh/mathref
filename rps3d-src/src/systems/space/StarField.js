// Campo de estrelas "resolvidas": dezenas de milhares de quads minúsculos
// num domo centrado na câmera, cada um com cor de corpo negro pela
// temperatura, fluxo HDR (as mais brilhantes passam de 1 e alimentam o
// bloom), halo e espículas de difração alinhadas à tela nas mais fortes, e
// cintilação suave (mais forte dentro de atmosfera).
//
// Tamanho em PIXELS constante (independe do fov/resolução) — o vértice é
// expandido no shader usando o ângulo de um pixel (camU.pixelAngle).

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, attribute, select, positionGeometry, exp, abs, max, min, sin, dot, smoothstep, clamp, varying, length, mix, pow, acos,
} from 'three/tsl';
import { makeRng } from '../../core/Rng.js';
import { blackbodyRGB, camU } from './tslUtil.js';
import { sstep } from './tslUtil.js';

const COUNTS = { ultra: 42000, high: 28000, medium: 15000, mobile: 7000 };

function tempSample(r) {
  const u = r();
  if (u < 0.33) return r.range(2900, 3900);
  if (u < 0.63) return r.range(3900, 5300);
  if (u < 0.83) return r.range(5300, 7200);
  if (u < 0.94) return r.range(7200, 11000);
  return r.range(11000, 32000);
}

export class StarField {
  /**
   * @param {object} layout skyLayout(system)
   * @param {string} qualityName
   * @param {number} R raio do domo
   * @param {object} lensU uniform vec4 (dir.xyz, rs/D) do buraco negro (w=0 sem lente)
   */
  constructor(layout, qualityName, R, lensU) {
    const n = COUNTS[qualityName] || COUNTS.high;
    const r = makeRng(layout.seed);
    const extra = layout.embedded.length;
    const total = n + extra;
    const pos = new Float32Array(total * 4 * 3);
    const corner = new Float32Array(total * 4 * 2);
    const star = new Float32Array(total * 4 * 4); // rgb, fluxo
    const misc = new Float32Array(total * 4 * 2); // tamanho px, fase
    const idx = new Uint32Array(total * 6);
    const [nx, ny, nz] = layout.galN;
    const [gx, gy, gz] = layout.gc;
    const put = (i, dx, dy, dz, rgb, flux, size, phase) => {
      for (let k = 0; k < 4; k++) {
        const v = i * 4 + k;
        pos[v * 3] = dx * R;
        pos[v * 3 + 1] = dy * R;
        pos[v * 3 + 2] = dz * R;
        corner[v * 2] = k & 1 ? 1 : -1;
        corner[v * 2 + 1] = k & 2 ? 1 : -1;
        star[v * 4] = rgb[0];
        star[v * 4 + 1] = rgb[1];
        star[v * 4 + 2] = rgb[2];
        star[v * 4 + 3] = flux;
        misc[v * 2] = size;
        misc[v * 2 + 1] = phase;
      }
      const b = i * 4;
      idx.set([b, b + 1, b + 2, b + 2, b + 1, b + 3], i * 6);
    };
    for (let i = 0; i < n; i++) {
      // direção: isotrópica ou concentrada na faixa galáctica / bojo
      let x, y, z;
      const mode = r();
      if (mode < 0.5) {
        z = r() * 2 - 1;
        const t = r() * Math.PI * 2;
        const s = Math.sqrt(1 - z * z);
        x = Math.cos(t) * s;
        y = z;
        z = Math.sin(t) * s;
      } else {
        // amostra perto do plano: direção aleatória achatada ao longo do normal
        let a = r() * 2 - 1, b2 = r() * 2 - 1, c = r() * 2 - 1;
        const l = Math.hypot(a, b2, c) || 1;
        a /= l; b2 /= l; c /= l;
        const d = a * nx + b2 * ny + c * nz;
        const g = (r() + r() + r() - 1.5) * 0.16; // ~gaussiana
        const towardGC = mode > 0.85 ? 0.6 : 0;
        x = a - nx * (d - g) + gx * towardGC;
        y = b2 - ny * (d - g) + gy * towardGC;
        z = c - nz * (d - g) + gz * towardGC;
        const l2 = Math.hypot(x, y, z) || 1;
        x /= l2; y /= l2; z /= l2;
      }
      const T = tempSample(r);
      // fluxo: lei de potência (muitas fracas, poucas fortíssimas)
      let flux = 0.026 * Math.pow(Math.max(1e-6, r()), -0.78);
      if (T > 11000) flux *= 1.8;
      flux = Math.min(flux, 16);
      const rgb = blackbodyRGB(T);
      const size = Math.min(14, 1.6 + Math.log2(1 + flux) * 1.6 + (flux > 2 ? flux * 0.22 : 0));
      put(i, x, y, z, rgb, flux, size, r() * 6.283);
    }
    for (let k = 0; k < extra; k++) {
      const e = layout.embedded[k];
      put(n + k, e.dir[0], e.dir[1], e.dir[2], blackbodyRGB(e.temp), 5 + e.power * 6, 9, r() * 6.283);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
    geo.setAttribute('star', new THREE.BufferAttribute(star, 4));
    geo.setAttribute('misc', new THREE.BufferAttribute(misc, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R * 1.1);

    const mat = new THREE.MeshBasicNodeMaterial({
      transparent: false, // fica na lista opaca → desenha logo depois do domo
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    mat.fog = false;
    const aCorner = attribute('corner', 'vec2');
    const aStar = attribute('star', 'vec4');
    const aMisc = attribute('misc', 'vec2');
    const size = aMisc.x;
    const ang = size.mul(camU.pixelAngle).mul(R);
    mat.positionNode = positionGeometry.add(camU.right.mul(aCorner.x).add(camU.up.mul(aCorner.y)).mul(ang));
    const vCorner = varying(aCorner.mul(size), 'vStarPx'); // coordenadas em pixels
    const vStar = varying(aStar, 'vStar');
    const vPhase = varying(aMisc.y, 'vPhase');
    const vDir = varying(positionGeometry.normalize(), 'vStarDir');
    const vSize = varying(size, 'vStarSize');
    mat.colorNode = Fn(() => {
      const p = vCorner;
      const flux = vStar.w;
      const r2 = dot(p, p);
      const sig = float(0.55).add(flux.add(1).log().mul(0.22));
      const core = exp(r2.div(sig.mul(sig).mul(-2.0)));
      const halo = flux.mul(0.045).div(r2.mul(0.35).add(1.0)).mul(sstep(0.6, 3.0, flux));
      // espículas de difração (alinhadas à tela)
      const sx = exp(abs(p.y).mul(-1.6)).mul(exp(abs(p.x).div(flux.mul(0.9).add(1.0)).negate()));
      const sy = exp(abs(p.x).mul(-1.6)).mul(exp(abs(p.y).div(flux.mul(0.9).add(1.0)).negate()));
      const spikes = sx.add(sy).mul(flux).mul(0.06).mul(sstep(3.0, 12.0, flux));
      // borda do quad some suavemente
      const edge = float(1).sub(smoothstep(vSize.mul(0.65), vSize, length(p)));
      // cintilação: leve no vácuo (jitter do sensor), forte na atmosfera
      const tw = float(1.0).add(sin(camU.time.mul(vPhase.mul(2.1).add(3.0)).add(vPhase.mul(13.0))).mul(sin(camU.time.mul(1.7).add(vPhase)).mul(0.5).add(0.5)).mul(mix(float(0.35), float(0.08), camU.skyVis)));
      // máscara da lente gravitacional (estrelas somem perto do buraco negro;
      // a imagem lenteada vem do cubo)
      const cosA = dot(vDir, lensU.xyz);
      const a = acos(clamp(cosA, -1.0, 1.0));
      const thetaE = lensU.w.mul(2.0).sqrt().max(1e-4); // > 0: smoothstep com bordas iguais vira NaN
      const lens = select(lensU.w.greaterThan(0.0), smoothstep(thetaE.mul(1.5), thetaE.mul(5.0), a), float(1.0));
      const I = core.mul(flux).add(halo).add(spikes).mul(tw).mul(lens).mul(camU.skyVis);
      return vec4(vStar.xyz.mul(I).mul(edge), 1.0);
    })();
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -999;
    this.mesh.name = 'space-stars';
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
