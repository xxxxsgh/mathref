/**
 * Poeira em suspensão: partículas finas num volume que acompanha a câmera
 * (posições em módulo, sem realocar nada). Cada partícula consulta o shadow
 * map do sol no vertex shader — só brilha dentro dos feixes de luz, como
 * nas fotos de interiores com sol entrando pela janela.
 */
import * as THREE from 'three';

export class Dust {
  constructor(count = 900, box = 14) {
    const pos = new Float32Array(count * 3);
    const rnd = new Float32Array(count);
    let s = 12345;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = r() * box;
      pos[i * 3 + 1] = r() * box * 0.5;
      pos[i * 3 + 2] = r() * box;
      rnd[i] = r();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
    this.uniforms = {
      uCam: { value: new THREE.Vector3() },
      uBox: { value: new THREE.Vector3(box, box * 0.5, box) },
      uTime: { value: 0 },
      uShadow: { value: null },
      uShadowMatrix: { value: new THREE.Matrix4() },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uAmbient: { value: new THREE.Color(0.02, 0.022, 0.026) },
      uIntensity: { value: 1 },
      uPxScale: { value: 600 },
    };
    const mat = new THREE.ShaderMaterial({
      name: 'ironline-dust',
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      vertexShader: /* glsl */ `
        precision highp sampler2DShadow;
        attribute float aRnd;
        uniform vec3 uCam; uniform vec3 uBox; uniform float uTime;
        uniform sampler2DShadow uShadow; uniform mat4 uShadowMatrix;
        uniform vec3 uSunColor; uniform vec3 uAmbient; uniform float uIntensity; uniform float uPxScale;
        varying vec3 vCol; varying float vA;
        void main() {
          vec3 drift = vec3(sin(uTime * 0.13 + aRnd * 40.0), sin(uTime * 0.07 + aRnd * 17.0) * 0.6 - 0.15, cos(uTime * 0.11 + aRnd * 23.0)) * (0.25 + aRnd * 0.3);
          vec3 base = position + drift * uTime * 0.15;
          vec3 origin = uCam - uBox * vec3(0.5, 0.35, 0.5);
          vec3 p = origin + mod(base - origin, uBox);
          vec4 sc = uShadowMatrix * vec4(p, 1.0);
          vec3 s = sc.xyz / sc.w;
          float vis = (s.x > 0.0 && s.x < 1.0 && s.y > 0.0 && s.y < 1.0 && s.z < 1.0) ? texture(uShadow, vec3(s.xy, s.z - 0.001)) : 1.0;
          float d = distance(p, uCam);
          float fade = smoothstep(0.4, 1.4, d) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, d));
          float tw = 0.6 + 0.4 * sin(uTime * (1.0 + aRnd * 3.0) + aRnd * 60.0);
          vCol = (uSunColor * vis * tw + uAmbient) * uIntensity;
          vA = fade;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((0.010 + aRnd * 0.012) * uPxScale / -mv.z, 1.0, 6.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vCol; varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float m = exp(-dot(c, c) * 14.0);
          gl_FragColor = vec4(vCol * m * vA, 1.0);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.name = 'ironline-dust';
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.visible = false;
    // copia a matriz da sombra DEPOIS do passe de sombras deste frame
    this.points.onBeforeRender = () => {
      const sh = this._sun?.shadow;
      if (sh?.map?.depthTexture) {
        this.uniforms.uShadow.value = sh.map.depthTexture;
        this.uniforms.uShadowMatrix.value.copy(sh.matrix);
      }
    };
  }

  update(camera, sun, sunColor, time, pxScale) {
    const u = this.uniforms;
    camera.getWorldPosition(u.uCam.value);
    u.uTime.value = time;
    u.uPxScale.value = pxScale;
    this._sun = sun;
    const map = sun?.castShadow && sun.shadow.map?.depthTexture;
    this.points.visible = !!map && this.enabled !== false;
    if (map) {
      u.uShadow.value = map;
      u.uShadowMatrix.value.copy(sun.shadow.matrix);
      u.uSunColor.value.copy(sunColor);
    }
  }

  dispose() {
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
