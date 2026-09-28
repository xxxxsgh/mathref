// A Grande Duna: o último mundo, a Fonte das Estrelas e o céu reaceso.
import * as THREE from 'three';
import { fbm3, col, PAL, mesh, flat, toon, rng, glow } from './style.js';
import * as $ from './props.js';
import { SKIES } from './world.js';
import { I, dirLL, angleBetween, tangentTo, paint, scatter, opening, tween, smoothstep, worldPos } from './kit.js';

const Y = new THREE.Vector3(0, 1, 0);
export const R_DUNA = 38;
export const D = {
  ARRIVE: dirLL(8, -30), WORM: dirLL(10, -22), CACTUS: dirLL(18, -12), MT: dirLL(32, -48),
  FIELD: dirLL(36, 4), MEET: dirLL(41, 15), MEADOW: dirLL(52, 32), DEER: dirLL(51, 38), GRASS: dirLL(58, 50),
  FOUNT: dirLL(-18, -20), START: dirLL(-10, -55),
};

function randomAround(center, radius, r) {
  const t1 = new THREE.Vector3().crossVectors(Math.abs(center.y) < 0.9 ? Y : new THREE.Vector3(1, 0, 0), center).normalize();
  const t2 = new THREE.Vector3().crossVectors(center, t1);
  const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
  return center.clone().multiplyScalar(Math.cos(d)).addScaledVector(t1, Math.cos(a) * Math.sin(d)).addScaledVector(t2, Math.sin(a) * Math.sin(d)).normalize();
}

/** Monta a Grande Duna inteira (mesmo mundo para os três capítulos finais). */
export function buildDuna(g, { lit = false } = {}) {
  const W = g.world;
  const R = R_DUNA;
  const green = (n) => Math.max(smoothstep(0.42, 0.28, angleBetween(n, D.MEADOW)), smoothstep(0.24, 0.15, angleBetween(n, D.FIELD)));
  const height = (n) => {
    const mt = angleBetween(n, D.MT);
    let h = 11 * Math.exp(-Math.pow(mt / 0.2, 2));
    if (mt < 0.4) h += (fbm3(n.x * 14, n.y * 14, n.z * 14) - 0.5) * 3 * smoothstep(0.4, 0.12, mt);
    const gr = green(n);
    const dune = (fbm3(n.x * 9 + 3, n.y * 9, n.z * 9) - 0.5) * 2.4 + Math.sin(n.x * 70 + n.z * 45) * 0.12;
    h += dune * (1 - gr) * (1 - smoothstep(0.34, 0.16, mt));
    h += gr * (fbm3(n.x * 5, n.y * 5, n.z * 5) - 0.5) * 0.7;
    h *= 1 - 0.8 * smoothstep(0.08, 0.02, angleBetween(n, D.FOUNT));
    return h;
  };
  const sand = paint('#f0cfa8', '#e0b890', '#f7e0c0', { scale: 7, seed: 2 });
  const grass = paint('#8ac8a0', '#78b890', '#a8d8b0', { scale: 9, seed: 4 });
  const rockA = col('#9c8aa8'), rockB = col('#b4a2be');
  const blue = col('#6ab8c8');
  W.setPlanet({
    radius: R, seg: 220, outline: 0.12, height,
    color: (n) => {
      const mt = angleBetween(n, D.MT);
      let c = sand(n);
      const gr = green(n);
      if (gr > 0) c.lerp(grass(n), Math.round(gr * 3) / 3);
      if (angleBetween(n, D.GRASS) < 0.11) c = blue.clone().lerp(col('#4a98b0'), fbm3(n.x * 30, n.y * 30, n.z * 30) > 0.55 ? 0.5 : 0);
      const rk = smoothstep(0.3, 0.16, mt);
      if (rk > 0) c.lerp(fbm3(n.x * 20, n.y * 20, n.z * 20) > 0.5 ? rockA : rockB, Math.round(rk * 3) / 3);
      return c;
    },
  });
  const out = {};
  const key = Object.values(D);
  scatter(W, 70, 101, (r) => $.rock(0.8 + r() * 2.2, 0xb8a090), key, 0.07);
  scatter(W, 90, 102, () => $.tuft(0xb0a080), key, 0.05);

  const dummy = new THREE.Object3D();
  const placeAt = (n, yaw, s) => {
    dummy.position.copy(n).multiplyScalar(W.ground(n));
    dummy.quaternion.setFromUnitVectors(Y, n).multiply(new THREE.Quaternion().setFromAxisAngle(Y, yaw));
    dummy.scale.setScalar(s);
  };
  const copyDummy = (d) => { d.position.copy(dummy.position); d.quaternion.copy(dummy.quaternion); d.scale.copy(dummy.scale); };

  // Campo das Lanternas
  const lr = rng(33);
  const lanternN = [];
  for (let i = 0; i < 140; i++) lanternN.push(randomAround(D.FIELD, 0.14, lr));
  const poleG = new THREE.CylinderGeometry(0.02, 0.025, 1.0, 5); poleG.translate(0, 0.5, 0);
  const bodyG = new THREE.CylinderGeometry(0.13, 0.13, 0.26, 8);
  const capG = new THREE.ConeGeometry(0.16, 0.1, 8);
  const field = $.instancedField(lanternN.length, (i, d) => { placeAt(lanternN[i], i, 1 + (i % 5) * 0.08); copyDummy(d); }, [
    { geom: poleG, color: 0x6a5a4a },
    { geom: bodyG, color: 0x9a7a8a, y: 1.1 },
    { geom: capG, color: 0x5a4a5a, y: 1.28 },
  ]);
  W.stage.add(field);
  const bodyMesh = field.children[1];
  const litMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  out.lightField = (on) => { bodyMesh.material = on ? litMat : toon(0x9a7a8a); };
  if (lit) out.lightField(true);

  // Campo azul onde vive Musgo
  const tuftG = new THREE.ConeGeometry(0.06, 0.4, 4); tuftG.translate(0, 0.2, 0);
  const gr2 = rng(44);
  const grassN = [];
  for (let i = 0; i < 380; i++) grassN.push(randomAround(D.MEADOW, 0.36, gr2));
  W.stage.add($.instancedField(grassN.length, (i, d) => { placeAt(grassN[i], i, 1 + (i % 3) * 0.3); copyDummy(d); }, [{ geom: tuftG, color: 0x6aa888 }]));
  const bladeG = new THREE.ConeGeometry(0.05, 1.1, 4); bladeG.translate(0, 0.55, 0);
  const budG = new THREE.SphereGeometry(0.06, 6, 5);
  const wr = rng(55);
  const blueN = [];
  for (let i = 0; i < 1100; i++) blueN.push(randomAround(D.GRASS, 0.105, wr));
  const blueF = $.instancedField(blueN.length, (i, d) => { placeAt(blueN[i], i * 1.7, 0.9 + (i % 4) * 0.08); copyDummy(d); }, [
    { geom: bladeG, color: 0x4a98b0 }, { geom: budG, color: 0xbfe8ff, y: 1.1, basic: true },
  ]);
  const timeU = { value: 0 };
  blueF.children.forEach((m, i) => {
    m.material = i === 0 ? toon(0x4a98b0, {}, true) : new THREE.MeshBasicMaterial({ color: 0xbfe8ff });
    m.material.onBeforeCompile = (s) => {
      s.uniforms.uTime = timeU;
      s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27;
        transformed.x += sin(uTime * 1.8 + ph) * (position.y + 0.6) * 0.16;`);
    };
    m.material.customProgramCacheKey = () => 'sway' + i;
  });
  W.stage.add(blueF);
  W.hook((dt, t) => { timeU.value = t; });
  const tr = rng(66);
  for (let i = 0; i < 6; i++) {
    const n = randomAround(D.MEADOW, 0.32, tr);
    if (angleBetween(n, D.GRASS) < 0.14 || angleBetween(n, D.DEER) < 0.08) continue;
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.2, 8), 0x7a6a8a);
    trunk.position.y = 1.1;
    const crown = mesh(new THREE.IcosahedronGeometry(1.3, 1), 0x5a9a8a);
    crown.position.y = 2.9;
    t.add(trunk, crown);
    W.place(t, n, { yaw: i });
    W.collider(n, 0.35);
  }
  const cairn = new THREE.Group();
  for (let i = 0; i < 4; i++) { const s = $.rock(1.2 - i * 0.22, 0x8a7a9a); s.position.y = i * 0.28; cairn.add(s); }
  W.place(cairn, D.MT);
  out.cairn = cairn;
  out.fount = W.place($.fountain(), D.FOUNT);
  W.collider(D.FOUNT, 1.1);
  return out;
}

/** Faz um personagem (não-avatar) seguir um ponto pela superfície. */
function follower(W, obj, leader, { speed = 4.6, gap = 1.6, animate } = {}) {
  const st = { n: obj.position.clone().normalize(), face: new THREE.Vector3(0, 0, 1) };
  let active = true;
  const h = W.hook((dt, t) => {
    if (!active) return;
    const before = st.n.clone();
    W.walkToward(st, leader().clone().normalize(), speed, dt, gap);
    const moving = before.distanceTo(st.n) > 1e-5;
    obj.position.copy(W.surface(st.n));
    W.orient(obj, st.n, st.face);
    if (animate) animate(moving, t);
  });
  return { st, stop() { active = false; W.unhook(h); } };
}

// ═══════════════════════════ VII · A Grande Duna ═══════════════════════════
export async function chDuna(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('day');
  g.sound.play('earth');
  const e = buildDuna(g);
  W.ctrl.dist = 6.6;
  W.spawn(D.ARRIVE, D.WORM);
  const worm = W.place($.glassWorm(), D.WORM, { face: W.surface(D.ARRIVE) });
  W.hook((dt, t) => worm.userData.update(t));
  const cactus = W.place($.cactus(), D.CACTUS, { face: W.surface(D.WORM) });
  ui.setObjectives([{ id: 'worm', text: 'Procurar alguém na areia' }]);
  W.guide = D.WORM;
  await opening(g, 'Capítulo VII', 'A Grande Duna', 'Um mundo tão grande que o horizonte fica longe.', () => { W.ctrl.h = 14; });
  await g.until(() => W.ctrl.h <= 0);
  await g.talk([[I, 'Uau... aqui a gente anda e anda e o chão não faz curva nenhuma!']]);

  let ok = false;
  let it = W.interact({ at: worm, r: 2.2, label: 'Falar com a lagarta de vidro', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(it);
  await g.talk([
    ['Vidrilho', 'Hmm? Um visitante que caiu do céu com um papel colorido. Faz tempo que não chovia coisa interessante.'],
    [I, 'Eu vim buscar faíscas. Me disseram que elas caem aqui.'],
    ['Vidrilho', 'Caem, caem. Mas não ficam no chão. Faísca gosta de quem cuida. Se ninguém cuida, ela se esconde.'],
    ['Vidrilho', 'Tem um campo de lanternas ali pro norte que ninguém acende faz muitos anos. E um cervinho tímido que ninguém consegue chegar perto.'],
    [I, 'E por que ninguém acende as lanternas?'],
    ['Vidrilho', 'Porque todo mundo que passa acha que outro vai acender. Eu mesmo ia... amanhã. Faz uns vinte amanhãs.'],
    ['Vidrilho', 'Passe pela Dona Espinha antes. Ela conhece o caminho de cor.'],
  ], { npc: worm, turn: false });
  ui.check('worm');

  ui.addObjective({ id: 'cactus', text: 'Encontrar a Dona Espinha' });
  W.guide = D.CACTUS;
  ok = false;
  it = W.interact({ at: cactus, r: 2, label: 'Falar com a Dona Espinha', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(it);
  await g.talk([
    ['Dona Espinha', 'Olá, olá. Não vou te abraçar, você entende o motivo.'],
    [I, 'Oi, Dona Espinha! Qual é o caminho até as lanternas?'],
    ['Dona Espinha', 'Suba primeiro a montanha pontuda. Lá de cima você vê tudo. E aproveita e grita um pouco, que a montanha gosta de responder.'],
    ['Dona Espinha', 'Eu fico aqui, que raiz não anda. Mas gosto de saber que alguém anda por mim.'],
  ], { npc: cactus, turn: false });
  ui.check('cactus');

  ui.addObjective({ id: 'mt', text: 'Subir a montanha pontuda' });
  W.guide = D.MT;
  ok = false;
  it = W.interact({ at: e.cairn, r: 3.2, label: 'Gritar lá de cima', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(it);
  ui.check('mt');
  const mUp = W.ctrl.n.clone(), mF = W.ctrl.face.clone();
  W.shot(W.playerPos.clone().addScaledVector(mUp, 3.2).addScaledVector(mF, -4.5), W.playerPos.clone().addScaledVector(mUp, 0.4).addScaledVector(mF, 6), mUp);
  const echo = async (text, e2) => {
    W.hero.pose = 'shout';
    await g.say(I, text);
    W.hero.pose = 'walk';
    g.sound.sfx('echo');
    await g.say('Eco', e2);
  };
  await echo('Olááá!', 'Olááá... lááá... ááá...');
  await echo('Tem alguém aí?', 'Alguém aí... aí... í...');
  await echo('Eu sou o Ilo! Vim acender o céu!', 'Acender o céu... o céu... céu...');
  await g.talk([
    [I, 'Ela repete tudo, mas repete de um jeito que parece que concorda.'],
    [I, 'Olha lá embaixo: um campo cheio de lanternas apagadas. É ali.'],
  ]);
  W.shot(null);

  ui.addObjective({ id: 'field', text: 'Ir até o Campo das Lanternas' });
  W.guide = D.FIELD;
  await g.until(() => angleBetween(W.ctrl.n, D.FIELD) * R_DUNA < 5.5);
  ui.check('field');
  await g.talk([
    ['Lanternas', '...quem está aí...?'],
    [I, 'Vocês falam!'],
    ['Lanternas', 'Falamos baixinho. Lanterna apagada não tem voz forte.'],
    [I, 'Por que vocês estão apagadas?'],
    ['Lanternas', 'Cada viajante que passava achava que éramos lanternas de outra pessoa. E ninguém acende a lanterna dos outros.'],
    [I, 'Então eu acendo. Não precisa ser de ninguém pra merecer luz.'],
  ]);
  ui.addObjective({ id: 'light', text: 'Acender o Campo das Lanternas (segure)' });
  const mark = new THREE.Object3D();
  W.place(mark, D.FIELD);
  ok = false;
  it = W.interact({ at: mark, r: 5.5, hold: 2.2, pose: 'raise', label: 'Acender as lanternas', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(it);
  e.lightField(true);
  g.sound.sfx('laugh');
  ui.check('light');
  await g.talk([
    ['Lanternas', 'Ahhh... que calorzinho. Obrigada, menino da pipa.'],
    ['Lanternas', 'Olha quem veio espiar por causa da luz...'],
  ]);

  // Musgo, o cervinho tímido
  const deer = $.mossDeer();
  const ds = { n: W.ctrl.n.clone().addScaledVector(tangentTo(W.ctrl.n, D.MEET), 7 / R_DUNA).normalize(), face: new THREE.Vector3() };
  ds.face.copy(tangentTo(ds.n, W.ctrl.n));
  W.stage.add(deer);
  let moving = 0;
  W.hook((dt, t) => {
    deer.position.copy(ds.n).multiplyScalar(W.ground(ds.n));
    W.orient(deer, ds.n, ds.face);
    deer.userData.head.rotation.x = Math.sin(t * 1.3) * 0.08 + (moving ? 0.2 : 0);
    deer.userData.tail.position.y = 0.85 + Math.sin(t * (moving ? 14 : 3)) * 0.03;
    deer.position.addScaledVector(ds.n, moving ? Math.abs(Math.sin(t * 12)) * 0.12 : 0);
  });
  const faceDeer = () => ds.face.copy(tangentTo(ds.n, W.ctrl.n));
  await g.talk([
    [I, 'Oi! Não precisa ter medo.'],
    ['Musgo', '...'],
    ['Musgo', 'Todo mundo que chega aqui chega correndo. E vai embora correndo também.'],
    [I, 'Eu não estou com pressa. Quer dizer... estou um pouco. Mas posso esperar.'],
    ['Musgo', 'Esperar é diferente de ficar parado. Quem espera de verdade, espera do lado de alguém.'],
    ['Musgo', 'Vai lá pro capim azul. Senta longe de mim e não fala nada. Se você voltar amanhã, senta um pouco mais perto.'],
    ['Musgo', 'E vem devagar. Passo apressado me faz sumir.'],
  ], { npc: deer, turn: false });
  moving = 1;
  await g.until(() => W.walkToward(ds, D.DEER, 7, 1 / 60, 0.2) <= 0.25);
  moving = 0;
  ds.face.copy(tangentTo(D.DEER, D.FIELD));

  let day = 0, fleeing = false;
  const approachDir = tangentTo(D.DEER, D.FIELD);
  const spotN = (d) => D.DEER.clone().addScaledVector(approachDir, d / R_DUNA).normalize();
  const marker = new THREE.Group();
  const stone = mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.08, 12), 0xd8d0e0, { outline: 0.012 });
  const halo = flat(new THREE.RingGeometry(0.6, 0.75, 24), 0xbfe8ff, { transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.06;
  marker.add(stone, halo);
  const dists = [9, 6, 3.2];
  W.place(marker, spotN(dists[0]));
  W.hook((dt, t) => { halo.scale.setScalar(1 + Math.sin(t * 3) * 0.08); });
  ui.addObjective({ id: 'tame', text: 'Ganhar a confiança do Musgo — dia 1/3 (chegue devagar e sente-se)' });
  W.guide = () => spotN(dists[Math.min(day, 2)]);
  W.hook(() => {
    if (fleeing || W.locked || day >= 3) return;
    const pd = angleBetween(W.ctrl.n, ds.n) * R_DUNA;
    if (pd < 11 && W.ctrl.speedNow > 2.3) {
      fleeing = true;
      g.sound.sfx('fail');
      ui.toast('Devagar... o Musgo se assustou! (Shift ou joystick de leve)', 2600);
      const away = ds.n.clone().addScaledVector(tangentTo(ds.n, W.ctrl.n), -8 / R_DUNA).normalize();
      moving = 1;
      (async () => {
        await g.until(() => W.walkToward(ds, away, 8, 1 / 60, 0.2) <= 0.25);
        moving = 0;
        await g.wait(2.5);
        moving = 1;
        await g.until(() => W.walkToward(ds, D.DEER, 3, 1 / 60, 0.2) <= 0.25);
        moving = 0;
        ds.face.copy(tangentTo(D.DEER, D.FIELD));
        fleeing = false;
      })();
    }
  });
  const dayLines = [
    [['', 'Musgo mastigou um capim azul, fingindo que não olhava. Mas olhava.']],
    [
      ['Musgo', 'Você voltou na mesma hora de ontem.'],
      ['Musgo', 'Eu fiquei esperando desde que a sombra da pedra começou a crescer. Não sabia que esperar alguém podia ser gostoso.'],
    ],
    [['', 'E no terceiro dia, Musgo encostou o focinho frio na mão de Ilo.']],
  ];
  const sit = W.interact({
    at: marker, r: 1.2, label: 'Sentar e esperar em silêncio', when: () => !fleeing && day < 3,
    act: async () => {
      g.lock();
      W.hero.pose = 'sit';
      W.ctrl.face.copy(tangentTo(W.ctrl.n, ds.n));
      const upN = W.ctrl.n.clone();
      const side = new THREE.Vector3().crossVectors(upN, W.ctrl.face);
      const mid = W.playerPos.clone().add(worldPos(deer)).multiplyScalar(0.5);
      W.shot(mid.clone().addScaledVector(side, 5 + day).addScaledVector(upN, 2), mid.clone().addScaledVector(upN, 0.6), upN);
      await W.setSky('dusk', 1.6);
      await W.setSky('night', 1.4);
      g.sound.sfx('star');
      await W.setSky('dawn', 1.4);
      await W.setSky('day', 1.2);
      await g.talk(dayLines[day]);
      day++;
      if (day < 3) {
        ui.objText('tame', `Ganhar a confiança do Musgo — dia ${day + 1}/3 (chegue devagar e sente-se)`);
        W.place(marker, spotN(dists[day]));
      } else marker.visible = false;
      W.shot(null);
      W.hero.pose = 'walk';
      g.unlock();
    },
  });
  await g.until(() => day >= 3);
  W.removeInteract(sit);
  ui.check('tame');
  W.guide = null;
  moving = 1;
  await g.until(() => W.walkToward(ds, W.ctrl.n, 1.6, 1 / 60, 1.3) <= 1.35);
  moving = 0;
  faceDeer();
  await g.talk([
    ['Musgo', 'Sabe o que aconteceu? Agora, quando o capim azul balançar, eu vou lembrar da tua fita balançando também.'],
    [I, 'Mas eu vou ter que ir embora, Musgo. Ainda falta uma faísca.'],
    ['Musgo', 'Eu sei. E vai doer um pouquinho. Mas é uma dor que vale, porque vem de uma coisa boa.'],
    ['Musgo', 'Eu sei onde fica a Fonte das Estrelas. Nunca levei ninguém lá.'],
    ['Musgo', 'Você esperou por mim. Agora eu espero por você: amanhã à noite, a gente vai junto.'],
  ], { npc: deer, turn: false });
  g.state.sparks = Math.max(g.state.sparks || 0, 6);
  g.lock();
  await ui.fade(1, 1400);
  g.unlock();
}

// ═══════════════════════════ VIII · A Fonte das Estrelas ═══════════════════════════
export async function chFonte(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('night');
  g.sound.play('night');
  const e = buildDuna(g, { lit: true });
  W.ctrl.dist = 6.8;
  W.spawn(D.START, D.FOUNT);
  const deer = $.mossDeer();
  const startN = W.ctrl.n.clone().addScaledVector(tangentTo(W.ctrl.n, D.FOUNT), 1.8 / R_DUNA).normalize();
  W.place(deer, startN);
  const glowD = glow(0xbfe8ff, 1.4, 0.6);
  glowD.position.set(0, 1.3, 0.5);
  deer.add(glowD);
  await opening(g, 'Capítulo VIII', 'A Fonte das Estrelas', 'A última faísca mora no fundo de um poço de luz.');
  await g.talk([
    ['Musgo', 'É longe, e a noite aqui é bem escura. Mas as lanternas que você acendeu ajudam a achar o caminho.'],
    [I, 'Vamos juntos, então.'],
  ], { npc: deer, turn: false });
  const fol = follower(W, deer, () => W.playerPos.clone().addScaledVector(W.ctrl.face, -1).add(new THREE.Vector3().crossVectors(W.ctrl.n, W.ctrl.face).multiplyScalar(1.2)), {
    gap: 1.0, animate: (mv, t) => { deer.userData.head.rotation.x = mv ? 0.15 : Math.sin(t) * 0.05; },
  });
  ui.setObjectives([{ id: 'fount', text: 'Seguir até a Fonte das Estrelas' }]);
  W.guide = D.FOUNT;
  const dist = () => angleBetween(W.ctrl.n, D.FOUNT) * R_DUNA;
  await g.until(() => dist() < 20);
  await g.talk([
    ['Musgo', 'Aqui o vento conta segredos para a areia.'],
    [I, 'E o que ele conta?'],
    ['Musgo', 'Que tudo que brilha já foi uma coisa pequena que alguém cuidou.'],
  ]);
  await g.until(() => dist() < 11);
  await g.talk([
    [I, 'Musgo... e se a última faísca não estiver lá?'],
    ['Musgo', 'Então a gente fica sentado olhando a fonte. Também vale a viagem.'],
  ]);
  let pulled = false, creaked = false;
  const fi = W.interact({
    at: e.fount, r: 2.6, label: 'Puxar a corda da fonte', hold: 2.4, pose: 'pull',
    onHold: (p) => { e.fount.userData.setBucket(p); if (!creaked) { creaked = true; g.sound.sfx('creak'); } },
    act: () => { pulled = true; },
  });
  await g.until(() => pulled);
  W.removeInteract(fi);
  W.guide = null;
  ui.check('fount');
  fol.stop();
  e.fount.userData.setBucket(1);
  g.sound.sfx('done');
  await g.talk([
    ['', 'O balde subiu pesado. Lá dentro, em vez de água, boiava uma luz mansinha, do tamanho de uma semente.'],
    [I, 'A sétima faísca...'],
    ['Musgo', 'Estava aqui o tempo todo. Só precisava de alguém com paciência pra puxar a corda.'],
    [I, 'Obrigado por me trazer.'],
    ['Musgo', 'Obrigado por me esperar.'],
  ], { npc: deer, turn: false });
  g.state.sparks = 7;
  g.save();
  await ui.card('faísca 7 de 7', 'A faísca da Fonte', '', 2000);
  g.lock();
  await ui.fade(1, 1400);
  g.unlock();
}

// ═══════════════════════════ Final · O céu reaceso ═══════════════════════════
export async function chFinal(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('night');
  W.starU.uAlpha.value = 0.25;
  g.sound.play('end');
  const e = buildDuna(g, { lit: true });
  e.fount.userData.setBucket(1);
  W.ctrl.dist = 6.4;
  W.spawn(D.FOUNT.clone().addScaledVector(tangentTo(D.FOUNT, D.START), 3 / R_DUNA).normalize(), D.FOUNT);
  const deer = $.mossDeer();
  const dn = W.ctrl.n.clone().addScaledVector(new THREE.Vector3().crossVectors(W.ctrl.n, W.ctrl.face), 1.4 / R_DUNA).normalize();
  W.place(deer, dn, { face: W.surface(D.FOUNT) });
  const faded = { ...SKIES.night, stars: 0.25 };
  W.setSky(faded);
  await opening(g, 'Final', 'O céu reaceso', 'Sete faíscas, uma noite apagada.');
  await g.talk([
    [I, 'Olha o céu, Musgo. Quase não sobrou estrela.'],
    ['Musgo', 'E você tem sete faíscas no bolso.'],
    [I, 'A Vó disse que com sete dá pra reacender tudo.'],
  ]);
  const dust = g.state.dust + (g.state.freed ? 3 : 0);
  const goldU = { uTime: W.starU.uTime, uPR: W.starU.uPR, uAlpha: { value: 0 }, uBoost: { value: 0.6 }, uColor: { value: new THREE.Color('#ffd76a') } };
  const golden = W.makeStars(Math.max(12, Math.min(dust, 400)), 1250, goldU);
  W.stage.add(golden);
  W.hook(() => golden.position.copy(W.camera.position));
  ui.setObjectives([{ id: 'sky', text: 'Soltar as sete faíscas (segure)' }]);
  let freed = false;
  const li = W.interact({ at: W.avatar.root, r: 5, label: 'Soltar as faíscas', hold: 1.6, pose: 'raise', act: () => { freed = true; } });
  await g.until(() => freed);
  W.removeInteract(li);
  ui.check('sky');
  g.lock();
  W.hero.pose = 'raise';
  const up = W.ctrl.n.clone();
  const sparks = [];
  for (let i = 0; i < 7; i++) {
    const s = $.fallenStar();
    s.scale.setScalar(0.7);
    W.place(s, W.ctrl.n, { lift: 1.2 });
    sparks.push(s);
  }
  W.shot(W.playerPos.clone().addScaledVector(up, 1.2).addScaledVector(W.ctrl.face, -3), W.playerPos.clone().addScaledVector(up, 12).addScaledVector(W.ctrl.face, 5), W.ctrl.face.clone());
  g.sound.sfx('whoosh');
  await tween(g, 3, (t) => sparks.forEach((s, i) => {
    const a = i * 0.9 + t * 4;
    s.position.copy(W.playerPos).addScaledVector(up, 1.2 + t * t * 30)
      .add(new THREE.Vector3(Math.cos(a), Math.sin(a * 0.5), Math.sin(a)).multiplyScalar(0.6 + t * 4));
  }));
  sparks.forEach((s) => (s.visible = false));
  g.sound.sfx('laugh');
  W.setSky('night', 3);
  await tween(g, 3, (t) => { goldU.uAlpha.value = t * 1.2; W.starU.uBoost.value = Math.sin(t * Math.PI) * 1.4; });
  ui.toast(`✦ ${dust} estrelas novas acenderam com as suas faíscas`, 3500);
  await g.talk([
    ['', 'Uma por uma, as estrelas voltaram. Primeiro as grandes, depois as miudinhas, depois umas que ninguém tinha visto antes.'],
    ['Musgo', 'Olha lá, bem pertinho do horizonte... aquela é nova.'],
    ['', 'Muito longe dali, em Cisco, a Vó Brasa levantou os olhos do braseiro e sorriu. Ela sabia quem tinha feito aquilo.'],
    ['Musgo', 'Estrela nova precisa de nome. Como vai chamar?'],
  ]);
  const c = await g.choose(['Estrela Vó Brasa', 'Estrela Musgo', 'Estrela das Sete Faíscas']);
  const name = ['Estrela Vó Brasa', 'Estrela Musgo', 'Estrela das Sete Faíscas'][c];
  await tween(g, 2.2, (t) => { W.starU.uBoost.value = Math.sin(t * Math.PI) * 1.8; goldU.uBoost.value = 0.6 + Math.sin(t * Math.PI); });
  await g.talk([
    [I, `${name}. Pra ninguém esquecer.`],
    ['Musgo', 'E amanhã?'],
    [I, 'Amanhã eu volto pra Cisco. Mas agora eu sei o caminho. E sei que o céu fica aceso quando cada um cuida de um pedacinho.'],
    ['', 'E naquela noite, pela primeira vez em muito tempo, ninguém no céu precisou de lanterna para achar o caminho de casa.'],
  ]);
  W.shot(null);
  W.hero.pose = 'walk';
  await ui.fade(1, 2000);
  ui.showHud(false);
  await ui.card('Fim', 'Ilo e o Céu Apagado', `Faíscas colhidas no caminho: ${g.state.dust} · Auroras vistas: ${g.state.sunsets} · Nova estrela: ${name}`, 5200);
  await ui.card('uma história original', 'Obrigado por jogar', 'Personagens, mundos, modelos, música e textos criados do zero para este jogo.', 4600);
  g.unlock();
}
