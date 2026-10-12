/**
 * IMPOSTORES MULTI-ÂNGULO para árvores e fungos à distância.
 *
 * Assar (init): a malha LOD0 da espécie é desenhada em F azimutes (câmera
 * ortográfica na horizontal) em dois atlas F×1: albedo (cor × oclusão de
 * vértice) e normal no espaço da câmera de assar (+ espessura para a
 * translucidez). Fundo com a cor média (sem halo escuro nos mips).
 *
 * Desenhar: um quad instanciado por árvore, de frente para a câmera girando
 * só ao redor da normal da esfera (cilíndrico). O shader escolhe os DOIS
 * azimutes mais próximos da direção de visão no referencial da instância e
 * mistura; a normal do atlas volta para o espaço de visão e o quad é
 * iluminado pelo MESMO PBR (MeshStandardMaterial: sol, sombras recebidas,
 * IBL) que a malha — a troca LOD1 → impostor não muda o tom.
 */
import * as THREE from 'three';

export const FRAMES = 8;

const BAKE_VERT = /* glsl */ `
in vec2 aUv;
in vec4 aMat;
in vec4 aWind;
in vec3 color;
out vec2 vUv;
out vec4 vMat;
out vec3 vCol;
out vec3 vN;
out float vSoft;
void main() {
  vUv = aUv; vMat = aMat; vCol = color; vSoft = aWind.w;
  vN = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const BAKE_FRAG = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray tFAlb;
uniform sampler2DArray tFNrm;
uniform int uMode;
in vec2 vUv;
in vec4 vMat;
in vec3 vCol;
in vec3 vN;
in float vSoft;
layout(location = 0) out vec4 outC;
void main() {
  float layer = floor(vMat.x + 0.5);
  vec4 a = texture(tFAlb, vec3(vUv, layer));
  if (a.a < 0.5) discard;
  vec4 nt = texture(tFNrm, vec3(vUv, layer));
  if (uMode == 0) {
    // albedo linear (a textura já decodifica sRGB)
    outC = vec4(a.rgb * vCol, 1.0);
  } else {
    vec3 n = normalize(vN);
    if (!gl_FrontFacing && vSoft < 0.01) n = -n;
    float kind = floor(vMat.y + 0.5);
    float th = kind >= 1.0 ? nt.b : 0.0;
    outC = vec4(n * 0.5 + 0.5, th);
  }
}`;

/**
 * Assa os atlas de uma geometria. Devolve { alb, nrm, side, yMin }.
 */
export function bakeImposter(renderer, geometry, shared, tile = 256) {
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox;
  const rx = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z));
  const h = bb.max.y - bb.min.y;
  const side = Math.max(rx * 2, h) * 1.02;
  const yMin = bb.min.y;
  const W = tile * FRAMES, Hh = tile;
  const mkRT = (type) => {
    const rt = new THREE.WebGLRenderTarget(W, Hh, { type, depthBuffer: true, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    rt.texture.colorSpace = THREE.NoColorSpace;
    return rt;
  };
  const alb = mkRT(THREE.HalfFloatType);
  const nrm = mkRT(THREE.UnsignedByteType);
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: BAKE_VERT,
    fragmentShader: BAKE_FRAG,
    uniforms: { tFAlb: shared.tFAlb, tFNrm: shared.tFNrm, uMode: { value: 0 } },
    side: THREE.DoubleSide,
  });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  const cam = new THREE.OrthographicCamera(-side / 2, side / 2, side / 2, -side / 2, 0.1, side * 4);
  const prevRT = renderer.getRenderTarget();
  const prevVp = new THREE.Vector4();
  renderer.getViewport(prevVp);
  const prevSc = renderer.getScissorTest();
  const prevScissor = new THREE.Vector4();
  renderer.getScissor(prevScissor);
  const prevClear = new THREE.Color();
  renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const prevAuto = renderer.autoClear;
  const prevTM = renderer.toneMapping;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.autoClear = false;
  // cor média aproximada para o fundo (sem halo)
  const cAttr = geometry.getAttribute('color');
  const avg = [0, 0, 0];
  for (let i = 0; i < cAttr.count; i++) {
    avg[0] += cAttr.getX(i);
    avg[1] += cAttr.getY(i);
    avg[2] += cAttr.getZ(i);
  }
  const n = Math.max(1, cAttr.count);
  for (const [rt, mode, clear, alpha] of [
    [alb, 0, new THREE.Color(avg[0] / n * 0.6, avg[1] / n * 0.6, avg[2] / n * 0.6), 0],
    [nrm, 1, new THREE.Color(0.5, 0.5, 1.0), 0],
  ]) {
    mat.uniforms.uMode.value = mode;
    renderer.setRenderTarget(rt);
    renderer.setScissorTest(false);
    renderer.setClearColor(clear, alpha);
    renderer.clear(true, true, true);
    renderer.setScissorTest(true);
    for (let f = 0; f < FRAMES; f++) {
      const phi = (f / FRAMES) * Math.PI * 2;
      const d = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
      const cy = yMin + side / 2;
      cam.position.set(d.x * side * 2, cy, d.z * side * 2);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, cy, 0);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      renderer.setViewport(f * tile, 0, tile, Hh);
      renderer.setScissor(f * tile, 0, tile, Hh);
      renderer.render(scene, cam);
    }
  }
  renderer.setScissorTest(prevSc);
  renderer.setScissor(prevScissor);
  renderer.setRenderTarget(prevRT);
  renderer.setViewport(prevVp);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.autoClear = prevAuto;
  renderer.toneMapping = prevTM;
  mat.dispose();
  return { alb, nrm, side, yMin };
}

/** Geometria do quad do impostor (x ∈ [−½, ½], y ∈ [0, 1]). */
export function imposterGeometry() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** Material PBR do impostor (MeshStandardMaterial com o vértice/fragmento trocados). */
export function makeImposterMaterial(bake, shared) {
  const own = {
    tIAlb: { value: bake.alb.texture },
    tINrm: { value: bake.nrm.texture },
    uISide: { value: bake.side },
    uIYMin: { value: bake.yMin },
    uFrames: { value: FRAMES },
    uTransl: { value: 1 },
  };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide });
  mat.alphaToCoverage = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, shared, own);
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uISide, uIYMin, uFrames;
        varying vec2 vIUv0, vIUv1;
        varying float vIBlend;
        varying vec3 vIR, vIU, vIF;`,
      )
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalMatrix * objectNormal;')
      .replace(
        '#include <begin_vertex>',
        `
        mat3 iRot = mat3(instanceMatrix);
        float s = length(iRot[1]);
        vec3 iUp = iRot[1] / s;
        vec3 iPos = instanceMatrix[3].xyz;
        vec3 rp = (modelMatrix * vec4(iPos, 1.0)).xyz;
        vec3 toCam = normalize(-rp);
        vec3 right = cross(iUp, toCam);
        float rl = length(right);
        right = rl > 1e-4 ? right / rl : normalize(iRot[0]);
        vec3 fwd = cross(right, iUp);
        vec3 ix = iRot[0] / s, iz = iRot[2] / s;
        float phi = atan(dot(fwd, iz), dot(fwd, ix));
        float fr = phi / 6.2831853 * uFrames;
        fr = fr - floor(fr / uFrames) * uFrames;
        float f0 = floor(fr);
        vIBlend = fr - f0;
        float f1 = mod(f0 + 1.0, uFrames);
        vIUv0 = vec2((f0 + uv.x) / uFrames, uv.y);
        vIUv1 = vec2((f1 + uv.x) / uFrames, uv.y);
        vec3 transformed = iPos + (right * position.x * uISide + iUp * (position.y * uISide + uIYMin)) * s;
        vIR = normalize((viewMatrix * vec4(right, 0.0)).xyz);
        vIU = normalize((viewMatrix * vec4(iUp, 0.0)).xyz);
        vIF = normalize((viewMatrix * vec4(fwd, 0.0)).xyz);
        vNormal = vIF;
        `,
      )
      .replace('#include <project_vertex>', 'vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;')
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D tIAlb, tINrm;
        uniform vec3 uSunDirV, uSunRad;
        uniform float uTransl;
        varying vec2 vIUv0, vIUv1;
        varying float vIBlend;
        varying vec3 vIR, vIU, vIF;
        vec4 gIN;`,
      )
      .replace(
        '#include <map_fragment>',
        `{
          vec4 a0 = texture(tIAlb, vIUv0), a1 = texture(tIAlb, vIUv1);
          vec4 n0 = texture(tINrm, vIUv0), n1 = texture(tINrm, vIUv1);
          vec4 a = mix(a0, a1, vIBlend);
          gIN = mix(n0, n1, vIBlend);
          vec2 dx = dFdx(vIUv0) * vec2(2048.0, 256.0), dy = dFdy(vIUv0) * vec2(2048.0, 256.0);
          float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
          a.a *= 1.0 + mip * 0.3;
          diffuseColor *= a;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
          vec3 nb = normalize(gIN.xyz * 2.0 - 1.0);
          normal = normalize(nb.x * vIR + nb.y * vIU + nb.z * vIF);
        }`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        {
          vec3 Vv = normalize(vViewPosition);
          float back = pow(clamp(dot(-Vv, uSunDirV), 0.0, 1.0), 4.0);
          float wrapL = clamp(dot(-normal, uSunDirV) * 0.5 + 0.5, 0.0, 1.0);
          reflectedLight.directDiffuse += uSunRad * diffuseColor.rgb * gIN.a * uTransl * (back * 2.2 + wrapL * 0.35) * 0.6 * RECIPROCAL_PI;
        }`,
      );
  };
  mat.customProgramCacheKey = () => 'exo-flora-imposter-1';
  return { mat, own };
}
