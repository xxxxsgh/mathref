/**
 * Drone de ataque (7 abates) — variante ARMADA ('drone') ou KAMIKAZE.
 *
 * Modelo procedural de quadricóptero: corpo com carenagem e "canopy",
 * braços em X de fibra de carbono (textura de trama), latas dos motores,
 * hélices de 2 pás que giram (e viram disco translúcido em alta rotação),
 * bateria com faixa, trem de pouso em U, câmera em gimbal com lente, LEDs
 * de navegação (vermelho/verde) e estrobo. Armada: casulo de metralhadora
 * sob o corpo. Kamikaze: ogiva oliva com faixa vermelha e aletas.
 *
 * IA (passo fixo): decola do jogador e sobe a 4,5–6,5 m do chão; escolhe o
 * inimigo vivo mais perto (prefere os visíveis, até 60 m); voa por
 * steering com aceleração limitada (9 m/s) e desvio de obstáculos (raio à
 * frente: sobe e desvia). Armada: orbita a 9 m do alvo e atira rajadas de
 * 5 (traçantes, dano 13 pelo caminho normal, `streak:'drone'`). Kamikaze:
 * chega a 12 m e MERGULHA a 16 m/s, explode por proximidade/colisão (raio
 * 5,5, dano 230). Sem alvo: acompanha o jogador. Inclina na aceleração,
 * rotor e motor (WebAudio 3D) acompanham o esforço.
 *
 * Destrutível (120 de vida, decoy para a IA inimiga): abatido, cai girando
 * soltando fumaça e explode no chão. Fim do tempo: sobe e vai embora.
 */
import * as THREE from 'three';

import { mergeChildren } from './merge.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

let MAT = null;
function materials() {
  if (MAT) return MAT;
  // trama de carbono
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#16181a';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 8)
    for (let x = 0; x < 64; x += 8) {
      g.fillStyle = (x + y) % 16 ? '#25282b' : '#1c1e20';
      g.fillRect(x, y, 8, 4);
      g.fillStyle = (x + y) % 16 ? '#1c1e20' : '#25282b';
      g.fillRect(x, y + 4, 8, 4);
    }
  const carbon = new THREE.CanvasTexture(cv);
  carbon.wrapS = carbon.wrapT = THREE.RepeatWrapping;
  carbon.repeat.set(4, 1);
  MAT = {
    body: new THREE.MeshStandardMaterial({ color: 0x3a3f38, roughness: 0.45, metalness: 0.25 }),
    carbon: new THREE.MeshStandardMaterial({ map: carbon, roughness: 0.35, metalness: 0.3 }),
    motor: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.3, metalness: 0.85 }),
    prop: new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.5, metalness: 0.1 }),
    disc: new THREE.MeshBasicMaterial({ color: 0x202224, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.05, metalness: 0.9 }),
    stripe: new THREE.MeshStandardMaterial({ color: 0xe2b45a, roughness: 0.5 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.55, metalness: 0.2 }),
    red: new THREE.MeshStandardMaterial({ color: 0x9a1d14, roughness: 0.5 }),
  };
  return MAT;
}

export function buildDroneModel(mode = 'gun') {
  const M = materials();
  const root = new THREE.Group();
  root.name = 'drone';
  const tilt = new THREE.Group(); // inclinação (pitch/roll) separada do yaw
  root.add(tilt);
  // corpo + canopy
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.09, 0.32), M.body);
  tilt.add(body);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.body);
  canopy.scale.set(1, 0.5, 1.45);
  canopy.position.y = 0.045;
  tilt.add(canopy);
  const batt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.18), M.motor);
  batt.position.set(0, 0.085, -0.03);
  tilt.add(batt);
  const st = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.012, 0.03), M.stripe);
  st.position.set(0, 0.112, 0.03);
  tilt.add(st);
  // braços em X + motores + hélices
  const rotors = [];
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const len = 0.36;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, len), M.carbon);
    arm.position.set(sx * 0.13, 0.0, sz * 0.13);
    arm.rotation.y = Math.atan2(sx, sz);
    tilt.add(arm);
    const mx = sx * 0.25, mz = sz * 0.25;
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.05, 14), M.motor);
    motor.position.set(mx, 0.025, mz);
    tilt.add(motor);
    const rotor = new THREE.Group();
    rotor.position.set(mx, 0.058, mz);
    for (let k = 0; k < 2; k++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.025), M.prop);
      blade.position.x = (k ? -1 : 1) * 0.1;
      blade.rotation.x = (k ? -1 : 1) * 0.18;
      rotor.add(blade);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), M.disc);
    disc.rotation.x = -Math.PI / 2;
    rotor.add(disc);
    rotor.userData.dir = sx * sz;
    tilt.add(rotor);
    rotors.push(rotor);
    // LED na ponta do braço (frente: vermelho/verde; trás: branco fraco)
    const led = new THREE.Sprite(new THREE.SpriteMaterial({ color: sz > 0 ? (sx > 0 ? 0x2aff5a : 0xff2a1a) : 0xfff0d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    led.scale.setScalar(sz > 0 ? 0.09 : 0.05);
    led.position.set(mx, -0.01, mz);
    tilt.add(led);
  }
  // trem de pouso em U
  for (const sx of [1, -1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.09, 0.012), M.motor);
    leg.position.set(sx * 0.09, -0.08, 0.06);
    tilt.add(leg);
    const leg2 = leg.clone();
    leg2.position.z = -0.08;
    tilt.add(leg2);
    const skid = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.26, 8), M.motor);
    skid.rotation.x = Math.PI / 2;
    skid.position.set(sx * 0.09, -0.125, -0.01);
    tilt.add(skid);
  }
  // gimbal de câmera
  const gimbal = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), M.motor);
  gimbal.position.set(0, -0.06, 0.15);
  tilt.add(gimbal);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.018, 14), M.glass);
  lens.position.set(0, -0.06, 0.186);
  tilt.add(lens);
  const muzzle = new THREE.Object3D();
  if (mode === 'gun') {
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), M.motor);
    pod.position.set(0, -0.075, 0.02);
    tilt.add(pod);
    const brl = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), M.motor);
    brl.rotation.x = Math.PI / 2;
    brl.position.set(0, -0.075, 0.17);
    tilt.add(brl);
    muzzle.position.set(0, -0.075, 0.26);
  } else {
    const war = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 6, 12), M.olive);
    war.rotation.x = Math.PI / 2;
    war.position.set(0, -0.09, 0.05);
    tilt.add(war);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.025, 14), M.red);
    band.rotation.x = Math.PI / 2;
    band.position.set(0, -0.09, 0.1);
    tilt.add(band);
    for (let k = 0; k < 4; k++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.05, 0.05), M.olive);
      fin.position.set(0, -0.09, -0.07);
      fin.rotation.z = (k * Math.PI) / 2;
      fin.translateY(0.045);
      tilt.add(fin);
    }
    muzzle.position.set(0, -0.09, 0.16);
  }
  tilt.add(muzzle);
  // corpo rígido numa malha por material; rotores continuam separados
  mergeChildren(tilt);
  for (const r of rotors) mergeChildren(r);
  root.traverse((o) => {
    if (o.isMesh && o.material !== M.disc) o.castShadow = true;
  });
  root.scale.setScalar(1.55); // ~0,9 m de envergadura
  return { root, tilt, rotors, muzzle };
}

export class Drones {
  constructor(feat) {
    this.f = feat;
    this.ctx = feat.ctx;
    this.list = [];
  }

  launch(mode = 'gun', id = 'drone') {
    const ctx = this.ctx;
    const pl = ctx.player;
    const m = buildDroneModel(mode);
    const fwd = _v.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    const p = pl.position.clone().addScaledVector(fwd, 0.8);
    p.y += 1.5;
    m.root.position.copy(p);
    ctx.scene.add(m.root);
    const d = {
      id, mode, m, pos: p, vel: new THREE.Vector3(0, 2, 0), yaw: pl.yaw + Math.PI, state: 'fly', t: 0,
      life: this.f.def(id).duration, health: 120, target: null, retarget: 0, orbit: Math.random() * 6.28,
      burst: 0, shotT: 0, pause: 0, spin: 0, throttle: 1, dive: 0,
    };
    const wp = new THREE.Vector3();
    d.decoy = { kind: 'drone', radius: 0.6, get alive() { return d.state === 'fly'; }, get position() { return wp.copy(d.pos); }, damage: (a, info) => this.damage(d, a, info) };
    this.f.decoys.push(d.decoy);
    d.motor = this.f.sfx.motor(p, { base: mode === 'gun' ? 170 : 190, gain: 0.22 });
    this.list.push(d);
    return d;
  }

  damage(d, amount, info = {}) {
    if (d.state !== 'fly') return;
    if (info.source === 'player' && !info.enemy) return;
    d.health -= amount;
    if (d.health <= 0) {
      d.state = 'fall';
      d.t = 0;
      d.vel.y = Math.min(d.vel.y, 1);
      this.f.hint(`<b>${d.mode === 'gun' ? 'ATTACK' : 'KAMIKAZE'} DRONE</b> SHOT DOWN`, 2);
      this.f.ended(d.id);
    }
  }

  pickTarget(d) {
    const ctx = this.ctx;
    let best = null, bs = Infinity;
    for (const e of ctx.services.enemies?.list || []) {
      if (!e.alive) continue;
      const g = e.group.position;
      const dist = g.distanceTo(d.pos);
      if (dist > 60) continue;
      const chest = _w.set(g.x, g.y + 1.2, g.z);
      const vis = ctx.collision.lineOfSight(d.pos, chest, { filter: (c) => !c.data?.enemy && c.tag !== 'player' && c.tag !== 'enemy' && c.tag !== 'sentry' });
      const s = dist + (vis ? 0 : 25) + (e === d.target ? -6 : 0);
      if (s < bs) {
        bs = s;
        best = e;
      }
    }
    return best;
  }

  /** Steering até `goal` com desvio de obstáculos. */
  steer(d, goal, maxSpeed, dt, accel = 7) {
    const ctx = this.ctx;
    const want = _v.subVectors(goal, d.pos);
    const dist = want.length();
    want.multiplyScalar(Math.min(maxSpeed, dist * 1.4) / Math.max(1e-3, dist));
    // desvio: raio na direção do movimento
    const sp = d.vel.length();
    if (sp > 0.5) {
      const dir = _w.copy(d.vel).divideScalar(sp);
      const hit = ctx.collision.raycast(d.pos, dir, 1.2 + sp * 0.5, { filter: (c) => !c.data?.enemy && c.tag !== 'player' && c.tag !== 'enemy' && !c.trigger });
      if (hit) {
        want.addScaledVector(hit.normal, maxSpeed * 1.2);
        want.y += maxSpeed * 0.8;
      }
    }
    const dv = want.sub(d.vel);
    const l = dv.length();
    if (l > accel * dt) dv.multiplyScalar((accel * dt) / l);
    d.vel.add(dv);
    d.acc = dv.divideScalar(Math.max(dt, 1e-4));
  }

  update(dt) {
    const ctx = this.ctx;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.t += dt;
      if (d.state === 'gone') {
        this.list.splice(i, 1);
        continue;
      }
      if (d.state === 'fall') {
        d.vel.y -= 9.8 * dt;
        d.pos.addScaledVector(d.vel, dt);
        d.spin += dt * 14;
        if ((d.t * 10) % 1 < dt * 10) ctx.services.vfx?.impact?.(d.pos.clone(), new THREE.Vector3(0, 1, 0), 'dirt', { scale: 0.5 });
        const gy = ctx.collision.groundHeight?.(d.pos.x, d.pos.z, d.pos.y + 0.5) ?? 0;
        if (d.pos.y <= gy + 0.15 || d.t > 4) {
          ctx.bus.emit('explosion', { point: d.pos.clone(), radius: 2.5, source: 'drone' });
          this.remove(d);
        }
        continue;
      }
      if (d.state === 'leave') {
        this.steer(d, d.pos.clone().add(new THREE.Vector3(0, 30, 0)), 8, dt);
        d.pos.addScaledVector(d.vel, dt);
        if (d.t > 3) this.remove(d);
        continue;
      }
      d.life -= dt;
      if (d.life <= 0) {
        if (d.mode === 'kamikaze') {
          this.detonate(d);
          continue;
        }
        d.state = 'leave';
        d.t = 0;
        this.f.ended(d.id);
        continue;
      }
      d.retarget -= dt;
      if (d.retarget <= 0) {
        d.retarget = 0.3;
        d.target = this.pickTarget(d);
      }
      if (d.target && !d.target.alive) d.target = null;
      const ground = ctx.collision.groundHeight?.(d.pos.x, d.pos.z, d.pos.y + 1) ?? 0;
      let goal;
      if (d.target) {
        const g = d.target.group.position;
        const chest = new THREE.Vector3(g.x, g.y + 1.15 - (d.target.anim?.p?.crouch || 0) * 0.45, g.z);
        const dist = d.pos.distanceTo(chest);
        if (d.mode === 'kamikaze') {
          if (dist < 13 || d.dive > 0) {
            d.dive += dt;
            goal = chest;
            this.steer(d, goal, 16, dt, 30);
            if (dist < 1.6 || d.dive > 1.8) {
              this.detonate(d);
              continue;
            }
          } else {
            goal = chest.clone().setY(Math.max(chest.y + 4, ground + 5));
            this.steer(d, goal, 10, dt);
          }
        } else {
          d.orbit += dt * 0.35;
          goal = new THREE.Vector3(g.x + Math.cos(d.orbit) * 9, Math.max(g.y + 4.5, ground + 4.5), g.z + Math.sin(d.orbit) * 9);
          this.steer(d, goal, 9, dt);
          this.gun(d, chest, dt);
        }
      } else {
        // sem alvo: acompanha o jogador (atrás e acima)
        const pl = ctx.player;
        goal = pl.position.clone().add(new THREE.Vector3(Math.sin(pl.yaw) * 3, 4.2, Math.cos(pl.yaw) * 3));
        this.steer(d, goal, 7, dt);
      }
      d.pos.addScaledVector(d.vel, dt);
      // nunca abaixo de 1,2 m do chão (exceto mergulho)
      if (d.dive <= 0 && d.pos.y < ground + 1.2) {
        d.pos.y = ground + 1.2;
        d.vel.y = Math.max(0, d.vel.y);
      }
      // proa: para o alvo (armada) ou para onde voa
      const face = d.target && d.mode === 'gun' ? d.target.group.position : d.pos.clone().add(d.vel);
      const wantYaw = Math.atan2(face.x - d.pos.x, face.z - d.pos.z);
      const dy = Math.atan2(Math.sin(wantYaw - d.yaw), Math.cos(wantYaw - d.yaw));
      d.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * 4);
    }
  }

  gun(d, chest, dt) {
    const ctx = this.ctx;
    d.shotT -= dt;
    d.pause -= dt;
    if (d.pause > 0 || d.shotT > 0) return;
    const dist = d.pos.distanceTo(chest);
    if (dist > 26) return;
    const filt = { filter: (c) => !c.data?.enemy && c.tag !== 'player' && c.tag !== 'enemy' && c.tag !== 'sentry' };
    if (!ctx.collision.lineOfSight(d.pos, chest, filt)) return;
    d.m.root.updateMatrixWorld(true);
    const origin = d.m.muzzle.getWorldPosition(new THREE.Vector3());
    const dir = chest.clone().sub(origin).normalize();
    const sp = 0.02;
    dir.x += (Math.random() - 0.5) * sp * 2;
    dir.y += (Math.random() - 0.5) * sp * 2;
    dir.z += (Math.random() - 0.5) * sp * 2;
    dir.normalize();
    d.shotT = 0.09;
    d.burst++;
    if (d.burst >= 5) {
      d.burst = 0;
      d.pause = 0.55;
    }
    const vfx = ctx.services.vfx;
    vfx?.muzzleFlashWorld?.(origin, dir, {});
    ctx.services.audio?.play?.('shot_enemy', { position: origin, rate: 1.6, volume: 0.6, reverb: 0.2, cap: 6, jitter: 0.05 });
    const hit = ctx.collision.raycast(origin, dir, 60, { filter: (c) => c.tag !== 'player' && c.tag !== 'sentry' && !c.data?.decoy });
    const to = hit ? hit.point : origin.clone().addScaledVector(dir, 60);
    if (d.burst % 2 === 0) vfx?.tracer?.(origin, to, { speed: 380, length: 3 }); // metade dos tiros com traçante
    if (!hit) return;
    if (hit.collider?.data?.damage) {
      const dmg = 13 * (hit.part === 'head' ? 1.6 : 1);
      hit.collider.data.damage(dmg, { ...hit, dir, damage: dmg, source: 'player', weapon: 'drone', streak: 'drone', ballistic: true });
    }
    vfx?.impact?.(hit.point, hit.normal, hit.collider?.material || ctx.services.world?.materialAt?.(hit) || 'concrete', { dir, collider: hit.collider, scale: 0.7 });
  }

  detonate(d) {
    const ctx = this.ctx;
    const p = d.pos.clone();
    ctx.bus.emit('explosion', { point: p.clone(), radius: 5.5, source: 'player', streak: 'kamikaze' });
    this.f.blast(p, 5.5, 230, { weapon: 'kamikaze', streak: 'kamikaze' });
    if (d.state === 'fly') this.f.ended(d.id);
    this.remove(d);
  }

  remove(d) {
    d.state = 'gone';
    d.m.root.removeFromParent();
    d.motor?.stop();
    d.motor = null;
    const i = this.f.decoys.indexOf(d.decoy);
    if (i >= 0) this.f.decoys.splice(i, 1);
  }

  frame(dt) {
    for (const d of this.list) {
      if (d.state === 'gone') continue;
      const m = d.m;
      m.root.position.copy(d.pos);
      m.root.rotation.y = d.yaw + (d.state === 'fall' ? d.spin : 0);
      // inclina na aceleração (no referencial da proa)
      const a = d.acc || _v.set(0, 0, 0);
      const c = Math.cos(d.yaw), s = Math.sin(d.yaw);
      const fwdA = a.x * s + a.z * c, sideA = a.x * c - a.z * s;
      const vx = d.vel.x * s + d.vel.z * c, vs = d.vel.x * c - d.vel.z * s;
      const tp = Math.max(-0.5, Math.min(0.5, (fwdA * 0.03 + vx * 0.04)));
      const tr = Math.max(-0.5, Math.min(0.5, -(sideA * 0.03 + vs * 0.04)));
      m.tilt.rotation.x += (tp - m.tilt.rotation.x) * Math.min(1, dt * 6);
      m.tilt.rotation.z += (tr - m.tilt.rotation.z) * Math.min(1, dt * 6);
      if (d.state === 'fall') m.tilt.rotation.z += dt * 3;
      // rotores: esforço → rotação + disco translúcido
      const effort = Math.min(1.6, 0.8 + (d.acc ? d.acc.length() * 0.05 : 0) + Math.max(0, d.vel.y) * 0.05);
      for (const r of m.rotors) r.rotation.y += dt * 90 * effort * r.userData.dir;
      materials().disc.opacity = 0.22;
      d.motor?.set(d.pos, effort, d.state === 'fall' ? 0.1 : 0.22);
    }
  }

  clear() {
    for (const d of this.list) this.remove(d);
    this.list.length = 0;
  }
}
