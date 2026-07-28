import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { createRng } from '../procgen/rng.js';
import { LAYER_FAR } from '../core/Renderer.js';
import { updateDepthLayer } from './Planet.js';

/**
 * Estação espacial procedural.
 *
 * Estrutura toroidal com raios e um núcleo central — a silhueta clássica de
 * "2001", que é o que o jogador reconhece instantaneamente como estação
 * habitada em vez de destroço.
 *
 * Detalhe de gameplay: a estação GIRA. Não é enfeite — é a única referência
 * de movimento no espaço vazio quando você está parado ao lado dela, e é o
 * que faz a atracação ser uma manobra em vez de um botão.
 *
 * As luzes de sinalização são pontos emissivos instanciados, não `PointLight`.
 * Uma dúzia de luzes reais por estação obrigaria o Three a recompilar os
 * shaders de tudo em volta e custaria caro por fragmento — e o efeito visual
 * de "luz piscando" não precisa iluminar nada de fato.
 */
export class Station {
  /** @param {object} spec */
  constructor(spec) {
    this.spec = spec;
    this.radius = spec.radius;
    this.object = new THREE.Group();
    this.object.position.copy(spec.position);

    const rng = createRng(spec.seed);
    const parts = [];
    const matIdx = [];
    const push = (g, m) => { parts.push(g); matIdx.push(m); };
    const HULL = 0, TRIM = 1, GLOW = 2;

    const R = spec.radius;

    // ── Anel principal ────────────────────────────────────────────────────
    const ring = new THREE.TorusGeometry(R, R * 0.13, 8, 24);
    push(ring, HULL);

    // Segmentos de módulo ao longo do anel: caixas repetidas dão a leitura de
    // "estrutura construída" em vez de rosquinha lisa.
    const modules = 8 + Math.floor(rng() * 5);
    for (let i = 0; i < modules; i++) {
      const a = (i / modules) * Math.PI * 2;
      const box = new THREE.BoxGeometry(R * 0.22, R * 0.34, R * 0.3);
      box.rotateY(-a);
      box.translate(Math.cos(a) * R, 0, -Math.sin(a) * R);
      push(box, i % 3 === 0 ? TRIM : HULL);
    }

    // ── Núcleo e raios ────────────────────────────────────────────────────
    const hub = new THREE.CylinderGeometry(R * 0.2, R * 0.2, R * 0.75, 8);
    push(hub, HULL);
    const hubCap = new THREE.SphereGeometry(R * 0.22, 10, 8);
    hubCap.scale(1, 0.7, 1);
    hubCap.translate(0, R * 0.4, 0);
    push(hubCap, TRIM);

    const spokes = 4;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const spoke = new THREE.BoxGeometry(R * 0.85, R * 0.07, R * 0.07);
      spoke.translate(R * 0.5, 0, 0);
      spoke.rotateY(-a);
      push(spoke, TRIM);
    }

    // ── Baia de atracação ─────────────────────────────────────────────────
    // Um recorte iluminado no anel. É o alvo visual da atracação — sem um
    // ponto óbvio, o jogador orbita a estação sem saber o que fazer.
    const bay = new THREE.BoxGeometry(R * 0.42, R * 0.3, R * 0.42);
    bay.translate(0, 0, -R);
    push(bay, GLOW);

    // ── Luzes de sinalização ──────────────────────────────────────────────
    const lightCount = 12;
    for (let i = 0; i < lightCount; i++) {
      const a = (i / lightCount) * Math.PI * 2;
      const dot = new THREE.SphereGeometry(R * 0.035, 5, 4);
      dot.translate(Math.cos(a) * R * 1.06, 0, -Math.sin(a) * R * 1.06);
      push(dot, GLOW);
    }

    const materials = [
      new THREE.MeshStandardMaterial({ color: 0xb9b3a4, roughness: 0.62, metalness: 0.45, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0x3d4560, roughness: 0.45, metalness: 0.7, flatShading: true }),
      new THREE.MeshStandardMaterial({
        color: 0x102028, emissive: spec.lightColor, emissiveIntensity: 2.4,
        roughness: 0.4, flatShading: true, toneMapped: true,
      }),
    ];

    const { merged } = mergeByMaterial(parts, matIdx, materials.length);
    this.mesh = new THREE.Mesh(merged, materials);
    this.materials = materials;
    this.geometry = merged;
    this.object.add(this.mesh);
    for (const g of parts) g.dispose();

    // Inclina o eixo de rotação: uma estação perfeitamente alinhada com o
    // plano da órbita parece um objeto de editor, não algo construído.
    this.object.rotation.x = spec.tilt;
    this.object.rotation.z = spec.tilt * 0.6;

    this.spinSpeed = spec.spinSpeed;
    this._blink = 0;
    this.inNearRange = false;
    this.object.traverse((o) => o.layers.set(LAYER_FAR));
  }

  /** @param {THREE.Vector3} cameraPos @param {number} dt */
  update(cameraPos, dt) {
    this.mesh.rotation.y += this.spinSpeed * dt;

    // Pisca-pisca das luzes de sinalização.
    this._blink += dt;
    const pulse = 1.6 + Math.sin(this._blink * 2.6) * 1.1;
    this.materials[2].emissiveIntensity = pulse;

    updateDepthLayer(this, cameraPos);
  }

  dispose() {
    this.geometry.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/** Mescla agrupando por material — um grupo por material, não por peça.
 *  Ver o mesmo padrão em ShipModel.js. */
function mergeByMaterial(parts, matIdx, materialCount) {
  const ordered = [];
  const boundary = [];
  for (let m = 0; m < materialCount; m++) {
    for (let i = 0; i < parts.length; i++) if (matIdx[i] === m) ordered.push(parts[i]);
    boundary.push(ordered.length);
  }
  const merged = BufferGeometryUtils.mergeGeometries(ordered, true);
  const groups = [];
  let start = 0, cursor = 0;
  for (let m = 0; m < materialCount; m++) {
    let count = 0;
    while (cursor < boundary[m]) { count += merged.groups[cursor].count; cursor++; }
    groups.push({ start, count, materialIndex: m });
    start += count;
  }
  merged.groups = groups;
  merged.computeVertexNormals();
  return { merged };
}
