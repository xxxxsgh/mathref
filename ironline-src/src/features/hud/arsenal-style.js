/**
 * Estilo do ARSENAL (inventário, caixas, roleta, inspeção, contrato, passe,
 * diário, maestria, coleção, perfil), da carteira do topo, do seletor de
 * armas do loadout, do relatório de créditos e da barra de killstreaks.
 * Mesma linguagem das telas de menu (style.js): placas escuras, linhas
 * finas, âmbar de destaque, fonte vetorial própria.
 */
export const ARS_CSS = /* css */ `
/* ── qualidade baixa / celular / lite: sem backdrop-filter (caro na GPU) ── */
#hud.lowfx *, #hud.lowfx .shade-full { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }
#hud.lowfx .desat, #hud.lowfx .dof, #hud.lowfx .grain { display: none !important; }

/* ── carteira (topo) ─────────────────────────────────────────────────── */
#hud .topbar .wallet { display: flex; align-items: center; gap: 14px; margin-left: auto; margin-right: -28px; }
#hud .wallet .wc { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 14px; background: rgba(9,11,13,.6); border: 1px solid rgba(255,255,255,.1); cursor: pointer; }
#hud .wallet .wc:hover { border-color: rgba(226,180,90,.5); }
#hud .wallet .wc .l { color: var(--ink3); }
#hud .wallet .wc.dly { color: var(--amber); border-color: rgba(226,180,90,.55); animation: wcPulse 1.6s ease-in-out infinite; }
@keyframes wcPulse { 50% { box-shadow: 0 0 16px rgba(226,180,90,.35); } }
#hud .tab .bd, #hud .an .bd { position: absolute; top: 18px; right: 4px; min-width: 20px; height: 20px; padding: 0 5px; display: flex; align-items: center; justify-content: center; background: var(--amber); color: #121110; border-radius: 10px; }
#hud .tab .bd.dot, #hud .an .bd.dot { min-width: 9px; width: 9px; height: 9px; padding: 0; top: 10px; }

/* ── casca ───────────────────────────────────────────────────────────── */
#hud .ars { position: absolute; left: 96px; right: 96px; top: 126px; bottom: 84px; }
#hud .ars-nav { display: flex; gap: 4px; height: 50px; border-bottom: 1px solid var(--line); }
#hud .ars-nav .an { position: relative; display: flex; align-items: center; padding: 0 22px 0 18px; color: var(--ink3); cursor: pointer; }
#hud .ars-nav .an:hover { color: var(--ink); background: rgba(255,255,255,.03); }
#hud .ars-nav .an.on { color: var(--ink); background: linear-gradient(180deg, rgba(226,180,90,0), rgba(226,180,90,.08)); }
#hud .ars-nav .an.on::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -1px; height: 3px; background: var(--amber); box-shadow: 0 0 12px rgba(226,180,90,.6); }
#hud .ars-nav .an .bd { top: 6px; right: 0; }
#hud .ars-body { position: absolute; left: 0; right: 0; top: 70px; bottom: 0; }
#hud .ars-empty { position: absolute; left: 0; right: 0; top: 480px; text-align: center; color: var(--ink3); }
#hud .ars .k { color: var(--ink3); display: block; margin-bottom: 8px; }
#hud .ars .mono { font-size: 12px; }
#hud .ars .xpb { height: 6px; background: rgba(255,255,255,.1); position: relative; overflow: hidden; }
#hud .ars .xpb i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #b58a3e, var(--amber)); box-shadow: 0 0 10px rgba(226,180,90,.5); }
#hud .ars .xpb.big { height: 10px; }
#hud .ars .empty { grid-column: 1 / -1; padding: 60px 0; text-align: center; color: var(--ink3); }
#hud .ars .eyebrow { margin-bottom: 18px; }
#hud .ars .dsub { margin-top: 12px; color: var(--ink2); max-width: 900px; line-height: 1.5; }
#hud .ars .amb { color: var(--amber); }
#hud .chips { display: flex; flex-wrap: wrap; gap: 6px; }
#hud .chip { display: inline-flex; align-items: center; gap: 7px; height: 30px; padding: 0 11px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.03); color: var(--ink2); cursor: pointer; }
#hud .chip:hover { color: var(--ink); border-color: rgba(255,255,255,.25); }
#hud .chip.on { color: #121110; background: var(--amber); border-color: var(--amber); }
#hud .chip .dot { width: 9px; height: 9px; transform: rotate(45deg); }
#hud .abtn { display: flex; align-items: center; gap: 10px; justify-content: space-between; height: 42px; padding: 0 14px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); cursor: pointer; color: var(--ink); }
#hud .abtn:hover { border-color: rgba(226,180,90,.55); background: rgba(226,180,90,.08); }
#hud .abtn.off { opacity: .4; pointer-events: none; }
#hud .abtn.warn, #hud .btn.warn { border-color: var(--red2); color: var(--red2); background: rgba(217,72,61,.12); }
#hud .abtn .r { display: flex; align-items: center; gap: 8px; color: var(--amber); }
#hud .abtn.sm { height: 32px; }
#hud .btn.off { opacity: .35; pointer-events: none; }
#hud .btn.sm { height: 48px; }

/* ── cartão de item ──────────────────────────────────────────────────── */
#hud .icd { position: relative; height: 186px; background: linear-gradient(180deg, rgba(22,26,30,.92), rgba(12,14,17,.95)); border: 1px solid rgba(255,255,255,.08); cursor: pointer; overflow: hidden; transition: transform .12s, border-color .12s; }
#hud .icd:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--rc) 70%, transparent); }
#hud .icd .gl { position: absolute; left: 0; right: 0; bottom: 0; height: 120px; background: radial-gradient(ellipse 70% 90% at 50% 100%, color-mix(in srgb, var(--rc) 34%, transparent), transparent 70%); }
#hud .icd .th { position: absolute; left: 8px; right: 8px; top: 10px; width: calc(100% - 16px); height: 108px; object-fit: contain; filter: drop-shadow(0 6px 8px rgba(0,0,0,.5)); }
#hud .icd .mt { position: absolute; left: 12px; right: 10px; bottom: 30px; display: flex; flex-direction: column; gap: 5px; }
#hud .icd .mt .bn { color: var(--ink3); }
#hud .icd .ws { position: absolute; left: 12px; right: 10px; bottom: 10px; display: flex; gap: 10px; align-items: center; color: var(--ink3); }
#hud .icd .ws .mono { font-size: 11px; }
#hud .icd .ws .ctr { margin-left: auto; color: #ea8a5a; }
#hud .icd .rb { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--rc); box-shadow: 0 0 10px var(--rc); }
#hud .icd .nb { position: absolute; left: 0; top: 0; padding: 5px 8px; background: var(--amber); color: #121110; }
#hud .icd .eb { position: absolute; right: 8px; top: 8px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: #121110; background: #7fe3bd; border-radius: 50%; }
#hud .icd .sb { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(226,180,90,.18); color: var(--amber); border: 2px solid var(--amber); }
#hud .icd.sel { border-color: var(--amber); }
#hud .icd.kn { background: linear-gradient(180deg, rgba(40,32,14,.92), rgba(14,12,8,.95)); }
#hud .icd.small { height: 132px; }
#hud .icd.small .th { height: 70px; top: 6px; }
#hud .icd.small .mt { bottom: 10px; }
#hud .icd.small .mt .bn, #hud .icd.small .ws { display: none; }

#hud .dc { position: relative; height: 112px; background: linear-gradient(180deg, rgba(22,26,30,.9), rgba(12,14,17,.92)); border: 1px solid rgba(255,255,255,.07); overflow: hidden; }
#hud .dc img { position: absolute; left: 6px; right: 6px; top: 6px; width: calc(100% - 12px); height: 60px; object-fit: contain; }
#hud .dc .n { position: absolute; left: 10px; bottom: 26px; right: 6px; }
#hud .dc .p { position: absolute; left: 10px; bottom: 9px; color: var(--ink3); }
#hud .dc .p .mono { font-size: 11px; }
#hud .dc .rb { position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--rc); }
#hud .dc::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 70% 70% at 50% 100%, color-mix(in srgb, var(--rc) 22%, transparent), transparent 70%); }
#hud .dc.miss img { filter: grayscale(1) brightness(.18) contrast(1.4); }
#hud .dc.miss .n { opacity: .35; }
#hud .dc.xs { height: 88px; }
#hud .dc.xs img { height: 46px; }
#hud .dc.xs .n { bottom: 9px; }
#hud .dc.spec { border-color: color-mix(in srgb, var(--rc) 60%, transparent); background: linear-gradient(160deg, rgba(60,46,16,.95), rgba(16,13,8,.95)); }
#hud .dc.spec .kst { position: absolute; left: 8px; right: 8px; top: 4px; height: 66px; }
#hud .dc.spec .kst img { position: absolute; width: 70%; height: 36px; left: 15%; }
#hud .dc.spec .kst img:nth-child(1) { top: 0; transform: rotate(-12deg); }
#hud .dc.spec .kst img:nth-child(2) { top: 16px; }
#hud .dc.spec .kst img:nth-child(3) { top: 32px; transform: rotate(10deg); }

/* ── INVENTÁRIO ──────────────────────────────────────────────────────── */
#hud .t-inventario .filt { position: absolute; left: 0; top: 0; bottom: 0; width: 330px; padding: 18px; display: flex; flex-direction: column; gap: 18px; }
#hud .filt .srch { width: 100%; height: 44px; padding: 0 14px; background: rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.14); color: var(--ink); font: 600 14px/1 var(--sans); letter-spacing: .12em; outline: none; }
#hud .filt .srch:focus { border-color: var(--amber); }
#hud .filt .srch::placeholder { color: var(--ink3); }
#hud .filt .fact { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
#hud .filt .fnote { color: var(--ink3); line-height: 1.5; }
#hud .filt .fnote .mono { font-size: 10px; text-transform: uppercase; }
#hud .gridw { position: absolute; left: 350px; right: 0; top: 0; bottom: 0; }
#hud .gh { display: flex; align-items: center; justify-content: space-between; height: 44px; }
#hud .gh .cnt { display: flex; align-items: center; gap: 8px; color: var(--ink2); }
#hud .gh .nwc { margin-left: 12px; padding: 4px 8px; background: rgba(226,180,90,.15); color: var(--amber); }
#hud .gh .srt { display: flex; gap: 2px; }
#hud .gh .srt b { padding: 8px 12px; color: var(--ink3); cursor: pointer; border-bottom: 2px solid transparent; }
#hud .gh .srt b.on { color: var(--ink); border-bottom-color: var(--amber); }
#hud .grid { position: absolute; left: 0; right: 0; top: 54px; bottom: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(6, 1fr); grid-auto-rows: 186px; gap: 12px; padding: 2px 10px 20px 2px; align-content: start; }
#hud .grid.g5 { grid-template-columns: repeat(4, 1fr); }
#hud .grid::-webkit-scrollbar, #hud .bptrack::-webkit-scrollbar, #hud .ag::-webkit-scrollbar { width: 6px; }
#hud .grid::-webkit-scrollbar-thumb, #hud .ag::-webkit-scrollbar-thumb { background: rgba(255,255,255,.18); }

/* ── inspeção ────────────────────────────────────────────────────────── */
#hud .insp { position: absolute; inset: 0; opacity: 0; transition: opacity .25s; z-index: 5; }
#hud .insp.on { opacity: 1; }
#hud .insp .ib { position: absolute; inset: 0; background: radial-gradient(ellipse 60% 70% at 34% 55%, rgba(30,36,42,.94), rgba(4,5,7,.97)); }
#hud .insp .ivh { position: absolute; left: 60px; top: 150px; width: 1140px; height: 760px; }
#hud .insp .ivhint, #hud .opn .ivhint { position: absolute; left: 60px; top: 930px; width: 1140px; text-align: center; color: var(--ink3); }
#hud .ivfb { width: 100%; height: 100%; object-fit: contain; }
#hud .ipanel, #hud .rvi { position: absolute; right: 96px; top: 150px; width: 580px; padding: 26px 30px; border-top: 3px solid var(--rc); }
#hud .ipanel .rtag, #hud .rvi .rtag { display: flex; align-items: center; gap: 14px; color: var(--rc); }
#hud .rtag span { padding: 4px 8px; border: 1px solid currentColor; }
#hud .ipanel .bnm, #hud .rvi .bnm { margin-top: 22px; color: var(--ink2); }
#hud .ipanel .snm, #hud .rvi .snm { margin-top: 10px; }
#hud .kv2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 24px; margin-top: 28px; padding-top: 22px; border-top: 1px solid var(--line); }
#hud .kv2.sm { margin-top: 22px; }
#hud .kv2 .cr { display: flex; align-items: center; gap: 8px; color: var(--amber); }
#hud .kv2 .mono { font-size: 15px; }
#hud .wbar { position: relative; height: 8px; margin-top: 22px; background: rgba(255,255,255,.08); }
#hud .wbar i { position: absolute; top: 0; bottom: 0; opacity: .75; }
#hud .wbar b { position: absolute; top: -6px; width: 3px; height: 20px; margin-left: -1.5px; background: #fff; box-shadow: 0 0 8px #fff; }
#hud .wlab { position: relative; height: 18px; margin-top: 6px; color: var(--ink3); }
#hud .wlab span { position: absolute; transform: translateX(-50%); }
#hud .wlab .mono { font-size: 10px; }
#hud .cbases { margin-top: 22px; }
#hud .iacts { display: flex; flex-direction: column; gap: 8px; margin-top: 28px; }
#hud .iacts .btns { width: auto; }
#hud .iacts .row2 { display: flex; gap: 8px; }
#hud .iacts .row2 .btn { flex: 1; }
#hud .iacts .btn { width: 100%; margin: 0; }
#hud .iacts .hint { display: flex; align-items: center; gap: 6px; }
#hud .iacts .eqd { display: flex; align-items: center; gap: 6px; color: #7fe3bd; }

/* ── CAIXAS ──────────────────────────────────────────────────────────── */
#hud .cases { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; height: 330px; }
#hud .case { position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,.1); background: #0a0c0f; cursor: pointer; transition: border-color .15s, transform .15s; }
#hud .case:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.25); }
#hud .case.on { border-color: var(--cc); box-shadow: 0 0 0 1px var(--cc), 0 0 30px color-mix(in srgb, var(--cc) 25%, transparent); }
#hud .case .art { position: absolute; left: 0; right: 0; top: 0; height: 236px; background-size: cover; background-position: center 60%; }
#hud .case .cn { position: absolute; left: 22px; top: 18px; display: flex; flex-direction: column; gap: 8px; }
#hud .case .cn .mono { color: var(--cc); }
#hud .case .cn .tg { color: var(--ink2); }
#hud .case .ob { position: absolute; left: 0; right: 0; bottom: 0; height: 96px; padding: 12px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-content: center; background: linear-gradient(180deg, rgba(10,12,15,.4), rgba(10,12,15,.96) 30%); }
#hud .obtn { display: flex; align-items: center; justify-content: center; gap: 10px; height: 52px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.16); color: var(--ink); cursor: pointer; }
#hud .obtn:first-child { background: var(--amber); color: #121110; border-color: transparent; }
#hud .obtn:hover { filter: brightness(1.15); }
#hud .obtn.off { opacity: .35; pointer-events: none; }
#hud .cdet { position: absolute; left: 0; right: 0; top: 346px; bottom: 0; display: grid; grid-template-columns: 560px 1fr; gap: 16px; }
#hud .odds table { width: 100%; border-collapse: collapse; }
#hud .odds th { text-align: left; padding: 10px 20px 6px; color: var(--ink3); }
#hud .odds td { padding: 7px 20px; border-top: 1px solid rgba(255,255,255,.05); color: var(--ink2); }
#hud .odds td:first-child { display: flex; align-items: center; gap: 12px; color: var(--rc); }
#hud .odds td .sw { width: 10px; height: 10px; background: var(--rc); transform: rotate(45deg); box-shadow: 0 0 8px var(--rc); }
#hud .odds td.pc { color: var(--ink); }
#hud .pol { padding: 10px 20px; color: var(--ink3); line-height: 1.55; border-top: 1px solid var(--line); }
#hud .pol .mono { font-size: 10.5px; text-transform: uppercase; }
#hud .cont { position: relative; }
#hud .dgrid { position: absolute; left: 0; right: 0; top: 52px; bottom: 0; padding: 14px; display: grid; grid-template-columns: repeat(7, 1fr); grid-auto-rows: 112px; gap: 10px; overflow-y: auto; }

/* ── abertura (roleta) e revelação ───────────────────────────────────── */
#hud .opn { position: absolute; inset: 0; z-index: 6; opacity: 0; transition: opacity .3s; }
#hud .opn.on { opacity: 1; }
#hud .opn .ob2 { position: absolute; inset: 0; background: radial-gradient(ellipse 70% 55% at 50% 45%, color-mix(in srgb, var(--cc, #e2b45a) 18%, rgba(8,10,12,.96)), rgba(3,4,6,.98) 75%); }
#hud .opn .oh { position: absolute; left: 0; right: 0; top: 150px; display: flex; flex-direction: column; align-items: center; gap: 14px; }
#hud .opn .oh .mono { color: var(--cc); }
#hud .reel { position: absolute; left: 96px; width: ${1728}px; top: 340px; height: 260px; overflow: hidden; background: linear-gradient(180deg, rgba(0,0,0,.55), rgba(0,0,0,.35)); border-top: 1px solid rgba(255,255,255,.12); border-bottom: 1px solid rgba(255,255,255,.12); cursor: pointer; }
#hud .reel .strip { position: absolute; left: 0; top: 20px; height: 220px; will-change: transform; }
#hud .reel .rc { position: absolute; top: 0; width: 200px; height: 220px; background: linear-gradient(180deg, rgba(26,30,35,.95), rgba(12,14,17,.98)); border: 1px solid rgba(255,255,255,.07); overflow: hidden; }
#hud .reel .rc::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 80% 70% at 50% 100%, color-mix(in srgb, var(--rc) 40%, transparent), transparent 70%); }
#hud .reel .rc img { position: absolute; left: 8px; top: 30px; width: 184px; height: 110px; object-fit: contain; }
#hud .reel .rc .n { position: absolute; left: 12px; right: 8px; bottom: 22px; }
#hud .reel .rc .rb { position: absolute; left: 0; right: 0; bottom: 0; height: 5px; background: var(--rc); box-shadow: 0 0 14px var(--rc); }
#hud .reel .rc.kn { background: linear-gradient(160deg, rgba(70,54,18,.98), rgba(18,14,8,.98)); }
#hud .reel .rc .q { position: absolute; left: 0; right: 0; top: 50px; text-align: center; font: 800 64px/1 var(--sans); color: var(--rc); text-shadow: 0 0 20px var(--rc); }
#hud .reel .mk { position: absolute; left: 863px; top: 0; bottom: 0; width: 3px; background: var(--amber); box-shadow: 0 0 14px var(--amber), 0 0 3px #fff; z-index: 2; }
#hud .reel .mk.b { top: -2px; bottom: auto; width: 0; height: 0; left: 853px; background: none; box-shadow: none; border-left: 12px solid transparent; border-right: 12px solid transparent; border-top: 16px solid var(--amber); }
#hud .reel .fade { position: absolute; top: 0; bottom: 0; width: 260px; z-index: 1; pointer-events: none; }
#hud .reel .fade.l { left: 0; background: linear-gradient(90deg, rgba(4,5,7,.95), transparent); }
#hud .reel .fade.r { right: 0; background: linear-gradient(-90deg, rgba(4,5,7,.95), transparent); }
#hud .opn.stopped .reel .mk { animation: mkHit .5s ease-out both; }
@keyframes mkHit { 0% { box-shadow: 0 0 40px #fff, 0 0 80px var(--amber); } 100% { box-shadow: 0 0 14px var(--amber); } }
#hud .opn .ofoot { position: absolute; left: 0; right: 0; top: 640px; text-align: center; color: var(--ink3); }
#hud .opn.rv .reel, #hud .opn.rv .oh, #hud .opn.rv .ofoot { opacity: 0; transition: opacity .3s; pointer-events: none; }
#hud .opn.rv .ob2 { background: radial-gradient(ellipse 55% 60% at 32% 52%, color-mix(in srgb, var(--rc) 22%, rgba(10,12,14,.97)), rgba(3,4,6,.98) 72%); }
#hud .flash3 { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(ellipse 60% 60% at 50% 50%, #fff, var(--rc) 30%, transparent 75%); opacity: 0; animation: rarFlash 1.1s ease-out both; }
#hud .flash3.pin { animation: none; opacity: 0; }
@keyframes rarFlash { 0% { opacity: 0; } 8% { opacity: .95; } 100% { opacity: 0; } }
#hud .rev { position: absolute; inset: 0; animation: revIn .6s .15s cubic-bezier(.2,.9,.3,1) both; }
#hud .rev.pin { animation: none; }
@keyframes revIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: none; } }
#hud .rev .rvh { position: absolute; left: 70px; top: 170px; width: 1060px; height: 700px; }
#hud .rvi { top: 190px; box-shadow: 0 0 60px color-mix(in srgb, var(--rc) 22%, transparent); }

/* ── CONTRATO ────────────────────────────────────────────────────────── */
#hud .t-contrato .tl { position: absolute; left: 0; top: 0; bottom: 0; width: 860px; display: flex; flex-direction: column; }
#hud .t-contrato .tr { display: flex; gap: 8px; }
#hud .t-contrato .tr .chip { height: 38px; }
#hud .t-contrato .tr .ar { opacity: .65; }
#hud .slots10 { display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: 132px; gap: 10px; margin-top: 16px; }
#hud .slot0 { display: flex; align-items: center; justify-content: center; border: 1px dashed rgba(255,255,255,.18); color: var(--ink3); background: rgba(255,255,255,.02); }
#hud .tmeta { display: flex; align-items: center; gap: 14px; margin-top: 12px; color: var(--ink2); }
#hud .tmeta .sp { flex: 1; }
#hud .outs { margin-top: 12px; flex: 1; display: flex; flex-direction: column; min-height: 0; }
#hud .outs .ol { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: 112px; gap: 10px; padding: 14px; overflow-y: auto; align-content: start; }
#hud .t-contrato .sign { margin-top: 12px; height: 70px; }
#hud .t-contrato .trr { position: absolute; left: 884px; right: 0; top: 0; bottom: 0; }
#hud .t-contrato .trr .gh { color: var(--ink3); }

/* ── PASSE ───────────────────────────────────────────────────────────── */
#hud .bph { display: grid; grid-template-columns: 1fr 180px 560px 280px; gap: 30px; align-items: center; height: 140px; }
#hud .bph .bpt { display: flex; flex-direction: column; gap: 10px; }
#hud .bph .bpt .mono { color: var(--amber); }
#hud .bph .free { color: #7fe3bd; }
#hud .bpl, #hud .dst { display: flex; flex-direction: column; align-items: flex-start; }
#hud .bpl .of, #hud .dst .of { color: var(--ink3); margin-top: 6px; }
#hud .bpx .xr { display: flex; align-items: center; gap: 12px; margin-top: 12px; color: var(--ink2); }
#hud .bpx .xr .r { margin-left: auto; color: var(--ink3); }
#hud .bph .bpall { margin: 0; width: 280px; justify-content: center; }
#hud .bptrack { margin-top: 26px; display: grid; grid-template-columns: repeat(10, 1fr); grid-auto-rows: 196px; gap: 10px; }
#hud .bpt1 { position: relative; border: 1px solid rgba(255,255,255,.08); background: linear-gradient(180deg, rgba(20,24,28,.92), rgba(10,12,15,.95)); overflow: hidden; }
#hud .bpt1 .tn { position: absolute; left: 10px; top: 10px; color: var(--ink3); }
#hud .bpt1 .rw { position: absolute; left: 0; right: 0; top: 40px; height: 84px; display: flex; align-items: center; justify-content: center; }
#hud .bpt1 .rl { position: absolute; left: 10px; right: 8px; bottom: 34px; color: var(--ink2); }
#hud .bpt1 .st { position: absolute; left: 0; right: 0; bottom: 0; height: 26px; display: flex; align-items: center; justify-content: center; gap: 6px; color: #7fe3bd; background: rgba(127,227,189,.08); }
#hud .bpt1 .st.r { color: #121110; background: var(--amber); }
#hud .bpt1 .st.l { color: var(--ink3); background: rgba(255,255,255,.03); }
#hud .bpt1 .st.n { color: var(--amber); background: rgba(226,180,90,.1); }
#hud .bpt1::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in srgb, var(--rc) 20%, transparent), transparent 70%); }
#hud .bpt1.lock .rw, #hud .bpt1.lock .rl { opacity: .38; filter: saturate(.3); }
#hud .bpt1.got .rw { opacity: .55; }
#hud .bpt1.ready { border-color: var(--amber); cursor: pointer; animation: wcPulse 1.6s ease-in-out infinite; }
#hud .bpt1.next { border-color: rgba(226,180,90,.45); }
#hud .bpt1.big { border-color: color-mix(in srgb, var(--rc) 55%, transparent); }
#hud .bpt1 .pg { position: absolute; left: 0; bottom: 26px; height: 3px; background: var(--amber); }
#hud .ic2 { display: inline-flex; align-items: center; gap: 8px; }
#hud .cimg { display: block; width: 140px; height: 36px; background-size: cover; background-position: center; border: 1px solid rgba(255,255,255,.2); }

/* ── DIÁRIO ──────────────────────────────────────────────────────────── */
#hud .dh { display: grid; grid-template-columns: 1fr 200px 300px; gap: 30px; align-items: center; height: 170px; }
#hud .dh > div:first-child .mono:first-child { color: var(--amber); }
#hud .dnx { display: flex; flex-direction: column; }
#hud .days { margin-top: 30px; display: grid; grid-template-columns: repeat(7, 1fr); gap: 14px; height: 400px; }
#hud .day { position: relative; border: 1px solid rgba(255,255,255,.09); background: linear-gradient(180deg, rgba(20,24,28,.92), rgba(10,12,15,.95)); overflow: hidden; }
#hud .day .dn { position: absolute; left: 18px; top: 18px; display: flex; flex-direction: column; gap: 8px; color: var(--ink3); }
#hud .day .dr { position: absolute; left: 0; right: 0; top: 120px; height: 140px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; }
#hud .day .dl { position: absolute; left: 16px; right: 12px; bottom: 54px; color: var(--ink2); }
#hud .day .st { position: absolute; left: 0; right: 0; bottom: 0; height: 40px; display: flex; align-items: center; justify-content: center; gap: 8px; color: #7fe3bd; background: rgba(127,227,189,.08); }
#hud .day .st.r { color: #121110; background: var(--amber); }
#hud .day.got { opacity: .62; }
#hud .day.ready { border-color: var(--amber); cursor: pointer; box-shadow: 0 0 30px rgba(226,180,90,.2); }
#hud .day.today .dn { color: var(--amber); }
#hud .day.d7 { background: linear-gradient(160deg, rgba(56,44,18,.95), rgba(14,12,8,.96)); border-color: rgba(233,189,82,.4); }
#hud .day::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse 70% 50% at 50% 50%, rgba(226,180,90,.1), transparent 70%); }
#hud .dbrk { margin-top: 18px; color: var(--red2); }

/* ── MAESTRIA ────────────────────────────────────────────────────────── */
#hud .mh { display: flex; flex-direction: column; gap: 10px; height: 110px; }
#hud .mh > .mono:first-child { color: var(--amber); }
#hud .mh span .mono { color: var(--ink3); }
#hud .mrows { display: flex; flex-direction: column; gap: 8px; }
#hud .mrow { display: grid; grid-template-columns: 180px 200px 110px 1fr 640px; align-items: center; gap: 20px; height: 88px; padding: 0 18px; background: linear-gradient(90deg, rgba(20,24,28,.9), rgba(10,12,15,.7)); border: 1px solid rgba(255,255,255,.07); }
#hud .mrow.na { opacity: .5; }
#hud .mrow .mn { display: flex; flex-direction: column; gap: 6px; }
#hud .mrow .mn .mono { color: var(--ink3); font-size: 10px; }
#hud .mrow .mp { display: flex; flex-direction: column; gap: 8px; color: var(--ink2); }
#hud .mt2 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
#hud .mtier { position: relative; height: 70px; border: 1px solid rgba(255,255,255,.08); background: rgba(0,0,0,.25); overflow: hidden; }
#hud .mtier img { position: absolute; left: 6px; right: 6px; top: 4px; width: calc(100% - 12px); height: 42px; object-fit: contain; filter: grayscale(1) brightness(.35); }
#hud .mtier span { position: absolute; left: 8px; bottom: 6px; color: var(--ink3); }
#hud .mtier b { position: absolute; right: 6px; bottom: 5px; color: var(--ink3); }
#hud .mtier.ok { border-color: var(--rc); box-shadow: inset 0 -3px 0 var(--rc); }
#hud .mtier.ok img { filter: none; }
#hud .mtier.ok span { color: var(--ink); }
#hud .mtier.ok b { color: #7fe3bd; }

/* ── COLEÇÃO ─────────────────────────────────────────────────────────── */
#hud .colh { display: flex; align-items: center; gap: 30px; height: 140px; }
#hud .colh > div:last-child > .mono:first-child { color: var(--amber); }
#hud .colh .ring { position: relative; width: 120px; height: 120px; }
#hud .colh .ring span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
#hud .albums { position: absolute; left: 0; right: 0; top: 160px; bottom: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
#hud .album { position: relative; border-top: 3px solid var(--cc); }
#hud .album .ah { display: grid; grid-template-columns: 150px 1fr; gap: 16px; align-items: center; padding: 14px; border-bottom: 1px solid var(--line); }
#hud .album .ah > div:last-child { display: flex; flex-direction: column; gap: 10px; }
#hud .album .ah .xpb i { background: var(--cc); box-shadow: none; }
#hud .album .aart { height: 92px; background-size: cover; background-position: center 62%; border: 1px solid rgba(255,255,255,.1); }
#hud .album .ag { position: absolute; left: 0; right: 0; top: 124px; bottom: 0; padding: 12px; display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 88px; gap: 8px; overflow-y: auto; align-content: start; }

/* ── PERFIL ──────────────────────────────────────────────────────────── */
#hud .pfh { display: grid; grid-template-columns: 760px 1fr; gap: 40px; align-items: center; height: 200px; }
#hud .pft > .mono:first-child { color: var(--amber); }
#hud .pcard.big { position: relative; height: 190px; border: 1px solid rgba(255,255,255,.18); overflow: hidden; }
#hud .pcard.big .cc { position: absolute; inset: 0; background-size: cover; }
#hud .pcard.big .pi { position: absolute; left: 0; right: 0; bottom: 0; padding: 18px 22px; display: flex; align-items: center; gap: 18px; background: linear-gradient(90deg, rgba(6,8,10,.88), rgba(6,8,10,.25)); }
#hud .pcard.big .pi > div { display: flex; flex-direction: column; gap: 10px; }
#hud .pfg { position: absolute; left: 0; right: 0; top: 222px; bottom: 0; display: grid; grid-template-columns: 1fr 640px; gap: 16px; }
#hud .pfg .cards { padding: 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
#hud .ccard { position: relative; height: 112px; border: 1px solid rgba(255,255,255,.1); cursor: pointer; overflow: hidden; }
#hud .ccard i { position: absolute; left: 0; right: 0; top: 0; height: 82px; background-size: cover; background-position: center; }
#hud .ccard span { position: absolute; left: 10px; bottom: 8px; color: var(--ink2); }
#hud .ccard b, #hud .emb b { position: absolute; right: 6px; bottom: 6px; display: flex; align-items: center; gap: 4px; padding: 3px 6px; color: var(--amber); background: rgba(0,0,0,.6); }
#hud .ccard.lock, #hud .emb.lock { cursor: default; }
#hud .emb b { top: 6px; bottom: auto; }
#hud .ccard.lock i { filter: grayscale(.9) brightness(.35); }
#hud .ccard.on, #hud .emb.on { border-color: var(--amber); box-shadow: 0 0 0 1px var(--amber), 0 0 18px rgba(226,180,90,.3); }
#hud .ccard:not(.lock):hover, #hud .emb:not(.lock):hover { border-color: rgba(255,255,255,.35); }
#hud .embs { padding: 14px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
#hud .emb { position: relative; height: 128px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.2); cursor: pointer; color: var(--ink2); }
#hud .emb.lock svg:first-child { filter: grayscale(1) brightness(.4); }

/* ── aviso flutuante ─────────────────────────────────────────────────── */
#hud .atoast { position: absolute; left: 0; right: 0; top: 176px; display: flex; justify-content: center; pointer-events: none; z-index: 9; opacity: 0; }
#hud .atoast.on { animation: atIn 2.6s ease both; }
#hud .atoast > svg { padding: 14px 26px; box-sizing: content-box; background: rgba(10,12,15,.94); border: 1px solid rgba(255,255,255,.18); }
#hud .atoast.gold { color: var(--amber); }
#hud .atoast.red { color: var(--red2); }
@keyframes atIn { 0% { opacity: 0; transform: translateY(-10px); } 8% { opacity: 1; transform: none; } 85% { opacity: 1; } 100% { opacity: 0; } }

/* ── loadout: seletor de arma/faca ───────────────────────────────────── */
#hud .slot .sk { color: var(--rc, var(--amber)); }
#hud .slot .chg { position: absolute; right: 12px; top: 8px; color: var(--amber); opacity: 0; transition: opacity .15s; }
#hud .slot:hover .chg, #hud .slot.on .chg { opacity: 1; }
#hud .slot.on .img { margin-top: 14px; }
#hud .lpick { position: absolute; left: 96px; top: 150px; width: 660px; bottom: 120px; z-index: 4; padding: 0; display: flex; flex-direction: column; background: #0a0d10; box-shadow: 0 0 0 2000px rgba(4,5,7,.55), 0 20px 60px rgba(0,0,0,.6); }
#hud .lpick .ph { flex: none; }
#hud .lpick .pl { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
#hud .lopt { position: relative; display: grid; grid-template-columns: 1fr 220px; align-items: center; gap: 12px; height: 84px; padding: 0 16px; border: 1px solid rgba(255,255,255,.08); background: rgba(255,255,255,.03); cursor: pointer; }
#hud .lopt:hover { border-color: rgba(226,180,90,.5); }
#hud .lopt.on { border-color: var(--amber); background: rgba(226,180,90,.1); }
#hud .lopt.locked { cursor: not-allowed; opacity: .5; }
#hud .lopt .ln { display: flex; flex-direction: column; gap: 8px; }
#hud .lopt .ln .mono { color: var(--ink3); font-size: 11px; }
#hud .lopt img { width: 220px; height: 70px; object-fit: contain; }
#hud .lopt .lk { position: absolute; right: 12px; top: 8px; }

/* ── relatório: créditos e passe ─────────────────────────────────────── */
#hud .panel.crd { padding: 10px 16px; margin: 0; border-left: 0; border-right: 0; border-bottom: 0; box-shadow: none; background: rgba(226,180,90,.05); }
#hud .panel.crd .top { display: flex; align-items: center; gap: 10px; color: var(--amber); }
#hud .panel.crd .top .r { margin-left: auto; display: flex; align-items: center; gap: 8px; color: var(--ink2); }
#hud .panel.crd .ln { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; color: var(--ink3); }
#hud .panel.crd .ln span { display: inline-flex; gap: 6px; align-items: center; }

/* ── HUD de combate: killstreaks e fila de medalhas ──────────────────── */
#hud .ksb { position: absolute; right: 44px; bottom: 300px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
#hud .ksb .ks { position: relative; display: flex; align-items: center; gap: 10px; height: 34px; padding: 0 10px 0 12px; min-width: 210px; background: linear-gradient(90deg, rgba(8,10,12,.3), rgba(8,10,12,.66)); color: var(--ink3); clip-path: polygon(8px 0, 100% 0, 100% 100%, 0 100%, 0 8px); }
#hud .ksb .ks .kn2 { flex: 1; text-align: right; }
#hud .ksb .ks .kc { min-width: 22px; display: flex; justify-content: center; }
#hud .ksb .ks .kp { position: absolute; left: 0; bottom: 0; height: 2px; background: rgba(242,244,239,.55); }
#hud .ksb .ks.ready { color: #121110; background: linear-gradient(90deg, rgba(226,180,90,.55), var(--amber)); animation: ksPulse 1.2s ease-in-out infinite; }
#hud .ksb .ks.used { opacity: .35; }
#hud .ksb .ks .kk { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; border: 1.5px solid currentColor; border-radius: 3px; }
@keyframes ksPulse { 50% { box-shadow: 0 0 18px rgba(226,180,90,.55); } }
#hud .ksb .kst { color: var(--ink3); margin-bottom: 2px; }
#hud .medal .m + .m { margin-top: 6px; }
#hud .medal .m .xpm { color: var(--amber); margin-left: 4px; }
#hud .slidei { position: absolute; left: 960px; top: 640px; transform: translateX(-50%); color: rgba(242,244,239,.75); opacity: 0; transition: opacity .15s; }
#hud .slidei.on { opacity: 1; }
`;
