import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';

/**
 * As cinco missões. Todas usam o mundo, o voo e a câmera que já existem — a
 * fase é conteúdo, não sistema novo.
 *
 * A regra que manda aqui é a do roadmap: o objetivo tem que caber em UMA linha
 * e ser entendido em dois segundos. Por isso cada missão expõe `objective()`,
 * uma frase curta que muda conforme o estado, em vez de uma lista de tarefas.
 *
 * Falhar nunca abre tela de game over: `restart()` recomeça na hora.
 */

const UP = new THREE.Vector3(0, 1, 0);

/** Ângulo entre a proa da câmera e a direção até um alvo. */
function framing(camera, target, tmp) {
  tmp.subVectors(target, camera.position).normalize();
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  return forward.dot(tmp); // 1 = centralizado
}

// ══════════════════════════════════════════════════════════════════════════
// Tipos de missão
// ══════════════════════════════════════════════════════════════════════════

/**
 * 1. INSPEÇÃO — fotografar pontos de uma estrutura com enquadramento e
 * distância mínima. Usa a câmera como MECÂNICA: não basta chegar perto, tem que
 * apontar e segurar, que é exatamente o trabalho de um drone de inspeção.
 */
function inspection(def, ctx) {
  const points = def.points.map((p) => {
    const base = ctx.world.groundHeight(def.x + p.x, def.z + p.z);
    return {
      position: new THREE.Vector3(def.x + p.x, base + p.y, def.z + p.z),
      done: false,
      hold: 0,
    };
  });
  const markers = points.map((p) => ctx.spawnMarker(p.position, 0x35e0c8, 2.2));
  const tmp = new THREE.Vector3();

  return {
    points,
    objective() {
      const done = points.filter((p) => p.done).length;
      const current = points.find((p) => !p.done);
      if (!current) return 'Inspeção completa — volte para a base';
      const distance = ctx.drone.position.distanceTo(current.position);
      const aim = framing(ctx.camera, current.position, tmp);
      const hint =
        distance > def.maxDistance
          ? 'aproxime'
          : distance < def.minDistance
            ? 'afaste'
            : aim < 0.94
              ? 'centralize'
              : 'segurando…';
      return `Fotografar ${done + 1}/${points.length} — ${hint} (${Math.round(distance)} m)`;
    },
    update(dt) {
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (point.done) continue;
        const distance = ctx.drone.position.distanceTo(point.position);
        const aim = framing(ctx.camera, point.position, tmp);
        const good = distance >= def.minDistance && distance <= def.maxDistance && aim > 0.94;

        point.hold = good ? point.hold + dt : Math.max(0, point.hold - dt * 2);
        markers[i].material.opacity = 0.2 + clamp(point.hold / def.holdSeconds, 0, 1) * 0.7;

        if (point.hold >= def.holdSeconds) {
          point.done = true;
          markers[i].material.color.setHex(0xffcf49);
          ctx.event('photo', { index: i, total: points.length });
        }
        break; // um de cada vez: a ordem torna o objetivo legível
      }
      return points.every((p) => p.done) ? 'success' : null;
    },
    cleanup() {
      markers.forEach((m) => ctx.removeMarker(m));
    },
  };
}

/**
 * 2. ENTREGA — pegar a carga, voar com peso e pousar num alvo pequeno.
 * A carga entra no modelo de voo como massa: mais inércia, menos empuxo
 * relativo e bateria drenando mais rápido. O peso é sentido, não anunciado.
 */
function delivery(def, ctx) {
  const pickup = new THREE.Vector3(def.from.x, 0, def.from.z);
  pickup.y = ctx.world.groundHeight(pickup.x, pickup.z) + 1.5;
  const dropoff = new THREE.Vector3(def.to.x, 0, def.to.z);
  dropoff.y = ctx.world.groundHeight(dropoff.x, dropoff.z) + 0.4;

  const pickupMarker = ctx.spawnMarker(pickup, 0x35e0c8, 3);
  const dropMarker = ctx.spawnMarker(dropoff, 0xffb545, def.padRadius);
  let carrying = false;

  return {
    objective() {
      if (!carrying) {
        return `Pegar a carga (${def.payloadKg} kg) — ${Math.round(ctx.drone.position.distanceTo(pickup))} m`;
      }
      const distance = ctx.drone.position.distanceTo(dropoff);
      const speed = ctx.drone.speed;
      return `Pousar no alvo — ${Math.round(distance)} m${distance < def.padRadius * 1.6 && speed > def.landingSpeed ? ' (devagar!)' : ''}`;
    },
    update() {
      if (!carrying) {
        if (ctx.drone.position.distanceTo(pickup) < 4) {
          carrying = true;
          ctx.setPayload(def.payloadKg);
          ctx.removeMarker(pickupMarker);
          ctx.event('cargoTaken', { kg: def.payloadKg });
        }
        return null;
      }

      const flat = Math.hypot(ctx.drone.position.x - dropoff.x, ctx.drone.position.z - dropoff.z);
      const agl = ctx.drone.position.y - ctx.world.groundHeight(ctx.drone.position.x, ctx.drone.position.z);
      // Pousar é chegar devagar E baixo dentro do alvo. Sem o limite de
      // velocidade, "entregar" viraria despencar em cima do alvo.
      if (flat < def.padRadius && agl < 1.2 && ctx.drone.speed < def.landingSpeed) {
        return 'success';
      }
      return null;
    },
    cleanup() {
      ctx.setPayload(0);
      ctx.removeMarker(pickupMarker);
      ctx.removeMarker(dropMarker);
    },
  };
}

/**
 * 3. BUSCA E RESGATE — achar um alvo escondido numa área grande usando pistas.
 *
 * O alvo NÃO é marcado. A pista é um sinal térmico que esquenta conforme se
 * aproxima (barra no HUD) e uma coluna de fumaça que só fica visível de perto.
 * A busca é o conteúdo; marcar o alvo no mapa mataria a missão inteira.
 */
function search(def, ctx) {
  // Posição derivada da seed do mundo: igual pra todo mundo, mas não óbvia.
  const angle = (def.seed % 360) * (Math.PI / 180);
  const radius = def.areaRadius * (0.35 + ((def.seed % 47) / 47) * 0.6);
  const target = new THREE.Vector3(
    def.x + Math.cos(angle) * radius,
    0,
    def.z + Math.sin(angle) * radius,
  );
  target.y = ctx.world.groundHeight(target.x, target.z);

  const smoke = ctx.spawnSmoke(target);
  let found = false;

  return {
    target,
    objective() {
      const distance = ctx.drone.position.distanceTo(target);
      const heat = clamp(1 - distance / def.areaRadius, 0, 1);
      const bars = '█'.repeat(Math.round(heat * 8)).padEnd(8, '·');
      return `Sinal térmico ${bars} ${heat > 0.8 ? '— fumaça à vista' : ''}`;
    },
    /** 0..1 — a HUD desenha como barra e o áudio usa pra apitar mais rápido. */
    heat() {
      return clamp(1 - ctx.drone.position.distanceTo(target) / def.areaRadius, 0, 1);
    },
    update() {
      const distance = ctx.drone.position.distanceTo(target);
      // A fumaça aparece antes de achar: é a pista visual que confirma a
      // térmica, não o prêmio.
      smoke.visible = distance < def.areaRadius * 0.35;
      smoke.material.opacity = clamp(1 - distance / (def.areaRadius * 0.35), 0, 1) * 0.5;
      if (!found && distance < def.foundRadius) {
        found = true;
        return 'success';
      }
      return null;
    },
    cleanup() {
      ctx.removeMarker(smoke);
    },
  };
}

/**
 * 4. FILMAGEM — seguir um veículo mantendo ele enquadrado por X segundos.
 * O contador só corre com o alvo enquadrado E na distância certa; sair do
 * enquadramento não zera, drena — perder dois segundos numa curva não deve
 * apagar meio minuto de trabalho.
 */
function filming(def, ctx) {
  const vehicle = ctx.spawnVehicle();
  let t = 0;
  let held = 0;
  const tmp = new THREE.Vector3();

  const positionAt = (time) => {
    // Trajeto em elipse com uma ondulação: previsível o bastante pra seguir,
    // irregular o bastante pra não virar uma órbita chata.
    const a = time * def.speed;
    const x = def.x + Math.cos(a) * def.radius;
    const z = def.z + Math.sin(a) * def.radius * 0.62 + Math.sin(a * 2.7) * 26;
    return { x, z };
  };

  return {
    vehicle,
    objective() {
      const distance = ctx.drone.position.distanceTo(vehicle.position);
      const aim = framing(ctx.camera, vehicle.position, tmp);
      const status =
        distance > def.maxDistance ? 'aproxime' : aim < 0.9 ? 'enquadre' : 'gravando';
      return `Filmar o veículo — ${status} ${held.toFixed(1)}/${def.holdSeconds}s`;
    },
    update(dt) {
      t += dt;
      const { x, z } = positionAt(t);
      const y = ctx.world.groundHeight(x, z);
      const previous = vehicle.position.clone();
      vehicle.position.set(x, y + 0.9, z);
      // Aponta o veículo pro movimento — sem isso ele desliza de lado.
      tmp.subVectors(vehicle.position, previous);
      if (tmp.lengthSq() > 1e-6) {
        vehicle.rotation.y = Math.atan2(tmp.x, tmp.z);
      }

      const distance = ctx.drone.position.distanceTo(vehicle.position);
      const aim = framing(ctx.camera, vehicle.position, tmp);
      const good = distance <= def.maxDistance && distance >= 6 && aim > 0.9;
      held = clamp(held + (good ? dt : -dt * 0.6), 0, def.holdSeconds);
      return held >= def.holdSeconds ? 'success' : null;
    },
    progress() {
      return held / def.holdSeconds;
    },
    cleanup() {
      ctx.removeMarker(vehicle);
    },
  };
}

/** 5. CORRIDA — delega pro sistema da Fase 2 e só observa o resultado. */
function race(def, ctx) {
  ctx.startRace(def.circuit);
  return {
    objective() {
      const state = ctx.raceState();
      if (!state) return 'Corrida';
      if (state.state === 'armed') return `${def.title} — cruze o gate 1 para largar`;
      return `${def.title} — alvo ${def.targetSeconds}s · ${state.elapsed.toFixed(1)}s`;
    },
    update() {
      const state = ctx.raceState();
      if (state?.state !== 'finished') return null;
      return state.finish && state.finish.time <= def.targetSeconds ? 'success' : 'fail';
    },
    cleanup() {},
  };
}

const BUILDERS = { inspecao: inspection, entrega: delivery, busca: search, filmagem: filming, corrida: race };

// ══════════════════════════════════════════════════════════════════════════
// Catálogo
// ══════════════════════════════════════════════════════════════════════════
export const MISSION_DEFS = [
  {
    id: 'insp-torre',
    type: 'inspecao',
    title: 'Inspeção da torre',
    brief: 'Fotografar quatro pontos da estrutura, a 12–30 m e centralizado.',
    difficulty: 1,
    reward: 340,
    x: 340,
    z: -420,
    minDistance: 12,
    maxDistance: 30,
    holdSeconds: 1.4,
    points: [
      { x: 6, y: 10, z: 0 },
      { x: -6, y: 24, z: 2 },
      { x: 0, y: 38, z: -6 },
      { x: 5, y: 46, z: 3 },
    ],
  },
  {
    id: 'entrega-vale',
    type: 'entrega',
    title: 'Entrega no galpão',
    brief: 'Carga de 1,4 kg. O drone fica pesado e a bateria dura menos.',
    difficulty: 2,
    reward: 420,
    payloadKg: 1.4,
    padRadius: 4.5,
    landingSpeed: 3.2,
    from: { x: 60, z: 40 },
    to: { x: -180, z: -240 },
  },
  {
    id: 'busca-floresta',
    type: 'busca',
    title: 'Busca na floresta',
    brief: 'Alguém está perdido na mata. Siga o sinal térmico.',
    difficulty: 3,
    reward: 520,
    x: -320,
    z: -980,
    seed: 2917,
    areaRadius: 420,
    foundRadius: 18,
  },
  {
    id: 'filmagem-costa',
    type: 'filmagem',
    title: 'Filmagem na costa',
    brief: 'Seguir o veículo por 20 s mantendo ele enquadrado.',
    difficulty: 3,
    reward: 560,
    x: 1180,
    z: 240,
    radius: 240,
    speed: 0.09,
    maxDistance: 95,
    holdSeconds: 20,
  },
  {
    id: 'corrida-tecnico',
    type: 'corrida',
    title: 'Contrato: circuito técnico',
    brief: 'Fechar o circuito técnico abaixo do tempo-alvo.',
    difficulty: 2,
    reward: 380,
    circuit: 'tecnico',
    targetSeconds: 62,
  },
];

export class Missions {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = null;
    this.definition = null;
  }

  get list() {
    return MISSION_DEFS.map((def) => ({
      ...def,
      done: this.ctx.save.progress.missionsDone.includes(def.id),
    }));
  }

  start(id) {
    const def = MISSION_DEFS.find((m) => m.id === id);
    if (!def) return false;
    this.abort();
    this.definition = def;
    this.active = BUILDERS[def.type](def, this.ctx);
    this.elapsed = 0;
    this.ctx.event('missionStart', { def });
    return true;
  }

  /** Recomeça a mesma missão do zero — sem menu, sem tela de derrota. */
  restart() {
    if (this.definition) this.start(this.definition.id);
  }

  abort() {
    this.active?.cleanup();
    this.active = null;
    this.definition = null;
  }

  update(dt) {
    if (!this.active) return;
    this.elapsed += dt;
    const result = this.active.update(dt);
    if (!result) return;

    const def = this.definition;
    if (result === 'success') {
      const first = !this.ctx.save.progress.missionsDone.includes(def.id);
      if (first) this.ctx.save.progress.missionsDone.push(def.id);
      const reward = first ? def.reward : Math.round(def.reward * 0.3);
      this.ctx.save.progress.credits += reward;
      this.ctx.save.write();
      this.ctx.event('missionDone', { def, reward, time: this.elapsed });
    } else {
      this.ctx.event('missionFail', { def });
    }
    this.abort();
  }

  /** Linha única do HUD. */
  objective() {
    return this.active?.objective() ?? null;
  }

  hudExtra() {
    if (!this.active) return null;
    return {
      heat: this.active.heat?.() ?? null,
      progress: this.active.progress?.() ?? null,
    };
  }
}

export { UP };
