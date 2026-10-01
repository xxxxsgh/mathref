/**
 * Folha de estilo do HUD e das telas de menu.
 *
 * Tudo é diagramado numa prancheta de 1920×1080 (`.stage`) que é escalada
 * por `transform` para a janela real — as medidas abaixo são as do layout
 * de referência, como num HUD de console. Texto de destaque usa a fonte
 * vetorial própria (font.js); texto corrido usa fontes do sistema.
 */
export const CSS = /* css */ `
#hud {
  --ink: #f2f4ef;
  --ink2: rgba(242,244,239,.68);
  --ink3: rgba(242,244,239,.38);
  --amber: #ffb22e;
  --amber2: #ffcf73;
  --red: #ff3d33;
  --red2: #ff6a55;
  --blue: #49b3ff;
  --plate: rgba(9,11,13,.62);
  --plate2: rgba(9,11,13,.38);
  --line: rgba(242,244,239,.16);
  --cross: #f2f4ef;
  --sans: 'Bahnschrift', 'DIN Alternate', 'Barlow', 'Roboto Condensed', 'Arial Narrow', 'Liberation Sans', 'Helvetica Neue', Arial, sans-serif;
  position: absolute; inset: 0; overflow: hidden; color: var(--ink);
  font: 500 16px/1.35 var(--sans); letter-spacing: .02em;
  -webkit-font-smoothing: antialiased;
}
#hud * { box-sizing: border-box; }
#hud .stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0; }
#hud .ft { display: block; overflow: visible; }
#hud .sh .ft, #hud .sh svg { filter: drop-shadow(0 1px 1.2px rgba(0,0,0,.75)) drop-shadow(0 0 6px rgba(0,0,0,.28)); }
#hud .hide { display: none !important; }

/* ── camadas de tela cheia ─────────────────────────────────────────── */
#hud .fx { position: absolute; inset: 0; pointer-events: none; }
#hud .vig-canvas { width: 100%; height: 100%; opacity: 0; mix-blend-mode: normal; }
#hud .desat { position: absolute; inset: 0; opacity: 0;
  backdrop-filter: saturate(.25) contrast(1.08);
  -webkit-mask-image: radial-gradient(ellipse 72% 70% at 50% 50%, transparent 30%, #000 100%);
  mask-image: radial-gradient(ellipse 72% 70% at 50% 50%, transparent 30%, #000 100%); }
#hud .flash { position: absolute; inset: 0; opacity: 0; background: radial-gradient(ellipse at center, rgba(120,0,0,0) 40%, rgba(150,8,4,.38) 100%); }

#hud .corner { position: absolute; pointer-events: none; }
#hud .corner.br { right: 0; bottom: 0; width: 760px; height: 380px; background: radial-gradient(ellipse at 100% 100%, rgba(0,0,0,.42), rgba(0,0,0,.18) 45%, transparent 70%); }
#hud .corner.bl { left: 0; bottom: 0; width: 620px; height: 260px; background: radial-gradient(ellipse at 0% 100%, rgba(0,0,0,.38), rgba(0,0,0,.14) 45%, transparent 70%); }
#hud .corner.tl { left: 0; top: 0; width: 560px; height: 760px; background: radial-gradient(ellipse at 0% 0%, rgba(0,0,0,.3), rgba(0,0,0,.1) 50%, transparent 72%); }

/* ── mira ──────────────────────────────────────────────────────────── */
#hud .cross { position: absolute; left: 960px; top: 540px; width: 0; height: 0; transition: opacity .12s; }
#hud .cross i { position: absolute; background: var(--cross); box-shadow: 0 0 0 1px rgba(0,0,0,.42), 0 0 4px rgba(0,0,0,.35); }
#hud .cross .t, #hud .cross .b { width: 2px; height: 11px; left: -1px; }
#hud .cross .l, #hud .cross .r { height: 2px; width: 11px; top: -1px; }
#hud .cross .d { width: 2px; height: 2px; left: -1px; top: -1px; border-radius: 1px; }

#hud .hitm { position: absolute; left: 960px; top: 540px; width: 0; height: 0; opacity: 0; }
#hud .hitm i { position: absolute; left: -1.5px; top: 0; width: 3px; height: 13px; background: #fff;
  box-shadow: 0 0 0 1px rgba(0,0,0,.35); transform-origin: 1.5px 0; }
#hud .hitm.head i { background: var(--amber2); }
#hud .hitm.kill i { background: var(--red); width: 3.5px; height: 16px; box-shadow: 0 0 0 1px rgba(40,0,0,.5), 0 0 10px rgba(255,40,30,.55); }
#hud .hitm .ring { position: absolute; left: -26px; top: -26px; width: 52px; height: 52px; border: 2px solid var(--red); border-radius: 50%; opacity: 0; }
#hud .hitm.head .ring { border-color: var(--amber2); }

/* ── avisos centrais ──────────────────────────────────────────────── */
#hud .prompt { position: absolute; left: 0; width: 1920px; top: 612px; display: flex; justify-content: center; align-items: center; gap: 10px; color: var(--amber); opacity: 0; transition: opacity .2s; }
#hud .prompt.red { color: var(--red2); }
#hud .key { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 6px; border: 1.5px solid currentColor; border-radius: 3px; background: rgba(0,0,0,.35); }
#hud .xp { position: absolute; left: 1010px; top: 590px; display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
#hud .xp .row { display: flex; align-items: center; gap: 10px; animation: xpIn .28s cubic-bezier(.2,.9,.25,1.2) both; }
#hud .xp .row.out { animation: xpOut .4s ease-in both; }
#hud .xp .pts { color: var(--amber); }
#hud .xp .lab { color: var(--ink); opacity: .92; }
#hud .xp .tot { color: var(--amber2); }
@keyframes xpIn { from { opacity: 0; transform: translateX(-14px) scale(1.25); } to { opacity: 1; transform: none; } }
@keyframes xpOut { to { opacity: 0; transform: translateY(-10px); } }

#hud .medal { position: absolute; left: 0; width: 1920px; top: 150px; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
#hud .medal .m { display: flex; flex-direction: column; align-items: center; gap: 8px; animation: medalIn .5s cubic-bezier(.16,1.1,.3,1) both; }
#hud .medal .m.out { animation: medalOut .35s ease-in both; }
#hud .medal .m .ic { color: var(--amber); filter: drop-shadow(0 0 14px rgba(255,170,40,.45)) drop-shadow(0 2px 2px rgba(0,0,0,.6)); }
@keyframes medalIn { 0% { opacity: 0; transform: scale(2.2); filter: blur(6px); } 60% { opacity: 1; transform: scale(.94); filter: none; } 100% { transform: scale(1); } }
@keyframes medalOut { to { opacity: 0; transform: scale(.85) translateY(-16px); } }

#hud .banner { position: absolute; left: 0; width: 1920px; top: 300px; display: flex; flex-direction: column; align-items: center; gap: 14px; opacity: 0; }
#hud .banner.on { animation: bannerIn 4.2s ease both; }
#hud .banner .bar { width: 560px; height: 1px; background: linear-gradient(90deg, transparent, var(--amber), transparent); }
#hud .banner .sub { color: var(--ink2); font-size: 17px; letter-spacing: .14em; text-transform: uppercase; }
@keyframes bannerIn { 0% { opacity: 0; transform: translateY(14px); letter-spacing: .3em; } 10% { opacity: 1; transform: none; } 82% { opacity: 1; } 100% { opacity: 0; } }

/* ── indicadores de dano ───────────────────────────────────────────── */
#hud .dmg { position: absolute; left: 960px; top: 540px; width: 0; height: 0; }
#hud .dmg svg { position: absolute; left: -130px; top: -260px; width: 260px; height: 120px; transform-origin: 130px 260px; overflow: visible; }

/* ── bússola ──────────────────────────────────────────────────────── */
#hud .compass { position: absolute; left: 610px; top: 26px; width: 700px; height: 70px; }
#hud .compass canvas { position: absolute; left: 0; top: 0; width: 700px; height: 70px; }

/* ── minimapa + placar ─────────────────────────────────────────────── */
#hud .mm { position: absolute; left: 44px; top: 40px; width: 268px; height: 268px; }
#hud .mm canvas { position: absolute; inset: 0; width: 268px; height: 268px; }
#hud .score { position: absolute; left: 44px; top: 322px; width: 268px; }
#hud .score .top { display: flex; align-items: center; gap: 10px; height: 34px; }
#hud .score .timer { display: flex; align-items: center; justify-content: center; height: 34px; padding: 0 12px; background: var(--plate); border: 1px solid var(--line); }
#hud .score .timer.low { color: var(--red2); border-color: rgba(255,61,51,.5); }
#hud .score .mode { display: flex; align-items: center; height: 34px; padding: 0 12px; color: var(--ink2); background: linear-gradient(90deg, var(--plate2), transparent); }
#hud .score .rowx { position: relative; display: flex; align-items: center; height: 30px; margin-top: 6px; background: linear-gradient(90deg, var(--plate), var(--plate2) 80%, transparent); }
#hud .score .rowx .n { width: 52px; height: 30px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); }
#hud .score .rowx .fill { position: absolute; left: 52px; top: 0; bottom: 0; transition: width .5s cubic-bezier(.2,.8,.2,1); }
#hud .score .rowx.us .fill { background: linear-gradient(90deg, rgba(73,179,255,.55), rgba(73,179,255,.25)); box-shadow: inset -2px 0 0 var(--blue); }
#hud .score .rowx.them .fill { background: linear-gradient(90deg, rgba(255,61,51,.55), rgba(255,61,51,.22)); box-shadow: inset -2px 0 0 var(--red); }
#hud .score .rowx .tag { position: relative; margin-left: 12px; color: var(--ink); }
#hud .score .rowx .goal { position: absolute; right: 8px; color: var(--ink3); }
#hud .score .rowx.us .n { box-shadow: inset 3px 0 0 var(--blue); }
#hud .score .rowx.them .n { box-shadow: inset 3px 0 0 var(--red); }

/* ── feed de abates ────────────────────────────────────────────────── */
#hud .feed { position: absolute; left: 44px; top: 452px; width: 520px; display: flex; flex-direction: column; gap: 4px; }
#hud .feed .k { display: flex; align-items: center; gap: 10px; height: 30px; padding: 0 14px 0 10px; width: max-content;
  background: linear-gradient(90deg, rgba(9,11,13,.66), rgba(9,11,13,.4) 75%, rgba(9,11,13,0)); animation: feedIn .3s cubic-bezier(.2,.9,.3,1) both; }
#hud .feed .k.out { animation: feedOut .5s ease-in both; }
#hud .feed .k .self { color: var(--amber); }
#hud .feed .k .foe { color: var(--red2); }
#hud .feed .k .ally { color: var(--blue); }
#hud .feed .k .kw { color: var(--ink); opacity: .9; }
#hud .feed .k .hs { color: var(--ink); opacity: .9; margin-left: -4px; }
@keyframes feedIn { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: none; } }
@keyframes feedOut { to { opacity: 0; transform: translateX(-12px); } }

/* ── painel da arma ────────────────────────────────────────────────── */
#hud .wpn { position: absolute; right: 56px; bottom: 50px; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
#hud .wpn .head { display: flex; align-items: center; gap: 10px; color: var(--ink); }
#hud .wpn .mode { display: flex; align-items: center; height: 20px; padding: 0 7px; border: 1px solid var(--ink3); color: var(--ink2); }
#hud .wpn .main { display: flex; align-items: flex-end; gap: 18px; }
#hud .wpn .gun { color: var(--ink); opacity: .9; margin-bottom: 6px; }
#hud .wpn .sep { width: 2px; height: 70px; background: linear-gradient(180deg, transparent, var(--ink3) 30%, var(--ink3)); }
#hud .wpn .count { display: flex; flex-direction: column; align-items: flex-end; gap: 9px; min-width: 112px; }
#hud .wpn .count .mag { color: var(--ink); transition: color .2s; }
#hud .wpn .count .mag.low { color: var(--amber); }
#hud .wpn .count .mag.empty { color: var(--red2); }
#hud .wpn .count .res { color: var(--ink2); }
#hud .wpn .ticks { display: flex; gap: 2px; height: 10px; }
#hud .wpn .ticks i { width: 4px; height: 10px; background: var(--ink); box-shadow: 0 0 0 .5px rgba(0,0,0,.4); transition: opacity .15s, background .15s; }
#hud .wpn .ticks i.s { opacity: .18; }
#hud .wpn .ticks.low i { background: var(--amber); }
#hud .wpn .ticks.empty i { background: var(--red2); }
#hud .wpn .reload { width: 100%; height: 3px; background: rgba(255,255,255,.12); opacity: 0; transition: opacity .15s; }
#hud .wpn .reload i { display: block; height: 100%; width: 0; background: var(--amber); }
#hud .equip { position: absolute; right: 56px; bottom: 196px; display: flex; gap: 14px; }
#hud .equip .e { position: relative; display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 10px 0 6px; color: var(--ink);
  background: linear-gradient(270deg, var(--plate), var(--plate2)); }
#hud .equip .e .kb { position: absolute; top: -9px; left: -6px; }
#hud .equip .e .kb .key { min-width: 18px; height: 18px; padding: 0 4px; border-width: 1px; background: rgba(0,0,0,.7); color: var(--ink2); }

/* ── vida / jogador ────────────────────────────────────────────────── */
#hud .vit { position: absolute; left: 44px; bottom: 50px; display: flex; flex-direction: column; gap: 9px; width: 340px; }
#hud .vit .who { display: flex; align-items: center; gap: 10px; }
#hud .vit .who .rk { color: var(--amber); }
#hud .vit .who .lv { color: var(--ink2); }
#hud .vit .hp { display: flex; align-items: center; gap: 12px; }
#hud .vit .bar { position: relative; flex: 1; height: 8px; background: rgba(0,0,0,.45); box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
#hud .vit .bar .lag { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(255,90,70,.85); }
#hud .vit .bar .cur { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); }
#hud .vit .bar .seg { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(25% - 2px), rgba(0,0,0,.75) calc(25% - 2px) 25%); }
#hud .vit.low .bar .cur { background: var(--red2); animation: pulse 1s ease-in-out infinite; }
#hud .vit .num { min-width: 46px; display: flex; justify-content: flex-end; }
#hud .vit .streak { display: flex; gap: 6px; align-items: center; color: var(--ink2); }
#hud .vit .streak b { display: block; width: 18px; height: 6px; background: rgba(255,255,255,.14); transform: skewX(-20deg); }
#hud .vit .streak b.on { background: var(--amber); box-shadow: 0 0 8px rgba(255,178,46,.5); }
@keyframes pulse { 50% { opacity: .55; } }

/* ── morte ─────────────────────────────────────────────────────────── */
#hud .death { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  background: radial-gradient(ellipse at center, rgba(40,0,0,.25), rgba(8,0,0,.82)); opacity: 0; transition: opacity .6s; }
#hud .death.on { opacity: 1; }
#hud .play.dead .cross, #hud .play.dead .hitm, #hud .play.dead .xp, #hud .play.dead .prompt, #hud .play.dead .medal, #hud .play.dead .dmg { display: none; }
#hud .death .by { display: flex; align-items: center; gap: 12px; color: var(--ink2); }
#hud .death .cd { color: var(--ink2); font-size: 16px; letter-spacing: .2em; }

/* ── telas (menus) ────────────────────────────────────────────────── */
#hud .scr { position: absolute; inset: 0; pointer-events: auto; opacity: 0; transition: opacity .35s; }
#hud .scr.on { opacity: 1; }
#hud .shade-l { position: absolute; inset: 0; background:
  linear-gradient(90deg, rgba(4,6,8,.9) 0%, rgba(4,6,8,.72) 26%, rgba(4,6,8,.18) 52%, rgba(4,6,8,0) 66%),
  linear-gradient(0deg, rgba(4,6,8,.85) 0%, rgba(4,6,8,0) 26%),
  linear-gradient(180deg, rgba(4,6,8,.75) 0%, rgba(4,6,8,0) 14%); }
#hud .shade-full { position: absolute; inset: 0; background: rgba(5,7,9,.72); backdrop-filter: blur(10px) saturate(.7); }
#hud .shade-full.mesh { background-image: linear-gradient(rgba(242,244,239,.028) 1px, transparent 1px), linear-gradient(90deg, rgba(242,244,239,.028) 1px, transparent 1px); background-size: 48px 48px; }
#hud .chrome { position: absolute; left: 0; top: 0; pointer-events: none; }
#hud .shade-vig { position: absolute; inset: 0; background: radial-gradient(ellipse 85% 75% at 60% 45%, transparent 55%, rgba(0,0,0,.55) 100%); }
#hud .grain { position: absolute; inset: -64px; opacity: .07; mix-blend-mode: overlay; animation: grain .9s steps(6) infinite; background-size: 256px 256px; }
/* modo shot (SwiftShader): nada de animação infinita nem desfoque extra */
#hud.shot .vit.low .bar .cur { animation: none; }
#hud.shot .grain { display: none; }
#hud.shot .panel { backdrop-filter: none; }
@keyframes grain { 0% { transform: translate(0,0); } 20% { transform: translate(-31px,17px); } 40% { transform: translate(23px,-29px); } 60% { transform: translate(-13px,41px); } 80% { transform: translate(37px,9px); } }

#hud .topbar { position: absolute; left: 0; right: 0; top: 0; height: 92px; display: flex; align-items: center; padding: 0 96px; gap: 56px; border-bottom: 1px solid rgba(255,255,255,.07); }
#hud .logo { display: flex; align-items: center; gap: 14px; color: var(--ink); }
#hud .logo .mark { color: var(--amber); }
#hud .tabs { display: flex; gap: 6px; height: 92px; }
#hud .tab { position: relative; display: flex; align-items: center; padding: 0 22px; color: var(--ink3); cursor: pointer; transition: color .15s; }
#hud .tab:hover { color: var(--ink); }
#hud .tab.on { color: var(--ink); }
#hud .tab.on::after { content: ''; position: absolute; left: 22px; right: 22px; bottom: -1px; height: 3px; background: var(--amber); box-shadow: 0 0 12px rgba(255,178,46,.6); }
#hud .card { margin-left: auto; display: flex; align-items: center; gap: 14px; }
#hud .card .rk { color: var(--amber); }
#hud .card .meta { display: flex; flex-direction: column; gap: 7px; align-items: flex-start; }
#hud .card .xpb { width: 190px; height: 4px; background: rgba(255,255,255,.14); }
#hud .card .xpb i { display: block; height: 100%; background: var(--amber); }
#hud .card .lvl { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; border: 1px solid var(--line); background: var(--plate2); }

#hud .col { position: absolute; left: 96px; top: 200px; width: 620px; display: flex; flex-direction: column; }
#hud .eyebrow { display: flex; align-items: center; gap: 12px; color: var(--amber); }
#hud .eyebrow::before { content: ''; width: 28px; height: 2px; background: var(--amber); }
#hud .title { margin-top: 22px; color: var(--ink); }
#hud .desc { margin-top: 22px; max-width: 520px; color: var(--ink2); font-size: 18px; line-height: 1.55; letter-spacing: .01em; }
#hud .facts { display: flex; gap: 34px; margin-top: 30px; padding: 18px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
#hud .facts .f { display: flex; flex-direction: column; gap: 9px; }
#hud .facts .f .k { color: var(--ink3); }
#hud .btns { display: flex; flex-direction: column; gap: 8px; margin-top: 40px; width: 440px; }
#hud .btn { position: relative; display: flex; align-items: center; gap: 16px; height: 58px; padding: 0 22px; cursor: pointer; color: var(--ink);
  background: linear-gradient(90deg, rgba(14,17,20,.72), rgba(14,17,20,.38)); border: 1px solid rgba(255,255,255,.07); outline: none;
  transition: background .15s, color .15s, transform .15s, border-color .15s; }
#hud .btn::before { content: ''; position: absolute; left: -1px; top: -1px; bottom: -1px; width: 3px; background: var(--amber); transform: scaleY(0); transition: transform .18s; }
#hud .btn:hover, #hud .btn:focus-visible, #hud .btn.focus { background: linear-gradient(90deg, rgba(40,44,48,.85), rgba(30,33,36,.45)); border-color: rgba(255,255,255,.16); transform: translateX(4px); }
#hud .btn:hover::before, #hud .btn:focus-visible::before, #hud .btn.focus::before { transform: scaleY(1); }
#hud .btn .hint { margin-left: auto; color: var(--ink3); }
#hud .btn.pri { height: 76px; background: var(--amber); color: #121110; border-color: transparent;
  clip-path: polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%); }
#hud .btn.pri::before { display: none; }
#hud .btn.pri:hover, #hud .btn.pri.focus { background: var(--amber2); transform: translateX(4px); }
#hud .btn.pri .hint { color: rgba(18,17,16,.6); }
#hud .btn.pri .chev { margin-left: auto; }

#hud .side { position: absolute; right: 96px; bottom: 120px; width: 440px; display: flex; flex-direction: column; gap: 10px; }
#hud .panel { background: linear-gradient(180deg, rgba(12,15,18,.8), rgba(12,15,18,.62)); border: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(6px); }
#hud .panel .ph { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--line); color: var(--ink); }
#hud .panel .ph .r { color: var(--ink3); }
#hud .chal { display: flex; align-items: center; gap: 14px; padding: 14px 20px; }
#hud .chal + .chal { border-top: 1px solid rgba(255,255,255,.05); }
#hud .chal .ic { width: 38px; height: 38px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); color: var(--amber); flex: none; }
#hud .chal .tx { flex: 1; display: flex; flex-direction: column; gap: 8px; }
#hud .chal .tx .d { font-size: 15px; color: var(--ink2); }
#hud .chal .pb { height: 3px; background: rgba(255,255,255,.12); }
#hud .chal .pb i { display: block; height: 100%; background: var(--amber); }
#hud .chal .v { color: var(--ink2); }

#hud .foot { position: absolute; left: 96px; right: 96px; bottom: 40px; display: flex; align-items: center; gap: 28px; color: var(--ink2); }
#hud .foot .h { display: flex; align-items: center; gap: 9px; }
#hud .foot .ver { margin-left: auto; color: var(--ink3); }
#hud .foot .key, #hud .btn .key { min-width: 24px; height: 24px; font-size: 12px; border-width: 1px; }

/* loadout */
#hud .lo { position: absolute; left: 96px; top: 150px; right: 96px; bottom: 110px; display: grid; grid-template-columns: 470px 1fr; gap: 56px; }
#hud .slots { display: flex; flex-direction: column; gap: 10px; }
#hud .slot { position: relative; display: flex; align-items: center; gap: 18px; padding: 16px 20px; min-height: 92px; cursor: pointer;
  background: linear-gradient(90deg, rgba(14,17,20,.78), rgba(14,17,20,.5)); border: 1px solid rgba(255,255,255,.07); transition: border-color .15s, background .15s; }
#hud .slot:hover, #hud .slot.on { border-color: rgba(255,178,46,.55); background: linear-gradient(90deg, rgba(40,34,22,.85), rgba(20,20,20,.55)); }
#hud .slot .lbl { display: flex; flex-direction: column; gap: 10px; flex: 1; }
#hud .slot .lbl .k { color: var(--ink3); }
#hud .slot .img { color: var(--ink); opacity: .9; }
#hud .slot.small { min-height: 66px; }
#hud .detail { position: relative; display: flex; flex-direction: column; }
#hud .detail .big { color: var(--ink); margin-top: 8px; filter: drop-shadow(0 18px 30px rgba(0,0,0,.6)); }
#hud .detail .cls { color: var(--amber); }
#hud .detail .nm { margin-top: 16px; }
#hud .stats { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 18px 40px; margin-top: 28px; width: 900px; }
#hud .stat { display: flex; flex-direction: column; gap: 9px; }
#hud .stat .t { display: flex; justify-content: space-between; color: var(--ink2); }
#hud .stat .b { position: relative; height: 6px; background: rgba(255,255,255,.1); }
#hud .stat .b i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); }
#hud .stat .b i.d { background: var(--amber); opacity: .9; }
#hud .atts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 18px; width: 900px; }
#hud .acol { display: flex; flex-direction: column; gap: 4px; }
#hud .acol > .k { color: var(--ink3); margin-bottom: 6px; }
#hud .att { height: 38px; padding: 0 14px; display: flex; align-items: center; cursor: pointer; color: var(--ink2); background: rgba(14,17,20,.6); border: 1px solid rgba(255,255,255,.06); transition: border-color .15s, color .15s; }
#hud .att:hover { color: var(--ink); border-color: rgba(255,255,255,.2); }
#hud .att.on { color: var(--ink); border-color: rgba(255,178,46,.55); background: linear-gradient(90deg, rgba(255,178,46,.18), rgba(14,17,20,.6)); box-shadow: inset 3px 0 0 var(--amber); }
#hud .detail .big { position: relative; width: 1100px; height: 400px; margin-top: 0; filter: none; }
#hud .gs-host { position: absolute; inset: 0; z-index: 1; }
#hud .gs-host canvas { display: block; }
#hud .gs-floor { position: absolute; left: 120px; right: 220px; bottom: 26px; height: 60px; background: radial-gradient(ellipse at center, rgba(255,178,46,.16), rgba(255,178,46,0) 70%); }
#hud .gs-fallback { position: absolute; left: 60px; top: 90px; color: var(--ink); opacity: .9; }
#hud .gs-on .gs-fallback { display: none; }

/* settings */
#hud .set { position: absolute; left: 96px; top: 150px; width: 980px; bottom: 110px; display: flex; flex-direction: column; }
#hud .set .stabs { display: flex; gap: 6px; border-bottom: 1px solid var(--line); }
#hud .set .stab { padding: 14px 22px; color: var(--ink3); cursor: pointer; position: relative; }
#hud .set .stab.on { color: var(--ink); }
#hud .set .stab.on::after { content: ''; position: absolute; left: 22px; right: 22px; bottom: -1px; height: 2px; background: var(--amber); }
#hud .set .rows { margin-top: 18px; display: flex; flex-direction: column; gap: 4px; }
#hud .opt { display: flex; align-items: center; height: 62px; padding: 0 22px; gap: 20px; background: rgba(14,17,20,.55); border: 1px solid transparent; }
#hud .opt:hover, #hud .opt.focus { border-color: rgba(255,255,255,.14); background: rgba(30,34,38,.7); }
#hud .opt .nm { flex: 1; }
#hud .opt .ctl { display: flex; align-items: center; gap: 16px; width: 420px; justify-content: flex-end; }
#hud .opt input[type=range] { -webkit-appearance: none; appearance: none; width: 300px; height: 22px; background: transparent; cursor: pointer; }
#hud .opt input[type=range]::-webkit-slider-runnable-track { height: 4px; background: linear-gradient(90deg, var(--amber) var(--p, 50%), rgba(255,255,255,.16) var(--p, 50%)); }
#hud .opt input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 22px; margin-top: -9px; background: var(--ink); box-shadow: 0 0 0 2px rgba(0,0,0,.5); }
#hud .opt input[type=range]::-moz-range-track { height: 4px; background: rgba(255,255,255,.16); }
#hud .opt input[type=range]::-moz-range-progress { height: 4px; background: var(--amber); }
#hud .opt input[type=range]::-moz-range-thumb { width: 12px; height: 22px; border: 0; border-radius: 0; background: var(--ink); }
#hud .opt .val { min-width: 64px; display: flex; justify-content: flex-end; color: var(--ink); }
#hud .seg { display: flex; gap: 4px; }
#hud .seg b { display: flex; align-items: center; justify-content: center; height: 34px; padding: 0 14px; cursor: pointer; color: var(--ink3); background: rgba(255,255,255,.05); border: 1px solid transparent; }
#hud .seg b.on { color: #121110; background: var(--amber); }
#hud .seg b:hover:not(.on) { color: var(--ink); border-color: rgba(255,255,255,.18); }
#hud .set .help { position: absolute; left: 1120px; top: 150px; width: 600px; }
#hud .set-help { position: absolute; right: 96px; top: 214px; width: 600px; padding: 26px 28px; }
#hud .set-help .d { margin-top: 16px; color: var(--ink2); font-size: 17px; line-height: 1.55; }
#hud .set-help .pv { margin-top: 26px; height: 220px; position: relative; background: radial-gradient(ellipse at center, rgba(255,255,255,.04), rgba(0,0,0,.25)); border: 1px solid var(--line); overflow: hidden; }

/* pausa */
#hud .pause .col { top: 240px; }
#hud .pause .mstat { position: absolute; right: 96px; top: 240px; width: 520px; }
#hud .kv { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; background: var(--line); }
#hud .kv > div { background: rgba(12,15,18,.88); padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
#hud .kv .k { color: var(--ink3); }

/* placar */
#hud .sb { position: absolute; left: 50%; top: 140px; width: 1240px; transform: translateX(-50%); }
#hud .sb .hdr { display: flex; align-items: flex-end; justify-content: space-between; padding-bottom: 18px; border-bottom: 2px solid var(--line); }
#hud .sb .hdr .l { display: flex; flex-direction: column; gap: 12px; }
#hud .sb .hdr .r { display: flex; align-items: center; gap: 22px; }
#hud .sb .big { display: flex; align-items: center; gap: 16px; }
#hud .sb .tm { margin-top: 26px; }
#hud .sb .tmh { display: flex; align-items: center; gap: 12px; height: 40px; padding: 0 16px; color: var(--ink); }
#hud .sb .tmh.us { background: linear-gradient(90deg, rgba(73,179,255,.32), rgba(73,179,255,.04)); box-shadow: inset 3px 0 0 var(--blue); }
#hud .sb .tmh.them { background: linear-gradient(90deg, rgba(255,61,51,.32), rgba(255,61,51,.04)); box-shadow: inset 3px 0 0 var(--red); }
#hud .sb .tmh .sc { margin-left: auto; }
#hud .sb table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0 3px; }
#hud .sb col.c0 { width: 34%; }
#hud .sb th { text-align: right; padding: 8px 16px 4px; }
#hud .sb th:first-child, #hud .sb td:first-child { text-align: left; }
#hud .sb th .ft { display: inline-block; color: var(--ink3); }
#hud .sb td { height: 42px; padding: 0 16px; text-align: right; background: rgba(12,15,18,.72); }
#hud .sb td .ft { display: inline-block; vertical-align: middle; }
#hud .sb tr.me td { background: rgba(255,178,46,.16); }
#hud .sb tr.me td:first-child { box-shadow: inset 3px 0 0 var(--amber); }
#hud .sb tr.dead td { opacity: .45; }
#hud .sb .nmc { display: flex; align-items: center; gap: 12px; }
#hud .sb .nmc .rkc { color: var(--ink2); }

/* fim de partida */
#hud .end .res { position: absolute; left: 0; right: 0; top: 150px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
#hud .end .res .w { animation: endIn 1s cubic-bezier(.16,1,.3,1) both; }
#hud .end .res .w.win { color: var(--amber); filter: drop-shadow(0 0 30px rgba(255,170,40,.35)); }
#hud .end .res .w.loss { color: var(--red2); filter: drop-shadow(0 0 30px rgba(255,60,50,.3)); }
#hud .end .res .sub { color: var(--ink2); }
@keyframes endIn { from { opacity: 0; transform: scale(1.4); letter-spacing: .3em; filter: blur(8px); } to { opacity: 1; transform: none; } }
#hud .end .grid { position: absolute; left: 50%; top: 360px; transform: translateX(-50%); width: 1240px; display: grid; grid-template-columns: 1fr 1fr; gap: 28px; }
#hud .end .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--line); }
#hud .end .tiles > div { background: rgba(12,15,18,.86); padding: 22px 22px; display: flex; flex-direction: column; gap: 14px; animation: tileIn .5s ease both; }
#hud .end .tiles .k { color: var(--ink3); }
@keyframes tileIn { from { opacity: 0; transform: translateY(10px); } }
#hud .end .medals { display: flex; flex-wrap: wrap; gap: 18px; padding: 22px; }
#hud .end .medals .md { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 92px; color: var(--amber); }
#hud .end .medals .md .c { color: var(--ink2); }
#hud .end .prog { padding: 22px; display: flex; flex-direction: column; gap: 14px; }
#hud .end .prog .xpl { display: flex; align-items: center; gap: 16px; }
#hud .end .prog .xpb { flex: 1; height: 6px; background: rgba(255,255,255,.12); position: relative; }
#hud .end .prog .xpb i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); }
#hud .end .prog .xpb i.g { background: var(--amber); }
#hud .end .acts { position: absolute; left: 50%; bottom: 122px; transform: translateX(-50%); display: flex; gap: 12px; }
#hud .end .acts .btn { width: 300px; }
`;
