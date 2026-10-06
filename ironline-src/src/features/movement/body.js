import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { bootGeometries, bootTextures, soleTexture } from './boot.js';

/**
 * Corpo em primeira pessoa ("full body awareness"): quadril, pernas e botas
 * do próprio jogador, renderizados na cena do MUNDO (mesma luz, sombra e AO
 * que o resto). Aparecem ao olhar para baixo e, principalmente, no SLIDE —
 * a perna estendida à frente é o que vende o movimento.
 *
 * Tudo procedural: tubos com seção elíptica e dobras de tecido (calça),
 * joelheira, bolso cargo, bota de cano médio extrudada de um perfil lateral
 * com solado separado. Cada perna é uma cadeia de 2 ossos resolvida por IK
 * analítico (quadril → joelho → tornozelo, com vetor-polo para o joelho).
 *
 * Poses (alvos no espaço do corpo, -Z = frente): em pé, andando (ciclo
 * preso à fase de passo do controlador), agachado, deitado, no ar, mantle e
 * slide. A pose atual é misturada à anterior com amortecimento exponencial.
 */
const THIGH = 0.45;
const SHIN = 0.45;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// ─── texturas (tecido camuflado, trama, couro da bota) ──────────────────
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** fBm de value noise tileável, normalizado para [0,1]. */
function fbm(N, seed, period, octaves, gain = 0.55, stretch = 1) {
  const r = mulberry(seed);
  const out = new Float32Array(N * N);
  let amp = 1, p = period, sum = 0;
  for (let o = 0; o < octaves && p <= N; o++) {
    const px = p, py = Math.max(1, Math.round(p * stretch));
    const lat = new Float32Array(px * py);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < N; y++) {
      const fy = (y * py) / N, j = Math.floor(fy), ty = fade(fy - j);
      const r0 = (j % py) * px, r1 = ((j + 1) % py) * px;
      for (let x = 0; x < N; x++) {
        const fx = (x * px) / N, i = Math.floor(fx), tx = fade(fx - i);
        const i0 = i % px, i1 = (i + 1) % px;
        const a = lat[r0 + i0], b = lat[r0 + i1], c = lat[r1 + i0], d = lat[r1 + i1];
        const top = a + (b - a) * tx, bot = c + (d - c) * tx;
        out[y * N + x] += (top + (bot - top) * ty) * amp;
      }
    }
    sum += amp;
    amp *= gain;
    p *= 2;
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < out.length; i++) (lo = Math.min(lo, out[i])), (hi = Math.max(hi, out[i]));
  const k = 1 / Math.max(1e-6, hi - lo);
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) * k;
  return out;
}
function dataTex(d, N, srgb) {
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}
const g22 = (v) => Math.pow(clamp(v, 0, 1), 1 / 2.2) * 255;

/**
 * Tecido: camuflagem multi-terreno (mesma paleta das mangas da viewmodel,
 * para o uniforme casar), trama ripstop no normal map e desgaste claro.
 */
function fabricTextures() {
  const N = 512;
  const a = fbm(N, 808, 3, 6, 0.6);
  const b = fbm(N, 909, 4, 6, 0.6, 1.6);
  const c = fbm(N, 1010, 6, 5, 0.6);
  const e = fbm(N, 1111, 5, 5, 0.55);
  const grain = fbm(N, 1212, 128, 2, 0.5);
  const wear = fbm(N, 77, 8, 5, 0.6);
  const pal = [
    [0.2, 0.175, 0.128],
    [0.105, 0.11, 0.07],
    [0.13, 0.09, 0.06],
    [0.045, 0.042, 0.035],
    [0.27, 0.25, 0.19],
  ];
  const col = new Uint8Array(N * N * 4);
  const nrm = new Uint8Array(N * N * 4);
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      // ripstop: trama fina + grade a cada 16 px
      const wx = Math.sin((x / N) * TAU * 128), wy = Math.sin((y / N) * TAU * 128);
      const grid = (x % 16 === 0 || y % 16 === 0) ? 0.6 : 0;
      h[i] = 0.5 + 0.18 * (wx * 0.5 + 0.5) * (wy > 0 ? 1 : 0.6) + 0.12 * (wy * 0.5 + 0.5) * (wx > 0 ? 0.6 : 1) + grid * 0.25 + (grain[i] - 0.5) * 0.25;
    }
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = y * N + x;
      let p = pal[0];
      if (a[i] > 0.56) p = pal[1];
      if (b[i] > 0.6) p = pal[2];
      if (c[i] > 0.47 && c[i] < 0.5) p = pal[3];
      if (e[i] > 0.7) p = pal[4];
      const g = (0.9 + grain[i] * 0.18) * (0.94 + 0.06 * h[i]);
      // poeira/desgaste: clareia e dessatura em manchas largas
      const w = clamp((wear[i] - 0.62) * 3, 0, 1) * 0.45;
      const dust = [0.3, 0.28, 0.24];
      col[i * 4] = g22(p[0] * g * (1 - w) + dust[0] * w);
      col[i * 4 + 1] = g22(p[1] * g * (1 - w) + dust[1] * w);
      col[i * 4 + 2] = g22(p[2] * g * (1 - w) + dust[2] * w);
      col[i * 4 + 3] = 255;
      const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)];
      const hy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x];
      const s = 2.2;
      const nx = -hx * s, ny = -hy * s, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nrm[i * 4] = (nx / l * 0.5 + 0.5) * 255;
      nrm[i * 4 + 1] = (ny / l * 0.5 + 0.5) * 255;
      nrm[i * 4 + 2] = (nz / l * 0.5 + 0.5) * 255;
      nrm[i * 4 + 3] = 255;
    }
  }
  return { map: dataTex(col, N, true), normalMap: dataTex(nrm, N, false) };
}

// ─── geometria ──────────────────────────────────────────────────────────
function hash(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Tubo ao longo de +Y (0 → L), seção elíptica, frente em -Z. `prof(t)` →
 * { rx, rz, oz } (raios e deslocamento do centro p/ trás, ex.: panturrilha);
 * `folds` = dobras de tecido (bandas perto das juntas). Pontas fechadas.
 * A costura de UV fica atrás (+Z), onde quase nunca se olha.
 */
function tubeGeometry(L, prof, { rings = 18, seg = 20, folds = 0, seed = 1, uvLen = 1 } = {}) {
  const pos = [], uv = [], idx = [];
  const ph = [hash(seed) * TAU, hash(seed + 1) * TAU, hash(seed + 2) * TAU];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const p = prof(t);
    for (let s = 0; s <= seg; s++) {
      const u = s / seg;
      const th = Math.PI / 2 + u * TAU; // começa atrás (+Z)
      // dobras: bandas horizontais onduladas, mais fortes nas pontas (juntas)
      const band = Math.pow(Math.abs(t - 0.5) * 2, 2.2);
      const f = folds * (Math.sin(t * 38 + Math.sin(th * 2 + ph[0]) * 1.6 + ph[1]) * 0.6 + Math.sin(th * 3 + t * 9 + ph[2]) * 0.4) * (0.25 + band);
      const k = 1 + f;
      pos.push(Math.cos(th) * p.rx * k, t * L, Math.sin(th) * p.rz * k + (p.oz || 0));
      uv.push(u * 1.0, t * uvLen);
    }
  }
  const row = seg + 1;
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * row + s, b = a + row;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // tampas
  for (const [r, y, flip] of [[0, 0, true], [rings, L, false]]) {
    const c = pos.length / 3;
    const p = prof(r / rings);
    pos.push(0, y, p.oz || 0);
    uv.push(0.5, (r / rings) * uvLen);
    for (let s = 0; s < seg; s++) {
      const a = r * row + s;
      if (flip) idx.push(c, a + 1, a);
      else idx.push(c, a, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ─── IK e poses ─────────────────────────────────────────────────────────
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();

/** IK de 2 ossos: preenche `knee` e corrige `ankle` se fora de alcance. */
function solveLeg(hip, ankle, pole, knee) {
  _a.subVectors(ankle, hip);
  let d = _a.length();
  const maxD = THIGH + SHIN - 0.004;
  if (d > maxD) {
    _a.multiplyScalar(maxD / d);
    ankle.copy(hip).add(_a);
    d = maxD;
  }
  d = Math.max(d, 0.12);
  _a.normalize();
  const a = (THIGH * THIGH - SHIN * SHIN + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, THIGH * THIGH - a * a));
  _b.copy(pole).addScaledVector(_a, -pole.dot(_a));
  if (_b.lengthSq() < 1e-6) _b.set(0, 0, -1);
  _b.normalize();
  knee.copy(hip).addScaledVector(_a, a).addScaledVector(_b, h);
  return _b; // direção para onde o joelho aponta
}

/** Matriz de um segmento: Y = de→para, frente (-Z) ≈ `front`. */
function segMatrix(out, from, to, front) {
  _y.subVectors(to, from).normalize();
  _z.copy(front).addScaledVector(_y, -front.dot(_y));
  if (_z.lengthSq() < 1e-6) _z.set(0, 0, -1);
  _z.normalize().negate();
  _x.crossVectors(_y, _z);
  return out.makeBasis(_x, _y, _z).setPosition(from);
}

/** Pose = alvos no espaço do corpo, para misturar. */
function makePose() {
  return {
    pelvis: new THREE.Vector3(0, 0.95, 0.1),
    pelvisPitch: 0, // inclina para trás no slide
    L: { ankle: new THREE.Vector3(), pole: new THREE.Vector3(0, 0, -1), toe: 0, roll: 0 },
    R: { ankle: new THREE.Vector3(), pole: new THREE.Vector3(0, 0, -1), toe: 0, roll: 0 },
  };
}
function lerpPose(out, target, k) {
  out.pelvis.lerp(target.pelvis, k);
  out.pelvisPitch += (target.pelvisPitch - out.pelvisPitch) * k;
  for (const s of ['L', 'R']) {
    out[s].ankle.lerp(target[s].ankle, k);
    out[s].pole.lerp(target[s].pole, k).normalize();
    out[s].toe += (target[s].toe - out[s].toe) * k;
    out[s].roll += (target[s].roll - out[s].roll) * k;
  }
}

export class Body {
  constructor(ctx, ctrl) {
    this.ctx = ctx;
    this.ctrl = ctrl;
    this.root = new THREE.Group();
    this.root.name = 'player-body';
    this.root.userData.noSkyOcclusion = true;
    this.root.userData.noSunView = true;
    this.hideU = { value: 0 };
    this.cur = makePose();
    this.tgt = makePose();
    this.first = true;
    this.yaw = 0;

    const fab = fabricTextures();
    const fabric = new THREE.MeshStandardMaterial({ map: fab.map, normalMap: fab.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, metalness: 0 });
    fabric.map.repeat.set(1, 1);
    const bt = bootTextures();
    const boot = new THREE.MeshStandardMaterial({ map: bt.map, normalMap: bt.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: bt.roughnessMap, roughness: 1, metalness: 0 });
    const rubber = new THREE.MeshStandardMaterial({ map: soleTexture(), roughness: 0.93, metalness: 0 });
    const lace = new THREE.MeshStandardMaterial({ color: 0x2a2419, roughness: 0.9, metalness: 0 });
    // joelheira: capa de cordura verde-oliva (mesma trama do tecido), fosca
    // e empoeirada — nada de calota lisa/brilhante
    const pad = new THREE.MeshStandardMaterial({ color: 0x5a5644, normalMap: fab.normalMap, normalScale: new THREE.Vector2(1.4, 1.4), roughness: 0.86, metalness: 0.0 });
    const webbing = new THREE.MeshStandardMaterial({ color: 0x3a3a2c, roughness: 0.85 });
    this.mats = [fabric, boot, rubber, pad, webbing, lace];

    const thighG = tubeGeometry(
      THIGH + 0.04,
      (t) => ({ rx: 0.088 - 0.022 * t + 0.008 * Math.sin(Math.PI * t), rz: 0.094 - 0.028 * t + 0.01 * Math.sin(Math.PI * t), oz: 0.006 * Math.sin(Math.PI * t) }),
      { folds: 0.045, seed: 3, uvLen: 1.4 },
    );
    thighG.translate(0, -0.02, 0);
    // calça termina ~10 cm acima do tornozelo, "embolada" sobre o cano da
    // bota (o cadarço do cano fica à mostra, como numa bota real)
    const shinG = tubeGeometry(
      SHIN - 0.08,
      (t) => {
        const calf = Math.exp(-Math.pow((t - 0.3) / 0.2, 2));
        // barra da calça "embolada" sobre o cano da bota (flare no fim)
        const cuff = clamp((t - 0.78) / 0.14, 0, 1);
        const close = t > 0.97 ? (1 - (t - 0.97) / 0.03 * 0.25) : 1;
        return { rx: (0.06 + 0.008 * calf + 0.012 * cuff) * close, rz: (0.062 + 0.016 * calf + 0.012 * cuff) * close, oz: 0.012 * calf };
      },
      { folds: 0.05, seed: 7, uvLen: 1.4 },
    );
    shinG.translate(0, -0.02, 0);
    const padG = new THREE.SphereGeometry(1, 18, 12, 0, TAU, 0, Math.PI * 0.62);
    padG.rotateX(-Math.PI / 2); // calota virada para -Z (frente)
    padG.scale(0.064, 0.082, 0.042);
    const strapG = new THREE.TorusGeometry(0.067, 0.008, 6, 20);
    strapG.rotateX(Math.PI / 2);
    const kneeG = new THREE.SphereGeometry(1, 20, 14);
    kneeG.scale(0.068, 0.07, 0.07);
    const pocketG = new RoundedBoxGeometry(0.035, 0.17, 0.14, 2, 0.012);
    // quadril: elipsoide (sem quinas) + cinto como anel elíptico
    const pelvisG = new THREE.SphereGeometry(1, 24, 14);
    pelvisG.scale(0.175, 0.12, 0.125);
    const beltG = new THREE.TorusGeometry(1, 0.13, 6, 32);
    beltG.rotateX(Math.PI / 2);
    beltG.scale(0.18, 0.2, 0.13);
    const boots = bootGeometries();

    // fora das sondas de reflexo (CubeCamera): a sonda fica na altura dos
    // olhos e as próprias pernas a 30 cm dominariam o reflexo da arma
    for (const m of this.mats) {
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uHideBody = this.hideU;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uHideBody;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nif (uHideBody > 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);');
      };
    }
    const onBefore = (r, sc, cam) => {
      this.hideU.value = cam.parent && cam.parent.isCubeCamera ? 1 : 0;
    };
    const mk = (g, m, name) => {
      const o = new THREE.Mesh(g, m);
      o.onBeforeRender = onBefore;
      o.name = name;
      o.matrixAutoUpdate = false;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // matriz é escrita à mão
      this.root.add(o);
      return o;
    };
    this.pelvis = mk(pelvisG, fabric, 'pelvis');
    this.belt = mk(beltG, webbing, 'belt');
    this.legs = {};
    for (const side of ['L', 'R']) {
      this.legs[side] = {
        thigh: mk(thighG, fabric, 'thigh' + side),
        shin: mk(shinG, fabric, 'shin' + side),
        pad: mk(padG, pad, 'pad' + side),
        strap: mk(strapG, webbing, 'strap' + side),
        pocket: mk(pocketG, fabric, 'pocket' + side),
        // articulação do joelho: esconde as tampas dos tubos coxa/canela
        kneeBall: mk(kneeG, fabric, 'knee' + side),
        boot: mk(boots.upper, boot, 'boot' + side),
        sole: mk(boots.sole, rubber, 'sole' + side),
        laces: mk(boots.laces, lace, 'laces' + side),
        hip: new THREE.Vector3(),
        knee: new THREE.Vector3(),
        ankle: new THREE.Vector3(),
      };
    }
    // sombra do tronco/cabeça/braços/arma: só no mapa de sombra (não
    // desenha cor nem profundidade na vista), para o jogador projetar uma
    // silhueta inteira no chão em vez de "duas pernas soltas"
    const ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    this.mats.push(ghost);
    const mkGhost = (g, name) => {
      const o = new THREE.Mesh(g, ghost);
      o.name = name;
      o.matrixAutoUpdate = false;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false;
      o.userData.shadowOnly = true;
      this.root.add(o);
      return o;
    };
    const torsoG = new THREE.CapsuleGeometry(0.16, 0.36, 4, 12);
    torsoG.scale(1.15, 1, 0.72);
    this.torso = mkGhost(torsoG, 'shadow-torso');
    this.head = mkGhost(new THREE.SphereGeometry(0.115, 12, 8), 'shadow-head');
    const armG = new THREE.CapsuleGeometry(0.05, 0.42, 3, 8);
    this.armL = mkGhost(armG, 'shadow-armL');
    this.armR = mkGhost(armG, 'shadow-armR');
    this.gun = mkGhost(new THREE.BoxGeometry(0.06, 0.16, 0.8), 'shadow-gun');
    ctx.scene.add(this.root);
  }

  /** Proxy de sombra do tronco: pelve → pescoço → cabeça na altura dos olhos. */
  updateShadowProxy(eye, lean) {
    const C = this.cur;
    const neck = _c.set(lean * 0.25, eye - 0.2, 0.05);
    _a.copy(C.pelvis).add(_b.set(0, 0.05, 0));
    segMatrix(this.torso.matrix, _a, neck, _x.set(0, 0, -1));
    // a cápsula é centrada: leva o centro para o meio do segmento
    const len = _a.distanceTo(neck);
    this.torso.matrix.multiply(_m2.makeTranslation(0, len * 0.5, 0));
    this.head.matrix.makeTranslation(lean * 0.36, eye + 0.02, 0.06);
    // braços: ombros → mãos na arma (à frente do peito)
    const sh = (sg) => _a.set(sg * 0.19 + lean * 0.22, eye - 0.27, 0.06);
    const hand = (sg) => _b.set(sg > 0 ? 0.13 : -0.02, eye - 0.38, sg > 0 ? -0.18 : -0.45);
    for (const [arm, sg] of [[this.armL, -1], [this.armR, 1]]) {
      const A = sh(sg).clone(), B = hand(sg).clone();
      segMatrix(arm.matrix, A, B, _x.set(0, -1, 0));
      arm.matrix.multiply(_m2.makeTranslation(0, A.distanceTo(B) * 0.5, 0));
    }
    this.gun.matrix.makeTranslation(0.08 + lean * 0.2, eye - 0.33, -0.3);
  }

  /** Alvos da pose para o estado atual do controlador (ou do demo). */
  computeTarget(st, dt) {
    const P = this.tgt;
    const { stance, sliding, grounded, speed, phase, mantle, moveX, moveZ, slideT } = st;
    const kick = st.kick || 0;
    const side = (s) => (s === 'L' ? -1 : 1);
    if (sliding) {
      // recostado para trás: pelve à frente da coluna da câmera, perna
      // esquerda estendida (o que se vê), direita dobrada por baixo
      const sv = clamp(speed / 8, 0.5, 1);
      // Geometria pensada a partir da câmera (olhos a 0.9 m, olhando ~15°
      // para baixo): a pelve fica À FRENTE da coluna da cabeça (tronco
      // recostado), a perna esquerda sai em diagonal para a esquerda-frente
      // com o joelho levemente dobrado — no quadro ela entra pelo centro-baixo
      // e termina na bota (bico para cima, cadarço virado para a câmera) no
      // terço esquerdo, longe da arma (direita). A direita vai dobrada por
      // baixo, joelho aberto para fora: fica fora do quadro / sob a arma.
      P.pelvis.set(-0.04, 0.2, -0.24);
      P.pelvisPitch = 0.9;
      const chatter = 0.008 * Math.sin(slideT * 43) * sv;
      // quase esticada (joelho sobe ~6 cm e abre para fora): a canela fica
      // de lado para a câmera em vez de escondida atrás do joelho
      // slide kick: a perna estendida dá um coice para a frente e para cima
      // (sola virada para o alvo) e volta — envelope `kick` 0..1..0
      P.L.ankle.set(-0.44 + 0.2 * kick, 0.125 + chatter + 0.42 * kick, -1.1 - 0.04 * sv - 0.32 * kick);
      P.L.pole.set(-0.55, 1, 0);
      P.L.toe = 0.78 + 0.5 * kick; // bico para cima, calcanhar raspando
      P.L.roll = -0.18 * (1 - kick);
      P.R.ankle.set(0.13, 0.06, -0.44);
      P.R.pole.set(1, -0.2, -0.2);
      P.R.toe = 0.1;
      P.R.roll = 1.2;
      return;
    }
    if (st.hang) {
      // pendurado na borda: pernas soltas, joelhos levemente dobrados
      P.pelvis.set(0, 0.95, 0.06);
      P.pelvisPitch = 0.08;
      for (const s of ['L', 'R']) {
        P[s].ankle.set(side(s) * 0.11, 0.1, 0.12 + (s === 'L' ? 0.05 : -0.02));
        P[s].pole.set(side(s) * 0.1, 0, -1);
        P[s].toe = -0.55;
        P[s].roll = 0;
      }
      return;
    }
    if (mantle) {
      P.pelvis.set(0, 0.85, 0.05);
      P.pelvisPitch = -0.2;
      for (const s of ['L', 'R']) {
        P[s].ankle.set(side(s) * 0.13, 0.42 + (s === 'L' ? 0.1 : 0), -0.1);
        P[s].pole.set(side(s) * 0.2, 0.3, -1);
        P[s].toe = 0.2;
        P[s].roll = 0;
      }
      return;
    }
    if (stance === 'prone') {
      P.pelvis.set(0, 0.16, 0.75);
      P.pelvisPitch = -1.45;
      for (const s of ['L', 'R']) {
        P[s].ankle.set(side(s) * 0.2, 0.12, 1.55);
        P[s].pole.set(side(s) * 0.3, -1, 0);
        P[s].toe = -1.4;
        P[s].roll = 0;
      }
      return;
    }
    if (!grounded) {
      P.pelvis.set(0, 0.95, 0.1);
      P.pelvisPitch = 0;
      P.L.ankle.set(-0.12, 0.3, -0.12);
      P.R.ankle.set(0.12, 0.42, 0.18);
      for (const s of ['L', 'R']) {
        P[s].pole.set(side(s) * 0.15, 0, -1);
        P[s].toe = -0.25;
        P[s].roll = 0;
      }
      return;
    }
    const crouch = stance === 'crouch';
    P.pelvis.set(0, crouch ? 0.58 : 0.95, crouch ? 0.16 : 0.1);
    P.pelvisPitch = crouch ? -0.35 : 0;
    // ciclo de marcha: 1 unidade de fase = 1 passo (pé no chão)
    const moving = speed > 0.35;
    const stride = moving ? clamp(speed * 0.13, 0.16, 0.62) * (crouch ? 0.7 : 1) : 0;
    const lift = moving ? clamp(0.05 + speed * 0.018, 0.05, 0.2) : 0;
    for (const s of ['L', 'R']) {
      const u = ((phase * 0.5 + (s === 'L' ? 0 : 0.5)) % 1 + 1) % 1;
      // apoio (0..0.6): o pé volta da frente para trás; balanço: avança
      let fwd, up = 0;
      if (u < 0.6) fwd = 0.5 - u / 0.6;
      else {
        const w = (u - 0.6) / 0.4;
        fwd = -0.5 + (1 - Math.cos(Math.PI * w)) * 0.5;
        up = Math.sin(Math.PI * w);
      }
      const bx = side(s) * (crouch ? 0.17 : 0.12);
      const bz = crouch ? (s === 'L' ? -0.12 : 0.18) : 0.02;
      P[s].ankle.set(bx + moveX * fwd * stride, 0.095 + up * lift + (crouch && s === 'R' ? 0.05 : 0), bz + moveZ * fwd * stride);
      P[s].pole.set(side(s) * (crouch ? 0.45 : 0.12), 0, -1);
      P[s].toe = up * -0.35 + (u < 0.15 ? 0.25 * (1 - u / 0.15) : 0);
      P[s].roll = 0;
    }
  }

  /**
   * @param st estado { stance, sliding, grounded, speed, phase, mantle,
   *           moveX, moveZ (direção do movimento no espaço do corpo), slideT }
   * @param pos posição dos pés (mundo), @param yaw guinada do corpo
   */
  update(dt, st, pos, yaw, visible = true) {
    this.root.visible = visible;
    if (!visible) return;
    this.computeTarget(st, dt);
    const k = this.first ? 1 : 1 - Math.exp(-dt * (st.sliding ? 14 : 11));
    this.first = false;
    lerpPose(this.cur, this.tgt, k);
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);

    const C = this.cur;
    // pelve: inclinada em X (pitch) em torno do próprio centro
    _m.makeRotationX(C.pelvisPitch).setPosition(C.pelvis);
    this.pelvis.matrix.copy(_m);
    this.belt.matrix.copy(_m).multiply(_m2.makeTranslation(0, 0.065, 0));
    for (const s of ['L', 'R']) {
      const leg = this.legs[s];
      const sg = s === 'L' ? -1 : 1;
      // quadril no canto da pelve (gira junto com ela)
      leg.hip.set(sg * 0.1, -0.06, 0.0).applyMatrix4(_m);
      leg.ankle.copy(C[s].ankle);
      const kneeDir = solveLeg(leg.hip, leg.ankle, C[s].pole, leg.knee).clone();
      segMatrix(leg.thigh.matrix, leg.hip, leg.knee, kneeDir);
      // canela: "frente" = direção do joelho (joelheira para fora da dobra)
      segMatrix(leg.shin.matrix, leg.knee, leg.ankle, kneeDir);
      leg.kneeBall.matrix.copy(leg.shin.matrix).setPosition(leg.knee);
      // joelheira/tira na frente do joelho, alinhadas à canela
      leg.pad.matrix.copy(leg.shin.matrix).multiply(_m2.makeTranslation(0, 0.035, -0.058));
      leg.strap.matrix.copy(leg.shin.matrix).multiply(_m2.makeTranslation(0, 0.12, 0.004));
      // bolso cargo: face externa da coxa
      leg.pocket.matrix.copy(leg.thigh.matrix);
      _c.lerpVectors(leg.hip, leg.knee, 0.45);
      _c.x += sg * 0.085;
      leg.pocket.matrix.setPosition(_c);
      // bota: frente = frente do corpo girada pelo "toe" (bico p/ cima) e
      // pelo roll (pé deitado de lado no slide)
      _m.makeRotationY(-sg * 0.12 + C[s].roll * sg * 0.3);
      _m2.makeRotationX(C[s].toe);
      _m.multiply(_m2);
      _m2.makeRotationZ(C[s].roll * sg);
      _m.multiply(_m2).setPosition(leg.ankle);
      leg.boot.matrix.copy(_m);
      leg.sole.matrix.copy(_m);
      leg.laces.matrix.copy(_m);
      // recalcula a pelve para a próxima perna
      _m.makeRotationX(C.pelvisPitch).setPosition(C.pelvis);
    }
    this.updateShadowProxy(st.eye ?? 1.62, st.lean ?? 0);
  }

  /** Pontos de contato com o chão (mundo) — para poeira do slide. */
  contactPoints(out) {
    for (const s of ['L', 'R']) {
      const leg = this.legs[s];
      const p = (out[s] = out[s] || new THREE.Vector3());
      p.copy(leg.ankle).applyMatrix4(this.root.matrixWorld);
    }
    return out;
  }

  dispose() {
    this.ctx.scene.remove(this.root);
    this.root.traverse((o) => o.geometry?.dispose());
    for (const m of this.mats) {
      m.map?.dispose();
      m.normalMap?.dispose();
      m.roughnessMap?.dispose();
      m.dispose();
    }
  }
}

