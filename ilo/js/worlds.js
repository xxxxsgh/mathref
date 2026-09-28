// Prólogo em Cisco e os seis mundinhos vizinhos.
import * as THREE from 'three';
import { fbm3, col, PAL, mesh, rng } from './style.js';
import * as $ from './props.js';
import { makePerson } from './hero.js';
import { SKIES } from './world.js';
import { I, dirLL, angleBetween, paint, decorate, departure, carry, nearestOf, opening, tween, smoothstep, worldPos } from './kit.js';

const bump = (amp, sc = 2.5) => (n) => (fbm3(n.x * sc, n.y * sc, n.z * sc) - 0.5) * amp;

/** Recompensa comum a todos os mundos: uma faísca para o braseiro. */
async function giveSpark(g, from) {
  g.state.sparks = (g.state.sparks || 0) + 1;
  g.save();
  g.sound.sfx('done');
  await g.ui.card(`faísca ${g.state.sparks} de 7`, `A faísca de ${from}`, '', 2000);
}

const KITES = [
  { label: 'Losango', svg: '<svg viewBox="0 0 120 80"><path d="M60 6 L86 38 L60 72 L34 38 Z M60 6 V72 M34 38 H86"/><path d="M60 72 q-8 4 0 8"/></svg>' },
  { label: 'Peixe', svg: '<svg viewBox="0 0 120 80"><path d="M60 8 Q92 34 60 70 Q28 34 60 8 Z"/><circle cx="60" cy="28" r="3"/><path d="M52 44 q8 6 16 0"/></svg>' },
  { label: 'Estrela', svg: '<svg viewBox="0 0 120 80"><path d="M60 6 L68 30 L94 30 L73 45 L81 70 L60 55 L39 70 L47 45 L26 30 L52 30 Z"/></svg>' },
  { label: 'Pássaro de papel', svg: '<svg viewBox="0 0 120 80"><path d="M60 26 L108 38 L66 42 L60 72 L54 42 L12 38 Z"/></svg>' },
];

// ═══════════════════════════ Prólogo · Cisco ═══════════════════════════
export async function chCisco(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('cisco');
  g.sound.play('cisco');
  W.setPlanet({ radius: 4, seg: 72, height: bump(0.25), color: paint('#b8a8c8', '#a898b8', '#8fb8a0', { scale: 2.6, seed: 3 }) });
  const BRAZ = dirLL(10, 60), BUCKET = dirLL(28, -40), BENCH = dirLL(58, 150), BENCHW = dirLL(-20, 20), KITE = dirLL(-25, 330);
  const CHIM = [dirLL(-12, 170), dirLL(22, 205), dirLL(-44, 228)];
  const WEED = [dirLL(50, 20), dirLL(-35, 118), dirLL(40, 258)];
  decorate(W, 11, { tufts: 24, rocks: 6, avoid: [BRAZ, BUCKET, BENCH, BENCHW, KITE, ...CHIM, ...WEED], minAng: 0.32, tuftColor: 0x8a9ac0 });

  const braz = W.place($.brazier(), BRAZ);
  W.collider(BRAZ, 0.45);
  W.hook((dt, t) => braz.userData.update(dt, t));
  const grandma = makePerson({ coat: 0xc8503a, trim: 0xf3c653, hair: 0xf1ece4, scale: 1.2, bodyBot: 0.36, skin: 0xe8b890 });
  const GN = dirLL(18, 78);
  W.place(grandma.root, GN, { face: braz.position });
  W.addActor(grandma);
  W.collider(GN, 0.35);
  const bun = mesh(new THREE.SphereGeometry(0.12, 10, 8), 0xf1ece4, { outline: 0.012 });
  bun.position.set(0, 0.28, -0.12);
  grandma.head.add(bun);

  const chims = CHIM.map((n) => {
    const c = W.place($.chimney(), n);
    W.collider(n, 0.4);
    W.hook((dt) => c.userData.update(dt));
    return c;
  });
  const bucket = W.place($.coalBucket(), BUCKET);
  W.place($.broom(), dirLL(-6, 188), { yaw: 1 });
  const bn = W.place($.bench(), BENCH, { yaw: 2 });
  W.collider(BENCH, 0.35);
  const bench = W.place($.table(PAL.wood, 1.0, 0.6, 0.55), BENCHW);
  W.collider(BENCHW, 0.5);
  const sticks = mesh(new THREE.BoxGeometry(0.8, 0.03, 0.03), PAL.wood, { outline: 0.006 });
  sticks.position.set(0, bench.userData.top + 0.02, 0);
  sticks.rotation.y = 0.5;
  const paper = mesh(new THREE.BoxGeometry(0.5, 0.01, 0.4), 0xf4ead5, { outline: 0.006 });
  paper.position.set(0.1, bench.userData.top + 0.01, -0.05);
  bench.add(sticks, paper);

  W.ctrl.dist = 5.4;
  W.spawn(dirLL(30, 70), BRAZ);
  W.mode = 'walk';
  const talkGrandma = (lines) => g.talk(lines, { npc: grandma });

  g.lock();
  await ui.fade(1, 10);
  await ui.card('Prólogo', 'A noite em que o céu piscou', '', 2600);
  await g.talk([
    ['', 'Em Cisco, uma lua do tamanho de um quintal, moravam Ilo e a Vó Brasa.'],
    ['', 'Toda noite, a Vó alimentava o braseiro, e uma fumacinha dourada subia para manter as estrelas acesas.'],
    ['', 'Mas naquela noite, uma por uma, as estrelas começaram a piscar... e a apagar.'],
  ]);
  ui.setChapter('Prólogo · Cisco');
  ui.fade(0, 1400);
  await g.wait(0.8);
  g.unlock();
  await talkGrandma([
    ['Vó Brasa', 'Ilo! Vem cá, meu bem. O braseiro está fraquinho, fraquinho.'],
    ['Vó Brasa', 'As ervas-de-sombra brotaram de novo, as chaminés estão entupidas de fuligem e o carvão ficou lá do outro lado.'],
    [I, 'Deixa comigo, Vó!'],
  ]);

  ui.setObjectives([
    { id: 'weed', text: 'Arrancar ervas-de-sombra (0/3)' },
    { id: 'chim', text: 'Varrer as chaminés (0/3)' },
    { id: 'coal', text: 'Levar o carvão até o braseiro' },
  ]);
  let hand = null, pulled = 0, swept = 0;
  const weeds = WEED.map((n) => {
    const s = W.place($.shadeWeed(), n);
    s.userData.n = n;
    const it = W.interact({
      at: s, r: 1.4, hold: 0.8, pose: 'pull', label: 'Arrancar a erva-de-sombra',
      act: async () => {
        W.removeInteract(it);
        g.sound.sfx('pluck');
        await tween(g, 0.45, (t) => { s.position.copy(n).multiplyScalar(W.ground(n) + t * 0.6); s.scale.setScalar(1 - t); });
        s.visible = false;
        s.userData.done = true;
        pulled++;
        braz.userData.power += 0.08;
        ui.objText('weed', `Arrancar ervas-de-sombra (${pulled}/3)`);
        if (pulled === 1) g.say(I, 'Credo, ela tentou morder minha luva!');
        if (pulled === 3) ui.check('weed');
      },
    });
    return s;
  });
  chims.forEach((c, i) => {
    const it = W.interact({
      at: c, r: 1.6, hold: 1.1, pose: 'pull', label: 'Varrer a fuligem',
      act: async () => {
        W.removeInteract(it);
        c.userData.clean = true;
        c.userData.done = true;
        g.sound.sfx('puff');
        swept++;
        braz.userData.power += 0.08;
        ui.objText('chim', `Varrer as chaminés (${swept}/3)`);
        if (swept === 1) await g.say(I, 'Atchim! Fumaça limpinha sobe mais alto.');
        if (swept === 3) ui.check('chim');
      },
    });
    c.userData.n = CHIM[i];
  });
  const bIt = W.interact({
    at: bucket, r: 1.4, label: 'Pegar o balde de carvão', when: () => !hand,
    act: () => { hand = 'coal'; carry(W, bucket, 'hand'); g.sound.sfx('page'); W.removeInteract(bIt); },
  });
  W.interact({
    at: braz, r: 2, label: 'Pôr carvão no braseiro', when: () => hand === 'coal',
    act: async () => {
      W.hero.pose = 'reach';
      g.sound.sfx('puff');
      await g.wait(0.8);
      W.hero.pose = 'walk';
      bucket.removeFromParent();
      hand = null;
      braz.userData.power += 0.25;
      ui.check('coal');
    },
  });
  let auroras = 0;
  W.interact({
    at: bn, r: 1.5, label: 'Sentar e olhar o céu',
    act: async () => {
      g.lock();
      W.hero.pose = 'sit';
      const c = W.ctrl;
      W.shot(W.playerPos.clone().addScaledVector(c.n, 1.6).addScaledVector(c.face, -3.2), W.playerPos.clone().addScaledVector(c.n, 2.4).addScaledVector(c.face, 4), c.n);
      await W.setSky('rose', 2.4);
      g.state.sunsets++; auroras++;
      ui.toast(`Auroras vistas: ${g.state.sunsets}`);
      if (auroras === 1) await g.say(I, 'Quando a aurora passa por Cisco, parece que o céu está respirando.');
      else await g.wait(1.2);
      await W.setSky('cisco', 2.2);
      W.shot(null);
      W.hero.pose = 'walk';
      g.unlock();
    },
  });
  W.guide = () => {
    if (hand) return BRAZ;
    const l = [];
    weeds.forEach((s) => { if (!s.userData.done) l.push(s.userData.n); });
    chims.forEach((c) => { if (!c.userData.done) l.push(c.userData.n); });
    if (!ui.isDone('coal')) l.push(BUCKET);
    return l.length ? nearestOf(W, l) : null;
  };

  await g.until(() => ['weed', 'chim', 'coal'].every((id) => ui.isDone(id)));
  W.guide = GN;
  let ok = false;
  let gi = W.interact({ at: grandma.root, r: 2.2, label: 'Falar com a Vó Brasa', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(gi);
  await talkGrandma([
    ['Vó Brasa', 'Muito bem, meu bem. O fogo está alto... e mesmo assim as estrelas continuam apagando.'],
    [I, 'Então o problema não é o fogo?'],
    ['Vó Brasa', 'Não. Uma estrela se apaga quando algum mundinho perde uma coisa de que gostava muito.'],
    ['Vó Brasa', 'E quando alguém ajuda esse mundinho, sobra uma faísca. Sete faíscas, Ilo. Com sete, a gente reacende o céu inteiro.'],
    [I, 'Sete... e como eu chego lá?'],
    ['Vó Brasa', 'Do jeito que eu cheguei aqui quando tinha a tua idade: de pipa. Tem varetas e papel na bancada.'],
  ]);
  ui.addObjective({ id: 'kite', text: 'Montar a pipa na bancada' });
  W.guide = BENCHW;
  ok = false;
  gi = W.interact({ at: bench, r: 1.8, label: 'Montar a pipa', act: () => { ok = true; } });
  await g.until(() => ok);
  W.removeInteract(gi);
  g.lock();
  await g.say('', 'Que desenho vai ter a sua pipa?');
  const k = await ui.sketch(KITES);
  g.state.kite = k;
  g.save();
  sticks.visible = paper.visible = false;
  g.unlock();
  ui.check('kite');
  await talkGrandma([
    ['Vó Brasa', ['Um losango, clássico! Voa firme em qualquer vento.', 'Um peixe! Vai nadar no céu, igualzinho.', 'Uma estrela, para lembrar o que você foi buscar.', 'Um pássaro de papel... esse volta sempre para casa.'][k]],
    ['Vó Brasa', 'Vai com cuidado. E lembra: não precisa consertar ninguém. Só precisa prestar atenção.'],
    [I, 'Eu volto com as sete. Prometo!'],
  ]);
  await departure(g, KITE, { to: 'ao Mundo do Relógio', sky: 'gold', planetColor: 0xd8b060 });
}

// ═══════════════════════════ I · O Mundo do Relógio ═══════════════════════════
export async function chRelogio(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('gold');
  g.sound.play('clock');
  const CLOCK = dirLL(55, 0);
  W.setPlanet({ radius: 4.4, seg: 80, height: bump(0.15), color: paint('#d8c890', '#c8b478', '#e8dca8', { scale: 3, seed: 5 }) });
  const clock = W.place($.bigClock(), CLOCK, { yaw: Math.PI });
  W.collider(CLOCK, 0.4);
  W.hook((dt) => clock.userData.update(dt));
  const hora = makePerson({ coat: 0x3a8a8a, trim: 0xd4a13a, hair: 0xb0a0a0, glasses: true, scale: 1.2, bodyBot: 0.36 });
  const HN = dirLL(45, 8);
  W.place(hora.root, HN, { face: W.surface(dirLL(0, 0)) });
  W.addActor(hora);
  W.collider(HN, 0.35);
  const r0 = rng(12);
  for (let i = 0; i < 7; i++) {
    const n = new THREE.Vector3(r0() - 0.5, r0() - 0.5, r0() - 0.5).normalize();
    if (angleBetween(n, CLOCK) < 0.6) continue;
    const gg = $.gear(0.2 + r0() * 0.3, [0xd4a13a, 0xb0b0c0, 0xc8804a][i % 3]);
    gg.position.y = 0.05;
    gg.rotation.x = -Math.PI / 2;
    const h = new THREE.Group(); h.add(gg);
    W.place(h, n);
  }
  decorate(W, 21, { tufts: 12, rocks: 5, avoid: [CLOCK, HN], minAng: 0.6, tuftColor: 0xa8a060 });

  ui.setObjectives([{ id: 'meet', text: 'Falar com a relojoeira' }]);
  W.ctrl.dist = 5.6;
  W.spawn(dirLL(-5, 0), CLOCK);
  W.guide = HN;
  await opening(g, 'Capítulo I', 'O Mundo do Relógio', 'Onde nenhum ponteiro se mexe.');
  let met = false;
  const mi = W.interact({ at: hora.root, r: 2.2, label: 'Falar com Dona Hora', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(mi);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    ['Dona Hora', 'Oh! Uma visita! Que horas são? Ah, não adianta perguntar: aqui são sempre três e dezessete.'],
    [I, 'O relógio parou?'],
    ['Dona Hora', 'Parou porque o Tique fugiu. É a engrenagem do meio, a mais importante. Sem ele, nenhum ponteiro anda.'],
    [I, 'Por que ele fugiu?'],
    ['Dona Hora', 'Não faço ideia! Eu dava corda nele de manhã, de tarde e de noite. Nunca deixei faltar nada.'],
    [I, '...Nem um descansinho?'],
    ['Dona Hora', 'Descanso? Engrenagem não descansa, menino. Engrenagem gira. Agora, se você for rápido, talvez consiga pegá-lo.'],
  ], { npc: hora });

  ui.addObjective({ id: 'tique', text: 'Alcançar o Tique' });
  const tq = $.runawayGear();
  const ts = { n: dirLL(-40, 160), face: new THREE.Vector3(1, 0, 0), wander: dirLL(10, 200) };
  W.stage.add(tq);
  const rr = rng(4);
  let caught = false;
  W.hook((dt) => {
    if (caught) return;
    const pd = angleBetween(ts.n, W.ctrl.n) * 4.4;
    let sp;
    if (pd < 2.4 && !W.locked) {
      const away = ts.n.clone().multiplyScalar(2).sub(W.ctrl.n).normalize();
      W.walkToward(ts, away, 3.1, dt, 0);
      sp = 3.1;
    } else {
      sp = 1.4;
      if (W.walkToward(ts, ts.wander, 1.4, dt, 0.4) <= 0.4) {
        ts.wander = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize();
        if (angleBetween(ts.wander, CLOCK) < 0.9) ts.wander.negate();
      }
    }
    tq.userData.wheel.rotation.z -= dt * sp * 3;
    tq.position.copy(ts.n).multiplyScalar(W.ground(ts.n));
    W.orient(tq, ts.n, ts.face);
  });
  W.guide = () => ts.n;
  let got = false;
  const ti = W.interact({ at: tq, r: 1.3, label: 'Conversar com o Tique', act: () => { got = true; } });
  await g.until(() => got);
  caught = true;
  W.removeInteract(ti);
  W.guide = null;
  ui.check('tique');
  await g.talk([
    [I, 'Ei, calma! Eu não vim te prender.'],
    ['', 'O Tique rodou sem sair do lugar, ofegante. Tic... tic... tic...'],
    [I, 'Você fugiu porque estava cansado, né?'],
    ['', 'Tic.'],
  ], { npc: tq, turn: false });
  const c = await g.ask(I, 'O que eu digo pra ele?', ['"Volta comigo. Eu peço pra ela te deixar descansar."', '"Você pode ficar aqui um pouco. Eu converso com ela primeiro."']);
  ui.addObjective({ id: 'back', text: 'Voltar até Dona Hora' });
  W.guide = HN;
  let back = false;
  const bi = W.interact({ at: hora.root, r: 2.2, label: 'Falar com Dona Hora', act: () => { back = true; } });
  await g.until(() => back);
  W.removeInteract(bi);
  W.guide = null;
  ui.check('back');
  await g.talk([
    [I, 'Achei o Tique. Ele não quebrou, Dona Hora. Ele só estava exausto.'],
    ['Dona Hora', 'Exausto... de girar? Mas é o trabalho dele.'],
    [I, 'Até o braseiro da minha vó apaga um pouquinho de madrugada, pra durar o dia seguinte inteiro.'],
    ['', 'Dona Hora ficou quieta. Depois tirou os óculos e limpou devagar.'],
    ['Dona Hora', c === 0 ? 'Traga ele, então. Daqui pra frente, uma hora por dia o relógio descansa. Vai ser a hora mais bonita do dia.' : 'Diga que ele pode voltar quando quiser. Eu espero. Acho que nunca tinha esperado ninguém antes.'],
  ], { npc: hora });
  tq.visible = false;
  clock.userData.running = true;
  g.sound.sfx('chime');
  ui.toast('Tic-tac! O relógio voltou a andar.');
  await giveSpark(g, 'Dona Hora');
  await departure(g, dirLL(-50, 90), { to: 'ao Mundo dos Sinos', sky: 'rose', planetColor: 0xe89ab8 });
}

// ═══════════════════════════ II · O Mundo dos Sinos ═══════════════════════════
export async function chSinos(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('rose');
  g.sound.play('bells');
  const MAE = dirLL(10, 40);
  W.setPlanet({ radius: 3.9, seg: 72, height: bump(0.2), color: paint('#f0b8c8', '#e0a0c0', '#f8d8a0', { scale: 2.8, seed: 9 }) });
  const mae = makePerson({ coat: 0xd4a13a, trim: 0xf4ead5, hat: 'top', hatColor: 0x3d3a55, feather: 0xff7ab8, scale: 1.2, bodyBot: 0.46, bodyTop: 0.16 });
  W.place(mae.root, MAE, { yaw: Math.PI });
  W.addActor(mae);
  W.collider(MAE, 0.45);
  const baton = mesh(new THREE.CylinderGeometry(0.01, 0.015, 0.4, 4), 0xf4ead5, { outline: 0.005 });
  baton.position.set(0, -0.1, 0.18);
  baton.rotation.x = 1.2;
  mae.arms[1].userData.hand.add(baton);
  decorate(W, 31, { tufts: 14, rocks: 4, avoid: [MAE], minAng: 0.5, tuftColor: 0xd87aa8 });
  const notes = [60, 62, 64, 67, 69];
  const BELLS = [dirLL(50, 90), dirLL(-20, 120), dirLL(25, 190), dirLL(-45, 250), dirLL(35, 310)];
  const bells = BELLS.map((n, i) => {
    const b = W.place($.bellPost([0xd4a13a, 0xc8b0e0, 0x9ad0c0, 0xffb0a0, 0xf0d890][i]), n, { yaw: i * 1.3 });
    W.collider(n, 0.2);
    b.userData.n = n;
    b.userData.swing = 0;
    return b;
  });
  W.hook((dt, t) => bells.forEach((b) => {
    b.userData.swing = Math.max(0, b.userData.swing - dt * 0.8);
    b.userData.bell.rotation.z = Math.sin(t * 12) * 0.5 * b.userData.swing;
  }));

  ui.setObjectives([{ id: 'meet', text: 'Falar com o maestro' }]);
  W.ctrl.dist = 5.2;
  W.spawn(dirLL(-35, 40), MAE);
  W.guide = MAE;
  await opening(g, 'Capítulo II', 'O Mundo dos Sinos', 'Cinco sinos e nenhuma música.');
  let met = false;
  const mi = W.interact({ at: mae.root, r: 2.2, label: 'Falar com o maestro', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(mi);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    ['Maestro Badalo', 'Silêncio, por favor! Estou tentando lembrar.'],
    [I, 'Lembrar o quê?'],
    ['Maestro Badalo', 'A minha música. A única que eu sabia de cor. Eu tocava nesses cinco sinos todas as noites... e um dia ela sumiu da minha cabeça.'],
    ['Maestro Badalo', 'Desde então eu fico aqui, com a batuta no ar, esperando ela voltar.'],
    [I, 'E se eu tocar os sinos pra você? Às vezes a gente lembra quando ouve.'],
    ['Maestro Badalo', 'Hum... Não custa tentar. Toque cada um deles. Devagar.'],
  ], { npc: mae });

  let rung = 0;
  const order = [];
  ui.addObjective({ id: 'bells', text: 'Tocar os cinco sinos (0/5)' });
  bells.forEach((b, i) => {
    const it = W.interact({
      at: b, r: 1.5, label: 'Tocar o sino',
      act: async () => {
        W.removeInteract(it);
        b.userData.done = true;
        b.userData.swing = 1;
        W.hero.pose = 'reach';
        const ctx = g.sound.ctx;
        if (ctx) [0, 0.35].forEach((d, k) => g.sound.tone(440 * Math.pow(2, (notes[i] + 12 * k - 69) / 12), ctx.currentTime + d, 2.2, { vol: 0.09, type: 'triangle' }));
        order.push(i);
        rung++;
        ui.objText('bells', `Tocar os cinco sinos (${rung}/5)`);
        await g.wait(0.5);
        W.hero.pose = 'walk';
      },
    });
  });
  W.guide = () => { const l = bells.filter((b) => !b.userData.done).map((b) => b.userData.n); return l.length ? nearestOf(W, l) : MAE; };
  await g.until(() => rung >= 5);
  ui.check('bells');
  let back = false;
  const bi = W.interact({ at: mae.root, r: 2.2, label: 'Voltar ao maestro', act: () => { back = true; } });
  await g.until(() => back);
  W.removeInteract(bi);
  W.guide = null;
  await g.talk([
    ['Maestro Badalo', 'Espere... toque de novo na cabeça: aquela ordem que você fez...'],
    ['', 'O maestro fechou os olhos e mexeu a batuta, bem de leve.'],
    ['Maestro Badalo', 'Não era essa. Mas... é bonita. É bonita também!'],
    [I, 'Talvez a música antiga não sumiu. Talvez ela só estivesse esperando uma nova para fazer companhia.'],
    ['Maestro Badalo', 'Vou chamar esta de "A música do menino da pipa". E vou tocar as duas: uma de manhã, outra de noite.'],
  ], { npc: mae });
  mae.pose = 'raise';
  const ctx = g.sound.ctx;
  if (ctx) order.forEach((i, k) => g.sound.tone(440 * Math.pow(2, (notes[i] - 57) / 12), ctx.currentTime + k * 0.4, 1.8, { vol: 0.09, type: 'triangle' }));
  bells.forEach((b, k) => setTimeout(() => (b.userData.swing = 1), k * 400));
  await g.wait(2.4);
  mae.pose = 'walk';
  await giveSpark(g, 'Maestro Badalo');
  await departure(g, dirLL(-30, 220), { to: 'ao Mundo do Nevoeiro', sky: 'teal', planetColor: 0x9ab0c8, music: 'sad' });
}

// ═══════════════════════════ III · O Mundo do Nevoeiro ═══════════════════════════
export async function chNevoeiro(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('teal');
  g.sound.play('sad');
  W.setPlanet({ radius: 4, seg: 72, height: bump(0.3), color: paint('#8aa8b8', '#7a98a8', '#a8c0c8', { scale: 2.5, seed: 13 }) });
  const WH = dirLL(20, 30);
  const whale = $.cloudWhale();
  W.place(whale, WH, { lift: 1.6, face: W.surface(dirLL(-20, 30)) });
  W.hook((dt, t) => {
    whale.position.copy(WH).multiplyScalar(W.ground(WH) + 1.6 + Math.sin(t * 0.8) * 0.2);
    whale.userData.tail.rotation.x = Math.sin(t * 1.5) * 0.25 - Math.PI / 2;
  });
  decorate(W, 41, { tufts: 12, rocks: 8, avoid: [WH], minAng: 0.4, tuftColor: 0x6a8a8a });
  const BABY = [dirLL(-30, 100), dirLL(45, 160), dirLL(-15, 240), dirLL(60, 300)];

  ui.setObjectives([{ id: 'meet', text: 'Descobrir quem está chorando' }]);
  W.ctrl.dist = 5.4;
  W.spawn(dirLL(-20, 20), WH);
  W.guide = WH;
  await opening(g, 'Capítulo III', 'O Mundo do Nevoeiro', 'Onde chove sem nuvem nenhuma.');
  let met = false;
  const mi = W.interact({ at: whale, r: 3, label: 'Falar com a baleia-nuvem', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(mi);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    [I, 'Oi, lá em cima! Por que está chovendo?'],
    ['Cúmulo', 'Porque eu estou chorando, ora. Baleia-nuvem chora em forma de garoa.'],
    [I, 'E por que você está chorando?'],
    ['Cúmulo', 'Meus nuvenzinhos. Eram quatro. Eu fiquei tão ocupada fazendo sombra bonita que não vi quando o vento os espalhou.'],
    ['Cúmulo', 'Agora eles estão escondidos pelo planeta, com medo de sair do nevoeiro.'],
    [I, 'Eu vou achar eles. Nuvem pequena não deve ser difícil de achar.'],
    ['Cúmulo', 'É difícil sim! Eles se parecem com tudo quando estão com medo.'],
  ], { npc: whale, turn: false });
  let got = 0;
  ui.addObjective({ id: 'babies', text: 'Encontrar os nuvenzinhos (0/4)' });
  const babies = BABY.map((n, i) => {
    const b = W.place($.cloudPuff(0.9), n, { lift: 0.25 });
    b.userData.n = n;
    const it = W.interact({
      at: b, r: 1.4, label: 'Chamar o nuvenzinho',
      act: async () => {
        W.removeInteract(it);
        b.userData.done = true;
        g.sound.sfx('star', i);
        await tween(g, 1.2, (t) => { b.position.copy(n).multiplyScalar(W.ground(n) + 0.25 + t * 6); b.scale.setScalar(0.9 * (1 - t * 0.7)); });
        b.visible = false;
        got++;
        ui.objText('babies', `Encontrar os nuvenzinhos (${got}/4)`);
      },
    });
    return b;
  });
  W.hook((dt, t) => babies.forEach((b, i) => { if (!b.userData.done) b.position.copy(b.userData.n).multiplyScalar(W.ground(b.userData.n) + 0.25 + Math.sin(t * 2 + i) * 0.06); }));
  W.guide = () => { const l = babies.filter((b) => !b.userData.done).map((b) => b.userData.n); return l.length ? nearestOf(W, l) : WH; };
  await g.until(() => got >= 4);
  ui.check('babies');
  W.setSky('dawn', 4);
  await g.talk([
    ['Cúmulo', 'Um, dois, três, quatro! Estão todos aqui, grudadinhos na minha barriga!'],
    [I, 'A chuva parou.'],
    ['Cúmulo', 'Parou. Sabe, eu passei tanto tempo tentando ser a nuvem mais bonita do céu...'],
    ['Cúmulo', '...que esqueci que o mais bonito que eu tinha estava bem embaixo de mim.'],
  ], { npc: whale, turn: false });
  await giveSpark(g, 'Cúmulo');
  await departure(g, dirLL(-45, 200), { to: 'ao Mundo das Pinhas', sky: 'gold', planetColor: 0xb89060, music: 'business' });
}

// ═══════════════════════════ IV · O Mundo das Pinhas ═══════════════════════════
export async function chPinhas(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('gold');
  g.sound.play('business');
  const PIN = dirLL(10, 0);
  W.setPlanet({ radius: 4.8, seg: 80, height: bump(0.22), color: paint('#b8a070', '#a89060', '#c8b888', { scale: 3, seed: 17 }) });
  const pin = makePerson({
    coat: 0xa86a3a, sleeves: 0xa86a3a, robe: false, legs: 0x6a4a30, scale: 1.1, skin: 0xd8a070, bodyBot: 0.34,
    decorate: (b) => {
      for (const sd of [-1, 1]) {
        const ear = mesh(new THREE.ConeGeometry(0.08, 0.2, 5), 0xa86a3a, { outline: 0.01 });
        ear.position.set(sd * 0.16, 0.28, 0);
        b.head.add(ear);
      }
      const tail = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const s = mesh(new THREE.SphereGeometry(0.2 - i * 0.015, 10, 8), 0xc8804a, { outline: 0.012 });
        s.position.set(0, 0.3 + i * 0.2, -0.3 - Math.sin(i * 0.7) * 0.25);
        tail.add(s);
      }
      b.body.add(tail);
    },
  });
  W.place(pin.root, PIN, { yaw: Math.PI });
  W.addActor(pin);
  W.collider(PIN, 0.4);
  const r0 = rng(21);
  for (let i = 0; i < 9; i++) {
    const n = new THREE.Vector3(r0() - 0.5, r0() - 0.5, r0() - 0.5).normalize();
    if (angleBetween(n, PIN) < 0.35) continue;
    W.place($.acornPile(), n, { yaw: i });
  }
  W.place($.acornPile(), dirLL(5, 8));
  decorate(W, 51, { tufts: 10, rocks: 8, avoid: [PIN], minAng: 0.5, tuftColor: 0x8a9a50 });

  ui.setObjectives([{ id: 'meet', text: 'Falar com o dono das pinhas' }]);
  W.ctrl.dist = 5.6;
  W.spawn(dirLL(-25, 0), PIN);
  W.guide = PIN;
  await opening(g, 'Capítulo IV', 'O Mundo das Pinhas', 'Tudo aqui tem dono. Até o que caiu do céu.');
  let met = false;
  const mi = W.interact({ at: pin.root, r: 2.2, label: 'Falar com Seu Pinhão', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(mi);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    ['Seu Pinhão', 'Não mexa nas pilhas! Cada pinha está contada. Trezentas e doze. Trezentas e treze, com aquela torta.'],
    [I, 'Eu não vou mexer. Eu vim porque uma estrela se apagou por aqui.'],
    ['Seu Pinhão', 'Se apagou nada. Caíram! Cinco estrelinhas caíram no meu mundo hoje de manhã. Então são minhas.'],
    [I, 'Suas? Mas elas moram lá em cima.'],
    ['Seu Pinhão', 'Caiu no meu chão, é meu. É a regra. Eu só não consigo achar onde elas rolaram...'],
    ['Seu Pinhão', 'Você tem olho bom, não tem? Encontra as cinco pra mim.'],
  ], { npc: pin });
  const spots = [dirLL(50, 70), dirLL(-30, 110), dirLL(20, 170), dirLL(-55, 240), dirLL(40, 290)];
  ui.addObjective({ id: 'stars', text: 'Encontrar as estrelas caídas (0/5)' });
  let got = 0;
  const stars = spots.map((n) => {
    const s = W.place($.fallenStar(), n);
    s.userData.n = n;
    const si = W.interact({
      at: s, r: 1.5, label: 'Apanhar a estrela',
      act: () => {
        W.removeInteract(si); s.visible = false; s.userData.done = true; got++;
        g.sound.sfx('star', got);
        ui.objText('stars', `Encontrar as estrelas caídas (${got}/5)`);
      },
    });
    return s;
  });
  W.hook((dt, t) => stars.forEach((s, i) => { s.userData.star.rotation.y = t * 2 + i; s.userData.star.position.y = 0.45 + Math.sin(t * 2 + i) * 0.08; }));
  W.guide = () => { const l = stars.filter((s) => !s.userData.done).map((s) => s.userData.n); return l.length ? nearestOf(W, l) : PIN; };
  await g.until(() => got >= 5);
  ui.check('stars');
  ui.addObjective({ id: 'back', text: 'Voltar ao Seu Pinhão' });
  let back = false;
  const bi = W.interact({ at: pin.root, r: 2.2, label: 'Falar com Seu Pinhão', act: () => { back = true; } });
  await g.until(() => back);
  W.removeInteract(bi);
  W.guide = null;
  ui.check('back');
  await g.talk([
    [I, 'Achei as cinco. Estão quentinhas. Olha como elas piscam quando a gente segura.'],
    ['Seu Pinhão', 'Ótimo, ótimo. Vou guardar no fundo da pilha, embaixo das pinhas mais velhas.'],
    [I, 'Mas lá embaixo ninguém vai ver elas brilhando.'],
    ['Seu Pinhão', 'E precisa ver? O importante é que são minhas.'],
  ], { npc: pin });
  const c = await g.ask(I, 'O que eu faço com as estrelas?', ['Entregar ao Seu Pinhão', 'Perguntar se ele quer ver elas voando']);
  if (c === 0) {
    await g.talk([
      ['', 'Seu Pinhão enterrou as cinco estrelas bem fundo. O mundo inteiro ficou um tiquinho mais escuro.'],
      ['Seu Pinhão', '...'],
      ['Seu Pinhão', 'Engraçado. Tenho mais do que antes e parece que tenho menos.'],
      ['', 'Ele cavou de novo, devagar, e soltou uma delas. Só uma. Mas soltou.'],
    ], { npc: pin });
  } else {
    await g.talk([
      [I, 'Seu Pinhão... quer ver o que elas fazem quando a gente abre a mão?'],
      ['Seu Pinhão', 'Hum. Só uma olhadinha. E depois elas voltam!'],
    ], { npc: pin });
    g.lock();
    g.state.freed = true;
    const up = W.ctrl.n.clone();
    const flying = spots.map((n, i) => { const s = $.fallenStar(); s.scale.setScalar(0.8); W.place(s, W.ctrl.n, { lift: 0.8 + i * 0.1 }); return s; });
    W.shot(W.playerPos.clone().addScaledVector(up, 2).addScaledVector(W.ctrl.face, -4), W.playerPos.clone().addScaledVector(up, 6), up);
    W.hero.pose = 'raise';
    g.sound.sfx('laugh');
    await tween(g, 2.6, (t) => flying.forEach((s, i) => {
      const a = i * 1.26 + t * 3;
      s.position.copy(W.playerPos).addScaledVector(up, 1 + t * 14 + i * 0.3)
        .add(new THREE.Vector3(Math.cos(a), Math.sin(a * 0.7), Math.sin(a)).multiplyScalar(1 + t * 2));
    }));
    flying.forEach((s) => (s.visible = false));
    g.state.dust += 5;
    ui.setDust(g.state.dust);
    W.shot(null);
    W.hero.pose = 'walk';
    g.unlock();
    await g.talk([
      ['Seu Pinhão', 'Elas... não voltaram.'],
      ['Seu Pinhão', 'Mas agora, de noite, eu vou olhar pra cima e saber quais são. Isso é quase melhor do que ter.'],
    ], { npc: pin });
  }
  await giveSpark(g, 'Seu Pinhão');
  await departure(g, dirLL(-40, 160), { to: 'ao Mundo do Farol', sky: 'dusk', planetColor: 0x7a8ac8, music: 'lamp' });
}

// ═══════════════════════════ V · O Mundo do Farol ═══════════════════════════
export async function chFarol(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  g.sound.play('lamp');
  const R = 2.6;
  const LH = dirLL(20, 0);
  W.setPlanet({ radius: R, seg: 56, height: bump(0.12, 3), color: paint('#8a98c8', '#7a88b8', '#a8b8d8', { scale: 3, seed: 21 }) });
  const lh = $.lighthouse();
  lh.scale.setScalar(0.8);
  W.place(lh, LH);
  W.collider(LH, 0.35);
  W.hook((dt) => lh.userData.update(dt));
  const tuca = makePerson({
    coat: 0x3f6a4a, hat: 'cap', hatColor: 0xd8504a, scale: 0.95, robe: false, legs: 0x2a4a3a, legLen: 0.4, skin: 0x8ab87a,
    decorate: (b) => {
      const shell = mesh(new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x8a6a3a, { outline: 0.015 });
      shell.rotation.x = -Math.PI / 2;
      shell.position.set(0, b.hipY + 0.25, -0.2);
      b.body.add(shell);
    },
  });
  const TN = dirLL(20, 30);
  W.place(tuca.root, TN, { face: lh.position });
  W.addActor(tuca);
  W.collider(TN, 0.35);

  W.sunMode = 'fixed';
  const DAY = 12;
  const nightSky = { ...SKIES.night }, daySky = { ...SKIES.dusk, top: '#6a8ad0', horizon: '#ffd0a0', sun: 1, stars: 0.1 };
  let clock = 0, running = true;
  const sunAt = (t) => new THREE.Vector3(Math.cos(t / DAY * Math.PI * 2), 0.35, Math.sin(t / DAY * Math.PI * 2)).normalize();
  const dayness = () => W.sunDir.dot(LH);
  let skyK = null;
  W.hook((dt) => {
    if (!running) return;
    clock += dt;
    W.sunDir.copy(sunAt(clock));
    const k = smoothstep(-0.35, 0.35, W.sunDir.dot(W.ctrl.n));
    if (skyK === null || Math.abs(skyK - k) > 0.01) { skyK = k; W.setSky(lerpSky(nightSky, daySky, k)); }
  });
  decorate(W, 61, { tufts: 6, rocks: 3, avoid: [LH, TN], minAng: 0.6, tuftColor: 0x7a8ab8 });
  // cometinhos passando ao longe (os "navios" do céu)
  const comets = [];
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.SphereGeometry(0.15, 8, 6), 0xf4ead5, { outline: 0.01 });
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.2, 8), new THREE.MeshBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.5 }));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = 0.7;
    c.add(tail);
    W.stage.add(c);
    comets.push(c);
  }
  W.hook((dt, t) => comets.forEach((c, i) => {
    const a = t * 0.25 + i * 2.1;
    c.position.set(Math.cos(a) * (7 + i), Math.sin(a * 0.7 + i) * 3, Math.sin(a) * (7 + i));
  }));

  let helping = false;
  W.hook(() => {
    if (helping) return;
    const want = dayness() < 0;
    if (want !== lh.userData.on) lh.userData.set(want);
  });
  ui.setObjectives([{ id: 'meet', text: 'Falar com a faroleira' }]);
  W.ctrl.dist = 4.8;
  W.spawn(dirLL(-35, 10), LH);
  W.guide = TN;
  await opening(g, 'Capítulo V', 'O Mundo do Farol', 'Um dia inteiro a cada doze segundos.');
  let met = false;
  const mi = W.interact({ at: tuca.root, r: 1.8, label: 'Falar com a faroleira', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(mi);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    ['Faroleira Tuca', 'Bem-vindo, bem-vindo, desculpa não parar pra te dar a mão... é que já vai anoitecer de novo!'],
    [I, 'De novo? Mas acabou de amanhecer!'],
    ['Faroleira Tuca', 'Meu mundinho gira ligeiro. E os cometas passam por aqui toda hora, coitados, sem enxergar nada no escuro.'],
    ['Faroleira Tuca', 'Eu acendo o farol quando escurece e apago quando clareia, pra economizar a luz. Faz cem anos que não durmo direito.'],
    ['Faroleira Tuca', 'Tartaruga vive muito... mas cansa igual.'],
    [I, 'Deita um pouco. Eu cuido do farol por você.'],
    ['Faroleira Tuca', 'Você faria isso? Acende quando anoitecer e apaga quando o sol voltar. Nem antes, nem depois!'],
  ], { npc: tuca });
  helping = true;
  tuca.pose = 'sit';
  let ok = 0;
  ui.addObjective({ id: 'lamp', text: 'Cuidar do farol no tempo certo (0/4)' });
  const li = W.interact({
    at: lh, r: 1.6, label: () => (lh.userData.on ? 'Apagar o farol' : 'Acender o farol'),
    act: async () => {
      if (ok >= 4) return;
      const d = dayness();
      const right = lh.userData.on ? d > -0.1 : d < 0.1;
      W.hero.pose = 'reach';
      setTimeout(() => (W.hero.pose = 'walk'), 400);
      if (right) {
        lh.userData.set(!lh.userData.on);
        g.sound.sfx('lamp');
        ok++;
        ui.objText('lamp', `Cuidar do farol no tempo certo (${ok}/4)`);
      } else {
        g.sound.sfx('fail');
        ui.toast(lh.userData.on ? 'Ainda está escuro! Espere o sol.' : 'Ainda é dia! Espere escurecer.', 1600);
      }
    },
  });
  W.guide = LH;
  await g.until(() => ok >= 4);
  W.removeInteract(li);
  W.guide = null;
  ui.check('lamp');
  await g.talk([
    ['', 'A faroleira roncava baixinho, com a cabeça meio pra dentro do casco.'],
    ['Faroleira Tuca', '...Hã? Já é amanhã? Eu dormi quatro dias inteiros!'],
    [I, 'Quatro dias de doze segundos.'],
    ['Faroleira Tuca', 'Foi o melhor cochilo do século! Sabe o que eu vou fazer? Pedir pros cometas me ajudarem. Quem é ajudado a vida toda também pode ajudar um pouquinho.'],
  ], { npc: tuca });
  tuca.pose = 'walk';
  await giveSpark(g, 'Faroleira Tuca');
  await departure(g, dirLL(-40, 180), { to: 'ao Mundo dos Mapas', sky: 'teal', planetColor: 0x8ab89a, music: 'geo' });
  running = false;
}

function lerpSky(a, b, t) {
  const o = {};
  for (const k of Object.keys(a)) {
    if (typeof a[k] === 'number') o[k] = a[k] + (b[k] - a[k]) * t;
    else o[k] = '#' + col(a[k]).lerp(col(b[k]), t).getHexString();
  }
  return o;
}

// ═══════════════════════════ VI · O Mundo dos Mapas ═══════════════════════════
export async function chMapas(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('teal');
  g.sound.play('geo');
  const TATA = dirLL(15, 0), HILL = dirLL(40, 120), LAKE = dirLL(-30, 190), CRATER = dirLL(25, 260);
  const base = paint('#a8c8a0', '#98b890', '#c8d8a8', { scale: 2.4, seed: 25 });
  const water = col('#5a8ab8'), water2 = col('#7aa8d0');
  W.setPlanet({
    radius: 6.5, seg: 96,
    height: (n) => (fbm3(n.x * 2, n.y * 2, n.z * 2) - 0.5) * 0.35 + 2.2 * Math.exp(-Math.pow(angleBetween(n, HILL) / 0.28, 2))
      - 0.25 * smoothstep(0.3, 0.1, angleBetween(n, LAKE)) - 0.6 * Math.exp(-Math.pow(angleBetween(n, CRATER) / 0.12, 2)),
    color: (n) => {
      if (angleBetween(n, LAKE) < 0.2) return (fbm3(n.x * 9, n.y * 9, n.z * 9) > 0.55 ? water2 : water).clone();
      if (angleBetween(n, HILL) < 0.22) return col('#b8a898');
      if (angleBetween(n, CRATER) < 0.14) return col('#8a7a8a');
      return base(n);
    },
  });
  const tata = makePerson({
    coat: 0x5a4a6a, trim: 0xd8c8a0, glasses: true, scale: 1.1, bodyBot: 0.4, skin: 0x6a5a6a, nose: 0xf0a0b0,
    decorate: (b) => { const n = b.head.children.find((c) => c.geometry && c.geometry.parameters && c.geometry.parameters.radius < 0.05); if (n) n.scale.setScalar(2.2); },
  });
  W.place(tata.root, TATA, { yaw: Math.PI });
  W.addActor(tata);
  W.collider(TATA, 0.45);
  W.place($.mapTable(), dirLL(10, 0));
  W.collider(dirLL(10, 0), 0.9);
  decorate(W, 71, { tufts: 36, rocks: 12, avoid: [TATA, HILL, LAKE, CRATER], minAng: 0.3, tuftColor: 0x6a9a5a });

  ui.setObjectives([{ id: 'meet', text: 'Visitar a cartógrafa' }]);
  W.ctrl.dist = 6.2;
  W.spawn(dirLL(-20, 0), TATA);
  W.guide = TATA;
  await opening(g, 'Capítulo VI', 'O Mundo dos Mapas', 'Um mapa enorme... todo em branco.');
  let met = false;
  const mi = W.interact({ at: tata.root, r: 2.6, label: 'Falar com Tatá', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(mi);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    ['Tatá', 'Quem está aí? Fale alto, que meus óculos são de enfeite. Eu sou toupeira, enxergo quase nada.'],
    [I, 'Sou o Ilo. Que mapa grande! Mas... ele está vazio.'],
    ['Tatá', 'Pois é. Sou cartógrafa e nunca desenhei meu próprio mundo. Tenho vergonha de sair e esbarrar em tudo.'],
    ['Tatá', 'Passei a vida desenhando mapas dos lugares que os outros me contavam. Do meu, ninguém nunca me contou nada.'],
    [I, 'Então eu te conto! Eu vou até lá e volto descrevendo.'],
    ['Tatá', 'Faria isso? Espetei três bandeirinhas onde o chão parece diferente. Vá ver o que tem.'],
  ], { npc: tata });

  ui.addObjective({ id: 'map', text: 'Descrever os lugares marcados (0/3)' });
  const places = [
    { at: HILL, flag: 0xe04a5f, label: 'Olhar bem: a colina', line: 'Uma colina redonda como um pão! Lá de cima dá pra ver o mundo inteiro fazendo curva.' },
    { at: dirLL(-19, 184), flag: 0x3a7ac8, label: 'Olhar bem: o lago', line: 'Um lago azul-escuro, tão parado que as estrelas tomam banho nele.' },
    { at: dirLL(17, 252), flag: 0xf3c653, label: 'Olhar bem: o buraco', line: 'Um buraco redondinho, com a terra fofinha... parece a porta de uma casa de toupeira!' },
  ];
  let seen = 0;
  places.forEach((p) => {
    const f = W.place($.flag(p.flag), p.at);
    const fi = W.interact({
      at: f, r: 2, label: p.label,
      act: async () => {
        W.removeInteract(fi); p.done = true; seen++;
        g.sound.sfx('page');
        ui.objText('map', `Descrever os lugares marcados (${seen}/3)`);
        await g.say(I, p.line);
      },
    });
    W.hook((dt, t) => { f.userData.cloth.rotation.y = Math.sin(t * 3 + p.flag) * 0.3; });
  });
  W.guide = () => { const l = places.filter((p) => !p.done).map((p) => p.at); return l.length ? nearestOf(W, l) : TATA; };
  await g.until(() => seen >= 3);
  ui.check('map');
  let rep = false;
  const ri = W.interact({ at: tata.root, r: 2.6, label: 'Contar tudo à Tatá', act: () => { rep = true; } });
  await g.until(() => rep);
  W.removeInteract(ri);
  W.guide = null;
  g.sound.sfx('page');
  await g.talk([
    ['Tatá', 'Uma colina como pão, um lago onde as estrelas tomam banho, e... uma porta de toupeira?'],
    ['Tatá', 'Ah! É a minha toca antiga! Eu achei que tinha perdido ela pra sempre.'],
    ['Tatá', 'Veja só. Eu desenhando o mundo dos outros, e o meu estava me esperando o tempo todo.'],
    ['Tatá', 'E o seu mundo, menino? Como ele é?'],
  ], { npc: tata });
  const said = new Set();
  const opts = ['Tem um braseiro que acende o céu.', 'Tem uma avó que me ensinou a prestar atenção.'];
  while (said.size < 2) {
    const left = opts.filter((_, i) => !said.has(i));
    const c = await g.choose(left);
    const idx = opts.indexOf(left[c]);
    said.add(idx);
    await g.talk([['Tatá', idx === 0 ? 'Um braseiro no mapa: vou desenhar com tinta laranja.' : 'Isso não cabe no mapa... mas vou escrever na borda, bem caprichado.']], { npc: tata });
  }
  await g.talk([
    ['Tatá', 'Escute uma coisa que eu ouvi dos ventos: faíscas perdidas gostam de cair na Grande Duna. É um mundo grande, de areia, com lanternas que ninguém acende.'],
    [I, 'Então é pra lá que eu vou.'],
  ], { npc: tata });
  await giveSpark(g, 'Tatá');
  await departure(g, dirLL(-35, 60), { to: 'à Grande Duna', sky: 'day', planetColor: 0xe8c98f, duration: 24 });
}
