// Interface: menus (home, carreira, rápida, desafios, loja, conquistas,
// ajustes), HUD, overlays (VS, pausa, resultado, diário), toasts.
import * as THREE from 'three';
import { OPPONENTS, ACHIEVEMENTS, Save } from './data.js';
import { clamp } from './const.js';

const $ = id => document.getElementById(id);
const hex = n => '#' + n.toString(16).padStart(6, '0');

export class UI {
  constructor({ save, audio, camera }) {
    this.save = save; this.audio = audio; this.camera = camera;
    this.game = null;
    this.stack = ['home'];
    this.shopTab = 'paddle';
    this.quickOpp = 0; this.quickLen = 2;
    this.onResultNext = null; this.onResultAgain = null;
    this._v = new THREE.Vector3();
    this.bind();
    save.onAchievement(a => this.toast(a));
  }
  click(kind) { this.audio.init(); this.audio.ui(kind); }

  bind() {
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { this.click(); this.go(b.dataset.go); }));
    document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { this.click('back'); this.back(); }));
    $('goCareer').onclick = () => { this.click(); this.go('career'); };
    $('quickGo').onclick = () => { this.click(); this.startGame(() => this.game.startMatch({ opponent: OPPONENTS[this.quickOpp], games: this.quickLen, career: false })); };
    $('goRally').onclick = () => { this.click(); this.startGame(() => this.game.startRally()); };
    $('goTargets').onclick = () => { this.click(); this.startGame(() => this.game.startTargets()); };
    $('goTut2').onclick = () => { this.click(); this.startGame(() => this.game.startTutorial()); };
    $('lenPick').querySelectorAll('button').forEach(b => b.onclick = () => { this.click(); this.quickLen = +b.dataset.v; this.renderQuick(); });
    $('shopTabs').querySelectorAll('button').forEach(b => b.onclick = () => { this.click(); this.shopTab = b.dataset.v; this.renderShop(); });
    $('bPause').onclick = e => { e.stopPropagation(); this.click(); this.onPause && this.onPause(true); };
    $('pResume').onclick = () => { this.click(); this.onPause && this.onPause(false); };
    $('pRestart').onclick = () => { this.click(); this.onRestart && this.onRestart(); };
    $('pQuit').onclick = () => { this.click('back'); this.onQuit && this.onQuit(); };
    $('pHelp').onclick = () => { this.click(); $('help').classList.remove('hidden'); };
    $('helpOk').onclick = () => { this.click(); $('help').classList.add('hidden'); };
    $('resNext').onclick = () => { this.click(); $('result').classList.add('hidden'); this.onResultNext && this.onResultNext(); };
    $('bFull').onclick = () => {
      this.click();
      const d = document;
      try { if (!d.fullscreenElement) d.documentElement.requestFullscreen({ navigationUI: 'hide' }); else d.exitFullscreen(); } catch {}
    };
    $('resAgain').onclick = () => { this.click(); $('result').classList.add('hidden'); this.onResultAgain && this.onResultAgain(); };
  }

  startGame(fn) {
    this.audio.init();
    $('ui').classList.add('hidden');
    document.body.classList.add('ingame');
    fn();
  }

  // ─── navegação ───
  showMenu(screen = 'home') {
    $('ui').classList.remove('hidden');
    document.body.classList.remove('ingame');
    this.stack = ['home'];
    if (screen !== 'home') this.stack.push(screen);
    this.render();
  }
  go(s) {
    if (s === 'tut') { this.startGame(() => this.game.startTutorial()); return; }
    this.stack.push(s); this.render();
  }
  back() { if (this.stack.length > 1) this.stack.pop(); this.render(); }
  render() {
    const cur = this.stack[this.stack.length - 1];
    for (const s of ['home', 'career', 'quick', 'chal', 'shop', 'ach', 'set']) $('s-' + s).classList.toggle('hidden', s !== cur);
    this.renderTop();
    ({ home: () => this.renderHome(), career: () => this.renderCareer(), quick: () => this.renderQuick(), chal: () => this.renderChal(), shop: () => this.renderShop(), ach: () => this.renderAch(), set: () => this.renderSettings() })[cur]();
    $('ui').scrollTop = 0;
  }
  renderTop() {
    const li = this.save.levelInfo();
    $('lvN').textContent = li.lvl; $('lvX').textContent = `${li.cur}/${li.need}`;
    $('lvBar').style.width = (li.cur / li.need * 100) + '%';
    $('coinN').textContent = this.save.d.coins.toLocaleString('pt-BR');
  }
  bumpCoins() { const c = $('coinBox'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }

  renderHome() {
    const d = this.save.d;
    const next = OPPONENTS[Math.min(d.career, OPPONENTS.length - 1)];
    const done = d.career >= OPPONENTS.length;
    if (!d.tutorial && d.stats.played === 0) {
      $('heroOpp').textContent = 'Comece aqui: Treino guiado';
      $('heroDesc').textContent = 'Aprenda topspin, corte, mira, smash e saque · +300 🪙';
      $('heroAv').textContent = '🎓';
      document.querySelector('.hero-k').textContent = 'PRIMEIRA VEZ';
      $('goCareer').onclick = () => { this.click(); this.startGame(() => this.game.startTutorial()); };
    } else {
      document.querySelector('.hero-k').textContent = 'CARREIRA';
      $('goCareer').onclick = () => { this.click(); this.go('career'); };
    }
    if (d.tutorial || d.stats.played > 0) {
      $('heroOpp').textContent = done ? 'Campeão! Revanche?' : `Próximo: ${next.name}`;
      $('heroDesc').textContent = done ? 'Você venceu todos. Jogue de novo contra qualquer um.' : `${next.style} · recompensa ${next.reward} 🪙`;
      $('heroAv').textContent = done ? '👑' : next.flag;
    }
    $('achCount').textContent = `${Object.keys(d.ach).length}/${ACHIEVEMENTS.length}`;
    const st = d.stats;
    $('homeStats').innerHTML = [['Vitórias', st.wins], ['Carreira', `${d.career}/${OPPONENTS.length}`], ['Rally', st.rallyBest], ['Alvos', st.targetsBest]]
      .map(([a, b]) => `<div class="stat"><b>${b}</b><span>${a}</span></div>`).join('');
  }

  oppAvatar(o) { return `<div class="av" style="background:linear-gradient(135deg,${hex(o.look.shirt)},${hex(o.look.shorts)})">${o.flag}</div>`; }

  renderCareer() {
    const d = this.save.d;
    $('careerProg').textContent = `${Math.min(d.career, OPPONENTS.length)}/${OPPONENTS.length}`;
    $('ladder').innerHTML = OPPONENTS.map((o, i) => {
      const st = i < d.career ? 'done' : i === d.career ? 'cur' : 'lock';
      const btn = st === 'done' ? '✓ Revanche' : st === 'cur' ? 'JOGAR' : '🔒';
      const games = o.games === 3 ? 'Melhor de 5' : 'Melhor de 3';
      return `<button class="opp ${st}" data-i="${i}">
        <div class="av" style="background:linear-gradient(135deg,${hex(o.look.shirt)},${hex(o.look.shorts)})">${o.flag}<small>${i + 1}</small></div>
        <div class="info"><div class="nm">${o.name}<span class="tag">${o.style}</span></div><div class="ds">${o.desc}</div><div class="rw">🪙 ${o.reward} · ${o.xp} XP · ${games}</div></div>
        <div class="st">${btn}</div></button>`;
    }).join('');
    $('ladder').querySelectorAll('.opp').forEach(b => b.onclick = () => {
      const i = +b.dataset.i;
      if (i > d.career) { this.click('error'); return; }
      this.click();
      this.startGame(() => this.game.startMatch({ opponent: OPPONENTS[i], games: OPPONENTS[i].games, career: true }));
    });
  }

  renderQuick() {
    const d = this.save.d;
    const maxI = Math.min(d.career, OPPONENTS.length - 1);
    if (this.quickOpp > maxI) this.quickOpp = maxI;
    $('oppPick').innerHTML = OPPONENTS.map((o, i) => `<button class="op ${i === this.quickOpp ? 'on' : ''} ${i > maxI ? 'lock' : ''}" data-i="${i}"><i>${i > maxI ? '🔒' : o.flag}</i>${o.name}<small>${o.style}</small></button>`).join('');
    $('oppPick').querySelectorAll('.op').forEach(b => b.onclick = () => { this.click(); this.quickOpp = +b.dataset.i; this.renderQuick(); });
    $('lenPick').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === this.quickLen));
  }

  renderChal() {
    const st = this.save.d.stats;
    $('bestRally').textContent = st.rallyBest;
    $('bestTargets').textContent = st.targetsBest;
    $('tutDone').textContent = this.save.d.tutorial ? '✅' : '+300 🪙';
  }

  renderShop() {
    const kind = this.shopTab, s = this.save, lvl = s.levelInfo().lvl;
    $('shopTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === kind));
    const items = s.catalog(kind);
    $('shopGrid').innerHTML = items.map(it => {
      const owned = s.owns(kind, it.id), eq = s.d.equip[kind] === it.id;
      const locked = it.lvl && lvl < it.lvl && !owned;
      let sw;
      if (kind === 'paddle') sw = `<div class="sw pad" style="--wood:${hex(it.wood)};background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.35),transparent 50%),${hex(it.fore)};${it.glow ? `box-shadow:0 0 18px ${hex(it.glow)}` : ''}"></div>`;
      else if (kind === 'ball') sw = `<div class="sw" style="width:48px;height:48px;background:radial-gradient(circle at 35% 30%,#fff9,transparent 55%),${hex(it.color)};${it.glow ? `box-shadow:0 0 18px ${hex(it.color)}` : ''}"></div>`;
      else sw = `<div class="sw tbl" style="background:${hex(it.color)}"></div>`;
      const price = eq ? `<div class="price eq">Equipado</div>` : owned ? `<div class="price use">Equipar</div>` : locked ? `<div class="price no">Nível ${it.lvl}</div>` : `<div class="price ${s.d.coins < it.price ? 'no' : ''}">🪙 ${it.price}</div>`;
      return `<button class="item ${eq ? 'eq' : ''}" data-id="${it.id}">${locked ? '<span class="lk">🔒</span>' : ''}${sw}<b>${it.name}</b>${price}</button>`;
    }).join('');
    $('shopGrid').querySelectorAll('.item').forEach(b => b.onclick = () => {
      const id = b.dataset.id;
      if (s.owns(kind, id)) { s.equip(kind, id); this.click(); }
      else if (s.buy(kind, id)) { this.audio.init(); this.audio.ui('buy'); this.bumpCoins(); }
      else { this.click('error'); return; }
      this.game.applySkins();
      this.renderShop(); this.renderTop();
    });
  }

  renderAch() {
    const got = this.save.d.ach;
    $('achList').innerHTML = ACHIEVEMENTS.map(a => `<div class="ac ${got[a.id] ? 'ok' : ''}"><i>${got[a.id] ? '🏆' : '🔒'}</i><div><b>${a.name}</b><small>${a.desc}</small></div><span>🪙 ${a.coins}</span></div>`).join('');
  }

  renderSettings() {
    const s = this.save.s, d = this.save.d;
    const tog = (k, label, sub) => `<div class="sr"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><button class="tg ${s[k] !== false && s[k] ? 'on' : ''}" data-tg="${k}"></button></div>`;
    const mini = (k, label, opts, sub) => `<div class="sr"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><div class="mini" data-mini="${k}">${opts.map(([v, t]) => `<button data-v="${v}" class="${String(s[k]) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div></div>`;
    const c = d.custom || {};
    const colors = (key, list) => `<div class="colors" data-col="${key}">${list.map(v => `<button data-v="${v}" style="background:${hex(v)}" class="${(c[key] ?? list[0]) === v ? 'on' : ''}"></button>`).join('')}</div>`;
    $('setList').innerHTML = `
      <div class="sgroup">Jogo</div>
      ${mini('speed', 'Velocidade da bola', [[0.7, 'Lenta'], [0.85, 'Normal'], [1, 'Real']])}
      ${mini('assist', 'Assistência', [[0, 'Nenhuma'], [1, 'Média'], [2, 'Alta']], 'Posicionamento automático e área de acerto')}
      <div class="sr"><span>Sensibilidade<small>do gesto e do movimento</small></span><input type="range" min="0.6" max="1.6" step="0.05" value="${s.sens}" data-range="sens"></div>
      ${mini('camera', 'Câmera', [['padrao', 'Padrão'], ['baixa', 'Baixa'], ['tv', 'TV']])}
      ${tog('replays', 'Replays automáticos', 'Pontos incríveis em câmera lenta')}
      ${tog('ghost', 'Jogador translúcido', 'Enxergar a bola através do seu corpo')}
      <div class="sgroup">Som</div>
      ${tog('sound', 'Som')}
      <div class="sr"><span>Volume</span><input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-range="volume"></div>
      ${tog('music', 'Música no menu')}
      ${tog('crowd', 'Torcida')}
      ${tog('voice', 'Locutor do placar', 'Usa a voz do navegador')}
      <div class="sgroup">Gráficos</div>
      ${mini('quality', 'Qualidade', [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']], 'Recarrega sombras e brilho')}
      ${tog('trail', 'Rastro da bola')}
      ${tog('shake', 'Tremor de câmera')}
      ${tog('vibrate', 'Vibração', 'No celular, a cada batida')}
      <div class="sgroup">Seu jogador</div>
      <div class="sr"><span>Nome</span><input type="text" maxlength="14" value="${(d.name || 'Você').replace(/"/g, '')}" id="nameIn"></div>
      <div class="sr"><span>Camisa</span>${colors('shirt', [0xf97316, 0xdc2626, 0x2563eb, 0x16a34a, 0x9333ea, 0x0f172a, 0xf5f5f5, 0xec4899])}</div>
      <div class="sr"><span>Pele</span>${colors('skin', [0xe0ac69, 0xffdbac, 0xf1c27d, 0xc68642, 0x8d5524, 0x5c3a1e])}</div>
      <div class="sr"><span>Cabelo</span><div class="mini" data-hair>${[['short', 'Curto'], ['buzz', 'Raspado'], ['spiky', 'Espetado'], ['long', 'Longo'], ['ponytail', 'Rabo'], ['afro', 'Black'], ['bald', 'Careca']].map(([v, t]) => `<button data-v="${v}" class="${(c.hairStyle || 'short') === v ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="sr"><span>Cor do cabelo</span>${colors('hair', [0x2b1a10, 0x0a0a0a, 0x7c4a1e, 0xd6a756, 0xb91c1c, 0x9ca3af])}</div>
      <div class="sgroup">Dados</div>
      <div class="sr"><span class="danger">Apagar progresso</span><button class="mini" id="resetAll" style="padding:8px 12px;color:var(--red);font-weight:800">Apagar</button></div>`;
    const L = $('setList');
    L.querySelectorAll('[data-tg]').forEach(b => b.onclick = () => { const k = b.dataset.tg; s[k] = !(s[k] !== false && s[k]); this.save.persist(); this.click(); this.onSettings && this.onSettings(k); this.renderSettings(); });
    L.querySelectorAll('[data-mini]').forEach(m => m.querySelectorAll('button').forEach(b => b.onclick = () => {
      const k = m.dataset.mini; const v = b.dataset.v; s[k] = isNaN(+v) ? v : +v; this.save.persist(); this.click(); this.onSettings && this.onSettings(k); this.renderSettings();
    }));
    L.querySelectorAll('[data-range]').forEach(r => r.oninput = () => { s[r.dataset.range] = +r.value; this.save.persist(); this.onSettings && this.onSettings(r.dataset.range); });
    L.querySelectorAll('[data-col]').forEach(m => m.querySelectorAll('button').forEach(b => b.onclick = () => {
      d.custom = d.custom || {}; d.custom[m.dataset.col] = +b.dataset.v; this.save.persist(); this.click(); this.game.rebuildPlayer(); this.renderSettings();
    }));
    L.querySelector('[data-hair]').querySelectorAll('button').forEach(b => b.onclick = () => { d.custom = d.custom || {}; d.custom.hairStyle = b.dataset.v; this.save.persist(); this.click(); this.game.rebuildPlayer(); this.renderSettings(); });
    $('nameIn').onchange = e => { d.name = (e.target.value || 'Você').slice(0, 14); this.save.persist(); this.game.rebuildPlayer(); };
    $('nameIn').addEventListener('keydown', e => e.stopPropagation());
    $('resetAll').onclick = () => { if (confirm('Apagar todo o progresso, moedas e itens?')) { try { localStorage.removeItem('viciante3d-v2'); } catch {} location.reload(); } };
  }

  // ─── diário ───
  daily(res) {
    if (!res) return;
    const days = [50, 75, 100, 150, 200, 300, 500];
    $('dailyDays').innerHTML = days.map((c, i) => `<div class="${i + 1 < res.streak ? 'done' : i + 1 === res.streak ? 'today' : ''}">Dia ${i + 1}<b>${c}</b></div>`).join('');
    $('dailyTxt').textContent = `Sequência de ${res.streak} dia${res.streak > 1 ? 's' : ''}! Volte amanhã para ganhar mais.`;
    $('daily').classList.remove('hidden');
    $('dailyOk').onclick = () => { this.audio.init(); this.audio.ui('coin'); $('daily').classList.add('hidden'); this.renderTop(); this.bumpCoins(); };
  }

  toast(a) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<i>🏆</i><div><b>${a.name}</b><small>${a.desc}</small></div><span>+${a.coins}🪙</span>`;
    $('toasts').appendChild(el);
    this.audio.ui('coin');
    setTimeout(() => el.remove(), 3800);
  }

  // ═════ HUD ═════
  hud(show, kind) {
    $('hud').classList.toggle('hidden', !show);
    if (!show) { this.spin(null); this.banner(null); this.hint(null); $('tut').classList.add('hidden'); this.replay(false); return; }
    $('board').classList.toggle('hidden', kind !== 'match');
    $('chal').classList.toggle('hidden', kind === 'match' || kind === 'tutorial');
    $('tut').classList.toggle('hidden', kind !== 'tutorial');
    $('comboBox').classList.add('hidden');
    $('labels').innerHTML = '';
    this.banner(null);
  }
  board(b) {
    for (const i of [0, 1]) {
      $('bn' + i).textContent = b.names[i];
      $('bf' + i).textContent = b.flags[i];
      const sc = $('bsc' + i);
      if (sc.textContent !== String(b.score[i])) { sc.textContent = b.score[i]; sc.classList.remove('bump'); void sc.offsetWidth; sc.classList.add('bump'); }
      $('bg' + i).textContent = b.games[i];
      $('bs' + i).classList.toggle('on', b.server === i);
    }
  }
  rallyHud(s) {
    $('chL').textContent = 'Batidas';
    $('chV').textContent = s.hits;
    $('chS').textContent = `${'❤️'.repeat(Math.max(0, s.lives))}${'🖤'.repeat(Math.max(0, 3 - s.lives))} · bônus ${s.score} · recorde ${this.save.d.stats.rallyBest}`;
  }
  targetsHud(s) {
    $('chL').textContent = `⏱ ${Math.ceil(s.time)} s`;
    $('chV').textContent = s.score;
    $('chS').textContent = `recorde ${this.save.d.stats.targetsBest}`;
  }
  flash(t, sub = '', color = '#fff', dur = 1.4) {
    $('flashT').textContent = t; $('flashT').style.color = color; $('flashS').textContent = sub;
    const f = $('flash'); f.classList.add('on');
    clearTimeout(this._ft); this._ft = setTimeout(() => f.classList.remove('on'), dur * 1000);
  }
  shotLabel(label, sub, color, pos, extra = '') {
    const v = this._v.set(pos.x, pos.y + 0.12, pos.z).project(this.camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'lb';
    el.style.left = clamp((v.x + 1) / 2 * innerWidth, 60, innerWidth - 60) + 'px';
    el.style.top = clamp((1 - v.y) / 2 * innerHeight, 90, innerHeight - 40) + 'px';
    el.innerHTML = `${extra ? `<span class="pf">${extra}</span>` : ''}<b style="color:${color}">${label}</b>${sub ? `<small>${sub}</small>` : ''}`;
    $('labels').appendChild(el);
    setTimeout(() => el.remove(), 1100);
  }
  combo(n) {
    const c = $('comboBox');
    c.classList.toggle('hidden', n < 2);
    if (n >= 2) { $('comboX').textContent = 'x' + n; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
  }
  spin(o) {
    const box = $('spinBox');
    if (!o || (Math.abs(o.top) < 25 && Math.abs(o.side) < 40)) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    const ic = $('spIc');
    let name, color, sym;
    const a = Math.abs(o.top);
    if (Math.abs(o.side) > a * 1.2) { name = 'Efeito lateral'; color = '#f472b6'; sym = o.side > 0 ? '↺' : '↻'; }
    else if (o.top > 0) { name = a > 170 ? 'Topspin pesado' : 'Topspin'; color = '#fb923c'; sym = '↻'; }
    else { name = a > 170 ? 'Corte pesado' : 'Corte'; color = '#38bdf8'; sym = '↺'; }
    box.style.color = color;
    ic.textContent = sym; ic.className = 'sp-ic ' + (sym === '↻' ? 'rot' : 'rev');
    $('spT').textContent = name; $('spT').style.color = '#fff';
    $('spBar').style.width = clamp(Math.max(a, Math.abs(o.side)) / 280 * 100, 10, 100) + '%';
  }
  banner(t, color) {
    const b = $('banner');
    if (!t) { b.classList.add('hidden'); return; }
    b.textContent = t; b.style.color = color || '#fbbf24'; b.classList.remove('hidden');
  }
  hint(t) { const h = $('hint'); if (!t) h.classList.add('hidden'); else { h.textContent = t; h.classList.remove('hidden'); } }
  tutorial(text, i, n, prog) {
    $('tut').classList.remove('hidden');
    $('tutText').textContent = text; $('tutStep').textContent = `PASSO ${i}/${n}`; $('tutProg').textContent = prog || '';
  }
  replay(on) { $('replayTag').classList.toggle('hidden', !on); document.body.classList.toggle('replay', on); }
  vsCard(name, opp, games, career) {
    const v = $('vs');
    if (!name) { v.classList.add('hidden'); return; }
    $('vsN0').textContent = name; $('vsN1').textContent = opp.name; $('vsAv1').textContent = opp.flag;
    $('vsAv1').style.background = `linear-gradient(135deg,${hex(opp.look.shirt)},${hex(opp.look.shorts)})`;
    $('vsSt').textContent = opp.style;
    $('vsInfo').textContent = `${career ? 'Carreira · ' : ''}${games === 1 ? '1 game' : `Melhor de ${games * 2 - 1}`}`;
    v.classList.remove('hidden');
    v.querySelectorAll('.vs-side,.vs-x,.vs-info').forEach(e => { e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; });
  }
  results(r) {
    $('resBadge').textContent = r.won ? '🏆' : '💪';
    const t = $('resT'); t.textContent = r.title; t.classList.toggle('win', !!r.won);
    $('resS').textContent = r.sub || '';
    $('resRows').innerHTML = (r.rows || []).map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('');
    $('resXp').textContent = `+${r.xp || 0}`; $('resCoins').textContent = `+${r.coins || 0}`;
    let extra = '';
    if (r.lvlUp) extra += `<div class="unl">⬆️ Subiu para o nível ${r.lvlUp}!</div>`;
    if (r.nextUnlocked) extra += `<div class="unl">🔓 Novo adversário: ${r.nextUnlocked.flag} ${r.nextUnlocked.name}</div>`;
    $('resExtra').innerHTML = extra;
    $('result').classList.remove('hidden');
    document.body.classList.remove('ingame');
    if (r.lvlUp) this.audio.levelUp();
    this.onResultAgain = () => { document.body.classList.add('ingame'); r.again && r.again(); };
    this.onResultNext = () => { this.game.toMenu(); this.showMenu(r.career ? 'career' : 'home'); };
  }
}
