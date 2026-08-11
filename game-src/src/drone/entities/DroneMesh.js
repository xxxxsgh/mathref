import * as THREE from 'three';

/**
 * Malha do quadricóptero, construída em código.
 *
 * ═══ ESCALA REAL ═══
 *
 * O drone tem 25 cm de diagonal, como um freestyle de 5 polegadas de
 * verdade. Isso parece um detalhe e não é: a escala do drone define a escala
 * PERCEBIDA do mundo inteiro. Um drone de 2 metros faria as árvores de 10
 * metros parecerem arbustos e o vale inteiro parecer um jardim. Com 25 cm, a
 * mesma árvore é uma árvore — e passar entre dois troncos é o que deveria
 * ser: apertado.
 *
 * ═══ AS HÉLICES ═══
 *
 * Hélice girando a 20.000 rpm não é uma hélice: é um disco translúcido. A 60
 * fps, desenhar a pá de verdade produz aliasing temporal (a hélice parece
 * girar devagar, parada, ou ao contrário — o efeito estroboscópico do
 * cinema), que é exatamente o oposto da sensação de potência.
 *
 * A solução é a que a indústria usa: duas representações, com transição
 * cruzada por rotação. Devagar, as pás. Rápido, o disco. No meio, os dois
 * com transparência somando um no outro.
 */

/** Meia-diagonal do frame, em metros. */
const ARM = 0.11;
const PROP_R = 0.0635;   // hélice de 5 polegadas

/** Ordem dos motores igual à da física: RR, FR, RL, FL.
 *  A frente é -Z, então "traseiro" é +Z. */
const MOTOR_POS = [
  [+ARM, 0, +ARM],
  [+ARM, 0, -ARM],
  [-ARM, 0, +ARM],
  [-ARM, 0, -ARM],
];
/** Sentido de giro. Motores diagonalmente opostos giram juntos — é o que
 *  cancela o torque de reação e o que permite guinar acelerando um par. */
const SPIN = [+1, -1, -1, +1];

export class DroneMesh {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.name = 'drone';
    scene.add(this.group);

    const carbon = new THREE.MeshStandardMaterial({
      color: 0x1b1d22, roughness: 0.42, metalness: 0.55,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x2a2d33, roughness: 0.65, metalness: 0.3,
    });
    const alu = new THREE.MeshStandardMaterial({
      color: 0x9aa2ad, roughness: 0.3, metalness: 0.85,
    });
    this._materials = [carbon, dark, alu];

    // ── Braços ────────────────────────────────────────────────────────
    // Um braço por motor, girado para apontar para ele. Braços em X (e não
    // em cruz) porque é o layout de qualquer quad de corrida: deixa o campo
    // de visão da câmera livre à frente.
    for (const [x, , z] of MOTOR_POS) {
      const len = Math.hypot(x, z);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(len, 0.008, 0.022), carbon);
      arm.position.set(x / 2, 0, z / 2);
      arm.rotation.y = -Math.atan2(z, x);
      this.group.add(arm);
    }

    // ── Placa central e stack ─────────────────────────────────────────
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.006, 0.10), carbon);
    this.group.add(plate);
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.026, 0.036), dark);
    stack.position.y = 0.016;
    this.group.add(stack);

    // Bateria em cima, com a cinta. Um quad de verdade voa com a bateria
    // presa por cima e isso muda a silhueta — é o volume que se reconhece.
    const batt = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.030, 0.078),
      new THREE.MeshStandardMaterial({ color: 0x14324e, roughness: 0.5 }));
    batt.position.set(0, 0.040, 0.006);
    this.group.add(batt);

    // ── Pod da câmera ─────────────────────────────────────────────────
    // Inclinado para cima, como a de verdade. A lente é uma esfera escura
    // com um realce especular — é o que faz o pod ser lido como "câmera".
    const pod = new THREE.Group();
    pod.position.set(0, 0.016, -0.036);
    pod.rotation.x = 0.42;
    const podBody = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.026, 0.020), dark);
    pod.add(podBody);
    const lens = new THREE.Mesh(
      new THREE.SphereGeometry(0.008, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.05, metalness: 0.9 }),
    );
    lens.position.z = -0.012;
    pod.add(lens);
    this.group.add(pod);

    // Antena de vídeo: uma haste fina para trás com a ponta laranja. Detalhe
    // de silhueta que custa dois triângulos e é o que a vista de solo vê.
    const ant = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0016, 0.0016, 0.055, 4),
      new THREE.MeshStandardMaterial({ color: 0x1a1a1a }),
    );
    ant.position.set(0, 0.045, 0.052);
    ant.rotation.x = -0.5;
    this.group.add(ant);
    const antTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.020, 8),
      new THREE.MeshStandardMaterial({ color: 0xff7a2a, emissive: 0xff5500, emissiveIntensity: 0.4 }),
    );
    antTip.position.set(0, 0.069, 0.065);
    antTip.rotation.x = -0.5;
    this.group.add(antTip);

    // ── Motores, hélices e discos ─────────────────────────────────────
    this.props = [];
    this.discs = [];
    this._spinAngle = [0, 0, 0, 0];

    const bladeGeo = this._bladeGeometry();
    const discGeo = new THREE.CircleGeometry(PROP_R, 20);
    discGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < 4; i++) {
      const [x, , z] = MOTOR_POS[i];
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.016, 12), alu);
      bell.position.set(x, 0.012, z);
      this.group.add(bell);

      const prop = new THREE.Mesh(bladeGeo, new THREE.MeshStandardMaterial({
        color: 0xe8ecf2, roughness: 0.4, side: THREE.DoubleSide,
        transparent: true, opacity: 1,
      }));
      prop.position.set(x, 0.022, z);
      this.group.add(prop);
      this.props.push(prop);

      const disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({
        color: 0xdfe6ef, transparent: true, opacity: 0, depthWrite: false,
        side: THREE.DoubleSide,
      }));
      disc.position.set(x, 0.022, z);
      this.group.add(disc);
      this.discs.push(disc);
    }

    // ── LEDs ──────────────────────────────────────────────────────────
    // Verde armado, vermelho desarmado. É o mesmo código de qualquer
    // controlador de voo, e é a única indicação de estado que a vista de
    // solo tem — de longe não dá para ver se as hélices giram.
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0xff3020 });
    const ledGeo = new THREE.SphereGeometry(0.006, 8, 6);
    for (const [x, , z] of MOTOR_POS) {
      const led = new THREE.Mesh(ledGeo, this.ledMat);
      led.position.set(x * 0.85, -0.006, z * 0.85);
      this.group.add(led);
    }

    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this._tmpColor = new THREE.Color();
  }

  /** Hélice de duas pás: uma barra fina passando pelo cubo.
   *  Uma barra e não duas pás separadas porque é literalmente a mesma
   *  geometria — e a hélice só é vista nítida abaixo de 40 rotações por
   *  segundo, onde ninguém conta o número de faces. */
  _bladeGeometry() {
    return new THREE.BoxGeometry(PROP_R * 2, 0.0016, 0.013);
  }

  /**
   * @param {import('../physics/Quad.js').Quad} quad
   * @param {number} dt
   */
  update(quad, dt) {
    this.group.position.copy(quad.position);
    this.group.quaternion.copy(quad.quaternion);

    for (let i = 0; i < 4; i++) {
      const t = quad.motorThrust[i];
      // Rotação por segundo. A raiz quadrada aproxima a relação real entre
      // empuxo e rotação (empuxo ∝ rpm²), então a hélice acelera muito no
      // começo do acelerador e pouco no fim — que é como soa e como parece.
      const rps = t > 0.001 ? 18 + Math.sqrt(t) * 300 : 0;
      this._spinAngle[i] += SPIN[i] * rps * dt * Math.PI * 2;
      this.props[i].rotation.y = this._spinAngle[i];

      // Transição pá → disco. Acima de ~40 rps a pá vira serrilhado temporal
      // e o disco assume; entre 12 e 40 os dois convivem.
      const blur = Math.min(1, Math.max(0, (rps - 12) / 28));
      this.props[i].material.opacity = 1 - blur * 0.92;
      this.discs[i].material.opacity = blur * 0.30;
      // O disco também gira: sem isso ele é um círculo perfeitamente
      // estático, e o olho percebe que não há movimento nenhum.
      this.discs[i].rotation.y = this._spinAngle[i] * 0.13;
    }

    this.ledMat.color.setHex(
      quad.crashed ? 0x552222 : quad.armed ? 0x2bff5c : 0xff3020,
    );
  }

  setVisible(v) { this.group.visible = v; }

  dispose() {
    this.group.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose?.();
    });
  }
}
