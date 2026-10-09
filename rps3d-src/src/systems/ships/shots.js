// Presets de screenshot do sistema ships.
//
//   ships-cockpit-space       abertura em Halden: dentro do caça do Rafael,
//                             ala da Hegemonia à frente, porta-caças ao longe,
//                             Aurora e o nascer do sol, ordem de bombardeio no HUD
//   ships-cockpit-planet-rain pousado em Verídia sob chuva: gotas no vidro
//   ships-lineup              todas as classes × facções lado a lado
//   ships-capital             destróier e porta-caças da Hegemonia sobre Aurora,
//                             caças saindo do hangar
//   ships-interior-walk       corredor do cargueiro até a baia e o reator
import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4();
const D2R = Math.PI / 180;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Quaternion de câmera/nave: −Z aponta para dir. */
function look(dir, up) { _m.lookAt(new THREE.Vector3(), dir, up); return new THREE.Quaternion().setFromRotationMatrix(_m); }
/** Orientação de câmera que põe a direção de mundo `wDir` em `camDir` (coords. da câmera), com o "cima" próximo de upRef. */
function camFromDir(wDir, camDir, upRef) {
  const fr = (a, b) => { const e1 = a.clone().normalize(); const e2 = b.clone().addScaledVector(e1, -b.dot(e1)).normalize(); return new THREE.Matrix4().makeBasis(e1, e2, new THREE.Vector3().crossVectors(e1, e2)); };
  const m = fr(wDir, upRef).multiply(fr(camDir, V(0, 1, 0)).invert());
  return new THREE.Quaternion().setFromRotationMatrix(m);
}
function body(ctx, name, i = 0) { return ctx.universe.system.bodies.find((b) => b.name === name) || ctx.universe.system.bodies[i]; }
function setup(ctx, sysId, fov = 60) {
  if (ctx.universe.systemId !== sysId) ctx.universe.setSystem(sysId);
  ctx.game.setMode('cinematic');
  ctx.camera.fov = fov; ctx.camera.updateProjectionMatrix();
}
/** Câmera fixa em mundo, reaplicada todo frame. */
function worldCam(ctx, st, pos, quat) {
  const p = pos.clone(), q = quat.clone();
  st.shotCam = (c) => { c.player.camWorld.copy(p); c.player.pos.copy(p); c.camera.quaternion.copy(q); };
  st.shotCam(ctx);
}
/** Base ortonormal a partir de uma frente e um "cima" aproximado. */
function basis(F, up) {
  const f = F.clone().normalize();
  const R = new THREE.Vector3().crossVectors(f, up).normalize();
  const U = new THREE.Vector3().crossVectors(R, f).normalize();
  return { F: f, R, U };
}
function rotToward(a, b, ang) {
  // gira o vetor unitário a em direção a b (no plano a-b) por ang rad
  const n = new THREE.Vector3().crossVectors(a, b).normalize();
  return a.clone().applyAxisAngle(n, ang).normalize();
}
function sunDir(ctx, from) { return ctx.universe.system.star.pos.clone().sub(from).normalize(); }

/** Contatos/alvo do cockpit a partir de naves criadas (direções no referencial da nave). */
function feedContacts(cp, shipPos, shipQuat, list, targetIdx = -1) {
  const inv = shipQuat.clone().invert();
  const contacts = list.map((o, i) => {
    const d = o.pos.clone().sub(shipPos);
    const dist = d.length();
    return { dir: d.normalize().applyQuaternion(inv), dist, rel: o.rel, capital: o.capital, selected: i === targetIdx, name: o.name };
  });
  const t = targetIdx >= 0 ? contacts[targetIdx] : null;
  cp.setData({
    contacts,
    target: t ? { name: list[targetIdx].name, faction: list[targetIdx].faction, rel: t.rel, dist: t.dist, speed: 212, hull: 0.62, shield: 0.25, dirLocal: t.dir, leadLocal: t.dir.clone().add(V(0.035, 0.012, 0)).normalize(), locked: true } : null,
  });
}

export function registerShots(ctx, api, st) {
  // ── 1. cockpit no espaço: a abertura em Halden ───────────────────────────
  ctx.shots.register('ships-cockpit-space', async (ctx) => {
    setup(ctx, 'halden', 72);
    const aur = body(ctx, 'Aurora');
    // posição: Aurora com raio angular `alpha` e o sol a `sep` do centro dela
    // (nasce logo acima do limbo); depois a câmera é orientada para que o
    // planeta fique embaixo à direita e o sol no alto à esquerda.
    const alpha = Number(ctx.params.get('alpha') ?? 34) * D2R, sep = Number(ctx.params.get('sep') ?? 80) * D2R;
    const dist = aur.radius / Math.sin(alpha);
    let toS = sunDir(ctx, aur.pos), C = new THREE.Vector3();
    for (let it = 0; it < 4; it++) {
      const b0 = basis(toS, V(0, 1, 0));
      const D = toS.clone().multiplyScalar(Math.cos(sep)).addScaledVector(b0.U.clone().multiplyScalar(-0.94).addScaledVector(b0.R, 0.34).normalize(), Math.sin(sep)).normalize();
      C = aur.pos.clone().addScaledVector(D, -dist);
      toS = sunDir(ctx, C);
    }
    const toP = aur.pos.clone().sub(C).normalize();
    // direções desejadas na tela (graus: guinada +dir, arfagem +cima)
    const dirCam = (yaw, pit) => V(Math.sin(yaw * D2R) * Math.cos(pit * D2R), Math.sin(pit * D2R), -Math.cos(yaw * D2R) * Math.cos(pit * D2R));
    const pc = dirCam(Number(ctx.params.get('py') ?? 24), Number(ctx.params.get('pp') ?? -16));
    const angPS = Math.acos(THREE.MathUtils.clamp(toP.dot(toS), -1, 1));
    // sol: na direção (−18°, +4°) ajustada para manter a separação real
    let sc = dirCam(-18, 4);
    const ax = new THREE.Vector3().crossVectors(pc, sc).normalize();
    sc = pc.clone().applyAxisAngle(ax, angPS);
    const frame = (a, b) => { const e1 = a.clone().normalize(); const e2 = b.clone().addScaledVector(e1, -b.dot(e1)).normalize(); return new THREE.Matrix4().makeBasis(e1, e2, new THREE.Vector3().crossVectors(e1, e2)); };
    const Rm = frame(toP, toS).multiply(frame(pc, sc).invert());
    const camQ = new THREE.Quaternion().setFromRotationMatrix(Rm);
    const head = new THREE.Quaternion().setFromEuler(new THREE.Euler(Number(ctx.params.get('hp') ?? -10) * D2R, Number(ctx.params.get('hy') ?? 0) * D2R, 0, 'YXZ'));
    const shipQ = camQ.clone().multiply(head.clone().invert());
    worldCam(ctx, st, C, camQ);
    const B = { F: V(0, 0, -1).applyQuaternion(shipQ) };
    const up = V(0, 1, 0).applyQuaternion(shipQ);
    const R = V(1, 0, 0).applyQuaternion(shipQ);
    const roll = 0;
    const at = (f, r, u) => C.clone().addScaledVector(B.F, f).addScaledVector(R, r).addScaledVector(up, u);
    const heading = B.F.clone();
    const objs = [];
    const place = (cls, fac, pos, dir, upv, opts = {}) => {
      const s = api.create(cls, fac, { throttle: 0.7, ...opts });
      s.group.quaternion.copy(look(dir, upv || up));
      ctx.world.add(s.group, pos);
      objs.push({ pos, rel: fac === 'hegemonia' ? 'friendly' : 'hostile', faction: fac === 'hegemonia' ? 'Hegemonia Solar' : 'Frente Livre', capital: cls === 'carrier' || cls === 'destroyer', name: s.model.toUpperCase() });
      return s;
    };
    // ala da Hegemonia
    place('fighter', 'hegemonia', at(42, 16, -4.5), heading.clone().addScaledVector(R, -0.04), up.clone().applyAxisAngle(heading, 0.1));
    place('fighter', 'hegemonia', at(75, -26, 3.5), heading.clone().addScaledVector(R, 0.03), up.clone().applyAxisAngle(heading, -0.15));
    place('interceptor', 'hegemonia', at(150, 48, 9), heading.clone().addScaledVector(up, -0.05), up);
    // porta-caças ao longe, sobre o planeta
    const car = place('carrier', 'hegemonia', at(2600, -900, -420), heading.clone().addScaledVector(R, 0.55).normalize(), up, { throttle: 0.4 });
    // defensores da colônia vindo de frente
    const enemy = place('fighter', 'frente', at(260, 70, 26), B.F.clone().negate().addScaledVector(R, -0.6).addScaledVector(up, -0.1).normalize(), up.clone().applyAxisAngle(B.F, 0.6), { throttle: 1 });
    place('fighter', 'frente', at(520, -120, 60), B.F.clone().negate().addScaledVector(R, 0.4).normalize(), up, { throttle: 1 });
    // fogo cruzado e uma explosão
    const r = ctx.services.rendering;
    if (r?.particles) {
      for (let i = 0; i < 10; i++) {
        const src = at(60 + i * 30, (i % 2 ? 1 : -1) * (12 + i * 3), -2 + i);
        r.particles.bolt(src, heading.clone().addScaledVector(R, (i % 3 - 1) * 0.02).normalize(), { color: 'gold', length: 16, width: 0.35, brightness: 34 });
      }
      for (let i = 0; i < 6; i++) r.particles.bolt(at(380 + i * 70, -60 + i * 25, 20 + i * 5), B.F.clone().negate().addScaledVector(R, 0.1 * (i - 3)).normalize(), { color: 'red', length: 22, width: 0.6 });
      r.explosion?.(at(700, 160, 90), 26, 'ship');
    }
    // cockpit: dados da cena (a ordem de bombardeio)
    const cp = api.cockpit;
    cp.show(true);
    cp.setData({
      speed: 186, throttle: 0.62, boost: 0, heading: 1.2, pitch: -0.05, roll: -roll, altitude: aur.altitudeOf(C), mode: 'COMBATE',
      shields: { f: 0.92, b: 0.8, l: 0.55, r: 0.95 }, hull: 0.94, heat: 0.38, fuel: 0.86, energy: { shield: 0.5, engine: 0.375, weapons: 0.75 },
      radarRange: 3000, missiles: 4, lock: 1, warnings: ['ORDEM: BOMBARDEAR AURORA'], message: 'COMANDO SOLAR · CANAL 1 — "LANÇA-7, CONFIRME O ATAQUE À COLÔNIA."',
      location: 'HALDEN · ÓRBITA DE AURORA', velLocal: V(0.02, -0.03, -1).normalize(), stick: { x: 0.15, y: -0.2, roll: 0.2, yaw: 0 },
    });
    cp.setGlass({ rain: 0, dust: 0.04, ice: 0, fire: 0 });
    cp.setData({ head });
    feedContacts(cp, C, shipQ, objs, 4);
    cp.redraw(true);
    st.cockpitShot = { shipQ, head };
  });

  // ── 2. pousado em Verídia sob chuva ───────────────────────────────────────
  ctx.shots.register('ships-cockpit-planet-rain', async (ctx) => {
    setup(ctx, 'kessa', 72);
    const b = body(ctx, 'Verídia');
    const pl = ctx.services.planets;
    const cp = api.cockpit;
    cp.show(true);
    let local, upL, fwdL;
    if (pl) {
      const d = pl.dirForSun(b, Number(ctx.params.get('elev') ?? 14), Number(ctx.params.get('az') ?? 40));
      const spot = pl.findLandingSpot(b, d, { maxSlope: 0.08, radius: 4000 }) || { dir: d, normal: d, local: pl.placeOnSurface(b, d, 0) };
      upL = spot.normal.clone().lerp(spot.dir, 0.5).normalize();
      // frente: olhando para o relevo mais alto ao redor
      const ref = Math.abs(upL.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
      const t1 = new THREE.Vector3().crossVectors(upL, ref).normalize();
      let best = t1, bh = -Infinity;
      const sunL = b.dirToLocal(ctx.universe.system.star.pos.clone().sub(b.pos).normalize(), ctx.time.world, new THREE.Vector3());
      for (let a = 0; a < 360; a += 20) {
        const t = t1.clone().applyAxisAngle(upL, a * D2R);
        let h = 0;
        for (const k of [800, 1600, 3000]) { const p = spot.dir.clone().addScaledVector(t, k / b.radius).normalize(); h = Math.max(h, pl.heightAtLocal(b, p)); }
        // evita olhar para o sol (o clarão lava a chuva no vidro): sol de lado/atrás
        const score = h - Math.max(0, t.dot(sunL) + 0.3) * 3000;
        if (score > bh) { bh = score; best = t; }
      }
      fwdL = best;
      local = spot.local.clone().addScaledVector(upL, 2.05);
      pl.weather?.force?.('rain', Number(ctx.params.get('wi') ?? 1));
      // céu fechado de tempestade (cobertura extra de nuvens só para a cena)
      try { const v = pl.view(b); if (v) v.cloudBoost = Number(ctx.params.get('cb') ?? 0.7); } catch { /* sem visão */ }
    } else {
      upL = b.pos.clone().negate().normalize(); fwdL = new THREE.Vector3().crossVectors(upL, V(0, 0, 1)).normalize();
      local = upL.clone().multiplyScalar(b.radius + 30);
    }
    const shipQL = look(fwdL, upL);
    const head = new THREE.Quaternion().setFromEuler(new THREE.Euler(-6 * D2R, 0, 0, 'YXZ'));
    const eyeL = cp.eye.clone().applyQuaternion(shipQL).add(local);
    st.shotCam = (c) => {
      const t = c.time.world;
      b.localToWorld(eyeL, t, c.player.camWorld);
      c.player.pos.copy(c.player.camWorld);
      c.camera.quaternion.copy(b.rotationAt(t, new THREE.Quaternion()).multiply(shipQL).multiply(head));
    };
    st.shotCam(ctx);
    ctx.player.altitude = 2;
    pl?.settle?.();
    cp.setData({
      speed: 0, throttle: 0.05, altitude: 0, mode: 'POUSADO', gear: true, heading: 0.4, pitch: 0, roll: 0,
      shields: { f: 1, b: 1, l: 1, r: 1 }, hull: 0.78, heat: 0.02, fuel: 0.41, energy: { shield: 0.25, engine: 0.25, weapons: 0.0 },
      warnings: [], message: 'VERÍDIA · CHUVA FORTE · TEMP. 17 °C · ATMOSFERA RESPIRÁVEL', location: 'VERÍDIA — SUPERFÍCIE', contacts: [], target: null, radarRange: 2000,
    });
    cp.setGlass({ rain: Number(ctx.params.get('rain') ?? 0.9), dust: 0.05, ice: 0, fire: 0, wind: 0 });
    cp.setData({ head });
    cp.redraw(true);
  });

  // ── 3. todas as classes e facções ─────────────────────────────────────────
  ctx.shots.register('ships-lineup', async (ctx) => {
    const fov = Number(ctx.params.get('fov') ?? 48);
    setup(ctx, 'kessa', fov);
    const ver = body(ctx, 'Verídia');
    const toS = sunDir(ctx, ver.pos);
    // câmera: sol atrás, à esquerda e acima (luz de 3/4 nos cascos); Verídia
    // embaixo como um horizonte curvo iluminado; espaço aberto em cima
    const sunCam = V(Number(ctx.params.get('sx') ?? -0.55), Number(ctx.params.get('sy') ?? 0.5), Number(ctx.params.get('sz') ?? 0.68)).normalize();
    const camQ = camFromDir(toS, sunCam, V(0, 1, 0));
    const cv = (x, y, z) => V(x, y, z).applyQuaternion(camQ);
    const toP = cv(Number(ctx.params.get('px') ?? 0.1), Number(ctx.params.get('py') ?? -0.62), -0.8).normalize();
    const C = ver.pos.clone().addScaledVector(toP, -ver.radius * Number(ctx.params.get('dr') ?? 2.1));
    worldCam(ctx, st, C, camQ);
    const factions = ['hegemonia', 'frente', 'corsarios', 'guilda', 'vigilantes'];
    // fileiras: mais perto embaixo (caças) → mais longe em cima (fragatas);
    // cada nave ocupa ~o mesmo ângulo na tela (distância ∝ comprimento)
    const rows = [['fighter', -15], ['interceptor', -7], ['explorer', 1], ['freighter', 8.5], ['frigate', 15.5]];
    const span = Number(ctx.params.get('span') ?? 9.5) * D2R;
    const nose = cv(-0.72, -0.08, 0.69).normalize();
    const upS = cv(0, 1, 0);
    rows.forEach(([cls, el], r) => {
      factions.forEach((fac, i) => {
        const s = api.create(cls, fac, { throttle: 0.3, gear: 0 });
        const dist = s.length / Math.tan(span);
        const az = ((i - 2) * 11.5 + (r % 2 ? 2 : -2)) * D2R;
        const dir = cv(Math.sin(az) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az) * Math.cos(el * D2R)).normalize();
        s.group.quaternion.copy(look(nose, upS.clone().applyAxisAngle(nose, (i - 2) * 0.04)));
        ctx.world.add(s.group, C.clone().addScaledVector(dir, dist));
      });
    });
    ctx.services.rendering?.sun?.setShadowRange?.(Number(ctx.params.get('sr') ?? 1500));
  });

  // ── 4. naves capitais ─────────────────────────────────────────────────────
  // Destróier da Hegemonia vindo em 3/4 de proa, iluminado pelo sol de trás da
  // câmera (luz rasante nos terraços), Aurora embaixo, porta-caças ao fundo
  // lançando caças pelo hangar lateral.
  ctx.shots.register('ships-capital', async (ctx) => {
    setup(ctx, 'halden', Number(ctx.params.get('fov') ?? 55));
    const aur = body(ctx, 'Aurora');
    const toS = sunDir(ctx, aur.pos);
    // orientação da câmera: o sol em (esq., cima, atrás) no referencial dela
    const sunCam = V(Number(ctx.params.get('sx') ?? -0.95), Number(ctx.params.get('sy') ?? 0.16), Number(ctx.params.get('sz') ?? -0.2)).normalize();
    const camQ = camFromDir(toS, sunCam, V(0, 1, 0));
    const F = V(0, 0, -1).applyQuaternion(camQ), U = V(0, 1, 0).applyQuaternion(camQ), R = V(1, 0, 0).applyQuaternion(camQ);
    const cv = (x, y, z) => V(x, y, z).applyQuaternion(camQ);
    // planeta à frente e abaixo
    const alpha = Number(ctx.params.get('alpha') ?? 30) * D2R;
    const toP = cv(Number(ctx.params.get('px') ?? 0.5), Number(ctx.params.get('py') ?? -0.5), -0.72).normalize();
    const C = aur.pos.clone().addScaledVector(toP, -aur.radius / Math.sin(alpha));
    worldCam(ctx, st, C, camQ);
    // destróier
    const dd = Number(ctx.params.get('dd') ?? 400);
    const dPos = C.clone().addScaledVector(F, dd).addScaledVector(U, -Number(ctx.params.get('dh') ?? 85)).addScaledVector(R, -30);
    const nose = cv(0.5, -0.1, 0.86).normalize();
    const des = api.create('destroyer', 'hegemonia', { throttle: 0.5 });
    des.group.quaternion.copy(look(nose, U.clone().applyAxisAngle(nose, 0.12)));
    ctx.world.add(des.group, dPos);
    for (const t of des.turrets) t.aimLocal(V(0.5, 0.35, -1).normalize());
    // porta-caças ao fundo, à direita
    const cPos = C.clone().addScaledVector(F, Number(ctx.params.get('cf') ?? 1600)).addScaledVector(R, Number(ctx.params.get('cr') ?? 900)).addScaledVector(U, 90);
    const cNose = cv(-0.35, 0.02, 0.94).normalize();
    const car = api.create('carrier', 'hegemonia', { throttle: 0.4 });
    car.group.quaternion.copy(look(cNose, U));
    ctx.world.add(car.group, cPos);
    const objs = [];
    const hg = car.hangars.find((h) => h.id === 'hangar_e') || car.hangars[0];
    if (hg) {
      const cq = car.group.quaternion;
      const hp = hg.pos.clone().applyQuaternion(cq).add(cPos);
      const hd = hg.dir.clone().applyQuaternion(cq);
      for (let i = 0; i < 5; i++) {
        const f = api.create('fighter', 'hegemonia', { throttle: 1 });
        const p = hp.clone().addScaledVector(hd, 60 + i * 85).addScaledVector(cNose, -i * 40).addScaledVector(U, i * 9);
        const dir = hd.clone().addScaledVector(cNose, -0.4 - i * 0.15).normalize();
        f.group.quaternion.copy(look(dir, U));
        ctx.world.add(f.group, p);
      }
    }
    // escolta em primeiro plano
    const e1 = api.create('interceptor', 'hegemonia', { throttle: 0.9 });
    const eDir = cv(0.55, 0.05, -0.83).normalize();
    e1.group.quaternion.copy(look(eDir, U.clone().applyAxisAngle(eDir, -0.35)));
    ctx.world.add(e1.group, C.clone().addScaledVector(F, 62).addScaledVector(R, -21).addScaledVector(U, -7));
    const e2 = api.create('fighter', 'hegemonia', { throttle: 0.9 });
    e2.group.quaternion.copy(look(eDir, U.clone().applyAxisAngle(eDir, -0.2)));
    ctx.world.add(e2.group, C.clone().addScaledVector(F, 135).addScaledVector(R, -48).addScaledVector(U, 4));
    if (ctx.params.get('sr')) ctx.services.rendering?.sun?.setShadowRange?.(Number(ctx.params.get('sr')));
  });

  // ── auxiliar: close de uma nave (?cls=&fac=&yaw=&pitch=&dist=) ─────────
  ctx.shots.register('ships-closeup', async (ctx) => {
    setup(ctx, 'kessa', 40);
    const ver = body(ctx, 'Verídia');
    const toSun = sunDir(ctx, ver.pos);
    const C = ver.pos.clone().addScaledVector(toSun, ver.radius * 3);
    const cls = ctx.params.get('cls') || 'fighter', fac = ctx.params.get('fac') || 'hegemonia';
    const s = api.create(cls, fac, { throttle: Number(ctx.params.get('thr') ?? 0.5), gear: Number(ctx.params.get('gear') ?? 0) });
    // nave com o nariz perpendicular ao sol; câmera em 3/4
    const perp = new THREE.Vector3().crossVectors(toSun, V(0, 1, 0)).normalize();
    const up0 = new THREE.Vector3().crossVectors(perp, toSun).normalize();
    // sol por cima e de lado (luz de 3/4, não rasante)
    const up = up0.clone().applyAxisAngle(perp, -Number(ctx.params.get('sunup') ?? 50) * D2R);
    s.group.quaternion.copy(look(perp, up));
    ctx.world.add(s.group, C);
    const yaw = Number(ctx.params.get('yaw') ?? 140) * D2R, pit = Number(ctx.params.get('pitch') ?? 22) * D2R;
    const dist = Number(ctx.params.get('dist') ?? 1.9) * s.length;
    const dir = perp.clone().applyAxisAngle(up, yaw);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    dir.applyAxisAngle(side, pit);
    const cam = C.clone().addScaledVector(dir, dist);
    worldCam(ctx, st, cam, look(C.clone().sub(cam).normalize(), up));
    if (ctx.params.get('sr')) ctx.services.rendering?.sun?.setShadowRange?.(Number(ctx.params.get('sr')));
  });

  // ── 5. interior do cargueiro ──────────────────────────────────────────────
  ctx.shots.register('ships-interior-walk', async (ctx) => {
    setup(ctx, 'kessa', 74);
    const ver = body(ctx, 'Verídia');
    const C = ver.pos.clone().addScaledVector(sunDir(ctx, ver.pos), ver.radius * 4).addScaledVector(V(0, 1, 0), 9000);
    const ship = api.create(ctx.params.get('cls') || 'freighter', ctx.params.get('fac') || 'frente', { throttle: 0.2, gear: 0 });
    const q = new THREE.Quaternion();
    ship.group.quaternion.copy(q);
    ctx.world.add(ship.group, C);
    const frame = { pos: C.clone(), quat: q.clone() };
    const inter = api.attachInterior(ship, frame);
    const dbg = ctx.params.get('dbgint');
    if (dbg === '1') inter.material.userData.U.realLight.value = 0;
    if (dbg === '3') { inter.material.userData.U.realLight.value = 0; inter.group.traverse((o) => { if (o.isMesh && o.material.blending === THREE.AdditiveBlending) o.visible = false; }); }
    if (dbg === '4') inter.group.traverse((o) => { if (o.isMesh && o.material.blending === THREE.AdditiveBlending) o.visible = false; });
    if (dbg === '5') { inter.lamps.forEach((l) => l.color.setRGB(1, 1, 1)); inter.material.lightsNode = null; }
    if (dbg === '6') { inter.material.envNode = null; ctx.scene.environment = null; }
    if (dbg === '7') { inter.material.userData.U.envCol.value.setRGB(0, 0, 0); }
    if (dbg === '8') { const sm = new THREE.MeshStandardNodeMaterial({ color: 0x808080, roughness: 0.5 }); inter.group.children[0].material = sm; }
    if (dbg === '9') { inter.material.emissiveNode = null; inter.material.needsUpdate = true; }
    if (dbg === '10') inter.group.children[2].visible = false;
    if (dbg === '11') { inter.group.children.forEach((c, i) => { if (i > 0) c.visible = false; }); ctx.scene.traverse((o) => { if (o.isMesh && !inter.group.children.includes(o) && o.name !== 'cockpit') o.visible = false; }); }
    if (dbg === '2' || dbg === '3') { inter.material.userData.U.rowCol.value.setRGB(0, 0, 0); inter.material.userData.U.fillAmb.value.setRGB(0, 0, 0); inter.material.userData.U.lamps.array.forEach((l) => l.set(0, 0, 0, 0)); }
    ctx.services.rendering?.sun?.setShadowRange?.(80);
    const eye = V(Number(ctx.params.get('ix') ?? -0.75), inter.floorY + 1.66, Number(ctx.params.get('iz') ?? 1.2));
    const dir = V(Number(ctx.params.get('dx') ?? 0.16), Number(ctx.params.get('dy') ?? -0.1), Number(ctx.params.get('dz') ?? 1)).normalize();
    worldCam(ctx, st, C.clone().add(eye), look(dir, V(0, 1, 0)));
  });
}
