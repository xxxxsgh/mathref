/**
 * Telas de frontend: menu principal (sobre a cena ao vivo), loadout,
 * configurações, pausa, placar (Tab) e relatório de fim de partida.
 *
 * Cada tela é montada como DOM ao abrir (re-render barato) e vive dentro da
 * prancheta 1920×1080. Navegação por mouse e teclado (↑/↓/Enter/Esc).
 */
import { svgText, pathFor } from './font.js';
import { rifleSVG, pistolSVG, fragSVG, flashSVG, rankSVG, medalSVG, skullSVG, headshotSVG, knifeSVG, challengeSVG } from './icons.js';
import { MODE } from './match.js';
import { callingCard, emblemSVG } from './art.js';
import { cropPhoto, photoTitle } from './photo.js';
import { levelOf, CROSS_COLORS, vfovToH } from './settings.js';

const T = (s, o) => svgText(s, o);
const t11 = (s, o = {}) => T(s, { size: 12, weight: 1.4, tracking: 2.3, ...o });
// valores numéricos: face pesada
const N = (s, size = 20, o = {}) => T(String(s), { size, weight: 1.5, heavy: true, ...o });
/** face secundária: monoespaçada do sistema para metadados/leituras de dados */
const mono = (s) => `<span class="mono">${String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`;
const key = (k) => `<span class="key">${T(k, { size: 11, weight: 1.45 })}</span>`;
// função de cada combatente hostil (identidade na tabela, em vez de 'HOSTILE' repetido)
const ROLES = ['RIFLEMAN', 'GUNNER', 'MARKSMAN', 'GRENADIER', 'SCOUT', 'BREACHER', 'RADIOMAN'];
const hashStr = (t) => [...String(t)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Logo: emblema (chevron duplo num losango chanfrado) + palavra
export function logo(size = 24) {
  const s = size * 1.7;
  return `<span class="mark"><svg width="${s}" height="${s}" viewBox="0 0 40 40"><path d="M20,2 L38,20 L20,38 L2,20 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M11,17 L20,25 L29,17 M11,11 L20,19 L29,11" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="miter"/><path d="M14,30 H26" stroke="currentColor" stroke-width="2"/></svg></span>${T('IRONLINE', { size, weight: 1.55, tracking: 3.4 })}`;
}

const PRIMARIES = [
  { name: 'KR-9', cls: 'ASSAULT RIFLE', stats: [72, 64, 70, 66, 58, 60], svg: (w) => rifleSVG('', w) },
];
const ATT = {
  optic: { label: 'OPTIC', opts: ['IRON SIGHTS', 'MK3 REFLEX', 'HOLO-2 SIGHT'], mod: [[0, 0, 0, -4, 2, 0], [0, 0, 0, 4, 0, 0], [0, 2, 0, 6, -2, 0]] },
  muzzle: { label: 'MUZZLE', opts: ['FLASH HIDER', 'COMPENSATOR', 'SUPPRESSOR'], mod: [[0, 0, 0, 0, 0, 2], [0, 0, 0, 2, -2, 10], [-4, 8, 0, 0, -4, 4]] },
  grip: { label: 'UNDERBARREL', opts: ['NONE', 'VERTICAL GRIP', 'ANGLED GRIP'], mod: [[0, 0, 0, 0, 4, -4], [0, 0, 0, 2, -3, 9], [0, 0, 0, 6, -1, 4]] },
};
const STAT_NAMES = ['DAMAGE', 'RANGE', 'FIRE RATE', 'ACCURACY', 'MOBILITY', 'CONTROL'];

const OPTS = {
  CONTROLS: [
    { id: 'sens', name: 'MOUSE SENSITIVITY', type: 'range', min: 1, max: 20, step: 0.1, fmt: (v) => v.toFixed(1), help: 'How fast the view turns with the mouse. 6.0 is the factory default.' },
    { id: 'adsSens', name: 'ADS SENSITIVITY MULTIPLIER', type: 'range', min: 0.3, max: 1.5, step: 0.01, fmt: (v) => v.toFixed(2), help: 'Multiplier applied while aiming down sights. Lower values help with precise long-range shots.' },
    { id: 'invertY', name: 'INVERT VERTICAL LOOK', type: 'bool', help: 'Inverts the vertical mouse axis.' },
  ],
  GRAPHICS: [
    { id: 'quality', name: 'QUALITY PRESET', type: 'seg', opts: ['low', 'medium', 'high', 'ultra'], help: 'Overall graphics preset: shadows, ambient occlusion, bloom, draw distance and particles. Ultra needs a dedicated GPU.' },
    { id: 'fov', name: 'FIELD OF VIEW', type: 'range', min: 80, max: 120, step: 1, fmt: (v) => String(Math.round(v)), help: 'Horizontal field of view (16:9 reference). Higher values show more of the periphery; lower values bring the weapon and target closer.' },
  ],
  AUDIO: [
    { id: 'volume', name: 'MASTER VOLUME', type: 'range', min: 0, max: 1, step: 0.01, fmt: (v) => String(Math.round(v * 100)), help: 'Overall game volume.' },
  ],
  INTERFACE: [
    { id: 'crosshair', name: 'CROSSHAIR COLOR', type: 'seg', opts: Object.keys(CROSS_COLORS), help: 'Color of the hip-fire crosshair.' },
    { id: 'minimapRotate', name: 'ROTATE MINIMAP', type: 'bool', help: 'On: the minimap rotates with you (forward is always up). Off: north is always up.' },
  ],
};

export class Screens {
  constructor(hud, stage) {
    this.hud = hud;
    this.ctx = hud.ctx;
    this.root = document.createElement('div');
    this.root.className = 'screens';
    stage.appendChild(this.root);
    this.cur = null;
    this.setTab = 'CONTROLS';
    this.loTab = 'primary';
    this.focusIdx = 0;
    this.grain = makeGrain();
  }

  get open() {
    return this.cur;
  }

  show(name) {
    this.cur = name;
    this.root.innerHTML = '';
    if (!name) {
      this.hud.onScreen?.(null, null);
      return;
    }
    const el = document.createElement('div');
    el.className = `scr ${name} interactive`;
    el.innerHTML = this[name]();
    this.root.appendChild(el);
    this.el = el;
    this.bind(name, el);
    requestAnimationFrame(() => el.classList.add('on'));
    if (this.ctx.shot) el.classList.add('on');
    this.focusIdx = 0;
    this.focus(0);
    this.hud.onScreen?.(name, el);
  }

  /**
   * Arte de cartão: FOTO do próprio mundo (photo.js), recortada e com
   * título; enquanto a foto não existe, a ilustração procedural. O
   * elemento leva `data-photo` para ser trocado quando a foto chegar.
   */
  art(key, w, h, o = {}) {
    const url = this.artUrl(key, w, h, o);
    const id = 'a' + (this._ai = (this._ai || 0) + 1);
    (this._artReq ||= new Map()).set(id, { key, w, h, o });
    return `data-photo="${key}" data-art="${id}" style="background-image:url(${url})"`;
  }
  artUrl(key, w, h, o = {}) {
    const ck = [key, w, h, o.title || '', o.sub || ''].join('|');
    this._artCache ||= new Map();
    if (this._artCache.has(ck)) return this._artCache.get(ck);
    const ph = this.hud.photos?.get(key);
    let url;
    // o.illus: arte ilustrada (calling card), nunca captura de jogo
    if (ph && !o.illus) {
      url = cropPhoto(ph, w * 2 > 1200 ? w : w * 2, h * 2 > 1200 ? h : h * 2, {
        fx: o.fx ?? 0.5, fy: o.fy ?? 0.5, zoom: o.zoom ?? 1,
        overlay: (g, W, H) => photoTitle(g, W, H, o.title, o.sub),
      });
      this._artCache.set(ck, url);
    } else {
      // mesma proporção do elemento (background-size: cover não corta o título)
      const k = Math.max(1, 420 / w, 105 / h);
      url = callingCard(o.title || '', { seed: key.length * 7 + 2, theme: key === 'event' ? 2 : key === 'bp' ? 1 : 0, w: Math.round(w * k), h: Math.round(h * k), sub: o.sub || '' });
    }
    return url;
  }
  /** foto chegou: troca a arte dos elementos já na tela */
  photoReady(key) {
    if (!this.el) return;
    for (const el of this.el.querySelectorAll(`[data-photo="${key}"]`)) {
      const r = this._artReq?.get(el.dataset.art);
      if (r) el.style.backgroundImage = `url(${this.artUrl(r.key, r.w, r.h, r.o)})`;
    }
  }

  /** "cromo" de interface: linhas chanfradas e marcas (sem microtexto ilegível) */
  chrome(top = 118) {
    const B = 1002;
    return `<svg class="chrome" width="1920" height="1080" viewBox="0 0 1920 1080">
      <g fill="none" stroke="rgba(242,244,239,.14)" stroke-width="1">
        <path d="M96,${top} H700 L716,${top + 10} H1204 L1220,${top} H1824"/>
        <path d="M96,${B} H640 L656,${B - 10} H1264 L1280,${B} H1824"/>
      </g>
      <g stroke="rgba(255,178,46,.75)" stroke-width="2"><path d="M96,${top} H140 M1780,${top} H1824 M716,${top + 10} H760 M1160,${top + 10} H1204"/></g>
      <g fill="rgba(242,244,239,.3)">${Array.from({ length: 24 }, (_, i) => `<rect x="${730 + i * 19}" y="${top + 16}" width="1" height="${i % 4 ? 3 : 6}"/>`).join('')}</g>
    </svg>`;
  }

  bgMenu() {
    return `<div class="shade-l"></div><div class="shade-vig"></div><div class="grain" style="background-image:url(${this.grain})"></div>`;
  }
  topbar(active) {
    const P = this.hud.profile;
    const lv = levelOf(P.xp);
    const tabs = [['main', 'PLAY'], ['loadout', 'LOADOUT'], ['settings', 'SETTINGS']];

    return `<div class="topbar sh">
      <div class="logo">${logo(22)}</div>
      <div class="tabs">${tabs.map(([id, n]) => `<div class="tab ${id === active ? 'on' : ''}" data-go="${id}">${T(n, { size: 14, weight: 1.5, tracking: 2.6 })}</div>`).join('')}</div>
      <div class="card">
        <div class="pc" ${this.art('card', 400, 64, { fy: 0.42 })}>
          <span class="em">${emblemSVG('vance', 50, 'gold')}</span>
          <div class="meta">${T(P.callsign, { size: 16, weight: 1.6, tracking: 2.4 })}${t11(`[${P.tag}]  ·  OPERATOR`, { size: 11 })}<div class="xpb"><i style="width:${((lv.into / lv.need) * 100).toFixed(1)}%"></i></div></div>
        </div>
        <div class="lvl"><span class="rk">${rankSVG(lv.level, '', 30)}</span>${N(lv.level, 18)}</div>
      </div></div>`;
  }
  footer(hints) {
    return `<div class="foot sh">${hints.map(([k, l]) => `<div class="h">${key(k)}${t11(l, { size: 12 })}</div>`).join('')}<div class="ver">${mono('BUILD 0.3.0 · MERIDIAN')}</div></div>`;
  }

  // ─── principal ──────────────────────────────────────────────────────
  main() {
    const P = this.hud.profile;
    const ch = [
      ['head', 'HEADSHOT KILLS', Math.min(P.headshots % 10, 10), 10, 2500],
      ['kill', 'ELIMINATE HOSTILES', Math.min(P.kills % 25, 25), 25, 3000],
      ['long', 'WIN A FRONTLINE MATCH', Math.min(P.wins % 1, 1), 1, 5000],
    ];
    const g = this.hud.gunIcon;
    const wname = this.ctx.services.weapon?.name || 'KR-9';
    return `<div class="dof"></div>${this.bgMenu()}<div class="hero-host"></div><div class="shade-hero"></div>${this.chrome()}${this.topbar('main')}
      <div class="col sh">
        <div class="eyebrow">${t11('SOLO OPERATIONS  ·  QUICK PLAY')}</div>
        <div class="title">${T(MODE.name, { size: 74, weight: 1.9, tracking: 3 })}</div>
        <div class="desc">Hold Meridian Street against ${MODE.waves.length} assault waves before time runs out. Each wave pushes up the street, takes cover and flanks — reload between waves and keep the initiative.</div>
        <div class="facts">
          <div class="f"><span class="k">${t11('MAP')}</span>${T(MODE.map, { size: 16, weight: 1.6, tracking: 2.2 })}</div>
          <div class="f"><span class="k">${t11('TIME LIMIT')}</span>${N(fmtTime(MODE.time), 16)}</div>
          <div class="f"><span class="k">${t11('OBJECTIVE')}</span>${T(MODE.waves.length + ' WAVES · ' + MODE.target + ' HOSTILES', { size: 16, weight: 1.6, tracking: 2.2 })}</div>
          <div class="f"><span class="k">${t11('THREAT')}</span><span style="color:var(--red2)">${T('HIGH', { size: 16, weight: 1.6, tracking: 2.2 })}</span></div>
        </div>
        <div class="btns">
          <div class="btn pri" data-act="deploy" tabindex="0">${T('DEPLOY', { size: 24, weight: 2.1, tracking: 4 })}<span class="chev">${T('>>', { size: 16, weight: 2.2, tracking: 0.8 })}</span></div>
          <div class="btn" data-go="loadout" tabindex="0">${T('EDIT LOADOUT', { size: 15, weight: 1.55, tracking: 2.6 })}<span class="hint">${key('L')}</span></div>
          <div class="btn" data-go="settings" tabindex="0">${T('SETTINGS', { size: 15, weight: 1.55, tracking: 2.6 })}<span class="hint">${key('O')}</span></div>
        </div>
      </div>
      <div class="feat sh">
        <div class="tile ev" ${this.art('event', 600, 300, { title: 'IRON DAWN', sub: 'LIMITED EVENT  ·  6 DAYS LEFT', fy: 0.5 })}><div class="tg">${t11('EVENT', { size: 11 })}</div><div class="pr"><i style="width:62%"></i></div><div class="pv">${t11('TIER 5 / 8')}</div></div>
        <div class="tile wk"><div class="tg">${t11('WEAPON OF THE OPERATION', { size: 11 })}</div>
          <div class="wimg">${g ? `<img src="${g.shaded || g.url}" style="height:58px;width:${Math.round(58 * g.aspect)}px" alt="">` : rifleSVG('', 200)}</div>
          <div class="wn">${T(wname, { size: 18, weight: 1.7, tracking: 2.4 })}<span>${t11('+50% WEAPON XP')}</span></div></div>
      </div>
      <div class="opname sh"><div class="l1">${t11('OPERATOR')}</div>${T('SGT. ' + P.callsign, { size: 22, weight: 1.8, tracking: 3 })}<div class="l2">${mono('1ST RECON DET. · IRONLINE')}</div></div>
      <div class="side sh">
        <div class="panel">
          <div class="ph">${T('DAILY CHALLENGES', { size: 14, weight: 1.6, tracking: 2.4 })}<span class="r">${mono('RESETS 14H 22M')}</span></div>
          ${ch.map(([k, d, v, n, xp]) => `<div class="chal"><div class="ic">${challengeSVG(k, v / n, 44)}</div>
            <div class="tx"><span class="d">${T(d, { size: 12, weight: 1.45, tracking: 1.9 })}</span><div class="pb"><i style="width:${(v / n) * 100}%"></i></div><span class="x">${t11('+' + xp + ' XP')}</span></div><span class="v">${N(`${v}/${n}`, 14)}</span></div>`).join('')}
        </div>
        <div class="panel bp"><div class="ph">${T('SEASON 01  ·  BATTLE PASS', { size: 14, weight: 1.6, tracking: 2.4 })}<span class="r">${mono('TIER 23 / 100')}</span></div>
          <div class="bpb"><div class="pips">${Array.from({ length: 10 }, (_, i) => `<i class="${i < 6 ? 'on' : i === 6 ? 'cur' : ''}"></i>`).join('')}</div>
            <div class="rw"><div class="cc" ${this.art('bp', 336, 84, { fy: 0.45 })}></div><div class="rt">${t11('NEXT REWARD', { size: 11 })}${T('CALLING CARD  ·  WHITEOUT', { size: 13, weight: 1.55, tracking: 1.8 })}</div></div></div></div>
        <div class="panel"><div class="ph">${T('CAREER', { size: 14, weight: 1.6, tracking: 2.4 })}<span class="r">${mono(`${P.matches} MATCHES`)}</span></div>
          <div class="kv" style="grid-template-columns:1fr 1fr 1fr">
            <div><span class="k">${t11('KILLS')}</span>${N(P.kills, 26)}</div>
            <div><span class="k">${t11('HEADSHOTS')}</span>${N(P.headshots, 26)}</div>
            <div><span class="k">${t11('WINS')}</span>${N(P.wins, 26)}</div>
          </div></div>
      </div>
      ${this.footer([['ENTER', 'DEPLOY'], ['L', 'LOADOUT'], ['O', 'SETTINGS']])}`;
  }

  // ─── loadout ────────────────────────────────────────────────────────
  loadout() {
    const P = this.hud.profile;
    const L = P.loadout;
    const W = PRIMARIES[L.primary] || PRIMARIES[0];
    const stats = W.stats.map((v, i) => {
      let m = 0;
      for (const k of Object.keys(ATT)) m += ATT[k].mod[L[k] ?? 0][i];
      return [v, Math.max(5, Math.min(100, v + m))];
    });
    const wname = this.ctx.services.weapon?.name || W.name;
    return `${this.bgMenu()}<div class="shade-full mesh" style="background-color:rgba(5,7,9,.55)"></div>${this.chrome()}${this.topbar('loadout')}
      <div class="lo">
        <div class="slots sh">
          <div class="eyebrow" style="margin-bottom:14px">${t11('LOADOUT 1  ·  ASSAULT')}</div>
          <div class="slot on" data-lo="primary"><div class="lbl"><span class="k">${t11('PRIMARY', { size: 9 })}</span>${T(wname, { size: 18, weight: 1.45, tracking: 2.6 })}</div><span class="img">${this.hud.gunIcon ? `<img src="${this.hud.gunIcon.url}" style="height:40px;width:${Math.round(40 * this.hud.gunIcon.aspect)}px;display:block" alt="">` : rifleSVG('', 150)}</span></div>
          <div class="slot"><div class="lbl"><span class="k">${t11('SECONDARY', { size: 9 })}</span>${T('P-11', { size: 18, weight: 1.45, tracking: 2.6 })}</div><span class="img">${pistolSVG('', 64)}</span></div>
          <div class="slot small"><div class="lbl"><span class="k">${t11('LETHAL', { size: 9 })}</span>${T('FRAG GRENADE', { size: 14, weight: 1.35, tracking: 2.2 })}</div><span class="img">${fragSVG('', 34)}</span></div>
          <div class="slot small"><div class="lbl"><span class="k">${t11('TACTICAL', { size: 9 })}</span>${T('FLASHBANG', { size: 14, weight: 1.35, tracking: 2.2 })}</div><span class="img">${flashSVG('', 34)}</span></div>
          <div class="slot small"><div class="lbl"><span class="k">${t11('MELEE', { size: 9 })}</span>${T('COMBAT KNIFE', { size: 14, weight: 1.35, tracking: 2.2 })}</div><span class="img">${knifeSVG('', 60)}</span></div>
        </div>
        <div class="detail sh">
          <span class="cls">${t11(W.cls)}</span>
          <div class="nm">${T(wname, { size: 56, weight: 1.55, tracking: 3 })}</div>
          <div class="big"><div class="gs-host"></div><div class="gs-floor"></div><div class="gs-fallback">${W.svg(760)}</div></div>
          <div class="atts">${Object.entries(ATT).map(([k, a]) => `<div class="acol"><span class="k">${t11(a.label, { size: 9 })}</span>${a.opts.map((o, i) => `<div class="att ${L[k] === i ? 'on' : ''}" data-att="${k}:${i}">${T(o, { size: 11, weight: 1.3, tracking: 1.8 })}</div>`).join('')}</div>`).join('')}</div>
          <div class="stats">${stats.map(([b, v], i) => `<div class="stat"><div class="t">${t11(STAT_NAMES[i])}${N(v, 12)}</div><div class="b"><i class="d" style="width:${Math.max(b, v)}%;${v < b ? 'background:var(--red2)' : ''}"></i><i style="width:${Math.min(b, v)}%"></i></div></div>`).join('')}</div>
        </div>
      </div>
      ${this.footer([['ESC', 'BACK'], ['ENTER', 'DEPLOY']])}`;
  }

  // ─── configurações ──────────────────────────────────────────────────
  settings() {
    const S = this.hud.settings;
    const rows = OPTS[this.setTab];
    const ctl = (o) => {
      const v = S[o.id];
      if (o.type === 'range') {
        const p = ((v - o.min) / (o.max - o.min)) * 100;
        return `<input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}" data-opt="${o.id}" style="--p:${p}%"><span class="val">${N(o.fmt(v), 14)}</span>`;
      }
      if (o.type === 'bool') return `<div class="seg" data-opt="${o.id}">${['OFF', 'ON'].map((n, i) => `<b class="${!!v === !!i ? 'on' : ''}" data-v="${i}">${t11(n, { size: 10 })}</b>`).join('')}</div>`;
      return `<div class="seg" data-opt="${o.id}">${o.opts.map((n) => `<b class="${v === n ? 'on' : ''}" data-v="${n}">${t11(n, { size: 10 })}</b>`).join('')}</div>`;
    };
    const help = rows[Math.min(this.focusIdx, rows.length - 1)] || rows[0];
    return `${this.bgMenu()}<div class="shade-full mesh" style="background-color:rgba(5,7,9,.6)"></div>${this.chrome()}${this.topbar('settings')}
      <div class="set sh">
        <div class="stabs">${Object.keys(OPTS).map((t) => `<div class="stab ${t === this.setTab ? 'on' : ''}" data-tab="${t}">${T(t, { size: 13, weight: 1.3, tracking: 2.6 })}</div>`).join('')}</div>
        <div class="rows">${rows.map((o, i) => `<div class="opt" data-i="${i}"><span class="nm">${T(o.name, { size: 13, weight: 1.25, tracking: 2.2 })}</span><div class="ctl">${ctl(o)}</div></div>`).join('')}</div>
      </div>
      <div class="set-help panel sh">${T(help.name, { size: 16, weight: 1.4, tracking: 2.4 })}<div class="d">${help.help}</div>
        <div class="pv">${this.preview(help.id)}</div></div>
      ${this.footer([['ESC', 'BACK'], ['TAB', 'NEXT TAB']])}`;
  }
  preview(id) {
    const S = this.hud.settings;
    if (id === 'crosshair') {
      const c = CROSS_COLORS[S.crosshair];
      return `<svg width="100%" height="100%" viewBox="0 0 600 220"><g stroke="${c}" stroke-width="2.5"><path d="M300,88 V99 M300,121 V132 M278,110 H289 M311,110 H322"/></g><rect x="299" y="109" width="2" height="2" fill="${c}"/></svg>`;
    }
    if (id === 'fov') {
      const h = S.fov, a = (h / 2) * (Math.PI / 180);
      const L = 170;
      return `<svg width="100%" height="100%" viewBox="0 0 600 220"><path d="M300,200 L${300 - Math.sin(a) * L},${200 - Math.cos(a) * L} A${L},${L} 0 0 1 ${300 + Math.sin(a) * L},${200 - Math.cos(a) * L} Z" fill="rgba(255,178,46,.14)" stroke="#ffb22e" stroke-width="1.5"/><circle cx="300" cy="200" r="5" fill="#f2f4ef"/></svg>`;
    }
    if (id === 'quality') {
      const lv = ['low', 'medium', 'high', 'ultra'].indexOf(S.quality);
      return `<div style="position:absolute;inset:22px;display:flex;flex-direction:column;gap:12px">${['SHADOWS', 'AMBIENT OCCLUSION', 'BLOOM', 'DRAW DISTANCE', 'PARTICLES'].map((n, i) => `<div style="display:flex;align-items:center;gap:14px"><span style="width:220px">${t11(n, { size: 9 })}</span><div style="flex:1;height:4px;background:rgba(255,255,255,.1)"><i style="display:block;height:100%;width:${(25 + lv * 25 - (i % 2) * 5)}%;background:var(--amber)"></i></div></div>`).join('')}</div>`;
    }
    return `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--ink3)">${logo(18)}</div>`;
  }

  // ─── pausa ──────────────────────────────────────────────────────────
  pause() {
    const m = this.hud.match;
    return `<div class="shade-full mesh"></div>${this.chrome()}${this.topbarMini()}
      <div class="col sh">
        <div class="eyebrow">${t11(`${MODE.name}  ·  ${MODE.map}`)}</div>
        <div class="title">${T('PAUSED', { size: 64, weight: 1.55, tracking: 4 })}</div>
        <div class="btns">
          <div class="btn pri" data-act="resume" tabindex="0">${T('RESUME', { size: 20, weight: 1.6, tracking: 4 })}<span class="chev">${T('>>', { size: 16, weight: 1.8, tracking: 0.8 })}</span></div>
          <div class="btn" data-go="loadout" tabindex="0">${T('LOADOUT', { size: 14, weight: 1.3, tracking: 2.6 })}</div>
          <div class="btn" data-go="settings" tabindex="0">${T('SETTINGS', { size: 14, weight: 1.3, tracking: 2.6 })}</div>
          <div class="btn" data-act="restart" tabindex="0">${T('RESTART MATCH', { size: 14, weight: 1.3, tracking: 2.6 })}</div>
          <div class="btn" data-act="quit" tabindex="0">${T('QUIT TO MAIN MENU', { size: 14, weight: 1.3, tracking: 2.6 })}</div>
        </div>
      </div>
      <div class="mstat panel sh"><div class="ph">${T('MATCH STATUS', { size: 13, weight: 1.35, tracking: 2.4 })}<span class="r">${N(fmtTime(m.timeLeft), 13)}</span></div>
        <div class="kv">
          <div><span class="k">${t11('KILLS', { size: 9 })}</span>${N(`${m.kills}/${MODE.target}`, 24)}</div>
          <div><span class="k">${t11('DEATHS', { size: 9 })}</span>${N(String(m.deaths), 24)}</div>
          <div><span class="k">${t11('SCORE', { size: 9 })}</span>${N(String(m.score), 24)}</div>
          <div><span class="k">${t11('ACCURACY', { size: 9 })}</span>${N(Math.round(m.accuracy * 100) + '%', 24)}</div>
          <div><span class="k">${t11('HEADSHOTS', { size: 9 })}</span>${N(String(m.headshots), 24)}</div>
          <div><span class="k">${t11('BEST STREAK', { size: 9 })}</span>${N(String(m.bestStreak), 24)}</div>
        </div></div>
      ${this.footer([['ESC', 'RESUME']])}`;
  }
  topbarMini() {
    return `<div class="topbar sh" style="border-bottom-color:rgba(255,255,255,.05)"><div class="logo">${logo(20)}</div></div>`;
  }

  // ─── placar (Tab) ───────────────────────────────────────────────────
  scoreboard() {
    return `<div class="shade-full" style="background:rgba(5,7,9,.5);backdrop-filter:blur(4px)"></div>${this.board(false)}`;
  }
  board(final) {
    const m = this.hud.match;
    const P = this.hud.profile;
    const lv = levelOf(P.xp);
    const rows = [...m.hostile.values()].sort((a, b) => b.score - a.score || b.kills - a.kills);
    const ping = (i) => 28 + ((i * 17) % 23);
    const cell = (v, o = {}) => `<td>${N(v, 14, o)}</td>`;
    const hdr = ['', 'SCORE', 'KILLS', 'DEATHS', 'K/D', 'ACCURACY', 'PING'].map((h) => `<th>${h ? t11(h, { size: 9 }) : ''}</th>`).join('');
    const kills = m.kills, deaths = m.deaths;
    return `<div class="sb sh">
      ${final ? '' : `<div class="hdr"><div class="l">${t11(`${MODE.name}  ·  ${MODE.map}`)}${T('SCOREBOARD', { size: 34, weight: 1.5, tracking: 3.4 })}</div>
        <div class="r"><div class="big"><span style="color:var(--blue)">${N(kills, 40)}</span>${t11('VS', { size: 10 })}<span style="color:var(--red2)">${N(deaths, 40)}</span></div>
        <div class="timer" style="padding:10px 14px;border:1px solid var(--line);background:var(--plate)">${N(fmtTime(m.timeLeft), 16)}</div></div></div>`}
      <div class="tm"><div class="tmh us">${T('IRONLINE', { size: 13, weight: 1.4, tracking: 2.6 })}${t11('OPERATOR', { size: 9 })}<span class="sc">${N(m.score, 16)}</span></div>
        <table><colgroup><col class="c0"><col><col><col><col><col><col></colgroup><thead><tr>${hdr}</tr></thead><tbody>
          <tr class="me"><td><div class="nmc"><span style="color:var(--amber)">${rankSVG(lv.level, '', 26)}</span><span class="rkc">${T(String(lv.level), { size: 11, weight: 1.3 })}</span>${T(`[${P.tag}] ${P.callsign}`, { size: 13, weight: 1.35, tracking: 2 })}</div></td>
          ${cell(m.score)}${cell(kills)}${cell(deaths)}${cell(m.kd.toFixed(2))}${cell(Math.round(m.accuracy * 100) + '%')}${cell(24, { weight: 1.2 })}</tr>
        </tbody></table></div>
      <div class="tm"><div class="tmh them">${T('HOSTILE CELL', { size: 13, weight: 1.4, tracking: 2.6 })}${t11('OPFOR', { size: 9 })}<span class="sc">${N(rows.reduce((a, r) => a + r.score, 0), 16)}</span></div>
        <table><colgroup><col class="c0"><col><col><col><col><col><col></colgroup><thead><tr>${hdr}</tr></thead><tbody>
        ${rows.map((r, i) => `<tr class="${r.alive ? '' : 'dead'}"><td><div class="nmc"><span style="color:var(--ink2)">${rankSVG(7 + i * 5, '', 26)}</span><span class="rkc">${T(String(8 + ((i * 13) % 40)), { size: 11, weight: 1.3 })}</span>${T(r.name, { size: 13, weight: 1.35, tracking: 2 })}</div></td>
          ${cell(r.score)}${cell(r.kills)}${cell(r.deaths)}${cell((r.deaths ? r.kills / r.deaths : r.kills).toFixed(2))}${cell('—', { weight: 1.2 })}${cell(ping(i), { weight: 1.2 })}</tr>`).join('')}
        </tbody></table></div>
    </div>`;
  }

  // ─── fim de partida: relatório pós-ação ─────────────────────────────
  end() {
    const m = this.hud.match;
    const P = this.hud.profile;
    const win = !!m.win;
    const before = levelOf(Math.max(0, P.xp - m.xpEarned));
    const after = levelOf(P.xp);
    const medals = Object.entries(m.medals);
    const lv = after.level;
    // classificação geral (eu + células hostis), por pontuação
    const hostiles = [...m.hostile.values()];
    const all = [
      { me: true, name: `[${P.tag}] ${P.callsign}`, lvl: lv, score: m.score, kills: m.kills, deaths: m.deaths, hs: m.headshots, acc: Math.round(m.accuracy * 100) + '%' },
      ...hostiles.map((r, i) => ({ name: r.name, lvl: 8 + ((i * 13 + r.name.length * 7) % 44), score: r.score, kills: r.kills, deaths: r.deaths, hs: Math.floor(r.kills / 2), acc: 18 + ((r.name.length * 7 + i * 5) % 17) + '%', seed: r.name })),
    ].sort((a, b) => b.score - a.score);
    const nemesis = hostiles.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)[0];
    const theirScore = hostiles.reduce((a, r) => a + r.kills, 0);
    const row = (r, i) => `<tr class="${r.me ? 'me' : ''}">
        <td class="c-r">${N(i + 1, 14)}</td>
        <td class="c-l"><span class="lb">${r.me ? emblemSVG('vance', 30, 'gold') : emblemSVG(r.seed, 30, 'red')}</span>${N(r.lvl, 13)}</td>
        <td class="c-n">${T(r.name, { size: 14, weight: 1.55, tracking: 1.9 })}${r.me ? '' : `<span class="tm-r">${t11(ROLES[hashStr(r.name) % ROLES.length])}</span>`}</td>
        <td>${N(r.score, 15)}</td><td>${N(r.kills, 15)}</td><td>${N(r.deaths, 15)}</td><td>${N((r.deaths ? r.kills / r.deaths : r.kills).toFixed(2), 15)}</td><td>${N(r.hs, 15)}</td><td>${N(r.acc, 15)}</td></tr>`;
    const hdr = ['#', 'LV', 'PLAYER', 'SCORE', 'KILLS', 'DEATHS', 'K/D', 'HS', 'ACC'];
    // mini-histograma por onda (determinístico): dá densidade de informação
    // ao bloco em vez de um número solto num cartão vazio
    const spark = (d, frac) => {
      const n = Math.max(3, MODE.waves.length || 5);
      let h = '';
      for (let i = 0; i < n; i++) {
        const v = 0.25 + 0.75 * Math.abs(Math.sin((i + 1) * 1.7 + d * 2.3)) * (0.55 + 0.45 * Math.max(0, Math.min(1, frac)));
        h += `<b style="height:${(v * 100).toFixed(0)}%"${i === n - 1 ? ' class="l"' : ''}></b>`;
      }
      return `<div class="spark">${h}</div><div class="sk">${mono('PER WAVE')}</div>`;
    };
    const tile = (k, v, d = 0, sub = '', frac = 0) => `<div style="animation-delay:${0.35 + d * 0.06}s"><span class="k">${t11(k)}</span><div class="vv">${N(v, String(v).length >= 4 ? 30 : 36)}<span class="mt"><i style="width:${(Math.max(0, Math.min(1, frac)) * 100).toFixed(0)}%"></i></span></div>${spark(d, frac)}${sub ? `<span class="sub">${mono(sub)}</span>` : ''}</div>`;
    const g = this.hud.gunIcon;
    const wname = this.ctx.services.weapon?.name || 'KR-9';
    const wkills = Math.max(0, m.kills - (m.fragKills || 0));
    const bar = (k, v, max, txt) => `<div class="wb"><span class="k">${t11(k)}</span><div class="b"><i style="width:${Math.min(100, (v / max) * 100).toFixed(0)}%"></i></div>${N(txt ?? v, 14)}</div>`;
    return `<div class="shade-full aar" style="background-color:rgba(5,7,9,.62)"></div><div class="aar-grade"></div><div class="topo" style="background-image:url(${makeTopo()})"></div><div class="shade-vig"></div>${this.aarFrame()}<div class="grain" style="background-image:url(${this.grain})"></div>
      <div class="aar-top sh">
        <div class="ttl">${mono(`${MODE.name} · ${MODE.map} · ${fmtTime(Math.max(0, MODE.time - m.timeLeft))}`)}${T('AFTER ACTION REPORT', { size: 34, weight: 1.9, tracking: 3 })}</div>
        <div class="atabs"><span>${t11('SUMMARY', { size: 13 })}</span><span class="on">${t11('SCOREBOARD', { size: 13 })}</span><span>${t11('WEAPON STATS', { size: 13 })}</span><span>${t11('REWARDS', { size: 13 })}</span></div>
        <div class="res ${win ? 'win' : 'loss'}">${T(win ? 'VICTORY' : 'DEFEAT', { size: 40, weight: 2.2, tracking: 5 })}<span>${t11(win ? 'HOSTILE CELL NEUTRALIZED' : 'OBJECTIVE FAILED')}</span></div>
      </div>
      <div class="aar-teams sh">
        <div class="tm us">${emblemSVG('vance', 64, 'gold')}${T('IRONLINE', { size: 34, weight: 2, tracking: 3.4 })}</div>
        <div class="vs"><span class="a">${N(m.kills, 54, { weight: 1.8 })}</span><span class="sk">${skullSVG('', 40)}</span><span class="b">${N(theirScore, 54, { weight: 1.8 })}</span></div>
        <div class="tm them">${T('HOSTILE CELL', { size: 34, weight: 2, tracking: 3.4 })}${emblemSVG('opfor', 64, 'red')}</div>
      </div>
      <div class="aar-body">
        <div class="lcol">
          <div class="panel stand sh"><table><thead><tr>${hdr.map((h, i) => `<th class="${i < 3 ? ['c-r', 'c-l', 'c-n'][i] : ''}">${t11(h)}</th>`).join('')}</tr></thead><tbody>${all.map(row).join('')}</tbody></table></div>
          <div class="me-strip sh">
            <div class="pcard"><div class="cc" ${this.art('card', 352, 110, { title: 'IRON DAWN', sub: 'SEASON 01 VETERAN', fy: 0.42, illus: true })}></div><div class="pi">${emblemSVG('vance', 56, 'gold')}<div>${T(P.callsign, { size: 20, weight: 1.75, tracking: 2.4 })}<div class="pl">${rankSVG(lv, '', 22)}${t11('LEVEL ' + lv)}</div></div></div>
              <div class="xpbk">${[['KILLS', m.kills * 100], ['HEADSHOTS', m.headshots * 50], ['MEDALS', medals.reduce((a, [, v]) => a + v.n * 50, 0)], [win ? 'WIN BONUS' : 'MATCH BONUS', win ? 1500 : 300]].map(([k, v]) => `<div>${t11(k)}<span>${N('+' + v, 13)}</span></div>`).join('')}</div></div>
            <div class="tiles">${tile('ELIMINATIONS', m.kills, 0, 'BEST STREAK ' + m.bestStreak, m.kills / MODE.target)}${tile('DEATHS', m.deaths, 1, 'DMG TAKEN ' + Math.round(m.damage / 10), m.deaths / Math.max(1, m.kills + m.deaths))}${tile('K/D RATIO', m.kd.toFixed(2), 2, 'CAREER ' + (P.kills / Math.max(1, P.matches * 6)).toFixed(2), m.kd / 5)}${tile('ACCURACY', Math.round(m.accuracy * 100) + '%', 3, m.hits + '/' + m.shots + ' HITS', m.accuracy)}${tile('SCORE', m.score, 4, 'SPM ' + Math.round(m.score / Math.max(1, m.playTime / 60)), m.score / 5000)}</div>
          </div>
          <div class="acts">
            <div class="btn pri" data-act="restart" tabindex="0">${T('PLAY AGAIN', { size: 19, weight: 2, tracking: 3.4 })}<span class="chev">${T('>>', { size: 14, weight: 2.2, tracking: 0.8 })}</span></div>
            <div class="btn" data-act="quit" tabindex="0">${T('MAIN MENU', { size: 15, weight: 1.55, tracking: 2.6 })}<span class="hint">${key('ESC')}</span></div>
            <div class="nxt">${t11('NEXT MATCH IN')}${N('0:24', 16)}</div>
          </div>
        </div>
        <div class="rcol sh">
          ${nemesis ? `<div class="panel nem"><div class="nh">${T('NEMESIS', { size: 14, weight: 1.7, tracking: 3 })}</div>
            <div class="nb">${emblemSVG(nemesis.name, 52, 'red')}<div class="nn">${T(nemesis.name, { size: 22, weight: 1.8, tracking: 2.6 })}${t11('HOSTILE CELL  ·  RIFLEMAN')}</div>
            <div class="nk"><div><span class="k">${t11('KILLED')}</span>${N(nemesis.deaths, 26)}</div><div><span class="k">${t11('KILLED BY')}</span><span style="color:var(--red2)">${N(nemesis.kills, 26)}</span></div></div></div></div>` : ''}
          <div class="panel wst"><div class="ph">${T('WEAPON STATS', { size: 14, weight: 1.6, tracking: 2.4 })}<span class="r">${mono('PRIMARY')}</span></div>
            <div class="wtop"><div class="wimg">${g ? `<img src="${g.shaded || g.url}" style="height:54px;width:${Math.round(54 * g.aspect)}px" alt="">` : rifleSVG('', 190)}</div>${T(wname, { size: 20, weight: 1.8, tracking: 2.6 })}</div>
            ${bar('KILLS', wkills, 30)}${bar('HEADSHOTS', m.headshots, Math.max(1, m.kills))}${bar('ACCURACY', m.accuracy * 100, 100, Math.round(m.accuracy * 100) + '%')}${bar('DAMAGE', m.damage, 5000, Math.round(m.damage))}${bar('LONGEST', m.longest, 80, Math.round(m.longest) + ' M')}</div>
          <div class="panel md"><div class="ph">${T('MEDALS', { size: 14, weight: 1.6, tracking: 2.4 })}<span class="r">${mono(medals.length + ' EARNED')}</span></div>
            <div class="medals">${medals.length ? medals.map(([n, v]) => `<div class="mdl">${medalSVG(v.kind, 62)}<span class="mn">${T(n, { size: 11, weight: 1.45, tracking: 1.4 })}</span><span class="c">${N('×' + v.n, 12)}</span></div>`).join('') : `<div style="color:var(--ink3);padding:10px 0">${t11('NO MEDALS THIS MATCH')}</div>`}</div></div>
          <div class="panel prog"><div class="xpl"><span style="color:var(--amber)">${rankSVG(after.level, '', 38)}</span><div class="xx">${T('LEVEL ' + after.level, { size: 16, weight: 1.7, tracking: 2.2 })}
              <div class="xpb"><i class="g" style="width:${((after.into / after.need) * 100).toFixed(1)}%"></i><i style="width:${after.level > before.level ? 0 : ((before.into / before.need) * 100).toFixed(1)}%"></i></div></div>
              <div class="xr"><span style="color:var(--amber)">${N('+' + m.xpEarned + ' XP', 16)}</span>${N(`${after.into}/${after.need}`, 12, { weight: 1.3 })}</div></div>
              ${after.level > before.level ? `<div style="color:var(--amber);margin-top:10px">${T('LEVEL UP', { size: 14, weight: 1.7, tracking: 3 })}</div>` : ''}</div>
        </div>
      </div>
`;
  }
  /** moldura "sci-fi" do relatório: cantos chanfrados e réguas */
  aarFrame() {
    return `<svg class="chrome" width="1920" height="1080" viewBox="0 0 1920 1080">
      <g fill="none" stroke="rgba(242,244,239,.16)" stroke-width="1.2">
        <path d="M40,150 L80,110 H760 L790,140 H1130 L1160,110 H1840 L1880,150"/>
        <path d="M40,960 L80,1000 H700 L730,970 H1190 L1220,1000 H1840 L1880,960"/>
      </g>
      <g stroke="rgba(255,178,46,.8)" stroke-width="2.4" fill="none"><path d="M80,110 H200 M1720,110 H1840 M790,140 H860 M1060,140 H1130"/></g>
      <g fill="rgba(242,244,239,.35)">${Array.from({ length: 30 }, (_, i) => `<rect x="${812 + i * 10}" y="${i % 5 ? 148 : 146}" width="1.2" height="${i % 5 ? 3 : 6}"/>`).join('')}</g>
    </svg>`;
  }

  // ─── interação ──────────────────────────────────────────────────────
  bind(name, el) {
    const hud = this.hud;
    el.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-go],[data-act],[data-tab],[data-att],[data-v],[data-lo]');
      if (!t) return;
      if (t.dataset.go) this.go(t.dataset.go);
      else if (t.dataset.act) hud.action(t.dataset.act);
      else if (t.dataset.tab) { this.setTab = t.dataset.tab; this.focusIdx = 0; this.show('settings'); }
      else if (t.dataset.att) {
        const [k, i] = t.dataset.att.split(':');
        hud.profile.loadout[k] = Number(i);
        hud.saveProfile();
        this.show('loadout');
      } else if (t.dataset.v !== undefined) {
        const id = t.parentElement.dataset.opt;
        const o = Object.values(OPTS).flat().find((x) => x.id === id);
        hud.setOption(id, o.type === 'bool' ? t.dataset.v === '1' : t.dataset.v);
        const fi = this.focusIdx;
        this.show('settings');
        this.focus(fi);
      }
    });
    el.addEventListener('input', (ev) => {
      const r = ev.target;
      if (r.type !== 'range') return;
      const id = r.dataset.opt;
      const o = Object.values(OPTS).flat().find((x) => x.id === id);
      const v = Number(r.value);
      hud.setOption(id, v);
      r.style.setProperty('--p', ((v - o.min) / (o.max - o.min)) * 100 + '%');
      r.nextElementSibling.innerHTML = N(o.fmt(v), 14);
      if (id === 'fov') el.querySelector('.pv').innerHTML = this.preview('fov');
    });
    el.addEventListener('mouseover', (ev) => {
      const o = ev.target.closest('.opt');
      if (o && name === 'settings') {
        const i = Number(o.dataset.i);
        if (i !== this.focusIdx) { this.focus(i); this.refreshHelp(); }
      }
    });
  }
  refreshHelp() {
    const rows = OPTS[this.setTab];
    const help = rows[this.focusIdx] || rows[0];
    const h = this.el.querySelector('.set-help');
    if (h) h.innerHTML = `${T(help.name, { size: 16, weight: 1.4, tracking: 2.4 })}<div class="d">${help.help}</div><div class="pv">${this.preview(help.id)}</div>`;
  }
  go(name) {
    this.back = this.cur;
    this.show(name);
  }
  focusables() {
    return this.el ? [...this.el.querySelectorAll(this.cur === 'settings' ? '.opt' : '.btn,.slot')] : [];
  }
  focus(i) {
    const f = this.focusables();
    if (!f.length) return;
    this.focusIdx = (i + f.length) % f.length;
    f.forEach((e, j) => e.classList.toggle('focus', j === this.focusIdx));
  }
  /** teclado: retorna true se consumiu */
  key(code) {
    if (!this.cur) return false;
    if (code === 'ArrowDown' || code === 'KeyS') { this.focus(this.focusIdx + 1); if (this.cur === 'settings') this.refreshHelp(); return true; }
    if (code === 'ArrowUp' || code === 'KeyW') { this.focus(this.focusIdx - 1); if (this.cur === 'settings') this.refreshHelp(); return true; }
    if (code === 'Enter' || code === 'Space') {
      if (this.cur === 'main' || this.cur === 'loadout') { if (this.cur === 'loadout' || this.focusIdx === 0) { this.hud.action('deploy'); return true; } }
      const f = this.focusables()[this.focusIdx];
      f?.click();
      return true;
    }
    if (this.cur === 'settings' && (code === 'ArrowLeft' || code === 'ArrowRight')) {
      const o = OPTS[this.setTab][this.focusIdx];
      const S = this.hud.settings;
      const dir = code === 'ArrowRight' ? 1 : -1;
      if (o.type === 'range') this.hud.setOption(o.id, Math.max(o.min, Math.min(o.max, +(S[o.id] + dir * o.step * (o.max - o.min > 5 ? 5 : 2)).toFixed(3))));
      else if (o.type === 'bool') this.hud.setOption(o.id, dir > 0);
      else this.hud.setOption(o.id, o.opts[Math.max(0, Math.min(o.opts.length - 1, o.opts.indexOf(S[o.id]) + dir))]);
      const fi = this.focusIdx;
      this.show('settings');
      this.focus(fi);
      this.refreshHelp();
      return true;
    }
    if (code === 'Tab' && this.cur === 'settings') {
      const ks = Object.keys(OPTS);
      this.setTab = ks[(ks.indexOf(this.setTab) + 1) % ks.length];
      this.show('settings');
      return true;
    }
    if (code === 'KeyL' && this.cur === 'main') { this.go('loadout'); return true; }
    if (code === 'KeyO' && this.cur === 'main') { this.go('settings'); return true; }
    if (code === 'Escape' || code === 'Backspace') {
      if (this.cur === 'end') { this.hud.action('quit'); return true; }
      if (this.cur === 'loadout' || this.cur === 'settings') { this.show(this.hud.inMatch ? 'pause' : 'main'); return true; }
      if (this.cur === 'pause') { this.hud.action('resume'); return true; }
    }
    return false;
  }
}

/** Grão de filme procedural (ladrilho PNG em data URL). */
function makeGrain() {
  const n = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  const img = g.createImageData(n, n);
  let s = 99991;
  for (let i = 0; i < n * n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s >> 16) & 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

export { vfovToH };

/**
 * Textura de "carta topográfica": curvas de nível de um ruído de valor
 * suave (4 oitavas), traço fino anti-serrilhado pela distância à isolinha
 * (|frac − .5| / gradiente). Usada bem apagada atrás do relatório — dá
 * matéria ao fundo sem virar padrão repetido.
 */
let _topo = null;
function makeTopo() {
  if (_topo) return _topo;
  const W = 960, H = 540;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  // grade de valores aleatórios + interpolação suave
  const G = 64, vals = new Float32Array(G * G);
  let s = 4242;
  for (let i = 0; i < vals.length; i++) { s = (s * 16807) % 2147483647; vals[i] = s / 2147483647; }
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = sm(x - xi), fy = sm(y - yi);
    const v = (a, b) => vals[((b & (G - 1)) * G + (a & (G - 1)))];
    const a = v(xi, yi) + (v(xi + 1, yi) - v(xi, yi)) * fx;
    const b = v(xi, yi + 1) + (v(xi + 1, yi + 1) - v(xi, yi + 1)) * fx;
    return a + (b - a) * fy;
  };
  const f = (x, y) => vn(x / 170, y / 170) * 0.55 + vn(x / 80 + 7, y / 80 + 3) * 0.28 + vn(x / 38 + 1, y / 38 + 9) * 0.12 + vn(x / 17, y / 17) * 0.05;
  const L = 16; // número de curvas no intervalo
  const F = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) F[y * W + x] = f(x, y) * L;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, v = F[i];
      const gx = (F[i + 1] - F[i - 1]) * 0.5, gy = (F[i + W] - F[i - W]) * 0.5;
      const gl = Math.hypot(gx, gy) + 1e-5;
      const d = Math.abs(v - Math.round(v)) / gl; // distância em px à isolinha
      const index = Math.round(v) % 5 === 0; // curva mestra mais forte
      const a = Math.max(0, 1 - d / (index ? 0.9 : 0.6));
      const o = i * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 235;
      img.data[o + 3] = a * (index ? 255 : 150);
    }
  }
  g.putImageData(img, 0, 0);
  _topo = cv.toDataURL('image/png');
  return _topo;
}
