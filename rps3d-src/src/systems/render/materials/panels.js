// Padrão procedural de chapas de casco em 2D (TSL, expressões puras).
//
// Dado p (vec2, em "unidades de painel"), devolve nós com:
//   h        altura (0 no sulco, 1 na chapa) — já inclui rebites
//   grad     gradiente analítico de h em p (vec2) — para normal sem derivadas de tela
//   d        distância até a borda da chapa (unidades de painel)
//   id       hash da chapa (vec2 em [0,1)) — variação de cor/rugosidade/decalques
//   cavity   0..1 perto de sulcos/rebites (sujeira acumula aqui)
//   edge     0..1 na borda elevada da chapa (desgaste da pintura)
//   rivet    0..1 sobre rebites
//   decal    0..1 dígitos de 7 segmentos (numeração de chapa)
//   lp       coordenada local dentro da chapa (0..1)
//   size     tamanho da chapa (vec2)
//
// Subdivisão: cada célula 1×1 se parte em 2 (vertical/horizontal) e cada
// metade pode se partir de novo → chapas retangulares de tamanhos variados,
// como em cascos reais. Tudo com select() (sem ramos dinâmicos).

import { vec2, vec3, float, floor, fract, abs, min, max, mix, clamp, smoothstep, step, select, length, dot, sqrt, mod, fwidth } from 'three/tsl';
import { hash22, hash12 } from '../tsl-lib.js';

// segmentos de cada dígito (bits a..g)
const SEGS = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

function digitMask(digit) {
  // digit: nó float 0..9 → nó float com a máscara de bits
  let m = float(SEGS[9]);
  for (let i = 8; i >= 0; i--) m = select(digit.lessThan(i + 0.5), float(SEGS[i]), m);
  return m;
}
const bit = (mask, k) => mod(floor(mask.div(2 ** k)), 2);
const box = (p, x0, y0, x1, y1) => step(x0, p.x).mul(step(p.x, x1)).mul(step(y0, p.y)).mul(step(p.y, y1));

/** Desenha um dígito de 7 segmentos em g ∈ [0,0.6]×[0,1]. */
export function sevenSeg(g, digit) {
  const m = digitMask(digit);
  const t = 0.11;
  const a = box(g, 0.08, 1 - t, 0.52, 1.0).mul(bit(m, 0));
  const b = box(g, 0.6 - t, 0.52, 0.6, 0.95).mul(bit(m, 1));
  const c = box(g, 0.6 - t, 0.05, 0.6, 0.48).mul(bit(m, 2));
  const d = box(g, 0.08, 0.0, 0.52, t).mul(bit(m, 3));
  const e = box(g, 0.0, 0.05, t, 0.48).mul(bit(m, 4));
  const f = box(g, 0.0, 0.52, t, 0.95).mul(bit(m, 5));
  const gg = box(g, 0.08, 0.5 - t / 2, 0.52, 0.5 + t / 2).mul(bit(m, 6));
  return clamp(a.add(b).add(c).add(d).add(e).add(f).add(gg), 0, 1);
}

/**
 * @param p   vec2 em unidades de painel
 * @param o   opções JS: {groove, rivets, decals, seed(node)}
 */
export function panelPattern(p, o = {}) {
  const gw = o.groove ?? 0.011; // largura do sulco
  const seed = o.seed ?? float(0);
  const cell = floor(p);
  const f = fract(p);
  const h1 = hash22(cell.add(seed.mul(13.1)));
  const h2 = hash22(cell.add(vec2(17.3, 5.1)).add(seed));
  // 1º corte
  const cutX = h1.x.lessThan(0.5);
  const s1 = mix(0.3, 0.7, h1.y);
  const lo1 = vec2(select(cutX.and(f.x.greaterThanEqual(s1)), s1, 0.0), select(cutX.not().and(f.y.greaterThanEqual(s1)), s1, 0.0));
  const hi1 = vec2(select(cutX.and(f.x.lessThan(s1)), s1, 1.0), select(cutX.not().and(f.y.lessThan(s1)), s1, 1.0));
  // 2º corte (no outro eixo, em ~60% das metades)
  const k2 = hash22(cell.add(lo1.mul(7.7)).add(hi1.mul(3.3)).add(seed));
  const do2 = k2.x.lessThan(0.62);
  const s2y = mix(lo1.y, hi1.y, mix(0.3, 0.7, k2.y));
  const s2x = mix(lo1.x, hi1.x, mix(0.3, 0.7, k2.y));
  const cutY2 = do2.and(cutX); // 1º foi em x → 2º em y
  const cutX2 = do2.and(cutX.not());
  const lo = vec2(select(cutX2.and(f.x.greaterThanEqual(s2x)), s2x, lo1.x), select(cutY2.and(f.y.greaterThanEqual(s2y)), s2y, lo1.y));
  const hi = vec2(select(cutX2.and(f.x.lessThan(s2x)), s2x, hi1.x), select(cutY2.and(f.y.lessThan(s2y)), s2y, hi1.y));

  const id = hash22(cell.mul(1.37).add(lo.mul(9.1)).add(hi.mul(4.7)).add(seed.mul(3.0)));
  const size = hi.sub(lo);
  const lp = f.sub(lo).div(size);
  // distâncias às 4 bordas
  const dl = f.x.sub(lo.x);
  const dr = hi.x.sub(f.x);
  const db = f.y.sub(lo.y);
  const dt = hi.y.sub(f.y);
  const dx = min(dl, dr);
  const dy = min(db, dt);
  const d = min(dx, dy);
  // gradiente de d: aponta para dentro da chapa a partir da borda mais próxima
  const gx = select(dl.lessThan(dr), 1.0, -1.0);
  const gy = select(db.lessThan(dt), 1.0, -1.0);
  const gradD = select(dx.lessThan(dy), vec2(gx, 0), vec2(0, gy));
  // antisserrilhado: largura do pixel em unidades de painel. Sulcos mais finos
  // que ~1 px alargam e perdem contraste (sem cintilação ao longe).
  const fw = max(length(fwidth(p)), 1e-6);
  const gwe = max(float(gw), fw.mul(1.2));
  const aa = clamp(float(gw * 1.6).div(fw), 0, 1);
  // perfil do sulco: chanfro suave (smoothstep) com fundo plano
  const t = clamp(d.div(gwe), 0, 1);
  const groove = float(1).sub(float(1).sub(t.mul(t).mul(t.mul(-2).add(3))).mul(aa));
  const dGroove = t.mul(t.oneMinus()).mul(6).div(gwe).mul(step(d, gwe)).mul(aa);
  // algumas chapas levemente rebaixadas/elevadas
  const inset = id.y.sub(0.5).mul(0.25).mul(step(0.7, id.x));
  let h = groove.mul(float(1).add(inset));
  let grad = gradD.mul(dGroove).mul(float(1).add(inset));

  // rebites ao longo das bordas mais compridas
  let rivet = float(0);
  if (o.rivets !== false) {
    const sp = o.rivetSpacing ?? 0.085;
    const off = gw * 2.6;
    const rr = o.rivetRadius ?? 0.011;
    // coordenada ao longo da borda mais próxima e distância à linha de rebites
    const along = select(dx.lessThan(dy), f.y, f.x);
    const across = d.sub(off);
    const u = fract(along.div(sp)).sub(0.5).mul(sp);
    const rv = vec2(u, across);
    const r = length(rv);
    const has = step(0.35, id.x).mul(step(off + rr, min(size.x, size.y).mul(0.5)));
    const inside = clamp(float(1).sub(r.mul(r).div(rr * rr)), 0, 1);
    const aaR = clamp(float(rr * 1.2).div(fw), 0, 1); // some quando menor que ~1 px
    rivet = smoothstep(rr, rr * 0.7, r).mul(has).mul(aaR);
    const dome = inside.mul(0.55).mul(has).mul(aaR);
    // gradiente do domo em (along, across) → (x,y)
    const gA = u.mul(-2 * 0.55).div(rr * rr).mul(step(r, rr)).mul(has).mul(aaR);
    const gC = across.mul(-2 * 0.55).div(rr * rr).mul(step(r, rr)).mul(has).mul(aaR);
    // across = d − off: d·grad = gradD; along é x ou y (o eixo paralelo à borda)
    const alongDir = select(dx.lessThan(dy), vec2(0, 1), vec2(1, 0));
    h = h.add(dome);
    grad = grad.add(alongDir.mul(gA)).add(gradD.mul(gC));
  }

  // decalques numéricos em ~10% das chapas grandes
  let decal = float(0);
  if (o.decals !== false) {
    const big = step(0.22, min(size.x, size.y));
    const pick = step(id.x, o.decalProb ?? 0.1).mul(big);
    const gh = float(0.075); // altura do dígito (unidades de painel)
    const gpos = f.sub(lo).sub(vec2(gw * 4, gw * 4)).div(gh); // canto inferior esquerdo
    const n1 = floor(hash12(id.mul(91.7)).mul(10));
    const n2 = floor(hash12(id.mul(37.3)).mul(10));
    const d1 = sevenSeg(gpos, n1);
    const d2 = sevenSeg(gpos.sub(vec2(0.82, 0)), n2);
    const inRect = step(0, gpos.y).mul(step(gpos.y, 1)).mul(step(0, gpos.x)).mul(step(gpos.x, 1.45));
    decal = max(d1, d2).mul(inRect).mul(pick).mul(clamp(float(0.012).div(fw), 0, 1));
  }

  const cavity = clamp(float(1).sub(smoothstep(0, gw * 3.5, d)), 0, 1).mul(aa.mul(0.6).add(0.4));
  const edge = smoothstep(gw * 0.6, gw * 1.2, d).mul(smoothstep(gw * 3.0, gw * 1.3, d));
  return { h, grad, d, id, cavity, edge: edge.mul(aa), rivet, decal, lp, size, gw };
}

export { vec3, dot, sqrt, abs, max };
