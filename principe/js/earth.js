// A Terra: prólogo no deserto, a chegada do príncipe, a raposa, o poço e o fim.
import * as THREE from 'three';
import { fbm3, col, PAL, mesh, flat, toon, rng } from './style.js';
import * as $ from './props.js';
import { makePerson } from './prince.js';
import { P, dirLL, angleBetween, tangentTo, paint, scatter, carry, opening, tween, smoothstep, worldPos } from './kit.js';

const Y = new THREE.Vector3(0, 1, 0);
export const R_EARTH = 38;
export const E = {
  ARRIVE: dirLL(8, -30), SNAKE: dirLL(10, -22), FLOWER: dirLL(18, -12), MT: dirLL(32, -48),
  GARDEN: dirLL(36, 4), FOXMEET: dirLL(41, 15), MEADOW: dirLL(52, 32), FOX: dirLL(51, 38), WHEAT: dirLL(58, 50),
  CRASH: dirLL(-10, -60), WELL: dirLL(-18, -20), WALL: dirLL(-21, -15),
};

function randomAround(center, radius, r) {
  const t1 = new THREE.Vector3().crossVectors(Math.abs(center.y) < 0.9 ? Y : new THREE.Vector3(1, 0, 0), center).normalize();
  const t2 = new THREE.Vector3().crossVectors(center, t1);
  const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
  return center.clone().multiplyScalar(Math.cos(d)).addScaledVector(t1, Math.cos(a) * Math.sin(d)).addScaledVector(t2, Math.sin(a) * Math.sin(d)).normalize();
}

/** Monta a Terra inteira (um só mundo para todos os capítulos terrestres). */
export function buildEarth(g, { plane = true } = {}) {
  const W = g.world;
  const R = R_EARTH;
  const green = (n) => Math.max(smoothstep(0.42, 0.28, angleBetween(n, E.MEADOW)), smoothstep(0.24, 0.15, angleBetween(n, E.GARDEN)));
  const height = (n) => {
    const mt = angleBetween(n, E.MT);
    let h = 11 * Math.exp(-Math.pow(mt / 0.2, 2));
    if (mt < 0.4) h += (fbm3(n.x * 14, n.y * 14, n.z * 14) - 0.5) * 3 * smoothstep(0.4, 0.12, mt);
    const gr = green(n);
    const dune = (fbm3(n.x * 9 + 3, n.y * 9, n.z * 9) - 0.5) * 2.4 + Math.sin(n.x * 70 + n.z * 45) * 0.12;
    h += dune * (1 - gr) * (1 - smoothstep(0.34, 0.16, mt));
    h += gr * (fbm3(n.x * 5, n.y * 5, n.z * 5) - 0.5) * 0.7;
    // chão plano em volta do avião, do poço e do muro
    for (const k of [E.CRASH, E.WELL, E.WALL]) h *= 1 - 0.8 * smoothstep(0.08, 0.02, angleBetween(n, k));
    return h;
  };
  const sand = paint('#efd49e', '#dfbb82', '#f7e2b8', { scale: 7, seed: 2 });
  const grass = paint('#a3cc7c', '#8cba6a', '#b8d890', { scale: 9, seed: 4 });
  const rockA = col('#9c8a9c'), rockB = col('#b4a2ae');
  const wheat = col('#e8c65a');
  W.setPlanet({
    radius: R, seg: 220, outline: 0.12, height,
    color: (n) => {
      const mt = angleBetween(n, E.MT);
      let c = sand(n);
      const gr = green(n);
      if (gr > 0) c.lerp(grass(n), Math.round(gr * 3) / 3);
      if (angleBetween(n, E.WHEAT) < 0.11) c = wheat.clone().lerp(col('#d4a84a'), fbm3(n.x * 30, n.y * 30, n.z * 30) > 0.55 ? 0.5 : 0);
      const rk = smoothstep(0.3, 0.16, mt);
      if (rk > 0) c.lerp(fbm3(n.x * 20, n.y * 20, n.z * 20) > 0.5 ? rockA : rockB, Math.round(rk * 3) / 3);
      return c;
    },
  });

  const out = {};
  const key = Object.values(E);
  // pedras e arbustos secos pelo deserto
  scatter(W, 70, 101, (r) => $.rock(0.8 + r() * 2.2, 0xb8a080), key, 0.07);
  scatter(W, 90, 102, () => $.tuft(0xb0a070), key, 0.05);

  // o jardim de rosas (instanciado) e o muro baixo em volta
  const rr = rng(33);
  const roseN = [];
  for (let i = 0; i < 160; i++) roseN.push(randomAround(E.GARDEN, 0.14, rr));
  const dummy = new THREE.Object3D();
  const placeAt = (n, yaw, s, lift = 0) => {
    dummy.position.copy(n).multiplyScalar(W.ground(n) + lift);
    dummy.quaternion.setFromUnitVectors(Y, n).multiply(new THREE.Quaternion().setFromAxisAngle(Y, yaw));
    dummy.scale.setScalar(s);
  };
  const stemG = new THREE.CylinderGeometry(0.025, 0.035, 0.75, 5); stemG.translate(0, 0.375, 0);
  const bloomG = new THREE.IcosahedronGeometry(0.12, 1);
  const leafG = new THREE.SphereGeometry(0.17, 7, 5);
  const garden = new THREE.Group();
  garden.add($.instancedField(roseN.length, (i, d) => { placeAt(roseN[i], i, 1 + (i % 5) * 0.08); d.position.copy(dummy.position); d.quaternion.copy(dummy.quaternion); d.scale.copy(dummy.scale); }, [
    { geom: stemG, color: PAL.stem },
    { geom: leafG, color: 0x5f9a5c, y: 0.36 },
    { geom: bloomG, color: PAL.rose, y: 0.8 },
  ]));
  W.stage.add(garden);
  const gT1 = new THREE.Vector3().crossVectors(Y, E.GARDEN).normalize();
  const gT2 = new THREE.Vector3().crossVectors(E.GARDEN, gT1);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    if (a > Math.PI * 1.35 && a < Math.PI * 1.65) continue; // portão
    const d = 0.19;
    const n = E.GARDEN.clone().multiplyScalar(Math.cos(d)).addScaledVector(gT1, Math.cos(a) * Math.sin(d)).addScaledVector(gT2, Math.sin(a) * Math.sin(d)).normalize();
    const w = $.wall(3.2, 0.7);
    W.place(w, n, { face: E.GARDEN.clone().multiplyScalar(R) });
    w.rotateY(Math.PI / 2);
  }

  // prado, árvores e trigal
  const tuftG = new THREE.ConeGeometry(0.06, 0.4, 4); tuftG.translate(0, 0.2, 0);
  const gr2 = rng(44);
  const grassN = [];
  for (let i = 0; i < 380; i++) grassN.push(randomAround(E.MEADOW, 0.36, gr2));
  W.stage.add($.instancedField(grassN.length, (i, d) => { placeAt(grassN[i], i, 1 + (i % 3) * 0.3); d.position.copy(dummy.position); d.quaternion.copy(dummy.quaternion); d.scale.copy(dummy.scale); }, [{ geom: tuftG, color: 0x7aae5a }]));
  const wheatG = new THREE.ConeGeometry(0.05, 1.1, 4); wheatG.translate(0, 0.55, 0);
  const earG = new THREE.CapsuleGeometry(0.05, 0.16, 2, 5);
  const wr = rng(55);
  const wheatN = [];
  for (let i = 0; i < 1100; i++) wheatN.push(randomAround(E.WHEAT, 0.105, wr));
  const wheatF = $.instancedField(wheatN.length, (i, d) => { placeAt(wheatN[i], i * 1.7, 0.9 + (i % 4) * 0.08); d.position.copy(dummy.position); d.quaternion.copy(dummy.quaternion); d.scale.copy(dummy.scale); }, [
    { geom: wheatG, color: 0xd8b44a }, { geom: earG, color: 0xf0cc60, y: 1.05 },
  ]);
  // o vento no trigo
  const timeU = { value: 0 };
  wheatF.children.forEach((m) => {
    m.material = toon(m.material.color.getHex(), {}, true);
    m.material.onBeforeCompile = (s) => {
      s.uniforms.uTime = timeU;
      s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
        transformed.x += sin(uTime * 1.8 + ph) * (position.y + 0.6) * 0.16;`);
    };
    m.material.customProgramCacheKey = () => 'wheat';
  });
  W.stage.add(wheatF);
  W.hook((dt, t) => { timeU.value = t; });
  const tr = rng(66);
  for (let i = 0; i < 6; i++) {
    const n = randomAround(E.MEADOW, 0.32, tr);
    if (angleBetween(n, E.WHEAT) < 0.14 || angleBetween(n, E.FOX) < 0.08) continue;
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.2, 8), 0x8a6a4a);
    trunk.position.y = 1.1;
    const crown = mesh(new THREE.IcosahedronGeometry(1.3, 1), 0x6a9a5a);
    crown.position.y = 2.9;
    t.add(trunk, crown);
    W.place(t, n, { yaw: i });
    W.collider(n, 0.35);
  }

  // montanha: um marco de pedras no topo
  const cairn = new THREE.Group();
  for (let i = 0; i < 4; i++) { const s = $.rock(1.2 - i * 0.22, 0x8a7a8a); s.position.y = i * 0.28; cairn.add(s); }
  W.place(cairn, E.MT);
  out.cairn = cairn;

  // poço e muro
  out.well = W.place($.well(), E.WELL);
  W.collider(E.WELL, 0.95);
  out.wall = W.place($.wall(4.2, 1.05), E.WALL, { face: E.WELL.clone().multiplyScalar(R) });
  W.collider(E.WALL, 0.6);
  const wt = tangentTo(E.WALL, E.WELL);
  const side = new THREE.Vector3().crossVectors(E.WALL, wt);
  for (const s of [-1, 1]) W.collider(E.WALL.clone().addScaledVector(side, s * 1.5 / R).normalize(), 0.6);

  // avião e acampamento
  if (plane) {
    out.plane = W.place($.plane(), E.CRASH, { yaw: 0.8 });
    W.collider(E.CRASH, 2.1);
    out.toolboxN = dirLL(-8.2, -56.5);
    out.toolbox = W.place($.toolbox(), out.toolboxN, { yaw: 1 });
    out.blanketN = dirLL(-13.5, -57);
    out.blanket = W.place($.blanket(), out.blanketN, { yaw: 0.3 });
  }
  return out;
}

const SK = {
  boa: '<svg viewBox="0 0 120 70"><path d="M6 58 C 18 58 26 40 38 30 C 50 18 70 14 84 24 C 96 32 100 48 112 56 C 114 58 114 60 110 60 L 8 60 Z"/></svg>',
  sheep: (head, extra = '') => `<svg viewBox="0 0 120 80"><path d="M36 38 q-6 -10 4 -14 q2 -10 14 -8 q6 -8 16 -2 q10 -4 14 4 q10 2 8 12 q8 6 0 14 q2 10 -10 10 q-6 8 -16 2 q-8 6 -16 0 q-12 2 -12 -8 q-10 -4 -2 -10 z"/><path d="M48 60 v12 M60 62 v12 M74 62 v12 M86 60 v12"/>${head}${extra}</svg>`,
};
const SKETCHES = [
  { label: 'Desenho nº 1', svg: SK.boa },
  { label: 'Carneiro nº 1', svg: SK.sheep('<ellipse cx="27" cy="48" rx="9" ry="7"/><path d="M22 45 l3 3 M25 45 l-3 3"/>', '<path d="M18 58 q2 4 0 6"/>') },
  { label: 'Carneiro nº 2', svg: SK.sheep('<ellipse cx="27" cy="40" rx="9" ry="7"/><circle cx="24" cy="39" r="1"/>', '<path d="M24 34 c-10 -4 -8 -16 2 -14 c6 2 4 9 -1 8 M32 34 c2 -10 12 -10 12 -2 c0 5 -6 5 -6 1"/>') },
  { label: 'Carneiro nº 3', svg: SK.sheep('<ellipse cx="27" cy="40" rx="9" ry="7"/><path d="M22 39 h4"/>', '<path d="M24 47 l-2 10 l3 -2 l1 4 M104 40 v34 M104 40 q-6 -6 -10 0"/>') },
  { label: 'A caixa', svg: '<svg viewBox="0 0 120 80"><path d="M28 26 h56 v42 h-56 z M28 26 l12 -12 h56 l-12 12 M84 68 l12 -12 v-42"/><circle cx="44" cy="46" r="2.5"/><circle cx="56" cy="46" r="2.5"/><circle cx="68" cy="46" r="2.5"/></svg>' },
];

function makeAviator() {
  return makePerson({
    robe: false, coat: 0x8a5a3a, sleeves: 0x8a5a3a, legs: 0x6a6a78, hat: 'cap', hatColor: 0x6a4a3a, goggles: true,
    scale: 1.3, legLen: 0.5, bodyBot: 0.3, skin: 0xf2c9a8,
    decorate: (b) => {
      const sc = mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 16), 0xf4ead5, { outline: 0.012 });
      sc.rotation.x = Math.PI / 2;
      sc.position.y = b.neckY;
      b.body.add(sc);
    },
  });
}

/** Faz um boneco (não-avatar) seguir outro pela superfície. */
function follower(W, b, leader, { speed = 4.6, gap = 1.6 } = {}) {
  const st = { n: b.root.position.clone().normalize(), face: new THREE.Vector3(0, 0, 1) };
  let active = true;
  const h = W.hook((dt) => {
    if (!active) return;
    const L = leader();
    const tgt = L.clone().normalize();
    const before = st.n.clone();
    W.walkToward(st, tgt, speed, dt, gap);
    const moved = before.distanceTo(st.n) * R_EARTH / Math.max(dt, 1e-4);
    b.walkAmt = Math.min(1, moved / 4.3);
    b.setPose(W.surface(st.n), st.n, st.face);
  });
  return { st, stop() { active = false; b.walkAmt = 0; W.unhook(h); } };
}

// ═══════════════════════════ Prólogo ═══════════════════════════
export async function chPrologo(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('day');
  g.sound.play('desert');
  ui.setChapter('Prólogo');
  ui.setObjectives([]);
  const e = buildEarth(g, { plane: true });
  const av = makeAviator();
  W.setAvatar(av);
  W.prince.visible = false;
  W.ctrl.dist = 6.5;
  W.spawn(dirLL(-12, -54), E.CRASH);
  W.mode = 'walk';

  g.lock();
  await ui.fade(1, 10);
  await ui.card('Prólogo', 'O desenho número 1', '', 2600);
  await g.talk([
    ['', 'Quando eu tinha seis anos, vi num livro sobre a floresta virgem uma imagem magnífica: uma jiboia engolindo uma fera.'],
    ['', 'Pensei muito nas aventuras da selva e, com um lápis de cor, fiz o meu primeiro desenho. O meu desenho número 1 era assim:'],
  ]);
  await ui.sketch([SKETCHES[0]]);
  const seen = await g.ask('', 'Mostrei a minha obra-prima às pessoas grandes e perguntei se o desenho lhes dava medo. E você, o que vê?', ['Um chapéu.', 'Uma jiboia digerindo um elefante!']);
  await g.talk([
    seen === 0
      ? ['', '"Por que um chapéu daria medo?", responderam. As pessoas grandes nunca entendem nada sozinhas, e é cansativo para as crianças estar sempre explicando.']
      : ['', 'Finalmente alguém que entende! As pessoas grandes só enxergavam um chapéu. Elas nunca entendem nada sozinhas.'],
    ['', 'Elas me aconselharam a deixar de lado os desenhos de jiboias e a me dedicar à geografia, à história, ao cálculo e à gramática.'],
    ['', 'Escolhi então outra profissão: aprendi a pilotar aviões. E vivi sozinho, sem ninguém com quem conversar de verdade...'],
    ['', '...até uma pane no deserto do Saara, há seis anos.'],
  ]);
  ui.setChapter('Prólogo · O deserto do Saara');
  ui.fade(0, 1400);
  await g.wait(0.8);
  g.unlock();

  ui.setObjectives([{ id: 'motor', text: 'Examinar o motor do avião' }]);
  W.guide = E.CRASH;
  let step = 0;
  W.interact({
    at: e.plane, r: 3.2, label: () => (step === 0 ? 'Examinar o motor' : 'Consertar o motor'), hold: 0,
    when: () => step === 0,
    act: async () => {
      await g.talk([
        ['Aviador', 'Alguma coisa quebrou no motor. E não trouxe nem mecânico, nem passageiros...'],
        ['Aviador', 'Vou ter de consertar sozinho. É uma questão de vida ou morte: tenho água para apenas oito dias.'],
      ]);
      ui.check('motor');
      ui.addObjective({ id: 'tools', text: 'Pegar a caixa de ferramentas' });
      W.guide = e.toolboxN;
      step = 1;
    },
  });
  const tb = W.interact({
    at: e.toolbox, r: 1.6, label: 'Pegar as ferramentas', when: () => step === 1,
    act: () => {
      carry(W, e.toolbox, 'hand');
      W.removeInteract(tb);
      ui.check('tools');
      ui.addObjective({ id: 'fix', text: 'Consertar o motor (segure)' });
      W.guide = E.CRASH;
      step = 2;
    },
  });
  W.interact({
    at: e.plane, r: 3.2, label: 'Consertar o motor', hold: 2.6, pose: 'pull', when: () => step === 2,
    onHold: (p) => { if (Math.random() < 0.06) g.sound.sfx('creak'); },
    act: async () => {
      step = 3;
      ui.check('fix');
      e.toolbox.visible = false;
      await g.say('Aviador', 'Por hoje chega. O conserto é difícil... e o sol já está se pondo.');
      ui.hideDialog();
      W.setSky('dusk', 3);
      ui.addObjective({ id: 'sleep', text: 'Dormir sobre a areia' });
      W.guide = e.blanketN;
      step = 4;
    },
  });
  let slept = false;
  W.interact({ at: e.blanket, r: 1.6, label: 'Dormir', when: () => step === 4, act: () => { slept = true; step = 5; } });
  await g.until(() => slept);
  ui.check('sleep');
  W.guide = null;
  g.lock();
  av.pose = 'lie';
  W.setSky('night', 2.5);
  await g.wait(1.5);
  await ui.fade(1, 1400);
  await g.talk([
    ['', 'Na primeira noite, dormi sobre a areia, a mil milhas de qualquer terra habitada. Estava mais isolado que um náufrago numa jangada no meio do oceano.'],
    ['', 'Imaginem a minha surpresa quando, ao amanhecer, uma vozinha engraçada me acordou:'],
    ['Pequeno Príncipe', 'Por favor... desenha-me um carneiro!'],
  ]);
  W.setSky('dawn');
  av.pose = 'walk';
  // o príncipe aparece
  const pN = W.ctrl.n.clone().addScaledVector(tangentTo(W.ctrl.n, E.CRASH), 1.8 / R_EARTH).normalize();
  const pr = W.prince;
  pr.visible = true;
  W.addActor(pr);
  pr.setPose(W.surface(pN), pN, tangentTo(pN, W.ctrl.n));
  pr.resetScarf();
  W.ctrl.face.copy(tangentTo(W.ctrl.n, pN));
  W.snapCamera();
  await ui.fade(0, 1200);
  await g.talk([
    ['Aviador', 'Hã?!'],
    [P, 'Desenha-me um carneiro...'],
    ['', 'Dei um pulo, como se tivesse sido atingido por um raio. Esfreguei os olhos. E vi um homenzinho extraordinário, que me observava muito sério.'],
    ['', 'Ele não parecia perdido, nem morto de cansaço, nem de fome, nem de sede, nem de medo. Não parecia em nada uma criança perdida no meio do deserto.'],
    ['Aviador', 'Mas... o que fazes aqui?'],
    [P, 'Por favor... desenha-me um carneiro.'],
  ], { npc: pr, turn: false });
  g.unlock();
  ui.setObjectives([{ id: 'draw', text: 'Desenhar um carneiro' }]);
  let drawn = false;
  const di = W.interact({
    at: pr.root, r: 2.4, label: 'Abrir o caderno de desenhos',
    act: async () => {
      g.lock();
      W.focus(worldPos(pr));
      const off = new Set();
      const rej = [
        'Não! Não! Eu não quero um elefante dentro de uma jiboia. A jiboia é muito perigosa, e o elefante ocupa muito espaço. Onde eu moro é tudo muito pequeno. Preciso de um carneiro.',
        'Não! Este aqui já está muito doente. Faz outro.',
        'Olha só... isto não é um carneiro. É um bode. Tem chifres...',
        'Este é velho demais. Eu quero um carneiro que viva muito tempo.',
      ];
      for (;;) {
        const i = await ui.sketch(SKETCHES, off);
        if (i === 4) break;
        off.add(i);
        await g.say(P, rej[i]);
        if (off.size === 2) await g.say('', 'Já sem paciência, rabisquei qualquer coisa... uma caixa, com três furinhos.');
      }
      await g.talk([
        ['Aviador', 'Isto é a caixa. O carneiro que tu queres está aí dentro.'],
        () => { pr.pose = 'raise'; g.sound.sfx('done'); },
        [P, 'Era exatamente assim que eu queria! Achas que esse carneiro vai precisar de muito capim?'],
        ['Aviador', 'Por quê?'],
        [P, 'Porque onde eu moro é tudo tão pequeno...'],
        ['Aviador', 'Com certeza vai bastar. Eu te dei um carneiro bem pequenino.'],
        () => { pr.pose = 'bow'; },
        [P, 'Não tão pequeno assim... Olha! Ele adormeceu...'],
        () => { pr.pose = 'walk'; },
        ['', 'E foi assim que eu conheci o pequeno príncipe.'],
        ['Aviador', 'Então tu também vieste do céu? De que planeta tu és?'],
        [P, 'Ah... é engraçado. Tu também caíste do céu!'],
        ['', 'Levei muito tempo para entender de onde ele vinha. Ele nunca respondia às minhas perguntas. Mas, pouco a pouco, palavra por palavra, tudo se revelou.'],
        [P, 'Onde eu moro é muito pequeno... Queres que eu te conte?'],
      ], { npc: pr, turn: false });
      W.focus(null);
      g.unlock();
      drawn = true;
    },
  });
  await g.until(() => drawn);
  W.removeInteract(di);
  ui.check('draw');
  await ui.fade(1, 1200);
}

// ═══════════════════════════ VIII · A Terra ═══════════════════════════
export async function chTerra(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('day');
  g.sound.play('earth');
  const e = buildEarth(g, { plane: false });
  W.ctrl.dist = 6.6;
  W.spawn(E.ARRIVE, E.SNAKE);
  const snake = W.place($.snake(), E.SNAKE, { face: W.surface(E.ARRIVE) });
  const flower = W.place($.threePetal(), E.FLOWER);
  ui.setObjectives([{ id: 'snake', text: 'Encontrar alguém no deserto' }]);
  W.guide = E.SNAKE;
  await opening(g, 'Capítulo VIII', 'A Terra', 'O sétimo planeta. Nem um pouco um planeta qualquer.', () => { W.ctrl.h = 14; }); // cai do céu
  await g.until(() => W.ctrl.h <= 0);
  await g.talk([
    ['', 'Uma vez na Terra, o pequeno príncipe ficou muito surpreso por não ver ninguém. Já tinha medo de ter errado de planeta...'],
    [P, 'Que planeta enorme! E tanta areia...'],
  ]);

  // a serpente
  let ok = false;
  let it = W.interact({ at: snake, r: 2.2, label: 'Falar com o anel dourado', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(it);
  await g.talk([
    [P, 'Boa noite.'],
    ['Serpente', 'Boa noite.'],
    [P, 'Em que planeta eu caí?'],
    ['Serpente', 'Na Terra. Na África.'],
    [P, 'Ah... E não há ninguém na Terra?'],
    ['Serpente', 'Aqui é o deserto. Não há ninguém nos desertos. A Terra é grande.'],
    [P, 'Onde estão os homens? A gente se sente um pouco só no deserto...'],
    ['Serpente', 'Entre os homens também se é só.'],
    [P, 'Tu és um bicho engraçado... fino como um dedo.'],
    ['Serpente', 'Mas sou mais poderoso que o dedo de um rei. Posso te levar mais longe que um navio.'],
    ['Serpente', 'Tu me dás pena, tão frágil nesta Terra de granito. Se um dia sentires saudade demais do teu planeta, eu posso te ajudar. Posso...'],
    [P, 'Oh! Entendi muito bem. Mas por que falas sempre por enigmas?'],
    ['Serpente', 'Eu resolvo todos eles.'],
    ['', 'E ficaram os dois em silêncio.'],
  ], { npc: snake, turn: false });
  ui.check('snake');
  await tween(g, 1.2, (t) => { snake.scale.setScalar(1 - t); });
  snake.visible = false;

  // a flor de três pétalas
  ui.addObjective({ id: 'flower', text: 'Atravessar o deserto' });
  W.guide = E.FLOWER;
  ok = false;
  it = W.interact({ at: flower, r: 2, label: 'Falar com a flor', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(it);
  await g.talk([
    [P, 'Bom dia.'],
    ['Flor', 'Bom dia.'],
    [P, 'Onde estão os homens?'],
    ['Flor', 'Os homens? Existem uns seis ou sete, eu acho. Vi-os há alguns anos. Mas nunca se sabe onde encontrá-los.'],
    ['Flor', 'O vento os leva. Eles não têm raízes, e isso os atrapalha muito.'],
    [P, 'Adeus.'],
    ['Flor', 'Adeus.'],
  ], { npc: flower, turn: false });
  ui.check('flower');

  // a montanha
  ui.addObjective({ id: 'mt', text: 'Subir a montanha mais alta' });
  W.guide = E.MT;
  ok = false;
  it = W.interact({ at: e.cairn, r: 3.2, label: 'Gritar lá do alto', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(it);
  ui.check('mt');
  const echo = async (who, text, e2) => {
    W.prince.pose = 'shout';
    await g.say(who, text);
    W.prince.pose = 'walk';
    g.sound.sfx('echo');
    await g.say('Eco', e2);
  };
  // plano aberto: o príncipe no topo, o deserto lá embaixo
  const mUp = W.ctrl.n.clone(), mF = W.ctrl.face.clone();
  W.shot(W.playerPos.clone().addScaledVector(mUp, 3.2).addScaledVector(mF, -4.5), W.playerPos.clone().addScaledVector(mUp, 0.4).addScaledVector(mF, 6), mUp);
  await echo(P, 'Bom dia!', 'Bom dia... bom dia... bom dia...');
  await echo(P, 'Quem sois vós?', 'Quem sois vós... quem sois vós... quem sois vós...');
  await echo(P, 'Sede meus amigos, eu estou só.', 'Estou só... estou só... estou só...');
  await g.talk([
    [P, 'Que planeta engraçado! É todo seco, todo pontudo e todo salgado.'],
    [P, 'E os homens não têm imaginação. Repetem o que a gente diz... No meu planeta eu tinha uma flor. Ela sempre falava primeiro...'],
  ]);
  W.shot(null);

  // o jardim de rosas
  ui.addObjective({ id: 'garden', text: 'Seguir a estrada até os homens' });
  W.guide = E.GARDEN;
  await g.until(() => angleBetween(W.ctrl.n, E.GARDEN) * R_EARTH < 5.5);
  ui.check('garden');
  W.guide = null;
  await g.talk([
    [P, 'Bom dia.'],
    ['Rosas', 'Bom dia.'],
    ['', 'Eram todas parecidas com a sua flor.'],
    [P, 'Quem sois vós?'],
    ['Rosas', 'Somos rosas.'],
    [P, 'Ah!'],
    ['', 'E ele se sentiu muito infeliz. A sua flor lhe tinha contado que era a única da sua espécie em todo o universo. E ali havia cinco mil, todas iguais, num só jardim!'],
    [P, 'Eu me achava rico com uma flor única, e tenho apenas uma rosa comum. Isso e três vulcões que me chegam ao joelho...'],
  ]);
  g.lock();
  W.prince.pose = 'cry';
  const up = W.ctrl.n.clone();
  W.shot(W.playerPos.clone().addScaledVector(up, 1.4).addScaledVector(W.ctrl.face, 3.2), W.playerPos.clone().addScaledVector(up, 0.6), up);
  await g.say('', 'E, deitado na relva, ele chorou.');
  await g.wait(1.2);

  // a raposa
  const fox = $.fox();
  const fs = { n: E.FOXMEET.clone(), face: tangentTo(E.FOXMEET, W.ctrl.n) };
  const fN0 = W.ctrl.n.clone().addScaledVector(tangentTo(W.ctrl.n, E.FOXMEET), 6 / R_EARTH).normalize();
  fs.n.copy(fN0);
  W.stage.add(fox);
  let foxMove = 0;
  W.hook((dt, t) => {
    fox.position.copy(fs.n).multiplyScalar(W.ground(fs.n));
    W.orient(fox, fs.n, fs.face);
    fox.userData.tail.rotation.y = Math.sin(t * (foxMove ? 12 : 3)) * (foxMove ? 0.5 : 0.25);
    fox.userData.head.rotation.x = Math.sin(t * 1.3) * 0.06;
  });
  await g.say('Raposa', 'Bom dia.');
  W.prince.pose = 'walk';
  W.shot(null);
  g.unlock();
  const faceFox = () => { fs.face.copy(tangentTo(fs.n, W.ctrl.n)); };
  faceFox();
  await g.talk([
    [P, 'Bom dia. Quem és tu? Tu és bem bonita...'],
    ['Raposa', 'Eu sou uma raposa.'],
    [P, 'Vem brincar comigo. Estou tão triste...'],
    ['Raposa', 'Não posso brincar contigo. Não fui cativada.'],
    [P, 'Ah! Desculpa. ... O que quer dizer "cativar"?'],
    ['Raposa', 'Tu não és daqui. O que procuras?'],
    [P, 'Procuro os homens. O que quer dizer "cativar"?'],
    ['Raposa', 'Os homens têm fuzis e caçam. É muito incômodo! Também criam galinhas. É o único interesse deles. Tu procuras galinhas?'],
    [P, 'Não. Procuro amigos. O que quer dizer "cativar"?'],
    ['Raposa', 'É uma coisa muito esquecida. Quer dizer "criar laços".'],
    ['Raposa', 'Para mim, tu ainda não és nada além de um garoto igual a cem mil outros garotos. E eu não preciso de ti. E tu também não precisas de mim.'],
    ['Raposa', 'Mas, se tu me cativas, nós precisaremos um do outro. Serás para mim único no mundo. E eu serei para ti única no mundo...'],
    [P, 'Começo a entender. Existe uma flor... acho que ela me cativou...'],
    ['Raposa', 'Minha vida é monótona. Mas, se tu me cativares, ela será como que cheia de sol. Vou conhecer um barulho de passos que será diferente de todos os outros.'],
    ['Raposa', 'E olha: vês, lá adiante, o trigal? Eu não como pão. O trigo não me lembra nada. Mas tu tens cabelos cor de ouro...'],
    ['Raposa', 'Então vai ser maravilhoso quando me tiveres cativado! O trigo, que é dourado, vai me fazer lembrar de ti. E vou gostar do barulho do vento no trigo...'],
    ['Raposa', 'Por favor... cativa-me!'],
    [P, 'Eu bem que quero, mas não tenho muito tempo. Tenho amigos para descobrir e muitas coisas para conhecer.'],
    ['Raposa', 'A gente só conhece bem as coisas que cativou. Se tu queres um amigo, cativa-me!'],
    [P, 'O que é preciso fazer?'],
    ['Raposa', 'É preciso ser muito paciente. Tu te sentarás primeiro um pouco longe de mim, assim, na relva, perto do trigal. Não dirás nada: a linguagem é uma fonte de mal-entendidos.'],
    ['Raposa', 'Mas, a cada dia, poderás sentar um pouco mais perto... E vem devagar. Os passos apressados me assustam.'],
  ], { npc: fox, turn: false });
  // a raposa corre para perto do trigal
  foxMove = 1;
  await g.until(() => { const d = W.walkToward(fs, E.FOX, 7, 1 / 60, 0.2); return d <= 0.25; });
  foxMove = 0;
  fs.face.copy(tangentTo(E.FOX, E.GARDEN));

  // cativar: três dias, cada vez mais perto
  let day = 0, fleeing = false;
  const approachDir = tangentTo(E.FOX, E.GARDEN);
  const spotN = (d) => E.FOX.clone().addScaledVector(approachDir, d / R_EARTH).normalize();
  const marker = new THREE.Group();
  const stone = mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.08, 12), 0xd8d0c0, { outline: 0.012 });
  const halo = flat(new THREE.RingGeometry(0.6, 0.75, 24), 0xffe08a, { transparent: true, opacity: 0.6, side: THREE.DoubleSide });
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.06;
  marker.add(stone, halo);
  const dists = [9, 6, 3.2];
  W.place(marker, spotN(dists[0]));
  W.hook((dt, t) => { halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08); });
  ui.addObjective({ id: 'tame', text: 'Cativar a raposa — dia 1/3 (chegue devagar e sente-se)' });
  W.guide = () => spotN(dists[Math.min(day, 2)]);
  W.hook((dt) => {
    if (fleeing || W.locked || day >= 3) return;
    const pd = angleBetween(W.ctrl.n, fs.n) * R_EARTH;
    if (pd < 11 && W.ctrl.speedNow > 2.3) {
      fleeing = true;
      g.sound.sfx('fail');
      ui.toast('Devagar... ela se assustou! (Shift ou joystick de leve)', 2600);
      const away = fs.n.clone().addScaledVector(tangentTo(fs.n, W.ctrl.n), -8 / R_EARTH).normalize();
      foxMove = 1;
      (async () => {
        await g.until(() => W.walkToward(fs, away, 8, 1 / 60, 0.2) <= 0.25);
        foxMove = 0;
        await g.wait(2.5);
        foxMove = 1;
        await g.until(() => W.walkToward(fs, E.FOX, 3, 1 / 60, 0.2) <= 0.25);
        foxMove = 0;
        fs.face.copy(tangentTo(E.FOX, E.GARDEN));
        fleeing = false;
      })();
    }
  });
  const dayLines = [
    [['', 'A raposa o olhou com o canto do olho, e ele não disse nada.']],
    [
      ['Raposa', 'Teria sido melhor voltares à mesma hora. Se vens, por exemplo, às quatro da tarde, desde as três eu começarei a ser feliz.'],
      ['Raposa', 'Quanto mais a hora for chegando, mais eu vou ficar feliz... É preciso ritos.'],
      [P, 'O que é um rito?'],
      ['Raposa', 'É uma coisa muito esquecida também. É o que faz com que um dia seja diferente dos outros dias, uma hora das outras horas.'],
    ],
    [['', 'Assim o pequeno príncipe cativou a raposa.']],
  ];
  const sit = W.interact({
    at: marker, r: 1.2, label: 'Sentar e esperar em silêncio', when: () => !fleeing && day < 3,
    act: async () => {
      g.lock();
      W.prince.pose = 'sit';
      W.ctrl.face.copy(tangentTo(W.ctrl.n, fs.n));
      const upN = W.ctrl.n.clone();
      const side = new THREE.Vector3().crossVectors(upN, W.ctrl.face);
      const mid = W.playerPos.clone().add(worldPos(fox)).multiplyScalar(0.5);
      W.shot(mid.clone().addScaledVector(side, 5 + day).addScaledVector(upN, 2), mid.clone().addScaledVector(upN, 0.6), upN);
      await W.setSky('dusk', 1.6);
      await W.setSky('night', 1.4);
      g.sound.sfx('star');
      await W.setSky('dawn', 1.4);
      await W.setSky('day', 1.2);
      await g.talk(dayLines[day]);
      day++;
      if (day < 3) {
        ui.objText('tame', `Cativar a raposa — dia ${day + 1}/3 (chegue devagar e sente-se)`);
        W.place(marker, spotN(dists[day]));
      } else marker.visible = false;
      W.shot(null);
      W.prince.pose = 'walk';
      g.unlock();
    },
  });
  await g.until(() => day >= 3);
  W.removeInteract(sit);
  ui.check('tame');
  W.guide = null;
  // a raposa vem até ele
  foxMove = 1;
  await g.until(() => W.walkToward(fs, W.ctrl.n, 1.6, 1 / 60, 1.3) <= 1.35);
  foxMove = 0;
  faceFox();
  g.sound.sfx('done');
  await g.talk([
    ['', 'E, quando a hora da partida se aproximou...'],
    ['Raposa', 'Ah! Eu vou chorar.'],
    [P, 'A culpa é tua. Eu não queria te fazer mal, mas tu quiseste que eu te cativasse...'],
    ['Raposa', 'Quis, sim.'],
    [P, 'Mas tu vais chorar!'],
    ['Raposa', 'Vou, sim.'],
    [P, 'Então não ganhaste nada!'],
    ['Raposa', 'Ganhei, por causa da cor do trigo.'],
    ['Raposa', 'Vai rever as rosas. Vais entender que a tua é única no mundo. Depois volta para me dizer adeus, e eu te darei de presente um segredo.'],
  ], { npc: fox, turn: false });

  ui.addObjective({ id: 'roses', text: 'Rever as rosas do jardim' });
  W.guide = E.GARDEN;
  ok = false;
  const gardenMark = new THREE.Object3D();
  W.place(gardenMark, E.GARDEN);
  it = W.interact({ at: gardenMark, r: 5, label: 'Falar com as rosas', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(it);
  ui.check('roses');
  await g.talk([
    [P, 'Vocês não se parecem em nada com a minha rosa. Vocês ainda não são nada. Ninguém cativou vocês, e vocês não cativaram ninguém.'],
    [P, 'Vocês são como era a minha raposa: igual a cem mil outras. Mas eu fiz dela minha amiga, e agora ela é única no mundo.'],
    ['', 'E as rosas ficaram muito sem jeito.'],
    [P, 'Vocês são belas, mas vazias. Ninguém morreria por vocês.'],
    [P, 'Um passante qualquer acharia que a minha rosa se parece com vocês. Mas ela sozinha é mais importante que todas vocês juntas...'],
    [P, 'Porque foi ela que eu reguei. Foi ela que eu pus sob a redoma. Foi ela que eu protegi com o biombo. Foi dela que eu escutei as queixas, as vaidades... e às vezes o silêncio.'],
    [P, 'Porque ela é a minha rosa.'],
  ]);

  ui.addObjective({ id: 'secret', text: 'Voltar para se despedir da raposa' });
  W.guide = () => fs.n;
  ok = false;
  it = W.interact({ at: fox, r: 2.2, label: 'Despedir-se da raposa', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(it);
  W.guide = null;
  await g.talk([
    [P, 'Adeus...'],
    ['Raposa', 'Adeus. Eis o meu segredo. É muito simples: só se vê bem com o coração.'],
    ['Raposa', 'O essencial é invisível aos olhos.'],
    [P, 'O essencial é invisível aos olhos...'],
    () => ui.card('o segredo da raposa', 'O essencial é invisível aos olhos', '', 2600),
    ['Raposa', 'Foi o tempo que perdeste com a tua rosa que fez a tua rosa tão importante.'],
    [P, 'Foi o tempo que eu perdi com a minha rosa...'],
    ['Raposa', 'Os homens esqueceram essa verdade. Mas tu não deves esquecer. Tu te tornas eternamente responsável por aquilo que cativas.'],
    ['Raposa', 'Tu és responsável pela tua rosa...'],
    [P, 'Eu sou responsável pela minha rosa...'],
    ['', 'Repetiu o pequeno príncipe, para não esquecer.'],
  ], { npc: fox, turn: false });
  ui.check('secret');
  g.sound.sfx('chime');
  await g.wait(0.8);
  g.lock();
  await ui.fade(1, 1400);
  await g.talk([
    ['', 'Estávamos no oitavo dia da minha pane no deserto, e eu tinha escutado a história do pequeno príncipe bebendo a última gota da minha reserva de água.'],
  ]);
  g.unlock();
}

// ═══════════════════════════ IX · O Poço ═══════════════════════════
export async function chPoco(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('night');
  g.sound.play('night');
  const e = buildEarth(g, { plane: true });
  e.toolbox.visible = false;
  const av = makeAviator();
  W.setAvatar(av);
  W.ctrl.dist = 6.8;
  W.spawn(dirLL(-12, -55), E.WELL);
  const pr = W.prince;
  W.addActor(pr);
  const startN = W.ctrl.n.clone().addScaledVector(tangentTo(W.ctrl.n, E.WELL), 1.5 / R_EARTH).normalize();
  pr.setPose(W.surface(startN), startN, tangentTo(startN, W.ctrl.n));
  await opening(g, 'Capítulo IX', 'O Poço', 'O oitavo dia no deserto.');
  await g.talk([
    [P, 'Estou com sede também... Vamos procurar um poço.'],
    ['', 'Fiz um gesto de cansaço: é absurdo procurar um poço, ao acaso, na imensidão do deserto. No entanto, pusemo-nos a caminho.'],
  ], { npc: pr, turn: false });
  const fol = follower(W, pr, () => W.playerPos.clone().addScaledVector(W.ctrl.face, -1).add(new THREE.Vector3().crossVectors(W.ctrl.n, W.ctrl.face).multiplyScalar(1.1)), { gap: 0.9 });
  ui.setObjectives([{ id: 'well', text: 'Procurar um poço (siga a estrela)' }]);
  W.guide = E.WELL;
  const wellDist = () => angleBetween(W.ctrl.n, E.WELL) * R_EARTH;
  await g.until(() => wellDist() < 20);
  await g.talk([
    [P, 'As estrelas são belas por causa de uma flor que a gente não vê...'],
    ['Aviador', 'Claro...'],
    [P, 'O deserto é bonito.'],
    ['', 'E era verdade. Sempre amei o deserto. A gente se senta numa duna. Não vê nada. Não escuta nada. E, no entanto, alguma coisa brilha em silêncio...'],
  ]);
  await g.until(() => wellDist() < 11);
  await g.talk([
    [P, 'O que torna o deserto bonito é que ele esconde um poço em algum lugar...'],
    ['', 'Compreendi de repente esse misterioso brilho da areia. Quando eu era menino, morava numa casa antiga, e diziam que havia um tesouro enterrado nela.'],
    ['Aviador', 'Sim! Seja a casa, as estrelas ou o deserto: o que faz a beleza deles é invisível!'],
    [P, 'Fico contente que concordes com a minha raposa.'],
  ]);
  let drew = false, creaked = false;
  const wi = W.interact({
    at: e.well, r: 2.4, label: 'Puxar a corda do poço', hold: 2.4, pose: 'pull',
    onHold: (p) => { e.well.userData.setBucket(p); if (!creaked) { creaked = true; g.sound.sfx('creak'); } },
    act: () => { drew = true; },
  });
  await g.until(() => drew);
  W.removeInteract(wi);
  W.guide = null;
  ui.check('well');
  fol.stop();
  g.sound.sfx('water');
  e.well.userData.setBucket(1);
  W.setSky('dawn', 14);
  await g.talk([
    [P, 'Tu ouves? Estamos acordando este poço, e ele canta...'],
    ['', 'Parecia um poço de aldeia. Mas não havia aldeia nenhuma ali, e eu pensava sonhar.'],
    [P, 'Tenho sede desta água. Dá-me de beber...'],
    () => { pr.pose = 'drink'; g.sound.sfx('water'); },
    ['', 'Ele bebeu de olhos fechados. Era doce como uma festa. Aquela água era bem mais que um alimento.'],
    ['', 'Tinha nascido da caminhada sob as estrelas, do canto da roldana, do esforço dos meus braços. Era boa para o coração, como um presente.'],
    () => { pr.pose = 'walk'; },
    [P, 'Os homens da tua terra cultivam cinco mil rosas num mesmo jardim... e não encontram o que procuram.'],
    ['Aviador', 'Não encontram...'],
    [P, 'E, no entanto, o que eles procuram poderia ser encontrado numa só rosa, ou num pouco d\'água...'],
    ['Aviador', 'É verdade.'],
    [P, 'Mas os olhos são cegos. É preciso procurar com o coração.'],
    [P, 'Tu precisas cumprir a tua promessa. Uma mordaça para o meu carneiro... Eu sou responsável por aquela flor!'],
    ['', 'Tirei do bolso os meus rascunhos e desenhei uma mordaça.'],
    [P, 'Sabes... a minha queda na Terra... amanhã faz um ano. Eu caí bem perto daqui...'],
    ['', 'E ele corou. Sem saber por quê, senti uma tristeza estranha.'],
    [P, 'Agora tu precisas trabalhar. Volta para a tua máquina. Eu te espero aqui. Volta amanhã à noite...'],
  ], { npc: pr, turn: false });
  g.lock();
  await ui.fade(1, 1400);
  g.unlock();
}

// ═══════════════════════════ Epílogo ═══════════════════════════
export async function chEpilogo(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('night');
  g.sound.play('end');
  const e = buildEarth(g, { plane: true });
  e.toolbox.visible = false;
  e.well.userData.setBucket(1);
  const av = makeAviator();
  W.setAvatar(av);
  W.ctrl.dist = 6.4;
  W.spawn(dirLL(-17, -28), E.WALL);
  const pr = W.prince;
  W.addActor(pr);
  // o príncipe sentado em cima do muro
  const wallUp = E.WALL.clone();
  pr.pose = 'sit';
  pr.setPose(W.surface(wallUp, 1.05), wallUp, tangentTo(wallUp, W.ctrl.n));
  const snake = W.place($.snake(), E.WALL.clone().addScaledVector(tangentTo(E.WALL, W.ctrl.n), 1.2 / R_EARTH).normalize());
  await opening(g, 'Capítulo final', 'As estrelas que riem', 'Um ano depois de cair na Terra.');
  await g.say('', 'No dia seguinte, consegui consertar o motor. À noite, voltei ao muro velho, ao lado do poço.');
  ui.setObjectives([{ id: 'wall', text: 'Ir até o muro de pedra' }]);
  W.guide = E.WALL;
  await g.until(() => angleBetween(W.ctrl.n, E.WALL) * R_EARTH < 6);
  ui.check('wall');
  W.guide = null;
  g.lock();
  await g.talk([
    ['', 'De longe, ouvi que ele conversava com alguém.'],
    [P, 'Agora vai embora... Eu quero descer!'],
  ]);
  await tween(g, 1.4, (t) => snake.scale.setScalar(1 - t));
  snake.visible = false;
  pr.pose = 'walk';
  const downN = E.WALL.clone().addScaledVector(tangentTo(E.WALL, W.ctrl.n), 0.9 / R_EARTH).normalize();
  pr.setPose(W.surface(downN), downN, tangentTo(downN, W.ctrl.n));
  g.unlock();
  await g.talk([
    [P, 'Fico contente que tenhas encontrado o que faltava na tua máquina. Vais poder voltar para casa...'],
    ['Aviador', 'Como sabes?!'],
    [P, 'Eu também, hoje, volto para casa... É bem mais longe. É bem mais difícil...'],
    [P, 'Tenho o teu carneiro. E tenho a caixa para o carneiro. E a mordaça...'],
    [P, 'As pessoas têm estrelas que não são as mesmas. Para uns, que viajam, as estrelas são guias. Para outros, não passam de luzinhas.'],
    [P, 'Para os sábios, são problemas. Para o meu homem de negócios, eram ouro. Mas todas essas estrelas se calam.'],
    [P, 'Tu terás estrelas como ninguém tem...'],
    ['Aviador', 'O que queres dizer?'],
    [P, 'Quando olhares o céu de noite, como eu vou morar numa delas, como eu vou rir numa delas... vai ser para ti como se todas as estrelas rissem.'],
    () => { g.sound.sfx('laugh'); tween(g, 2, (t) => { W.starU.uBoost.value = Math.sin(t * Math.PI) * 1.4; }); pr.pose = 'raise'; },
    [P, 'Tu terás estrelas que sabem rir!'],
    () => { pr.pose = 'walk'; },
    ['', 'E ele riu mais uma vez.'],
    [P, 'E, quando estiveres consolado (a gente sempre se consola), vais ficar contente por me ter conhecido. Serás sempre meu amigo.'],
    [P, 'Vai parecer que estou triste... Não venhas ver isso. Não vale a pena.'],
    ['Aviador', 'Não vou te deixar.'],
    [P, 'É longe demais. Não posso levar este corpo. É pesado demais.'],
    [P, 'Mas vai ser como uma casca velha abandonada. Não há nada de triste nas cascas velhas...'],
    [P, 'Sabes... a minha flor... eu sou responsável por ela. E ela é tão frágil! Tão ingênua. Tem quatro espinhos de nada para se defender do mundo...'],
    [P, 'Pronto... é tudo.'],
  ], { npc: pr, turn: false });
  // a partida
  g.lock();
  const up = pr.root.position.clone().normalize();
  const f = tangentTo(up, W.ctrl.n);
  const side = new THREE.Vector3().crossVectors(up, f);
  W.shot(pr.root.position.clone().addScaledVector(side, 4).addScaledVector(up, 1.6).addScaledVector(f, 1), pr.root.position.clone().addScaledVector(up, 0.6), up);
  await g.wait(1.6);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe25a, transparent: true }));
  flash.position.copy(pr.root.position).addScaledVector(up, 0.1).addScaledVector(f, 0.2);
  W.stage.add(flash);
  await tween(g, 0.7, (t) => { flash.scale.setScalar(1 + t * 3); flash.material.opacity = 1 - t; });
  flash.visible = false;
  await g.say('', 'Houve apenas um clarão amarelo perto do seu tornozelo. Ele ficou imóvel por um instante. Não gritou.');
  pr.pose = 'lie';
  await g.wait(2.2);
  await g.say('', 'Caiu devagar, como cai uma árvore. Nem fez barulho, por causa da areia.');
  await ui.fade(1, 2600, true);
  pr.visible = false;
  W.shot(null);
  await g.talk([
    ['', 'Ao amanhecer, não encontrei o seu corpo. Não era um corpo tão pesado assim...'],
    ['', 'E agora, é claro, já se passaram seis anos. Estou um pouco consolado. Isto é... não inteiramente.'],
    ['', 'Mas sei que ele voltou para o seu planeta. E gosto, de noite, de escutar as estrelas. São como quinhentos milhões de guizos...'],
  ]);
  W.setSky('night');
  W.ctrl.face.copy(tangentTo(W.ctrl.n, E.WELL));
  await ui.fade(0, 2200);
  g.unlock();

  // as estrelas que riem: uma para cada poeira de estrela colhida
  const dust = g.state.dust + (g.state.freed ? 3 : 0);
  const goldU = { uTime: W.starU.uTime, uPR: W.starU.uPR, uAlpha: { value: 0 }, uBoost: { value: 0.6 }, uColor: { value: new THREE.Color('#ffd76a') } };
  const golden = W.makeStars(Math.max(12, Math.min(dust, 400)), 1250, goldU);
  W.stage.add(golden);
  W.hook(() => golden.position.copy(W.camera.position));
  ui.setObjectives([{ id: 'sky', text: 'Olhar para as estrelas' }]);
  let looked = false;
  const li = W.interact({ at: av.root, r: 5, label: 'Olhar para as estrelas', hold: 1.2, act: () => { looked = true; } });
  await g.until(() => looked);
  W.removeInteract(li);
  ui.check('sky');
  g.lock();
  av.pose = 'lookup';
  const aup = W.ctrl.n.clone();
  W.shot(W.playerPos.clone().addScaledVector(aup, 1.2).addScaledVector(W.ctrl.face, -2.5), W.playerPos.clone().addScaledVector(aup, 30).addScaledVector(W.ctrl.face, 8), W.ctrl.face.clone());
  g.sound.sfx('laugh');
  await tween(g, 3, (t) => { goldU.uAlpha.value = t * 1.2; W.starU.uBoost.value = Math.sin(t * Math.PI) * 1.2; });
  ui.toast(`✦ ${dust} estrelas riem para você`, 3500);
  await g.talk([
    ['', 'Mas aconteceu uma coisa extraordinária. Na mordaça que desenhei para o pequeno príncipe, esqueci de acrescentar a correia de couro! Ele nunca vai poder prendê-la no carneiro.'],
    ['', 'Então me pergunto: o que terá acontecido no planeta dele? Talvez o carneiro tenha comido a flor...'],
    ['', 'Olhem para o céu. Perguntem-se: o carneiro comeu ou não comeu a flor?'],
  ]);
  const c = await g.choose(['Não comeu. Ele a protege toda noite sob a redoma.', 'Sim, talvez tenha comido...']);
  if (c === 0) {
    g.sound.sfx('laugh');
    await tween(g, 2.4, (t) => { W.starU.uBoost.value = Math.sin(t * Math.PI) * 1.6; goldU.uBoost.value = 0.6 + Math.sin(t * Math.PI); });
    await g.say('', 'E então todas as estrelas riem, docemente.');
  } else {
    g.sound.sfx('fail');
    await tween(g, 2.4, (t) => { goldU.uAlpha.value = 1.2 - t * 0.9; W.starU.uAlpha.value = 1.25 - t * 0.9; });
    await g.say('', 'E então todos os guizos se transformam em lágrimas...');
    await tween(g, 2.4, (t) => { goldU.uAlpha.value = 0.3 + t * 0.9; W.starU.uAlpha.value = 0.35 + t * 0.9; });
  }
  await g.talk([
    ['', 'Vocês verão como tudo muda... E nenhuma pessoa grande jamais vai entender que isso tenha tanta importância!'],
    ['', 'Se um dia vocês passarem pela África, no deserto, e um menino de cabelos dourados vier ao seu encontro, rindo, e não responder às suas perguntas... vocês vão adivinhar quem ele é.'],
    ['', 'Então, por favor, sejam gentis. Não me deixem tão triste: escrevam-me depressa dizendo que ele voltou...'],
  ]);
  await ui.fade(1, 2000);
  ui.showHud(false);
  await ui.card('Fim', 'Estrelas que Riem', `Poeira de estrela colhida: ${g.state.dust} · Pores do sol vistos: ${g.state.sunsets}`, 5200);
  await ui.card('com gratidão a', 'Antoine de Saint-Exupéry', 'O Pequeno Príncipe (1943). Este jogo foi feito do zero, com modelos, música e textos próprios, como uma homenagem.', 5200);
  g.unlock();
}
