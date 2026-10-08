/**
 * Nave PLACEHOLDER (sem serviço — some quando o sistema `ship` publica o
 * dele): um cockpit mínimo na camada de cockpit (1ª pessoa, modo ship) e um
 * casco simples no mundo (3ª pessoa, modos ship/space). Só para que os
 * presets 'cockpit' e a 3ª pessoa tenham algo a mostrar antes do sistema.
 */
import * as THREE from 'three';

export function installPlaceholderShip(ctx) {
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.55, metalness: 0.6 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.4, metalness: 0.8 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x2fd6ff, emissiveIntensity: 2.2, roughness: 0.3 });
  const warm = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa040, emissiveIntensity: 2.0 });

  // ── cockpit (referencial da nave; olho do piloto na origem, olhando −Z)
  const cockpit = new THREE.Group();
  cockpit.name = 'placeholder:cockpit';
  const box = (w, h, d, m, x, y, z, rx = 0, rz = 0) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.rotation.set(rx, 0, rz);
    cockpit.add(o);
    return o;
  };
  box(1.9, 0.3, 0.7, metal, 0, -0.62, -0.95, -0.25);
  box(1.2, 0.02, 0.36, screen, 0, -0.45, -0.88, -0.55);
  box(0.22, 0.02, 0.12, warm, -0.62, -0.47, -0.82, -0.5);
  box(0.22, 0.02, 0.12, warm, 0.62, -0.47, -0.82, -0.5);
  box(0.07, 1.6, 0.07, trim, -0.95, 0.05, -1.05, 0.12, -0.32);
  box(0.07, 1.6, 0.07, trim, 0.95, 0.05, -1.05, 0.12, 0.32);
  box(2.4, 0.07, 0.07, trim, 0, 0.78, -0.95);
  box(0.05, 1.1, 0.05, trim, 0, 0.42, -1.25, 0.6, 0);
  box(0.5, 0.9, 1.6, metal, -1.15, -0.55, -0.2);
  box(0.5, 0.9, 1.6, metal, 1.15, -0.55, -0.2);
  ctx.cockpit.scene.add(cockpit);

  // ── casco externo (mundo)
  const hull = new THREE.Group();
  hull.name = 'placeholder:ship';
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 7, 6, 16), metal);
  body.rotation.x = Math.PI / 2;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(11, 0.25, 3), trim);
  wing.position.set(0, -0.3, 1.2);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), screen);
  canopy.position.set(0, 0.8, -1.8);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.4, 16), warm);
  engine.rotation.x = Math.PI / 2;
  engine.position.set(0, 0, 5.3);
  hull.add(body, wing, canopy, engine);
  hull.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });
  hull.visible = false;
  ctx.scene.add(hull);

  function frame() {
    const p = ctx.player;
    const flying = p.mode !== 'walk';
    cockpit.visible = flying && p.view === 'first';
    hull.visible = flying && p.view === 'third';
    if (hull.visible) {
      ctx.space.toRender(p.renderPos, hull.position);
      hull.quaternion.copy(p.renderQuat);
    }
  }
  return {
    frame,
    dispose() {
      ctx.cockpit.scene.remove(cockpit);
      ctx.scene.remove(hull);
      for (const g of [cockpit, hull]) g.traverse((o) => o.geometry?.dispose?.());
      for (const m of [metal, trim, screen, warm]) m.dispose();
    },
  };
}
