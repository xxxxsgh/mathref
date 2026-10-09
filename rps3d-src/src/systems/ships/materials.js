// Materiais TSL das naves.
//
//  • casco: UM programa para todas as facções (só uniforms mudam): linhas de
//    painel triplanares com AA, variação de tom por painel, zonas de pintura
//    por vértice (aInfo.x), desgaste/lascas perto das juntas, escorridos de
//    sujeira no sentido do fluxo, remendos (Frente Livre), listras de perigo
//    (Guilda), "dentes" (Corsários), circuitos luminosos (Vigilantes),
//    queimaduras de dano globais + até 4 impactos localizados.
//  • luzes (cor HDR + pisca por vértice), vidro do canopy, núcleo de motor,
//    pluma de exaustão (aditiva, diamantes de choque).
import * as THREE from 'three/webgpu';
import {
  Fn, vec2, vec3, vec4, float, uniform, uniformArray, attribute, positionLocal, normalLocal, mix, smoothstep, step, abs, max, min,
  floor, fract, pow, exp, sin, clamp, time, fwidth, select, length, dot, normalize, normalView, positionView, uv,
} from 'three/tsl';
import { hash13, vnoise, fbm, bumpNormal } from './tsl.js';

const C = (a) => new THREE.Color(a[0], a[1], a[2]);

const panelProj = Fn(([u, v, sd]) => {
  const row = floor(v);
  const off = hash13(vec3(row, sd, 7.0));
  const uu = u.div(1.75).add(off);
  const col = floor(uu);
  const fu = fract(uu), fv = fract(v);
  const du = min(fu, fu.oneMinus()).mul(1.75);
  const dv = min(fv, fv.oneMinus());
  return vec2(min(du, dv), hash13(vec3(col, row, sd)));
}).setLayout({ name: 'sh_panel', type: 'vec2', inputs: [{ name: 'u', type: 'float' }, { name: 'v', type: 'float' }, { name: 'sd', type: 'float' }] });

/**
 * Material do casco. style = FACTION_STYLES[x] (+ pintura opcional).
 * opts.panel = tamanho do painel (m); opts.iridescent; opts.lite (sem clearcoat).
 */
export function makeHullMaterial(style, { panel = 1.6, lite = false, iridescent = false, fill = false, fine = false, isolate = false } = {}) {
  const m = lite ? new THREE.MeshStandardNodeMaterial() : new THREE.MeshPhysicalNodeMaterial();
  const U = {
    primary: uniform(C(style.primary)), secondary: uniform(C(style.secondary)), trim: uniform(C(style.trim)),
    metal: uniform(C(style.metal)), dark: uniform(C(style.dark)), glow: uniform(C(style.glow)),
    paint: uniform(new THREE.Vector4(style.paint.metal, style.paint.rough, style.paint.clearcoat, style.wear)),
    fx: uniform(new THREE.Vector4(style.patch, style.hazard, style.teeth, style.circuits)),
    panel: uniform(panel),
    damage: uniform(0),
    glowPower: uniform(style.circuits > 0 ? 2.4 : 3.5),
    hits: uniformArray([new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()], 'vec4'),
  };
  m.userData.U = U;
  if (fill) {
    // luz falsa de interiores: ambiente + 3 lâmpadas pontuais + fileira periódica de luminárias no teto
    U.fillAmb = uniform(new THREE.Color(0.02, 0.022, 0.025));
    U.lamps = uniformArray([new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()], 'vec4');
    U.lampCol = uniformArray([new THREE.Color(), new THREE.Color(), new THREE.Color()], 'color');
    U.rowCol = uniform(new THREE.Color(0, 0, 0));
    U.row = uniform(new THREE.Vector4(3, 1.6, 0, 0)); // período (m), altura do teto, x0, raio
    U.rowPh = uniform(0); // fase (m): luminárias em z = rowPh + (k + ½)·período
    U.box = uniform(new THREE.Vector4(10, -10, 10, 0)); // meia-largura, piso, teto, centro x
    U.aoK = uniform(0);
    U.realLight = uniform(1); // quanto da luz real (sol/IBL) chega ao interior
    U.envCol = uniform(new THREE.Color(0.012, 0.013, 0.016));
    // interiores fechados: o IBL do céu/planeta não entra — ambiente constante escuro
    if (isolate) m.envNode = U.envCol;
  }

  const P = positionLocal;
  const p = P.div(U.panel);
  const n = normalize(normalLocal);
  const w0 = pow(abs(n), vec3(4.0));
  const w = w0.div(w0.x.add(w0.y).add(w0.z).add(1e-4));
  const px = panelProj(p.z, p.y, float(1));
  const py = panelProj(p.z, p.x, float(2));
  const pz = panelProj(p.x, p.y, float(3));
  const d = px.x.mul(w.x).add(py.x.mul(w.y)).add(pz.x.mul(w.z));
  const id = select(w.x.greaterThan(max(w.y, w.z)), px.y, select(w.y.greaterThan(w.z), py.y, pz.y));
  const lw = float(0.007);
  const aa = fwidth(d).add(1e-5);
  let line = float(1).sub(smoothstep(lw, lw.add(aa.mul(1.5)), d)).mul(clamp(lw.mul(2.5).div(aa), 0, 1));
  // naves grandes: segunda grade de subpainéis (4× mais fina, mais suave) —
  // dá escala ao casco de centenas de metros sem sumir à distância
  let subId = float(0);
  let macroId = float(0.5);
  if (fine && !lite) {
    const q = p.mul(4.0);
    const sx = panelProj(q.z, q.y, float(4)), sy = panelProj(q.z, q.x, float(5)), sz = panelProj(q.x, q.y, float(6));
    const d2 = sx.x.mul(w.x).add(sy.x.mul(w.y)).add(sz.x.mul(w.z));
    subId = select(w.x.greaterThan(max(w.y, w.z)), sx.y, select(w.y.greaterThan(w.z), sy.y, sz.y));
    const aa2 = fwidth(d2).add(1e-5);
    const line2 = float(1).sub(smoothstep(lw, lw.add(aa2.mul(1.5)), d2)).mul(clamp(lw.mul(2.5).div(aa2), 0, 1));
    line = max(line, line2.mul(0.45));
    // macro-chapas (≈6 painéis): tom em grande escala, legível de longe
    const r = p.mul(0.17);
    const mx = panelProj(r.z, r.y, float(7)), my = panelProj(r.z, r.x, float(8)), mz = panelProj(r.x, r.y, float(9));
    macroId = select(w.x.greaterThan(max(w.y, w.z)), mx.y, select(w.y.greaterThan(w.z), my.y, mz.y));
    const dm = mx.x.mul(w.x).add(my.x.mul(w.y)).add(mz.x.mul(w.z));
    const aa3 = fwidth(dm).add(1e-5);
    line = max(line, float(1).sub(smoothstep(lw.mul(0.8), lw.mul(0.8).add(aa3.mul(1.5)), dm)).mul(clamp(lw.mul(2.0).div(aa3), 0, 1)).mul(0.8));
  }

  const info = attribute('aInfo', 'vec3');
  const zone = info.x;
  const isZ = (k) => float(1).sub(step(0.5, abs(zone.sub(k))));
  const zP = isZ(0), zS = isZ(1), zT = isZ(2), zM = isZ(3), zD = isZ(4), zH = isZ(5), zG = isZ(6), zR = isZ(7);
  const isPaint = zP.add(zS);

  // ruídos (espaço do objeto, metros)
  const g1 = fbm(P.mul(0.55).add(info.z.mul(13.0)));
  const streak = vnoise(P.mul(vec3(2.6, 2.6, 0.16)));
  const wearAmt = U.paint.w.mul(info.y.mul(0.8).add(0.2));
  const nearSeam = float(1).sub(smoothstep(0.0, 0.07, d));

  // pintura
  const belly = smoothstep(-0.35, -0.8, n.y);
  let paintCol = mix(U.primary, U.secondary, zS);
  paintCol = paintCol.mul(float(1).sub(belly.mul(0.18)));
  const tone = id.sub(0.5).mul(float(0.07).add(U.fx.x.mul(0.25))).add(subId.sub(0.5).mul(0.05)).add(macroId.sub(0.5).mul(0.22));
  paintCol = paintCol.mul(tone.add(1));
  // painéis trocados (tom mais escuro/claro) — leitura de escala nas naves grandes
  const swap = step(0.9, hash13(vec3(id.mul(53.1), subId.mul(7.3), 2.9)));
  paintCol = mix(paintCol, paintCol.mul(select(hash13(vec3(id, 4.4, 1.0)).greaterThan(0.5), float(0.72), float(1.12))), swap.mul(fine ? 1 : 0.5));
  // remendos (Frente Livre): painéis trocados por primer, verde-oliva ou metal nu
  const h2 = hash13(vec3(id.mul(91.7), 3.1, 1.7));
  const patchCol = select(h2.lessThan(0.34), vec3(0.30, 0.085, 0.05), select(h2.lessThan(0.67), vec3(0.24, 0.25, 0.18), vec3(0.42, 0.41, 0.39)));
  const patchSel = step(id, U.fx.x.mul(0.42)).mul(zP);
  paintCol = mix(paintCol, patchCol, patchSel);
  // listras de perigo (Guilda) na zona secundária
  const haz = step(0.5, fract(P.x.add(P.y).add(P.z).mul(1.1)));
  paintCol = mix(paintCol, vec3(0.025, 0.025, 0.028), haz.mul(U.fx.y).mul(zS));
  // "dentes" (Corsários): flanco inferior serrilhado na cor secundária
  const tooth = abs(fract(P.z.mul(0.42)).sub(0.5)).mul(2.0);
  const teeth = step(p.y, tooth.mul(0.32).sub(0.12)).mul(smoothstep(0.25, 0.6, abs(n.x))).mul(U.fx.z).mul(zP);
  paintCol = mix(paintCol, U.secondary.mul(1.15), teeth);
  // lascas expondo metal perto das juntas + escorridos
  const chip = smoothstep(0.6, 0.78, g1.add(nearSeam.mul(0.32)).add(vnoise(P.mul(7.0)).mul(0.18))).mul(wearAmt).mul(isPaint);
  const grime = streak.mul(0.55).add(g1.mul(0.25)).mul(wearAmt).mul(0.55);

  const hot = mix(vec3(0.5, 0.33, 0.2), vec3(0.2, 0.2, 0.34), vnoise(P.mul(3.0)));
  const brushed = vnoise(P.mul(vec3(1.5, 1.5, 38.0)));
  let col = paintCol.mul(isPaint)
    .add(U.trim.mul(zT))
    .add(U.metal.mul(brushed.mul(0.25).add(0.82)).mul(zM))
    .add(U.dark.mul(zD))
    .add(hot.mul(zH))
    .add(U.glow.mul(0.25).mul(zG))
    .add(vec3(0.02, 0.02, 0.022).mul(zR));
  col = mix(col, U.metal.mul(0.75), chip);
  col = col.mul(float(1).sub(grime)).mul(float(1).sub(line.mul(0.55)));

  let metal = U.paint.x.mul(isPaint).add(zT).add(zM).add(zD.mul(0.75)).add(zH);
  metal = mix(metal, float(1), chip);
  let rough = U.paint.y.mul(isPaint).add(float(0.2).mul(zT)).add(brushed.mul(0.14).add(0.28).mul(zM)).add(float(0.48).mul(zD))
    .add(float(0.3).mul(zH)).add(float(0.35).mul(zG)).add(float(0.85).mul(zR));
  rough = rough.add(grime.mul(0.5)).add(line.mul(0.3)).add(patchSel.mul(0.2)).sub(chip.mul(0.1));

  // dano: queimadura global + impactos localizados (no espaço do objeto)
  let hitS = float(0);
  for (let i = 0; i < 4; i++) {
    const h = U.hits.element(i);
    const r = max(h.w, 1e-3);
    hitS = max(hitS, float(1).sub(smoothstep(0.0, r, length(P.sub(h.xyz)))).mul(step(1e-3, h.w)));
  }
  const g2 = vnoise(P.mul(1.7).add(5.0));
  const scorch = clamp(max(U.damage.mul(1.6).sub(g2.mul(1.1)), hitS.mul(g1.mul(0.6).add(0.7))), 0, 1);
  col = mix(col, vec3(0.018, 0.016, 0.014), scorch.mul(0.92));
  rough = mix(rough, float(0.92), scorch);
  metal = mix(metal, float(0.2), scorch);

  // emissivos: painéis luminosos, circuitos, brasas
  const pulse = sin(time.mul(1.4).sub(P.z.mul(0.25)).add(id.mul(6.0))).mul(0.4).add(0.6);
  const circ = exp(d.mul(-38.0)).mul(step(0.35, id)).mul(U.fx.w).mul(pulse);
  const ember = smoothstep(0.82, 0.98, scorch.mul(g2.mul(0.5).add(0.6))).mul(sin(time.mul(7.0).add(g1.mul(20.0))).mul(0.3).add(0.7));
  let fillE = vec3(0, 0, 0);
  let fillAO = float(1);
  if (fill) {
    // oclusão falsa nas quinas piso/teto × paredes (caixa da cabine em U.box)
    const ex = U.box.x.sub(abs(P.x.sub(U.box.w)));
    const ey = min(P.y.sub(U.box.y), U.box.z.sub(P.y));
    fillAO = smoothstep(-0.05, 0.55, ex).mul(0.55).add(0.45).mul(smoothstep(-0.05, 0.5, ey).mul(0.5).add(0.5));
    fillAO = mix(float(1), fillAO, U.aoK);
    let acc = vec3(U.fillAmb).mul(fillAO);
    for (let i = 0; i < 3; i++) {
      const L = U.lamps.element(i);
      const dv = L.xyz.sub(P);
      const dd = length(dv);
      const lam = max(dot(n, dv.div(dd.add(1e-4))), 0.0).mul(0.75).add(0.25);
      acc = acc.add(vec3(U.lampCol.element(i)).mul(lam.div(dd.mul(dd).div(L.w.mul(L.w).add(1e-4)).add(1.0))));
    }
    // fileira de luminárias no teto: cone para baixo (poças de luz no piso)
    const lz = fract(P.z.sub(U.rowPh).div(U.row.x)).sub(0.5).mul(U.row.x);
    const dr = vec3(P.x.sub(U.row.z), P.y.sub(U.row.y), lz);
    const rd = length(dr);
    const ldir = dr.negate().div(rd.add(1e-4));
    const rl = max(dot(n, ldir), 0.0).mul(0.8).add(0.2);
    const cone = smoothstep(0.15, 0.75, ldir.y).mul(0.85).add(0.15);
    acc = acc.add(vec3(U.rowCol).mul(rl.mul(cone).div(rd.mul(rd).div(U.row.w.mul(U.row.w).add(1e-4)).add(1.0))).mul(fillAO.mul(0.5).add(0.5)));
    fillE = col.mul(acc);
    // brilho rasante falso (fresnel) nas superfícies lisas sob as luminárias
    const V = normalize(positionView).negate();
    const nv = normalize(normalView);
    const fres = pow(float(1).sub(max(dot(nv, V), 0.0)), 5.0);
    fillE = fillE.add(vec3(U.rowCol).mul(0.03).mul(fres).mul(float(1).sub(rough.clamp(0, 1))).mul(cone));
  }
  m.colorNode = fill ? col.mul(U.realLight) : col;
  m.metalnessNode = clamp(metal, 0, 1);
  m.roughnessNode = clamp(rough, 0.05, 1);
  m.emissiveNode = U.glow.mul(zG.mul(U.glowPower).add(circ.mul(U.glowPower.mul(1.4)))).add(vec3(2.4, 0.7, 0.15).mul(ember.mul(4.0))).add(fillE);
  if (!lite) {
    m.clearcoatNode = U.paint.z.mul(isPaint).mul(float(1).sub(chip)).mul(float(1).sub(grime.mul(1.5))).mul(float(1).sub(scorch)).max(0);
    m.clearcoatRoughnessNode = float(0.08).add(grime.mul(0.4));
    if (iridescent) {
      m.iridescenceNode = isPaint.mul(0.9);
      m.iridescenceIORNode = float(1.6);
      m.iridescenceThicknessNode = g1.mul(500).add(250);
    }
  }
  const seamDepth = U.panel.mul(0.0035);
  m.normalNode = bumpNormal(line.mul(seamDepth).negate().add(grime.mul(0.0015)).sub(chip.mul(0.0012)), 1.0);
  return m;
}

/** Aplica uma pintura alternativa / paleta parcial a um material de casco. */
export function setHullPalette(mat, pal) {
  const U = mat.userData.U; if (!U || !pal) return;
  for (const k of ['primary', 'secondary', 'trim', 'metal', 'dark', 'glow']) if (pal[k]) U[k].value.setRGB(pal[k][0], pal[k][1], pal[k][2]);
}

/** Luzes: cor HDR no atributo aLight (xyz), w = pisca (0 fixa, >0 Hz estrobo, <0 farol lento). */
export function makeLightsMaterial() {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = false;
  const L = attribute('aLight', 'vec4');
  const strobe = step(0.9, fract(time.mul(L.w))).add(step(0.9, fract(time.mul(L.w).add(0.16))));
  const beacon = sin(time.mul(L.w.abs().mul(6.283))).mul(0.5).add(0.5).pow(3.0).mul(0.95).add(0.05);
  const k = select(L.w.equal(0), float(1), select(L.w.greaterThan(0), strobe.min(1), beacon));
  m.colorNode = L.xyz.mul(k);
  m.userData.lights = true;
  return m;
}

/** Vidro do canopy visto de fora: escuro, com reflexo, leve tinta da facção e brilho dos instrumentos. */
export function makeCanopyMaterial(tint = [0.3, 0.3, 0.3], lite = false) {
  const m = lite ? new THREE.MeshStandardNodeMaterial() : new THREE.MeshPhysicalNodeMaterial();
  const t = C(tint);
  const P = positionLocal;
  const fres = pow(float(1).sub(abs(dot(normalize(normalView), normalize(positionView.negate())))), 3.0);
  m.colorNode = mix(vec3(0.01, 0.012, 0.016), vec3(t.r, t.g, t.b).mul(0.35), fres);
  m.metalnessNode = float(0.6);
  m.roughnessNode = float(0.04).add(vnoise(P.mul(9.0)).mul(0.05));
  if (!lite) { m.clearcoatNode = float(1); m.clearcoatRoughnessNode = float(0.02); }
  const inst = smoothstep(0.62, 0.92, vnoise(P.mul(vec3(18, 11, 4)))).mul(0.5);
  m.emissiveNode = vec3(0.25, 0.6, 1.0).mul(inst.mul(0.25)).add(vec3(1.0, 0.6, 0.25).mul(0.015));
  return m;
}

/** Núcleo incandescente dos motores (por nave: acelerador como uniform). */
export function makeEngineCoreMaterial(color, U) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = false;
  const c = C(color);
  const r = length(uv().sub(0.5)).mul(2.0);
  const hotCore = exp(r.mul(r).mul(-3.0));
  const flick = vnoise(vec3(time.mul(22.0), uv().x.mul(3.0), 0.5)).mul(0.25).add(0.85);
  const pw = U.throttle.mul(0.85).add(0.15).add(U.boost.mul(0.8));
  m.colorNode = mix(vec3(c.r, c.g, c.b).mul(6.0), vec3(1.0, 0.95, 0.9).mul(14.0), hotCore.mul(U.throttle)).mul(pw).mul(flick);
  return m;
}

/** Pluma de exaustão: cone aditivo com corpo, diamantes de choque e cintilação. */
export function makePlumeMaterial(color, U) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.fog = false;
  const c = C(color);
  m.colorNode = Fn(() => {
    const t = uv().y;               // 0 bocal → 1 ponta
    const around = uv().x;
    const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
    const body = pow(facing, 2.2);
    const thr = U.throttle.add(U.boost.mul(0.6));
    const fall = pow(float(1).sub(t), mix(float(5.0), float(2.2), clamp(thr, 0, 1)));
    const diamonds = pow(sin(t.mul(40.0).sub(time.mul(16.0))).mul(0.5).add(0.5), 5.0).mul(exp(t.mul(-5.0))).mul(clamp(thr.sub(0.3), 0, 1));
    const flick = vnoise(vec3(around.mul(9.0), t.mul(7.0).sub(time.mul(15.0)), 1.0)).mul(0.45).add(0.6);
    const col = vec3(c.r, c.g, c.b).mul(fall.mul(1.1).add(diamonds.mul(1.6))).mul(flick);
    const hot = vec3(0.9, 0.95, 1.0).mul(exp(t.mul(-16.0)).mul(2.8));
    return vec4(col.add(hot).mul(body).mul(thr.mul(0.9).add(0.1)).mul(U.plumeGain), 1.0);
  })();
  return m;
}

/** Material de decalque (atlas em CanvasTexture), alfa recortado. */
export function makeDecalMaterial(tex) {
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false });
  m.map = tex;
  m.roughness = 0.45; m.metalness = 0.1;
  m.alphaTest = 0.05;
  return m;
}
