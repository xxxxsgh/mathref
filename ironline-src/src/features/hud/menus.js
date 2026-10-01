/**
 * Telas de frontend: menu principal (sobre a cena ao vivo), loadout,
 * configurações, pausa, placar (Tab) e relatório de fim de partida.
 *
 * Cada tela é montada como DOM ao abrir (re-render barato) e vive dentro da
 * prancheta 1920×1080. Navegação por mouse e teclado (↑/↓/Enter/Esc).
 */
import { svgText, pathFor } from './font.js';
import { rifleSVG, pistolSVG, fragSVG, flashSVG, rankSVG, medalSVG, skullSVG, headshotSVG, knifeSVG } from './icons.js';
import { MODE } from './match.js';
import { levelOf, CROSS_COLORS, vfovToH } from './settings.js';

const T = (s, o) => svgText(s, o);
const t11 = (s, o = {}) => T(s, { size: 11, weight: 1.2, tracking: 2.3, ...o });
const key = (k) => `<span class="key">${T(k, { size: 9, weight: 1.3 })}</span>`;
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
    if (!name) return;
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

  /** "cromo" de interface: linhas finas chanfradas, marcas e microtexto */
  chrome(top = 118) {
    const mt = (str, x, y, a = 'start') => {
      const w = str.length * 4.6;
      const x0 = a === 'end' ? x - w : x;
      return `<g transform="translate(${x0},${y}) scale(.7)" opacity=".5"><path d="${pathFor(str.toUpperCase(), 1.7)}" fill="none" stroke="#f2f4ef" stroke-width="1"/></g>`;
    };
    const B = 1002;
    return `<svg class="chrome" width="1920" height="1080" viewBox="0 0 1920 1080">
      <g fill="none" stroke="rgba(242,244,239,.16)" stroke-width="1">
        <path d="M96,${top} H700 L716,${top + 10} H1204 L1220,${top} H1824"/>
        <path d="M96,${B} H640 L656,${B - 10} H1264 L1280,${B} H1824"/>
      </g>
      <g stroke="rgba(255,178,46,.75)" stroke-width="2"><path d="M96,${top} H140 M1780,${top} H1824 M716,${top + 10} H760 M1160,${top + 10} H1204"/></g>
      <g fill="rgba(242,244,239,.35)">${Array.from({ length: 24 }, (_, i) => `<rect x="${730 + i * 19}" y="${top + 16}" width="1" height="${i % 4 ? 3 : 6}"/>`).join('')}</g>
      ${mt('IRL-NET // UPLINK STABLE', 96, top + 10)}${mt('SECTOR 7G  ·  41.7120N 44.7830E', 1824, top + 10, 'end')}
      ${mt('TACTICAL DATA SYNCED', 656, B - 26)}${mt('OPS CHANNEL 04', 1264, B - 26, 'end')}
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
      <div class="tabs">${tabs.map(([id, n]) => `<div class="tab ${id === active ? 'on' : ''}" data-go="${id}">${T(n, { size: 13, weight: 1.3, tracking: 2.6 })}</div>`).join('')}</div>
      <div class="card">
        <div class="meta">${T(P.callsign, { size: 15, weight: 1.4, tracking: 2.4 })}${t11(`[${P.tag}]  ·  OPERATOR`, { size: 9, weight: 1.1 })}<div class="xpb"><i style="width:${((lv.into / lv.need) * 100).toFixed(1)}%"></i></div></div>
        <span class="rk">${rankSVG(lv.level, '', 46)}</span>
        <div class="lvl">${T(String(lv.level), { size: 18, weight: 1.45 })}</div>
      </div></div>`;
  }
  footer(hints) {
    return `<div class="foot sh">${hints.map(([k, l]) => `<div class="h">${key(k)}${t11(l, { size: 10 })}</div>`).join('')}<div class="ver">${t11('IRONLINE  ·  BUILD 0.1.0  ·  WEBGL2', { size: 9, weight: 1.05 })}</div></div>`;
  }

  // ─── principal ──────────────────────────────────────────────────────
  main() {
    const P = this.hud.profile;
    const ch = [
      ['head', 'Headshot kills', Math.min(P.headshots % 10, 10), 10],
      ['kill', 'Eliminate hostiles', Math.min(P.kills % 25, 25), 25],
      ['long', 'Win an Elimination match', Math.min(P.wins % 1, 1), 1],
    ];
    return `${this.bgMenu()}${this.chrome()}${this.topbar('main')}
      <div class="col sh">
        <div class="eyebrow">${t11('SOLO OPERATIONS  ·  QUICK PLAY')}</div>
        <div class="title">${T(MODE.name, { size: 72, weight: 1.55, tracking: 3.2 })}</div>
        <div class="desc">Push into the Meridian district and neutralize the hostile cell before time runs out. Enemies regroup, flank and call for backup — use cover and keep the initiative.</div>
        <div class="facts">
          <div class="f"><span class="k">${t11('MAP', { size: 9 })}</span>${T(MODE.map, { size: 15, weight: 1.35, tracking: 2.2 })}</div>
          <div class="f"><span class="k">${t11('TIME LIMIT', { size: 9 })}</span>${T(fmtTime(MODE.time), { size: 15, weight: 1.35, tracking: 2.2 })}</div>
          <div class="f"><span class="k">${t11('OBJECTIVE', { size: 9 })}</span>${T(MODE.target + ' KILLS', { size: 15, weight: 1.35, tracking: 2.2 })}</div>
          <div class="f"><span class="k">${t11('THREAT', { size: 9 })}</span><span style="color:var(--red2)">${T('HIGH', { size: 15, weight: 1.35, tracking: 2.2 })}</span></div>
        </div>
        <div class="btns">
          <div class="btn pri" data-act="deploy" tabindex="0">${T('DEPLOY', { size: 22, weight: 1.6, tracking: 4 })}<span class="chev">${T('>>', { size: 16, weight: 1.8, tracking: 0.8 })}</span></div>
          <div class="btn" data-go="loadout" tabindex="0">${T('EDIT LOADOUT', { size: 14, weight: 1.3, tracking: 2.6 })}<span class="hint">${key('L')}</span></div>
          <div class="btn" data-go="settings" tabindex="0">${T('SETTINGS', { size: 14, weight: 1.3, tracking: 2.6 })}<span class="hint">${key('O')}</span></div>
        </div>
      </div>
      <div class="side sh">
        <div class="panel">
          <div class="ph">${T('DAILY CHALLENGES', { size: 13, weight: 1.35, tracking: 2.4 })}<span class="r">${t11('RESETS 14H 22M', { size: 9 })}</span></div>
          ${ch.map(([k, d, v, n]) => `<div class="chal"><div class="ic">${k === 'head' ? headshotSVG('', 22) : k === 'kill' ? skullSVG('', 22) : medalSVG('kill', 24)}</div>
            <div class="tx"><span class="d">${d}</span><div class="pb"><i style="width:${(v / n) * 100}%"></i></div></div><span class="v">${T(`${v}/${n}`, { size: 11, weight: 1.25 })}</span></div>`).join('')}
        </div>
        <div class="panel"><div class="ph">${T('CAREER', { size: 13, weight: 1.35, tracking: 2.4 })}<span class="r">${t11(`${P.matches} MATCHES`, { size: 9 })}</span></div>
          <div class="kv" style="grid-template-columns:1fr 1fr 1fr">
            <div><span class="k">${t11('KILLS', { size: 9 })}</span>${T(String(P.kills), { size: 20, weight: 1.45 })}</div>
            <div><span class="k">${t11('HEADSHOTS', { size: 9 })}</span>${T(String(P.headshots), { size: 20, weight: 1.45 })}</div>
            <div><span class="k">${t11('WINS', { size: 9 })}</span>${T(String(P.wins), { size: 20, weight: 1.45 })}</div>
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
          <div class="stats">${stats.map(([b, v], i) => `<div class="stat"><div class="t">${t11(STAT_NAMES[i], { size: 10 })}${T(String(v), { size: 11, weight: 1.3 })}</div><div class="b"><i class="d" style="width:${Math.max(b, v)}%;${v < b ? 'background:var(--red2)' : ''}"></i><i style="width:${Math.min(b, v)}%"></i></div></div>`).join('')}</div>
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
        return `<input type="range" min="${o.min}" max="${o.max}" step="${o.step}" value="${v}" data-opt="${o.id}" style="--p:${p}%"><span class="val">${T(o.fmt(v), { size: 13, weight: 1.35 })}</span>`;
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
      <div class="mstat panel sh"><div class="ph">${T('MATCH STATUS', { size: 13, weight: 1.35, tracking: 2.4 })}<span class="r">${T(fmtTime(m.timeLeft), { size: 12, weight: 1.3 })}</span></div>
        <div class="kv">
          <div><span class="k">${t11('KILLS', { size: 9 })}</span>${T(`${m.kills}/${MODE.target}`, { size: 22, weight: 1.45 })}</div>
          <div><span class="k">${t11('DEATHS', { size: 9 })}</span>${T(String(m.deaths), { size: 22, weight: 1.45 })}</div>
          <div><span class="k">${t11('SCORE', { size: 9 })}</span>${T(String(m.score), { size: 22, weight: 1.45 })}</div>
          <div><span class="k">${t11('ACCURACY', { size: 9 })}</span>${T(Math.round(m.accuracy * 100) + '%', { size: 22, weight: 1.45 })}</div>
          <div><span class="k">${t11('HEADSHOTS', { size: 9 })}</span>${T(String(m.headshots), { size: 22, weight: 1.45 })}</div>
          <div><span class="k">${t11('BEST STREAK', { size: 9 })}</span>${T(String(m.bestStreak), { size: 22, weight: 1.45 })}</div>
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
    const cell = (v, o = {}) => `<td>${T(String(v), { size: 13, weight: 1.3, ...o })}</td>`;
    const hdr = ['', 'SCORE', 'KILLS', 'DEATHS', 'K/D', 'ACCURACY', 'PING'].map((h) => `<th>${h ? t11(h, { size: 9 }) : ''}</th>`).join('');
    const kills = m.kills, deaths = m.deaths;
    return `<div class="sb sh">
      ${final ? '' : `<div class="hdr"><div class="l">${t11(`${MODE.name}  ·  ${MODE.map}`)}${T('SCOREBOARD', { size: 34, weight: 1.5, tracking: 3.4 })}</div>
        <div class="r"><div class="big"><span style="color:var(--blue)">${T(String(kills), { size: 38, weight: 1.55 })}</span>${t11('VS', { size: 10 })}<span style="color:var(--red2)">${T(String(deaths), { size: 38, weight: 1.55 })}</span></div>
        <div class="timer" style="padding:10px 14px;border:1px solid var(--line);background:var(--plate)">${T(fmtTime(m.timeLeft), { size: 16, weight: 1.4, tracking: 1.8 })}</div></div></div>`}
      <div class="tm"><div class="tmh us">${T('IRONLINE', { size: 13, weight: 1.4, tracking: 2.6 })}${t11('OPERATOR', { size: 9 })}<span class="sc">${T(String(m.score), { size: 16, weight: 1.45 })}</span></div>
        <table><colgroup><col class="c0"><col><col><col><col><col><col></colgroup><thead><tr>${hdr}</tr></thead><tbody>
          <tr class="me"><td><div class="nmc"><span style="color:var(--amber)">${rankSVG(lv.level, '', 26)}</span><span class="rkc">${T(String(lv.level), { size: 11, weight: 1.3 })}</span>${T(`[${P.tag}] ${P.callsign}`, { size: 13, weight: 1.35, tracking: 2 })}</div></td>
          ${cell(m.score)}${cell(kills)}${cell(deaths)}${cell(m.kd.toFixed(2))}${cell(Math.round(m.accuracy * 100) + '%')}${cell(24, { weight: 1.1 })}</tr>
        </tbody></table></div>
      <div class="tm"><div class="tmh them">${T('HOSTILE CELL', { size: 13, weight: 1.4, tracking: 2.6 })}${t11('OPFOR', { size: 9 })}<span class="sc">${T(String(rows.reduce((a, r) => a + r.score, 0)), { size: 16, weight: 1.45 })}</span></div>
        <table><colgroup><col class="c0"><col><col><col><col><col><col></colgroup><thead><tr>${hdr}</tr></thead><tbody>
        ${rows.map((r, i) => `<tr class="${r.alive ? '' : 'dead'}"><td><div class="nmc"><span style="color:var(--ink2)">${rankSVG(7 + i * 5, '', 26)}</span><span class="rkc">${T(String(8 + ((i * 13) % 40)), { size: 11, weight: 1.3 })}</span>${T(r.name, { size: 13, weight: 1.35, tracking: 2 })}</div></td>
          ${cell(r.score)}${cell(r.kills)}${cell(r.deaths)}${cell((r.deaths ? r.kills / r.deaths : r.kills).toFixed(2))}${cell('—', { weight: 1.1 })}${cell(ping(i), { weight: 1.1 })}</tr>`).join('')}
        </tbody></table></div>
    </div>`;
  }

  // ─── fim de partida ─────────────────────────────────────────────────
  end() {
    const m = this.hud.match;
    const P = this.hud.profile;
    const win = !!m.win;
    const before = levelOf(Math.max(0, P.xp - m.xpEarned));
    const after = levelOf(P.xp);
    const medals = Object.entries(m.medals);
    const tile = (k, v, d = 0) => `<div style="animation-delay:${0.5 + d * 0.06}s"><span class="k">${t11(k, { size: 9 })}</span>${T(String(v), { size: 30, weight: 1.5 })}</div>`;
    return `<div class="shade-full mesh" style="background-color:rgba(5,7,9,.78)"></div><div class="shade-vig"></div>${this.chrome()}<div class="grain" style="background-image:url(${this.grain})"></div>
      <div class="res sh">${t11(`${MODE.name}  ·  ${MODE.map}  ·  ${fmtTime(Math.max(0, MODE.time - m.timeLeft))}`)}
        <div class="w ${win ? 'win' : 'loss'}">${T(win ? 'VICTORY' : 'DEFEAT', { size: 92, weight: 1.6, tracking: 6 })}</div>
        <div class="sub">${T(win ? 'HOSTILE CELL NEUTRALIZED' : 'OBJECTIVE FAILED', { size: 14, weight: 1.3, tracking: 3 })}</div></div>
      <div class="grid sh">
        <div class="panel"><div class="ph">${T('PERFORMANCE', { size: 13, weight: 1.35, tracking: 2.4 })}<span class="r">${t11('OPERATOR ' + P.callsign, { size: 9 })}</span></div>
          <div class="tiles">${tile('SCORE', m.score, 0)}${tile('KILLS', m.kills, 1)}${tile('DEATHS', m.deaths, 2)}${tile('K/D RATIO', m.kd.toFixed(2), 3)}${tile('ACCURACY', Math.round(m.accuracy * 100) + '%', 4)}${tile('HEADSHOTS', m.headshots, 5)}${tile('BEST STREAK', m.bestStreak, 6)}${tile('LONGEST KILL', Math.round(m.longest) + 'M', 7)}${tile('DAMAGE', Math.round(m.damage), 8)}</div></div>
        <div style="display:flex;flex-direction:column;gap:28px">
          <div class="panel"><div class="ph">${T('MEDALS', { size: 13, weight: 1.35, tracking: 2.4 })}<span class="r">${t11(medals.length + ' EARNED', { size: 9 })}</span></div>
            <div class="medals">${medals.length ? medals.map(([n, v]) => `<div class="md">${medalSVG(v.kind, 64)}${T(n, { size: 9, weight: 1.2, tracking: 1.6 })}<span class="c">${T('×' + v.n, { size: 10, weight: 1.3 })}</span></div>`).join('') : `<div style="color:var(--ink3);padding:10px 0">${t11('NO MEDALS THIS MATCH')}</div>`}</div></div>
          <div class="panel"><div class="ph">${T('PROGRESSION', { size: 13, weight: 1.35, tracking: 2.4 })}<span class="r" style="color:var(--amber)">${T('+' + m.xpEarned + ' XP', { size: 12, weight: 1.35 })}</span></div>
            <div class="prog">
              <div class="xpl"><span style="color:var(--amber)">${rankSVG(after.level, '', 40)}</span>${T('LEVEL ' + after.level, { size: 16, weight: 1.45, tracking: 2.2 })}
                <div class="xpb"><i class="g" style="width:${((after.into / after.need) * 100).toFixed(1)}%"></i><i style="width:${after.level > before.level ? 0 : ((before.into / before.need) * 100).toFixed(1)}%"></i></div>
                ${T(`${after.into}/${after.need}`, { size: 11, weight: 1.25 })}</div>
              ${after.level > before.level ? `<div style="color:var(--amber)">${T('LEVEL UP', { size: 13, weight: 1.45, tracking: 3 })}</div>` : ''}
            </div></div>
        </div>
      </div>
      <div class="acts">
        <div class="btn pri" data-act="restart" tabindex="0">${T('PLAY AGAIN', { size: 18, weight: 1.6, tracking: 3.4 })}<span class="chev">${T('>>', { size: 14, weight: 1.8, tracking: 0.8 })}</span></div>
        <div class="btn" data-act="quit" tabindex="0">${T('MAIN MENU', { size: 14, weight: 1.3, tracking: 2.6 })}</div>
      </div>`;
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
      r.nextElementSibling.innerHTML = T(o.fmt(v), { size: 13, weight: 1.35 });
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
