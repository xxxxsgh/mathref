// Brilhos pontuais em billboard (luzes de navegação, estroboscópios de
// balizas, ondas de pulso de rádio). Tamanho em metros com MÍNIMO em pixels
// — uma baliza a 30 km continua visível como um ponto piscando.

import * as THREE from 'three/webgpu';
import { Fn, float, vec3, vec4, uniform, uv, length, exp, max, fract, step, sin, cameraPosition, modelWorldMatrix, modelWorldMatrixInverse, positionGeometry, smoothstep, clamp, abs } from 'three/tsl';
import { camU } from './tslUtil.js';

const _plane = new THREE.PlaneGeometry(2, 2);

/**
 * @param {object} o {color, size (m), minPx, intensity, period (s), duty (0..1), phase, ring:boolean}
 */
export function glowSprite(o = {}) {
  const color = uniform(new THREE.Color(o.color ?? 0xffffff));
  const intensity = uniform(o.intensity ?? 8);
  const size = o.size ?? 2;
  const minPx = o.minPx ?? 3;
  const period = o.period ?? 0;
  const duty = o.duty ?? 0.15;
  const phase = o.phase ?? 0;
  const ring = !!o.ring;
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.fog = false;
  const center = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz;
  const dist = length(center.sub(cameraPosition)).max(0.1);
  const half = max(float(size), dist.mul(camU.pixelAngle).mul(minPx));
  // billboard em espaço de mundo (o objeto não deve ter escala/rotação relevantes)
  m.positionNode = Fn(() => {
    // offset nos eixos da câmera (mundo) levado ao espaço local do objeto
    const off = camU.right.mul(positionGeometry.x).add(camU.up.mul(positionGeometry.y)).mul(half);
    return modelWorldMatrixInverse.mul(vec4(off, 0.0)).xyz;
  })();
  m.colorNode = Fn(() => {
    const p = uv().sub(0.5).mul(2.0);
    const r = length(p);
    let a;
    if (ring) {
      // onda de pulso: anel que cresce e some
      const t = period > 0 ? fract(camU.time.div(period).add(phase)) : float(0.5);
      a = exp(abs(r.sub(t)).mul(-28.0)).mul(float(1).sub(t)).mul(float(1).sub(smoothstep(0.9, 1.0, r)));
    } else {
      a = exp(r.mul(r).mul(-14.0)).add(exp(r.mul(-5.0)).mul(0.12)).mul(float(1).sub(smoothstep(0.85, 1.0, r)));
    }
    let blink = float(1);
    if (period > 0 && !ring) {
      const t = fract(camU.time.div(period).add(phase));
      blink = step(t, float(duty)).mul(0.9).add(0.1).mul(float(1).sub(t.div(duty).clamp(0, 1).mul(0.3)));
    }
    return vec4(color.mul(intensity).mul(a).mul(blink), 1.0);
  })();
  const mesh = new THREE.Mesh(_plane, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.userData.color = color;
  mesh.userData.intensity = intensity;
  return mesh;
}
