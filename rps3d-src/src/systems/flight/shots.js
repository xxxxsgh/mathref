// Presets de screenshot do sistema flight (câmera REAL do jogo, nave real).
//
//   flight-chase     câmera externa: o caça do Rafael em pós-combustão sobre
//                    Verídia, a 30 km, planeta curvo embaixo, sol rasante
//   flight-reentry   mergulho na atmosfera de Ashar a ~1,5 km/s: bainha de
//                    plasma, bordas do casco em brasa, rastro de faíscas
//   flight-landed    pousado em Nivália com o trem baixado, luz dourada
//
// Parâmetros de URL (ajuste fino sem editar código): elev, az, alt, roll,
// pitch, oy (órbita guinada), op (órbita arfagem), spd, body.
import * as THREE from 'three/webgpu';

const D2R = Math.PI / 180;
const P = (ctx, k, d) => { const v = ctx.params.get(k); return v === null ? d : Number(v); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function bodyByName(ctx, name) { return ctx.universe.system.bodies.find((b) => b.name === name); }
function tangent(up) {
  const ref = Math.abs(up.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  const e1 = new THREE.Vector3().crossVectors(up, ref).normalize();
  return { e1, e2: new THREE.Vector3().crossVectors(up, e1).normalize() };
}
/** Quaternion com −Z em fwd e +Y perto de up. */
function look(fwd, up) {
  const m = new THREE.Matrix4().lookAt(V(0, 0, 0), fwd, up);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
/** Direção do sol no plano tangente (local) e o próprio sol local. */
function sunLocal(ctx, b, t = ctx.time.world) {
  const sw = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
  return b.dirToLocal(sw, t, new THREE.Vector3());
}

/** Mantém a nave num movimento retilíneo previsível durante a captura. */
function holdLinear(S, extra = null) {
  const m = S.model;
  S.shotHold = (dt) => {
    m.prevPos.copy(m.pos); m.prevQuat.copy(m.quat);
    m.pos.addScaledVector(m.vel, dt);
    m.sampleEnv(S.ctx.time.world);
    extra?.(dt);
  };
}

function prepare(ctx, sysId) {
  if (ctx.universe.systemId !== sysId) ctx.universe.setSystem(sysId);
}

export function registerShots(ctx, api, S) {
  // ── câmera externa sobre Verídia ─────────────────────────────────────────
  ctx.shots.register('flight-chase', async (ctx) => {
    prepare(ctx, 'kessa');
    const b = bodyByName(ctx, ctx.params.get('body') || 'Verídia');
    const pl = ctx.services.planets;
    const t = ctx.time.world;
    const elev = P(ctx, 'elev', 18), az = P(ctx, 'az', 0);
    const up = pl?.dirForSun ? pl.dirForSun(b, elev, az, t) : sunLocal(ctx, b);
    const sunL = sunLocal(ctx, b, t);
    const sunT = sunL.clone().addScaledVector(up, -sunL.dot(up)).normalize();
    // rumo: sol à frente-esquerda (contraluz quente na borda da nave, planeta com relevo marcado)
    const side = new THREE.Vector3().crossVectors(up, sunT).normalize();
    const hdg = P(ctx, 'hdg', 128) * D2R;
    const fwd = sunT.clone().multiplyScalar(Math.cos(hdg)).addScaledVector(side, Math.sin(hdg)).normalize();
    const pitch = P(ctx, 'pitch', -34) * D2R;
    const f2 = fwd.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch)).normalize();
    const alt = P(ctx, 'alt', 26000);
    const pos = up.clone().multiplyScalar(b.radius + alt);
    let q = look(f2, up);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -P(ctx, 'roll', 22) * D2R));
    const spd = P(ctx, 'spd', 480);
    api.spawnPlayerShip(pos, q, 'fighter', { body: b, vel: f2.clone().multiplyScalar(spd), throttle: 1, faction: 'hegemonia', third: true });
    const m = S.model;
    m.boosting = true; m.boostFuel = 0.7;
    m.thrustLocal.set(0, 0, -1);
    m.angVel.set(0.05, 0.12, 0.35);
    S.controls.head.yaw = P(ctx, 'oy', 18) * D2R; S.controls.head.pitch = P(ctx, 'op', -4) * D2R;
    S.cam.orbit.yaw = S.controls.head.yaw; S.cam.orbit.pitch = S.controls.head.pitch;
    holdLinear(S, () => { m.boosting = true; m.thrustLocal.set(0, 0, -1); S.controls.head.yaw = P(ctx, 'oy', 18) * D2R; S.controls.head.pitch = P(ctx, 'op', -4) * D2R; });
    S.ctx.services.rendering?.sun?.setShadowRange?.(120);
    ctx.camera.fov = 62; ctx.camera.updateProjectionMatrix();
    S.cam.fov = 62; S.cam.chaseFov = 56;
    S.frameNow?.();
    pl?.settle?.();
  });

  // ── reentrada em Ashar ───────────────────────────────────────────────────
  ctx.shots.register('flight-reentry', async (ctx) => {
    prepare(ctx, 'kessa');
    const b = bodyByName(ctx, ctx.params.get('body') || 'Ashar');
    const pl = ctx.services.planets;
    const t = ctx.time.world;
    const up = pl?.dirForSun ? pl.dirForSun(b, P(ctx, 'elev', 32), P(ctx, 'az', 40), t) : sunLocal(ctx, b);
    const sunL = sunLocal(ctx, b, t);
    const sunT = sunL.clone().addScaledVector(up, -sunL.dot(up)).normalize();
    const side = new THREE.Vector3().crossVectors(up, sunT).normalize();
    const hdg = P(ctx, 'hdg', 70) * D2R;
    const fwdH = sunT.clone().multiplyScalar(Math.cos(hdg)).addScaledVector(side, Math.sin(hdg)).normalize();
    const dive = P(ctx, 'dive', -22) * D2R;
    const vdir = fwdH.clone().multiplyScalar(Math.cos(dive)).addScaledVector(up, Math.sin(dive)).normalize();
    // nariz um pouco acima do vetor (ângulo de ataque da reentrada)
    const aoa = P(ctx, 'aoa', 9) * D2R;
    const nose = fwdH.clone().multiplyScalar(Math.cos(dive + aoa)).addScaledVector(up, Math.sin(dive + aoa)).normalize();
    const alt = P(ctx, 'alt', 9500);
    const pos = up.clone().multiplyScalar(b.radius + alt);
    const q = look(nose, up).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -P(ctx, 'roll', -14) * D2R));
    const spd = P(ctx, 'spd', 1450);
    api.spawnPlayerShip(pos, q, 'fighter', { body: b, vel: vdir.clone().multiplyScalar(spd), throttle: 0.2, faction: 'hegemonia', third: true });
    const m = S.model;
    m.sampleEnv(t);
    // intensidade calculada pelo próprio modelo, já estabilizada
    for (let i = 0; i < 90; i++) m.computeReentry(1 / 30);
    const I = m.reentry;
    S.controls.head.yaw = P(ctx, 'oy', 34) * D2R; S.controls.head.pitch = P(ctx, 'op', 6) * D2R;
    S.cam.orbit.yaw = S.controls.head.yaw; S.cam.orbit.pitch = S.controls.head.pitch;
    holdLinear(S, () => { m.reentry = I; m.thrustLocal.set(0, 0, -0.3); S.controls.head.yaw = P(ctx, 'oy', 34) * D2R; S.controls.head.pitch = P(ctx, 'op', 6) * D2R; });
    ctx.camera.fov = 66; ctx.camera.updateProjectionMatrix(); S.cam.fov = 66; S.cam.chaseFov = 60;
    S.frameNow?.();
    pl?.settle?.();
    ctx.log('flight-reentry intensidade', I.toFixed(2), 'densidade', m.env.density.toExponential(2));
  });

  // ── pousado: câmera baixa, 3/4 de frente, serras atrás e sol rasante ─────
  ctx.shots.register('flight-landed', async (ctx) => {
    prepare(ctx, 'kessa');
    const b = bodyByName(ctx, ctx.params.get('body') || 'Verídia');
    const pl = ctx.services.planets;
    const t = ctx.time.world;
    const v = pl?.view?.(b);
    const elev = P(ctx, 'elev', 9), sunOff = P(ctx, 'sun', 48) * D2R;
    const oy = P(ctx, 'oy', 148), op = P(ctx, 'op', 11);
    let best = null, bs = -Infinity;
    // procura: lugar plano e seco cujo fundo (na direção do olhar) tenha relevo alto
    if (pl?.dirForSun && v?.terrain) {
      for (let az = 0; az < 360; az += P(ctx, 'step', 20)) {
        const d0 = pl.dirForSun(b, elev, az, t);
        let spot = null;
        try { spot = pl.findLandingSpot(b, d0, { maxSlope: 0.05, radius: 1800, samples: 90 }); } catch { spot = null; }
        if (!spot) continue;
        const up = spot.dir;
        const sunL = sunLocal(ctx, b, t);
        const sunT = sunL.clone().addScaledVector(up, -sunL.dot(up)).normalize();
        const view = sunT.clone().applyAxisAngle(up, sunOff);
        let mx = -Infinity;
        for (const k of [700, 1400, 2500, 4000, 6000]) { const p = up.clone().addScaledVector(view, k / b.radius).normalize(); mx = Math.max(mx, (v.terrain.height(p.x, p.y, p.z) - spot.height) / k); }
        // perto (entre câmera e nave) precisa ser plano
        let near = 0;
        for (const k of [-60, -30, 30]) { const p = up.clone().addScaledVector(view, k / b.radius).normalize(); near = Math.max(near, Math.abs(v.terrain.height(p.x, p.y, p.z) - spot.height)); }
        const score = mx * 100 - near * 0.4 - spot.slope * 40;
        if (score > bs) { bs = score; best = { spot, view, up }; }
      }
    }
    if (!best) {
      const d0 = pl?.dirForSun ? pl.dirForSun(b, elev, 0, t) : sunLocal(ctx, b);
      const sunT = sunLocal(ctx, b, t).addScaledVector(d0, -sunLocal(ctx, b, t).dot(d0)).normalize();
      best = { spot: { local: pl ? pl.placeOnSurface(b, d0, 0) : d0.clone().multiplyScalar(b.radius), normal: d0, dir: d0 }, view: sunT.applyAxisAngle(d0, sunOff), up: d0 };
    }
    const up = best.spot.normal.clone();
    // nave orientada para que a câmera de órbita (oy, op) olhe na direção `view`
    const V2 = best.view.clone().addScaledVector(up, -best.view.dot(up)).normalize();
    const ly = oy * D2R;
    const lx = -Math.sin(ly), lz = -Math.cos(ly); // olhar (local) = −offset
    const W = new THREE.Vector3().crossVectors(up, V2).normalize();
    let q = null, bd = -2;
    for (let i = 0; i < 360; i++) {
      const a = i * D2R;
      const R = V2.clone().multiplyScalar(Math.cos(a)).addScaledVector(W, Math.sin(a));
      const Bk = new THREE.Vector3().crossVectors(R, up);
      const dd = R.clone().multiplyScalar(lx).addScaledVector(Bk, lz).dot(V2);
      if (dd > bd) { bd = dd; q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(R, up, Bk)); }
    }
    api.spawnPlayerShip(best.spot.local.clone().addScaledVector(up, 3), q, 'fighter', { body: b, landed: true, faction: 'hegemonia', third: true });
    const set = () => { S.controls.head.yaw = oy * D2R; S.controls.head.pitch = op * D2R; S.cam.orbit.yaw = oy * D2R; S.cam.orbit.pitch = op * D2R; };
    set();
    const m = S.model;
    S.shotHold = () => { m.prevPos.copy(m.pos); m.prevQuat.copy(m.quat); set(); };
    ctx.camera.fov = P(ctx, 'fov', 56); ctx.camera.updateProjectionMatrix(); S.cam.fov = ctx.camera.fov; S.cam.chaseFov = ctx.camera.fov;
    S.ctx.services.rendering?.sun?.setShadowRange?.(80);
    S.frameNow?.();
    pl?.settle?.();
  });
}
