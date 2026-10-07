// Nave de demonstração dos materiais (interceptador "Lança" da Hegemonia
// Solar: cerâmica branca, filetes dourados, luzes azuis) — só para os
// cenários do render. Tudo procedural: fuselagem por revolução achatada,
// asas e derivas extrudadas com chanfro (as arestas mostram o desgaste por
// curvatura do render.pbr), canópia de vidro, bocais com coloração térmica e
// núcleo HDR, faixas emissivas, luzes de navegação, greebles.

import * as THREE from 'three/webgpu';

function wingShape(span, root, tip, sweep) {
  const s = new THREE.Shape();
  // x = envergadura, −y = para trás (corda)
  s.moveTo(0, 0);
  s.lineTo(span, -sweep);
  s.lineTo(span, -sweep - tip);
  s.lineTo(span * 0.35, -root * 0.92);
  s.lineTo(0, -root);
  s.closePath();
  return s;
}

function lathe(points, segs, scaleY = 1) {
  const g = new THREE.LatheGeometry(points, segs);
  g.rotateX(-Math.PI / 2); // eixo do lathe (y) → z; frente = −z
  g.scale(1, scaleY, 1);
  g.computeVertexNormals();
  return g;
}

export function makeDemoShip(render, { scheme = 'hegemony' } = {}) {
  const g = new THREE.Group();
  g.name = 'nave-demo';
  const heg = scheme === 'hegemony';
  const hull = render.pbr({ preset: heg ? 'hullWhite' : scheme === 'rebel' ? 'hullRebel' : 'hull', stripeAxis: 'x', stripeAt: 0, stripeWidth: 0.16, seed: 2, triplanarScale: 0.34 });
  const hull2 = render.pbr({ preset: heg ? 'hullWhite' : 'hullRebel', stripe: 0, seed: 7, triplanarScale: 0.38 });
  const dark = render.pbr({ preset: 'hull', color: 0x30343a, grime: 0.55, wear: 0.35, triplanarScale: 1.4, seed: 5, stripe: 0 });
  const gold = render.pbr({ preset: 'hullGold', seed: 9 });
  const glass = render.pbr({ preset: 'visor', color: 0x8fa8bc, iridescence: 0.5, metalness: 0.95, roughness: 0.05 });
  const nozzle = render.pbr({ preset: 'thruster', seed: 4 });
  nozzle.userData.u.heat.value = 0.9;
  const carbon = render.pbr({ preset: 'carbon' });
  const mk = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  };
  const hdr = (r, gg, b, k) => {
    const m = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(r, gg, b).multiplyScalar(k) });
    m.toneMapped = false;
    return m;
  };
  const engineGlow = hdr(0.45, 0.75, 1.8, 5);
  const stripGlow = hdr(0.3, 0.7, 1.6, 4);

  // ── fuselagem (nariz afilado → corpo → cauda)
  const L = 16;
  const prof = [];
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let r;
    if (t < 0.32) r = 0.06 + 1.19 * Math.pow(Math.sin((t / 0.32) * Math.PI * 0.5), 1.35);
    else if (t < 0.8) r = 1.25 + 0.15 * Math.sin(((t - 0.32) / 0.48) * Math.PI);
    else r = 1.25 - (t - 0.8) * 1.6;
    prof.push(new THREE.Vector2(Math.max(0.015, r), -L / 2 + t * L));
  }
  const fus = mk(lathe(prof, 48, 0.58), hull);
  g.add(fus);
  // ponta dourada do nariz
  const tipProf = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    tipProf.push(new THREE.Vector2(Math.max(0.005, 0.2 * Math.pow(t, 0.7)), -L / 2 - 0.9 + t * 1.2));
  }
  g.add(mk(lathe(tipProf, 24, 0.58), gold));
  // anel dourado separando nariz e corpo
  const band = mk(new THREE.TorusGeometry(1.22, 0.06, 8, 48), gold);
  band.scale.set(1, 0.58, 1);
  band.position.z = -L / 2 + L * 0.3;
  g.add(band);

  // ── canópia
  const can = mk(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  can.scale.set(0.72, 0.62, 2.6);
  can.position.set(0, 0.5, -3.2);
  g.add(can);
  const frameGeo = new THREE.TorusGeometry(1, 0.05, 8, 48, Math.PI);
  const canFrame = mk(frameGeo, gold);
  canFrame.rotation.y = Math.PI / 2;
  canFrame.scale.set(2.6, 0.62, 0.72);
  canFrame.position.set(0, 0.5, -3.2);
  g.add(canFrame);
  for (const z of [-4.2, -2.4]) {
    const rib = mk(new THREE.TorusGeometry(1, 0.035, 6, 32, Math.PI), gold);
    const k = Math.sqrt(Math.max(0, 1 - ((z + 3.2) / 2.6) ** 2));
    rib.scale.set(0.72 * k, 0.62 * k, 1);
    rib.position.set(0, 0.5, z);
    g.add(rib);
  }

  // ── asas (bordo de ataque dourado + faixa emissiva)
  const wingGeo = new THREE.ExtrudeGeometry(wingShape(7.2, 7.5, 1.4, 5.2), { depth: 0.26, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.09, bevelSegments: 3, curveSegments: 16, steps: 1 });
  wingGeo.rotateX(-Math.PI / 2); // forma XY → plano XZ, corda para +z (trás)
  wingGeo.translate(0, -0.13, 0);
  const wz = -3.0; // raiz do bordo de ataque
  const leAng = Math.atan2(7.2, 5.2);
  const leLen = Math.hypot(7.2, 5.2);
  for (const sx of [1, -1]) {
    const w = mk(wingGeo, hull2);
    w.scale.x = sx;
    w.position.set(sx * 0.9, -0.2, wz);
    w.rotation.z = sx * 0.05;
    g.add(w);
    // bordo de ataque dourado
    const le = mk(new THREE.CapsuleGeometry(0.1, leLen, 4, 10), gold);
    le.rotation.set(Math.PI / 2, 0, 0);
    const lePivot = new THREE.Group();
    lePivot.add(le);
    le.position.z = leLen / 2;
    lePivot.position.set(sx * 0.9, -0.2 + 0.0, wz);
    lePivot.rotation.set(0, sx * leAng, sx * 0.05);
    g.add(lePivot);
    // faixa emissiva no dorso da asa
    const stripPivot = new THREE.Group();
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 4.2), stripGlow);
    strip.position.set(0, 0.2, 3.4);
    stripPivot.add(strip);
    stripPivot.position.set(sx * 0.9, -0.2, wz + 2.2);
    stripPivot.rotation.set(0, sx * leAng, sx * 0.05);
    g.add(stripPivot);
    const tipX = sx * (0.9 + 7.2 + 0.15);
    const tipY = -0.2 + 7.2 * Math.sin(0.05) - 0.15;
    const tipZ = wz + 5.2 + 0.7;
    // canhão na ponta
    const gun = mk(new THREE.CylinderGeometry(0.1, 0.15, 3.6, 14), dark);
    gun.rotation.x = Math.PI / 2;
    gun.position.set(tipX, tipY, tipZ - 2.2);
    g.add(gun);
    const gunPod = mk(new THREE.CapsuleGeometry(0.28, 2.2, 6, 14), gold);
    gunPod.rotation.x = Math.PI / 2;
    gunPod.position.set(tipX, tipY, tipZ + 0.2);
    g.add(gunPod);
    // luzes de navegação (vermelha à esquerda, verde à direita)
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), sx > 0 ? hdr(0.1, 1.0, 0.3, 14) : hdr(1.0, 0.08, 0.05, 14));
    nav.position.set(tipX, tipY, tipZ + 1.75);
    g.add(nav);
    // deriva inclinada
    const finGeo = new THREE.ExtrudeGeometry(wingShape(2.6, 3.4, 1.1, 2.2), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.06, bevelSegments: 2 });
    finGeo.translate(0, 0, -0.07);
    finGeo.rotateX(-Math.PI / 2); // corda para trás
    finGeo.rotateZ(Math.PI / 2); // envergadura para cima
    const fin = mk(finGeo, hull2);
    fin.rotation.z = sx * -0.38; // inclinada para fora
    fin.position.set(sx * 0.75, 0.45, 4.4);
    g.add(fin);
    // nacela lateral
    const nac = mk(lathe([new THREE.Vector2(0.05, -2.4), new THREE.Vector2(0.55, -1.9), new THREE.Vector2(0.68, 0.0), new THREE.Vector2(0.62, 2.2), new THREE.Vector2(0.5, 2.5)], 32), dark);
    nac.position.set(sx * 2.15, -0.35, 4.6);
    g.add(nac);
    const noz = mk(new THREE.CylinderGeometry(0.42, 0.56, 0.9, 28, 1, true), nozzle);
    noz.rotation.x = Math.PI / 2;
    noz.position.set(sx * 2.15, -0.35, 7.45);
    g.add(noz);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.4, 28), engineGlow);
    core.position.set(sx * 2.15, -0.35, 7.2);
    g.add(core);
    const ring = mk(new THREE.TorusGeometry(0.66, 0.06, 8, 32), gold);
    ring.position.set(sx * 2.15, -0.35, 3.2);
    g.add(ring);
    const mount = new THREE.Object3D();
    mount.position.set(sx * 2.15, -0.35, 7.6);
    mount.name = 'bocal';
    g.add(mount);
    // tomada de ar em fibra de carbono
    const intake = mk(new THREE.BoxGeometry(0.55, 0.42, 3.4), carbon);
    intake.position.set(sx * 1.05, -0.32, -0.6);
    g.add(intake);
    // blocos de RCS
    for (const z of [-5.2, 5.4]) {
      const rcs = mk(new THREE.BoxGeometry(0.22, 0.3, 0.5), dark);
      rcs.position.set(sx * 1.05, 0.05, z);
      g.add(rcs);
    }
    // faixa luminosa lateral da fuselagem
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 5.5), stripGlow);
    side.position.set(sx * 1.31, 0.05, 1.4);
    g.add(side);
  }
  // motor principal
  const mainNoz = mk(new THREE.CylinderGeometry(0.62, 0.8, 1.1, 32, 1, true), nozzle);
  mainNoz.rotation.x = Math.PI / 2;
  mainNoz.position.set(0, 0, 8.2);
  g.add(mainNoz);
  const mainCore = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), engineGlow);
  mainCore.position.set(0, 0, 7.9);
  g.add(mainCore);
  const mm = new THREE.Object3D();
  mm.position.set(0, 0, 8.4);
  mm.name = 'bocal';
  g.add(mm);
  // dorso: espinha escura + greebles + antena
  const spine = mk(new THREE.BoxGeometry(0.7, 0.32, 6.5), dark);
  spine.position.set(0, 0.68, 3.4);
  g.add(spine);
  for (let i = 0; i < 8; i++) {
    const b = mk(new THREE.BoxGeometry(0.18 + (i % 3) * 0.08, 0.14, 0.32 + (i % 2) * 0.25), i % 3 ? dark : gold);
    b.position.set(((i % 3) - 1) * 0.2, 0.88, 0.8 + i * 0.75);
    g.add(b);
  }
  const ant = mk(new THREE.CylinderGeometry(0.02, 0.03, 1.4, 6), dark);
  ant.position.set(0.25, 1.4, 6.0);
  ant.rotation.x = 0.5;
  g.add(ant);
  const tailLight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6), hdr(1, 1, 1, 16));
  tailLight.position.set(0, 0.85, 7.0);
  g.add(tailLight);
  return g;
}
