/**
 * Lunetas com imagem AMPLIADA de verdade (imagem-em-imagem).
 *
 * `ScopeView` renderiza o mundo (ctx.scene) num render target pequeno a
 * partir da câmera do jogador com FOV estreito — só quando a arma ativa tem
 * luneta e o jogador está mirando. A lente (`makeScopeLens`) amostra esse
 * alvo em coordenadas ANGULARES no espaço de visão: para cada fragmento,
 * a direção do olho até ele (tan) vira uma direção do mundo dividida pela
 * ampliação em torno do eixo da luneta — a imagem fica estável na tela e é o
 * retículo (desenhado no eixo da luneta, 2º plano focal) que balança com a
 * arma. Pupila de saída: com o olho fora do eixo (hip, transição do ADS) a
 * imagem escurece em anel ("sombra da luneta") até ficar só o vidro.
 *
 * Retículos originais: 'mil' (cruz fina com postes grossos, pontos de mil e
 * ponto central iluminado), 'chevron' (chevron com marcas de queda), 'ring'
 * (anel + ponto, 3x).
 *
 * Fora do ADS a lente é vidro com revestimento (reflexo âmbar/verde que muda
 * com o ângulo) e o brilho ("glint") da objetiva é um sprite aditivo que
 * aparece quando se olha de frente para ela (prévia/inspeção).
 */
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const RET = { mil: 0, chevron: 1, ring: 2 };

export class ScopeView {
  constructor(size = 512) {
    this.rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, depthBuffer: true, samples: 0 });
    this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.cam = new THREE.PerspectiveCamera(5, 1, 0.1, 2000);
    this.active = false;
    this.frames = 0;
  }
  /**
   * Renderiza o mundo com FOV vertical `fovDeg` alinhado à câmera do mundo.
   * Restaura todo o estado do renderer que mexe.
   */
  render(ctx, fovDeg) {
    const r = ctx.renderer;
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    cam.getWorldPosition(this.cam.position);
    cam.getWorldQuaternion(this.cam.quaternion);
    this.cam.fov = fovDeg;
    this.cam.near = Math.max(0.05, cam.near);
    this.cam.far = cam.far;
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();
    const prevT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false; // reaproveita as sombras do quadro
    r.autoClear = true;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(ctx.scene, this.cam);
    r.setRenderTarget(prevT);
    r.autoClear = prevAuto;
    r.shadowMap.autoUpdate = prevShadow;
    this.frames++;
  }
  dispose() {
    this.rt.dispose();
  }
}

/**
 * Lente da ocular (círculo no plano XY local, voltado para +Z = o olho).
 * `view` = ScopeView compartilhado.
 */
export function makeScopeLens({ radius = 0.017, zoom = 8, reticle = 'mil', color = [1.0, 0.08, 0.04], view = null } = {}) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: true,
    uniforms: {
      tView: { value: view ? view.rt.texture : null },
      uHasView: { value: 0 },
      uMag: { value: zoom },
      uTanRT: { value: 0.05 },
      uAxis: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: radius },
      uRet: { value: RET[reticle] ?? 0 },
      uRetScale: { value: 1 },
      uIllum: { value: new THREE.Color(...color) },
      uIllumK: { value: 4 },
      uOn: { value: 0 },
      uEnv: { value: new THREE.Color(0.55, 0.62, 0.7) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vObj;
      varying vec3 vCamObj;
      varying vec3 vView;
      void main() {
        vObj = position;
        vCamObj = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform sampler2D tView;
      uniform float uHasView, uMag, uTanRT, uRadius, uRet, uRetScale, uIllumK, uOn;
      uniform vec2 uAxis;
      uniform vec3 uIllum, uEnv;
      varying vec3 vObj;
      varying vec3 vCamObj;
      varying vec3 vView;
      float h21(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      // cobertura de traço: d = distância (rad), w = meia-largura (rad), px = pixel
      float stroke(float d, float w, float px) { return 1.0 - smoothstep(w - px * 0.5, w + px * 0.6, d); }
      void main() {
        vec3 vd = normalize(vView);
        vec2 a = vd.xy / max(-vd.z, 1e-3); // direção aparente (tan), espaço de visão
        vec2 q = a - uAxis;                 // em torno do eixo da luneta
        float px = max(fwidth(a.x), fwidth(a.y)) + 1e-6;
        vec2 lp = vObj.xy / uRadius;        // posição na lente (−1..1)
        float rl = length(lp);
        // pupila de saída: olho fora do eixo → anel escuro que fecha a imagem
        vec2 eye = vCamObj.xy / uRadius;
        float pupil = length(lp * 0.55 + eye * 2.4);
        float vis = (1.0 - smoothstep(0.42, 0.62, pupil)) * uOn;
        vis *= 1.0 - smoothstep(0.86, 0.99, rl);
        // imagem ampliada do mundo
        vec3 img = vec3(0.0);
        if (uHasView > 0.5 && vis > 0.001) {
          vec2 w = uAxis + q / uMag;
          vec2 uv = 0.5 + 0.5 * w / uTanRT;
          img = texture2D(tView, uv).rgb;
          // leve aberração cromática e queda de luz na borda do campo
          float ca = smoothstep(0.5, 0.95, rl) * 0.004;
          img.r = texture2D(tView, uv + (uv - 0.5) * ca).r;
          img *= 1.0 - 0.35 * smoothstep(0.55, 0.95, rl);
        }
        // ─ retículo (2º plano focal: tamanho fixo na tela) ─
        float S = 0.0018 * uRetScale; // "mil" de jogo (rad aparente)
        vec2 aq = abs(q);
        float ret = 0.0, glow = 0.0;
        if (uRet < 0.5) {
          // cruz fina + postes grossos fora de 6 mil + pontos de mil
          float thin = stroke(min(aq.x, aq.y), 0.06 * S, px);
          float thick = stroke(min(aq.x, aq.y), 0.22 * S, px) * step(6.0 * S, max(aq.x, aq.y));
          ret = max(thin, thick);
          for (int i = 1; i <= 5; i++) {
            float fi = float(i);
            ret = max(ret, 1.0 - smoothstep(0.14 * S - px * 0.5, 0.14 * S + px * 0.6, length(vec2(aq.x - fi * S, aq.y))));
            ret = max(ret, 1.0 - smoothstep(0.14 * S - px * 0.5, 0.14 * S + px * 0.6, length(vec2(aq.x, aq.y - fi * S))));
          }
          float dotc = 1.0 - smoothstep(0.12 * S - px * 0.5, 0.12 * S + px * 0.6, length(q));
          glow = dotc;
          ret *= 1.0 - dotc;
        } else if (uRet < 1.5) {
          // chevron (ponta no ponto de impacto) + linha de queda com marcas
          vec2 c = q / S;
          float chev = abs(abs(c.x) + c.y * 1.0) ; // V invertido
          float inChev = step(c.y, 0.0) * step(-1.6, c.y);
          float v = stroke(chev * S * 0.7, 0.12 * S, px) * inChev;
          float drop = stroke(aq.x, 0.05 * S, px) * step(2.2 * S, -q.y) * step(-q.y, 9.0 * S);
          float marks = 0.0;
          for (int i = 1; i <= 4; i++) {
            float y = -2.2 * S - float(i) * 1.6 * S;
            float wdt = (1.6 - float(i) * 0.25) * S;
            marks = max(marks, stroke(abs(q.y - y), 0.05 * S, px) * step(aq.x, wdt));
          }
          float hor = stroke(aq.y, 0.05 * S, px) * step(3.0 * S, aq.x) * step(aq.x, 14.0 * S);
          ret = max(max(v, drop), max(marks, hor));
          glow = v;
        } else {
          // anel + ponto (3x)
          float ring = stroke(abs(length(q) - 4.5 * S), 0.12 * S, px);
          float dotc = 1.0 - smoothstep(0.35 * S - px * 0.5, 0.35 * S + px * 0.6, length(q));
          float ticks = stroke(min(aq.x, aq.y), 0.08 * S, px) * step(4.5 * S, max(aq.x, aq.y)) * step(max(aq.x, aq.y), 7.0 * S);
          ret = max(ring, ticks);
          glow = max(dotc, ring * 0.6);
        }
        vec3 col = mix(img, vec3(0.01), clamp(ret, 0.0, 1.0) * 0.95);
        col += uIllum * uIllumK * glow;
        col *= vis;
        // ─ vidro: revestimento + reflexo (sempre, mais forte fora do ADS) ─
        vec3 d = normalize(vObj - vCamObj);
        float cosT = abs(d.z);
        float fres = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
        vec3 film = mix(vec3(0.75, 0.52, 0.2), vec3(0.32, 0.6, 0.42), smoothstep(0.995, 0.9, cosT));
        float smudge = smoothstep(0.6, 0.9, h21(floor(vObj.xy * 3000.0)) * 0.3 + 0.6 * h21(floor(vObj.xy * 300.0)));
        vec3 glass = film * (0.03 + 0.25 * fres) + uEnv * (0.02 + 0.05 * smoothstep(-0.2, 1.0, lp.y)) + uEnv * smudge * 0.01;
        // anel do bisel da lente
        float bevel = smoothstep(0.9, 0.97, rl) * (1.0 - smoothstep(0.97, 1.0, rl));
        glass += uEnv * bevel * 0.25;
        col += glass * (1.0 - vis * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.toneMapped = true;
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat);
  mesh.name = 'scopeLens';
  mesh.renderOrder = 2;
  mesh.userData.scope = { zoom, radius };
  return mesh;
}

/**
 * Atualiza a lente para o quadro: eixo da luneta no espaço de visão,
 * ampliação efetiva (corrige a diferença de FOV entre viewmodel e mundo) e
 * FOV do render target. Devolve o FOV (graus) que o ScopeView deve usar, ou
 * 0 se não precisa renderizar.
 */
export function updateScopeLens(lens, vmCam, worldCam, ads, view) {
  const u = lens.material.uniforms;
  const { zoom, radius } = lens.userData.scope;
  lens.updateMatrixWorld();
  vmCam.updateMatrixWorld();
  // eixo (−Z da lente) no espaço de visão da câmera da viewmodel
  _q.copy(vmCam.quaternion).invert();
  _v.set(0, 0, -1).applyQuaternion(lens.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(_q);
  const ax = _v.x / Math.max(-_v.z, 1e-3), ay = _v.y / Math.max(-_v.z, 1e-3);
  u.uAxis.value.set(ax, ay);
  // ampliação relativa ao mundo: zoom × tan(FOVvm/2) / tan(FOVmundo/2)
  const tv = Math.tan(THREE.MathUtils.degToRad(vmCam.fov) / 2);
  const tw = Math.tan(THREE.MathUtils.degToRad(worldCam.fov) / 2);
  const mag = zoom * (tv / tw);
  u.uMag.value = mag;
  u.uOn.value = THREE.MathUtils.smoothstep(ads, 0.25, 0.85);
  // campo aparente da lente (raio / distância do olho) → campo no mundo
  lens.getWorldPosition(_v);
  const eyeDist = Math.max(0.03, _v.distanceTo(vmCam.getWorldPosition(new THREE.Vector3())));
  const app = radius / eyeDist;
  const tanRT = Math.abs(app / mag) * 1.3 + Math.hypot(ax, ay) + 0.002;
  u.uTanRT.value = tanRT;
  u.uHasView.value = view && ads > 0.2 ? 1 : 0;
  return ads > 0.2 ? THREE.MathUtils.radToDeg(Math.atan(tanRT) * 2) : 0;
}

/** Brilho da objetiva (sprite aditivo); intensidade pelo ângulo de visão. */
export function makeGlint(size = 0.06) {
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  let tex = null;
  if (cv) {
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.15, 'rgba(255,240,210,0.8)');
    gr.addColorStop(0.4, 'rgba(255,200,140,0.18)');
    gr.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    // raios em cruz
    g.globalCompositeOperation = 'lighter';
    for (const [w, h] of [[128, 3], [3, 128]]) {
      const lg = g.createLinearGradient(64 - w / 2, 64 - h / 2, 64 + w / 2, 64 + h / 2);
      lg.addColorStop(0, 'rgba(255,230,200,0)');
      lg.addColorStop(0.5, 'rgba(255,240,220,0.9)');
      lg.addColorStop(1, 'rgba(255,230,200,0)');
      g.fillStyle = lg;
      g.fillRect(64 - w / 2, 64 - h / 2, w, h);
    }
    tex = new THREE.CanvasTexture(cv);
  }
  const mat = new THREE.SpriteMaterial({ map: tex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.name = 'glint';
  s.renderOrder = 5;
  // intensidade: forte só de frente para a objetiva
  s.onBeforeRender = (r, scene, cam) => {
    s.getWorldPosition(_v);
    const toCam = cam.getWorldPosition(new THREE.Vector3()).sub(_v).normalize();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(s.parent.getWorldQuaternion(new THREE.Quaternion()));
    const k = Math.max(0, toCam.dot(fwd));
    mat.opacity = Math.pow(k, 6) * (s.userData.boost ?? 1);
  };
  return s;
}
