// Presets de screenshot da HUD (jogo real rodando, HUD por cima):
//   hud-flight-combat   cockpit sobre Verídia, corsários atacando um cargueiro,
//                       alvo travado com antecipação, míssil chegando, rádio
//   hud-foot            a pé em Verídia ao entardecer, nave pousada ao lado,
//                       traje/bússola/munição/scanner/prompt
//   hud-system-map      mapa do sistema Kessa com rota quântica até Ashar
//   hud-galaxy-map      mapa galáctico com alcance do salto e rota multi-salto
//   hud-touch-ipad      iPad (toque): câmera externa em voo atmosférico com a
//                       HUD completa (horizonte, altitude) e controles virtuais
//   hud-menu            menu de pausa com status/reputação sobre o cockpit
//   hud-settings / hud-panel  (conferência) configurações / painel de missões
import * as THREE from 'three/webgpu';

const D2R = Math.PI / 180;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const P = (ctx, k, d) => { const v = ctx.params.get(k); return v === null ? d : Number(v); };
const _m = new THREE.Matrix4();
function look(fwd, up) { _m.lookAt(V(), fwd, up); return new THREE.Quaternion().setFromRotationMatrix(_m); }
function body(ctx, name) { return ctx.universe.system.bodies.find((b) => b.name === name) || ctx.universe.system.bodies[0]; }

/** Referencial em órbita: posição a alt raios, ponto abaixo a `phase` graus do subsolar. */
function orbitFrame(ctx, b, { alt = 0.35, phase = 60, hdg = 90 } = {}) {
  const sunW = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
  const dir = sunW.clone().applyAxisAngle(V(0, 1, 0), phase * D2R).normalize();
  const pos = b.pos.clone().addScaledVector(dir, b.radius * (1 + alt));
  const U = dir.clone();
  const sunT = sunW.clone().addScaledVector(U, -sunW.dot(U)).normalize();
  const side = new THREE.Vector3().crossVectors(U, sunT).normalize();
  const F = sunT.clone().multiplyScalar(Math.cos(hdg * D2R)).addScaledVector(side, Math.sin(hdg * D2R)).normalize();
  const R = new THREE.Vector3().crossVectors(F, U).normalize();
  return { pos, F, U, R };
}

function prep(ctx, sys) {
  if (ctx.universe.systemId !== sys) ctx.universe.setSystem(sys);
}

/** Nave do jogador no espaço (mundo), modo nave, cockpit. */
function spawnShip(ctx, pos, q, vel, opts = {}) {
  const f = ctx.services.flight;
  if (f?.spawnPlayerShip) {
    try { f.spawnPlayerShip(pos, q, 'fighter', { faction: 'hegemonia', vel, throttle: opts.throttle ?? 0.55, ...opts }); } catch (e) { ctx.errors.push('hud shot spawn: ' + (e.stack || e)); }
    if (opts.third !== undefined) try { f.setCamera?.(opts.third ? 'chase' : 'cockpit'); } catch { /* */ }
  } else {
    ctx.player.camWorld.copy(pos); ctx.camera.quaternion.copy(q);
  }
  if (ctx.game.mode !== 'ship') ctx.game.setMode('ship');
}

function story(ctx, H, o = {}) {
  const bus = ctx.bus;
  if (o.objective) bus.emit('objective', o.objective);
  if (o.radio) H.comms.radio(o.radio);
  for (const n of o.notes || []) H.comms.notify(n[0], n[1], { sub: n[2] });
}

/** Deixa a captura estável: tempo do rádio/notificações sem expirar. */
function hold(H, fn) { H.shotHook = fn; }

export function registerShots(ctx, H, api) {
  // ── combate no cockpit ──────────────────────────────────────────────────
  ctx.shots.register('hud-flight-combat', async (ctx) => {
    prep(ctx, 'kessa');
    const ver = body(ctx, 'Verídia');
    const fr = orbitFrame(ctx, ver, { alt: P(ctx, 'alt', 2.2), phase: P(ctx, 'phase', 58), hdg: P(ctx, 'hdg', 70) });
    // nariz ligeiramente para baixo: o planeta ocupa a parte de baixo do vidro
    const pitch = P(ctx, 'pitch', -61) * D2R;
    const fwd = fr.F.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(fr.U, Math.sin(pitch)).normalize();
    const up = fr.U.clone().addScaledVector(fwd, -fr.U.dot(fwd)).normalize();
    const q = look(fwd, up).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), P(ctx, 'roll', 8) * D2R));
    spawnShip(ctx, fr.pos, q, fwd.clone().multiplyScalar(160), { throttle: 0.62, third: false });
    const R = new THREE.Vector3(1, 0, 0).applyQuaternion(q), Uq = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const cb = ctx.services.combat;
    if (cb?.spawn) {
      try {
        cb.setHostile('player', 'corsarios', true);
        const at = (f, r, u) => fr.pos.clone().addScaledVector(fwd, f).addScaledVector(R, r).addScaledVector(Uq, u);
        const fly = (d) => look(d, Uq);
        const e1 = cb.spawn('corsarios', 'fighter', at(P(ctx, 'tf', 210), P(ctx, 'tr', 46), P(ctx, 'tu', 12)), { quat: fly(R.clone().multiplyScalar(-1).addScaledVector(fwd, 0.3).normalize()), vel: R.clone().multiplyScalar(-150).addScaledVector(fwd, 120), ai: false, callsign: 'GARRA-3', force: true });
        const e2 = cb.spawn('corsarios', 'interceptor', at(900, -260, 80), { quat: fly(fwd.clone().negate()), vel: fwd.clone().multiplyScalar(-140), ai: false, force: true });
        const e3 = cb.spawn('corsarios', 'fighter', at(1500, 380, -60), { quat: fly(R), vel: R.clone().multiplyScalar(120), ai: false, force: true });
        const fz = cb.spawn('guilda', 'freighter', at(2600, 520, -180), { quat: fly(R.clone().negate()), vel: R.clone().multiplyScalar(-40), ai: false, name: 'Cargueiro Tessaly', force: true });
        const al = cb.spawn('frente', 'fighter', at(260, -150, -40), { quat: fly(fwd), vel: fwd.clone().multiplyScalar(165), ai: false, callsign: 'FAÍSCA-2', force: true });
        void fz; void al; void e3;
        if (e1) { e1.hull = e1.hullMax * 0.62; e1.shield = e1.shieldMax * 0.18; }
        cb.playerTarget = e1 || null;
        // míssil vindo de trás
        const sim = cb.sim;
        if (sim && e2) {
          const mp = fr.pos.clone().addScaledVector(fwd, -P(ctx, 'md', 950)).addScaledVector(R, -420).addScaledVector(Uq, 60);
          const md = fr.pos.clone().sub(mp).normalize();
          if (sim.missiles?.launch) sim.missiles.launch(e2, sim.player, 'ir', { pos: mp, dir: md });
          else cb.missile(e2, sim.player, 'ir');
        }
      } catch (e) { ctx.errors.push('hud shot combat: ' + (e.stack || e)); }
    }
    try { ctx.services.flight?.setTarget?.(ctx.universe.system.station('kessa:st0') || ctx.universe.system.stations[0]); } catch { /* */ }
    story(ctx, H, {
      objective: { id: 'shot', mission: 'Fogo Cruzado', text: 'Proteja o cargueiro da Guilda — abata os **corsários**', progress: 0.34, pos: ctx.universe.system.stations[0]?.pos },
      radio: { faction: 'frente', speaker: 'IARA VOSS', text: 'Paoli, o cargueiro está perdendo os escudos! Tire esse corsário da cauda dele — *agora*.', priority: 3 },
      notes: [['ALVO TRAVADO — GARRA-3', 'info'], ['+250 CRÉDITOS', 'reward', 'Abate confirmado']],
    });
    hold(H, () => {});
    ctx.services.planets?.settle?.();
  });

  // ── a pé em Verídia ─────────────────────────────────────────────────────
  ctx.shots.register('hud-foot', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, ctx.params.get('body') || 'Verídia');
    const pl = ctx.services.planets;
    const t = ctx.time.world;
    let dir = pl?.dirForSun ? pl.dirForSun(b, P(ctx, 'elev', 13), P(ctx, 'az', 40), t) : V(0, 1, 0);
    const spot = pl?.findLandingSpot?.(b, dir, { maxSlope: 0.06, radius: 5000 });
    if (spot) dir = spot.dir;
    const h = pl?.heightAtLocal ? Math.max(0, pl.heightAtLocal(b, dir)) : 0;
    const sw = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
    const sunL = b.dirToLocal(sw, t, V());
    const sunT = sunL.clone().addScaledVector(dir, -sunL.dot(dir)).normalize();
    const lookDir = sunT.clone().applyAxisAngle(dir, P(ctx, 'yaw', 38) * D2R).addScaledVector(dir, P(ctx, 'lp', -0.05)).normalize();
    const eye = dir.clone().multiplyScalar(b.radius + h + 1.75);
    // nave pousada à direita
    const side = new THREE.Vector3().crossVectors(lookDir, dir).normalize();
    const shipDir = dir.clone().addScaledVector(lookDir, 26 / b.radius).addScaledVector(side, 15 / b.radius).normalize();
    const f = ctx.services.flight;
    if (f?.spawnPlayerShip && pl?.placeOnSurface) {
      try {
        const sp = pl.placeOnSurface(b, shipDir, 0);
        const sh = pl.findLandingSpot?.(b, shipDir, { maxSlope: 0.1, radius: 80, samples: 40 });
        const lp = sh ? sh.local.clone() : sp;
        const sfwd = side.clone().multiplyScalar(-0.6).addScaledVector(lookDir, -0.8).normalize();
        f.spawnPlayerShip(lp, look(sfwd, shipDir), 'fighter', { body: b, landed: true, gear: true, enter: false, faction: 'hegemonia' });
      } catch (e) { ctx.errors.push('hud shot foot ship: ' + (e.stack || e)); }
    }
    ctx.game.setMode('foot');
    ctx.camera.fov = P(ctx, 'fov', 70); ctx.camera.updateProjectionMatrix();
    const qL = look(lookDir, dir);
    const camHold = () => {
      const tt = ctx.time.world;
      b.localToWorld(eye, tt, ctx.player.camWorld);
      ctx.player.pos.copy(ctx.player.camWorld);
      ctx.camera.quaternion.copy(b.rotationAt(tt, new THREE.Quaternion()).multiply(qL));
    };
    camHold();
    hold(H, camHold);
    // marcadores
    const ruinL = dir.clone().addScaledVector(lookDir, 900 / b.radius).addScaledVector(side, -420 / b.radius).normalize().multiplyScalar(b.radius + h + 30);
    api.marker('shot-ruin', (out) => b.localToWorld(ruinL, ctx.time.world, out), { kind: 'poi', label: 'Ruína dos Arquitetos', modes: ['foot'], offscreen: true, color: '#8cc4ff' });
    const shipL = pl?.placeOnSurface ? pl.placeOnSurface(b, shipDir, 2) : eye.clone();
    api.marker('shot-ship', (out) => b.localToWorld(shipL, ctx.time.world, out), { kind: 'ship', label: 'Lança A-7', modes: ['foot'] });
    const objL = dir.clone().addScaledVector(lookDir, 2400 / b.radius).addScaledVector(side, 600 / b.radius).normalize().multiplyScalar(b.radius + h + 10);
    story(ctx, H, {
      objective: { id: 'shot', mission: 'Ecos sob a Selva', text: 'Siga o sinal dos **Arquitetos** até a ruína ao norte', progress: 0.5, pos: b.localToWorld(objL, ctx.time.world, V()) },
      radio: { faction: 'guilda', speaker: 'OREN SAAL', text: 'A leitura que você mandou bate com o mapa antigo. Tem algo enterrado aí — e não é da Guilda.', priority: 2 },
      notes: [['DESCOBERTA — PASTADOR-DE-VÉU', 'disc', 'Fauna catalogada · 1.200 ¢']],
    });
    api.setFoot({ weapon: 'rifle', ammo: 21, mag: 32, reserve: 128, health: 0.84, o2: 0.76, energy: 0.68, jetpack: 0.62, grenades: 3, tool: 'scanner', spread: 0.12 });
    api.prompt('Escanear', { id: 'shot', action: 'interact', sub: 'Planta desconhecida · 6 m', hold: 0.35 });
    api.scanPulse();
    H.foot.scan.t = 0.55;
    try { pl?.weather?.force?.('rain', 0); } catch { /* */ }
    pl?.settle?.();
  });

  // ── mapas ───────────────────────────────────────────────────────────────
  const mapScene = (ctx) => {
    prep(ctx, 'kessa');
    const ver = body(ctx, 'Verídia');
    const fr = orbitFrame(ctx, ver, { alt: 2.5, phase: 40, hdg: 120 });
    spawnShip(ctx, fr.pos, look(fr.F, fr.U), fr.F.clone().multiplyScalar(120), { third: false });
  };
  ctx.shots.register('hud-system-map', async (ctx) => {
    mapScene(ctx);
    const ash = body(ctx, 'Ashar');
    try { ctx.services.flight?.setTarget?.(ash); } catch { /* */ }
    story(ctx, H, { objective: { id: 'shot', mission: 'Areia e Ferro', text: 'Encontre o comprador de Oren em **Ashar**', bodyId: ash.id, pos: ash.pos } });
    api.openMap('system');
    H.maps.sys.sel = ash;
    H.maps.sys.yaw = P(ctx, 'yaw', -0.35); H.maps.sys.pitch = P(ctx, 'pitch', 0.92);
    H.maps.sys.zoom = H.maps.sys.tz = P(ctx, 'zoom', 1.15);
    H.maps.dirtyInfo = true;
  });
  ctx.shots.register('hud-galaxy-map', async (ctx) => {
    mapScene(ctx);
    api.openMap('galaxy');
    const gx = ctx.universe.galaxy;
    const cur = gx.entry('kessa');
    // destino a ~3 saltos, dentro da Fenda
    const cands = gx.systems.filter((s) => s.region === 'Fenda de Órion' && s.id !== 'kessa').map((s) => [Math.hypot(s.pos.x - cur.pos.x, s.pos.z - cur.pos.z), s]).filter(([d]) => d > 110 && d < 170).sort((a, b) => a[0] - b[0]);
    const dst = cands[0]?.[1];
    if (dst) { H.maps.gal.sel = H.maps.galById.get(dst.id); H.maps.computeRoute(); }
    H.maps.gal.yaw = P(ctx, 'yaw', 0.5); H.maps.gal.pitch = P(ctx, 'pitch', 0.82);
    H.maps.gal.dist = H.maps.gal.tdist = P(ctx, 'dist', 330);
    H.maps.dirtyInfo = true;
  });

  // ── iPad: voo atmosférico com câmera externa e toque ────────────────────
  ctx.shots.register('hud-touch-ipad', async (ctx) => {
    prep(ctx, 'kessa');
    const b = body(ctx, 'Verídia');
    const pl = ctx.services.planets;
    const t = ctx.time.world;
    const up = pl?.dirForSun ? pl.dirForSun(b, P(ctx, 'elev', 26), P(ctx, 'az', 70), t) : V(0, 1, 0);
    const sunL = b.dirToLocal(ctx.universe.system.star.pos.clone().sub(b.pos).normalize(), t, V());
    const sunT = sunL.clone().addScaledVector(up, -sunL.dot(up)).normalize();
    const side = new THREE.Vector3().crossVectors(up, sunT).normalize();
    const hdg = P(ctx, 'hdg', 200) * D2R;
    const fwd = sunT.clone().multiplyScalar(Math.cos(hdg)).addScaledVector(side, Math.sin(hdg)).normalize();
    const pitch = P(ctx, 'pitch', -6) * D2R;
    const f2 = fwd.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(up, Math.sin(pitch)).normalize();
    const alt = P(ctx, 'alt', 2400);
    const pos = up.clone().multiplyScalar(b.radius + alt);
    const q = look(f2, up).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -P(ctx, 'roll', 14) * D2R));
    const f = ctx.services.flight;
    if (f?.spawnPlayerShip) {
      try {
        f.spawnPlayerShip(pos, q, 'fighter', { body: b, vel: f2.clone().multiplyScalar(P(ctx, 'spd', 310)), throttle: 0.7, faction: 'hegemonia' });
        f.setCamera?.('chase');
        const cam = f.camera;
        if (cam?.orbit) { cam.orbit.yaw = P(ctx, 'oy', 12) * D2R; cam.orbit.pitch = P(ctx, 'op', -9) * D2R; }
      } catch (e) { ctx.errors.push('hud shot ipad: ' + (e.stack || e)); }
    } else { ctx.player.camWorld.copy(b.localToWorld(pos, t, V())); }
    if (ctx.game.mode !== 'ship') ctx.game.setMode('ship');
    ctx.input.device = 'touch';
    H.forceTouch = true;
    story(ctx, H, {
      objective: { id: 'shot', mission: 'Primeiro Contato', text: 'Pouse na **Estação Meridiana** — peça autorização ao controle', progress: null, pos: ctx.universe.system.stations[0]?.pos },
      radio: { faction: 'guilda', speaker: 'CONTROLE MERIDIANA', text: 'Lança A-7, contato no radar. Mantenha o vetor e aguarde liberação da baia 4.', priority: 2 },
    });
    // os joysticks aparecem "em uso" (o frame do touch recoloca a cada quadro)
    let demoT = 0;
    hold(H, (dt) => { demoT += dt; if (demoT > 0.05) H.touch.demo(); });
    pl?.settle?.();
  });

  // ── menus ───────────────────────────────────────────────────────────────
  const menuScene = (ctx) => {
    prep(ctx, 'kessa');
    const ver = body(ctx, 'Verídia');
    const fr = orbitFrame(ctx, ver, { alt: 0.45, phase: 66, hdg: 80 });
    const pitch = -18 * D2R;
    const fwd = fr.F.clone().multiplyScalar(Math.cos(pitch)).addScaledVector(fr.U, Math.sin(pitch)).normalize();
    spawnShip(ctx, fr.pos, look(fwd, fr.U), fwd.clone().multiplyScalar(100), { third: false });
    ctx.bus.emit('credits:change', { value: 48250, delta: 0 });
  };
  ctx.shots.register('hud-menu', async (ctx) => {
    menuScene(ctx);
    story(ctx, H, { objective: { id: 'shot', mission: 'Areia e Ferro', text: 'Encontre o comprador de Oren em **Ashar**' } });
    H.menus.openPause();
    H.menus.sel = 1; H.menus.renderPause();
  });
  ctx.shots.register('hud-settings', async (ctx) => {
    menuScene(ctx);
    H.menus.openPause();
    H.menus.openSettings(P(ctx, 'tab', 0));
  });
  ctx.shots.register('hud-panel', async (ctx) => {
    menuScene(ctx);
    H.discoveries = [
      { id: 'f1', kind: 'fauna', name: 'Pastador-de-véu', bodyName: 'Verídia' }, { id: 'f2', kind: 'flora', name: 'Lírio-farol', bodyName: 'Verídia' },
      { id: 'f3', kind: 'mineral', name: 'Quartzo de Ashar', bodyName: 'Ashar' }, { id: 'f4', kind: 'ruin', name: 'Portal do Eco', bodyName: 'Ossário' },
    ];
    api.openPanel(ctx.params.get('panel') || 'catalog');
  });
}
