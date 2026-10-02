/**
 * Feature `hud` — HUD de jogo e frontend completo (menus, loadout,
 * configurações, pausa, placar, fim de partida) + regras da partida.
 *
 * Organização:
 *   font.js      fonte vetorial própria (SVG/Canvas)
 *   icons.js     ícones e silhuetas
 *   style.js     CSS (prancheta 1920×1080 escalada)
 *   play.js      HUD de combate
 *   compass.js   bússola       minimap.js   minimapa
 *   menus.js     telas         match.js     regras/estatísticas
 *   settings.js  configurações persistidas e aplicadas
 *
 * Parâmetros de URL extras (QA visual): `&ui=main|loadout|settings|pause|
 * scoreboard|end|death` abre uma tela; no modo shot com HUD, a partida é
 * pré-populada com estatísticas determinísticas para a captura mostrar um
 * HUD "em jogo" (feed, placar, sequência).
 */
import { CSS } from './style.js';
import { PlayHud } from './play.js';
import { Screens } from './menus.js';
import { Match, MODE } from './match.js';
import * as Settings from './settings.js';
import { Gunsmith, gunSilhouette } from './gunsmith.js';
import { Hero } from './hero.js';

export default {
  name: 'hud',
  order: 90,

  init(ctx) {
    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `<style>${CSS}</style><div class="fx"></div><div class="stage"></div>`;
    ctx.ui.appendChild(root);
    this.root = root;
    if (ctx.shot) root.classList.add('shot');
    this.ctx = ctx;
    this.stage = root.querySelector('.stage');
    this.settings = Settings.load();
    this.profile = Settings.loadProfile();
    if (ctx.shot) {
      // capturas determinísticas: ignoram o que estiver salvo no navegador
      this.settings = { ...Settings.DEFAULTS };
      this.profile = JSON.parse(JSON.stringify(Settings.PROFILE_DEFAULTS));
      this.profile.kills = 412; this.profile.headshots = 97; this.profile.matches = 38; this.profile.wins = 21;
    }
    this.play = new PlayHud(ctx, this.stage, root.querySelector('.fx'));
    const gun = ctx.services.weapon?.gun;
    this.gunIcon = gun ? gunSilhouette(ctx.THREE, gun, { h: 140 }) : null;
    this.play.setGunIcon(this.gunIcon);
    this.play.setProfile(this.profile, Settings.levelOf(this.profile.xp).level);
    this.screens = new Screens(this, this.stage);
    this.match = new Match(ctx, {
      feed: (e) => this.play.feed(e, this.profile.callsign),
      xp: (l, t) => this.play.xp(l, t),
      medal: (k, t, p) => this.play.medal(k, t, p),
      // (o som do hitmarker é da feature audio, que escuta weapon:hit)
      hit: (h) => this.play.hitmarker(h),
      damage: (e) => this.play.damage(e),
      death: (killer) => this.onDeath(killer),
      respawn: () => this.onRespawn(),
      end: (win) => this.onEnd(win),
    });
    this.showHud = true;
    this.inMatch = false;
    this.scoreHeld = false;

    // ── eventos ─────────────────────────────────────────────────────
    const on = (t, f) => ctx.bus.on(t, f);
    this._offs = [
      on('weapon:fire', () => {
        this.match.onFire();
        this.play.bloom = Math.min(16, this.play.bloom + 4.5);
      }),
      on('weapon:hit', (h) => this.match.onHit(h)),
      on('weapon:reload', (e) => (this.play.reloadDur = e?.duration || 2.2)),
      on('enemy:death', (e) => this.match.onEnemyDeath(e)),
      on('enemy:fire', (e) => {
        if (e?.origin) this.play.ping(e.origin);
        this.virtualHit(e);
      }),
      on('player:damage', (e) => this.match.onPlayerDamage(e)),
      on('player:death', (e) => this.match.onPlayerDeath(e)),
      on('input:lock', (locked) => this.onLock(locked)),
      on('resize', () => this.layout()),
    ];
    this._key = (ev) => this.onKey(ev, true);
    this._keyUp = (ev) => this.onKey(ev, false);
    addEventListener('keydown', this._key, true);
    addEventListener('keyup', this._keyUp, true);
    addEventListener('resize', (this._rs = () => this.layout()));
    this.layout();
    // remove a tela de carga do index.html quando o jogo começa
    const boot = document.getElementById('boot');
    if (boot) {
      if (ctx.shot) boot.remove();
      else ctx.bus.once?.('ready', () => { boot.style.opacity = 0; setTimeout(() => boot.remove(), 600); });
    }

    // ── estado inicial ──────────────────────────────────────────────
    const preset = ctx.shot?.preset;
    const uiParam = ctx.params.get('ui');
    if (ctx.shot) {
      this.showHud = !!preset.hud;
      if (preset.hud || uiParam) this.stageDemo(preset);
      if (preset.menu) this.screens.show('main');
      if (uiParam) this.screens.show(uiParam === 'death' ? null : uiParam);
      if (uiParam === 'death') this.play.death(true, 'KESTREL');
    } else {
      Settings.apply(ctx, this.settings);
      this.toMenu();
      if (uiParam) this.screens.show(uiParam);
    }

    ctx.provide('hud', {
      root,
      setMenu: (v) => (v ? this.toMenu() : this.screens.show(null)),
      setVisible: (v) => (this.showHud = v),
      open: (name) => this.screens.show(name),
      get screen() { return this.__s?.screens.cur ?? null; },
      match: this.match,
      settings: this.settings,
      get loadout() { return this.__s?.profile.loadout; },
      banner: (t, s) => this.play.banner(t, s),
      deploy: () => this.action('deploy'),
      __s: this,
    });
  },

  /** escala da prancheta para a janela */
  layout() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    const k = Math.min(w / 1920, h / 1080);
    // centraliza horizontalmente em telas mais largas; HUD ancora nas bordas
    this.stage.style.transform = `scale(${k})`;
    this.stage.style.width = w / k + 'px';
    this.stage.style.height = h / k + 'px';
    this.k = k;
    this.play.resize(k * Math.min(2, devicePixelRatio || 1));
  },

  /** chamado pelas telas ao abrir: prévia 3D da arma no loadout */
  onScreen(name, el) {
    this.gs?.dispose();
    this.gs = null;
    // menu principal: mundo desfocado/graduado ao fundo + operador nítido
    const canvas = this.ctx.canvas;
    if (canvas) canvas.style.filter = name === 'main' ? 'blur(5px) brightness(.62) saturate(.72) contrast(1.06)' : '';
    if (name !== 'main' && this.hero) { this.hero.dispose(); this.hero = null; }
    if (name === 'main') {
      const host = el.querySelector('.hero-host');
      if (host && !this.hero) {
        try {
          this.hero = new Hero(this.ctx, host, { w: 900, h: 1080, k: this.k * Math.min(2, devicePixelRatio || 1) });
          this.hero.render(1 / 60);
        } catch (err) {
          console.warn('[hud] operador do menu indisponível', err);
          this.hero = null;
        }
      } else if (host && this.hero) host.appendChild(this.hero.renderer.domElement);
    }
    if (name !== 'loadout') return;
    const gun = this.ctx.services.weapon?.gun;
    const host = el.querySelector('.gs-host');
    if (!gun || !host) return;
    try {
      this.gs = new Gunsmith(this.ctx.THREE, gun, host, { w: 1100, h: 400, k: this.k * Math.min(2, devicePixelRatio || 1) });
      host.parentElement.classList.add('gs-on');
      this.gs.render(0);
    } catch (err) {
      console.warn('[hud] prévia da arma indisponível', err);
      this.gs = null;
    }
  },

  // ─── fluxo ────────────────────────────────────────────────────────
  toMenu() {
    const ctx = this.ctx;
    this.inMatch = false;
    this.match.reset();
    this.screens.show('main');
    ctx.input.enabled = false;
    ctx.input.wantsLock = false;
    ctx.input.exitLock();
    ctx.time.scale = 0;
    ctx.player.lookEnabled = false;
    this.menuT = 0;
  },
  action(a) {
    const ctx = this.ctx;
    if (ctx.shot) return;
    if (a === 'deploy' || a === 'restart') {
      if (a === 'restart' || !this.inMatch) {
        this.match.start();
        this.inMatch = true;
        const sp = ctx.services.world?.spawnPoints?.[0];
        if (sp) ctx.player.setPose(sp);
        ctx.player.health = ctx.player.maxHealth;
        ctx.player.alive = true;
        this.play.banner(MODE.name, `ELIMINATE ${MODE.target} HOSTILES  ·  ${MODE.map}`);
        ctx.bus.emit('match:start', { mode: MODE });
      }
      this.resume();
    } else if (a === 'resume') this.resume();
    else if (a === 'quit') {
      this.recordProfile(false);
      this.toMenu();
    }
  },
  resume() {
    const ctx = this.ctx;
    this.screens.show(null);
    ctx.input.enabled = true;
    ctx.input.wantsLock = true;
    ctx.player.lookEnabled = true;
    ctx.time.scale = 1;
    ctx.input.requestLock();
  },
  onLock(locked) {
    const ctx = this.ctx;
    if (ctx.shot) return;
    if (!locked && this.inMatch && this.match.phase !== 'end' && !this.screens.cur) {
      this.screens.show('pause');
      ctx.time.scale = 0;
      ctx.input.enabled = false;
      ctx.input.wantsLock = false;
    }
  },
  onDeath(killer) {
    this.play.death(true, killer);
  },
  onRespawn() {
    this.play.death(false);
  },
  onEnd(win) {
    const ctx = this.ctx;
    this.recordProfile(win);
    if (ctx.shot) return this.screens.show('end');
    ctx.time.scale = 0;
    ctx.input.enabled = false;
    ctx.input.wantsLock = false;
    ctx.input.exitLock();
    this.play.death(false);
    this.screens.show('end');
  },
  recordProfile(win) {
    const m = this.match;
    if (this._recorded === m || !m.playTime) return;
    this._recorded = m;
    const P = this.profile;
    P.xp += m.xpEarned + (win ? 1500 : 300);
    m.xpEarned += win ? 1500 : 300;
    P.kills += m.kills;
    P.headshots += m.headshots;
    P.matches++;
    if (win) P.wins++;
    this.saveProfile();
  },
  saveProfile() {
    if (!this.ctx.shot) Settings.saveProfile(this.profile);
  },
  setOption(id, v) {
    this.settings[id] = v;
    if (this.ctx.shot) return;
    Settings.save(this.settings);
    Settings.apply(this.ctx, this.settings);
  },

  onKey(ev, down) {
    const ctx = this.ctx;
    if (ctx.shot) return;
    if (ev.code === 'Tab') ev.preventDefault();
    if (!down) {
      if (ev.code === 'Tab' && this.scoreHeld) {
        this.scoreHeld = false;
        if (this.screens.cur === 'scoreboard') this.screens.show(null);
      }
      return;
    }
    if (this.screens.cur && this.screens.cur !== 'scoreboard') {
      if (this.screens.key(ev.code)) ev.preventDefault();
      return;
    }
    if (ev.code === 'Tab' && this.inMatch && !ev.repeat) {
      this.scoreHeld = true;
      this.screens.show('scoreboard');
    }
  },

  /**
   * Modo shot: no preset de combate os inimigos não ferem o jogador (para
   * não mexer na câmera dos outros especialistas), mas o HUD precisa
   * mostrar o estado "sob fogo": convertemos alguns disparos em acertos
   * só visuais.
   */
  virtualHit(e) {
    const ctx = this.ctx;
    if (!ctx.shot?.preset?.combat || !e?.origin) return;
    this._vh = (this._vh || 0) + 1;
    if (this._vh % 3 !== 1) return;
    this.play.virtualHealth = Math.max(62, (this.play.virtualHealth ?? 100) - 9);
    this.play.damage({ from: e.origin, amount: 12 });
  },

  /** Pré-popula a partida (determinístico) para capturas do modo shot. */
  stageDemo(preset) {
    const m = this.match;
    m.phase = 'play';
    m.kills = 17; m.deaths = 4; m.headshots = 6; m.shots = 412; m.hits = 151; m.score = 2350;
    m.streak = 3; m.bestStreak = 7; m.longest = 46.2; m.damage = 3420; m.timeLeft = 372; m.playTime = 228; m.xpEarned = 2350;
    m.medals = { HEADSHOT: { kind: 'head', n: 6 }, 'DOUBLE KILL': { kind: 'double', n: 2 }, LONGSHOT: { kind: 'long', n: 1 }, BLOODTHIRSTY: { kind: 'streak', n: 1 } };
    const names = ['KESTREL', 'VOLKOV', 'RAZOR', 'NOMAD', 'HALVARD'];
    const st = [[2, 4, 1], [1, 4, 1], [1, 3, 0], [0, 3, 1], [0, 3, 1]];
    names.forEach((n, i) => m.hostile.set(n, { name: n, kills: st[i][0], deaths: st[i][1], score: st[i][0] * 100 + st[i][1] * 10, alive: !!st[i][2] }));
    m.nameIdx = 5;
    m.win = true;
    if (this.ctx.params.get('ui') === 'end') {
      // relatório de fim: partida concluída (alvo atingido)
      m.kills = 30; m.deaths = 6; m.headshots = 11; m.shots = 486; m.hits = 203; m.score = 4350; m.xpEarned = 4350;
      m.bestStreak = 9; m.longest = 46.2; m.damage = 4870; m.timeLeft = 131; m.playTime = 469;
      m.medals = { HEADSHOT: { kind: 'head', n: 11 }, 'DOUBLE KILL': { kind: 'double', n: 3 }, 'TRIPLE KILL': { kind: 'triple', n: 1 }, LONGSHOT: { kind: 'long', n: 2 }, BLOODTHIRSTY: { kind: 'streak', n: 1 } };
      const fin = [[2, 7], [1, 6], [2, 6], [0, 5], [1, 6]];
      names.forEach((n, i) => m.hostile.set(n, { name: n, kills: fin[i][0], deaths: fin[i][1], score: fin[i][0] * 100 + fin[i][1] * 25 + 150, alive: true }));
    }
    if (preset?.combat) {
      const cs = this.profile.callsign;
      this.play.feed({ killer: 'self', victim: 'NOMAD', head: false, weapon: 'frag' }, cs);
      this.play.feed({ killer: 'RAZOR', victim: 'self', head: false, weapon: 'hostile' }, cs);
      this.play.feed({ killer: 'self', victim: 'KESTREL', head: true, weapon: 'rifle' }, cs);
      // idades diferentes: as linhas antigas já esmaeceram um pouco
      const ages = [0.7, 3.9, 5.3];
      [...this.play.el.feed.children].forEach((r, i) => { r.style.animation = 'none'; r._t = ages[i] ?? 5; });
      this.play.xp([['KILL', 100], ['HEADSHOT', 50]], 150);
      this.play.hitmarker({ head: true, kill: true });
      this.play.medal('head', 'HEADSHOT', 150);
      const mm = this.play.el.medal.firstChild;
      if (mm) mm.style.animation = 'none';
      for (const el of this.play.el.xp.querySelectorAll('.tot,.row')) el.style.animation = 'none';
      // estado congelado (independe de quantos frames o shot.mjs renderiza):
      // abate recém-confirmado, toast e medalha no meio da vida
      this.play.hitPin = true;
      this.play.hitT = 0.05;
      this.play.xpT = 0.5;
      this.play.medalT = 0.9;
    }
  },

  // ─── loop ─────────────────────────────────────────────────────────
  update(dt, ctx) {
    if (!ctx.shot) this.match.update(dt);
    // ADS: multiplicador de sensibilidade
    if (!ctx.shot && this.inMatch) {
      const ads = ctx.services.weapon?.ads ?? 0;
      ctx.input.sensitivity = Settings.baseSensitivity(this.settings) * (1 + (this.settings.adsSens - 1) * ads);
    }
  },

  frame(dt, ctx) {
    // tempo real (as telas animam mesmo com a simulação pausada)
    const now = performance.now();
    const rdt = ctx.shot ? 1 / 60 : Math.min(0.05, (now - (this._lt || now)) / 1000);
    this._lt = now;
    const scr = this.screens.cur;
    const menuish = scr && scr !== 'scoreboard' && scr !== 'pause';
    const showPlay = this.showHud && !menuish && (this.inMatch || ctx.shot);
    if (this._showPlay !== showPlay) {
      this._showPlay = showPlay;
      this.play.root.style.display = showPlay ? '' : 'none';
      this.play.fx.style.display = showPlay ? '' : 'none';
    }
    // câmera cinematográfica do menu (fora do modo shot)
    if (!ctx.shot && !this.inMatch && scr) {
      this.menuT = (this.menuT || 0) + rdt;
      const pose = ctx.shotPose('menu');
      if (pose) {
        ctx.player.setPose({
          position: pose.position,
          yaw: pose.yaw + Math.sin(this.menuT * 0.07) * 0.09,
          pitch: pose.pitch + Math.sin(this.menuT * 0.11) * 0.015,
        });
      }
    }
    const st = {
      crosshair: true,
      ads: !!ctx.shot?.preset?.ads,
      minimapRotate: this.settings.minimapRotate,
    };
    // cor da mira
    const cc = Settings.CROSS_COLORS[this.settings.crosshair] || '#fff';
    if (this._cc !== cc) {
      this._cc = cc;
      this.root.style.setProperty('--cross', cc);
    }
    if (showPlay) this.play.frame(dt, ctx, this.match, st);
    if (this.gs) this.gs.render(rdt);
    if (this.hero) this.hero.render(rdt);
    if (this.match.phase === 'dead') {
      const left = Math.max(0, 4 - this.match.deadT);
      const cd = this.play.el.death.querySelector('.cd');
      if (cd) cd.textContent = `REDEPLOYING IN ${left.toFixed(1)}`;
    }
  },

  dispose(ctx) {
    for (const off of this._offs || []) off?.();
    removeEventListener('keydown', this._key, true);
    removeEventListener('keyup', this._keyUp, true);
    removeEventListener('resize', this._rs);
    this.root.remove();
  },
};
