/**
 * Mapa "FUNDIÇÃO 9" (id `factory`): quarteirão industrial abandonado.
 *
 * Planta (metros; y = 0 é o piso do galpão e do pátio):
 *
 *   z ∈ [-44, -8]  PÁTIO de carga ao sul (lado do sol): contêineres,
 *                  carreta encostada na DOCA do armazém anexo (plataforma
 *                  de 1,2 m, portas de enrolar), muro perimetral, portão.
 *   z ∈ [-8, 40]   GALPÃO DE MÁQUINAS 36 × 48 m, pé-direito 10,5 m
 *                  (cumeeira 13,5 m): pórticos de aço a cada 6 m, treliças,
 *                  ponte rolante com talha, janelas altas de caixilho de aço
 *                  (vidro quebrado), telhado de chapa com buracos (feixes de
 *                  sol), tornos, prensa, esteira, compressor, porta-paletes.
 *   x ∈ [-17.25, -15.65], y 4,5  PASSARELA oeste ao longo do galpão
 *                  (escada metálica no sul), PONTE de passarela em z ≈ 28
 *                  atravessando o galpão até o
 *   x ∈ [10.6, 17.65], z ∈ [24, 39.65]  BLOCO DE ESCRITÓRIOS de dois
 *                  pisos (térreo e mezanino a 4,5 m com vidraça quebrada
 *                  voltada para o galpão), escada externa no lado sul.
 *   x ∈ [18, 22]   beco leste ao longo do galpão (porta lateral em z = 12).
 *
 * O jogador nasce no pátio olhando o galpão (+z); os inimigos entram pelo
 * fundo do galpão (norte). Toda a navegação dos inimigos é no piso y = 0
 * (passarelas a 4,5 m ficam acima do raio da grade de navegação, 2,6 m).
 */
import * as THREE from 'three';
import { mat4, cached } from './geo.js';
import { cyl, cylBetween, cylinder, cable, rebar, decal, contact } from './shapes.js';
import { bevelBox, vary, part, treadTire } from './propkit.js';
import * as P from './props.js';
import * as FU from './furniture.js';
import { building, TINTS } from './buildings.js';
import { skyline } from './layout.js';
import * as VG from './vegetation.js';
import { graffitiRect, bulletRect } from './decals.js';

// ─── dimensões ─────────────────────────────────────────────────────────
export const HALL = { x0: -18, x1: 18, z0: -8, z1: 40, eave: 10.5, ridge: 13.5, wall: 0.35, bay: 6 };
export const OFFICE = { x0: 10.6, x1: 17.65, z0: 24, z1: 39.65, f1: 4.5, h: 3.0 };
export const CAT = { y: 4.5, x0: -17.25, x1: -15.65, z0: -6, z1: 38 };
export const BRIDGE = { z0: 27.4, z1: 28.6 };
const YARD = { x0: -22, x1: 22, z0: -44, z1: -8 };
const DOCK = { x0: 10.2, x1: 12, z0: -37, z1: -17, h: 1.2 };
const IN = { x0: HALL.x0 + HALL.wall, x1: HALL.x1 - HALL.wall, z0: HALL.z0 + HALL.wall, z1: HALL.z1 - HALL.wall };

const UNIT = () => cached('unitbox', () => new THREE.BoxGeometry(1, 1, 1));
const _v = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

// cores de pintura industrial (desbotadas)
const STEEL = [0.36, 0.38, 0.36]; // estrutura: cinza-esverdeado
const PRIMER = [0.45, 0.24, 0.17]; // zarcão
const CRANE = [0.78, 0.6, 0.16]; // amarelo de ponte rolante
const MACH = [[0.34, 0.42, 0.38], [0.3, 0.36, 0.42], [0.46, 0.46, 0.42], [0.38, 0.4, 0.3]];

// ─── perfis de aço ─────────────────────────────────────────────────────
/**
 * Barra de seção retangular entre a e b (w = largura, h = altura da seção);
 * `up` orienta a altura da seção.
 */
function member(B, a, b, w, h, mat, color, up = [0, 1, 0]) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  _y.subVectors(Bv, A);
  const len = _y.length();
  if (len < 1e-4) return null;
  _y.normalize();
  _z.set(...up);
  if (Math.abs(_z.dot(_y)) > 0.95) _z.set(1, 0, 0);
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  const M = new THREE.Matrix4().makeBasis(_x.clone(), _y.clone(), _z.clone());
  M.setPosition(A.clone().add(Bv).multiplyScalar(0.5));
  const S = M.clone().multiply(new THREE.Matrix4().makeScale(w, len, h));
  B.add(UNIT(), mat, S, { color, uvRand: true });
  return M;
}

/** Perfil I entre a e b: altura H (direção `up`), mesa Wf. */
function ibeam(B, a, b, H, Wf, mat, color, up = [0, 1, 0]) {
  const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b);
  _y.subVectors(Bv, A);
  const len = _y.length();
  _y.normalize();
  _z.set(...up);
  if (Math.abs(_z.dot(_y)) > 0.95) _z.set(1, 0, 0);
  _x.crossVectors(_y, _z).normalize();
  _z.crossVectors(_x, _y).normalize();
  const M = new THREE.Matrix4().makeBasis(_x.clone(), _y.clone(), _z.clone());
  M.setPosition(A.clone().add(Bv).multiplyScalar(0.5));
  const tf = Math.max(0.012, H * 0.07), tw = Math.max(0.008, H * 0.045);
  for (const s of [-1, 1]) B.add(UNIT(), mat, M.clone().multiply(mat4([0, 0, s * (H / 2 - tf / 2)], [0, 0, 0], [Wf, len, tf])), { color, uvRand: true });
  B.add(UNIT(), mat, M.clone().multiply(mat4([0, 0, 0], [0, 0, 0], [tw, len, H - 2 * tf])), { color: color.map((c) => c * 0.92), uvRand: true });
  return M;
}

// ─── texturas próprias ─────────────────────────────────────────────────
/** Grade de piso (barras portantes 3 cm + travessas 10 cm), alpha. */
export function gratingTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  // barras portantes (paralelas a v), espessura ~5 mm em 0,4 m → 3 px
  for (let x = 0; x < 256; x += 19.2) {
    g.fillStyle = 'rgb(150,150,145)';
    g.fillRect(Math.round(x), 0, 4, 256);
    g.fillStyle = 'rgba(70,70,68,1)';
    g.fillRect(Math.round(x) + 3, 0, 1, 256);
  }
  // travessas torcidas
  for (let y = 0; y < 256; y += 64) {
    g.fillStyle = 'rgb(135,135,130)';
    g.fillRect(0, y, 256, 4);
  }
  // ferrugem/sujeira em manchas
  for (let k = 0; k < 40; k++) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(${90 + Math.random() * 40},${50 + Math.random() * 20},30,0.35)`;
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, 6 + Math.random() * 30, 0, 6.3);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / 0.4, 1 / 0.4);
  t.anisotropy = 8;
  return t;
}

/** Letreiro pintado à mão na empena (tinta descascada, letras apagadas). */
function signTexture() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 168;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(215,205,180,0.85)';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 120px "DejaVu Sans", "Liberation Sans", sans-serif';
  g.fillText('ЛИТЕЙНЫЙ ЦЕХ  № 9', 1024, 88);
  // tinta descascada: apaga manchas e riscos verticais (chuva)
  g.globalCompositeOperation = 'destination-out';
  let s = 77;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.7})`;
    g.fillRect(r() * 2048, r() * 168, 2 + r() * 14, 2 + r() * 6);
  }
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(0,0,0,${0.2 + r() * 0.5})`;
    g.fillRect(r() * 2048, 0, 2 + r() * 6, 168);
  }
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Materiais extras do mapa (vidro aramado translúcido, grade de piso). */
export function factoryMaterials(mats) {
  // vidro industrial aramado e sujo: translúcido, deixa a luz passar
  mats.fglass = new THREE.MeshStandardMaterial({ color: 0x5f6a62, roughness: 0.35, metalness: 0, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 1.1 });
  mats.fsign = new THREE.MeshStandardMaterial({ map: signTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, roughness: 0.85, vertexColors: true });
  mats.grating = new THREE.MeshStandardMaterial({ map: gratingTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.55, color: 0x9a9890, vertexColors: true });
}

// ─── construção ────────────────────────────────────────────────────────
/** Assíncrona: cede o thread entre blocos (W.tick) — ver index.js. */
export async function buildFactory(W) {
  const { B } = W;
  const tick = W.tick || (async () => {});
  B.cast = false;
  B.noCastZone = true;
  ground(W);
  B.noCastZone = false;
  B.cast = true;
  await tick('chão', 0.1);
  hallShell(W);
  roof(W);
  await tick('galpão', 0.3);
  crane(W);
  catwalks(W);
  await tick('passarelas', 0.45);
  offices(W);
  await tick('escritórios', 0.6);
  machinery(W);
  await tick('máquinas', 0.75);
  yard(W);
  surroundings(W);
  await tick('pátio', 0.9);
  // pendências registradas pelos geradores (carros queimados, caçambas, prédios)
  for (const r of W.rubbleSpots) {
    if (r.small) P.scatterBricks(W, r.p[0], r.p[2], r.r, r.n, { y: r.p[1] || 0 });
    else P.rubblePile(W, r.p[0], r.p[2], r.r, 0.45, { n: r.n, collide: false, y: r.p[1] || 0 });
  }
  W.rubbleSpots.length = 0;
  for (const t of W.trashSpots) P.clutter(W, t[0], t[1], 1.3, 6);
  W.trashSpots.length = 0;
  for (const d of W.dishes) P.dish(W, d.p, d.n);
  W.dishes.length = 0;
  W.glassPiles.length = 0;
}

// ─── chão ──────────────────────────────────────────────────────────────
function ground(W) {
  const { B, rng } = W;
  B.box(-260, -0.6, -320, 260, -0.02, 220, 'dirt', { color: [0.85, 0.8, 0.72], faces: { ny: null }, collide: false });
  B.collider([-260, -1, -320], [260, -0.02, 220], 'dirt');
  // piso do galpão (laje com juntas — W_SLAB), em placas de 12 m para culling
  for (let z = IN.z0; z < IN.z1; z += 12) {
    B.box(IN.x0, -0.4, z, IN.x1, 0, Math.min(IN.z1, z + 12), 'slab', { faces: { ny: null } });
  }
  // pátio: concreto mais velho e escuro com remendos de asfalto e terra
  for (let z = YARD.z0; z < YARD.z1; z += 12) {
    B.box(YARD.x0, -0.4, z, YARD.x1, 0, Math.min(YARD.z1, z + 12), 'slab', { faces: { ny: null }, color: [0.66, 0.64, 0.6] });
  }
  // becos leste/oeste e faixa norte (atrás do galpão)
  for (const [x0, x1] of [[HALL.x1, YARD.x1], [YARD.x0, HALL.x0]]) {
    for (let z = HALL.z0; z < 44; z += 12) B.box(x0, -0.4, z, x1, 0, Math.min(44, z + 12), 'slab', { faces: { ny: null }, color: [0.74, 0.72, 0.68] });
  }
  B.box(HALL.x0, -0.4, HALL.z1, HALL.x1, 0, 44, 'slab', { faces: { ny: null }, color: [0.74, 0.72, 0.68] });
  // terra e mato invadindo o pátio (manchas, junto aos muros)
  for (let i = 0; i < 18; i++) {
    const x = rng.range(-21, 21), z = rng.range(-43.5, -10);
    decal(B, 'stains', [x, 0.012 + i * 0.0003, z], 'py', [rng.range(2, 5), rng.range(2, 5)], [0, 0.5, 0.5, 1], rng.range(0, 6), [0.9, 0.82, 0.7]);
  }
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-21, 21), z = rng.range(-43.5, -10);
    const q = rng.int(0, 3);
    decal(B, 'stains', [x, 0.016 + i * 0.0002, z], 'py', [rng.range(1, 3), rng.range(1, 3)], [(q % 2) * 0.5, Math.floor(q / 2) * 0.5, (q % 2) * 0.5 + 0.5, Math.floor(q / 2) * 0.5 + 0.5], rng.range(0, 6));
  }
  // faixas de pintura amarela de segurança no piso do galpão (corredores)
  const stripe = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.ceil(len / 2.5);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const cx = x0 + (x1 - x0) * (t0 + t1) / 2, cz = z0 + (z1 - z0) * (t0 + t1) / 2;
      const along = Math.abs(z1 - z0) > Math.abs(x1 - x0);
      const fade = rng.range(0.45, 0.85);
      decal(B, 'paint', [cx, 0.011, cz], 'py', along ? [0.1, len / n + 0.02] : [len / n + 0.02, 0.1], [0, rng.next() * 0.5, 1, rng.next() * 0.5 + 0.5], 0, [0.85 * fade, 0.62 * fade, 0.12 * fade]);
    }
  };
  stripe(-3.2, IN.z0 + 0.5, -3.2, 22);
  stripe(3.2, IN.z0 + 0.5, 3.2, 22);
  stripe(-14, 22.5, 9.5, 22.5);
  stripe(-14, 3, -14, 22);
  // mato nas juntas do pátio e na base dos muros
  for (let i = 0; i < 30; i++) {
    const x = rng.range(-21.5, 21.5), z = rng.range(-43.6, -9);
    VG.weedLine(W, [x, z], [x + rng.range(-1.5, 1.5), z + rng.range(-1.5, 1.5)], 0, 1.0);
  }
  for (let z = -43.6; z < -9; z += rng.range(2, 5)) {
    for (const x of [-21.75, 21.75]) VG.weedLine(W, [x, z], [x, z + rng.range(0.8, 2)], 0, 1.4);
  }
  VG.grassTufts(W, -19, -42, 2.5, 30);
  VG.grassTufts(W, 18, -41.5, 2.2, 26);
  VG.grassTufts(W, 20.5, 6, 1.5, 18);
  VG.grassTufts(W, -20.3, 30, 1.6, 20);
}

// ─── casca do galpão ───────────────────────────────────────────────────
const roofY = (x) => HALL.eave + (HALL.ridge - HALL.eave) * (1 - Math.abs(x) / HALL.x1);

function hallShell(W) {
  const { B, rng } = W;
  const t = HALL.wall;
  const BR = 3.6; // altura da alvenaria de tijolo
  const brick = [0.74, 0.68, 0.64]; // tijolo de galpão: escurecido de fuligem
  const clad = [0.62, 0.66, 0.64]; // chapa ondulada pintada (cinza-esverdeada desbotada)
  // ── paredes longas (x = ±18): por vão de 6 m — tijolo, chapa, janela alta, chapa
  for (const side of [-1, 1]) {
    const xo = side * HALL.x1, xi = side * (HALL.x1 - t);
    const [xa, xb] = side < 0 ? [xo, xi] : [xi, xo];
    for (let z = HALL.z0; z < HALL.z1 - 0.01; z += HALL.bay) {
      const z1 = z + HALL.bay;
      const door = side > 0 && z < 12 && z1 > 12; // porta lateral leste (z = 12)
      if (door) {
        B.box(xa, 0, z, xb, BR, 11.4, 'brick', { color: brick });
        B.box(xa, 0, 12.6, xb, BR, z1, 'brick', { color: brick });
        B.box(xa, 2.2, 11.4, xb, BR, 12.6, 'brick', { color: brick });
        sideDoor(W, side, 12);
      } else B.box(xa, 0, z, xb, BR, z1, 'brick', { color: brick });
      // cinta de concreto sobre o tijolo
      B.box(xa - 0.03 * side, BR, z, xb + 0.03 * side, BR + 0.25, z1, 'concrete', { color: [0.7, 0.68, 0.64] });
      B.box(xa, BR + 0.25, z, xb, 6.0, z1, 'corrugated', { color: clad });
      B.box(xa, 9.4, z, xb, HALL.eave, z1, 'corrugated', { color: clad });
      // pilaretes entre janelas
      B.box(xa, 6.0, z, xb, 9.4, z + 0.5, 'corrugated', { color: clad });
      B.box(xa, 6.0, z1 - 0.5, xb, 9.4, z1, 'corrugated', { color: clad });
      clerestory(W, side, xo, z + 0.5, z1 - 0.5, 6.0, 9.4);
    }
    // rufos e calhas
    B.box(xo - 0.15 * side - 0.0, HALL.eave - 0.05, HALL.z0 - 0.2, xo + 0.25 * side, HALL.eave + 0.25, HALL.z1 + 0.2, 'metal', { color: [0.42, 0.42, 0.4], collide: false });
  }
  // ── empenas (z = -8 com portões; z = 40 fechada) ──
  gable(W, HALL.z0, -1, [
    { x0: -12, x1: -6, h: 5.5, state: 'open' },
    { x0: 3, x1: 9, h: 5.5, state: 'half' },
    { x0: 12.6, x1: 13.6, h: 2.2, state: 'door' },
  ]);
  gable(W, HALL.z1, 1, []);
  // colunas e pórticos
  for (let z = HALL.z0; z <= HALL.z1 + 0.01; z += HALL.bay) {
    const end = z === HALL.z0 || z > HALL.z1 - 0.1;
    const zc = end ? (z === HALL.z0 ? z + t + 0.16 : z - t - 0.16) : z;
    for (const side of [-1, 1]) {
      const x = side * (HALL.x1 - t - 0.2);
      ibeam(B, [x, 0, zc], [x, HALL.eave - 0.2, zc], 0.4, 0.3, 'metal', STEEL, [side, 0, 0]);
      B.collider([x - 0.2, 0, zc - 0.16], [x + 0.2, HALL.eave, zc + 0.16], 'metal');
      // placa de base e chumbadores, concreto do bloco de fundação
      B.box(x - 0.32, 0, zc - 0.28, x + 0.32, 0.03, zc + 0.28, 'metal', { color: PRIMER.map((c) => c * 0.7), collide: false });
      for (const a of [-0.22, 0.22]) for (const b of [-0.2, 0.2]) cylinder(B, x + a, 0.03, zc + b, 0.016, 0.06, 'metal', { seg: 6, color: [0.25, 0.24, 0.22] });
      contact(B, x, 0, zc, 1.0, 0.9, 0, 1);
      // mísulas da viga de rolamento da ponte
      member(B, [x - side * 0.2, 7.6, zc], [x - side * 0.75, 8.0, zc], 0.2, 0.3, 'metal', STEEL);
    }
    // treliça do pórtico (banzo superior inclinado, inferior reto, montantes e diagonais)
    truss(W, zc);
  }
  // vigas de rolamento + trilho
  for (const side of [-1, 1]) {
    const x = side * (HALL.x1 - t - 0.85);
    ibeam(B, [x, 8.3, HALL.z0 + 0.3], [x, 8.3, HALL.z1 - 0.3], 0.6, 0.3, 'metal', STEEL, [0, 1, 0]);
    B.box(x - 0.03, 8.6, HALL.z0 + 0.3, x + 0.03, 8.68, HALL.z1 - 0.3, 'chrome', { color: [0.45, 0.42, 0.38], collide: false });
  }
  // tubulações e eletrocalhas correndo pelas paredes
  for (const side of [-1, 1]) {
    const x = side * (HALL.x1 - t - 0.5);
    cylBetween(B, [x, 5.2, HALL.z0 + 0.6], [x, 5.2, HALL.z1 - 0.6], 0.09, 'metal', { seg: 10, color: side < 0 ? [0.5, 0.18, 0.12] : [0.22, 0.32, 0.45] });
    B.box(x - 0.15, 4.85, HALL.z0 + 0.6, x + 0.15, 4.92, HALL.z1 - 0.6, 'metal', { color: [0.5, 0.5, 0.48], collide: false });
    for (let z = HALL.z0 + 1; z < HALL.z1; z += 2) B.box(x - 0.02, 4.92, z, x + 0.02, 5.25, z + 0.05, 'metal', { color: [0.3, 0.3, 0.28], collide: false });
  }
  // marcas: fuligem, escorridos, pichação, buracos de bala nas paredes internas
  for (let i = 0; i < 10; i++) {
    const side = rng.sign(), z = rng.range(HALL.z0 + 2, HALL.z1 - 2);
    const xi = side * (HALL.x1 - t) - side * 0.012;
    decal(B, 'streaks', [xi, rng.range(2.5, 5), z], side < 0 ? 'px' : 'nx', [rng.range(2, 4), rng.range(2, 3.5)]);
  }
  for (let i = 0; i < 6; i++) {
    const side = rng.sign(), z = rng.range(HALL.z0 + 2, HALL.z1 - 2);
    const xi = side * (HALL.x1 - t) - side * 0.013;
    decal(B, 'graffiti', [xi, rng.range(1.2, 2.2), z], side < 0 ? 'px' : 'nx', [rng.range(1.6, 2.6), rng.range(0.8, 1.2)], graffitiRect(rng.int(0, 15)), rng.range(-0.05, 0.05));
  }
  for (let i = 0; i < 8; i++) {
    const side = rng.sign(), z = rng.range(HALL.z0 + 2, HALL.z1 - 2);
    const xi = side * (HALL.x1 - t) - side * 0.014;
    decal(B, 'bullets', [xi, rng.range(0.8, 2.6), z], side < 0 ? 'px' : 'nx', [rng.range(0.8, 1.6), rng.range(0.8, 1.4)], bulletRect(rng.int(0, 3)), rng.range(0, 6));
  }
  decal(B, 'soot', [-HALL.x1 + t + 0.012, 3.5, 30], 'px', [5, 5]);
  decal(B, 'soot', [HALL.x1 - t - 0.012, 3.0, 6], 'nx', [4, 4.5]);
}

/** Janela alta de caixilho de aço: grade 0,6 × 0,5 m, vidro aramado, muitos vidros quebrados. */
function clerestory(W, side, xo, z0, z1, y0, y1) {
  const { B, rng } = W;
  const t = HALL.wall;
  const xm = xo - side * t * 0.5;
  const frame = [0.2, 0.21, 0.2];
  const nz = Math.round((z1 - z0) / 0.6), ny = Math.round((y1 - y0) / 0.5);
  const dz = (z1 - z0) / nz, dy = (y1 - y0) / ny;
  // caixilho: travessas e montantes em T (6 cm)
  for (let i = 0; i <= nz; i++) B.box(xm - 0.04, y0, z0 + i * dz - 0.025, xm + 0.04, y1, z0 + i * dz + 0.025, 'metal', { color: frame, collide: false });
  for (let j = 0; j <= ny; j++) B.box(xm - 0.04, y0 + j * dy - 0.025, z0, xm + 0.04, y0 + j * dy + 0.025, z1, 'metal', { color: frame, collide: false });
  // peitoril/verga
  B.box(xm - 0.2, y0 - 0.08, z0, xm + 0.2, y0, z1, 'concrete', { color: [0.6, 0.58, 0.55], collide: false });
  // vidros: grupos quebrados (estilhaço), alguns painéis basculantes abertos
  const brokenZone = rng.next();
  const c = B.cast;
  B.cast = false;
  for (let i = 0; i < nz; i++) {
    for (let j = 0; j < ny; j++) {
      const pz = z0 + i * dz, py = y0 + j * dy;
      const broken = rng.chance(0.25 + 0.5 * brokenZone * Math.max(0, Math.sin(i * 0.9 + j * 0.7 + brokenZone * 9)));
      const tone = vary(rng, [1, 1, 1], { tone: 0.15, fade: 0, dirt: 0.5 });
      if (!broken) {
        B.panel([xm, py + 0.025, pz + 0.025], [0, 0, dz - 0.05], [0, dy - 0.05, 0], 1, 1, 'fglass', { worldUV: false, color: tone });
      } else if (rng.chance(0.5)) {
        // caco preso num canto (triângulo)
        const g = new THREE.BufferGeometry();
        const a = [xm, py + 0.025, pz + 0.025], b = [xm, py + 0.025, pz + 0.025 + (dz - 0.05) * rng.range(0.3, 1)], cc = [xm, py + 0.025 + (dy - 0.05) * rng.range(0.3, 0.9), pz + 0.025];
        const flip = rng.chance(0.5);
        const pts = flip ? [a, b, cc] : [[xm, py + dy - 0.025, pz + dz - 0.025], [xm, py + dy - 0.025, pz + dz - 0.025 - (dz - 0.05) * rng.range(0.3, 1)], [xm, py + dy - 0.025 - (dy - 0.05) * rng.range(0.3, 0.9), pz + dz - 0.025]];
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
        B.add(g, 'fglass', null, { worldUV: false, color: tone });
      }
    }
  }
  B.cast = c;
}

/** Empena (parede de topo) com portões; dir = -1 sul (normal -z), +1 norte. */
function gable(W, z, dir, openings) {
  const { B, rng } = W;
  const t = HALL.wall;
  const BR = 3.6;
  const za = dir < 0 ? z : z - t, zb = dir < 0 ? z + t : z;
  const x0 = HALL.x0, x1 = HALL.x1;
  // segmentos sólidos entre aberturas (até a altura da cinta), depois chapa
  const cuts = openings.slice().sort((a, b) => a.x0 - b.x0);
  let xs = x0;
  const solid = [];
  for (const o of cuts) {
    solid.push([xs, o.x0]);
    xs = o.x1;
  }
  solid.push([xs, x1]);
  for (const [a, b] of solid) {
    B.box(a, 0, za, b, BR, zb, 'brick', { color: [0.74, 0.68, 0.64] });
    B.box(a, BR, za, b, 6.0, zb, 'corrugated', { color: [0.62, 0.66, 0.64] });
  }
  for (const o of cuts) {
    // parte acima de cada abertura
    if (o.h < BR) B.box(o.x0, o.h, za, o.x1, BR, zb, 'brick', { color: [0.74, 0.68, 0.64] });
    B.box(o.x0, Math.max(BR, o.h), za, o.x1, 6.0, zb, 'corrugated', { color: [0.62, 0.66, 0.64] });
    if (o.state === 'door') personnelDoor(W, (o.x0 + o.x1) / 2, z, dir);
    else rollerDoor(W, o, z, dir);
  }
  // da cinta para cima até o telhado: faixas horizontais com perfil inclinado
  // (escada de 0,5 m acompanhando o telhado) + janelas de topo
  for (let y = 6.0; y < HALL.ridge; y += 0.5) {
    const xr = HALL.x1 * (1 - (y + 0.5 - HALL.eave) / (HALL.ridge - HALL.eave));
    const lim = y + 0.5 <= HALL.eave ? HALL.x1 : Math.max(0.2, xr);
    if (y >= 7 && y < 9.5) {
      // janela central de topo
      B.box(-lim, y, za, -4, y + 0.5, zb, 'corrugated', { color: [0.62, 0.66, 0.64] });
      B.box(4, y, za, lim, y + 0.5, zb, 'corrugated', { color: [0.62, 0.66, 0.64] });
    } else B.box(-lim, y, za, lim, y + 0.5, zb, 'corrugated', { color: [0.62, 0.66, 0.64], collide: y < 10 });
  }
  // janela de topo (caixilho em z)
  {
    const zm = (za + zb) / 2;
    const frame = [0.2, 0.21, 0.2];
    for (let i = 0; i <= 13; i++) B.box(-4 + i * (8 / 13) - 0.025, 7, zm - 0.04, -4 + i * (8 / 13) + 0.025, 9.5, zm + 0.04, 'metal', { color: frame, collide: false });
    for (let j = 0; j <= 5; j++) B.box(-4, 7 + j * 0.5 - 0.025, zm - 0.04, 4, 7 + j * 0.5 + 0.025, zm + 0.04, 'metal', { color: frame, collide: false });
    const c = B.cast;
    B.cast = false;
    for (let i = 0; i < 13; i++) for (let j = 0; j < 5; j++) {
      if (rng.chance(0.45)) continue;
      B.panel([-4 + i * (8 / 13) + 0.025, 7 + j * 0.5 + 0.025, zm], [8 / 13 - 0.05, 0, 0], [0, 0.45, 0], 1, 1, 'fglass', { worldUV: false, color: vary(rng, [1, 1, 1], { tone: 0.15, dirt: 0.5 }) });
    }
    B.cast = c;
  }
  // cinta de concreto
  for (const [a, b] of solid) B.box(a, BR, za - 0.03, b, BR + 0.25, zb + 0.03, 'concrete', { color: [0.7, 0.68, 0.64], collide: false });
  // pichação e marcas na face externa (pátio)
  if (dir < 0) {
    decal(B, 'graffiti', [-15, 1.7, za - 0.012], 'nz', [2.6, 1.2], graffitiRect(rng.int(0, 15)), 0.02);
    decal(B, 'graffiti', [0.5, 1.5, za - 0.012], 'nz', [2.2, 1.0], graffitiRect(rng.int(0, 15)), -0.03);
    decal(B, 'streaks', [-2, 4.5, za - 0.011], 'nz', [3, 3]);
    decal(B, 'soot', [-9, 6.5, za - 0.013], 'nz', [6, 4]);
    decal(B, 'bullets', [11.5, 1.8, za - 0.014], 'nz', [1.6, 1.4], bulletRect(1), 0.3);
    decal(B, 'chips', [-4.5, 2.0, za - 0.0125], 'nz', [1.2, 0.8], [0.5, 0, 1, 0.5], 0.2);
    // letreiro pintado (nome da fábrica, apagado) — placa de chapa
    B.box(-6, 10.0, za - 0.06, 6, 11.1, za, 'metal', { color: [0.5, 0.5, 0.46], collide: false, uvRand: true });
    const sg = new THREE.PlaneGeometry(11.6, 0.95);
    sg.rotateY(Math.PI);
    B.add(sg, 'fsign', mat4([0, 10.55, za - 0.065]), { worldUV: false, color: [1, 1, 1] });
  }
}

/** Porta de enrolar de aço: estado 'open' (rolo em cima), 'half' (emperrada no meio, empenada). */
function rollerDoor(W, o, z, dir) {
  const { B, rng } = W;
  const t = HALL.wall;
  const zf = dir < 0 ? z + t + 0.12 : z - t - 0.12;
  const w = o.x1 - o.x0;
  const col = vary(rng, [0.55, 0.5, 0.38], { tone: 0.1, fade: 0.3, dirt: 0.3 });
  // caixa do rolo + guias laterais
  cylinder(B, (o.x0 + o.x1) / 2, o.h + 0.35, zf, 0.32, w + 0.2, 'metal', { rot: [0, 0, Math.PI / 2], seg: 16, color: col.map((c) => c * 0.85) });
  for (const x of [o.x0 + 0.05, o.x1 - 0.05]) B.box(x - 0.06, 0, zf - 0.08, x + 0.06, o.h + 0.2, zf + 0.08, 'metal', { color: [0.25, 0.25, 0.24], collide: false });
  // batente/soleira de aço gasto
  B.box(o.x0, -0.01, (dir < 0 ? z : z - t), o.x1, 0.015, (dir < 0 ? z + t : z), 'chrome', { color: [0.35, 0.33, 0.3], collide: false });
  if (o.state === 'half') {
    // lâminas até 3,2 m; última fiada empenada (bateram nela com empilhadeira)
    const yb = 3.2;
    for (let y = o.h; y > yb; y -= 0.1) {
      const bend = y - 0.1 < yb + 0.4 ? (yb + 0.4 - (y - 0.1)) * 0.5 : 0;
      B.add(bevelBox(w - 0.1, 0.095, 0.03, 0.01, { wear: 0.4 }), 'metal', mat4([(o.x0 + o.x1) / 2, y - 0.05, zf + dir * bend * 0.4], [dir * bend * 0.6, 0, Math.sin(y * 3) * bend * 0.1]), { worldUV: false, vcolor: true, color: col, uvRand: true });
    }
    B.add(bevelBox(w - 0.1, 0.06, 0.06, 0.02), 'rubber', mat4([(o.x0 + o.x1) / 2 + 0.1, yb - 0.02, zf + dir * 0.2], [dir * 0.35, 0, 0.04]), { worldUV: false, vcolor: true, color: [0.4, 0.4, 0.4] });
    B.collider([o.x0, yb - 0.1, Math.min(zf, zf + dir * 0.3) - 0.05], [o.x1, o.h, Math.max(zf, zf + dir * 0.3) + 0.05], 'metal');
  }
}

/** Porta de pedestre de aço (entreaberta), batente e placa. */
function personnelDoor(W, x, z, dir) {
  const { B, rng } = W;
  const t = HALL.wall;
  const zf = dir < 0 ? z : z;
  const M = mat4([x - 0.48, 0, zf + (dir < 0 ? -0.02 : 0.02)], [0, dir < 0 ? 1.1 : -1.1, 0]);
  part(B, M, bevelBox(0.95, 2.1, 0.05, 0.01, { wear: 0.6 }), 'metal', [0.48, 1.05, 0], [0, 0, 0], vary(rng, [0.3, 0.38, 0.45], { fade: 0.4, dirt: 0.3 }));
  part(B, M, bevelBox(0.15, 0.03, 0.04, 0.01), 'chrome', [0.85, 1.0, dir * -0.04], [0, 0, 0], [0.5, 0.5, 0.48]);
  for (const s of [-1, 1]) B.box(x + s * 0.5 - 0.04, 0, z - 0.02, x + s * 0.5 + 0.04, 2.2, z + t + 0.02, 'metal', { color: [0.2, 0.2, 0.2], collide: false });
}

/** Porta lateral do beco leste. */
function sideDoor(W, side, zc) {
  const { B, rng } = W;
  const x = side * HALL.x1;
  const M = mat4([x + side * 0.02, 0, zc - 0.48], [0, side > 0 ? -1.3 : 1.3, 0]);
  part(B, M, bevelBox(0.05, 2.1, 0.95, 0.01, { wear: 0.6 }), 'metal', [0, 1.05, 0.48], [0, 0, 0], vary(rng, [0.45, 0.2, 0.15], { fade: 0.4, dirt: 0.3 }));
  decal(B, 'bullets', [x + side * 0.012, 1.4, zc + 1.2], side > 0 ? 'px' : 'nx', [0.8, 0.8], bulletRect(2), 0.2);
}

/** Treliça de um pórtico em z. */
function truss(W, z) {
  const { B } = W;
  const xe = HALL.x1 - HALL.wall - 0.2;
  const yb = HALL.eave - 0.4; // banzo inferior
  const col = STEEL;
  // banzos superiores (perfil I) e inferior
  for (const s of [-1, 1]) ibeam(B, [s * xe, HALL.eave - 0.15, z], [0, HALL.ridge - 0.3, z], 0.3, 0.18, 'metal', col, [0, 1, 0]);
  member(B, [-xe, yb, z], [xe, yb, z], 0.16, 0.12, 'metal', col);
  // montantes e diagonais a cada 3 m
  for (let k = 0; k < 6; k++) {
    for (const s of [-1, 1]) {
      const xa = s * (xe - k * 3), xb = s * Math.max(0, xe - (k + 1) * 3);
      const ya = roofY(xa) - 0.3, yb2 = roofY(xb) - 0.3;
      member(B, [xb, yb, z], [xb, yb2, z], 0.08, 0.08, 'metal', col, [0, 0, 1]);
      member(B, [xa, yb, z], [xb, yb2, z], 0.07, 0.07, 'metal', col, [0, 0, 1]);
      void ya;
    }
  }
}

// ─── telhado: terças, chapas (com buracos), domos ──────────────────────
function roof(W) {
  const { B, rng } = W;
  const xe = HALL.x1 + 0.25;
  const strips = 6;
  // buracos concentrados (área de impacto) + alguns isolados
  const hole = (sx, k, bay) => {
    const zc = HALL.z0 + bay * HALL.bay + 3;
    const xc = sx * (xe * (k + 0.5) / strips);
    const d1 = Math.hypot(xc + 6, zc - 14) / 9; // impacto principal (oeste do centro)
    const d2 = Math.hypot(xc - 9, zc - 30) / 6;
    return rng.chance(Math.max(0, 1 - d1) * 0.95) || rng.chance(Math.max(0, 1 - d2) * 0.8) || rng.chance(0.06);
  };
  for (const sx of [-1, 1]) {
    const ang = Math.atan2(HALL.ridge - HALL.eave, HALL.x1);
    for (let bay = 0; bay < (HALL.z1 - HALL.z0) / HALL.bay; bay++) {
      const z0 = HALL.z0 + bay * HALL.bay;
      for (let k = 0; k < strips; k++) {
        const xa = sx * (xe * k) / strips, xb = sx * (xe * (k + 1)) / strips;
        const ya = roofY(Math.min(HALL.x1, Math.abs(xa))) + 0.05, yb = roofY(Math.min(HALL.x1, Math.abs(xb))) + 0.05;
        const len = Math.hypot(xb - xa, yb - ya);
        const c = [(xa + xb) / 2, (ya + yb) / 2, z0 + HALL.bay / 2];
        if (hole(sx, k, bay)) {
          // às vezes a chapa ficou pendurada pela terça
          if (rng.chance(0.3)) {
            const hang = rng.range(0.6, 1.3);
            B.obox([xa + (xb - xa) * 0.1, ya - hang * 0.5, z0 + rng.range(1, 5)], [0.02, hang, rng.range(0.9, 1.8)], [rng.range(-0.3, 0.3), rng.range(-0.3, 0.3), sx * 0.2], 'corrugated', { color: [0.5, 0.48, 0.44] });
          }
          continue;
        }
        const light = rng.chance(0.08);
        const cst = B.cast;
        if (light) B.cast = false;
        B.obox(c, [len + 0.02, 0.05, HALL.bay + 0.02], [0, 0, -sx * ang], light ? 'fglass' : 'corrugated', { color: light ? [0.7, 0.72, 0.66] : [0.58, 0.56, 0.52] });
        B.cast = cst;
      }
    }
    // terças (perfil C → barra) a cada faixa
    for (let k = 0; k <= strips; k++) {
      const x = sx * Math.min(HALL.x1 - 0.3, (HALL.x1 * k) / strips);
      const y = roofY(Math.abs(x)) - 0.12;
      member(B, [x, y, HALL.z0 + 0.3], [x, y, HALL.z1 - 0.3], 0.08, 0.2, 'metal', PRIMER);
    }
  }
  // cumeeira
  B.box(-0.3, HALL.ridge, HALL.z0 - 0.2, 0.3, HALL.ridge + 0.12, HALL.z1 + 0.2, 'metal', { color: [0.45, 0.44, 0.42], collide: false });
  // destroços do telhado no chão sob o buraco principal + chapas caídas
  P.rubblePile(W, -6, 13, 2.2, 0.7, { tint: [0.7, 0.68, 0.64], brick: 0.15, rebar: 1 });
  for (let i = 0; i < 6; i++) {
    B.obox([-6 + rng.range(-3.5, 3.5), 0.06 + i * 0.02, 13 + rng.range(-3, 3)], [rng.range(1.2, 2.5), 0.03, rng.range(0.8, 1.2)], [rng.range(-0.15, 0.15), rng.range(0, 6), rng.range(-0.25, 0.25)], 'corrugated', { color: [0.5, 0.48, 0.44] });
  }
  // terça caída atravessada
  member(B, [-9.5, 0.1, 10.5], [-3, 1.4, 16.5], 0.08, 0.2, 'metal', PRIMER);
  B.collider([-9.5, 0, 10.5], [-3, 1.4, 16.5].map((v, i) => (i === 1 ? 1.0 : v)), 'metal', { blocksBullets: false });
  P.scatterBricks(W, 8, 30, 3, 20);
}

// ─── ponte rolante ─────────────────────────────────────────────────────
function crane(W) {
  const { B, rng } = W;
  const zc = 14, y = 8.75;
  const xr = HALL.x1 - HALL.wall - 0.85;
  // duas vigas-caixão (amarelas, desbotadas, com faixas de advertência nas pontas)
  for (const s of [-1, 1]) {
    B.add(bevelBox(2 * xr - 0.2, 0.9, 0.42, 0.03, { wear: 0.5 }), 'metal', mat4([0, y + 0.45, zc + s * 0.75]), { worldUV: false, vcolor: true, color: vary(rng, CRANE, { fade: 0.35, dirt: 0.2 }), uvRand: true });
    // enrijecedores laterais
    for (let x = -xr + 1; x < xr - 0.5; x += 1.2) B.box(x - 0.02, y + 0.05, zc + s * 0.75 + s * 0.21, x + 0.02, y + 0.85, zc + s * 0.75 + s * 0.23, 'metal', { color: CRANE.map((c) => c * 0.85), collide: false });
  }
  // cabeceiras com rodas sobre os trilhos
  for (const sx of [-1, 1]) {
    B.add(bevelBox(0.6, 0.7, 3.2, 0.04, { wear: 0.6 }), 'metal', mat4([sx * xr, y + 0.25, zc]), { worldUV: false, vcolor: true, color: CRANE.map((c) => c * 0.9) });
    for (const dz of [-1.2, 1.2]) cylinder(B, sx * xr, y - 0.02, zc + dz, 0.22, 0.14, 'metal', { rot: [0, 0, Math.PI / 2], seg: 14, color: [0.25, 0.24, 0.22] });
    // faixas pretas/amarelas
    for (let k = 0; k < 6; k++) B.box(sx * xr - 0.31, y + 0.05 + k * 0.1, zc + 1.4, sx * xr + 0.31, y + 0.1 + k * 0.1, zc + 1.62, 'metal', { color: k % 2 ? [0.08, 0.08, 0.08] : CRANE, collide: false });
  }
  // carro da talha (trolley) + tambor de cabo + motor
  const tx = 3.4;
  B.add(bevelBox(1.6, 0.6, 2.0, 0.04), 'metal', mat4([tx, y + 1.2, zc]), { worldUV: false, vcolor: true, color: CRANE.map((c) => c * 0.95) });
  cylinder(B, tx, y + 1.25, zc, 0.35, 1.3, 'metal', { rot: [0, 0, Math.PI / 2], seg: 18, color: [0.3, 0.3, 0.28] });
  B.add(bevelBox(0.5, 0.45, 0.6, 0.05), 'metal', mat4([tx + 0.95, y + 1.25, zc + 0.5]), { worldUV: false, vcolor: true, color: [0.25, 0.3, 0.38] });
  // cabos de aço descendo até o moitão + gancho
  const hy = 3.3;
  for (const dx of [-0.12, 0.12]) for (const dz of [-0.1, 0.1]) cylBetween(B, [tx + dx, y + 0.9, zc + dz], [tx + dx * 0.6, hy + 0.55, zc + dz * 0.6], 0.012, 'chrome', { seg: 4, color: [0.35, 0.33, 0.3] });
  B.add(bevelBox(0.42, 0.55, 0.3, 0.06, { wear: 0.6 }), 'metal', mat4([tx, hy + 0.35, zc], [0, 0.3, 0]), { worldUV: false, vcolor: true, color: CRANE });
  for (const s of [-1, 1]) cylinder(B, tx, hy + 0.35, zc + s * 0.16, 0.16, 0.04, 'metal', { rot: [Math.PI / 2, 0, 0], seg: 14, color: [0.2, 0.2, 0.2] });
  // gancho: arco de toro + haste
  cylBetween(B, [tx, hy + 0.05, zc], [tx, hy - 0.25, zc], 0.045, 'metal', { seg: 8, color: [0.25, 0.24, 0.22] });
  B.add(cached('hook', () => new THREE.TorusGeometry(0.17, 0.05, 8, 14, Math.PI * 1.4)), 'metal', mat4([tx, hy - 0.42, zc], [0, 0.3, -Math.PI * 0.2]), { color: [0.25, 0.24, 0.22] });
  // corrente com lingas e uma viga pendurada (carga abandonada, girada)
  cable(B, [tx - 0.12, hy - 0.55, zc], [tx - 0.9, hy - 1.7, zc + 0.2], 0.08, 0.02, 'cable', 6);
  cable(B, [tx + 0.12, hy - 0.55, zc], [tx + 0.9, hy - 1.7, zc - 0.2], 0.08, 0.02, 'cable', 6);
  ibeam(B, [tx - 1.6, hy - 1.75, zc + 0.35], [tx + 1.6, hy - 1.75, zc - 0.35], 0.35, 0.18, 'metal', PRIMER, [0, 1, 0]);
  B.collider([tx - 1.6, hy - 1.95, zc - 0.45], [tx + 1.6, hy - 1.55, zc + 0.45], 'metal');
  // botoeira pendente
  cable(B, [tx + 0.6, y + 0.9, zc - 0.6], [tx + 0.7, 1.6, zc - 0.7], 0.0, 0.008, 'cable', 4);
  B.add(bevelBox(0.09, 0.26, 0.07, 0.02), 'plastic', mat4([tx + 0.7, 1.45, zc - 0.7], [0, 0.6, 0]), { worldUV: false, vcolor: true, color: [0.75, 0.6, 0.15] });
}

// ─── passarelas, escadas, guarda-corpos ─────────────────────────────────
/** Guarda-corpo industrial ao longo de [a → b] no nível y (postes a cada ≤ 1,5 m). */
function railing(W, a, b, y, opts = {}) {
  const { B } = W;
  const col = opts.color || [0.75, 0.6, 0.16];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (len < 0.05) return;
  const n = Math.max(1, Math.ceil(len / 1.5));
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    B.box(x - 0.025, y, z - 0.025, x + 0.025, y + 1.08, z + 0.025, 'metal', { color: col, collide: false });
  }
  for (const h of [1.06, 0.55]) cylBetween(B, [a[0], y + h, a[1]], [b[0], y + h, b[1]], 0.021, 'metal', { seg: 8, color: col });
  // rodapé (toe board)
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const ax = Math.abs(dx) > Math.abs(dz);
  if (ax) B.box(Math.min(a[0], b[0]), y, a[1] - 0.005, Math.max(a[0], b[0]), y + 0.1, a[1] + 0.005, 'metal', { color: col.map((c) => c * 0.8), collide: false });
  else B.box(a[0] - 0.005, y, Math.min(a[1], b[1]), a[0] + 0.005, y + 0.1, Math.max(a[1], b[1]), 'metal', { color: col.map((c) => c * 0.8), collide: false });
  // colisor: bloqueia o jogador, não as balas
  B.collider([Math.min(a[0], b[0]) - 0.04, y, Math.min(a[1], b[1]) - 0.04], [Math.max(a[0], b[0]) + 0.04, y + 1.1, Math.max(a[1], b[1]) + 0.04], 'metal', { blocksBullets: false });
}

/** Piso de grade sobre vigas U (passarela). */
function gratingDeck(W, x0, z0, x1, z1, y) {
  const { B } = W;
  B.box(x0, y - 0.04, z0, x1, y, z1, 'grating', { faces: { px: 'metal', nx: 'metal', pz: 'metal', nz: 'metal' }, collide: false, color: [1, 1, 1] });
  B.collider([x0, y - 0.15, z0], [x1, y, z1], 'metal', { surface: 'metal' });
  // longarinas laterais (perfil U)
  const along = z1 - z0 > x1 - x0;
  for (const s of [0, 1]) {
    if (along) B.box(s ? x1 - 0.06 : x0, y - 0.22, z0, s ? x1 : x0 + 0.06, y - 0.04, z1, 'metal', { color: STEEL, collide: false });
    else B.box(x0, y - 0.22, s ? z1 - 0.06 : z0, x1, y - 0.04, s ? z1 : z0 + 0.06, 'metal', { color: STEEL, collide: false });
  }
}

/**
 * Escada metálica reta: degraus de grade entre longarinas, do ponto
 * `bottom` [x, z] subindo `rise` ao longo de `dir` ([1,0], [-1,0], [0,1]…).
 */
function stair(W, bottom, dir, width, rise, opts = {}) {
  const { B } = W;
  const n = Math.ceil(rise / 0.225);
  const h = rise / n, run = 0.27;
  const side = [-dir[1], dir[0]];
  const hw = width / 2;
  for (let k = 0; k < n; k++) {
    const c0 = [bottom[0] + dir[0] * k * run, bottom[1] + dir[1] * k * run];
    const c1 = [c0[0] + dir[0] * run, c0[1] + dir[1] * run];
    const ax = [Math.min(c0[0], c1[0]) - Math.abs(side[0]) * hw, Math.min(c0[1], c1[1]) - Math.abs(side[1]) * hw];
    const bx = [Math.max(c0[0], c1[0]) + Math.abs(side[0]) * hw, Math.max(c0[1], c1[1]) + Math.abs(side[1]) * hw];
    const yt = (k + 1) * h;
    // degrau: grade 4 cm + borda antiderrapante amarela
    B.box(ax[0], yt - 0.04, ax[1], bx[0], yt, bx[1], 'grating', { faces: { px: 'metal', nx: 'metal', pz: 'metal', nz: 'metal' }, collide: false });
    // colisor maciço até o chão (bloco da escada)
    B.collider([ax[0], 0, ax[1]], [bx[0], yt, bx[1]], 'metal');
  }
  // longarinas (chapas inclinadas)
  const len = n * run;
  for (const s of [-1, 1]) {
    const p0 = [bottom[0] + side[0] * s * (hw + 0.03), 0.05, bottom[1] + side[1] * s * (hw + 0.03)];
    const p1 = [p0[0] + dir[0] * len, rise + 0.05, p0[2] + dir[1] * len];
    member(W.B, p0, p1, 0.02, 0.25, 'metal', STEEL, [0, 1, 0]);
    // corrimão
    const r0 = [p0[0], p0[1] + 0.95, p0[2]], r1 = [p1[0], p1[1] + 0.95, p1[2]];
    cylBetween(B, r0, r1, 0.022, 'metal', { seg: 8, color: CRANE });
    for (let k = 0; k <= Math.ceil(len / 1.4); k++) {
      const t = Math.min(1, (k * 1.4) / len);
      const q = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, p0[2] + (p1[2] - p0[2]) * t];
      cylBetween(B, q, [q[0], q[1] + 0.95, q[2]], 0.02, 'metal', { seg: 6, color: CRANE });
    }
    if (!opts.noRailCollide) {
      const mn = [Math.min(p0[0], p1[0]) - 0.03, 0, Math.min(p0[2], p1[2]) - 0.03];
      const mx = [Math.max(p0[0], p1[0]) + 0.03, rise + 1.0, Math.max(p0[2], p1[2]) + 0.03];
      B.collider(mn, mx, 'metal', { blocksBullets: false });
    }
  }
  contact(B, bottom[0] + dir[0] * len * 0.5, 0, bottom[1] + dir[1] * len * 0.5, Math.abs(dir[0]) * len + width + 0.4, Math.abs(dir[1]) * len + width + 0.4, 0, 1);
}

function catwalks(W) {
  const { B } = W;
  const y = CAT.y;
  // passarela oeste
  gratingDeck(W, CAT.x0, CAT.z0, CAT.x1, CAT.z1, y);
  // consoles nas colunas + pendurais
  for (let z = HALL.z0 + HALL.bay; z < HALL.z1; z += HALL.bay) {
    member(B, [CAT.x0 - 0.1, y - 0.2, z], [CAT.x1, y - 0.2, z], 0.12, 0.15, 'metal', STEEL);
    member(B, [CAT.x0 - 0.1, y - 1.3, z], [CAT.x1 - 0.1, y - 0.25, z], 0.08, 0.08, 'metal', STEEL);
  }
  // guarda-corpo interno com vãos (escada e ponte); pontas fechadas
  const gaps = [[1.0, 2.6], [BRIDGE.z0, BRIDGE.z1]];
  let zs = CAT.z0;
  for (const [g0, g1] of gaps) {
    railing(W, [CAT.x1, zs], [CAT.x1, g0], y);
    zs = g1;
  }
  railing(W, [CAT.x1, zs], [CAT.x1, CAT.z1], y);
  railing(W, [CAT.x0, CAT.z0], [CAT.x1, CAT.z0], y);
  railing(W, [CAT.x0, CAT.z1], [CAT.x1, CAT.z1], y);
  // escada (sobe do sul para o norte? não: sobe para -z, chegando ao patamar)
  const sx0 = CAT.x1, sx1 = CAT.x1 + 1.2;
  gratingDeck(W, sx0, 1.0, sx1, 2.6, y);
  railing(W, [sx1, 1.0], [sx1, 2.6], y);
  railing(W, [sx0, 1.0], [sx1, 1.0], y);
  // degraus: base em z = 2.6 + 20×0,27 = 8.0, subindo para -z
  stair(W, [(sx0 + sx1) / 2, 2.6 + Math.ceil(y / 0.225) * 0.27], [0, -1], 1.1, y);
  // ponte sobre o galpão até o mezanino dos escritórios
  gratingDeck(W, CAT.x1, BRIDGE.z0, OFFICE.x0, BRIDGE.z1, y);
  railing(W, [CAT.x1, BRIDGE.z0], [OFFICE.x0, BRIDGE.z0], y);
  railing(W, [CAT.x1, BRIDGE.z1], [OFFICE.x0, BRIDGE.z1], y);
  // pendurais da ponte até a treliça em z = 28
  for (let x = -12; x < OFFICE.x0; x += 4) {
    for (const z of [BRIDGE.z0 + 0.05, BRIDGE.z1 - 0.05]) cylBetween(B, [x, y - 0.2, z], [x, HALL.eave - 0.4, 28], 0.018, 'metal', { seg: 6, color: STEEL });
    member(B, [x, y - 0.22, BRIDGE.z0], [x, y - 0.22, BRIDGE.z1], 0.1, 0.12, 'metal', STEEL);
  }
  // escada externa do bloco de escritórios (lado sul, sobe para +x)
  const oz0 = OFFICE.z0 - 1.35, oz1 = OFFICE.z0;
  const bx = OFFICE.x0 + 0.3;
  const nSteps = Math.ceil(y / 0.225);
  stair(W, [bx, (oz0 + oz1) / 2 - 0.05], [1, 0], 1.1, y);
  const lx0 = bx + nSteps * 0.27;
  gratingDeck(W, lx0, oz0, IN.x1, oz1, y);
  railing(W, [lx0, oz0], [IN.x1, oz0], y);
  // pilares do patamar
  for (const [px, pz] of [[lx0 + 0.05, oz0 + 0.05], [IN.x1 - 0.1, oz0 + 0.05]]) {
    B.box(px - 0.05, 0, pz - 0.05, px + 0.05, y - 0.04, pz + 0.05, 'metal', { color: STEEL });
  }
}

// ─── escritórios ───────────────────────────────────────────────────────
function offices(W) {
  const { B, rng } = W;
  const O = OFFICE;
  const y1 = O.f1;
  const wt = 0.2;
  const wallC = [0.78, 0.76, 0.7];
  const xF = O.x0; // face voltada para o galpão
  // ── fachada (x = 10.6): térreo — duas portas e janela; mezanino — vidraça
  const front = (yA, yB, segs) => {
    for (const [z0, z1] of segs) B.box(xF, yA, z0, xF + wt, yB, z1, 'concrete', { color: wallC });
  };
  // térreo: portas z ∈ [27.0, 28.0] e [36.0, 37.0]; janela z ∈ [30, 34] y 1.0–2.2
  front(0, 2.2, [[O.z0, 27.0], [28.0, 30], [34, 36.0], [37.0, O.z1]]);
  front(0, 1.0, [[30, 34]]);
  front(2.2, y1 - 0.3, [[O.z0, O.z1]]);
  interiorWindow(W, xF + wt / 2, 30, 34, 1.0, 2.2, 'x');
  // laje do mezanino
  B.box(O.x0, y1 - 0.3, O.z0, O.x1, y1, O.z1, 'concrete', { color: [0.72, 0.7, 0.66] });
  B.box(O.x0 + wt, y1, O.z0 + wt, O.x1, y1 + 0.012, O.z1, 'tiles', { collide: false });
  B.box(O.x0 + wt, 0.0, O.z0 + wt, O.x1, 0.012, O.z1, 'tiles', { collide: false });
  // mezanino: peitoril, vidraça (z 24.3..27.3 e 28.7..39.4) e porta da ponte
  const yw0 = y1 + 0.9, yw1 = y1 + 2.4, ytop = y1 + O.h;
  front(y1, yw0, [[O.z0, BRIDGE.z0], [BRIDGE.z1, O.z1]]);
  front(yw1, ytop, [[O.z0, O.z1]]);
  front(y1, yw1, [[O.z0, O.z0 + 0.3], [BRIDGE.z0 - 0.15, BRIDGE.z0], [BRIDGE.z1, BRIDGE.z1 + 0.15], [O.z1 - 0.3, O.z1]]);
  front(y1 + 2.1, yw1, [[BRIDGE.z0, BRIDGE.z1]]);
  interiorWindow(W, xF + wt / 2, O.z0 + 0.3, BRIDGE.z0 - 0.15, yw0, yw1, 'x');
  interiorWindow(W, xF + wt / 2, BRIDGE.z1 + 0.15, O.z1 - 0.3, yw0, yw1, 'x');
  // laje de cobertura
  B.box(O.x0 - 0.1, ytop, O.z0 - 0.1, O.x1, ytop + 0.25, O.z1, 'concrete', { color: [0.7, 0.68, 0.64] });
  // ── parede sul (z = 24): térreo porta x ∈ [16.5, 17.4] (sob o patamar); mezanino porta x ∈ [16.4, 17.4]
  const zS = O.z0;
  B.box(O.x0, 0, zS, 16.5, y1 - 0.3, zS + wt, 'concrete', { color: wallC });
  B.box(16.5, 2.1, zS, O.x1, y1 - 0.3, zS + wt, 'concrete', { color: wallC });
  B.box(O.x0, y1, zS, 16.4, ytop, zS + wt, 'concrete', { color: wallC });
  B.box(17.4, y1, zS, O.x1, ytop, zS + wt, 'concrete', { color: wallC });
  B.box(16.4, y1 + 2.1, zS, 17.4, ytop, zS + wt, 'concrete', { color: wallC });
  // ── parede norte (z = 39.65) = empena do galpão; parede leste = parede do galpão
  // divisórias internas em z = 32 (porta x ∈ [12.6, 13.6]) nos dois pisos
  for (const [ya, yb] of [[0, y1 - 0.3], [y1, ytop]]) {
    B.box(O.x0 + wt, ya, 32, 12.6, yb, 32.12, 'plasterIn', { color: [0.82, 0.8, 0.74] });
    B.box(13.6, ya, 32, O.x1, yb, 32.12, 'plasterIn', { color: [0.82, 0.8, 0.74] });
    B.box(12.6, ya + 2.1, 32, 13.6, yb, 32.12, 'plasterIn', { color: [0.82, 0.8, 0.74] });
  }
  // reboco interno sobre o tijolo/chapa do galpão (paredes leste e norte do bloco)
  for (const [ya, yb] of [[0, y1 - 0.3], [y1, ytop]]) {
    B.box(O.x1 - 0.025, ya, O.z0 + wt, O.x1, yb, O.z1, 'plasterIn', { color: [0.8, 0.78, 0.72], collide: false, faces: { nx: 'plasterIn', px: null, py: null, ny: null, pz: null, nz: null } });
    B.box(O.x0 + wt, ya, O.z1 - 0.025, O.x1, yb, O.z1, 'plasterIn', { color: [0.8, 0.78, 0.72], collide: false, faces: { nz: 'plasterIn', px: null, nx: null, py: null, ny: null, pz: null } });
  }
  // barra de tinta a óleo nas paredes internas (verde-água, descascando)
  for (const yb of [0, y1]) {
    B.box(O.x0 + wt, yb + 0.012, O.z0 + wt, O.x0 + wt + 0.01, yb + 1.3, O.z1, 'plasterIn', { color: [0.47, 0.6, 0.55], collide: false, faces: { px: 'plasterIn', nx: null, py: null, ny: null, pz: null, nz: null } });
    B.box(O.x1 - 0.035, yb + 0.012, O.z0 + wt, O.x1 - 0.025, yb + 1.3, O.z1, 'plasterIn', { color: [0.47, 0.6, 0.55], collide: false, faces: { nx: 'plasterIn', px: null, py: null, ny: null, pz: null, nz: null } });
  }
  // teto (forro) visto de dentro: lado de baixo das lajes já existe
  // mobília: térreo (sala do apontador) e mezanino (gerência)
  FU.steelDesk(W, 14.0, 0, 27.6, Math.PI / 2 + 0.1, { open: true });
  FU.woodChair(W, 15.0, 0, 26.9, 2.2, { pose: 'side' });
  FU.fileCabinet(W, 11.15, 0, 25.0, Math.PI / 2);
  FU.fileCabinet(W, 11.15, 0, 25.6, Math.PI / 2, { open: 1 });
  FU.fileCabinet(W, 12.4, 0, 30.6, 0.9, { pose: 'side' });
  FU.lockers(W, 17.3, 0, 35.5, -Math.PI / 2, { n: 4, open: 1 });
  FU.shelf(W, 11.2, 0, 38.8, Math.PI / 2 + 0.05);
  FU.woodTable(W, 14.3, 0, 36.2, 0.2, { len: 1.8 });
  FU.woodChair(W, 13.4, 0, 35.5, 0.6);
  FU.woodChair(W, 15.1, 0, 37.3, -2.5, { pose: 'back' });
  FU.steelDesk(W, 14.2, y1, 29.0, Math.PI / 2, { pose: 'side' });
  FU.steelDesk(W, 15.6, y1, 35.2, -Math.PI / 2 - 0.2);
  FU.woodChair(W, 14.6, y1, 35.4, 1.2);
  FU.fileCabinet(W, 17.25, y1, 27.0, -Math.PI / 2, { open: 0 });
  FU.shelf(W, 17.3, y1, 30.4, -Math.PI / 2, { w: 1.2 });
  FU.woodTable(W, 13.0, y1, 37.8, 0.0, { pose: 'barricade' });
  FU.lockers(W, 17.3, y1, 38.0, -Math.PI / 2, { n: 3, tint: [0.42, 0.4, 0.3] });
  // papéis espalhados, cacos de vidro sob a vidraça, entulho de forro
  P.trash(W, 14, 30, 3.0, 40, 0.02);
  P.trash(W, 14.5, 33, 3.2, 40, y1 + 0.02);
  for (let i = 0; i < 5; i++) decal(B, 'shards', [xF + 0.6 + rng.range(0, 0.6), y1 + 0.016 + i * 0.0003, rng.range(25, 39)], 'py', [rng.range(1, 1.8), rng.range(1, 1.8)], [0, 0, 1, 1], rng.range(0, 6));
  for (let i = 0; i < 4; i++) decal(B, 'shards', [xF - 0.8 - rng.range(0, 1.2), 0.016 + i * 0.0003, rng.range(25, 39)], 'py', [rng.range(1.2, 2), rng.range(1.2, 2)], [0, 0, 1, 1], rng.range(0, 6));
  B.obox([12.8, 0.05, 33.4], [1.2, 0.02, 0.6], [0.04, 0.4, 0.06], 'plasterIn', { color: [0.88, 0.86, 0.82] });
  B.obox([15.2, y1 + 0.05, 30.8], [1.2, 0.02, 0.6], [0.0, 1.2, 0.08], 'plasterIn', { color: [0.88, 0.86, 0.82] });
  // calendário/quadro nas paredes, luminárias penduradas
  decal(B, 'posters', [O.x1 - 0.013, 1.6, 28.5], 'nx', [0.6, 0.8], [0, 0.5, 0.25, 1], 0.03);
  decal(B, 'posters', [O.x1 - 0.013, y1 + 1.7, 33.5], 'nx', [0.7, 0.7], [0.25, 0.5, 0.5, 1], -0.04);
  decal(B, 'cracks', [O.x1 - 0.012, y1 + 1.8, 36], 'nx', [2.4, 1.6], [0, 0, 1, 1], 0.4);
  decal(B, 'bullets', [xF + wt + 0.012, y1 + 0.6, 26], 'px', [1.2, 0.6], bulletRect(0), 0);
  for (const [lx, ly, lz] of [[14, y1 - 0.3, 28], [14, y1 - 0.3, 36], [14, ytop, 28], [14, ytop, 36]]) {
    cylBetween(B, [lx, ly, lz], [lx, ly - 0.5, lz + 0.1], 0.004, 'metal', { color: [0.3, 0.3, 0.3] });
    B.add(bevelBox(1.2, 0.08, 0.2, 0.02), 'metal', mat4([lx, ly - 0.55, lz + 0.1], [0.12, 0, 0.3]), { worldUV: false, vcolor: true, color: [0.85, 0.85, 0.82] });
  }
}

/** Janela interna (caixilho de alumínio, vidro quebrado, cacos nas bordas). */
function interiorWindow(W, c, a0, a1, y0, y1, axis, span) {
  const { B, rng } = W;
  if (axis === 'z') [a0, a1] = span;
  const n = Math.max(1, Math.round((a1 - a0) / 1.3));
  const d = (a1 - a0) / n;
  const frame = [0.55, 0.55, 0.52];
  const bx = (a, b, ya, yb) => axis === 'x' ? B.box(c - 0.04, ya, a, c + 0.04, yb, b, 'chrome', { color: frame, collide: false }) : B.box(a, ya, c - 0.04, b, yb, c + 0.04, 'chrome', { color: frame, collide: false });
  for (let i = 0; i <= n; i++) bx(a0 + i * d - 0.03, a0 + i * d + 0.03, y0, y1);
  bx(a0, a1, y0 - 0.03, y0 + 0.03);
  bx(a0, a1, y1 - 0.03, y1 + 0.03);
  const cst = B.cast;
  B.cast = false;
  for (let i = 0; i < n; i++) {
    const p0 = a0 + i * d + 0.03, p1 = a0 + (i + 1) * d - 0.03;
    if (rng.chance(0.7)) {
      // quebrado: cacos irregulares presos ao caixilho (borda serrilhada)
      const pts = [];
      const k = rng.int(3, 6);
      for (let j = 0; j < k; j++) {
        const along = rng.next();
        const top = rng.chance(0.5);
        const base = [p0 + (p1 - p0) * along, top ? y1 - 0.03 : y0 + 0.03];
        const tip = [base[0] + rng.range(-0.15, 0.15), base[1] + (top ? -1 : 1) * rng.range(0.1, 0.45)];
        const w = rng.range(0.06, 0.2);
        pts.push([base[0] - w, base[1]], [base[0] + w, base[1]], tip);
      }
      const pos = [];
      for (const [u, v] of pts) pos.push(...(axis === 'x' ? [c, v, Math.min(p1, Math.max(p0, u))] : [Math.min(p1, Math.max(p0, u)), v, c]));
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      B.add(g, 'fglass', null, { worldUV: false, color: [1, 1, 1] });
    } else {
      if (axis === 'x') B.panel([c, y0 + 0.03, p0], [0, 0, p1 - p0], [0, y1 - y0 - 0.06, 0], 1, 1, 'fglass', { worldUV: false, color: [1, 1, 1] });
      else B.panel([p0, y0 + 0.03, c], [p1 - p0, 0, 0], [0, y1 - y0 - 0.06, 0], 1, 1, 'fglass', { worldUV: false, color: [1, 1, 1] });
    }
  }
  B.cast = cst;
}

// ─── máquinas ──────────────────────────────────────────────────────────
/** Torno mecânico: barramento sobre dois pés-armário, cabeçote, placa, carro, contraponta, bandeja de cavaco. */
function lathe(W, x, z, yaw) {
  const { B, rng } = W;
  const M = mat4([x, 0, z], [0, yaw, 0]);
  const c = vary(rng, rng.pick(MACH), { tone: 0.06, fade: 0.12, dirt: 0.3 });
  const L = 3.2;
  for (const s of [-1, 1]) part(B, M, bevelBox(0.55, 0.78, 0.6, 0.03, { wear: 0.7 }), 'metal', [s * (L / 2 - 0.4), 0.39, 0], [0, 0, 0], c, { ao: [0, 0.5, 0.5] });
  part(B, M, bevelBox(L, 0.08, 0.75, 0.01), 'metal', [0, 0.82, 0.02], [0, 0, 0], [0.22, 0.21, 0.2]); // bandeja
  part(B, M, bevelBox(L - 0.2, 0.3, 0.42, 0.02, { wear: 0.8 }), 'metal', [0.1, 1.0, -0.05], [0, 0, 0], c);
  part(B, M, bevelBox(L - 0.3, 0.025, 0.36, 0.004), 'chrome', [0.15, 1.165, -0.05], [0, 0, 0], [0.45, 0.43, 0.4]); // guias
  part(B, M, bevelBox(0.75, 0.6, 0.55, 0.04, { wear: 0.6 }), 'metal', [-L / 2 + 0.4, 1.45, -0.04], [0, 0, 0], c);
  // placa de 3 castanhas
  B.add(cyl(18), 'chrome', M.clone().multiply(mat4([-L / 2 + 0.85, 1.42, -0.05], [0, 0, Math.PI / 2], [0.17, 0.14, 0.17])), { color: [0.42, 0.41, 0.38] });
  // carro + porta-ferramenta
  part(B, M, bevelBox(0.4, 0.22, 0.55, 0.02), 'metal', [0.2, 1.28, 0.02], [0, 0, 0], c.map((v) => v * 0.95));
  part(B, M, bevelBox(0.15, 0.12, 0.15, 0.01), 'metal', [0.2, 1.45, -0.05], [0, 0, 0], [0.25, 0.25, 0.24]);
  B.add(cyl(14), 'metal', M.clone().multiply(mat4([0.2, 1.22, 0.35], [Math.PI / 2, 0, 0], [0.08, 0.04, 0.08])), { color: [0.5, 0.5, 0.48] });
  // contraponta
  part(B, M, bevelBox(0.35, 0.35, 0.38, 0.03), 'metal', [L / 2 - 0.3, 1.33, -0.05], [0, 0, 0], c);
  B.add(cyl(12), 'chrome', M.clone().multiply(mat4([L / 2 - 0.55, 1.42, -0.05], [0, 0, Math.PI / 2], [0.04, 0.2, 0.04])), { color: [0.45, 0.45, 0.43] });
  // fuso e barra
  B.add(cyl(8), 'chrome', M.clone().multiply(mat4([0, 0.95, 0.2], [0, 0, Math.PI / 2], [0.015, L - 0.6, 0.015])), { color: [0.4, 0.4, 0.38] });
  // proteção da placa (aberta) e luminária articulada
  part(B, M, bevelBox(0.3, 0.02, 0.4, 0.006), 'metal', [-L / 2 + 0.85, 1.72, -0.15], [-0.9, 0, 0], [0.7, 0.55, 0.12]);
  cylBetween(B, new THREE.Vector3(-L / 2 + 0.3, 1.75, -0.25).applyMatrix4(M).toArray(), new THREE.Vector3(-L / 2 + 0.6, 2.2, 0.1).applyMatrix4(M).toArray(), 0.012, 'metal', { color: [0.2, 0.2, 0.2] });
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0.85, 0), new THREE.Vector3(L, 1.7, 0.8)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'metal');
  contact(B, x, 0, z, L + 0.6, 1.2, yaw, 2);
  decal(B, 'stains', [x, 0.014, z], 'py', [L + 1.2, 2.0], [0, 0, 0.5, 0.5], yaw, [0.6, 0.55, 0.5]);
  // cavacos de metal no chão (espirais brilhantes → grãos cromados)
  for (let i = 0; i < 30; i++) {
    const p = new THREE.Vector3(rng.range(-L / 2, L / 2), 0, rng.range(0.4, 1.0)).applyMatrix4(M);
    W.I.add('chip', cached('chip', () => new THREE.TorusGeometry(0.012, 0.002, 3, 8, Math.PI * 1.5)), 'chrome', mat4([p.x, 0.004, p.z], [Math.PI / 2, rng.range(0, 6), 0], rng.range(0.7, 1.6)), [0.7, 0.62, 0.5], { shadow: false });
  }
}

/** Prensa de coluna dupla (5,6 m): montantes, coroa, volante, martelo, mesa, guarda. */
function press(W, x, z, yaw) {
  const { B, rng } = W;
  const M = mat4([x, 0, z], [0, yaw, 0]);
  const c = vary(rng, [0.3, 0.36, 0.42], { tone: 0.06, fade: 0.35, dirt: 0.3 });
  part(B, M, bevelBox(3.4, 0.6, 2.0, 0.05, { wear: 0.5 }), 'metal', [0, 0.3, 0], [0, 0, 0], c.map((v) => v * 0.9), { ao: [0, 0.4, 0.5] });
  for (const s of [-1, 1]) part(B, M, bevelBox(0.7, 4.2, 1.7, 0.06, { wear: 0.6 }), 'metal', [s * 1.3, 2.7, 0], [0, 0, 0], c);
  part(B, M, bevelBox(3.6, 1.2, 2.0, 0.08, { wear: 0.6 }), 'metal', [0, 5.2, 0], [0, 0, 0], c);
  part(B, M, bevelBox(1.85, 0.9, 1.4, 0.04), 'metal', [0, 3.2, 0], [0, 0, 0], c.map((v) => v * 0.85)); // martelo
  part(B, M, bevelBox(1.85, 0.3, 1.5, 0.02), 'metal', [0, 1.1, 0], [0, 0, 0], [0.26, 0.25, 0.24]); // mesa
  part(B, M, bevelBox(1.6, 0.25, 1.2, 0.02), 'chrome', [0, 1.38, 0], [0, 0, 0], [0.35, 0.33, 0.3]); // matriz
  // volante e correias
  B.add(cyl(28), 'metal', M.clone().multiply(mat4([1.95, 5.3, 0.4], [0, 0, Math.PI / 2], [0.9, 0.25, 0.9])), { color: [0.25, 0.25, 0.24] });
  B.add(cyl(14), 'metal', M.clone().multiply(mat4([1.95, 5.3, 0.4], [0, 0, Math.PI / 2], [0.18, 0.4, 0.18])), { color: [0.4, 0.4, 0.38] });
  part(B, M, bevelBox(0.8, 0.6, 0.6, 0.05), 'metal', [1.5, 6.15, -0.5], [0, 0, 0], [0.25, 0.32, 0.4]); // motor
  // guarda de tela + botoeira bimanual
  B.add(UNIT(), 'mesh', M.clone().multiply(mat4([0, 2.3, 0.9], [0, 0, 0], [1.9, 1.6, 0.01])), { worldUV: false, uvScale: 2, color: [0.8, 0.7, 0.2] });
  part(B, M, bevelBox(0.6, 0.18, 0.2, 0.03), 'metal', [0, 1.35, 1.3], [0.2, 0, 0], [0.75, 0.6, 0.15]);
  cylBetween(B, new THREE.Vector3(0, 0, 1.3).applyMatrix4(M).toArray(), new THREE.Vector3(0, 1.25, 1.3).applyMatrix4(M).toArray(), 0.03, 'metal', { color: [0.2, 0.2, 0.2] });
  // escada de manutenção na lateral
  for (let k = 0; k < 14; k++) member(B, new THREE.Vector3(-1.66, 0.4 + k * 0.35, -0.25).applyMatrix4(M).toArray(), new THREE.Vector3(-1.66, 0.4 + k * 0.35, 0.25).applyMatrix4(M).toArray(), 0.025, 0.025, 'metal', [0.6, 0.5, 0.15]);
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 2.9, 0), new THREE.Vector3(3.6, 5.8, 2.0)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'metal');
  contact(B, x, 0, z, 4.4, 2.8, yaw, 3);
  decal(B, 'stains', [x, 0.015, z], 'py', [5, 4], [0, 0, 0.5, 0.5], yaw, [0.45, 0.42, 0.4]);
}

/** Armário elétrico (CCM) com portas, uma aberta mostrando chaves; eletrodutos subindo. */
function panelBox(W, x, z, yaw, n = 3) {
  const { B, rng } = W;
  const M = mat4([x, 0, z], [0, yaw, 0]);
  const c = vary(rng, [0.62, 0.62, 0.58], { tone: 0.05, fade: 0.2, dirt: 0.35 });
  const w = n * 0.8;
  part(B, M, bevelBox(w, 2.0, 0.5, 0.02, { wear: 0.6 }), 'metal', [0, 1.1, 0], [0, 0, 0], c);
  part(B, M, bevelBox(w + 0.04, 0.1, 0.54, 0.01), 'black', [0, 0.05, 0], [0, 0, 0], [0.5, 0.5, 0.5]);
  for (let k = 0; k < n; k++) {
    const open = k === 1;
    const hx = -w / 2 + k * 0.8;
    const D = M.clone().multiply(mat4([hx + 0.01, 0, 0.26], [0, open ? -1.6 : 0, 0]));
    part(B, D, bevelBox(0.78, 1.9, 0.02, 0.01, { wear: 0.7 }), 'metal', [0.39, 1.1, 0], [0, 0, 0], c.map((v) => v * 1.03));
    part(B, D, bevelBox(0.03, 0.12, 0.03, 0.01), 'chrome', [0.7, 1.1, 0.02], [0, 0, 0], [0.3, 0.3, 0.3]);
    if (open) {
      part(B, M, bevelBox(0.7, 1.8, 0.02, 0.005), 'metal', [hx + 0.4, 1.1, 0.0], [0, 0, 0], [0.5, 0.48, 0.42]);
      for (let r = 0; r < 4; r++) for (let q = 0; q < 3; q++) part(B, M, bevelBox(0.12, 0.2, 0.08, 0.01), 'plastic', [hx + 0.18 + q * 0.2, 0.5 + r * 0.38, 0.06], [0, 0, 0], r === 2 && q === 1 ? [0.12, 0.12, 0.12] : [0.3, 0.3, 0.28]);
    }
    decal(B, 'stains', new THREE.Vector3(hx + 0.4, 1.7, 0.272).applyMatrix4(M).toArray(), yaw === 0 ? 'pz' : 'nz', [0.16, 0.16], [0, 0, 0.5, 0.5], 0, [1.3, 1.1, 0.2]);
  }
  for (let k = 0; k < n * 2; k++) {
    const p = new THREE.Vector3(-w / 2 + 0.2 + k * 0.38, 2.1, -0.1).applyMatrix4(M);
    cylBetween(B, p.toArray(), [p.x, CAT.y - 0.3, p.z], 0.025, 'metal', { seg: 6, color: [0.5, 0.5, 0.48] });
  }
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(w, 2.2, 0.5)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'metal');
  contact(B, x, 0, z, w + 0.4, 0.9, yaw, 2);
}

/** Bancada de aço com morsa, ferramentas e gaveteiro. */
function workbench(W, x, z, yaw) {
  const { B, rng } = W;
  const M = mat4([x, 0, z], [0, yaw, 0]);
  const c = vary(rng, [0.32, 0.35, 0.32], { fade: 0.3, dirt: 0.3 });
  part(B, M, bevelBox(2.0, 0.05, 0.8, 0.01, { wear: 0.8 }), 'wood', [0, 0.9, 0], [0, 0, 0], vary(rng, [0.4, 0.3, 0.2], { dirt: 0.5 }));
  for (const a of [-0.95, 0.95]) for (const b of [-0.35, 0.35]) part(B, M, bevelBox(0.05, 0.88, 0.05, 0.006), 'metal', [a, 0.44, b], [0, 0, 0], c);
  part(B, M, bevelBox(1.9, 0.03, 0.7, 0.005), 'metal', [0, 0.2, 0], [0, 0, 0], c);
  part(B, M, bevelBox(0.5, 0.6, 0.65, 0.01, { wear: 0.6 }), 'metal', [0.65, 0.57, 0], [0, 0, 0], c.map((v) => v * 1.1));
  // morsa
  part(B, M, bevelBox(0.18, 0.12, 0.3, 0.02), 'metal', [-0.7, 1.0, 0.25], [0, 0, 0], [0.25, 0.32, 0.4]);
  B.add(cyl(8), 'chrome', M.clone().multiply(mat4([-0.7, 1.0, 0.48], [Math.PI / 2, 0, 0], [0.012, 0.25, 0.012])), { color: [0.5, 0.5, 0.5] });
  // ferramentas espalhadas
  for (let i = 0; i < 5; i++) part(B, M, bevelBox(rng.range(0.15, 0.3), 0.02, 0.04, 0.005), 'chrome', [rng.range(-0.6, 0.4), 0.935, rng.range(-0.3, 0.3)], [0, rng.range(0, 3), 0], [0.4, 0.38, 0.35]);
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 0.47, 0), new THREE.Vector3(2.0, 0.95, 0.8)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'metal');
  contact(B, x, 0, z, 2.4, 1.2, yaw, 1);
}

/** Reservatório de ar horizontal (compressor) sobre selas. */
function tank(W, x, z, yaw) {
  const { B, rng } = W;
  const M = mat4([x, 0, z], [0, yaw, 0]);
  const c = vary(rng, [0.55, 0.2, 0.15], { fade: 0.5, dirt: 0.3 });
  B.add(cyl(24), 'metal', M.clone().multiply(mat4([0, 1.0, 0], [0, 0, Math.PI / 2], [0.75, 3.2, 0.75])), { color: c, uvRand: true });
  for (const s of [-1, 1]) B.add(cached('tankcap', () => new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2)), 'metal', M.clone().multiply(mat4([s * 1.6, 1.0, 0], [0, 0, -s * Math.PI / 2], [0.75, 0.3, 0.75])), { color: c });
  for (const s of [-1, 1]) part(B, M, bevelBox(0.25, 0.5, 1.2, 0.02), 'metal', [s * 1.0, 0.25, 0], [0, 0, 0], [0.25, 0.25, 0.24]);
  // compressor em cima
  part(B, M, bevelBox(0.9, 0.5, 0.6, 0.04), 'metal', [-0.5, 2.0, 0], [0, 0, 0], [0.2, 0.25, 0.3]);
  B.add(cyl(16), 'metal', M.clone().multiply(mat4([0.4, 1.95, 0], [Math.PI / 2, 0, 0], [0.3, 0.1, 0.3])), { color: [0.3, 0.3, 0.28] });
  cylBetween(B, new THREE.Vector3(0.4, 1.7, 0).applyMatrix4(M).toArray(), new THREE.Vector3(1.4, 1.3, 0.4).applyMatrix4(M).toArray(), 0.025, 'chrome', { color: [0.6, 0.5, 0.35] });
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 1.15, 0), new THREE.Vector3(3.8, 2.3, 1.5)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'metal');
  contact(B, x, 0, z, 4.2, 2.0, yaw, 2);
}

/** Porta-paletes (estantes azuis, longarinas laranja) com paletes e caixas. */
function rack(W, x0, z0, z1, depth = 1.1, levels = 3) {
  const { B, rng } = W;
  const H = 1.6;
  const blue = [0.16, 0.28, 0.5], orange = [0.8, 0.4, 0.1];
  const bays = Math.max(1, Math.round((z1 - z0) / 2.7));
  const bw = (z1 - z0) / bays;
  for (let k = 0; k <= bays; k++) {
    const z = z0 + k * bw;
    for (const x of [x0, x0 - depth]) B.box(x - 0.05, 0, z - 0.04, x + 0.05, H * levels + 0.4, z + 0.04, 'metal', { color: vary(rng, blue, { fade: 0.3 }), collide: false });
    for (let y = 0.3; y < H * levels; y += 0.6) member(B, [x0, y, z], [x0 - depth, y + 0.5, z], 0.03, 0.03, 'metal', blue);
  }
  for (let l = 0; l < levels; l++) {
    const y = 0.12 + l * H;
    for (const x of [x0, x0 - depth]) B.box(x - 0.05, y, z0, x + 0.05, y + 0.12, z1, 'metal', { color: vary(rng, orange, { fade: 0.4 }), collide: false });
    for (let k = 0; k < bays; k++) {
      if (rng.chance(0.25)) continue;
      const zc = z0 + (k + 0.5) * bw;
      P.pallet(W, x0 - depth / 2, zc, Math.PI / 2 + rng.range(-0.05, 0.05), y + 0.12);
      const kind = rng.next();
      if (kind < 0.5) {
        // carga embalada em filme (bloco de caixas)
        const h = rng.range(0.6, 1.1);
        B.add(bevelBox(1.0, h, 1.15, 0.05, { wear: 0.1 }), 'cardboard', mat4([x0 - depth / 2, y + 0.27 + h / 2, zc], [0, rng.range(-0.06, 0.06), 0]), { worldUV: false, vcolor: true, color: vary(rng, [0.66, 0.52, 0.36], { dirt: 0.3 }) });
      } else if (kind < 0.75) {
        for (const dz of [-0.3, 0.3]) P.barrel(W, x0 - depth / 2, zc + dz, { y: y + 0.27, tint: rng.pick([[0.2, 0.3, 0.55], [0.55, 0.15, 0.1], [0.15, 0.15, 0.15]]) });
      } else {
        P.crate(W, x0 - depth / 2, zc, Math.PI / 2, 0.9, { y: y + 0.27, collide: false, stacked: true });
      }
    }
  }
  B.collider([x0 - depth - 0.06, 0, z0 - 0.05], [x0 + 0.06, H * levels + 0.4, z1 + 0.05], 'metal');
  contact(B, x0 - depth / 2, 0, (z0 + z1) / 2, depth + 0.6, z1 - z0 + 0.6, 0, 1);
}

/** Esteira de roletes sobre cavaletes. */
function conveyor(W, x, z0, z1) {
  const { B } = W;
  const y = 0.85, w = 0.7;
  for (const s of [-1, 1]) B.box(x + s * w / 2 - 0.04, y - 0.12, z0, x + s * w / 2 + 0.04, y + 0.04, z1, 'metal', { color: [0.3, 0.33, 0.3], collide: false });
  for (let z = z0 + 0.1; z < z1; z += 0.12) B.add(cyl(8), 'chrome', mat4([x, y, z], [0, 0, Math.PI / 2], [0.035, w - 0.08, 0.035]), { color: [0.42, 0.41, 0.38] });
  for (let z = z0 + 0.3; z < z1; z += 1.6) for (const s of [-1, 1]) B.box(x + s * (w / 2 - 0.02) - 0.03, 0, z - 0.03, x + s * (w / 2 - 0.02) + 0.03, y - 0.1, z + 0.03, 'metal', { color: [0.3, 0.33, 0.3], collide: false });
  B.collider([x - w / 2, 0, z0], [x + w / 2, y + 0.05, z1], 'metal');
  contact(B, x, 0, (z0 + z1) / 2, w + 0.5, z1 - z0 + 0.3, 0, 1);
}

/** Empilhadeira abandonada: chassi boleado, contrapeso, mastro com garfos, cabine de proteção. */
function forklift(W, x, z, yaw) {
  const { B, rng } = W;
  const M = mat4([x, 0, z], [0, yaw, 0]);
  const c = vary(rng, [0.78, 0.55, 0.12], { fade: 0.4, dirt: 0.35 });
  part(B, M, bevelBox(1.1, 0.75, 2.0, 0.12, { wear: 0.6 }), 'metal', [0, 0.65, 0], [0, 0, 0], c);
  part(B, M, bevelBox(1.12, 0.65, 0.5, 0.15, { wear: 0.4 }), 'metal', [0, 0.75, -0.95], [0, 0, 0], [0.22, 0.22, 0.21]); // contrapeso
  for (const s of [-1, 1]) {
    B.add(cached('flwheel', () => new THREE.CylinderGeometry(0.3, 0.3, 0.22, 18)), 'rubber', M.clone().multiply(mat4([s * 0.5, 0.3, 0.6], [0, 0, Math.PI / 2])), { color: [0.9, 0.9, 0.9] });
    B.add(cached('flwheel2', () => new THREE.CylinderGeometry(0.22, 0.22, 0.18, 16)), 'rubber', M.clone().multiply(mat4([s * 0.48, 0.22, -0.7], [0, 0, Math.PI / 2])), { color: [0.9, 0.9, 0.9] });
    // cabine: colunas + teto de grade
    member(B, new THREE.Vector3(s * 0.48, 1.0, 0.45).applyMatrix4(M).toArray(), new THREE.Vector3(s * 0.48, 2.1, 0.3).applyMatrix4(M).toArray(), 0.05, 0.05, 'metal', [0.15, 0.15, 0.15]);
    member(B, new THREE.Vector3(s * 0.48, 1.0, -0.6).applyMatrix4(M).toArray(), new THREE.Vector3(s * 0.48, 2.1, -0.55).applyMatrix4(M).toArray(), 0.05, 0.05, 'metal', [0.15, 0.15, 0.15]);
    // mastro
    part(B, M, bevelBox(0.08, 2.4, 0.12, 0.01), 'metal', [s * 0.32, 1.25, 1.1], [0.05, 0, 0], [0.18, 0.18, 0.17]);
    part(B, M, bevelBox(0.1, 0.05, 1.1, 0.01), 'metal', [s * 0.25, 0.04, 1.65], [0, 0, 0], [0.2, 0.2, 0.19]);
    part(B, M, bevelBox(0.1, 0.5, 0.05, 0.01), 'metal', [s * 0.25, 0.3, 1.13], [0, 0, 0], [0.2, 0.2, 0.19]);
  }
  part(B, M, bevelBox(1.0, 0.04, 1.05, 0.01), 'grating', [0, 2.12, -0.12], [0, 0, 0], [0.4, 0.4, 0.4]);
  part(B, M, bevelBox(0.45, 0.45, 0.45, 0.06), 'fabric', [0, 1.25, -0.35], [0, 0, 0], [0.15, 0.14, 0.13]); // banco
  B.add(cached('steer', () => new THREE.TorusGeometry(0.18, 0.016, 8, 24)), 'plastic', M.clone().multiply(mat4([0, 1.45, 0.35], [-1.0, 0, 0])), { color: [0.1, 0.1, 0.1] });
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, 1.1, 0.3), new THREE.Vector3(1.2, 2.2, 3.0)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'metal');
  contact(B, x, 0, z, 1.6, 3.2, -yaw, 2);
}

function machinery(W) {
  const { B, rng } = W;
  // fila de tornos (oeste do corredor)
  for (const [z, yaw] of [[2.5, 0.0], [7.5, 0.04], [17.5, -0.03], [22.0, 0.0]]) lathe(W, -9.5, z, Math.PI / 2 + yaw);
  lathe(W, -9.5, 32, Math.PI / 2 + 0.6); // um torno arrancado da base, torto
  // prensa e armários elétricos
  press(W, 7.5, 12.5, 0);
  press(W, 7.5, 3.0, Math.PI);
  panelBox(W, -14.5, 36.6, 0, 3);
  panelBox(W, 1.5, 38.9, Math.PI, 4);
  // bancadas junto à parede oeste e esteira
  workbench(W, -16.2, 12, Math.PI / 2);
  workbench(W, -16.2, 20, Math.PI / 2);
  conveyor(W, 0.0, 26.5, 36);
  tank(W, -4.5, 36.8, 0);
  forklift(W, 1.6, 6.5, 0.7);
  // porta-paletes ao longo da parede leste (ao sul do escritório) — vãos para circular
  rack(W, IN.x1 - 0.05, -6.5, 1.5);
  rack(W, IN.x1 - 0.05, 4.5, 9.5);
  rack(W, IN.x1 - 0.05, 15, 20.5);
  // material espalhado: tambores, paletes, caixas, perfis no chão, entulho
  for (const [x, z] of [[-1.5, 15.5], [-1.0, 16.2], [-13, 27], [-12.4, 27.6], [12, -4], [5.5, 30.5], [5.9, 31.3]]) P.barrel(W, x, z, { fallen: rng.chance(0.3) });
  for (const [x, z, s] of [[-5.5, 0.5, 1], [4.6, 22.6, 1], [-12.6, -0.5, 0.9]]) P.crate(W, x, z, rng.range(0, 3), s);
  P.crate(W, -5.5, 0.4, 0.3, 0.8, { y: 0.5, stacked: true });
  for (let i = 0; i < 5; i++) P.pallet(W, -13 + rng.range(-0.1, 0.1), -2.5, 0.05, i * 0.145);
  for (let i = 0; i < 3; i++) P.pallet(W, 12.8, 21.2, 1.2, i * 0.145);
  B.collider([-13.7, 0, -3.2], [-12.3, 0.75, -1.8], 'wood');
  for (let k = 0; k < 5; k++) ibeam(B, [-2.0 + k * 0.32, 0.12, 30], [-1.9 + k * 0.32, 0.12, 36], 0.24, 0.12, 'metal', PRIMER, [0, 1, 0]);
  B.collider([-2.2, 0, 30], [-0.4, 0.3, 36], 'metal');
  P.clutter(W, -14.5, -5.5, 1.3, 8);
  P.clutter(W, 9.5, 37.5, 1.2, 6);
  P.rubblePile(W, 14.2, 13, 1.4, 0.5, { tint: [0.8, 0.5, 0.4], brick: 0.8 });
  P.scatterBricks(W, -2, 10, 4, 18);
  P.trash(W, 0, 16, 16, 60, 0.02);
  P.trash(W, -8, -2, 6, 20, 0.02);
  // fogo num tambor (luz quente lá dentro) — definido em FACTORY_FIRES
  P.barrel(W, -2.8, 20.5, { tint: [0.25, 0.22, 0.2] });
  // luminárias de galpão (campânulas) penduradas das treliças, apagadas;
  // algumas caídas/tortas
  const shade = cached('bayshade', () => new THREE.CylinderGeometry(0.12, 0.38, 0.32, 16, 1, true));
  for (let z = HALL.z0 + HALL.bay; z < HALL.z1 - 1; z += HALL.bay) {
    for (const x of [-9, 0, 9]) {
      if (rng.chance(0.15)) continue;
      const y = 8.2 + rng.range(-0.2, 0.2);
      const sw = rng.chance(0.2) ? rng.range(-0.25, 0.25) : 0;
      cylBetween(B, [x, HALL.eave - 0.4, z], [x + sw, y + 0.2, z], 0.006, 'cable', { seg: 4 });
      B.add(shade, 'metal', mat4([x + sw, y, z], [sw * 0.5, 0, sw]), { worldUV: false, color: [0.55, 0.57, 0.55], uvRand: true });
      B.add(cached('bayshadeIn', () => new THREE.CylinderGeometry(0.11, 0.37, 0.3, 16, 1, true).scale(-1, 1, 1)), 'metal', mat4([x + sw, y, z], [sw * 0.5, 0, sw]), { worldUV: false, color: [0.85, 0.85, 0.82] });
      B.add(cyl(10), 'metal', mat4([x + sw, y + 0.26, z], [0, 0, 0], [0.13, 0.22, 0.13]), { color: [0.3, 0.3, 0.29] });
    }
  }
  // poças de água/óleo sob os buracos do telhado (espelham a luz)
  for (const [x, z, r] of [[-6.8, 17.5, 1.3], [-3.5, 9.8, 0.9], [-9, 14.6, 0.7], [8.8, 28.5, 1.0]]) {
    const k = rng.int(0, 2);
    const g = cached('puddleIrr' + k, () => {
      const pts = [];
      for (let i = 0; i < 28; i++) {
        const t = (i / 28) * Math.PI * 2;
        const rr = 1 + 0.28 * Math.sin(3 * t + k * 2.1) + 0.14 * Math.sin(7 * t + k) + 0.06 * Math.sin(13 * t + k * 3);
        pts.push(new THREE.Vector2(Math.cos(t) * rr, Math.sin(t) * rr));
      }
      return new THREE.ShapeGeometry(new THREE.Shape(pts)).rotateX(-Math.PI / 2);
    });
    B.add(g, 'puddle', mat4([x, 0.008, z], [0, rng.range(0, 6), 0], [r * 1.4, 1, r]), { worldUV: false, color: [1, 1, 1] });
  }
  // poças de óleo/água sob goteiras do telhado
  for (const [x, z, s] of [[-6.5, 18, 2.6], [-2.5, 9.5, 1.8], [9, 28, 2.2]]) decal(B, 'stains', [x, 0.018, z], 'py', [s, s * 0.8], [0.5, 0.5, 1, 1], rng.range(0, 6), [0.5, 0.48, 0.46]);
}

// ─── pátio, doca, carreta, contêineres, muro ───────────────────────────
function container(W, x, z, yaw, y, tint, opts = {}) {
  const { B, rng } = W;
  const L = 6.06, Wd = 2.44, H = 2.59;
  const M = mat4([x, y, z], [0, yaw, 0]);
  const c = vary(rng, tint, { tone: 0.06, fade: 0.45, dirt: 0.25 });
  // casco: painéis ondulados (laterais em corrugated), teto, cantoneiras
  for (const s of [-1, 1]) B.add(UNIT(), 'corrugated', M.clone().multiply(mat4([0, H / 2, s * (Wd / 2 - 0.03)], [0, 0, 0], [L - 0.3, H - 0.25, 0.06])), { color: c, uvRand: true });
  B.add(UNIT(), 'metal', M.clone().multiply(mat4([0, H - 0.05, 0], [0, 0, 0], [L - 0.2, 0.08, Wd - 0.1])), { color: c.map((v) => v * 0.95), uvRand: true });
  B.add(UNIT(), 'corrugated', M.clone().multiply(mat4([-L / 2 + 0.08, H / 2, 0], [0, 0, 0], [0.06, H - 0.25, Wd - 0.2])), { color: c, uvRand: true });
  // portas (lado +x): duas folhas com barras de travamento
  for (const s of [-1, 1]) {
    const open = opts.open && s > 0;
    const D = M.clone().multiply(mat4([L / 2 - 0.08, 0, s * (Wd / 2 - 0.05)], [0, open ? -s * 1.9 : 0, 0]));
    part(B, D, bevelBox(0.05, H - 0.25, Wd / 2 - 0.06, 0.01, { wear: 0.6 }), 'metal', [0, H / 2, -s * (Wd / 4 - 0.02)], [0, 0, 0], c);
    for (const k of [0.25, 0.75]) B.add(cyl(8), 'chrome', D.clone().multiply(mat4([0.05, H / 2, -s * (Wd / 2 - 0.06) * k], [0, 0, 0], [0.018, H - 0.3, 0.018])), { color: [0.4, 0.38, 0.35] });
  }
  if (opts.open) part(B, M, bevelBox(0.02, H - 0.3, Wd - 0.2, 0.002), 'black', [L / 2 - 0.5, H / 2, 0], [0, 0, 0], [0.3, 0.28, 0.25]);
  // cantoneiras e longarinas (estrutura)
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    part(B, M, bevelBox(0.15, H, 0.15, 0.01), 'metal', [a * (L / 2 - 0.075), H / 2, b * (Wd / 2 - 0.075)], [0, 0, 0], c.map((v) => v * 0.8));
    part(B, M, bevelBox(0.18, 0.12, 0.18, 0.02), 'metal', [a * (L / 2 - 0.09), b > 0 ? H - 0.06 : 0.06, 0], [0, 0, 0], [0.2, 0.2, 0.19]);
  }
  for (const yy of [0.08, H - 0.08]) for (const b of [-1, 1]) part(B, M, bevelBox(L, 0.16, 0.12, 0.01), 'metal', [0, yy, b * (Wd / 2 - 0.06)], [0, 0, 0], c.map((v) => v * 0.85));
  decal(B, 'streaks', new THREE.Vector3(0, H * 0.6, Wd / 2 + 0.012).applyMatrix4(M).toArray(), Math.abs(Math.cos(yaw)) > 0.7 ? (Math.cos(yaw) > 0 ? 'pz' : 'nz') : (Math.sin(yaw) > 0 ? 'px' : 'nx'), [L * 0.8, H * 0.7]);
  const box = new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(0, H / 2, 0), new THREE.Vector3(L, H, Wd)).applyMatrix4(M);
  B.collider(box.min.toArray(), box.max.toArray(), 'metal');
  if (y < 0.1) contact(B, x, y, z, L + 0.5, Wd + 0.5, -yaw, 2);
}

/** Semirreboque baú encostado na doca (sem cavalo): baú, chassi, rodado duplo, pés de apoio. */
function trailer(W, xRear, z) {
  const { B, rng } = W;
  const L = 13.6, Wd = 2.5, y0 = 1.25, H = 2.7;
  const x0 = xRear - L;
  const c = vary(rng, [0.7, 0.7, 0.67], { fade: 0.2, dirt: 0.45 });
  // baú de alumínio pintado (sem a ferrugem pontilhada da chapa de aço):
  // tinta lisa com pó, escorridos e sujeira de estrada embaixo
  B.add(bevelBox(L, H, Wd, 0.06, { wear: 0.3 }), 'carpaint', mat4([x0 + L / 2, y0 + H / 2, z]), { worldUV: true, vcolor: true, color: c, uvRand: true, ao: [y0, y0 + 1.2, 0.6] });
  for (const s of [-1, 1]) {
    decal(B, 'streaks', [x0 + L * 0.3, y0 + H * 0.55, z + s * (Wd / 2 + 0.006)], s > 0 ? 'pz' : 'nz', [L * 0.35, H * 0.9]);
    decal(B, 'streaks', [x0 + L * 0.75, y0 + H * 0.55, z + s * (Wd / 2 + 0.006)], s > 0 ? 'pz' : 'nz', [L * 0.3, H * 0.9]);
    // trilho de amarração + faixa refletiva gasta
    B.box(x0 + 0.1, y0 + 0.05, z + s * (Wd / 2) - 0.02, xRear - 0.1, y0 + 0.17, z + s * (Wd / 2) + 0.02, 'metal', { color: [0.3, 0.3, 0.28], collide: false });
    for (let x = x0 + 0.5; x < xRear - 0.5; x += 0.9) B.box(x, y0 + 0.2, z + s * (Wd / 2) - 0.01, x + 0.45, y0 + 0.26, z + s * (Wd / 2) + 0.01, 'taillight', { color: x % 1.8 < 0.9 ? [0.7, 0.12, 0.08] : [0.75, 0.72, 0.65], collide: false });
  }
  // longarinas, travessas e caixa de ferramentas sob o baú (o vão não fica vazio)
  for (const s of [-0.45, 0.45]) B.box(x0 + 0.5, y0 - 0.32, z + s - 0.08, xRear, y0 - 0.02, z + s + 0.08, 'metal', { color: [0.16, 0.16, 0.15], collide: false });
  for (let x = x0 + 1; x < xRear; x += 1.2) B.box(x - 0.04, y0 - 0.15, z - Wd / 2 + 0.1, x + 0.04, y0 - 0.02, z + Wd / 2 - 0.1, 'metal', { color: [0.18, 0.18, 0.17], collide: false });
  B.add(bevelBox(1.2, 0.5, 0.5, 0.03), 'metal', mat4([x0 + 6, y0 - 0.3, z + Wd / 2 - 0.35]), { worldUV: false, vcolor: true, color: [0.2, 0.2, 0.19] });
  B.add(bevelBox(1.8, 0.06, 0.6, 0.02), 'metal', mat4([x0 + 8.5, 0.45, z - Wd / 2 + 0.3], [0, 0, 0.05]), { worldUV: false, vcolor: true, color: [0.25, 0.25, 0.24] });
  // nervuras verticais do baú
  for (let x = x0 + 0.6; x < xRear - 0.3; x += 0.6) for (const s of [-1, 1]) B.box(x - 0.025, y0 + 0.05, z + s * (Wd / 2) - 0.012, x + 0.025, y0 + H - 0.05, z + s * (Wd / 2) + 0.012, 'metal', { color: c.map((v) => v * 0.93), collide: false });
  // portas traseiras abertas (encostadas na doca)
  B.box(xRear - 0.05, y0, z - Wd / 2, xRear + 0.02, y0 + H, z + Wd / 2, 'black', { collide: false, color: [0.3, 0.28, 0.26], faces: { px: 'black', nx: null, py: null, ny: null, pz: null, nz: null } });
  // chassi, para-choque traseiro, rodas
  B.box(x0 + 1, y0 - 0.3, z - 0.5, xRear, y0, z + 0.5, 'metal', { color: [0.18, 0.18, 0.17], collide: false });
  B.box(xRear - 0.3, 0.45, z - 1.15, xRear - 0.15, 0.6, z + 1.15, 'metal', { color: [0.6, 0.15, 0.1], collide: false });
  for (const dx of [2.2, 3.5, 4.8]) for (const s of [-1, 1]) {
    const tk = 0.5 / 0.33;
    const tz = z + s * (Wd / 2 - 0.35);
    B.add(cached('trtire', () => treadTire(0, 48, 12).clone().rotateX(Math.PI / 2)), 'rubber', mat4([xRear - dx, 0.5, tz], [0, 0, rng.range(0, 6)], [tk, tk, 1.4]), { color: [0.85, 0.85, 0.83] });
    B.add(cyl(16), 'metal', mat4([xRear - dx, 0.5, z + s * (Wd / 2 - 0.2)], [Math.PI / 2, 0, 0], [0.22, 0.05, 0.22]), { color: [0.5, 0.48, 0.45] });
  }
  // pés de apoio dianteiros
  for (const s of [-1, 1]) {
    B.box(x0 + 3, 0, z + s * 0.6 - 0.06, x0 + 3.12, y0 - 0.3, z + s * 0.6 + 0.06, 'metal', { color: [0.2, 0.2, 0.19], collide: false });
    B.box(x0 + 2.9, 0, z + s * 0.6 - 0.15, x0 + 3.22, 0.04, z + s * 0.6 + 0.15, 'metal', { color: [0.2, 0.2, 0.19], collide: false });
  }
  decal(B, 'graffiti', [x0 + 6, y0 + 1.3, z + Wd / 2 + 0.065], 'pz', [3.2, 1.4], graffitiRect(rng.int(0, 15)), 0);
  decal(B, 'bulletsM', [x0 + 9, y0 + 1.1, z - Wd / 2 - 0.065], 'nz', [1.2, 1.0], bulletRect(1), 0);
  B.collider([x0, 0, z - Wd / 2], [xRear, y0 + H, z + Wd / 2], 'metal');
  contact(B, x0 + L / 2, 0, z, L + 0.6, Wd + 0.8, 0, 2);
}

function yard(W) {
  const { B, rng } = W;
  // ── armazém anexo com doca (x ∈ [12, 22], z ∈ [-38, -16]) ──
  const ax0 = DOCK.x1, ax1 = 22, az0 = -38, az1 = -16;
  B.box(ax0, 0, az0, ax1, 7.2, az1, 'brick', { color: [0.86, 0.82, 0.78], faces: { nx: 'brick', ny: null } });
  B.box(ax0 - 0.2, 7.2, az0 - 0.2, ax1, 7.5, az1 + 0.2, 'concrete', { color: [0.7, 0.68, 0.64], collide: false });
  // plataforma da doca (1,2 m), borda de cantoneira, para-choques de borracha
  B.box(DOCK.x0, 0, DOCK.z0, DOCK.x1, DOCK.h, DOCK.z1, 'concrete', { color: [0.74, 0.72, 0.68] });
  B.box(DOCK.x0 - 0.02, DOCK.h - 0.08, DOCK.z0, DOCK.x0 + 0.06, DOCK.h + 0.005, DOCK.z1, 'metal', { color: [0.3, 0.3, 0.28], collide: false });
  for (const zc of [-34, -29.25, -22]) {
    for (const dz of [-1.1, 1.1]) B.add(bevelBox(0.12, 0.4, 0.25, 0.03), 'rubber', mat4([DOCK.x0 - 0.06, 0.85, zc + dz]), { worldUV: false, vcolor: true, color: [0.5, 0.5, 0.5] });
    // nivelador (chapa xadrez) e porta de enrolar fechada / entreaberta
    B.box(DOCK.x0 + 0.06, DOCK.h - 0.005, zc - 1.0, DOCK.x1, DOCK.h + 0.01, zc + 1.0, 'chrome', { color: [0.42, 0.4, 0.37], collide: false });
    const half = zc === -22;
    const yb = half ? DOCK.h + 0.9 : DOCK.h;
    for (let y = DOCK.h + 3.0; y > yb; y -= 0.1) B.add(bevelBox(0.03, 0.095, 2.4, 0.01, { wear: 0.4 }), 'metal', mat4([ax0 - 0.04, y - 0.05, zc]), { worldUV: false, vcolor: true, color: vary(rng, [0.52, 0.55, 0.52], { fade: 0.3, dirt: 0.2 }), uvRand: true });
    if (half) B.box(ax0 - 0.02, DOCK.h, zc - 1.2, ax0 + 0.02, yb, zc + 1.2, 'black', { collide: false, color: [0.2, 0.2, 0.2], faces: { nx: 'black', px: null, py: null, ny: null, pz: null, nz: null } });
    // marquise metálica com mãos-francesas
    B.box(DOCK.x0 + 0.2, 5.0, zc - 1.6, ax0, 5.12, zc + 1.6, 'metal', { color: [0.45, 0.45, 0.42], collide: false });
    for (const dz of [-1.5, 1.5]) member(B, [ax0, 4.1, zc + dz], [DOCK.x0 + 0.5, 5.0, zc + dz], 0.06, 0.06, 'metal', [0.35, 0.35, 0.33]);
  }
  // escada da doca (ao norte) e rampa (ao sul)
  for (let k = 0; k < 6; k++) B.box(DOCK.x0, 0, DOCK.z1 + k * 0.28, DOCK.x1, DOCK.h - (k + 1) * 0.2 + 0.2, DOCK.z1 + (k + 1) * 0.28, 'concrete', { color: [0.7, 0.68, 0.64] });
  railing(W, [DOCK.x0 + 0.05, DOCK.z1], [DOCK.x0 + 0.05, DOCK.z1 + 1.7], 0.3, { color: [0.75, 0.6, 0.16] });
  for (let k = 0; k < 8; k++) {
    const za = DOCK.z0 - (k + 1) * 0.5, zb = DOCK.z0 - k * 0.5;
    B.box(DOCK.x0, 0, za, DOCK.x1, DOCK.h * (1 - (k + 1) / 8) + 0.0, zb, 'concrete', { color: [0.7, 0.68, 0.64] });
  }
  decal(B, 'streaks', [ax0 - 0.012, 4.5, -27], 'nx', [8, 4]);
  decal(B, 'graffiti', [ax0 - 0.013, DOCK.h + 3.6, -31.5], 'nx', [2.5, 1.0], graffitiRect(rng.int(0, 15)), 0);
  // carreta encostada na doca do meio
  trailer(W, DOCK.x0 - 0.1, -29.25);
  // contêineres a oeste (dois no chão, um empilhado torto, um aberto)
  container(W, -18.6, -33, Math.PI / 2, 0, [0.55, 0.18, 0.12]);
  container(W, -18.4, -24.5, Math.PI / 2 + 0.03, 0, [0.15, 0.32, 0.45], { open: true });
  container(W, -18.5, -32.2, Math.PI / 2 - 0.06, 2.6, [0.62, 0.55, 0.2]);
  container(W, -9.5, -40.4, 0.08, 0, [0.3, 0.38, 0.28]);
  // cobertura no meio do pátio: barreiras, carros queimados, paletes, tambores
  P.car(W, -6.5, -24, 0.5, { burnt: true, kind: 'sedan' });
  P.car(W, 3.5, -16, Math.PI / 2 + 0.2, { kind: 'van', tint: [0.72, 0.72, 0.69], damage: 0.6 });
  P.car(W, -1.5, -36.5, -0.3, { kind: 'hatch', tint: [0.55, 0.15, 0.12] });
  P.jersey(W, -1.2, -25.4, Math.PI / 2 + 0.1);
  P.jersey(W, 2.8, -22.2, 0.15);
  P.jersey(W, -11.5, -15.2, Math.PI / 2 - 0.05);
  P.sandbagWall(W, [[-14.5, -12.5], [-12.0, -11.8]], 4);
  for (const [x, z] of [[6.2, -39.5], [6.8, -40.1], [-13.8, -20.5], [8.5, -12.5], [9.0, -13.2]]) P.barrel(W, x, z, { fallen: rng.chance(0.25) });
  for (let i = 0; i < 4; i++) P.pallet(W, 4.5, -11.3, 0.2, i * 0.145);
  B.collider([3.85, 0, -12], [5.15, 0.6, -10.6], 'wood');
  P.crate(W, -14.2, -18.5, 0.4, 1);
  P.crate(W, -14.4, -18.0, 1.2, 0.85, { y: 0.5, stacked: true });
  P.dumpster(W, 15.5, -11.5, Math.PI / 2 + 0.05);
  P.clutter(W, 13.8, -12.6, 1.2, 8);
  P.tire(W, 7.5, -19, {});
  P.tire(W, 8.0, -19.4, {});
  P.tire(W, -3.5, -42, {});
  P.rubblePile(W, -16.5, -12.5, 2.0, 0.9, { tint: [0.9, 0.82, 0.74], brick: 0.6 });
  P.rubblePile(W, 18.5, -42, 2.2, 1.0, { tint: [0.8, 0.78, 0.72] });
  P.scatterBricks(W, 0, -13, 5, 26);
  P.trash(W, 0, -26, 16, 70);
  // postes de luz do pátio (apagados)
  for (const [x, z] of [[-20.8, -20], [-20.8, -38], [20.8, -42]]) P.utilityPole(W, x, z, Math.PI / 2, { h: 9, arms: 1 });
  // ── muro perimetral (painéis pré-moldados de 3 m, postes, concertina)
  const wall = (a, b) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(len / 3);
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
      const alongX = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
      const h = 2.9 + rng.range(-0.05, 0.05);
      if (rng.chance(0.06)) continue; // painel derrubado (vão)
      if (alongX) B.box(Math.min(p0[0], p1[0]) + 0.02, 0, p0[1] - 0.1, Math.max(p0[0], p1[0]) - 0.02, h, p0[1] + 0.1, 'concrete', { color: [0.72, 0.7, 0.66], uvRand: true });
      else B.box(p0[0] - 0.1, 0, Math.min(p0[1], p1[1]) + 0.02, p0[0] + 0.1, h, Math.max(p0[1], p1[1]) - 0.02, 'concrete', { color: [0.72, 0.7, 0.66], uvRand: true });
      B.box(p0[0] - 0.15, 0, p0[1] - 0.15, p0[0] + 0.15, 3.1, p0[1] + 0.15, 'concrete', { color: [0.66, 0.64, 0.6] });
    }
    // arame farpado no topo: 3 fios afastando-se para fora
    const len2 = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len2, nz = (b[0] - a[0]) / len2;
    for (let k = 0; k < 3; k++) {
      const o = 0.12 + k * 0.14;
      cable(B, [a[0] - nx * o, 2.95 + o * 0.9, a[1] - nz * o], [b[0] - nx * o, 2.95 + o * 0.9, b[1] - nz * o], 0.04, 0.004, 'chrome', Math.max(6, Math.round(len2 / 2)));
    }
  };
  // a concertina sobe para o topo do muro: desloca o grupo depois — aqui no chão do lado de fora
  wall([-4, YARD.z0], [YARD.x0, YARD.z0]);
  wall([4, YARD.z0], [YARD.x1, YARD.z0]);
  wall([YARD.x0, YARD.z0], [YARD.x0, 44]);
  wall([YARD.x1, YARD.z0], [YARD.x1, 44]);
  wall([YARD.x0, 44], [YARD.x1, 44]);
  // fecha o beco oeste na altura do pátio
  B.box(YARD.x0, 0, HALL.z0 - 0.1, HALL.x0, 2.9, HALL.z0 + 0.1, 'concrete', { color: [0.72, 0.7, 0.66] });
  // portão de correr (grade) fechado com corrente
  for (let x = -4; x <= 4.01; x += 0.15) B.box(x - 0.015, 0.05, YARD.z0 - 0.02, x + 0.015, 2.6, YARD.z0 + 0.02, 'metal', { color: [0.3, 0.3, 0.28], collide: false });
  for (const y of [0.15, 1.3, 2.55]) B.box(-4, y - 0.04, YARD.z0 - 0.04, 4, y + 0.04, YARD.z0 + 0.04, 'metal', { color: [0.3, 0.3, 0.28], collide: false });
  B.collider([-4, 0, YARD.z0 - 0.05], [4, 2.7, YARD.z0 + 0.05], 'metal', { blocksBullets: false });
  // beco leste: entulho, lixo, tambores
  P.clutter(W, 20, 4, 1.2, 8);
  P.rubblePile(W, 20.3, 22, 1.4, 0.6, {});
  P.dumpster(W, 20.4, 30, Math.PI / 2);
  P.barrel(W, 19.6, 14.5, {});
  P.barrel(W, 20.2, 15.2, { fallen: true });
  P.scatterBricks(W, 20, 10, 1.5, 12);
}

// ─── entorno ───────────────────────────────────────────────────────────
function surroundings(W) {
  const { B } = W;
  // chaminé de tijolo (marco visual) atrás do galpão
  const cx = -10, cz = 52;
  B.add(cached('chimney', () => new THREE.CylinderGeometry(1.4, 2.4, 42, 24, 6)), 'brick', mat4([cx, 21, cz]), { color: [0.85, 0.8, 0.76] });
  for (const y of [8, 18, 28, 38]) B.add(cached('chimring', () => new THREE.TorusGeometry(1, 0.08, 6, 24)), 'metal', mat4([cx, y, cz], [Math.PI / 2, 0, 0], [2.4 - (y / 42) * 1.0 + 0.05, 2.4 - (y / 42) * 1.0 + 0.05, 1]), { color: [0.3, 0.28, 0.26] });
  B.add(cyl(24, true), 'burnt', mat4([cx, 41.8, cz], [0, 0, 0], [1.45, 0.6, 1.45]), { color: [0.4, 0.38, 0.36] });
  // galpões vizinhos (silhuetas de serra) e prédios de bairro em volta
  for (const [x0, z0, w, d, h] of [[-60, 5, 28, 40, 11], [30, -20, 26, 50, 9], [-46, -70, 30, 22, 10]]) {
    B.box(x0, 0, z0, x0 + w, h, z0 + d, 'corrugated', { color: [0.55, 0.56, 0.54], collide: false, faces: { ny: null } });
    for (let z = z0; z < z0 + d; z += 4) {
      const g = new THREE.BufferGeometry();
      const p = [x0, h, z, x0 + w, h, z, x0 + w, h + 3, z + 3.5, x0, h, z, x0 + w, h + 3, z + 3.5, x0, h + 3, z + 3.5,
        x0, h + 3, z + 3.5, x0 + w, h + 3, z + 3.5, x0 + w, h, z + 4, x0, h + 3, z + 3.5, x0 + w, h, z + 4, x0, h, z + 4];
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.computeVertexNormals();
      B.add(g, 'corrugated', null, { color: [0.5, 0.5, 0.48] });
    }
  }
  building(W, { x0: -26, x1: 26, z0: 62, z1: 76, floors: 5, faces: ['nz'], tint: TINTS.grey, shop: false, cond: 0.5, noCollide: true });
  building(W, { x0: -12, x1: 14, z0: -78, z1: -62, floors: 4, faces: ['pz'], tint: TINTS.sand, shop: true, cond: 0.6, noCollide: true });
  W.B.cast = false;
  W.B.noCastZone = true;
  skyline(W, { near: false });
  W.B.noCastZone = false;
  W.B.cast = true;
}

// ─── metadados do mapa ─────────────────────────────────────────────────
export const FACTORY = {
  id: 'factory',
  bounds: [[-22.5, -1, -44.5], [22.5, 24, 44.5]],
  spawnPoints: [
    { position: [1.5, 0, -40.5], yaw: Math.PI, pitch: 0 },
    { position: [-4.5, 0, -42], yaw: Math.PI + 0.3, pitch: 0 },
    { position: [9, 0, -41.5], yaw: Math.PI - 0.3, pitch: 0 },
    { position: [-6, 0, -12], yaw: Math.PI, pitch: 0 },
  ],
  enemySpawns: [
    { position: [-9, 0, 37.5], yaw: 0 },
    { position: [5, 0, 37], yaw: 0 },
    { position: [-13, 0, 33], yaw: 0 },
    { position: [-1.5, 0, 24], yaw: 0 },
    { position: [14.8, 0, 29.6], yaw: 0 },
    { position: [20, 0, 36], yaw: 0 },
    { position: [-12.5, 0, 16], yaw: 0 },
  ],
  shotPoses: {
    street: { position: [-2.2, 0, -43.3], yaw: Math.PI - 0.19, pitch: 0.09 },
    interior: { position: [-3.2, 0, 1.5], yaw: Math.PI - 0.12, pitch: 0.1 },
    viewmodel: { position: [-1.5, 0, -3], yaw: Math.PI + 0.25, pitch: -0.04 },
    ads: { position: [0, 0, -2], yaw: Math.PI, pitch: 0.0 },
    combat: { position: [0.5, 0, -6.5], yaw: Math.PI + 0.05, pitch: 0.0 },
    menu: { position: [-16.4, CAT.y, -4.5], yaw: Math.PI + 0.75, pitch: -0.12 },
  },
  // volumes de oclusão da luz indireta (galpão, escritórios térreo/mezanino)
  occlusion: [
    { min: [HALL.x0, -0.2, HALL.z0], max: [HALL.x1, HALL.ridge + 0.3, HALL.z1], k: 0.42 },
    { min: [OFFICE.x0, -0.2, OFFICE.z0], max: [OFFICE.x1, OFFICE.f1 - 0.3, OFFICE.z1], k: 0.3 },
    { min: [OFFICE.x0, OFFICE.f1 - 0.3, OFFICE.z0], max: [OFFICE.x1, OFFICE.f1 + OFFICE.h, OFFICE.z1], k: 0.45 },
    { min: [12, -0.2, -38], max: [22, 7.2, -16], k: 0.2 },
  ],
  // piso de ladrilho (W_FLOOR) dos escritórios + caminho gasto porta → mesa
  room: [OFFICE.x0 + 0.2, OFFICE.z0 + 0.2, OFFICE.x1, OFFICE.z1],
  path: [OFFICE.x0, 27.5, 14.0, 28.5],
  fires: [
    { x: -2.8, y: 0.88, z: 20.5, w: 0.5, h: 0.8, tongues: 4, embers: 18, light: 26, range: 9 },
    { x: -6.5, y: 0.35, z: -24, w: 1.4, d: 1.0, h: 1.4, tongues: 6, embers: 26, light: 0, smoke: 30, smokeH: 14 },
    { x: 18.5, y: 0.6, z: -42, w: 0.9, h: 0.9, tongues: 4, embers: 12 },
  ],
  smoke: [
    { x: -40, z: 80, h: 70, w: 16, seed: 0.21 },
    { x: 60, z: -30, h: 55, w: 12, seed: 0.64 },
    { x: -70, z: -60, h: 60, w: 14, seed: 0.37 },
  ],
};
