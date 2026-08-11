import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { clamp } from '../core/MathUtils.js';

/**
 * Dano por partes.
 *
 * Cada peça avariada muda a PILOTAGEM de um jeito diferente e reconhecível sem
 * ler HUD nenhum: hélice torta puxa pro lado, câmera avariada suja a imagem,
 * bateria avariada esvazia mais rápido. Uma barra de "integridade" genérica não
 * ensinaria nada — o jogador precisa sentir *o que* quebrou pra decidir se
 * continua ou volta pra base.
 *
 * O modo "sem risco" zera tudo isto sem mexer no resto do jogo: é o mesmo voo,
 * só que sem conta pra pagar.
 */
export class Damage {
  constructor(save) {
    this.save = save;
    this.parts = { helice: 0, camera: 0, bateria: 0 };
    this._bias = new THREE.Vector3();
    /** Quanto foi gasto em reparo nesta sessão — a HUD do hangar mostra. */
    this.repairSpent = 0;
  }

  get noRisk() {
    return Boolean(this.save.progress.noRisk);
  }

  get any() {
    return this.parts.helice > 0.02 || this.parts.camera > 0.02 || this.parts.bateria > 0.02;
  }

  get worst() {
    let name = null;
    let value = 0;
    for (const [part, amount] of Object.entries(this.parts)) {
      if (amount > value) {
        value = amount;
        name = part;
      }
    }
    return { name, value };
  }

  /**
   * Distribui o dano de uma batida.
   *
   * Quanto mais forte o impacto, mais peças pegam. O sorteio é determinístico
   * pela velocidade e pelo ângulo pra evitar a sensação de punição aleatória:
   * a mesma batida sempre quebra a mesma coisa.
   */
  applyCrash(impactSpeed, normalY = 0) {
    if (this.noRisk) return null;
    const D = CONFIG.DAMAGE;
    const severity = clamp((impactSpeed - CONFIG.DRONE.crashSpeed) / D.severeSpeed, 0, 1);
    if (severity <= 0) return null;

    // Bater de barriga (normal apontando pra cima) castiga hélice; bater de
    // frente castiga câmera. É o que a geometria da colisão já diz.
    const frontal = 1 - clamp(normalY, 0, 1);
    const broken = [];

    const hit = (part, amount) => {
      if (amount <= 0.01) return;
      const before = this.parts[part];
      this.parts[part] = clamp(before + amount, 0, 1);
      if (this.parts[part] > before + 0.05) broken.push(part);
    };

    hit('helice', severity * D.propellerShare * (0.4 + (1 - frontal) * 0.8));
    hit('camera', severity * D.cameraShare * (0.3 + frontal));
    hit('bateria', severity * D.batteryShare);

    return broken.length ? { broken, severity } : null;
  }

  /**
   * Desvio de rotação por hélice quebrada, em rad/s no referencial do corpo.
   * Entra direto no `env.torqueBias` do modelo de voo — o drone puxa pro lado
   * e o piloto precisa segurar, que é exatamente o sintoma real.
   */
  torqueBias() {
    const amount = this.parts.helice;
    if (amount < 0.02) return null;
    // Sempre pro mesmo lado: um puxão que muda de direção seria impossível de
    // compensar e viraria só frustração.
    return this._bias.set(0, amount * CONFIG.DAMAGE.yawPull, amount * CONFIG.DAMAGE.rollPull);
  }

  /** Artefatos de imagem (0..1) — usa o mesmo caminho da perda de sinal. */
  get cameraArtifacts() {
    return this.parts.camera;
  }

  /** Multiplicador de consumo por bateria avariada. */
  get drainMultiplier() {
    return 1 + this.parts.bateria * CONFIG.DAMAGE.batteryDrainPenalty;
  }

  /** Custo pra deixar tudo novo. É a conta que o risco cobra. */
  repairCost() {
    const D = CONFIG.DAMAGE;
    return Math.round(
      (this.parts.helice + this.parts.camera + this.parts.bateria) * D.repairCostPerPart,
    );
  }

  /** Repara o que o jogador puder pagar, começando pelo mais avariado. */
  repair() {
    const cost = this.repairCost();
    if (cost === 0) return { repaired: true, cost: 0 };
    if (this.save.progress.credits < cost) return { repaired: false, cost };
    this.save.progress.credits -= cost;
    this.repairSpent += cost;
    this.parts.helice = this.parts.camera = this.parts.bateria = 0;
    this.save.write();
    return { repaired: true, cost };
  }

  clear() {
    this.parts.helice = this.parts.camera = this.parts.bateria = 0;
  }

  describe() {
    const names = { helice: 'hélice', camera: 'câmera', bateria: 'bateria' };
    return Object.entries(this.parts)
      .filter(([, amount]) => amount > 0.02)
      .map(([part, amount]) => `${names[part]} ${Math.round(amount * 100)}%`)
      .join(' · ');
  }
}
