/**
 * HUD de jogo: mira com bloom, hitmarkers (normal / headshot / abate),
 * indicadores direcionais de dano, vinheta de vida nas bordas, bússola,
 * minimapa, placar/objetivo, feed de abates, XP/medalhas, painel da arma,
 * equipamentos e vida.
 */
import { svgText } from './font.js';
import { rifleSVG, fragSVG, flashSVG, headshotSVG, skullSVG, medalSVG, rankSVG } from './icons.js';
import { Compass, headingOf, bearing } from './compass.js';
import { Minimap } from './minimap.js';
import { MODE } from './match.js';

const T = (s, o) => svgText(s, o);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

/** Textura procedural da vinheta de dano (bordas orgânicas, vermelho-sangue). */
function makeVignette() {
  const w = 384, h = 216;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  // ruído de valor 2D barato (fbm de 4 oitavas) com semente fixa
  const P = new Uint8Array(512);
  let s = 1234567;
  for (let i = 0; i < 256; i++) P[i] = i;
  for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const hash = (x, y) => P[P[x & 255] + (y & 255)] / 255;
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => vn(x, y) * 0.5 + vn(x * 2.1, y * 2.1) * 0.25 + vn(x * 4.3, y * 4.3) * 0.15 + vn(x * 8.7, y * 8.7) * 0.1;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * 2 - 1, ny = (y / h) * 2 - 1;
      // distância "superelíptica" até a borda (cantos mais carregados)
      const e = Math.pow(Math.pow(Math.abs(nx), 2.6) + Math.pow(Math.abs(ny) * 1.08, 2.6), 1 / 2.6);
      const n = fbm(x / 26, y / 26);
      const fine = fbm(x / 7 + 11, y / 7 + 5);
      // borda irregular + gotas/manchas finas só perto da borda
      let a = ss(0.66, 1.12, e + (n - 0.5) * 0.22);
      const drops = ss(0.62, 0.8, fine) * ss(0.7, 0.95, e);
      a = clamp(a + drops * 0.35, 0, 1);
      const i = (y * w + x) * 4;
      const deep = ss(0.85, 1.25, e);
      img.data[i] = 128 - deep * 92 + (fine - 0.5) * 30;
      img.data[i + 1] = 6;
      img.data[i + 2] = 8;
      img.data[i + 3] = 255 * Math.pow(a, 1.25) * 0.94;
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

export class PlayHud {
  constructor(ctx, stage, fx) {
    this.ctx = ctx;
    // ── camadas de tela cheia (fora da prancheta: cobrem qualquer aspecto)
    this.vig = makeVignette();
    this.vig.className = 'vig-canvas';
    this.desat = document.createElement('div');
    this.desat.className = 'desat';
    this.flash = document.createElement('div');
    this.flash.className = 'flash';
    fx.append(this.desat, this.vig, this.flash);
    this.fx = fx;

    const root = (this.root = document.createElement('div'));
    root.className = 'play';
    root.innerHTML = `
      <div class="corner tl"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="dmg"></div>
      <div class="cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
      <div class="hitm"><i></i><i></i><i></i><i></i><div class="ring"></div></div>
      <div class="prompt sh"></div>
      <div class="xp sh"></div>
      <div class="medal"></div>
      <div class="banner sh"></div>
      <div class="score sh">
        <div class="top"><div class="timer"></div><div class="mode">${T(MODE.name, { size: 12, weight: 1.2, tracking: 2.4 })}</div></div>
        <div class="rowx us"><div class="fill"></div><div class="n"></div><div class="tag">${T('IRONLINE', { size: 11, weight: 1.15, tracking: 2.2 })}</div><div class="goal">${T(String(MODE.target), { size: 10, weight: 1.1 })}</div></div>
        <div class="rowx them"><div class="fill"></div><div class="n"></div><div class="tag">${T('HOSTILES', { size: 11, weight: 1.15, tracking: 2.2 })}</div><div class="goal"></div></div>
      </div>
      <div class="feed sh"></div>
      <div class="equip sh">
        <div class="e"><div class="kb"><span class="key">${T('Q', { size: 8, weight: 1.3 })}</span></div>${flashSVG('', 24)}${T('×2', { size: 12, weight: 1.3 })}</div>
        <div class="e"><div class="kb"><span class="key">${T('G', { size: 8, weight: 1.3 })}</span></div>${fragSVG('', 24)}${T('×2', { size: 12, weight: 1.3 })}</div>
      </div>
      <div class="wpn sh">
        <div class="head"><span class="nm"></span><span class="mode">${T('AUTO', { size: 9, weight: 1.2, tracking: 2 })}</span></div>
        <div class="main">
          <div class="gun">${rifleSVG('', 168)}</div>
          <div class="sep"></div>
          <div class="count"><div class="mag"></div><div class="res"></div></div>
        </div>
        <div class="ticks"></div>
        <div class="reload"><i></i></div>
      </div>
      <div class="vit sh">
        <div class="who"><span class="rk">${rankSVG(24, '', 30)}</span><span class="cs"></span><span class="lv"></span></div>
        <div class="streak"></div>
        <div class="hp"><div class="bar"><div class="lag"></div><div class="cur"></div><div class="seg"></div></div><div class="num"></div></div>
      </div>
      <div class="death"></div>`;
    stage.appendChild(root);
    const q = (s) => root.querySelector(s);
    this.el = {
      cross: q('.cross'), cl: [...q('.cross').children], hit: q('.hitm'), hitI: [...q('.hitm').querySelectorAll('i')], ring: q('.hitm .ring'),
      prompt: q('.prompt'), xp: q('.xp'), medal: q('.medal'), banner: q('.banner'), dmg: q('.dmg'),
      timer: q('.score .timer'), usN: q('.rowx.us .n'), usF: q('.rowx.us .fill'), thN: q('.rowx.them .n'), thF: q('.rowx.them .fill'), thG: q('.rowx.them .goal'),
      feed: q('.feed'), wname: q('.wpn .nm'), mag: q('.wpn .mag'), res: q('.wpn .res'), ticks: q('.wpn .ticks'), reload: q('.wpn .reload'), reloadI: q('.wpn .reload i'),
      vit: q('.vit'), cs: q('.vit .cs'), lv: q('.vit .lv'), streak: q('.vit .streak'), hpLag: q('.vit .lag'), hpCur: q('.vit .cur'), hpNum: q('.vit .num'),
      death: q('.death'), equip: q('.equip'), wpn: q('.wpn'),
    };
    this.compass = new Compass(root);
    this.minimap = new Minimap(root);
    // estado
    this.gap = 9;
    this.bloom = 0;
    this.hitT = 9;
    this.hitKind = '';
    this.hpLag = 100;
    this.vigA = 0;
    this.flashA = 0;
    this.indicators = [];
    this.pings = [];
    this.cache = {};
    this.xpRows = [];
    this.medals = [];
    this.virtualHealth = null;
    this._ticksN = -1;
  }

  /** usa a silhueta real da arma (gerada do modelo 3D) nos ícones */
  setGunIcon(icon) {
    this.gunIcon = icon;
    if (!icon) return;
    const h = 54;
    this.root.querySelector('.wpn .gun').innerHTML = `<img src="${icon.url}" style="height:${h}px;width:${Math.round(h * icon.aspect)}px;display:block" alt="">`;
  }
  gunImg(h) {
    const i = this.gunIcon;
    return i ? `<img src="${i.url}" style="height:${h}px;width:${Math.round(h * i.aspect)}px;display:block" alt="">` : rifleSVG('', h * 3.6);
  }

  setProfile(P, level) {
    this.el.cs.innerHTML = T(P.callsign, { size: 13, weight: 1.38, tracking: 2.3 });
    this.el.lv.innerHTML = T('LV ' + level, { size: 10, weight: 1.2, tracking: 1.8 });
    this.root.querySelector('.vit .rk').innerHTML = rankSVG(level, '', 30);
  }

  resize(k) {
    this.compass.resize(k);
    this.minimap.resize(k);
  }

  set(key, val, fn) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    fn(val);
  }

  // ─── eventos ────────────────────────────────────────────────────────
  hitmarker({ head, kill }) {
    const kind = kill ? (head ? 'kill head' : 'kill') : head ? 'head' : 'hit';
    // um abate sempre vence um hit comum no mesmo instante
    if (this.hitT < 0.05 && this.hitKind.includes('kill') && !kill) return;
    this.hitKind = kind;
    this.hitT = 0;
    this.cache.hitOff = undefined;
    this.el.hit.className = 'hitm ' + kind;
  }
  damage({ from, amount = 10 }) {
    const p = this.ctx.player;
    if (from) {
      const x = from.x ?? from[0], z = from.z ?? from[2];
      // agrupa acertos da mesma direção
      const b = bearing(x - p.position.x, z - p.position.z);
      const same = this.indicators.find((d) => Math.abs(((b - d.b + 540) % 360) - 180) < 20);
      if (same) { same.t = 0; same.x = x; same.z = z; same.k = Math.min(1.4, same.k + 0.15); }
      else this.addIndicator(x, z, amount);
    }
    this.flashA = Math.min(0.9, this.flashA + 0.25 + amount / 60);
  }
  addIndicator(x, z, amount) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 260 120');
    // arco grosso no centro, afinando nas pontas
    const arc = (r, a) => [130 + r * Math.sin(a), 260 - r * Math.cos(a)];
    const A = 0.42, pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = -A + (2 * A * i) / 16;
      const th = 5 + 10 * Math.cos((a / A) * Math.PI * 0.5);
      pts.push(arc(236 + th * 0.5, a));
    }
    for (let i = 16; i >= 0; i--) {
      const a = -A + (2 * A * i) / 16;
      const th = 5 + 10 * Math.cos((a / A) * Math.PI * 0.5);
      pts.push(arc(236 - th * 0.5, a));
    }
    const id = 'dg' + Math.floor(Math.random() * 1e9);
    el.innerHTML = `<defs><radialGradient id="${id}" cx="130" cy="260" r="250" gradientUnits="userSpaceOnUse"><stop offset=".88" stop-color="#ff2a1f" stop-opacity=".25"/><stop offset=".95" stop-color="#ff3b2c"/><stop offset="1" stop-color="#ff7a5c"/></radialGradient></defs>
      <path d="M${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L')} Z" fill="url(#${id})" style="filter: drop-shadow(0 0 8px rgba(255,40,20,.75))"/>
      <path d="M${arc(214, -0.06).join(',')} L${arc(206, 0).join(',')} L${arc(214, 0.06).join(',')}" fill="none" stroke="#ff6a55" stroke-width="3"/>`;
    this.el.dmg.appendChild(el);
    this.indicators.push({ el, x, z, t: 0, k: clamp(0.7 + amount / 30, 0.7, 1.2), b: 0 });
  }
  ping(pos) {
    const same = this.pings.find((p) => Math.hypot(p.x - pos.x, p.z - pos.z) < 2);
    if (same) { same.t = 0; same.x = pos.x; same.z = pos.z; return; }
    this.pings.push({ x: pos.x, z: pos.z, t: 0 });
  }
  feed({ killer, victim, head, weapon }, callsign) {
    const nm = (n) => (n === 'self' ? [callsign, 'self'] : [n, 'foe']);
    const [kn, kc] = nm(killer), [vn, vc] = nm(victim);
    const row = document.createElement('div');
    row.className = 'k';
    row.innerHTML = `<span class="${kc}">${T(kn, { size: 12, weight: 1.25, tracking: 1.9 })}</span>
      <span class="kw">${this.gunImg(15)}</span>${head ? `<span class="hs">${headshotSVG('', 20)}</span>` : ''}
      <span class="${vc}">${T(vn, { size: 12, weight: 1.25, tracking: 1.9 })}</span>`;
    this.el.feed.prepend(row);
    row._t = 0;
    while (this.el.feed.children.length > 5) this.el.feed.lastElementChild.remove();
  }
  xp(lines, total) {
    // substitui a pilha anterior (como os jogos do gênero fazem)
    this.el.xp.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'row';
    head.innerHTML = `<span class="tot">${T('+' + total, { size: 26, weight: 1.5, tracking: 1.6 })}</span>`;
    this.el.xp.appendChild(head);
    lines.forEach(([label, v], i) => {
      const r = document.createElement('div');
      r.className = 'row';
      r.style.animationDelay = 0.06 * (i + 1) + 's';
      r.innerHTML = `<span class="lab">${T(label, { size: 11, weight: 1.2, tracking: 2.2 })}</span><span class="pts">${T('+' + v, { size: 11, weight: 1.3 })}</span>`;
      this.el.xp.appendChild(r);
    });
    this.xpT = 0;
  }
  medal(kind, title, pts) {
    const m = document.createElement('div');
    m.className = 'm';
    m.innerHTML = `<div class="ic">${medalSVG(kind, 76)}</div>${T(title, { size: 18, weight: 1.45, tracking: 2.6 })}<div style="color:var(--amber)">${T('+' + pts, { size: 12, weight: 1.3 })}</div>`;
    this.el.medal.innerHTML = '';
    this.el.medal.appendChild(m);
    this.medalT = 0;
  }
  banner(title, sub) {
    const b = this.el.banner;
    b.innerHTML = `${T(title, { size: 40, weight: 1.5, tracking: 4 })}<div class="bar"></div><div class="sub">${sub}</div>`;
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
  }
  death(on, killer, countdown) {
    const d = this.el.death;
    this.root.classList.toggle('dead', !!on);
    if (on) {
      d.innerHTML = `<div style="color:var(--red2)">${skullSVG('', 44)}</div>${T('KILLED IN ACTION', { size: 34, weight: 1.5, tracking: 4 })}
        <div class="by">${T('KILLED BY', { size: 11, weight: 1.2, tracking: 2.4 })}<span style="color:var(--red2)">${T(killer, { size: 16, weight: 1.4, tracking: 2.2 })}</span></div>
        <div class="cd"></div>`;
      d.classList.add('on');
    } else d.classList.remove('on');
  }

  // ─── por frame ──────────────────────────────────────────────────────
  frame(dt, ctx, m, st) {
    const p = ctx.player;
    const w = ctx.services.weapon;
    const E = this.el;
    const rdt = Math.min(0.05, Math.max(dt, ctx.time.frameDt || 0, 1 / 120));

    // mira (bloom)
    const ads = w?.ads ?? 0;
    const sprint = w?.sprint ?? (p.state?.sprinting ? 1 : 0);
    const speed = p.state?.speed || 0;
    const target = 8 + Math.min(14, speed * 2.4) + (p.onGround === false ? 12 : 0) + this.bloom + (p.state?.crouching ? -2 : 0);
    this.bloom = damp(this.bloom, 0, 7, rdt);
    this.gap = damp(this.gap, clamp(target, 6, 44), 16, rdt);
    const g = this.gap;
    const crossA = st.crosshair && !st.ads ? clamp(1 - ads * 2.2, 0, 1) * clamp(1 - sprint * 1.6, 0, 1) * (w?.reloading ? 0.55 : 1) : 0;
    this.set('crossA', crossA.toFixed(2), (v) => (E.cross.style.opacity = v));
    if (crossA > 0) {
      const gp = g.toFixed(1);
      this.set('gap', gp, () => {
        E.cl[0].style.transform = `translateY(${-g - 11}px)`;
        E.cl[1].style.transform = `translateY(${g}px)`;
        E.cl[2].style.transform = `translateX(${-g - 11}px)`;
        E.cl[3].style.transform = `translateX(${g}px)`;
      });
    }

    // hitmarker
    this.hitT += rdt;
    const kill = this.hitKind.includes('kill');
    const life = kill ? 0.5 : 0.24;
    const hT = Math.max(0, this.hitT);
    const ht = hT / life;
    if (ht < 1) {
      const pop = kill ? 1 + 0.35 * Math.exp(-hT * 18) : 1 + 0.25 * Math.exp(-hT * 30);
      const gap = (kill ? 9 : 7) * pop + (this.hitKind.includes('head') ? 2 : 0);
      const angs = [45, 135, 225, 315];
      E.hitI.forEach((i, n) => (i.style.transform = `rotate(${angs[n]}deg) translateY(${gap}px)`));
      E.hit.style.opacity = ht < 0.6 ? 1 : 1 - (ht - 0.6) / 0.4;
      if (kill) {
        const rk = hT / 0.4;
        E.ring.style.opacity = rk < 1 ? (1 - rk) * 0.9 : 0;
        E.ring.style.transform = `scale(${0.4 + rk * 0.9})`;
      } else E.ring.style.opacity = 0;
    } else this.set('hitOff', this.hitT > 0, () => (E.hit.style.opacity = 0));

    // indicadores de dano (acompanham a direção da fonte)
    const heading = headingOf(p.yaw);
    for (let i = this.indicators.length - 1; i >= 0; i--) {
      const d = this.indicators[i];
      d.t += rdt;
      const a = d.t < 0.12 ? d.t / 0.12 : clamp(1 - (d.t - 1.0) / 0.9, 0, 1);
      if (a <= 0 && d.t > 0.2) { d.el.remove(); this.indicators.splice(i, 1); continue; }
      d.b = bearing(d.x - p.position.x, d.z - p.position.z);
      const rel = d.b - heading;
      d.el.style.transform = `rotate(${rel.toFixed(1)}deg) scale(${(0.96 + 0.04 * d.k).toFixed(3)})`;
      d.el.style.opacity = (a * Math.min(1, d.k)).toFixed(3);
    }

    // vinheta de vida + desaturação
    const hp = this.virtualHealth ?? p.health;
    const frac = clamp(hp / (p.maxHealth || 100), 0, 1);
    const miss = 1 - frac;
    this.flashA = damp(this.flashA, 0, 3.2, rdt);
    const pulse = frac < 0.35 ? 0.08 * (0.5 + 0.5 * Math.sin(ctx.time.now * 7.5)) : 0;
    const vigA = clamp(Math.pow(miss, 1.1) * 1.05 + this.flashA * 0.35 + pulse, 0, 1);
    this.set('vig', vigA.toFixed(3), (v) => (this.vig.style.opacity = v));
    this.set('desat', clamp(miss * 1.4 - 0.2, 0, 1).toFixed(2), (v) => (this.desat.style.opacity = v));
    this.set('flash', this.flashA.toFixed(3), (v) => (this.flash.style.opacity = v));

    // bússola + minimapa
    for (let i = this.pings.length - 1; i >= 0; i--) if ((this.pings[i].t += rdt) > 3) this.pings.splice(i, 1);
    const pp = p.position;
    const fadeA = (t) => (t < 2 ? 1 : 1 - (t - 2));
    this.compass.draw(heading, this.pings.map((q) => ({ bearing: bearing(q.x - pp.x, q.z - pp.z), a: fadeA(q.t) })));
    this.minimap.rotate = st.minimapRotate;
    this.minimap.draw(ctx, { yaw: p.yaw, pos: pp, pings: this.pings.map((q) => ({ x: q.x, z: q.z, a: fadeA(q.t) })) });

    // placar
    const tl = Math.ceil(m.timeLeft);
    this.set('timer', tl, (v) => {
      E.timer.innerHTML = T(`${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`, { size: 15, weight: 1.4, tracking: 1.8 });
      E.timer.classList.toggle('low', v <= 60);
    });
    this.set('us', m.kills, (v) => {
      E.usN.innerHTML = T(String(v), { size: 14, weight: 1.45 });
      E.usF.style.width = `calc((100% - 52px) * ${clamp(v / MODE.target, 0, 1)})`;
    });
    const alive = ctx.services.enemies?.count?.() ?? 0;
    this.set('them', m.deaths + '|' + alive, () => {
      E.thN.innerHTML = T(String(m.deaths), { size: 14, weight: 1.45 });
      E.thF.style.width = `calc((100% - 52px) * ${clamp(m.deaths / MODE.target, 0, 1)})`;
      E.thG.innerHTML = T(`${alive} ACTIVE`, { size: 9, weight: 1.1, tracking: 1.9 });
    });

    // feed: envelhecimento
    for (const row of [...E.feed.children]) {
      row._t = (row._t || 0) + rdt;
      if (row._t > 6 && !row.classList.contains('out')) row.classList.add('out');
      if (row._t > 6.5) row.remove();
    }
    if (this.xpT !== undefined) {
      this.xpT += rdt;
      if (this.xpT > 2.6 && !E.xp._out) { for (const r of E.xp.children) r.classList.add('out'); E.xp._out = true; }
      if (this.xpT > 3.1) { E.xp.innerHTML = ''; this.xpT = undefined; }
      else if (this.xpT < 0.1) E.xp._out = false;
    }
    if (this.medalT !== undefined) {
      this.medalT += rdt;
      if (this.medalT > 2.4) E.medal.firstChild?.classList.add('out');
      if (this.medalT > 2.8) { E.medal.innerHTML = ''; this.medalT = undefined; }
    }

    // arma
    if (w) {
      this.set('wname', w.name || 'RIFLE', (v) => (E.wname.innerHTML = T(v, { size: 14, weight: 1.3, tracking: 2.4 })));
      const mag = w.magSize || 30, ammo = w.ammo ?? 0, res = w.reserve ?? 0;
      const low = ammo <= Math.ceil(mag * 0.25);
      this.set('ammo', ammo, (v) => {
        E.mag.innerHTML = T(String(v), { size: 46, weight: 1.38, tracking: 1.5 });
        E.mag.className = 'mag' + (v === 0 ? ' empty' : low ? ' low' : '');
      });
      this.set('res', res, (v) => (E.res.innerHTML = T(String(v), { size: 17, weight: 1.25, tracking: 1.6 })));
      if (this._ticksN !== mag) {
        this._ticksN = mag;
        E.ticks.innerHTML = '<i></i>'.repeat(mag);
        this.cache.tick = -1;
      }
      this.set('tick', ammo, (v) => {
        [...E.ticks.children].forEach((t, i) => t.classList.toggle('s', i >= v));
        E.ticks.className = 'ticks' + (v === 0 ? ' empty' : low ? ' low' : '');
      });
      // aviso de recarga
      const reloading = !!w.reloading;
      let pr = '';
      if (reloading) pr = '';
      else if (ammo === 0 && res === 0) pr = 'noammo';
      else if (low) pr = 'reload';
      this.set('prompt', pr, (v) => {
        E.prompt.className = 'prompt sh' + (v === 'noammo' ? ' red' : '');
        E.prompt.innerHTML = v === 'reload' ? `<span class="key">${T('R', { size: 11, weight: 1.4 })}</span>${T('RELOAD', { size: 13, weight: 1.35, tracking: 2.6 })}` : v === 'noammo' ? T('NO AMMO', { size: 13, weight: 1.35, tracking: 2.6 }) : '';
        E.prompt.style.opacity = v ? 1 : 0;
      });
      this.reloadT = reloading ? (this.reloadT || 0) + rdt : 0;
      this.set('rl', reloading, (v) => (E.reload.style.opacity = v ? 1 : 0));
      if (reloading) E.reloadI.style.width = clamp(this.reloadT / (this.reloadDur || 2.2), 0, 1) * 100 + '%';
    }
    this.set('wpnVis', !!w, (v) => {
      E.wpn.style.display = v ? '' : 'none';
      E.equip.style.display = v ? '' : 'none';
    });

    // vida
    this.hpLag = hp < this.hpLag ? damp(this.hpLag, hp, this.hpLagHold > 0 ? 0 : 3, rdt) : hp;
    if (hp < this.lastHp) this.hpLagHold = 0.45;
    this.hpLagHold = (this.hpLagHold || 0) - rdt;
    this.lastHp = hp;
    const hpi = Math.ceil(hp);
    this.set('hp', hpi, (v) => {
      E.hpCur.style.width = v + '%';
      E.hpNum.innerHTML = T(String(v), { size: 14, weight: 1.4 });
      E.vit.classList.toggle('low', v < 35);
    });
    E.hpLag.style.width = clamp(this.hpLag, 0, 100) + '%';
    this.set('streak', m.streak, (v) => {
      let s = T('STREAK', { size: 9, weight: 1.1, tracking: 2 });
      for (let i = 0; i < 5; i++) s += `<b class="${i < v ? 'on' : ''}"></b>`;
      E.streak.innerHTML = s;
    });
  }
}
