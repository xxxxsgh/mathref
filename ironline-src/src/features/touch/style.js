/**
 * CSS dos controles de toque (injetado uma vez). `--ts` = escala dos botões.
 * Paleta casada com a HUD (tinta clara, âmbar de destaque, vermelho só no
 * tiro). Tudo com env(safe-area-inset-*) para entalhes e barras de gesto.
 */
export const TOUCH_CSS = /* css */ `
html.il-touch, html.il-touch body, html.il-touch #app canvas {
  touch-action: none; -webkit-touch-callout: none; overscroll-behavior: none; -webkit-user-select: none; user-select: none;
}
#il-touch { position: fixed; inset: 0; z-index: 30; touch-action: none; --ts: 1; --hb: 96px; --hbl: 56px; -webkit-tap-highlight-color: transparent;
  pointer-events: auto; font-family: 'Bahnschrift', 'DIN Alternate', 'Roboto Condensed', 'Arial Narrow', system-ui, sans-serif; }
#il-touch.off { display: none; }
#il-touch .joy-zone { position: absolute; left: 0; top: 0; bottom: 0; width: 42%; pointer-events: none; }
#il-touch .joy-base { position: absolute; width: calc(124px * var(--ts)); height: calc(124px * var(--ts)); transform: translate(-50%, -50%);
  border-radius: 50%; border: 1.5px solid rgba(242,244,239,.30); background: radial-gradient(circle, rgba(8,10,12,.10), rgba(8,10,12,.32)); pointer-events: none;
  left: calc(150px * var(--ts) + env(safe-area-inset-left)); top: calc(100% - var(--hbl) - 84px * var(--ts) - env(safe-area-inset-bottom)); opacity: .55; transition: opacity .15s; }
#il-touch .joy-base.live { opacity: 1; transition: none; }
#il-touch .joy-base::before { content: ''; position: absolute; inset: 18%; border-radius: 50%; border: 1px dashed rgba(242,244,239,.12); }
#il-touch .joy-knob { position: absolute; left: 50%; top: 50%; width: calc(52px * var(--ts)); height: calc(52px * var(--ts)); border-radius: 50%;
  background: rgba(242,244,239,.50); box-shadow: 0 1px 6px rgba(0,0,0,.35); transform: translate(-50%, -50%); }
#il-touch .joy-base.sprint { border-color: rgba(226,180,90,.95); }
#il-touch .joy-base.sprint .joy-knob { background: rgba(226,180,90,.85); }
#il-touch .joy-base .sp { position: absolute; left: 50%; top: calc(-22px * var(--ts)); transform: translateX(-50%); font-size: 10px; letter-spacing: .2em;
  color: rgba(226,180,90,.0); transition: color .12s; }
#il-touch .joy-base.sprint .sp { color: rgba(226,180,90,.95); }
#il-touch .tb { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border-radius: 50%;
  touch-action: none; --s: 56px; width: calc(var(--s) * var(--ts)); height: calc(var(--s) * var(--ts)); color: rgba(242,244,239,.92);
  background: rgba(10,12,14,.38); border: 1.5px solid rgba(242,244,239,.28); box-shadow: 0 1px 8px rgba(0,0,0,.22);
  transition: transform .06s, background .06s, border-color .06s; }
#il-touch .tb svg { width: 46%; height: 46%; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
#il-touch .tb b { font-size: calc(8.5px * var(--ts)); font-weight: 600; letter-spacing: .16em; opacity: .8; line-height: 1; }
#il-touch .tb.down { transform: scale(.92); background: rgba(226,180,90,.30); border-color: rgba(226,180,90,.95); }
#il-touch .tb.on { background: rgba(226,180,90,.36); border-color: rgba(226,180,90,.95); color: #fff; }
/* --hb/--hbl: folga da HUD (munição embaixo à direita, cartão do jogador
   embaixo à esquerda), na escala da prancheta 1920×1080 da HUD */
#il-touch .t-fire { --s: 94px; right: calc(100px * var(--ts) + env(safe-area-inset-right)); bottom: calc(var(--hb) + 6px * var(--ts));
  background: rgba(150,36,30,.34); border-color: rgba(255,120,100,.70); }
#il-touch .t-fire.down { background: rgba(200,50,40,.58); border-color: #ff8a70; }
#il-touch .t-fire svg { width: 42%; height: 42%; stroke-width: 2.2; }
#il-touch .t-fire2 { --s: 58px; left: calc(20px + env(safe-area-inset-left)); bottom: calc(var(--hbl) + 112px * var(--ts));
  background: rgba(150,36,30,.26); border-color: rgba(255,120,100,.55); }
#il-touch .t-jump { --s: 60px; right: calc(16px + env(safe-area-inset-right)); bottom: var(--hb); }
#il-touch .t-crouch { --s: 56px; right: calc(18px + env(safe-area-inset-right)); bottom: calc(var(--hb) + 72px * var(--ts)); }
#il-touch .t-swap { --s: 46px; right: calc(23px + env(safe-area-inset-right)); bottom: calc(var(--hb) + 142px * var(--ts)); }
#il-touch .t-ads { --s: 60px; right: calc(206px * var(--ts) + env(safe-area-inset-right)); bottom: calc(var(--hb) + 70px * var(--ts)); }
#il-touch .t-reload { --s: 52px; right: calc(210px * var(--ts) + env(safe-area-inset-right)); bottom: calc(var(--hb) + 2px * var(--ts)); }
#il-touch .t-gren { --s: 46px; right: calc(150px * var(--ts) + env(safe-area-inset-right)); bottom: calc(var(--hb) + 114px * var(--ts)); }
#il-touch .t-melee { --s: 46px; right: calc(90px * var(--ts) + env(safe-area-inset-right)); bottom: calc(var(--hb) + 124px * var(--ts)); }
/* ações de movimento extras (services.movement.touchHints): DIVE/deitar acima
   do SWAP na coluna da direita; lean Q/E em par no alto à direita, fora da
   coluna e longe do tiro (o polegar sobe para "espiar" sem largar a mira) */
#il-touch .t-prone { --s: 46px; right: calc(23px + env(safe-area-inset-right)); bottom: calc(var(--hb) + 199px * var(--ts)); }
#il-touch .t-leanL, #il-touch .t-leanR { --s: 42px; border-radius: 12px; top: calc(12px + env(safe-area-inset-top)); }
#il-touch .t-leanR { right: calc(76px * var(--ts) + env(safe-area-inset-right)); }
#il-touch .t-leanL { right: calc(128px * var(--ts) + env(safe-area-inset-right)); }
#il-touch .t-util { --s: 40px; border-radius: 9px; top: calc(10px + env(safe-area-inset-top)); }
#il-touch .t-pause { left: calc(50% + 150px); }
#il-touch .t-score { left: calc(50% - 190px); }
#il-touch .t-util b { display: none; }
.il-rotate { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; gap: 16px; align-items: center; justify-content: center;
  background: rgba(7,9,10,.94); color: #f2f4ef; text-align: center; padding: 24px; touch-action: none; pointer-events: auto;
  font: 600 14px/1.4 'Bahnschrift', 'Roboto Condensed', system-ui, sans-serif; letter-spacing: .14em; text-transform: uppercase; }
.il-rotate.off { display: none; }
.il-rotate svg { width: 74px; height: 74px; fill: none; stroke: #e2b45a; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  animation: il-rot 2.4s ease-in-out infinite; }
.il-rotate small { color: rgba(242,244,239,.55); letter-spacing: .08em; text-transform: none; font-weight: 400; }
@keyframes il-rot { 0%, 25% { transform: rotate(0deg); } 55%, 100% { transform: rotate(-90deg); } }
`;

/** Ícones originais (traço simples, viewBox 24). */
export const ICONS = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  ads: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/></svg>',
  jump: '<svg viewBox="0 0 24 24"><path d="M6 13l6-6 6 6M6 19l6-6 6 6"/></svg>',
  crouch: '<svg viewBox="0 0 24 24"><path d="M6 5l6 6 6-6M6 11l6 6 6-6M5 21h14"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4v4.5h-4.5"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/></svg>',
  grenade: '<svg viewBox="0 0 24 24"><ellipse cx="11" cy="14.5" rx="5.5" ry="6.5"/><path d="M9 8V5.5h4V8M13 6.5h3.5l1.5 2M8 12.5h6M8 16.5h6"/></svg>',
  melee: '<svg viewBox="0 0 24 24"><path d="M4 20l3-3M6 15l3 3M8.5 15.5L19 5l.5 2.5L10 17z"/></svg>',
  prone: '<svg viewBox="0 0 24 24"><path d="M12 4v9M8 9.5l4 4 4-4M4 19h16"/></svg>',
  leanL: '<svg viewBox="0 0 24 24"><path d="M14 20V11a4 4 0 0 0-4-4H5M8 4L5 7l3 3"/></svg>',
  leanR: '<svg viewBox="0 0 24 24"><path d="M10 20V11a4 4 0 0 1 4-4h5M16 4l3 3-3 3"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg>',
  score: '<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
  rotate: '<svg viewBox="0 0 48 48"><rect x="15" y="6" width="18" height="36" rx="3"/><path d="M21 37h6"/></svg>',
};
