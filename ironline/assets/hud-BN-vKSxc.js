import{i as e}from"./three-x7LA3FKe.js";var t=`
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
`,n={0:[6,`M1.6,0 H4.4 L6,1.6 V8.4 L4.4,10 H1.6 L0,8.4 V1.6 Z`],1:[6,`M1.2,2.4 L3.8,0 V10`],2:[6,`M0,1.6 L1.6,0 H4.4 L6,1.6 V3.9 L0,10 H6`],3:[6,`M0.2,0 H5.8 L2.6,4.2 H4.4 L6,5.8 V8.4 L4.4,10 H1.6 L0,8.4`],4:[6,`M4.5,10 V0 L0,7.1 H6`],5:[6,`M5.8,0 H0.7 L0.4,4.6 H4.4 L6,6.2 V8.4 L4.4,10 H1.6 L0,8.4`],6:[6,`M4.4,0 L0,6.2 V8.4 L1.6,10 H4.4 L6,8.4 V6.2 L4.4,4.6 H1.15`],7:[6,`M0,0 H6 V1.2 L2.2,10`],8:[6,`M1.4,0 H4.6 L5.6,1 V3.6 L4.6,4.6 H1.4 L0.4,3.6 V1 Z M1.4,4.6 L0,6 V8.4 L1.6,10 H4.4 L6,8.4 V6 L4.6,4.6`],9:[6,`M1.6,10 L6,3.8 V1.6 L4.4,0 H1.6 L0,1.6 V3.8 L1.6,5.4 H4.85`],A:[6,`M0,10 V2 L2,0 H4 L6,2 V10 M0,5.8 H6`],B:[6,`M0,10 V0 H4.2 L5.6,1.4 V3.4 L4.4,4.6 H0 M4.4,4.6 L6,6.2 V8.6 L4.6,10 H0`],C:[6,`M6,1.6 L4.4,0 H1.6 L0,1.6 V8.4 L1.6,10 H4.4 L6,8.4`],D:[6,`M0,0 H4 L6,2 V8 L4,10 H0 Z`],E:[5.6,`M5.6,0 H0 V10 H5.6 M0,4.8 H4.4`],F:[5.6,`M5.6,0 H0 V10 M0,4.8 H4.4`],G:[6,`M6,1.6 L4.4,0 H1.6 L0,1.6 V8.4 L1.6,10 H4.4 L6,8.4 V5.4 H3.4`],H:[6,`M0,0 V10 M6,0 V10 M0,4.8 H6`],I:[1.2,`M0.6,0 V10`],J:[5.6,`M5.6,0 V8.4 L4,10 H1.6 L0,8.4 V7.2`],K:[6,`M0,0 V10 M5.8,0 L0,6.2 M2.3,3.8 L6,10`],L:[5.4,`M0,0 V10 H5.4`],M:[7.4,`M0,10 V0 L3.7,6.2 L7.4,0 V10`],N:[6,`M0,10 V0 L6,10 V0`],O:[6,`M1.6,0 H4.4 L6,1.6 V8.4 L4.4,10 H1.6 L0,8.4 V1.6 Z`],P:[6,`M0,10 V0 H4.4 L6,1.6 V4.2 L4.4,5.8 H0`],Q:[6,`M1.6,0 H4.4 L6,1.6 V8.4 L4.4,10 H1.6 L0,8.4 V1.6 Z M3.6,7.6 L6.2,10.4`],R:[6,`M0,10 V0 H4.4 L6,1.6 V4.2 L4.4,5.8 H0 M3.4,5.8 L6,10`],S:[6,`M6,1.4 L4.6,0 H1.4 L0,1.4 V3.6 L1.2,4.8 H4.8 L6,6 V8.6 L4.6,10 H1.4 L0,8.6`],T:[6.2,`M0,0 H6.2 M3.1,0 V10`],U:[6,`M0,0 V8.4 L1.6,10 H4.4 L6,8.4 V0`],V:[6.4,`M0,0 L3.2,10 L6.4,0`],W:[8,`M0,0 L1.9,10 L4,2.4 L6.1,10 L8,0`],X:[6,`M0,0 L6,10 M6,0 L0,10`],Y:[6.2,`M0,0 L3.1,5.2 L6.2,0 M3.1,5.2 V10`],Z:[6,`M0,0 H6 L0,10 H6`]," ":[3.2,``],".":[1,`M0.5,9.6 V10`],",":[1.4,`M1,9.4 L0.3,11.4`],":":[1,`M0.5,2.6 V3 M0.5,9.6 V10`],"/":[4,`M0,10.4 L4,-0.4`],"-":[3.8,`M0,5.4 H3.8`],"+":[5.2,`M0,5.2 H5.2 M2.6,2.6 V7.8`],"%":[7.6,`M0.6,10 L7,0 M0,0 H2.4 V3 H0 Z M5.2,7 H7.6 V10 H5.2 Z`],"!":[1,`M0.5,0 V6.8 M0.5,9.6 V10`],"?":[5.6,`M0,1.4 L1.4,0 H4.2 L5.6,1.4 V3.4 L2.8,5.6 V7 M2.8,9.6 V10`],"'":[1,`M0.5,0 V2.6`],"°":[2.6,`M0,0 H2.2 V2.2 H0 Z`],"#":[6.4,`M2,0 L1.2,10 M5.2,0 L4.4,10 M0,3.4 H6.4 M0,6.6 H6.4`],"×":[4.4,`M0,2.8 L4.4,7.2 M4.4,2.8 L0,7.2`],"(":[2.4,`M2.4,-0.4 L0.6,1.6 V8.4 L2.4,10.4`],")":[2.4,`M0,-0.4 L1.8,1.6 V8.4 L0,10.4`],"[":[2.2,`M2.2,-0.4 H0 V10.4 H2.2`],"]":[2.2,`M0,-0.4 H2.2 V10.4 H0`],"|":[1,`M0.5,-0.6 V10.6`],"<":[4.4,`M4.4,1.4 L0,5 L4.4,8.6`],">":[4.4,`M0,1.4 L4.4,5 L0,8.6`],_:[6,`M0,10.4 H6`],"&":[6.6,`M6.6,10 L1,3.4 V1.2 L2.2,0 H4 L5.2,1.2 V2.8 L0,6.6 V8.8 L1.2,10 H3.8 L6.4,6.6`],"•":[2.4,`M0.4,4.4 H2 V6 H0.4 Z`],"·":[1.4,`M0.7,5 V5.4`],"—":[7,`M0,5.4 H7`]};function r(e){let t=[],n=null,r=0,i=0,a=e.match(/[MLHVZ]|-?\d*\.?\d+/g)||[],o=0,s=`M`,c=()=>parseFloat(a[o++]);for(;o<a.length;)/[MLHVZ]/.test(a[o])&&(s=a[o++]),s===`M`?(r=c(),i=c(),n=[[r,i]],t.push(n),s=`L`):s===`L`?(r=c(),i=c(),n.push([r,i])):s===`H`?(r=c(),n.push([r,i])):s===`V`?(i=c(),n.push([r,i])):s===`Z`&&(n.closed=!0);return t}var i={};for(let[e,[t,a]]of Object.entries(n))i[e]={w:t,lines:r(a)};var a=i[`?`],o=e=>i[e]||i[e.toUpperCase()]||a;function s(e,t=1.7){let n=0,r=String(e);for(let e=0;e<r.length;e++)n+=o(r[e]).w+(e<r.length-1?t:0);return n}function c(e,t=1.7,n=0){let r=n,i=``;for(let n of String(e)){let e=o(n);for(let t of e.lines){i+=`M${l(t[0][0]+r)},${l(t[0][1])}`;for(let e=1;e<t.length;e++)i+=`L${l(t[e][0]+r)},${l(t[e][1])}`;t.closed&&(i+=`Z`)}r+=e.w+t}return i}var l=e=>Math.round(e*100)/100;function u(e,{size:t=14,weight:n=1.05,tracking:r=1.7,cls:i=``,fill:a=`currentColor`}={}){let o=String(e).toUpperCase(),u=n,f=s(o,r)+u*2,p=10+u*2,m=t/10;return`<svg class="ft ${i}" width="${l(f*m)}" height="${l(p*m)}" viewBox="${-u} ${-u} ${l(f)} ${l(p)}" aria-label="${d(o)}"><path d="${c(o,r)}" fill="none" stroke="${a}" stroke-width="${n}" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="3"/></svg>`}var d=e=>e.replace(/[&<>"]/g,e=>({"&":`&amp;`,"<":`&lt;`,">":`&gt;`,'"':`&quot;`})[e]);function f(e,t,n,r,{size:i=12,weight:a=1.05,tracking:c=1.7,align:l=`left`,color:u=`#fff`}={}){let d=String(t).toUpperCase(),f=i/10,p=s(d,c)*f,m=n;l===`center`?m-=p/2:l===`right`&&(m-=p),e.save(),e.translate(m,r),e.scale(f,f),e.lineWidth=a,e.lineCap=`square`,e.lineJoin=`miter`,e.miterLimit=3,e.strokeStyle=u,e.beginPath();let h=0;for(let t of d){let n=o(t);for(let t of n.lines){e.moveTo(t[0][0]+h,t[0][1]);for(let n=1;n<t.length;n++)e.lineTo(t[n][0]+h,t[n][1]);t.closed&&e.closePath()}h+=n.w+c}return e.stroke(),e.restore(),p}var p=`M0,13 L3,11.5 L22,12.4 L26,10.4 L36.5,10.4 L37.5,7.4 L40,5.4 L56.5,5.4 L58.5,7.4 L58.5,10.4 L84,10.4 L84,11.4 L104,11.4 L104,13.4 L113,13.4 L113,12.4 L121.5,12.4 L121.5,16.6 L113,16.6 L113,15.6 L104,15.6 L104,19.2 L70,19.2 L66.5,19.2 L69.5,30.8 L61,33 L56.8,20.2 L52,20.2 L52,23.5 L46,23.5 L44.5,31.2 L38.6,30.6 L41.2,20.2 L30,19.6 L26,17.8 L21.5,17.2 L6,21.8 L0,21.8 Z`,m=`M87,14 H91 V16.4 H87 Z M93,14 H97 V16.4 H93 Z M99,14 H102 V16.4 H99 Z M62,12.6 H74 V14.6 H62 Z M41.5,7.8 H55.5 V9 H41.5 Z M8,15 H19 V16.4 H8 Z`;function h(e=``,t=122){return`<svg class="${e}" width="${t}" height="${(t*34/122).toFixed(1)}" viewBox="0 0 122 34"><path d="${p} ${m}" fill="currentColor" fill-rule="evenodd"/></svg>`}function g(e=``,t=60){return`<svg class="${e}" width="${t}" height="${(t*40/60).toFixed(1)}" viewBox="0 0 60 40"><path d="M2,4 H56 L58,6 V14 H33 V21 H25 L22,15 L19,36 H8 L11.5,16 L6,14 H2 Z M28,15 H31 V18.5 H28.5 Z" fill="currentColor" fill-rule="evenodd"/></svg>`}function _(e=``,t=26){return`<svg class="${e}" width="${t}" height="${t}" viewBox="0 0 26 26"><path d="M9,3 H15 V6 H9 Z M15,3.5 L21,2 L22.5,3.4 L17,7.6 Z" fill="currentColor"/><path d="M12,6.5 C17.5,6.5 20.5,10.4 20.5,15.6 C20.5,21 17,24.5 12,24.5 C7,24.5 3.5,21 3.5,15.6 C3.5,10.4 6.5,6.5 12,6.5 Z M6,13.6 H18 M6,18.2 H18 M10,8 V24 M14,8 V24" fill="currentColor" stroke="#0006" stroke-width="1.1"/></svg>`}function v(e=``,t=26){return`<svg class="${e}" width="${t}" height="${t}" viewBox="0 0 26 26"><path d="M8,3 H16 V5.5 H8 Z M16,3.4 L21.5,2.2 L22.6,3.6 L17.6,6.4 Z M7,6.5 H17 L18,8 V23 L17,24.5 H7 L6,23 V8 Z" fill="currentColor"/><path d="M6.5,11 H17.5 M6.5,19 H17.5 M9,13.5 H15 V16.5 H9 Z" stroke="#0007" stroke-width="1.2" fill="none"/></svg>`}function y(e=``,t=18){return`<svg class="${e}" width="${t}" height="${t}" viewBox="0 0 20 20"><path d="M10,2.5 C13.6,2.5 15.6,5 15.6,8.2 C15.6,10.4 14.6,12 13.4,12.8 V15.5 H6.6 V12.8 C5.4,12 4.4,10.4 4.4,8.2 C4.4,5 6.4,2.5 10,2.5 Z" fill="currentColor"/><circle cx="10" cy="8.2" r="2.4" fill="none" stroke="#000a" stroke-width="1.3"/><path d="M10,4.5 V6 M10,10.4 V11.9 M6.3,8.2 H7.8 M12.2,8.2 H13.7" stroke="#000a" stroke-width="1.1"/></svg>`}function b(e=``,t=18){return`<svg class="${e}" width="${t}" height="${t}" viewBox="0 0 20 20"><path d="M10,1.6 C14.6,1.6 17.4,4.6 17.4,8.6 C17.4,11 16.4,12.4 15,13.2 V16 H12.6 V17.6 H7.4 V16 H5 V13.2 C3.6,12.4 2.6,11 2.6,8.6 C2.6,4.6 5.4,1.6 10,1.6 Z M6,8.2 L8.6,8.6 L8.2,11.4 L5.6,10.8 Z M14,8.2 L11.4,8.6 L11.8,11.4 L14.4,10.8 Z M10,11.6 L11.2,13.6 H8.8 Z M8.6,15.4 V17.4 M11.4,15.4 V17.4" fill="currentColor" fill-rule="evenodd"/></svg>`}function x(e=``,t=34){return`<svg class="${e}" width="${t}" height="${t*12/34}" viewBox="0 0 34 12"><path d="M0,4 H12 V3 H14 V9 H12 V8 H0 Z M14,4.5 H28 L34,6 L28,8 H14 Z" fill="currentColor"/></svg>`}function S(e,t=``,n=34){let r=1+e%3,i=``;for(let e=0;e<r;e++)i+=`<path d="M9,${21-e*5} L17,${16-e*5} L25,${21-e*5}" fill="none" stroke="#0b0d0e" stroke-width="2.6" stroke-linejoin="miter"/>`;return`<svg class="${t}" width="${n}" height="${n}" viewBox="0 0 34 34"><path d="M17,1.5 L31,7 V18 C31,25 25,30.5 17,32.5 C9,30.5 3,25 3,18 V7 Z" fill="currentColor"/><path d="M17,4 L28.6,8.6 V18 C28.6,23.8 23.8,28.4 17,30.2 C10.2,28.4 5.4,23.8 5.4,18 V8.6 Z" fill="none" stroke="#0b0d0e55" stroke-width="1"/>${i}</svg>`}function C(e,t=64){return`<svg width="${t}" height="${t}" viewBox="0 0 64 64"><path d="M32,2 L58,17 V47 L32,62 L6,47 V17 Z" fill="currentColor"/><path d="M32,7.5 L53.2,19.8 V44.2 L32,56.5 L10.8,44.2 V19.8 Z" fill="none" stroke="#0d0f1066" stroke-width="1.4"/>${{kill:`<path d="M32,18 L36,28 H47 L38,34.5 L41.5,45 L32,38.6 L22.5,45 L26,34.5 L17,28 H28 Z" fill="#0d0f10"/>`,head:`<circle cx="32" cy="32" r="9" fill="none" stroke="#0d0f10" stroke-width="3.2"/><path d="M32,17 V25 M32,39 V47 M17,32 H25 M39,32 H47" stroke="#0d0f10" stroke-width="3.2"/>`,double:`<path d="M20,40 L32,28 L44,40 M20,31 L32,19 L44,31" fill="none" stroke="#0d0f10" stroke-width="4"/>`,triple:`<path d="M20,44 L32,34 L44,44 M20,36 L32,26 L44,36 M20,28 L32,18 L44,28" fill="none" stroke="#0d0f10" stroke-width="3.4"/>`,long:`<path d="M16,32 H48 M40,24 L48,32 L40,40" fill="none" stroke="#0d0f10" stroke-width="3.6"/><circle cx="20" cy="32" r="3.4" fill="#0d0f10"/>`,streak:`<path d="M26,16 L38,16 L33,29 H42 L24,49 L29,34 H21 Z" fill="#0d0f10"/>`,payback:`<path d="M22,26 H38 C43,26 46,29.5 46,34 C46,38.5 43,42 38,42 H28 M28,19 L20,26 L28,33" fill="none" stroke="#0d0f10" stroke-width="3.6"/>`}[e]||``}</svg>`}var w=700,T=70,E=80,D={0:`N`,45:`NE`,90:`E`,135:`SE`,180:`S`,225:`SW`,270:`W`,315:`NW`},ee=e=>(-e*180/Math.PI%360+360)%360,O=(e,t)=>(Math.atan2(e,-t)*180/Math.PI%360+360)%360,k=e=>(e+540)%360-180,te=class{constructor(e){this.el=document.createElement(`div`),this.el.className=`compass sh`,this.cv=document.createElement(`canvas`),this.el.appendChild(this.cv),e.appendChild(this.el),this.g=this.cv.getContext(`2d`),this.k=0,this.last=``}resize(e){this.k=e,this.cv.width=Math.round(w*e),this.cv.height=Math.round(T*e),this.last=``}draw(e,t=[]){let n=e.toFixed(1)+`|`+t.map(e=>e.bearing.toFixed(0)+e.a.toFixed(2)).join(`,`);if(n===this.last)return;this.last=n;let r=this.g,i=this.k;r.setTransform(i,0,0,i,0,0),r.clearRect(0,0,w,T);let a=w/2/E,o=w/2,s=e=>{let t=Math.abs(e-o)/(w/2);return Math.max(0,Math.min(1,(1-t)/.28))},c=r.createLinearGradient(0,0,w,0);c.addColorStop(0,`rgba(0,0,0,0)`),c.addColorStop(.2,`rgba(0,0,0,.16)`),c.addColorStop(.8,`rgba(0,0,0,.16)`),c.addColorStop(1,`rgba(0,0,0,0)`),r.fillStyle=c,r.fillRect(0,2,w,38);let l=Math.ceil((e-E)/5)*5;for(let t=l;t<=e+E;t+=5){let n=(t%360+360)%360,i=o+(t-e)*a,c=s(i);if(c<=0)continue;let l=n%15==0,u=D[n];r.globalAlpha=c*(l?.95:.55),r.fillStyle=`#f2f4ef`;let d=u?10:l?7:4;r.fillRect(Math.round(i)-.75,34-d,1.5,d),r.globalAlpha=c,u?f(r,u,i,8,{size:u.length===1?14:11,weight:u.length===1?1.5:1.25,align:`center`,color:n===0?`#ffb22e`:`#f2f4ef`}):l&&(r.globalAlpha=c*.6,f(r,String(n),i,11,{size:9,weight:1.15,tracking:1.6,align:`center`,color:`#f2f4ef`}))}r.globalAlpha=1;let u=r.createLinearGradient(0,0,w,0);u.addColorStop(0,`rgba(242,244,239,0)`),u.addColorStop(.25,`rgba(242,244,239,.45)`),u.addColorStop(.75,`rgba(242,244,239,.45)`),u.addColorStop(1,`rgba(242,244,239,0)`),r.fillStyle=u,r.fillRect(0,34,w,1);for(let n of t){let t=k(n.bearing-e);if(Math.abs(t)>E)continue;let i=o+t*a;r.globalAlpha=Math.min(1,n.a*1.4)*s(i),r.fillStyle=`#ff3d33`,r.beginPath(),r.moveTo(i,26),r.lineTo(i+5.5,33),r.lineTo(i,40),r.lineTo(i-5.5,33),r.closePath(),r.fill()}r.globalAlpha=1,r.fillStyle=`#ffb22e`,r.beginPath(),r.moveTo(o-6,39),r.lineTo(356,39),r.lineTo(o,45),r.closePath(),r.fill(),f(r,String(Math.round(e)%360).padStart(3,`0`),o,51,{size:12,weight:1.35,tracking:1.8,align:`center`,color:`#f2f4ef`})}},A=268,j=8,M=5.2,ne=class{constructor(e){this.el=document.createElement(`div`),this.el.className=`mm`,this.cv=document.createElement(`canvas`),this.el.appendChild(this.cv),e.appendChild(this.el),this.g=this.cv.getContext(`2d`),this.plan=null,this.k=1,this.rotate=!0,this.builtCount=-1}resize(e){this.k=e,this.cv.width=Math.round(A*e),this.cv.height=Math.round(A*e)}build(e){let t=[...e.collision.colliders.values()].filter(e=>!e.dynamic&&e.box&&!e.trigger&&e.tag!==`player`);this.builtCount=e.collision.colliders.size;let n=e.services.world?.bounds,r=n?n.min.x:1/0,i=n?n.max.x:-1/0,a=n?n.min.z:1/0,o=n?n.max.z:-1/0;if(!n)for(let e of t)r=Math.min(r,e.box.min.x),i=Math.max(i,e.box.max.x),a=Math.min(a,e.box.min.z),o=Math.max(o,e.box.max.z);isFinite(r)||(r=-50,i=50,a=-50,o=50),r-=30,a-=30,i+=30,o+=30;let s=Math.min(4096,Math.ceil((i-r)*j)),c=Math.min(4096,Math.ceil((o-a)*j)),l=document.createElement(`canvas`);l.width=s,l.height=c;let u=l.getContext(`2d`),d=Math.min(j,s/(i-r),c/(o-a));this.origin={x:r,z:a,ppm:d},n&&(u.fillStyle=`rgba(160,170,178,.07)`,u.fillRect((n.min.x-r)*d,(n.min.z-a)*d,(n.max.x-n.min.x)*d,(n.max.z-n.min.z)*d)),u.strokeStyle=`rgba(255,255,255,.035)`,u.lineWidth=1,u.beginPath();for(let e=Math.ceil(r/10)*10;e<i;e+=10)u.moveTo((e-r)*d,0),u.lineTo((e-r)*d,c);for(let e=Math.ceil(a/10)*10;e<o;e+=10)u.moveTo(0,(e-a)*d),u.lineTo(s,(e-a)*d);u.stroke();let f=[],p=[];for(let e of t){let t=e.box,n=t.max.y-t.min.y;t.max.y<.45||t.min.y>2.6||(t.max.x-t.min.x)*(t.max.z-t.min.z)>2500||(n>=1.7?f.push(t):p.push(t))}let m=e=>[(e.min.x-r)*d,(e.min.z-a)*d,(e.max.x-e.min.x)*d,(e.max.z-e.min.z)*d];u.fillStyle=`rgba(120,128,134,.55)`;for(let e of p)u.fillRect(...m(e));u.fillStyle=`rgba(214,220,224,.9)`;for(let e of f){let t=m(e);u.fillRect(t[0]-1.5,t[1]-1.5,t[2]+3,t[3]+3)}u.fillStyle=`rgba(84,91,97,1)`;for(let e of f)u.fillRect(...m(e));let h=document.createElement(`canvas`);h.width=h.height=12;let g=h.getContext(`2d`);g.strokeStyle=`rgba(200,206,210,.28)`,g.lineWidth=1.4,g.beginPath(),g.moveTo(-2,14),g.lineTo(14,-2),g.moveTo(-2,2),g.lineTo(2,-2),g.moveTo(10,14),g.lineTo(14,10),g.stroke(),u.fillStyle=u.createPattern(h,`repeat`);for(let e of f)u.fillRect(...m(e));this.plan=l}draw(e,{yaw:t,pos:n,pings:r=[],northOnly:i=!1}){(!this.plan||e.collision.colliders.size!==this.builtCount&&e.time.frame%60==0)&&this.build(e);let a=this.g,o=this.k;a.setTransform(o,0,0,o,0,0),a.clearRect(0,0,A,A);let s=()=>{a.beginPath(),a.moveTo(0,0),a.lineTo(A-18,0),a.lineTo(A,18),a.lineTo(A,A),a.lineTo(0,A),a.closePath()};a.save(),s(),a.fillStyle=`rgba(8,11,13,.74)`,a.fill(),a.clip();let c=this.rotate?t:0,l=A/2;if(this.plan){let e=this.origin;a.save(),a.translate(l,156),a.rotate(c);let t=M/e.ppm;a.scale(t,t),a.translate(-(n.x-e.x)*e.ppm,-(n.z-e.z)*e.ppm),a.imageSmoothingEnabled=!0,a.drawImage(this.plan,0,0),a.restore()}let u=.78,d=this.rotate?-Math.PI/2:-Math.PI/2-t,p=a.createRadialGradient(l,156,0,l,156,150);p.addColorStop(0,`rgba(242,244,239,.22)`),p.addColorStop(1,`rgba(242,244,239,0)`),a.fillStyle=p,a.beginPath(),a.moveTo(l,156),a.arc(l,156,150,d-u,d+u),a.closePath(),a.fill();for(let e of r){let t=(e.x-n.x)*M,r=(e.z-n.z)*M;if(this.rotate){let e=Math.cos(c),n=Math.sin(c);[t,r]=[t*e-r*n,t*n+r*e]}let i=Math.max(8,Math.min(A-8,l+t)),o=Math.max(8,Math.min(A-8,156+r));a.globalAlpha=Math.min(1,e.a*1.5),a.fillStyle=`rgba(255,61,51,.3)`,a.beginPath(),a.arc(i,o,9,0,Math.PI*2),a.fill(),a.fillStyle=`#ff3d33`,a.beginPath(),a.arc(i,o,4.5,0,Math.PI*2),a.fill(),a.strokeStyle=`rgba(0,0,0,.6)`,a.lineWidth=1,a.stroke()}a.globalAlpha=1;let m=a.createRadialGradient(A/2,A/2,A*.3,A/2,A/2,A*.75);m.addColorStop(0,`rgba(0,0,0,0)`),m.addColorStop(1,`rgba(0,0,0,.45)`),a.fillStyle=m,a.fillRect(0,0,A,A),a.restore(),a.save(),a.translate(l,156),this.rotate||a.rotate(-t),a.fillStyle=`#ffb22e`,a.strokeStyle=`rgba(0,0,0,.7)`,a.lineWidth=1.5,a.beginPath(),a.moveTo(0,-10),a.lineTo(7.5,8),a.lineTo(0,4),a.lineTo(-7.5,8),a.closePath(),a.stroke(),a.fill(),a.restore(),s(),a.strokeStyle=`rgba(242,244,239,.28)`,a.lineWidth=1.5,a.stroke(),a.strokeStyle=`rgba(242,244,239,.85)`,a.lineWidth=2.5,a.beginPath(),a.moveTo(0,22),a.lineTo(0,0),a.lineTo(22,0),a.moveTo(0,A-22),a.lineTo(0,A),a.lineTo(22,A),a.moveTo(A-22,A),a.lineTo(A,A),a.lineTo(A,A-22),a.moveTo(A-18-14,0),a.lineTo(A-18,0),a.lineTo(A,18),a.lineTo(A,32),a.stroke();let h=(this.rotate?c:0)-Math.PI/2,g=A/2-15,_=A/2+Math.cos(h)*g*1.4,v=A/2+Math.sin(h)*g*1.4;_=Math.max(15,Math.min(A-15,_)),v=Math.max(15,Math.min(A-15,v)),a.fillStyle=`rgba(8,11,13,.85)`,a.beginPath(),a.arc(_,v,11,0,Math.PI*2),a.fill(),a.strokeStyle=`rgba(255,178,46,.9)`,a.lineWidth=1.2,a.stroke(),f(a,`N`,_,v-5,{size:10,weight:1.6,align:`center`,color:`#ffb22e`})}},N=[`KESTREL`,`VOLKOV`,`RAZOR`,`NOMAD`,`HALVARD`,`SPECTER`,`DRAGAN`,`ORLOV`,`CINDER`,`MAKAROV`,`TALON`,`BRASK`,`VIPER`,`KORSAK`,`GRIMM`,`STRYDE`],P={id:`elim`,name:`ELIMINATION`,map:`MERIDIAN STREET`,target:30,time:600},F={kill:100,head:50,long:50,double:50,triple:100,streak5:150,payback:50,assist:25,revenge:50},re=class{constructor(e,t){this.ctx=e,this.hooks=t,this.names=new WeakMap,this.nameIdx=0,this.reset()}reset(){this.phase=`menu`,this.timeLeft=P.time,this.kills=0,this.deaths=0,this.headshots=0,this.shots=0,this.hits=0,this.score=0,this.streak=0,this.bestStreak=0,this.longest=0,this.damage=0,this.medals={},this.multi={n:0,t:-99},this.lastDamage=-99,this.lastKiller=null,this.deadT=0,this.playTime=0,this.hostile=new Map,this.xpEarned=0}nameOf(e){if(!e)return`HOSTILE`;let t=this.names.get(e);return t||(t=N[this.nameIdx++%N.length],this.names.set(e,t)),t}rowOf(e){let t=this.hostile.get(e);return t||this.hostile.set(e,t={name:e,kills:0,deaths:0,score:0,alive:!0}),t}get accuracy(){return this.shots?this.hits/this.shots:0}get kd(){return this.deaths?this.kills/this.deaths:this.kills}onFire(){this.phase===`play`&&this.shots++}onHit(e){let t=e.collider?.data,n=t?.enemy;if(!n||e.source&&e.source!==`player`)return;let r=n===this.justKilled;if(!(t.kind!==`enemy`&&!r)){if(this.phase===`play`&&(this.hits++,this.damage+=e.damage||0),r){this.justKilled=null;return}this.hooks.hit({head:e.part===`head`,enemy:n,kill:!1})}}onEnemyDeath({enemy:e,info:t}){let n=this.nameOf(e),r=this.rowOf(n);if(r.deaths++,r.alive=!1,!(!t||t.source===`player`||t.source===void 0))return;this.justKilled=e;let i=this.ctx.time.now,a=t?.part===`head`,o=this.ctx.player.position,s=e?.group?.position,c=s?Math.hypot(s.x-o.x,s.z-o.z):t?.distance||0;this.kills++,this.streak++,this.bestStreak=Math.max(this.bestStreak,this.streak),this.longest=Math.max(this.longest,c),a&&this.headshots++,this.hooks.hit({head:a,enemy:e,kill:!0});let l=[[`ENEMY KILLED`,F.kill]];a&&l.push([`HEADSHOT`,F.head]),c>32&&l.push([`LONGSHOT`,F.long]);let u=null;i-this.multi.t<4?this.multi.n++:this.multi.n=1,this.multi.t=i,this.multi.n===2?(l.push([`DOUBLE KILL`,F.double]),u=[`double`,`DOUBLE KILL`]):this.multi.n>=3&&(l.push([`TRIPLE KILL`,F.triple]),u=[`triple`,`TRIPLE KILL`]),this.lastKiller&&this.lastKiller===n&&(l.push([`PAYBACK`,F.payback]),u||=[`payback`,`PAYBACK`],this.lastKiller=null),(this.streak===5||this.streak===10)&&(l.push([`${this.streak} KILL STREAK`,F.streak5]),u=[`streak`,this.streak===5?`BLOODTHIRSTY`:`MERCILESS`]),!u&&a&&(u=[`head`,`HEADSHOT`]),!u&&c>32&&(u=[`long`,`LONGSHOT`]),u&&(this.medals[u[1]]={kind:u[0],n:(this.medals[u[1]]?.n||0)+1});let d=l.reduce((e,t)=>e+t[1],0);this.score+=d,this.xpEarned+=d,this.hooks.feed({killer:`self`,victim:n,head:a,weapon:`rifle`}),this.hooks.xp(l,d),u&&this.hooks.medal(u[0],u[1],d),this.kills>=P.target&&this.phase===`play`&&this.finish(!0)}onPlayerDamage(e){this.lastDamage=this.ctx.time.now,this.hooks.damage(e)}onPlayerDeath(e){if(this.phase!==`play`)return;this.deaths++,this.streak=0;let t=e?.enemy?this.nameOf(e.enemy):`HOSTILE`;this.lastKiller=t;let n=this.rowOf(t);n.kills++,n.score+=100,this.hooks.feed({killer:t,victim:`self`,head:!1,weapon:`rifle`}),this.phase=`dead`,this.deadT=0,this.hooks.death(t)}start(){this.reset(),this.phase=`play`}finish(e){this.phase=`end`,this.win=e,this.hooks.end(e)}update(e){let t=this.ctx,n=t.player;if(this.phase===`play`){this.playTime+=e,this.timeLeft=Math.max(0,this.timeLeft-e),this.timeLeft<=0&&this.finish(this.kills>=P.target),n.alive&&n.health<n.maxHealth&&t.time.now-this.lastDamage>4.2&&(n.health=Math.min(n.maxHealth,n.health+38*e));for(let e of t.services.enemies?.list||[])e.alive&&(this.rowOf(this.nameOf(e)).alive=!0)}else this.phase===`dead`&&(this.deadT+=e,this.deadT>4&&this.respawn())}respawn(){let e=this.ctx,t=e.player,n=e.services.world?.spawnPoints||[{position:[0,1,0],yaw:0,pitch:0}],r=(e.services.enemies?.list||[]).filter(e=>e.alive).map(e=>e.group.position),i=n[0],a=-1;for(let e of n){let t=r.length?Math.min(...r.map(t=>Math.hypot(t.x-e.position[0],t.z-e.position[2]))):0;t>a&&(a=t,i=e)}t.setPose(i),t.health=t.maxHealth,t.alive=!0,this.phase=`play`,this.hooks.respawn()}},I=(e,t)=>u(e,t),L=(e,t,n)=>Math.max(t,Math.min(n,e)),R=(e,t,n,r)=>e+(t-e)*(1-Math.exp(-n*r));function ie(){let e=document.createElement(`canvas`);e.width=384,e.height=216;let t=e.getContext(`2d`),n=t.createImageData(384,216),r=new Uint8Array(512),i=1234567;for(let e=0;e<256;e++)r[e]=e;for(let e=255;e>0;e--){i=i*16807%2147483647;let t=i%(e+1);[r[e],r[t]]=[r[t],r[e]]}for(let e=0;e<256;e++)r[e+256]=r[e];let a=(e,t)=>r[r[e&255]+(t&255)]/255,o=e=>e*e*(3-2*e),s=(e,t)=>{let n=Math.floor(e),r=Math.floor(t),i=e-n,s=t-r,c=a(n,r),l=a(n+1,r),u=a(n,r+1),d=a(n+1,r+1),f=o(i),p=o(s);return c+(l-c)*f+(u-c)*p+(c-l-u+d)*f*p},c=(e,t)=>s(e,t)*.5+s(e*2.1,t*2.1)*.25+s(e*4.3,t*4.3)*.15+s(e*8.7,t*8.7)*.1,l=(e,t,n)=>{let r=L((n-e)/(t-e),0,1);return r*r*(3-2*r)};for(let e=0;e<216;e++)for(let t=0;t<384;t++){let r=t/384*2-1,i=e/216*2-1,a=(Math.abs(r)**2.6+(Math.abs(i)*1.08)**2.6)**(1/2.6),o=c(t/26,e/26),s=c(t/7+11,e/7+5),u=l(.66,1.12,a+(o-.5)*.22),d=l(.62,.8,s)*l(.7,.95,a);u=L(u+d*.35,0,1);let f=(e*384+t)*4,p=l(.85,1.25,a);n.data[f]=128-p*92+(s-.5)*30,n.data[f+1]=6,n.data[f+2]=8,n.data[f+3]=255*u**1.25*.94}return t.putImageData(n,0,0),e}var ae=class{constructor(e,t,n){this.ctx=e,this.vig=ie(),this.vig.className=`vig-canvas`,this.desat=document.createElement(`div`),this.desat.className=`desat`,this.flash=document.createElement(`div`),this.flash.className=`flash`,n.append(this.desat,this.vig,this.flash),this.fx=n;let r=this.root=document.createElement(`div`);r.className=`play`,r.innerHTML=`
      <div class="corner tl"></div><div class="corner bl"></div><div class="corner br"></div>
      <div class="dmg"></div>
      <div class="cross"><i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><i class="d"></i></div>
      <div class="hitm"><i></i><i></i><i></i><i></i><div class="ring"></div></div>
      <div class="prompt sh"></div>
      <div class="xp sh"></div>
      <div class="medal"></div>
      <div class="banner sh"></div>
      <div class="score sh">
        <div class="top"><div class="timer"></div><div class="mode">${I(P.name,{size:12,weight:1.2,tracking:2.4})}</div></div>
        <div class="rowx us"><div class="fill"></div><div class="n"></div><div class="tag">${I(`IRONLINE`,{size:11,weight:1.15,tracking:2.2})}</div><div class="goal">${I(String(P.target),{size:10,weight:1.1})}</div></div>
        <div class="rowx them"><div class="fill"></div><div class="n"></div><div class="tag">${I(`HOSTILES`,{size:11,weight:1.15,tracking:2.2})}</div><div class="goal"></div></div>
      </div>
      <div class="feed sh"></div>
      <div class="equip sh">
        <div class="e"><div class="kb"><span class="key">${I(`Q`,{size:8,weight:1.3})}</span></div>${v(``,24)}${I(`×2`,{size:12,weight:1.3})}</div>
        <div class="e"><div class="kb"><span class="key">${I(`G`,{size:8,weight:1.3})}</span></div>${_(``,24)}${I(`×2`,{size:12,weight:1.3})}</div>
      </div>
      <div class="wpn sh">
        <div class="head"><span class="nm"></span><span class="mode">${I(`AUTO`,{size:9,weight:1.2,tracking:2})}</span></div>
        <div class="main">
          <div class="gun">${h(``,168)}</div>
          <div class="sep"></div>
          <div class="count"><div class="mag"></div><div class="res"></div></div>
        </div>
        <div class="ticks"></div>
        <div class="reload"><i></i></div>
      </div>
      <div class="vit sh">
        <div class="who"><span class="rk">${S(24,``,30)}</span><span class="cs"></span><span class="lv"></span></div>
        <div class="streak"></div>
        <div class="hp"><div class="bar"><div class="lag"></div><div class="cur"></div><div class="seg"></div></div><div class="num"></div></div>
      </div>
      <div class="death"></div>`,t.appendChild(r);let i=e=>r.querySelector(e);this.el={cross:i(`.cross`),cl:[...i(`.cross`).children],hit:i(`.hitm`),hitI:[...i(`.hitm`).querySelectorAll(`i`)],ring:i(`.hitm .ring`),prompt:i(`.prompt`),xp:i(`.xp`),medal:i(`.medal`),banner:i(`.banner`),dmg:i(`.dmg`),timer:i(`.score .timer`),usN:i(`.rowx.us .n`),usF:i(`.rowx.us .fill`),thN:i(`.rowx.them .n`),thF:i(`.rowx.them .fill`),thG:i(`.rowx.them .goal`),feed:i(`.feed`),wname:i(`.wpn .nm`),mag:i(`.wpn .mag`),res:i(`.wpn .res`),ticks:i(`.wpn .ticks`),reload:i(`.wpn .reload`),reloadI:i(`.wpn .reload i`),vit:i(`.vit`),cs:i(`.vit .cs`),lv:i(`.vit .lv`),streak:i(`.vit .streak`),hpLag:i(`.vit .lag`),hpCur:i(`.vit .cur`),hpNum:i(`.vit .num`),death:i(`.death`),equip:i(`.equip`),wpn:i(`.wpn`)},this.compass=new te(r),this.minimap=new ne(r),this.gap=9,this.bloom=0,this.hitT=9,this.hitKind=``,this.hpLag=100,this.vigA=0,this.flashA=0,this.indicators=[],this.pings=[],this.cache={},this.xpRows=[],this.medals=[],this.virtualHealth=null,this._ticksN=-1}setGunIcon(e){this.gunIcon=e,e&&(this.root.querySelector(`.wpn .gun`).innerHTML=`<img src="${e.url}" style="height:54px;width:${Math.round(54*e.aspect)}px;display:block" alt="">`)}gunImg(e){let t=this.gunIcon;return t?`<img src="${t.url}" style="height:${e}px;width:${Math.round(e*t.aspect)}px;display:block" alt="">`:h(``,e*3.6)}setProfile(e,t){this.el.cs.innerHTML=I(e.callsign,{size:13,weight:1.38,tracking:2.3}),this.el.lv.innerHTML=I(`LV `+t,{size:10,weight:1.2,tracking:1.8}),this.root.querySelector(`.vit .rk`).innerHTML=S(t,``,30)}resize(e){this.compass.resize(e),this.minimap.resize(e)}set(e,t,n){this.cache[e]!==t&&(this.cache[e]=t,n(t))}hitmarker({head:e,kill:t}){let n=t?e?`kill head`:`kill`:e?`head`:`hit`;this.hitT<.05&&this.hitKind.includes(`kill`)&&!t||(this.hitKind=n,this.hitT=0,this.cache.hitOff=void 0,this.el.hit.className=`hitm `+n)}damage({from:e,amount:t=10}){let n=this.ctx.player;if(e){let r=e.x??e[0],i=e.z??e[2],a=O(r-n.position.x,i-n.position.z),o=this.indicators.find(e=>Math.abs((a-e.b+540)%360-180)<20);o?(o.t=0,o.x=r,o.z=i,o.k=Math.min(1.4,o.k+.15)):this.addIndicator(r,i,t)}this.flashA=Math.min(.9,this.flashA+.25+t/60)}addIndicator(e,t,n){let r=document.createElementNS(`http://www.w3.org/2000/svg`,`svg`);r.setAttribute(`viewBox`,`0 0 260 120`);let i=(e,t)=>[130+e*Math.sin(t),260-e*Math.cos(t)],a=.42,o=[];for(let e=0;e<=16;e++){let t=-.42+2*a*e/16,n=5+10*Math.cos(t/a*Math.PI*.5);o.push(i(236+n*.5,t))}for(let e=16;e>=0;e--){let t=-.42+2*a*e/16,n=5+10*Math.cos(t/a*Math.PI*.5);o.push(i(236-n*.5,t))}let s=`dg`+Math.floor(Math.random()*1e9);r.innerHTML=`<defs><radialGradient id="${s}" cx="130" cy="260" r="250" gradientUnits="userSpaceOnUse"><stop offset=".88" stop-color="#ff2a1f" stop-opacity=".25"/><stop offset=".95" stop-color="#ff3b2c"/><stop offset="1" stop-color="#ff7a5c"/></radialGradient></defs>
      <path d="M${o.map(e=>e[0].toFixed(1)+`,`+e[1].toFixed(1)).join(` L`)} Z" fill="url(#${s})" style="filter: drop-shadow(0 0 8px rgba(255,40,20,.75))"/>
      <path d="M${i(214,-.06).join(`,`)} L${i(206,0).join(`,`)} L${i(214,.06).join(`,`)}" fill="none" stroke="#ff6a55" stroke-width="3"/>`,this.el.dmg.appendChild(r),this.indicators.push({el:r,x:e,z:t,t:0,k:L(.7+n/30,.7,1.2),b:0})}ping(e){let t=this.pings.find(t=>Math.hypot(t.x-e.x,t.z-e.z)<2);if(t){t.t=0,t.x=e.x,t.z=e.z;return}this.pings.push({x:e.x,z:e.z,t:0})}feed({killer:e,victim:t,head:n,weapon:r},i){let a=e=>e===`self`?[i,`self`]:[e,`foe`],[o,s]=a(e),[c,l]=a(t),u=document.createElement(`div`);for(u.className=`k`,u.innerHTML=`<span class="${s}">${I(o,{size:12,weight:1.25,tracking:1.9})}</span>
      <span class="kw">${this.gunImg(15)}</span>${n?`<span class="hs">${y(``,20)}</span>`:``}
      <span class="${l}">${I(c,{size:12,weight:1.25,tracking:1.9})}</span>`,this.el.feed.prepend(u),u._t=0;this.el.feed.children.length>5;)this.el.feed.lastElementChild.remove()}xp(e,t){this.el.xp.innerHTML=``;let n=document.createElement(`div`);n.className=`row`,n.innerHTML=`<span class="tot">${I(`+`+t,{size:26,weight:1.5,tracking:1.6})}</span>`,this.el.xp.appendChild(n),e.forEach(([e,t],n)=>{let r=document.createElement(`div`);r.className=`row`,r.style.animationDelay=.06*(n+1)+`s`,r.innerHTML=`<span class="lab">${I(e,{size:11,weight:1.2,tracking:2.2})}</span><span class="pts">${I(`+`+t,{size:11,weight:1.3})}</span>`,this.el.xp.appendChild(r)}),this.xpT=0}medal(e,t,n){let r=document.createElement(`div`);r.className=`m`,r.innerHTML=`<div class="ic">${C(e,76)}</div>${I(t,{size:18,weight:1.45,tracking:2.6})}<div style="color:var(--amber)">${I(`+`+n,{size:12,weight:1.3})}</div>`,this.el.medal.innerHTML=``,this.el.medal.appendChild(r),this.medalT=0}banner(e,t){let n=this.el.banner;n.innerHTML=`${I(e,{size:40,weight:1.5,tracking:4})}<div class="bar"></div><div class="sub">${t}</div>`,n.classList.remove(`on`),n.offsetWidth,n.classList.add(`on`)}death(e,t,n){let r=this.el.death;this.root.classList.toggle(`dead`,!!e),e?(r.innerHTML=`<div style="color:var(--red2)">${b(``,44)}</div>${I(`KILLED IN ACTION`,{size:34,weight:1.5,tracking:4})}
        <div class="by">${I(`KILLED BY`,{size:11,weight:1.2,tracking:2.4})}<span style="color:var(--red2)">${I(t,{size:16,weight:1.4,tracking:2.2})}</span></div>
        <div class="cd"></div>`,r.classList.add(`on`)):r.classList.remove(`on`)}frame(e,t,n,r){let i=t.player,a=t.services.weapon,o=this.el,s=Math.min(.05,Math.max(e,t.time.frameDt||0,1/120)),c=a?.ads??0,l=a?.sprint??+!!i.state?.sprinting,u=i.state?.speed||0,d=8+Math.min(14,u*2.4)+(i.onGround===!1?12:0)+this.bloom+(i.state?.crouching?-2:0);this.bloom=R(this.bloom,0,7,s),this.gap=R(this.gap,L(d,6,44),16,s);let f=this.gap,p=r.crosshair&&!r.ads?L(1-c*2.2,0,1)*L(1-l*1.6,0,1)*(a?.reloading?.55:1):0;if(this.set(`crossA`,p.toFixed(2),e=>o.cross.style.opacity=e),p>0){let e=f.toFixed(1);this.set(`gap`,e,()=>{o.cl[0].style.transform=`translateY(${-f-11}px)`,o.cl[1].style.transform=`translateY(${f}px)`,o.cl[2].style.transform=`translateX(${-f-11}px)`,o.cl[3].style.transform=`translateX(${f}px)`})}this.hitT+=s;let m=this.hitKind.includes(`kill`),h=m?.5:.24,g=Math.max(0,this.hitT),_=g/h;if(_<1){let e=m?1+.35*Math.exp(-g*18):1+.25*Math.exp(-g*30),t=(m?9:7)*e+(this.hitKind.includes(`head`)?2:0),n=[45,135,225,315];if(o.hitI.forEach((e,r)=>e.style.transform=`rotate(${n[r]}deg) translateY(${t}px)`),o.hit.style.opacity=_<.6?1:1-(_-.6)/.4,m){let e=g/.4;o.ring.style.opacity=e<1?(1-e)*.9:0,o.ring.style.transform=`scale(${.4+e*.9})`}else o.ring.style.opacity=0}else this.set(`hitOff`,this.hitT>0,()=>o.hit.style.opacity=0);let v=ee(i.yaw);for(let e=this.indicators.length-1;e>=0;e--){let t=this.indicators[e];t.t+=s;let n=t.t<.12?t.t/.12:L(1-(t.t-1)/.9,0,1);if(n<=0&&t.t>.2){t.el.remove(),this.indicators.splice(e,1);continue}t.b=O(t.x-i.position.x,t.z-i.position.z);let r=t.b-v;t.el.style.transform=`rotate(${r.toFixed(1)}deg) scale(${(.96+.04*t.k).toFixed(3)})`,t.el.style.opacity=(n*Math.min(1,t.k)).toFixed(3)}let y=this.virtualHealth??i.health,b=L(y/(i.maxHealth||100),0,1),x=1-b;this.flashA=R(this.flashA,0,3.2,s);let S=b<.35?.08*(.5+.5*Math.sin(t.time.now*7.5)):0,C=L(x**1.1*1.05+this.flashA*.35+S,0,1);this.set(`vig`,C.toFixed(3),e=>this.vig.style.opacity=e),this.set(`desat`,L(x*1.4-.2,0,1).toFixed(2),e=>this.desat.style.opacity=e),this.set(`flash`,this.flashA.toFixed(3),e=>this.flash.style.opacity=e);for(let e=this.pings.length-1;e>=0;e--)(this.pings[e].t+=s)>3&&this.pings.splice(e,1);let w=i.position,T=e=>e<2?1:1-(e-2);this.compass.draw(v,this.pings.map(e=>({bearing:O(e.x-w.x,e.z-w.z),a:T(e.t)}))),this.minimap.rotate=r.minimapRotate,this.minimap.draw(t,{yaw:i.yaw,pos:w,pings:this.pings.map(e=>({x:e.x,z:e.z,a:T(e.t)}))});let E=Math.ceil(n.timeLeft);this.set(`timer`,E,e=>{o.timer.innerHTML=I(`${Math.floor(e/60)}:${String(e%60).padStart(2,`0`)}`,{size:15,weight:1.4,tracking:1.8}),o.timer.classList.toggle(`low`,e<=60)}),this.set(`us`,n.kills,e=>{o.usN.innerHTML=I(String(e),{size:14,weight:1.45}),o.usF.style.width=`calc((100% - 52px) * ${L(e/P.target,0,1)})`});let D=t.services.enemies?.count?.()??0;this.set(`them`,n.deaths+`|`+D,()=>{o.thN.innerHTML=I(String(n.deaths),{size:14,weight:1.45}),o.thF.style.width=`calc((100% - 52px) * ${L(n.deaths/P.target,0,1)})`,o.thG.innerHTML=I(`${D} ACTIVE`,{size:9,weight:1.1,tracking:1.9})});for(let e of[...o.feed.children])e._t=(e._t||0)+s,e._t>6&&!e.classList.contains(`out`)&&e.classList.add(`out`),e._t>6.5&&e.remove();if(this.xpT!==void 0){if(this.xpT+=s,this.xpT>2.6&&!o.xp._out){for(let e of o.xp.children)e.classList.add(`out`);o.xp._out=!0}this.xpT>3.1?(o.xp.innerHTML=``,this.xpT=void 0):this.xpT<.1&&(o.xp._out=!1)}if(this.medalT!==void 0&&(this.medalT+=s,this.medalT>2.4&&o.medal.firstChild?.classList.add(`out`),this.medalT>2.8&&(o.medal.innerHTML=``,this.medalT=void 0)),a){this.set(`wname`,a.name||`RIFLE`,e=>o.wname.innerHTML=I(e,{size:14,weight:1.3,tracking:2.4}));let e=a.magSize||30,t=a.ammo??0,n=a.reserve??0,r=t<=Math.ceil(e*.25);this.set(`ammo`,t,e=>{o.mag.innerHTML=I(String(e),{size:46,weight:1.38,tracking:1.5}),o.mag.className=`mag`+(e===0?` empty`:r?` low`:``)}),this.set(`res`,n,e=>o.res.innerHTML=I(String(e),{size:17,weight:1.25,tracking:1.6})),this._ticksN!==e&&(this._ticksN=e,o.ticks.innerHTML=`<i></i>`.repeat(e),this.cache.tick=-1),this.set(`tick`,t,e=>{[...o.ticks.children].forEach((t,n)=>t.classList.toggle(`s`,n>=e)),o.ticks.className=`ticks`+(e===0?` empty`:r?` low`:``)});let i=!!a.reloading,c=``;i?c=``:t===0&&n===0?c=`noammo`:r&&(c=`reload`),this.set(`prompt`,c,e=>{o.prompt.className=`prompt sh`+(e===`noammo`?` red`:``),o.prompt.innerHTML=e===`reload`?`<span class="key">${I(`R`,{size:11,weight:1.4})}</span>${I(`RELOAD`,{size:13,weight:1.35,tracking:2.6})}`:e===`noammo`?I(`NO AMMO`,{size:13,weight:1.35,tracking:2.6}):``,o.prompt.style.opacity=+!!e}),this.reloadT=i?(this.reloadT||0)+s:0,this.set(`rl`,i,e=>o.reload.style.opacity=+!!e),i&&(o.reloadI.style.width=L(this.reloadT/(this.reloadDur||2.2),0,1)*100+`%`)}this.set(`wpnVis`,!!a,e=>{o.wpn.style.display=e?``:`none`,o.equip.style.display=e?``:`none`}),this.hpLag=y<this.hpLag?R(this.hpLag,y,this.hpLagHold>0?0:3,s):y,y<this.lastHp&&(this.hpLagHold=.45),this.hpLagHold=(this.hpLagHold||0)-s,this.lastHp=y;let k=Math.ceil(y);this.set(`hp`,k,e=>{o.hpCur.style.width=e+`%`,o.hpNum.innerHTML=I(String(e),{size:14,weight:1.4}),o.vit.classList.toggle(`low`,e<35)}),o.hpLag.style.width=L(this.hpLag,0,100)+`%`,this.set(`streak`,n.streak,e=>{let t=I(`STREAK`,{size:9,weight:1.1,tracking:2});for(let n=0;n<5;n++)t+=`<b class="${n<e?`on`:``}"></b>`;o.streak.innerHTML=t})}},oe=`ironline.settings.v1`,se=`ironline.profile.v1`,z={sens:6,adsSens:.85,invertY:!1,fov:105,quality:`high`,volume:.8,crosshair:`white`,minimapRotate:!0},B={white:`#f2f4ef`,green:`#7dff6a`,amber:`#ffb22e`,cyan:`#4fe3ff`,magenta:`#ff5ad1`};function V(e=oe,t=z){try{let n=localStorage.getItem(e);return{...t,...n?JSON.parse(n):{}}}catch{return{...t}}}function H(e,t=oe){try{localStorage.setItem(t,JSON.stringify(e))}catch{}}var U={callsign:`VANCE`,tag:`IRN`,xp:41250,kills:0,headshots:0,matches:0,wins:0,loadout:{primary:0,optic:1,muzzle:0,grip:1,lethal:0,tactical:0}},ce=()=>V(se,U),le=e=>H(e,se);function W(e){let t=1,n=2500,r=0;for(;e>=r+n&&t<55;)r+=n,t++,n=2500+t*220;return{level:t,into:e-r,need:n}}var G=37e-5,ue=16/9,de=e=>2*Math.atan(Math.tan(e*Math.PI/360)/ue)*180/Math.PI;function K(e,t,{skipQuality:n=!1}={}){e.input.sensitivity=G*t.sens,e.input.invertY=!!t.invertY,e.player.baseFov=Math.round(de(t.fov)*10)/10,e.services.audio?.setVolume?.(t.volume),!n&&e.quality.level!==t.quality&&!e.shot&&!e.params.has(`q`)&&e.quality.set?.(t.quality)}var fe=e=>G*e.sens,q=(e,t)=>u(e,t),J=(e,t={})=>q(e,{size:11,weight:1.2,tracking:2.3,...t}),Y=e=>`<span class="key">${q(e,{size:9,weight:1.3})}</span>`,X=e=>`${Math.floor(e/60)}:${String(Math.floor(e%60)).padStart(2,`0`)}`;function Z(e=24){let t=e*1.7;return`<span class="mark"><svg width="${t}" height="${t}" viewBox="0 0 40 40"><path d="M20,2 L38,20 L20,38 L2,20 Z" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M11,17 L20,25 L29,17 M11,11 L20,19 L29,11" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="miter"/><path d="M14,30 H26" stroke="currentColor" stroke-width="2"/></svg></span>${q(`IRONLINE`,{size:e,weight:1.55,tracking:3.4})}`}var pe=[{name:`KR-9`,cls:`ASSAULT RIFLE`,stats:[72,64,70,66,58,60],svg:e=>h(``,e)}],Q={optic:{label:`OPTIC`,opts:[`IRON SIGHTS`,`MK3 REFLEX`,`HOLO-2 SIGHT`],mod:[[0,0,0,-4,2,0],[0,0,0,4,0,0],[0,2,0,6,-2,0]]},muzzle:{label:`MUZZLE`,opts:[`FLASH HIDER`,`COMPENSATOR`,`SUPPRESSOR`],mod:[[0,0,0,0,0,2],[0,0,0,2,-2,10],[-4,8,0,0,-4,4]]},grip:{label:`UNDERBARREL`,opts:[`NONE`,`VERTICAL GRIP`,`ANGLED GRIP`],mod:[[0,0,0,0,4,-4],[0,0,0,2,-3,9],[0,0,0,6,-1,4]]}},me=[`DAMAGE`,`RANGE`,`FIRE RATE`,`ACCURACY`,`MOBILITY`,`CONTROL`],$={CONTROLS:[{id:`sens`,name:`MOUSE SENSITIVITY`,type:`range`,min:1,max:20,step:.1,fmt:e=>e.toFixed(1),help:`How fast the view turns with the mouse. 6.0 is the factory default.`},{id:`adsSens`,name:`ADS SENSITIVITY MULTIPLIER`,type:`range`,min:.3,max:1.5,step:.01,fmt:e=>e.toFixed(2),help:`Multiplier applied while aiming down sights. Lower values help with precise long-range shots.`},{id:`invertY`,name:`INVERT VERTICAL LOOK`,type:`bool`,help:`Inverts the vertical mouse axis.`}],GRAPHICS:[{id:`quality`,name:`QUALITY PRESET`,type:`seg`,opts:[`low`,`medium`,`high`,`ultra`],help:`Overall graphics preset: shadows, ambient occlusion, bloom, draw distance and particles. Ultra needs a dedicated GPU.`},{id:`fov`,name:`FIELD OF VIEW`,type:`range`,min:80,max:120,step:1,fmt:e=>String(Math.round(e)),help:`Horizontal field of view (16:9 reference). Higher values show more of the periphery; lower values bring the weapon and target closer.`}],AUDIO:[{id:`volume`,name:`MASTER VOLUME`,type:`range`,min:0,max:1,step:.01,fmt:e=>String(Math.round(e*100)),help:`Overall game volume.`}],INTERFACE:[{id:`crosshair`,name:`CROSSHAIR COLOR`,type:`seg`,opts:Object.keys(B),help:`Color of the hip-fire crosshair.`},{id:`minimapRotate`,name:`ROTATE MINIMAP`,type:`bool`,help:`On: the minimap rotates with you (forward is always up). Off: north is always up.`}]},he=class{constructor(e,t){this.hud=e,this.ctx=e.ctx,this.root=document.createElement(`div`),this.root.className=`screens`,t.appendChild(this.root),this.cur=null,this.setTab=`CONTROLS`,this.loTab=`primary`,this.focusIdx=0,this.grain=ge()}get open(){return this.cur}show(e){if(this.cur=e,this.root.innerHTML=``,!e)return;let t=document.createElement(`div`);t.className=`scr ${e} interactive`,t.innerHTML=this[e](),this.root.appendChild(t),this.el=t,this.bind(e,t),requestAnimationFrame(()=>t.classList.add(`on`)),this.ctx.shot&&t.classList.add(`on`),this.focusIdx=0,this.focus(0),this.hud.onScreen?.(e,t)}chrome(e=118){let t=(e,t,n,r=`start`)=>{let i=e.length*4.6;return`<g transform="translate(${r===`end`?t-i:t},${n}) scale(.7)" opacity=".5"><path d="${c(e.toUpperCase(),1.7)}" fill="none" stroke="#f2f4ef" stroke-width="1"/></g>`},n=1002;return`<svg class="chrome" width="1920" height="1080" viewBox="0 0 1920 1080">
      <g fill="none" stroke="rgba(242,244,239,.16)" stroke-width="1">
        <path d="M96,${e} H700 L716,${e+10} H1204 L1220,${e} H1824"/>
        <path d="M96,${n} H640 L656,${n-10} H1264 L1280,${n} H1824"/>
      </g>
      <g stroke="rgba(255,178,46,.75)" stroke-width="2"><path d="M96,${e} H140 M1780,${e} H1824 M716,${e+10} H760 M1160,${e+10} H1204"/></g>
      <g fill="rgba(242,244,239,.35)">${Array.from({length:24},(t,n)=>`<rect x="${730+n*19}" y="${e+16}" width="1" height="${n%4?3:6}"/>`).join(``)}</g>
      ${t(`IRL-NET // UPLINK STABLE`,96,e+10)}${t(`SECTOR 7G  ·  41.7120N 44.7830E`,1824,e+10,`end`)}
      ${t(`TACTICAL DATA SYNCED`,656,n-26)}${t(`OPS CHANNEL 04`,1264,n-26,`end`)}
    </svg>`}bgMenu(){return`<div class="shade-l"></div><div class="shade-vig"></div><div class="grain" style="background-image:url(${this.grain})"></div>`}topbar(e){let t=this.hud.profile,n=W(t.xp);return`<div class="topbar sh">
      <div class="logo">${Z(22)}</div>
      <div class="tabs">${[[`main`,`PLAY`],[`loadout`,`LOADOUT`],[`settings`,`SETTINGS`]].map(([t,n])=>`<div class="tab ${t===e?`on`:``}" data-go="${t}">${q(n,{size:13,weight:1.3,tracking:2.6})}</div>`).join(``)}</div>
      <div class="card">
        <div class="meta">${q(t.callsign,{size:15,weight:1.4,tracking:2.4})}${J(`[${t.tag}]  ·  OPERATOR`,{size:9,weight:1.1})}<div class="xpb"><i style="width:${(n.into/n.need*100).toFixed(1)}%"></i></div></div>
        <span class="rk">${S(n.level,``,46)}</span>
        <div class="lvl">${q(String(n.level),{size:18,weight:1.45})}</div>
      </div></div>`}footer(e){return`<div class="foot sh">${e.map(([e,t])=>`<div class="h">${Y(e)}${J(t,{size:10})}</div>`).join(``)}<div class="ver">${J(`IRONLINE  ·  BUILD 0.1.0  ·  WEBGL2`,{size:9,weight:1.05})}</div></div>`}main(){let e=this.hud.profile,t=[[`head`,`Headshot kills`,Math.min(e.headshots%10,10),10],[`kill`,`Eliminate hostiles`,Math.min(e.kills%25,25),25],[`long`,`Win an Elimination match`,Math.min(e.wins%1,1),1]];return`${this.bgMenu()}${this.chrome()}${this.topbar(`main`)}
      <div class="col sh">
        <div class="eyebrow">${J(`SOLO OPERATIONS  ·  QUICK PLAY`)}</div>
        <div class="title">${q(P.name,{size:72,weight:1.55,tracking:3.2})}</div>
        <div class="desc">Push into the Meridian district and neutralize the hostile cell before time runs out. Enemies regroup, flank and call for backup — use cover and keep the initiative.</div>
        <div class="facts">
          <div class="f"><span class="k">${J(`MAP`,{size:9})}</span>${q(P.map,{size:15,weight:1.35,tracking:2.2})}</div>
          <div class="f"><span class="k">${J(`TIME LIMIT`,{size:9})}</span>${q(X(P.time),{size:15,weight:1.35,tracking:2.2})}</div>
          <div class="f"><span class="k">${J(`OBJECTIVE`,{size:9})}</span>${q(P.target+` KILLS`,{size:15,weight:1.35,tracking:2.2})}</div>
          <div class="f"><span class="k">${J(`THREAT`,{size:9})}</span><span style="color:var(--red2)">${q(`HIGH`,{size:15,weight:1.35,tracking:2.2})}</span></div>
        </div>
        <div class="btns">
          <div class="btn pri" data-act="deploy" tabindex="0">${q(`DEPLOY`,{size:22,weight:1.6,tracking:4})}<span class="chev">${q(`>>`,{size:16,weight:1.8,tracking:.8})}</span></div>
          <div class="btn" data-go="loadout" tabindex="0">${q(`EDIT LOADOUT`,{size:14,weight:1.3,tracking:2.6})}<span class="hint">${Y(`L`)}</span></div>
          <div class="btn" data-go="settings" tabindex="0">${q(`SETTINGS`,{size:14,weight:1.3,tracking:2.6})}<span class="hint">${Y(`O`)}</span></div>
        </div>
      </div>
      <div class="side sh">
        <div class="panel">
          <div class="ph">${q(`DAILY CHALLENGES`,{size:13,weight:1.35,tracking:2.4})}<span class="r">${J(`RESETS 14H 22M`,{size:9})}</span></div>
          ${t.map(([e,t,n,r])=>`<div class="chal"><div class="ic">${e===`head`?y(``,22):e===`kill`?b(``,22):C(`kill`,24)}</div>
            <div class="tx"><span class="d">${t}</span><div class="pb"><i style="width:${n/r*100}%"></i></div></div><span class="v">${q(`${n}/${r}`,{size:11,weight:1.25})}</span></div>`).join(``)}
        </div>
        <div class="panel"><div class="ph">${q(`CAREER`,{size:13,weight:1.35,tracking:2.4})}<span class="r">${J(`${e.matches} MATCHES`,{size:9})}</span></div>
          <div class="kv" style="grid-template-columns:1fr 1fr 1fr">
            <div><span class="k">${J(`KILLS`,{size:9})}</span>${q(String(e.kills),{size:20,weight:1.45})}</div>
            <div><span class="k">${J(`HEADSHOTS`,{size:9})}</span>${q(String(e.headshots),{size:20,weight:1.45})}</div>
            <div><span class="k">${J(`WINS`,{size:9})}</span>${q(String(e.wins),{size:20,weight:1.45})}</div>
          </div></div>
      </div>
      ${this.footer([[`ENTER`,`DEPLOY`],[`L`,`LOADOUT`],[`O`,`SETTINGS`]])}`}loadout(){let e=this.hud.profile.loadout,t=pe[e.primary]||pe[0],n=t.stats.map((t,n)=>{let r=0;for(let t of Object.keys(Q))r+=Q[t].mod[e[t]??0][n];return[t,Math.max(5,Math.min(100,t+r))]}),r=this.ctx.services.weapon?.name||t.name;return`${this.bgMenu()}<div class="shade-full mesh" style="background-color:rgba(5,7,9,.55)"></div>${this.chrome()}${this.topbar(`loadout`)}
      <div class="lo">
        <div class="slots sh">
          <div class="eyebrow" style="margin-bottom:14px">${J(`LOADOUT 1  ·  ASSAULT`)}</div>
          <div class="slot on" data-lo="primary"><div class="lbl"><span class="k">${J(`PRIMARY`,{size:9})}</span>${q(r,{size:18,weight:1.45,tracking:2.6})}</div><span class="img">${this.hud.gunIcon?`<img src="${this.hud.gunIcon.url}" style="height:40px;width:${Math.round(40*this.hud.gunIcon.aspect)}px;display:block" alt="">`:h(``,150)}</span></div>
          <div class="slot"><div class="lbl"><span class="k">${J(`SECONDARY`,{size:9})}</span>${q(`P-11`,{size:18,weight:1.45,tracking:2.6})}</div><span class="img">${g(``,64)}</span></div>
          <div class="slot small"><div class="lbl"><span class="k">${J(`LETHAL`,{size:9})}</span>${q(`FRAG GRENADE`,{size:14,weight:1.35,tracking:2.2})}</div><span class="img">${_(``,34)}</span></div>
          <div class="slot small"><div class="lbl"><span class="k">${J(`TACTICAL`,{size:9})}</span>${q(`FLASHBANG`,{size:14,weight:1.35,tracking:2.2})}</div><span class="img">${v(``,34)}</span></div>
          <div class="slot small"><div class="lbl"><span class="k">${J(`MELEE`,{size:9})}</span>${q(`COMBAT KNIFE`,{size:14,weight:1.35,tracking:2.2})}</div><span class="img">${x(``,60)}</span></div>
        </div>
        <div class="detail sh">
          <span class="cls">${J(t.cls)}</span>
          <div class="nm">${q(r,{size:56,weight:1.55,tracking:3})}</div>
          <div class="big"><div class="gs-host"></div><div class="gs-floor"></div><div class="gs-fallback">${t.svg(760)}</div></div>
          <div class="atts">${Object.entries(Q).map(([t,n])=>`<div class="acol"><span class="k">${J(n.label,{size:9})}</span>${n.opts.map((n,r)=>`<div class="att ${e[t]===r?`on`:``}" data-att="${t}:${r}">${q(n,{size:11,weight:1.3,tracking:1.8})}</div>`).join(``)}</div>`).join(``)}</div>
          <div class="stats">${n.map(([e,t],n)=>`<div class="stat"><div class="t">${J(me[n],{size:10})}${q(String(t),{size:11,weight:1.3})}</div><div class="b"><i class="d" style="width:${Math.max(e,t)}%;${t<e?`background:var(--red2)`:``}"></i><i style="width:${Math.min(e,t)}%"></i></div></div>`).join(``)}</div>
        </div>
      </div>
      ${this.footer([[`ESC`,`BACK`],[`ENTER`,`DEPLOY`]])}`}settings(){let e=this.hud.settings,t=$[this.setTab],n=t=>{let n=e[t.id];if(t.type===`range`){let e=(n-t.min)/(t.max-t.min)*100;return`<input type="range" min="${t.min}" max="${t.max}" step="${t.step}" value="${n}" data-opt="${t.id}" style="--p:${e}%"><span class="val">${q(t.fmt(n),{size:13,weight:1.35})}</span>`}return t.type===`bool`?`<div class="seg" data-opt="${t.id}">${[`OFF`,`ON`].map((e,t)=>`<b class="${!!n==!!t?`on`:``}" data-v="${t}">${J(e,{size:10})}</b>`).join(``)}</div>`:`<div class="seg" data-opt="${t.id}">${t.opts.map(e=>`<b class="${n===e?`on`:``}" data-v="${e}">${J(e,{size:10})}</b>`).join(``)}</div>`},r=t[Math.min(this.focusIdx,t.length-1)]||t[0];return`${this.bgMenu()}<div class="shade-full mesh" style="background-color:rgba(5,7,9,.6)"></div>${this.chrome()}${this.topbar(`settings`)}
      <div class="set sh">
        <div class="stabs">${Object.keys($).map(e=>`<div class="stab ${e===this.setTab?`on`:``}" data-tab="${e}">${q(e,{size:13,weight:1.3,tracking:2.6})}</div>`).join(``)}</div>
        <div class="rows">${t.map((e,t)=>`<div class="opt" data-i="${t}"><span class="nm">${q(e.name,{size:13,weight:1.25,tracking:2.2})}</span><div class="ctl">${n(e)}</div></div>`).join(``)}</div>
      </div>
      <div class="set-help panel sh">${q(r.name,{size:16,weight:1.4,tracking:2.4})}<div class="d">${r.help}</div>
        <div class="pv">${this.preview(r.id)}</div></div>
      ${this.footer([[`ESC`,`BACK`],[`TAB`,`NEXT TAB`]])}`}preview(e){let t=this.hud.settings;if(e===`crosshair`){let e=B[t.crosshair];return`<svg width="100%" height="100%" viewBox="0 0 600 220"><g stroke="${e}" stroke-width="2.5"><path d="M300,88 V99 M300,121 V132 M278,110 H289 M311,110 H322"/></g><rect x="299" y="109" width="2" height="2" fill="${e}"/></svg>`}if(e===`fov`){let e=t.fov/2*(Math.PI/180);return`<svg width="100%" height="100%" viewBox="0 0 600 220"><path d="M300,200 L${300-Math.sin(e)*170},${200-Math.cos(e)*170} A170,170 0 0 1 ${300+Math.sin(e)*170},${200-Math.cos(e)*170} Z" fill="rgba(255,178,46,.14)" stroke="#ffb22e" stroke-width="1.5"/><circle cx="300" cy="200" r="5" fill="#f2f4ef"/></svg>`}if(e===`quality`){let e=[`low`,`medium`,`high`,`ultra`].indexOf(t.quality);return`<div style="position:absolute;inset:22px;display:flex;flex-direction:column;gap:12px">${[`SHADOWS`,`AMBIENT OCCLUSION`,`BLOOM`,`DRAW DISTANCE`,`PARTICLES`].map((t,n)=>`<div style="display:flex;align-items:center;gap:14px"><span style="width:220px">${J(t,{size:9})}</span><div style="flex:1;height:4px;background:rgba(255,255,255,.1)"><i style="display:block;height:100%;width:${25+e*25-n%2*5}%;background:var(--amber)"></i></div></div>`).join(``)}</div>`}return`<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--ink3)">${Z(18)}</div>`}pause(){let e=this.hud.match;return`<div class="shade-full mesh"></div>${this.chrome()}${this.topbarMini()}
      <div class="col sh">
        <div class="eyebrow">${J(`${P.name}  ·  ${P.map}`)}</div>
        <div class="title">${q(`PAUSED`,{size:64,weight:1.55,tracking:4})}</div>
        <div class="btns">
          <div class="btn pri" data-act="resume" tabindex="0">${q(`RESUME`,{size:20,weight:1.6,tracking:4})}<span class="chev">${q(`>>`,{size:16,weight:1.8,tracking:.8})}</span></div>
          <div class="btn" data-go="loadout" tabindex="0">${q(`LOADOUT`,{size:14,weight:1.3,tracking:2.6})}</div>
          <div class="btn" data-go="settings" tabindex="0">${q(`SETTINGS`,{size:14,weight:1.3,tracking:2.6})}</div>
          <div class="btn" data-act="restart" tabindex="0">${q(`RESTART MATCH`,{size:14,weight:1.3,tracking:2.6})}</div>
          <div class="btn" data-act="quit" tabindex="0">${q(`QUIT TO MAIN MENU`,{size:14,weight:1.3,tracking:2.6})}</div>
        </div>
      </div>
      <div class="mstat panel sh"><div class="ph">${q(`MATCH STATUS`,{size:13,weight:1.35,tracking:2.4})}<span class="r">${q(X(e.timeLeft),{size:12,weight:1.3})}</span></div>
        <div class="kv">
          <div><span class="k">${J(`KILLS`,{size:9})}</span>${q(`${e.kills}/${P.target}`,{size:22,weight:1.45})}</div>
          <div><span class="k">${J(`DEATHS`,{size:9})}</span>${q(String(e.deaths),{size:22,weight:1.45})}</div>
          <div><span class="k">${J(`SCORE`,{size:9})}</span>${q(String(e.score),{size:22,weight:1.45})}</div>
          <div><span class="k">${J(`ACCURACY`,{size:9})}</span>${q(Math.round(e.accuracy*100)+`%`,{size:22,weight:1.45})}</div>
          <div><span class="k">${J(`HEADSHOTS`,{size:9})}</span>${q(String(e.headshots),{size:22,weight:1.45})}</div>
          <div><span class="k">${J(`BEST STREAK`,{size:9})}</span>${q(String(e.bestStreak),{size:22,weight:1.45})}</div>
        </div></div>
      ${this.footer([[`ESC`,`RESUME`]])}`}topbarMini(){return`<div class="topbar sh" style="border-bottom-color:rgba(255,255,255,.05)"><div class="logo">${Z(20)}</div></div>`}scoreboard(){return`<div class="shade-full" style="background:rgba(5,7,9,.5);backdrop-filter:blur(4px)"></div>${this.board(!1)}`}board(e){let t=this.hud.match,n=this.hud.profile,r=W(n.xp),i=[...t.hostile.values()].sort((e,t)=>t.score-e.score||t.kills-e.kills),a=e=>28+e*17%23,o=(e,t={})=>`<td>${q(String(e),{size:13,weight:1.3,...t})}</td>`,s=[``,`SCORE`,`KILLS`,`DEATHS`,`K/D`,`ACCURACY`,`PING`].map(e=>`<th>${e?J(e,{size:9}):``}</th>`).join(``),c=t.kills,l=t.deaths;return`<div class="sb sh">
      ${e?``:`<div class="hdr"><div class="l">${J(`${P.name}  ·  ${P.map}`)}${q(`SCOREBOARD`,{size:34,weight:1.5,tracking:3.4})}</div>
        <div class="r"><div class="big"><span style="color:var(--blue)">${q(String(c),{size:38,weight:1.55})}</span>${J(`VS`,{size:10})}<span style="color:var(--red2)">${q(String(l),{size:38,weight:1.55})}</span></div>
        <div class="timer" style="padding:10px 14px;border:1px solid var(--line);background:var(--plate)">${q(X(t.timeLeft),{size:16,weight:1.4,tracking:1.8})}</div></div></div>`}
      <div class="tm"><div class="tmh us">${q(`IRONLINE`,{size:13,weight:1.4,tracking:2.6})}${J(`OPERATOR`,{size:9})}<span class="sc">${q(String(t.score),{size:16,weight:1.45})}</span></div>
        <table><colgroup><col class="c0"><col><col><col><col><col><col></colgroup><thead><tr>${s}</tr></thead><tbody>
          <tr class="me"><td><div class="nmc"><span style="color:var(--amber)">${S(r.level,``,26)}</span><span class="rkc">${q(String(r.level),{size:11,weight:1.3})}</span>${q(`[${n.tag}] ${n.callsign}`,{size:13,weight:1.35,tracking:2})}</div></td>
          ${o(t.score)}${o(c)}${o(l)}${o(t.kd.toFixed(2))}${o(Math.round(t.accuracy*100)+`%`)}${o(24,{weight:1.1})}</tr>
        </tbody></table></div>
      <div class="tm"><div class="tmh them">${q(`HOSTILE CELL`,{size:13,weight:1.4,tracking:2.6})}${J(`OPFOR`,{size:9})}<span class="sc">${q(String(i.reduce((e,t)=>e+t.score,0)),{size:16,weight:1.45})}</span></div>
        <table><colgroup><col class="c0"><col><col><col><col><col><col></colgroup><thead><tr>${s}</tr></thead><tbody>
        ${i.map((e,t)=>`<tr class="${e.alive?``:`dead`}"><td><div class="nmc"><span style="color:var(--ink2)">${S(7+t*5,``,26)}</span><span class="rkc">${q(String(8+t*13%40),{size:11,weight:1.3})}</span>${q(e.name,{size:13,weight:1.35,tracking:2})}</div></td>
          ${o(e.score)}${o(e.kills)}${o(e.deaths)}${o((e.deaths?e.kills/e.deaths:e.kills).toFixed(2))}${o(`—`,{weight:1.1})}${o(a(t),{weight:1.1})}</tr>`).join(``)}
        </tbody></table></div>
    </div>`}end(){let e=this.hud.match,t=this.hud.profile,n=!!e.win,r=W(Math.max(0,t.xp-e.xpEarned)),i=W(t.xp),a=Object.entries(e.medals),o=(e,t,n=0)=>`<div style="animation-delay:${.5+n*.06}s"><span class="k">${J(e,{size:9})}</span>${q(String(t),{size:30,weight:1.5})}</div>`;return`<div class="shade-full mesh" style="background-color:rgba(5,7,9,.78)"></div><div class="shade-vig"></div>${this.chrome()}<div class="grain" style="background-image:url(${this.grain})"></div>
      <div class="res sh">${J(`${P.name}  ·  ${P.map}  ·  ${X(Math.max(0,P.time-e.timeLeft))}`)}
        <div class="w ${n?`win`:`loss`}">${q(n?`VICTORY`:`DEFEAT`,{size:92,weight:1.6,tracking:6})}</div>
        <div class="sub">${q(n?`HOSTILE CELL NEUTRALIZED`:`OBJECTIVE FAILED`,{size:14,weight:1.3,tracking:3})}</div></div>
      <div class="grid sh">
        <div class="panel"><div class="ph">${q(`PERFORMANCE`,{size:13,weight:1.35,tracking:2.4})}<span class="r">${J(`OPERATOR `+t.callsign,{size:9})}</span></div>
          <div class="tiles">${o(`SCORE`,e.score,0)}${o(`KILLS`,e.kills,1)}${o(`DEATHS`,e.deaths,2)}${o(`K/D RATIO`,e.kd.toFixed(2),3)}${o(`ACCURACY`,Math.round(e.accuracy*100)+`%`,4)}${o(`HEADSHOTS`,e.headshots,5)}${o(`BEST STREAK`,e.bestStreak,6)}${o(`LONGEST KILL`,Math.round(e.longest)+`M`,7)}${o(`DAMAGE`,Math.round(e.damage),8)}</div></div>
        <div style="display:flex;flex-direction:column;gap:28px">
          <div class="panel"><div class="ph">${q(`MEDALS`,{size:13,weight:1.35,tracking:2.4})}<span class="r">${J(a.length+` EARNED`,{size:9})}</span></div>
            <div class="medals">${a.length?a.map(([e,t])=>`<div class="md">${C(t.kind,64)}${q(e,{size:9,weight:1.2,tracking:1.6})}<span class="c">${q(`×`+t.n,{size:10,weight:1.3})}</span></div>`).join(``):`<div style="color:var(--ink3);padding:10px 0">${J(`NO MEDALS THIS MATCH`)}</div>`}</div></div>
          <div class="panel"><div class="ph">${q(`PROGRESSION`,{size:13,weight:1.35,tracking:2.4})}<span class="r" style="color:var(--amber)">${q(`+`+e.xpEarned+` XP`,{size:12,weight:1.35})}</span></div>
            <div class="prog">
              <div class="xpl"><span style="color:var(--amber)">${S(i.level,``,40)}</span>${q(`LEVEL `+i.level,{size:16,weight:1.45,tracking:2.2})}
                <div class="xpb"><i class="g" style="width:${(i.into/i.need*100).toFixed(1)}%"></i><i style="width:${i.level>r.level?0:(r.into/r.need*100).toFixed(1)}%"></i></div>
                ${q(`${i.into}/${i.need}`,{size:11,weight:1.25})}</div>
              ${i.level>r.level?`<div style="color:var(--amber)">${q(`LEVEL UP`,{size:13,weight:1.45,tracking:3})}</div>`:``}
            </div></div>
        </div>
      </div>
      <div class="acts">
        <div class="btn pri" data-act="restart" tabindex="0">${q(`PLAY AGAIN`,{size:18,weight:1.6,tracking:3.4})}<span class="chev">${q(`>>`,{size:14,weight:1.8,tracking:.8})}</span></div>
        <div class="btn" data-act="quit" tabindex="0">${q(`MAIN MENU`,{size:14,weight:1.3,tracking:2.6})}</div>
      </div>`}bind(e,t){let n=this.hud;t.addEventListener(`click`,e=>{let t=e.target.closest(`[data-go],[data-act],[data-tab],[data-att],[data-v],[data-lo]`);if(t){if(t.dataset.go)this.go(t.dataset.go);else if(t.dataset.act)n.action(t.dataset.act);else if(t.dataset.tab)this.setTab=t.dataset.tab,this.focusIdx=0,this.show(`settings`);else if(t.dataset.att){let[e,r]=t.dataset.att.split(`:`);n.profile.loadout[e]=Number(r),n.saveProfile(),this.show(`loadout`)}else if(t.dataset.v!==void 0){let e=t.parentElement.dataset.opt,r=Object.values($).flat().find(t=>t.id===e);n.setOption(e,r.type===`bool`?t.dataset.v===`1`:t.dataset.v);let i=this.focusIdx;this.show(`settings`),this.focus(i)}}}),t.addEventListener(`input`,e=>{let r=e.target;if(r.type!==`range`)return;let i=r.dataset.opt,a=Object.values($).flat().find(e=>e.id===i),o=Number(r.value);n.setOption(i,o),r.style.setProperty(`--p`,(o-a.min)/(a.max-a.min)*100+`%`),r.nextElementSibling.innerHTML=q(a.fmt(o),{size:13,weight:1.35}),i===`fov`&&(t.querySelector(`.pv`).innerHTML=this.preview(`fov`))}),t.addEventListener(`mouseover`,t=>{let n=t.target.closest(`.opt`);if(n&&e===`settings`){let e=Number(n.dataset.i);e!==this.focusIdx&&(this.focus(e),this.refreshHelp())}})}refreshHelp(){let e=$[this.setTab],t=e[this.focusIdx]||e[0],n=this.el.querySelector(`.set-help`);n&&(n.innerHTML=`${q(t.name,{size:16,weight:1.4,tracking:2.4})}<div class="d">${t.help}</div><div class="pv">${this.preview(t.id)}</div>`)}go(e){this.back=this.cur,this.show(e)}focusables(){return this.el?[...this.el.querySelectorAll(this.cur===`settings`?`.opt`:`.btn,.slot`)]:[]}focus(e){let t=this.focusables();t.length&&(this.focusIdx=(e+t.length)%t.length,t.forEach((e,t)=>e.classList.toggle(`focus`,t===this.focusIdx)))}key(e){if(!this.cur)return!1;if(e===`ArrowDown`||e===`KeyS`)return this.focus(this.focusIdx+1),this.cur===`settings`&&this.refreshHelp(),!0;if(e===`ArrowUp`||e===`KeyW`)return this.focus(this.focusIdx-1),this.cur===`settings`&&this.refreshHelp(),!0;if(e===`Enter`||e===`Space`)return(this.cur===`main`||this.cur===`loadout`)&&(this.cur===`loadout`||this.focusIdx===0)?(this.hud.action(`deploy`),!0):(this.focusables()[this.focusIdx]?.click(),!0);if(this.cur===`settings`&&(e===`ArrowLeft`||e===`ArrowRight`)){let t=$[this.setTab][this.focusIdx],n=this.hud.settings,r=e===`ArrowRight`?1:-1;t.type===`range`?this.hud.setOption(t.id,Math.max(t.min,Math.min(t.max,+(n[t.id]+r*t.step*(t.max-t.min>5?5:2)).toFixed(3)))):t.type===`bool`?this.hud.setOption(t.id,r>0):this.hud.setOption(t.id,t.opts[Math.max(0,Math.min(t.opts.length-1,t.opts.indexOf(n[t.id])+r))]);let i=this.focusIdx;return this.show(`settings`),this.focus(i),this.refreshHelp(),!0}if(e===`Tab`&&this.cur===`settings`){let e=Object.keys($);return this.setTab=e[(e.indexOf(this.setTab)+1)%e.length],this.show(`settings`),!0}if(e===`KeyL`&&this.cur===`main`)return this.go(`loadout`),!0;if(e===`KeyO`&&this.cur===`main`)return this.go(`settings`),!0;if(e===`Escape`||e===`Backspace`){if(this.cur===`loadout`||this.cur===`settings`)return this.show(this.hud.inMatch?`pause`:`main`),!0;if(this.cur===`pause`)return this.hud.action(`resume`),!0}return!1}};function ge(){let e=document.createElement(`canvas`);e.width=e.height=256;let t=e.getContext(`2d`),n=t.createImageData(256,256),r=99991;for(let e=0;e<256*256;e++){r=r*1103515245+12345&2147483647;let t=r>>16&255;n.data[e*4]=n.data[e*4+1]=n.data[e*4+2]=t,n.data[e*4+3]=255}return t.putImageData(n,0,0),e.toDataURL(`image/png`)}var _e=class{constructor(t,n,r,{w:i=1100,h:a=440,k:o=1}={}){this.THREE=t,this.w=i,this.h=a;let s=this.renderer=new t.WebGLRenderer({antialias:!0,alpha:!0,preserveDrawingBuffer:!0});s.setPixelRatio(Math.min(2,o)),s.setSize(i,a,!1),s.outputColorSpace=t.SRGBColorSpace,s.toneMapping=t.ACESFilmicToneMapping,s.toneMappingExposure=1.05,s.setClearColor(0,0),s.domElement.style.width=i+`px`,s.domElement.style.height=a+`px`,s.domElement.className=`gs-canvas`,r.appendChild(s.domElement);let c=this.scene=new t.Scene,l=new t.PMREMGenerator(s);this.env=l.fromScene(new e,.04).texture,l.dispose(),c.environment=this.env,c.environmentIntensity=.55;let u=new t.DirectionalLight(16773596,2.4);u.position.set(2,3,1.5);let d=new t.DirectionalLight(12375807,3.2);d.position.set(-2.5,1.2,-2);let f=new t.DirectionalLight(16758896,.6);f.position.set(0,-2,1),c.add(u,d,f);let p=n.clone(!0);p.position.set(0,0,0),p.quaternion.identity(),p.scale.set(1,1,1);let m=[];p.traverse(e=>{(/^(hand|sleeve)/i.test(e.name)||e.isSkinnedMesh)&&m.push(e)});for(let e of m)e.parent?.remove(e);p.traverse(e=>{e.isMesh&&(e.castShadow=e.receiveShadow=!1,e.frustumCulled=!1)});let h=new t.Box3().setFromObject(p),g=h.getSize(new t.Vector3),_=h.getCenter(new t.Vector3),v=this.pivot=new t.Group;p.position.sub(_),v.add(p),c.add(v),this.size=g;let y=Math.max(g.x,g.y,g.z),b=this.camera=new t.PerspectiveCamera(20,i/a,.01,50),x=y*.5/Math.tan(20*Math.PI/360)/(i/a)*1.18+g.x;b.position.set(x,y*.08,-y*.05),b.lookAt(0,0,0),this.t=0,this.ok=!0}render(e){this.ok&&(this.t+=e,this.pivot.rotation.y=Math.sin(this.t*.35)*.32-.12,this.pivot.rotation.x=Math.sin(this.t*.23)*.04,this.renderer.render(this.scene,this.camera))}dispose(){this.ok=!1;try{this.env.dispose(),this.renderer.dispose(),this.renderer.forceContextLoss()}catch{}this.renderer.domElement.remove()}};function ve(e,t,{h:n=160}={}){let r;try{let i=t.clone(!0);i.position.set(0,0,0),i.quaternion.identity();let a=[];i.traverse(e=>{(/^(hand|sleeve)/i.test(e.name)||e.isSkinnedMesh||e.isLight||e.isPoints||e.isSprite)&&a.push(e)});for(let e of a)e.parent?.remove(e);let o=new e.Scene;o.add(i),o.overrideMaterial=new e.MeshBasicMaterial({color:16777215,side:e.DoubleSide}),i.updateMatrixWorld(!0);let s=new e.Box3().setFromObject(i),c=s.getSize(new e.Vector3),l=s.getCenter(new e.Vector3),u=c.z/Math.max(.001,c.y),d=n,f=Math.round(n*u),p=new e.OrthographicCamera(-c.z/2,c.z/2,c.y/2,-c.y/2,.01,20);p.position.set(l.x+5,l.y,l.z),p.lookAt(l),r=new e.WebGLRenderer({antialias:!0,alpha:!0,preserveDrawingBuffer:!0}),r.setPixelRatio(1),r.setSize(f,d,!1),r.setClearColor(0,0),r.render(o,p);let m=r.domElement.toDataURL(`image/png`);return o.overrideMaterial.dispose(),{url:m,aspect:u}}catch(e){return console.warn(`[hud] silhueta da arma indisponível`,e),null}finally{try{r?.dispose(),r?.forceContextLoss()}catch{}}}var ye={name:`hud`,order:90,init(e){let n=document.createElement(`div`);n.id=`hud`,n.innerHTML=`<style>${t}</style><div class="fx"></div><div class="stage"></div>`,e.ui.appendChild(n),this.root=n,e.shot&&n.classList.add(`shot`),this.ctx=e,this.stage=n.querySelector(`.stage`),this.settings=V(),this.profile=ce(),e.shot&&(this.settings={...z},this.profile=JSON.parse(JSON.stringify(U)),this.profile.kills=412,this.profile.headshots=97,this.profile.matches=38,this.profile.wins=21),this.play=new ae(e,this.stage,n.querySelector(`.fx`));let r=e.services.weapon?.gun;this.gunIcon=r?ve(e.THREE,r,{h:140}):null,this.play.setGunIcon(this.gunIcon),this.play.setProfile(this.profile,W(this.profile.xp).level),this.screens=new he(this,this.stage),this.match=new re(e,{feed:e=>this.play.feed(e,this.profile.callsign),xp:(e,t)=>this.play.xp(e,t),medal:(e,t,n)=>this.play.medal(e,t,n),hit:e=>this.play.hitmarker(e),damage:e=>this.play.damage(e),death:e=>this.onDeath(e),respawn:()=>this.onRespawn(),end:e=>this.onEnd(e)}),this.showHud=!0,this.inMatch=!1,this.scoreHeld=!1;let i=(t,n)=>e.bus.on(t,n);this._offs=[i(`weapon:fire`,()=>{this.match.onFire(),this.play.bloom=Math.min(16,this.play.bloom+4.5)}),i(`weapon:hit`,e=>this.match.onHit(e)),i(`weapon:reload`,e=>this.play.reloadDur=e?.duration||2.2),i(`enemy:death`,e=>this.match.onEnemyDeath(e)),i(`enemy:fire`,e=>{e?.origin&&this.play.ping(e.origin),this.virtualHit(e)}),i(`player:damage`,e=>this.match.onPlayerDamage(e)),i(`player:death`,e=>this.match.onPlayerDeath(e)),i(`input:lock`,e=>this.onLock(e)),i(`resize`,()=>this.layout())],this._key=e=>this.onKey(e,!0),this._keyUp=e=>this.onKey(e,!1),addEventListener(`keydown`,this._key,!0),addEventListener(`keyup`,this._keyUp,!0),addEventListener(`resize`,this._rs=()=>this.layout()),this.layout();let a=document.getElementById(`boot`);a&&(e.shot?a.remove():e.bus.once?.(`ready`,()=>{a.style.opacity=0,setTimeout(()=>a.remove(),600)}));let o=e.shot?.preset,s=e.params.get(`ui`);e.shot?(this.showHud=!!o.hud,(o.hud||s)&&this.stageDemo(o),o.menu&&this.screens.show(`main`),s&&this.screens.show(s===`death`?null:s),s===`death`&&this.play.death(!0,`KESTREL`)):(K(e,this.settings),this.toMenu(),s&&this.screens.show(s)),e.provide(`hud`,{root:n,setMenu:e=>e?this.toMenu():this.screens.show(null),setVisible:e=>this.showHud=e,open:e=>this.screens.show(e),get screen(){return this.__s?.screens.cur??null},match:this.match,settings:this.settings,get loadout(){return this.__s?.profile.loadout},banner:(e,t)=>this.play.banner(e,t),deploy:()=>this.action(`deploy`),__s:this})},layout(){let e=this.root.clientWidth||innerWidth,t=this.root.clientHeight||innerHeight,n=Math.min(e/1920,t/1080);this.stage.style.transform=`scale(${n})`,this.stage.style.width=e/n+`px`,this.stage.style.height=t/n+`px`,this.k=n,this.play.resize(n*Math.min(2,devicePixelRatio||1))},onScreen(e,t){if(this.gs?.dispose(),this.gs=null,e!==`loadout`)return;let n=this.ctx.services.weapon?.gun,r=t.querySelector(`.gs-host`);if(!(!n||!r))try{this.gs=new _e(this.ctx.THREE,n,r,{w:1100,h:400,k:this.k*Math.min(2,devicePixelRatio||1)}),r.parentElement.classList.add(`gs-on`),this.gs.render(0)}catch(e){console.warn(`[hud] prévia da arma indisponível`,e),this.gs=null}},toMenu(){let e=this.ctx;this.inMatch=!1,this.match.reset(),this.screens.show(`main`),e.input.enabled=!1,e.input.wantsLock=!1,e.input.exitLock(),e.time.scale=0,e.player.lookEnabled=!1,this.menuT=0},action(e){let t=this.ctx;if(!t.shot)if(e===`deploy`||e===`restart`){if(e===`restart`||!this.inMatch){this.match.start(),this.inMatch=!0;let e=t.services.world?.spawnPoints?.[0];e&&t.player.setPose(e),t.player.health=t.player.maxHealth,t.player.alive=!0,this.play.banner(P.name,`ELIMINATE ${P.target} HOSTILES  ·  ${P.map}`),t.bus.emit(`match:start`,{mode:P})}this.resume()}else e===`resume`?this.resume():e===`quit`&&(this.recordProfile(!1),this.toMenu())},resume(){let e=this.ctx;this.screens.show(null),e.input.enabled=!0,e.input.wantsLock=!0,e.player.lookEnabled=!0,e.time.scale=1,e.input.requestLock()},onLock(e){let t=this.ctx;t.shot||!e&&this.inMatch&&this.match.phase!==`end`&&!this.screens.cur&&(this.screens.show(`pause`),t.time.scale=0,t.input.enabled=!1,t.input.wantsLock=!1)},onDeath(e){this.play.death(!0,e)},onRespawn(){this.play.death(!1)},onEnd(e){let t=this.ctx;if(this.recordProfile(e),t.shot)return this.screens.show(`end`);t.time.scale=0,t.input.enabled=!1,t.input.wantsLock=!1,t.input.exitLock(),this.play.death(!1),this.screens.show(`end`)},recordProfile(e){let t=this.match;if(this._recorded===t||!t.playTime)return;this._recorded=t;let n=this.profile;n.xp+=t.xpEarned+(e?1500:300),t.xpEarned+=e?1500:300,n.kills+=t.kills,n.headshots+=t.headshots,n.matches++,e&&n.wins++,this.saveProfile()},saveProfile(){this.ctx.shot||le(this.profile)},setOption(e,t){this.settings[e]=t,!this.ctx.shot&&(H(this.settings),K(this.ctx,this.settings))},onKey(e,t){if(!this.ctx.shot){if(e.code===`Tab`&&e.preventDefault(),!t){e.code===`Tab`&&this.scoreHeld&&(this.scoreHeld=!1,this.screens.cur===`scoreboard`&&this.screens.show(null));return}if(this.screens.cur&&this.screens.cur!==`scoreboard`){this.screens.key(e.code)&&e.preventDefault();return}e.code===`Tab`&&this.inMatch&&!e.repeat&&(this.scoreHeld=!0,this.screens.show(`scoreboard`))}},virtualHit(e){!this.ctx.shot?.preset?.combat||!e?.origin||(this._vh=(this._vh||0)+1,this._vh%3==1&&(this.play.virtualHealth=Math.max(62,(this.play.virtualHealth??100)-9),this.play.damage({from:e.origin,amount:12})))},stageDemo(e){let t=this.match;t.phase=`play`,t.kills=17,t.deaths=4,t.headshots=6,t.shots=412,t.hits=151,t.score=2350,t.streak=3,t.bestStreak=7,t.longest=46.2,t.damage=3420,t.timeLeft=372,t.playTime=228,t.xpEarned=2350,t.medals={HEADSHOT:{kind:`head`,n:6},"DOUBLE KILL":{kind:`double`,n:2},LONGSHOT:{kind:`long`,n:1},BLOODTHIRSTY:{kind:`streak`,n:1}};let n=[`KESTREL`,`VOLKOV`,`RAZOR`,`NOMAD`,`HALVARD`],r=[[2,4,1],[1,4,1],[1,3,0],[0,3,1],[0,3,1]];if(n.forEach((e,n)=>t.hostile.set(e,{name:e,kills:r[n][0],deaths:r[n][1],score:r[n][0]*100+r[n][1]*10,alive:!!r[n][2]})),t.nameIdx=5,t.win=!0,e?.combat){let e=this.profile.callsign;this.play.feed({killer:`self`,victim:`NOMAD`,head:!1},e),this.play.feed({killer:`RAZOR`,victim:`self`,head:!1},e),this.play.feed({killer:`self`,victim:`KESTREL`,head:!0},e);for(let e of this.play.el.feed.children)e.style.animation=`none`;this.play.xp([[`ENEMY KILLED`,100],[`HEADSHOT`,50]],150),this.play.xpT=.5,this.play.hitmarker({head:!0,kill:!0}),this.play.hitT=-.26}},update(e,t){if(t.shot||this.match.update(e),!t.shot&&this.inMatch){let e=t.services.weapon?.ads??0;t.input.sensitivity=fe(this.settings)*(1+(this.settings.adsSens-1)*e)}},frame(e,t){let n=performance.now(),r=t.shot?1/60:Math.min(.05,(n-(this._lt||n))/1e3);this._lt=n;let i=this.screens.cur,a=i&&i!==`scoreboard`&&i!==`pause`,o=this.showHud&&!a&&(this.inMatch||t.shot);if(this._showPlay!==o&&(this._showPlay=o,this.play.root.style.display=o?``:`none`,this.play.fx.style.display=o?``:`none`),!t.shot&&!this.inMatch&&i){this.menuT=(this.menuT||0)+r;let e=t.shotPose(`menu`);e&&t.player.setPose({position:e.position,yaw:e.yaw+Math.sin(this.menuT*.07)*.09,pitch:e.pitch+Math.sin(this.menuT*.11)*.015})}let s={crosshair:!0,ads:!!t.shot?.preset?.ads,minimapRotate:this.settings.minimapRotate},c=B[this.settings.crosshair]||`#fff`;if(this._cc!==c&&(this._cc=c,this.root.style.setProperty(`--cross`,c)),o&&this.play.frame(e,t,this.match,s),this.gs&&this.gs.render(r),this.match.phase===`dead`){let e=Math.max(0,4-this.match.deadT),t=this.play.el.death.querySelector(`.cd`);t&&(t.textContent=`REDEPLOYING IN ${e.toFixed(1)}`)}},dispose(e){for(let e of this._offs||[])e?.();removeEventListener(`keydown`,this._key,!0),removeEventListener(`keyup`,this._keyUp,!0),removeEventListener(`resize`,this._rs),this.root.remove()}};export{ye as default};
//# sourceMappingURL=hud-BN-vKSxc.js.map