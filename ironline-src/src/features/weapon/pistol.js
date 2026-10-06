/**
 * Pistola de serviço "P-11" (design original do IRONLINE): 9 mm, percussor
 * lançado, armação de polímero cor terra com ferrolho de aço nitretado.
 *
 * Coordenadas (m): X direita, Y cima, frente −Z, eixo do cano em y = 0,
 * z = 0 na face traseira do ferrolho. Comprimento ≈ 0,19 m, altura ≈ 0,135 m.
 *
 * Peças: ferrolho (recua no tiro e trava aberto quando vazio) com serrilhas
 * dianteiras/traseiras, janela de ejeção com capuz do cano, miras de 3
 * pontos (a dianteira com anel laranja), armação com trilho, guarda-mato
 * quadrado, punho com pontilhado e encaixe de dedo, rabo-de-castor, retém
 * do ferrolho e do carregador, alavanca de desmontagem, gatilho com
 * segurança de lâmina, carregador de aço com base de polímero estendida.
 *
 * Devolve as peças móveis (slide, mag, trigger, slideStop) e referências
 * (muzzle, ejectPort, sight).
 */
import * as THREE from 'three';
import { Kit, side, section, rbox, cylZ, cylX } from './geo.js';

export const PDIM = {
  slideLen: 0.186,
  slideTop: 0.0172,
  slideBot: -0.0105,
  slideW: 0.0245,
  sightY: 0.0228, // topo das miras (linha de visada)
};

/** Seção do ferrolho: flancos retos, chanfros altos (topo estreito). */
function slideSection(w = PDIM.slideW, top = PDIM.slideTop, bot = PDIM.slideBot) {
  const h = w / 2;
  return [[-h, bot], [h, bot], [h, top - 0.0072], [h - 0.0032, top], [-h + 0.0032, top], [-h, top - 0.0072]];
}

export function buildPistol(M) {
  const root = new THREE.Group();
  root.name = 'P-11';
  const D = PDIM;

  // ─── ferrolho (grupo móvel) ──────────────────────────────────────────
  const slide = new THREE.Group();
  slide.name = 'slide';
  const S = new Kit();
  // corpo: seção chanfrada; nariz com chanfro inferior (perfil lateral)
  S.add('slide', section(slideSection(), -0.0005, D.slideLen - 0.009, { b: 0.0011, seg: 2 }));
  S.add('slide', side([[D.slideLen - 0.0095, D.slideBot], [D.slideLen - 0.002, D.slideBot + 0.0065], [D.slideLen - 0.002, D.slideTop - 0.0075], [D.slideLen - 0.0095, D.slideTop]], D.slideW - 0.0024, { b: 0.0012, seg: 2 }));
  // serrilhas traseiras e dianteiras (sulcos: tiras escuras rentes ao flanco)
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const u = 0.006 + i * 0.0036;
      S.add('cavity', rbox(0.0008, 0.0175, 0.0014, 0.0003, sx * (D.slideW / 2 - 0.0002), 0.0005, -u));
    }
    for (let i = 0; i < 6; i++) {
      const u = 0.128 + i * 0.0036;
      S.add('cavity', rbox(0.0008, 0.0135, 0.0014, 0.0003, sx * (D.slideW / 2 - 0.0002), -0.001, -u));
    }
    // marcação gravada (painel liso)
  }
  // janela de ejeção (lado direito + topo) e capuz do cano visível
  S.add('cavity', rbox(0.0036, 0.0125, 0.042, 0.001, D.slideW / 2 - 0.0016, 0.0062, -0.098));
  S.add('cavity', rbox(0.013, 0.0012, 0.042, 0.0005, 0.0045, D.slideTop - 0.0004, -0.098));
  S.add('steel', rbox(0.0146, 0.012, 0.036, 0.0012, 0.0012, 0.0048, -0.096));
  // mira traseira: base em cauda-de-andorinha com entalhe em U e 2 pontos
  S.add('slide', rbox(0.0182, 0.0058, 0.0085, 0.0011, 0, D.slideTop + 0.0027, -0.009));
  S.add('cavity', rbox(0.0034, 0.004, 0.009, 0.0008, 0, D.sightY - 0.0015, -0.009));
  for (const sx of [-1, 1]) S.add('dot', cylZ(0.0011, -0.0044, -0.0048, { x: sx * 0.0055, y: D.slideTop + 0.0033, seg: 12 }));
  // mira dianteira: lâmina com ponto (anel laranja)
  S.add('slide', rbox(0.0034, 0.0058, 0.0062, 0.0007, 0, D.slideTop + 0.0026, -(D.slideLen - 0.012)));
  S.add('sightRing', cylZ(0.00125, -(D.slideLen - 0.0151), -(D.slideLen - 0.0153), { y: D.slideTop + 0.0036, seg: 14 }));
  S.add('dot', cylZ(0.0007, -(D.slideLen - 0.0152), -(D.slideLen - 0.0154), { y: D.slideTop + 0.0036, seg: 10 }));
  // placa traseira do percussor
  S.add('polymer', rbox(0.0145, 0.016, 0.0016, 0.0006, 0, -0.0005, 0.0003));
  // indicador de cartucho na câmara (extrator)
  S.add('steel', rbox(0.0012, 0.0032, 0.016, 0.0005, D.slideW / 2 + 0.0002, 0.0072, -0.075));
  slide.add(S.build(M, 'slide'));
  root.add(slide);

  // cano: boca saliente com coroa e alma
  const B = new Kit();
  B.add('steel', cylZ(0.0068, -0.15, -(D.slideLen - 0.0005), { seg: 28 }));
  B.add('cavity', cylZ(0.0046, -(D.slideLen - 0.003), -(D.slideLen - 0.0002), { seg: 20 }));
  const barrel = B.build(M, 'barrel');
  slide.add(barrel); // o cano recua junto (curto) — simplificação: segue o ferrolho

  // ─── armação (polímero) ──────────────────────────────────────────────
  const F = new Kit();
  // trilhos internos / caixa sob o ferrolho, com trilho de acessórios
  F.add('frame', side([[0.004, -0.0105], [0.176, -0.0105], [0.176, -0.0215], [0.168, -0.0245], [0.098, -0.0245], [0.09, -0.0215], [0.04, -0.0215], [0.03, -0.0195], [0.004, -0.0195]], 0.0236, { b: 0.0016, seg: 2 }));
  for (let i = 0; i < 3; i++) F.add('cavity', rbox(0.0242, 0.0024, 0.0034, 0.0005, 0, -0.0222, -(0.112 + i * 0.019)));
  // guarda-mato quadrado com gancho e entalhe
  const tg = new THREE.Shape();
  tg.moveTo(0.04, -0.019);
  tg.lineTo(0.1, -0.019);
  tg.lineTo(0.1, -0.026);
  tg.quadraticCurveTo(0.1, -0.03, 0.097, -0.031);
  tg.lineTo(0.095, -0.0435);
  tg.quadraticCurveTo(0.094, -0.0472, 0.09, -0.0475);
  tg.lineTo(0.053, -0.0475);
  tg.quadraticCurveTo(0.046, -0.047, 0.044, -0.04);
  tg.lineTo(0.04, -0.019);
  const tgh = new THREE.Path();
  tgh.moveTo(0.05, -0.0228);
  tgh.lineTo(0.087, -0.0228);
  tgh.quadraticCurveTo(0.09, -0.0228, 0.0897, -0.026);
  tgh.lineTo(0.0878, -0.04);
  tgh.quadraticCurveTo(0.0872, -0.0422, 0.085, -0.0422);
  tgh.lineTo(0.0545, -0.0422);
  tgh.quadraticCurveTo(0.0515, -0.0422, 0.0508, -0.039);
  tgh.lineTo(0.0495, -0.026);
  tgh.quadraticCurveTo(0.0492, -0.0228, 0.05, -0.0228);
  tg.holes.push(tgh);
  F.add('frame', side(tg, 0.0118, { b: 0.0018, seg: 2, curve: 10 }));
  // punho: ângulo ~19°, encaixe de dedo no frontal, dorso abaulado, rabo-de-castor
  const grip = new THREE.Shape();
  grip.moveTo(-0.0175, -0.0125);
  grip.quadraticCurveTo(-0.0225, -0.0135, -0.0225, -0.0185); // ponta do rabo-de-castor
  grip.quadraticCurveTo(-0.017, -0.0245, -0.0125, -0.031);
  grip.bezierCurveTo(-0.0145, -0.05, -0.0205, -0.075, -0.0255, -0.098);
  grip.lineTo(-0.0285, -0.1165);
  grip.lineTo(0.0215, -0.1165);
  grip.bezierCurveTo(0.025, -0.1, 0.03, -0.085, 0.032, -0.072);
  grip.quadraticCurveTo(0.0335, -0.064, 0.0365, -0.058); // encaixe do dedo médio
  grip.quadraticCurveTo(0.0405, -0.05, 0.0405, -0.044);
  grip.lineTo(0.046, -0.0215);
  grip.lineTo(0.004, -0.0195);
  grip.lineTo(-0.0175, -0.0125);
  F.add('frame', side(grip, 0.0298, { b: 0.0068, seg: 4, curve: 18 }));
  // pontilhado: painéis laterais levemente salientes (textura de pegada)
  for (const sx of [-1, 1]) {
    const pad = new THREE.Shape();
    pad.moveTo(-0.012, -0.036);
    pad.bezierCurveTo(-0.016, -0.06, -0.021, -0.08, -0.024, -0.106);
    pad.lineTo(0.017, -0.106);
    pad.bezierCurveTo(0.024, -0.085, 0.028, -0.07, 0.03, -0.06);
    pad.lineTo(0.034, -0.05);
    pad.lineTo(0.032, -0.036);
    F.add('stipple', side(pad, 0.0016, { b: 0.0006, cx: sx * 0.0141 }));
  }
  // apoio do polegar (rebaixo no flanco acima do punho)
  for (const sx of [-1, 1]) F.add('frame', rbox(0.0016, 0.0042, 0.018, 0.0007, sx * 0.0122, -0.0175, -0.044));
  // retém do carregador (botão, lado esquerdo) e alavanca de desmontagem
  F.add('polymer', rbox(0.0034, 0.0078, 0.0085, 0.0013, -0.0146, -0.0275, -0.039));
  for (const sx of [-1, 1]) F.add('steel', rbox(0.0012, 0.0028, 0.0105, 0.0005, sx * 0.0122, -0.0165, -0.1));
  // pinos da armação
  for (const [u, v] of [[0.036, -0.0155], [0.066, -0.0165]]) F.add('steel', cylX(0.00145, 0.0244, 0, v, -u, 12));
  root.add(F.build(M, 'frame'));

  // ─── retém do ferrolho (alavanca no flanco esquerdo) ─────────────────
  const slideStop = new THREE.Group();
  {
    const k = new Kit();
    k.add('steel', side([[0, 0], [0.018, -0.0005], [0.021, 0.0028], [0.006, 0.0045], [0, 0.0035]], 0.0022, { b: 0.0005 }));
    slideStop.add(k.build(M, 'slideStop'));
    slideStop.position.set(-0.0129, -0.0158, -0.052);
  }
  root.add(slideStop);

  // ─── gatilho (lâmina curva com segurança central) ────────────────────
  const trigger = new THREE.Group();
  {
    const k = new Kit();
    const t = new THREE.Shape();
    t.moveTo(-0.002, 0.0);
    t.quadraticCurveTo(0.0055, -0.006, 0.0042, -0.0175);
    t.lineTo(0.0008, -0.0175);
    t.quadraticCurveTo(0.0018, -0.007, -0.0042, -0.0005);
    k.add('frame', side(t, 0.0068, { b: 0.0013 }));
    k.add('steel', side([[0.0012, -0.004], [0.0032, -0.0055], [0.0026, -0.0135], [0.0012, -0.0135]], 0.0024, { b: 0.0003, cx: 0 }));
    trigger.add(k.build(M, 'trigger'));
    trigger.position.set(0, -0.0225, -0.062);
  }
  root.add(trigger);

  // ─── carregador (pivô no topo do poço, inclinado com o punho) ────────
  const mag = new THREE.Group();
  mag.name = 'mag';
  const MAG0 = { pos: new THREE.Vector3(0, -0.026, -0.0155), rotX: -0.21 };
  mag.position.copy(MAG0.pos);
  mag.rotation.x = MAG0.rotX;
  mag.add(buildPistolMag(M));
  root.add(mag);

  // ─── referências ─────────────────────────────────────────────────────
  const muzzle = new THREE.Object3D();
  muzzle.name = 'muzzle';
  muzzle.position.set(0, 0, -(D.slideLen + 0.004));
  slide.add(muzzle);
  const ejectPort = new THREE.Object3D();
  ejectPort.position.set(0.013, 0.008, -0.098);
  slide.add(ejectPort);

  return {
    root, slide, mag, magBase: MAG0, trigger, slideStop, muzzle, ejectPort,
    sight: new THREE.Vector3(0, D.sightY, -0.009),
  };
}

/** Carregador de aço (fosfatizado) com base de polímero e cartucho no topo. */
export function buildPistolMag(M) {
  const K = new Kit();
  // corpo: coordenadas a partir do topo (0) para baixo, eixo do carregador = −Y
  K.add('steel', rbox(0.0222, 0.098, 0.031, 0.0035, 0, -0.049, 0.0005));
  // janelas de contagem (furos escuros nas costas)
  for (let i = 0; i < 4; i++) K.add('cavity', cylX(0.0011, 0.0226, 0, -0.03 - i * 0.014, 0.0135, 10));
  // base estendida de polímero
  K.add('frame', rbox(0.0296, 0.0095, 0.046, 0.003, 0, -0.096, 0.0018));
  K.add('frame', rbox(0.026, 0.004, 0.04, 0.0015, 0, -0.1015, 0.0018));
  // lábios
  K.add('steel', rbox(0.0186, 0.0035, 0.026, 0.0008, 0, 0.001, 0.002));
  const g = K.build(M, 'pmag');
  const r = new Kit();
  r.add('brass', cylZ(0.0049, 0.012, -0.004, { y: 0.0062, seg: 16 }));
  r.add('copper', cylZ(0.0045, -0.004, -0.0115, { y: 0.0062, seg: 16, r1: 0.0025 }));
  const rounds = r.build(M, 'rounds');
  rounds.name = 'rounds';
  g.add(rounds);
  return g;
}

/** Cápsula 9 mm deflagrada (curta e reta). */
export function buildCasing9(M) {
  const k = new Kit();
  k.add('brass', cylZ(0.00495, 0.0095, 0.0085, { seg: 18 }));
  k.add('brass', cylZ(0.0042, 0.0085, 0.0076, { seg: 18 }));
  k.add('brass', cylZ(0.00485, 0.0076, -0.0095, { seg: 18, r1: 0.0047 }));
  k.add('cavity', cylZ(0.0041, -0.0093, -0.0097, { seg: 14 }));
  k.add('steel', cylZ(0.0018, 0.0096, 0.0094, { seg: 12 }));
  return k.build(M, 'casing9', { shadows: false });
}
