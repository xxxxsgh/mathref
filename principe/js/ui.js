// Camada de interface em DOM: diálogos, escolhas, objetivos, cartões.
const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor(input, sound) {
    this.input = input;
    this.sound = sound;
    this.dialog = $('#dialog');
    this.dName = this.dialog.querySelector('.name');
    this.dText = this.dialog.querySelector('.text');
    this.choicesEl = $('#choices');
    this.promptEl = $('#prompt');
    this.meterEl = $('#meter');
    this.meterFg = $('#meter .fg');
    this.toastEl = $('#toast');
    this.cardEl = $('#card');
    this.fadeEl = $('#fade');
    this.objEl = $('#objectives');
    this.chapterEl = $('#chapter');
    this.dustEl = $('#stardust span');
    this.advanceCb = null;
    this.objectives = [];
    this.lastPrompt = null;
    input.onAdvance(() => { if (this.advanceCb) this.advanceCb(); });
    this.dialog.addEventListener('pointerdown', (e) => { e.preventDefault(); if (this.advanceCb) this.advanceCb(); });
    this.makePaper();
  }

  makePaper() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const x = c.getContext('2d');
    const img = x.createImageData(512, 512);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 225 + Math.random() * 30;
      img.data[i] = v; img.data[i + 1] = v - 4; img.data[i + 2] = v - 14; img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // fibras
    x.globalAlpha = 0.08;
    for (let i = 0; i < 900; i++) {
      x.strokeStyle = Math.random() < 0.5 ? '#6b5a40' : '#ffffff';
      x.lineWidth = Math.random() * 1.2;
      const px = Math.random() * 512, py = Math.random() * 512, a = Math.random() * Math.PI, l = 4 + Math.random() * 18;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
    // manchas de aquarela
    for (let i = 0; i < 26; i++) {
      const px = Math.random() * 512, py = Math.random() * 512, r = 30 + Math.random() * 90;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(120,100,150,0.05)'); g.addColorStop(1, 'rgba(120,100,150,0)');
      x.globalAlpha = 1; x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    $('#paper').style.backgroundImage = `url(${c.toDataURL()})`;
  }

  // ─── diálogo ───
  say(name, text, { narr = false, color, keep = false } = {}) {
    clearTimeout(this.hideTimer);
    return new Promise((resolve) => {
      const d = this.dialog;
      d.classList.add('show');
      d.classList.toggle('narr', narr);
      d.classList.remove('ready');
      this.dName.textContent = name || '';
      this.dName.style.color = color || '';
      this.dText.textContent = '';
      let i = 0, done = false;
      const chars = [...text];
      const tick = () => {
        if (done) return;
        const n = Math.min(chars.length, i + 2);
        for (; i < n; i++) this.dText.textContent += chars[i];
        if (i % 4 === 0) this.sound.sfx('blip', name ? name.length % 5 : 0);
        if (i >= chars.length) { done = true; d.classList.add('ready'); return; }
        this.typeTimer = setTimeout(tick, 28);
      };
      tick();
      const openedAt = performance.now();
      this.advanceCb = () => {
        if (performance.now() - openedAt < 150) return;
        if (!done) {
          done = true; clearTimeout(this.typeTimer);
          this.dText.textContent = text; d.classList.add('ready');
          return;
        }
        this.advanceCb = null;
        this.input.clearPressed();
        // some sozinho se nenhuma outra fala vier logo em seguida
        if (!keep) this.hideTimer = setTimeout(() => this.hideDialog(), 80);
        resolve();
      };
    });
  }

  hideDialog() { this.dialog.classList.remove('show'); }

  choose(options) {
    return new Promise((resolve) => {
      this.choicesEl.innerHTML = '';
      let sel = 0;
      const btns = options.map((o, i) => {
        const b = document.createElement('button');
        b.textContent = o;
        b.style.animationDelay = i * 60 + 'ms';
        b.addEventListener('click', (e) => { e.stopPropagation(); finish(i); });
        this.choicesEl.appendChild(b);
        return b;
      });
      const mark = () => btns.forEach((b, i) => b.classList.toggle('sel', i === sel));
      mark();
      const onKey = (e) => {
        if (e.code === 'ArrowDown' || e.code === 'KeyS') { sel = (sel + 1) % btns.length; mark(); }
        else if (e.code === 'ArrowUp' || e.code === 'KeyW') { sel = (sel + btns.length - 1) % btns.length; mark(); }
        else if (/^Digit[1-9]$/.test(e.code)) { const n = +e.code.slice(5) - 1; if (n < btns.length) finish(n); }
      };
      addEventListener('keydown', onKey);
      const openedAt = performance.now();
      this.advanceCb = () => {
        if (this.input.touch || performance.now() - openedAt < 250) return; // no toque, só clicando no botão
        finish(sel);
      };
      const finish = (i) => {
        removeEventListener('keydown', onKey);
        this.advanceCb = null;
        this.choicesEl.innerHTML = '';
        this.input.clearPressed();
        this.sound.sfx('page');
        resolve(i);
      };
    });
  }

  // ─── caderno de desenhos ───
  sketch(items, disabled = new Set()) {
    return new Promise((resolve) => {
      this.hideDialog();
      const el = $('#sketch'), grid = el.querySelector('.grid');
      grid.innerHTML = '';
      items.forEach((it, i) => {
        const b = document.createElement('button');
        b.innerHTML = it.svg + `<span>${it.label}</span>`;
        if (disabled.has(i)) b.disabled = true;
        b.addEventListener('click', () => { el.classList.remove('show'); this.sound.sfx('page'); resolve(i); });
        grid.appendChild(b);
      });
      el.classList.add('show');
    });
  }

  // ─── HUD ───
  setChapter(t) { this.chapterEl.textContent = t; }
  setObjectives(list) {
    this.objectives = list.map((o) => ({ ...o }));
    this.renderObjectives();
  }
  addObjective(o) { this.objectives.push({ ...o }); this.renderObjectives(); }
  objText(id, text) { const o = this.objectives.find((x) => x.id === id); if (o) { o.text = text; this.renderObjectives(); } }
  check(id) {
    const o = this.objectives.find((x) => x.id === id);
    if (!o || o.done) return;
    o.done = true;
    this.renderObjectives();
    this.sound.sfx('chime');
  }
  isDone(id) { const o = this.objectives.find((x) => x.id === id); return !!(o && o.done); }
  renderObjectives() {
    this.objEl.innerHTML = '';
    for (const o of this.objectives) {
      const li = document.createElement('li');
      li.textContent = o.text;
      if (o.done) li.classList.add('done');
      this.objEl.appendChild(li);
    }
  }
  setDust(n) { this.dustEl.textContent = n; }
  showHud(v) {
    $('#hud').classList.toggle('hidden', !v);
    $('#stardust').classList.toggle('hidden', !v);
    $('#topbtns').classList.toggle('hidden', !v);
  }

  prompt(label) {
    if (label === this.lastPrompt) return;
    this.lastPrompt = label;
    if (label) {
      const key = this.input.touch ? '✦' : 'E';
      this.promptEl.innerHTML = `<kbd>${key}</kbd>${label}`;
      this.promptEl.classList.add('show');
    } else this.promptEl.classList.remove('show');
  }
  meter(p) {
    if (p == null) { this.meterEl.classList.remove('show'); return; }
    this.meterEl.classList.add('show');
    this.meterFg.style.strokeDashoffset = String(113.1 * (1 - Math.min(1, p)));
  }
  async toast(text, ms = 2200) {
    const id = (this.toastId = (this.toastId || 0) + 1);
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    await sleep(ms);
    if (this.toastId === id) this.toastEl.classList.remove('show');
  }

  // ─── transições ───
  fade(to, ms = 900, white = false) {
    this.fadeEl.classList.toggle('white', white);
    this.fadeEl.style.transitionDuration = ms + 'ms';
    this.fadeEl.style.opacity = to;
    return sleep(ms + 30);
  }
  async card(kicker, title, text = '', ms = 2600) {
    this.cardEl.querySelector('.kicker').textContent = kicker;
    this.cardEl.querySelector('h2').textContent = title;
    this.cardEl.querySelector('p').textContent = text;
    this.cardEl.classList.add('show');
    await sleep(ms);
    this.cardEl.classList.remove('show');
    await sleep(700);
  }
}
