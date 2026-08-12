import * as THREE from 'three';

/**
 * Os três circuitos, no MESMO mapa. Cada um cobra uma coisa diferente do
 * piloto — se os três fossem só "voe rápido em volta", ter três seria conteúdo
 * repetido com nome diferente.
 *
 * As posições são relativas ao ponto de partida e a altura é sempre medida a
 * partir do terreno, então o traçado continua válido onde o relevo sobe.
 */

/**
 * @typedef {object} GateSpec
 * @property {number} x, z  deslocamento horizontal (m) em relação à largada
 * @property {number} h     altura acima do TERRENO no ponto (m)
 */

export const CIRCUITS = [
  {
    id: 'aberto',
    name: 'Aberto',
    subtitle: 'Curvas largas, altura confortável',
    hint: 'Bom pra aprender a linha. Dá pra fazer inteiro em ANGLE.',
    targetSeconds: 42,
    color: 0x35e0c8,
    // Anel amplo com uma reta longa: o circuito onde acelerar compensa.
    gates: [
      { x: 0, z: -60, h: 12 },
      { x: 70, z: -130, h: 14 },
      { x: 175, z: -150, h: 16 },
      { x: 250, z: -70, h: 13 },
      { x: 235, z: 55, h: 15 },
      { x: 140, z: 120, h: 12 },
      { x: 30, z: 100, h: 14 },
      { x: -40, z: 20, h: 12 },
    ],
  },
  {
    id: 'tecnico',
    name: 'Técnico',
    subtitle: 'Baixo, apertado, muita troca de direção',
    hint: 'Voar baixo entre os obstáculos. O acelerador cravado te mata aqui.',
    targetSeconds: 55,
    color: 0xffb545,
    // Zigue-zague curto e rasante: cobra troca de direção, não velocidade de
    // ponta. Alturas pequenas obrigam a rasar o terreno.
    gates: [
      { x: 18, z: -34, h: 5 },
      { x: -22, z: -70, h: 4 },
      { x: 26, z: -104, h: 6 },
      { x: 74, z: -78, h: 4.5 },
      { x: 96, z: -128, h: 7 },
      { x: 52, z: -158, h: 4 },
      { x: -4, z: -140, h: 5.5 },
      { x: -46, z: -104, h: 4 },
      { x: -30, z: -46, h: 6 },
      { x: 12, z: -8, h: 5 },
    ],
  },
  {
    id: 'vertical',
    name: 'Vertical',
    subtitle: 'Subidas longas e mergulhos',
    hint: 'Ouro aqui exige ACRO: em ANGLE o ângulo trava antes de dar velocidade.',
    targetSeconds: 48,
    color: 0xff4d5e,
    // Escada de altura: a coluna sobe até 95 m e despenca. É onde o mergulho e
    // a recuperação são cobrados, e onde o limite de 38° do ANGLE pesa.
    gates: [
      { x: 0, z: -50, h: 8 },
      { x: 40, z: -95, h: 34 },
      { x: 20, z: -150, h: 62 },
      { x: -45, z: -170, h: 95 },
      { x: -105, z: -120, h: 60 },
      { x: -85, z: -55, h: 22 },
      { x: -30, z: -20, h: 6 },
      { x: 45, z: -30, h: 30 },
      { x: 10, z: 30, h: 10 },
    ],
  },
];

/**
 * Converte o traçado em gates no mundo: fixa a altura sobre o terreno e faz
 * cada gate encarar a linha que o atravessa.
 *
 * A orientação sai da bissetriz entre "de onde vim" e "pra onde vou". Apontar
 * o gate só pro próximo faria as curvas terem gates atravessados na cara de
 * quem chega — impossíveis de cruzar sem raspar.
 */
export function buildGates(circuit, origin, terrain) {
  const specs = circuit.gates;
  return specs.map((spec, index) => {
    const position = new THREE.Vector3(
      origin.x + spec.x,
      terrain.heightAt(origin.x + spec.x, origin.z + spec.z) + spec.h,
      origin.z + spec.z,
    );

    const prev = specs[(index - 1 + specs.length) % specs.length];
    const next = specs[(index + 1) % specs.length];

    const incoming = new THREE.Vector2(spec.x - prev.x, spec.z - prev.z).normalize();
    const outgoing = new THREE.Vector2(next.x - spec.x, next.z - spec.z).normalize();
    const through = incoming.add(outgoing);
    if (through.lengthSq() < 1e-6) through.copy(outgoing);
    through.normalize();

    return {
      index,
      position,
      // Normal do plano do gate: a direção em que se atravessa.
      normal: new THREE.Vector3(through.x, 0, through.y).normalize(),
      spec,
    };
  });
}

export const circuitById = (id) => CIRCUITS.find((c) => c.id === id) ?? CIRCUITS[0];
