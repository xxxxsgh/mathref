// A abertura (Halden → Kessa) e as cenas roteirizadas da campanha.
//
//   intro      cartão do Ato I sobre preto → planos externos da frota da
//              Hegemonia sobre Aurora → corte para o cockpit (jogável)
//   ordem      o Almirante Varela ordena o bombardeio da colônia: câmera
//              lenta, legendas, escolha (recusar / enganar / silêncio)
//   traição    Rafael vira a nave contra a própria ala; a lança orbital do
//              Inflexível começa a queimar Aurora; Hegemonia hostil
//   fuga       (missão a1_fuga) motor de salto carregando sob fogo → salto
//   chegada    Kessa, Fenda de Órion: nebulosa, Verídia, caças da Frente
//              Livre de armas apontadas e a primeira transmissão
//
// Funciona com o sistema `combat` (batalha 'aurora' de verdade, deserção via
// combat.defect()) ou sem ele (batalha encenada pelo palco).
import * as THREE from 'three/webgpu';
import { chase, custom, ease } from './cinema.js';
import { loopMotion, formationMotion, driftMotion, lookQuat } from './stage.js';

const D2R = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

function body(ctx, name) { return ctx.universe.system?.bodies.find((b) => b.name === name) || null; }
function sunDir(ctx, from) { return ctx.universe.system.star.pos.clone().sub(from).normalize(); }
function basis(F, up) {
  const f = F.clone().normalize();
  const R = new THREE.Vector3().crossVectors(f, up).normalize();
  const U = new THREE.Vector3().crossVectors(R, f).normalize();
  return { F: f, R, U };
}
/** Direção na câmera a partir de guinada (+dir) e arfagem (+cima), em graus. */
const dirCam = (yaw, pit) => V(Math.sin(yaw * D2R) * Math.cos(pit * D2R), Math.sin(pit * D2R), -Math.cos(yaw * D2R) * Math.cos(pit * D2R));
/** Matriz que leva a base (a, b) para a base (c, d). */
function alignQuat(a, b, c, d) {
  const fr = (x, y) => { const e1 = x.clone().normalize(); const e2 = y.clone().addScaledVector(e1, -y.dot(e1)).normalize(); return new THREE.Matrix4().makeBasis(e1, e2, new THREE.Vector3().crossVectors(e1, e2)); };
  return new THREE.Quaternion().setFromRotationMatrix(fr(a, b).multiply(fr(c, d).invert()));
}

/**
 * Referencial da batalha de Aurora: posição C do caça do Rafael e
 * orientação em que Aurora fica embaixo à direita e o sol nasce acima do
 * limbo, à esquerda (o enquadramento-assinatura da abertura).
 */
export function haldenFrame(ctx, o = {}) {
  const aur = body(ctx, 'Aurora');
  if (!aur) return null;
  const alpha = (o.alpha ?? 31) * D2R, sep = (o.sep ?? 78) * D2R;
  const dist = aur.radius / Math.sin(alpha);
  let toS = sunDir(ctx, aur.pos), C = new THREE.Vector3();
  for (let it = 0; it < 4; it++) {
    const b0 = basis(toS, V(0, 1, 0));
    const D = toS.clone().multiplyScalar(Math.cos(sep)).addScaledVector(b0.U.clone().multiplyScalar(-0.94).addScaledVector(b0.R, 0.34).normalize(), Math.sin(sep)).normalize();
    C = aur.pos.clone().addScaledVector(D, -dist);
    toS = sunDir(ctx, C);
  }
  const toP = aur.pos.clone().sub(C).normalize();
  const pc = dirCam(o.py ?? 22, o.pp ?? -17);
  const angPS = Math.acos(THREE.MathUtils.clamp(toP.dot(toS), -1, 1));
  let sc = dirCam(-20, 6);
  const ax = new THREE.Vector3().crossVectors(pc, sc).normalize();
  sc = pc.clone().applyAxisAngle(ax, angPS);
  const q = alignQuat(toP, toS, pc, sc);
  const F = V(0, 0, -1).applyQuaternion(q), U = V(0, 1, 0).applyQuaternion(q), R = V(1, 0, 0).applyQuaternion(q);
  const at = (f, r, u, out = new THREE.Vector3()) => out.copy(C).addScaledVector(F, f).addScaledVector(R, r).addScaledVector(U, u);
  return { C, q, F, U, R, at, aur, toS, toP };
}

// ─── elenco da batalha ──────────────────────────────────────────────────────
/**
 * Monta a batalha de Aurora. Com `combat`, só os elementos de cena (lança
 * orbital, destroços cenográficos); sem ele, a batalha inteira no palco.
 * Retorna o elenco: {get(nome) → provedor de pose, wing, enemies, ...}.
 */
export function buildAuroraCast(story, fr, { full = true, playerPose = null } = {}) {
  const ctx = story.ctx, stage = story.stage;
  const { at, F, U, R } = fr;
  const cast = { actors: {}, wing: [], enemies: [], allies: [], fr };
  const leader = playerPose || (() => story.playerPose());
  const add = (key, o) => { const a = stage.add(o); cast.actors[key] = a; return a; };
  const hasCombat = !!ctx.services.combat?.startBattle && !ctx.shot;
  if (!hasCombat || full === 'stage') {
    // capitais
    add('soberano', { classId: 'carrier', faction: 'hegemonia', name: 'Soberano', pos: at(2300, -760, -520), quat: lookQuat(F.clone().addScaledVector(R, 0.62).addScaledVector(U, 0.04).normalize(), U), throttle: 0.4, shadows: true, motion: driftMotion(F.clone().addScaledVector(R, 0.62).normalize().multiplyScalar(18)) });
    add('inflexivel', { classId: 'destroyer', faction: 'hegemonia', name: 'Inflexível', pos: at(3400, 900, 600), quat: lookQuat(F.clone().addScaledVector(R, -0.25).addScaledVector(U, -0.12).normalize(), U), throttle: 0.5, shadows: true, motion: driftMotion(F.clone().addScaledVector(R, -0.25).normalize().multiplyScalar(22)) });
    // ala do Rafael (formação presa à nave do jogador)
    const w6 = add('davi', { classId: 'fighter', faction: 'hegemonia', callsign: 'LANÇA-6', shipId: 'lanca6', seed: 6, throttle: 0.75, motion: formationMotion(leader, V(-16, -3.5, -34), { sway: 1.6 }) });
    const w8 = add('lanca8', { classId: 'fighter', faction: 'hegemonia', callsign: 'LANÇA-8', shipId: 'lanca8', seed: 8, throttle: 0.75, motion: formationMotion(leader, V(24, 4, -62), { sway: 2.2, swayW: 0.5 }) });
    cast.wing.push(w6, w8);
    // dogfight à frente: milícia de Aurora × esquadrilhas Águia/Cetro
    const center = at(1500, 120, 260);
    const e1 = F.clone().applyAxisAngle(U, 0.5), e2 = U.clone().applyAxisAngle(F, 0.3);
    for (let i = 0; i < 5; i++) {
      const ph = i * 1.26;
      const en = add('milicia' + i, { classId: i === 2 ? 'interceptor' : 'fighter', faction: 'frente', seed: 40 + i, throttle: 1, motion: loopMotion({ center, e1, e2: i % 2 ? e2 : e2.clone().negate(), R: 520 + i * 90, w: 0.21 + i * 0.012, phase: ph, wobble: 110 }), fire: { rate: 1.8, burst: 3, color: 'red', range: 1600, spread: 0.03 } });
      cast.enemies.push(en);
      const ch = add('aguia' + i, { classId: i % 2 ? 'interceptor' : 'fighter', faction: 'hegemonia', seed: 60 + i, throttle: 1, motion: loopMotion({ center, e1, e2: i % 2 ? e2 : e2.clone().negate(), R: 520 + i * 90, w: 0.21 + i * 0.012, phase: ph - 0.16, wobble: 110 }), fire: { rate: 0.9, burst: 5, color: 'gold', range: 1400, spread: 0.02 } });
      ch.target = en; en.target = ch;
      cast.allies.push(ch);
    }
    // fragata da colônia e transportes de evacuação fugindo para o planeta
    add('esperanca', { classId: 'frigate', faction: 'frente', name: 'Esperança', pos: at(4600, -520, 900), quat: lookQuat(F.clone().negate().addScaledVector(R, 0.35).normalize(), U), throttle: 0.6, motion: driftMotion(F.clone().negate().addScaledVector(R, 0.35).normalize().multiplyScalar(30)) });
    for (let i = 0; i < 2; i++) {
      const d = fr.toP.clone().addScaledVector(R, 0.2 * (i - 0.5)).normalize();
      add('evac' + i, { classId: 'freighter', faction: 'frente', name: 'Transporte de Evacuação', pos: at(2600 + i * 300, -1400 - i * 200, 1500 + i * 180), quat: lookQuat(d, U), throttle: 1, motion: driftMotion(d.clone().multiplyScalar(140)) });
    }
  }
  // provedores de pose para câmeras (combat ou palco)
  cast.get = (key) => {
    const a = cast.actors[key];
    if (a?.alive) return () => a;
    const c = ctx.services.combat;
    const nm = { soberano: 'Soberano', inflexivel: 'Inflexível', davi: 'LANÇA-6', lanca8: 'LANÇA-8', esperanca: 'Esperança' }[key];
    const s = c?.ships?.find?.((x) => x.alive && (x.name === nm || x.callsign === nm));
    if (s) return () => ({ pos: s.renderPos || s.pos, quat: s.quat, vel: s.vel });
    return null;
  };
  return cast;
}

/** Lança orbital: raio do Inflexível até a superfície de Aurora (mundo). */
export function startBombardment(story, cast, { count = 2 } = {}) {
  const ctx = story.ctx, fr = cast.fr, aur = fr.aur;
  const src = cast.get('inflexivel');
  if (!src) return [];
  const beams = [];
  for (let i = 0; i < count; i++) {
    const off = V((i - 0.5) * 0.06, -0.02 * i, 0.03 * i);
    const hit = new THREE.Vector3();
    const target = () => {
      // ponto da superfície sob o destróier, deslocado (alvos em terra)
      const s = src();
      const d = s.pos.clone().sub(aur.pos).normalize().add(off).normalize();
      return hit.copy(aur.pos).addScaledVector(d, aur.radius + 200);
    };
    const muzzle = (out) => { const s = src(); return out.set((i - 0.5) * 70, -40, -260).applyQuaternion(s.quat).add(s.pos); };
    const b = story.stage.beam({ from: muzzle, to: (out) => out.copy(target()), width: 9 + i * 3, color: i ? '#ffb45a' : '#ffd890', intensity: 60 });
    beams.push(b);
    // clarões de impacto na superfície
    story.stage.after(0.2 + i * 0.4, () => {
      const r = ctx.services.rendering;
      const p = target();
      r?.particles?.glow?.(p, 2600 + Math.random() * 1200, [9, 5, 2.2], 0.6);
      if (Math.random() < 0.5) ctx.bus.emit('explosion', { pos: p.clone(), size: 900, kind: 'ground' });
    }, 0.55);
  }
  return beams;
}

// ─── falas ──────────────────────────────────────────────────────────────────
export const LINES = {
  intro: [
    'Ano 2387. A *Hegemonia Solar* controla todas as rotas de salto da galáxia.',
    'Cada colônia paga pedágio pelo ar que respira. Quem não paga, queima.',
    'Em Halden, a colônia *Aurora* parou de pagar.',
  ],
  radioIntro: [
    ['comando', 'Esquadrilha Lança, a milícia de Aurora está recuando. Abram caminho para o Soberano.'],
    ['davi', 'Lança-7, formação em cunha. Igual ao treinamento, Rafa. Fica na minha asa.'],
  ],
  combat: [
    ['davi', 'Dois na sua seis! Quebra pra direita!'],
    ['aurora', 'Aqui é a milícia de Aurora! Temos civis no domo! Parem o ataque!'],
    ['lanca8', 'Esses colonos voam igual a sucata. Isso não é guerra, é limpeza.'],
  ],
  order: ['varela', 'Lança-7, aqui é o Almirante Varela. A colônia Aurora foi declarada hostil. Bombardeio orbital autorizado — seu alvo é o *domo de Nova Aurora*. Confirme.'],
  afterChoice: {
    recusar: [['rafael', 'Negativo, Comando. Lança-7 não atira em civis.'], ['varela', 'Então você não é mais Lança-7.']],
    enganar: [['rafael', 'Lança-7… confirmando. Iniciando corrida de bombardeio.'], ['varela', 'Bom piloto.']],
    silencio: [['varela', 'Lança-7? Lança-7, responda.'], ['davi', 'Rafa… não faz isso. Não faz isso comigo.']],
  },
  betrayal: [
    ['davi', 'Rafael?! O que você está fazendo? Lança-7 virou! *Lança-7 é hostil!*'],
    ['varela', 'A todas as unidades: Lança-7 é traidor. Abatam-no. Inflexível, inicie o bombardeio.'],
    ['rafael', 'Aurora, aqui é Lança-7. Evacuem o domo. Agora!'],
  ],
  flight: [
    ['nave', 'Motor de salto: carga iniciada. Alvo: Fenda de Órion, sistema Kessa.'],
    ['davi', 'Por quê, Rafa? A gente cresceu nessa farda!'],
    ['aurora', 'Lança-7… os transportes passaram! Obrigado, seja quem você for!'],
    ['varela', 'Você pode fugir para a Fenda, Paoli. A Hegemonia tem memória longa.'],
    ['davi', 'Eu não vou atirar em você. Mas eles vão.'],
  ],
};
