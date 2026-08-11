import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';
import { buildGates, circuitById, CIRCUITS } from './Circuits.js';
import { Gates } from './Gates.js';
import { Ghost } from './Ghost.js';

/**
 * A corrida: cronômetro, splits, combo, medalhas, recorde e fantasma.
 *
 * O coração desta fase é o reinício instantâneo. Tudo aqui é escrito pra que
 * apertar R devolva o jogador voando na largada no mesmo frame — sem menu, sem
 * carregamento, sem tela de resultado bloqueando. O momento entre "errei" e
 * "de novo" é onde o vício mora, e qualquer coisa nesse intervalo o destrói.
 */

const MEDAL_ORDER = { ouro: 3, prata: 2, bronze: 1 };

export class Race {
  /**
   * @param {object} deps
   * @param {(event:string, payload:object)=>void} deps.onEvent  feedback (som,
   *   flash, banner) — a corrida não conhece a HUD nem o áudio.
   */
  constructor({ scene, terrain, save, onEvent }) {
    this.terrain = terrain;
    this.save = save;
    this.onEvent = onEvent ?? (() => {});

    this.gates = new Gates(scene);
    this.ghost = new Ghost(scene);

    this.circuit = null;
    this.origin = new THREE.Vector3();
    this.state = 'armed'; // armed → running → finished
    this.elapsed = 0;
    this.splits = [];
    this.combo = 0;
    this.bestCombo = 0;
    this.perfects = 0;
    this.scrapes = 0;
    this.earned = 0;
    this._comboTimer = 0;
    this.lastDelta = null;
    this.finishInfo = null;

    /** Pose de largada: logo atrás do gate 1, já encarando ele. */
    this.startPose = { position: new THREE.Vector3(), heading: 0 };
  }

  get enabled() {
    return Boolean(this.circuit);
  }

  /** Circuito atual, ou o próximo/anterior da lista. */
  setCircuit(idOrIndex, origin = this.origin) {
    const circuit =
      typeof idOrIndex === 'number'
        ? CIRCUITS[((idOrIndex % CIRCUITS.length) + CIRCUITS.length) % CIRCUITS.length]
        : circuitById(idOrIndex);

    this.circuit = circuit;
    this.origin.copy(origin);

    const list = buildGates(circuit, this.origin, this.terrain);
    this.gates.build(list, circuit.color);
    this._computeStartPose(list);

    const record = this.save.circuit(circuit.id);
    this.ghost.load(this.save.data.ghosts[circuit.id] ?? null);

    this.onEvent('circuit', {
      circuit,
      bestTime: record.bestTime,
      medal: record.medal,
      hasGhost: this.ghost.hasGhost,
    });
    this.restart();
    return circuit;
  }

  cycleCircuit(step) {
    const index = CIRCUITS.indexOf(this.circuit);
    return this.setCircuit(index + step);
  }

  _computeStartPose(list) {
    const first = list[0];
    // 22 m atrás do primeiro gate, na direção contrária à de atravessá-lo.
    this.startPose.position
      .copy(first.position)
      .addScaledVector(first.normal, -22);
    this.startPose.position.y = Math.max(
      this.startPose.position.y,
      this.terrain.heightAt(this.startPose.position.x, this.startPose.position.z) + 3,
    );
    this.startPose.heading = Math.atan2(-first.normal.x, -first.normal.z);
  }

  /** Reinício instantâneo. Devolve a pose onde o drone deve reaparecer. */
  restart() {
    this.state = 'armed';
    this.elapsed = 0;
    this.splits = [];
    this.combo = 0;
    this.bestCombo = 0;
    this.perfects = 0;
    this.scrapes = 0;
    this.earned = 0;
    this._comboTimer = 0;
    this.lastDelta = null;
    this.finishInfo = null;
    this.gates.setActive(0);
    this.gates.setVisible(true);
    this.ghost.rewind();
    this.ghost.hide();
    return this.startPose;
  }

  /**
   * @param {THREE.Vector3} from  posição no passo anterior
   * @param {THREE.Vector3} to    posição atual
   */
  update(dt, drone, from, to) {
    if (!this.circuit) return;

    if (this.state === 'running') {
      this.elapsed += dt;
      this.ghost.record(dt, this.elapsed, drone.position, drone.quaternion);
      this.ghost.play(this.elapsed);

      if (this._comboTimer > 0) {
        this._comboTimer -= dt;
        if (this._comboTimer <= 0 && this.combo > 0) {
          this.combo = 0;
          this.onEvent('comboLost', {});
        }
      }
    }

    if (this.state === 'finished') return;

    const hit = this.gates.test(from, to);
    if (hit) this._onGatePassed(hit, drone);
  }

  _onGatePassed(hit, drone) {
    const index = this.gates.active;
    const isFirst = index === 0;
    const isLast = index === this.gates.gates.length - 1;

    if (this.state === 'armed') {
      if (!isFirst) return;
      this.state = 'running';
      this.elapsed = 0;
      this.ghost.startRecording();
      this.ghost.rewind();
      this.onEvent('start', { circuit: this.circuit });
    }

    // Combo: encadear gates dentro da janela. Raspar derruba o acumulado, que
    // é o custo real de passar torto — o cronômetro fica honesto.
    if (hit.scrape) {
      this.scrapes++;
      this.combo = Math.max(0, this.combo - CONFIG.RACE.scrapeComboLoss);
    } else {
      this.combo = Math.min(CONFIG.RACE.comboMax, this.combo + 1);
    }
    if (hit.perfect) this.perfects++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this._comboTimer = CONFIG.RACE.comboWindow;

    // Pontos: centro e ritmo pagam. É a moeda que a Fase 5 vai gastar.
    const points = Math.round((hit.perfect ? 22 : 12) * (1 + this.combo * 0.25));
    this.earned += points;

    this.splits.push(this.elapsed);
    const best = this.save.circuit(this.circuit.id).bestSplits;
    this.lastDelta = best && best[this.splits.length - 1] != null
      ? this.elapsed - best[this.splits.length - 1]
      : null;

    this.gates.flashGate(index, !hit.scrape);
    this.onEvent('gate', {
      index,
      total: this.gates.gates.length,
      perfect: hit.perfect,
      scrape: hit.scrape,
      combo: this.combo,
      points,
      delta: this.lastDelta,
      speed: drone.horizontalSpeed,
    });

    if (isLast) this._finish();
    else this.gates.setActive(index + 1);
  }

  _finish() {
    this.state = 'finished';
    const time = this.elapsed;
    const record = this.save.circuit(this.circuit.id);
    const medal = this._medalFor(time);

    const improved = record.bestTime == null || time < record.bestTime;
    const samples = this.ghost.stopRecording();

    if (improved) {
      record.bestTime = +time.toFixed(3);
      record.bestSplits = this.splits.map((s) => +s.toFixed(3));
      // Só guarda o fantasma da MELHOR volta; guardar a última faria o
      // jogador correr contra a própria volta ruim.
      if (samples) {
        this.save.data.ghosts[this.circuit.id] = samples;
        this.ghost.load(samples);
      }
    }
    if (medal && (!record.medal || MEDAL_ORDER[medal] > MEDAL_ORDER[record.medal])) {
      record.medal = medal;
    }
    record.runs++;

    // Bônus de fim de volta: medalha e volta limpa pagam.
    const cleanBonus = this.scrapes === 0 ? 120 : 0;
    const medalBonus = medal ? { ouro: 400, prata: 220, bronze: 110 }[medal] : 0;
    this.earned += cleanBonus + medalBonus;
    this.save.progress.credits += this.earned;
    this.save.write();

    this.finishInfo = {
      time,
      medal,
      improved,
      bestTime: record.bestTime,
      delta: record.bestTime != null && !improved ? time - record.bestTime : null,
      perfects: this.perfects,
      scrapes: this.scrapes,
      earned: this.earned,
      circuit: this.circuit,
    };
    this.onEvent('finish', this.finishInfo);
  }

  _medalFor(time) {
    const target = this.circuit.targetSeconds;
    const m = CONFIG.RACE.medals;
    if (time <= target * m.gold) return 'ouro';
    if (time <= target * m.silver) return 'prata';
    if (time <= target * m.bronze) return 'bronze';
    return null;
  }

  /** Dados que a HUD desenha a cada frame. */
  hudState(dronePosition) {
    if (!this.circuit) return null;
    const gate = this.gates.current;
    const ghostDistance = this.ghost.distanceTo(dronePosition);
    return {
      circuit: this.circuit,
      state: this.state,
      elapsed: this.elapsed,
      gateIndex: this.gates.active,
      gateTotal: this.gates.gates.length,
      gatePosition: gate?.position ?? null,
      gateDistance: gate ? dronePosition.distanceTo(gate.position) : null,
      combo: this.combo,
      comboRatio: clamp(this._comboTimer / CONFIG.RACE.comboWindow, 0, 1),
      delta: this.lastDelta,
      ghostDistance,
      finish: this.finishInfo,
      bestTime: this.save.circuit(this.circuit.id).bestTime,
    };
  }

  setVisible(visible) {
    this.gates.setVisible(visible);
    if (!visible) this.ghost.hide();
  }

  dispose() {
    this.gates.dispose();
    this.ghost.dispose();
  }
}

export { CIRCUITS };
