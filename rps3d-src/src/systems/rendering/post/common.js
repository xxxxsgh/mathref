// Uniforms e funções compartilhadas pelos passes de pós-processamento.
//
// PROFUNDIDADE: o núcleo usa `logarithmicDepthBuffer` (0,05 m → 2e9 m numa
// mesma cena: cabine e planetas). A textura de profundidade guarda então
//   d = log2(dist / near) / log2(far / near)
// (ver viewZToLogarithmicDepth do three). Os helpers de PassNode
// (getViewZNode/getLinearDepthNode) assumem projeção perspectiva comum e
// estariam errados — por isso todo efeito que precisa de distância usa
// `viewDist()` daqui. Mantivemos o buffer logarítmico (em vez de reversed-Z)
// porque o WebGL2 do iPad/Safari não tem clip-control para reversed-Z e o
// logarítmico dá precisão relativa constante (~1e-6) em toda a faixa.
//
// REPROJEÇÃO: a câmera fica sempre em (0,0,0) (origem flutuante). Para TAA e
// motion blur reconstruímos a posição de render de cada pixel a partir da
// profundidade, somamos o deslocamento da origem entre frames e projetamos
// com a rotação/projeção do frame anterior. Pixels muito próximos (< ~3 m:
// cabine, braços, arma) são tratados como presos à câmera.
import * as THREE from 'three/webgpu';
import { Fn, uniform, vec2, vec3, vec4, float, exp2, clamp, mix, smoothstep } from 'three/tsl';

export class PostUniforms {
  constructor() {
    this.near = uniform(0.05);
    this.far = uniform(2e9);
    this.logFN = uniform(Math.log2(2e9 / 0.05));
    this.tanHalf = uniform(new THREE.Vector2(1, 1));       // tan(fov/2) * (aspect, 1)
    this.camRot = uniform(new THREE.Matrix4());            // view → render (rotação atual)
    this.prevViewRot = uniform(new THREE.Matrix4());       // render → view (rotação anterior)
    this.prevTanHalf = uniform(new THREE.Vector2(1, 1));
    this.originDelta = uniform(new THREE.Vector3());       // origem atual − anterior (m)
    this.attachDist = uniform(3.2);                        // abaixo disso: preso à câmera
    this.resolution = uniform(new THREE.Vector2(1280, 720));
    this.invRes = uniform(new THREE.Vector2(1 / 1280, 1 / 720));
    this.time = uniform(0);
    this.frame = uniform(0);
    this.dt = uniform(1 / 60);
    // sol na tela
    this.sunUv = uniform(new THREE.Vector2(0.5, 0.5));
    this.sunFront = uniform(0);       // 1 se o sol está à frente da câmera
    this.sunVis = uniform(1);         // visibilidade analítica (eclipse)
    this.sunColor = uniform(new THREE.Color(1, 0.95, 0.88));
    this.sunDist = uniform(1e7);
    this.sunRadiusUv = uniform(0.01); // raio aparente em unidades de uv.y
    this.sunPower = uniform(1);       // escala do flare (luminosidade da estrela)
    this.aspect = uniform(16 / 9);
    // estado do jogador
    this.exposure = uniform(1);
    this.flashColor = uniform(new THREE.Color(1, 1, 1));
    this.flash = uniform(0);
    this.damage = uniform(0);         // vinheta vermelha de dano
    this.grain = uniform(0.035);
    this.vignette = uniform(0.32);
    this.chromatic = uniform(0.0016);
    this.saturation = uniform(1.06);
    this.contrast = uniform(1.04);
    this.tint = uniform(new THREE.Color(1, 1, 1));
    this.lift = uniform(new THREE.Color(0, 0, 0));
    this.mbScale = uniform(1);
    this.heatHaze = uniform(0);       // névoa de calor global (reentrada)
    this.quantum = uniform(0);        // 0..1 efeito de viagem quântica (streak radial)
  }
}

/** Distância (m, positiva) ao longo do eixo de visão a partir da profundidade log. */
export const viewDistFromDepth = (U, d) => U.near.mul(exp2(clamp(d, 0, 1).mul(U.logFN)));

/** Posição de VISTA a partir de uv (0,0 = topo-esquerda) e distância. */
export const viewPosFrom = (U, uvN, dist) => {
  const ndc = vec2(uvN.x.mul(2).sub(1), float(1).sub(uvN.y.mul(2)));
  return vec3(ndc.x.mul(U.tanHalf.x).mul(dist), ndc.y.mul(U.tanHalf.y).mul(dist), dist.negate());
};

/**
 * Para um pixel (uv, dist) retorna o uv que ele tinha no frame anterior,
 * assumindo mundo estático e câmera móvel. `transScale` atenua a parte de
 * translação (para não borrar alas que voam junto).
 */
export const reprojectUv = (U, uvN, dist, transScale = 1) => {
  const vp = viewPosFrom(U, uvN, dist);
  const rp = U.camRot.mul(vec4(vp, 0)).xyz.add(U.originDelta.mul(transScale));
  const pv = U.prevViewRot.mul(vec4(rp, 0)).xyz;
  const z = pv.z.negate().max(1e-4);
  const ndc = vec2(pv.x.div(z.mul(U.prevTanHalf.x)), pv.y.div(z.mul(U.prevTanHalf.y)));
  const prev = vec2(ndc.x.mul(0.5).add(0.5), float(0.5).sub(ndc.y.mul(0.5)));
  // pixels muito próximos acompanham a câmera (cabine, braços, arma)
  const attached = float(1).sub(smoothstep(U.attachDist, U.attachDist.mul(2.2), dist));
  return mix(prev, uvN, attached);
};

export { vec2, vec3, vec4 };
