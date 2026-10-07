// Efeitos de visor/vidro em tela (capacete em 1ª pessoa ou canópia do
// cockpit): gotas de chuva escorrendo (refração analítica de lentes
// plano-convexas), gelo cristalizando a partir das bordas, poeira/manchas
// que acendem contra a luz e rachaduras de impacto com brilho especular.
//
// Tudo é TSL avaliado no composite final (sem texturas). As funções aqui
// são "construtoras": chamadas dentro de um Fn, recebem nós e devolvem nós.
//
// Espaço de trabalho: q = (uv − 0,5)·(aspecto, 1) — unidades de altura de
// tela, centro em 0, sem distorção de aspecto.

import { Fn, vec2, vec3, vec4, float, floor, fract, abs, min, max, mix, clamp, smoothstep, step, length, dot, sqrt, sin, cos, atan, exp, pow, PI, select } from 'three/tsl';
import { hash11, hash12, hash22, hash32, vnoise2, fbm2, voronoi2 } from '../tsl-lib.js';

// ─── chuva ───────────────────────────────────────────────────────────────
// Construtores "inline" (chamados dentro do Fn do composite): devolvem
// objetos JS de nós {off, cov, ring, hl, trail}. Tudo em unidades de q.

/** Contas estáveis: gotinhas paradas que surgem e evaporam. */
function beads(q, t, density, cells, seed) {
  const g = q.mul(cells);
  const id = floor(g);
  const f = fract(g).sub(0.5);
  const h = hash32(id.add(seed));
  const c = h.xy.sub(0.5).mul(0.5);
  const rc = mix(0.12, 0.34, pow(hash12(id.add(seed).add(3.17)), 2.0)); // raio em células
  const life = fract(t.mul(mix(0.04, 0.12, h.z)).add(h.z.mul(7.0)));
  const fade = smoothstep(0.0, 0.05, life).mul(smoothstep(1.0, 0.6, life));
  const exists = step(float(1).sub(density), hash12(id.add(seed).add(7.71)));
  const dq = f.sub(c).div(cells); // vetor ao centro, em q
  const rq = rc.mul(fade.mul(0.35).add(0.65)).div(cells);
  const dd = length(dq.mul(vec2(1, 1.06))).div(rq);
  const m = smoothstep(1.0, 0.86, dd).mul(exists).mul(fade);
  // lente plano-convexa: imagem invertida e ampliada → amostra em c − d·k
  const off = dq.negate().mul(2.4).mul(m);
  const ring = smoothstep(0.55, 0.98, dd).mul(m);
  const hl = smoothstep(0.32, 0.0, length(dq.div(rq).sub(vec2(-0.32, 0.38)))).mul(m);
  return { off, cov: m, ring, hl };
}

/** Gotas que escorrem (stick-slip) deixando rastro de microgotas. */
function sliders(q, t, density, cols, seed) {
  const grid = vec2(cols, cols.div(3.0));
  const col = floor(q.x.mul(grid.x));
  const hc = hash12(vec2(col, seed));
  const qy = q.y.add(hc.mul(13.7));
  const g = vec2(q.x.mul(grid.x), qy.mul(grid.y));
  const id = floor(g);
  const st = fract(g).sub(vec2(0.5, 0));
  const n = hash32(id.add(vec2(seed.mul(17.0), 0)));
  const exists = step(float(1).sub(density), n.y);
  const wig = sin(g.y.mul(5.0).add(sin(g.y.mul(2.3)))).mul(0.12).mul(n.z.sub(0.5));
  const x0 = n.x.sub(0.5).mul(0.5).add(wig);
  const ph = fract(t.mul(mix(0.12, 0.3, n.z)).add(n.x.mul(3.1)));
  const slip = ph.add(sin(ph.mul(PI.mul(2)).mul(3.0)).mul(0.04));
  const y0 = float(0.92).sub(slip.mul(0.86));
  // vetor até a gota em q (célula não é quadrada)
  const dq = st.sub(vec2(x0, y0)).div(grid);
  const rq = float(0.2).div(grid.x).mul(n.z.mul(0.5).add(0.75));
  const dd = length(dq.mul(vec2(1.0, 0.72))).div(rq);
  const m = smoothstep(1.0, 0.85, dd).mul(exists);
  // rastro: microgotas acima da gota
  const above = smoothstep(0.0, 0.04, st.y.sub(y0));
  const cxq = abs(st.x.sub(x0)).div(grid.x);
  const trailOn = above.mul(smoothstep(1.0, y0.add(0.1), st.y)).mul(exists);
  const trail = smoothstep(rq.mul(0.55), rq.mul(0.15), cxq).mul(trailOn);
  const ty = fract(st.y.mul(11.0).add(n.z.mul(3.0)));
  const mdq = vec2(st.x.sub(x0).div(grid.x), ty.sub(0.5).div(grid.y.mul(11.0)));
  const mr = rq.mul(0.32).mul(hash12(vec2(floor(st.y.mul(11.0)), id.x.add(seed))).mul(0.8).add(0.4));
  const mdd = length(mdq).div(mr);
  const micro = smoothstep(1.0, 0.8, mdd).mul(trailOn).mul(step(0.4, hash12(vec2(floor(st.y.mul(11.0)).add(5.0), id.x))));
  const off = dq.negate().mul(2.8).mul(m).add(mdq.negate().mul(2.0).mul(micro));
  const ring = smoothstep(0.55, 0.98, dd).mul(m).add(smoothstep(0.5, 0.98, mdd).mul(micro));
  const hl = smoothstep(0.3, 0.0, length(dq.mul(vec2(1.0, 0.72)).div(rq).sub(vec2(-0.3, 0.4)))).mul(m);
  return { off, cov: max(m, micro), ring, hl, trail };
}

/**
 * Chuva no vidro. flow = direção de escoamento na tela (normalizada,
 * padrão (0,−1)). Retorna {off (q), cov, ring, hl, trail}.
 */
export function visorRain(q, t, amount, flow) {
  // gira o espaço para que "para baixo" seja a direção de escoamento
  const fx = flow.x;
  const fy = flow.y;
  const qr = vec2(q.x.mul(fy.negate()).add(q.y.mul(fx)), q.x.mul(fx).negate().sub(q.y.mul(fy)));
  const b1 = beads(qr, t, amount.mul(0.5), float(34), float(0));
  const b2 = beads(qr.add(vec2(0.37, 0.11)), t.add(11.0), amount.mul(0.42), float(70), float(13));
  const b3 = beads(qr.add(vec2(0.71, 0.53)), t.add(5.0), amount.mul(0.35), float(15), float(29));
  const s1 = sliders(qr, t, amount.mul(0.75).sub(0.05), float(14), float(1));
  const s2 = sliders(qr.add(vec2(0.21, 0.4)), t.mul(1.1), amount.mul(0.6).sub(0.15), float(22), float(2));
  const o = b1.off.add(b2.off).add(b3.off).add(s1.off).add(s2.off);
  // desfaz a rotação no deslocamento
  const off = vec2(o.x.mul(fy.negate()).sub(o.y.mul(fx)), o.x.mul(fx).sub(o.y.mul(fy)));
  return {
    off,
    cov: clamp(b1.cov.add(b2.cov).add(b3.cov).add(s1.cov).add(s2.cov), 0, 1),
    ring: clamp(b1.ring.add(b2.ring).add(b3.ring).add(s1.ring).add(s2.ring), 0, 1),
    hl: clamp(b1.hl.add(b2.hl).add(b3.hl).add(s1.hl).add(s2.hl), 0, 1),
    trail: clamp(s1.trail.add(s2.trail), 0, 1),
  };
}

// ─── gelo ────────────────────────────────────────────────────────────────

/** fbm "ridged" 2D (veios ramificados, lembra samambaias de geada). */
function ridged(p, oct = 4) {
  let s = float(0);
  let a = 0.5;
  let pp = p;
  for (let i = 0; i < oct; i++) {
    const n = float(1).sub(abs(vnoise2(pp).mul(2).sub(1)));
    s = s.add(n.mul(n).mul(a));
    pp = vec2(pp.x.mul(1.7).sub(pp.y.mul(1.1)), pp.x.mul(1.1).add(pp.y.mul(1.7))).add(vec2(3.1, 1.7));
    a *= 0.5;
  }
  return s.div(0.9375);
}

/**
 * Geada crescendo das bordas: névoa branca translúcida + veios de cristal
 * mais densos na frente de crescimento + cintilância. Retorna
 * {off, mask (névoa), crystal}.
 */
export function visorFrost(q, uv, aspect, amount) {
  const ex = min(uv.x, uv.x.oneMinus()).mul(aspect);
  const ey = min(uv.y, uv.y.oneMinus());
  const e = min(ex, ey);
  const corner = length(vec2(ex, ey)).mul(0.75);
  const edge = min(e.mul(1.15), corner);
  const warp = vec2(fbm2(q.mul(2.5)), fbm2(q.mul(2.5).add(vec2(7.3, 2.1)))).sub(0.5);
  const n = fbm2(q.mul(3.0).add(warp.mul(0.8)));
  const cov = float(1).sub(edge.mul(2.4)).add(n.sub(0.5).mul(0.8));
  const th = float(1.05).sub(amount.mul(1.1));
  const mask = smoothstep(th, th.add(0.22), cov);
  const front = smoothstep(th.sub(0.05), th.add(0.06), cov).mul(smoothstep(th.add(0.3), th.add(0.08), cov));
  const qw = q.add(warp.mul(0.12));
  // agulhas anisotrópicas crescendo PERPENDICULARES à borda mais próxima
  // (coordenadas: ao longo da borda × distância à borda), com ramos a ±50°
  const along = select(ex.lessThan(ey), uv.y, uv.x.mul(aspect));
  const ec = vec2(along, edge).add(warp.mul(0.05));
  const needles = smoothstep(0.6, 0.97, ridged(vec2(ec.x.mul(90.0), ec.y.mul(9.0)), 3));
  const r1 = vec2(ec.x.mul(0.64).add(ec.y.mul(0.77)), ec.y.mul(0.64).sub(ec.x.mul(0.77)));
  const r2 = vec2(ec.x.mul(0.64).sub(ec.y.mul(0.77)), ec.y.mul(0.64).add(ec.x.mul(0.77)));
  const branches = smoothstep(0.66, 0.98, ridged(vec2(r1.x.mul(140.0), r1.y.mul(16.0)), 2)).add(smoothstep(0.66, 0.98, ridged(vec2(r2.x.mul(140.0), r2.y.mul(16.0)).add(vec2(4.0, 1.0)), 2)));
  const fern = needles.add(branches.mul(0.6));
  const fine = smoothstep(0.62, 0.98, ridged(qw.mul(90.0).add(vec2(9.1, 4.4)), 2));
  const sparkle = step(0.992, hash12(floor(q.mul(380.0)))).mul(mask);
  const crystal = clamp(fern.mul(mask.mul(0.35).add(front.mul(0.9))).add(fine.mul(mask).mul(0.25)).add(sparkle.mul(1.5)), 0, 2);
  const gx = vnoise2(qw.mul(60.0).add(vec2(0.05, 0))).sub(vnoise2(qw.mul(60.0)));
  const gy = vnoise2(qw.mul(60.0).add(vec2(0, 0.05))).sub(vnoise2(qw.mul(60.0)));
  const off = vec2(gx, gy).mul(0.02).mul(mask);
  return { off, mask, crystal };
}

// ─── poeira e manchas ────────────────────────────────────────────────────

/** Retorna vec2(pontos de poeira, mancha difusa). */
export function visorDust(q, amount) {
  return Fn(() => {
    const g = q.mul(150.0);
    const id = floor(g);
    const f = fract(g).sub(0.5);
    const h = hash32(id);
    const d = length(f.sub(h.xy.sub(0.5).mul(0.7)));
    const speck = smoothstep(mix(0.1, 0.25, h.z), 0.0, d).mul(step(0.93, hash12(id.add(1.3))));
    const g2 = q.mul(45.0);
    const id2 = floor(g2);
    const h2 = hash32(id2);
    const d2 = length(fract(g2).sub(0.5).sub(h2.xy.sub(0.5).mul(0.6)));
    const fleck = smoothstep(0.3, 0.0, d2).mul(step(0.96, h2.z)).mul(0.5);
    const smudge = smoothstep(0.45, 0.85, fbm2(q.mul(2.6).add(vec2(3.1, 7.2)))).mul(0.8).add(smoothstep(0.55, 0.9, fbm2(q.mul(7.0))).mul(0.35));
    return vec2(speck.add(fleck).mul(amount), smudge.mul(amount));
  })();
}

// ─── rachaduras ──────────────────────────────────────────────────────────

/**
 * Rachaduras radiais + anéis concêntricos + estilhaço no centro do impacto.
 * center em q; seed varia o padrão. Retorna vec3(offset.xy, linhas).
 */
export function visorCrack(q, amount, center, seed) {
  return Fn(() => {
    const d = q.sub(center);
    const r = length(d);
    const a = atan(d.y, d.x);
    const spokes = float(17);
    const wob = vnoise2(vec2(r.mul(9.0), seed)).sub(0.5).mul(0.9).add(vnoise2(vec2(r.mul(37.0), seed.add(4.0))).sub(0.5).mul(0.25));
    const aa = a.div(PI.mul(2)).mul(spokes).add(wob).add(seed);
    const si = floor(aa);
    const hs = hash12(vec2(si, seed));
    const reach = amount.mul(mix(0.25, 1.1, hs));
    const sd = abs(fract(aa).sub(0.5)).mul(r).mul(PI.mul(2)).div(spokes);
    const w = mix(0.0009, 0.0026, hs).mul(smoothstep(reach, 0.0, r).add(0.25));
    const spoke = smoothstep(w, 0.0, sd).mul(step(r, reach)).mul(step(0.12, hs));
    // anéis em segmentos
    const rr = r.mul(14.0).add(vnoise2(vec2(a.mul(2.5), seed.add(9.0))).mul(0.8));
    const ri = floor(rr);
    const hr = hash12(vec2(ri, floor(aa.mul(0.5)).add(seed)));
    const rd = abs(fract(rr).sub(0.5)).div(14.0);
    const ring = smoothstep(0.0016, 0.0, rd).mul(step(0.45, hr)).mul(step(r, amount.mul(0.32))).mul(step(0.03, r));
    // estilhaço no centro
    const v = voronoi2(d.mul(70.0).add(seed));
    const shatter = smoothstep(0.07, 0.0, v.x).mul(smoothstep(amount.mul(0.06), amount.mul(0.03), r));
    const core = smoothstep(amount.mul(0.022), 0.0, r).mul(0.8);
    const lines = clamp(max(max(spoke, ring), max(shatter, core)), 0, 1);
    const off = d.div(max(r, 0.001)).mul(lines).mul(0.004).add(v.y.sub(0.3).mul(shatter).mul(0.01));
    return vec3(off, lines);
  })();
}
