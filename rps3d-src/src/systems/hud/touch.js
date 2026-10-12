// Controles de toque (iPad/celular): joysticks flutuantes (aparecem onde o
// dedo encosta), área de olhar por arraste, botões de ação contextuais por
// modo (nave / a pé) e atalhos de pausa/mapa. Tudo vai para o núcleo por
// input.setVirtual / setVirtualAxis / addLook — o jogo não sabe que é toque.
import { ICONS } from './draw.js';

const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

// layout: x/y em fração da tela (a partir da direita/baixo quando negativos)
const SHIP_BTNS = [
  { a: 'primary', icon: 'fire', l: 'FOGO', x: -0.1, y: -0.2, size: 'big' },
  { a: 'secondary', icon: 'missile', l: 'MÍSSIL', x: -0.205, y: -0.13 },
  { a: 'boost', icon: 'boost', l: 'BOOST', x: -0.215, y: -0.3 },
  { a: 'countermeasure', icon: 'flare', l: 'FLARES', x: -0.115, y: -0.4, size: 'sm' },
  { a: 'target', icon: 'target', l: 'ALVO', x: -0.045, y: -0.4, size: 'sm', tap: true },
  { a: 'rollLeft', icon: 'rollL', l: 'ROLAR', x: 0.06, y: -0.52, size: 'sm' },
  { a: 'rollRight', icon: 'rollR', l: 'ROLAR', x: 0.2, y: -0.52, size: 'sm' },
  { a: 'up', icon: 'jump', l: 'SUBIR', x: 0.29, y: -0.3, size: 'sm' },
  { a: 'down', icon: 'down', l: 'DESCER', x: 0.29, y: -0.15, size: 'sm' },
  { a: 'quantum', icon: 'quantum', l: 'QUÂNTICO', x: -0.045, y: 0.2, size: 'sm', tap: true },
  { a: 'gear', icon: 'gear', l: 'TREM', x: -0.045, y: 0.32, size: 'sm', tap: true },
  { a: 'interact', icon: 'hand', l: 'POUSAR', x: -0.3, y: -0.42, ctx: true, tap: true },
];
const FOOT_BTNS = [
  { a: 'primary', icon: 'fire', l: 'FOGO', x: -0.1, y: -0.22, size: 'big' },
  { a: 'secondary', icon: 'target', l: 'MIRAR', x: -0.21, y: -0.14, toggle: true },
  { a: 'up', icon: 'jump', l: 'PULAR', x: -0.2, y: -0.32 },
  { a: 'reload', icon: 'reload', l: 'RECARGA', x: -0.1, y: -0.42, size: 'sm', tap: true },
  { a: 'boost', icon: 'boost', l: 'CORRER', x: 0.07, y: -0.52, size: 'sm', toggle: true },
  { a: 'grenade', icon: 'grenade', l: 'GRANADA', x: -0.03, y: -0.42, size: 'sm', tap: true },
  { a: 'scan', icon: 'scan', l: 'SCANNER', x: -0.045, y: 0.2, size: 'sm', tap: true },
  { a: 'tool', icon: 'tool', l: 'FERRAM.', x: -0.045, y: 0.32, size: 'sm', tap: true },
  { a: 'light', icon: 'light', l: 'LUZ', x: -0.045, y: 0.44, size: 'sm', tap: true },
  { a: 'interact', icon: 'hand', l: 'USAR', x: -0.3, y: -0.44, ctx: true, tap: true },
];

export class Touch {
  constructor(hud, root) {
    this.hud = hud; this.ctx = hud.ctx;
    this.el = el('div', 'touch');
    root.appendChild(this.el);
    this.zoneL = el('div', 'zone'); this.zoneR = el('div', 'zone');
    this.el.append(this.zoneL, this.zoneR);
    this.stickL = this.makeStick('MOVER'); this.stickR = this.makeStick('MANCHE');
    this.look = el('div', 'lookhint'); this.el.appendChild(this.look);
    this.btnWrap = el('div', ''); this.el.appendChild(this.btnWrap);
    this.top = el('div', 'ttop', `<div class="tb" data-k="map">${ICONS.map}</div><div class="tb" data-k="inv">${ICONS.inv}</div><div class="tb" data-k="pause">${ICONS.pause}</div>`);
    this.el.appendChild(this.top);
    this.top.querySelectorAll('.tb').forEach((b) => b.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const k = b.dataset.k;
      if (k === 'map') this.hud.openMap('system'); else if (k === 'inv') this.hud.openPanel('inventory'); else this.hud.togglePause();
    }));
    this.mode = null;
    this.buttons = [];
    this.activeStick = { L: null, R: null };
    this.held = new Map();
    this.layout();
    this.bindZones();
    addEventListener('resize', () => this.layout());
    this.on = false;
    this.el.style.display = 'none';
  }
  makeStick(cap) {
    const s = el('div', 'stick', `<div class="ring"></div><div class="nub"></div><div class="cap">${cap}</div>`);
    s.style.opacity = '0.0';
    this.el.appendChild(s);
    return { el: s, nub: s.querySelector('.nub'), cap: s.querySelector('.cap'), x: 0, y: 0, ox: 0, oy: 0, id: null, rest: { x: 0, y: 0 } };
  }

  layout() {
    const W = innerWidth, H = innerHeight;
    this.zoneL.style.cssText = `left:0;top:${H * 0.28}px;width:${W * 0.42}px;height:${H * 0.72}px`;
    this.zoneR.style.cssText = `left:${W * 0.42}px;top:${H * 0.12}px;width:${W * 0.58}px;height:${H * 0.88}px`;
    const sc = this.ctx.prefs?.touchScale ?? 1;
    this.el.style.setProperty('--ts', sc);
    this.stickL.rest = { x: W * 0.14, y: H * 0.74 };
    this.stickR.rest = { x: W * 0.68, y: H * 0.7 };
    for (const s of [this.stickL, this.stickR]) if (s.id === null) this.placeStick(s, s.rest.x, s.rest.y);
    for (const b of this.buttons) this.placeBtn(b);
  }
  placeStick(s, x, y) { s.ox = x; s.oy = y; s.el.style.left = `${x}px`; s.el.style.top = `${y}px`; }
  placeBtn(b) {
    const W = innerWidth, H = innerHeight;
    const x = b.def.x < 0 ? W * (1 + b.def.x) : W * b.def.x;
    const y = b.def.y < 0 ? H * (1 + b.def.y) : H * b.def.y;
    b.el.style.left = `${x}px`; b.el.style.top = `${y}px`;
    b.el.style.transform = `scale(${this.ctx.prefs?.touchScale ?? 1})`;
  }

  setMode(mode) {
    if (mode === this.mode) return;
    this.release();
    this.mode = mode;
    this.btnWrap.innerHTML = '';
    this.buttons = [];
    const defs = mode === 'ship' ? SHIP_BTNS : mode === 'foot' ? FOOT_BTNS : [];
    for (const d of defs) {
      const b = el('div', `tb ${d.size || ''}${d.ctx ? ' ctx' : ''}`, `${ICONS[d.icon] || ICONS.info}<div class="l">${d.l}</div>`);
      this.btnWrap.appendChild(b);
      const rec = { def: d, el: b, on: false };
      this.buttons.push(rec);
      this.placeBtn(rec);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); e.stopPropagation();
        b.setPointerCapture?.(e.pointerId);
        if (d.toggle) { rec.on = !rec.on; b.classList.toggle('tg', rec.on); this.ctx.input.setVirtual(d.a, rec.on ? 1 : 0); return; }
        b.classList.add('dn');
        this.ctx.input.setVirtual(d.a, 1);
        this.held.set(d.a, performance.now());
        this.ctx.input.rumble?.(0.1, 0.2, 30);
      });
      const up = (e) => {
        e?.preventDefault?.();
        if (d.toggle) return;
        b.classList.remove('dn');
        const t0 = this.held.get(d.a) || 0;
        const wait = Math.max(0, 70 - (performance.now() - t0));
        setTimeout(() => this.ctx.input.setVirtual(d.a, 0), wait);
        this.held.delete(d.a);
      };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
    this.stickL.cap.textContent = mode === 'ship' ? 'ACELERADOR · STRAFE' : 'MOVER';
    this.stickR.cap.textContent = mode === 'ship' ? 'MANCHE' : 'OLHAR';
    this.stickR.el.style.display = mode === 'ship' ? 'block' : 'none';
  }
  release() {
    const inp = this.ctx.input;
    for (const a of ['moveX', 'moveY', 'lookX', 'lookY']) inp.setVirtualAxis(a, 0);
    for (const b of this.buttons) { inp.setVirtual(b.def.a, 0); b.on = false; b.el.classList.remove('dn', 'tg'); }
    for (const s of [this.stickL, this.stickR]) { s.id = null; s.x = s.y = 0; s.nub.style.transform = ''; this.placeStick(s, s.rest.x, s.rest.y); }
  }

  bindZones() {
    const R = 62;
    const startStick = (s, e) => { s.id = e.pointerId; this.placeStick(s, e.clientX, e.clientY); s.el.style.opacity = '1'; };
    const moveStick = (s, e, axes) => {
      let dx = e.clientX - s.ox, dy = e.clientY - s.oy;
      const L = Math.hypot(dx, dy);
      if (L > R) { dx *= R / L; dy *= R / L; }
      s.x = dx / R; s.y = dy / R;
      s.nub.style.transform = `translate(${dx}px,${dy}px)`;
      axes(s.x, s.y);
    };
    const endStick = (s, axes) => { s.id = null; s.x = s.y = 0; s.nub.style.transform = ''; axes(0, 0); this.placeStick(s, s.rest.x, s.rest.y); s.el.style.opacity = '0.55'; };
    const axL = (x, y) => { this.ctx.input.setVirtualAxis('moveX', x); this.ctx.input.setVirtualAxis('moveY', -y); };
    const axR = (x, y) => { this.ctx.input.setVirtualAxis('lookX', x); this.ctx.input.setVirtualAxis('lookY', y); };
    this.zoneL.addEventListener('pointerdown', (e) => { e.preventDefault(); this.zoneL.setPointerCapture?.(e.pointerId); startStick(this.stickL, e); });
    this.zoneL.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickL.id) moveStick(this.stickL, e, axL); });
    const upL = (e) => { if (e.pointerId === this.stickL.id) endStick(this.stickL, axL); };
    this.zoneL.addEventListener('pointerup', upL); this.zoneL.addEventListener('pointercancel', upL);
    // direita: manche (nave) ou olhar por arraste (a pé)
    let last = null;
    this.zoneR.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.zoneR.setPointerCapture?.(e.pointerId);
      if (this.mode === 'ship') startStick(this.stickR, e);
      else { last = { id: e.pointerId, x: e.clientX, y: e.clientY }; this.look.style.left = `${e.clientX}px`; this.look.style.top = `${e.clientY}px`; this.look.classList.add('on'); }
    });
    this.zoneR.addEventListener('pointermove', (e) => {
      if (this.mode === 'ship') { if (e.pointerId === this.stickR.id) moveStick(this.stickR, e, axR); return; }
      if (!last || last.id !== e.pointerId) return;
      const k = (this.ctx.input.sensitivity || 0.0022) * 1.9;
      this.ctx.input.addLook((e.clientX - last.x) * k, (e.clientY - last.y) * k * (this.ctx.input.invertY ? -1 : 1));
      last.x = e.clientX; last.y = e.clientY;
      this.look.style.left = `${e.clientX}px`; this.look.style.top = `${e.clientY}px`;
    });
    const upR = (e) => {
      if (this.mode === 'ship') { if (e.pointerId === this.stickR.id) endStick(this.stickR, axR); return; }
      if (last?.id === e.pointerId) { last = null; this.look.classList.remove('on'); }
    };
    this.zoneR.addEventListener('pointerup', upR); this.zoneR.addEventListener('pointercancel', upR);
  }

  /** Visibilidade e botões contextuais (por frame). */
  frame(show, mode, ctxInfo = {}) {
    if (show !== this.on) { this.on = show; this.el.classList.toggle('on', show); if (!show) this.release(); this.el.style.display = show ? 'block' : 'none'; }
    if (!show) return;
    this.setMode(mode);
    for (const s of [this.stickL, this.stickR]) if (s.id === null) s.el.style.opacity = '0.55';
    for (const b of this.buttons) {
      if (!b.def.ctx) continue;
      const vis = !!ctxInfo.interact;
      b.el.classList.toggle('off', !vis);
      if (vis && ctxInfo.label) { const l = b.el.querySelector('.l'); if (l.textContent !== ctxInfo.label) l.textContent = ctxInfo.label; }
    }
  }
  /** Para screenshots: mostra os joysticks como se estivessem em uso. */
  demo() {
    const W = innerWidth, H = innerHeight;
    this.placeStick(this.stickL, W * 0.14, H * 0.74); this.stickL.nub.style.transform = 'translate(14px,-38px)'; this.stickL.el.style.opacity = '1';
    this.placeStick(this.stickR, W * 0.66, H * 0.66); this.stickR.nub.style.transform = 'translate(-26px,18px)'; this.stickR.el.style.opacity = '1';
    this.buttons.find((b) => b.def.a === 'primary')?.el.classList.add('dn');
  }
}
