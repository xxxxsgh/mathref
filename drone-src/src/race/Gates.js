import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Os gates: malha, numeração e detecção de passagem.
 *
 * A detecção testa SÓ o gate ativo. A ordem é obrigatória, então testar todos
 * seria trabalho jogado fora — e pior, deixaria o jogador "passar" no gate 7
 * por acidente enquanto procura o 3.
 *
 * O teste é geométrico e não por proximidade: guardamos a posição do passo
 * anterior e vemos se o segmento entre as duas cruzou o plano do gate. A 130
 * km/h o drone anda 60 cm por passo de física — um teste de "está perto?"
 * deixaria passar batido em metade das tentativas.
 */

const DIM = 0.18;

export class Gates {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.gates = [];
    this.active = 0;

    this.ringGeometry = new THREE.TorusGeometry(
      CONFIG.RACE.gateRadius,
      CONFIG.RACE.gateTubeRadius,
      6,
      28,
    );
    this._labelTextures = new Map();

    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
    this._point = new THREE.Vector3();
  }

  /** Monta as malhas a partir da lista devolvida por `buildGates`. */
  build(gateList, color = 0x35e0c8) {
    this.clear();
    this.color = color;

    gateList.forEach((gate, i) => {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: DIM,
      });
      const ring = new THREE.Mesh(this.ringGeometry, material);
      ring.position.copy(gate.position);
      // O toro nasce no plano XY; girar em Y alinha o furo com a normal.
      ring.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        gate.normal.clone().normalize(),
      );

      const label = this._makeLabel(i + 1, color);
      label.position.copy(gate.position);
      label.position.y += CONFIG.RACE.gateRadius + 1.1;

      this.group.add(ring);
      this.group.add(label);
      this.gates.push({ ...gate, ring, material, label });
    });

    this.setActive(0);
    return this.gates;
  }

  /**
   * Destaca o gate atual e deixa o próximo num tom mais fraco.
   * Sem essa hierarquia o jogador precisa ler o número no meio da corrida, e a
   * 130 km/h não dá tempo de ler nada.
   */
  setActive(index) {
    this.active = index;
    this.gates.forEach((gate, i) => {
      const isCurrent = i === index;
      const isNext = i === index + 1;
      gate.material.opacity = isCurrent ? 0.95 : isNext ? 0.42 : DIM;
      gate.material.color.setHex(isCurrent ? 0xffffff : this.color);
      gate.label.material.opacity = isCurrent ? 1 : isNext ? 0.5 : 0.12;
      // O gate atual pulsa de leve — chama o olho sem piscar irritante.
      gate.ring.scale.setScalar(isCurrent ? 1.0 : 1.0);
    });
  }

  get current() {
    return this.gates[this.active] ?? null;
  }

  /**
   * Testa se o segmento `from → to` atravessou o gate ativo.
   * @returns {null | {passed:boolean, radial:number, perfect:boolean, scrape:boolean}}
   */
  test(from, to) {
    const gate = this.current;
    if (!gate) return null;

    const before = this._a.subVectors(from, gate.position).dot(gate.normal);
    const after = this._b.subVectors(to, gate.position).dot(gate.normal);

    // Só conta atravessar no sentido certo. Voltar por trás do gate não passa.
    if (before > 0 || after <= 0) return null;

    // Ponto exato do cruzamento, pra medir o quanto passou do centro.
    const t = before / (before - after);
    this._point.lerpVectors(from, to, t);
    const radial = this._point.distanceTo(gate.position);

    const R = CONFIG.RACE.gateRadius;
    if (radial > R) return null; // passou por fora: não vale, tem que voltar

    return {
      passed: true,
      radial,
      perfect: radial <= CONFIG.RACE.perfectRadius,
      // Perto da borda: o drone raspou o aro. Vale, mas com penalidade.
      scrape: radial >= R - CONFIG.DRONE.radius * 2.2,
      point: this._point.clone(),
    };
  }

  /** Feedback visual imediato ao cruzar. */
  flashGate(index, ok = true) {
    const gate = this.gates[index];
    if (!gate) return;
    gate.material.color.setHex(ok ? 0xffffff : 0xff4d5e);
    gate.material.opacity = 1;
  }

  _makeLabel(number, color) {
    let texture = this._labelTextures.get(number);
    if (!texture) {
      // Canvas pequeno: o número é lido de longe, não precisa de resolução.
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 46px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), 32, 34);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this._labelTextures.set(number, texture);
    }

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, color, transparent: true, depthTest: false }),
    );
    sprite.scale.setScalar(2.4);
    return sprite;
  }

  clear() {
    for (const gate of this.gates) {
      this.group.remove(gate.ring);
      this.group.remove(gate.label);
      gate.material.dispose();
      gate.label.material.dispose();
    }
    this.gates.length = 0;
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  dispose() {
    this.clear();
    this.ringGeometry.dispose();
    for (const texture of this._labelTextures.values()) texture.dispose();
    this.scene.remove(this.group);
  }
}
