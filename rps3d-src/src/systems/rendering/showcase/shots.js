// Presets de screenshot do sistema rendering. Usam conteúdo próprio (céu,
// nave, asteroides) quando os sistemas donos (deepspace, ships) não existem,
// e o conteúdo deles quando existem.
//
//   rendering-showcase   sol no quadro (flare, god rays entre asteroides),
//                        nave PBR em primeiro plano, explosão ao fundo
//   rendering-explosion  explosões próximas: bola de fogo volumétrica,
//                        destroços incandescentes, anel de choque, fumaça
//   rendering-pbr        nave iluminada de frente (PBR, clearcoat, reflexos)
//
// Parâmetros de URL úteis: ?rtime=0.6 (segundos de explosão já decorridos).
import * as THREE from 'three/webgpu';
import { makeSky } from './sky.js';
import { buildShowcaseShip } from './ship.js';
import { asteroidField, asteroidGeometry, asteroidMaterial } from './asteroids.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

function basis(dir) {
  const F = dir.clone().normalize();
  const R = new THREE.Vector3().crossVectors(F, UP).normalize();
  const U = new THREE.Vector3().crossVectors(R, F).normalize();
  return { F, R, U };
}
function lookQuat(dir, up = UP) {
  _m.lookAt(new THREE.Vector3(), dir, up);
  return new THREE.Quaternion().setFromRotationMatrix(_m);
}
/** Quaternion que aponta o nariz (−Z local) para `dir`. */
function noseQuat(dir, up = UP) { return lookQuat(dir, up); }

/** Avança o tempo dos efeitos (sem render) para mostrar a explosão no auge. */
function advance(S, ctx, secs) {
  const step = 1 / 30;
  for (let t = 0; t < secs; t += step) {
    S.now += step;
    S.particles.update(step, ctx);
    S.explosions.update(step);
    S.fireballs.update(step);
    S.anchors.step(step, S.now);
    S.anchors.sync(ctx.world.origin);
    S.debris.update(step, ctx);
  }
}

function setupCommon(ctx, S, systemId = 'kessa') {
  if (ctx.universe.systemId !== systemId) ctx.universe.setSystem(systemId);
  ctx.game.setMode('cinematic');
  const sys = ctx.universe.system;
  const own = { sky: null, objects: [] };
  if (!ctx.services.space && ctx.params.get('rsky') !== '0') {
    const neb = sys?.nebula ? { nebA: sys.nebula.color, nebB: sys.nebula.color2, density: sys.nebula.density } : {};
    own.sky = makeSky(S.sun.uniforms, neb);
    ctx.scene.add(own.sky);
    S.env.setNebula(new THREE.Color(...(neb.nebA || [0.3, 0.2, 0.4])).multiplyScalar(0.25), new THREE.Color(...(neb.nebB || [0.1, 0.2, 0.3])).multiplyScalar(0.2), 1);
  }
  return own;
}

function placeCamera(ctx, S, pos, quat) {
  ctx.player.camWorld.copy(pos);
  ctx.player.pos.copy(pos);
  ctx.camera.quaternion.copy(quat);
  S.shotCam = { pos: pos.clone(), quat: quat.clone() };
  ctx.camera.fov = 62; ctx.camera.updateProjectionMatrix();
}

export function registerShots(ctx, api, S) {
  // ── 1. vitrine: sol, flare, god rays, nave, explosão, asteroides ─────────
  ctx.shots.register('rendering-showcase', async (ctx) => {
    setupCommon(ctx, S, 'kessa');
    const sys = ctx.universe.system;
    const ver = sys.bodies.find((b) => b.name === 'Verídia') || sys.bodies[0];
    // câmera entre a estrela e Verídia (planeta às costas)
    const C = ver.pos.clone().addScaledVector(ver.pos.clone().normalize(), -260e3);
    const toSun = C.clone().negate().normalize();
    const b0 = basis(toSun);
    const a = THREE.MathUtils.degToRad(24);
    const F = toSun.clone().multiplyScalar(Math.cos(a)).add(b0.R.clone().multiplyScalar(0.78).addScaledVector(b0.U, -0.62).multiplyScalar(Math.sin(a))).normalize();
    const { R, U } = basis(F);
    placeCamera(ctx, S, C, lookQuat(F));
    S.sun.update(ctx, 0);

    // nave em primeiro plano (direita, cruzando para a esquerda)
    if (!ctx.services.ships) {
      const ship = buildShowcaseShip();
      const sp = C.clone().addScaledVector(F, 34).addScaledVector(R, 8.5).addScaledVector(U, -3.2);
      const dir = R.clone().multiplyScalar(-0.62).addScaledVector(F, -0.55).addScaledVector(U, 0.12).normalize();
      ship.quaternion.copy(noseQuat(dir, U.clone().addScaledVector(R, 0.35).normalize()));
      ctx.world.add(ship, sp);
    }
    // asteroides: campo + alguns cruzando o disco do sol (raios)
    const field = asteroidField({ count: 45, radius: 4200, seed: 31, minSize: 25, maxSize: 340, keepOut: (p) => p.length() < 900 });
    ctx.world.add(field, C.clone().addScaledVector(F, 2600));
    const geo = asteroidGeometry(77, 5), mat = asteroidMaterial([0.4, 0.36, 0.32]);
    const sunHits = [[1400, 150, 0.85], [2600, 210, -1.25], [900, 60, 2.2]];
    for (const [d, size, ang] of (ctx.params.get('rhits') === '0' ? [] : sunHits)) {
      const off = b0.R.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b0.U, Math.sin(ang)).multiplyScalar(size * 1.05);
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(size); m.rotation.set(d, size, ang);
      m.castShadow = m.receiveShadow = true;
      ctx.world.add(m, C.clone().addScaledVector(toSun, d).add(off));
    }
    // explosão ao fundo à esquerda
    const ep = C.clone().addScaledVector(F, 520).addScaledVector(R, -170).addScaledVector(U, 40);
    api.explosion(ep, 46, 'ship');
    api.explosion(ep.clone().addScaledVector(R, -60).addScaledVector(U, -25), 18, 'missile');
    advance(S, ctx, Number(ctx.params.get('rtime') ?? 0.75));
    S.shake.trauma = 0; S.flash.v = 0;
  });

  // ── 2. explosões de perto ────────────────────────────────────────────────
  ctx.shots.register('rendering-explosion', async (ctx) => {
    setupCommon(ctx, S, 'kessa');
    const sys = ctx.universe.system;
    const ver = sys.bodies.find((b) => b.name === 'Ashar') || sys.bodies[1];
    const C = ver.pos.clone().addScaledVector(ver.pos.clone().normalize(), -300e3);
    const toSun = C.clone().negate().normalize();
    const b0 = basis(toSun);
    // sol de lado (90°): volume da explosão com lado iluminado e lado sombra
    const F = b0.R.clone().multiplyScalar(0.92).addScaledVector(toSun, 0.3).addScaledVector(b0.U, -0.1).normalize();
    const { R, U } = basis(F);
    placeCamera(ctx, S, C, lookQuat(F));
    S.sun.update(ctx, 0);
    const field = asteroidField({ count: 30, radius: 3000, seed: 12, minSize: 30, maxSize: 260, keepOut: (p) => p.length() < 700 });
    ctx.world.add(field, C.clone().addScaledVector(F, 2400));
    const e1 = C.clone().addScaledVector(F, 190).addScaledVector(R, 12).addScaledVector(U, 4);
    api.explosion(e1, 32, 'ship', { vel: R.clone().multiplyScalar(-8) });
    api.explosion(C.clone().addScaledVector(F, 260).addScaledVector(R, -75).addScaledVector(U, 30), 14, 'missile');
    api.explosion(C.clone().addScaledVector(F, 150).addScaledVector(R, 58).addScaledVector(U, -22), 7, 'plasma');
    advance(S, ctx, Number(ctx.params.get('rtime') ?? 0.55));
    S.shake.trauma = 0; S.flash.v = 0;
  });

  // ── 3. PBR: nave em 3/4 frontal, sol de lado (terminador marcado) ───────
  ctx.shots.register('rendering-pbr', async (ctx) => {
    setupCommon(ctx, S, 'kessa');
    const sys = ctx.universe.system;
    const ver = sys.bodies.find((b) => b.name === 'Nivália') || sys.bodies[2];
    const C = ver.pos.clone().addScaledVector(ver.pos.clone().normalize(), -220e3);
    const toSun = C.clone().negate().normalize();
    const b0 = basis(toSun);
    // olhando perpendicular ao sol, um pouco contra a luz
    const F = b0.R.clone().multiplyScalar(0.9).addScaledVector(toSun, 0.25).addScaledVector(b0.U, -0.22).normalize();
    const { R, U } = basis(F);
    placeCamera(ctx, S, C, lookQuat(F));
    S.sun.update(ctx, 0);
    if (!ctx.services.ships) {
      const ship = buildShowcaseShip();
      const sp = C.clone().addScaledVector(F, 30).addScaledVector(U, -4.5).addScaledVector(R, 1.0);
      // nariz vem em direção à câmera, cruzando para a esquerda; dorso voltado para a câmera
      const dir = R.clone().multiplyScalar(-0.8).addScaledVector(F, -0.55).addScaledVector(U, 0.1).normalize();
      const up = U.clone().addScaledVector(F, -0.75).addScaledVector(R, -0.2).normalize();
      ship.quaternion.copy(noseQuat(dir, up));
      ctx.world.add(ship, sp);
    }
    const field = asteroidField({ count: 36, radius: 5000, seed: 44, minSize: 30, maxSize: 420, keepOut: (p) => p.length() < 1200 });
    ctx.world.add(field, C.clone().addScaledVector(F, 3200));
    S.shake.trauma = 0; S.flash.v = 0;
  });

  // ── 4. sombras em cascata: nave pairando sobre um asteroide grande ───────
  ctx.shots.register('rendering-shadows', async (ctx) => {
    setupCommon(ctx, S, 'kessa');
    const sys = ctx.universe.system;
    const ash = sys.bodies.find((b) => b.name === 'Ashar') || sys.bodies[1];
    const C = ash.pos.clone().addScaledVector(ash.pos.clone().normalize(), -280e3);
    const toSun = C.clone().negate().normalize();
    const b0 = basis(toSun);
    // superfície do asteroide "embaixo"; sol rasante (60° do zênite local)
    const up = b0.U.clone().multiplyScalar(0.55).addScaledVector(toSun, 0.83).normalize();
    const side = new THREE.Vector3().crossVectors(up, b0.R).normalize();
    const F = b0.R.clone().multiplyScalar(0.8).addScaledVector(up, -0.75).normalize();
    const { R, U } = basis(F);
    placeCamera(ctx, S, C, lookQuat(F, up));
    S.sun.update(ctx, 0);
    const rockR = 420;
    const ground = C.clone().addScaledVector(F, 46).addScaledVector(up, -12 - rockR);
    const geo = asteroidGeometry(1234, 6, 0.25), mat = asteroidMaterial([0.3, 0.27, 0.24], rockR);
    const rock = new THREE.Mesh(geo, mat);
    rock.scale.setScalar(rockR);
    rock.castShadow = rock.receiveShadow = true;
    ctx.world.add(rock, ground);
    // superfície real sob a nave (raycast na malha da rocha)
    rock.position.copy(ground).sub(C); rock.updateMatrixWorld(true);
    const probe = C.clone().addScaledVector(F, 40);
    const rc = new THREE.Raycaster(probe.clone().sub(C).addScaledVector(up, 300), up.clone().negate(), 0, 2000);
    const hit = rc.intersectObject(rock)[0];
    const surf = hit ? hit.point.clone().add(C) : probe.clone().addScaledVector(up, -12);
    if (!ctx.services.ships) {
      const ship = buildShowcaseShip();
      const sp = surf.clone().addScaledVector(up, 5.5);
      ship.quaternion.copy(noseQuat(side.clone().multiplyScalar(-1).addScaledVector(F, 0.3).normalize(), up));
      ctx.world.add(ship, sp);
    }
    // câmera recua e sobe para enquadrar nave + sombra
    const cam = surf.clone().addScaledVector(F, -38).addScaledVector(up, 16);
    placeCamera(ctx, S, cam, lookQuat(surf.clone().addScaledVector(up, 2).sub(cam).normalize(), up));
    S.sun.api().setShadowRange(220);
    S.shake.trauma = 0; S.flash.v = 0;
  });

  // ── 5. motion blur de câmera: giro rápido com explosões ──────────────────
  ctx.shots.register('rendering-motion', async (ctx) => {
    setupCommon(ctx, S, 'kessa');
    const sys = ctx.universe.system;
    const ver = sys.bodies.find((b) => b.name === 'Verídia') || sys.bodies[0];
    const C = ver.pos.clone().addScaledVector(ver.pos.clone().normalize(), -300e3);
    const toSun = C.clone().negate().normalize();
    const b0 = basis(toSun);
    const F = b0.R.clone().multiplyScalar(0.8).addScaledVector(toSun, 0.5).normalize();
    const { R, U } = basis(F);
    placeCamera(ctx, S, C, lookQuat(F));
    S.shotCam.spin = 1.1; S.shotCam.spinAxis = new THREE.Vector3(0.2, 1, 0.1).normalize();
    S.sun.update(ctx, 0);
    const field = asteroidField({ count: 40, radius: 1600, seed: 5, minSize: 10, maxSize: 160, keepOut: (p) => p.length() < 300 });
    ctx.world.add(field, C.clone().addScaledVector(F, 900));
    api.explosion(C.clone().addScaledVector(F, 300).addScaledVector(R, 40), 24, 'ship');
    advance(S, ctx, 0.5);
    S.shake.trauma = 0; S.flash.v = 0;
  });
}
