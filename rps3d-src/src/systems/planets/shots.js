// Presets de screenshot do sistema planets. Cada um escolhe um lugar real do
// planeta (procurando no relevo procedural um ponto que componha bem: costa
// com montanhas contra o sol, dunas diante de mesetas...), posiciona a
// câmera no referencial do planeta (acompanha a rotação), força o clima
// quando preciso e faz o LOD convergir antes da captura.
import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
const D2R = Math.PI / 180;

/** Parâmetros de URL para ajustar cenas sem editar código: elev, az, alt, pitch, yaw. */
const P = (ctx, k, d) => { const v = ctx.params.get(k); return v === null ? d : Number(v); };

function body(ctx, name) { return ctx.universe.system.bodies.find((b) => b.name === name); }

function tangentBasis(up) {
  const ref = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(up, ref).normalize();
  const e2 = new THREE.Vector3().crossVectors(up, e1).normalize();
  return { e1, e2 };
}

/** Câmera fixa no referencial LOCAL do corpo (gira com o planeta). */
function localCam(ctx, st, b, pos, look, up) {
  const apply = (c) => {
    const t = c.time.world;
    b.localToWorld(pos, t, c.player.camWorld);
    c.player.pos.copy(c.player.camWorld);
    _m.lookAt(new THREE.Vector3(), look, up);
    _q.setFromRotationMatrix(_m);
    c.camera.quaternion.copy(b.rotationAt(t, new THREE.Quaternion()).multiply(_q));
  };
  install(ctx, st, apply);
}
/** Câmera fixa em coordenadas de MUNDO. */
function worldCam(ctx, st, pos, look, up) {
  const apply = (c) => {
    c.player.camWorld.copy(pos); c.player.pos.copy(pos);
    _m.lookAt(new THREE.Vector3(), look, up);
    c.camera.quaternion.setFromRotationMatrix(_m);
  };
  install(ctx, st, apply);
}
function install(ctx, st, apply) {
  st.shotCam = apply;
  apply(ctx);
  if (!st.renderWrapped) {
    st.renderWrapped = true;
    const orig = ctx.render;
    ctx.render = (c, dt) => { if (st.shotCam) { st.shotCam(c); c.world.sync(); } return orig(c, dt); };
  }
}

function setup(ctx, sysId, fov = 62) {
  if (ctx.universe.systemId !== sysId) ctx.universe.setSystem(sysId);
  ctx.game.setMode('cinematic');
  ctx.camera.fov = fov; ctx.camera.updateProjectionMatrix();
}

/**
 * Procura um ponto na superfície (dir local) numa faixa de elevação solar.
 * score(dir, h, T, frame) → número (maior = melhor) ou -Infinity.
 */
function search(api, b, elev, score, { tries = 220, azSpan = 360 } = {}) {
  const v = api.view(b);
  let best = null, bs = -Infinity;
  for (let i = 0; i < tries; i++) {
    const az = (i / tries) * azSpan + (i % 7) * 0.37;
    const e = elev + ((i * 7919) % 11 - 5) * 0.25;
    const d = api.dirForSun(b, e, az);
    const h = v.terrain.height(d.x, d.y, d.z);
    const s = score(d, h, v.terrain);
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}

/** Direção do sol no plano tangente local (azimute do sol). */
function sunTangent(api, b, dirLocal, ctx) {
  const sunW = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
  const sunL = b.dirToLocal(sunW, ctx.time.world, new THREE.Vector3());
  const t = sunL.clone().addScaledVector(dirLocal, -sunL.dot(dirLocal));
  return { sunL, tan: t.normalize() };
}

/** Altura máxima ao longo de uma direção tangente (perfil do horizonte). */
function profile(T, b, d, tan, dists) {
  let mx = -Infinity;
  for (const s of dists) {
    const p = d.clone().addScaledVector(tan, s / b.radius).normalize();
    mx = Math.max(mx, T.height(p.x, p.y, p.z));
  }
  return mx;
}

export function registerShots(ctx, api, st) {
  // ── Verídia vista da órbita: terminador, halo, nuvens, brilho do oceano ──
  ctx.shots.register('planets-veridia-orbit', async (ctx) => {
    setup(ctx, 'kessa', 50);
    const b = body(ctx, 'Verídia');
    const sunW = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
    const perp = new THREE.Vector3().crossVectors(sunW, new THREE.Vector3(0, 1, 0)).normalize();
    const D = sunW.clone().multiplyScalar(Math.cos(78 * D2R)).addScaledVector(perp, Math.sin(78 * D2R)).addScaledVector(new THREE.Vector3(0, 1, 0), 0.25).normalize();
    const cam = b.pos.clone().addScaledVector(D, b.radius * 2.45);
    const toC = b.pos.clone().sub(cam).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(toC, up).normalize();
    const look = toC.clone().applyAxisAngle(right, 13 * D2R).applyAxisAngle(up, -8 * D2R);
    worldCam(ctx, st, cam, look, up.clone().applyAxisAngle(toC, -0.18));
    api.settle();
  });

  // ── pôr do sol na costa de Verídia ──
  ctx.shots.register('planets-veridia-surface-sunset', async (ctx) => {
    setup(ctx, 'kessa', 64);
    const b = body(ctx, 'Verídia');
    const v = api.view(b);
    const d = search(api, b, P(ctx, 'elev', 1.8), (d, h, T) => {
      if (h < 18 || h > 120) return -Infinity;
      const { tan } = sunTangent(api, b, d, ctx);
      const side = new THREE.Vector3().crossVectors(d, tan).normalize();
      const sea = profile(T, b, d, tan, [600, 1200, 2000]);
      const mtn = Math.max(profile(T, b, d, side, [3000, 6000, 9000]), profile(T, b, d, side.clone().negate(), [3000, 6000, 9000]));
      return (sea < 0 ? 600 : 0) + Math.min(mtn, 2600) - Math.abs(h - 40) * 2;
    }, { tries: 360 });
    const { tan, sunL } = sunTangent(api, b, d, ctx);
    const h = Math.max(0, v.terrain.height(d.x, d.y, d.z));
    const pos = d.clone().multiplyScalar(b.radius + h + P(ctx, 'alt', 28));
    const look = tan.clone().applyAxisAngle(d, P(ctx, 'yaw', 50) * D2R).addScaledVector(d, P(ctx, 'pitch', 0.03)).normalize();
    localCam(ctx, st, b, pos, look, d);
    ctx.services.rendering?.setExposure?.(P(ctx, 'exp', 0.6), { speed: 200 });
    api.weather.force('rain', 0);
    api.settle();
  });

  // ── Ashar: mar de dunas com mesetas no horizonte, sol lateral baixo ──
  ctx.shots.register('planets-ashar-surface', async (ctx) => {
    setup(ctx, 'kessa', 60);
    const b = body(ctx, 'Ashar');
    const v = api.view(b);
    const T = v.terrain;
    const far = [3000, 4500, 6500, 9000];
    const dirsFor = (d) => {
      const { tan } = sunTangent(api, b, d, ctx);
      return [70, 100, -70, -100].map((a) => tan.clone().applyAxisAngle(d, a * D2R));
    };
    const d = search(api, b, P(ctx, 'elev', 11), (d, h) => {
      const s = T.sample(d.x, d.y, d.z, {});
      if (s.s < 0.6) return -Infinity;
      let best = -Infinity;
      for (const dir of dirsFor(d)) {
        // primeiro plano de areia (perto baixo) e paredões longe
        const near = profile(T, b, d, dir, [300, 800, 1500]) - h;
        const m = profile(T, b, d, dir, far) - h;
        best = Math.max(best, Math.min(m, 900) - Math.max(0, near - 60) * 3);
      }
      return best + s.s * 100;
    }, { tries: 360 });
    let look = null, bm = -Infinity;
    const h = T.height(d.x, d.y, d.z);
    for (const dir of dirsFor(d)) {
      const m = profile(T, b, d, dir, far) - h - Math.max(0, profile(T, b, d, dir, [300, 800, 1500]) - h - 60) * 3;
      if (m > bm) { bm = m; look = dir; }
    }
    const pos = d.clone().multiplyScalar(b.radius + h + P(ctx, 'alt', 35));
    localCam(ctx, st, b, pos, look.clone().applyAxisAngle(d, P(ctx, 'yaw', 0) * D2R).addScaledVector(d, P(ctx, 'pitch', -0.02)).normalize(), d);
    api.weather.force('sandstorm', P(ctx, 'storm', 0.0));
    api.settle();
  });

  // ── Nivália: nevasca ──
  ctx.shots.register('planets-nivalia-blizzard', async (ctx) => {
    setup(ctx, 'kessa', 66);
    const b = body(ctx, 'Nivália');
    const v = api.view(b);
    const d = search(api, b, 14, (d, h, T) => {
      const { tan } = sunTangent(api, b, d, ctx);
      const m = profile(T, b, d, tan.clone().applyAxisAngle(d, 70 * D2R), [400, 900, 1600]) - h;
      return Math.min(m, 500) - Math.abs(h - 200) * 0.1;
    }, { tries: 240 });
    const { tan } = sunTangent(api, b, d, ctx);
    const look = tan.clone().applyAxisAngle(d, 70 * D2R).addScaledVector(d, 0.08).normalize();
    const h = v.terrain.height(d.x, d.y, d.z);
    localCam(ctx, st, b, d.clone().multiplyScalar(b.radius + h + 2.2), look, d);
    api.weather.force('blizzard', P(ctx, 'storm', 0.45));
    api.settle();
  });

  // ── Tharsos e anéis ──
  ctx.shots.register('planets-tharsos-rings', async (ctx) => {
    setup(ctx, 'kessa', 55);
    const b = body(ctx, 'Tharsos');
    const sunW = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
    const tilt = b.axialTilt || 0;
    const axisL = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0).normalize();
    const axisW = b.dirToWorld(axisL, ctx.time.world, new THREE.Vector3());
    const perp = new THREE.Vector3().crossVectors(sunW, axisW).normalize();
    // de lado em relação ao sol, um pouco acima do plano dos anéis
    const ph = P(ctx, 'phase', 100) * D2R;
    const D = sunW.clone().multiplyScalar(Math.cos(ph)).addScaledVector(perp, Math.sin(ph)).normalize();
    D.addScaledVector(axisW, 0.2).normalize();
    const cam = b.pos.clone().addScaledVector(D, b.radius * P(ctx, 'dist', 3.6));
    const toC = b.pos.clone().sub(cam).normalize();
    const right = new THREE.Vector3().crossVectors(toC, axisW).normalize();
    const look = toC.clone().applyAxisAngle(axisW, P(ctx, 'yaw', -16) * D2R).applyAxisAngle(right, P(ctx, 'pitch', 4) * D2R);
    worldCam(ctx, st, cam, look, axisW.clone().applyAxisAngle(toC, 0.35));
    api.settle();
  });

  // ── reentrada: câmera atravessando as nuvens de Verídia ──
  ctx.shots.register('planets-entry-clouds', async (ctx) => {
    setup(ctx, 'kessa', 72);
    const b = body(ctx, 'Verídia');
    const v = api.view(b);
    const smp = v.S.wtex.sampler;
    const a = v.wmapAt(ctx.time.world) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    const cov = (d) => smp(d.x * ca - d.z * sa, d.y, d.x * sa + d.z * ca).cov;
    // ponto dentro de um banco de nuvens com uma abertura à frente (vê-se o chão)
    let best = null, bs = -Infinity, bestLook = null;
    for (let i = 0; i < 500; i++) {
      const el = P(ctx, 'elev', 24) + (i % 5) * 3;
      const d = api.dirForSun(b, el, i * 0.73 * 57.3);
      const c0 = cov(d);
      if (c0 < 0.45) continue;
      const { tan } = sunTangent(api, b, d, ctx);
      for (const yaw of [120, 150, -120, -150]) {
        const dir = tan.clone().applyAxisAngle(d, yaw * D2R);
        const ahead = cov(d.clone().addScaledVector(dir, 4000 / b.radius).normalize());
        const far = cov(d.clone().addScaledVector(dir, 12000 / b.radius).normalize());
        const sc = -Math.abs(c0 - 0.5) * 2 - Math.abs(ahead - 0.4) * 1.5 + far * 0.5;
        if (sc > bs) { bs = sc; best = d; bestLook = dir; }
      }
    }
    const d = best || api.dirForSun(b, 24, 140);
    const look = (bestLook || sunTangent(api, b, d, ctx).tan).clone().addScaledVector(d, P(ctx, 'pitch', -0.16)).normalize();
    const L = v.cloud.layer;
    const r = L.base + (L.top - L.base) * P(ctx, 'hn', 0.92);
    localCam(ctx, st, b, d.clone().multiplyScalar(r), look, d);
    ctx.services.rendering?.setExposure?.(P(ctx, 'exp', 0.85), { speed: 200 });
    v.cloudBoost = P(ctx, 'boost', 0.0);
    api.weather.force('rain', 0.0);
    api.settle();
  });

  // ── Brasa: rios de lava ──
  ctx.shots.register('planets-brasa-lava', async (ctx) => {
    setup(ctx, 'kessa', 64);
    const b = body(ctx, 'Brasa');
    const v = api.view(b);
    const d = search(api, b, P(ctx, 'elev', 4), (d, h, T) => {
      const s = T.sample(d.x, d.y, d.z, {});
      if (s.s > 0.3) return -Infinity;
      const { tan } = sunTangent(api, b, d, ctx);
      let lava = 0;
      for (const a of [0, 60, 120, 180, 240, 300]) for (const k of [300, 700, 1300]) {
        const p = d.clone().addScaledVector(tan.clone().applyAxisAngle(d, a * D2R), k / b.radius).normalize();
        lava += T.sample(p.x, p.y, p.z, {}).s;
      }
      return lava + (h > -30 && h < 300 ? 2 : 0);
    }, { tries: 260 });
    const T = v.terrain;
    const { tan } = sunTangent(api, b, d, ctx);
    let look = tan, bl = -1;
    for (let a = 0; a < 360; a += 20) {
      const dir = tan.clone().applyAxisAngle(d, a * D2R);
      let l = 0;
      for (const k of [200, 500, 900, 1500]) { const p = d.clone().addScaledVector(dir, k / b.radius).normalize(); l += T.sample(p.x, p.y, p.z, {}).s; }
      l += Math.max(0, profile(T, b, d, dir, [2500, 4000, 6000]) - 200) / 300;
      if (dir.dot(tan) > 0.3) l -= 6; // nunca contra o sol: a lava brilha no contraluz do crepúsculo
      if (l > bl) { bl = l; look = dir; }
    }
    const h = T.height(d.x, d.y, d.z);
    localCam(ctx, st, b, d.clone().multiplyScalar(b.radius + h + 45), look.clone().addScaledVector(d, -0.12).normalize(), d);
    ctx.services.rendering?.setExposure?.(P(ctx, 'exp', 0.9), { speed: 200 });
    api.weather.force('ash', P(ctx, 'storm', 0.4));
    api.settle();
  });

  // ── Ossário: crateras com Tharsos e anéis no céu ──
  ctx.shots.register('planets-ossario-craters', async (ctx) => {
    setup(ctx, 'kessa', 68);
    const b = body(ctx, 'Ossário');
    const g = body(ctx, 'Tharsos');
    const v = api.view(b);
    const t = ctx.time.world;
    const toG = b.dirToLocal(g.pos.clone().sub(b.pos).normalize(), t, new THREE.Vector3());
    // ponto de onde Tharsos fica a ~25° acima do horizonte e o sol baixo
    let best = null, bs = -Infinity;
    for (let i = 0; i < 400; i++) {
      const az = i * 0.9, el = 14 + (i % 9) * 2;
      const d = api.dirForSun(b, el, az);
      const gEl = Math.asin(d.dot(toG)) / D2R;
      const h = v.terrain.height(d.x, d.y, d.z);
      const s = -Math.abs(gEl - 28) * 3 - Math.abs(h) * 0.01;
      if (s > bs) { bs = s; best = d; }
    }
    const d = best;
    const gT = toG.clone().addScaledVector(d, -toG.dot(d)).normalize();
    const look = gT.clone().addScaledVector(d, 0.3).normalize();
    const h = v.terrain.height(d.x, d.y, d.z);
    localCam(ctx, st, b, d.clone().multiplyScalar(b.radius + h + 30), look, d);
    api.settle();
  });

  // ── Aurora (Halden) vista do ponto da batalha de abertura ──
  ctx.shots.register('planets-aurora-orbit', async (ctx) => {
    setup(ctx, 'halden', 60);
    const sys = ctx.universe.system;
    const b = body(ctx, 'Aurora');
    const poi = sys.pois.find((p) => p.kind === 'opening_battle');
    const cam = poi ? poi.pos.clone() : b.pos.clone().add(new THREE.Vector3(-b.radius * 2.4, b.radius * 0.5, b.radius * 1.2));
    const toC = b.pos.clone().sub(cam).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(toC, up).normalize();
    const look = toC.clone().applyAxisAngle(up, P(ctx, 'yaw', 14) * D2R).applyAxisAngle(right, P(ctx, 'pitch', 6) * D2R);
    worldCam(ctx, st, cam, look, up);
    api.settle();
  });

  // ── Aurora (Halden): oceano e arquipélago ──
  ctx.shots.register('planets-aurora-ocean', async (ctx) => {
    setup(ctx, 'halden', 64);
    const b = body(ctx, 'Aurora');
    const v = api.view(b);
    const d = search(api, b, 12, (d, h, T) => {
      if (h > -8 || h < -60) return -Infinity;
      const { tan } = sunTangent(api, b, d, ctx);
      const isl = Math.max(profile(T, b, d, tan.clone().applyAxisAngle(d, 140 * D2R), [800, 1600, 2600]), profile(T, b, d, tan.clone().applyAxisAngle(d, -140 * D2R), [800, 1600, 2600]));
      return Math.min(isl, 400);
    }, { tries: 300 });
    const { tan } = sunTangent(api, b, d, ctx);
    const T = v.terrain;
    const a1 = tan.clone().applyAxisAngle(d, 140 * D2R), a2 = tan.clone().applyAxisAngle(d, -140 * D2R);
    const look = (profile(T, b, d, a1, [800, 1600, 2600]) > profile(T, b, d, a2, [800, 1600, 2600]) ? a1 : a2).addScaledVector(d, -0.03).normalize();
    localCam(ctx, st, b, d.clone().multiplyScalar(b.radius + 22), look, d);
    api.settle();
  });

  // ── mundo tóxico (Nomar V, anã vermelha): névoa ácida e fungos luminosos ──
  ctx.shots.register('planets-toxic-surface', async (ctx) => {
    setup(ctx, 's6', 64);
    const b = ctx.universe.system.bodies.find((x) => x.type === 'toxic') || ctx.universe.system.bodies[0];
    const v = api.view(b);
    const d = search(api, b, P(ctx, 'elev', 5), (d, h, T) => {
      if (h < 10 || h > 200) return -Infinity;
      const { tan } = sunTangent(api, b, d, ctx);
      const side = new THREE.Vector3().crossVectors(d, tan).normalize();
      return Math.min(800, profile(T, b, d, side, [1500, 3000, 5000]) - h) + (profile(T, b, d, tan, [800, 1600]) < 0 ? 300 : 0);
    }, { tries: 260 });
    const { tan } = sunTangent(api, b, d, ctx);
    const side = new THREE.Vector3().crossVectors(d, tan).normalize();
    const look = tan.clone().applyAxisAngle(d, P(ctx, 'yaw', 55) * D2R).addScaledVector(d, P(ctx, 'pitch', -0.04)).normalize();
    const h = v.terrain.height(d.x, d.y, d.z);
    localCam(ctx, st, b, d.clone().multiplyScalar(b.radius + Math.max(h, 0) + P(ctx, 'alt', 8)), look, d);
    api.weather.force('acid', P(ctx, 'storm', 0.35));
    api.settle();
  });
}
