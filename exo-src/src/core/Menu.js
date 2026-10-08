/**
 * Menu mínimo do núcleo (DOM em ctx.ui) + telemetria (F3).
 *
 * - Tela inicial/pausa: título, "Explorar" (captura o mouse), controles,
 *   seletor de qualidade. Aparece sempre que o pointer lock é solto.
 * - Um sistema com menu próprio chama `ctx.menu.disable()` (ou publica o
 *   serviço 'menu') e o núcleo não mostra mais o dele.
 * - Telemetria (F3 ou ?telemetry=1): modo, altitude, velocidade, lat/lon,
 *   hora local, serviços placeholder ainda ativos.
 */
import { latLonFromDir } from './Geo.js';

const CSS = `
#exo-menu{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 60%,rgba(4,8,16,.35),rgba(2,4,8,.82));z-index:5;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#e6eef8}
#exo-menu[hidden]{display:none}
#exo-menu .card{max-width:min(92vw,520px);padding:28px 30px;text-align:center}
#exo-menu h1{margin:0 0 6px;font:600 40px/1 'Bahnschrift','DIN Alternate','Roboto Condensed','Arial Narrow',sans-serif;letter-spacing:.38em;padding-left:.38em}
#exo-menu p.sub{margin:0 0 22px;font-size:13px;letter-spacing:.14em;color:rgba(230,238,248,.6);text-transform:uppercase}
#exo-menu button{font:600 15px system-ui,sans-serif;letter-spacing:.12em;padding:13px 30px;border:0;border-radius:3px;background:#7fd8ff;color:#06121c;cursor:pointer}
#exo-menu table{margin:22px auto 10px;border-collapse:collapse;font-size:13px;text-align:left}
#exo-menu td{padding:3px 10px;color:rgba(230,238,248,.75)}
#exo-menu td:first-child{color:#ffd27a;font:600 12px ui-monospace,Menlo,Consolas,monospace;text-align:right;white-space:nowrap}
#exo-menu label{font-size:12px;color:rgba(230,238,248,.6);letter-spacing:.08em}
#exo-menu select{margin-left:8px;background:#0c1520;color:#e6eef8;border:1px solid rgba(127,216,255,.35);border-radius:3px;padding:4px 6px}
#exo-telemetry{position:fixed;left:8px;bottom:8px;z-index:4;font:600 11px/1.4 ui-monospace,Menlo,Consolas,monospace;color:#d8f4ff;background:rgba(0,0,0,.5);padding:6px 9px;border-radius:3px;white-space:pre;pointer-events:none;text-shadow:0 1px 0 #000}
`;

const CONTROLS = [
  ['W A S D', 'andar · empuxo'],
  ['Mouse', 'olhar · pilotar'],
  ['Espaço', 'pular / jetpack · subir'],
  ['Ctrl / C', 'descer (nave)'],
  ['Shift', 'correr · pós-combustor'],
  ['Q / E', 'rolar (nave)'],
  ['V', '1ª / 3ª pessoa'],
  ['G', 'a pé → nave → espaço (sem sistema de nave)'],
  ['F', 'interagir'],
  ['F3 · F7', 'telemetria · desempenho'],
  ['Esc', 'pausa'],
];

export class Menu {
  constructor(ctx) {
    this.ctx = ctx;
    this.enabled = true;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.id = 'exo-menu';
    el.className = 'interactive';
    el.innerHTML = `<div class="card"><h1>EXOSFERA</h1><p class="sub">exploração procedural</p>
      <button type="button" id="exo-start">EXPLORAR</button>
      <table>${CONTROLS.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>
      <label>qualidade<select id="exo-q">${['auto', 'low', 'medium', 'high', 'ultra'].map((q) => `<option>${q}</option>`).join('')}</select></label></div>`;
    ctx.ui.appendChild(el);
    this.el = el;
    el.style.pointerEvents = 'auto';
    el.querySelector('#exo-start').addEventListener('click', () => {
      ctx.input.requestLock();
      this.hide();
    });
    const sel = el.querySelector('#exo-q');
    sel.value = ctx.quality.setting;
    sel.addEventListener('change', () => ctx.quality.set(sel.value));
    ctx.bus.on('input:lock', (locked) => {
      if (!this.enabled) return;
      if (locked) this.hide();
      else this.show();
    });
    this.tel = null;
    this.telOn = ctx.params.get('telemetry') === '1';
    addEventListener('keydown', (e) => {
      if (e.code === 'F3') {
        e.preventDefault();
        this.telOn = !this.telOn;
        if (this.tel) this.tel.style.display = this.telOn ? 'block' : 'none';
      }
    });
    this.acc = 0;
  }

  show() {
    if (this.enabled) this.el.hidden = false;
  }
  hide() {
    this.el.hidden = true;
  }
  /** Um sistema com menu próprio desliga o do núcleo. */
  disable() {
    this.enabled = false;
    this.hide();
  }

  frame(dt) {
    if (!this.telOn) return;
    this.acc += dt;
    if (this.acc < 0.2) return;
    this.acc = 0;
    if (!this.tel) {
      this.tel = document.createElement('div');
      this.tel.id = 'exo-telemetry';
      document.body.appendChild(this.tel);
    }
    const { player: p, services: s, space } = this.ctx;
    const c = space.planetCenter;
    const ll = latLonFromDir({ x: p.worldPos.x - c.x, y: p.worldPos.y - c.y, z: p.worldPos.z - c.z });
    const alt = p.altitude;
    const fmt = (m) => (Math.abs(m) >= 10000 ? `${(m / 1000).toFixed(1)} km` : `${m.toFixed(1)} m`);
    const ph = Object.entries(s).filter(([, v]) => v?.placeholder).map(([k]) => k);
    const t = s.sky?.timeOfDay;
    this.tel.textContent = `${p.mode} · ${p.view}${p.grounded ? ' · no solo' : ''}\n`
      + `alt ${fmt(alt)}  vel ${fmt(p.speed)}/s\n`
      + `lat ${ll.lat.toFixed(3)}°  lon ${ll.lon.toFixed(3)}°\n`
      + `hora ${t != null ? `${Math.floor(t * 24)}h${String(Math.floor((t * 1440) % 60)).padStart(2, '0')}` : '—'}  ${s.universe?.currentPlanet?.name || ''}\n`
      + `placeholders: ${ph.join(', ') || 'nenhum'}`;
  }
}
