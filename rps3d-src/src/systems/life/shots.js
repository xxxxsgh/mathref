// Presets de screenshot do sistema `life`. Cada um escolhe um lugar real do
// planeta (hora do dia pela elevação do sol), trava o remendo ali, gera a
// flora na hora e posiciona criaturas em cena (bando pastando, verme no topo
// do arco, cogumelos à noite, fileira de espécies), com câmera fixa no
// referencial do planeta.
import * as THREE from 'three/webgpu';
import { speciesFor } from './species.js';
import { lookQuat, rng } from './util.js';

const D2R = Math.PI / 180;
const P = (ctx, k, d) => { const v = ctx.params.get(k); return v === null ? d : Number(v); };

function body(ctx, name) { return ctx.universe.system.bodies.find((b) => b.name === name); }

function slopeAt(pl, b, d, step = 4) {
  const t1 = new THREE.Vector3(0, 1, 0).cross(d).normalize(), t2 = new THREE.Vector3().crossVectors(d, t1);
  const h0 = pl.heightAtLocal(b, d);
  const h1 = pl.heightAtLocal(b, d.clone().addScaledVector(t1, step / b.radius).normalize());
  const h2 = pl.heightAtLocal(b, d.clone().addScaledVector(t2, step / b.radius).normalize());
  return Math.hypot(h1 - h0, h2 - h0) / step;
}
function search(ctx, b, elev, score, tries = 400) {
  const pl = ctx.services.planets;
  let best = null, bs = -Infinity;
  for (let i = 0; i < tries; i++) {
    const az = (i / tries) * 360 + (i % 7) * 0.37;
    const e = elev + ((i * 7919) % 11 - 5) * 0.3;
    const d = pl.dirForSun(b, e, az);
    const h = pl.heightAtLocal(b, d);
    const s = score(d, h);
    if (s > bs) { bs = s; best = d; }
  }
  return best;
}
/** O sol chega ao ponto? (nenhum relevo acima da elevação do sol nos próximos km) */
function sunlit(ctx, b, d, h) {
  const pl = ctx.services.planets;
  const sunW = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
  const sunL = b.dirToLocal(sunW, ctx.time.world, new THREE.Vector3());
  const el = Math.asin(Math.max(-1, Math.min(1, sunL.dot(d))));
  const t = sunL.clone().addScaledVector(d, -sunL.dot(d)).normalize();
  for (const k of [150, 400, 900, 1800, 3000, 5000]) {
    const p = d.clone().addScaledVector(t, k / b.radius).normalize();
    const a = (pl.heightAtLocal(b, p) - h - k * k / (2 * b.radius)) / k;
    if (a > Math.tan(el - 0.03)) return false;
  }
  return true;
}
function sunTangent(ctx, b, d) {
  const sunW = ctx.universe.system.star.pos.clone().sub(b.pos).normalize();
  const sunL = b.dirToLocal(sunW, ctx.time.world, new THREE.Vector3());
  return sunL.addScaledVector(d, -sunL.dot(d)).normalize();
}

export function registerShots(ctx, api, S, H) {
  const settle = () => { try { ctx.services.planets?.settle?.(); } catch { /* */ } };

  /** Prepara: sistema, modo de cena, remendo travado no ponto `d` do corpo `b`. */
  function stage(sysId, b, d, fov = 60) {
    if (ctx.universe.systemId !== sysId) ctx.universe.setSystem(sysId);
    ctx.game.setMode('cinematic');
    ctx.camera.fov = fov; ctx.camera.updateProjectionMatrix();
    const pl = ctx.services.planets;
    const local = pl.placeOnSurface(b, d, 0);
    S.camLocal.copy(local);
    S.lockBody = true; S.noAutoFauna = true; S.freeze = true; S.forceFlora = true;
    H.activate(ctx, b);
    // câmera provisória no ponto (para o LOD do relevo convergir lá)
    b.localToWorld(local.clone().addScaledVector(d, 2), ctx.time.world, ctx.player.camWorld);
    return local;
  }
  /** Câmera fixa: posição/alvo no REMENDO. */
  function cam(posP, targetP) {
    const Pt = S.patch;
    const posL = Pt.toLocal(posP, new THREE.Vector3());
    const fwdP = targetP.clone().sub(posP).normalize();
    const upP = new THREE.Vector3(0, 1, 0);
    const b = S.body;
    S.shotCam = (c) => {
      const t = c.time.world;
      b.localToWorld(posL, t, c.player.camWorld);
      c.player.pos.copy(c.player.camWorld);
      const fL = Pt.dirToLocal(fwdP, new THREE.Vector3()), uL = Pt.dirToLocal(upP, new THREE.Vector3());
      const fW = b.dirToWorld(fL, t, new THREE.Vector3()), uW = b.dirToWorld(uL, t, new THREE.Vector3());
      c.camera.quaternion.copy(lookQuat(fW, uW));
      // câmera presa ao chão que gira: sem histórico de TAA/borrão de movimento
      try { c.services.rendering?.cut?.(); } catch { /* */ }
    };
    S.shotCam(ctx);
    if (!S.renderWrapped) {
      S.renderWrapped = true;
      const orig = ctx.render;
      ctx.render = (c, dt) => { if (S.shotCam) { S.shotCam(c); c.world.sync(); } return orig(c, dt); };
    }
  }
  /** Coloca uma criatura no chão do remendo. */
  function put(sp, x, z, heading, o = {}) {
    const y = S.patch.groundY(x, z);
    const c = S.fauna.spawn(sp, new THREE.Vector3(x, y + (o.alt || 0), z), heading, { scale: o.scale ?? 1 });
    c.state = o.state || 'idle';
    c.graze = o.state === 'graze' ? 1 : 0;
    if (o.look) { c.look.tyaw = c.look.yaw = o.look[0]; c.look.tpitch = c.look.pitch = o.look[1]; }
    if (o.vel) c.vel.copy(o.vel);
    if (o.jaw) c.jawT = c.jaw = o.jaw;
    c.phase = o.phase ?? Math.random() * 4;
    return c;
  }
  /** Assenta as poses (pés no chão) rodando a animação. */
  function warm(n = 24) {
    for (let i = 0; i < n; i++) {
      S.patch.sync();
      S.fauna.frame(1 / 30, S.camP, 3 + i / 30);
    }
  }
  function floraNow() {
    S.patch.worldToPatch(ctx.player.camWorld, S.camP);
    S.flora.updateChunks(S.camLocal, true);
    S.flora.frame(S.camP, true);
  }

  // ── Verídia: bando pastando numa campina à luz dourada ──────────────────
  ctx.shots.register('life-veridia-herd', async () => {
    if (ctx.universe.systemId !== 'kessa') ctx.universe.setSystem('kessa');
    const b = body(ctx, 'Verídia');
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', 11), (dd, h) => {
      if (h < 12 || h > 500) return -Infinity;
      const sl = slopeAt(pl, b, dd, 6);
      if (sl > 0.08) return -Infinity;
      if (!sunlit(ctx, b, dd, h)) return -Infinity;
      // relevo ao fundo (morros contra o céu) e chão plano à frente
      const tan = sunTangent(ctx, b, dd);
      const side = new THREE.Vector3().crossVectors(dd, tan).normalize();
      let far = -Infinity;
      for (const k of [600, 1200, 2000]) far = Math.max(far, pl.heightAtLocal(b, dd.clone().addScaledVector(side, k / b.radius).normalize()) - h);
      return Math.min(200, far) * 0.5 - sl * 800;
    }, 500);
    stage('kessa', b, d, P(ctx, 'fov', 58));
    const sps = speciesFor(b).fauna;
    const grazer = sps.find((s) => s.role === 'grazer' && s.plan === 'quad') || sps[0];
    const critter = sps.find((s) => s.role === 'critter');
    const flyer = sps.find((s) => s.plan === 'flyer');
    const pred = sps.find((s) => s.role === 'predator');
    // sol de lado/atrás à esquerda: luz rasante nos corpos
    const sunP = S.patch.dirToPatch(b.dirToLocal(ctx.universe.system.star.pos.clone().sub(b.pos).normalize(), ctx.time.world, new THREE.Vector3()), new THREE.Vector3());
    sunP.y = 0; sunP.normalize();
    const yaw = P(ctx, 'yaw', 125) * D2R;
    const look = sunP.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const side = new THREE.Vector3(look.z, 0, -look.x);
    const at = (f, s) => new THREE.Vector3(look.x * f + side.x * s, 0, look.z * f + side.z * s);
    const hd = Math.atan2(-side.x, -side.z); // andando para a direita do quadro
    const r = rng(77);
    const herd = [[22, -6, 'graze'], [27, 3, 'graze'], [19, 7, 'alert'], [33, -12, 'graze'], [38, 10, 'walk'], [30, 16, 'graze'], [44, -2, 'graze'], [16, -14, 'alert']];
    herd.forEach(([f, s, st], i) => {
      const p = at(f, s);
      const h = hd + (r() - 0.5) * 1.6 + (st === 'alert' ? Math.PI * 0.6 : 0);
      put(grazer, p.x, p.z, h, { state: st, scale: i === 0 ? 1.12 : 0.85 + r() * 0.25, look: st === 'alert' ? [0.6, -0.2] : null, phase: r() * 3 });
    });
    if (critter) for (let i = 0; i < 4; i++) { const p = at(11 + r() * 4, -3 + r() * 6); put(critter, p.x, p.z, hd + r(), { state: 'graze', scale: 0.9 + r() * 0.2 }); }
    if (pred && P(ctx, 'pred', 1)) { const p = at(52, -24); put(pred, p.x, p.z, Math.atan2(look.x, look.z) + 2.6, { state: 'stalk', look: [-0.4, -0.1] }); }
    if (flyer) {
      const herdF = { members: [], center: at(60, 10), radius: 40, alt: 26, omega: 0.1, speedK: 1 };
      for (let i = 0; i < 6; i++) {
        const p = at(40 + r() * 30, -10 + r() * 30); p.y = S.patch.groundY(p.x, p.z) + 18 + r() * 14;
        const c = S.fauna.spawn(flyer, p, 0, { scale: 0.9 + r() * 0.3 });
        c.vel.copy(side).multiplyScalar(-8).addScaledVector(look, (r() - 0.5) * 4);
        c.herd = herdF; herdF.members.push(c); c.phase = r() * 4;
      }
    }
    const camP = at(0, 0); camP.y = S.patch.groundY(camP.x, camP.z) + P(ctx, 'h', 1.5);
    const tgt = at(28, 1); tgt.y = S.patch.groundY(tgt.x, tgt.z) + 1.6;
    cam(camP, tgt);
    S.flora.clearings = [];
    settle();
    floraNow();
    warm();
  });

  // ── Ashar: verme gigante rompendo as dunas ──────────────────────────────
  ctx.shots.register('life-desert-worm', async () => {
    if (ctx.universe.systemId !== 'kessa') ctx.universe.setSystem('kessa');
    const b = body(ctx, 'Ashar');
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', 18), (dd, h) => {
      const sl = slopeAt(pl, b, dd, 8);
      if (sl > 0.12) return -Infinity;
      if (!sunlit(ctx, b, dd, h)) return -Infinity;
      return -sl * 400 - Math.abs(h - 400) * 0.01;
    }, 400);
    stage('kessa', b, d, P(ctx, 'fov', 62));
    const sps = speciesFor(b).fauna;
    const wormSp = sps.find((s) => s.plan === 'worm');
    const sunP = S.patch.dirToPatch(b.dirToLocal(ctx.universe.system.star.pos.clone().sub(b.pos).normalize(), ctx.time.world, new THREE.Vector3()), new THREE.Vector3());
    sunP.y = 0; sunP.normalize();
    const look = sunP.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), P(ctx, 'yaw', 100) * D2R);
    const side = new THREE.Vector3(look.z, 0, -look.x);
    const at = (f, s) => new THREE.Vector3(look.x * f + side.x * s, 0, look.z * f + side.z * s);
    if (wormSp) {
      const w = S.fauna.spawn(wormSp, at(70, 0), 0);
      const L = w.rig.dims.L;
      const arc = L * 1.5;
      const p0 = at(P(ctx, 'wd', 75), arc * 0.5 + 6);
      p0.y = S.patch.groundY(p0.x, p0.z);
      w.path.start(p0, side.clone().negate(), { arcLen: arc, height: L * 0.36, s: arc * P(ctx, 'ws', 0.62) });
      w.path.frozen = true;
      w.path.open = 1;
    }
    const crit = sps.find((s) => s.role === 'critter');
    const r = rng(9);
    if (crit) for (let i = 0; i < 5; i++) { const p = at(22 + r() * 10, -8 - r() * 10); put(crit, p.x, p.z, Math.atan2(-side.x, -side.z) + 0.5 + r() * 0.4, { state: 'flee', vel: side.clone().multiplyScalar(-6) }); }
    const camP = at(0, 0); camP.y = S.patch.groundY(camP.x, camP.z) + P(ctx, 'h', 1.7);
    const tgt = at(60, 4); tgt.y = S.patch.groundY(tgt.x, tgt.z) + P(ctx, 'ty', 16);
    cam(camP, tgt);
    settle();
    floraNow();
    warm();
    // o frame da trajetória e a poeira
    for (let i = 0; i < 6; i++) S.fauna.frame(1 / 30, S.camP, 3 + i / 30);
  });

  // ── Mundo tóxico à noite: bosque de cogumelos bioluminescentes ──────────
  ctx.shots.register('life-toxic-fungi-night', async () => {
    const sysId = ctx.params.get('sys') || 's6';
    if (ctx.universe.systemId !== sysId) ctx.universe.setSystem(sysId);
    const b = ctx.universe.system.bodies.find((x) => x.type === 'toxic') || ctx.universe.system.bodies.find((x) => x.landable);
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', -14), (dd, h) => {
      if (h < 8) return -Infinity;
      const sl = slopeAt(pl, b, dd, 6);
      if (sl > 0.1) return -Infinity;
      return -sl * 300 - Math.abs(h - 120) * 0.02;
    }, 400);
    stage(sysId, b, d, P(ctx, 'fov', 64));
    const sps = speciesFor(b).fauna;
    const look = new THREE.Vector3(Math.sin(P(ctx, 'yaw', 30) * D2R), 0, Math.cos(P(ctx, 'yaw', 30) * D2R));
    const side = new THREE.Vector3(look.z, 0, -look.x);
    const at = (f, s) => new THREE.Vector3(look.x * f + side.x * s, 0, look.z * f + side.z * s);
    // densifica o bosque perto da câmera (clareira no meio para ver o fundo)
    S.flora.densityBoost = 1;
    const r = rng(5);
    const grazer = sps.find((s) => s.role === 'grazer');
    if (grazer) for (let i = 0; i < 4; i++) { const p = at(14 + r() * 12, -6 + r() * 12); put(grazer, p.x, p.z, r() * 6, { state: i % 2 ? 'graze' : 'idle', scale: 0.8 + r() * 0.3 }); }
    const fl = sps.find((s) => s.plan === 'flyer');
    if (fl) for (let i = 0; i < 4; i++) { const p = at(18 + r() * 20, -10 + r() * 20); p.y = S.patch.groundY(p.x, p.z) + 5 + r() * 6; const c = S.fauna.spawn(fl, p, 0, { scale: 0.7 }); c.vel.copy(side).multiplyScalar(5); c.phase = r() * 3; }
    const camP = at(0, 0); camP.y = S.patch.groundY(camP.x, camP.z) + P(ctx, 'h', 1.6);
    const tgt = at(20, 0); tgt.y = S.patch.groundY(tgt.x, tgt.z) + P(ctx, 'ty', 3.5);
    cam(camP, tgt);
    settle();
    floraNow();
    warm();
  });

  // ── fileira de espécies (Verídia, Ashar, Nivália) numa campina ──────────
  ctx.shots.register('life-creature-lineup', async () => {
    if (ctx.universe.systemId !== 'kessa') ctx.universe.setSystem('kessa');
    const b = body(ctx, 'Verídia');
    const pl = ctx.services.planets;
    const d = search(ctx, b, P(ctx, 'elev', 24), (dd, h) => {
      if (h < 12 || h > 400) return -Infinity;
      const sl = slopeAt(pl, b, dd, 10);
      if (sl > 0.05) return -Infinity;
      if (!sunlit(ctx, b, dd, h)) return -Infinity;
      return -sl * 1000;
    }, 500);
    stage('kessa', b, d, P(ctx, 'fov', 50));
    const sys = ctx.universe.system;
    const pick = (name) => speciesFor(sys.bodies.find((x) => x.name === name)).fauna;
    const all = [...pick('Verídia'), ...pick('Ashar').filter((s) => s.plan !== 'worm'), ...pick('Nivália')].filter((s) => s.plan !== 'marine' && s.plan !== 'flyer');
    const want = P(ctx, 'n', 8);
    const list = all.sort((a, b2) => a.L - b2.L).slice(-want);
    list.sort((a, b2) => (a.biome > b2.biome ? 1 : -1) || a.L - b2.L);
    const sunP = S.patch.dirToPatch(b.dirToLocal(sys.star.pos.clone().sub(b.pos).normalize(), ctx.time.world, new THREE.Vector3()), new THREE.Vector3());
    sunP.y = 0; sunP.normalize();
    // câmera olha perpendicular ao sol (luz lateral 3/4 na frente)
    const look = sunP.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), P(ctx, 'yaw', 105) * D2R);
    const side = new THREE.Vector3(look.z, 0, -look.x);
    let x = 0;
    const gap = 1.2;
    const sizes = list.map((s) => Math.max(1.0, (s.L + s.neck.len * 0.6 + s.head.len) * 0.9));
    const total = sizes.reduce((a, s) => a + s + gap, 0);
    x = -total / 2;
    const dist = P(ctx, 'dist', 16);
    list.forEach((sp, i) => {
      const w = sizes[i];
      const s = x + w / 2; x += w + gap;
      const p = new THREE.Vector3(look.x * dist + side.x * s, 0, look.z * dist + side.z * s);
      const c = put(sp, p.x, p.z, Math.atan2(side.x, side.z) + 0.35, { state: 'idle', look: [-0.35, -0.05] });
      c.phase = i;
    });
    S.flora.clearings = [{ body: b, local: S.patch.toLocal(new THREE.Vector3(look.x * dist, 0, look.z * dist)), radius: total * 0.6 + 6, all: false }, { body: b, local: S.patch.toLocal(new THREE.Vector3(0, 0, 0)), radius: 45, all: false }];
    S.flora.chunks.clear();
    const camP = new THREE.Vector3(0, 0, 0); camP.y = S.patch.groundY(0, 0) + P(ctx, 'h', 2.2);
    const tgt = new THREE.Vector3(look.x * dist, 0, look.z * dist); tgt.y = S.patch.groundY(tgt.x, tgt.z) + P(ctx, 'ty', 1.6);
    cam(camP, tgt);
    settle();
    floraNow();
    warm();
  });
}
