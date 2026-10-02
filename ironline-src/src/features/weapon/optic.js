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

export function makeLens({ w, h, color = new THREE.Color(1.0, 0.08, 0.04), intensity = 4 } = {}) {
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
      float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec3 d = normalize(vObj - vCamObj);
        // ângulo em torno do eixo −Z (tan → rad para ângulos pequenos)
        vec2 a = d.xy / max(-d.z, 1e-3);
        float MOA = 0.000290888 * 1.1; // escala de jogo (legível em 1080p)
        float px = max(fwidth(a.x), fwidth(a.y)) + 1e-6; // tamanho de um pixel em rad
        // traço com no mínimo ~1,1 px (nítido e sem serrilhado): cobertura analítica
        float hw = 0.55 * MOA;
        float core = 0.0;
        // ponto central 1 MOA
        float dd = length(a) - 0.7 * MOA;
        core += 1.0 - smoothstep(-px * 0.5, px * 0.6, dd);
        // anel 65 MOA (raio 32,5)
        float rr = ring(a, 32.5 * MOA) - hw;
        core += 1.0 - smoothstep(-px * 0.5, px * 0.6, rr);
        // marcas cardeais (dentro do anel)
        vec2 q = abs(a);
        float tickL = smoothstep(25.0 * MOA - px, 25.0 * MOA, max(q.x, q.y)) * (1.0 - smoothstep(32.0 * MOA, 32.0 * MOA + px, max(q.x, q.y)));
        float tickW = 1.0 - smoothstep(hw - px * 0.5, hw + px * 0.6, min(q.x, q.y));
        core += tickL * tickW;
        core = clamp(core, 0.0, 1.0);
        // halo mínimo (o holograma "sangra" só um tiquinho)
        // halo em duas escalas: sangria curta do holograma + espalhamento
        // largo no vidro (o retículo "acende" como emissivo, com falloff)
        float glow = exp(-max(dd, 0.0) / (1.6 * MOA)) * 0.4 + exp(-max(rr, 0.0) / (1.4 * MOA)) * 0.22
                   + exp(-length(a) / (16.0 * MOA)) * 0.05 + exp(-max(rr, 0.0) / (6.0 * MOA)) * 0.05;
        // granulação de laser (speckle) leve
        float sp = h21(floor(a / (0.35 * MOA)));
        float ret = (core * (0.88 + 0.24 * sp) + glow) * uOn;
        // vinheta dentro da janela (some nas bordas do vidro)
        vec2 e = abs(vObj.xy) / uHalf;
        float inside = 1.0 - smoothstep(0.9, 1.0, max(e.x, e.y));
        // revestimento antirreflexo: reflexo âmbar/violeta que muda com o
        // ângulo (filme fino) + Fresnel forte na borda
        float cosT = abs(d.z);
        float fres = 0.02 + 0.98 * pow(1.0 - cosT, 5.0);
        vec3 film = mix(vec3(0.85, 0.6, 0.25), vec3(0.45, 0.62, 0.5), smoothstep(0.985, 0.9, cosT));
        // poeira/marcas de dedo no vidro (pegam luz)
        vec2 gp = vObj.xy * 900.0;
        float smudge = smoothstep(0.55, 0.85, vnoise(gp * 0.08) * 0.7 + vnoise(gp * 0.3) * 0.3);
        vec2 gc = gp * 0.9;
        vec2 cell = floor(gc);
        vec2 off = vec2(h21(cell + 3.1), h21(cell + 7.7)) * 0.6 + 0.2;
        float dust = step(0.975, h21(cell)) * (1.0 - smoothstep(0.05, 0.12, length(fract(gc) - off))) * 0.5;
        float edge = smoothstep(0.75, 1.0, max(e.x, e.y));
        // filete de refração na borda do vidro (bisel do vidro pega luz)
        float bevel = smoothstep(0.93, 0.975, max(e.x, e.y)) * (1.0 - smoothstep(0.975, 0.995, max(e.x, e.y)));
        vec3 coat = film * (0.03 + 0.22 * fres) * (0.6 + 0.4 * vUv.y) + uEnvColor * (smudge * 0.035 + dust * 0.05 + edge * 0.04 + bevel * 0.35)
                  + vec3(0.02, 0.05, 0.06) * 0.25; // tinta azul-esverdeada do vidro
        vec3 col = coat + uColor * uIntensity * ret * inside;
        // vidro levemente tingido (âmbar fraco escurece o fundo um pouco)
        float alpha = clamp(0.1 + bevel * 0.2 + fres * 0.22 + smudge * 0.03 + edge * 0.08, 0.0, 1.0);
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
