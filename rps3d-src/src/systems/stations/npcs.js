// Gente da estação: humanoides procedurais (proporções, roupas e cores
// variadas) com animação procedural — caminhada com balanço de quadril e
// braços, respiração, sentar, apoiar no balcão, trabalhar (mecânicos),
// gesticular — e rotinas simples (andar entre pontos, ficar na banca,
// conversar). Todas as partes de todos os NPCs são InstancedMesh (≈10
// chamadas de desenho para a multidão inteira).
import * as THREE from 'three/webgpu';
import { vec3, vec2, float, uniform, max, dot, normalize, normalView, diffuseColor, positionLocal, length, smoothstep, abs, lights as tslLights } from 'three/tsl';
import { V3, rng } from './geo.js';

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const BUDGET = { ultra: 26, high: 20, medium: 13, mobile: 8 };

// paletas de roupa (linear) por papel
const OUTFITS = {
  guild: [[0.05, 0.28, 0.25], [0.6, 0.58, 0.52], [0.04, 0.05, 0.06]],
  mech: [[0.55, 0.3, 0.05], [0.12, 0.12, 0.13], [0.35, 0.33, 0.3]],
  civ: [[0.18, 0.06, 0.05], [0.07, 0.08, 0.12], [0.3, 0.24, 0.18], [0.04, 0.04, 0.045], [0.22, 0.2, 0.25], [0.08, 0.15, 0.1], [0.4, 0.36, 0.3]],
  rebel: [[0.32, 0.12, 0.04], [0.2, 0.19, 0.16]],
  bar: [[0.02, 0.02, 0.025], [0.5, 0.04, 0.12]],
};
const SKIN = [[0.55, 0.36, 0.25], [0.38, 0.22, 0.14], [0.22, 0.12, 0.08], [0.62, 0.45, 0.35], [0.45, 0.3, 0.22], [0.3, 0.38, 0.42]];

/** Geometrias das partes (origem na junta superior; o comprimento desce em −Y). */
function partGeos() {
  const cap = (r, len) => { const g = new THREE.CapsuleGeometry(r, len, 4, 10); g.translate(0, -len / 2 - r * 0.2, 0); return g; };
  const torso = new THREE.CylinderGeometry(0.19, 0.15, 0.52, 12, 2); torso.scale(1, 1, 0.62); torso.translate(0, 0.26, 0);
  const chest = new THREE.SphereGeometry(0.2, 12, 8); chest.scale(1.0, 0.6, 0.66); chest.translate(0, 0.42, 0.01);
  const pelvis = new THREE.CylinderGeometry(0.16, 0.17, 0.2, 12); pelvis.scale(1, 1, 0.66);
  const head = new THREE.SphereGeometry(0.105, 16, 12); head.scale(0.88, 1.08, 1.0); head.translate(0, 0.12, 0.0);
  const neck = new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8); neck.translate(0, 0.04, 0);
  const hair = new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55); hair.scale(0.9, 1.05, 1.04); hair.translate(0, 0.135, -0.01);
  const foot = new THREE.BoxGeometry(0.1, 0.08, 0.25); foot.translate(0, -0.04, 0.05);
  const hand = new THREE.BoxGeometry(0.07, 0.1, 0.035); hand.translate(0, -0.05, 0);
  const visor = new THREE.BoxGeometry(0.15, 0.045, 0.04); visor.translate(0, 0.13, 0.095);
  return {
    pelvis, torso, chest, neck, head, hair, visor,
    uArm: cap(0.052, 0.22), lArm: cap(0.045, 0.21), hand,
    thigh: cap(0.075, 0.33), shin: cap(0.06, 0.34), foot,
  };
}

function makeMat(pool, upV, lite) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.7, metalness: 0.05 });
  // luz falsa: ambiente + "céu" vindo de cima (gravidade da estação) — os pontos reais somam o resto
  const nUp = max(dot(normalize(normalView), upV), 0.0);
  m.emissiveNode = diffuseColor.rgb.mul(nUp.mul(0.22).add(0.07)).mul(lite ? 2.0 : 1.0);
  m.envNode = vec3(0.015, 0.014, 0.014);
  m.lightsNode = tslLights(pool);
  return m;
}

class Person {
  constructor(o) {
    Object.assign(this, { pos: new THREE.Vector3(), yaw: 0, speed: 0, phase: Math.random() * 6, pose: 'stand', talkT: 0, path: null, wp: 0, wait: 0, look: 0, h: 1, w: 1 }, o);
    this.target = null;
  }
}

export class Crowd {
  constructor(ctx, interior, spots, pool) {
    this.ctx = ctx; this.interior = interior; this.spots = spots;
    this.group = new THREE.Group(); this.group.name = 'npcs';
    this.people = [];
    this.r = rng(4242);
    const lite = ctx.quality.name === 'mobile';
    this.upV = uniform(new THREE.Vector3(0, 1, 0));
    this.geos = partGeos();
    this.mat = makeMat(pool, this.upV, lite);
    // rosto: olhos, sobrancelhas e boca sombreados no próprio material da cabeça
    this.headMat = makeMat(pool, this.upV, lite);
    {
      const P = positionLocal;
      const front = smoothstep(0.05, 0.08, P.z);
      const eye = (x) => float(1).sub(smoothstep(0.011, 0.016, length(P.xy.sub(vec2(x, 0.138)))));
      const eyes = eye(-0.034).add(eye(0.034)).mul(front);
      const brow = smoothstep(0.006, 0.0, abs(P.y.sub(0.158))).mul(smoothstep(0.06, 0.04, abs(P.x))).mul(front);
      const mouth = smoothstep(0.005, 0.0, abs(P.y.sub(0.082))).mul(smoothstep(0.03, 0.02, abs(P.x))).mul(front);
      const nose = smoothstep(0.02, 0.0, length(P.xy.sub(vec2(0, 0.11)))).mul(front).mul(0.25);
      this.headMat.colorNode = vec3(1).mul(float(1).sub(eyes.mul(0.85)).sub(brow.mul(0.45)).sub(mouth.mul(0.5)).sub(nose));
    }
    this.populate(BUDGET[ctx.quality.name] ?? 14);
    const N = this.people.length;
    this.meshes = {};
    for (const [k, g] of Object.entries(this.geos)) {
      const im = new THREE.InstancedMesh(g, k === 'head' ? this.headMat : this.mat, N * (k === 'uArm' || k === 'lArm' || k === 'hand' || k === 'thigh' || k === 'shin' || k === 'foot' ? 2 : 1));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false; im.castShadow = !lite; im.receiveShadow = false;
      im.name = 'npc:' + k;
      this.meshes[k] = im;
      this.group.add(im);
    }
    this.colorize();
    this.t = 0;
  }

  add(o) {
    const r = this.r;
    const role = o.role;
    const pal = o.palette || OUTFITS[o.outfit || 'civ'];
    const p = new Person({
      ...o,
      h: o.h ?? 0.94 + r() * 0.12, w: o.w ?? 0.92 + r() * 0.16,
      cTop: pal[Math.floor(r() * pal.length)], cBot: OUTFITS.civ[Math.floor(r() * OUTFITS.civ.length)], cAcc: pal[Math.floor(r() * pal.length)],
      skin: SKIN[Math.floor(r() * SKIN.length)], hairC: [[0.02, 0.015, 0.01], [0.12, 0.06, 0.02], [0.4, 0.3, 0.15], [0.5, 0.48, 0.45], [0.05, 0.02, 0.06]][Math.floor(r() * 5)],
      helmet: role === 'mechanic' ? r() < 0.6 : false,
      phase: r() * 6,
    });
    if (o.cTop) p.cTop = o.cTop;
    this.people.push(p);
    return p;
  }

  populate(budget) {
    const S = this.spots, r = this.r;
    const yawTo = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);
    // personagens fixos
    this.add({ role: 'bartender', name: 'Bartender', role2: 'O Último Salto', talk: 'bartender', pos: S.bartender.clone(), yaw: 0, pose: 'work', outfit: 'bar', path: [S.bartender.clone().add(V3(-6, 0, 0)), S.bartender.clone().add(V3(5, 0, 0))], pace: 0.6 });
    this.add({ role: 'iara', name: 'Iara Voss', talk: 'iara', pos: S.iara.clone(), yaw: Math.PI / 2, pose: 'sit', palette: OUTFITS.rebel, cTop: [0.32, 0.12, 0.04], seatH: 0.5, h: 0.97 });
    this.add({ role: 'oren', name: 'Oren Saal', talk: 'oren', pos: S.oren.clone(), yaw: 0, pose: 'stand', outfit: 'guild', cTop: [0.05, 0.28, 0.25], h: 1.04, w: 1.12 });
    // mecânicos no hangar
    for (let i = 0; i < 3 && this.people.length < budget; i++) {
      const sp = S.mech[i];
      this.add({ role: 'mechanic', name: 'Mecânica da doca', talk: i === 0 ? 'mechanic' : null, pos: sp.clone(), yaw: r() * 6, pose: 'work', outfit: 'mech', path: i === 2 ? [S.mech[2].clone(), S.mech[3].clone()] : null, pace: 1.0 });
    }
    // bar: gente sentada nas mesas e no balcão
    for (let i = 0; i < S.tables.length && this.people.length < budget - 4; i++) {
      const t = S.tables[i];
      const n = i % 2 ? 2 : 1;
      for (let j = 0; j < n; j++) {
        const a = (j / 3) * Math.PI * 2 + t.x;
        const p = V3(t.x + Math.sin(a) * 1.0, 0, t.z + Math.cos(a) * 1.0);
        this.add({ role: 'patron', name: 'Frequentador', pos: p, yaw: yawTo(p, t), pose: 'sit', seatH: 0.62 });
      }
    }
    for (let i = 0; i < S.counter.length && this.people.length < budget - 3; i++) {
      const c = S.counter[i];
      this.add({ role: 'patron', name: 'Frequentador', pos: c.clone().add(V3(0, 0, 0.7)), yaw: Math.PI, pose: i % 2 ? 'lean' : 'sit', seatH: 0.78 });
    }
    for (let i = 1; i < S.booths.length && this.people.length < budget - 3; i++) {
      const b = S.booths[i];
      this.add({ role: 'patron', name: 'Frequentador', pos: b.clone().add(V3(-0.95, 0, 0)), yaw: Math.PI / 2, pose: 'sit', seatH: 0.5 });
      if (i === 2) this.add({ role: 'patron', name: 'Frequentador', pos: b.clone().add(V3(0.95, 0, 0)), yaw: -Math.PI / 2, pose: 'sit', seatH: 0.5 });
    }
    // mercado: vendedores e transeuntes
    for (const v of S.vendors) if (this.people.length < budget) this.add({ role: 'vendor', name: 'Vendedor', pos: v.clone(), yaw: v.z > 60 ? Math.PI : 0, pose: 'stand', outfit: 'civ' });
    let k = 0;
    while (this.people.length < budget) {
      const path = S.marketWalk.slice(k % S.marketWalk.length).concat(S.marketWalk.slice(0, k % S.marketWalk.length));
      if (k % 2) path.reverse();
      this.add({ role: 'walker', name: 'Viajante', pos: path[0].clone(), yaw: 0, pose: 'walk', path, pace: 1.1 + r() * 0.35 });
      k++;
    }
  }

  colorize() {
    const c = new THREE.Color();
    const set = (k, i, col) => { c.setRGB(col[0], col[1], col[2]); this.meshes[k].setColorAt(i, c); };
    this.people.forEach((p, i) => {
      set('pelvis', i, p.cBot); set('torso', i, p.cTop); set('chest', i, p.cAcc); set('neck', i, p.skin); set('head', i, p.skin);
      set('hair', i, p.helmet ? [0.6, 0.38, 0.05] : p.hairC);
      set('visor', i, p.helmet ? [0.05, 0.12, 0.16] : [0.015, 0.012, 0.01]);
      for (const s of [0, 1]) {
        set('uArm', i * 2 + s, p.cTop); set('lArm', i * 2 + s, p.role === 'mechanic' ? p.cTop : p.cAcc); set('hand', i * 2 + s, p.role === 'mechanic' ? [0.05, 0.05, 0.05] : p.skin);
        set('thigh', i * 2 + s, p.cBot); set('shin', i * 2 + s, p.cBot); set('foot', i * 2 + s, [0.03, 0.025, 0.02]);
      }
    });
    for (const im of Object.values(this.meshes)) if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }

  /** NPCs com quem dá para falar (posição no convés, altura do rosto). */
  talkables() {
    const out = [];
    for (const p of this.people) if (p.talk) out.push({ kind: 'npc', ref: { ...p, ref: p, role: p.role2 || ROLE_LABEL[p.role] || '' , name: p.name }, pos: p.pos.clone().add(V3(0, p.pose === 'sit' ? 1.15 : 1.55, 0)) });
    return out;
  }

  talk(ref, st) {
    const p = ref.ref || ref;
    p.talkT = 6;
    const ctx = this.ctx;
    ctx.bus.emit('npc:talk', { npc: p.talk, station: st?.id, name: p.name });
    const lines = LINES[p.talk] || LINES.generic;
    const text = lines[Math.floor(Math.random() * lines.length)];
    // a história pode ter uma conversa própria para este NPC; senão, uma fala ambiente
    setTimeout(() => {
      if (ctx.services.hud?.modal) return;
      ctx.bus.emit('radio', { faction: p.talk === 'iara' ? 'frente' : 'guilda', speaker: p.name.toUpperCase(), text, priority: 1, local: true });
    }, 250);
  }

  frame(dt, ctx, eye) {
    this.t += dt;
    // "cima" da estação no espaço de vista (luz falsa dos NPCs)
    const g = this.group;
    g.updateWorldMatrix(true, false);
    const upW = V3(0, 1, 0).transformDirection(g.matrixWorld);
    this.upV.value.copy(upW).transformDirection(ctx.camera.matrixWorldInverse);
    for (let i = 0; i < this.people.length; i++) {
      const p = this.people[i];
      this.think(p, dt, eye);
      this.pose(p, i);
    }
    for (const im of Object.values(this.meshes)) im.instanceMatrix.needsUpdate = true;
  }

  think(p, dt, eye) {
    if (p.talkT > 0) {
      p.talkT -= dt;
      // vira para o jogador
      const want = Math.atan2(eye.x - p.pos.x, eye.z - p.pos.z);
      if (p.pose !== 'sit') p.yaw = lerpAngle(p.yaw, want, Math.min(1, dt * 4));
      p.speed = 0;
      return;
    }
    if (!p.path || p.pose === 'sit') { p.speed = 0; return; }
    if (p.wait > 0) { p.wait -= dt; p.speed = Math.max(0, p.speed - dt * 3); return; }
    const tgt = p.path[p.wp % p.path.length];
    const d = _p.copy(tgt).sub(p.pos); d.y = 0;
    const dist = d.length();
    if (dist < 0.25) {
      p.wp++;
      p.wait = p.role === 'walker' ? 1.5 + this.r() * 4 : 2 + this.r() * 5;
      return;
    }
    const want = Math.atan2(d.x, d.z);
    p.yaw = lerpAngle(p.yaw, want, Math.min(1, dt * 3));
    const pace = (p.pace || 1) * (p.role === 'bartender' ? 0.8 : 1.2);
    p.speed += (Math.min(pace, dist * 1.2) - p.speed) * Math.min(1, dt * 3);
    p.pos.x += Math.sin(p.yaw) * p.speed * dt;
    p.pos.z += Math.cos(p.yaw) * p.speed * dt;
  }

  /** Esqueleto procedural → matrizes das instâncias. */
  pose(p, i) {
    const t = this.t, h = p.h, sc = p.w;
    const walk = Math.min(1, p.speed / 1.3);
    p.phase += p.speed * 2.4 * (1 / 60) * 0; // fase vem do tempo × velocidade abaixo
    const ph = t * (1.8 + p.speed * 1.8) + p.phase;
    const breath = Math.sin(t * 1.6 + p.phase) * 0.012;
    let hipY = 0.93 * h, lean = 0, thighL = 0, thighR = 0, kneeL = 0, kneeR = 0, armL = 0, armR = 0, elbowL = 0.2, elbowR = 0.2, headPitch = 0, headYaw = 0, armSideL = 0.08, armSideR = 0.08, sway = 0;
    if (p.pose === 'sit') {
      hipY = (p.seatH ?? 0.5) + 0.09;
      thighL = thighR = 1.45; kneeL = kneeR = 1.4;
      lean = 0.08 + Math.sin(t * 0.5 + p.phase) * 0.03;
      armL = armR = 0.5; elbowL = elbowR = 1.15;
      if (p.talk === 'iara') { armR = 0.9; elbowR = 1.7 + Math.sin(t * 0.8) * 0.15; headYaw = Math.sin(t * 0.3) * 0.3; }
      headPitch = Math.sin(t * 0.4 + p.phase) * 0.1;
      if (p.talkT > 0) { armL = 0.8 + Math.sin(t * 3) * 0.2; }
    } else if (p.pose === 'lean') {
      hipY = 0.93 * h; lean = 0.32; armL = armR = 1.0; elbowL = elbowR = 1.3; thighL = 0.05; thighR = -0.1; kneeL = 0.08; kneeR = 0.12;
    } else {
      // caminhada: coxas ±, joelho dobra na fase de balanço, quadril sobe/desce
      const s = Math.sin(ph), c = Math.cos(ph);
      thighL = s * 0.48 * walk; thighR = -s * 0.48 * walk;
      kneeL = Math.max(0, -c) * 0.85 * walk + 0.04; kneeR = Math.max(0, c) * 0.85 * walk + 0.04;
      armL = -s * 0.42 * walk; armR = s * 0.42 * walk;
      elbowL = 0.25 + walk * 0.3; elbowR = 0.25 + walk * 0.3;
      hipY += Math.abs(Math.cos(ph)) * 0.035 * walk - 0.02 * walk;
      sway = Math.sin(ph) * 0.04 * walk;
      lean = 0.06 * walk;
      if (p.pose === 'work' && walk < 0.2) {
        // trabalhando: braços à frente com movimento curto (limpar balcão / ajustar peça)
        const w = Math.sin(t * (p.role === 'bartender' ? 2.2 : 3.4) + p.phase);
        armR = 0.9 + w * 0.25; elbowR = 0.9 + w * 0.3;
        armL = 0.6; elbowL = 0.9;
        lean = p.role === 'mechanic' ? 0.35 : 0.18;
        headPitch = 0.35;
      } else if (walk < 0.2) {
        // parado: peso de um lado, braços soltos, olhar em volta
        armSideL = 0.12; armSideR = 0.1; headYaw = Math.sin(t * 0.25 + p.phase) * 0.5;
        thighL = 0.04; thighR = -0.03; kneeL = 0.06;
        if (p.talkT > 0) { armR = 0.5 + Math.sin(t * 4) * 0.25; elbowR = 1.0; }
      }
    }
    // raiz (quadril)
    _q.setFromEuler(_e.set(0, p.yaw, 0));
    const root = _m.compose(_p.set(p.pos.x, hipY + breath * 0.3, p.pos.z), _q, _s.set(sc, h, sc).multiplyScalar(1));
    root.multiply(_m2.makeRotationZ(sway));
    const M = (local) => new THREE.Matrix4().multiplyMatrices(root, local);
    const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    const R = (x, y, z) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
    // tronco
    const spine = M(T(0, 0.06, 0)).multiply(R(lean, 0, 0));
    this.meshes.pelvis.setMatrixAt(i, M(T(0, 0, 0)));
    this.meshes.torso.setMatrixAt(i, spine.clone().multiply(new THREE.Matrix4().makeScale(1, 1 + breath, 1)));
    this.meshes.chest.setMatrixAt(i, spine.clone().multiply(new THREE.Matrix4().makeScale(1 + breath, 1 + breath, 1 + breath * 2)));
    const neck = spine.clone().multiply(T(0, 0.55, 0));
    this.meshes.neck.setMatrixAt(i, neck);
    const head = neck.clone().multiply(T(0, 0.06, 0)).multiply(R(headPitch - lean * 0.5, headYaw, 0));
    this.meshes.head.setMatrixAt(i, head);
    this.meshes.hair.setMatrixAt(i, head);
    this.meshes.visor.setMatrixAt(i, p.helmet ? head : head.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.012, -0.012)).multiply(new THREE.Matrix4().makeScale(0.72, 0.42, 1)));
    // braços
    for (const [s, a, el, side] of [[0, armL, elbowL, -1], [1, armR, elbowR, 1]]) {
      const sh = spine.clone().multiply(T(side * 0.21, 0.47, 0)).multiply(R(-a, 0, side * (s ? armSideR : armSideL)));
      this.meshes.uArm.setMatrixAt(i * 2 + s, sh);
      const el2 = sh.clone().multiply(T(0, -0.29, 0)).multiply(R(-el, 0, 0));
      this.meshes.lArm.setMatrixAt(i * 2 + s, el2);
      this.meshes.hand.setMatrixAt(i * 2 + s, el2.clone().multiply(T(0, -0.27, 0)));
    }
    // pernas
    for (const [s, th, kn, side] of [[0, thighL, kneeL, -1], [1, thighR, kneeR, 1]]) {
      const hp = M(T(side * 0.095, -0.06, 0)).multiply(R(-th, 0, 0));
      this.meshes.thigh.setMatrixAt(i * 2 + s, hp);
      const kp = hp.clone().multiply(T(0, -0.42, 0)).multiply(R(kn, 0, 0));
      this.meshes.shin.setMatrixAt(i * 2 + s, kp);
      const ft = kp.clone().multiply(T(0, -0.42, 0)).multiply(R(-(kn - th) * (p.pose === 'sit' ? 0.0 : 0.3), 0, 0));
      this.meshes.foot.setMatrixAt(i * 2 + s, ft);
    }
  }

  dispose() {
    for (const im of Object.values(this.meshes)) { im.geometry.dispose(); im.dispose?.(); }
    this.mat.dispose();
    this.headMat.dispose();
  }
}

const ROLE_LABEL = { bartender: 'O ÚLTIMO SALTO', iara: 'FRENTE LIVRE', oren: 'GUILDA DOS MERCADORES', mechanic: 'EQUIPE DE DOCA' };
const LINES = {
  bartender: ['O de sempre? Aqui só tem "o de sempre".', 'Ouvi dizer que a Hegemonia dobrou o pedágio em Halden. Bebe por conta da casa — hoje.', 'Se for brigar, brigue lá fora. Lá fora é vácuo, então pense bem.', 'Os pilotos da Frente sentam perto da janela. Gostam de ver quem chega.'],
  iara: ['Você chegou. Sente-se — e fale baixo.', 'Ainda não confio em você, Paoli. Mas confio menos na Hegemonia.'],
  oren: ['A Guilda compra, a Guilda vende. Ideologia não paga combustível.', 'Descobertas novas valem bem aqui. Traga dados de varredura e conversamos.', 'Precisa de reparo? A oficina fica do outro lado do mercado.'],
  mechanic: ['Sua nave está inteira — por milagre. Quer que eu dê uma olhada nos escudos?', 'Plataforma 03 é sua até a próxima janela de tráfego.', 'Não encoste no campo de contenção. Sério.'],
  generic: ['Bom ciclo.', 'Estou ocupado.', 'Já viu as ruínas em Verídia? Dizem que cantam à noite.'],
};

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
void float;
