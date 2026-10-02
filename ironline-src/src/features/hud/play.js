/**
 * HUD de jogo: mira com bloom, hitmarkers (normal / headshot / abate),
 * indicadores direcionais de dano, vinheta de vida nas bordas, bússola,
 * minimapa, placar/objetivo, feed de abates, XP/medalhas, painel da arma,
 * equipamentos e vida.
 */
import { svgText } from './font.js';
import { rifleSVG, fragSVG, flashSVG, headshotSVG, skullSVG, medalSVG, rankSVG, weaponIcon } from './icons.js';
import { Compass, headingOf, bearing } from './compass.js';
import { Minimap } from './minimap.js';
import { MODE } from './match.js';

const T = (s, o) => svgText(s, o);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

/**
 * Máscara da vinheta de dano: borda radial apertada (superelipse) com
 * curva de queda suave — o centro (~60% da tela) fica LIMPO; a pressão se
 * concentra nos cantos e bordas. Sem manchas/"sangue na lente": só um leve
 * ruído de baixa amplitude na borda extrema para quebrar o degradê.
 */
function makeVignette() {
  const w = 480, h = 270;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  let s = 1234567;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / (w - 1)) * 2 - 1, ny = (y / (h - 1)) * 2 - 1;
      // superelipse (p=3.2): bordas retas, cantos mais carregados
      const e = Math.pow(Math.pow(Math.abs(nx), 3.2) + Math.pow(Math.abs(ny) * 1.04, 3.2), 1 / 3.2);
      // faixa útil só nos ~20% externos: o miolo (≈ 60–65%) fica intocado
      let a = ss(0.8, 1.2, e);
      a = Math.pow(a, 1.9);
      const i = (y * w + x) * 4;
      // vermelho sangue na transição → quase preto na borda extrema
      const deep = ss(0.9, 1.25, e);
      // vermelho escuro e pouco saturado (sangue/perda de visão), sem chegar ao preto
      img.data[i] = 112 - deep * 58 + (rnd() - 0.5) * 6;
      img.data[i + 1] = 14 - deep * 8;
      img.data[i + 2] = 12 - deep * 7;
      img.data[i + 3] = 255 * a * 0.78 + (rnd() - 0.5) * 3 * a;
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
    this.edge = document.createElement('div');
    this.edge.className = 'edge';
    fx.append(this.desat, this.vig, this.edge, this.flash);
    this.fx = fx;

    const root = (this.root = document.createElement('div'));
    root.className = 'play';
    root.innerHTML = `
      <div class="corner tl"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="dmg"></div>
      <div class="cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
      <div class="hitm"><div class="ring"></div><div class="xs"><i></i><i></i><i></i><i></i></div><div class="xo"><i></i><i></i><i></i><i></i></div></div>
      <div class="prompt sh"></div>
      <div class="xp"></div>
      <div class="medal"></div>
      <div class="banner sh"></div>
      <div class="score sh">
        <div class="top"><div class="timer"></div><div class="mode">${T(MODE.name, { size: 12, weight: 1.45, tracking: 2.4 })}</div></div>
        <div class="rowx us"><div class="n"></div><div class="trk"><div class="fill"></div></div><div class="tag">${T('IRONLINE', { size: 11, weight: 1.35, tracking: 2.2 })}</div><div class="goal">${T('TO ' + MODE.target, { size: 11, weight: 1.3, tracking: 1.9 })}</div></div>
        <div class="rowx them"><div class="n"></div><div class="trk"><div class="fill"></div></div><div class="tag">${T('HOSTILES', { size: 11, weight: 1.35, tracking: 2.2 })}</div><div class="goal"></div></div>
      </div>
      <div class="feed"></div>
      <div class="equip sh">
        <div class="e"><div class="kb"><span class="key">${T('Q', { size: 11, weight: 1.4 })}</span></div>${flashSVG('', 24)}${T('2', { size: 13, weight: 1.4, heavy: true })}</div>
        <div class="e"><div class="kb"><span class="key">${T('G', { size: 11, weight: 1.4 })}</span></div>${fragSVG('', 24)}${T('2', { size: 13, weight: 1.4, heavy: true })}</div>
      </div>
      <div class="wpn">
        <div class="plate"></div>
        <div class="head"><span class="mode">${T('AUTO', { size: 11, weight: 1.35, tracking: 2 })}</span><span class="nm"></span></div>
        <div class="main">
          <div class="gun">${rifleSVG('', 168)}</div>
          <div class="count"><div class="mag"></div><div class="res"><span class="rl">${T('/', { size: 14, weight: 1.4, heavy: true })}</span><span class="rv"></span></div></div>
        </div>
        <div class="ticks"></div>
        <div class="reload"><i></i></div>
        <div class="state"></div>
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
      cross: q('.cross'), cl: [...q('.cross').children], hit: q('.hitm'), hitI: [...q('.hitm .xs').children], hitO: [...q('.hitm .xo').children], ring: q('.hitm .ring'),
      prompt: q('.prompt'), xp: q('.xp'), medal: q('.medal'), banner: q('.banner'), dmg: q('.dmg'),
      timer: q('.score .timer'), usN: q('.rowx.us .n'), usF: q('.rowx.us .fill'), thN: q('.rowx.them .n'), thF: q('.rowx.them .fill'), thG: q('.rowx.them .goal'),
      feed: q('.feed'), wname: q('.wpn .nm'), mag: q('.wpn .mag'), res: q('.wpn .rv'), ticks: q('.wpn .ticks'), reload: q('.wpn .reload'), reloadI: q('.wpn .reload i'), wstate: q('.wpn .state'),
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
    const h = 62;
    this.root.querySelector('.wpn .gun').innerHTML = `<img src="${icon.shaded || icon.url}" style="height:${h}px;width:${Math.round(h * icon.aspect)}px;display:block" alt="">`;
  }
  gunImg(h) {
    const i = this.gunIcon;
    return i ? `<img src="${i.url}" style="height:${h}px;width:${Math.round(h * i.aspect)}px;display:block" alt="">` : rifleSVG('', h * 3.6);
  }

  setProfile(P, level) {
    this.el.cs.innerHTML = T(P.callsign, { size: 14, weight: 1.45, tracking: 2.3 });
    this.el.lv.innerHTML = T('LV ' + level, { size: 11, weight: 1.35, tracking: 1.8 });
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
      const same = this.indicators.find((d) => Math.abs(((b - d.b + 540) % 360) - 180) < 22);
      if (same) { same.t = 0; same.x = x; same.z = z; same.k = Math.min(1.5, same.k + 0.2); }
      else this.addIndicator(x, z, amount);
    }
    this.flashA = Math.min(0.9, this.flashA + 0.25 + amount / 60);
  }
  /**
   * Indicador direcional: cunha fina e afunilada sobre um anel ao redor da
   * mira (raio 150 px), degradê de alfa ao longo do arco, brilho externo e
   * uma "cauda" difusa voltada para o centro. Gira com a fonte do dano.
   */
  addIndicator(x, z, amount) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '-200 -200 400 400');
    const R = 150, A = 0.42;
    const P = (r, a) => [r * Math.sin(a), -r * Math.cos(a)];
    const wedge = (r0, th, A2, n = 24) => {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const a = -A2 + (2 * A2 * i) / n;
        const t = Math.cos((a / A2) * Math.PI * 0.5);
        pts.push(P(r0 + th * Math.pow(t, 1.4) * 0.5, a));
      }
      for (let i = n; i >= 0; i--) {
        const a = -A2 + (2 * A2 * i) / n;
        const t = Math.cos((a / A2) * Math.PI * 0.5);
        pts.push(P(r0 - th * Math.pow(t, 1.4) * 0.5, a));
      }
      return 'M' + pts.map((q) => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' L') + 'Z';
    };
    const id = 'dg' + (this._dgi = (this._dgi || 0) + 1);
    const tip = [P(R + 9, 0), P(R + 18, 0), P(R + 9, -0.035), P(R + 9, 0.035)];
    el.innerHTML = `<defs>
        <linearGradient id="${id}a" x1="-66" y1="0" x2="66" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#c8392c" stop-opacity="0"/><stop offset=".5" stop-color="#d9493a"/><stop offset="1" stop-color="#c8392c" stop-opacity="0"/></linearGradient>
        <radialGradient id="${id}t" cx="0" cy="0" r="${R}" gradientUnits="userSpaceOnUse"><stop offset=".72" stop-color="#b8301f" stop-opacity="0"/><stop offset="1" stop-color="#b8301f" stop-opacity=".14"/></radialGradient>
        <filter id="${id}f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
      </defs>
      <path class="tail" d="${wedge(R - 12, 18, A * 0.5)}" fill="url(#${id}t)"/>
      <path class="glow" d="${wedge(R, 14, A * 1.05)}" fill="#b8301f" opacity=".35" filter="url(#${id}f)"/>
      <path d="${wedge(R, 6.5, A)}" fill="url(#${id}a)"/>
      <path d="${wedge(R + 0.5, 2.2, A * 0.55)}" fill="#f0c6b8" opacity=".55"/>
      <path d="M${tip[2].join(',')} L${tip[1].join(',')} L${tip[3].join(',')} Z" fill="#d9493a"/>`;
    this.el.dmg.appendChild(el);
    // brilho na borda da tela na direção do atacante ("pressão" de borda)
    const eg = document.createElement('div');
    eg.className = 'eg';
    this.edge.appendChild(eg);
    this.indicators.push({ el, eg, x, z, t: 0, k: clamp(0.75 + amount / 30, 0.75, 1.25), b: 0 });
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
    const mine = killer === 'self' ? ' mine' : victim === 'self' ? ' died' : '';
    row.className = 'k' + mine;
    const wk = weapon || (killer === 'self' ? 'rifle' : 'hostile');
    row.innerHTML = `<span class="nm ${kc}">${T(kn, { size: 13, weight: 1.45, tracking: 1.9 })}</span>
      <span class="kw">${weaponIcon(wk, 20, (h) => this.gunImg(h))}</span>${head ? `<span class="hs">${headshotSVG('', 17)}</span>` : ''}
      <span class="nm ${vc}">${T(vn, { size: 13, weight: 1.45, tracking: 1.9 })}</span>`;
    this.el.feed.prepend(row);
    row._t = 0;
    while (this.el.feed.children.length > 5) this.el.feed.lastElementChild.remove();
  }
  xp(lines, total) {
    // um único toast: total + uma linha discreta com a composição
    const X = this.el.xp;
    X.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'tot';
    head.innerHTML = T('+' + total, { size: 22, weight: 1.55, tracking: 1.2, heavy: true });
    X.appendChild(head);
    if (lines.length) {
      const r = document.createElement('div');
      r.className = 'row';
      r.style.animationDelay = '.06s';
      r.innerHTML = lines.map(([label, v]) => T(`${label} ${v}`, { size: 11, weight: 1.35, tracking: 1.9 })).join('<span class="dot"></span>');
      X.appendChild(r);
    }
    X.classList.remove('on', 'out');
    void X.offsetWidth;
    X.classList.add('on');
    this.xpT = 0;
  }
  medal(kind, title, pts) {
    const m = document.createElement('div');
    m.className = 'm';
    // sem pontos aqui: a pontuação aparece só no toast sob a mira
    m.innerHTML = `<div class="ic">${medalSVG(kind, 54)}</div><div class="mt">${T(title, { size: 13, weight: 1.45, tracking: 2.6 })}</div>`;
    this.el.medal.innerHTML = '';
    this.el.medal.appendChild(m);
    this.medalT = 0;
  }
  banner(title, sub) {
    const b = this.el.banner;
    b.innerHTML = `${T(title, { size: 40, weight: 1.7, tracking: 4 })}<div class="bar"></div><div class="sub">${sub}</div>`;
    b.classList.remove('on');
    void b.offsetWidth;
    b.classList.add('on');
  }
  death(on, killer, countdown) {
    const d = this.el.death;
    this.root.classList.toggle('dead', !!on);
    if (on) {
      d.innerHTML = `<div style="color:var(--red2)">${skullSVG('', 44)}</div>${T('KILLED IN ACTION', { size: 34, weight: 1.7, tracking: 4 })}
        <div class="by">${T('KILLED BY', { size: 12, weight: 1.4, tracking: 2.4 })}<span style="color:var(--red2)">${T(killer, { size: 16, weight: 1.55, tracking: 2.2 })}</span></div>
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
        E.cl[0].style.transform = `translateY(${-g - 13}px)`;
        E.cl[1].style.transform = `translateY(${g}px)`;
        E.cl[2].style.transform = `translateX(${-g - 13}px)`;
        E.cl[3].style.transform = `translateX(${g}px)`;
      });
    }

    // hitmarker: quatro riscos finos (2 px). Acerto = branco, ~150 ms;
    // headshot = riscos um pouco mais longos; abate = vermelho, ~300 ms.
    // Leve "punch" de afastamento no primeiro instante, sem anel nem brilho.
    if (!this.hitPin) this.hitT += rdt;
    const kill = this.hitKind.includes('kill');
    const life = kill ? 0.3 : 0.16;
    const hT = Math.max(0, this.hitT);
    const ht = hT / life;
    if (ht < 1) {
      const pop = 1 + 0.35 * Math.exp(-hT * 30);
      const gap = (kill ? 7 : 6) * pop + (this.hitKind.includes('head') ? 1 : 0);
      const angs = [45, 135, 225, 315];
      E.hitI.forEach((i, n) => (i.style.transform = `rotate(${angs[n]}deg) translateY(${gap.toFixed(2)}px)`));
      E.hit.style.opacity = ht < 0.5 ? 1 : (1 - (ht - 0.5) / 0.5).toFixed(3);
    } else this.set('hitOff', this.hitT > 0, () => (E.hit.style.opacity = 0));

    // indicadores de dano (acompanham a direção da fonte) + pressão de borda
    const heading = headingOf(p.yaw);
    for (let i = this.indicators.length - 1; i >= 0; i--) {
      const d = this.indicators[i];
      d.t += rdt;
      // entrada rápida, segura ~0,9 s, cauda de 1 s
      const a = d.t < 0.08 ? d.t / 0.08 : clamp(1 - (d.t - 0.9) / 1.0, 0, 1);
      if (a <= 0 && d.t > 0.2) { d.el.remove(); d.eg.remove(); this.indicators.splice(i, 1); continue; }
      d.b = bearing(d.x - p.position.x, d.z - p.position.z);
      const rel = d.b - heading;
      const pulse = 1 + 0.08 * Math.exp(-d.t * 10);
      d.el.style.transform = `rotate(${rel.toFixed(1)}deg) scale(${((0.97 + 0.03 * d.k) * pulse).toFixed(3)})`;
      const ea = a * a * (3 - 2 * a);
      d.el.style.opacity = (ea * Math.min(1, d.k)).toFixed(3);
      // brilho de borda: centro de um elipse na borda, na direção relativa
      const rr = (rel * Math.PI) / 180;
      const ex = 50 + Math.sin(rr) * 68, ey = 50 - Math.cos(rr) * 68;
      d.eg.style.background = `radial-gradient(ellipse 30% 40% at ${clamp(ex, -8, 108).toFixed(1)}% ${clamp(ey, -8, 108).toFixed(1)}%, rgba(150,10,6,.34), rgba(120,8,4,.12) 40%, rgba(110,0,0,0) 66%)`;
      d.eg.style.opacity = (ea * 0.9 * Math.min(1, d.k)).toFixed(3);
    }

    // vinheta de vida (máscara de borda) + desaturação + pulso no impacto
    const hp = this.virtualHealth ?? p.health;
    const frac = clamp(hp / (p.maxHealth || 100), 0, 1);
    const miss = 1 - frac;
    this.flashA = damp(this.flashA, 0, 2.6, rdt);
    const pulse = frac < 0.35 ? 0.1 * (0.5 + 0.5 * Math.sin(ctx.time.now * 6.5)) : 0;
    const vigA = clamp(Math.pow(miss, 0.8) * 1.05 + this.flashA * 0.3 + pulse, 0, 1);
    this.set('vig', vigA.toFixed(3), (v) => (this.vig.style.opacity = v));
    this.set('desat', clamp(miss * 1.5 - 0.15 + this.flashA * 0.35, 0, 1).toFixed(2), (v) => (this.desat.style.opacity = v));
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
      E.timer.innerHTML = T(`${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`, { size: 17, weight: 1.4, tracking: 1.4, heavy: true });
      E.timer.classList.toggle('low', v <= 60);
    });
    this.set('us', m.kills, (v) => {
      E.usN.innerHTML = T(String(v), { size: 16, weight: 1.4, heavy: true });
      E.usF.style.width = clamp(v / MODE.target, 0, 1) * 100 + '%';
    });
    const alive = ctx.services.enemies?.count?.() ?? 0;
    this.set('them', m.deaths + '|' + alive, () => {
      E.thN.innerHTML = T(String(m.deaths), { size: 16, weight: 1.4, heavy: true });
      E.thF.style.width = clamp(m.deaths / MODE.target, 0, 1) * 100 + '%';
      E.thG.innerHTML = T(`${alive} ACTIVE`, { size: 11, weight: 1.3, tracking: 1.9 });
    });

    // feed: envelhecimento
    for (const row of [...E.feed.children]) {
      row._t = (row._t || 0) + rdt;
      // envelhece: linhas antigas esmaecem antes de sair
      const fo = row._t < 2.5 ? 1 : Math.max(0.5, 1 - (row._t - 2.5) * 0.16);
      if (row._fo !== fo.toFixed(2)) { row._fo = fo.toFixed(2); row.style.opacity = row._fo; }
      if (row._t > 6 && !row.classList.contains('out')) row.classList.add('out');
      if (row._t > 6.5) row.remove();
    }
    if (this.xpT !== undefined) {
      if (!this.hitPin) this.xpT += rdt;
      if (this.xpT > 2.4 && !E.xp._out) { E.xp.classList.add('out'); E.xp._out = true; }
      if (this.xpT > 2.9) { E.xp.innerHTML = ''; E.xp.classList.remove('on', 'out'); this.xpT = undefined; }
      else if (this.xpT < 0.1) E.xp._out = false;
    }
    if (this.medalT !== undefined) {
      if (!this.hitPin) this.medalT += rdt;
      if (this.medalT > 2.4) E.medal.firstChild?.classList.add('out');
      if (this.medalT > 2.8) { E.medal.innerHTML = ''; this.medalT = undefined; }
    }

    // arma
    if (w) {
      this.set('wname', w.name || 'RIFLE', (v) => (E.wname.innerHTML = T(v, { size: 15, weight: 1.5, tracking: 2.4 })));
      const mag = w.magSize || 30, ammo = w.ammo ?? 0, res = w.reserve ?? 0;
      const low = ammo <= Math.ceil(mag * 0.3);
      this.set('ammo', ammo, (v) => {
        E.mag.innerHTML = T(String(v), { size: 50, weight: 1.5, tracking: 1.2, heavy: true });
        E.mag.className = 'mag' + (v === 0 ? ' empty' : low ? ' low' : '');
      });
      this.set('res', res, (v) => (E.res.innerHTML = T(String(v), { size: 18, weight: 1.4, tracking: 1.4, heavy: true })));
      // carregador: blocos de 5 cartuchos com preenchimento parcial — lê-se
      // "quantos blocos sobram" de relance, sem contar riscos
      const nb = Math.ceil(mag / 5);
      if (this._ticksN !== mag) {
        this._ticksN = mag;
        E.ticks.innerHTML = '<i><b></b></i>'.repeat(nb);
        this.cache.tick = -1;
      }
      this.set('tick', ammo + '|' + low, () => {
        [...E.ticks.children].forEach((t, i) => {
          const f = clamp((ammo - i * 5) / 5, 0, 1);
          t.firstChild.style.width = (f * 100).toFixed(0) + '%';
          t.className = f >= 1 ? 'f' : f > 0 ? 'p' : '';
        });
        E.ticks.className = 'ticks' + (ammo === 0 ? ' empty' : low ? ' low' : '');
      });
      const ws = w.reloading ? 'reloading' : ammo === 0 ? (res === 0 ? 'noammo' : 'empty') : low ? 'low' : '';
      this.set('wstate', ws, (v) => {
        E.wpn.classList.toggle('is-low', v === 'low' || v === 'empty' || v === 'noammo');
        E.wstate.className = 'state ' + v;
        E.wstate.innerHTML = v === 'low' ? T('LOW AMMO', { size: 11, weight: 1.45, tracking: 2.4 }) : v === 'empty' || v === 'noammo' ? T(v === 'noammo' ? 'NO AMMO' : 'EMPTY', { size: 11, weight: 1.45, tracking: 2.4 }) : v === 'reloading' ? T('RELOADING', { size: 11, weight: 1.45, tracking: 2.4 }) : '';
      });
      // aviso de recarga
      const reloading = !!w.reloading;
      let pr = '';
      if (reloading) pr = '';
      else if (ammo === 0 && res === 0) pr = 'noammo';
      else if (low) pr = 'reload';
      this.set('prompt', pr, (v) => {
        E.prompt.className = 'prompt sh' + (v === 'noammo' ? ' red' : '');
        E.prompt.innerHTML = v === 'reload' ? `<span class="key">${T('R', { size: 12, weight: 1.5 })}</span>${T('RELOAD', { size: 14, weight: 1.5, tracking: 2.6 })}` : v === 'noammo' ? T('NO AMMO', { size: 14, weight: 1.5, tracking: 2.6 }) : '';
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
      E.hpNum.innerHTML = T(String(v), { size: 15, weight: 1.4, heavy: true });
      E.vit.classList.toggle('low', v < 35);
    });
    E.hpLag.style.width = clamp(this.hpLag, 0, 100) + '%';
    this.set('streak', m.streak, (v) => {
      let s = `<span class="sl">${T('STREAK', { size: 11, weight: 1.4, tracking: 2.2 })}</span>`;
      for (let i = 0; i < 5; i++) s += `<b class="${i < v ? 'on' : ''}"></b>`;
      s += `<span class="sv">${T(String(v), { size: 12, weight: 1.4, heavy: true })}</span>`;
      E.streak.innerHTML = s;
    });
  }
}
