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
#hud .vig-canvas { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; }
#hud .desat { position: absolute; inset: 0; opacity: 0;
  backdrop-filter: saturate(.15) contrast(1.12) brightness(.92);
  -webkit-mask-image: radial-gradient(ellipse 78% 74% at 50% 50%, transparent 42%, rgba(0,0,0,.55) 70%, #000 100%);
  mask-image: radial-gradient(ellipse 78% 74% at 50% 50%, transparent 42%, rgba(0,0,0,.55) 70%, #000 100%); }
#hud .edge { position: absolute; inset: 0; }
#hud .edge .eg { position: absolute; inset: 0; opacity: 0;
  -webkit-mask-image: radial-gradient(ellipse 64% 62% at 50% 50%, transparent 55%, #000 100%);
  mask-image: radial-gradient(ellipse 64% 62% at 50% 50%, transparent 55%, #000 100%); }
/* pulso do impacto: borda curta e quente + franja ciano deslocada (aberração cromática) */
#hud .flash { position: absolute; inset: 0; opacity: 0;
  background: radial-gradient(ellipse 70% 66% at 50% 50%, rgba(120,0,0,0) 62%, rgba(170,14,6,.34) 88%, rgba(110,0,0,.55) 100%);
  box-shadow: inset 6px 0 24px -10px rgba(40,220,255,.35), inset -6px 0 24px -10px rgba(255,40,60,.4); }
#hud .corner { position: absolute; pointer-events: none; }
#hud .corner.br { right: 0; bottom: 0; width: 760px; height: 380px; background: radial-gradient(ellipse at 100% 100%, rgba(0,0,0,.42), rgba(0,0,0,.18) 45%, transparent 70%); }
#hud .corner.bl { left: 0; bottom: 0; width: 620px; height: 260px; background: radial-gradient(ellipse at 0% 100%, rgba(0,0,0,.38), rgba(0,0,0,.14) 45%, transparent 70%); }
#hud .corner.tl { left: 0; top: 0; width: 560px; height: 760px; background: radial-gradient(ellipse at 0% 0%, rgba(0,0,0,.3), rgba(0,0,0,.1) 50%, transparent 72%); }

/* ── mira ──────────────────────────────────────────────────────────── */
#hud .cross { position: absolute; left: 960px; top: 540px; width: 0; height: 0; transition: opacity .12s; }
#hud .cross i { position: absolute; background: var(--cross); box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 0 6px rgba(0,0,0,.45); }
#hud .cross .t, #hud .cross .b { width: 3px; height: 13px; left: -1.5px; }
#hud .cross .l, #hud .cross .r { height: 3px; width: 13px; top: -1.5px; }
#hud .cross .d { width: 3px; height: 3px; left: -1.5px; top: -1.5px; }

#hud .hitm { position: absolute; left: 960px; top: 540px; width: 0; height: 0; opacity: 0; }
#hud .hitm .xs i, #hud .hitm .xo i { position: absolute; left: -1.75px; top: 0; width: 3.5px; height: 13px; background: #fff;
  box-shadow: 0 0 0 1px rgba(0,0,0,.55), 0 0 5px rgba(0,0,0,.35); transform-origin: 1.75px 0; }
#hud .hitm .xo { display: none; }
#hud .hitm.head .xs i { background: #ffd35a; box-shadow: 0 0 0 1px rgba(40,24,0,.6), 0 0 8px rgba(255,190,40,.45); }
#hud .hitm.kill .xs i { background: #ff2f24; width: 4.5px; left: -2.25px; transform-origin: 2.25px 0; height: 18px;
  box-shadow: 0 0 0 1px rgba(30,0,0,.7), 0 0 12px rgba(255,40,30,.75); }
#hud .hitm.kill .xo { display: block; }
#hud .hitm.kill .xo i { width: 2px; left: -1px; transform-origin: 1px 0; height: 7px; background: #ff7a6a; box-shadow: 0 0 6px rgba(255,40,30,.7); }
#hud .hitm.kill.head .xo i { background: #ffd35a; box-shadow: 0 0 6px rgba(255,190,40,.7); }
#hud .hitm .ring { position: absolute; left: -30px; top: -30px; width: 60px; height: 60px; border: 2.5px solid #ff3b2e; border-radius: 50%; opacity: 0;
  box-shadow: 0 0 14px rgba(255,40,30,.55), inset 0 0 10px rgba(255,40,30,.35); }
#hud .hitm.head .ring { border-color: #ffd35a; box-shadow: 0 0 14px rgba(255,190,40,.55); }

/* ── avisos centrais ──────────────────────────────────────────────── */
#hud .prompt { position: absolute; left: 0; width: 1920px; top: 700px; display: flex; justify-content: center; align-items: center; gap: 10px; color: var(--amber); opacity: 0; transition: opacity .2s; }
#hud .prompt.red { color: var(--red2); }
#hud .key { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px; border: 1.5px solid currentColor; border-radius: 3px; background: rgba(0,0,0,.5); }
/* XP: ancorado sob a mira, placa escura com bordas esfumadas, entrada com "punch" */
#hud .xp { position: absolute; left: 760px; width: 400px; top: 588px; display: flex; flex-direction: column; align-items: center; gap: 3px; opacity: 0; }
#hud .xp::before { content: ''; position: absolute; left: 30px; right: 30px; top: -6px; bottom: -8px; z-index: -1;
  background: linear-gradient(90deg, rgba(6,8,10,0), rgba(6,8,10,.8) 26%, rgba(6,8,10,.8) 74%, rgba(6,8,10,0));
  border-top: 1px solid rgba(255,201,74,.0); }
#hud .xp::after { content: ''; position: absolute; left: 110px; right: 110px; top: -6px; height: 2px; z-index: -1;
  background: linear-gradient(90deg, rgba(255,201,74,0), rgba(255,201,74,.9), rgba(255,201,74,0)); }
#hud .xp.on { opacity: 1; }
#hud .xp.on .tot { animation: xpPunch .42s cubic-bezier(.17,1.35,.35,1) both; }
#hud .xp.on .row { animation: xpIn .3s cubic-bezier(.2,.9,.25,1.15) both; }
#hud .xp.out { animation: xpOut .45s ease-in both; }
#hud .xp .tot { color: #ffc94a; filter: drop-shadow(0 2px 0 rgba(0,0,0,.85)) drop-shadow(0 0 10px rgba(0,0,0,.6)) drop-shadow(0 0 18px rgba(255,170,40,.25)); }
#hud .xp .row { display: flex; align-items: center; gap: 12px; filter: drop-shadow(0 1px 0 rgba(0,0,0,.9)) drop-shadow(0 0 4px rgba(0,0,0,.7)); }
#hud .xp .pts { color: #ffc94a; }
#hud .xp .lab { color: var(--ink); }
#hud .xp .row.bonus .lab { color: #ffe3a3; }
@keyframes xpPunch { 0% { opacity: 0; transform: scale(2.1); } 55% { opacity: 1; transform: scale(.92); } 100% { opacity: 1; transform: scale(1); } }
@keyframes xpIn { from { opacity: 0; transform: translateY(-6px) scale(1.18); } to { opacity: 1; transform: none; } }
@keyframes xpOut { to { opacity: 0; transform: translateY(-14px); } }

#hud .medal { position: absolute; left: 0; width: 1920px; top: 150px; display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; }
#hud .medal .m { display: flex; flex-direction: column; align-items: center; gap: 8px; animation: medalIn .5s cubic-bezier(.16,1.1,.3,1) both; }
#hud .medal .m.out { animation: medalOut .35s ease-in both; }
#hud .medal .m .ic { filter: drop-shadow(0 0 16px rgba(255,170,40,.35)) drop-shadow(0 3px 3px rgba(0,0,0,.7)); }
#hud .medal .m .mt { color: var(--ink); filter: drop-shadow(0 1px 0 rgba(0,0,0,.9)) drop-shadow(0 0 6px rgba(0,0,0,.6)); }
#hud .medal .m .mp { color: #ffc94a; filter: drop-shadow(0 1px 0 rgba(0,0,0,.9)); }
@keyframes medalIn { 0% { opacity: 0; transform: scale(2.2); filter: blur(6px); } 60% { opacity: 1; transform: scale(.94); filter: none; } 100% { transform: scale(1); } }
@keyframes medalOut { to { opacity: 0; transform: scale(.85) translateY(-16px); } }

#hud .banner { position: absolute; left: 0; width: 1920px; top: 300px; display: flex; flex-direction: column; align-items: center; gap: 14px; opacity: 0; }
#hud .banner.on { animation: bannerIn 4.2s ease both; }
#hud .banner .bar { width: 560px; height: 1px; background: linear-gradient(90deg, transparent, var(--amber), transparent); }
#hud .banner .sub { color: var(--ink2); font-size: 17px; letter-spacing: .14em; text-transform: uppercase; }
@keyframes bannerIn { 0% { opacity: 0; transform: translateY(14px); letter-spacing: .3em; } 10% { opacity: 1; transform: none; } 82% { opacity: 1; } 100% { opacity: 0; } }

/* ── indicadores de dano (anel de 150 px ao redor da mira) ─────────── */
#hud .dmg { position: absolute; left: 960px; top: 540px; width: 0; height: 0; }
#hud .dmg svg { position: absolute; left: -200px; top: -200px; width: 400px; height: 400px; transform-origin: 200px 200px; overflow: visible; }

/* ── bússola ──────────────────────────────────────────────────────── */
#hud .compass { position: absolute; left: 610px; top: 26px; width: 700px; height: 70px; }
#hud .compass canvas { position: absolute; left: 0; top: 0; width: 700px; height: 70px; }

/* ── minimapa + placar ─────────────────────────────────────────────── */
#hud .mm { position: absolute; left: 40px; top: 36px; width: 280px; height: 280px; }
#hud .mm canvas { position: absolute; inset: 0; width: 280px; height: 280px; }
#hud .score { position: absolute; left: 44px; top: 332px; width: 272px; }
#hud .score .top { display: flex; align-items: stretch; gap: 0; height: 36px; background: rgba(8,10,12,.74); box-shadow: inset 0 0 0 1px rgba(255,255,255,.07); }
#hud .score .timer { display: flex; align-items: center; justify-content: center; min-width: 78px; padding: 0 10px; background: rgba(0,0,0,.45); }
#hud .score .timer.low { color: var(--red2); }
#hud .score .mode { flex: 1; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; color: var(--ink); }
#hud .score .mode .obj { color: var(--ink2); }
#hud .score .rowx { position: relative; display: flex; align-items: center; height: 32px; margin-top: 4px; background: rgba(8,10,12,.66); }
#hud .score .rowx .n { width: 56px; height: 32px; display: flex; align-items: center; justify-content: center; }
#hud .score .rowx.us .n { background: linear-gradient(180deg, #3f9fe6, #2a73b3); color: #fff; }
#hud .score .rowx.them .n { background: linear-gradient(180deg, #e2463b, #a82720); color: #fff; }
#hud .score .rowx .trk { position: absolute; left: 56px; right: 0; bottom: 0; height: 4px; background: rgba(255,255,255,.08); }
#hud .score .rowx .fill { height: 100%; width: 0; transition: width .5s cubic-bezier(.2,.8,.2,1); }
#hud .score .rowx.us .fill { background: var(--blue); box-shadow: 0 0 8px rgba(73,179,255,.6); }
#hud .score .rowx.them .fill { background: var(--red); box-shadow: 0 0 8px rgba(255,61,51,.6); }
#hud .score .rowx .tag { position: relative; margin-left: 12px; color: var(--ink); }
#hud .score .rowx .goal { position: absolute; right: 10px; top: 9px; color: var(--ink2); }

/* ── feed de abates: placa escura, faixa de destaque, ícone por arma ── */
#hud .feed { position: absolute; left: 44px; top: 452px; width: 560px; display: flex; flex-direction: column; gap: 3px; }
#hud .feed .k { position: relative; display: flex; align-items: center; gap: 12px; height: 32px; padding: 0 16px 0 14px; width: max-content;
  background: linear-gradient(90deg, rgba(7,9,11,.84), rgba(7,9,11,.74) 80%, rgba(7,9,11,.5)); box-shadow: inset 0 0 0 1px rgba(255,255,255,.05);
  animation: feedIn .32s cubic-bezier(.2,.9,.3,1) both; }
#hud .feed .k::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: rgba(255,255,255,.25); }
#hud .feed .k.mine::before { background: var(--amber); box-shadow: 0 0 8px rgba(255,178,46,.6); }
#hud .feed .k.died::before { background: #ff4a3d; }
#hud .feed .k.mine { background: linear-gradient(90deg, rgba(60,44,14,.86), rgba(9,10,11,.78) 70%, rgba(9,10,11,.55)); }
#hud .feed .k.out { animation: feedOut .5s ease-in both; }
#hud .feed .k .self { color: #ffd166; }
#hud .feed .k .foe { color: #ff7d70; }
#hud .feed .k .ally { color: var(--blue); }
#hud .feed .k .kw { color: #e9ece6; display: flex; align-items: center; filter: drop-shadow(0 1px 0 rgba(0,0,0,.8)); }
#hud .feed .k .kw img { filter: brightness(1.05); }
#hud .feed .k .hs { display: flex; align-items: center; justify-content: center; width: 24px; height: 22px; margin-left: -4px; color: #fff;
  background: #c4271d; clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%); }
@keyframes feedIn { from { opacity: 0; transform: translateX(-24px); clip-path: inset(0 100% 0 0); } to { opacity: 1; transform: none; clip-path: inset(0 0 0 0); } }
@keyframes feedOut { to { opacity: 0; transform: translateX(-12px); } }

/* ── painel da arma ────────────────────────────────────────────────── */
#hud .wpn { position: absolute; right: 52px; bottom: 46px; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; padding: 14px 18px 12px 26px; }
#hud .wpn .plate { position: absolute; inset: 0; z-index: -1;
  background: radial-gradient(ellipse 100% 100% at 100% 100%, rgba(7,9,11,.7), rgba(7,9,11,.5) 45%, rgba(7,9,11,0) 75%); }
#hud .wpn .plate { left: -60px; top: -40px; right: -52px; bottom: -46px; }
#hud .wpn .head { display: flex; align-items: center; gap: 10px; color: var(--ink); filter: drop-shadow(0 1px 1px rgba(0,0,0,.8)); }
#hud .wpn .mode { display: flex; align-items: center; height: 22px; padding: 0 7px; background: rgba(242,244,239,.12); color: var(--ink2); }
#hud .wpn .main { display: flex; align-items: center; gap: 22px; }
#hud .wpn .gun { opacity: .96; filter: drop-shadow(0 2px 3px rgba(0,0,0,.6)); }
#hud .wpn .count { display: flex; align-items: flex-end; gap: 8px; min-width: 120px; justify-content: flex-end; filter: drop-shadow(0 2px 0 rgba(0,0,0,.6)) drop-shadow(0 0 8px rgba(0,0,0,.4)); }
#hud .wpn .count .mag { color: #fff; transition: color .2s; }
#hud .wpn .count .mag.low { color: #ffbf3c; }
#hud .wpn .count .mag.empty { color: var(--red2); }
#hud .wpn .count .res { display: flex; align-items: flex-end; gap: 6px; padding-bottom: 2px; color: var(--ink2); }
#hud .wpn .count .res .rl { color: var(--ink3); }
#hud .wpn .ticks { display: flex; gap: 2px; height: 12px; margin-top: 4px; }
#hud .wpn .ticks i { width: 5px; height: 12px; background: #f2f4ef; box-shadow: 0 0 0 1px rgba(0,0,0,.45); transition: opacity .12s, background .15s; }
#hud .wpn .ticks i.g { margin-left: 5px; }
#hud .wpn .ticks i.s { opacity: .16; }
#hud .wpn .ticks.low i { background: #ffbf3c; }
#hud .wpn .ticks.empty i { background: var(--red2); }
#hud .wpn .reload { width: 100%; height: 3px; background: rgba(255,255,255,.12); opacity: 0; transition: opacity .15s; }
#hud .wpn .reload i { display: block; height: 100%; width: 0; background: var(--amber); }
#hud .wpn .state { position: absolute; right: 18px; top: -16px; height: 22px; padding: 0 8px; display: none; align-items: center; }
#hud .wpn .state.low { display: flex; color: #121110; background: #ffbf3c; }
#hud .wpn .state.empty, #hud .wpn .state.noammo { display: flex; color: #fff; background: #d8342a; }
#hud .wpn .state.reloading { display: flex; color: var(--amber); background: rgba(0,0,0,.6); }
#hud .wpn.is-low .gun img { filter: sepia(1) saturate(4) hue-rotate(-12deg) brightness(1.05); }
#hud .equip { position: absolute; right: 56px; bottom: 214px; display: flex; gap: 14px; }
#hud .equip .e { position: relative; display: flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px 0 8px; color: var(--ink);
  background: linear-gradient(270deg, rgba(7,9,11,.72), rgba(7,9,11,.5)); }
#hud .equip .e .kb { position: absolute; top: -10px; left: -8px; }
#hud .equip .e .kb .key { min-width: 22px; height: 22px; padding: 0 4px; border-width: 1px; background: rgba(0,0,0,.8); color: var(--ink); }

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
#hud .card { margin-left: auto; display: flex; align-items: center; gap: 8px; }
#hud .card .pc { position: relative; display: flex; align-items: center; gap: 12px; width: 400px; height: 64px; padding: 0 14px 0 8px; background-size: cover; background-position: center;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.14); }
#hud .card .pc::before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(6,8,10,.25), rgba(6,8,10,.05) 50%, rgba(6,8,10,.55)); }
#hud .card .pc > * { position: relative; }
#hud .card .em { display: flex; filter: drop-shadow(0 2px 3px rgba(0,0,0,.7)); }
#hud .card .meta { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; filter: drop-shadow(0 1px 1px rgba(0,0,0,.9)); }
#hud .card .xpb { width: 170px; height: 4px; background: rgba(0,0,0,.45); }
#hud .card .xpb i { display: block; height: 100%; background: var(--amber); }
#hud .card .lvl { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; width: 64px; height: 64px; border: 1px solid var(--line); background: rgba(8,10,12,.8); }
#hud .card .lvl .rk { color: var(--amber); display: flex; }

#hud .col { position: absolute; left: 96px; top: 168px; width: 640px; display: flex; flex-direction: column; }
#hud .eyebrow { display: flex; align-items: center; gap: 12px; color: var(--amber); }
#hud .eyebrow::before { content: ''; width: 28px; height: 2px; background: var(--amber); }
#hud .title { margin-top: 20px; color: var(--ink); }
#hud .desc { margin-top: 20px; max-width: 540px; color: rgba(242,244,239,.82); font-size: 19px; line-height: 1.5; letter-spacing: .01em; text-shadow: 0 1px 2px rgba(0,0,0,.8); }
#hud .facts { display: flex; gap: 34px; margin-top: 26px; padding: 16px 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
#hud .facts .f { display: flex; flex-direction: column; gap: 10px; }
#hud .facts .f .k { color: var(--ink2); }
#hud .btns { display: flex; flex-direction: column; gap: 8px; margin-top: 34px; width: 460px; }
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

#hud .side { position: absolute; right: 96px; top: 168px; width: 450px; display: flex; flex-direction: column; gap: 12px; }
#hud .panel { background: linear-gradient(180deg, rgba(10,13,16,.93), rgba(10,13,16,.86)); border: 1px solid rgba(255,255,255,.09); box-shadow: 0 18px 40px rgba(0,0,0,.35); }
#hud .panel .ph { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--line); color: var(--ink);
  background: linear-gradient(90deg, rgba(255,178,46,.1), rgba(255,178,46,0) 60%); box-shadow: inset 3px 0 0 var(--amber); }
#hud .panel .ph .r { color: var(--ink2); }
#hud .chal { display: flex; align-items: center; gap: 14px; padding: 14px 20px; }
#hud .chal + .chal { border-top: 1px solid rgba(255,255,255,.06); }
#hud .chal .ic { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; flex: none; }
#hud .chal .tx { flex: 1; display: flex; flex-direction: column; gap: 8px; }
#hud .chal .tx .d { color: var(--ink); }
#hud .chal .tx .x { color: var(--amber); }
#hud .chal .pb { height: 5px; background: rgba(255,255,255,.12); }
#hud .chal .pb i { display: block; height: 100%; background: linear-gradient(90deg, #d88a12, var(--amber)); box-shadow: 0 0 8px rgba(255,178,46,.45); }
#hud .chal .v { color: var(--ink); }
#hud .bp .bpb { padding: 14px 20px 16px; display: flex; flex-direction: column; gap: 14px; }
#hud .bp .pips { display: flex; gap: 4px; }
#hud .bp .pips i { flex: 1; height: 8px; background: rgba(255,255,255,.1); transform: skewX(-20deg); }
#hud .bp .pips i.on { background: var(--amber); box-shadow: 0 0 6px rgba(255,178,46,.45); }
#hud .bp .pips i.cur { background: linear-gradient(90deg, var(--amber) 55%, rgba(255,255,255,.14) 55%); }
#hud .bp .rw { display: flex; align-items: center; gap: 14px; }
#hud .bp .rw .cc { width: 168px; height: 42px; background-size: cover; background-position: center; box-shadow: 0 0 0 1px rgba(255,255,255,.2); }
#hud .bp .rw .rt { display: flex; flex-direction: column; gap: 8px; color: var(--ink); }
#hud .bp .rw .rt > .ft:first-child { color: var(--ink2); }
/* herói do menu */
#hud .hero-host { position: absolute; left: 620px; top: 0; width: 900px; height: 1080px; }
#hud .hero-host canvas { display: block; }
#hud .hero-glow { position: absolute; left: 700px; top: 80px; width: 760px; height: 900px; background:
  radial-gradient(ellipse 40% 46% at 50% 44%, rgba(255,170,80,.20), rgba(255,170,80,0) 70%),
  radial-gradient(ellipse 30% 60% at 30% 40%, rgba(110,170,255,.14), rgba(110,170,255,0) 70%); }
#hud .hero-floor { position: absolute; left: 850px; top: 930px; width: 460px; height: 70px; background: radial-gradient(ellipse at center, rgba(0,0,0,.65), rgba(0,0,0,0) 70%); }
#hud .shade-hero { position: absolute; left: 0; right: 0; bottom: 0; height: 200px; background: linear-gradient(0deg, rgba(4,6,8,.85), rgba(4,6,8,0)); }
#hud .opname { position: absolute; left: 1250px; top: 852px; display: flex; flex-direction: column; gap: 8px; padding-left: 14px; border-left: 2px solid var(--amber); }
#hud .opname .l1 { color: var(--amber); }
#hud .opname .l2 { color: var(--ink2); }
#hud .feat { position: absolute; left: 96px; top: 806px; display: flex; gap: 12px; }
#hud .feat .tile { position: relative; width: 300px; height: 150px; background: rgba(10,13,16,.9) center/cover; border: 1px solid rgba(255,255,255,.1); overflow: hidden; }
#hud .feat .tile .tg { position: absolute; left: 0; top: 0; padding: 6px 10px; background: var(--amber); color: #121110; }
#hud .feat .tile.ev::after { content: ''; position: absolute; inset: 0; background: linear-gradient(0deg, rgba(6,8,10,.85), rgba(6,8,10,0) 60%); }
#hud .feat .tile.ev .pr { position: absolute; left: 14px; right: 100px; bottom: 18px; height: 5px; background: rgba(255,255,255,.18); z-index: 1; }
#hud .feat .tile.ev .pr i { display: block; height: 100%; background: var(--amber); }
#hud .feat .tile.ev .pv { position: absolute; right: 14px; bottom: 12px; z-index: 1; color: var(--ink); }
#hud .feat .tile.wk { background: linear-gradient(135deg, rgba(30,36,42,.95), rgba(10,13,16,.95)); }
#hud .feat .tile.wk .tg { background: rgba(242,244,239,.12); color: var(--ink); }
#hud .feat .tile.wk .wimg { position: absolute; left: 22px; top: 42px; filter: drop-shadow(0 6px 10px rgba(0,0,0,.6)); }
#hud .feat .tile.wk .wn { position: absolute; left: 16px; bottom: 14px; right: 14px; display: flex; align-items: center; justify-content: space-between; }
#hud .feat .tile.wk .wn span { color: var(--amber); }

#hud .foot { position: absolute; left: 96px; right: 96px; bottom: 40px; display: flex; align-items: center; gap: 28px; color: var(--ink2); }
#hud .foot .h { display: flex; align-items: center; gap: 9px; }
#hud .foot .ver { margin-left: auto; color: var(--ink2); }
#hud .foot .key, #hud .btn .key { min-width: 28px; height: 28px; border-width: 1px; }

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
#hud .kv > div { background: rgba(10,13,16,.92); padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
#hud .kv .k { color: var(--ink2); }

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

/* fim de partida: relatório pós-ação */
#hud .aar-grade { position: absolute; inset: 0; background:
  radial-gradient(ellipse 60% 50% at 25% 30%, rgba(60,110,170,.18), rgba(0,0,0,0) 70%),
  radial-gradient(ellipse 60% 50% at 80% 70%, rgba(190,90,30,.14), rgba(0,0,0,0) 70%),
  linear-gradient(180deg, rgba(0,0,0,.35), rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,.5)); }
#hud .aar-top { position: absolute; left: 96px; right: 96px; top: 30px; height: 74px; display: flex; align-items: center; }
#hud .aar-top .ttl { display: flex; flex-direction: column; gap: 10px; color: var(--ink); }
#hud .aar-top .ttl > .ft:first-child { color: var(--ink2); }
#hud .aar-top .atabs { position: absolute; left: 50%; transform: translateX(-50%); top: 22px; display: flex; gap: 34px; color: var(--ink2); }
#hud .aar-top .atabs span { position: relative; padding-bottom: 10px; }
#hud .aar-top .atabs span.on { color: var(--ink); }
#hud .aar-top .atabs span.on::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--amber); box-shadow: 0 0 10px rgba(255,178,46,.6); }
#hud .aar-top .res { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
#hud .aar-top .res.win { color: var(--amber); filter: drop-shadow(0 0 18px rgba(255,170,40,.35)); }
#hud .aar-top .res.loss { color: var(--red2); }
#hud .aar-top .res span { color: var(--ink2); }
#hud .aar-teams { position: absolute; left: 96px; right: 96px; top: 166px; height: 90px; display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(90deg, rgba(40,110,180,.32), rgba(10,13,16,.6) 30%, rgba(10,13,16,.6) 70%, rgba(190,40,30,.3)); border-top: 1px solid rgba(255,255,255,.08); border-bottom: 1px solid rgba(255,255,255,.08); }
#hud .aar-teams .tm { display: flex; align-items: center; gap: 18px; padding: 0 22px; color: var(--ink); }
#hud .aar-teams .vs { position: absolute; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 22px; }
#hud .aar-teams .vs .a { color: #5cb9ff; filter: drop-shadow(0 0 12px rgba(73,179,255,.4)); }
#hud .aar-teams .vs .b { color: #ff5a4c; filter: drop-shadow(0 0 12px rgba(255,61,51,.4)); }
#hud .aar-teams .vs .sk { color: var(--ink); display: flex; }
#hud .aar-body { position: absolute; left: 96px; right: 96px; top: 276px; bottom: 40px; display: grid; grid-template-columns: 1fr 520px; gap: 20px; }
#hud .aar-body .lcol { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
#hud .stand table { width: 100%; border-collapse: collapse; table-layout: fixed; }
#hud .stand th { height: 40px; padding: 0 14px; text-align: right; color: var(--ink2); border-bottom: 1px solid var(--line); background: rgba(255,255,255,.03); }
#hud .stand th .ft, #hud .stand td .ft { display: inline-block; vertical-align: middle; }
#hud .stand td { height: 52px; padding: 0 14px; text-align: right; color: var(--ink); border-bottom: 1px solid rgba(255,255,255,.05); }
#hud .stand .c-r { width: 56px; text-align: center; }
#hud .stand .c-l { width: 108px; text-align: left; }
#hud .stand .c-n { width: 34%; text-align: left; }
#hud .stand td.c-l { display: table-cell; }
#hud .stand td.c-l .lb { display: inline-block; vertical-align: middle; margin-right: 8px; }
#hud .stand td.c-n .tm-r { display: inline-block; vertical-align: middle; margin-left: 12px; color: #ff7d70; opacity: .8; }
#hud .stand tr.me td { background: linear-gradient(90deg, rgba(255,178,46,.26), rgba(255,178,46,.08)); color: #fff; }
#hud .stand tr.me td:first-child { box-shadow: inset 4px 0 0 var(--amber); }
#hud .stand tbody tr:not(.me):nth-child(even) td { background: rgba(255,255,255,.025); }
#hud .me-strip { display: flex; gap: 16px; flex: 1; min-height: 0; }
#hud .me-strip .pcard { position: relative; width: 400px; flex: none; background: rgba(10,13,16,.9); border: 1px solid rgba(255,255,255,.1); overflow: hidden; }
#hud .me-strip .pcard .cc { height: 100px; background-size: cover; background-position: center; }
#hud .me-strip .pcard .pi { display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
#hud .me-strip .pcard .pl { display: flex; align-items: center; gap: 8px; margin-top: 8px; color: var(--amber); }
#hud .me-strip .tiles { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); gap: 1px; background: var(--line); border: 1px solid rgba(255,255,255,.08); }
#hud .me-strip .tiles > div { background: rgba(10,13,16,.9); padding: 22px 18px; display: flex; flex-direction: column; justify-content: center; gap: 16px; animation: tileIn .5s ease both; }
#hud .me-strip .tiles .k { color: var(--ink2); }
@keyframes tileIn { from { opacity: 0; transform: translateY(10px); } }
#hud .rcol { display: flex; flex-direction: column; gap: 12px; }
#hud .nem { position: relative; overflow: hidden; }
#hud .nem .nh { padding: 9px 18px; color: #fff; background: linear-gradient(90deg, #b8261c, rgba(184,38,28,.2)); }
#hud .nem .nb { display: flex; align-items: center; gap: 16px; padding: 14px 18px; }
#hud .nem .nn { display: flex; flex-direction: column; gap: 8px; flex: 1; color: var(--ink); }
#hud .nem .nn > .ft:last-child { color: var(--ink2); }
#hud .nem .nk { display: flex; gap: 22px; }
#hud .nem .nk > div { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
#hud .nem .nk .k { color: var(--ink2); }
#hud .wst .wtop { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px 6px; color: var(--ink); }
#hud .wst .wimg { filter: drop-shadow(0 6px 10px rgba(0,0,0,.6)); }
#hud .wst .wb { display: grid; grid-template-columns: 130px 1fr 80px; align-items: center; gap: 14px; padding: 6px 20px; }
#hud .wst .wb:last-child { padding-bottom: 14px; }
#hud .wst .wb .k { color: var(--ink2); }
#hud .wst .wb .b { height: 5px; background: rgba(255,255,255,.1); }
#hud .wst .wb .b i { display: block; height: 100%; background: linear-gradient(90deg, #c9c9c2, #fff); }
#hud .wst .wb > .ft:last-child { justify-self: end; }
#hud .md .medals { display: flex; gap: 6px; padding: 12px 14px; justify-content: space-between; }
#hud .md .mdl { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 112px; color: var(--ink); }
#hud .md .mdl .c { color: var(--amber); }
#hud .prog { padding: 14px 18px; }
#hud .prog .xpl { display: flex; align-items: center; gap: 14px; }
#hud .prog .xx { flex: 1; display: flex; flex-direction: column; gap: 10px; }
#hud .prog .xr { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; color: var(--ink2); }
#hud .prog .xpb { height: 6px; background: rgba(255,255,255,.12); position: relative; }
#hud .prog .xpb i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--ink); }
#hud .prog .xpb i.g { background: var(--amber); box-shadow: 0 0 8px rgba(255,178,46,.5); }
#hud .end .acts { display: flex; gap: 12px; align-items: center; flex: none; }
#hud .end .acts .btn { width: 300px; height: 64px; }
#hud .end .acts .nxt { margin-left: auto; display: flex; align-items: center; gap: 14px; color: var(--ink2); padding: 0 18px; height: 64px; background: rgba(10,13,16,.7); border: 1px solid rgba(255,255,255,.08); }
#hud .end .acts .nxt > .ft:last-child { color: var(--ink); }
#hud .me-strip .pcard .xpbk { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--line); border-top: 1px solid var(--line); }
#hud .me-strip .pcard .xpbk > div { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: rgba(10,13,16,.95); color: var(--ink2); }
#hud .me-strip .pcard .xpbk span { color: var(--amber); }
`;
