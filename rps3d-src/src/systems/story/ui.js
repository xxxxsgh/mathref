// Camada 2D do sistema `story`: tudo que é "filme" e fluxo de jogo.
//
//   • letterbox (barras de cinema animadas) e fade para preto
//   • legendas de cena (falante na cor da facção + texto)
//   • cartões de capítulo ("ATO I — DESERÇÃO")
//   • tela de título (logo + menu) sobre a cena REAL em 3D
//   • painel de escolhas holográfico (diálogos e decisões), com teclado,
//     mouse, gamepad e toque
//   • fallbacks de HUD (rádio, objetivo, aviso) — só aparecem quando o sistema
//     `hud` não existe; com ele presente, a HUD desenha rádio/objetivos.
//
// Tudo é DOM/CSS leve dentro de ctx.ui (nada de canvas extra): no iPad isso é
// composto pela GPU sem custo de render 3D.

const CSS = `
#story-ui{position:absolute;inset:0;pointer-events:none;font-family:Inter,"SF Pro Display",-apple-system,"Segoe UI",system-ui,sans-serif;color:#e9eef6;-webkit-font-smoothing:antialiased;--lb:0;--gold:#e8c27a;--gold2:#fff1cf;--cy:#8fd8ff;overflow:hidden}
#story-ui *{box-sizing:border-box}
#story-ui .lb{position:absolute;left:0;right:0;height:calc(var(--lb) * 10.5vh);background:#000;transition:height 1.1s cubic-bezier(.6,0,.2,1);z-index:2}
#story-ui .lb.t{top:0;box-shadow:0 1px 0 rgba(255,255,255,.03)}
#story-ui .lb.b{bottom:0;box-shadow:0 -1px 0 rgba(255,255,255,.03)}
#story-ui .fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .9s ease;z-index:6}
#story-ui .vign{position:absolute;inset:0;opacity:0;transition:opacity 1.5s;background:radial-gradient(120% 90% at 50% 45%,transparent 55%,rgba(0,0,0,.55) 100%);z-index:1}

/* legendas */
#story-ui .subs{position:absolute;left:50%;bottom:calc(var(--lb) * 10.5vh + 4.2vh);transform:translateX(-50%);width:min(980px,86vw);text-align:center;z-index:4;transition:bottom 1.1s cubic-bezier(.6,0,.2,1)}
#story-ui .sub{opacity:0;transform:translateY(6px);transition:opacity .35s,transform .35s}
#story-ui .sub.on{opacity:1;transform:none}
#story-ui .sub .who{display:inline-flex;align-items:center;gap:.6em;font:600 12px/1 Inter,system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:var(--fc,#cfe3ff);margin-bottom:.75em;text-shadow:0 0 12px rgba(0,0,0,.9)}
#story-ui .sub .who i{display:inline-block;width:22px;height:1px;background:currentColor;opacity:.7}
#story-ui .sub .who b{font-weight:600}
#story-ui .sub .who .ch{font-weight:400;opacity:.55;letter-spacing:.2em}
#story-ui .sub .txt{font:400 clamp(17px,1.65vw,25px)/1.42 Inter,system-ui,sans-serif;letter-spacing:.01em;color:#f4f7fb;text-shadow:0 1px 2px #000,0 0 18px rgba(0,0,0,.85),0 0 2px rgba(0,0,0,.9)}
#story-ui .sub .txt em{font-style:normal;color:var(--gold2)}

/* cartão de capítulo */
#story-ui .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:7;opacity:0;transition:opacity 1.2s;text-align:center}
#story-ui .card.on{opacity:1}
#story-ui .card .k{font:500 12px/1 Inter,system-ui;letter-spacing:.7em;color:var(--gold);margin-bottom:22px;padding-left:.7em}
#story-ui .card .h{font:200 clamp(38px,5.4vw,78px)/1 "Inter Display",Inter,system-ui;letter-spacing:.34em;padding-left:.34em;color:#f6f2ea;text-shadow:0 0 40px rgba(255,210,150,.18)}
#story-ui .card .r{width:min(520px,60vw);height:1px;margin:26px 0 20px;background:linear-gradient(90deg,transparent,rgba(232,194,122,.8),transparent)}
#story-ui .card .s{font:400 13px/1.7 Inter,system-ui;letter-spacing:.38em;color:#9fb0c6;text-transform:uppercase;padding-left:.38em}
#story-ui .card .p{max-width:min(720px,80vw);margin-top:34px;font:300 clamp(15px,1.25vw,19px)/1.75 Inter,system-ui;color:#c9d3df;letter-spacing:.02em}
#story-ui .card .p span{display:block;opacity:0;transform:translateY(8px);transition:opacity 1.4s,transform 1.4s}
#story-ui .card .p span.on{opacity:1;transform:none}

/* escolhas */
#story-ui .choice{position:absolute;left:50%;bottom:calc(var(--lb) * 10.5vh + 4.2vh + 124px);transform:translate(-50%,10px);width:min(600px,86vw);z-index:5;opacity:0;transition:opacity .45s,transform .45s;pointer-events:none}
#story-ui .choice.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
#story-ui .choice .list{display:flex;flex-direction:column}
#story-ui .choice .q{font:600 11px/1 Inter,system-ui;letter-spacing:.42em;color:var(--cy);text-transform:uppercase;margin:0 0 10px 0;padding:7px 0 7px 6px;display:flex;align-items:center;gap:12px;text-shadow:0 0 6px rgba(0,8,16,.95),0 0 2px #000;background:linear-gradient(90deg,rgba(4,10,18,.62),rgba(4,10,18,.25) 60%,rgba(4,10,18,0));backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)}
#story-ui .choice .q:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(143,216,255,.55),transparent)}
#story-ui .opt{position:relative;display:flex;align-items:center;gap:16px;margin:4px 0;padding:8px 18px 8px 12px;background:linear-gradient(90deg,rgba(6,14,24,.72),rgba(6,14,24,.3) 70%,rgba(6,14,24,0));border-left:2px solid rgba(143,216,255,.35);cursor:pointer;transition:background .2s,border-color .2s,transform .2s;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
#story-ui .opt .n{flex:none;width:22px;height:22px;display:grid;place-items:center;font:600 12px/1 Inter,system-ui;color:#0b1520;background:rgba(143,216,255,.75);clip-path:polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)}
#story-ui .opt .t{font:400 clamp(13.5px,1.1vw,16.5px)/1.3 Inter,system-ui;color:#eaf3fb}
#story-ui .opt .d{display:block;margin-top:3px;font:500 9.5px/1.2 Inter,system-ui;letter-spacing:.24em;text-transform:uppercase;color:#7f97ad}
#story-ui .opt.sel,#story-ui .opt:hover{background:linear-gradient(90deg,rgba(40,86,120,.82),rgba(20,50,74,.5) 70%,rgba(10,22,34,0));border-left-color:#bfeaff;transform:translateX(4px)}
#story-ui .opt.sel .n{background:#fff;box-shadow:0 0 14px rgba(170,225,255,.9)}
#story-ui .opt.hot{border-left-color:#ff9a6a}
#story-ui .opt.hot .n{background:#ffb08a}
#story-ui .opt.hot.sel{background:linear-gradient(90deg,rgba(120,48,24,.82),rgba(70,30,18,.5) 70%,rgba(10,22,34,0));border-left-color:#ffd2b8}
#story-ui .choice .tm{height:2px;margin:12px 0 0 4px;background:rgba(143,216,255,.15);overflow:hidden}
#story-ui .choice .tm i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#8fd8ff,#e8f8ff);transform-origin:left;transition:transform .2s linear}

/* título */
#story-ui .title{position:absolute;inset:0;z-index:3;opacity:0;transition:opacity 2s;pointer-events:none}
#story-ui .title.on{opacity:1}
#story-ui .title .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,2,6,.72) 0%,rgba(0,2,6,.38) 34%,transparent 62%),linear-gradient(0deg,rgba(0,0,0,.55),transparent 30%)}
#story-ui .logo{position:absolute;left:clamp(28px,6.5vw,120px);top:clamp(70px,17vh,190px)}
#story-ui .logo .a{font:500 clamp(11px,.95vw,14px)/1 Inter,system-ui;letter-spacing:.82em;color:#cdd6e2;margin-bottom:16px;padding-left:.2em}
#story-ui .logo .b{font:800 clamp(46px,6.4vw,104px)/.86 "Inter Display",Inter,system-ui;letter-spacing:.02em;background:linear-gradient(180deg,#ffffff 0%,#e3e8ef 46%,#8f9aa8 54%,#d7dde5 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 2px 0 rgba(0,0,0,.35)) drop-shadow(0 0 30px rgba(140,180,255,.12))}
#story-ui .logo .b small{font-size:.5em;vertical-align:.62em;margin-left:.08em;letter-spacing:0;background:linear-gradient(180deg,#fff4dc,#e8b866 55%,#9a6a2a);-webkit-background-clip:text;background-clip:text}
#story-ui .logo .c{display:flex;align-items:center;gap:18px;margin-top:20px}
#story-ui .logo .c i{height:1px;width:clamp(40px,5vw,80px);background:linear-gradient(90deg,transparent,#e8c27a)}
#story-ui .logo .c i:last-child{background:linear-gradient(90deg,#e8c27a,transparent)}
#story-ui .logo .c b{font:300 clamp(17px,1.9vw,30px)/1 "Inter Display",Inter,system-ui;letter-spacing:.62em;padding-left:.62em;background:linear-gradient(180deg,#fff3d8,#e8c27a 60%,#b7863e);-webkit-background-clip:text;background-clip:text;color:transparent}
#story-ui .menu{position:absolute;left:clamp(28px,6.5vw,120px);top:calc(clamp(70px,17vh,190px) + clamp(200px,24vw,330px));display:flex;flex-direction:column;gap:4px;pointer-events:auto}
#story-ui .mi{position:relative;display:flex;align-items:center;gap:14px;padding:12px 26px 12px 0;font:400 clamp(14px,1.15vw,17px)/1 Inter,system-ui;letter-spacing:.42em;color:#aab7c7;cursor:pointer;text-transform:uppercase;transition:color .25s,letter-spacing .35s}
#story-ui .mi:before{content:"";width:18px;height:1px;background:#56677b;transition:width .35s,background .35s}
#story-ui .mi.sel,#story-ui .mi:hover{color:#fff;letter-spacing:.5em}
#story-ui .mi.sel:before,#story-ui .mi:hover:before{width:44px;background:var(--gold);box-shadow:0 0 10px rgba(232,194,122,.8)}
#story-ui .mi.off{opacity:.32;pointer-events:none}
#story-ui .mi .sm{font-size:.62em;letter-spacing:.26em;color:#7d8a9a;margin-left:6px}
#story-ui .tfoot{position:absolute;left:clamp(28px,6.5vw,120px);right:clamp(28px,4vw,70px);bottom:28px;display:flex;justify-content:space-between;align-items:flex-end;font:500 10.5px/1.6 Inter,system-ui;letter-spacing:.3em;color:#738196;text-transform:uppercase}
#story-ui .tfoot b{color:#c7d2df;font-weight:500}
#story-ui .tfoot .loc{text-align:right}
#story-ui .tfoot .loc span{display:block;color:#e8c27a;letter-spacing:.42em}
#story-ui .press{position:absolute;left:50%;bottom:13vh;transform:translateX(-50%);font:500 11px/1 Inter,system-ui;letter-spacing:.6em;color:#dfe7f1;opacity:.0;animation:stpulse 2.4s ease-in-out infinite}
@keyframes stpulse{0%,100%{opacity:.15}50%{opacity:.85}}

/* configurações */
#story-ui .opts{position:absolute;left:clamp(28px,6.5vw,120px);top:calc(clamp(70px,17vh,190px) + clamp(200px,24vw,330px));width:min(520px,80vw);pointer-events:auto;display:none}
#story-ui .opts.on{display:block}
#story-ui .opts .row{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07);font:400 13px/1 Inter,system-ui;letter-spacing:.28em;text-transform:uppercase;color:#aab7c7;cursor:pointer}
#story-ui .opts .row.sel{color:#fff}
#story-ui .opts .row b{font-weight:500;color:var(--gold);letter-spacing:.2em}

/* rádio (fallback sem hud) */
#story-ui .radio{position:absolute;left:clamp(16px,2.4vw,40px);top:clamp(80px,14vh,140px);width:min(440px,42vw);z-index:4;opacity:0;transform:translateX(-12px);transition:opacity .35s,transform .35s}
#story-ui .radio.on{opacity:1;transform:none}
#story-ui .radio .fr{position:relative;padding:12px 16px 14px 16px;background:linear-gradient(90deg,rgba(6,12,20,.78),rgba(6,12,20,.25));border-left:2px solid var(--fc,#8fd8ff)}
#story-ui .radio .hd{display:flex;align-items:center;gap:10px;font:600 10.5px/1 Inter,system-ui;letter-spacing:.3em;text-transform:uppercase;color:var(--fc,#8fd8ff);margin-bottom:8px}
#story-ui .radio .wv{display:inline-flex;gap:2px;align-items:center;height:12px}
#story-ui .radio .wv i{width:2px;background:currentColor;animation:stwv .5s ease-in-out infinite alternate}
#story-ui .radio .wv i:nth-child(2){animation-delay:-.15s}#story-ui .radio .wv i:nth-child(3){animation-delay:-.3s}#story-ui .radio .wv i:nth-child(4){animation-delay:-.42s}#story-ui .radio .wv i:nth-child(5){animation-delay:-.08s}
@keyframes stwv{from{height:2px}to{height:12px}}
#story-ui .radio .fa{opacity:.55;font-weight:400;letter-spacing:.2em}
#story-ui .radio .tx{font:400 14.5px/1.45 Inter,system-ui;color:#e6edf5;text-shadow:0 1px 2px #000}

/* objetivo (fallback sem hud) */
#story-ui .obj{position:absolute;right:clamp(16px,2.4vw,40px);top:clamp(80px,14vh,140px);width:min(380px,40vw);text-align:right;z-index:4;opacity:0;transition:opacity .5s}
#story-ui .obj.on{opacity:1}
#story-ui .obj .k{font:600 10px/1 Inter,system-ui;letter-spacing:.42em;color:var(--gold);margin-bottom:8px}
#story-ui .obj .m{font:500 11px/1.3 Inter,system-ui;letter-spacing:.22em;text-transform:uppercase;color:#93a3b6;margin-bottom:6px}
#story-ui .obj .t{font:400 14.5px/1.45 Inter,system-ui;color:#eef3f8;text-shadow:0 1px 2px #000}
#story-ui .obj .pg{height:2px;margin-top:10px;background:rgba(232,194,122,.18);display:none}
#story-ui .obj .pg i{display:block;height:100%;background:linear-gradient(90deg,#e8c27a,#fff1cf);width:0}
#story-ui .mk{position:absolute;width:0;height:0;z-index:3;opacity:0;transition:opacity .4s}
#story-ui .mk.on{opacity:1}
#story-ui .mk .d{position:absolute;left:-9px;top:-9px;width:18px;height:18px;border:1.5px solid var(--gold);transform:rotate(45deg);box-shadow:0 0 10px rgba(232,194,122,.6)}
#story-ui .mk .l{position:absolute;left:16px;top:-7px;white-space:nowrap;font:600 10px/1 Inter,system-ui;letter-spacing:.24em;color:var(--gold);text-shadow:0 1px 2px #000;text-transform:uppercase}
#story-ui .skip{position:absolute;right:28px;bottom:calc(var(--lb) * 10.5vh - 30px);font:500 10px/1 Inter,system-ui;letter-spacing:.32em;color:#6c7a8c;z-index:5;opacity:0;transition:opacity .6s}
#story-ui .skip.on{opacity:.8}
#story-ui .toast{position:absolute;left:50%;top:18vh;transform:translateX(-50%);font:500 12px/1 Inter,system-ui;letter-spacing:.36em;color:#f2f6fa;text-transform:uppercase;padding:12px 26px;background:linear-gradient(90deg,transparent,rgba(8,14,22,.7),transparent);opacity:0;transition:opacity .4s;z-index:5;white-space:nowrap}
#story-ui .toast.on{opacity:1}
#story-ui .toast.warn{color:#ffb08a}
#story-ui .toast.reward{color:#ffe2a0}
#story-ui .locs{position:absolute;left:clamp(28px,5vw,90px);top:calc(var(--lb) * 10.5vh + 5vh);z-index:4;opacity:0;transform:translateY(8px);transition:opacity 1.6s,transform 1.6s}
#story-ui .locs.on{opacity:1;transform:none}
#story-ui .locs .a{font:200 clamp(30px,3.6vw,56px)/1 "Inter Display",Inter,system-ui;letter-spacing:.42em;color:#f3efe6;text-shadow:0 0 30px rgba(0,0,0,.6)}
#story-ui .locs .r{width:clamp(120px,14vw,220px);height:1px;margin:14px 0 12px;background:linear-gradient(90deg,#e8c27a,transparent)}
#story-ui .locs .b{font:500 11px/1 Inter,system-ui;letter-spacing:.42em;color:#a9b8c9}
@media (max-width:820px){#story-ui .radio{width:70vw}#story-ui .obj{width:60vw}}
`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Destaques simples: *texto* → <em>. */
const rich = (s) => esc(s).replace(/\*([^*]+)\*/g, '<em>$1</em>');

export class StoryUI {
  constructor(ctx, factions) {
    this.ctx = ctx;
    this.FACTIONS = factions;
    const root = document.createElement('div');
    root.id = 'story-ui';
    root.innerHTML = `<style>${CSS}</style>
      <div class="vign"></div>
      <div class="lb t"></div><div class="lb b"></div>
      <div class="title"><div class="shade"></div>
        <div class="logo"><div class="a">RAFAEL PAOLI</div><div class="b">SHOOTER<small>3D</small></div><div class="c"><i></i><b>REVOLUTION</b><i></i></div></div>
        <div class="menu"></div><div class="opts"></div>
        <div class="tfoot"><div>ANO <b>2387</b> · FENDA DE ÓRION</div><div class="loc"><span></span></div></div>
      </div>
      <div class="subs"><div class="sub"><div class="who"></div><div class="txt"></div></div></div>
      <div class="choice"><div class="q"></div><div class="list"></div><div class="tm"><i></i></div></div>
      <div class="radio"><div class="fr"><div class="hd"></div><div class="tx"></div></div></div>
      <div class="obj"><div class="k">OBJETIVO</div><div class="m"></div><div class="t"></div><div class="pg"><i></i></div></div>
      <div class="mk"><div class="d"></div><div class="l"></div></div>
      <div class="toast"></div>
      <div class="locs"><div class="a"></div><div class="r"></div><div class="b"></div></div>
      <div class="skip">SEGURE ENTER PARA PULAR</div>
      <div class="card"><div class="k"></div><div class="h"></div><div class="r"></div><div class="s"></div><div class="p"></div></div>
      <div class="fade"></div>`;
    (ctx.ui || document.body).appendChild(root);
    this.root = root;
    const q = (s) => root.querySelector(s);
    this.el = {
      fade: q('.fade'), vign: q('.vign'), title: q('.title'), menu: q('.menu'), opts: q('.opts'), loc: q('.tfoot .loc span'),
      sub: q('.sub'), who: q('.sub .who'), txt: q('.sub .txt'),
      choice: q('.choice'), cq: q('.choice .q'), clist: q('.choice .list'), ctm: q('.choice .tm i'),
      radio: q('.radio'), rhd: q('.radio .hd'), rtx: q('.radio .tx'), rfr: q('.radio .fr'),
      obj: q('.obj'), om: q('.obj .m'), ot: q('.obj .t'), opg: q('.obj .pg'), opgi: q('.obj .pg i'),
      mk: q('.mk'), mkl: q('.mk .l'), toast: q('.toast'), skip: q('.skip'),
      locEl: q('.locs'), locA: q('.locs .a'), locB: q('.locs .b'),
      card: q('.card'), ck: q('.card .k'), ch: q('.card .h'), cs: q('.card .s'), cp: q('.card .p'),
    };
    this.subT = 0; this.radioT = 0; this.toastT = 0;
    this.choiceState = null;
    this.menuState = null;
    this.lbValue = 0;
  }

  factionColor(f) { return this.FACTIONS?.[f]?.color || (f === 'rafael' ? '#e9eef6' : f === 'sistema' ? '#8fd8ff' : '#cfe3ff'); }

  // ── barras / fade ─────────────────────────────────────────────────────────
  letterbox(on, instant = false) {
    const v = on === true ? 1 : on === false ? 0 : Number(on) || 0;
    this.lbValue = v;
    if (instant) { this.root.querySelectorAll('.lb,.subs').forEach((e) => { e.style.transition = 'none'; }); }
    this.root.style.setProperty('--lb', v);
    this.el.vign.style.opacity = v > 0 ? 1 : 0;
    if (instant) { void this.root.offsetHeight; this.root.querySelectorAll('.lb,.subs').forEach((e) => { e.style.transition = ''; }); }
  }
  fade(v, seconds = 0.9) {
    const f = this.el.fade;
    f.style.transition = `opacity ${seconds}s ease`;
    f.style.opacity = v;
  }

  // ── legendas ─────────────────────────────────────────────────────────────
  subtitle(speaker, text, { faction = null, channel = '', seconds = null } = {}) {
    const el = this.el;
    if (!text) { el.sub.classList.remove('on'); this.subT = 0; return; }
    el.sub.style.setProperty('--fc', this.factionColor(faction));
    el.who.innerHTML = speaker ? `<i></i><b>${esc(speaker)}</b>${channel ? `<span class="ch">· ${esc(channel)}</span>` : ''}<i></i>` : '';
    el.txt.innerHTML = rich(text);
    el.sub.classList.add('on');
    this.subT = seconds ?? Math.max(2.6, 1.2 + text.length * 0.058);
    return this.subT;
  }
  clearSubtitle() { this.el.sub.classList.remove('on'); this.subT = 0; }

  // ── cartão de capítulo ───────────────────────────────────────────────────
  card({ kicker = '', title = '', sub = '', lines = [] } = {}) {
    const el = this.el;
    el.ck.textContent = kicker; el.ch.textContent = title; el.cs.textContent = sub;
    el.cp.innerHTML = lines.map((l) => `<span>${rich(l)}</span>`).join('');
    el.card.classList.add('on');
    this.cardLines = [...el.cp.children];
  }
  revealCardLine(i) { this.cardLines?.[i]?.classList.add('on'); }
  hideCard() { this.el.card.classList.remove('on'); }

  // ── escolhas ─────────────────────────────────────────────────────────────
  /** Mostra opções. choices: [{id, text, detail?, hot?}]. Retorna Promise<id>. */
  choose(prompt, choices, { timeout = 0, defaultId = null } = {}) {
    const el = this.el;
    this.cancelChoice();
    el.cq.textContent = prompt || 'RESPONDER';
    el.clist.innerHTML = choices.map((c, i) => `<div class="opt${c.hot ? ' hot' : ''}${i === 0 ? ' sel' : ''}" data-i="${i}"><div class="n">${i + 1}</div><div class="t">${rich(c.text)}${c.detail ? `<span class="d">${esc(c.detail)}</span>` : ''}</div></div>`).join('');
    el.ctm.parentElement.style.display = timeout > 0 ? 'block' : 'none';
    el.ctm.style.transform = 'scaleX(1)';
    el.choice.classList.add('on');
    return new Promise((resolve) => {
      const st = { choices, sel: 0, resolve, t: 0, timeout, defaultId, done: false };
      this.choiceState = st;
      [...el.clist.children].forEach((node, i) => {
        node.addEventListener('pointerenter', () => this.selectChoice(i));
        node.addEventListener('click', (e) => { e.stopPropagation(); this.pickChoice(i); });
      });
    });
  }
  selectChoice(i) {
    const st = this.choiceState; if (!st) return;
    st.sel = (i + st.choices.length) % st.choices.length;
    [...this.el.clist.children].forEach((n, k) => n.classList.toggle('sel', k === st.sel));
  }
  pickChoice(i = null) {
    const st = this.choiceState; if (!st || st.done) return;
    st.done = true;
    const c = st.choices[i ?? st.sel];
    this.el.choice.classList.remove('on');
    this.choiceState = null;
    st.resolve(c?.id ?? null);
  }
  cancelChoice() { if (this.choiceState) { const st = this.choiceState; this.choiceState = null; this.el.choice.classList.remove('on'); st.resolve(null); } }
  get choosing() { return !!this.choiceState; }

  // ── título ───────────────────────────────────────────────────────────────
  showTitle(items, { location = '' } = {}) {
    const el = this.el;
    el.loc.textContent = location;
    el.menu.innerHTML = items.map((m, i) => `<div class="mi${m.disabled ? ' off' : ''}" data-i="${i}">${esc(m.label)}${m.small ? `<span class="sm">${esc(m.small)}</span>` : ''}</div>`).join('');
    el.menu.style.display = '';
    el.opts.classList.remove('on');
    el.title.classList.add('on');
    const st = { items, sel: items.findIndex((m) => !m.disabled) };
    this.menuState = st;
    [...el.menu.children].forEach((n, i) => {
      n.addEventListener('pointerenter', () => this.selectMenu(i));
      n.addEventListener('click', (e) => { e.stopPropagation(); this.selectMenu(i); this.activateMenu(); });
    });
    this.selectMenu(st.sel);
  }
  selectMenu(i) {
    const st = this.menuState; if (!st) return;
    const n = st.items.length;
    let k = ((i % n) + n) % n, guard = 0;
    while (st.items[k].disabled && guard++ < n) k = (k + 1) % n;
    st.sel = k;
    [...this.el.menu.children].forEach((node, j) => node.classList.toggle('sel', j === k));
  }
  stepMenu(d) {
    const st = this.menuState; if (!st) return;
    const n = st.items.length;
    let k = st.sel, guard = 0;
    do { k = (k + d + n) % n; } while (st.items[k].disabled && guard++ < n);
    this.selectMenu(k);
  }
  activateMenu() { const st = this.menuState; if (!st) return; st.items[st.sel]?.action?.(); }
  hideTitle() { this.el.title.classList.remove('on'); this.menuState = null; }

  /** Lista de configurações dentro do título. rows: [{label, value(), next()}]. */
  showOptions(rows, onBack) {
    const el = this.el;
    el.menu.style.display = 'none';
    el.opts.classList.add('on');
    const render = () => {
      el.opts.innerHTML = rows.map((r, i) => `<div class="row${i === this.optSel ? ' sel' : ''}" data-i="${i}"><span>${esc(r.label)}</span><b>${esc(r.value?.() ?? '')}</b></div>`).join('');
      [...el.opts.children].forEach((n, i) => n.addEventListener('click', (e) => { e.stopPropagation(); this.optSel = i; rows[i].next?.(); render(); }));
    };
    this.optSel = 0;
    this.optRows = rows; this.optRender = render; this.optBack = onBack;
    render();
  }
  hideOptions() { this.el.opts.classList.remove('on'); this.el.menu.style.display = ''; this.optRows = null; }

  // ── rádio / objetivo / aviso (fallback) ──────────────────────────────────
  radio(e) {
    const el = this.el;
    const fc = this.factionColor(e.faction);
    el.radio.style.setProperty('--fc', fc);
    const fname = this.FACTIONS?.[e.faction]?.name || '';
    el.rhd.innerHTML = `<span class="wv"><i></i><i></i><i></i><i></i><i></i></span><span>${esc(e.speaker || 'RÁDIO')}</span>${fname ? `<span class="fa">${esc(fname)}</span>` : ''}`;
    el.rtx.innerHTML = rich(e.text);
    el.radio.classList.add('on');
    this.radioT = Math.max(3.5, 1.5 + String(e.text).length * 0.06);
  }
  objective(o) {
    const el = this.el;
    if (!o || !o.text) { el.obj.classList.remove('on'); return; }
    el.om.textContent = o.mission || '';
    el.ot.innerHTML = rich(o.text);
    if (o.progress !== undefined && o.progress !== null) { el.opg.style.display = 'block'; el.opgi.style.width = `${Math.round(Math.max(0, Math.min(1, o.progress)) * 100)}%`; }
    else el.opg.style.display = 'none';
    el.obj.classList.add('on');
  }
  marker(x, y, label, on = true) {
    const el = this.el;
    el.mk.classList.toggle('on', !!on);
    if (!on) return;
    el.mk.style.left = `${x}px`; el.mk.style.top = `${y}px`;
    if (el.mkl.textContent !== label) el.mkl.textContent = label;
  }
  toast(text, kind = 'info', seconds = 3) {
    const el = this.el;
    el.toast.textContent = text;
    el.toast.className = 'toast on ' + kind;
    this.toastT = seconds;
  }
  /** Carimbo de local (canto inferior esquerdo, estilo filme). */
  location(title, sub = '', seconds = 6) {
    const el = this.el;
    el.locA.textContent = title; el.locB.textContent = sub;
    el.locEl.classList.add('on');
    this.locT = seconds;
  }
  hideLocation() { this.el.locEl.classList.remove('on'); this.locT = 0; }
  showSkip(on) { this.el.skip.classList.toggle('on', !!on); }

  frame(dt) {
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) this.el.sub.classList.remove('on'); }
    if (this.radioT > 0) { this.radioT -= dt; if (this.radioT <= 0) this.el.radio.classList.remove('on'); }
    if (this.locT > 0) { this.locT -= dt; if (this.locT <= 0) this.el.locEl.classList.remove('on'); }
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('on'); }
    const st = this.choiceState;
    if (st && st.timeout > 0) {
      st.t += dt;
      this.el.ctm.style.transform = `scaleX(${Math.max(0, 1 - st.t / st.timeout)})`;
      if (st.t >= st.timeout) {
        const i = st.defaultId ? st.choices.findIndex((c) => c.id === st.defaultId) : st.sel;
        this.pickChoice(Math.max(0, i));
      }
    }
  }
  dispose() { this.root.remove(); }
}
