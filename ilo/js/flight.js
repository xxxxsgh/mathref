// Interlúdio de voo: Ilo viaja pendurado na pipa entre os mundinhos,
// colhendo faíscas soltas pelo caminho.
import * as THREE from 'three';
import { kite } from './props.js';
import { mesh, PAL, starGeom, glow } from './style.js';

export async function flight(g, { to, sky = 'space', planetColor = 0xc9a0dc, duration = 20, music = 'flight' }) {
  const W = g.world, ui = g.ui;
  await ui.fade(1, 600);
  W.clearStage();
  W.mode = 'free';
  W.setSky(sky);
  W.skyUpFree = new THREE.Vector3(0, 1, 0);
  W.sunDir.set(0.4, 0.8, 0.5).normalize();
  W.sunMode = 'fixed';
  g.sound.play(music);
  ui.setChapter(`Rumo ${to}`);
  ui.setObjectives([{ id: 'dust', text: 'Pegar faíscas no caminho (setas/WASD)' }]);

  const H = W.hero;
  H.pose = 'hang';
  H.resetScarf();
  const k = kite(g.state.kite || 0);
  k.rotation.x = 0.5; // inclinada contra o vento
  W.stage.add(k);
  const strPos = new Float32Array(12);
  const strGeo = new THREE.BufferGeometry();
  strGeo.setAttribute('position', new THREE.BufferAttribute(strPos, 3));
  const strings = new THREE.LineSegments(strGeo, new THREE.LineBasicMaterial({ color: 0xf4ead5, transparent: true, opacity: 0.8 }));
  strings.frustumCulled = false;
  W.stage.add(strings);

  // faíscas colecionáveis
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
  const dustN = 500, dpos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) dpos.set([(Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, -Math.random() * 120], i * 3);
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  const dust = new THREE.Points(dgeo, new THREE.PointsMaterial({ color: 0xe8e0ff, size: 0.12, transparent: true, opacity: 0.7, depthWrite: false }));
  dust.frustumCulled = false;
  W.stage.add(dust);

  const dest = mesh(new THREE.SphereGeometry(1, 40, 28), planetColor, { outline: 0.02 });
  dest.visible = false;
  W.stage.add(dest);

  let x = 0, y = 0, vx = 0, vy = 0, z = 0, t = 0, got = 0, done = false;
  const speed = 16;
  const cam = W.camera;
  const target = new THREE.Vector3(), tmp = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const hook = W.hook((dt) => {
    t += dt;
    const mv = g.input.move();
    vx += (mv.x * mv.mag * 22 - vx * 3.2) * dt; vy += (mv.y * mv.mag * 22 - vy * 3.2) * dt;
    x = Math.max(-6, Math.min(6, x + vx * dt));
    y = Math.max(-3.6, Math.min(3.6, y + vy * dt));
    z -= speed * dt;
    const bank = -vx * 0.04;
    k.position.set(x, y + 2.3 + Math.sin(t * 2) * 0.15, z - 0.6);
    k.rotation.z = bank * 1.5 + Math.sin(t * 1.3) * 0.08;
    k.userData.update(t);
    const hangPos = tmp.set(x, y - 0.1 + Math.sin(t * 2 + 0.6) * 0.1, z + 0.3);
    H.setPose(hangPos, new THREE.Vector3(-Math.sin(bank), 1, 0).normalize(), new THREE.Vector3(0, 0, -1));
    H.animate(dt, 0, false);
    H.wind.set(-vx * 0.3, 0, 7);
    k.updateMatrixWorld();
    H.handWorld(1, a); H.handWorld(-1, b);
    const kp = k.localToWorld(new THREE.Vector3(0, 0, 0.1));
    strPos.set([kp.x, kp.y, kp.z, a.x, a.y, a.z, kp.x, kp.y, kp.z, b.x, b.y, b.z]);
    strGeo.attributes.position.needsUpdate = true;
    for (const m of motes) {
      m.rotation.y += dt * 2.5;
      if (!m.visible) continue;
      if (m.position.distanceTo(target.copy(hangPos).setY(hangPos.y + 0.8)) < 1.5) {
        m.visible = false;
        got++;
        g.state.dust++;
        ui.setDust(g.state.dust);
        g.sound.sfx('star', got);
      } else if (m.position.z > z + 8) {
        if (t < duration - 4) spawnMote(m, z - 180 - Math.random() * 60); else m.visible = false;
      }
    }
    for (let i = 0; i < dustN; i++) if (dpos[i * 3 + 2] > z + 10) dpos[i * 3 + 2] -= 130;
    dgeo.attributes.position.needsUpdate = true;
    const left = duration - t;
    if (left < 7) {
      dest.visible = true;
      const kk = 1 - Math.max(0, left) / 7;
      dest.position.set(0, -2 - kk * 8, z - 120 + kk * 70);
      dest.scale.setScalar(6 + kk * 26);
      dest.rotation.y += dt * 0.1;
    }
    target.set(x * 0.55, y * 0.5 + 1.8, z + 7.5);
    cam.position.lerp(target, 1 - Math.exp(-dt * 5));
    cam.up.set(0, 1, 0);
    cam.lookAt(x * 0.8, y * 0.8 + 0.9, z - 6);
    if (t >= duration) done = true;
  });
  cam.position.set(0, 1.8, 7.5);
  ui.fade(0, 800);
  g.sound.sfx('whoosh');
  ui.toast('Segura firme na pipa!', 2000);
  await g.until(() => done);
  ui.check('dust');
  if (got > 0) ui.toast(`+${got} ✦ faíscas`, 1800);
  await ui.fade(1, 900);
  W.unhook(hook);
  H.pose = 'walk';
  H.wind.set(0, 0, 0);
  W.skyUpFree = null;
  g.save();
}
