import * as THREE from 'three';
import { h, setText } from './dom.js';
import { TEAM_CSS } from '../combat/Combatant.js';
import { WEAPONS } from '../weapons/WeaponData.js';
import { skinById } from '../skins/SkinCatalog.js';
import { rarityById } from '../skins/Rarity.js';

/**
 * HUD competitivo minimalista. Construído uma vez; a cada frame só muda o
 * texto/estilo que de fato mudou.
 */
export class HUD {
  /** @param {HTMLElement} root @param {import('../core/Settings.js').Settings} settings */
  constructor(root, settings) {
    this.settings = settings;
    this.el = h('div', { class: 'hud hidden' });
    root.appendChild(this.el);

    this.s0 = h('div', { class: 'tscore t0 num' }, '0');
    this.s1 = h('div', { class: 'tscore t1 num' }, '0');
    this.clockT = h('div', { class: 't num' }, '0:00');
    this.clockP = h('div', { class: 'ph' }, '');
    this.top = h('div', { class: 'top' }, [this.s0, h('div', { class: 'clock' }, [this.clockT, this.clockP]), this.s1]);
    this.alive0 = h('div', { style: { color: TEAM_CSS[0] } });
    this.alive1 = h('div', { style: { color: TEAM_CSS[1] } });
    this.alive = h('div', { class: 'alive' }, [this.alive0, this.alive1]);
    this.objLabel = h('div', {}, 'UPLINK');
    this.objFill = h('div');
    this.objective = h('div', { class: 'objective' }, [this.objLabel, h('div', { class: 'cbar' }, this.objFill)]);
    this.practice = h('div', { class: 'practice hidden num' });

    this.hpBig = h('span', { class: 'big num' }, '100');
    this.hpFill = h('div');
    this.arBig = h('span', { class: 'big num' }, '0');
    this.helmet = h('span', { class: 'ic' }, '');
    this.bl = h('div', { class: 'bl' }, [
      h('div', {}, [h('div', { class: 'stat' }, [h('span', { class: 'ic' }, '✚'), this.hpBig]), h('div', { class: 'hpbar' }, this.hpFill)]),
      h('div', {}, [h('div', { class: 'stat' }, [h('span', { class: 'ic' }, '◈'), this.arBig, this.helmet])]),
    ]);
    this.money = h('div', { class: 'money num' }, '$0');

    this.slots = h('div', { class: 'slots' });
    this.ammoBig = h('span', { class: 'big num' }, '30');
    this.ammoRes = h('span', { class: 'res num' }, ' / 90');
    this.wname = h('div', { class: 'wname' }, '');
    this.wskin = h('div', { class: 'wskin' }, '');
    this.br = h('div', { class: 'br' }, [this.slots, h('div', { class: 'ammo' }, [this.ammoBig, this.ammoRes]), this.wname, this.wskin]);

    this.feed = h('div', { class: 'feed' });
    this.b1 = h('div', { class: 'b1' });
    this.b2 = h('div', { class: 'b2' });
    this.banner = h('div', { class: 'banner' }, [this.b1, this.b2]);

    this.xhair = h('div', { class: 'xhair' });
    this.xparts = [h('i'), h('i'), h('i'), h('i'), h('i')];
    this.xhair.append(...this.xparts);
    this.hit = h('div', { class: 'hit' });
    this.dmg = h('div', { class: 'dmg' });
    this.vignette = h('div', { class: 'vignette' });
    this.centerMsg = h('div', { class: 'center-msg' });
    this.inspectTag = h('div', { class: 'inspect-tag' });
    this.scope = h('div', { class: 'scope hidden' });
    this.tags = h('div', { class: 'tags' });
    this.fps = h('div', { class: 'fps num' });

    this.el.append(
      this.vignette, this.scope, this.tags, this.top, this.alive, this.objective, this.practice, this.feed,
      this.banner, this.xhair, this.hit, this.dmg, this.centerMsg, this.inspectTag, this.money, this.bl, this.br, this.fps,
    );

    this.hitT = 0;
    this.dmgMarks = [];
    this.feedKey = '';
    this.aliveKey = '';
    this.slotsKey = '';
    this.tagPool = [];
    this.tmp = new THREE.Vector3();
    this.applyCrosshair(settings.data, 0);
  }

  show(v) {
    this.el.classList.toggle('hidden', !v);
  }

  /**
   * Mira: 4 traços + ponto opcional. Gap dinâmico pela dispersão atual.
   * @param {import('../core/Settings.js').SettingsData} s
   * @param {number} spreadPx
   */
  applyCrosshair(s, spreadPx) {
    const gap = Math.round((s.crosshairGap + (s.crosshairDynamic ? spreadPx : 0)) * 2) / 2;
    const key = `${s.crosshairColor}|${gap}|${s.crosshairSize}|${s.crosshairThickness}|${s.crosshairDot}`;
    if (key === this.xKey) return;
    this.xKey = key;
    this.el.style.setProperty('--xc', s.crosshairColor);
    const len = s.crosshairSize;
    const th = s.crosshairThickness;
    const [up, down, left, right, dot] = this.xparts;
    Object.assign(up.style, { width: `${th}px`, height: `${len}px`, left: `${-th / 2}px`, top: `${-gap - len}px` });
    Object.assign(down.style, { width: `${th}px`, height: `${len}px`, left: `${-th / 2}px`, top: `${gap}px` });
    Object.assign(left.style, { width: `${len}px`, height: `${th}px`, top: `${-th / 2}px`, left: `${-gap - len}px` });
    Object.assign(right.style, { width: `${len}px`, height: `${th}px`, top: `${-th / 2}px`, left: `${gap}px` });
    Object.assign(dot.style, { width: `${th}px`, height: `${th}px`, left: `${-th / 2}px`, top: `${-th / 2}px`, display: s.crosshairDot ? 'block' : 'none' });
  }

  hitmarker(headshot, kill) {
    this.hit.className = `hit${kill ? ' kill' : headshot ? ' hs' : ''}`;
    this.hitT = kill ? 0.35 : 0.2;
  }

  /** Indicador de direção do dano. */
  damageFrom(from, player, dmg) {
    const dx = from.x - player.body.pos.x;
    const dz = from.z - player.body.pos.z;
    const ang = Math.atan2(-dx, -dz);
    const i = h('i');
    this.dmg.appendChild(i);
    this.dmgMarks.push({ el: i, ang, t: 1.2 });
    if (this.dmgMarks.length > 6) this.dmgMarks.shift().el.remove();
  }

  /**
   * @param {number} dt
   * @param {import('../match/MatchManager.js').MatchManager} m
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} fps
   */
  update(dt, m, camera, fps) {
    const p = m.player;
    const R = m.round;
    const comp = m.mode === 'competitive';
    const s = this.settings.data;

    // topo: placar e relógio
    this.top.classList.toggle('hidden', !comp);
    this.alive.classList.toggle('hidden', !comp);
    this.objective.classList.toggle('hidden', !comp);
    this.practice.classList.toggle('hidden', comp);
    if (comp) {
      setText(this.s0, R.score[0]);
      setText(this.s1, R.score[1]);
      const t = Math.max(0, Math.ceil(R.timer));
      setText(this.clockT, `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`);
      this.clockT.style.color = R.phase === 'live' && t <= 10 ? 'var(--danger)' : '';
      setText(this.clockP, R.phase === 'buy' ? 'COMPRA' : R.phase === 'live' ? `ROUND ${R.round}` : R.phase === 'end' ? 'FIM DO ROUND' : 'FIM');
      const actors = m.combat.actors.filter((a) => !a.isTarget);
      const key = actors.map((a) => `${a.team}${a.alive ? 1 : 0}`).join('');
      if (key !== this.aliveKey) {
        this.aliveKey = key;
        for (const [team, el] of [[0, this.alive0], [1, this.alive1]]) {
          el.replaceChildren(...actors.filter((a) => a.team === team).map((a) => h('i', { class: a.alive ? '' : 'dead' })));
        }
      }
      const c = R.capture;
      const owner = c.owner;
      setText(this.objLabel, c.contested ? 'UPLINK — CONTESTADO' : owner >= 0 ? `UPLINK — ${owner === 0 ? 'VANGUARD' : 'EMBER'} ${Math.round(c.progress * 100)}%` : 'UPLINK — NEUTRO');
      this.objLabel.style.color = c.contested ? 'var(--warn)' : owner >= 0 ? TEAM_CSS[owner] : '';
      this.objFill.style.width = `${c.progress * 100}%`;
      this.objFill.style.background = owner >= 0 ? TEAM_CSS[owner] : '#fff';
    } else {
      setText(this.practice, `TREINO • ${p.stats.kills} abates • ${p.stats.headshots} HS • ${p.stats.deaths} mortes`);
    }

    // vida, colete, dinheiro
    setText(this.hpBig, Math.max(0, Math.round(p.health)));
    this.hpFill.style.width = `${Math.max(0, p.health)}%`;
    this.hpFill.style.background = p.health < 30 ? 'var(--danger)' : 'var(--text)';
    setText(this.arBig, Math.round(p.armor));
    setText(this.helmet, p.helmet ? '⛑' : '');
    this.money.classList.toggle('hidden', !comp);
    setText(this.money, `$${p.money}`);
    this.vignette.style.opacity = p.alive ? String(Math.max(0, (35 - p.health) / 35) * 0.8) : '0';

    // arma
    const ws = p.weapon;
    const knife = ws.def.type === 'knife';
    this.ammoBig.parentElement.classList.toggle('hidden', knife);
    setText(this.ammoBig, ws.ammo);
    setText(this.ammoRes, ` / ${ws.reserve}`);
    this.ammoBig.style.color = !knife && ws.ammo <= Math.ceil(ws.def.mag * 0.2) ? 'var(--danger)' : '';
    setText(this.wname, (m.wc.state === 'reloading' ? 'RECARREGANDO — ' : '') + ws.def.name.toUpperCase());
    if (ws.item) {
      const sk = skinById(ws.item.skinId);
      setText(this.wskin, `${sk.name} • ${rarityById(ws.item.rarity).name}`);
      this.wskin.style.setProperty('--rc', rarityById(ws.item.rarity).color);
    } else setText(this.wskin, 'Padrão de fábrica');
    const sk = ['primary', 'secondary', 'melee'].map((k) => `${k}:${p.weapons[k]?.def.id || ''}:${p.slot === k}`).join('|');
    if (sk !== this.slotsKey) {
      this.slotsKey = sk;
      this.slots.replaceChildren(
        ...[['primary', '1'], ['secondary', '2'], ['melee', '3']]
          .filter(([k]) => p.weapons[k])
          .map(([k, n]) => h('span', { class: p.slot === k ? 'on' : '' }, `${n} ${WEAPONS[p.weapons[k].def.id].name}`)),
      );
    }

    // mira dinâmica: dispersão angular → pixels
    const spreadPx = (m.wc.spreadNow / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * (window.innerHeight / 2);
    this.applyCrosshair(s, Math.min(60, spreadPx * 0.9));
    const zoomed = m.wc.zoomed;
    this.scope.classList.toggle('hidden', !zoomed);
    this.xhair.classList.toggle('hidden', !p.alive || zoomed || (m.pc.sprinting && !knife));

    // hitmarker
    if (this.hitT > 0) {
      this.hitT -= dt;
      this.hit.style.opacity = String(Math.min(1, this.hitT * 6));
    } else this.hit.style.opacity = '0';

    // indicadores de dano (giram com a câmera)
    for (let i = this.dmgMarks.length - 1; i >= 0; i--) {
      const d = this.dmgMarks[i];
      d.t -= dt;
      if (d.t <= 0) {
        d.el.remove();
        this.dmgMarks.splice(i, 1);
        continue;
      }
      const rel = -(d.ang - p.yaw);
      d.el.style.transform = `rotate(${rel}rad)`;
      d.el.style.opacity = String(Math.min(1, d.t * 2));
    }

    // kill feed
    const fk = m.feed.map((f) => f.t).join(',');
    if (fk !== this.feedKey) {
      this.feedKey = fk;
      this.feed.replaceChildren(
        ...m.feed.map((f) =>
          h('div', { class: f.mine ? 'mine' : '' }, [
            h('span', { style: { color: TEAM_CSS[f.killerTeam] } }, f.killer),
            h('span', { class: 'w' }, WEAPONS[f.weapon].name.toUpperCase()),
            f.headshot ? h('span', { class: 'hs' }, '◎') : null,
            h('span', { style: { color: TEAM_CSS[f.victimTeam] } }, f.victim),
          ]),
        ),
      );
    }
    if (m.feed.length && m.time - m.feed[m.feed.length - 1].t > 7) m.feed.pop();

    // faixa central
    this.banner.style.opacity = m.banner.t > 0 ? String(Math.min(1, m.banner.t * 2)) : '0';
    setText(this.b1, m.banner.text);
    setText(this.b2, m.banner.sub);
    this.b1.style.color = m.banner.color;

    // mensagem de morte / espectador
    if (!p.alive) {
      const spec = m.spectateTarget();
      const sub = m.mode === 'practice' ? `Renascendo em ${Math.max(0, m.respawnTimer).toFixed(1)}s` : spec ? `Assistindo ${spec.name} — clique para trocar` : 'Aguardando o próximo round';
      this.centerMsg.innerHTML = '';
      this.centerMsg.append(m.deathInfo || 'Eliminado', h('small', {}, sub));
    } else if (comp && R.phase === 'buy') {
      this.centerMsg.innerHTML = '';
      this.centerMsg.append(`Compra: ${Math.ceil(R.timer)}s`, h('small', {}, m.game.input.touchMode ? '$ — abrir loja' : 'B — abrir loja'));
    } else this.centerMsg.textContent = '';

    // inspeção
    const insp = m.wc.state === 'inspecting' ? m.wc.inspectLabel : '';
    this.inspectTag.style.opacity = insp ? '1' : '0';
    if (insp) setText(this.inspectTag, (m.wc.inspectRare ? '★ INSPEÇÃO RARA — ' : 'INSPEÇÃO — ') + insp.toUpperCase());
    this.inspectTag.classList.toggle('rare', m.wc.inspectRare && !!insp);

    // nomes dos aliados
    this.updateTags(m, camera);
    this.fps.classList.toggle('hidden', !s.showFps);
    if (s.showFps) setText(this.fps, `${Math.round(fps)} FPS`);
  }

  updateTags(m, camera) {
    const allies = m.bots.filter((b) => b.actor.team === m.player.team && b.actor.alive);
    while (this.tagPool.length < allies.length) {
      const d = h('div');
      this.tags.appendChild(d);
      this.tagPool.push(d);
    }
    const w = window.innerWidth;
    const hh = window.innerHeight;
    this.tagPool.forEach((el, i) => {
      const b = allies[i];
      if (!b) {
        el.style.display = 'none';
        return;
      }
      const v = this.tmp.set(b.actor.body.pos.x, b.actor.body.pos.y + 2.05, b.actor.body.pos.z).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      el.style.left = `${((v.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - v.y) / 2) * hh}px`;
      setText(el, `${b.actor.name} ${Math.round(b.actor.health)}`);
    });
  }
}
