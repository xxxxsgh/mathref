// Cenários de teste/captura do sistema render.
//
//   render-showcase   nave PBR + esferas de materiais + estrela HDR (bloom,
//                     flare, god rays) + explosão em curso + laser + trilhas
//   render-explosion  explosão grande em close no espaço
//   render-visor      chuva/gelo/poeira no visor numa plataforma de pouso
//                     ao entardecer (?visor=crack mostra rachadura)
//
// Funcionam sem os outros sistemas (céu próprio se "space" não existir).
// O tempo do fx anda em passo fixo de 1/60 por frame nos cenários, para a
// explosão estar sempre no mesmo estágio na captura.

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, float, normalize, positionLocal, dot, max, pow, smoothstep, mix, exp, uniform } from 'three/tsl';
import { makeBackdrop } from './backdrop.js';
import { makeDemoShip } from './ship.js';
import { fbm3 } from '../tsl-lib.js';
import { seedFx } from '../fx/fx.js';

function clearScenario(sys) {
  sys.sunOverride = null;
  for (const o of sys.scenarioObjects || []) o.removeFromParent();
  sys.scenarioObjects = [];
  sys.scenarioUpdate = [];
}

/** Há um sistema de céu (space) ativo? Então ele desenha o céu e controla ctx.sun. */
function hasSky(ctx) {
  return !!ctx.get('space') || ctx.systems.some((x) => x.name === 'space' && x.ok);
}

/**
 * Prepara o cenário. Os cenários são compostos num referencial canônico em
 * que a estrela está na direção sunDir; se o sistema "space" existir, a
 * composição inteira (mundo + câmera) é girada para a estrela real ficar
 * no mesmo lugar do quadro. Retorna {q, place(group), camera(pos, target)}.
 */
function setupCommon(ctx, sys, { backdrop = true, sunDir = new THREE.Vector3(0.4, 0.25, -1), ...bd } = {}) {
  clearScenario(sys);
  ctx.setMode('free');
  ctx.freeCamLocked = true;
  sys.fx.fixedStep = 1 / 60;
  seedFx(1234);
  const D0 = sunDir.clone().normalize();
  const q = new THREE.Quaternion();
  if (hasSky(ctx)) {
    const star = ctx.world.toLocal(0, 0, 0);
    if (star.lengthSq() > 1) q.setFromUnitVectors(D0, star.normalize());
  } else if (backdrop) {
    const b = makeBackdrop(ctx, { sunDir: D0, ...bd });
    ctx.scene.add(b);
    sys.scenarioObjects.push(b);
    sys.scenarioUpdate.push(() => b.userData.update());
  }
  ctx.get('render').updateEnvironment(true);
  return {
    q,
    place(group) {
      group.quaternion.premultiply(q);
      group.position.applyQuaternion(q);
      return group;
    },
    camera(pos, target, fov = 60) {
      const cam = ctx.camera;
      cam.up.set(0, 1, 0).applyQuaternion(q);
      cam.position.copy(pos).applyQuaternion(q);
      cam.lookAt(target.clone().applyQuaternion(q));
      cam.fov = fov;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    },
  };
}

/**
 * Posiciona obj (filho de parent) para que a câmera atual o veja como uma
 * câmera em camLocal (no referencial do obj) olhando para lookLocal o veria,
 * deslocado de offset no espaço da câmera.
 */
function placeInView(ctx, parent, obj, camLocal, lookLocal, offset) {
  const tmp = new THREE.PerspectiveCamera();
  tmp.position.copy(camLocal);
  tmp.lookAt(lookLocal);
  tmp.updateMatrixWorld(true);
  const objInCam = tmp.matrixWorld.clone().invert(); // obj → espaço da câmera
  const cam = ctx.camera;
  cam.updateMatrixWorld(true);
  parent.updateMatrixWorld(true);
  const shift = new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z);
  const m = new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(cam.matrixWorld).multiply(shift).multiply(objInCam);
  m.decompose(obj.position, obj.quaternion, obj.scale);
  obj.updateMatrixWorld(true);
}

function materialSpheres(render) {
  const g = new THREE.Group();
  const list = [
    { preset: 'hull' },
    { preset: 'hullWhite', stripeAxis: 'y', stripeAt: 0.1, stripeWidth: 0.12 },
    { preset: 'hullRebel', stripeAxis: 'y', stripeAt: -0.3 },
    { preset: 'pirate', stripeAxis: 'y', stripeAt: 0.35, stripeWidth: 0.1 },
    { preset: 'guild', stripeAxis: 'y', stripeAt: 0.0, stripeWidth: 0.08 },
    { preset: 'gold' },
    { preset: 'chrome' },
    { preset: 'plastic' },
    { preset: 'rubber' },
    { preset: 'glass' },
    { preset: 'suit' },
    { preset: 'carbon' },
    { preset: 'rock' },
    { preset: 'emissivePanel', triplanarScale: 1.6 },
  ];
  const geo = new THREE.SphereGeometry(1, 64, 32);
  list.forEach((o, i) => {
    const m = new THREE.Mesh(geo, render.pbr({ ...o, seed: i * 1.7 }));
    const col = i % 7;
    const row = Math.floor(i / 7);
    m.position.set((col - 3) * 2.6, -row * 2.6, 0);
    m.castShadow = m.receiveShadow = true;
    m.name = 'esfera-' + o.preset;
    g.add(m);
  });
  return g;
}

export function registerScenarios(ctx, sys) {
  sys.scenarioObjects = [];
  sys.scenarioUpdate = [];

  ctx.scenario('render-showcase', 'render: nave PBR, esferas de materiais, estrela HDR (bloom/flare/god rays), explosão em curso', async (ctx) => {
    const render = ctx.get('render');
    const fx = ctx.get('fx');
    const S = setupCommon(ctx, sys, { sunDir: new THREE.Vector3(-0.75, 0.5, 0.45), nebula: 0x30144a, nebula2: 0x062a40 });
    const world = new THREE.Group();
    world.name = 'render-showcase';
    ctx.root.add(S.place(world));
    world.updateMatrixWorld(true);
    sys.scenarioObjects.push(world);

    // câmera primeiro; a nave é posicionada no espaço da câmera (enquadramento estável)
    S.camera(new THREE.Vector3(2.5, 4.5, 16), new THREE.Vector3(-0.5, 0.6, -3), 55);
    const ship = makeDemoShip(render);
    world.add(ship);
    placeInView(ctx, world, ship, new THREE.Vector3(-12, 9, -11), new THREE.Vector3(0, 0, -0.5), new THREE.Vector3(-3.0, 1.2, -6));
    const spheres = materialSpheres(render);
    spheres.position.set(3.2, -1.2, 4.5);
    spheres.rotation.set(-0.35, -0.25, 0);
    spheres.scale.setScalar(0.6);
    world.add(spheres);
    // trilhas dos motores
    ship.updateMatrixWorld(true);
    const trails = [];
    ship.traverse((o) => {
      if (o.name === 'bocal') trails.push(fx.trail(o, { kind: 'engine', color: 0x5aa8ff, width: 0.8, length: 30 }));
    });
    // a nave avança devagar para formar as trilhas
    let tAcc = 0;
    const start = ship.position.clone();
    if (!ctx.params.has('still')) sys.scenarioUpdate.push((dt) => {
      tAcc += 1 / 60;
      ship.position.copy(start).addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(ship.quaternion), tAcc * 4 - 2);
    });
    // explosão ao fundo (em curso) + laser cruzando
    const W = (x, y, z) => world.localToWorld(new THREE.Vector3(x, y, z));
    fx.explosion(W(18, 0, -62), { scale: 8, startAge: 0.25, shake: false });
    let beamT = 0;
    sys.scenarioUpdate.push(() => {
      beamT += 1 / 60;
      if (beamT > 0.1) {
        beamT = 0;
        fx.beam(W(-34, 12, -45), W(16, 0.5, -61), { color: 0xff2a3a, width: 0.35, life: 0.16 });
      }
    });
    // câmera
  });

  ctx.scenario('render-ship', 'render: nave de demonstração em close (materiais PBR procedurais, ?view=top|side|rear)', async (ctx) => {
    const render = ctx.get('render');
    const S = setupCommon(ctx, sys, { sunDir: new THREE.Vector3(-0.6, 0.7, 0.4), nebula: 0x30144a, nebula2: 0x062a40 });
    const world = new THREE.Group();
    ctx.root.add(S.place(world));
    const ship = makeDemoShip(render, { scheme: ctx.params.get('scheme') || 'hegemony' });
    world.add(ship);
    const view = ctx.params.get('view') || 'front';
    const cams = {
      front: [new THREE.Vector3(-11, 6.5, -14), new THREE.Vector3(0, 0, -0.5)],
      top: [new THREE.Vector3(0.01, 24, 0), new THREE.Vector3(0, 0, 0)],
      side: [new THREE.Vector3(-22, 1.5, 0), new THREE.Vector3(0, 0, 0)],
      rear: [new THREE.Vector3(9, 5, 17), new THREE.Vector3(0, 0, 1)],
    };
    const [p, t] = cams[view] || cams.front;
    S.camera(p, t, 45);
  });

  ctx.scenario('render-csm', 'render: sombras em cascata (pilares de 3 m a 700 m sobre uma plataforma, sol a ~30°)', async (ctx) => {
    const render = ctx.get('render');
    const sunDir = new THREE.Vector3(-0.55, 0.5, -0.65).normalize();
    const S = setupCommon(ctx, sys, { sunDir, nebula: 0x30144a, nebula2: 0x062a40 });
    const world = new THREE.Group();
    ctx.root.add(S.place(world));
    const ground = new THREE.Mesh(new THREE.BoxGeometry(400, 1, 1600), render.pbr({ preset: 'concrete', stripe: 1, stripeColor: 0xd8a020, stripeAxis: 'x', stripeAt: 0, stripeWidth: 0.5 }));
    ground.position.set(0, -0.5, -700);
    ground.receiveShadow = true;
    world.add(ground);
    const mat = render.pbr({ preset: 'hull', seed: 3 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 26; i++) {
      const z = -3 - Math.pow(i / 25, 2.2) * 700;
      const h = 2 + Math.pow(i / 25, 1.5) * 40;
      for (const x of [-6 - i * 1.5, 6 + i * 1.5]) {
        const b = new THREE.Mesh(geo, mat);
        b.scale.set(0.6 + i * 0.25, h, 0.6 + i * 0.25);
        b.position.set(x, h / 2, z);
        b.castShadow = b.receiveShadow = true;
        world.add(b);
      }
    }
    const ship = makeDemoShip(render);
    ship.position.set(0, 3.5, -16);
    ship.rotation.set(0.05, 2.6, 0.1);
    world.add(ship);
    S.camera(new THREE.Vector3(3, 4, 6), new THREE.Vector3(-1, 2, -30), 65);
  });

  ctx.scenario('render-fx', 'render: catálogo de efeitos (impactos por superfície, clarão de cano, lasers, míssil com trilha, fogo, calor, faíscas)', async (ctx) => {
    const render = ctx.get('render');
    const fx = ctx.get('fx');
    const S = setupCommon(ctx, sys, { sunDir: new THREE.Vector3(-0.4, 0.6, 0.7), nebula: 0x30144a, nebula2: 0x062a40 });
    const world = new THREE.Group();
    ctx.root.add(S.place(world));
    world.updateMatrixWorld(true);
    const W = (x, y, z) => world.localToWorld(new THREE.Vector3(x, y, z));
    const N = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(world.quaternion);
    // parede de casco + piso
    const wall = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 1), render.pbr({ preset: 'hull', seed: 8 }));
    wall.position.set(0, 7, -12);
    wall.receiveShadow = wall.castShadow = true;
    world.add(wall);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(40, 1, 30), render.pbr({ preset: 'concrete' }));
    floor.position.set(0, -0.5, -6);
    floor.receiveShadow = true;
    world.add(floor);
    // canhões (para clarão de cano)
    const gunMat = render.pbr({ preset: 'steel' });
    const guns = [];
    for (const x of [-5, 5]) {
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2.4, 16), gunMat);
      gun.rotation.x = Math.PI / 2;
      gun.position.set(x, 2.2, -2);
      world.add(gun);
      const tip = new THREE.Object3D();
      tip.position.set(0, 1.25, 0); // cano aponta para −z do mundo (eixo +y do cilindro girado)
      tip.rotation.x = -Math.PI / 2;
      gun.add(tip);
      guns.push(tip);
    }
    // destroço em chamas
    const wreck = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 0), render.pbr({ preset: 'hullRebel', seed: 4 }));
    wreck.position.set(7, 1.0, -5);
    wreck.castShadow = true;
    world.add(wreck);
    fx.fire(W(7, 1.8, -5), { scale: 1.2, life: 30 });
    fx.heat(W(7, 4, -5), 3, 30, 1.2);
    // míssil em curva com trilha
    const missile = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 1.2, 4, 10), gunMat);
    world.add(missile);
    const mTrail = fx.trail(missile, { kind: 'missile', width: 0.35, length: 30, offset: new THREE.Vector3(0, -0.7, 0) });
    const surfaces = ['metal', 'shield', 'energy', 'rock', 'ice', 'water', 'dirt', 'sand'];
    let t = 0;
    let shot = 0;
    sys.scenarioUpdate.push(() => {
      t += 1 / 60;
      // míssil: arco da esquerda para a direita, alto
      const a = (t * 0.45) % 1;
      missile.position.set(-14 + a * 26, 8 + Math.sin(a * Math.PI) * 3, -9 + a * 4);
      const dir = new THREE.Vector3(30, Math.cos(a * Math.PI) * 3 * Math.PI, 4).normalize();
      missile.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      // a cada 0,1 s: um disparo alternado + impactos
      if (Math.floor(t / 0.1) !== shot) {
        shot = Math.floor(t / 0.1);
        const g = guns[shot % 2];
        fx.muzzle(g, { color: shot % 4 < 2 ? 0xffa040 : 0x70b0ff, scale: 1.1 });
        const from = g.getWorldPosition(new THREE.Vector3());
        const i = shot % surfaces.length;
        const hit = W(-12 + i * 3.4, 2.5 + (shot % 3) * 0.8, -11.4);
        fx.beam(from, hit, { color: surfaces[i] === 'shield' || surfaces[i] === 'energy' ? 0x40a0ff : 0xff3020, width: 0.12, life: 0.09 });
        fx.impact(hit, N(0, 0, 1), surfaces[i]);
      }
      // faíscas de esmerilhado no piso
      if (shot % 2 === 0) fx.sparks(W(-7, 0.05, -3), N(0.3, 1, 0.2), { count: 8, speed: 7, color: 0xffb060, gravity: -9.8 });
    });
    S.camera(new THREE.Vector3(0, 4, 9), new THREE.Vector3(0, 3, -10), 62);
    return mTrail;
  });

  ctx.scenario('render-explosion', 'render: explosão grande em close no espaço (fogo volumétrico, fumaça, faíscas, onda de choque, destroços)', async (ctx) => {
    const fx = ctx.get('fx');
    const render = ctx.get('render');
    const S = setupCommon(ctx, sys, { sunDir: new THREE.Vector3(0.8, 0.5, 0.3), nebula: 0x3a1020, nebula2: 0x10203a });
    const world = new THREE.Group();
    ctx.root.add(S.place(world));
    world.updateMatrixWorld(true);
    sys.scenarioObjects.push(world);
    // casco destruído ao lado (para receber a luz da explosão)
    const wreck = makeDemoShip(render, { scheme: 'rebel' });
    wreck.position.set(-26, -8, -45);
    wreck.rotation.set(0.4, 0.9, -0.5);
    world.add(wreck);
    fx.explosion(world.localToWorld(new THREE.Vector3(0, 0, -70)), { scale: 10, startAge: -0.2, shake: false });
    S.camera(new THREE.Vector3(0, 2, 0), new THREE.Vector3(-3, 1, -70), 60);
  });

  ctx.scenario('render-visor', 'render: chuva/gelo/poeira no vidro do capacete numa plataforma ao entardecer (?visor=crack)', async (ctx) => {
    const render = ctx.get('render');
    const fx = ctx.get('fx');
    const sunDir = new THREE.Vector3(-0.8, 0.12, -0.6).normalize();
    const S = setupCommon(ctx, sys, { backdrop: false, sunDir });
    const world = new THREE.Group();
    ctx.root.add(S.place(world));
    sys.scenarioObjects.push(world);
    // céu de entardecer nublado (simples) se não houver planetas
    if (!ctx.get('planets')) {
      const u = uniform(sunDir);
      const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
      m.colorNode = (() => {
        const d = normalize(positionLocal);
        const h = d.y;
        const base = mix(vec3(0.5, 0.32, 0.25), vec3(0.08, 0.1, 0.16), pow(max(h, 0), 0.5));
        const clouds = fbm3(d.mul(vec3(3, 9, 3)), 5);
        const cs = max(dot(d, u), 0);
        const glow = vec3(1.0, 0.55, 0.25).mul(pow(cs, 8).mul(1.6).add(pow(cs, 200).mul(20)));
        const c = mix(base, vec3(0.16, 0.14, 0.15), smoothstep(0.4, 0.75, clouds).mul(smoothstep(-0.05, 0.25, h)));
        return vec4(c.add(glow.mul(clouds.oneMinus().mul(0.8).add(0.2))).mul(max(h.add(0.15), 0.05).min(1).add(0.2)), 1);
      })();
      const sky = new THREE.Mesh(new THREE.SphereGeometry(5e5, 48, 24), m);
      sky.renderOrder = -5;
      world.add(sky);
      ctx.sun.position.copy(sunDir).applyQuaternion(S.q).multiplyScalar(1000);
      ctx.sun.target.position.set(0, 0, 0);
      // o céu de entardecer manda na cor/intensidade do sol (mesmo com "space" ativo)
      sys.sunOverride = { color: new THREE.Color(0xffa070), intensity: 1.6 };
      if (ctx.ambient) {
        ctx.ambient.color.set(0x8090b0);
        ctx.ambient.groundColor?.set(0x302018);
        ctx.ambient.intensity = 0.6;
      }
      render.setSky({ zenith: 0x141a28, horizon: 0x9a6048, ground: 0x2a2220, atmo: 1 });
      render.updateEnvironment(true);
    }
    // plataforma de pouso
    const pad = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 60), render.pbr({ preset: 'concrete', stripe: 1, stripeColor: 0xd8a020, stripeAxis: 'x', stripeAt: 0, stripeWidth: 0.4 }));
    pad.position.y = -0.5;
    pad.receiveShadow = true;
    world.add(pad);
    const ship = makeDemoShip(render, { scheme: 'hegemony' });
    ship.position.set(2, 1.9, -17);
    ship.rotation.y = 0.75;
    world.add(ship);
    // luzes da plataforma (emissivas HDR → bokeh nas gotas)
    const lampMat = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(1.0, 0.7, 0.35).multiplyScalar(14) });
    const lampMat2 = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(0.3, 0.7, 1.0).multiplyScalar(10) });
    for (let i = 0; i < 14; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), i % 3 ? lampMat : lampMat2);
      const a = (i / 14) * Math.PI * 2;
      l.position.set(Math.cos(a) * 22, 0.3 + (i % 2) * 4, -18 + Math.sin(a) * 16);
      world.add(l);
    }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 14, 12), render.pbr({ preset: 'steel' }));
    mast.position.set(-12, 7, -26);
    world.add(mast);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(3, 0.15, 0.1).multiplyScalar(8) }));
    beacon.position.set(-12, 14.3, -26);
    world.add(beacon);
    // fumaça baixa de motor ligado
    fx.smoke(new THREE.Vector3(4, 1, -12), { count: 10, scale: 2, life: 6, color: 0x6a6460, alpha: 0.35 });
    const crack = ctx.params.get('visor') === 'crack';
    render.setVisor({ rain: 1, frost: crack ? 0.0 : 0.55, dust: 0.5, crack: crack ? 1 : 0, instant: true, crackAt: new THREE.Vector2(0.25, 0.08) });
    S.camera(new THREE.Vector3(-3, 1.7, 2), new THREE.Vector3(1, 2, -16), 70);
  });
}
