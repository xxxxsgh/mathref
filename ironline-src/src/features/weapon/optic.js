/**
 * Lente da mira holográfica com retículo projetado no infinito.
 *
 * O retículo NÃO é uma textura colada no vidro: para cada fragmento da lente
 * calculamos a direção do olho até ele no espaço da arma e desenhamos o
 * retículo em coordenadas ANGULARES em torno do eixo de visada. Resultado:
 * sem paralaxe — ele fica no centro quando a arma está alinhada e escorrega
 * para a borda da janela (e some) quando o olho sai do eixo, como num
 * holográfico de verdade. A cor é HDR (> 1) para florescer no bloom.
 *
 * Retículo original: anel de 65 MOA com 4 marcas cardeais + ponto de 1 MOA.
 */
import * as THREE from 'three';

export function makeLens({ w, h, color = new THREE.Color(1.0, 0.08, 0.04), intensity = 9 } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: color },
      uIntensity: { value: intensity },
      uHalf: { value: new THREE.Vector2(w / 2, h / 2) },
      uTint: { value: new THREE.Color(0.55, 0.75, 0.85) },
      uOn: { value: 1 },
      uEnvColor: { value: new THREE.Color(0.6, 0.7, 0.8) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vObj;
      varying vec3 vCamObj;
      varying vec2 vUv;
      void main() {
        vObj = position;
        vUv = uv;
        vCamObj = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor, uTint, uEnvColor;
      uniform float uIntensity, uOn;
      uniform vec2 uHalf;
      varying vec3 vObj;
      varying vec3 vCamObj;
      varying vec2 vUv;
      // distância (rad) a um anel e a um segmento
      float ring(vec2 p, float r) { return abs(length(p) - r); }
      void main() {
        vec3 d = normalize(vObj - vCamObj);
        // ângulo em torno do eixo −Z (tan → rad para ângulos pequenos)
        vec2 a = d.xy / max(-d.z, 1e-3);
        float MOA = 0.000290888 * 2.4; // escala de jogo (legível em 1080p)
        float px = fwidth(a.x) + 1e-6; // tamanho de um pixel em rad
        float core = 0.0;
        // ponto central 1 MOA
        float dd = length(a) - 0.6 * MOA;
        core += 1.0 - smoothstep(0.0, px * 1.2, dd);
        // anel 65 MOA (raio 32,5)
        float rr = ring(a, 32.5 * MOA) - 0.9 * MOA;
        core += 1.0 - smoothstep(0.0, px * 1.2, rr);
        // marcas cardeais (dentro do anel)
        vec2 q = abs(a);
        float tickL = smoothstep(26.0 * MOA - px, 26.0 * MOA, max(q.x, q.y)) * (1.0 - smoothstep(32.0 * MOA, 32.0 * MOA + px, max(q.x, q.y)));
        float tickW = 1.0 - smoothstep(0.8 * MOA, 0.8 * MOA + px, min(q.x, q.y));
        core += tickL * tickW;
        core = clamp(core, 0.0, 1.0);
        // brilho difuso (holograma "sangra" um pouco)
        float glow = exp(-max(dd, 0.0) / (3.0 * MOA)) * 0.25 + exp(-max(rr, 0.0) / (2.0 * MOA)) * 0.18;
        // granulação de laser (speckle) leve
        float sp = fract(sin(dot(floor(a / (0.4 * MOA)), vec2(12.9898, 78.233))) * 43758.5453);
        float ret = (core * (0.85 + 0.3 * sp) + glow) * uOn;
        // vinheta dentro da janela (some nas bordas do vidro)
        vec2 e = abs(vObj.xy) / uHalf;
        float inside = 1.0 - smoothstep(0.86, 1.0, max(e.x, e.y));
        // revestimento: reflexo azulado/âmbar fraco que cresce no ângulo rasante
        float fres = pow(1.0 - abs(d.z), 3.0);
        vec3 coat = uTint * (0.035 + 0.25 * fres) + uEnvColor * 0.02 * (vUv.y);
        vec3 col = coat + uColor * uIntensity * ret * inside;
        float alpha = clamp(0.1 + fres * 0.3, 0.0, 1.0);
        // pré-multiplicado: cor somada (aditivo) + leve escurecimento do fundo
        gl_FragColor = vec4(col, alpha);
      }`,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 10;
  mesh.name = 'holoLens';
  return mesh;
}
