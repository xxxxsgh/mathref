// Luz do sol compartilhada. Uma DirectionalLight cuja direção vem da estrela
// do sistema atual relativa à câmera (origem flutuante: a câmera está em 0,
// então a luz fica em `dir` e o alvo na origem). Sombras em cascata
// (CSMShadowNode) com alcance ajustado ao contexto: cabine/estação/pé usam
// alcance curto e denso; superfície em voo baixo usa alcance maior; espaço
// aberto encolhe para quase nada (sombras só na cabine).
//
// Eclipse analítico: se um corpo celeste está entre a câmera e a estrela, a luz
// é atenuada pela sobreposição dos discos angulares (com penumbra alargada pela
// atmosfera) e avermelhada perto do terminador — assim a nave pousada no lado
// noturno não é iluminada "através" do planeta.
import * as THREE from 'three/webgpu';
import { uniform, Fn, vec4, mix, smoothstep, positionView, select } from 'three/tsl';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const SHADOW_MARGIN = 60000;

export class Sun {
  constructor(ctx, fx) {
    this.ctx = ctx;
    this.fx = fx;
    this.direction = new THREE.Vector3(0.4, 0.5, -0.75).normalize(); // câmera → estrela (unitário)
    this.color = new THREE.Color(1, 0.95, 0.88);
    this.baseIntensity = 4.2;
    this.intensity = 4.2;
    this.visibility = 1;          // 0 = eclipsado, 1 = pleno
    this.angularRadius = 0.01;    // rad
    this.override = null;         // {dir, color, intensity} (cinemáticas/shots)
    this.shadowRange = 'auto';    // 'auto' | número (m)
    this.uniforms = {
      dir: uniform(this.direction.clone()),
      color: uniform(new THREE.Color(1, 0.95, 0.88)),
      intensity: uniform(4.2),
      visibility: uniform(1),
      angularRadius: uniform(0.01),
    };

    const light = new THREE.DirectionalLight(0xffffff, this.intensity);
    light.name = 'sol';
    light.position.copy(this.direction);
    light.target.position.set(0, 0, 0);
    ctx.scene.add(light, light.target);
    this.light = light;

    // estrela companheira (binárias): segunda luz sem sombra
    this.companion = new THREE.DirectionalLight(0xff8040, 0);
    this.companion.name = 'sol-companheira';
    ctx.scene.add(this.companion, this.companion.target);
    this.companionDir = new THREE.Vector3();

    this.csm = null;
    this.setupShadows();
  }

  setupShadows() {
    const { fx, light } = this;
    light.castShadow = fx.shadows;
    if (!fx.shadows) return;
    light.shadow.mapSize.set(fx.shadowMapSize, fx.shadowMapSize);
    // bias em profundidade NORMALIZADA: com a câmera de sombra cobrindo
    // ~130 km (margem abaixo), -1e-6 ≈ 13 cm. O antigo -2e-4 virava 26 m e
    // apagava toda sombra de perto.
    light.shadow.bias = Number(this.ctx.params.get('sbias') ?? -1e-6);
    light.shadow.normalBias = 0.02;
    // A câmera de cada cascata fica `lightMargin` metros na direção do sol.
    // Receptores ENTRE ela e o sol (z < 0 no espaço da sombra) saíam pretos
    // (com o buffer logarítmico o teste de profundidade vira NaN) — típico de
    // olhar contra o sol no espaço. Margem enorme: tudo relevante fica atrás
    // da câmera de sombra. Precisão OK porque a profundidade é logarítmica.
    light.shadow.camera.near = 1;
    light.shadow.camera.far = SHADOW_MARGIN * 2.2;
    try {
      this.csm = new CSMShadowNode(light, { cascades: fx.shadowCascades, maxFar: 220, mode: 'practical', lightMargin: SHADOW_MARGIN });
      this.csm.fade = this.ctx.params.get('csmfade') === '1';
      // Fora do alcance das cascatas o CSM do three devolve lixo (NaN → preto;
      // medido nos screenshots: asteroides a 600 m pretos com alcance de 90 m).
      // Envelopa com `select` (não `mix`, que propagaria o NaN): além de maxFar
      // a luz passa inteira, com transição suave na borda.
      this.shadowFar = uniform(220);
      const csm = this.csm, far = this.shadowFar;
      light.shadow.shadowNode = Fn(() => {
        const d = positionView.z.negate();
        const inside = smoothstep(far, far.mul(0.85), d);
        if (this.ctx.params.get('csmdbg') === '6') return select(inside.greaterThan(2), vec4(csm), vec4(1));
        return select(inside.greaterThan(0.001), mix(vec4(1), vec4(csm), inside), vec4(1));
      })();
    } catch (e) {
      console.warn('[rendering] CSM indisponível, sombra simples', e);
      this.csm = null;
      const s = light.shadow.camera;
      s.left = s.bottom = -60; s.right = s.top = 60;
    }
    this._maxFar = 220;
  }

  /** Alcance das cascatas conforme o contexto do jogador. */
  autoShadowRange() {
    const ctx = this.ctx, p = ctx.player;
    if (typeof this.shadowRange === 'number') return this.shadowRange;
    if (p.mode === 'foot') return 160;
    const alt = Number.isFinite(p.altitude) ? p.altitude : Infinity;
    if (p.mode === 'ship' || p.mode === 'cinematic') {
      if (alt < 600) return 420;
      if (alt < 4000) return 900;
      return 90; // espaço: só a cabine e a própria nave
    }
    return 220;
  }

  update(ctx, dt) {
    const sys = ctx.universe.system;
    const star = sys?.star;
    const cam = ctx.player.camWorld;
    let lum = 1;
    if (this.override?.dir) {
      this.direction.copy(this.override.dir).normalize();
    } else if (star) {
      _v.copy(star.pos).sub(cam);
      const d = _v.length();
      if (d > 1) this.direction.copy(_v).divideScalar(d);
      this.angularRadius = Math.asin(Math.min(1, star.radius / Math.max(d, star.radius * 1.0001)));
    }
    if (star) {
      lum = star.luminosity ?? 1;
      if (!this.override?.color) this.color.setRGB(star.color[0], star.color[1], star.color[2]);
    }
    if (this.override?.color) this.color.copy(this.override.color);
    const base = this.override?.intensity ?? this.baseIntensity * (star?.type === 'black_hole' ? 0.6 : 1) * Math.min(1.6, 0.55 + lum * 0.45);

    // ── eclipse por corpos ──
    let vis = 1, redden = 0;
    if (sys && !this.override?.dir) {
      for (const b of sys.bodies) {
        _w.copy(b.pos).sub(cam);
        const db = _w.length();
        if (db < 1) continue;
        const dirDot = _w.dot(this.direction) / db;
        if (dirDot <= 0 && db > b.radius * 1.5) continue;
        const ab = Math.asin(Math.min(1, b.radius / Math.max(db, b.radius)));
        const theta = Math.acos(Math.max(-1, Math.min(1, dirDot)));
        // penumbra: disco solar + espessura angular da atmosfera vista daqui
        const atmo = b.atmosphere ? Math.max(0.035, Math.atan2(b.atmosphere.height * 0.35, Math.max(1, db - b.radius))) : 0;
        const pen = this.angularRadius + Math.min(0.12, atmo) + 0.004;
        const t = (theta - (ab - pen)) / (2 * pen);
        const v = Math.max(0, Math.min(1, t));
        const s = v * v * (3 - 2 * v);
        if (s < vis) { vis = s; redden = b.atmosphere ? 1 - s : 0; }
      }
    }
    // suaviza para não estalar ao cruzar o terminador
    const k = 1 - Math.exp(-dt * 6);
    this.visibility += (vis - this.visibility) * (Number.isFinite(k) ? k : 1);
    const vv = this.visibility;
    if (redden > 0 && vv < 0.999) {
      const r = Math.min(1, redden) * (1 - vv) * 1.2;
      this.color.r *= 1; this.color.g *= 1 - 0.45 * Math.min(1, r); this.color.b *= 1 - 0.75 * Math.min(1, r);
    }
    this.intensity = base * vv;

    const L = this.light;
    L.position.copy(this.direction);
    L.color.copy(this.color);
    L.intensity = this.intensity;

    // companheira (binária)
    if (star?.companion && !this.override?.dir) {
      _v.copy(star.companion.pos).sub(cam);
      this.companionDir.copy(_v).normalize();
      this.companion.position.copy(this.companionDir);
      this.companion.color.setRGB(...star.companion.color);
      this.companion.intensity = this.baseIntensity * 0.35 * vv;
    } else this.companion.intensity = 0;

    // cascatas
    if (this.csm) {
      const r = this.autoShadowRange();
      if (Math.abs(r - this._maxFar) > 1) {
        this._maxFar = r;
        this.csm.maxFar = r;
        if (this.shadowFar) this.shadowFar.value = r;
        if (this.csm.camera) { try { this.csm.updateFrustums(); } catch {} }
      }
    }

    const u = this.uniforms;
    u.dir.value.copy(this.direction);
    u.color.value.copy(this.color);
    u.intensity.value = this.intensity;
    u.visibility.value = vv;
    u.angularRadius.value = this.angularRadius;
  }

  onResize() { if (this.csm?.camera) { try { this.csm.updateFrustums(); } catch {} } }

  /** API pública (services.rendering.sun). */
  api() {
    const self = this;
    return {
      get light() { return self.light; },
      get direction() { return self.direction; },
      get color() { return self.color; },
      get intensity() { return self.intensity; },
      get visibility() { return self.visibility; },
      get angularRadius() { return self.angularRadius; },
      uniforms: self.uniforms,
      /** Força direção/cor/intensidade (cinemáticas). null volta ao automático. */
      setOverride(o) { self.override = o ? { ...o, dir: o.dir ? o.dir.clone() : null } : null; },
      /** 'auto' ou alcance fixo (m) das sombras em cascata. */
      setShadowRange(r) { self.shadowRange = r; },
      setBaseIntensity(v) { self.baseIntensity = v; },
    };
  }
}
