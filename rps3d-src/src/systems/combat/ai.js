// IA de caças por facção.
//
// Modos: patrulha · formação (ala no líder) · lançamento (saindo do hangar)
// · combate (perseguição com antecipação, rajadas, mísseis) · ataque a capital
// (passadas contra torres) · ruptura/afastamento (evita ultrapassar o alvo e
// faz "boom and zoom") · evasão (jinks, pós-combustão, flares/chaff contra
// míssil) · fuga (corsários/guilda com casco baixo saem do combate).
//
// Personalidade (config.FACTION_AI): a Hegemonia voa em pares disciplinados
// e mantém a formação até o líder engajar; os Corsários atacam em bando o
// mesmo alvo; a Frente é agressiva e pouco disciplinada; os Vigilantes são
// precisos, sem medo e sem contramedidas.
//
// O piloto converte uma direção desejada em comandos de manche: "rola e
// puxa" (inclina para pôr o alvo no plano de arfagem e puxa), como um piloto
// real — o que dá curvas inclinadas bonitas em vez de guinadas de robô.
import * as THREE from 'three/webgpu';
import { leadPoint, clamp } from './math.js';
import { CALLSIGNS } from './config.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _want = new THREE.Vector3(), _upRef = new THREE.Vector3();

const CHATTER = {
  hegemonia: { hit: ['Fui atingido, mantendo posição.', 'Escudos baixos!', 'Dano no casco, continuo na formação.'], kill: ['Alvo abatido.', 'Um a menos. Disciplina, Lanças.', 'Abatido. Próximo.'], missile: ['Míssil no ar!', 'Raposa dois!', 'Trava confirmada, disparando.'], evade: ['Míssil na minha cauda, soltando flares!', 'Contramedidas!'], engage: ['Engajando.', 'Contato, interceptando.', 'Formação de ataque, sigam-me.'] },
  frente: { hit: ['Tô sangrando aqui!', 'Escudo foi pro espaço!', 'Acertaram meu motor!'], kill: ['Pegamos um dourado!', 'Isso! Pela colônia!', 'Derrubei!'], missile: ['Lá vai míssil!', 'Toma essa!'], evade: ['Míssil! Míssil! Rompendo!', 'Tirem isso de mim!'], engage: ['Vamos lá, pessoal!', 'Pela Aurora!', 'Eles estão vindo!'] },
  corsarios: { hit: ['Arranhou a pintura, desgraçado!', 'Tô levando chumbo!'], kill: ['Hahaha! Sucata!', 'Mais um pro ferro-velho!', 'Pode saquear esse!'], missile: ['Presente pra você!', 'Míssil fora!'], evade: ['Flares, flares!', 'Sai, sai, sai!'], engage: ['Cerquem ele!', 'Carga fresca, rapazes!', 'Todos em cima dele!'] },
  guilda: { hit: ['Estamos sob fogo! Pedimos ajuda!', 'Casco comprometido!'], kill: ['Ameaça neutralizada.'], missile: ['Disparando.'], evade: ['Manobra evasiva!'], engage: ['Escolta, posições defensivas.'] },
  vigilantes: { hit: [''], kill: [''], missile: [''], evade: [''], engage: [''] },
};

export class FighterAI {
  constructor(ship, sim, o = {}) {
    this.s = ship; this.sim = sim;
    this.mode = o.mode || 'patrol';
    this.leader = o.leader || null;
    this.slot = o.slot ? o.slot.clone() : null;
    this.anchor = o.anchor ? o.anchor.clone() : ship.pos.clone();
    this.patrolR = o.patrolR ?? 1500;
    this.target = o.target || null;
    this.focus = o.focus || null;
    this.launchT = o.launchT ?? 0;
    this.holdFormation = o.holdFormation ?? false; // ala que só engaja com ordem
    this.t = sim.rand() * 10;
    this.retarget = sim.rand() * 1.5;
    this.modeT = 0;
    this.jink = new THREE.Vector3();
    this.jinkT = 0;
    this.extendDir = new THREE.Vector3();
    this.fireHold = 0;
    this.lock = 0;
    this.lastChat = -100;
    this.passes = 0;
    this.evadedMissile = null;
    this.aimErr = new THREE.Vector3();
    this.aimErrT = 0;
    this.aimPoint = new THREE.Vector3();
    ship.ai = this;
    if (!ship.callsign) {
      const list = CALLSIGNS[ship.faction] || ['UNIDADE'];
      ship.callsign = `${list[Math.floor(sim.rand() * list.length)]}-${1 + Math.floor(sim.rand() * 9)}`;
    }
  }

  setMode(m) { if (this.mode !== m) { this.mode = m; this.modeT = 0; } }

  // ─── percepção ─────────────────────────────────────────────────────────
  chooseTarget() {
    const s = this.s, sim = this.sim, P = s.persona;
    // bando: copia o alvo do primeiro corsário que tiver um
    if (P.pack && s.battle) {
      for (const o of sim.ships) {
        if (o !== s && o.alive && o.faction === s.faction && o.ai?.target?.alive && o.pos.distanceTo(s.pos) < 6000) return o.ai.target;
      }
    }
    // ala disciplinada: ataca o alvo do líder
    if (this.leader?.alive && P.discipline > 0.6) {
      const lt = this.leader.isPlayer ? sim.playerTarget : this.leader.ai?.target;
      if (lt?.alive && sim.relations.shipsHostile(s, lt)) return lt;
    }
    if (this.focus?.alive && sim.relations.shipsHostile(s, this.focus)) return this.focus;
    let best = null, bs = Infinity;
    const f = s.fwd(_a);
    for (const o of sim.combatants()) {
      if (!o.alive || o.state === 'dead' || o.state === 'dying' || !sim.relations.shipsHostile(s, o)) continue;
      _b.copy(o.pos).sub(s.pos);
      const d = _b.length();
      if (d > 9000) continue;
      const ang = Math.acos(clamp(_b.divideScalar(d || 1).dot(f), -1, 1));
      let score = d * (1 + ang * 0.6);
      if (o.capital) score *= this.sim.capitalBias ?? 2.2;          // caças preferem caças
      if (o.lastHitBy === s) score *= 0.6;
      if (o.ai?.target === s) score *= 0.55;                          // quem está me caçando
      if (o.isPlayer) score *= s.battle?.playerFocus ?? 0.9;
      if (o.state === 'disabled') score *= 4;
      // não amontoar: alvos já muito disputados ficam menos atraentes (exceto bando)
      if (!P.pack) score *= 1 + (sim.attackers(o) * 0.25);
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }

  chat(kind, force = false) {
    const sim = this.sim, s = this.s;
    if (sim.quiet || s.faction === 'vigilantes') return;
    if (!force && (sim.now - this.lastChat < 9 || sim.now - sim.lastChatter < 3.5)) return;
    const pl = sim.player;
    if (!pl.alive || pl.pos.distanceTo(s.pos) > 5000) return;
    const lines = CHATTER[s.faction]?.[kind];
    if (!lines?.length) return;
    this.lastChat = sim.now; sim.lastChatter = sim.now;
    sim.emit('radio', { faction: s.faction, speaker: s.callsign, text: lines[Math.floor(sim.rand() * lines.length)], priority: 0 });
  }

  // ─── decisão ───────────────────────────────────────────────────────────
  think(dt) {
    const s = this.s, sim = this.sim, P = s.persona;
    this.t += dt; this.modeT += dt;
    if (s.state !== 'ok') return;
    // míssil chegando → evasão (com contramedidas conforme a personalidade)
    const inc = sim.missiles.incoming(s);
    if (inc && inc.dist < 1400 && this.mode !== 'flee') {
      if (this.mode !== 'evade') { this.setMode('evade'); this.chat('evade'); }
      if (this.evadedMissile !== inc.missile && inc.dist < 950) {
        this.evadedMissile = inc.missile;
        if (sim.rand() < P.flares && s.cmCd <= 0) {
          s.cmCd = 1.2;
          sim.missiles.deploy(s, inc.missile.def.seeker === 'ir' ? 'flare' : 'chaff', 2);
        }
      }
    }
    // fuga
    if (P.flee > 0 && s.hullFrac < P.flee && this.mode !== 'flee' && !s.tags.has('nofuga')) { this.setMode('flee'); this.chat('hit', true); }
    if (this.mode === 'launch') { if (this.modeT > this.launchT) this.setMode('engage'); return; }
    if (this.mode === 'evade' && (!inc || inc.dist > 1800) && this.modeT > 1.2) this.setMode('engage');
    if (this.mode === 'extend' && this.modeT > this.extendT) this.setMode('engage');
    if (this.mode === 'break' && this.modeT > 0.9) { this.setMode('extend'); this.extendT = 1.4 + sim.rand() * 1.8 * (1 - P.aggression * 0.6); }
    // alvo
    this.retarget -= dt;
    if (this.retarget <= 0 || (this.target && (!this.target.alive || this.target.state === 'dead' || this.target.state === 'dying' || !sim.relations.shipsHostile(s, this.target)))) {
      this.retarget = 2 + sim.rand() * 2.5;
      const prev = this.target;
      this.target = this.chooseTarget();
      if (this.target && !prev && this.mode !== 'evade') this.chat('engage');
    }
    const formationHold = this.leader?.alive && (this.holdFormation || (P.discipline > 0.85 && !(this.leader.isPlayer ? sim.playerTarget : this.leader.ai?.target)));
    if (this.mode === 'flee' || this.mode === 'evade' || this.mode === 'break' || this.mode === 'extend') return;
    if (formationHold && !(this.target && this.target.pos.distanceTo(s.pos) < 900 && !this.holdFormation)) { this.setMode('form'); return; }
    if (this.target) this.setMode(this.target.capital ? 'strafe' : 'engage');
    else if (this.leader?.alive) this.setMode('form');
    else this.setMode('patrol');
  }

  // ─── pilotagem ─────────────────────────────────────────────────────────
  /** Converte direção desejada (mundo) em comandos. upHint: "cima" preferido quando alinhado. */
  pilot(want, throttle, boost, upHint = null, aggressiveRoll = true) {
    const s = this.s, c = s.ctl;
    const dl = s.dirToLocal(want, _c).normalize();
    const off = Math.acos(clamp(-dl.z, -1, 1));
    const pitchErr = Math.atan2(dl.y, -dl.z);
    const yawErr = Math.atan2(dl.x, -dl.z);
    let roll = 0;
    if (off > 0.45 && aggressiveRoll && s.stats.turn.roll > 1.5) {
      // inclina para colocar o alvo "acima" do canopy e puxa
      const rollErr = Math.atan2(dl.x, dl.y);
      roll = -rollErr * 2.2;
      c.pitch = Math.abs(rollErr) < 0.8 ? clamp(pitchErr * 2.5, -1, 1) : 0.35;
      c.yaw = clamp(-yawErr * 1.5, -1, 1) * 0.3;
    } else {
      c.pitch = clamp(pitchErr * 3.2, -1, 1);
      c.yaw = clamp(-yawErr * 3.2, -1, 1);
      // nivela com o "cima" de referência
      const up = upHint ? s.dirToLocal(upHint, _d) : null;
      if (up) roll = -Math.atan2(up.x, up.y) * 1.4;
    }
    c.roll = clamp(roll, -1, 1);
    c.throttle = throttle; c.boost = boost;
  }

  /** Desvio de colisões (naves próximas, capitais, planeta). Modifica `want`. */
  avoid(want) {
    const s = this.s, sim = this.sim;
    const spd = s.vel.length();
    const look = 60 + spd * 1.6;
    for (const o of sim.combatants()) {
      if (o === s || !o.alive) continue;
      _a.copy(o.pos).sub(s.pos);
      const d = _a.length();
      const R = (o.capital ? o.radius * 0.8 : o.hitR + s.hitR + 25) + look * (o.capital ? 0.5 : 0.25);
      if (d > R + look) continue;
      const ahead = _a.dot(want) / (d || 1);
      if (ahead < -0.2 && d > R * 0.6) continue;
      const k = clamp((R + look * 0.4 - d) / (R * 0.8 + 1), 0, 1.5) * (o.capital ? 2.5 : 1.2);
      if (k <= 0) continue;
      want.addScaledVector(_a.normalize(), -k);
      // contorna por cima (relativo a quem desvia)
      if (o.capital) want.addScaledVector(o.up(_b), k * 0.6);
    }
    const g = sim.ground?.(s.pos);
    if (g && g.alt < 3500) want.addScaledVector(g.up, clamp((3500 - g.alt) / 1500, 0, 3));
    return want.normalize();
  }

  steer(dt) {
    const s = this.s, sim = this.sim, P = s.persona;
    if (s.state !== 'ok') return;
    const T = this.target;
    const f = s.fwd(_e);
    let throttle = 0.8, boost = false, upHint = null, roll = true;
    _want.copy(f);
    switch (this.mode) {
      case 'launch': {
        throttle = 1; boost = true;
        break;
      }
      case 'form': {
        const L = this.leader;
        if (!L?.alive) { this.setMode('patrol'); break; }
        const slot = this.slot || _a.set(30, 0, 30);
        const p = L.toWorld(slot, _b).addScaledVector(L.vel, 0.6);
        _want.copy(p).sub(s.pos);
        const d = _want.length();
        const lf = L.fwd(_c);
        // perto do slot: alinha com o líder; longe: vai para o slot
        const k = clamp(d / 220, 0, 1);
        _want.normalize().multiplyScalar(k).addScaledVector(lf, 1 - k).normalize();
        const ls = L.vel.length();
        const ahead = _a.copy(p).sub(s.pos).dot(lf);
        throttle = clamp(ls / s.stats.speed + ahead / 300, 0.2, 1.1);
        boost = ahead > 600;
        upHint = L.up(_upRef);
        roll = d > 400;
        break;
      }
      case 'patrol': {
        // órbita larga ao redor da âncora
        _a.copy(s.pos).sub(this.anchor);
        const d = _a.length();
        const tang = _b.crossVectors(_a, _c.set(0, 1, 0)).normalize();
        _want.copy(tang).addScaledVector(_a.normalize(), (this.patrolR - d) / this.patrolR).normalize();
        throttle = 0.55;
        upHint = _upRef.set(0, 1, 0);
        break;
      }
      case 'engage': case 'strafe': {
        if (!T) { this.setMode('patrol'); break; }
        const w = s.weapons[0]?.def;
        const speed = w?.speed || 1600;
        const aimAt = this.mode === 'strafe' && T.capital ? this.strafePoint(T) : T.pos;
        const tv = T.vel || _c.set(0, 0, 0);
        leadPoint(s.pos, s.vel, aimAt, tv, speed, _a);
        // erro de mira que varia devagar (piloto humano), menor com precisão alta
        this.aimErrT -= dt;
        if (this.aimErrT <= 0) {
          this.aimErrT = 0.5 + sim.rand();
          // contra o jogador a IA erra mais (jogo justo); `skill` vem do grupo da batalha
          const e = (1 - P.accuracy) * 22 * (T.isPlayer ? 2.0 : 1) / (s.skill || 1);
          this.aimErr.set((sim.rand() - 0.5) * e, (sim.rand() - 0.5) * e, (sim.rand() - 0.5) * e);
        }
        const dist = _b.copy(aimAt).sub(s.pos).length();
        _a.addScaledVector(this.aimErr, clamp(dist / 800, 0.3, 2));
        this.aimPoint.copy(_a);
        _want.copy(_a).sub(s.pos).normalize();
        // aproximação rápida demais / muito perto → rompe
        const closing = -_b.normalize().dot(_c.copy(tv).sub(s.vel));
        const minD = (this.mode === 'strafe' ? 380 + T.radius * 0.15 : 140 + P.aggression * -60 + 60);
        const behind = _d.copy(s.pos).sub(T.pos).normalize().dot(T.fwd ? T.fwd(_c) : _c.set(0, 0, 1)) > 0.3;
        if (dist < minD && (closing > 40 || this.mode === 'strafe')) {
          this.setMode('break');
          this.extendDir.copy(s.fwd(_c)).addScaledVector(s.up(_d), sim.rand() > 0.5 ? 0.8 : -0.8).addScaledVector(s.right(_d), (sim.rand() - 0.5) * 1.2).normalize();
          this.passes++;
          break;
        }
        // velocidade: casa com o alvo quando atrás e perto (perseguição); rápido quando longe
        if (dist > 2500) { throttle = 1; boost = dist > 4000 && s.heat < 0.5; } else if (behind && dist < 900) throttle = clamp((tv.length() + (dist - 350) * 0.4) / s.stats.speed, 0.35, 1);
        else throttle = 0.95;
        // disparo
        this.tryFire(dt, T, dist, f);
        // mísseis
        this.tryMissile(dt, T, dist, f);
        // jink leve durante a perseguição (menos quando bem alinhado)
        break;
      }
      case 'break': {
        _want.copy(this.extendDir);
        throttle = 1; boost = true;
        break;
      }
      case 'extend': {
        _want.copy(this.extendDir);
        if (T) _want.addScaledVector(_a.copy(s.pos).sub(T.pos).normalize(), 0.4).normalize();
        throttle = 1; boost = this.modeT < 1.2 && s.heat < 0.6;
        roll = false; upHint = s.up(_upRef);
        break;
      }
      case 'evade': {
        const inc = sim.missiles.incoming(s);
        this.jinkT -= dt;
        if (this.jinkT <= 0) {
          this.jinkT = 0.5 + sim.rand() * 0.6 * (1.4 - P.jink);
          this.jink.set(sim.rand() - 0.5, sim.rand() - 0.5, sim.rand() - 0.5).normalize();
        }
        if (inc) {
          // vira perpendicular à linha de visada do míssil (maximiza a taxa angular)
          _a.copy(inc.missile.pos).sub(s.pos).normalize();
          _want.crossVectors(_a, s.up(_b)).normalize();
          if (_want.dot(f) < 0) _want.negate();
          _want.addScaledVector(this.jink, 0.6).normalize();
        } else _want.copy(f).addScaledVector(this.jink, 1.2).normalize();
        throttle = 1; boost = s.heat < 0.85;
        break;
      }
      case 'flee': {
        // foge de quem estiver mais perto e salta fora a 7 km
        let th = null, bd = Infinity;
        for (const o of sim.combatants()) {
          if (!o.alive || !sim.relations.shipsHostile(s, o)) continue;
          const d = o.pos.distanceTo(s.pos);
          if (d < bd) { bd = d; th = o; }
        }
        if (th) _want.copy(s.pos).sub(th.pos).normalize();
        this.jinkT -= dt;
        if (this.jinkT <= 0) { this.jinkT = 0.8 + sim.rand(); this.jink.set(sim.rand() - 0.5, sim.rand() - 0.5, sim.rand() - 0.5).normalize(); }
        _want.addScaledVector(this.jink, 0.4).normalize();
        throttle = 1; boost = s.heat < 0.8;
        if ((bd > 7000 || !th) && this.modeT > 4) sim.jumpOut(s);
        break;
      }
      default: break;
    }
    this.avoid(_want);
    this.pilot(_want, throttle, boost, upHint, roll);
  }

  /** Ponto de ataque contra uma capital: a torre viva mais próxima (ou o casco). */
  strafePoint(T) {
    const cap = T.capital;
    if (!cap) return T.pos;
    if (!this.strafeTurret || !this.strafeTurret.alive || this.modeT < 0.05) {
      let best = null, bd = Infinity;
      for (const t of cap.turrets) {
        if (!t.alive) continue;
        const d = cap.turretWorld(t, _d).distanceTo(this.s.pos) * (0.7 + this.sim.rand() * 0.6);
        if (d < bd) { bd = d; best = t; }
      }
      this.strafeTurret = best;
    }
    return this.strafeTurret ? cap.turretWorld(this.strafeTurret, this._sp || (this._sp = new THREE.Vector3())) : T.pos;
  }

  tryFire(dt, T, dist, fwd) {
    const s = this.s, sim = this.sim;
    if (s.overheat || !s.weapons.length) return;
    const w0 = s.weapons[0].def;
    if (dist > w0.range * 0.85) return;
    // canhões com cardã (±4°): basta o nariz estar perto da antecipação
    _a.copy(this.aimPoint).sub(s.pos).normalize();
    const ang = Math.acos(clamp(fwd.dot(_a), -1, 1));
    const gimbal = 0.07 + (s.persona.aggression - 0.5) * 0.02;
    if (ang > gimbal) return;
    // não atira através de aliados
    this.fireHold -= dt;
    if (this.fireHold > 0) return;
    for (const o of sim.combatants()) {
      if (o === s || o === T || !o.alive || sim.relations.shipsHostile(s, o)) continue;
      _b.copy(o.pos).sub(s.pos);
      const along = _b.dot(_a);
      if (along < 0 || along > dist) continue;
      if (_b.addScaledVector(_a, -along).lengthSq() < (o.hitR + 12) ** 2) { this.fireHold = 0.4; return; }
    }
    for (const w of s.weapons) {
      if (w.cd > 0) continue;
      w.cd = 1 / w.def.rof * (0.9 + sim.rand() * 0.25);
      const muzzle = s.toWorld(w.hp, _c);
      _d.copy(this.aimPoint).sub(muzzle).normalize();
      sim.projectiles.fire(s, w.def, muzzle, _d, { inherit: s.vel, muzzleLocal: w.hp, spreadMul: 1 + (1 - s.persona.accuracy) * 2 });
      s.heat = Math.min(1.05, s.heat + w.def.heat);
    }
  }

  tryMissile(dt, T, dist, fwd) {
    const s = this.s, sim = this.sim, P = s.persona;
    const kinds = Object.keys(s.missiles).filter((k) => s.missiles[k] > 0);
    if (!kinds.length || s.missileCd > 0 || T.isDecoy) { this.lock = 0; return; }
    const kind = kinds[0];
    const def = sim.missileDef(kind);
    _a.copy(T.pos).sub(s.pos).normalize();
    const ang = Math.acos(clamp(fwd.dot(_a), -1, 1));
    if (dist < def.range && dist > 500 && ang < def.fov) {
      if (this.lock === 0 && T.isPlayer && !sim.quiet) sim.emit('missile:lock', { target: 'player', by: s.eventId, progress: 0 });
      this.lock += dt / def.lockTime;
      if (this.lock >= 1 && sim.rand() < P.missileUse * dt * 2) {
        s.missiles[kind]--;
        s.missileCd = 6 + sim.rand() * 8;
        this.lock = 0;
        sim.missiles.launch(s, T, kind);
        this.chat('missile');
      }
    } else this.lock = Math.max(0, this.lock - dt * 0.5);
  }
}
