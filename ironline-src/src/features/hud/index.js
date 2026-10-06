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
import { Match, MODE, configureMode, setMode } from './match.js';
import { MODES, fill } from './modes.js';
import { unlockTable, newUnlocks, sanitizeLoadout, levelOf as lvOf, XP as PXP } from './progression.js';
import { ObjectiveHud, OBJ_CSS } from './objective.js';
import { applyCamo } from './camo.js';
import * as Settings from './settings.js';
import { Gunsmith, gunSilhouette } from './gunsmith.js';
import { Hero } from './hero.js';
import { Photos } from './photo.js';
import { Arsenal } from './arsenal.js';
import { ARS_CSS } from './arsenal-style.js';
import { setArtDetail } from './itemart.js';
import { setMinimapDetail } from './minimap.js';

/**
 * Poses das "fotos de campo" (arte dos cartões): vistas do próprio mapa
 * com lente mais fechada. fov = FOV vertical em graus.
 */
const PHOTO_POSES = {
  event: { position: [2.2, 0, 44], yaw: 0.05, pitch: 0.05, fov: 30 },
  card: { position: [-2.5, 0, 8], yaw: -0.5, pitch: 0.2, fov: 42 },
  bp: { position: [1.5, 0, -30], yaw: Math.PI - 0.12, pitch: 0.04, fov: 36 },
};
/**
 * Poses das fotos no mapa atual: as afinadas acima são da rua; outros
 * mapas usam `world.photoPoses` (se publicar) ou as poses de screenshot do
 * próprio mapa (`world.shotPoses`), com a lente de cada cartão.
 */
function photoPoses(world) {
  if (!world || (world.mapId ?? 'street') === 'street') return PHOTO_POSES;
  if (world.photoPoses) return world.photoPoses;
  const sp = world.shotPoses || {};
  const from = (k, fov) => (sp[k] ? { position: [...sp[k].position], yaw: sp[k].yaw || 0, pitch: sp[k].pitch || 0, fov } : null);
  const out = { event: from('street', 30), card: from('interior', 42), bp: from('viewmodel', 36) };
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

/** Descrições em inglês (a UI é em inglês) por id de mapa; reserva = a do mundo. */
/** quadros do menu já rodaram (operador pode ser criado sem pesar no init) */
const ctx_ready = (hud) => !!hud._deferDone || !!hud.ctx.shot;
const htmlEl = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; };

/** Medalhas que a partida (match.js) já concede — chegam também da feature streaks. */
const DUP_MEDALS = { double: 1, triple: 1, head: 1, long: 1, payback: 1, streak: 1 };

export const MAP_BLURB = {
  street: 'Ruined avenue in an old urban district — shattered facades, a crossroads, an alley, a checkpoint and the playable ground floor of block R4.',
  factory: 'Abandoned foundry — machine hall with an overhead crane, catwalks, two-story offices with blown-out glazing and a loading yard with dock, trailer and containers.',
};

export default {
  name: 'hud',
  order: 90,

  /**
   * init em blocos: entre os pesados `await ctx.bootProgress(...)` cede um
   * quadro e move a barra da tela de carga (celular não trava). A silhueta
   * 3D da arma e o operador do menu saem do init (feitos nos primeiros
   * quadros do menu); no tier 'lite' não há operador nem fotos de campo.
   */
  async init(ctx) {
    const bt = (this.bootTimes = []);
    let _t = performance.now();
    const step = async (label, f) => {
      const n = performance.now();
      bt.push([label, Math.round(n - _t)]);
      _t = n;
      await ctx.bootProgress?.(label, f);
      _t = performance.now();
    };
    const mark = (label) => { const n = performance.now(); bt.push([label, Math.round(n - _t)]); _t = n; };
    const tier = ctx.quality?.tier || 'desktop';
    this.tier = tier;
    setArtDetail(tier === 'desktop' ? 2 : 1);
    setMinimapDetail(tier === 'desktop' ? 8 : 4);
    const world = ctx.services.world;
    this.mapName = world?.map?.name || 'MERIDIAN STREET';
    this.mapBlurb = MAP_BLURB;
    const savedMode = ctx.shot ? null : Settings.loadProfile().mode;
    configureMode(ctx.params, ctx.params.get('mode') || savedMode || 'waves', this.mapName);
    const root = document.createElement('div');
    root.id = 'hud';
    root.innerHTML = `<style>${CSS}${OBJ_CSS}${ARS_CSS}</style><div class="fx"></div><div class="stage"></div>`;
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
      // nível de demonstração: parte dos desbloqueios aberta, parte trancada
      this.profile.xp = Number(ctx.params.get('pxp')) || 26000;
      this.profile.mode = MODE.id;
      this.profile.loadout = { primary: 0, optic: 1, muzzle: 1, grip: 1, lethal: 0, tactical: 1 };
      this.profile.camo = ctx.params.get('camo') || 'none';
    }
    // escolhas que o nível não permite voltam ao padrão (perfil antigo/editado)
    {
      const fix = sanitizeLoadout(this.profile.loadout, this.profile.camo, lvOf(this.profile.xp).level);
      this.profile.loadout = { ...this.profile.loadout, ...fix.loadout };
      this.profile.camo = fix.camo;
    }
    this.profile.mode = MODE.id;
    this.applyLowFx();
    await step('estilo', 0.1);
    this.play = new PlayHud(ctx, this.stage, root.querySelector('.fx'));
    // silhueta da arma (render 3D num contexto próprio): no modo shot já
    // aqui; fora dele, adiada para os primeiros quadros do menu
    this.gunIcon = null;
    if (ctx.shot) this.refreshGunIcon();
    this.play.setProfile(this.profile, Settings.levelOf(this.profile.xp).level);
    await step('hud de combate', 0.3);
    this.obj = new ObjectiveHud(ctx, this.play.root);
    // camuflagem salva na arma (materiais publicados pela feature weapon)
    this.setCamo(this.profile.camo, false);
    await step('camuflagem', 0.45);
    this.screens = new Screens(this, this.stage);
    mark('telas:screens');
    // ARSENAL (inventário/caixas/passe…): telas sobre services.inventory
    this.arsenal = ctx.services.inventory ? new Arsenal(this) : null;
    // fotos do mundo para os cartões (só onde há telas de frontend)
    mark('telas:arsenal');
    this.photos = new Photos(ctx);
    this.photos.onReady((key) => this.screens.photoReady(key));
    if ((!ctx.shot || ctx.shot.preset?.menu || ctx.params.get('ui')) && tier !== 'lite') {
      for (const [k, pose] of Object.entries(photoPoses(world))) this.photos.want(k, pose);
    }
    await step('telas', 0.55);
    this.match = new Match(ctx, {
      feed: (e) => this.play.feed(e, this.profile.callsign),
      xp: (l, t) => this.play.xp(l, t),
      medal: (k, t, p) => this.localMedal(k, t, p),
      // (o som do hitmarker é da feature audio, que escuta weapon:hit)
      hit: (h) => this.play.hitmarker(h),
      damage: (e) => this.play.damage(e),
      death: (killer) => this.onDeath(killer),
      respawn: () => this.onRespawn(),
      end: (win) => this.onEnd(win),
      wave: (n, of, count, boss) => {
        if (boss) this.play.banner('FINAL WAVE', `JUGGERNAUT INBOUND  ·  ${count - 1} ESCORTS  ·  AIM FOR THE VISOR`);
        else this.play.banner(`WAVE ${n}`, of ? `${count} HOSTILES INBOUND  ·  ${n} / ${of}` : `${count} HOSTILES CONVERGING ON THE ZONE`);
        ctx.bus.emit('match:wave', { wave: n, of, count, boss: !!boss, mode: MODE.id });
      },
      waveClear: (n, of) => {
        this.play.banner(`WAVE ${n} CLEARED`, `+${PXP.waveClear} XP  ·  NEXT WAVE IN ${MODE.intermission} S  ·  RELOAD AND REPOSITION`);
        ctx.bus.emit('match:waveClear', { wave: n, of, mode: MODE.id });
      },
      objective: (kind, data) => this.onObjective(kind, data),
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
      on('enemy:death', (e) => { this.match.onEnemyDeath(e); this.slideKill(e); }),
      on('enemy:fire', (e) => {
        if (e?.origin) this.play.ping(e.origin);
        this.virtualHit(e);
      }),
      on('player:damage', (e) => this.match.onPlayerDamage(e)),
      on('player:death', (e) => this.match.onPlayerDeath(e)),
      on('input:lock', (locked) => this.onLock(locked)),
      // ── contrato v3: medalhas/killstreaks (streaks), deslize (movement) ──
      on('medal:award', (e) => this.onMedalAward(e)),
      on('streak:ready', (e) => this.play.streakEvent('ready', e)),
      on('streak:used', (e) => this.play.streakEvent('used', e)),
      on('player:respawn', () => this.play.resetStreaks()),
      on('player:slide', (e) => {
        if (e?.phase === 'start') this.sliding = true;
        else if (e?.phase === 'end') { this.sliding = false; this.slideEnd = ctx.time.now; }
      }),
      on('inventory:unlock', (e) => { if (this.inMatch) this.play.medal('mastery', 'MAESTRIA: ' + (e?.def?.name || '').replace('MAESTRIA ', ''), 0); }),
      on('resize', () => this.layout()),
    ];
    this._key = (ev) => this.onKey(ev, true);
    this._keyUp = (ev) => this.onKey(ev, false);
    addEventListener('keydown', this._key, true);
    addEventListener('keyup', this._keyUp, true);
    addEventListener('resize', (this._rs = () => this.layout()));
    this._offs.push(on('quality:change', () => this.applyLowFx()));
    this.layout();
    await step('regras', 0.7);
    // remove a tela de carga do index.html quando o jogo começa
    const boot = document.getElementById('boot');
    if (boot) {
      if (ctx.shot) boot.remove();
      else {
        // a tela de carga cobre as fotos de campo (a câmera salta de pose
        // por alguns frames) — some quando terminam, ou após 4 s
        const t0 = performance.now();
        const done = () => {
          if (this.photos.pending && performance.now() - t0 < 4000) return requestAnimationFrame(done);
          boot.style.opacity = 0;
          setTimeout(() => boot.remove(), 600);
        };
        ctx.bus.once?.('ready', done);
      }
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
    this.inventoryQA(ctx.params);
    await step('menu', 1);
    if (ctx.params.get('bootlog') === '1') console.info('[hud] init por bloco (ms)', JSON.stringify(bt));

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

  /**
   * Sem backdrop-filter (blur/saturação de fundo) em qualidade baixa ou no
   * tier 'lite' — é um dos efeitos de composição mais caros em GPU fraca.
   */
  applyLowFx() {
    const q = this.ctx.quality;
    this.root.classList.toggle('lowfx', q?.level === 'low' || q?.tier === 'lite' || q?.tier === 'mobile');
  },
  /** escala da prancheta para a janela */
  layout() {
    const w = this.root.clientWidth || innerWidth, h = this.root.clientHeight || innerHeight;
    const k = Math.min(w / 1920, h / 1080);
    // centraliza horizontalmente em telas mais largas; HUD ancora nas bordas
    this.stage.style.transform = `scale(${k})`;
    this.stage.style.width = w / k + 'px';
    this.stage.style.height = h / k + 'px';
    // tamanho da prancheta guardado (nada de ler layout a cada quadro)
    this.stageW = w / k;
    this.stageH = h / k;
    this.k = k;
    this.play.resize(k * Math.min(2, devicePixelRatio || 1));
  },

  /** chamado pelas telas ao abrir: prévia 3D da arma no loadout */
  onScreen(name, el) {
    this.gs?.dispose();
    this.gs = null;
    if (name !== 'arsenal') this.arsenal?.dispose();
    // menu principal: mundo desfocado/graduado ao fundo + operador nítido
    const canvas = this.ctx.canvas;
    // menu principal: cena 3D VIVA, nítida (o operador está no mundo); só
    // o relatório/placar usam a cena desfocada por trás dos painéis
    if (canvas) canvas.style.filter = '';
    if (name !== 'main' && this.hero) { this.hero.dispose(); this.hero = null; }
    if (name === 'main') {
      const host = el.querySelector('.hero-host');
      // re-render do menu (troca de modo): o operador continua, só a
      // máscara de profundidade de campo é nova
      if (this.hero) this.hero.dof = el.querySelector('.dof') || this.hero.dof;
      if (host && !this.hero && this.tier === 'lite') host.remove();
      else if (host && !this.hero && !ctx_ready(this)) this._heroPending = true;
      else if (host && !this.hero) {
        try {
          this.hero = new Hero(this.ctx, host);
          this.hero.render(1 / 60);
        } catch (err) {
          console.warn('[hud] operador do menu indisponível', err);
          this.hero = null;
        }
      }
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
    this.obj?.setZone(null);
    ctx.services.enemies?.setObjective?.(null);
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
        this.obj.setZone(this.match.zone);
        const sub = MODE.id === 'hardpoint' ? `CAPTURE AND HOLD THE ZONE FOR ${MODE.holdGoal} S` : MODE.id === 'survival' ? `${MODE.waves.length} WAVES  ·  ${MODE.lives} LIVES  ·  BOSS ON THE FINAL WAVE` : `HOLD THE LINE  ·  ${MODE.waves.length} WAVES`;
        this.play.banner(MODE.name, `${sub}  ·  ${MODE.map}`);
        ctx.bus.emit('match:start', { mode: MODE });
        // equipamento trancado pelo nível (gancho da weapon, se existir)
        this.applyEquipmentLocks();
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
    this.applyEquipmentLocks();
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
  /**
   * Fim (ou abandono) de partida: soma XP/estatísticas no perfil, calcula
   * nível antes/depois e os desbloqueios novos (`this.lastProgress`, lido
   * pelo relatório e pelo toast de subida de nível).
   */
  recordProfile(win) {
    const m = this.match;
    if (this._recorded === m.startedAt || !m.playTime) return;
    this._recorded = m.startedAt;
    const P = this.profile;
    const before = lvOf(P.xp).level;
    const bonus = win ? PXP.win : PXP.loss;
    P.xp += m.xpEarned + bonus;
    m.xpEarned += bonus;
    P.kills += m.kills;
    P.headshots += m.headshots;
    P.matches++;
    if (win) P.wins++;
    if (m.bossKilled) P.bosses = (P.bosses || 0) + 1;
    if (m.zs?.captured) P.captures = (P.captures || 0) + m.zs.captured;
    const after = lvOf(P.xp).level;
    this.lastProgress = { before, after, bonus, unlocks: newUnlocks(this.unlocks(), before, after) };
    // inventário: créditos + XP do passe (services.inventory escuta)
    this.ctx.bus.emit('match:end', this.matchSummary(win));
    if (after > before) this.play.setProfile(P, after);
    this.saveProfile();
  },
  /** Estatísticas da partida para 'match:end' (créditos/passe do inventário). */
  matchSummary(win) {
    const m = this.match;
    const medals = Object.values(m.medals || {}).reduce((a, v) => a + (v.n || 0), 0);
    return {
      mode: MODE.id, win: !!win, kills: m.kills, headshots: m.headshots, deaths: m.deaths,
      captures: m.zs?.captured || 0, waves: Math.max(0, (m.wave || 0) - (win ? 0 : 1)), bossKilled: !!m.bossKilled,
      medals, playTime: m.playTime || 0, xp: m.xpEarned || 0, score: m.score || 0,
    };
  },
  /**
   * 'medal:award' { id, name, xp, icon } (feature streaks): toast na fila de
   * medalhas e soma no XP/medalhas da partida (aparece no relatório).
   */
  onMedalAward(e) {
    if (!e) return;
    const name = String(e.name || e.id || 'MEDAL').toUpperCase();
    const key = String(e.icon || e.id || '').toLowerCase();
    const kinds = ['kill', 'head', 'double', 'triple', 'long', 'streak', 'payback', 'slide', 'mastery', 'airstrike', 'uav', 'shield'];
    const ALIAS = { mortar: 'airstrike', drone: 'uav', kamikaze: 'airstrike', sentry: 'shield', fury: 'triple', flank: 'long', blank: 'head', collateral: 'double', revenge: 'payback', first: 'kill' };
    const kind = kinds.find((k) => key === k) || ALIAS[key] || kinds.find((k) => key.includes(k) || name.toLowerCase().includes(k)) || (/spree|kills/.test(key) ? 'streak' : 'kill');
    if (/slide/i.test(key + name)) this._extSlide = this.ctx.time.now;
    this._extMedals = true;
    const xp = Math.max(0, Number(e.xp) || 0);
    this.play.medal(kind, name, xp, true);
    // as que a própria partida já conta (multiabate, headshot, longshot,
    // payback, sequência) não somam XP de novo
    if (DUP_MEDALS[kind]) return;
    const m = this.match;
    if (m && this.inMatch) {
      m.xpEarned += xp;
      m.score += xp;
      const row = (m.medals[name] ||= { kind, n: 0 });
      row.n++;
    }
  },
  /**
   * Medalha da própria partida (match.js). Com a feature streaks ativa, as
   * equivalentes chegam por 'medal:award' — o toast local é omitido.
   */
  localMedal(kind, title, pts) {
    if ((this._extMedals || this.ctx.services.streaks) && DUP_MEDALS[kind] && !this.ctx.shot) return;
    this.play.medal(kind, title, pts);
  },
  /**
   * Barra de killstreaks a partir do serviço da feature streaks (se publicar
   * `slots()` ou `list`) — complementa os eventos 'streak:ready'/'streak:used'.
   */
  syncStreaks() {
    const s = this.ctx.services.streaks;
    if (!s) return;
    let list = null;
    try { list = typeof s.slots === 'function' ? s.slots() : s.slots || s.list || null; } catch { list = null; }
    if (!Array.isArray(list)) return;
    const sig = list.map((x) => `${x.id}:${x.ready ? 1 : 0}`).join(',');
    if (sig === this._ksSig) return;
    this._ksSig = sig;
    this.play.setStreaks(list.map((x) => ({ id: x.id, name: x.name, kills: x.kills, key: x.key })));
    for (const x of list) {
      const cur = this.play.ks.get(x.id);
      if (!cur) continue;
      if (x.ready) cur.state = 'ready';
      else if (cur.state === 'ready') cur.state = 'used';
    }
    this.play.renderStreaks();
  },
  /**
   * "SLIDE KILL": abate durante o deslize ('player:slide' da feature
   * movement / ctx.player.sliding) ou até 0,35 s depois. Se a feature streaks
   * conceder a dela por 'medal:award', esta não aparece (sem duplicar).
   */
  slideKill(e) {
    const ctx = this.ctx;
    if (!this.inMatch || ctx.shot) return;
    const src = e?.info?.source;
    if (src && src !== 'player') return;
    const now = ctx.time.now;
    const sliding = this.sliding || ctx.player.sliding || (this.slideEnd != null && now - this.slideEnd < 0.35);
    if (!sliding) return;
    setTimeout(() => {
      if (this._extSlide != null && Math.abs(this._extSlide - now) < 1) return;
      const xp = 50;
      this.play.medal('slide', 'SLIDE KILL', xp, true);
      const m = this.match;
      m.xpEarned += xp;
      m.score += xp;
      (m.medals['SLIDE KILL'] ||= { kind: 'slide', n: 0 }).n++;
    }, 150);
  },
  /** Silhueta da arma ativa (após trocar a primária no loadout). */
  refreshGunIcon() {
    const gun = this.ctx.services.weapon?.gun;
    if (!gun) return;
    try {
      this.gunIcon = gunSilhouette(this.ctx.THREE, gun, { h: 140 });
      this.play.setGunIcon(this.gunIcon);
    } catch {}
  },
  /** Tabela de desbloqueios com as armas publicadas pela weapon. */
  unlocks() {
    return unlockTable(this.ctx.services.weapon?.weapons || [], this.screens?.attNames?.() || {});
  },
  /** Camuflagem da primária (perfil + materiais da weapon). */
  setCamo(id, save = true) {
    this.profile.camo = id;
    this.camoMode = applyCamo(this.ctx.THREE, this.ctx.services.weapon, id);
    if (save) this.saveProfile();
  },
  /**
   * Atordoante trancada até o nível dela: precisa de `weapon.setTacticals(n)`
   * (gancho pedido à feature weapon — ver README). Sem o gancho, só a UI
   * mostra o cadeado.
   */
  applyEquipmentLocks() {
    const w = this.ctx.services.weapon;
    const lv = lvOf(this.profile.xp).level;
    const flash = this.unlocks().find((u) => u.key === 'equipment:flash');
    if (flash && flash.level > lv) w?.setTacticals?.(0);
  },
  /** Troca o modo no menu (persistido no perfil — sobrevive à troca de mapa). */
  selectMode(id) {
    if (this.inMatch || !MODES[id]) return;
    setMode(id, this.mapName);
    this.profile.mode = id;
    this.saveProfile();
    this.match.reset();
  },
  /** Eventos de objetivo da partida → banners. */
  onObjective(kind, data) {
    const P = this.play;
    if (kind === 'captured') P.banner('ZONE CAPTURED', `+${PXP.capture} XP  ·  HOLD IT FOR ${MODE.holdGoal} S`);
    else if (kind === 'lost') P.banner('ZONE LOST', 'GET BACK INTO THE ZONE');
    else if (kind === 'taken') P.banner('ZONE OVERRUN', 'HOSTILES HAVE TAKEN THE ZONE');
    else if (kind === 'bossIn') {
      // entrada do chefe: estrondo grave distante (áudio público) + evento
      this.ctx.services.audio?.play?.('explosion_far', { volume: 0.9, rate: 0.55, reverb: 0.5 });
      this.ctx.bus.emit('match:boss', { enemy: data?.enemy });
    }
    else if (kind === 'bossDown') P.banner('JUGGERNAUT DOWN', `+${PXP.bossKill} XP  ·  FINISH THE ESCORT`);
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
    m.wave = Math.min(3, MODE.waves.length);
    if (this.ctx.params.get('ui') === 'end') {
      // relatório de fim: partida concluída (alvo atingido)
      m.kills = 30; m.deaths = 6; m.headshots = 11; m.shots = 486; m.hits = 203; m.score = 4350; m.xpEarned = 4350;
      m.bestStreak = 9; m.longest = 46.2; m.damage = 4870; m.timeLeft = 131; m.playTime = 469;
      m.medals = { HEADSHOT: { kind: 'head', n: 11 }, 'DOUBLE KILL': { kind: 'double', n: 3 }, 'TRIPLE KILL': { kind: 'triple', n: 1 }, LONGSHOT: { kind: 'long', n: 2 }, BLOODTHIRSTY: { kind: 'streak', n: 1 } };
      const fin = [[2, 7], [1, 6], [2, 6], [0, 5], [1, 6]];
      names.forEach((n, i) => m.hostile.set(n, { name: n, kills: fin[i][0], deaths: fin[i][1], score: fin[i][0] * 100 + fin[i][1] * 25 + 150, alive: true }));
    }
    // modos: estado de objetivo para a captura
    if (MODE.id === 'hardpoint') {
      const pose = this.ctx.shotPose(preset?.name || 'combat');
      let near = null;
      if (pose && preset?.hud) {
        // zona à frente da câmera (a captura precisa mostrar o anel)
        const f = 8.5, y = pose.yaw || 0;
        near = { x: pose.position[0] - Math.sin(y) * f, y: pose.position[1] || 0, z: pose.position[2] - Math.cos(y) * f };
      }
      m.zone = m.resolveZone(near);
      this.obj.setZone(m.zone);
      Object.assign(m.zs, { cap: 0.64, owner: null, hold: 37, status: 'capturing', contested: false, captured: 1 });
      m.zoneIn = false;
      m.zoneFoes = 0;
      m.wave = 4;
      m.objectiveXP = 525;
    } else if (MODE.id === 'survival') {
      m.wave = MODE.waves.length;
      m.lives = Math.max(1, (MODE.lives || 3) - 1);
      m.boss = this.ctx.services.enemies?.list?.find((e) => e.boss) || null;
      m.bossSpawned = !!m.boss;
    }
    if (this.ctx.params.get('ui') === 'end') {
      if (MODE.id === 'hardpoint') { m.zs.hold = MODE.holdGoal; m.zs.owner = 'us'; m.zs.captured = 3; m.objectiveXP = 1300; }
      if (MODE.id === 'survival') { m.bossKilled = true; m.objectiveXP = 1000 + 150 * MODE.waves.length; }
      m.endReason = MODE.id === 'hardpoint' ? 'ZONE SECURED' : MODE.id === 'survival' ? 'JUGGERNAUT NEUTRALIZED' : 'HOSTILE CELL NEUTRALIZED';
      // subida de nível de demonstração (relatório + toast)
      // créditos/passe do relatório (inventário de demonstração)
      this.ctx.bus.emit('match:end', this.matchSummary(true));
      const lv = lvOf(this.profile.xp).level;
      if (this.ctx.params.get('lvup') !== '0') this.lastProgress = { before: lv - 1, after: lv, bonus: PXP.win, unlocks: newUnlocks(this.unlocks(), lv - 1, lv) };
    }
    // captura do chefe: sem hitmarker/toast no centro (o juggernaut é o assunto)
    if (preset?.combat && this.ctx.params.get('boss') === '1') {
      const cs = this.profile.callsign;
      this.play.feed({ killer: 'self', victim: 'NOMAD', head: false, weapon: 'frag' }, cs);
      this.play.feed({ killer: 'JUGGERNAUT', victim: 'self', head: false, weapon: 'hostile' }, cs);
      [...this.play.el.feed.children].forEach((r, i) => { r.style.animation = 'none'; r._t = [0.9, 3.6][i] ?? 5; });
      return;
    }
    if (preset?.combat && this.ctx.params.get('ks') === '1') {
      // encenação da barra de killstreaks + medalha externa (contrato v3)
      this.play.setStreaks([{ id: 'uav', name: 'UAV', kills: 3 }, { id: 'airstrike', name: 'AIRSTRIKE', kills: 5 }, { id: 'gunship', name: 'GUNSHIP', kills: 9 }]);
      this.play.streakEvent('ready', { id: 'uav', name: 'UAV', kills: 3, key: '4' });
      this.ctx.bus.emit('medal:award', { id: 'slide', name: 'SLIDE KILL', xp: 50, icon: 'slide' });
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

  /**
   * QA do inventário por URL: `?inv=open` (ou `&ui=arsenal`) abre o ARSENAL;
   * `&arsenal=<aba>`, `&inspect=N`, `?case=1&seed=N[&reelt=s][&reveal=1]`,
   * `&trade=1` (ver arsenal.js). `&ks=1` no preset combat encena a barra de
   * killstreaks e uma medalha externa.
   */
  inventoryQA(P) {
    if (!this.arsenal) return;
    const want = P.get('inv') === 'open' || P.has('case') || P.has('arsenal') || P.has('inspect') || P.get('trade') === '1';
    if (want && this.screens.cur !== 'arsenal') this.screens.show('arsenal');
    if (this.screens.cur === 'arsenal') this.arsenal.qa(P);
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
    this.photos.pump();
    // trabalho adiado do init: silhueta da arma e operador do menu
    if (!ctx.shot && !this._deferDone && (this._df = (this._df || 0) + 1) > 2) {
      this._deferDone = true;
      this.screens.finishBoot();
      if (!this.gunIcon) {
        this.refreshGunIcon();
        if (this.screens.cur === 'main') this.screens.el?.querySelector('.tile.wk')?.replaceWith(htmlEl(this.screens.weaponTile()));
      }
      if (this._heroPending && this.screens.cur === 'main') { this._heroPending = false; this.onScreen('main', this.screens.el); }
    }
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
    if (showPlay) {
      if (this.inMatch && (this._kst = (this._kst || 0) + rdt) > 0.25) { this._kst = 0; this.syncStreaks(); }
      this.play.frame(dt, ctx, this.match, st);
      this.obj.frame(rdt, this.match, MODE, this.stageW || 1920, this.stageH || 1080);
    } else if (this.obj.ring) this.obj.ring.update(this.match.zs, ctx.time.now);
    if (this.gs) this.gs.render(rdt);
    if (this.hero) this.hero.render(rdt);
    if (scr === 'arsenal') this.arsenal?.frame(rdt);
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
    this.obj?.dispose();
    this.root.remove();
  },
};
