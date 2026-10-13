// Presets de screenshot do sistema `stations`.
//
//   stations-meridiana-exterior  a megaestrutura da Guilda sobre Verídia, anel
//                                girando, tráfego entrando nos hangares
//   stations-docking-approach    caça do Rafael no corredor holográfico rumo ao
//                                hangar 03, controle de tráfego no rádio
//   stations-hangar              dentro do hangar: nave na plataforma, mecânicos,
//                                campo de contenção e Verídia lá fora
//   stations-interior-bar        bar "O Último Salto": balcão iluminado, néon,
//                                frequentadores e a janela para o anel
//   stations-ruins               ruínas dos Arquitetos em Verídia (portal,
//                                monólitos, quebra-cabeça de luz)
//   stations-outpost             posto avançado em Ashar ao entardecer
import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const P = (ctx, k, d) => { const v = ctx.params.get(k); return v === null ? d : Number(v); };

function setup(ctx, sysId, fov = 60) {
  if (ctx.universe.systemId !== sysId) ctx.universe.setSystem(sysId);
  ctx.game.setMode('cinematic');
  ctx.camera.fov = fov; ctx.camera.updateProjectionMatrix();
}
function look(dir, up) { _m.lookAt(V(0, 0, 0), dir, up); return new THREE.Quaternion().setFromRotationMatrix(_m); }

/** Câmera aplicada antes de cada render (vence qualquer outro sistema). */
function install(ctx, S, apply) {
  S.shotCam = apply;
  apply(ctx);
  if (!S.renderWrapped) {
    S.renderWrapped = true;
    const orig = ctx.render;
    ctx.render = (c, dt) => { if (S.shotCam) { S.shotCam(c); c.world.sync(); } return (S.renderOverride || orig)(c, dt); };
    // se o rendering trocar o render depois, ainda queremos a câmera fixa
    S.origRender = orig;
  }
}
/** Câmera em coordenadas locais da estação (pos, alvo, cima). */
function stationCam(ctx, S, view, posL, targetL, upL = V(0, 1, 0)) {
  const pos = view.toWorld(posL, new THREE.Vector3());
  const tgt = view.toWorld(targetL, new THREE.Vector3());
  const up = view.dirToWorld(upL, new THREE.Vector3());
  const q = look(tgt.clone().sub(pos).normalize(), up);
  install(ctx, S, (c) => { c.player.camWorld.copy(pos); c.player.pos.copy(pos); c.camera.quaternion.copy(q); });
  return { pos, q };
}

export function registerShots(ctx, api, S) {
  // ── 1. exterior da Meridiana ───────────────────────────────────────────
  ctx.shots.register('stations-meridiana-exterior', async (ctx) => {
    setup(ctx, 'kessa', P(ctx, 'fov', 50));
    const view = api.viewOf('kessa:st0');
    view.build();
    // câmera do lado da boca do hangar 03 (+Z), acima do disco: Verídia iluminada à direita
    const posL = V(P(ctx, 'cx', -420), P(ctx, 'cy', 560), P(ctx, 'cz', 1250));
    const tgtL = V(P(ctx, 'tx', 120), P(ctx, 'ty', 40), P(ctx, 'tz', 0));
    const { pos, q } = stationCam(ctx, S, view, posL, tgtL, V(P(ctx, 'ux', 0.08), 1, 0).normalize());
    const tgt = view.toWorld(tgtL, new THREE.Vector3());
    const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    // cargueiro da Guilda passando perto da câmera (escala)
    try {
      const fr = ctx.services.ships?.create?.('freighter', 'guilda', { id: 'shot-cargueiro', seed: 33, throttle: 0.7 });
      if (fr) {
        const camF = tgt.clone().sub(pos).normalize();
        const right = new THREE.Vector3().crossVectors(camF, camUp).normalize();
        const fp = pos.clone().addScaledVector(camF, P(ctx, 'fd', 170)).addScaledVector(right, P(ctx, 'fr', -62)).addScaledVector(camUp, P(ctx, 'fu', -30));
        ctx.world.add(fr.group, fp);
        fr.group.quaternion.copy(look(view.frame.pos.clone().sub(fp).normalize().addScaledVector(right, 0.5).normalize(), camUp));
        fr.setLights?.(true); fr.setThrottle?.(0.7);
      }
    } catch { /* sem naves */ }
    ctx.time.world = P(ctx, 't', ctx.time.world);
    ctx.services.rendering?.cut?.();
  });

  // ── 2. aproximação guiada ──────────────────────────────────────────────
  ctx.shots.register('stations-docking-approach', async (ctx) => {
    setup(ctx, 'kessa', P(ctx, 'fov', 62));
    const view = api.viewOf('kessa:st0');
    view.build();
    const bay = view.bays[0];
    // nave do jogador no corredor, ~600 m da boca
    const sAlong = P(ctx, 'along', 520);
    const mouth = bay.path[3];
    const shipL = mouth.clone().addScaledVector(bay.out, sAlong).addScaledVector(bay.up, P(ctx, 'sy', 4));
    const shipW = view.toWorld(shipL, new THREE.Vector3());
    ctx.player.pos.copy(shipW);
    const ships = ctx.services.ships;
    let inst = null;
    try { inst = ships?.create?.('fighter', 'hegemonia', { id: 'shot-player', seed: 7, throttle: 0.35, gear: 0, shadows: true }); } catch { inst = null; }
    if (inst) {
      const p = shipW.clone();
      ctx.world.add(inst.group, p);
      const fwdW = view.dirToWorld(bay.fwd, new THREE.Vector3());
      const upW = view.dirToWorld(bay.up, new THREE.Vector3());
      inst.group.quaternion.copy(look(fwdW, upW)).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, 0.0, P(ctx, 'roll', -0.12))));
      inst.setLights?.(true); inst.setThrottle?.(0.35);
    }
    S.docking.grant(view, { silent: true });
    S.docking.s = S.docking.total * 0.5;
    // câmera de perseguição: atrás e acima da nave, olhando para a boca
    const camL = shipL.clone().addScaledVector(bay.out, P(ctx, 'back', 26)).addScaledVector(bay.up, P(ctx, 'up', 4)).addScaledVector(new THREE.Vector3().crossVectors(bay.up, bay.out), P(ctx, 'side', 9));
    const tgtL = shipL.clone().lerp(mouth, P(ctx, 'tlerp', 0.25)).addScaledVector(bay.up, P(ctx, 'tgy', -12));
    stationCam(ctx, S, view, camL, tgtL);
    ctx.bus.emit('radio', { faction: 'guilda', speaker: 'CONTROLE MERIDIANA', text: 'Autorização concedida, piloto. Siga para o hangar 03 pelo corredor iluminado. Velocidade máxima no corredor: oitenta metros por segundo.', priority: 2 });
    ctx.services.rendering?.cut?.();
  });

  // ── 3. hangar ──────────────────────────────────────────────────────────
  ctx.shots.register('stations-hangar', async (ctx) => {
    setup(ctx, 'kessa', P(ctx, 'fov', 70));
    const view = api.viewOf('kessa:st0');
    view.build();
    const it = api.interiorOf('kessa:st0');
    it.build();
    parkShip(ctx, view, it);
    const cam = V(P(ctx, 'cx', 13), P(ctx, 'cy', 1.7), P(ctx, 'cz', 113));
    const tgt = V(P(ctx, 'tx', -4), P(ctx, 'ty', 6.5), P(ctx, 'tz', 66));
    deckCam(ctx, S, it, cam, tgt);
    ctx.services.rendering?.cut?.();
  });

  // ── 4. bar ─────────────────────────────────────────────────────────────
  ctx.shots.register('stations-interior-bar', async (ctx) => {
    setup(ctx, 'kessa', P(ctx, 'fov', 60));
    const view = api.viewOf('kessa:st0');
    view.build();
    const it = api.interiorOf('kessa:st0');
    it.build();
    const cam = V(P(ctx, 'cx', 48.7), P(ctx, 'cy', 1.62), P(ctx, 'cz', 74.9));
    const tgt = V(P(ctx, 'tx', 69), P(ctx, 'ty', 1.35), P(ctx, 'tz', 52.5));
    deckCam(ctx, S, it, cam, tgt);
    ctx.services.rendering?.cut?.();
  });

  // ── 5. ruínas dos Arquitetos (Verídia, crepúsculo) ─────────────────────
  ctx.shots.register('stations-ruins', async (ctx) => {
    setup(ctx, 'kessa', P(ctx, 'fov', 66));
    const sys = ctx.universe.system;
    const body = sys.bodies.find((b) => b.name === (ctx.params.get('body') || 'Verídia'));
    const site = S.surface.list.find((x) => x.body === body && x.kind === 'ruins');
    await siteCam(ctx, S, site, { elev: P(ctx, 'elev', 5), rel: P(ctx, 'rel', 35), front: P(ctx, 'front', 14), dist: P(ctx, 'dist', 74), height: P(ctx, 'h', 8), lookH: P(ctx, 'lh', 15), center: V(0, 6.6, -6), side: P(ctx, 'side', 0), minClear: P(ctx, 'clr', 2.2) });
    ctx.services.rendering?.cut?.();
  });

  // ── 6. posto avançado (Ashar, pôr do sol) ─────────────────────────────
  ctx.shots.register('stations-outpost', async (ctx) => {
    setup(ctx, 'kessa', P(ctx, 'fov', 62));
    const sys = ctx.universe.system;
    const body = sys.bodies.find((b) => b.name === (ctx.params.get('body') || 'Ashar'));
    const site = S.surface.list.find((x) => x.body === body && x.kind === (ctx.params.get('kind') || 'outpost'));
    await siteCam(ctx, S, site, { elev: P(ctx, 'elev', 0.6), rel: P(ctx, 'rel', 22), dist: P(ctx, 'dist', 50), height: P(ctx, 'h', 8), lookH: P(ctx, 'lh', 1.0), center: V(-4, 0, -2), side: P(ctx, 'side', 6), minClear: P(ctx, 'clr', 3) });
    // nave estacionada no pátio
    try {
      const inst = ctx.services.ships?.create?.('freighter', 'frente', { id: 'shot-outpost-ship', seed: 21, throttle: 0, gear: 1, lite: false });
      if (inst) {
        inst.setGear?.(1, true); inst.setLights?.(true);
        const local = site.local.clone().add(V(14, 0.7 + (inst.gearHeight || 2.5), 12).applyQuaternion(site.quatL));
        ctx.world.add(inst.group, null, { getPos: (out) => site.body.localToWorld(local, ctx.time.world, out) });
        const qq = site.quatL.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 2.4));
        const upd = () => { inst.group.quaternion.copy(site.body.rotationAt(ctx.time.world, new THREE.Quaternion()).multiply(qq)); };
        upd();
        const prev = S.shotCam;
        S.shotCam = (c) => { prev(c); upd(); };
      }
    } catch { /* sem naves */ }
    ctx.services.rendering?.cut?.();
  });



  // ── extra: mercado / quadro de missões / oficina ───────────────────────
  ctx.shots.register('stations-market', async (ctx) => {
    setup(ctx, 'kessa', P(ctx, 'fov', 64));
    const view = api.viewOf('kessa:st0');
    view.build();
    const it = api.interiorOf('kessa:st0');
    it.build();
    deckCam(ctx, S, it, V(P(ctx, 'cx', -48.6), P(ctx, 'cy', 1.65), P(ctx, 'cz', 47)), V(P(ctx, 'tx', -70), P(ctx, 'ty', 2.2), P(ctx, 'tz', 70)));
    ctx.services.rendering?.cut?.();
  });

  // ── extras: as outras estações da fatia vertical ────────────────────────
  for (const [name, id, sysId, d0, az0, el0, abs] of [['stations-tharsos', 'kessa:st1', 'kessa', 1100, 40, 18, false], ['stations-refugio', 'kessa:rebel', 'kessa', 1300, 20, -30, true], ['stations-bastiao', 'halden:st0', 'halden', 2200, 30, 10, false]]) {
    ctx.shots.register(name, async (ctx) => {
      setup(ctx, sysId, P(ctx, 'fov', 55));
      const view = api.viewOf(id) || api.list().map((x) => api.viewOf(x.id))[0];
      view.build();
      const az = P(ctx, 'az', az0) * Math.PI / 180, el = P(ctx, 'el', el0) * Math.PI / 180, dist = P(ctx, 'dist', d0);
      const sunL = ctx.universe.system.star.pos.clone().sub(view.frame.pos).normalize().applyQuaternion(view.frame.quat.clone().invert());
      const sAz = (abs ? 0 : Math.atan2(sunL.x, sunL.z)) + az;
      const posL = V(Math.sin(sAz) * Math.cos(el), Math.sin(el), Math.cos(sAz) * Math.cos(el)).multiplyScalar(dist);
      stationCam(ctx, S, view, posL, V(0, P(ctx, 'ty', 0), 0));
      ctx.services.rendering?.cut?.();
    });
  }

}

/**
 * Câmera numa estrutura de superfície: escolhe a hora do dia (elevação do
 * sol `elev`, poente) e põe a câmera numa órbita em volta do alvo, com o sol
 * a `rel` graus da direção de visada (0 = contra o sol).
 */
async function siteCam(ctx, S, site, o) {
  const b = site.body;
  const surf = S.surface;
  surf.resolve(site);
  // hora do dia: procura o instante em que o sol está em `elev` e descendo
  const t0 = ctx.time.world, per = b.rotationPeriod;
  const elevAt = (t) => {
    const up = b.dirToWorld(site.up, t, new THREE.Vector3());
    const p = b.localToWorld(site.local, t, new THREE.Vector3());
    const sun = ctx.universe.system.star.pos.clone().sub(p).normalize();
    return Math.asin(THREE.MathUtils.clamp(up.dot(sun), -1, 1)) * 180 / Math.PI;
  };
  let best = t0, bd = Infinity;
  for (let t = t0; t < t0 + per; t += per / 720) {
    const e = elevAt(t), e2 = elevAt(t + 5);
    const sc = Math.abs(e - o.elev) + (o.rising ? (e2 < e ? 30 : 0) : (e2 > e ? 30 : 0));
    if (sc < bd) { bd = sc; best = t; }
  }
  ctx.time.world = best;
  // sol no referencial da estrutura
  const t = best;
  const qS = b.rotationAt(t, new THREE.Quaternion()).multiply(site.quatL);
  const pW = b.localToWorld(site.local, t, new THREE.Vector3());
  const sunL = ctx.universe.system.star.pos.clone().sub(pW).normalize().applyQuaternion(qS.clone().invert());
  const sunAz = Math.atan2(sunL.x, sunL.z);
  // direção de visada = azimute do sol + rel; câmera do lado oposto
  const vAz = o.front !== undefined ? Math.PI + o.front * Math.PI / 180 : sunAz + o.rel * Math.PI / 180;
  const vd = V(Math.sin(vAz), 0, Math.cos(vAz));
  const center = o.center.clone();
  const camL = center.clone().addScaledVector(vd, -o.dist).add(V(0, o.height, 0)).addScaledVector(V(vd.z, 0, -vd.x), o.side || 0);
  // não deixa a câmera abaixo do relevo (a estrutura está num platô; o entorno varia)
  {
    const loc = site.local.clone().add(camL.clone().applyQuaternion(site.quatL));
    let h = 0; try { h = ctx.services.planets?.heightAtLocal?.(b, loc) ?? 0; } catch { h = 0; }
    const v = ctx.services.planets?.view?.(b);
    if (v?.terrain?.hasSea) h = Math.max(h, 0);
    const above = loc.length() - (b.radius + h);
    if (above < o.minClear) camL.y += o.minClear - above;
  }
  const tgtL = center.clone().add(V(0, o.lookH, 0));
  const qLook = look(tgtL.clone().sub(camL).normalize(), V(0, 1, 0));
  const apply = (c) => {
    const tt = c.time.world;
    const q = b.rotationAt(tt, new THREE.Quaternion()).multiply(site.quatL);
    const loc = site.local.clone().add(camL.clone().applyQuaternion(site.quatL));
    b.localToWorld(loc, tt, c.player.camWorld);
    c.player.pos.copy(c.player.camWorld);
    c.camera.quaternion.copy(q).multiply(qLook);
  };
  install(ctx, S, apply);
  ctx.player.bodyId = b.id;
  ctx.player.altitude = o.height;
  surf.build(site);
  try { ctx.services.planets?.settle?.(60); } catch { /* */ }
  return { t: best };
}

/** Nave do jogador estacionada na plataforma 03 (trem baixado). */
function parkShip(ctx, view, it) {
  let inst = null;
  try { inst = ctx.services.ships?.create?.('fighter', 'hegemonia', { id: 'shot-parked', seed: 7, throttle: 0, gear: 1, shadows: true }); } catch { inst = null; }
  if (!inst) return null;
  inst.setGear?.(1, true);
  inst.setLights?.(true);
  const gh = inst.gearHeight || 1.8;
  const pos = it.toWorld(V(0, gh, 94), new THREE.Vector3());
  ctx.world.add(inst.group, pos);
  const fwd = view.dirToWorld(V(Math.sin(P(ctx, 'syaw', 2.5)), 0, -Math.cos(P(ctx, 'syaw', 2.5))).normalize(), new THREE.Vector3());
  inst.group.quaternion.copy(look(fwd.negate().negate(), it.up));
  return inst;
}

/** Câmera no convés do interior (pos/alvo em coordenadas do convés). */
function deckCam(ctx, S, it, posD, tgtD) {
  const pos = it.toWorld(posD, new THREE.Vector3());
  const tgt = it.toWorld(tgtD, new THREE.Vector3());
  const q = look(tgt.clone().sub(pos).normalize(), it.up);
  install(ctx, S, (c) => { c.player.camWorld.copy(pos); c.player.pos.copy(pos); c.camera.quaternion.copy(q); });
}
