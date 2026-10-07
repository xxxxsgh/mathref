// Céu do espaço profundo.
//
// 1) BAKE (uma vez por sistema estelar): um cubemap HDR com a Via Láctea da
//    galáxia de verdade (raymarching do modelo de densidade da galáxia do
//    Universe.js a partir da posição do sistema — braços espirais, bojo
//    central, faixas de poeira) + nebulosa volumétrica por raymarching
//    (emissão/absorção, filamentos, "fenda" escura, estrelas ionizantes).
//    O canal alfa guarda a densidade de estrelas não resolvidas (mais estrelas
//    na faixa galáctica, menos atrás da poeira).
// 2) FUNDO (todo frame): cubemap + campo estelar procedural nítido no pixel.
//
// O mesmo cubemap é o envMap (IBL) do espaço.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, min, abs, dot, sqrt,
  positionLocal, normalWorldGeometry, cubeTexture, Loop, If, atan, cos, sin, sub, mat3,
} from 'three/tsl';
import { n3, starField, hash33 } from './tsl.js';
import { Rng, mix as mixSeed } from '../../core/Rng.js';

/** Parâmetros do céu de um sistema (determinísticos pela seed). */
export function skyParams(system) {
  const r = new Rng(mixSeed(system.seed, 0x5ky = 0x5c1));
  return r;
}
