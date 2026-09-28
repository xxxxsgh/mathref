// Capítulos I a VII: o asteroide B-612 e os seis asteroides das pessoas grandes.
import * as THREE from 'three';
import { fbm3, col, PAL, mesh, rng } from './style.js';
import * as $ from './props.js';
import { makePerson } from './prince.js';
import { SKIES } from './world.js';
import { P, dirLL, angleBetween, paint, decorate, departure, carry, nearestOf, opening, tween, smoothstep, worldPos } from './kit.js';

const bump = (amp, sc = 2.5) => (n) => (fbm3(n.x * sc, n.y * sc, n.z * sc) - 0.5) * amp;

// ═══════════════════════════ I · B-612 ═══════════════════════════
export async function chB612(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('b612');
  g.sound.play('b612');
  W.setPlanet({ radius: 4, seg: 72, height: bump(0.25), color: paint('#c9b28c', '#b49a7a', '#9fb877', { scale: 2.6, seed: 3 }) });
  const ROSE = dirLL(5, 70), CAN = dirLL(30, -25), SCREEN = dirLL(-38, 292), CHAIR = dirLL(58, 150), BIRDS = dirLL(-18, 12);
  const VOLC = [dirLL(-12, 170), dirLL(20, 205), dirLL(-44, 228)];
  const SPR = [dirLL(50, 30), dirLL(-35, 118), dirLL(40, 258)];
  decorate(W, 11, { tufts: 26, rocks: 6, avoid: [ROSE, CAN, SCREEN, CHAIR, BIRDS, ...VOLC, ...SPR], minAng: 0.32 });

  // a rosa, a redoma e as tarefas da manhã
  const rs = W.place($.rose(), ROSE);
  W.collider(ROSE, 0.3);
  const globeN = dirLL(-6, 84);
  W.place($.glassGlobe(), globeN);
  W.collider(globeN, 0.5);
  W.hook((dt, t) => { rs.userData.bloom.rotation.z = Math.sin(t * 1.3) * 0.08; });

  const volcs = VOLC.map((n, i) => {
    const v = W.place($.volcano(i < 2), n);
    W.collider(n, 0.5);
    W.hook((dt) => v.userData.update(dt));
    return v;
  });
  const can = W.place($.wateringCan(), CAN);
  const screen = W.place($.folding(), SCREEN, { yaw: 0.6 });
  const ch = W.place($.chair(), CHAIR, { yaw: 2 });
  W.collider(CHAIR, 0.3);
  W.place($.rake(), dirLL(-8, 185));

  ui.setObjectives([
    { id: 'spr', text: 'Arrancar brotos de baobá (0/3)' },
    { id: 'vol', text: 'Limpar os vulcões (0/3)' },
    { id: 'water', text: 'Regar a rosa' },
    { id: 'screen', text: 'Levar o biombo até a rosa' },
  ]);
  W.ctrl.dist = 5.4;
  W.spawn(dirLL(22, 40), ROSE);

  let hand = null; // 'can' | 'screen'
  let pulled = 0, cleaned = 0, phase = 'tasks', metRose = false;
  const sprouts = SPR.map((n) => {
    const s = W.place($.sprout(), n);
    const it = W.interact({
      at: s, r: 1.4, hold: 0.8, pose: 'pull', label: 'Arrancar o broto de baobá',
      act: async () => {
        W.removeInteract(it);
        g.sound.sfx('pluck');
        await tween(g, 0.45, (t) => { s.position.copy(n).multiplyScalar(W.ground(n) + t * 0.6); s.scale.setScalar(1 - t); });
        s.visible = false;
        s.userData.done = true;
        pulled++;
        ui.objText('spr', `Arrancar brotos de baobá (${pulled}/3)`);
        if (pulled === 1) g.say(P, 'Os baobás começam pequenininhos... mas, se a gente deixa, racham o planeta inteiro!');
        if (pulled === 3) ui.check('spr');
      },
    });
    s.userData.n = n;
    return s;
  });
  volcs.forEach((v, i) => {
    const it = W.interact({
      at: v, r: 1.6, hold: 1.1, pose: 'pull', label: i < 2 ? 'Limpar o vulcão' : 'Limpar o vulcão extinto',
      act: async () => {
        W.removeInteract(it);
        v.userData.clean = true;
        v.userData.done = true;
        g.sound.sfx('puff');
        cleaned++;
        ui.objText('vol', `Limpar os vulcões (${cleaned}/3)`);
        if (i === 2) await g.say(P, 'Este está extinto... mas nunca se sabe!');
        else if (cleaned === 1) await g.say(P, 'Vulcões bem limpos queimam devagar, sem erupções. Servem até para esquentar o café da manhã.');
        if (cleaned === 3) ui.check('vol');
      },
    });
  });
  const canIt = W.interact({
    at: can, r: 1.4, label: 'Pegar o regador', when: () => !hand && !ui.isDone('water'),
    act: () => { hand = 'can'; carry(W, can, 'hand'); g.sound.sfx('page'); W.removeInteract(canIt); },
  });
  const scrIt = W.interact({
    at: screen, r: 1.6, label: 'Pegar o biombo', when: () => !ui.isDone('screen'),
    act: async () => {
      if (hand) { await g.say(P, 'Estou com as mãos ocupadas.'); return; }
      hand = 'screen'; carry(W, screen, 'back'); g.sound.sfx('page'); W.removeInteract(scrIt);
    },
  });
  let sunsetsHere = 0;
  W.interact({
    at: ch, r: 1.5, label: 'Sentar e ver o pôr do sol',
    act: async () => {
      g.lock();
      W.prince.pose = 'sit';
      const c = W.ctrl;
      W.shot(W.playerPos.clone().addScaledVector(c.n, 1.6).addScaledVector(c.face, -3.2), W.playerPos.clone().addScaledVector(c.n, 1.4).addScaledVector(c.face, 4), c.n);
      await W.setSky('sunset', 2.4);
      g.state.sunsets++; sunsetsHere++;
      ui.toast(`Pores do sol vistos: ${g.state.sunsets}`);
      if (sunsetsHere === 1) await g.say(P, 'Sabe... quando a gente está muito triste, gosta de ver o sol se pôr.');
      else if (sunsetsHere === 3) await g.say(P, 'No meu planeta basta puxar a cadeira alguns passos. Um dia eu vi o sol se pôr quarenta e três vezes!');
      else await g.wait(1.2);
      await W.setSky('b612', 2.2);
      W.shot(null);
      W.prince.pose = 'walk';
      g.unlock();
    },
  });

  const roseLabel = () => {
    if (phase === 'bye') return 'Despedir-se da rosa';
    if (hand === 'can') return 'Regar a rosa';
    if (hand === 'screen') return 'Colocar o biombo';
    return 'Falar com a rosa';
  };
  W.interact({
    at: rs, r: 1.8, label: roseLabel, when: () => phase !== 'gone',
    act: async () => {
      if (phase === 'bye') { phase = 'gone'; return; }
      if (hand === 'can') {
        W.prince.pose = 'reach';
        g.sound.sfx('water');
        await g.wait(1.2);
        W.prince.pose = 'walk';
        can.removeFromParent();
        hand = null;
        ui.check('water');
        await g.talk([
          ['Rosa', 'Ah... que frescor. Tu és atencioso, afinal.'],
          ['Rosa', ui.isDone('screen') ? 'Agora sim, estou perfeitamente confortável.' : 'Mas tenho horror das correntes de ar. Não terias um biombo?'],
        ], { npc: rs, turn: false });
        return;
      }
      if (hand === 'screen') {
        screen.removeFromParent();
        screen.scale.setScalar(1);
        W.place(screen, dirLL(12, 64), { face: worldPos(rs) });
        hand = null;
        ui.check('screen');
        await g.talk([['Rosa', 'Assim está melhor. À noite me porás sob uma redoma, não é? Faz muito frio no teu planeta.']], { npc: rs, turn: false });
        return;
      }
      if (!metRose) {
        metRose = true;
        await g.talk([
          ['Rosa', 'Ah! Acabo de acordar... Desculpa, ainda estou toda despenteada.'],
          [P, 'Como tu és bonita!'],
          ['Rosa', 'Não é mesmo? E eu nasci junto com o sol...'],
          ['', 'Ela não era muito modesta, mas era tão comovente!'],
          ['Rosa', 'Acho que está na hora do café da manhã. Terias a bondade de pensar em mim?'],
        ], { npc: rs, turn: false });
      } else {
        await g.talk([['Rosa', ['Não tenho medo dos tigres. Tenho quatro espinhos!', 'Cof, cof... este vento!', 'Lá de onde eu vim... bem, não importa.'][Math.floor(Math.random() * 3)]]], { npc: rs, turn: false });
      }
    },
  });

  // guia: a tarefa pendente mais próxima
  W.guide = () => {
    if (phase === 'bye') return ROSE;
    if (phase !== 'tasks') return null;
    const list = [];
    sprouts.forEach((s) => { if (!s.userData.done) list.push(s.userData.n); });
    volcs.forEach((v, i) => { if (!v.userData.done) list.push(VOLC[i]); });
    if (hand) list.length = 0, list.push(ROSE);
    else {
      if (!ui.isDone('water')) list.push(CAN);
      if (!ui.isDone('screen')) list.push(SCREEN);
    }
    return list.length ? nearestOf(W, list) : null;
  };

  await opening(g, 'Capítulo I', 'O asteroide B-612', 'Um planeta pouco maior que uma casa.');
  await g.talk([
    ['', 'O planeta de onde ele vinha era o asteroide B-612. Todas as manhãs, depois de se arrumar, ele arrumava com cuidado o planeta.'],
    [P, 'É uma questão de disciplina. Primeiro os baobás, depois os vulcões... e a minha flor.'],
  ]);

  await g.until(() => ['spr', 'vol', 'water', 'screen'].every((id) => ui.isDone(id)));
  await g.wait(0.6);
  await g.talk([
    [P, 'Pronto. Está tudo em ordem.'],
    [P, 'Mas ela é tão complicada... Levei a sério palavras sem importância e fiquei muito infeliz.'],
    [P, 'Eu devia tê-la julgado pelos atos, não pelas palavras. Mas eu era jovem demais para saber amá-la.'],
    ['', 'Ele resolveu aproveitar uma migração de pássaros selvagens para partir.'],
  ]);
  phase = 'bye';
  ui.addObjective({ id: 'bye', text: 'Despedir-se da rosa' });
  await g.until(() => phase === 'gone');
  await g.talk([
    [P, 'Adeus.'],
    ['', 'Ela não respondeu.'],
    [P, 'Adeus...'],
    ['Rosa', 'Eu fui uma tola. Peço-te perdão. Procura ser feliz.'],
    ['', 'Ele ficou surpreso com a ausência de censuras. Ficou ali, parado, com a redoma no ar.'],
    ['Rosa', 'Mas sim, eu te amo. Tu não soubeste de nada, por culpa minha. Não tem importância.'],
    ['Rosa', 'Deixa essa redoma. Não a quero mais.'],
    [P, 'Mas o vento...'],
    ['Rosa', 'Não estou tão resfriada assim. O ar fresco da noite vai me fazer bem. Eu sou uma flor.'],
    [P, 'Mas os bichos...'],
    ['Rosa', 'Preciso suportar duas ou três lagartas se quiser conhecer as borboletas. Dizem que são tão bonitas!'],
    ['Rosa', 'Não fiques aí parado, é irritante. Decidiste partir. Então vai.'],
    ['', 'Ela não queria que ele a visse chorar. Era uma flor tão orgulhosa...'],
  ], { npc: rs, turn: false });
  ui.check('bye');
  await departure(g, BIRDS, { to: 'asteroide 325', sky: 'rose', planetColor: 0x9a6ac0 });
}

// ═══════════════════════════ II · O Rei ═══════════════════════════
export async function chRei(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('rose');
  g.sound.play('king');
  const KING = dirLL(55, 0);
  const base = paint('#b59ac8', '#a58ab8', '#c8b0d8', { scale: 2.4, seed: 5 });
  const purple = col('#7b4fa6'), purple2 = col('#6a3f96'), ermine = col('#f8f4ec'), dot = col('#2a2342');
  W.setPlanet({
    radius: 4.4, seg: 80, height: bump(0.15),
    color: (n) => {
      const a = angleBetween(n, KING);
      if (a < 0.82) return (fbm3(n.x * 5, n.y * 5, n.z * 5) > 0.55 ? purple2 : purple).clone();
      if (a < 0.98) return fbm3(n.x * 18, n.y * 18, n.z * 18) > 0.66 ? dot.clone() : ermine.clone();
      return base(n);
    },
  });
  const king = makePerson({ coat: 0x8a4fc0, trim: 0xf8f4ec, hat: 'crown', beard: 0xf2efe8, beardLen: 2.2, scale: 1.45, bodyBot: 0.4 });
  W.place(king.root, KING, { yaw: Math.PI });
  W.addActor(king);
  W.collider(KING, 0.7);
  const throne = new THREE.Group();
  const seat = mesh(new THREE.BoxGeometry(0.9, 0.9, 0.2), 0xd4a13a);
  seat.position.set(0, 0.9, -0.55);
  throne.add(seat);
  W.place(throne, KING, { yaw: Math.PI });
  decorate(W, 21, { tufts: 12, rocks: 5, avoid: [KING], minAng: 1.05, tuftColor: 0x9a7ab8 });

  ui.setObjectives([{ id: 'king', text: 'Apresentar-se ao rei' }]);
  W.ctrl.dist = 5.6;
  W.spawn(dirLL(-5, 0), KING);
  W.guide = KING;
  await opening(g, 'Capítulo II', 'O Rei', 'Asteroide 325 — um rei que reinava sobre tudo.');

  let met = false;
  const kIt = W.interact({ at: king.root, r: 2.4, label: 'Falar com o rei', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(kIt);
  W.guide = null;
  await g.talk([
    ['Rei', 'Ah! Eis um súdito!'],
    ['', 'Para os reis, o mundo é muito simples: todos os homens são súditos.'],
    ['Rei', 'Aproxima-te, para que eu te veja melhor.'],
    () => { W.prince.pose = 'lookup'; },
    ['', 'O pequeno príncipe estava cansado da viagem. E bocejou.'],
    ['Rei', 'É contra a etiqueta bocejar na presença de um rei. Eu te proíbo!'],
    [P, 'Não consigo evitar... fiz uma longa viagem e não dormi.'],
    ['Rei', 'Então eu te ordeno que bocejes! Há anos não vejo ninguém bocejar. Vamos! Boceja de novo. É uma ordem.'],
  ], { npc: king });
  W.prince.pose = 'walk';
  const y = await g.choose(['(Bocejar obedientemente)', 'Assim fico intimidado... não consigo mais.']);
  await g.talk([
    y === 0 ? ['Rei', 'Hum! Hum! Muito bem. Eu te ordeno ora bocejar, ora...'] : ['Rei', 'Hum! Hum! Então eu... eu te ordeno ora bocejar, ora...'],
    ['', 'O rei fazia questão de que sua autoridade fosse respeitada. Mas, como era muito bom, dava ordens razoáveis.'],
    [P, 'Majestade... sobre o que reinais?'],
    ['Rei', 'Sobre tudo.'],
    [P, 'Sobre tudo? E as estrelas vos obedecem?'],
    ['Rei', 'Certamente. Obedecem na hora. Não tolero indisciplina.'],
    [P, 'Eu gostaria tanto de ver um pôr do sol... Ordenai ao sol que se ponha.'],
    ['Rei', 'Se eu ordenasse a um general que voasse de flor em flor como uma borboleta, e o general não obedecesse... de quem seria a culpa?'],
  ], { npc: king });
  const c2 = await g.choose(['Seria vossa, Majestade.', 'Seria do general.']);
  await g.talk([
    c2 === 0 ? ['Rei', 'Exato. É preciso exigir de cada um o que cada um pode dar. A autoridade repousa sobre a razão.'] : ['Rei', 'Errado! A culpa seria minha. É preciso exigir de cada um o que cada um pode dar.'],
    ['Rei', 'Terás o teu pôr do sol. Mas esperarei que as condições sejam favoráveis... Isso será por volta de sete e quarenta desta noite.'],
    [P, '(bocejando) Então acho que já vou indo...'],
    ['Rei', 'Não partas! Eu te faço ministro!'],
    [P, 'Ministro de quê?'],
    ['Rei', 'Da... da justiça!'],
    [P, 'Mas não há ninguém para julgar!'],
    ['Rei', 'Tenho quase certeza de que há um velho rato em algum lugar do meu planeta. Ouço-o de noite. Encontra-o, e o julgarás.'],
  ], { npc: king });

  // o velho rato passeia pelo planeta
  ui.check('king');
  ui.addObjective({ id: 'rat', text: 'Encontrar o velho rato' });
  const rat = $.rat();
  const rs = { n: dirLL(-40, 160), face: new THREE.Vector3(1, 0, 0), wander: dirLL(10, 200) };
  W.stage.add(rat);
  const rr = rng(4);
  let caught = false;
  const rh = W.hook((dt) => {
    if (caught) return;
    const pd = angleBetween(rs.n, W.ctrl.n) * 4.4;
    if (pd < 2.4 && !W.locked) {
      // foge do príncipe
      const away = rs.n.clone().multiplyScalar(2).sub(W.ctrl.n).normalize();
      W.walkToward(rs, away, 3.1, dt, 0);
    } else if (W.walkToward(rs, rs.wander, 1.4, dt, 0.4) <= 0.4) {
      rs.wander = new THREE.Vector3(rr() - 0.5, rr() - 0.5, rr() - 0.5).normalize();
      if (angleBetween(rs.wander, KING) < 0.9) rs.wander.negate();
    }
    rat.position.copy(rs.n).multiplyScalar(W.ground(rs.n));
    W.orient(rat, rs.n, rs.face);
  });
  W.guide = () => rs.n;
  let ratOk = false;
  const ratIt = W.interact({ at: rat, r: 1.3, label: 'Pegar o velho rato', act: () => { ratOk = true; } });
  await g.until(() => ratOk);
  caught = true;
  W.removeInteract(ratIt);
  W.guide = null;
  g.sound.sfx('chime');
  ui.check('rat');
  await g.talk([[P, 'Te achei! Tu és o velho rato do rei?'], ['', 'O rato mexeu o focinho, muito digno.']], { npc: rat, turn: false });
  const verdict = await g.ask(P, 'E agora? O rei quer que eu te julgue...', ['Condenar o rato', 'Perdoar o rato']);
  ui.addObjective({ id: 'back', text: 'Voltar ao rei' });
  W.guide = KING;
  let back = false;
  const bIt = W.interact({ at: king.root, r: 2.4, label: 'Falar com o rei', act: () => { back = true; } });
  await g.until(() => back);
  W.removeInteract(bIt);
  ui.check('back');
  W.guide = null;
  await g.talk([
    verdict === 0
      ? ['Rei', 'Condenarás à morte de vez em quando, e a vida dele dependerá da tua justiça. Mas o perdoarás todas as vezes, para economizá-lo. Só temos um!']
      : ['Rei', 'Muito bem! É o único que temos. É preciso economizá-lo.'],
    ['Rei', 'Aliás, julgarás a ti mesmo. É o mais difícil. É bem mais difícil julgar a si mesmo do que julgar os outros.'],
    [P, 'Eu não gosto de condenar ninguém à morte. E acho mesmo que vou embora.'],
    ['Rei', 'Não!'],
    [P, 'Se Vossa Majestade deseja ser obedecido pontualmente, poderia me dar uma ordem razoável. Por exemplo: ordenar que eu parta em menos de um minuto.'],
    ['', 'O rei não respondeu. O pequeno príncipe hesitou... e então suspirou e se preparou para partir.'],
    ['Rei', 'Eu te faço meu embaixador!'],
  ], { npc: king });
  W.setSky('sunset', 6);
  await g.say('Rei', 'E olha: são sete e quarenta. O sol se põe... exatamente como ordenei!');
  await departure(g, dirLL(-50, 90), { to: 'asteroide 326', sky: 'gold', planetColor: 0xe89ab8 });
  W.unhook(rh);
}

// ═══════════════════════════ III · O Vaidoso ═══════════════════════════
export async function chVaidoso(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('gold');
  g.sound.play('vain');
  const VAIN = dirLL(10, 40);
  W.setPlanet({ radius: 3.7, seg: 72, height: bump(0.2), color: paint('#f0b8c8', '#e8a0b8', '#f8d8a0', { scale: 2.8, seed: 9 }) });
  const vain = makePerson({ coat: 0x3aa8a0, trim: PAL.gold, hat: 'top', hatColor: 0x5b3f78, feather: 0xff7ab8, scale: 1.3, nose: 0xf0a8a0 });
  W.place(vain.root, VAIN, { yaw: Math.PI });
  W.addActor(vain);
  W.collider(VAIN, 0.5);
  // pedestal e espelho
  const ped = mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.15, 16), 0xf8e8c8);
  W.place(ped, VAIN);
  vain.root.position.addScaledVector(VAIN, 0.15);
  const mirror = new THREE.Group();
  const frame = mesh(new THREE.TorusGeometry(0.35, 0.05, 8, 20), PAL.gold);
  frame.position.y = 1.0; frame.scale.y = 1.4;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.33, 20), new THREE.MeshBasicMaterial({ color: 0xcfe8ff }));
  glass.position.y = 1.0; glass.scale.y = 1.4;
  const stand = mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.9, 6), PAL.gold, { outline: 0.01 });
  stand.position.y = 0.45;
  mirror.add(frame, glass, stand);
  W.place(mirror, dirLL(28, 55), { face: vain.root.position });
  decorate(W, 31, { tufts: 14, rocks: 4, avoid: [VAIN], minAng: 0.5, tuftColor: 0xd87aa8 });

  ui.setObjectives([{ id: 'meet', text: 'Visitar o morador do asteroide' }]);
  W.ctrl.dist = 5.2;
  W.spawn(dirLL(-35, 40), VAIN);
  W.guide = VAIN;
  await opening(g, 'Capítulo III', 'O Vaidoso', 'Asteroide 326 — alguém que só ouvia elogios.');
  let met = false;
  const it = W.interact({ at: vain.root, r: 2.2, label: 'Aproximar-se', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(it);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    ['Vaidoso', 'Ah! Ah! Eis a visita de um admirador!'],
    ['', 'Para os vaidosos, os outros homens são sempre admiradores.'],
    [P, 'Bom dia. Que chapéu engraçado!'],
    ['Vaidoso', 'É para cumprimentar quando me aclamam. Infelizmente, nunca passa ninguém por aqui.'],
    [P, 'Ah, é?'],
    ['Vaidoso', 'Bate as mãos uma na outra!'],
  ], { npc: vain });

  // aplausos: a cada palma, ele ergue o chapéu
  let claps = 0, lift = 0;
  const hatBase = vain.hat.position.y;
  W.hook((dt) => {
    lift = Math.max(0, lift - dt * 2.2);
    const e = Math.sin(Math.min(1, lift) * Math.PI);
    vain.hat.position.y = hatBase + e * 0.35;
    vain.hat.rotation.z = e * 0.5;
    vain.pose = lift > 0.2 ? 'bow' : 'walk';
  });
  ui.addObjective({ id: 'clap', text: 'Aplaudir o vaidoso (0/5)' });
  const cIt = W.interact({
    at: vain.root, r: 2.6, label: 'Aplaudir',
    act: async () => {
      W.prince.pose = 'clap';
      g.sound.sfx('clap');
      setTimeout(() => g.sound.sfx('clap'), 160);
      lift = 1;
      claps++;
      ui.objText('clap', `Aplaudir o vaidoso (${claps}/5)`);
      await g.wait(0.55);
      W.prince.pose = 'walk';
    },
  });
  await g.until(() => claps >= 5);
  W.removeInteract(cIt);
  ui.check('clap');
  await g.wait(0.6);
  await g.talk([
    [P, 'Isso é mais divertido que a visita ao rei... E, para o chapéu cair, o que é preciso fazer?'],
    ['', 'Mas o vaidoso não ouviu. Os vaidosos só ouvem os elogios.'],
    ['Vaidoso', 'Tu me admiras muito, de verdade?'],
  ], { npc: vain });
  const a = await g.choose(['O que quer dizer "admirar"?', 'Eu te admiro... mas que importância isso tem?']);
  if (a === 0) {
    await g.talk([
      ['Vaidoso', 'Admirar quer dizer reconhecer que eu sou o homem mais bonito, o mais bem vestido, o mais rico e o mais inteligente do planeta.'],
      [P, 'Mas tu és o único no teu planeta!'],
      ['Vaidoso', 'Dá-me esse prazer. Admira-me assim mesmo!'],
      [P, 'Eu te admiro... mas que importância isso tem para ti?'],
    ], { npc: vain });
  }
  await g.talk([
    ['', 'E o pequeno príncipe foi embora.'],
    [P, 'As pessoas grandes são decididamente muito esquisitas.'],
  ]);
  await departure(g, dirLL(-30, 220), { to: 'asteroide 327', sky: 'teal', planetColor: 0x6a8a9a, music: 'sad' });
}

// ═══════════════════════════ IV · O Bêbado ═══════════════════════════
export async function chBebado(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('teal');
  g.sound.play('sad');
  const DRUNK = dirLL(15, 30);
  W.setPlanet({ radius: 3.4, seg: 64, height: bump(0.18), color: paint('#7a9aa8', '#6a8898', '#98a8b0', { scale: 2.5, seed: 13 }) });
  const drunk = makePerson({ coat: 0x5a6a8a, hat: 'beret', hatColor: 0x6b3d5a, scale: 1.25, nose: 0xe86a6a, robe: false, legs: 0x3a3a50, legLen: 0.5 });
  W.place(drunk.root, DRUNK, { yaw: Math.PI });
  W.addActor(drunk);
  drunk.pose = 'sit';
  W.collider(DRUNK, 0.5);
  const tb = W.place($.table(PAL.wood, 0.8, 0.5, 0.45), dirLL(4, 30));
  W.collider(dirLL(4, 30), 0.4);
  const r = rng(3);
  for (let i = 0; i < 6; i++) {
    const b = $.bottle([0x5fa36b, 0x8a6a3a, 0x6a8ac8][i % 3]);
    b.position.set((r() - 0.5) * 0.6, tb.userData.top, (r() - 0.5) * 0.35);
    tb.add(b);
  }
  decorate(W, 41, { tufts: 8, rocks: 5, avoid: [DRUNK], minAng: 0.5, tuftColor: 0x6a8a7a });
  // garrafas vazias espalhadas
  const empties = [dirLL(-30, 100), dirLL(40, 170), dirLL(-20, 250), dirLL(60, 300)].map((n, i) => {
    const b = W.place($.bottle(0x7ab8a0, true), n);
    b.rotation.z = Math.PI / 2 - 0.1;
    b.position.addScaledVector(n, 0.05);
    b.userData.n = n;
    return b;
  });

  ui.setObjectives([{ id: 'talk', text: 'Falar com o morador' }]);
  W.ctrl.dist = 5;
  W.spawn(dirLL(-20, 20), DRUNK);
  W.guide = DRUNK;
  await opening(g, 'Capítulo IV', 'O Bêbado', 'Asteroide 327 — uma visita muito curta.');
  let met = false;
  const it = W.interact({ at: drunk.root, r: 2.2, label: 'Falar com o homem', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(it);
  W.guide = null;
  // a conversa em círculo, uma pergunta por vez
  const qs = [
    ['O que fazes aí?', 'Bebo.'],
    ['Por que bebes?', 'Para esquecer.'],
    ['Esquecer o quê?', 'Esquecer que tenho vergonha.'],
    ['Vergonha de quê?', 'Vergonha de beber!'],
  ];
  await g.talk([['', 'Ele estava sentado em silêncio diante de uma coleção de garrafas vazias e outra de garrafas cheias.']], { npc: drunk });
  W.focus(worldPos(drunk));
  for (const [q, a] of qs) {
    await g.choose([q]);
    await g.say(P, q);
    await g.say('Bêbado', a);
  }
  W.focus(null);
  ui.hideDialog();
  ui.check('talk');
  await g.talk([['', 'E o homem se fechou num silêncio definitivo.'], [P, 'Talvez... se ele não visse tantas garrafas vazias...']]);
  ui.addObjective({ id: 'bot', text: 'Recolher as garrafas vazias (0/4)' });
  let got = 0;
  empties.forEach((b) => {
    const bi = W.interact({
      at: b, r: 1.3, label: 'Recolher a garrafa vazia',
      act: () => {
        W.removeInteract(bi); b.visible = false; b.userData.done = true; got++;
        g.sound.sfx('page');
        ui.objText('bot', `Recolher as garrafas vazias (${got}/4)`);
      },
    });
  });
  W.guide = () => { const l = empties.filter((b) => !b.userData.done).map((b) => b.userData.n); return l.length ? nearestOf(W, l) : DRUNK; };
  await g.until(() => got >= 4);
  ui.check('bot');
  let back = false;
  const bi = W.interact({ at: drunk.root, r: 2.2, label: 'Entregar as garrafas', act: () => { back = true; } });
  await g.until(() => back);
  W.removeInteract(bi);
  W.guide = null;
  await g.talk([
    ['Bêbado', '...Obrigado. Agora cabem mais garrafas na coleção.'],
    ['', 'O pequeno príncipe foi embora, perplexo.'],
    [P, 'As pessoas grandes são mesmo muito, muito esquisitas.'],
  ], { npc: drunk });
  await departure(g, dirLL(-45, 200), { to: 'asteroide 328', sky: 'gold', planetColor: 0xd8c070, music: 'business' });
}

// ═══════════════════════════ V · O Homem de Negócios ═══════════════════════════
export async function chNegocios(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('gold');
  g.sound.play('business');
  const BIZ = dirLL(10, 0);
  W.setPlanet({ radius: 4.8, seg: 80, height: bump(0.2), color: paint('#d8cfa8', '#c8bc90', '#e8dcb8', { scale: 3, seed: 17 }) });
  const biz = makePerson({ coat: 0x4a4a5a, sleeves: 0x4a4a5a, trim: 0xf4ead5, glasses: true, hair: 0x6a5a5a, scale: 1.35, robe: false, legs: 0x3a3a48, bodyBot: 0.32 });
  W.place(biz.root, BIZ, { yaw: Math.PI });
  W.addActor(biz);
  const desk = W.place($.table(0x6a4a3a, 1.2, 0.6, 0.7), dirLL(4, 0));
  W.collider(dirLL(5, 0), 0.8);
  for (let i = 0; i < 3; i++) {
    const ps = $.paperStack(4 + i * 3);
    ps.position.set(-0.4 + i * 0.35, desk.userData.top, 0);
    desk.add(ps);
  }
  const ink = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.08, 8), PAL.ink, { outline: 0.008 });
  ink.position.set(0.45, desk.userData.top + 0.04, 0.1);
  desk.add(ink);
  W.hook((dt, t) => { biz.arms[1].rotation.x = -1.1 + Math.sin(t * 12) * 0.15; });
  decorate(W, 51, { tufts: 10, rocks: 8, avoid: [BIZ], minAng: 0.5, tuftColor: 0xb8a878 });

  ui.setObjectives([{ id: 'meet', text: 'Falar com o homem ocupado' }]);
  W.ctrl.dist = 5.6;
  W.spawn(dirLL(-25, 0), BIZ);
  W.guide = BIZ;
  await opening(g, 'Capítulo V', 'O Homem de Negócios', 'Asteroide 328 — alguém ocupado demais.');
  let met = false;
  const it = W.interact({ at: biz.root, r: 2.4, label: 'Falar com o homem', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(it);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    ['Homem de negócios', 'Três e dois, cinco. Cinco e sete, doze. Doze e três, quinze. Bom dia. Quinze e sete, vinte e dois...'],
    [P, 'Bom dia.'],
    ['Homem de negócios', 'Vinte e dois e seis, vinte e oito. Não tenho tempo! Ufa! Isso dá quinhentos e um milhões, seiscentos e vinte e dois mil, setecentos e trinta e um.'],
    [P, 'Quinhentos milhões de quê?'],
    ['Homem de negócios', 'De... dessas coisinhas douradas que fazem os preguiçosos sonhar. Mas eu sou um homem sério! Não tenho tempo para devaneios.'],
    [P, 'Ah! De estrelas?'],
    ['Homem de negócios', 'Isso mesmo. Estrelas.'],
    [P, 'E o que fazes com quinhentos milhões de estrelas?'],
    ['Homem de negócios', 'Nada. Eu as possuo.'],
    [P, 'E de que te serve possuir as estrelas?'],
    ['Homem de negócios', 'Serve para ser rico. E ser rico serve para comprar outras estrelas, se alguém encontrar.'],
    ['Homem de negócios', 'Aliás! Esta manhã caíram cinco da minha contabilidade. Estão espalhadas por aí. Traz para mim — e não percas tempo!'],
  ], { npc: biz });

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
  W.guide = () => { const l = stars.filter((s) => !s.userData.done).map((s) => s.userData.n); return l.length ? nearestOf(W, l) : BIZ; };
  await g.until(() => got >= 5);
  ui.check('stars');
  ui.addObjective({ id: 'back', text: 'Voltar ao homem de negócios' });
  let back = false;
  const bi = W.interact({ at: biz.root, r: 2.4, label: 'Falar com o homem', act: () => { back = true; } });
  await g.until(() => back);
  W.removeInteract(bi);
  W.guide = null;
  ui.check('back');
  await g.talk([
    [P, 'Eu tenho uma flor, que rego todos os dias. Tenho três vulcões, que limpo toda semana. É útil para os meus vulcões e para a minha flor que eu os possua.'],
    [P, 'Mas tu não és útil às estrelas...'],
    ['', 'O homem de negócios abriu a boca, mas não encontrou nada para responder.'],
  ], { npc: biz });
  const c = await g.ask(P, 'O que faço com as cinco estrelas?', ['Entregar ao homem de negócios', 'Devolver as estrelas ao céu']);
  if (c === 0) {
    await g.talk([
      ['Homem de negócios', 'Quinhentos e um milhões, seiscentos e vinte e dois mil, setecentos e trinta e seis. Escrevo o número num papelzinho e tranco o papel numa gaveta.'],
      [P, 'E é só isso?'],
      ['Homem de negócios', 'É o bastante!'],
    ], { npc: biz });
  } else {
    g.lock();
    g.state.freed = true;
    const up = W.ctrl.n.clone();
    const flying = spots.map((n, i) => { const s = $.fallenStar(); s.scale.setScalar(0.8); W.place(s, W.ctrl.n, { lift: 0.8 + i * 0.1 }); return s; });
    W.shot(W.playerPos.clone().addScaledVector(up, 2).addScaledVector(W.ctrl.face, -4), W.playerPos.clone().addScaledVector(up, 6), up);
    W.prince.pose = 'raise';
    g.sound.sfx('laugh');
    await tween(g, 2.6, (t) => flying.forEach((s, i) => {
      const a = i * 1.26 + t * 3;
      s.position.copy(W.playerPos).addScaledVector(up, 1 + t * 14 + i * 0.3)
        .add(new THREE.Vector3(Math.cos(a), Math.sin(a * 0.7), Math.sin(a)).multiplyScalar(1 + t * 2));
    }));
    flying.forEach((s) => (s.visible = false));
    g.state.dust += 5;
    ui.setDust(g.state.dust);
    ui.toast('As estrelas voltaram para o céu ✦ +5');
    W.shot(null);
    W.prince.pose = 'walk';
    g.unlock();
    await g.talk([['Homem de negócios', 'O quê?! Minhas estrelas! Mas eu as tinha registrado!'], [P, 'Elas não eram tuas. Eram do céu.']], { npc: biz });
  }
  await g.say(P, 'As pessoas grandes são mesmo extraordinárias...');
  ui.hideDialog();
  await departure(g, dirLL(-40, 160), { to: 'asteroide 329', sky: 'dusk', planetColor: 0x7a8ac8, music: 'lamp' });
}

// ═══════════════════════════ VI · O Acendedor de Lampiões ═══════════════════════════
export async function chAcendedor(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  g.sound.play('lamp');
  const R = 2.5;
  const LAMP = dirLL(20, 0);
  W.setPlanet({ radius: R, seg: 56, height: bump(0.12, 3), color: paint('#8a98c8', '#7a88b8', '#a8b8d8', { scale: 3, seed: 21 }) });
  const lamp = $.lampPost();
  lamp.scale.setScalar(0.75);
  W.place(lamp, LAMP);
  W.collider(LAMP, 0.25);
  const man = makePerson({ coat: 0x3f5b8a, hat: 'cap', hatColor: 0x2f4b7a, scale: 1.05, robe: false, legs: 0x2a3a5a, legLen: 0.45 });
  const MAN = dirLL(20, 28);
  W.place(man.root, MAN, { face: lamp.position });
  W.addActor(man);
  W.collider(MAN, 0.35);
  const pole = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 5), PAL.wood, { outline: 0.006 });
  pole.position.set(0, 0.2, 0.3);
  pole.rotation.x = -0.9;
  man.arms[1].userData.hand.add(pole);

  // o planeta gira depressa: um dia inteiro a cada 12 segundos
  W.sunMode = 'fixed';
  const DAY = 12;
  const nightSky = { ...SKIES.night }, daySky = { ...SKIES.dusk, top: '#6a8ad0', horizon: '#ffd0a0', sun: 1, stars: 0.1 };
  let clock = 0, light = 0, running = true;
  const sunAt = (t) => new THREE.Vector3(Math.cos(t / DAY * Math.PI * 2), 0.35, Math.sin(t / DAY * Math.PI * 2)).normalize();
  const dayness = () => W.sunDir.dot(LAMP);
  const skyMix = { cur: null };
  W.hook((dt) => {
    if (!running) return;
    clock += dt;
    W.sunDir.copy(sunAt(clock));
    const d = W.sunDir.dot(W.ctrl.n);
    const k = smoothstep(-0.35, 0.35, d);
    if (Math.abs((skyMix.cur ?? -1) - k) > 0.01) { skyMix.cur = k; W.setSky(lerpSky(nightSky, daySky, k)); }
  });
  decorate(W, 61, { tufts: 6, rocks: 3, avoid: [LAMP, MAN], minAng: 0.6, tuftColor: 0x7a8ab8 });

  ui.setObjectives([{ id: 'meet', text: 'Falar com o acendedor de lampiões' }]);
  W.ctrl.dist = 4.6;
  W.spawn(dirLL(-35, 10), LAMP);
  W.guide = MAN;
  // o próprio acendedor cuida do lampião enquanto não o ajudamos
  let helping = false;
  W.hook(() => {
    if (helping) return;
    const want = dayness() < 0;
    if (want !== lamp.userData.on) { lamp.userData.set(want); man.pose = 'wave'; setTimeout(() => (man.pose = 'walk'), 500); }
  });
  await opening(g, 'Capítulo VI', 'O Acendedor de Lampiões', 'Asteroide 329 — o menor de todos.');
  let met = false;
  const it = W.interact({ at: man.root, r: 1.8, label: 'Falar com o acendedor', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(it);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    [P, 'Bom dia. Por que acabaste de apagar o teu lampião?'],
    ['Acendedor', 'É o regulamento. Bom dia.'],
    [P, 'E o que é o regulamento?'],
    ['Acendedor', 'É apagar o lampião de manhã e acendê-lo à noite. Boa noite.'],
    ['Acendedor', 'Antigamente fazia sentido. Mas o planeta foi girando cada vez mais depressa... e o regulamento não mudou!'],
    ['Acendedor', 'Agora ele dá uma volta por minuto, e eu não tenho mais um segundo de descanso. Ah, como eu queria dormir...'],
    [P, 'Deixa comigo, então! Eu acendo e apago por ti um pouco.'],
    ['Acendedor', 'Acende quando anoitecer e apaga quando amanhecer. Nem antes, nem depois!'],
  ], { npc: man });
  helping = true;
  man.pose = 'sit';
  let ok = 0;
  ui.addObjective({ id: 'lamp', text: 'Cuidar do lampião no tempo certo (0/4)' });
  const li = W.interact({
    at: lamp, r: 1.6, label: () => (lamp.userData.on ? 'Apagar o lampião' : 'Acender o lampião'),
    act: async () => {
      const d = dayness();
      const right = lamp.userData.on ? d > -0.1 : d < 0.1;
      W.prince.pose = 'reach';
      setTimeout(() => (W.prince.pose = 'walk'), 400);
      if (right) {
        lamp.userData.set(!lamp.userData.on);
        g.sound.sfx('lamp');
        ok++;
        ui.objText('lamp', `Cuidar do lampião no tempo certo (${ok}/4)`);
        g.state.sunsets += lamp.userData.on ? 1 : 0;
      } else {
        g.sound.sfx('fail');
        ui.toast(lamp.userData.on ? 'Ainda é noite! Espere o sol nascer.' : 'Ainda é dia! Espere o sol se pôr.', 1600);
      }
    },
  });
  W.guide = LAMP;
  await g.until(() => ok >= 4);
  W.removeInteract(li);
  W.guide = null;
  ui.check('lamp');
  helping = false;
  man.pose = 'walk';
  await g.talk([
    [P, 'Um dia aqui dura um minuto! Teu planeta é tão pequeno que dá a volta em três passos. Basta andar bem devagar para ficar sempre no sol.'],
    ['Acendedor', 'Isso não me adianta muito. O que eu gosto na vida é de dormir.'],
    [P, 'Que azar.'],
    ['Acendedor', 'Que azar. Bom dia.'],
    ['', 'Este aqui seria desprezado por todos os outros: o rei, o vaidoso, o bêbado, o homem de negócios.'],
    ['', 'No entanto, é o único que não me parece ridículo. Talvez porque se ocupa de outra coisa que não de si mesmo.'],
    [P, 'Ele é o único de quem eu poderia ter feito um amigo. Mas o planeta dele é pequeno demais. Não há lugar para dois...'],
    ['', 'O que ele não tinha coragem de confessar é que lamentava deixar aquele planeta abençoado, sobretudo por causa dos mil quatrocentos e quarenta pores do sol a cada vinte e quatro horas.'],
  ], { npc: man });
  await departure(g, dirLL(-40, 180), { to: 'asteroide 330', sky: 'teal', planetColor: 0x8ab89a, music: 'geo' });
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

// ═══════════════════════════ VII · O Geógrafo ═══════════════════════════
export async function chGeografo(g) {
  const W = g.world, ui = g.ui;
  W.clearStage();
  W.setSky('teal');
  g.sound.play('geo');
  const GEO = dirLL(15, 0), HILL = dirLL(40, 120), LAKE = dirLL(-30, 190), OLD = dirLL(25, 260);
  const base = paint('#a8c8a0', '#98b890', '#c8d8a8', { scale: 2.4, seed: 25 });
  const water = col('#5a8ab8'), water2 = col('#7aa8d0');
  W.setPlanet({
    radius: 6.5, seg: 96,
    height: (n) => (fbm3(n.x * 2, n.y * 2, n.z * 2) - 0.5) * 0.35 + 2.2 * Math.exp(-Math.pow(angleBetween(n, HILL) / 0.28, 2)) - 0.25 * smoothstep(0.3, 0.1, angleBetween(n, LAKE)),
    color: (n) => {
      const a = angleBetween(n, LAKE);
      if (a < 0.2) return (fbm3(n.x * 9, n.y * 9, n.z * 9) > 0.55 ? water2 : water).clone();
      if (angleBetween(n, HILL) < 0.22) return col('#b8a898');
      return base(n);
    },
  });
  const geo = makePerson({ coat: 0x7a6a4a, trim: 0xd8c8a0, beard: 0xe8e0d0, beardLen: 2.4, glasses: true, scale: 1.45, bodyBot: 0.42 });
  W.place(geo.root, GEO, { yaw: Math.PI });
  W.addActor(geo);
  W.collider(GEO, 0.6);
  const desk = W.place($.table(0x6a4a3a, 1.6, 0.9, 0.75), dirLL(10, 0));
  W.collider(dirLL(10, 0), 0.9);
  const book = $.bigBook();
  book.position.y = desk.userData.top + 0.05;
  desk.add(book);
  const globe = mesh(new THREE.SphereGeometry(0.22, 16, 12), 0x7aa8d0, { outline: 0.012 });
  globe.position.set(-0.6, desk.userData.top + 0.25, 0.2);
  desk.add(globe);
  W.place($.volcano(false), OLD);
  W.collider(OLD, 0.55);
  decorate(W, 71, { tufts: 36, rocks: 12, avoid: [GEO, HILL, LAKE, OLD], minAng: 0.3, tuftColor: 0x6a9a5a });

  ui.setObjectives([{ id: 'meet', text: 'Visitar o velho do livro enorme' }]);
  W.ctrl.dist = 6.2;
  W.spawn(dirLL(-20, 0), GEO);
  W.guide = GEO;
  await opening(g, 'Capítulo VII', 'O Geógrafo', 'Asteroide 330 — dez vezes maior que o anterior.');
  let met = false;
  const it = W.interact({ at: geo.root, r: 2.6, label: 'Falar com o velho senhor', act: () => { met = true; } });
  await g.until(() => met);
  W.removeInteract(it);
  W.guide = null;
  ui.check('meet');
  await g.talk([
    ['Geógrafo', 'Ora vejam! Um explorador!'],
    [P, 'Que livro tão grande! O que o senhor faz aqui?'],
    ['Geógrafo', 'Sou geógrafo.'],
    [P, 'O que é um geógrafo?'],
    ['Geógrafo', 'É um sábio que sabe onde ficam os mares, os rios, as cidades, as montanhas e os desertos.'],
    [P, 'Enfim uma verdadeira profissão! O seu planeta é muito bonito. Tem oceanos? Montanhas?'],
    ['Geógrafo', 'Não sei dizer.'],
    [P, 'Mas o senhor é geógrafo!'],
    ['Geógrafo', 'Justamente. Não sou explorador. O geógrafo é importante demais para passear. Ele não sai do escritório.'],
    ['Geógrafo', 'Mas tu vens de longe! Tu és um explorador! Vai e me descreve o meu planeta. Marquei três lugares com bandeirinhas.'],
  ], { npc: geo });

  ui.addObjective({ id: 'map', text: 'Explorar os lugares marcados (0/3)' });
  const places = [
    { n: HILL, flag: 0xe04a5f, label: 'Anotar: a montanha', line: 'Uma montanha! Pequena, mas lá de cima dá para ver o horizonte todo.', lift: 0 },
    { n: LAKE, flag: 0x3a7ac8, label: 'Anotar: o lago', line: 'Um lago! A água é tão clara que as estrelas aparecem no fundo.', lift: 0 },
    { n: OLD, flag: 0xf3c653, label: 'Anotar: o vulcão extinto', line: 'Um vulcão extinto. Como o meu... mas nunca se sabe!', lift: 0 },
  ];
  let seen = 0;
  places.forEach((p) => {
    const at = p.n === LAKE ? dirLL(-19, 184) : p.n === OLD ? dirLL(17, 252) : p.n;
    const f = W.place($.flag(p.flag), at);
    p.at = at;
    const fi = W.interact({
      at: f, r: 2, label: p.label,
      act: async () => {
        W.removeInteract(fi); p.done = true; seen++;
        g.sound.sfx('page');
        ui.objText('map', `Explorar os lugares marcados (${seen}/3)`);
        await g.say(P, p.line);
        ui.hideDialog();
      },
    });
    W.hook((dt, t) => { f.userData.cloth.rotation.y = Math.sin(t * 3 + p.flag) * 0.3; });
  });
  W.guide = () => { const l = places.filter((p) => !p.done).map((p) => p.at); return l.length ? nearestOf(W, l) : GEO; };
  await g.until(() => seen >= 3);
  ui.check('map');
  ui.addObjective({ id: 'report', text: 'Contar tudo ao geógrafo' });
  let rep = false;
  const ri = W.interact({ at: geo.root, r: 2.6, label: 'Contar ao geógrafo', act: () => { rep = true; } });
  await g.until(() => rep);
  W.removeInteract(ri);
  W.guide = null;
  ui.check('report');
  g.sound.sfx('page');
  await g.talk([
    ['Geógrafo', 'Uma montanha, um lago, um vulcão extinto... Anotado! Muito bem.'],
    ['Geógrafo', 'E tu? Tu vens de longe! Descreve-me o teu planeta.'],
  ], { npc: geo });
  const said = new Set();
  while (said.size < 2) {
    const opts = ['Tenho três vulcões: dois em atividade e um extinto.', 'Tenho também uma flor.'];
    const c = await g.choose(opts.filter((_, i) => !said.has(i)));
    const idx = opts.indexOf(opts.filter((_, i) => !said.has(i))[c]);
    said.add(idx);
    if (idx === 0) await g.talk([['Geógrafo', 'Extinto ou em atividade, dá no mesmo para nós. O que conta é a montanha. Ela não muda.']], { npc: geo });
    else {
      await g.talk([
        ['Geógrafo', 'Nós não anotamos as flores.'],
        [P, 'Por que não? É o mais bonito!'],
        ['Geógrafo', 'Porque as flores são efêmeras.'],
        [P, 'O que quer dizer "efêmera"?'],
        ['Geógrafo', 'Quer dizer "ameaçada de desaparecer em breve".'],
        [P, 'A minha flor está ameaçada de desaparecer em breve?'],
        ['Geógrafo', 'Certamente.'],
      ], { npc: geo });
    }
  }
  await g.talk([
    ['', '"A minha flor é efêmera", pensou o pequeno príncipe, "e só tem quatro espinhos para se defender do mundo! E eu a deixei sozinha em casa!"'],
    ['', 'Foi o seu primeiro gesto de arrependimento. Mas ele tomou coragem.'],
    [P, 'O que o senhor me aconselha a visitar?'],
    ['Geógrafo', 'O planeta Terra. Tem boa reputação...'],
    ['', 'E o pequeno príncipe partiu, pensando na sua flor.'],
  ], { npc: geo });
  await departure(g, dirLL(-35, 60), { to: 'a Terra', sky: 'day', planetColor: 0xe8c98f, duration: 24, music: 'flight' });
}
