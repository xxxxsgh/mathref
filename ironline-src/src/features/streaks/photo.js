/**
 * Modo foto.
 *
 * Entrada: na PAUSA, botão "PHOTO MODE" (canto inferior esquerdo, nosso
 * DOM) ou tecla H; API `services.streaks.photo.enter()/exit()`.
 * A simulação fica parada (time.scale = 0), a HUD some (raiz escondida — a
 * tela de pausa volta ao sair), a viewmodel some.
 *
 * Câmera livre: arrastar com o mouse gira; WASD move, Q/E desce/sobe,
 * Shift acelera, roda = FOV; presa a 30 m do jogador e acima do chão.
 * Painel (H esconde): exposição (rendering.setExposure), FOV, inclinação
 * (roll), foco + abertura (profundidade de campo), filtro (nenhum, noir,
 * sépia, quente, frio, verão, bleach bypass, teal & orange, vintage),
 * vinheta, grão, barras de cinema. Captura (P / Enter / botão) baixa um PNG.
 * Esc / botão SAIR voltam à pausa.
 *
 * Pós-processo próprio (sem mexer no compositor): numa microtarefa depois
 * do render do frame, copia o framebuffer (FramebufferTexture), usa uma
 * passada de profundidade própria (MeshDepthMaterial, meia resolução, só
 * quando a câmera muda) e desenha um quad de tela cheia com DOF (16 amostras
 * em disco de Poisson pelo círculo de confusão), filtro, vinheta, grão e
 * barras. A captura lê o canvas na mesma tarefa (sem preserveDrawingBuffer).
 */
import * as THREE from 'three';
import { el } from './ui.js';

const FILTERS = {
  none: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  noir: [0.3, 0.59, 0.11, 0.3, 0.59, 0.11, 0.3, 0.59, 0.11],
  sepia: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131],
  warm: [1.08, 0.04, 0, 0.02, 1.0, 0, 0, 0, 0.86],
  cold: [0.88, 0, 0.04, 0, 0.98, 0.04, 0.02, 0.05, 1.12],
  summer: [1.06, 0.06, -0.04, 0.02, 1.04, -0.02, -0.04, 0.02, 0.9],
  bleach: [0.75, 0.2, 0.05, 0.15, 0.8, 0.05, 0.15, 0.2, 0.65],
  teal: [1.12, -0.05, -0.07, -0.04, 1.02, 0.02, -0.08, 0.08, 1.06],
  vintage: [0.62, 0.32, 0.06, 0.22, 0.7, 0.08, 0.2, 0.28, 0.5],
};
const FILTER_NAMES = { none: 'NONE', noir: 'NOIR', sepia: 'SEPIA', warm: 'WARM', cold: 'COLD', summer: 'SUMMER', bleach: 'BLEACH BYPASS', teal: 'TEAL & ORANGE', vintage: 'VINTAGE' };

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uNear, uFar, uFocus, uAperture, uVignette, uGrain, uBars, uTime, uContrast, uSat, uDof;
uniform mat3 uFilter;
#include <packing>
float linDepth(vec2 uv){ float d = unpackRGBAToDepth(texture2D(tDepth, uv)); float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
float coc(float z){ return clamp(abs(z - uFocus) / max(z, 0.1) * uAperture * 26.0, 0.0, 14.0); }
const vec2 P[16] = vec2[16](vec2(-0.94,-0.40),vec2(0.95,-0.77),vec2(-0.09,-0.93),vec2(0.34,0.29),vec2(-0.92,0.46),vec2(-0.20,0.79),vec2(0.44,-0.29),vec2(-0.74,-0.19),vec2(0.54,0.82),vec2(0.17,-0.54),vec2(-0.48,0.06),vec2(0.80,0.20),vec2(-0.32,-0.66),vec2(0.05,0.14),vec2(-0.62,-0.85),vec2(0.86,-0.32));
void main(){
  vec2 uv = vUv;
  vec3 col = texture2D(tColor, uv).rgb;
  if (uDof > 0.5 && uAperture > 0.001) {
    float z = linDepth(uv);
    float r = coc(z);
    if (r > 0.4) {
      vec3 acc = col; float wsum = 1.0;
      for (int i = 0; i < 16; i++) {
        vec2 o = P[i] * r / uRes;
        vec2 suv = uv + o;
        float zs = linDepth(suv);
        // amostras do fundo não vazam sobre o primeiro plano em foco
        float w = zs < z - 0.5 ? clamp(coc(zs) / max(r, 0.001), 0.0, 1.0) : 1.0;
        acc += texture2D(tColor, suv).rgb * w; wsum += w;
      }
      col = acc / wsum;
    }
  }
  col = clamp(uFilter * col, 0.0, 1.0);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col = (col - 0.5) * uContrast + 0.5;
  vec2 q = uv - 0.5; q.x *= uRes.x / uRes.y;
  col *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(q) * 1.15);
  float n = fract(sin(dot(uv * uRes + uTime * 61.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += n * uGrain * 0.16;
  float bar = uBars * 0.12;
  if (uv.y < bar || uv.y > 1.0 - bar) col = vec3(0.0);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

export class PhotoMode {
  constructor(feat) {
    this.f = feat;
    this.ctx = feat.ctx;
    this.active = false;
    this.s = { exposure: 1, fov: 60, roll: 0, focus: 8, aperture: 0, filter: 'none', vignette: 0.35, grain: 0.15, bars: false, contrast: 1, sat: 1 };
    this.keys = new Set();
    this.btn = el('button', 'stk-btn interactive stk-hide', 'PHOTO MODE <span style="opacity:.6;font-weight:400">[H]</span>', feat.root);
    Object.assign(this.btn.style, { position: 'absolute', left: '28px', bottom: '28px', zIndex: 5 });
    this.btn.onclick = () => this.enter();
    this.onKeyDown = (e) => this.key(e, true);
    this.onKeyUp = (e) => this.key(e, false);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
  }

  key(e, down) {
    const ctx = this.ctx;
    if (!this.active) {
      if (down && e.code === 'KeyH' && ctx.services.hud?.screen === 'pause') {
        e.preventDefault();
        this.enter();
      }
      return;
    }
    // modo foto ativo: nada vaza para a HUD/jogo
    e.stopImmediatePropagation();
    if (!down) {
      this.keys.delete(e.code);
      return;
    }
    if (e.target?.tagName === 'INPUT' && e.code !== 'Escape') return;
    e.preventDefault();
    this.keys.add(e.code);
    if (e.code === 'Escape') this.exit();
    else if (e.code === 'KeyH') this.panel.classList.toggle('stk-hide');
    else if (e.code === 'KeyP' || e.code === 'Enter') this.capture();
  }

  enter() {
    const ctx = this.ctx;
    if (this.active) return;
    this.active = true;
    const cam = ctx.camera;
    this.saved = { scale: ctx.time.scale, vm: ctx.vm.visible, exposure: ctx.services.rendering?.exposure ?? 1, inputEnabled: ctx.input.enabled, hudVis: ctx.services.hud?.root?.style.visibility ?? '' };
    ctx.time.scale = 0;
    ctx.input.enabled = false;
    ctx.vm.visible = false;
    if (ctx.services.hud?.root) ctx.services.hud.root.style.visibility = 'hidden';
    this.pos = cam.position.clone();
    this.yaw = ctx.player.yaw;
    this.pitch = ctx.player.pitch;
    this.s.exposure = this.saved.exposure;
    this.s.fov = Math.round(cam.fov);
    this.origin = ctx.player.position.clone();
    this.buildPanel();
    this.btn.classList.add('stk-hide');
    this.last = performance.now();
    this.depthDirty = true;
    ctx.bus.emit('photo:enter', {});
  }

  exit() {
    const ctx = this.ctx;
    if (!this.active) return;
    this.active = false;
    ctx.time.scale = this.saved.scale;
    ctx.input.enabled = this.saved.inputEnabled;
    ctx.vm.visible = this.saved.vm;
    ctx.services.rendering?.setExposure?.(this.saved.exposure);
    if (ctx.services.hud?.root) ctx.services.hud.root.style.visibility = this.saved.hudVis;
    this.panel?.remove();
    this.capturePad?.remove();
    this.keys.clear();
    ctx.bus.emit('photo:exit', {});
  }

  buildPanel() {
    const root = this.f.root;
    // área de arrasto (gira a câmera) — abaixo do painel
    const pad = el('div', 'interactive', null, root);
    Object.assign(pad.style, { position: 'absolute', inset: '0', cursor: 'grab' });
    let drag = null;
    pad.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
      pad.setPointerCapture(e.pointerId);
      pad.style.cursor = 'grabbing';
    });
    pad.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.yaw -= (e.clientX - drag.x) * 0.0035;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - (e.clientY - drag.y) * 0.0035));
      drag = { x: e.clientX, y: e.clientY };
      this.depthDirty = true;
    });
    pad.addEventListener('pointerup', () => {
      drag = null;
      pad.style.cursor = 'grab';
    });
    pad.addEventListener('wheel', (e) => {
      this.s.fov = Math.max(15, Math.min(100, this.s.fov + Math.sign(e.deltaY) * 2));
      this.sync();
      e.preventDefault();
    }, { passive: false });
    this.capturePad = pad;
    const p = el('div', 'interactive', null, root);
    Object.assign(p.style, { position: 'absolute', right: '22px', top: '50%', transform: 'translateY(-50%)', width: '270px', padding: '16px 18px', background: 'rgba(9,11,13,.78)', borderLeft: '2px solid #e2b45a', fontSize: '11px', textTransform: 'uppercase', display: 'flex', flexDirection: 'column', gap: '9px', backdropFilter: 'blur(6px)' });
    const row = (label, key, min, max, step, fmt = (v) => v.toFixed(2)) =>
      `<label style="display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center"><span>${label}</span><span class="mono" data-v="${key}">${fmt(this.s[key])}</span><input data-k="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${this.s[key]}" style="grid-column:1/3;accent-color:#e2b45a;width:100%"></label>`;
    p.innerHTML = `
      <div style="display:flex;align-items:baseline;justify-content:space-between"><div style="font-size:17px;font-weight:700;letter-spacing:.24em">PHOTO MODE</div><div class="mono" style="opacity:.55">H HIDE</div></div>
      <div style="height:1px;background:rgba(242,244,239,.15)"></div>
      ${row('Exposure', 'exposure', 0.2, 3, 0.01)}
      ${row('Field of view', 'fov', 15, 100, 1, (v) => v.toFixed(0) + '°')}
      ${row('Roll', 'roll', -30, 30, 1, (v) => v.toFixed(0) + '°')}
      <div style="height:1px;background:rgba(242,244,239,.08)"></div>
      ${row('Focus distance', 'focus', 0.5, 60, 0.1, (v) => v.toFixed(1) + ' m')}
      ${row('Aperture (DOF)', 'aperture', 0, 1, 0.01)}
      <div style="height:1px;background:rgba(242,244,239,.08)"></div>
      <label style="display:grid;grid-template-columns:1fr;gap:4px"><span>Filter</span><select data-k="filter" style="background:#14171a;color:#f2f4ef;border:1px solid rgba(242,244,239,.2);padding:4px;font:inherit">${Object.keys(FILTERS).map((k) => `<option value="${k}" ${k === this.s.filter ? 'selected' : ''}>${FILTER_NAMES[k]}</option>`).join('')}</select></label>
      ${row('Contrast', 'contrast', 0.6, 1.6, 0.01)}
      ${row('Saturation', 'sat', 0, 1.8, 0.01)}
      ${row('Vignette', 'vignette', 0, 1, 0.01)}
      ${row('Film grain', 'grain', 0, 1, 0.01)}
      <label style="display:flex;gap:8px;align-items:center"><input data-k="bars" type="checkbox" ${this.s.bars ? 'checked' : ''} style="accent-color:#e2b45a"> Letterbox</label>
      <div style="display:flex;gap:8px;margin-top:4px"><button class="stk-btn" data-a="shot" style="flex:1">CAPTURE</button><button class="stk-btn" data-a="exit" style="background:transparent;color:#f2f4ef;border:1px solid rgba(242,244,239,.3)">EXIT</button></div>
      <div class="mono" style="font-size:9px;opacity:.55;line-height:1.6;text-transform:none">drag: look · WASD: move · Q/E: down/up · shift: fast · wheel: FOV · P/Enter: capture · Esc: exit</div>`;
    p.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (!k) return;
      this.s[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.tagName === 'SELECT' ? e.target.value : Number(e.target.value);
      this.sync();
    });
    p.addEventListener('click', (e) => {
      const a = e.target.dataset?.a;
      if (a === 'shot') this.capture();
      else if (a === 'exit') this.exit();
    });
    this.panel = p;
    this.sync();
  }

  sync() {
    const s = this.s;
    this.ctx.services.rendering?.setExposure?.(s.exposure);
    if (!this.panel) return;
    for (const v of this.panel.querySelectorAll('[data-v]')) {
      const k = v.dataset.v;
      v.textContent = k === 'fov' || k === 'roll' ? s[k].toFixed(0) + '°' : k === 'focus' ? s[k].toFixed(1) + ' m' : s[k].toFixed(2);
    }
    for (const i of this.panel.querySelectorAll('input[type=range]')) if (Number(i.value) !== s[i.dataset.k]) i.value = s[i.dataset.k];
    this.depthDirty = true;
  }

  /** Por frame: câmera livre + pós-processo na microtarefa seguinte ao render. */
  frame() {
    const ctx = this.ctx;
    // botão só na tela de pausa
    const paused = ctx.services.hud?.screen === 'pause' && !this.active && !ctx.shot;
    this.btn.classList.toggle('stk-hide', !paused);
    if (!this.active) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const k = this.keys;
    const sp = (k.has('ShiftLeft') || k.has('ShiftRight') ? 9 : 3) * dt;
    const f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const mv = new THREE.Vector3();
    if (k.has('KeyW') || k.has('ArrowUp')) mv.add(f);
    if (k.has('KeyS') || k.has('ArrowDown')) mv.sub(f);
    if (k.has('KeyD') || k.has('ArrowRight')) mv.add(r);
    if (k.has('KeyA') || k.has('ArrowLeft')) mv.sub(r);
    if (k.has('KeyE')) mv.y += 1;
    if (k.has('KeyQ')) mv.y -= 1;
    if (mv.lengthSq() > 0) {
      this.pos.addScaledVector(mv.normalize(), sp);
      // presa perto do jogador e acima do chão
      const off = this.pos.clone().sub(this.origin);
      if (off.length() > 30) this.pos.copy(this.origin).addScaledVector(off.normalize(), 30);
      const gy = ctx.collision.groundHeight?.(this.pos.x, this.pos.z, this.pos.y + 0.5);
      if (Number.isFinite(gy) && this.pos.y < gy + 0.2) this.pos.y = gy + 0.2;
      this.depthDirty = true;
    }
    const cam = ctx.camera;
    cam.position.copy(this.pos);
    cam.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, (this.s.roll * Math.PI) / 180, 'YXZ'));
    if (Math.abs(cam.fov - this.s.fov) > 1e-3) {
      cam.fov = this.s.fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    queueMicrotask(() => this.post());
  }

  post() {
    if (!this.active) return;
    const ctx = this.ctx;
    const r = ctx.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const W = size.x, H = size.y;
    if (!this.fbTex || this.fbTex.image.width !== W || this.fbTex.image.height !== H) {
      this.fbTex?.dispose();
      this.fbTex = new THREE.FramebufferTexture(W, H);
      this.depthRT?.dispose();
      this.depthRT = new THREE.WebGLRenderTarget(Math.max(1, W >> 1), Math.max(1, H >> 1));
      this.depthDirty = true;
    }
    const prevRT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const cam = ctx.camera;
    try {
      r.setRenderTarget(null);
      r.copyFramebufferToTexture(this.fbTex);
      const useDof = this.s.aperture > 0.001;
      if (useDof && this.depthDirty) {
        this.depthDirty = false;
        this.depthMat ||= new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
        const ov = ctx.scene.overrideMaterial;
        ctx.scene.overrideMaterial = this.depthMat;
        r.setRenderTarget(this.depthRT);
        r.autoClear = true;
        r.setClearColor(0xffffff, 1);
        r.clear();
        r.render(ctx.scene, cam);
        ctx.scene.overrideMaterial = ov;
      }
      if (!this.quad) {
        this.mat = new THREE.ShaderMaterial({
          vertexShader: VERT,
          fragmentShader: FRAG,
          uniforms: {
            tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 },
            uFocus: { value: 8 }, uAperture: { value: 0 }, uVignette: { value: 0 }, uGrain: { value: 0 }, uBars: { value: 0 }, uTime: { value: 0 },
            uContrast: { value: 1 }, uSat: { value: 1 }, uDof: { value: 0 }, uFilter: { value: new THREE.Matrix3() },
          },
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
        this.quad.frustumCulled = false;
        this.qScene = new THREE.Scene();
        this.qScene.add(this.quad);
        this.qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      }
      const u = this.mat.uniforms;
      u.tColor.value = this.fbTex;
      u.tDepth.value = this.depthRT.texture;
      u.uRes.value.set(W, H);
      u.uNear.value = cam.near;
      u.uFar.value = cam.far;
      u.uFocus.value = this.s.focus;
      u.uAperture.value = this.s.aperture;
      u.uDof.value = useDof ? 1 : 0;
      u.uVignette.value = this.s.vignette;
      u.uGrain.value = this.s.grain;
      u.uBars.value = this.s.bars ? 1 : 0;
      u.uTime.value = (performance.now() * 0.001) % 100;
      u.uContrast.value = this.s.contrast;
      u.uSat.value = this.s.sat;
      const F = FILTERS[this.s.filter] || FILTERS.none;
      u.uFilter.value.set(...F);
      r.setRenderTarget(null);
      r.autoClear = false;
      r.render(this.qScene, this.qCam);
      if (this.wantShot) {
        this.wantShot = false;
        const url = ctx.canvas.toDataURL('image/png');
        const a = document.createElement('a');
        const d = new Date();
        a.download = `ironline-photo-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}.png`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        this.lastShot = url;
        this.ctx.bus.emit('photo:capture', { name: a.download });
      }
    } catch (err) {
      console.warn('[streaks] pós-processo do modo foto falhou', err);
    } finally {
      r.setRenderTarget(prevRT);
      r.autoClear = prevAuto;
    }
  }

  capture() {
    if (!this.active) return;
    this.wantShot = true;
    this.f.sfx.shutter();
    // flash branco curto
    const fl = el('div', null, null, this.f.root);
    Object.assign(fl.style, { position: 'absolute', inset: '0', background: '#fff', opacity: '0.7', transition: 'opacity .35s' });
    requestAnimationFrame(() => (fl.style.opacity = '0'));
    setTimeout(() => fl.remove(), 400);
  }
}
