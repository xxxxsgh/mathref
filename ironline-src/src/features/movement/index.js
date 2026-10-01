/**
 * Feature `movement` — locomoção e câmera em primeira pessoa.
 *
 *   controller.js  física em passo fixo: aceleração com curva, sprint,
 *                  sprint tático (duplo toque), slide, agachar/deitar
 *                  (segurar agachar), dive, pulo com coyote/buffer,
 *                  mantle/vault, lean limitado por parede, dano de queda,
 *                  fase de passo → eventos `player:step`.
 *   camera.js      bob sincronizado com o passo, mergulho de aterrissagem
 *                  (mola), roll de strafe/slide/lean, flinch de dano,
 *                  tremor de explosão, kick de FOV.
 *   tuning.js      todos os números.
 *
 * Serviço `movement`: builtin=false, stance(), getters de estado e
 * shake(0..1). Em modo screenshot o controlador não roda (pose travada);
 * `?mv=sprint|tactical|slide|crouch|prone|leanL|leanR` sintetiza a pose de
 * câmera correspondente para as capturas.
 */
import { Controller } from './controller.js';
import { CameraMotion } from './camera.js';
import { T } from './tuning.js';

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
      /** Tremor de câmera externo (0..1). */
      shake: (a) => cam.shake(a),
      tuning: T,
    });

    // pose sintética para screenshots
    const mv = ctx.shot ? ctx.params.get('mv') : null;
    if (mv) {
      const demos = {
        sprint: { speed: T.sprint, sprint: 1, phase: 0.62 },
        tactical: { speed: T.tactical, sprint: 2, phase: 0.6 },
        slide: { speed: 8.5, slide: true, stance: 'slide' },
        crouch: { speed: 0, stance: 'crouch' },
        prone: { speed: 0, stance: 'prone' },
        leanL: { speed: 0, lean: -1 },
        leanR: { speed: 0, lean: 1 },
      };
      const d = demos[mv];
      if (d) {
        cam.demo = d;
        const st = d.stance || 'stand';
        this.demoEye = T.stance[st].eye;
        p.eyeHeight = this.demoEye;
        p.state.stance = st;
        p.state.sprinting = !!d.sprint;
      }
    }
  },
  update(dt, ctx) {
    if (this.demoEye !== undefined) ctx.player.eyeHeight = this.demoEye;
  },
  frame(dt, ctx) {
    this.cam.frame(dt, ctx);
  },
  dispose(ctx) {
    if (ctx.player.controller) ctx.player.controller = null;
    ctx.player.fovFactors.delete('move');
  },
};
