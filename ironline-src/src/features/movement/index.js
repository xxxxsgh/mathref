/**
 * Feature `movement` — locomoção, câmera e corpo em primeira pessoa.
 *
 *   controller.js  física em passo fixo: aceleração com curva, sprint,
 *                  sprint tático (duplo toque), slide, agachar/deitar
 *                  (segurar agachar), dive, pulo com coyote/buffer,
 *                  mantle/vault, lean limitado por parede, dano de queda,
 *                  fase de passo → eventos `player:step`.
 *   camera.js      bob sincronizado com o passo, mergulho de aterrissagem
 *                  (mola), roll de strafe/slide/lean, flinch de dano,
 *                  tremor de explosão, kick de FOV.
 *   body.js        pernas/botas/quadril do jogador na cena do mundo (IK de
 *                  2 ossos, marcha presa à fase de passo, pose de slide) +
 *                  sombra do tronco/cabeça (só no mapa de sombra).
 *   dust.js        poeira do slide, da aterrissagem e do sprint em terra.
 *   speedfx.js     borrão/escurecimento de borda em alta velocidade.
 *   tuning.js      todos os números.
 *
 * Serviço `movement`: builtin=false, stance(), getters de estado e
 * shake(0..1).
 *
 * Modo screenshot: o núcleo trava a pose. Com `?mv=<roteiro>` (e `&sim=`
 * suficiente) o controlador REAL roda com uma entrada virtual roteirizada
 * a partir da pose do preset, e o estado é congelado no instante da
 * captura — a imagem mostra o movimento de verdade (posição, olhos, FOV,
 * roll, corpo, poeira). Roteiros: sprint, tactical, slide, crouch, prone,
 * leanL, leanR, jump. `&mvpitch=` / `&mvyaw=` somam à pose do preset.
 */
import * as THREE from 'three';
import { Controller } from './controller.js';
import { CameraMotion } from './camera.js';
import { Body } from './body.js';
import { Dust } from './dust.js';
import { SpeedFx } from './speedfx.js';
import { T } from './tuning.js';

/** Entrada virtual (mesma interface que o controlador usa de ctx.input). */
class VirtualInput {
  constructor() {
    this.held = new Set();
    this.edge = new Set();
  }
  action(n) {
    return this.held.has(n);
  }
  pressed(n) {
    return this.edge.has(n);
  }
  released() {
    return false;
  }
  set(n, on) {
    if (on) {
      if (!this.held.has(n)) this.edge.add(n);
      this.held.add(n);
    } else this.held.delete(n);
  }
  endStep() {
    this.edge.clear();
  }
}

/**
 * Roteiros de captura: eventos [t, ação, on] e o instante da captura (s).
 * 'land' como captura = congela 0.05 s depois de tocar o chão.
 */
const tap = (t, a) => [[t, a, true], [t + 0.06, a, false]];
const SCRIPTS = {
  sprint: { ev: [[0, 'forward', true], ...tap(0.05, 'sprint')], capture: 1.5 },
  tactical: { ev: [[0, 'forward', true], ...tap(0.05, 'sprint'), ...tap(0.3, 'sprint')], capture: 1.35 },
  slide: { ev: [[0, 'forward', true], ...tap(0.05, 'sprint'), ...tap(0.3, 'sprint'), ...tap(1.05, 'crouch')], capture: 1.32, pitch: -0.2 },
  crouch: { ev: tap(0.05, 'crouch'), capture: 0.7 },
  prone: { ev: [[0.05, 'crouch', true], [0.9, 'crouch', false]], capture: 1.4 },
  leanL: { ev: [[0.05, 'leanLeft', true]], capture: 0.7 },
  leanR: { ev: [[0.05, 'leanRight', true]], capture: 0.7 },
  jump: { ev: [[0, 'forward', true], ...tap(0.05, 'sprint'), ...tap(0.5, 'jump')], capture: 'land' },
};

const _pos = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _cp = {};

export default {
  name: 'movement',
  order: 30,
  init(ctx) {
    const p = ctx.player;
    const ctrl = (this.ctrl = new Controller(ctx));
    const cam = (this.cam = new CameraMotion(ctx, ctrl));
    p.controller = { update: (dt, player, c) => ctrl.update(dt, player, c) };
    p.walkSpeed = T.walk;
    p.sprintSpeed = T.sprint;
    p.jumpSpeed = T.jump;
    p.gravity = T.gravity;
    Object.assign(p.state, { stance: 'stand', sliding: false, prone: false, mantling: false, lean: 0, tactical: false });

    const self = this;
    ctx.provide('movement', {
      builtin: false,
      stance: () => ctrl.stance,
      get sprinting() {
        return ctrl.sprint > 0;
      },
      get tactical() {
        return ctrl.sprint === 2;
      },
      get sliding() {
        return !!ctrl.slide;
      },
      get mantling() {
        return !!ctrl.mantle;
      },
      get lean() {
        return ctrl.lean;
      },
      get tacFuel() {
        return ctrl.tacFuel / T.tacFuel;
      },
      get stepPhase() {
        return ctrl.stepPhase;
      },
      get groundMaterial() {
        return ctrl.groundMaterial;
      },
      /** Intensidade atual do efeito de velocidade (0..1) — p/ HUD/rendering. */
      get speedFx() {
        return self._fx?.k ?? 0;
      },
      /** true quando um roteiro ?mv= dirige o controlador no modo shot (a
       *  arma pode honrar sprint/slide mesmo com preset de screenshot). */
      get scripted() {
        return !!self.script;
      },
      /** Tremor de câmera externo (0..1). */
      shake: (a) => cam.shake(a),
      tuning: T,
    });

    // roteiro de captura (?mv=)
    const mv = ctx.shot ? ctx.params.get('mv') : null;
    this.script = null;
    if (mv && SCRIPTS[mv]) {
      const s = SCRIPTS[mv];
      const vi = new VirtualInput();
      ctrl.input = vi;
      this.script = {
        def: s,
        vi,
        t: 0,
        i: 0,
        frozen: false,
        capture: typeof s.capture === 'number' ? s.capture : Infinity,
        pos: null,
        vel: new THREE.Vector3(),
        ground: true,
        pitch: (s.pitch || 0) + Number(ctx.params.get('mvpitch') || 0),
        yaw: Number(ctx.params.get('mvyaw') || 0),
      };
      if (s.capture === 'land') {
        ctx.bus.on('player:land', () => {
          if (this.script && this.script.capture === Infinity) this.script.capture = this.script.t + 0.05;
        });
      }
    }

    // corpo / poeira / borrão de velocidade (só visuais; falha não derruba a locomoção)
    const showBody = !ctx.shot || !!this.script;
    try {
      if (showBody) this.body = new Body(ctx, ctrl);
    } catch (err) {
      console.warn('[movement] corpo desligado', err);
    }
    try {
      this.dust = new Dust(ctx);
    } catch (err) {
      console.warn('[movement] poeira desligada', err);
    }
    try {
      this._fx = new SpeedFx(ctx);
    } catch (err) {
      console.warn('[movement] speedfx desligado', err);
    }
    this.fxTarget = 0;

    // poeira de aterrissagem
    ctx.bus.on('player:land', (e) => {
      if (!this.dust || e?.mantle) return;
      const s = Math.min(1, Math.max(0, ((e?.speed || 0) - 3) / 8));
      if (s > 0.05) this.dust.burst(p.position, s, e?.material);
    });
    ctx.bus.on('player:step', (e) => {
      if (!this.dust || !e?.sprint) return;
      if (e.material !== 'dirt' && e.material !== 'grass' && e.material !== 'asphalt') return;
      _pos.copy(p.position);
      _dir.set(p.velocity.x, 0, p.velocity.z).normalize();
      this.dust.spawn(_pos.addScaledVector(_dir, -0.2), _dir.multiplyScalar(-0.6).setY(0.25), { life: 0.8, size: 0.16, grow: 0.5, alpha: e.material === 'dirt' ? 0.16 : 0.07, material: e.material });
    });
  },

  update(dt, ctx) {
    const sc = this.script;
    if (!sc) return;
    const p = ctx.player;
    // o núcleo reaplicou a pose do preset: restaura o estado simulado
    if (!sc.pos) sc.pos = p.position.clone();
    p.position.copy(sc.pos);
    p.prevPosition.copy(sc.pos);
    p.velocity.copy(sc.vel);
    p.onGround = sc.ground;
    p.pitch += sc.pitch;
    p.yaw += sc.yaw;
    if (sc.frozen) return;
    // eventos do roteiro
    const ev = sc.def.ev;
    while (sc.i < ev.length && ev[sc.i][0] <= sc.t + 1e-6) {
      const [, a, on] = ev[sc.i++];
      sc.vi.set(a, on);
    }
    this.ctrl.update(dt, p, ctx);
    sc.vi.endStep();
    sc.t += dt;
    sc.pos.copy(p.position);
    sc.vel.copy(p.velocity);
    sc.ground = p.onGround;
    // o aquecimento do núcleo só roda passos (sem frames): integra os visuais
    // aqui, um "frame" por passo, para chegar à captura no estado certo
    this.visual(dt, ctx);
    if (sc.t >= sc.capture) sc.frozen = true;
  },

  frame(dt, ctx) {
    // roteiro: os visuais avançam no passo; aqui só reescreve os canais
    this.visual(this.script ? 0 : dt, ctx);
  },

  /** Câmera, corpo, poeira e borrão — `fdt` = 0 só reescreve o estado atual. */
  visual(fdt, ctx) {
    this.cam.frame(fdt, ctx);
    const p = ctx.player;
    const c = this.ctrl;
    const hs = Math.hypot(p.velocity.x, p.velocity.z);

    // corpo: pés interpolados como a câmera
    if (this.body) {
      _pos.lerpVectors(p.prevPosition, p.position, ctx.time.alpha ?? 1);
      // direção do movimento no espaço do corpo (para a marcha)
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      const mx = hs > 0.05 ? (p.velocity.x * cy - p.velocity.z * sy) / hs : 0;
      const mz = hs > 0.05 ? (p.velocity.x * sy + p.velocity.z * cy) / hs : -1;
      const phase = c.prevStepPhase + (c.stepPhase - c.prevStepPhase) * (ctx.time.alpha ?? 1);
      this.body.update(
        fdt,
        { stance: c.stance, sliding: !!c.slide, grounded: p.onGround, speed: hs, phase, mantle: !!c.mantle, moveX: mx, moveZ: mz, slideT: c.slide?.t || 0, eye: p.eyeHeight, lean: c.lean },
        _pos,
        p.yaw,
        p.alive !== false,
      );
      this.body.root.updateMatrixWorld(true);
      // poeira do slide saindo dos calcanhares
      if (this.dust && c.slide && fdt > 0) {
        const cp = this.body.contactPoints(_cp);
        _dir.set(p.velocity.x, 0, p.velocity.z).normalize();
        const s = c.slide.speed;
        const rate = 34 * Math.min(1, s / 6);
        for (const k of ['L', 'R']) {
          cp[k].y = p.position.y;
          this.dust.trail(fdt, cp[k], _dir, s, c.groundMaterial, rate * (k === 'L' ? 0.6 : 0.4));
        }
      }
    }
    if (this.dust) this.dust.update(fdt);

    // borrão de velocidade
    if (this._fx) {
      let k = 0;
      if (c.slide) k = 0.95 * Math.min(1, c.slide.speed / 7);
      else if (c.sprint === 2 && hs > 5) k = Math.min(1, (hs - 5) / 3);
      else if (c.sprint === 1 && hs > 5) k = 0.3 * Math.min(1, (hs - 5) / 1.5);
      else if (c.diving) k = 0.6;
      k *= 1 - (Number(ctx.services.weapon?.ads) || 0);
      this._fx.update(fdt, k);
    }
  },

  dispose(ctx) {
    if (ctx.player.controller) ctx.player.controller = null;
    ctx.player.fovFactors.delete('move');
    this.body?.dispose();
    this.dust?.dispose();
    this._fx?.dispose();
  },
};
