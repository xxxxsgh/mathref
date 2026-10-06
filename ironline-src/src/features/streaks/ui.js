/**
 * DOM próprio da feature streaks (dentro de #ui, camada acima da HUD):
 * telas exclusivas (designador, killcam, modo foto, seletor de killstreaks,
 * roda radial), o aviso de execução e — só se a HUD não declarar
 * `services.hud.handlesStreaks/handlesMedals` — uma barra de killstreaks e
 * um aviso de medalha de RESERVA (a versão "de verdade" é da HUD).
 *
 * Paleta igual à da HUD (âmbar #e2b45a sobre placas escuras), fonte
 * condensada do sistema, letras espaçadas. Nada de marcas.
 */
const CSS = `
.stk { position:absolute; inset:0; pointer-events:none; font-family:'Bahnschrift','DIN Alternate','Barlow','Roboto Condensed','Arial Narrow','Liberation Sans',Arial,sans-serif; color:#f2f4ef; letter-spacing:.08em; z-index:30; }
.stk .mono { font-family: ui-monospace,'DejaVu Sans Mono','Liberation Mono',Menlo,Consolas,monospace; letter-spacing:.04em; }
.stk .interactive, .stk .interactive * { pointer-events:auto; }
.stk-hide { display:none !important; }
/* aviso de execução */
.stk-prompt { position:absolute; left:50%; top:62%; transform:translate(-50%,-50%); display:flex; align-items:center; gap:12px; padding:9px 16px 9px 10px; background:rgba(9,11,13,.62); border:1px solid rgba(226,180,90,.55); border-radius:3px; font-size:13px; text-transform:uppercase; box-shadow:0 0 22px rgba(0,0,0,.35); }
.stk-prompt .k { width:30px; height:30px; display:grid; place-items:center; position:relative; font-weight:700; color:#0b0c0d; }
.stk-prompt .k svg { position:absolute; inset:0; }
.stk-prompt .k span { position:relative; background:#e2b45a; border-radius:2px; width:20px; height:20px; display:grid; place-items:center; font-size:12px; }
.stk-prompt .t b { color:#e2b45a; font-weight:700; }
/* barra/aviso de reserva */
.stk-bar { position:absolute; right:22px; bottom:150px; display:flex; flex-direction:column; gap:5px; align-items:flex-end; }
.stk-slot { display:flex; align-items:center; gap:8px; padding:4px 8px; min-width:150px; justify-content:flex-end; background:rgba(9,11,13,.45); border-right:2px solid rgba(242,244,239,.25); font-size:11px; color:rgba(242,244,239,.6); }
.stk-slot.ready { color:#0b0c0d; background:linear-gradient(90deg,rgba(226,180,90,.25),rgba(226,180,90,.95)); border-right-color:#ecd09a; animation:stkPulse 1.2s ease-in-out infinite; }
.stk-slot .kc { font-size:10px; opacity:.8; border:1px solid currentColor; padding:0 4px; border-radius:2px; }
.stk-slot .pg { width:42px; height:3px; background:rgba(242,244,239,.15); position:relative; }
.stk-slot .pg i { position:absolute; left:0; top:0; bottom:0; background:#e2b45a; }
@keyframes stkPulse { 50% { filter:brightness(1.25); } }
.stk-toast { position:absolute; left:50%; top:22%; transform:translateX(-50%); text-align:center; text-transform:uppercase; transition:opacity .4s, transform .4s; }
.stk-toast .a { font-size:11px; color:#e2b45a; letter-spacing:.3em; }
.stk-toast .b { font-size:24px; font-weight:700; letter-spacing:.14em; text-shadow:0 2px 10px rgba(0,0,0,.6); }
.stk-toast .c { font-size:11px; color:rgba(242,244,239,.7); margin-top:2px; }
.stk-toast.out { opacity:0; transform:translate(-50%,-10px); }
/* roda radial */
.stk-radial { position:absolute; left:50%; top:50%; width:300px; height:300px; transform:translate(-50%,-50%); }
.stk-radial svg { width:100%; height:100%; overflow:visible; }
.stk-radial .lbl { position:absolute; width:110px; margin-left:-55px; text-align:center; font-size:11px; text-transform:uppercase; }
.stk-radial .lbl b { display:block; font-size:13px; }
/* banners centrais (designador/torreta) */
.stk-hint { position:absolute; left:50%; bottom:13%; transform:translateX(-50%); padding:6px 14px; background:rgba(9,11,13,.6); border-left:2px solid #e2b45a; font-size:12px; text-transform:uppercase; white-space:nowrap; }
.stk-hint b { color:#e2b45a; }
/* seletor de killstreaks */
.stk-pick { position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(8,10,12,.82), rgba(4,5,6,.94)); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; }
.stk-pick h2 { margin:0; font-size:26px; letter-spacing:.3em; font-weight:700; }
.stk-pick .sub { font-size:11px; color:rgba(242,244,239,.6); letter-spacing:.2em; }
.stk-pick .grid { display:grid; grid-template-columns:repeat(5, 170px); gap:12px; }
.stk-card { background:rgba(242,244,239,.04); border:1px solid rgba(242,244,239,.14); padding:14px 12px; cursor:pointer; text-transform:uppercase; transition:background .15s, border-color .15s; position:relative; min-height:180px; }
.stk-card:hover { background:rgba(242,244,239,.08); }
.stk-card.on { border-color:#e2b45a; background:rgba(226,180,90,.1); }
.stk-card.on::after { content:'EQUIPPED'; position:absolute; top:8px; right:8px; font-size:9px; color:#e2b45a; letter-spacing:.2em; }
.stk-card .ic { height:62px; display:grid; place-items:center; color:#e2b45a; }
.stk-card .nm { font-size:14px; font-weight:700; margin-top:6px; }
.stk-card .kl { font-size:11px; color:#e2b45a; margin-top:2px; }
.stk-card .ds { font-size:10px; color:rgba(242,244,239,.6); text-transform:none; letter-spacing:.02em; margin-top:8px; line-height:1.35; }
.stk-btn { background:#e2b45a; color:#0b0c0d; border:0; padding:9px 22px; font:inherit; font-weight:700; letter-spacing:.2em; cursor:pointer; }
@media (max-width:900px) { .stk-pick .grid { grid-template-columns:repeat(2, 150px); } .stk-bar { bottom:210px; right:12px; } }
`;

export function ensureStyle() {
  if (document.getElementById('stk-style')) return;
  const s = document.createElement('style');
  s.id = 'stk-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export function el(tag, cls, html, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

/** Ícones em SVG de traço (mesma família da HUD), por id de killstreak. */
export function streakIcon(id, s = 48) {
  const st = `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const body = {
    uav: `<circle cx="24" cy="24" r="17" ${st} opacity=".45"/><circle cx="24" cy="24" r="9" ${st} opacity=".7"/><path d="M24 24 L37 13" ${st}/><circle cx="31" cy="30" r="2" fill="currentColor"/><circle cx="16" cy="17" r="1.6" fill="currentColor"/>`,
    mortar: `<path d="M24 6 L24 30" ${st}/><path d="M18 24 L24 32 L30 24" ${st}/><path d="M10 40 Q24 30 38 40" ${st}/><path d="M14 36 L10 32 M34 36 L38 32 M24 36 L24 41" ${st}/>`,
    sentry: `<rect x="15" y="12" width="16" height="11" rx="2" ${st}/><path d="M31 16 L42 16" ${st}/><path d="M23 23 L23 30 L13 42 M23 30 L33 42 M23 30 L23 42" ${st}/>`,
    drone: `<rect x="19" y="21" width="10" height="7" rx="2" ${st}/><path d="M19 22 L11 15 M29 22 L37 15 M19 27 L11 33 M29 27 L37 33" ${st}/><ellipse cx="11" cy="14" rx="6" ry="1.6" ${st}/><ellipse cx="37" cy="14" rx="6" ry="1.6" ${st}/><ellipse cx="11" cy="34" rx="6" ry="1.6" ${st}/><ellipse cx="37" cy="34" rx="6" ry="1.6" ${st}/><path d="M24 28 L24 34" ${st}/>`,
    kamikaze: `<rect x="19" y="19" width="10" height="7" rx="2" ${st}/><path d="M19 20 L11 13 M29 20 L37 13" ${st}/><ellipse cx="11" cy="12" rx="6" ry="1.6" ${st}/><ellipse cx="37" cy="12" rx="6" ry="1.6" ${st}/><path d="M24 26 L24 31" ${st}/><circle cx="24" cy="36" r="5" ${st}/><path d="M24 33 L24 36 L26 37" ${st}/>`,
  }[id] || `<circle cx="24" cy="24" r="14" ${st}/>`;
  return `<svg width="${s}" height="${s}" viewBox="0 0 48 48">${body}</svg>`;
}
