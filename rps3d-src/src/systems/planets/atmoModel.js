// Modelo físico da atmosfera de cada corpo: dispersão de Rayleigh (∝ cor do
// céu do bioma, normalizada para profundidade óptica vertical terrestre) e
// Mie (poeira/aerossóis: mais forte e colorida em desertos e vulcões), escalas
// de altura proporcionais ao raio do planeta (planetas de 22–48 km), mais a
// versão CPU da integração de dispersão simples (usada para a cor do céu no
// IBL, neblina, reflexo da água e para decidir quando o céu "apaga" as
// estrelas). A versão GPU (scatter.js) usa exatamente as mesmas fórmulas.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const MIE_TINT = {
  lush: [1, 1, 1], ocean: [1, 1, 1], ice: [0.95, 0.98, 1.0], desert: [1.0, 0.78, 0.55],
  volcanic: [0.75, 0.62, 0.55], toxic: [0.8, 1.0, 0.45], dead: [1, 1, 1], gas: [1.0, 0.9, 0.75],
};

/** Parâmetros da atmosfera (ou null). Unidades: metros. */
export function atmoParams(body) {
  const at = body.atmosphere;
  if (!at) return null;
  const R = body.radius;
  const gas = body.kind === 'gas_giant';
  // escala de altura menor que a "proporcional" da Terra: planetas de 22–48 km
  // precisam de massa de ar suficiente no horizonte para pores do sol quentes
  // (as nuvens ficam a 1–4 km: com H ≈ 3 km ainda há ~60% do ar acima delas —
  // céu azul de verdade sobre o tapete de nuvens, como na Terra)
  const HR = gas ? R * 0.005 : R * 0.08;
  const HM = HR * 0.3;
  const top = R + HR * (gas ? 10 : 6.5);
  const hint = at.rayleigh.map((c) => Math.max(0.02, c));
  const blue = hint[2] >= hint[0];
  const dens = at.density;
  let betaR, mieTint;
  const tint = MIE_TINT[body.type] || [1, 1, 1];
  if (blue || gas) {
    // céu azulado: a dica de cor do bioma vira a lei de Rayleigh (∝ dica^2,2)
    const ex = gas ? 1.1 : 2.2;
    const mx = Math.max(...hint.map((c) => c ** ex));
    const tauR = gas ? 0.05 : 0.3 * dens;
    betaR = hint.map((c) => (c ** ex / mx) * tauR / HR);
    mieTint = tint;
  } else {
    // céu de poeira (deserto/vulcão): Rayleigh físico mais fraco + poeira que
    // espalha na cor da dica e absorve o azul (céu caramelo, sol alaranjado)
    const tauR = (body.type === 'volcanic' ? 0.07 : 0.16) * dens;
    betaR = [0.18, 0.42, 1.0].map((c) => c * tauR / HR);
    const mx = Math.max(...hint);
    mieTint = hint.map((c, i) => (c / mx) * tint[i] ** 0.5);
  }
  const dusty = body.type === 'desert' || body.type === 'volcanic' || body.type === 'toxic';
  const tauM = (gas ? 0.003 : dusty ? 0.007 : 0.016) * at.mie * (body.type === 'desert' ? 4.2 : body.type === 'volcanic' ? 3.6 : body.type === 'toxic' ? 2.6 : 1) * dens;
  const betaM = mieTint.map((c) => (c * tauM) / HM);
  // extinção da poeira neutra (o que não espalha na cor da dica é absorvido)
  const betaMe = [0, 1, 2].map(() => (tauM / HM) * 1.11);
  return {
    // XK: raio "efetivo" para a massa de ar rasante (função de Chapman). O
    // planeta de 38 km tem R/H ≈ 25 — a luz rasante atravessaria pouco ar e o
    // pôr do sol sairia amarelo-claro. Com R/H efetivo ≈ 250 (como na Terra,
    // ~750) a massa de ar no horizonte vira ~20× a vertical: sol laranja e
    // vermelho, céu em brasa, sem mudar a espessura vertical (céu do meio-dia).
    xk: gas ? 1 : 20,
    R, top, HR, HM, betaR, betaM, betaMe, mieExt: 1.11, g: body.type === 'desert' || body.type === 'volcanic' ? 0.7 : 0.78,
    density: dens,
  };
}

/** Função de Chapman (Schüler): profundidade óptica para o espaço, em unidades de H. */
export function chapman(X, h, mu) {
  const c = Math.sqrt(X + h);
  if (mu >= 0) return (c / (c * mu + 1)) * Math.exp(-h);
  const x0 = Math.sqrt(Math.max(0, 1 - mu * mu)) * (X + h);
  const c0 = Math.sqrt(x0);
  return 2 * c0 * Math.exp(Math.min(80, X - x0)) - (c / (1 - c * mu)) * Math.exp(-h);
}

/** Transmitância do sol num ponto (raio r, cos do zênite solar mu). → [r,g,b] */
export function sunTransmittance(A, r, mu, out = [0, 0, 0]) {
  const h = r - A.R;
  const xk = A.xk || 1;
  const odR = A.HR * chapman(xk * A.R / A.HR, h / A.HR, mu);
  const odM = A.HM * chapman(xk * A.R / A.HM, h / A.HM, mu);
  for (let c = 0; c < 3; c++) out[c] = Math.exp(-(A.betaR[c] * odR + A.betaMe[c] * odM));
  return out;
}

/**
 * Dispersão simples ao longo de um raio (referencial local, metros).
 * ro, rd, L (direção do sol) = [x,y,z]. Retorna {I:[r,g,b] (×sunI), T:[r,g,b]}.
 */
export function scatterCPU(A, ro, rd, L, tMax = Infinity, steps = 10, out = { I: [0, 0, 0], T: [1, 1, 1] }) {
  out.I[0] = out.I[1] = out.I[2] = 0; out.T[0] = out.T[1] = out.T[2] = 1;
  const b = ro[0] * rd[0] + ro[1] * rd[1] + ro[2] * rd[2];
  const c = ro[0] ** 2 + ro[1] ** 2 + ro[2] ** 2 - A.top * A.top;
  const disc = b * b - c;
  if (disc <= 0) return out;
  const s = Math.sqrt(disc);
  let t0 = Math.max(0, -b - s), t1 = -b + s;
  // chão
  const cg = ro[0] ** 2 + ro[1] ** 2 + ro[2] ** 2 - A.R * A.R;
  const dg = b * b - cg;
  if (dg > 0) { const tg = -b - Math.sqrt(dg); if (tg > 0) t1 = Math.min(t1, tg); }
  t1 = Math.min(t1, tMax);
  if (t1 <= t0) return out;
  const ds = (t1 - t0) / steps;
  let odR = 0, odM = 0;
  const sR = [0, 0, 0], sM = [0, 0, 0], Ts = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const t = t0 + ds * (i + 0.5);
    const px = ro[0] + rd[0] * t, py = ro[1] + rd[1] * t, pz = ro[2] + rd[2] * t;
    const r = Math.sqrt(px * px + py * py + pz * pz), h = r - A.R;
    const dR = Math.exp(-h / A.HR) * ds, dM = Math.exp(-h / A.HM) * ds;
    odR += dR * 0.5; odM += dM * 0.5;
    const mu = (px * L[0] + py * L[1] + pz * L[2]) / r;
    const lR = A.HR * chapman((A.xk || 1) * A.R / A.HR, h / A.HR, mu), lM = A.HM * chapman((A.xk || 1) * A.R / A.HM, h / A.HM, mu);
    for (let k = 0; k < 3; k++) {
      Ts[k] = Math.exp(-(A.betaR[k] * (odR + lR) + A.betaMe[k] * (odM + lM)));
      sR[k] += Ts[k] * dR; sM[k] += Ts[k] * dM;
    }
    odR += dR * 0.5; odM += dM * 0.5;
  }
  const mu = rd[0] * L[0] + rd[1] * L[1] + rd[2] * L[2];
  const pR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const g = A.g, g2 = g * g;
  const pM = (3 / (8 * Math.PI)) * ((1 - g2) * (1 + mu * mu)) / ((2 + g2) * Math.pow(Math.max(1e-4, 1 + g2 - 2 * g * mu), 1.5));
  for (let k = 0; k < 3; k++) {
    out.I[k] = sR[k] * A.betaR[k] * pR + sM[k] * A.betaM[k] * pM;
    out.T[k] = Math.exp(-(A.betaR[k] * odR + A.betaMe[k] * odM));
  }
  return out;
}

/** Densidade relativa (0..1+) num raio r. */
export function densityAt(A, r) { return clamp(Math.exp(-(r - A.R) / A.HR), 0, 10); }
