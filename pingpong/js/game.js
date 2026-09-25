// Orquestrador: modos (partida, carreira, rally infinito, alvos, tutorial),
// fases, física, eventos, câmera, replay, recompensas.
import * as THREE from 'three';
import { TY, L, W, R, clamp, lerp, damp, rnd, pick, gauss } from './const.js';
import { makeBall, stepBall, spinVector, topspinOf } from './physics.js';
import { Trajectory } from './traj.js';
import { Paddle, BallView, PADDLES, BALLS } from './props.js';
import { Character } from './character.js';
import { PlayerController } from './player.js';
import { CpuController } from './ai.js';
import { Referee } from './rules.js';
import { makeShot } from './shots.js';
import { OPPONENTS } from './data.js';
import { CameraRig } from './camera.js';
import { Replay } from './replay.js';

const COACH = {
  id: 'coach', name: 'Treinador Beto', flag: '🧢', style: 'Treino',
  look: { shirt: 0x334155, accent: 0x22d3ee, shorts: 0x0f172a, skin: 0xe0ac69, hair: 0x3f2a14, hairStyle: 'short', beard: true, number: 0, scale: 1.02 },
  ai: { errBase: 0.004, move: 6, react: 0.05, readErr: 0, reach: 1.1, consistency: 0.22, power: [4.5, 6], top: [40, 100], back: 0.05, aggression: 0.3, placement: 0.3, smash: 0, depth: 0.4, spinRead: 1 },
};

export function playerLook(save) {
  const c = save.d.custom || {};
  return {
    shirt: c.shirt ?? 0xf97316, accent: 0xffffff, shorts: c.shorts ?? 0x0f172a, skin: c.skin ?? 0xe0ac69,
    hair: c.hair ?? 0x2b1a10, hairStyle: c.hairStyle ?? 'short', number: 7, name: save.d.name || 'Você', facing: -1, band: c.band ?? null,
  };
}

export class Game {
  constructor(env) {
    Object.assign(this, env);
    this.settings = this.save.s;
    const scene = this.scene;
    this.ball = makeBall();
    this.ballView = new BallView(scene);
    this.traj = new Trajectory();
    this.trajClock = 0;
    this.win = null;
    // jogador
    this.pPaddle = new Paddle(scene, this.equipped('paddle'));
    this.pChar = new Character(scene, playerLook(this.save));
    this.player = new PlayerController(this.pPaddle, this.pChar);
    // adversário
    this.cPaddle = new Paddle(scene, { fore: 0xc81e1e, back: 0x151515, wood: 0x8b5a2b });
    this.opp = OPPONENTS[0];
    this.cChar = new Character(scene, { ...this.opp.look, facing: 1 });
    this.cpu = new CpuController(this.cPaddle, this.cChar, this.opp);
    this.pChar.onStep = () => this.audio.step();
    // máquina de bolas
    this.machine = buildMachine(scene);
    this.machine.visible = false;
    // alvos
    this.targets = [];
    this.targetGroup = new THREE.Group(); scene.add(this.targetGroup);

    this.cam = new CameraRig(this.camera);
    this.replay = new Replay();
    this.mode = 'menu';
    this.phase = 'idle';
    this.timer = 0;
    this.timeScale = 1;
    this.slow = 0;
    this.hitstop = 0;
    this.t = 0;
    this.applySkins();
    this.resetPositions();
  }

  equipped(kind) {
    const id = this.save.d.equip[kind];
    if (kind === 'paddle') return PADDLES.find(p => p.id === id) || PADDLES[0];
    if (kind === 'ball') return BALLS.find(p => p.id === id) || BALLS[0];
    return id;
  }
  applySkins() {
    this.pPaddle.setSkin(this.equipped('paddle'));
    this.ballView.setSkin(this.equipped('ball'));
    this.arena.setTableColor(this.equipped('table'));
  }
  rebuildPlayer() {
    const pos = this.pChar.pos.clone();
    this.pChar.dispose();
    this.pChar = new Character(this.scene, playerLook(this.save));
    this.pChar.onStep = () => this.audio.step();
    this.pChar.pos.copy(pos);
    this.player.char = this.pChar; this.player.body = this.pChar.pos; this.player.bodyVel = this.pChar.vel;
  }
  setOpponent(p) {
    this.opp = p;
    this.cChar.dispose();
    this.cChar = new Character(this.scene, { ...p.look, facing: 1 });
    this.cpu.char = this.cChar; this.cpu.body = this.cChar.pos; this.cpu.bodyVel = this.cChar.vel;
    this.cpu.setProfile(p);
    const col = p.look.accent ?? 0xc81e1e;
    this.cPaddle.setSkin({ fore: p.id === 'coach' ? 0x22d3ee : 0xc81e1e, back: 0x151515, wood: 0x8b5a2b, glow: p.id === 'wang' ? 0x000000 : 0 });
  }
  resetPositions() {
    this.player.pad.set(0.25, TY + 0.2, L + 0.45);
    this.pChar.place(0.25 - 0.36, L + 0.87);
    this.cpu.pad.set(-0.25, TY + 0.2, -(L + 0.5));
    this.cChar.place(-0.25 + 0.36, -(L + 0.92));
    this.player.follow = this.cpu.follow = null;
    this.pChar.celebrate = this.cChar.celebrate = 0;
    this.pChar.sad = this.cChar.sad = 0;
  }

  // ═══════════ Início de modos ═══════════
  startMatch({ opponent, games, career = false }) {
    this.mode = 'match';
    this.career = career;
    this.setOpponent(opponent);
    this.cChar.setVisible(true); this.machine.visible = false;
    this.clearTargets();
    this.ref = new Referee({ gamesToWin: games });
    this.ref.onPoint = (w, info) => this.onPoint(w, info);
    this.ref.gameStarter = Math.random() < 0.5 ? 0 : 1;
    this.ref.server = this.ref.gameStarter;
    this.session = { xp: 0, coins: 0, pointsWon: 0, pointsLost: 0, perfects: 0, smashes: 0, maxCombo: 0, combo: 0, longest: 0, kmhMax: 0, aces: 0 };
    this.lastReplayPoint = -9;
    this.resetPositions();
    this.updateBoard();
    this.ui.hud(true, 'match');
    this.phase = 'intro'; this.timer = 3.2;
    this.cam.intro(this);
    this.ui.vsCard(this.save.d.name || 'Você', opponent, games, career);
    this.audio.stopMusic();
    this.audio.crowdTension(0.2);
    this.arena.cheer(1); this.audio.applause(1.1, 2.6);
  }

  startRally() {
    this.mode = 'rally';
    this.setOpponent(JSON.parse(JSON.stringify(COACH)));
    this.cChar.setVisible(true); this.machine.visible = false;
    this.clearTargets();
    this.newChallengeRef();
    this.session = { xp: 0, coins: 0, hits: 0, score: 0, combo: 0, maxCombo: 0, perfects: 0, lives: 3, smashes: 0, kmhMax: 0 };
    this.resetPositions();
    this.ui.hud(true, 'rally');
    this.ui.rallyHud(this.session);
    this.ui.flash('RALLY INFINITO', 'Devolva o máximo que conseguir · 3 vidas', '#fb923c');
    this.phase = 'serve'; this.prepareServe(0);
    this.audio.stopMusic();
  }

  startTargets() {
    this.mode = 'targets';
    this.cChar.setVisible(false); this.machine.visible = true;
    this.newChallengeRef();
    this.session = { xp: 0, coins: 0, score: 0, combo: 0, maxCombo: 0, perfects: 0, hits: 0, time: 60, smashes: 0, kmhMax: 0 };
    this.resetPositions();
    this.cpu.pad.set(0, -5, -5);
    this.spawnTargets();
    this.ui.hud(true, 'targets');
    this.ui.targetsHud(this.session);
    this.ui.flash('DESAFIO DOS ALVOS', '60 segundos · alvos menores valem mais', '#fbbf24');
    this.phase = 'machine'; this.timer = 1.6;
    this.audio.stopMusic();
  }

  startTutorial() {
    this.mode = 'tutorial';
    this.cChar.setVisible(false); this.machine.visible = true;
    this.clearTargets();
    this.newChallengeRef();
    this.session = { xp: 0, coins: 0, step: 0, count: 0, combo: 0, maxCombo: 0, perfects: 0, smashes: 0, kmhMax: 0 };
    this.resetPositions();
    this.cpu.pad.set(0, -5, -5);
    this.ui.hud(true, 'tutorial');
    this.input.moved = 0;
    this.tutStep(0);
    this.audio.stopMusic();
  }

  newChallengeRef() {
    this.ref = new Referee({ gamesToWin: 99 });
    this.ref.onPoint = (w, info) => this.onChallengePoint(w, info);
  }

  toMenu() {
    this.mode = 'menu'; this.phase = 'idle';
    this.clearTargets();
    this.machine.visible = false;
    this.cChar.setVisible(true);
    if (this.opp.id === 'coach') this.setOpponent(OPPONENTS[Math.min(this.save.d.career, OPPONENTS.length - 1)]);
    this.resetPositions();
    this.ball.x = 0.2; this.ball.y = TY + 0.4; this.ball.z = 0; this.ball.vx = this.ball.vy = this.ball.vz = 0;
    this.ui.hud(false);
    this.audio.crowdTension(0);
    this.audio.startMusic();
  }

  // ═══════════ Saque ═══════════
  prepareServe(server) {
    const b = this.ball;
    b.vx = b.vy = b.vz = b.wx = b.wy = b.wz = 0;
    this.ref.startServe(server);
    this.win = null;
    this.ballView.clearTrail();
    this.player.serveState = null; this.cpu.serveState = null;
    this.pChar.freeHand = null; this.cChar.freeHand = null;
    this.pChar.celebrate = this.cChar.celebrate = 0; this.pChar.sad = this.cChar.sad = 0;
    if (server === 0) {
      this.player.beginServe(this);
      this.ui.hint(this.input.touch ? 'Toque para lançar a bola · deslize ao bater (↓ cortado · ↔ lateral · ↑ longo)' : 'Clique/espaço para lançar · mova o mouse ao bater (↓ cortado · ↔ lateral · ↑ longo)');
    } else {
      this.cpu.beginServe(this);
      this.ui.hint(null);
    }
    this.input.consumePress();
    this.replay.start();
    this.phase = 'serve';
    if (this.mode === 'match') this.announcePressure();
  }

  onToss(side) { this.audio.whoosh(0.4); this.ui.hint(null); }

  onServe(side, info) {
    this.ref.serveHit(side);
    this.phase = 'play';
    this.audio.paddle(0.35, side === 0 ? 0 : 0, Math.abs(info.side || 0) > 60);
    this.fx.hitFlash(this.ball.x, this.ball.y, this.ball.z, 0.3);
    if (side === 0) this.ui.shotLabel(`${info.label}`, `${Math.round(info.kmh)} km/h`, info.color || '#fde68a', this.ball);
    this.replay.event('hit', 0.35);
    this.recomputeTraj();
    if (side === 0) this.cpu.replan(this, 'serve');
  }

  // ═══════════ Batidas ═══════════
  onStrike(side, info) {
    const ref = this.ref;
    ref.hit(side, info.kind);
    const p = clamp((info.kmh - 20) / 40, 0, 1);
    this.audio.paddle(p, side === 0 ? 0.1 : -0.1, Math.abs(info.top) > 150);
    this.audio.whoosh(p);
    this.fx.hitFlash(this.ball.x, this.ball.y, this.ball.z, p);
    if (info.kind === 'smash') this.hitstop = 0.09; else if (info.perfect) this.hitstop = 0.05;
    this.fx.burst(this.ball.x, this.ball.y, this.ball.z, info.perfect ? 0xfbbf24 : 0xffe2b0, 6 + Math.round(p * 16), 1 + p * 2, 0.35);
    this.replay.event('hit', p);
    const s = this.session;
    if (side === 0) {
      s.kmhMax = Math.max(s.kmhMax || 0, info.kmh);
      if (this.settings.vibrate !== false && navigator.vibrate) { try { navigator.vibrate(info.kind === 'smash' ? 35 : info.perfect ? 20 : 10); } catch {} }
      if (this.mode === 'targets') { if (info.perfect) { s.perfects++; this.save.d.stats.perfects++; this.audio.perfect(); } }
      else if (info.perfect) { s.combo++; s.perfects++; this.save.d.stats.perfects++; this.audio.perfect(); }
      else s.combo = 0;
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      if (info.kind === 'smash') { s.smashes = (s.smashes || 0) + 1; }
      const extra = info.perfect ? (s.combo >= 3 ? `PERFEITO x${s.combo}` : 'PERFEITO!') : '';
      this.ui.shotLabel(info.label, `${Math.round(info.kmh)} km/h`, info.color, this.ball, extra);
      this.ui.combo(s.combo);
      if (info.kind === 'smash') { this.cam.shake(0.08); }
      if (this.mode === 'rally') {
        s.hits++;
        // o treinador acelera a cada batida
        const k = Math.min(1, s.hits / 60), ai = this.cpu.ai;
        ai.power = [4.5 + k * 4.5, 6 + k * 6];
        ai.aggression = 0.3 + k * 0.5; ai.placement = 0.3 + k * 0.6; ai.smash = k * 0.5;
        if (s.hits % 10 === 0) { this.ui.flash(`${s.hits} BATIDAS!`, 'O treinador acelerou', '#fbbf24', 1); this.audio.cheer(0.6); this.arena.cheer(0.8); }
      }
      if (this.mode === 'tutorial') this.tutOnHit(info);
    } else {
      if (info.kind === 'smash') this.cam.shake(0.04);
    }
    if (this.mode === 'match') this.audio.crowdTension(clamp(ref.rally / 14, 0, 1));
    this.recomputeTraj();
    if (side === 0) this.cpu.replan(this, 'hit');
    this.ui.spin(null);
  }

  recomputeTraj() {
    this.traj.compute(this.ball);
    this.trajClock = 0;
    this.computeWindow();
    // indicador de efeito para bola vindo ao jogador
    if (this.ref.live && this.ref.hitter === 1) {
      const top = topspinOf(this.ball);
      this.ui.spin({ top, side: this.ball.wy, speed: Math.hypot(this.ball.vx, this.ball.vy, this.ball.vz) });
    }
  }
  computeWindow() {
    const ref = this.ref, T = this.traj;
    this.win = null;
    if (!ref.live) return;
    const rcv = 1 - ref.hitter;
    let from = null;
    const bb = T.bounces;
    if (ref.legal) from = -1;
    else if (ref.serving) {
      if (ref.serveBounces === 0) { if (bb[0] && bb[0].side === ref.hitter && bb[1] && bb[1].side === rcv) from = bb[1].i; }
      else if (bb[0] && bb[0].side === rcv) from = bb[0].i;
    } else if (bb[0] && bb[0].side === rcv) from = bb[0].i;
    if (from === null) return;
    const z0 = rcv === 0 ? this.player.pad.z : this.cpu.desired.z;
    const w = T.window(rcv, from, z0);
    this.win = { ...w, from };
  }

  // ═══════════ Pontos ═══════════
  onPoint(winner, info) {
    const s = this.session, ref = this.ref;
    this.phase = 'point';
    this.timer = 1.7;
    this.ui.hint(null); this.ui.spin(null); this.ui.banner(null);
    this.pendingInfo = info;
    if (winner === -1) { this.ui.flash('LET', 'Bola tocou a rede no saque — repetir', '#e5e7eb'); this.audio.say('Let'); return; }
    const me = winner === 0;
    this.save.d.stats.points += me ? 1 : 0;
    if (me) { s.pointsWon++; s.xp += 3; } else { s.pointsLost++; s.combo = 0; this.ui.combo(0); }
    s.longest = Math.max(s.longest, info.rally);
    if (info.rally >= 20) this.save.unlock('rally20');
    let title = me ? 'PONTO!' : `Ponto — ${this.opp.name}`;
    let sub = info.reason || '';
    if (info.ace) { sub = 'ACE!'; if (me) { s.aces++; this.save.unlock('ace'); } }
    if (info.edge) { sub = 'Bola na fita!'; if (me) this.save.unlock('edge'); }
    if (info.winnerKind === 'smash') { sub = 'Smash vencedor!'; if (me) { this.save.d.stats.smashes++; if (this.save.d.stats.smashes >= 50) this.save.unlock('smash50'); } }
    if (info.rally >= 8 && !info.ace) sub += (sub ? ' · ' : '') + `Rally de ${info.rally}`;
    this.ui.flash(title, sub, me ? '#fb923c' : '#38bdf8');
    // reações
    const big = info.rally >= 8 || info.winnerKind === 'smash' || info.edge || info.ace;
    if (me) { this.pChar.celebrate = big ? 1 : 0.5; this.cChar.sad = 0.6; }
    else { this.cChar.celebrate = big ? 1 : 0.5; this.pChar.sad = 0.6; }
    const faultish = /inválido|fora|próprio|alcançou/i.test(info.reason || '') && !big;
    if (faultish && !me) this.audio.groan(); else this.audio.cheer(big ? 1.1 : 0.6);
    this.arena.cheer(big ? 1.4 : 0.7);
    this.audio.crowdTension(0.1);
    // replay
    const worth = this.settings.replays !== false && (info.matchOver || (me && info.winnerKind === 'smash') || info.rally >= 10 || info.edge || (me && info.ace));
    this.pendingReplay = worth && this.replay.frames.length > 30;
    if (info.matchOver) { this.timer = 2.2; this.slow = 1.2; }
    // placar
    this.updateBoard();
    const [a, b] = ref.score;
    // grito do adversário em pontos bonitos
    const shout = !me && this.opp.shouts && (big || Math.random() < 0.2);
    if (shout) this.audio.say(pick(this.opp.shouts), { ...this.opp.voice });
    setTimeout(() => {
      if (info.gameOver) this.audio.say(`Game. ${info.gameScore[0]} a ${info.gameScore[1]}`, { queue: shout });
      else {
        const srv = ref.computeServer();
        this.audio.say(`${ref.score[srv]} a ${ref.score[1 - srv]}`, { queue: shout });
      }
    }, 650);
    if (info.gameOver) {
      if (info.gameWinner === 0) { s.xp += 20; if (info.bagel) this.save.unlock('bagel'); if (info.comeback) this.save.unlock('comeback'); }
    }
  }

  announcePressure() {
    const pr = this.ref.pressure();
    if (!pr.length) { this.ui.banner(null); return; }
    const p = pr[0];
    const txt = p.match ? 'MATCH POINT' : 'GAME POINT';
    this.ui.banner(txt, p.side === 0 ? '#fb923c' : '#38bdf8');
  }

  afterPoint() {
    const info = this.pendingInfo;
    if (this.pendingReplay) { this.pendingReplay = false; this.startReplay(); return; }
    if (this.mode !== 'match') return;
    if (info && info.let) { this.resetPositionsSoft(); this.prepareServe(this.ref.server); return; }
    if (info && info.matchOver) return this.endMatch(info.matchWinner);
    if (info && info.gameOver) {
      this.ui.flash(info.gameWinner === 0 ? 'GAME SEU!' : `GAME — ${this.opp.name}`, `${info.gameScore[0]} × ${info.gameScore[1]} · games ${this.ref.games[0]}–${this.ref.games[1]}`, info.gameWinner === 0 ? '#34d399' : '#f87171', 2.2);
      this.ref.advance(info);
      this.updateBoard();
      this.phase = 'between'; this.timer = 2.4;
      return;
    }
    this.ref.advance(info);
    this.updateBoard();
    this.prepareServe(this.ref.server);
  }
  resetPositionsSoft() { this.player.follow = this.cpu.follow = null; }

  updateBoard() {
    const r = this.ref;
    if (!r || this.mode !== 'match') return;
    this.ui.board({ names: [this.save.d.name || 'Você', this.opp.name], flags: ['🙂', this.opp.flag], score: r.score, games: r.games, gamesToWin: r.gamesToWin, server: r.live || this.phase === 'serve' ? r.server : r.computeServer() });
    this.arena.setScoreboard(this.save.d.name || 'Você', this.opp.name, r.score[0], r.score[1], r.games[0], r.games[1]);
  }

  endMatch(winner) {
    this.phase = 'over';
    const s = this.session, d = this.save.d, opp = this.opp;
    const won = winner === 0;
    d.stats.played++;
    let coins = Math.round(s.pointsWon * 2);
    let xp = s.xp;
    if (won) {
      d.stats.wins++;
      xp += opp.xp;
      const idx = OPPONENTS.indexOf(opp);
      const firstTime = this.career && idx === d.career;
      coins += firstTime ? opp.reward : Math.round(opp.reward * 0.35);
      if (firstTime) d.career = Math.min(OPPONENTS.length, d.career + 1);
      this.save.unlock('first_win');
      if (opp.id === 'wang' && this.career) this.save.unlock('career');
      this.audio.jingle(true); this.audio.cheer(1.5);
      this.pChar.celebrate = 1.2;
    } else {
      d.stats.losses++;
      xp += Math.round(opp.xp * 0.25);
      this.audio.jingle(false);
      this.pChar.sad = 1;
    }
    d.stats.bestCombo = Math.max(d.stats.bestCombo, s.maxCombo);
    if (s.maxCombo >= 10) this.save.unlock('combo10');
    if (d.stats.perfects >= 100) this.save.unlock('perfect100');
    const lvlUp = this.save.addXP(xp);
    this.save.addCoins(coins);
    this.ui.hud(false);
    setTimeout(() => this.ui.results({
      won, title: won ? 'VITÓRIA!' : 'DERROTA',
      sub: `${this.ref.games[0]} × ${this.ref.games[1]} contra ${opp.flag} ${opp.name}`,
      rows: [['Pontos ganhos', s.pointsWon], ['Maior rally', s.longest], ['Maior combo', `x${s.maxCombo}`], ['Batida mais forte', `${Math.round(s.kmhMax)} km/h`], ['Aces', s.aces]],
      xp, coins, lvlUp, career: this.career, nextUnlocked: won && this.career && OPPONENTS[d.career] ? OPPONENTS[d.career] : null,
      again: () => this.startMatch({ opponent: opp, games: this.ref.gamesToWin, career: this.career }),
    }), 900);
  }

  // ═══════════ Desafios ═══════════
  onChallengePoint(winner, info) {
    const s = this.session;
    this.phase = 'point'; this.timer = 1.1;
    this.pendingInfo = info;
    if (winner === -1) { this.timer = 0.8; return; }
    if (this.mode === 'targets' && winner === 1) { s.combo = 0; this.ui.combo(0); }
    if (this.mode === 'tutorial' && winner === 1 && TUTORIAL[s.step]?.serve) this.ui.flash('Saque inválido', 'Tente de novo', '#fbbf24', 1);
    if (this.mode === 'rally') {
      if (winner === 0) {
        // treinador errou: bônus
        s.score += 50; this.ui.flash('+50', 'O treinador errou!', '#34d399', 1.2);
      } else {
        s.lives--; s.combo = 0; this.ui.combo(0);
        this.ui.flash(s.lives > 0 ? `Vidas: ${s.lives}` : 'FIM!', info.reason || '', '#f87171', 1.2);
        this.audio.groan();
        if (s.lives <= 0) { this.timer = 1.4; this.endChallenge(); return; }
      }
      this.ui.rallyHud(s);
    }
  }

  afterChallengePoint() {
    if (this.phase === 'over') return;
    if (this.mode === 'rally') { this.prepareServe(0); return; }
    if (this.mode === 'tutorial' && TUTORIAL[this.session.step]?.serve) { this.prepareServe(0); return; }
    if (this.mode === 'targets' || this.mode === 'tutorial') { this.phase = 'machine'; this.timer = this.mode === 'tutorial' ? 1.1 : 0.55; }
  }

  // Máquina de bolas
  feed(opts = {}) {
    const b = this.ball;
    const m = this.machine.userData.mouth;
    b.x = m.x + rnd(-0.02, 0.02); b.y = m.y; b.z = m.z;
    const kind = opts.kind || pick(['drive', 'drive', 'loop', 'push', 'chop', 'block']);
    const lvl = opts.level ?? 0.4;
    b.vx = 0; b.vy = 0; b.vz = 3; b.wx = b.wy = b.wz = 0;
    const aimX = opts.aimX ?? rnd(-0.8, 0.8);
    makeShot({ ball: b, side: 1, kind, power: opts.power ?? rnd(0.1, 0.4) + lvl * 0.4, aimX, depth: opts.depth ?? rnd(0.55, 0.95), quality: 1, consistency: 0.2, spinRead: 1 });
    this.ref.reset(); this.ref.live = true; this.ref.hitter = 1; this.ref.legal = false; this.ref.serving = false; this.ref.rally = 1;
    this.phase = 'play';
    this.audio.tone && this.audio.noise(0.08, { type: 'lowpass', freq: 500, vol: 0.3 });
    this.audio.paddle(0.2);
    this.ballView.clearTrail();
    this.recomputeTraj();
  }

  spawnTargets() {
    this.clearTargets();
    const defs = [{ r: 0.22, pts: 50, c: 0x34d399 }, { r: 0.16, pts: 100, c: 0xfbbf24 }, { r: 0.1, pts: 200, c: 0xf87171 }];
    for (const d of defs) this.addTarget(d);
  }
  addTarget(d, fixed) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(d.r * 0.78, d.r, 40), new THREE.MeshBasicMaterial({ color: d.c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false , polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.78, 40), new THREE.MeshBasicMaterial({ color: d.c, transparent: true, opacity: 0.22, depthWrite: false , polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }));
    const dot = new THREE.Mesh(new THREE.CircleGeometry(d.r * 0.2, 24), new THREE.MeshBasicMaterial({ color: d.c, transparent: true, opacity: 0.8, depthWrite: false , polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -12 }));
    for (const m of [ring, fill, dot]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    ring.position.y = fill.position.y = dot.position.y = TY + 0.002;
    const t = { ...d, g, x: 0, z: 0 };
    this.placeTarget(t, fixed);
    this.targetGroup.add(g);
    this.targets.push(t);
    return t;
  }
  placeTarget(t, fixed) {
    for (let k = 0; k < 20; k++) {
      t.x = fixed ? fixed.x : rnd(-W + t.r + 0.02, W - t.r - 0.02);
      t.z = fixed ? fixed.z : -rnd(0.2 + t.r, L - t.r - 0.02);
      if (fixed || !this.targets.some(o => o !== t && Math.hypot(o.x - t.x, o.z - t.z) < o.r + t.r + 0.05)) break;
    }
    t.g.position.set(t.x, 0, t.z);
    t.pop = 0.4;
  }
  clearTargets() {
    for (const t of this.targets) this.targetGroup.remove(t.g);
    this.targets.length = 0;
  }
  checkTargets(x, z) {
    for (const t of this.targets) {
      if (Math.hypot(x - t.x, z - t.z) <= t.r) {
        const s = this.session;
        s.combo++; s.maxCombo = Math.max(s.maxCombo, s.combo);
        const mult = 1 + Math.floor(s.combo / 3);
        const pts = t.pts * mult;
        s.score += pts; s.hits++;
        this.fx.burst(x, TY + 0.02, z, t.c, 26, 2.2, 0.6);
        this.fx.ring(x, TY + 0.004, z, t.c, t.r * 2.2, 0.6);
        this.audio.target();
        this.ui.shotLabel(`+${pts}`, mult > 1 ? `combo x${mult}` : '', '#' + t.c.toString(16).padStart(6, '0'), { x, y: TY + 0.1, z });
        this.ui.combo(s.combo);
        this.placeTarget(t);
        return t;
      }
    }
    return null;
  }

  endChallenge() {
    this.phase = 'over';
    const s = this.session, d = this.save.d, st = d.stats;
    let rows, title, best, xp, coins, isRec = false;
    if (this.mode === 'rally') {
      isRec = s.hits > st.rallyBest;
      st.rallyBest = Math.max(st.rallyBest, s.hits);
      if (s.hits >= 50) this.save.unlock('rally50');
      xp = 10 + s.hits * 2; coins = Math.round(s.hits * 2.5 + s.score / 40);
      title = isRec ? 'NOVO RECORDE!' : 'Fim do rally';
      rows = [['Batidas', s.hits], ['Pontos bônus', s.score], ['Maior combo', `x${s.maxCombo}`], ['Recorde', st.rallyBest]];
    } else {
      isRec = s.score > st.targetsBest;
      st.targetsBest = Math.max(st.targetsBest, s.score);
      if (s.score >= 1500) this.save.unlock('targets');
      xp = 10 + Math.round(s.score / 25); coins = Math.round(s.score / 12);
      title = isRec ? 'NOVO RECORDE!' : 'Tempo esgotado!';
      rows = [['Pontos', s.score], ['Alvos', s.hits], ['Maior combo', `x${s.maxCombo}`], ['Recorde', st.targetsBest]];
    }
    st.bestCombo = Math.max(st.bestCombo, s.maxCombo);
    const lvlUp = this.save.addXP(xp);
    this.save.addCoins(coins);
    this.audio.jingle(isRec);
    if (isRec) this.audio.cheer(1);
    this.ui.hud(false);
    const mode = this.mode;
    setTimeout(() => this.ui.results({ won: isRec, title, sub: mode === 'rally' ? 'Rally infinito' : 'Desafio dos alvos', rows, xp, coins, lvlUp, again: () => mode === 'rally' ? this.startRally() : this.startTargets() }), 700);
  }

  // ═══════════ Tutorial ═══════════
  tutStep(i) {
    const S = this.session;
    S.step = i; S.count = 0;
    const steps = TUTORIAL;
    if (i >= steps.length) {
      this.phase = 'over';
      const first = !this.save.d.tutorial;
      this.save.d.tutorial = true;
      const coins = first ? 300 : 0;
      this.save.addCoins(coins);
      const lvlUp = this.save.addXP(first ? 80 : 10);
      this.ui.hud(false);
      this.ui.results({ won: true, title: 'Treino concluído!', sub: 'Agora você sabe tudo. Hora da carreira!', rows: [['Golpes aprendidos', 'Topspin, corte, mira, smash, saque']], xp: first ? 80 : 10, coins, lvlUp, again: () => this.startTutorial() });
      return;
    }
    const st = steps[i];
    this.ui.tutorial(st.text, i + 1, steps.length, st.need ? `0 / ${st.need}` : '');
    this.clearTargets();
    if (st.target) this.addTarget({ r: 0.2, pts: 0, c: 0xfbbf24 }, st.target);
    if (st.serve) { this.phase = 'serve'; this.prepareServe(0); }
    else if (st.feed) { this.phase = 'machine'; this.timer = 1.4; }
    else this.phase = 'idleTut';
  }
  tutProgress() {
    const S = this.session, st = TUTORIAL[S.step];
    S.count++;
    this.ui.tutorial(st.text, S.step + 1, TUTORIAL.length, `${S.count} / ${st.need}`);
    this.audio.ui('coin');
    if (S.count >= st.need) {
      this.ui.flash('Muito bem!', '', '#34d399', 1);
      setTimeout(() => this.tutStep(S.step + 1), 1300);
      S.lock = true; setTimeout(() => (S.lock = false), 1300);
    }
  }
  tutOnHit(info) { this.session.lastKind = info.kind; }
  tutOnReturn(x, z) {
    const S = this.session; if (S.lock) return;
    const st = TUTORIAL[S.step];
    if (!st || !st.feed) return;
    if (st.kinds && !st.kinds.includes(S.lastKind)) { this.ui.flash('Quase!', st.wrong || '', '#fbbf24', 1.2); return; }
    if (st.target) { if (!this.targets.length || Math.hypot(x - this.targets[0].x, z - this.targets[0].z) > this.targets[0].r) { this.ui.flash('Passou longe', 'Deslize para o lado na batida', '#fbbf24', 1); return; } this.fx.burst(x, TY, z, 0xfbbf24, 20, 2); }
    this.tutProgress();
  }

  // ═══════════ Replay ═══════════
  startReplay() {
    this.phase = 'replay';
    this.replay.play();
    this.ui.replay(true);
    this.cam.replayStart();
    this.ballView.clearTrail();
    this.input.consumePress();
  }
  endReplay() {
    this.ui.replay(false);
    this.replay.stop();
    this.phase = 'point'; this.timer = 0.01;
    this.pendingReplay = false;
    this.ballView.clearTrail();
  }

  // ═══════════ Loop ═══════════
  update(dt) {
    this.t += dt;
    const t = this.t;
    this.input.update(dt);
    if (this.mode === 'menu') { this.menuIdle(dt, t); return; }

    if (this.phase === 'replay') {
      const f = this.replay.step(dt * 0.45);
      if (!f || this.input.consumePress()) { this.endReplay(); return; }
      this.applyFrame(f, dt);
      this.cam.update(dt, this);
      return;
    }

    // slow motion no ponto final
    this.slow = Math.max(0, this.slow - dt);
    this.timeScale = damp(this.timeScale, this.slow > 0 ? 0.3 : 1, 6, dt);

    // controles
    const live = this.phase === 'play' || this.phase === 'serve';
    if (live || this.phase === 'machine' || this.phase === 'idleTut' || this.phase === 'point' || this.phase === 'between' || this.phase === 'intro') {
      this.player.update(dt, this, t);
      if (this.mode !== 'targets' && this.mode !== 'tutorial') this.cpu.update(dt, this, t);
    }

    // física
    let hs = 1;
    if (this.hitstop > 0) { this.hitstop -= dt; hs = 0.12; }
    if (this.phase !== 'intro') this.physics(dt * this.settings.speed * this.timeScale * hs);

    // temporizadores de fase
    if (this.phase === 'intro') { this.timer -= dt; if (this.timer <= 0) { this.ui.vsCard(null); this.prepareServe(this.ref.server); } }
    else if (this.phase === 'point') {
      this.timer -= dt;
      if (this.timer <= 0) { if (this.mode === 'match') this.afterPoint(); else if (this.pendingReplay) { this.pendingReplay = false; this.startReplay(); } else this.afterChallengePoint(); }
    } else if (this.phase === 'between') { this.timer -= dt; if (this.timer <= 0) this.prepareServe(this.ref.server); }
    else if (this.phase === 'machine') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.mode === 'targets') {
          const lvl = clamp((60 - this.session.time) / 60, 0, 1);
          this.feed({ level: lvl, kind: pick(lvl > 0.5 ? ['drive', 'loop', 'chop', 'push', 'loop'] : ['drive', 'block', 'push', 'drive']) });
        } else if (this.mode === 'tutorial') {
          const st = TUTORIAL[this.session.step];
          if (st && st.feed) this.feed({ ...st.feed, aimX: st.feed.aimX ?? rnd(-0.5, 0.5) });
        }
      }
    }
    if (this.mode === 'targets' && this.phase !== 'over') {
      this.session.time -= dt;
      this.ui.targetsHud(this.session);
      if (this.session.time <= 0) { this.session.time = 0; this.ref.live = false; this.endChallenge(); }
    }
    if (this.mode === 'tutorial' && this.phase === 'idleTut') {
      if (TUTORIAL[this.session.step].check?.(this) && !this.session.lock) { this.session.lock = true; this.ui.flash('Isso!', '', '#34d399', 0.9); setTimeout(() => { this.session.lock = false; this.tutStep(this.session.step + 1); }, 900); }
    }

    // gravação de replay
    if (this.phase === 'play' || this.phase === 'serve' || (this.phase === 'point' && this.timer > 1.0)) this.replay.record(this, dt);

    this.poseAll(dt, t);
    this.cam.update(dt, this);
  }

  physics(dt) {
    const n = 6, h = dt / n, b = this.ball, ref = this.ref, ev = this._ev || (this._ev = {});
    for (let i = 0; i < n; i++) {
      const prevZ = b.z;
      ev.bounce = null; ev.net = ev.netCord = ev.floor = false;
      stepBall(b, h, ev);
      this.trajClock += h;
      if (ev.net || ev.netCord) {
        this.audio.net(ev.netCord); this.arena.netWobble = 1; this.replay.event('net', ev.netCord ? 1 : 0);
        ref && ref.net(ev.netCord);
        this.recomputeTraj();
        if (this.mode !== 'targets' && this.mode !== 'tutorial') this.cpu.replan(this, 'net');
      }
      if (ev.bounce !== null) {
        this.audio.table(ev.bspeed, clamp(ev.bx, -1, 1));
        this.fx.ring(ev.bx, TY + 0.003, ev.bz, 0xffffff, 0.09, 0.35);
        this.replay.event('bounce', ev.bspeed);
        if (ref) {
          const res = ref.bounce(ev.bounce);
          if (res === 'legal' && ev.bounce === 1 && ref.hitter === 0) {
            if (this.mode === 'targets') { if (!this.checkTargets(ev.bx, ev.bz)) { this.session.combo = 0; this.ui.combo(0); } }
            if (this.mode === 'tutorial') this.tutOnReturn(ev.bx, ev.bz);
            if (this.mode === 'rally') { const s = this.session; s.score += 10 * (1 + Math.floor(s.combo / 3)); this.ui.rallyHud(s); }
            if (this.mode === 'tutorial' && TUTORIAL[this.session.step]?.serve && ref.rally === 1) this.tutProgress();
          }
          if (res === 'legal' && ev.bounce === 1 && ref.hitter === 0 && ref.rally === 1 && this.mode === 'tutorial') { /* saque */ }
        }
        this.recomputeTraj();
        if (this.mode !== 'targets' && this.mode !== 'tutorial' && ev.bounce === 1 && this.ref && this.ref.live && this.ref.hitter === 0) this.cpu.replan(this, 'bounce');
      }
      if (ev.floor) {
        this.audio.floor(ev.fvy);
        if (ref && ref.live) ref.out();
      }
      if (ref && ref.live && (b.y < TY - 0.3 || Math.abs(b.z) > L + 3.2 || Math.abs(b.x) > 3.4)) ref.out();
      if (ref && ref.live && this.phase === 'play' && ref.hitter === 0 && ref.legal && (this.mode === 'targets' || this.mode === 'tutorial')) {
        // máquina não devolve: encerra a jogada ao passar da mesa
        if (b.z < -L - 0.2) { ref.live = false; this.phase = 'point'; this.timer = 0.4; this.pendingInfo = null; }
      }
      if (this.phase === 'play' && ref && ref.live) {
        if (!this.player.tryHit(this, prevZ) && this.mode !== 'targets' && this.mode !== 'tutorial') this.cpu.tryHit(this, prevZ);
      }
    }
    // tutorial/alvos: bola perdida encerra a jogada
    if (ref && !ref.live && this.phase === 'play' && (this.mode === 'targets' || this.mode === 'tutorial')) { this.phase = 'point'; this.timer = 0.5; }
  }

  poseAll(dt, t) {
    const look = this._look || (this._look = new THREE.Vector3());
    look.set(this.ball.x, this.ball.y, this.ball.z);
    const ready = this.phase === 'play';
    this.pChar.setGhost(this.mode !== 'menu' && this.settings.ghost !== false && this.phase !== 'replay' && this.phase !== 'intro' ? 0.55 : 1);
    this.player.pose(dt, t, look, { crouch: ready ? 0.1 : 0.06 });
    if (this.cChar.root.visible) this.cpu.pose(dt, t, look, { crouch: ready ? 0.1 : 0.06, lean: this.opp.ai.depth > 1 ? 0.2 : 0.3 });
    // alvos pulsando
    for (const tg of this.targets) {
      tg.pop = Math.max(0, (tg.pop || 0) - dt);
      const s = 1 + Math.sin(t * 4 + tg.r * 20) * 0.04 + tg.pop * 0.8;
      tg.g.scale.set(s, 1, s);
    }
    const showTrail = this.settings.trail && (this.phase === 'play' || this.phase === 'point' || this.phase === 'replay');
    this.ballView.update(this.ball, dt, this.camera, showTrail, this.mode !== 'menu' || true);
    // máquina: gira em direção ao próximo alvo
    if (this.machine.visible) this.machine.userData.head.rotation.y = Math.sin(t * 0.8) * 0.3;
    this.pChar.celebrate = Math.max(0, this.pChar.celebrate - dt * 0.35);
    this.cChar.celebrate = Math.max(0, this.cChar.celebrate - dt * 0.35);
    this.pChar.sad = Math.max(0, this.pChar.sad - dt * 0.3);
    this.cChar.sad = Math.max(0, this.cChar.sad - dt * 0.3);
  }

  applyFrame(f, dt) {
    const b = this.ball;
    [b.x, b.y, b.z, b.wx, b.wy, b.wz, b.vx, b.vy, b.vz] = f.b;
    this.player.pad.set(f.p[0], f.p[1], f.p[2]);
    this.cpu.pad.set(f.c[0], f.c[1], f.c[2]);
    this.pChar.pos.set(f.pb[0], 0, f.pb[1]); this.pChar.vel.set(f.pb[2], 0, f.pb[3]);
    this.cChar.pos.set(f.cb[0], 0, f.cb[1]); this.cChar.vel.set(f.cb[2], 0, f.cb[3]);
    this.player.follow = f.pf ? { kind: f.pf[0], t: f.pf[1] - dt } : null;
    this.cpu.follow = f.cf ? { kind: f.cf[0], t: f.cf[1] - dt } : null;
    this.player.forehand = f.ph; this.cpu.forehand = f.ch;
    this.player.ttc = f.pt; this.cpu.ttc = f.ct;
    for (const e of f.ev || []) {
      if (e[0] === 'hit') this.audio.paddle(e[1]);
      else if (e[0] === 'bounce') this.audio.table(e[1]);
      else if (e[0] === 'net') this.audio.net(e[1] > 0);
    }
    this.poseAll(dt, this.t);
  }

  menuIdle(dt, t) {
    // bola "quicando" na mão do jogador na tela inicial
    const b = this.ball;
    this.player.pad.set(0.28 + Math.sin(t * 0.7) * 0.05, TY + 0.2, L + 0.5);
    this.cpu.pad.set(-0.28, TY + 0.22, -(L + 0.5));
    this.player.moveBody(dt, 3); this.cpu.bodyTargetFrom = null; this.cpu.moveBody(dt, 3);
    b.x = 0.28; b.z = L + 0.3;
    b.y = TY + 0.28 + Math.abs(Math.sin(t * 3.2)) * 0.22; b.vx = b.vy = b.vz = 0;
    b.wx = 20; b.wy = 0; b.wz = 0;
    this.poseAll(dt, t);
    this.cam.update(dt, this);
  }
}

// ─── Tutorial ───
const TUTORIAL = [
  { text: '🖐️ Mova o mouse (ou arraste o dedo) para mover a raquete. Para cima/baixo aproxima e afasta da mesa.', check: g => g.input.moved > 2.5 },
  { text: '🏓 Devolva 3 bolas: basta colocar a raquete no caminho. A bola precisa cair do outro lado.', feed: { kind: 'drive', power: 0.1, level: 0 }, need: 3 },
  { text: '🔥 TOPSPIN: deslize PARA CIMA exatamente na hora da batida. Mais rápido = mais forte.', feed: { kind: 'block', power: 0.2, level: 0 }, need: 2, kinds: ['loop', 'smash', 'drive'], wrong: 'Deslize para cima na batida!' },
  { text: '🧊 A máquina vai mandar CORTE (backspin). Deslize PARA BAIXO na batida para dar um push — ou um topspin forte.', feed: { kind: 'push', power: 0.5, level: 0 }, need: 2, kinds: ['push', 'chop', 'loop'], wrong: 'Contra corte: deslize para baixo ou faça topspin' },
  { text: '🎯 MIRA: deslize para o LADO na batida para mandar a bola na direção. Acerte o alvo amarelo!', feed: { kind: 'drive', power: 0.1, level: 0, aimX: 0 }, need: 1, target: { x: -0.45, z: -0.85 } },
  { text: '💥 SMASH: bola alta vindo? Deslize MUITO rápido para cima!', feed: { kind: 'lob', power: 0.4, level: 0 }, need: 1, kinds: ['smash'], wrong: 'Espere a bola alta e deslize rápido para cima' },
  { text: '🎾 SAQUE: toque/clique para lançar a bola; ao descer, deslize: ↓ cortado, ↔ lateral, ↑ longo. Faça 2 saques válidos.', serve: true, need: 2 },
];

function buildMachine(scene) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.5 }));
  const hopper = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 0.25, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  hopper.position.y = 0.27;
  const balls = new THREE.Group();
  for (let i = 0; i < 14; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({ color: i % 3 ? 0xffffff : 0xff8a1f })); s.position.set(rnd(-0.1, 0.1), 0.2 + rnd(0, 0.1), rnd(-0.1, 0.1)); balls.add(s); }
  const head = new THREE.Group(); head.position.set(0, 0.05, 0.15);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4 }));
  tube.rotation.x = Math.PI / 2; tube.position.z = 0.1; head.add(tube);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, TY - 0.05, 12), new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.8, roughness: 0.3 }));
  stand.position.y = -(TY - 0.05) / 2 - 0.15;
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.01), new THREE.MeshBasicMaterial({ color: 0x22c55e }));
  led.position.set(0, 0.06, 0.151);
  g.add(body, hopper, balls, head, stand, led);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.position.set(0, TY + 0.3, -L - 0.25);
  scene.add(g);
  g.userData.head = head;
  g.userData.mouth = new THREE.Vector3(0, TY + 0.36, -L - 0.02);
  return g;
}
