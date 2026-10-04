/**
 * Governador de desempenho: lê o tempo de frame REAL e decide
 *   1) resolução dinâmica — `scale` (minScale..1) multiplica o pixel ratio;
 *      reage rápido (janelas de ~1 s);
 *   2) degraus de qualidade (só em modo automático) — quando a resolução já
 *      está no chão e o frame continua estourando, desce um degrau de
 *      AUTO_LADDER; quando está folgado com resolução cheia por bastante
 *      tempo, tenta subir um.
 *
 * Histerese: limiares assimétricos (desce com +12 % do orçamento, sobe com
 * folga ou "preso no vsync"), janelas consecutivas exigidas, carência depois
 * de cada troca (recompilação de shaders gera picos) e recuo exponencial
 * quando uma subida falha (subiu e precisou descer logo depois).
 *
 * Com vsync o frame nunca fica abaixo do intervalo da tela, então "folga" é
 * medida assim: média abaixo de 85 % do orçamento (tela de 120 Hz, ou alvo
 * de 30 fps numa tela de 60 Hz) OU frames estáveis no intervalo da tela,
 * quando esse intervalo cabe no orçamento.
 *
 * Puro (sem DOM): main.js alimenta `sample(dt)` e aplica as decisões; os
 * testes de tools/unit.test.mjs alimentam sequências sintéticas.
 */
export class Governor {
  /**
   * @param {object} o
   * @param {number} [o.targetFps=60]
   * @param {number} [o.minScale=0.6]  piso da resolução dinâmica
   * @param {number} [o.rung=1]        degrau atual (índice em AUTO_LADDER)
   * @param {number} [o.ceiling=0]     degrau mais caro permitido
   * @param {number} [o.floor=6]       degrau mais barato
   * @param {boolean} [o.auto=true]    false = só resolução dinâmica (preset manual)
   */
  constructor(o = {}) {
    this.targetFps = o.targetFps || 60;
    this.minScale = o.minScale ?? 0.6;
    this.maxScale = o.maxScale ?? 1;
    this.scale = o.scale ?? 1;
    this.rung = o.rung ?? 1;
    this.ceiling = o.ceiling ?? 0;
    this.floor = o.floor ?? 6;
    this.auto = o.auto ?? true;
    this.enabled = o.enabled ?? true;
    this.window = o.window ?? 1; // s por janela de medida
    this.downHold = o.downHold ?? 2; // janelas ruins seguidas (resolução no chão) para descer degrau
    this.upHold = o.upHold ?? 8; // janelas folgadas seguidas (resolução cheia) para subir degrau
    this.scaleUpHold = o.scaleUpHold ?? 2; // janelas folgadas para subir resolução
    this.grace = o.grace ?? 3; // s ignorados depois de uma troca de degrau
    this.backoffBase = o.backoffBase ?? 30; // s de bloqueio após subida que falhou (dobra a cada falha)
    this.failWindow = o.failWindow ?? 15; // s: descer antes disso = a subida falhou
    this.reset();
    this.clock = 0;
    this.blockedUntil = 0;
    this.failures = 0;
    this.lastUp = -1e9;
    this.refresh = 0; // ms do intervalo da tela (estimado)
    this.last = null; // última janela medida { mean, p90, ms }
  }

  get budget() {
    return 1000 / this.targetFps;
  }

  reset() {
    this.samples = [];
    this.acc = 0;
    this.bad = 0;
    this.good = 0;
  }

  /** Recomeça a medir (ex.: pausa, aba escondida, troca manual). */
  hold(seconds = 0) {
    this.reset();
    this.graceUntil = this.clock + seconds;
  }

  /**
   * Alimenta um frame (dt em segundos, tempo real). Retorna null ou a decisão
   * { scale?, rung?, reason } — o chamador aplica e o governador já assume.
   */
  sample(dt) {
    if (!this.enabled || !(dt > 0)) return null;
    this.clock += dt;
    // picos absurdos (aba voltou, GC longo, alerta) não contam
    if (dt > 0.25) return null;
    if (this.clock < (this.graceUntil || 0)) return null;
    this.samples.push(dt * 1000);
    this.acc += dt;
    if (this.acc < this.window || this.samples.length < 8) return null;
    const s = this.samples.slice().sort((a, b) => a - b);
    this.reset0();
    const n = s.length;
    const mean = s.reduce((a, b) => a + b, 0) / n;
    const p90 = s[Math.min(n - 1, Math.floor(n * 0.9))];
    const p10 = s[Math.floor(n * 0.1)];
    // intervalo da tela: o menor p10 visto (decai devagar para cima)
    this.refresh = this.refresh ? Math.min(this.refresh * 1.002, p10) : p10;
    this.last = { mean, p90, p10 };
    return this.decide(mean, p90);
  }

  reset0() {
    this.samples = [];
    this.acc = 0;
  }

  decide(mean, p90) {
    const B = this.budget;
    const over = mean > B * 1.12 || p90 > B * 1.6;
    const vsyncOk = this.refresh > 0 && this.refresh <= B * 1.02 && mean <= this.refresh * 1.1 && p90 <= this.refresh * 1.35;
    const under = !over && (mean < B * 0.85 || vsyncOk);
    if (over) {
      this.good = 0;
      this.bad++;
      if (this.scale > this.minScale + 1e-3) {
        // pixels ∝ escala²: corrige ~metade do excesso por janela
        const k = Math.max(0.8, Math.min(0.95, Math.sqrt(B / mean)));
        this.scale = Math.max(this.minScale, this.scale * k);
        return { scale: this.scale, reason: `over ${mean.toFixed(1)}ms` };
      }
      if (this.auto && this.bad >= this.downHold && this.rung < this.floor) {
        // subida recente que não se sustentou → recuo exponencial
        if (this.clock - this.lastUp < this.failWindow) {
          this.failures++;
          this.blockedUntil = this.clock + this.backoffBase * 2 ** (this.failures - 1);
        }
        this.rung++;
        this.bad = 0;
        // começa o degrau novo com resolução intermediária (sobe sozinho se der)
        this.scale = Math.max(this.minScale, Math.min(this.maxScale, 0.85));
        this.graceUntil = this.clock + this.grace;
        return { rung: this.rung, scale: this.scale, reason: `down ${mean.toFixed(1)}ms` };
      }
      return null;
    }
    this.bad = 0;
    if (!under) {
      this.good = 0;
      return null;
    }
    this.good++;
    if (this.scale < this.maxScale - 1e-3) {
      if (this.good >= this.scaleUpHold) {
        this.good = 0;
        this.scale = Math.min(this.maxScale, this.scale * 1.08);
        return { scale: this.scale, reason: 'headroom' };
      }
      return null;
    }
    if (this.auto && this.rung > this.ceiling && this.good >= this.upHold && this.clock >= this.blockedUntil) {
      this.good = 0;
      this.rung--;
      this.lastUp = this.clock;
      this.graceUntil = this.clock + this.grace;
      return { rung: this.rung, reason: 'up' };
    }
    return null;
  }
}
