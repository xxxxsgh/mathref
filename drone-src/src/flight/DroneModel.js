import * as THREE from 'three';
import { mergeGeometries } from '../world/Props.js';

/**
 * Malha do drone. Em primeira pessoa ela quase não aparece — existe pra sombra,
 * pro modo de 3ª pessoa e, principalmente, pro fantasma da Fase 2, que precisa
 * ser reconhecível como "um drone" a 50 m de distância.
 *
 * Os discos das hélices giram só o suficiente pra dar vida; velocidade real de
 * hélice a 60 fps vira aliasing e parece que estão paradas.
 */
export function buildDroneModel({ color = 0x1f2933, accent = 0x35e0c8, ghost = false } = {}) {
  const group = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(0.26, 0.09, 0.36);
  const armGeo = buildArms();

  const material = new THREE.MeshLambertMaterial({
    color,
    transparent: ghost,
    opacity: ghost ? 0.4 : 1,
    depthWrite: !ghost,
  });
  const accentMaterial = new THREE.MeshBasicMaterial({
    color: accent,
    transparent: true,
    opacity: ghost ? 0.35 : 0.9,
    depthWrite: false,
  });

  const body = new THREE.Mesh(mergeGeometries([bodyGeo, armGeo]), material);
  body.castShadow = !ghost;
  group.add(body);

  // Discos das hélices
  const rotors = [];
  const discGeo = new THREE.RingGeometry(0.06, 0.17, 12);
  discGeo.rotateX(-Math.PI / 2);
  for (const [x, z] of [
    [0.19, 0.19],
    [-0.19, 0.19],
    [0.19, -0.19],
    [-0.19, -0.19],
  ]) {
    const disc = new THREE.Mesh(discGeo, accentMaterial);
    disc.position.set(x, 0.045, z);
    group.add(disc);
    rotors.push(disc);
  }

  // Luz de nariz: dá pra saber pra onde o fantasma está apontando de longe.
  const noseGeo = new THREE.SphereGeometry(0.035, 6, 5);
  const nose = new THREE.Mesh(noseGeo, accentMaterial);
  nose.position.set(0, 0.02, -0.2);
  group.add(nose);

  group.userData.rotors = rotors;
  group.userData.dispose = () => {
    body.geometry.dispose();
    discGeo.dispose();
    noseGeo.dispose();
    material.dispose();
    accentMaterial.dispose();
  };
  return group;
}

function buildArms() {
  const arms = [];
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.BoxGeometry(0.54, 0.03, 0.05);
    arm.rotateY(angle);
    arms.push(arm);
  }
  return mergeGeometries(arms);
}

/** Gira os discos conforme o RPM. Chamado no render, não na física. */
export function spinRotors(model, rpm, dt) {
  const speed = 8 + rpm * 26;
  for (let i = 0; i < model.userData.rotors.length; i++) {
    // Sentidos alternados, como num quadricóptero de verdade.
    model.userData.rotors[i].rotation.y += speed * dt * (i % 2 === 0 ? 1 : -1);
  }
}
