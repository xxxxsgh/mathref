// Camada DOM de comunicação: objetivo atual, pilha de notificações, rádio
// com retrato procedural (texto datilografado), prompt de interação,
// alerta central e painel de escolhas de diálogo.
import { ICONS, esc, rich } from './draw.js';
import { portrait, FACTION_COLORS } from './portrait.js';

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export class Comms {
  constructor(hud, root) {
    this.hud = hud; this.ctx = hud.ctx;
    this.root = root;
    // objetivo
    this.obj = el('div', 'obj fadeable', '<div class="m"></div><div class="t"></div><div class="pg"><i></i></div><div class="d num"></div>');
    root.appendChild(this.obj);
    this.objM = this.obj.querySelector('.m'); this.objT = this.obj.querySelector('.t');
    this.objPg = this.obj.querySelector('.pg'); this.objPgI = this.objPg.querySelector('i'); this.objD = this.obj.querySelector('.d');
    this.objective = null;
    // notificações
    this.notesEl = el('div', 'notes fadeable'); root.appendChild(this.notesEl);
    this.notes = [];
    // rádio
    this.radioEl = el('div', 'radio', '<div class="pf"></div><div class="bx"><div class="hd"></div><div class="tx"></div></div>');
    root.appendChild(this.radioEl);
    this.rPf = this.radioEl.querySelector('.pf'); this.rHd = this.radioEl.querySelector('.hd'); this.rTx = this.radioEl.querySelector('.tx');
    this.radioQ = []; this.radioCur = null;
    // prompt
    this.promptEl = el('div', 'prompt', '<div style="position:relative"><svg class="hold" viewBox="0 0 38 38"><circle cx="19" cy="19" r="17" fill="none" stroke="rgba(166,236,255,.9)" stroke-width="2" stroke-dasharray="0 107" transform="rotate(-90 19 19)"/></svg><div class="key">F</div></div><div class="pt"></div>');
    root.appendChild(this.promptEl);
    this.pKey = this.promptEl.querySelector('.key'); this.pTx = this.promptEl.querySelector('.pt'); this.pHold = this.promptEl.querySelector('circle');
    this.prompts = new Map();
    // alerta
    this.alertEl = el('div', 'alert', '<div class="a1"></div><div class="a2"></div>');
    root.appendChild(this.alertEl);
    this.alertT = 0;
    // escolhas
    this.choiceEl = el('div', 'choice', '<div class="q"></div><div class="list"></div><div class="tm"><i></i></div>');
    root.appendChild(this.choiceEl);
    this.cq = this.choiceEl.querySelector('.q'); this.clist = this.choiceEl.querySelector('.list'); this.ctm = this.choiceEl.querySelector('.tm i');
    this.choiceState = null;
  }

  // ── objetivo ───────────────────────────────────────────────────────────
  setObjective(o) {
    const changed = (o?.text || '') !== (this.objective?.text || '');
    this.objective = o && o.text ? o : null;
    if (!this.objective) { this.obj.classList.remove('on'); return; }
    this.objM.textContent = o.mission || o.title || 'OBJETIVO';
    this.objT.innerHTML = rich(o.text);
    const hasPg = o.progress !== undefined && o.progress !== null;
    this.objPg.style.display = hasPg ? 'block' : 'none';
    if (hasPg) this.objPgI.style.width = `${Math.round(Math.max(0, Math.min(1, o.progress)) * 100)}%`;
    this.obj.classList.add('on');
    if (changed) { this.obj.classList.remove('flash'); void this.obj.offsetWidth; this.obj.classList.add('flash'); }
  }
  setObjectiveDistance(txt) { if (this.objD.textContent !== txt) this.objD.textContent = txt; }

  // ── notificações ───────────────────────────────────────────────────────
  notify(text, kind = 'info', opts = {}) {
    if (!text) return;
    const k = kind === 'error' ? 'bad' : kind;
    const T = String(text);
    // repetida: renova em vez de empilhar
    const dup = this.notes.find((n) => n.text === T && !n.dying);
    if (dup) { dup.t = 0; dup.count++; dup.el.querySelector('.x').style.animation = 'none'; void dup.el.offsetWidth; dup.el.querySelector('.x').style.animation = ''; return dup; }
    const life = opts.seconds ?? (k === 'reward' || k === 'disc' ? 5 : 3.6);
    const n = el('div', `note ${k}`, `<div class="ic">${ICONS[k] || ICONS.info}</div><div class="tx">${esc(T)}${opts.sub ? `<small>${esc(opts.sub)}</small>` : ''}</div><div class="x" style="animation-duration:${life}s"></div>`);
    this.notesEl.appendChild(n);
    requestAnimationFrame(() => n.classList.add('on'));
    const rec = { el: n, text: T, t: 0, life, count: 1, dying: false };
    this.notes.push(rec);
    while (this.notes.filter((x) => !x.dying).length > 5) this.killNote(this.notes.find((x) => !x.dying));
    if (this.ctx.shot) n.classList.add('on');
    return rec;
  }
  killNote(n) {
    if (!n || n.dying) return;
    n.dying = true; n.el.classList.add('out');
    setTimeout(() => { n.el.remove(); this.notes = this.notes.filter((x) => x !== n); }, 420);
  }

  // ── rádio ──────────────────────────────────────────────────────────────
  radio(e) {
    if (!e?.text) return;
    const pr = e.priority ?? 1;
    if (this.radioCur && pr > (this.radioCur.priority ?? 1) + 1) { this.radioQ.unshift(this.radioCur); this.radioCur = null; }
    this.radioQ.push({ ...e, priority: pr });
    this.radioQ.sort((a, b) => (b.priority ?? 1) - (a.priority ?? 1));
    if (this.radioQ.length > 6) this.radioQ.length = 6;
  }
  showRadio(e) {
    const fac = e.faction && FACTION_COLORS[e.faction] ? e.faction : 'none';
    const fc = FACTION_COLORS[fac];
    this.radioEl.style.setProperty('--fc', fc);
    this.rPf.innerHTML = '';
    this.rPf.appendChild(portrait(e.speaker || 'RÁDIO', fac));
    const fname = this.ctx.universe.FACTIONS?.[e.faction]?.name || '';
    const ch = e.channel || (fac === 'vigilantes' ? 'SINAL DESCONHECIDO' : fac === 'hegemonia' ? 'CANAL MILITAR · CRIPT.' : fac === 'guilda' ? 'TRÁFEGO CIVIL' : fac === 'corsarios' ? 'FREQ. PIRATA' : fac === 'frente' ? 'CANAL DA FRENTE' : 'COMUNICAÇÃO');
    this.rHd.innerHTML = `<span class="wv"><i></i><i></i><i></i><i></i><i></i></span><span>${esc(e.speaker || 'RÁDIO')}</span>${fname ? `<span class="fa">${esc(fname)}</span>` : ''}<span class="ch">${esc(ch)}</span>`;
    const full = String(e.text);
    e._full = full; e._shown = 0; e._t = 0;
    e._dur = e.seconds ?? Math.max(3.6, 1.6 + full.length * 0.058);
    this.rTx.innerHTML = '';
    this.radioEl.classList.add('on');
    if (this.ctx.shot) { e._shown = full.length; this.rTx.innerHTML = rich(full); }
  }
  subtitle(speaker, text, opts = {}) {
    this.radio({ speaker, text, faction: opts.faction, priority: opts.priority ?? 3, seconds: opts.seconds, channel: opts.channel });
    return opts.seconds ?? Math.max(3.6, 1.6 + String(text).length * 0.058);
  }

  // ── prompt ─────────────────────────────────────────────────────────────
  prompt(text, opts = {}) {
    const id = opts.id || 'default';
    if (!text) { this.prompts.delete(id); return; }
    this.prompts.set(id, { text, sub: opts.sub || '', action: opts.action || 'interact', hold: opts.hold ?? null, priority: opts.priority ?? 0, t: opts.ttl ?? Infinity });
  }
  keyLabel(action) {
    const inp = this.ctx.input;
    const dev = inp.device;
    if (dev === 'gamepad') {
      const p = inp.bindings[action]?.pad?.[0];
      const map = { 0: ['A', 'a'], 1: ['B', 'b'], 2: ['X', 'x'], 3: ['Y', 'y'], 4: ['LB', ''], 5: ['RB', ''], 6: ['LT', ''], 7: ['RT', ''], 8: ['⧉', ''], 9: ['☰', ''] };
      const m = map[p] || ['?', ''];
      return { txt: m[0], cls: `key pad ${m[1]}` };
    }
    if (dev === 'touch') return { txt: '◉', cls: 'key' };
    const k = inp.bindings[action]?.keys?.[0] || '';
    const txt = k.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', 'ESPAÇO').replace('ShiftLeft', 'SHIFT').replace('Escape', 'ESC').replace('ControlLeft', 'CTRL').replace('Tab', 'TAB').replace('Enter', 'ENTER');
    return { txt, cls: 'key' };
  }

  // ── alerta ─────────────────────────────────────────────────────────────
  alert(t1, t2 = '', seconds = 2.5) {
    this.alertEl.querySelector('.a1').textContent = t1;
    this.alertEl.querySelector('.a2').textContent = t2;
    this.alertEl.classList.add('on');
    this.alertT = seconds;
  }

  // ── escolhas ───────────────────────────────────────────────────────────
  choose(prompt, choices, { timeout = 0, defaultId = null } = {}) {
    this.cancelChoice();
    this.cq.textContent = prompt || 'RESPONDER';
    this.clist.innerHTML = choices.map((c, i) => `<div class="opt${c.hot ? ' hot' : ''}${i === 0 ? ' sel' : ''}" data-i="${i}"><div class="n">${i + 1}</div><div class="t">${rich(c.text)}${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</div></div>`).join('');
    this.ctm.parentElement.style.display = timeout > 0 ? 'block' : 'none';
    this.ctm.style.transform = 'scaleX(1)';
    this.choiceEl.classList.add('on');
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* */ }
    return new Promise((resolve) => {
      const st = { choices, sel: 0, resolve, t: 0, timeout: this.ctx.shot ? 0 : timeout, defaultId, done: false, navT: 0 };
      this.choiceState = st;
      [...this.clist.children].forEach((node, i) => {
        node.addEventListener('pointerenter', () => this.selectChoice(i));
        node.addEventListener('click', (e) => { e.stopPropagation(); this.pickChoice(i); });
      });
    });
  }
  selectChoice(i) {
    const st = this.choiceState; if (!st) return;
    st.sel = (i + st.choices.length) % st.choices.length;
    [...this.clist.children].forEach((n, k) => n.classList.toggle('sel', k === st.sel));
  }
  pickChoice(i = null) {
    const st = this.choiceState; if (!st || st.done) return;
    st.done = true;
    const c = st.choices[i ?? st.sel];
    this.choiceEl.classList.remove('on');
    this.choiceState = null;
    st.resolve(c?.id ?? null);
  }
  cancelChoice() { const st = this.choiceState; if (st) { this.choiceState = null; this.choiceEl.classList.remove('on'); st.resolve(null); } }
  get choosing() { return !!this.choiceState; }

  // ── por frame ──────────────────────────────────────────────────────────
  frame(dt) {
    // notificações
    for (const n of this.notes) { if (n.dying) continue; n.t += dt; if (n.t > n.life && !this.ctx.shot) this.killNote(n); }
    // rádio
    const cur = this.radioCur;
    if (cur) {
      cur._t += dt;
      if (cur._shown < cur._full.length) {
        cur._shown = Math.min(cur._full.length, cur._shown + dt * 70);
        const n = Math.floor(cur._shown);
        this.rTx.innerHTML = rich(cur._full.slice(0, n)) + (n < cur._full.length ? '<span class="cur"></span>' : '');
      }
      if (cur._t > cur._dur && !this.ctx.shot) { this.radioCur = null; this.radioEl.classList.remove('on'); this.radioGap = 0.45; }
    } else if (this.radioQ.length) {
      this.radioGap = (this.radioGap || 0) - dt;
      if (this.radioGap <= 0) { this.radioCur = this.radioQ.shift(); this.showRadio(this.radioCur); }
    }
    // prompt (maior prioridade)
    let best = null;
    for (const [id, p] of this.prompts) {
      if (p.t !== Infinity) { p.t -= dt; if (p.t <= 0) { this.prompts.delete(id); continue; } }
      if (!best || p.priority > best.priority) best = p;
    }
    if (best && !this.hud.modal) {
      const k = this.keyLabel(best.action);
      if (this.pKey.textContent !== k.txt) this.pKey.textContent = k.txt;
      if (this.pKey.className !== k.cls) this.pKey.className = k.cls;
      const html = `${esc(best.text)}${best.sub ? `<span class="ps">${esc(best.sub)}</span>` : ''}`;
      if (this._pHtml !== html) { this.pTx.innerHTML = html; this._pHtml = html; }
      this.pHold.setAttribute('stroke-dasharray', `${(best.hold ?? 0) * 107} 107`);
      this.promptEl.classList.add('on');
    } else this.promptEl.classList.remove('on');
    // alerta
    if (this.alertT > 0) { this.alertT -= dt; if (this.alertT <= 0) this.alertEl.classList.remove('on'); }
    // tempo das escolhas + navegação por gamepad
    const st = this.choiceState;
    if (st) {
      if (st.timeout > 0) {
        st.t += dt;
        this.ctm.style.transform = `scaleX(${Math.max(0, 1 - st.t / st.timeout)})`;
        if (st.t >= st.timeout) { const i = st.defaultId ? st.choices.findIndex((c) => c.id === st.defaultId) : st.sel; this.pickChoice(Math.max(0, i)); }
      }
    }
  }
  /** Teclado para escolhas (chamado pelo listener global da HUD). */
  onKey(code) {
    if (!this.choiceState) return false;
    if (/^Digit[1-9]$/.test(code)) { const i = Number(code.slice(5)) - 1; if (i < this.choiceState.choices.length) this.pickChoice(i); return true; }
    if (code === 'ArrowUp' || code === 'KeyW') { this.selectChoice(this.choiceState.sel - 1); return true; }
    if (code === 'ArrowDown' || code === 'KeyS') { this.selectChoice(this.choiceState.sel + 1); return true; }
    if (code === 'Enter' || code === 'Space') { this.pickChoice(); return true; }
    return false;
  }
  /** Navegação por gamepad (direções e confirmar já com borda). */
  onNav(dir, confirm) {
    if (!this.choiceState) return false;
    if (dir) this.selectChoice(this.choiceState.sel + dir);
    if (confirm) this.pickChoice();
    return true;
  }
}
