// Ponto de entrada: inicializa tudo, roda o loop e conecta partida, áudio,
// HUD, competições, saves e PWA.
import { loadSettings, saveSettings, dbGet, dbSet, dbDel, storageOk, requestPersist } from './save.js';
import { defaultTeams, GYMS, CREST_SHAPES, CREST_PATTERNS, KIT_PATTERNS } from './data.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { CameraRig, ReplayPlayer } from './camera.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Match } from './game.js';
import { clamp } from './util.js';
import * as C from './career.js';

const HEX = /^#[0-9a-fA-F]{6}$/;

class App {
  async init() {
    this.settings = loadSettings();
    this.input = new Input(this.settings);
    this.renderer = new Renderer(document.getElementById('game'), this.settings);
    this.rig = new CameraRig(this.renderer.camera);
    this.rig.mode = this.settings.camera;
    this.audio = new AudioEngine(this.settings);
    this.ui = new UI(this);
    this.match = null;
    this.teams = await this.loadTeams();
    this.renderer.buildGym(GYMS[this.settings.gym] || GYMS[0]);
    this.last = performance.now();
    this.fpsN = 0; this.fpsT = 0; this.fps = 0;
    this.menuT = 0;

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.match && !this.match.paused && this.matchActive()) this.pauseMatch(); this.audio.suspend(); }
      else this.audio.resume();
    });
    window.addEventListener('pagehide', () => this.audio.suspend());
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); this.installPrompt = e; });
    document.getElementById('game').addEventListener('pointerdown', () => { if (this.replay) this.skipReplay = true; });

    requestPersist();
    document.getElementById('boot').remove();
    this.ui.title();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ─── Times (editor) ──────────────────────────────────────────────────────
  async loadTeams() {
    try {
      const saved = await dbGet('teams');
      if (Array.isArray(saved) && saved.length >= 2) {
        const ok = saved.map((t) => this.sanitizeTeam(t)).filter(Boolean);
        if (ok.length >= 2) return ok;
      }
    } catch { /* usa os padrões */ }
    return defaultTeams();
  }

  saveTeams() { dbSet('teams', this.teams); }
  async resetTeams() { this.teams = defaultTeams(); await dbDel('teams'); }
  teamById(id) { return this.teams.find((t) => t.id === id) || this.compTeams?.[id] || null; }
  storageOk() { return storageOk; }

  // Valida e normaliza um time vindo de arquivo JSON (nunca confiar no conteúdo).
  sanitizeTeam(t) {
    if (!t || typeof t !== 'object') return null;
    const str = (v, n, d) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : d);
    const col = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
    const num = (v, a, b, d) => (Number.isFinite(+v) ? clamp(Math.round(+v), a, b) : d);
    const kit = (k, d) => ({
      shirt: col(k?.shirt, d), shirt2: col(k?.shirt2, '#ffffff'), shorts: col(k?.shorts, d), socks: col(k?.socks, d),
      pattern: KIT_PATTERNS.includes(k?.pattern) ? k.pattern : 'liso',
    });
    if (!Array.isArray(t.players) || t.players.length < 5) return null;
    const players = t.players.slice(0, 14).map((p, i) => ({
      id: str(p?.id, 20, Math.random().toString(36).slice(2)), name: str(p?.name, 18, `Jogador ${i + 1}`),
      number: num(p?.number, 1, 99, i + 1), role: ['GK', 'FIX', 'ALA', 'PIV'].includes(p?.role) ? p.role : 'ALA',
      age: num(p?.age, 15, 45, 24), skin: num(p?.skin, 0, 3, 1), hair: num(p?.hair, 0, 4, 0),
      vel: num(p?.vel, 1, 99, 60), pas: num(p?.pas, 1, 99, 60), fin: num(p?.fin, 1, 99, 60), dri: num(p?.dri, 1, 99, 60),
      mar: num(p?.mar, 1, 99, 60), fol: num(p?.fol, 1, 99, 60), ref: num(p?.ref, 1, 99, 40), pos: num(p?.pos, 1, 99, 40), rep: num(p?.rep, 1, 99, 40),
    }));
    if (!players.some((p) => p.role === 'GK')) players[0].role = 'GK';
    const team = {
      id: str(t.id, 24, 'u' + Math.random().toString(36).slice(2, 8)), name: str(t.name, 24, 'Time'), short: str(t.short, 3, 'TIM').toUpperCase(),
      rating: num(t.rating, 1, 99, 70),
      crest: { shape: CREST_SHAPES.includes(t.crest?.shape) ? t.crest.shape : 'shield', pattern: CREST_PATTERNS.includes(t.crest?.pattern) ? t.crest.pattern : 'stripe', c1: col(t.crest?.c1, '#1d4ed8'), c2: col(t.crest?.c2, '#ffffff') },
      kits: [kit(t.kits?.[0], '#1d4ed8'), kit(t.kits?.[1], '#f8fafc')],
      gkKit: kit(t.gkKit, '#a3e635'),
      players,
      tactic: { formation: ['3-1', '2-2', '4-0', '1-2-1'].includes(t.tactic?.formation) ? t.tactic.formation : '3-1', marking: t.tactic?.marking === 'individual' ? 'individual' : 'zona', press: ['recuo', 'normal', 'alta'].includes(t.tactic?.press) ? t.tactic.press : 'normal', lineup: Array.isArray(t.tactic?.lineup) ? t.tactic.lineup.map((x) => num(x, 0, 13, 0)) : [0, 1, 2, 3, 4] },
    };
    C.fixLineup(team);
    return team;
  }

  exportTeams(list, filename) {
    try {
      const blob = new Blob([JSON.stringify({ format: 'pixel-futsal-teams', version: 1, teams: list }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch { this.ui.toast('Não foi possível exportar.'); }
  }

  async importTeams(file) {
    if (!file) return 'Nenhum arquivo.';
    try {
      if (file.size > 2_000_000) return 'Arquivo grande demais.';
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : Array.isArray(data?.teams) ? data.teams : [data];
      let n = 0;
      for (const raw of list.slice(0, 64)) {
        const t = this.sanitizeTeam(raw);
        if (!t) continue;
        const i = this.teams.findIndex((x) => x.id === t.id);
        if (i >= 0) this.teams[i] = t; else this.teams.push(t);
        n++;
      }
      if (!n) return 'Nenhum time válido no arquivo.';
      this.saveTeams();
      return `${n} time(s) importado(s).`;
    } catch { return 'Arquivo JSON inválido.'; }
  }

  saveSettings() { saveSettings(this.settings); }
  install() { this.installPrompt?.prompt(); this.installPrompt = null; this.ui.mainMenu(); }

  // ─── Partida ─────────────────────────────────────────────────────────────
  startMatch(cfg, ctx) {
    this.ctx = ctx;
    const m = new Match(cfg, this.settings);
    this.match = m;
    this.renderer.buildGym(GYMS[cfg.gym] || GYMS[0]);
    this.renderer.setupMatch(m);
    this.ui.close();
    this.ui.hudSetup(m);
    this.input.showTouch(true);
    this.audio.stopMusic();
    this.audio.unlock();
    this.rig.mode = this.settings.camera;
    this.rig.snap();
    this.endShown = false; this.halfShown = false; this.replay = null;
    this.devices = ctx.devices || null;
    m.on((type, d) => this.onEvent(type, d));
  }

  matchActive() { return this.match && !['halftime', 'fulltime'].includes(this.match.state); }
  humanTeam() { return this.match && this.match.humans.length ? this.match.humans[0].team : -1; }

  pauseMatch() {
    if (!this.match) return;
    this.match.paused = true;
    this.ui.pause();
  }

  resume() {
    if (!this.match) return;
    this.ui.close();
    this.match.paused = false;
  }

  nextPeriod() {
    this.ui.close();
    this.halfShown = false;
    this.match.nextPeriod();
  }

  cleanupMatch() {
    this.match = null;
    this.replay = null;
    this.ui.hudHide();
    this.input.showTouch(false);
    this.audio.setCrowd(0, 1);
    this.audio.startMusic();
  }

  quitMatch() {
    const ctx = this.ctx;
    this.cleanupMatch();
    if (ctx && ctx.onQuit) ctx.onQuit(); else this.ui.mainMenu();
  }

  finishMatch() {
    const res = this.match.result();
    const ctx = this.ctx;
    this.cleanupMatch();
    if (ctx && ctx.onEnd) ctx.onEnd(res); else this.ui.mainMenu();
  }

  onEvent(type, d) {
    const m = this.match, A = this.audio, U = this.ui, R = this.renderer;
    if (!m) return;
    const tn = (i) => m.teams[i].data;
    switch (type) {
      case 'kick': A.play('kick', { power: d.power }); break;
      case 'touch': A.play('touch'); break;
      case 'bounce': A.play('bounce', d); break;
      case 'post': A.play('post', d); break;
      case 'net': A.play('net'); break;
      case 'goal':
        A.play('cheer', { amount: 1.3 });
        A.say(d.own ? 'ownGoal' : 'goal', 3);
        R.flash(); R.goalNet(d.side); R.excite = 1.3; this.rig.shake(0.45);
        U.banner('GOL!', d.shootout ? tn(d.team).name : `${d.scorer ? d.scorer.data.name : ''}${d.own ? ' (contra)' : ''} · ${tn(d.team).short}`, 2.4);
        break;
      case 'save': A.play('ooh'); A.say('save', 2); break;
      case 'postShot': A.say('post', 2); A.play('ooh'); break;
      case 'whistle':
        A.play('whistle', { pattern: 'short' });
        if (m.lastShot && m.time - m.lastShot.t < 2.5 && (d.type === 'meta' || d.type === 'escanteio')) { A.say('miss', 1); A.play('ooh'); }
        break;
      case 'restart': {
        const human = m.restart?.taker?.human >= 0;
        const hint = human ? (d.type === 'penalti' || d.type === 'livre6' ? 'Mire e segure CHUTE' : d.type === 'meta' ? 'Reponha com a mão: PASSE ou CHUTE' : 'Mire e toque PASSE ou CHUTE') : null;
        U.restartBanner(d.type, tn(d.team).name, m.restart?.note || hint);
        break;
      }
      case 'foul': {
        const pen = d.type === 'penalti';
        U.banner(pen ? 'PÊNALTI!' : 'FALTA', `${tn(d.team).short} · ${d.fouls}ª falta acumulada${d.type === 'livre6' ? ' · sem barreira' : ''}`, 1.8);
        A.say(pen ? 'penalty' : d.fouls === 5 ? 'foul5' : d.fouls >= 6 ? 'foul6' : 'foul', 2);
        break;
      }
      case 'card':
        setTimeout(() => {
          U.banner(d.card === 'red' ? 'CARTÃO VERMELHO' : 'CARTÃO AMARELO', `${d.p.data.name} · ${tn(d.team).short}${d.card === 'red' ? ' · 2 min com um a menos' : ''}`, 2.2, d.card);
          A.play('card'); A.say(d.card === 'red' ? 'red' : 'yellow', 2);
        }, 900);
        break;
      case 'periodEnd': A.play('whistle', { pattern: 'end' }); A.say(d.half === 1 ? 'half' : 'end', 2); break;
      case 'start': A.say('start', 1); break;
      case 'restartTaken': if (d.type === 'kickoff' || d.type === 'penalti' || d.type === 'livre6') A.play('whistle', { pattern: 'short' }); break;
      case 'keeperOut': U.toast(`${tn(d.team).short}: goleiro-linha ${d.on ? 'LIGADO' : 'desligado'}`); if (d.on) A.say('keeperOut', 1); break;
      case 'swap': R.refreshPlayer(m, d.i); break;
      case 'skill': A.play('squeak'); if (Math.random() < 0.3) A.say('skill', 1); break;
      case 'slide': R.spawnDust(d.x, d.z, 10); A.play('squeak'); break;
      case 'dust': R.spawnDust(d.x, d.z, 1); break;
      case 'danger': R.excite = Math.max(R.excite, d.level * 0.5); A.excite = Math.max(A.excite, d.level * 0.4); break;
      case 'fourSec': U.banner('4 SEGUNDOS!', tn(d.team).short, 1.6); A.say('fourSec', 2); break;
      case 'shootoutStart': U.banner('PÊNALTIS', 'Cinco cobranças para cada lado', 2.2); break;
      case 'shootoutKick': {
        const hk = d.taker.human >= 0, hg = m.gk(1 - d.team)?.human >= 0;
        U.banner(d.taker.data.name, hk ? 'Mire com o direcional e segure CHUTE' : hg ? 'Você no gol: direcional escolhe o canto' : tn(d.team).name, hk || hg ? 2.6 : 1.3, 'small');
        break;
      }
      case 'penMiss': A.play('ooh'); A.say('miss', 2); break;
      case 'teamFull': U.toast(`${tn(d.team).short} volta a ter 5 jogadores`); break;
      case 'replay': break;
    }
  }

  // ─── Competições ─────────────────────────────────────────────────────────
  snapshot(ids) { return Object.fromEntries(ids.map((id) => [id, JSON.parse(JSON.stringify(this.teams.find((t) => t.id === id)))])); }

  async openLeague() {
    const lg = await dbGet('league');
    if (lg && lg.teamData) { this.leagueHub(lg); return; }
    this.ui.pickTeam('CAMPEONATO', (team) => {
      const others = this.teams.filter((t) => t.id !== team.id).sort(() => Math.random() - 0.5).slice(0, 7);
      const ids = [team.id, ...others.map((t) => t.id)];
      const nl = C.newLeague(ids, team.id, false);
      nl.teamData = this.snapshot(ids);
      dbSet('league', nl);
      this.leagueHub(nl);
    }, () => this.ui.mainMenu());
  }

  leagueHub(lg) {
    this.compTeams = lg.teamData;
    const T = lg.teamData;
    this.ui.leagueHub(lg, T, (act) => {
      const g = C.userGame(lg);
      const finish = () => { C.simRound(lg, T); C.advanceLeague(lg); dbSet('league', lg); this.leagueHub(lg); };
      if (act === 'play' && g) {
        const userHome = g.h === lg.userTeam;
        this.startMatch({ home: T[g.h], away: T[g.a], gym: this.settings.gym, halfLen: this.settings.duration * 60, difficulty: this.settings.difficulty, humans: [{ team: userHome ? 0 : 1 }] },
          { mode: 'league', onEnd: (res) => { g.res = { home: res.home, away: res.away }; finish(); }, onQuit: () => this.leagueHub(lg) });
      }
      if (act === 'sim' && g) { g.res = C.simMatch(T[g.h], T[g.a]); finish(); }
      if (act === 'new') { dbDel('league'); this.openLeague(); }
      if (act === 'abandon') this.ui.confirm('Abandonar o campeonato? O progresso será perdido.', () => { dbDel('league'); this.ui.mainMenu(); }, () => this.leagueHub(lg));
      if (act === 'back') this.ui.mainMenu();
    });
  }

  async openCup() {
    const cup = await dbGet('cup');
    if (cup && cup.teamData) { this.cupHub(cup); return; }
    this.ui.cupOptions((size, extra) => this.ui.pickTeam('COPA', (team) => {
      const n = Math.min(size, this.teams.length - (this.teams.length % 2));
      const others = this.teams.filter((t) => t.id !== team.id).sort(() => Math.random() - 0.5).slice(0, n - 1);
      const ids = [team.id, ...others.map((t) => t.id)];
      const nc = C.newCup(ids, team.id);
      nc.teamData = this.snapshot(ids);
      nc.extraTime = extra;
      dbSet('cup', nc);
      this.cupHub(nc);
    }, () => this.openCup()), () => this.ui.mainMenu());
  }

  cupHub(cup) {
    this.compTeams = cup.teamData;
    const T = cup.teamData;
    this.ui.cupHub(cup, T, (act) => {
      const g = C.userGame(cup);
      const finish = () => { C.simRound(cup, T, true); C.advanceCup(cup); dbSet('cup', cup); this.cupHub(cup); };
      if (act === 'play' && g) {
        const userHome = g.h === cup.userTeam;
        this.startMatch({ home: T[g.h], away: T[g.a], gym: cup.round === cup.rounds.length - 1 && cup.rounds[cup.round].length === 1 ? 3 : this.settings.gym, halfLen: this.settings.duration * 60, difficulty: this.settings.difficulty, humans: [{ team: userHome ? 0 : 1 }], knockout: true, extraTime: cup.extraTime },
          { mode: 'cup', onEnd: (res) => { g.res = { home: res.home, away: res.away, pens: res.pens }; finish(); }, onQuit: () => this.cupHub(cup) });
      }
      if (act === 'sim' && g) { g.res = C.simMatch(T[g.h], T[g.a], true); finish(); }
      if (act === 'simall') finish();
      if (act === 'new') { dbDel('cup'); this.openCup(); }
      if (act === 'abandon') this.ui.confirm('Abandonar a copa?', () => { dbDel('cup'); this.ui.mainMenu(); }, () => this.cupHub(cup));
      if (act === 'back') this.ui.mainMenu();
    });
  }

  async openCareer() {
    const car = await dbGet('career');
    if (car && car.teams) { this.careerHub(car); return; }
    this.ui.pickTeam('CARREIRA', (team) => {
      const nc = C.newCareer(this.teams, team.id);
      dbSet('career', nc);
      this.careerHub(nc);
    }, () => this.ui.mainMenu(), '<p class="muted">8 times, turno e returno, 3 temporadas ou mais.</p>');
  }

  careerHub(car, tab) {
    const T = Object.fromEntries(car.teams.map((t) => [t.id, t]));
    this.compTeams = T;
    const save = () => dbSet('career', car);
    this.ui.careerHub(car, (act, data) => {
      const lg = car.league;
      const g = C.userGame(lg);
      const finish = () => { C.simRound(lg, T); C.advanceLeague(lg); save(); this.careerHub(car); };
      if (act === 'save') save();
      if (act === 'play' && g) {
        const userHome = g.h === car.userTeam;
        this.startMatch({ home: T[g.h], away: T[g.a], gym: this.settings.gym, halfLen: this.settings.duration * 60, difficulty: this.settings.difficulty, humans: [{ team: userHome ? 0 : 1 }] },
          { mode: 'career', onEnd: (res) => {
            g.res = { home: res.home, away: res.away };
            C.recordMinutes(car, res, [T[g.h], T[g.a]]);
            const mine = userHome ? res.home : res.away, theirs = userHome ? res.away : res.home;
            car.news.unshift(`${mine > theirs ? 'Vitória' : mine < theirs ? 'Derrota' : 'Empate'}: ${T[g.h].short} ${res.home} x ${res.away} ${T[g.a].short}.`);
            finish();
          }, onQuit: () => this.careerHub(car) });
      }
      if (act === 'sim' && g) { g.res = C.simMatch(T[g.h], T[g.a]); car.news.unshift(`Simulado: ${T[g.h].short} ${g.res.home} x ${g.res.away} ${T[g.a].short}.`); finish(); }
      if (act === 'endSeason') { C.endSeason(car); save(); this.careerHub(car); }
      if (act === 'buy') { const err = C.buyPlayer(car, data.t, data.id); if (err) this.ui.toast(err); else save(); }
      if (act === 'sell') { const err = C.sellPlayer(car, data.id); if (err) this.ui.toast(err); else save(); }
      if (act === 'abandon') this.ui.confirm('Encerrar a carreira? O save será apagado.', () => { dbDel('career'); this.ui.mainMenu(); }, () => this.careerHub(car));
      if (act === 'back') this.ui.mainMenu();
    }, tab);
  }

  showMenuBackground() {
    if (this.match) return;
    this.renderer.models.forEach((mm) => (mm.visible = false));
  }

  // ─── Loop ────────────────────────────────────────────────────────────────
  controllers() {
    if (this.devices) return this.devices;
    return [this.input.primary()];
  }

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (dt <= 0) return;
    this.fpsN++; this.fpsT += dt;
    if (this.fpsT >= 1) { this.fps = this.fpsN; this.fpsN = 0; this.fpsT = 0; }

    this.input.update(dt);
    const m = this.match;
    if (m) this.updateMatch(dt, m);
    else this.updateMenu(dt);
    this.renderer.render();
  }

  updateMenu(dt) {
    this.menuT += dt;
    const t = this.menuT * 0.06;
    this.rig.pos.set(Math.sin(t) * 27, 11 + Math.sin(t * 0.7) * 2, Math.cos(t) * 21);
    this.rig.look.set(0, 0, 0);
    this.rig.fov = 38;
    this.rig.apply(dt);
    this.renderer.update(dt, { players: [], ball: { x: 0, y: 0.11, z: 0 }, controlled: [] });
    this.audio.setCrowd(0, dt);
  }

  updateMatch(dt, m) {
    const ctrls = this.controllers();
    if (ctrls.some((c) => c.pressed.pause) && this.matchActive() && !this.replay) {
      if (m.paused) this.resume(); else this.pauseMatch();
    }
    let view;
    if (m.state === 'replay') {
      if (!this.replay) {
        this.replay = new ReplayPlayer(m, m.ball.inGoal || 1);
        this.rig.replaySnap = true;
        this.ui.hud.replay.classList.remove('hidden');
        this.skipReplay = false;
      }
      const rp = this.replay;
      const f = rp.update(dt);
      if (rp.newAngle) { this.rig.replaySnap = true; rp.newAngle = false; }
      view = { players: f.p, ball: f.b, controlled: [] };
      this.rig.replayView(Math.min(2, rp.angle), f, rp.side, rp.scorer);
      if (rp.done || this.skipReplay || this.input.anyPressed()) {
        this.replay = null;
        this.ui.hud.replay.classList.add('hidden');
        m.setState('goal');
        m.stateT = 99;
        m.afterGoal();
        this.rig.snap();
      }
    } else {
      if (!m.paused) {
        const n = Math.max(1, Math.ceil(dt / (1 / 60) - 0.01));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
          m.update(h, ctrls, this.rig);
          if (i === 0) for (const c of ctrls) for (const k in c.pressed) { c.pressed[k] = false; c.released[k] = false; }
        }
      }
      view = { players: m.players, ball: m.ball, controlled: m.humans.map((h) => h.player) };
      const r = m.restart;
      if (m.state === 'restart' && r && r.taker && r.taker.human >= 0) {
        const a = r.aim ?? r.defaultAim ?? 0;
        view.aim = { x: m.ball.x + Math.cos(a) * 0.4, z: m.ball.z + Math.sin(a) * 0.4, angle: a };
      }
      const focus = m.humans.length ? m.humans[0].player : -1;
      this.rig.update(dt, m, focus);
      if (m.state === 'play' && Math.random() < dt * 1.5) this.audio.play('squeak');
    }
    this.renderer.update(m.paused ? 0 : dt, view);
    this.ui.hudUpdate(m, dt, this.fps);
    this.audio.setCrowd(this.renderer.gym ? this.renderer.gym.crowd : 0.5, dt);

    if (m.state === 'halftime' && !this.halfShown) {
      this.halfShown = true;
      setTimeout(() => { if (this.match === m && m.state === 'halftime') this.ui.halftime(); }, 1500);
    }
    if (m.state === 'fulltime' && !this.endShown) {
      this.endShown = true;
      setTimeout(() => { if (this.match === m) this.ui.postMatch(() => this.finishMatch()); }, 2500);
    }
  }
}

// Service worker (offline)
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

const app = new App();
window.__app = app; // útil para depuração
app.init().catch((err) => {
  console.error(err);
  const b = document.getElementById('boot');
  if (b) b.querySelector('.boot-msg').textContent = 'Não foi possível iniciar o jogo (WebGL indisponível?). ' + (err && err.message ? err.message : '');
});
