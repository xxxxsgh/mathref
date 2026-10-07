// Presets de screenshot do sistema rendering. Usam conteúdo próprio (céu,
// nave, asteroides) quando os sistemas donos (deepspace, ships) não existem,
// e o conteúdo deles quando existem.
//
//   rendering-showcase   sol no quadro (flare, god rays entre asteroides),
//                        nave PBR em primeiro plano, explosão ao fundo
//   rendering-explosion  explosões próximas: bola de fogo volumétrica,
//                        destroços incandescentes, anel de choque, fumaça
//   rendering-pbr        nave iluminada de frente (PBR, clearcoat, reflexos)
//   rendering-shadows    sombras em cascata (nave sobre rocha, sol rasante)
//   rendering-motion     motion blur de câmera (giro rápido)
//   rendering-battle     Halden: batalha da abertura, nascer do sol sobre a
//                        colônia Aurora, raios de pulso, nave capital explodindo
//
// Parâmetros de URL úteis: ?rtime=0.6 (segundos de explosão já decorridos).
import * as THREE from 'three/webgpu';
import { makeSky } from './sky.js';
import { buildShowcaseShip } from './ship.js';
import { makeShowcasePlanet } from './planet.js';
import { asteroidField, asteroidGeometry, asteroidMaterial } from './asteroids.js';

const UP = new THREE.Vector3(0, 1, 0);
const _m = new THREE.Matrix4();

function basis(dir, up = UP) {
  const F = dir.clone().normalize();
  const R = new THREE.Vector3().crossVectors(F, up).normalize();
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

/** Planeta de vitrine no lugar do corpo real (só sem o sistema `planets`). */
function showcasePlanet(ctx, S, body, type, extra = {}) {
  if (ctx.services.planets || ctx.params.get('rplanet') === '0') return null;
  // o impostor distante do deepspace (se houver) cede lugar ao de vitrine
  ctx.params.set('farbodies', '0');
  const g = makeShowcasePlanet({ radius: body.radius, type, sun: S.sun.uniforms, seed: (body.seed ?? 3) % 97, ...extra });
  // eixo inclinado: os polos não ficam de frente para as câmeras dos presets
  g.rotation.set(1.25, 0.3, 0.55);
  ctx.world.add(g, body.pos);
  return g;
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
    // composição: sol no canto superior esquerdo, Verídia (gibosa, terminador
    // à esquerda) enchendo o canto inferior direito, nave em primeiro plano e
    // uma explosão recortada contra a atmosfera.
    const toSun0 = ver.pos.clone().negate().normalize();
    const s0 = basis(toSun0);
    const w = s0.R.clone().multiplyScalar(0.8).addScaledVector(s0.U, -0.6).normalize();
    const rad = THREE.MathUtils.degToRad;
    const D = toSun0.clone().multiplyScalar(Math.cos(rad(63))).addScaledVector(w, Math.sin(rad(63))).normalize();
    const dist = ver.radius / Math.sin(rad(24));
    const C = ver.pos.clone().addScaledVector(D, -dist);
    const toSun = C.clone().negate().normalize();
    const b0 = basis(toSun);
    const F = toSun.clone().multiplyScalar(Math.cos(rad(30))).addScaledVector(w, Math.sin(rad(30))).normalize();
    const { R, U } = basis(F);
    placeCamera(ctx, S, C, lookQuat(F, b0.U));
    S.sun.update(ctx, 0);
    showcasePlanet(ctx, S, ver, 'lush');

    // nave em primeiro plano (direita, cruzando para a esquerda)
    if (!ctx.services.ships) {
      const ship = buildShowcaseShip();
      const sp = C.clone().addScaledVector(F, 30).addScaledVector(R, 1.5).addScaledVector(U, -4.6);
      const dir = R.clone().multiplyScalar(-0.7).addScaledVector(F, -0.45).addScaledVector(U, 0.1).normalize();
      ship.quaternion.copy(noseQuat(dir, U.clone().addScaledVector(R, 0.3).addScaledVector(F, -0.3).normalize()));
      ctx.world.add(ship, sp);
    }
    // destroços de batalha: campo esparso + rochas cruzando o disco do sol (raios)
    const field = asteroidField({ count: 24, radius: 3200, seed: 31, minSize: 12, maxSize: 160, keepOut: (p) => p.length() < 900 });
    ctx.world.add(field, C.clone().addScaledVector(F, 2600).addScaledVector(R, -1200));
    const geo = asteroidGeometry(77, 5), mat = asteroidMaterial([0.4, 0.36, 0.32]);
    const sunHits = [[1400, 150, 0.85], [2600, 210, -1.25], [900, 60, 2.2]];
    for (const [d, size, ang] of (ctx.params.get('rhits') === '0' ? [] : sunHits)) {
      const off = b0.R.clone().multiplyScalar(Math.cos(ang)).addScaledVector(b0.U, Math.sin(ang)).multiplyScalar(size * 1.05);
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(size); m.rotation.set(d, size, ang);
      m.castShadow = m.receiveShadow = true;
      ctx.world.add(m, C.clone().addScaledVector(toSun, d).add(off));
    }
    // explosão entre a nave e o planeta
    const ep = C.clone().addScaledVector(F, 420).addScaledVector(R, 150).addScaledVector(U, 20);
    api.explosion(ep, 40, 'ship');
    api.explosion(ep.clone().addScaledVector(R, -70).addScaledVector(U, 30), 14, 'missile');
    advance(S, ctx, Number(ctx.params.get('rtime') ?? 0.75));
    S.shake.trauma = 0; S.flash.v = 0;
  });

  // ── 2. explosões de perto ────────────────────────────────────────────────
  ctx.shots.register('rendering-explosion', async (ctx) => {
    setupCommon(ctx, S, 'kessa');
    const sys = ctx.universe.system;
    const ash = sys.bodies.find((b) => b.name === 'Ashar') || sys.bodies[1];
    // Ashar ocupa o terço inferior (horizonte curvo), sol de lado (85°): o
    // volume da explosão mostra lado iluminado e lado em sombra.
    const toSun0 = ash.pos.clone().negate().normalize();
    const s0 = basis(toSun0);
    const rad = THREE.MathUtils.degToRad;
    const down = s0.U.clone().negate();
    const side = s0.R.clone();
    const F0 = toSun0.clone().multiplyScalar(Math.cos(rad(85))).addScaledVector(side, Math.sin(rad(85))).normalize();
    // planeta abaixo da linha de visão
    const D = F0.clone().multiplyScalar(Math.cos(rad(40))).addScaledVector(down, Math.sin(rad(40))).normalize();
    const C = ash.pos.clone().addScaledVector(D, -ash.radius / Math.sin(rad(27)));
    const toSun = C.clone().negate().normalize();
    const F = F0.clone().addScaledVector(down, 0.08).normalize();
    const { R, U } = basis(F);
    placeCamera(ctx, S, C, lookQuat(F, s0.U));
    S.sun.update(ctx, 0);
    showcasePlanet(ctx, S, ash, 'desert');
    const field = asteroidField({ count: 18, radius: 2400, seed: 12, minSize: 8, maxSize: 90, keepOut: (p) => p.length() < 500 });
    ctx.world.add(field, C.clone().addScaledVector(F, 1600));
    const e1 = C.clone().addScaledVector(F, 120).addScaledVector(R, 6).addScaledVector(U, 6);
    api.explosion(e1, 26, 'ship', { vel: R.clone().multiplyScalar(-6) });
    api.explosion(C.clone().addScaledVector(F, 210).addScaledVector(R, -78).addScaledVector(U, 30), 12, 'missile');
    api.explosion(C.clone().addScaledVector(F, 95).addScaledVector(R, 42).addScaledVector(U, -16), 5, 'plasma');
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

  // ── 6. Halden: a batalha da abertura (nascer do sol sobre Aurora) ───────
  // Ala da Hegemonia em formação contra a luz, sol nascendo atrás do limbo da
  // colônia (cidades acesas no lado noturno), raios de pulso cruzando, uma
  // explosão próxima e uma nave capital se desfazendo ao longe.
  ctx.shots.register('rendering-battle', async (ctx) => {
    setupCommon(ctx, S, 'halden');
    const sys = ctx.universe.system;
    const aur = sys.bodies.find((b) => b.name === 'Aurora') || sys.bodies[0];
    const rad = THREE.MathUtils.degToRad;
    const alpha = rad(27), sep = rad(Number(ctx.params.get('rsep') ?? 30.5));
    const dist = aur.radius / Math.sin(alpha);
    let toSun = aur.pos.clone().negate().normalize();
    let C = new THREE.Vector3();
    for (let it = 0; it < 3; it++) {
      const b = basis(toSun);
      const D = toSun.clone().multiplyScalar(Math.cos(sep)).addScaledVector(b.U.clone().multiplyScalar(-0.94).addScaledVector(b.R, 0.34).normalize(), Math.sin(sep)).normalize();
      C = aur.pos.clone().addScaledVector(D, -dist);
      toSun = C.clone().negate().normalize();
    }
    const D = aur.pos.clone().sub(C).normalize();
    const theta = D.angleTo(toSun);
    const t = rad(19) / theta;
    const F = D.clone().multiplyScalar(Math.sin((1 - t) * theta)).addScaledVector(toSun, Math.sin(t * theta)).divideScalar(Math.sin(theta)).normalize();
    const upV = toSun.clone().addScaledVector(F, -F.dot(toSun)).normalize();
    const sideV = new THREE.Vector3().crossVectors(F, upV).normalize();
    const camUp = upV.clone().addScaledVector(sideV, 0.22).normalize();
    placeCamera(ctx, S, C, lookQuat(F, camUp));
    ctx.camera.fov = 58; ctx.camera.updateProjectionMatrix();
    api.setExposure(0.8);
    api.setFlare({ sun: 0.75 });
    S.sun.update(ctx, 0);
    showcasePlanet(ctx, S, aur, 'ocean', { cities: true, clouds: 0.45 });
    const { R, U } = basis(F, camUp);
    const at = (f, r, u) => C.clone().addScaledVector(F, f).addScaledVector(R, r).addScaledVector(U, u);
    // ala da Hegemonia: rumo ao planeta, levemente picando
    const heading = F.clone().addScaledVector(U, -0.12).addScaledVector(R, 0.05).normalize();
    const slots = [[38, -9, -6, 0.18], [62, 15, -1.5, -0.1], [120, -27, 7, 0.25], [210, 40, -10, -0.2], [330, -70, 18, 0.1], [480, 95, 4, 0.3]];
    const ships = [];
    if (!ctx.services.ships) {
      for (const [f, r, u, roll] of slots) {
        const ship = buildShowcaseShip();
        const up = U.clone().applyAxisAngle(heading, roll);
        ship.quaternion.copy(noseQuat(heading, up));
        const p = at(f, r, u);
        ctx.world.add(ship, p);
        ships.push(p);
      }
    }
    // explosão próxima (caça abatido) e nave capital ao longe
    api.explosion(at(560, 170, 60), 34, 'ship', { vel: heading.clone().multiplyScalar(40) });
    api.explosion(at(4200, 1500, 900), 140, 'capital');
    advance(S, ctx, Number(ctx.params.get('rtime') ?? 0.9));
    // raios de pulso: dourados (Hegemonia) saindo da ala, vermelhos (defesa da colônia) vindo de frente
    const rng = (a, b) => a + Math.random() * (b - a);
    for (let i = 0; i < 16; i++) {
      const src = ships.length ? ships[i % ships.length] : at(rng(40, 300), rng(-60, 60), rng(-20, 20));
      const d = heading.clone().addScaledVector(R, rng(-0.06, 0.06)).addScaledVector(U, rng(-0.04, 0.04)).normalize();
      api.particles.bolt(src.clone().addScaledVector(d, rng(20, 240)).addScaledVector(R, (i % 2 ? 1 : -1) * 8.5), d, { color: 'gold', length: 22, width: 0.5, brightness: 36 });
    }
    for (let i = 0; i < 12; i++) {
      const p = at(rng(150, 900), rng(-260, 260), rng(-80, 140));
      const d = F.clone().negate().addScaledVector(R, rng(-0.5, 0.5)).addScaledVector(U, rng(-0.3, 0.3)).normalize();
      api.particles.bolt(p, d, { color: 'red', length: 30, width: 0.8, brightness: 30 });
    }
    // rastro de míssil em curva
    const m0 = at(90, -40, -20), m1 = at(380, 60, 30);
    const ctrl = at(240, -80, 70);
    for (let i = 0; i < 40; i++) {
      const u = i / 39;
      const p = m0.clone().multiplyScalar((1 - u) * (1 - u)).addScaledVector(ctrl, 2 * u * (1 - u)).addScaledVector(m1, u * u);
      api.particles.emit('smoke', p, 1, (k, o) => {
        o.life = 6; o.s0 = 1.2 + (1 - u) * 3.5; o.s1 = 4 + (1 - u) * 8; o.drag = 1; o.a = 0.16; o.b = 0.16; o.c = 0.17; o.w = u > 0.9 ? 1 : 0;
        o.delay = -(1 - u) * 2.5;
      });
    }
    api.particles.glow(m1, 3.5, [8, 5, 2.5], 3);
    S.shake.trauma = 0; S.flash.v = 0;
  });
}
