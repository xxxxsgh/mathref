// Tela de título: cena REAL no motor (sem imagens estáticas). Sem save, a
// câmera orbita o caça Lança A-7 do Rafael na órbita de Aurora, com a frota
// da Hegemonia ao fundo — o mesmo lugar onde o "Novo Jogo" começa, sem corte
// nem carregamento. Com save, orbita a nave do jogador onde ele parou.
import * as THREE from 'three/webgpu';
import { custom } from './cinema.js';
import { haldenFrame } from './opening.js';
import { driftMotion, formationMotion, lookQuat } from './stage.js';
import { PRESETS, PRESET_ORDER } from '../../core/Quality.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const D2R = Math.PI / 180;

export class Title {
  constructor(S) {
    this.S = S; this.ctx = S.ctx;
    this.active = false;
    this.hero = null;
    this.mode = 'halden';
    this.hasSave = false;
  }

  P(k, d) { const v = this.ctx.params.get(k); return v === null ? d : Number(v); }

  /** Monta a cena de fundo do título. */
  build() {
    const S = this.S, ctx = this.ctx;
    S.stage.clear();
    const restored = ctx.player.ship && S.state.started;
    if (restored) { this.mode = 'save'; this.hero = () => S.playerPose(); return; }
    this.mode = 'halden';
    if (ctx.universe.systemId !== 'halden') ctx.universe.setSystem('halden');
    const fr = haldenFrame(ctx, { alpha: this.P('talpha', 30), py: this.P('tpy', 22), pp: this.P('tpp', -17) });
    this.fr = fr;
    // o caça do Rafael (a nave do jogo, parada em órbita) — reserva: ator do palco
    const flight = ctx.services.flight;
    let heroActor = null;
    if (flight?.spawnPlayerShip) {
      S.spawnPlayer(fr.C, fr.q, { vel: V(0, 0, 0), throttle: 0, enter: false, faction: 'hegemonia' });
      this.hero = () => S.playerPose();
    } else {
      heroActor = S.stage.add({ classId: 'fighter', faction: 'hegemonia', pos: fr.C, quat: fr.q, throttle: 0.3 });
      this.hero = () => heroActor;
    }
    // ala parada em formação, porta-caças e destróier ao fundo
    const lead = this.hero;
    S.stage.add({ classId: 'fighter', faction: 'hegemonia', seed: 6, throttle: 0.35, motion: formationMotion(lead, V(-22, -5, 30), { sway: 0.8, swayW: 0.3 }) });
    S.stage.add({ classId: 'interceptor', faction: 'hegemonia', seed: 9, throttle: 0.35, motion: formationMotion(lead, V(34, 6, 64), { sway: 1.2, swayW: 0.25 }) });
    const { at, F, R, U } = fr;
    const cd = F.clone().addScaledVector(R, 0.62).addScaledVector(U, 0.04).normalize();
    S.stage.add({ classId: 'carrier', faction: 'hegemonia', name: 'Soberano', pos: at(this.P('cf', 1700), this.P('cr', -1300), this.P('cu', -380)), quat: lookQuat(cd, U), throttle: 0.4, shadows: true, motion: driftMotion(cd.clone().multiplyScalar(3)) });
    const dd = F.clone().addScaledVector(R, -0.3).normalize();
    S.stage.add({ classId: 'destroyer', faction: 'hegemonia', name: 'Inflexível', pos: at(this.P('df', 2900), this.P('dr', 1100), this.P('du', 420)), quat: lookQuat(dd, U), throttle: 0.5, motion: driftMotion(dd.clone().multiplyScalar(4)) });
  }

  /** Plano do título: órbita lenta, nave no terço direito (o logo ocupa a esquerda). */
  shot() {
    const S = this.S;
    const yaw0 = this.P('tyaw', -28) * D2R, rate = this.P('trate', 1.2) * D2R;
    const pitch = this.P('tpitch', 13) * D2R, dist = this.P('tdist', 30), fov = this.P('tfov', 34), shift = this.P('tshift', 0.16);
    const fr = this.fr;
    return custom(1e9, (u, t) => {
      const h = this.hero(); if (!h) return null;
      const U = fr ? fr.U : V(0, 1, 0).applyQuaternion(h.quat);
      const Fw = fr ? fr.F : V(0, 0, -1).applyQuaternion(h.quat);
      const Rt = new THREE.Vector3().crossVectors(Fw, U).normalize();
      const yw = yaw0 + rate * t;
      // offset em torno da nave no referencial da frota (z = trás)
      const off = new THREE.Vector3().addScaledVector(Rt, Math.sin(yw) * Math.cos(pitch) * dist).addScaledVector(U, Math.sin(pitch) * dist).addScaledVector(Fw, -Math.cos(yw) * Math.cos(pitch) * dist);
      const pos = h.pos.clone().add(off);
      const toShip = h.pos.clone().sub(pos).normalize();
      const right = new THREE.Vector3().crossVectors(toShip, U).normalize();
      const look = h.pos.clone().addScaledVector(right, -dist * shift).addScaledVector(U, dist * this.P('tlift', 0.02));
      return { pos, look, up: U, fov, focus: h.pos.clone(), bokeh: 1.2, roll: this.P('troll', 0) * D2R };
    }, { hold: true, ease: (x) => x, handheld: 0.0012, dof: this.P('tdof', 0) > 0 });
  }

  async enter() {
    const S = this.S, ctx = this.ctx, ui = S.ui;
    this.active = true;
    ctx.game.setMode('title');
    this.build();
    S.dir.play(this.shot());
    S.music('cinematic', 0.35);
    ui.letterbox(0, true);
    ui.fade(1, 0);
    ui.fade(0, 2.6);
    this.hasSave = await S.hasSave();
    if (!this.active) return;
    this.menu();
  }

  menu() {
    const S = this.S, ui = S.ui;
    const loc = this.mode === 'save' && S.state.started ? S.locationLabel() : 'HALDEN · ÓRBITA DE AURORA';
    ui.showTitle([
      { label: 'Continuar', small: this.hasSave ? S.saveLabel() : '', disabled: !this.hasSave, action: () => S.continueGame() },
      { label: 'Novo jogo', action: () => this.confirmNew() },
      { label: 'Configurações', action: () => this.options() },
    ], { location: loc });
    // com save, "Continuar" vem selecionado; sem save, "Novo jogo"
    ui.selectMenu(this.hasSave ? 0 : 1);
  }

  confirmNew() {
    const S = this.S;
    if (!this.hasSave) { S.newGame(); return; }
    S.ui.showTitle([
      { label: 'Começar do zero', small: 'o progresso salvo será apagado', action: () => S.newGame() },
      { label: 'Voltar', action: () => this.menu() },
    ], { location: 'NOVO JOGO' });
  }

  options() {
    const S = this.S, ctx = this.ctx, ui = S.ui;
    const prefs = ctx.prefs || (ctx.prefs = {});
    const rows = [
      {
        label: 'Qualidade gráfica', value: () => PRESETS[ctx.quality.name]?.label || ctx.quality.name,
        next: () => { const i = PRESET_ORDER.indexOf(ctx.quality.name); S.setQuality(PRESET_ORDER[(i + 1) % PRESET_ORDER.length]); },
      },
      {
        label: 'Sensibilidade', value: () => `${Math.round((prefs.sensitivity ?? 1) * 100)}%`,
        next: () => { const v = ((prefs.sensitivity ?? 1) * 100 + 25); prefs.sensitivity = (v > 200 ? 50 : v) / 100; S.applyPrefs(); },
      },
      {
        label: 'Inverter eixo Y', value: () => (prefs.invertY ? 'Sim' : 'Não'),
        next: () => { prefs.invertY = !prefs.invertY; S.applyPrefs(); },
      },
      {
        label: 'Volume', value: () => `${Math.round((prefs.volume ?? 0.8) * 100)}%`,
        next: () => { let v = Math.round((prefs.volume ?? 0.8) * 10) + 1; if (v > 10) v = 0; prefs.volume = v / 10; S.applyPrefs(); },
      },
      {
        label: 'Legendas', value: () => (prefs.subtitles === false ? 'Não' : 'Sim'),
        next: () => { prefs.subtitles = prefs.subtitles === false; S.applyPrefs(); },
      },
      { label: 'Voltar', value: () => '', next: () => { ui.hideOptions(); this.menu(); } },
    ];
    ui.showOptions(rows, () => { ui.hideOptions(); this.menu(); });
  }

  exit() {
    this.active = false;
    this.S.ui.hideTitle();
    this.S.ui.hideOptions();
  }
}
