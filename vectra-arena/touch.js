/* ==========================================================================
   VECTRA ARENA — touch.js
   TouchControls: on-screen controls for phones and tablets.
     - floating virtual joystick (left side) -> analog movement, sprint at
       full forward deflection
     - drag anywhere on the right side to look (the FIRE button also aims
       while held, so you can track a target and shoot with one thumb)
     - buttons: FIRE, AIM (ADS / scope / knife heavy), JUMP, CROUCH, RELOAD,
       INSPECT, weapon slots 1/2/3, scoreboard and pause
   Only enabled on touch devices; desktop controls are unchanged.
   ========================================================================== */

class TouchControls {
  static isTouchDevice() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    return ('ontouchstart' in window || navigator.maxTouchPoints > 0) && coarse;
  }

  constructor(game) {
    this.game = game;
    this.root = document.getElementById('touch-controls');
    this.stick = document.getElementById('t-stick');
    this.knob = document.getElementById('t-knob');
    this.touches = new Map();   // touch identifier -> { kind, x, y, ox, oy }
    this.radius = 55;
    this.bind();
  }

  show(v) { this.root.classList.toggle('hidden', !v); }

  bind() {
    const g = this.game;
    const opts = { passive: false };

    // ---- movement joystick (floating: appears where the thumb lands)
    document.getElementById('t-move-zone').addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if ([...this.touches.values()].some(v => v.kind === 'stick')) break;
        this.touches.set(t.identifier, { kind: 'stick', ox: t.clientX, oy: t.clientY });
        this.stick.style.left = `${t.clientX}px`;
        this.stick.style.top = `${t.clientY}px`;
        this.stick.classList.add('active');
        this.setStick(0, 0);
      }
    }, opts);

    // ---- look zone
    document.getElementById('t-look-zone').addEventListener('touchstart', e => {
      e.preventDefault();
      for (const t of e.changedTouches) this.touches.set(t.identifier, { kind: 'look', x: t.clientX, y: t.clientY });
    }, opts);

    // ---- buttons
    const hold = (id, down, up) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', e => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.add('pressed');
        for (const t of e.changedTouches) this.touches.set(t.identifier, { kind: id, x: t.clientX, y: t.clientY, el, up });
        if (down) down();
      }, opts);
    };
    const inp = g.input;
    const alive = () => g.mode === 'playing' && g.player.alive;
    hold('t-fire', () => { inp.fireDown = true; inp.firePressed = true; }, () => { inp.fireDown = false; });
    hold('t-ads', () => { inp.altDown = true; inp.altPressed = true; }, () => { inp.altDown = false; });
    hold('t-jump', () => { inp.jumpPressed = true; });
    hold('t-crouch', () => {
      inp.crouch = !inp.crouch;
      document.getElementById('t-crouch').classList.toggle('on', inp.crouch);
    });
    hold('t-reload', () => { if (alive()) g.arsenal.reload(); });
    hold('t-inspect', () => { if (alive()) g.arsenal.inspect(); });
    hold('t-slot1', () => { if (alive()) g.arsenal.equipSlot(1); });
    hold('t-slot2', () => { if (alive()) g.arsenal.equipSlot(2); });
    hold('t-slot3', () => { if (alive()) g.arsenal.equipSlot(3); });
    hold('t-score', () => g.ui.showScoreboard(true), () => g.ui.showScoreboard(false));
    hold('t-pause', () => g.pause());

    document.addEventListener('touchmove', e => {
      let used = false;
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        used = true;
        if (s.kind === 'stick') {
          this.setStick(t.clientX - s.ox, t.clientY - s.oy);
        } else if (s.kind === 'look' || s.kind === 't-fire' || s.kind === 't-ads') {
          // look zone, and also dragging on FIRE / AIM steers the camera
          const dx = t.clientX - s.x, dy = t.clientY - s.y;
          s.x = t.clientX; s.y = t.clientY;
          this.look(dx, dy);
        }
      }
      if (used) e.preventDefault();
    }, opts);

    const end = e => {
      for (const t of e.changedTouches) {
        const s = this.touches.get(t.identifier);
        if (!s) continue;
        this.touches.delete(t.identifier);
        if (s.kind === 'stick') {
          this.setStick(0, 0);
          this.stick.classList.remove('active');
          this.resetStickPosition();
        } else if (s.el) {
          s.el.classList.remove('pressed');
          if (s.up) s.up();
        }
      }
    };
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', end);

    // equipment-phase buttons (also usable with a mouse)
    document.getElementById('buy-rifle').addEventListener('click', () => g.buyPrimary('rifle'));
    document.getElementById('buy-sniper').addEventListener('click', () => g.buyPrimary('sniper'));
    this.resetStickPosition();
  }

  resetStickPosition() {
    this.stick.style.left = '';
    this.stick.style.top = '';
  }

  /** Converts the thumb offset into analog movement (+ sprint at full forward). */
  setStick(dx, dy) {
    const len = Math.hypot(dx, dy);
    const k = len > this.radius ? this.radius / len : 1;
    dx *= k; dy *= k;
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const x = dx / this.radius, y = dy / this.radius;
    const inp = this.game.input;
    const dead = Math.hypot(x, y) < 0.12;
    inp.touchMove = dead ? null : { x, y };
    inp.forward = !dead && y < -0.3;
    inp.sprint = !dead && y < -0.92;
  }

  look(dx, dy) {
    const g = this.game;
    if (g.mode !== 'playing' || !g.player.alive) return;
    g.mouseDX += dx;
    g.mouseDY += dy;
    const zoom = g.arsenal.ads ? g.arsenal.def.adsZoom : 1;
    g.player.look(dx, dy, 0.0048 * g.save.settings.sensitivity * zoom);
  }

  /** Releases everything (pause, round reset, match end). */
  reset() {
    for (const s of this.touches.values()) if (s.el) s.el.classList.remove('pressed');
    this.touches.clear();
    this.setStick(0, 0);
    this.stick.classList.remove('active');
    this.resetStickPosition();
    const inp = this.game.input;
    inp.fireDown = inp.altDown = false;
  }
}
