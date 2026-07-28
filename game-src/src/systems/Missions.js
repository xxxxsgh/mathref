import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Missões — o arco da partida.
 *
 * ═══ POR QUE ISSO EXISTE ═══
 *
 * Sem objetivo, um sandbox de voo tem cerca de cinco minutos de interesse:
 * você experimenta os controles, atira em alguma coisa, e depois não há
 * motivo pra ir a lugar nenhum. A missão não precisa ser complexa — precisa
 * dar um DESTINO e um critério de conclusão.
 *
 * As missões aqui são encadeadas e ensinam o jogo na ordem certa:
 *   1. minerar     → aprende a atirar em algo parado e a usar a carga
 *   2. atracar     → aprende a navegar até um ponto distante e a gastar
 *   3. combater    → aprende a mirar em algo que se move
 *   4. explorar    → aprende que planetas são visitáveis
 *   5. alvo final  → junta tudo
 *
 * Cada missão declara um marcador de destino, e a HUD desenha uma seta até
 * ele. Uma missão que não diz PARA ONDE IR é indistinguível de nenhuma
 * missão.
 */
export class Missions {
  /**
   * @param {import('../procgen/SolarSystem.js').SolarSystem} system
   * @param {import('./Progression.js').Progression} progression
   */
  constructor(system, progression) {
    this.system = system;
    this.progression = progression;
    this.index = 0;
    this.completed = false;
    this.progress = 0;
    this.target = 0;
    /** Posição do objetivo atual, ou null se não houver destino físico. */
    this.marker = new THREE.Vector3();
    this.hasMarker = false;
    this.markerLabel = '';

    this.list = this._build();
    this._enter();
  }

  _build() {
    const sys = this.system;
    const station = sys.stations[0] ?? null;
    const belt = sys.beltSpec;
    const landable = sys.planets.filter((p) => p.spec.landable);

    /** @type {Array<object>} */
    const list = [];

    // ⚠ EXPLORAR VEM PRIMEIRO, e isso é deliberado. A ordem anterior começava
    // pela mineração, o que mandava o jogador ficar no cinturão atirando em
    // pedra — e ele terminava a partida sem descobrir que dava para descer num
    // planeta. A primeira missão é a que define o que o jogo "é"; se ela não
    // aponta para um planeta, os planetas viram cenário.
    if (landable.length > 0) {
      const goal = Math.min(CONFIG.progression.missionPlanetTarget, landable.length);
      list.push({
        id: 'explore',
        title: 'RECONHECIMENTO',
        brief: `Voe até ${goal > 1 ? `${goal} planetas` : 'um planeta'} e sobrevoe em baixa altitude.`,
        target: goal,
        // O marcador aponta pro planeta ainda NÃO visitado mais próximo —
        // resolvido dinamicamente, senão a seta continuaria apontando pra um
        // planeta que o jogador já visitou.
        dynamicMarker: (ctx) => {
          let best = null, bestD = Infinity;
          for (const p of landable) {
            if (ctx.progression.stats.planetsVisited.includes(p.spec.name)) continue;
            const d = ctx.playerPos.distanceToSquared(p.object.position);
            if (d < bestD) { bestD = d; best = p; }
          }
          return best ? { pos: best.object.position, label: `PLANETA ${best.spec.name}` } : null;
        },
        measure: (ctx) => ctx.progression.stats.planetsVisited.length,
      });
    }

    list.push({
      id: 'mine',
      title: 'EXTRAÇÃO',
      brief: 'Destrua asteroides com minério — eles brilham em verde.',
      target: CONFIG.progression.missionOreTarget,
      marker: belt
        ? new THREE.Vector3((belt.innerRadius + belt.outerRadius) / 2, 0, 0)
        : null,
      markerLabel: 'CINTURÃO',
      measure: (ctx) => ctx.progression.stats.asteroidsMined,
    });

    if (station) {
      list.push({
        id: 'dock',
        title: 'ATRACAÇÃO',
        brief: `Leve o minério até a ${station.spec.name} e converta em créditos.`,
        target: 1,
        marker: station.object.position.clone(),
        markerLabel: station.spec.name,
        measure: (ctx) => ctx.progression.stats.stationsDocked,
      });
    }

    list.push({
      id: 'fight',
      title: 'INTERCEPTAÇÃO',
      brief: 'Abata caças hostis.',
      target: CONFIG.progression.missionKillTarget,
      marker: null,
      markerLabel: '',
      measure: (ctx) => ctx.progression.stats.kills,
    });

    // Alvo final: a estação mais distante do ponto de partida vira o objetivo
    // de encerramento. Dá um "fim de partida" concreto sem precisar de chefe.
    const finalStation = sys.stations[sys.stations.length - 1] ?? null;
    list.push({
      id: 'final',
      title: 'DESTINO FINAL',
      brief: finalStation
        ? `Alcance a ${finalStation.spec.name} com o casco intacto.`
        : 'Alcance a órbita do planeta mais distante.',
      target: 1,
      marker: (finalStation?.object.position ?? sys.planets[sys.planets.length - 1].object.position).clone(),
      markerLabel: finalStation?.spec.name ?? 'ÓRBITA EXTERNA',
      // Chegada por proximidade, não por evento: qualquer coisa que leve o
      // jogador até lá conta.
      proximity: CONFIG.progression.missionArriveDistance,
      measure: () => 0,
    });

    return list;
  }

  get current() { return this.list[this.index] ?? null; }
  get isComplete() { return this.completed; }

  _enter() {
    const m = this.current;
    if (!m) { this.completed = true; return; }
    this.target = m.target;
    this._baseline = null;
    this.progress = 0;
  }

  /**
   * @param {THREE.Vector3} playerPos
   * @param {number} dt
   * @returns {{ advanced: boolean, finished: boolean, title: string }}
   */
  update(playerPos, dt) {
    const m = this.current;
    if (!m || this.completed) return { advanced: false, finished: false, title: '' };

    const ctx = { progression: this.progression, playerPos };

    // Marcador
    if (m.dynamicMarker) {
      const d = m.dynamicMarker(ctx);
      if (d) { this.marker.copy(d.pos); this.markerLabel = d.label; this.hasMarker = true; }
      else this.hasMarker = false;
    } else if (m.marker) {
      this.marker.copy(m.marker);
      this.markerLabel = m.markerLabel;
      this.hasMarker = true;
    } else {
      this.hasMarker = false;
    }

    // Progresso relativo ao valor no momento em que a missão começou. Sem a
    // linha de base, uma missão de "abata 5" já nasceria completa se o jogador
    // tivesse abatido 5 antes de recebê-la.
    const raw = m.measure(ctx);
    if (this._baseline === null) this._baseline = raw;
    this.progress = Math.max(0, raw - this._baseline);

    let done = this.progress >= this.target;

    if (m.proximity && this.hasMarker) {
      const d = playerPos.distanceTo(this.marker);
      this.progress = d < m.proximity ? 1 : 0;
      done = this.progress >= 1;
    }

    if (!done) return { advanced: false, finished: false, title: m.title };

    const title = m.title;
    this.index++;
    const finished = this.index >= this.list.length;
    if (finished) this.completed = true;
    else this._enter();
    return { advanced: true, finished, title };
  }

  /** Texto curto pra HUD. */
  get statusText() {
    if (this.completed) return 'MISSÃO CUMPRIDA';
    const m = this.current;
    if (!m) return '';
    if (m.proximity) return m.title;
    return `${m.title}  ${Math.min(this.progress, this.target)}/${this.target}`;
  }
}
