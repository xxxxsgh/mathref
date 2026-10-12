// Folha de estilo da HUD (DOM). A camada dinâmica (retículas, marcadores,
// mapas) é desenhada em canvas 2D; aqui fica tudo que é texto corrido,
// painéis de vidro, menus, legendas e controles de toque.
//
// Linguagem visual: "vidro de visor" — fundo azul-petróleo translúcido com
// desfoque, filetes finos ciano-gelo, cantos chanfrados (clip-path),
// tipografia Inter com espaçamento largo nos rótulos e números finos grandes.

export const PAL = {
  c: '#a6ecff', c2: 'rgba(166,236,255,0.62)', c3: 'rgba(166,236,255,0.26)', c4: 'rgba(166,236,255,0.10)',
  warn: '#ffb64d', bad: '#ff5a48', ok: '#72f0a8', gold: '#ecc77e', obj: '#f3cf7a', st: '#5fd8c0', white: '#f2f8ff',
  font: 'Inter, "SF Pro Display", "SF Pro Text", -apple-system, "Segoe UI", system-ui, sans-serif',
  fontD: '"Inter Display", Inter, "SF Pro Display", -apple-system, system-ui, sans-serif',
};

export const CSS = `
#hud{position:absolute;inset:0;pointer-events:none;color:#e9f3fb;font-family:${PAL.font};-webkit-font-smoothing:antialiased;
  --c:${PAL.c};--c2:${PAL.c2};--c3:${PAL.c3};--c4:${PAL.c4};--warn:${PAL.warn};--bad:${PAL.bad};--ok:${PAL.ok};--gold:${PAL.gold};--st:${PAL.st};
  --glass:rgba(5,12,21,.66);--glass2:rgba(8,20,32,.5);--line:rgba(166,236,255,.2);--safe-l:env(safe-area-inset-left,0px);--safe-r:env(safe-area-inset-right,0px);--safe-b:env(safe-area-inset-bottom,0px);--safe-t:env(safe-area-inset-top,0px);
  --hs:1;overflow:hidden;user-select:none;-webkit-user-select:none;z-index:5}
#hud *{box-sizing:border-box}
#hud canvas.layer{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
#hud .fadeable{transition:opacity .45s ease}
#hud.hidden-hud .fadeable{opacity:0!important}
#hud .num{font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}

/* ── rótulo de seção ── */
#hud .lbl{font:600 10px/1 ${PAL.font};letter-spacing:.32em;text-transform:uppercase;color:var(--c2)}

/* ── objetivo ── */
#hud .obj{position:absolute;left:calc(28px + var(--safe-l));top:calc(26px + var(--safe-t));width:min(360px,34vw);opacity:0;transform:translateX(-10px);transition:opacity .5s,transform .5s}
#hud .obj.on{opacity:1;transform:none}
#hud .obj .m{display:flex;align-items:center;gap:10px;font:600 10px/1 ${PAL.font};letter-spacing:.34em;text-transform:uppercase;color:var(--gold);text-shadow:0 0 10px rgba(0,0,0,.8)}
#hud .obj .m:before{content:"";width:9px;height:9px;transform:rotate(45deg);border:1.5px solid var(--gold);box-shadow:0 0 8px rgba(236,199,126,.7)}
#hud .obj .t{margin:9px 0 0 19px;font:400 14.5px/1.4 ${PAL.font};color:#f4f8fc;text-shadow:0 1px 2px #000,0 0 14px rgba(0,0,0,.75)}
#hud .obj .t b{font-weight:600;color:#fff}
#hud .obj .pg{margin:9px 0 0 19px;height:2px;background:rgba(236,199,126,.18);width:180px}
#hud .obj .pg i{display:block;height:100%;background:linear-gradient(90deg,#c9a45c,#fff0c8);box-shadow:0 0 8px rgba(236,199,126,.8);transition:width .4s}
#hud .obj .d{margin:7px 0 0 19px;font:500 10.5px/1 ${PAL.font};letter-spacing:.18em;color:var(--c2)}
#hud .obj.flash .t{animation:hudObjFlash 1.6s ease}
@keyframes hudObjFlash{0%{color:#fff3d0;text-shadow:0 0 18px rgba(255,220,150,.9)}100%{}}

/* ── notificações ── */
#hud .notes{position:absolute;right:calc(28px + var(--safe-r));top:calc(24px + var(--safe-t));display:flex;flex-direction:column;align-items:flex-end;gap:6px;width:min(420px,40vw)}
#hud .note{position:relative;display:flex;align-items:center;gap:12px;padding:9px 16px 9px 14px;min-width:220px;max-width:100%;
  background:linear-gradient(270deg,rgba(6,16,27,.78),rgba(6,16,27,.5) 70%,rgba(6,16,27,.0));
  border-right:2px solid var(--nc,var(--c));opacity:0;transform:translateX(18px);transition:opacity .35s,transform .45s cubic-bezier(.2,.9,.2,1);
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#hud .note.on{opacity:1;transform:none}
#hud .note.out{opacity:0;transform:translateX(10px)}
#hud .note .ic{flex:none;width:18px;height:18px;display:grid;place-items:center}
#hud .note .ic svg{width:18px;height:18px;stroke:var(--nc,var(--c));fill:none;stroke-width:1.6;filter:drop-shadow(0 0 4px var(--nc,var(--c)))}
#hud .note .tx{font:600 11.5px/1.35 ${PAL.font};letter-spacing:.16em;text-transform:uppercase;color:#eef6fc;text-align:right;flex:1}
#hud .note .tx small{display:block;font-weight:400;letter-spacing:.06em;text-transform:none;color:var(--c2);font-size:11.5px;margin-top:2px}
#hud .note.reward{--nc:var(--gold)}
#hud .note.warn{--nc:var(--warn)}
#hud .note.bad{--nc:var(--bad)}
#hud .note.disc{--nc:var(--ok)}
#hud .note .x{position:absolute;right:-2px;bottom:-1px;height:1px;background:var(--nc,var(--c));opacity:.7;width:100%;transform-origin:right;animation:hudNoteT linear forwards}
@keyframes hudNoteT{from{transform:scaleX(1)}to{transform:scaleX(0)}}

/* ── rádio / legendas ── */
#hud .radio{position:absolute;left:50%;bottom:calc(9vh + var(--safe-b));transform:translate(-50%,8px);display:flex;align-items:stretch;gap:0;width:min(620px,48vw);opacity:0;transition:opacity .35s,transform .45s}
#hud .radio.on{opacity:1;transform:translate(-50%,0)}
@media (max-width:900px){#hud .radio{width:84vw}}
#hud .radio .pf{position:relative;flex:none;width:76px;height:92px;background:rgba(4,10,18,.7);clip-path:polygon(0 0,100% 0,100% 82%,82% 100%,0 100%);overflow:hidden}
#hud .radio .pf canvas{width:100%;height:100%;display:block}
#hud .radio .pf:after{content:"";position:absolute;inset:0;border:1px solid var(--fc);opacity:.55;clip-path:inherit}
#hud .radio .bx{flex:1;padding:10px 18px 12px 16px;background:linear-gradient(90deg,rgba(5,12,21,.74),rgba(5,12,21,.5) 75%,rgba(5,12,21,.0));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-top:1px solid rgba(255,255,255,.06)}
#hud .radio .hd{display:flex;align-items:center;gap:10px;font:600 10.5px/1 ${PAL.font};letter-spacing:.3em;text-transform:uppercase;color:var(--fc)}
#hud .radio .hd .fa{font-weight:400;color:rgba(220,235,250,.5);letter-spacing:.22em}
#hud .radio .hd .ch{margin-left:auto;font-weight:500;color:rgba(220,235,250,.42);letter-spacing:.2em;font-size:9.5px}
#hud .radio .wv{display:inline-flex;gap:2px;align-items:center;height:12px}
#hud .radio .wv i{display:block;width:2px;height:4px;background:var(--fc);animation:hudWv .9s ease-in-out infinite}
#hud .radio .wv i:nth-child(2){animation-delay:-.2s}#hud .radio .wv i:nth-child(3){animation-delay:-.45s}#hud .radio .wv i:nth-child(4){animation-delay:-.1s}#hud .radio .wv i:nth-child(5){animation-delay:-.6s}
@keyframes hudWv{0%,100%{height:3px}50%{height:12px}}
#hud .radio .tx{margin-top:8px;font:400 clamp(15px,1.3vw,18.5px)/1.42 ${PAL.font};color:#f4f8fc;text-shadow:0 1px 2px rgba(0,0,0,.9)}
#hud .radio .tx em{font-style:normal;color:#fff1cf}
#hud .radio .tx .cur{display:inline-block;width:.5em;height:2px;background:var(--fc);margin-left:2px;vertical-align:middle;animation:hudBlink .8s steps(1) infinite}
@keyframes hudBlink{50%{opacity:0}}

/* ── prompt de interação ── */
#hud .prompt{position:absolute;left:50%;top:calc(50% + 64px);transform:translate(-50%,6px);display:flex;align-items:center;gap:12px;opacity:0;transition:opacity .25s,transform .3s}
#hud .prompt.on{opacity:1;transform:translate(-50%,0)}
#hud .key{position:relative;min-width:30px;height:30px;padding:0 8px;display:grid;place-items:center;font:700 12px/1 ${PAL.font};color:#06121d;background:var(--c);clip-path:polygon(22% 0,78% 0,100% 50%,78% 100%,22% 100%,0 50%);box-shadow:0 0 18px rgba(166,236,255,.6)}
#hud .key.pad{border-radius:50%;clip-path:none;width:30px;padding:0}
#hud .key.pad.y{background:#f2d36b}#hud .key.pad.a{background:#7ff09a}#hud .key.pad.b{background:#ff7a6a}#hud .key.pad.x{background:#79b8ff}
#hud .prompt .pt{font:600 13px/1 ${PAL.font};letter-spacing:.24em;text-transform:uppercase;color:#f1f8ff;text-shadow:0 0 10px rgba(0,0,0,.9)}
#hud .prompt .ps{display:block;margin-top:5px;font:400 11px/1 ${PAL.font};letter-spacing:.12em;text-transform:none;color:var(--c2)}
#hud .prompt .hold{position:absolute;left:-4px;top:-4px;width:38px;height:38px}

/* ── carimbo de local / alerta grande ── */
#hud .alert{position:absolute;left:50%;top:22%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity .2s}
#hud .alert.on{opacity:1}
#hud .alert .a1{font:700 clamp(16px,1.6vw,22px)/1 ${PAL.font};letter-spacing:.42em;padding-left:.42em;color:var(--bad);text-shadow:0 0 18px rgba(255,90,72,.75)}
#hud .alert .a2{margin-top:8px;font:500 11px/1 ${PAL.font};letter-spacing:.3em;color:rgba(255,200,190,.8)}

/* ── escolhas (diálogo) ── */
#hud .choice{position:absolute;left:50%;bottom:calc(13.5vh + 110px + var(--safe-b));transform:translate(-50%,10px);width:min(620px,88vw);opacity:0;transition:opacity .4s,transform .4s;pointer-events:none}
#hud .choice.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
#hud .choice .q{display:flex;align-items:center;gap:12px;margin:0 0 10px;padding:8px 0 8px 8px;font:600 11px/1 ${PAL.font};letter-spacing:.42em;text-transform:uppercase;color:var(--c);background:linear-gradient(90deg,rgba(4,10,18,.66),rgba(4,10,18,.2) 60%,transparent);text-shadow:0 0 6px #000}
#hud .choice .q:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,var(--c2),transparent)}
#hud .opt{position:relative;display:flex;align-items:center;gap:16px;margin:4px 0;padding:9px 18px 9px 12px;cursor:pointer;background:linear-gradient(90deg,rgba(6,14,24,.76),rgba(6,14,24,.32) 70%,transparent);border-left:2px solid rgba(166,236,255,.35);transition:background .2s,border-color .2s,transform .2s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#hud .opt .n{flex:none;width:22px;height:22px;display:grid;place-items:center;font:700 11.5px/1 ${PAL.font};color:#071420;background:rgba(166,236,255,.78);clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)}
#hud .opt .t{font:400 clamp(13.5px,1.1vw,16.5px)/1.32 ${PAL.font};color:#eef6fc}
#hud .opt .t small{display:block;margin-top:3px;font:500 9.5px/1.2 ${PAL.font};letter-spacing:.24em;text-transform:uppercase;color:#87a0b6}
#hud .opt.sel{background:linear-gradient(90deg,rgba(40,90,126,.84),rgba(20,52,76,.5) 70%,transparent);border-left-color:#d4f3ff;transform:translateX(4px)}
#hud .opt.sel .n{background:#fff;box-shadow:0 0 14px rgba(170,225,255,.9)}
#hud .opt.hot{border-left-color:#ff9a6a}#hud .opt.hot .n{background:#ffb08a}
#hud .opt.hot.sel{background:linear-gradient(90deg,rgba(122,50,26,.84),rgba(70,30,18,.5) 70%,transparent);border-left-color:#ffd8c2}
#hud .choice .tm{height:2px;margin:12px 0 0 4px;background:rgba(166,236,255,.15);overflow:hidden}
#hud .choice .tm i{display:block;height:100%;background:linear-gradient(90deg,var(--c),#effbff);transform-origin:left}

/* ── telas modais (pausa, painéis, mapas) ── */
#hud .modal{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .35s ease}
#hud .modal.on{opacity:1;pointer-events:auto}
#hud .scrim{position:absolute;inset:0;background:radial-gradient(130% 100% at 30% 40%,rgba(4,12,22,.55),rgba(1,4,9,.88));backdrop-filter:blur(10px) saturate(1.15);-webkit-backdrop-filter:blur(10px) saturate(1.15)}
#hud .grain{position:absolute;inset:0;opacity:.035;mix-blend-mode:overlay;background-size:256px 256px;pointer-events:none}
#hud .scan{position:absolute;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px)}

/* menu de pausa */
#hud .pause .side{position:absolute;left:calc(clamp(28px,6vw,110px) + var(--safe-l));top:0;bottom:0;width:min(400px,40vw);display:flex;flex-direction:column;justify-content:center}
#hud .pause .k{font:500 11px/1 ${PAL.font};letter-spacing:.7em;color:var(--gold);margin-bottom:16px}
#hud .pause .h{font:200 clamp(40px,4.6vw,66px)/1 ${PAL.fontD};letter-spacing:.24em;color:#f4f1ea;margin-bottom:10px}
#hud .pause .loc{font:400 12px/1.6 ${PAL.font};letter-spacing:.24em;color:#93a8bd;text-transform:uppercase;margin-bottom:34px}
#hud .pause .loc b{color:#d9e7f3;font-weight:500}
#hud .mi{position:relative;display:flex;align-items:center;gap:16px;padding:12px 0;font:400 clamp(13.5px,1.1vw,16px)/1 ${PAL.font};letter-spacing:.42em;text-transform:uppercase;color:#9fb1c3;cursor:pointer;transition:color .25s,letter-spacing .35s}
#hud .mi:before{content:"";width:16px;height:1px;background:#4f6377;transition:width .35s,background .35s}
#hud .mi .hint{margin-left:auto;font:500 10px/1 ${PAL.font};letter-spacing:.2em;color:#5d7186}
#hud .mi.sel{color:#fff;letter-spacing:.5em}
#hud .mi.sel:before{width:44px;background:var(--gold);box-shadow:0 0 10px rgba(236,199,126,.85)}
#hud .mi.dim{opacity:.4}
#hud .pause .card{position:absolute;right:calc(clamp(28px,5vw,90px) + var(--safe-r));top:50%;transform:translateY(-50%);width:min(380px,36vw)}

/* painel de vidro genérico */
#hud .glass{position:relative;background:linear-gradient(180deg,rgba(9,22,36,.74),rgba(5,12,21,.8));border:1px solid var(--line);clip-path:polygon(0 0,calc(100% - 18px) 0,100% 18px,100% 100%,18px 100%,0 calc(100% - 18px));box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}
#hud .glass:before{content:"";position:absolute;left:0;top:0;width:44px;height:2px;background:var(--c);box-shadow:0 0 10px var(--c)}
#hud .glass .gh{display:flex;align-items:center;gap:10px;padding:14px 18px 12px;border-bottom:1px solid rgba(166,236,255,.1);font:600 10.5px/1 ${PAL.font};letter-spacing:.34em;text-transform:uppercase;color:var(--c)}
#hud .glass .gh span{margin-left:auto;color:var(--c2);font-weight:500;letter-spacing:.14em;text-transform:none}
#hud .glass .gb{padding:14px 18px 18px}
#hud .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 0;font:400 12.5px/1.3 ${PAL.font};color:#c9d8e6}
#hud .row b{font-weight:600;color:#f3f8fc}
#hud .bar{position:relative;height:3px;background:rgba(166,236,255,.12);flex:1;max-width:150px}
#hud .bar i{position:absolute;left:0;top:0;bottom:0;background:var(--bc,var(--c));box-shadow:0 0 6px var(--bc,var(--c))}
#hud .bar.mid i{left:50%}
#hud .bar.mid:after{content:"";position:absolute;left:50%;top:-3px;bottom:-3px;width:1px;background:rgba(255,255,255,.35)}

/* configurações */
#hud .cfg{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:min(860px,92vw);height:min(600px,86vh);display:flex;flex-direction:column}
#hud .tabs{display:flex;gap:4px;padding:0 4px;border-bottom:1px solid rgba(166,236,255,.14)}
#hud .tab{padding:14px 18px 12px;font:600 10.5px/1 ${PAL.font};letter-spacing:.32em;text-transform:uppercase;color:#7f95aa;cursor:pointer;position:relative}
#hud .tab.on{color:#fff}
#hud .tab.on:after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;background:var(--c);box-shadow:0 0 10px var(--c)}
#hud .tabs .bump{margin-left:auto;align-self:center;display:flex;gap:6px;color:#58708a;font:500 10px/1 ${PAL.font};letter-spacing:.16em}
#hud .cfg .body{flex:1;overflow:auto;padding:10px 26px 20px;scrollbar-width:thin;scrollbar-color:rgba(166,236,255,.3) transparent}
#hud .opt2{display:flex;align-items:center;gap:20px;padding:13px 14px;margin:2px 0;border-left:2px solid transparent;cursor:pointer;transition:background .2s,border-color .2s}
#hud .opt2.sel{background:linear-gradient(90deg,rgba(40,90,126,.42),rgba(20,52,76,.12) 70%,transparent);border-left-color:var(--c)}
#hud .opt2 .nm{flex:1;font:400 13.5px/1.2 ${PAL.font};color:#e6f0f8}
#hud .opt2 .nm small{display:block;margin-top:4px;color:#7891a8;font-size:11px;letter-spacing:.02em}
#hud .opt2 .val{display:flex;align-items:center;gap:10px;min-width:250px;justify-content:flex-end}
#hud .sel3{display:flex;align-items:center;gap:12px;font:600 11px/1 ${PAL.font};letter-spacing:.24em;text-transform:uppercase;color:#fff}
#hud .sel3 .ar{width:22px;height:22px;display:grid;place-items:center;color:var(--c);opacity:.75;cursor:pointer}
#hud .sel3 .v{min-width:120px;text-align:center}
#hud .dots{display:flex;gap:4px;justify-content:center;margin-top:6px}
#hud .dots i{width:14px;height:2px;background:rgba(166,236,255,.22)}
#hud .dots i.on{background:var(--c);box-shadow:0 0 6px var(--c)}
#hud .slider{position:relative;width:180px;height:18px;cursor:pointer}
#hud .slider:before{content:"";position:absolute;left:0;right:0;top:8px;height:2px;background:rgba(166,236,255,.18)}
#hud .slider i{position:absolute;left:0;top:8px;height:2px;background:var(--c);box-shadow:0 0 8px var(--c)}
#hud .slider b{position:absolute;top:3px;width:12px;height:12px;margin-left:-6px;background:#fff;transform:rotate(45deg);box-shadow:0 0 10px var(--c)}
#hud .slider + .n{width:44px;text-align:right;font:500 12px/1 ${PAL.font};color:#cfe6f5}
#hud .tog{width:46px;height:20px;position:relative;border:1px solid rgba(166,236,255,.35);cursor:pointer}
#hud .tog i{position:absolute;top:3px;left:3px;width:12px;height:12px;background:#59708a;transition:left .25s,background .25s}
#hud .tog.on{border-color:var(--c);box-shadow:0 0 10px rgba(166,236,255,.25) inset}
#hud .tog.on i{left:29px;background:var(--c);box-shadow:0 0 8px var(--c)}
#hud .foot{display:flex;gap:22px;justify-content:flex-end;align-items:center;padding:12px 22px;border-top:1px solid rgba(166,236,255,.1);font:500 10px/1 ${PAL.font};letter-spacing:.22em;color:#7e94aa;text-transform:uppercase}
#hud .foot .k2{display:inline-grid;place-items:center;min-width:20px;height:18px;padding:0 5px;margin-right:7px;border:1px solid rgba(166,236,255,.4);color:#dff4ff;font-size:9.5px;letter-spacing:.05em}
#hud .ctl{display:grid;grid-template-columns:repeat(2,1fr);gap:4px 34px}
#hud .ctl .r{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(166,236,255,.06);font:400 12.5px/1.2 ${PAL.font};color:#c7d6e4}
#hud .ctl .r span{display:flex;gap:5px}
#hud .ctl h4{grid-column:1/-1;margin:16px 0 4px;font:600 10px/1 ${PAL.font};letter-spacing:.36em;color:var(--gold);text-transform:uppercase}

/* shell de painéis (inventário, mercado, missões, oficina, catálogo) */
#hud .shell{position:absolute;inset:calc(5vh + var(--safe-t)) calc(4vw + var(--safe-r)) calc(5vh + var(--safe-b)) calc(4vw + var(--safe-l));display:flex;flex-direction:column}
#hud .shell .top{display:flex;align-items:flex-end;gap:26px;padding:0 6px 14px;border-bottom:1px solid rgba(166,236,255,.16)}
#hud .shell .ttl{font:200 clamp(26px,2.6vw,38px)/1 ${PAL.fontD};letter-spacing:.22em;color:#f4f1ea}
#hud .shell .sub{font:500 10.5px/1 ${PAL.font};letter-spacing:.32em;color:var(--gold);margin-bottom:10px}
#hud .shell .tabs{border:0;margin-left:auto}
#hud .shell .wallet{font:500 12px/1 ${PAL.font};letter-spacing:.14em;color:#d8e8f4;display:flex;align-items:center;gap:8px;padding-bottom:4px}
#hud .shell .wallet b{font:300 22px/1 ${PAL.fontD};letter-spacing:.04em;color:#fff}
#hud .shell .content{flex:1;min-height:0;display:flex;gap:18px;padding-top:18px}
#hud .shell .list{width:min(420px,40%);overflow:auto;display:flex;flex-direction:column;gap:5px;scrollbar-width:thin;scrollbar-color:rgba(166,236,255,.3) transparent}
#hud .shell .detail{flex:1;min-width:0;overflow:auto}
#hud .item{position:relative;display:flex;align-items:center;gap:14px;padding:11px 14px;background:linear-gradient(90deg,rgba(9,22,36,.62),rgba(9,22,36,.3));border-left:2px solid rgba(166,236,255,.2);cursor:pointer;transition:background .2s,border-color .2s}
#hud .item.sel{background:linear-gradient(90deg,rgba(40,90,126,.6),rgba(20,52,76,.3));border-left-color:var(--c)}
#hud .item .ic{flex:none;width:38px;height:38px;display:grid;place-items:center;background:rgba(166,236,255,.07);clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)}
#hud .item .ic svg{width:20px;height:20px;stroke:var(--ic,var(--c));fill:none;stroke-width:1.5}
#hud .item .nm{flex:1;min-width:0;font:500 13.5px/1.25 ${PAL.font};color:#eef5fb}
#hud .item .nm small{display:block;margin-top:3px;font:500 9.5px/1.2 ${PAL.font};letter-spacing:.22em;text-transform:uppercase;color:#7e95ab}
#hud .item .q{font:300 18px/1 ${PAL.fontD};color:#fff}
#hud .item .tag{font:600 9px/1 ${PAL.font};letter-spacing:.2em;padding:4px 6px;border:1px solid currentColor;color:var(--gold)}
#hud .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;height:100%;min-height:200px;color:#6f869c;font:500 11px/1.6 ${PAL.font};letter-spacing:.3em;text-transform:uppercase;text-align:center}
#hud .empty svg{width:54px;height:54px;stroke:rgba(166,236,255,.35);fill:none;stroke-width:1}
#hud .dt h3{margin:0 0 6px;font:300 26px/1.1 ${PAL.fontD};letter-spacing:.06em;color:#fff}
#hud .dt .kk{font:600 10px/1 ${PAL.font};letter-spacing:.32em;color:var(--gold);text-transform:uppercase;margin-bottom:12px}
#hud .dt p{font:400 13.5px/1.6 ${PAL.font};color:#b9cad9;max-width:640px}
#hud .btn{display:inline-flex;align-items:center;gap:10px;padding:11px 20px;margin:14px 10px 0 0;font:600 11px/1 ${PAL.font};letter-spacing:.3em;text-transform:uppercase;color:#06121d;background:var(--c);cursor:pointer;clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px);box-shadow:0 0 20px rgba(166,236,255,.35)}
#hud .btn.ghost{background:transparent;color:var(--c);box-shadow:none;outline:1px solid rgba(166,236,255,.4);outline-offset:-1px}
#hud .btn.sel{filter:brightness(1.15);box-shadow:0 0 26px rgba(166,236,255,.6)}

/* mapas: barra lateral de informação */
#hud .mapui{position:absolute;inset:0}
#hud .mapui .hdr{position:absolute;left:calc(32px + var(--safe-l));top:calc(26px + var(--safe-t))}
#hud .mapui .hdr .k{font:500 10.5px/1 ${PAL.font};letter-spacing:.6em;color:var(--gold)}
#hud .mapui .hdr .h{margin-top:12px;font:200 clamp(30px,3.2vw,46px)/1 ${PAL.fontD};letter-spacing:.22em;color:#f4f1ea}
#hud .mapui .hdr .s{margin-top:10px;font:400 11.5px/1.5 ${PAL.font};letter-spacing:.24em;color:#8ea4b9;text-transform:uppercase}
#hud .mapui .info{position:absolute;right:calc(28px + var(--safe-r));top:calc(26px + var(--safe-t));width:min(340px,32vw)}
#hud .mapui .legend{position:absolute;left:calc(32px + var(--safe-l));bottom:calc(24px + var(--safe-b));display:flex;gap:22px;font:500 9.5px/1 ${PAL.font};letter-spacing:.24em;color:#7c93a9;text-transform:uppercase}
#hud .mapui .legend span{display:flex;align-items:center;gap:8px}
#hud .mapui .legend i{width:9px;height:9px;display:inline-block}
#hud .mapui .keys{position:absolute;right:calc(28px + var(--safe-r));bottom:calc(24px + var(--safe-b));display:flex;gap:20px;font:500 10px/1 ${PAL.font};letter-spacing:.2em;color:#7e94aa;text-transform:uppercase}
#hud .mapui .keys .k2{display:inline-grid;place-items:center;min-width:20px;height:18px;padding:0 5px;margin-right:7px;border:1px solid rgba(166,236,255,.4);color:#dff4ff;font-size:9.5px;letter-spacing:.05em}
#hud .mapui .switch{position:absolute;left:50%;top:calc(26px + var(--safe-t));transform:translateX(-50%);display:flex;gap:2px;pointer-events:auto}
#hud .mapui .switch div{padding:10px 18px;font:600 10px/1 ${PAL.font};letter-spacing:.32em;color:#7f95aa;background:rgba(5,12,21,.55);cursor:pointer;border-bottom:1px solid rgba(166,236,255,.14)}
#hud .mapui .switch div.on{color:#fff;border-bottom:2px solid var(--c);background:rgba(20,48,70,.6)}
#hud .chip{display:inline-block;padding:4px 7px;margin:0 6px 6px 0;font:600 9px/1 ${PAL.font};letter-spacing:.2em;text-transform:uppercase;color:#cfe7f6;background:rgba(166,236,255,.08);border:1px solid rgba(166,236,255,.18)}
#hud .chip.w{color:var(--warn);border-color:rgba(255,182,77,.4);background:rgba(255,182,77,.07)}
#hud .chip.b{color:var(--bad);border-color:rgba(255,90,72,.45);background:rgba(255,90,72,.07)}

/* ── controles de toque ── */
#hud .touch{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .4s}
#hud .touch.on{opacity:1}
#hud .touch .zone{position:absolute;pointer-events:auto;touch-action:none}
#hud .stick{position:absolute;width:150px;height:150px;margin:-75px 0 0 -75px;pointer-events:none;transition:opacity .25s}
#hud .stick .ring{position:absolute;inset:0;border-radius:50%;border:1.5px solid rgba(166,236,255,.35);background:radial-gradient(circle,rgba(166,236,255,.02) 40%,rgba(166,236,255,.1) 70%,rgba(5,12,21,.25) 71%);box-shadow:0 0 22px rgba(0,0,0,.35) inset}
#hud .stick .ring:before,#hud .stick .ring:after{content:"";position:absolute;left:50%;top:6px;bottom:6px;width:1px;background:linear-gradient(180deg,rgba(166,236,255,.5),transparent 22%,transparent 78%,rgba(166,236,255,.5))}
#hud .stick .ring:after{transform:rotate(90deg)}
#hud .stick .nub{position:absolute;left:50%;top:50%;width:58px;height:58px;margin:-29px 0 0 -29px;border-radius:50%;background:radial-gradient(circle at 40% 35%,rgba(230,248,255,.55),rgba(120,200,240,.22) 55%,rgba(40,90,130,.25));border:1.5px solid rgba(200,240,255,.8);box-shadow:0 0 18px rgba(166,236,255,.45)}
#hud .stick .cap{position:absolute;left:50%;top:-22px;transform:translateX(-50%);font:600 9px/1 ${PAL.font};letter-spacing:.3em;color:rgba(166,236,255,.65);white-space:nowrap}
#hud .tb{position:absolute;pointer-events:auto;touch-action:none;display:grid;place-items:center;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;
  background:radial-gradient(circle at 50% 40%,rgba(30,64,92,.55),rgba(5,12,21,.55));border:1.5px solid rgba(166,236,255,.42);box-shadow:0 0 14px rgba(0,0,0,.4),inset 0 0 12px rgba(166,236,255,.08);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);transition:transform .12s,background .12s,opacity .3s}
#hud .tb svg{width:26px;height:26px;stroke:#dff5ff;fill:none;stroke-width:1.7;filter:drop-shadow(0 0 3px rgba(166,236,255,.6))}
#hud .tb .l{position:absolute;bottom:-17px;left:50%;transform:translateX(-50%);font:600 8.5px/1 ${PAL.font};letter-spacing:.22em;color:rgba(200,236,255,.72);white-space:nowrap}
#hud .tb.big{width:88px;height:88px;margin:-44px 0 0 -44px;border-color:rgba(255,140,110,.7);background:radial-gradient(circle at 50% 40%,rgba(120,40,30,.55),rgba(30,8,6,.55))}
#hud .tb.big svg{width:34px;height:34px;stroke:#ffe1d8}
#hud .tb.sm{width:50px;height:50px;margin:-25px 0 0 -25px}
#hud .tb.sm svg{width:21px;height:21px}
#hud .tb.dn{transform:scale(.9);background:radial-gradient(circle,rgba(166,236,255,.5),rgba(40,100,140,.5))}
#hud .tb.tg{border-color:var(--c);box-shadow:0 0 16px rgba(166,236,255,.45)}
#hud .tb.off{opacity:0;pointer-events:none}
#hud .tb.ctx{border-color:var(--gold);box-shadow:0 0 18px rgba(236,199,126,.5)}
#hud .tb.ctx svg{stroke:#fff1d0}
#hud .tthr{position:absolute;width:44px;height:200px;margin:-100px 0 0 -22px;pointer-events:auto;touch-action:none;border:1.5px solid rgba(166,236,255,.35);background:linear-gradient(0deg,rgba(5,12,21,.5),rgba(5,12,21,.3));clip-path:polygon(0 8px,8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%)}
#hud .tthr i{position:absolute;left:4px;right:4px;bottom:4px;background:linear-gradient(0deg,rgba(166,236,255,.25),rgba(166,236,255,.7));box-shadow:0 0 10px rgba(166,236,255,.5)}
#hud .tthr .tk{position:absolute;left:0;right:0;height:1px;background:rgba(166,236,255,.35)}
#hud .tthr .cap{position:absolute;top:-20px;left:50%;transform:translateX(-50%);font:600 8.5px/1 ${PAL.font};letter-spacing:.24em;color:rgba(166,236,255,.7)}
#hud .lookhint{position:absolute;pointer-events:none;width:72px;height:72px;margin:-36px 0 0 -36px;border-radius:50%;border:1px solid rgba(166,236,255,.5);opacity:0;transition:opacity .2s}
#hud .lookhint.on{opacity:.8}
#hud .ttop{position:absolute;top:calc(14px + var(--safe-t));right:calc(18px + var(--safe-r));display:flex;gap:12px;pointer-events:auto}
#hud .ttop .tb{position:relative;margin:0;width:46px;height:46px;border-radius:12px}
#hud .ttop .tb svg{width:20px;height:20px}

/* modo toque: rádio no alto, notificações abaixo dos atalhos */
#hud.touchmode .radio{bottom:auto;top:calc(92px + var(--safe-t))}
#hud.touchmode .notes{top:calc(200px + var(--safe-t));width:min(300px,30vw)}
#hud.touchmode .prompt{top:calc(50% + 90px)}

/* tela de dano / vinheta */
#hud .vig{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .25s}
`;
