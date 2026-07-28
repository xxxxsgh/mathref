import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Modelo da nave, gerado por código.
 *
 * Por que procedural em vez de um .glb: zero asset pra carregar, zero pipeline
 * de modelagem, e o formato fica legível e ajustável direto aqui. Para uma
 * nave low-poly de linhas duras — que é exatamente a estética de ficção
 * científica dos anos 70 que queremos — primitivas combinadas dão conta.
 *
 * A geometria é MESCLADA num único BufferGeometry com grupos de material. Sem
 * isso seriam ~10 draw calls por nave; com isso são 3 (um por material). Numa
 * nave só não faria diferença, mas a Fase 2 vai ter dezenas de caças em tela.
 *
 * Convenção de orientação: a nave aponta pra -Z (a frente da câmera do Three).
 * Toda primitiva é construída no eixo natural dela e rotacionada pra cá.
 */

const MAT_HULL = 0;
const MAT_ACCENT = 1;
const MAT_DARK = 2;

/**
 * Espelha uma geometria no eixo X, in-place.
 *
 * Escalar por -1 inverte a ORIENTAÇÃO dos triângulos: o que era sentido
 * anti-horário passa a horário, e o back-face culling descarta exatamente as
 * faces que deveriam aparecer (a peça fica com buracos ou "pelo avesso").
 * Por isso, além de escalar, invertemos a ordem dos índices de cada triângulo
 * e recalculamos as normais.
 *
 * Isso permite modelar só o lado direito da nave e derivar o esquerdo, em vez
 * de duplicar todas as coordenadas na mão.
 */
function mirrorX(geo) {
  geo.scale(-1, 1, 1);
  const idx = geo.getIndex();
  if (idx) {
    const a = idx.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    idx.needsUpdate = true;
  } else {
    // Geometria não indexada: troca o 2º e o 3º vértice de cada triângulo.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i += 3) {
      for (const attr of Object.values(geo.attributes)) {
        const n = attr.itemSize;
        for (let k = 0; k < n; k++) {
          const b = attr.array[(i + 1) * n + k];
          attr.array[(i + 1) * n + k] = attr.array[(i + 2) * n + k];
          attr.array[(i + 2) * n + k] = b;
        }
        attr.needsUpdate = true;
      }
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** @returns {{ group: THREE.Group, nozzles: THREE.Vector3[], dispose: () => void }} */
export function createShip() {
  /** @type {THREE.BufferGeometry[]} */
  const parts = [];
  /** @type {number[]} */
  const matIndex = [];

  const push = (geo, mat) => { parts.push(geo); matIndex.push(mat); };

  // ── Fuselagem ──────────────────────────────────────────────────────────
  // Cone truncado: raio pequeno na frente, maior atrás. CylinderGeometry nasce
  // no eixo Y, então rotacionamos -90° em X pra deitar no eixo Z.
  const body = new THREE.CylinderGeometry(0.42, 0.95, 4.6, 8, 1, false);
  body.rotateX(-Math.PI / 2);
  body.translate(0, 0, 0.2);
  push(body, MAT_HULL);

  // Bico. Cone fechado à frente.
  const nose = new THREE.ConeGeometry(0.42, 1.9, 8);
  nose.rotateX(-Math.PI / 2);
  nose.translate(0, 0, -3.05);
  push(nose, MAT_ACCENT);

  // ── Cabine ─────────────────────────────────────────────────────────────
  // Esfera achatada e alongada, elevada acima da fuselagem pra ler como
  // bolha de cockpit. Material escuro = vidro.
  const canopy = new THREE.SphereGeometry(0.5, 10, 7);
  canopy.scale(1.0, 0.72, 2.1);
  canopy.translate(0, 0.46, -1.15);
  push(canopy, MAT_DARK);

  // Carenagem clara sob a bolha, pra ela não parecer colada na fuselagem.
  const canopyBase = new THREE.SphereGeometry(0.56, 10, 6);
  canopyBase.scale(1.05, 0.42, 2.3);
  canopyBase.translate(0, 0.2, -1.0);
  push(canopyBase, MAT_HULL);

  // ── Asas ───────────────────────────────────────────────────────────────
  // Asa em delta. A caixa é construída com a raiz em x=0 e a ponta em
  // x=+span, para que o enflechamento possa depender da distância à
  // fuselagem. (A primeira versão usava |x| numa caixa centrada na origem,
  // o que enflechava os DOIS lados da asa e produzia uma prancha simétrica.)
  const span = 3.1;
  const rootChord = 3.0;
  for (const side of [1, -1]) {
    const wing = new THREE.BoxGeometry(span, 0.2, rootChord, 1, 1, 1);
    wing.translate(span / 2, 0, 0);   // raiz em x=0
    const p = wing.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getX(i) / span;          // 0 na raiz, 1 na ponta
      const z = p.getZ(i);
      // Enflechamento: a ponta recua.
      // Afilamento: a corda encolhe (o vértice traseiro anda pra frente).
      const taper = 1 - t * 0.62;
      p.setZ(i, z * taper + t * 1.55);
      p.setY(i, p.getY(i) * (1 - t * 0.55));   // afina em espessura
    }
    p.needsUpdate = true;
    wing.computeVertexNormals();
    wing.translate(0, -0.06, 0.55);
    if (side < 0) mirrorX(wing);
    push(wing, MAT_HULL);

    // Winglet na ponta, inclinado pra fora. Pequeno de propósito: ele existe
    // pra quebrar a silhueta e dar leitura de roll, não pra chamar atenção.
    const winglet = new THREE.BoxGeometry(0.13, 0.62, 0.9);
    winglet.rotateZ(-0.32);
    winglet.translate(span - 0.12, 0.3, 1.55);
    if (side < 0) mirrorX(winglet);
    push(winglet, MAT_ACCENT);

    // Nacela do motor sob a asa.
    const nacelle = new THREE.CylinderGeometry(0.32, 0.38, 2.3, 8);
    nacelle.rotateX(-Math.PI / 2);
    nacelle.translate(1.45, -0.2, 1.3);
    if (side < 0) mirrorX(nacelle);
    push(nacelle, MAT_DARK);

    // Faixa de identificação na asa: um retalho fino de material acento sobre
    // a asa. Detalhe barato que dá a leitura de "veículo pintado".
    const stripe = new THREE.BoxGeometry(0.34, 0.06, 1.5);
    stripe.translate(0.95, 0.06, 0.5);
    if (side < 0) mirrorX(stripe);
    push(stripe, MAT_ACCENT);
  }

  // ── Estabilizador vertical ─────────────────────────────────────────────
  // Baixo e enflechado, na cor do casco. Na versão anterior ele era alto e
  // laranja e dominava a silhueta vista de trás — que é justamente a vista
  // que o jogador tem o tempo todo.
  const fin = new THREE.BoxGeometry(0.14, 0.85, 1.5);
  const fp = fin.attributes.position;
  for (let i = 0; i < fp.count; i++) {
    const t = Math.max(0, fp.getY(i) / 0.425);   // 0 na base, 1 no topo
    fp.setZ(i, fp.getZ(i) * (1 - t * 0.45) + t * 0.6);
  }
  fp.needsUpdate = true;
  fin.computeVertexNormals();
  fin.translate(0, 0.72, 1.9);
  push(fin, MAT_HULL);

  // ── Bloco de motor traseiro ────────────────────────────────────────────
  // A traseira nua era só a tampa octogonal do cilindro da fuselagem — um
  // disco chapado, e é exatamente o que o jogador olha o tempo todo. Um bloco
  // escuro recessado dá profundidade e um lugar pro brilho do motor morar.
  const engineBlock = new THREE.CylinderGeometry(0.78, 0.66, 0.9, 8);
  engineBlock.rotateX(-Math.PI / 2);
  engineBlock.translate(0, 0, 2.55);
  push(engineBlock, MAT_DARK);

  // Aro de contenção em volta do bloco, na cor de acento.
  const engineCollar = new THREE.CylinderGeometry(0.92, 0.88, 0.26, 8);
  engineCollar.rotateX(-Math.PI / 2);
  engineCollar.translate(0, 0, 2.28);
  push(engineCollar, MAT_ACCENT);

  // ── Anéis de bocal ─────────────────────────────────────────────────────
  const nozzlePositions = [
    new THREE.Vector3(-1.45, -0.2, 2.5),
    new THREE.Vector3(1.45, -0.2, 2.5),
    new THREE.Vector3(0, 0.0, 2.95),
  ];
  for (const n of nozzlePositions) {
    const ring = new THREE.CylinderGeometry(0.30, 0.36, 0.3, 8);
    ring.rotateX(-Math.PI / 2);
    ring.translate(n.x, n.y, n.z);
    push(ring, MAT_DARK);
  }

  // ── Mescla ─────────────────────────────────────────────────────────────
  // `true` no segundo argumento cria GRUPOS: cada geometria original vira uma
  // faixa de índices com seu próprio material. É isso que permite ter 3 cores
  // num único objeto e ainda assim um único buffer de vértices.
  const ordered = [];
  const groups = [];
  for (const target of [MAT_HULL, MAT_ACCENT, MAT_DARK]) {
    for (let i = 0; i < parts.length; i++) {
      if (matIndex[i] === target) ordered.push(parts[i]);
    }
    groups.push(ordered.length);
  }
  const merged = BufferGeometryUtils.mergeGeometries(ordered, true);
  // `mergeGeometries(_, true)` cria um grupo por geometria de entrada. Como
  // queremos um grupo por MATERIAL, reescrevemos os grupos agrupando as faixas.
  const rebuilt = [];
  let start = 0;
  let cursor = 0;
  for (let m = 0; m < 3; m++) {
    let count = 0;
    while (cursor < groups[m]) {
      count += merged.groups[cursor].count;
      cursor++;
    }
    rebuilt.push({ start, count, materialIndex: m });
    start += count;
  }
  merged.groups = rebuilt;
  merged.computeVertexNormals();

  const materials = [
    new THREE.MeshStandardMaterial({
      color: 0xe8e2d0, roughness: 0.42, metalness: 0.28, flatShading: true,
    }),
    new THREE.MeshStandardMaterial({
      color: 0xf2643c, roughness: 0.38, metalness: 0.15, flatShading: true,
    }),
    new THREE.MeshStandardMaterial({
      color: 0x232a44, roughness: 0.25, metalness: 0.7, flatShading: true,
    }),
  ];

  const mesh = new THREE.Mesh(merged, materials);
  mesh.castShadow = true;

  const group = new THREE.Group();
  group.add(mesh);

  // Geometrias de origem já foram copiadas para o buffer mesclado.
  for (const g of parts) g.dispose();

  return {
    group,
    mesh,
    nozzles: nozzlePositions,
    dispose: () => {
      merged.dispose();
      for (const m of materials) m.dispose();
    },
  };
}

/**
 * Caça inimigo.
 *
 * Silhueta deliberadamente OPOSTA à do jogador: onde a nave do jogador é
 * clara, arredondada e enflechada pra trás, o inimigo é escuro, anguloso e
 * tem as asas enflechadas pra FRENTE. Isso não é enfeite — num combate a
 * 300 u/s o jogador precisa distinguir amigo de inimigo por um borrão de
 * poucos pixels, e a silhueta é a única informação que sobrevive nessa
 * escala. Cor sozinha não basta (ela muda com a iluminação).
 *
 * @returns {{ group: THREE.Group, mesh: THREE.Mesh, nozzles: THREE.Vector3[], dispose: () => void }}
 */
export function createEnemyShip() {
  const parts = [];
  const matIndex = [];
  const push = (geo, mat) => { parts.push(geo); matIndex.push(mat); };

  const HULL = 0, GLOW = 1, DARK = 2;

  // Corpo: bloco hexagonal achatado, mais largo que alto.
  const core = new THREE.CylinderGeometry(1.05, 0.72, 3.2, 6);
  core.rotateX(-Math.PI / 2);
  core.rotateZ(Math.PI / 6);
  core.scale(1.35, 0.62, 1);
  push(core, HULL);

  // Bico chanfrado, curto e agressivo.
  const nose = new THREE.ConeGeometry(0.72, 1.5, 6);
  nose.rotateX(-Math.PI / 2);
  nose.rotateZ(Math.PI / 6);
  nose.scale(1.35, 0.62, 1);
  nose.translate(0, 0, -2.35);
  push(nose, DARK);

  // "Olho" central emissivo — dá um ponto focal e ajuda a mirar.
  const eye = new THREE.SphereGeometry(0.3, 8, 6);
  eye.scale(1.5, 0.5, 0.6);
  eye.translate(0, 0, -1.9);
  push(eye, GLOW);

  // Asas enflechadas PRA FRENTE.
  const span = 2.9;
  for (const side of [1, -1]) {
    const wing = new THREE.BoxGeometry(span, 0.22, 2.2, 1, 1, 1);
    wing.translate(span / 2, 0, 0);
    const p = wing.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const t = p.getX(i) / span;
      // Sinal NEGATIVO no deslocamento: a ponta avança em vez de recuar.
      p.setZ(i, p.getZ(i) * (1 - t * 0.5) - t * 1.35);
      p.setY(i, p.getY(i) * (1 - t * 0.5));
    }
    p.needsUpdate = true;
    wing.computeVertexNormals();
    wing.rotateZ(side > 0 ? -0.22 : 0);   // diedro negativo, ar de predador
    wing.translate(0.55, 0.05, 0.4);
    if (side < 0) mirrorX(wing);
    push(wing, HULL);

    const pod = new THREE.CylinderGeometry(0.26, 0.3, 1.5, 6);
    pod.rotateX(-Math.PI / 2);
    pod.translate(span * 0.78, -0.05, 0.9);
    if (side < 0) mirrorX(pod);
    push(pod, DARK);
  }

  const nozzles = [
    new THREE.Vector3(-0.62, 0, 1.75),
    new THREE.Vector3(0.62, 0, 1.75),
  ];
  for (const n of nozzles) {
    const ring = new THREE.CylinderGeometry(0.26, 0.3, 0.28, 6);
    ring.rotateX(-Math.PI / 2);
    ring.translate(n.x, n.y, n.z);
    push(ring, DARK);
  }

  const { merged, materials } = mergeByMaterial(parts, matIndex, [
    new THREE.MeshStandardMaterial({ color: 0x4a4258, roughness: 0.55, metalness: 0.4, flatShading: true }),
    new THREE.MeshStandardMaterial({
      color: 0x2a1420, emissive: 0xff5a2a, emissiveIntensity: 2.6,
      roughness: 0.4, flatShading: true,
    }),
    new THREE.MeshStandardMaterial({ color: 0x191722, roughness: 0.35, metalness: 0.65, flatShading: true }),
  ]);

  const mesh = new THREE.Mesh(merged, materials);
  const group = new THREE.Group();
  group.add(mesh);
  for (const g of parts) g.dispose();

  return {
    group, mesh, nozzles,
    dispose: () => { merged.dispose(); for (const m of materials) m.dispose(); },
  };
}

/**
 * Mescla geometrias agrupando-as por material.
 *
 * `mergeGeometries(_, true)` cria um grupo por geometria de ENTRADA. Nós
 * queremos um grupo por MATERIAL, senão um objeto de 15 peças vira 15 grupos
 * e portanto 15 draw calls — perdendo justamente o motivo de ter mesclado.
 * Por isso reordenamos as peças por material e reescrevemos os grupos.
 */
function mergeByMaterial(parts, matIndex, materials) {
  const ordered = [];
  const boundary = [];
  for (let m = 0; m < materials.length; m++) {
    for (let i = 0; i < parts.length; i++) {
      if (matIndex[i] === m) ordered.push(parts[i]);
    }
    boundary.push(ordered.length);
  }
  const merged = BufferGeometryUtils.mergeGeometries(ordered, true);
  const groups = [];
  let start = 0;
  let cursor = 0;
  for (let m = 0; m < materials.length; m++) {
    let count = 0;
    while (cursor < boundary[m]) { count += merged.groups[cursor].count; cursor++; }
    groups.push({ start, count, materialIndex: m });
    start += count;
  }
  merged.groups = groups;
  merged.computeVertexNormals();
  return { merged, materials };
}

/** Textura de brilho radial, gerada em canvas.
 *  Usada por chamas de motor, explosões e impactos. Um gradiente radial é
 *  pequeno demais pra justificar um arquivo de imagem, e gerando em código a
 *  gente controla a curva de queda exatamente. */
let _glowTexture = null;
export function getGlowTexture() {
  if (_glowTexture) return _glowTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // Núcleo branco saturado + queda rápida. A queda em ^2 é o que faz o
  // brilho parecer luz em vez de bolinha.
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  _glowTexture = new THREE.CanvasTexture(canvas);
  _glowTexture.colorSpace = THREE.SRGBColorSpace;
  return _glowTexture;
}
