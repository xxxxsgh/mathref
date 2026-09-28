// Interlúdio de voo: o príncipe viaja agarrado a um bando de pássaros
// migratórios, colhendo poeira de estrela até o próximo asteroide.
import * as THREE from 'three';
import { bird } from './props.js';
import { mesh, PAL, starGeom, toon, glow } from './style.js';

export async function flight(g, { to, sky = 'space', planetColor = 0xc9a0dc, duration = 20, music = 'flight', kicker = 'viagem' }) {
  const W = g.world, ui = g.ui;
  await ui.fade(1, 600);
  W.clearStage();
  W.mode = 'free';
  W.setSky(sky);
  W.skyUpFree = new THREE.Vector3(0, 1, 0);
  W.sunDir.set(0.4, 0.8, 0.5).normalize();
  W.sunMode = 'fixed';
  g.sound.play(music);
  ui.setChapter(`A caminho: ${to}`);
  ui.setObjectives([{ id: 'dust', text: 'Colher poeira de estrela (setas/WASD)' }]);

  const P = W.prince;
  P.pose = 'hang';
  P.resetScarf();
  const flock = new THREE.Group();
  const birds = [];
  const offs = [[0, 0, 0], [-0.7, 0.2, 0.5], [0.7, 0.2, 0.5], [-1.3, 0.35, 1.0], [1.3, 0.35, 1.0], [-0.35, 0.5, -0.5], [0.35, 0.5, -0.5]];
  for (const o of offs) {
    const b = bird();
    b.position.set(o[0], 1.9 + o[1], o[2]);
    flock.add(b);
    birds.push(b);
  }
  W.stage.add(flock);
  const strPos = new Float32Array(offs.length * 6);
  const strGeo = new THREE.BufferGeometry();
  strGeo.setAttribute('position', new THREE.BufferAttribute(strPos, 3));
  const strings = new THREE.LineSegments(strGeo, new THREE.LineBasicMaterial({ color: 0xf4ead5, transparent: true, opacity: 0.7 }));
  strings.frustumCulled = false;
  W.stage.add(strings);

  // poeira de estrela colecionável
  const motes = [];
  const moteGeo = starGeom(0.28, 0.12, 0.08);

  const spawnMote = (m, z) => {
    m.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 7, z);
    m.visible = true;
  };
  for (let i = 0; i < 26; i++) {
    const m = mesh(moteGeo, PAL.gold, { outline: 0.012, emissive: 0x7a5a10 });
    m.add(glow(0xffc850, 2.2, 0.85));
    spawnMote(m, -30 - i * 14);
    W.stage.add(m);
    motes.push(m);
  }
  // poeira de fundo que passa (sensação de velocidade)
  const dustN = 500, dpos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) dpos.set([(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, -Math.random() * 120], i * 3);
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: 0xe8e0ff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false }));
  dust.frustumCulled = false;
  W.stage.add(dust);

  // destino: cresce à frente perto do fim
  const dest = mesh(new THREE.SphereGeometry(1, 40, 28), planetColor, { outline: 0.02 });
  dest.visible = false;
  W.stage.add(dest);

  let x = 0, y = 0, vx = 0, vy = 0, z = 0, t = 0, got = 0;
  const speed = 16;
  const cam = W.camera;
  const target = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let done = false;
  const hook = W.hook((dt) => {
    t += dt;
    const mv = g.input.move();
    const ax = mv.x * mv.mag * 22, ay = mv.y * mv.mag * 22;
    vx += (ax - vx * 3.2) * dt; vy += (ay - vy * 3.2) * dt;
    x = Math.max(-6, Math.min(6, x + vx * dt));
    y = Math.max(-3.6, Math.min(3.6, y + vy * dt));
    z -= speed * dt;
    const bank = -vx * 0.04;
    flock.position.set(x, y + Math.sin(t * 2) * 0.12, z);
    flock.rotation.z = bank;
    for (const b of birds) {
      const u = b.userData;
      u.t += dt * 9;
      const f = Math.sin(u.t) * 0.7;
      u.wings[0].rotation.z = f; u.wings[1].rotation.z = -f;
      b.position.y += Math.sin(u.t * 0.5) * 0.002;
    }
    const hangPos = tmp.set(x, y - 0.1 + Math.sin(t * 2 + 0.6) * 0.1, z + 0.3);
    P.setPose(hangPos, new THREE.Vector3(Math.sin(bank) * -1, 1, 0).normalize(), new THREE.Vector3(0, 0, -1));
    P.animate(dt, 0, false);
    P.wind.set(-vx * 0.3, 0, 7);
    // fios dos pássaros até as mãos
    const hand = P.handWorld(1, new THREE.Vector3());
    const hand2 = P.handWorld(-1, new THREE.Vector3());
    birds.forEach((b, i) => {
      const bp = b.getWorldPosition(target);
      const h = i % 2 ? hand : hand2;
      strPos.set([bp.x, bp.y - 0.05, bp.z, h.x, h.y + 0.05, h.z], i * 6);
    });
    strGeo.attributes.position.needsUpdate = true;
    // coletar
    for (const m of motes) {
      m.rotation.y += dt * 2.5;
      if (!m.visible) continue;
      if (m.position.distanceTo(hangPos.clone().setY(hangPos.y + 0.8)) < 1.5) {
        m.visible = false;
        got++;
        g.state.dust++;
        ui.setDust(g.state.dust);
        g.sound.sfx('star', got);
      } else if (m.position.z > z + 8) {
        if (t < duration - 4) spawnMote(m, z - 180 - Math.random() * 60); else m.visible = false;
      }
    }
    for (let i = 0; i < dustN; i++) {
      if (dpos[i * 3 + 2] > z + 10) dpos[i * 3 + 2] -= 130;
    }
    dgeo.attributes.position.needsUpdate = true;
    // destino
    const left = duration - t;
    if (left < 7) {
      dest.visible = true;
      const k = 1 - Math.max(0, left) / 7;
      dest.position.set(0, -2 - k * 8, z - 120 + k * 70);
      dest.scale.setScalar(6 + k * 26);
      dest.rotation.y += dt * 0.1;
    }
    // câmera
    target.set(x * 0.55, y * 0.5 + 1.8, z + 7.5);
    cam.position.lerp(target, 1 - Math.exp(-dt * 5));
    cam.up.set(0, 1, 0);
    cam.lookAt(x * 0.8, y * 0.8 + 0.6, z - 6);
    if (t >= duration && !done) done = true;
  });
  cam.position.set(0, 1.8, 7.5);
  ui.fade(0, 800);
  g.sound.sfx('whoosh');
  ui.toast('Segure-se aos pássaros!', 2000);
  await g.until(() => done);
  ui.check('dust');
  if (got > 0) ui.toast(`+${got} ✦ poeira de estrela`, 1800);
  await ui.fade(1, 900);
  W.unhook(hook);
  P.pose = 'walk';
  P.wind.set(0, 0, 0);
  W.skyUpFree = null;
  g.save();
}
