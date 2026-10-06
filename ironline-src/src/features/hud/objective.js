/**
 * Objetivos na tela e no mundo:
 *
 *   ZoneRing      anel da zona do HARDPOINT NO MUNDO: aro no chão + disco de
 *                 preenchimento + arco de progresso da captura + coluna de
 *                 luz fraca (visível de longe). Cor pelo dono: âmbar neutro,
 *                 azul nosso, vermelho hostil; pisca quando contestada.
 *   ObjectiveHud  painel do objetivo sob a bússola (estado, cabo de guerra
 *                 da captura, barra de posse), marcador projetado da zona
 *                 (losango "A" + distância, preso às bordas fora da tela),
 *                 barra de vida do CHEFE (sobrevivência) e vidas.
 *
 * Só lê o estado da partida (match.js) e o serviço `enemies`; nada aqui
 * muda regras.
 */
import { svgText } from './font.js';
import { skullSVG } from './icons.js';

const T = (s, o) => svgText(s, o);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const COL = { neutral: [0.89, 0.71, 0.35], us: [0.5, 0.75, 0.95], them: [0.92, 0.33, 0.27] };

/** Textura radial (preenchimento do disco e da coluna) — canvas pequeno. */
function radialTex(THREE, inner = 0.55) {
  const n = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(255,255,255,0.05)');
  gr.addColorStop(inner, 'rgba(255,255,255,0.18)');
  gr.addColorStop(0.97, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, n, n);
  // hachura diagonal (leitura de "área marcada" no chão)
  g.globalCompositeOperation = 'destination-out';
  g.strokeStyle = 'rgba(0,0,0,.55)';
  g.lineWidth = 3;
  for (let d = -n; d < n * 2; d += 9) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d - n, n); g.stroke(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function beamTex(THREE) {
  const cv = document.createElement('canvas');
  cv.width = 4; cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.5)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.18)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 4, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ZoneRing {
  constructor(ctx, zone) {
    const THREE = ctx.THREE;
    this.ctx = ctx;
    this.zone = zone;
    const r = zone.radius;
    const g = (this.group = new THREE.Group());
    g.name = 'hardpoint-zone';
    g.position.set(zone.x, (zone.y || 0) + 0.035, zone.z);
    g.userData.noSkyOcclusion = true;
    const mk = (geo, mat, rotX = -Math.PI / 2) => {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = rotX;
      m.renderOrder = 3;
      m.frustumCulled = false;
      m.userData.noSkyOcclusion = true;
      g.add(m);
      return m;
    };
    // tonemapeado (o compositor é HDR com bloom): cores moderadas, nada estoura
    const base = { transparent: true, depthWrite: false, fog: false };
    this.fillMat = new THREE.MeshBasicMaterial({ ...base, map: radialTex(THREE), opacity: 0.32 });
    this.rimMat = new THREE.MeshBasicMaterial({ ...base, opacity: 0.85 });
    this.progMat = new THREE.MeshBasicMaterial({ ...base, opacity: 0.95 });
    this.beamMat = new THREE.MeshBasicMaterial({ ...base, map: beamTex(THREE), opacity: 0.07, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    mk(new THREE.CircleGeometry(r, 72), this.fillMat);
    mk(new THREE.RingGeometry(r - 0.16, r, 96), this.rimMat);
    // marcas de canto (12 traços) por fora do aro
    const ticks = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2, a1 = a0 + 0.07;
      const r0 = r + 0.12, r1 = r + (i % 2 ? 0.3 : 0.5);
      pos.push(Math.cos(a0) * r0, Math.sin(a0) * r0, 0, Math.cos(a1) * r0, Math.sin(a1) * r0, 0, Math.cos(a0) * r1, Math.sin(a0) * r1, 0);
      pos.push(Math.cos(a1) * r0, Math.sin(a1) * r0, 0, Math.cos(a1) * r1, Math.sin(a1) * r1, 0, Math.cos(a0) * r1, Math.sin(a0) * r1, 0);
    }
    ticks.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mk(ticks, this.rimMat);
    this.prog = mk(new THREE.RingGeometry(r - 0.42, r - 0.22, 96, 1, Math.PI / 2, 0.001), this.progMat);
    this.progR = r;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r, 4.5, 48, 1, true), this.beamMat);
    beam.position.y = 2.25;
    beam.renderOrder = 4;
    beam.frustumCulled = false;
    g.add(beam);
    ctx.scene.add(g);
    this._lastP = -9;
  }

  /** Atualiza cor/progresso a partir do estado da zona (modes.zoneState). */
  update(zs, t) {
    const owner = zs.owner || 'neutral';
    const c0 = COL[owner];
    // material sem luz num compositor HDR com exposição automática: num
    // galpão escuro a exposição sobe e o anel estouraria em branco. Lê a
    // exposição atual (1 pixel, a cada ~40 quadros) e compensa o brilho.
    if (!(this._en = (this._en || 0) + 1) || this._en % 40 === 1) {
      try {
        const e = this.ctx.services.rendering?.readExposure?.()?.exposure;
        if (e > 0 && Number.isFinite(e)) this.expo = e;
      } catch {}
    }
    const k = clamp(0.75 / (this.expo || 1), 0.12, 1.2);
    const c = [c0[0] * k, c0[1] * k, c0[2] * k];
    const blink = zs.contested ? 0.55 + 0.45 * Math.sin(t * 14) : 1;
    this.rimMat.color.setRGB(c[0] * blink, c[1] * blink, c[2] * blink);
    this.fillMat.color.setRGB(c[0], c[1], c[2]);
    this.beamMat.color.setRGB(c[0], c[1], c[2]);
    // arco: progresso da captura no sentido de quem está tomando
    const p = Math.abs(zs.cap);
    const pc = zs.cap >= 0 ? COL.us : COL.them;
    this.progMat.color.setRGB(pc[0] * k * 1.3, pc[1] * k * 1.3, pc[2] * k * 1.3);
    if (Math.abs(p - this._lastP) > 0.004) {
      this._lastP = p;
      const THREE = this.ctx.THREE, r = this.progR;
      this.prog.geometry.dispose();
      this.prog.geometry = new THREE.RingGeometry(r - 0.42, r - 0.22, 96, 1, Math.PI / 2, Math.max(0.001, p * Math.PI * 2));
    }
    this.prog.visible = p > 0.01 && p < 0.999;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.map?.dispose?.();
      o.material?.dispose?.();
    });
  }
}

export const OBJ_CSS = `
#hud .obj { position: absolute; left: 735px; top: 106px; width: 450px; padding: 8px 0 10px; display: none; flex-direction: column; align-items: center; gap: 7px;
  background: radial-gradient(ellipse at center, rgba(8,10,12,.55), rgba(8,10,12,.25) 60%, rgba(8,10,12,0) 80%); }
#hud .obj.on { display: flex; }
#hud .obj .row1 { display: flex; align-items: center; gap: 12px; }
#hud .obj .dia { position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; color: #101214; }
#hud .obj .dia::before { content: ''; position: absolute; inset: 5px; transform: rotate(45deg); background: var(--zc, var(--amber)); box-shadow: 0 0 0 2px rgba(0,0,0,.45), 0 0 12px rgba(0,0,0,.35); }
#hud .obj .dia > * { position: relative; }
#hud .obj .st { color: var(--zc, var(--amber)); min-width: 220px; }
#hud .obj .tug { position: relative; width: 340px; height: 6px; background: rgba(8,10,12,.6); box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
#hud .obj .tug::after { content: ''; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: rgba(242,244,239,.55); }
#hud .obj .tug i { position: absolute; top: 0; bottom: 0; }
#hud .obj .tug .u { left: 50%; background: #8ec0e4; }
#hud .obj .tug .t { right: 50%; background: #e2705f; }
#hud .obj .hold { display: flex; align-items: center; gap: 10px; color: var(--ink2); }
#hud .obj .hb { width: 240px; height: 4px; background: rgba(255,255,255,.1); }
#hud .obj .hb i { display: block; height: 100%; background: var(--amber); }
#hud .obj.contested .st { animation: pulse .5s steps(2) infinite; }
#hud .zmk { position: absolute; left: 0; top: 0; width: 0; height: 0; display: none; }
#hud .zmk.on { display: block; }
#hud .zmk .in { position: absolute; left: -26px; top: -34px; width: 52px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
#hud .zmk .d { position: relative; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; color: #101214; }
#hud .zmk .d::before { content: ''; position: absolute; inset: 5px; transform: rotate(45deg); background: var(--zc, var(--amber)); box-shadow: 0 0 0 2px rgba(0,0,0,.5), 0 0 14px var(--zc, var(--amber)); }
#hud .zmk .d > * { position: relative; }
#hud .zmk .m { color: var(--ink); }
#hud .boss { position: absolute; left: 590px; top: 106px; width: 740px; padding: 10px 20px 12px; display: none; flex-direction: column; gap: 7px;
  background: radial-gradient(ellipse at center, rgba(8,10,12,.6), rgba(8,10,12,.3) 65%, rgba(8,10,12,0) 85%); }
#hud .boss.on { display: flex; animation: bossIn .6s ease-out both; }
#hud .boss .hd { display: flex; align-items: center; gap: 12px; color: var(--red2); }
#hud .boss .hd .sub { margin-left: auto; color: var(--ink2); }
#hud .boss .bar { position: relative; height: 14px; background: rgba(8,10,12,.72); box-shadow: 0 0 0 1px rgba(226,112,95,.45), 0 4px 18px rgba(0,0,0,.4); overflow: hidden; }
#hud .boss .bar .lag { position: absolute; left: 0; top: 0; bottom: 0; background: rgba(242,232,214,.55); }
#hud .boss .bar .cur { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(180deg, #e8604f, #a8281e); }
#hud .boss .bar .seg { position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 68px, rgba(0,0,0,.55) 68px 70px); }
#hud .boss .meta { display: flex; justify-content: space-between; color: var(--ink2); }
@keyframes bossIn { from { opacity: 0; transform: translateY(-8px) scaleX(.96); } to { opacity: 1; transform: none; } }
#hud .lives { display: flex; align-items: center; gap: 5px; }
#hud .lives b { width: 9px; height: 13px; background: var(--ink); clip-path: polygon(50% 0, 100% 30%, 100% 100%, 0 100%, 0 30%); }
#hud .lives b.off { background: rgba(242,244,239,.18); }
#hud .play.dead .zmk { display: none; }
`;

const STATUS = {
  neutral: ['ZONE NEUTRAL', 'MOVE TO THE ZONE'],
  capturing: ['CAPTURING', 'STAY IN THE ZONE'],
  held: ['ZONE SECURED', 'HOLD THE ZONE'],
  contested: ['CONTESTED', 'CLEAR THE ZONE'],
  losing: ['LOSING THE ZONE', 'GET BACK IN THE ZONE'],
  lost: ['ZONE LOST', 'RETAKE THE ZONE'],
};

export class ObjectiveHud {
  constructor(ctx, root) {
    this.ctx = ctx;
    this.root = root;
    const el = (cls, html = '') => {
      const d = document.createElement('div');
      d.className = cls;
      d.innerHTML = html;
      root.appendChild(d);
      return d;
    };
    this.obj = el('obj sh', `<div class="row1"><div class="dia">${T('A', { size: 13, weight: 2, heavy: true })}</div><div class="st"></div></div>
      <div class="tug"><i class="u"></i><i class="t"></i></div>
      <div class="hold"><span class="hl">${T('HOLD', { size: 11, weight: 1.4, tracking: 2.2 })}</span><div class="hb"><i></i></div><span class="hv"></span></div>`);
    this.mk = el('zmk', `<div class="in"><div class="d">${T('A', { size: 12, weight: 2, heavy: true })}</div><div class="m"></div></div>`);
    this.boss = el('boss sh', `<div class="hd">${skullSVG('', 22)}${T('JUGGERNAUT', { size: 18, weight: 1.9, tracking: 3.2 })}<span class="sub">${T('HEAVY ARMOR  ·  AIM FOR THE VISOR', { size: 11, weight: 1.35, tracking: 2.2 })}</span></div>
      <div class="bar"><div class="lag"></div><div class="cur"></div><div class="seg"></div></div><div class="meta"><span class="hpv"></span><span class="rl"></span></div>`);
    const q = (e, s) => e.querySelector(s);
    this.E = {
      st: q(this.obj, '.st'), tu: q(this.obj, '.tug .u'), tt: q(this.obj, '.tug .t'), hb: q(this.obj, '.hb i'), hv: q(this.obj, '.hv'),
      mkm: q(this.mk, '.m'), bcur: q(this.boss, '.cur'), blag: q(this.boss, '.lag'), bhp: q(this.boss, '.hpv'), brl: q(this.boss, '.rl'),
    };
    this.cache = {};
    this.ring = null;
    this.bossLag = 1;
    this._v = new ctx.THREE.Vector3();
  }

  set(k, v, fn) {
    if (this.cache[k] === v) return;
    this.cache[k] = v;
    fn(v);
  }

  /** Zona mudou (início/fim da partida). */
  setZone(zone) {
    this.ring?.dispose();
    this.ring = zone ? new ZoneRing(this.ctx, zone) : null;
    this.zone = zone;
  }

  frame(dt, m, mode, stageW, stageH) {
    const ctx = this.ctx;
    const hp = mode.id === 'hardpoint' && this.zone && m.phase !== 'menu';
    this.set('objOn', hp, (v) => {
      this.obj.classList.toggle('on', v);
      this.mk.classList.toggle('on', v);
    });
    if (hp) this.zoneFrame(dt, m, mode, stageW, stageH);
    // chefe
    const boss = m.boss && (m.boss.alive || m.boss.deadT < 2.5) ? m.boss : null;
    this.set('bossOn', !!boss, (v) => this.boss.classList.toggle('on', v));
    if (boss) {
      const f = clamp(boss.health / (boss.maxHealth || 1), 0, 1);
      this.bossLag = f < this.bossLag ? Math.max(f, this.bossLag - dt * 0.35) : f;
      this.E.bcur.style.width = (f * 100).toFixed(2) + '%';
      this.E.blag.style.width = (this.bossLag * 100).toFixed(2) + '%';
      this.set('bhp', Math.ceil(boss.health), (v) => (this.E.bhp.innerHTML = T(`${v} / ${boss.maxHealth}`, { size: 12, weight: 1.35, heavy: true })));
      const rl = boss.brain?.reloadT >= 0 ? 'RELOADING — PUSH NOW' : boss.alive ? '' : 'NEUTRALIZED';
      this.set('brl', rl, (v) => (this.E.brl.innerHTML = v ? T(v, { size: 11, weight: 1.4, tracking: 2.2 }) : ''));
    }
  }

  zoneFrame(dt, m, mode, W, H) {
    const ctx = this.ctx;
    const zs = m.zs;
    const z = this.zone;
    this.ring?.update(zs, ctx.time.now);
    const owner = zs.owner || 'neutral';
    const color = owner === 'us' ? '#8ec0e4' : owner === 'them' ? '#e2705f' : '#e2b45a';
    this.set('zc', color, (v) => {
      this.obj.style.setProperty('--zc', v);
      this.mk.style.setProperty('--zc', v);
    });
    const [title, hint] = STATUS[zs.status] || STATUS.neutral;
    const foes = m.zoneFoes || 0;
    const line = zs.status === 'contested' || zs.status === 'losing' ? `${title}  ·  ${foes} HOSTILE${foes === 1 ? '' : 'S'}` : title;
    this.set('st', line + '|' + hint, () => {
      this.E.st.innerHTML = `${T(line, { size: 15, weight: 1.6, tracking: 2.6 })}<div style="color:var(--ink2);margin-top:4px">${T(hint, { size: 10, weight: 1.3, tracking: 2 })}</div>`;
    });
    this.obj.classList.toggle('contested', !!zs.contested);
    const cap = zs.cap;
    this.E.tu.style.width = (Math.max(0, cap) * 50).toFixed(1) + '%';
    this.E.tt.style.width = (Math.max(0, -cap) * 50).toFixed(1) + '%';
    const hold = Math.min(mode.holdGoal, zs.hold);
    this.E.hb.style.width = ((hold / mode.holdGoal) * 100).toFixed(1) + '%';
    this.set('hv', Math.floor(hold), (v) => (this.E.hv.innerHTML = T(`${v} / ${mode.holdGoal} S`, { size: 12, weight: 1.35, heavy: true })));
    // marcador: losango sobre a zona (2,4 m), preso às bordas fora da tela
    const cam = ctx.camera;
    const v = this._v.set(z.x, (z.y || 0) + 2.4, z.z);
    const p = ctx.player.position;
    const dist = Math.hypot(z.x - p.x, z.z - p.z);
    v.project(cam);
    let x = v.x, y = v.y;
    const behind = v.z > 1;
    if (behind) { x = -x; y = -y; }
    const off = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.86;
    if (off) {
      const k = 1 / Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.86, 1e-3);
      x *= k; y *= k;
      if (behind && Math.abs(y) < 0.86 && Math.abs(x) < 0.9) y = -0.86;
    }
    const sx = (x * 0.5 + 0.5) * W, sy = (-y * 0.5 + 0.5) * H;
    this.mk.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
    const inside = m.zoneIn;
    this.mk.style.opacity = inside ? 0.35 : 1;
    this.set('mkm', inside ? 'IN ZONE' : Math.round(dist) + ' M', (t) => (this.E.mkm.innerHTML = T(t, { size: 11, weight: 1.4, tracking: 1.6, heavy: !inside })));
  }

  dispose() {
    this.ring?.dispose();
    this.obj.remove();
    this.mk.remove();
    this.boss.remove();
  }
}
