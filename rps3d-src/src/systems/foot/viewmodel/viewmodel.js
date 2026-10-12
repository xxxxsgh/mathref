// Arma + braços em 1ª pessoa com animação procedural em camadas:
// pose de quadril ↔ mira (ADS alinhando o soquete `sight` ao olho), corrida
// (arma baixa e girada), balanço do passo (figura 8), inércia do olhar
// (molas), respiração, recuo com mola (chute + subida + desvio), recarga
// por linha do tempo (carregador cai, mão esquerda busca outro, encaixa,
// alavanca), inspeção, troca de arma, pouso, jetpack, lançamento de granada.
// O grupo raiz é filho da câmera e ESCALADO (0,34) para não atravessar paredes.
import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, vec4, float, uv, smoothstep, length, abs, atan, sin, cos, pow, max, mix, time } from 'three/tsl';
import { weaponMaterials, BUILDERS, buildGrenade } from './models.js';
import { suitMaterials, Arm, WristScreen } from './arms.js';
import { clamp, damp, spring, easeInOut, smooth01, lerp } from '../util.js';

const D = Math.PI / 180;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const WRIST_OFF = new THREE.Vector3(0, 0.03, 0.058); // contato da empunhadura → punho (no referencial da mão)

/** Poses de quadril por arma (m, câmera) e distância do olho na mira. */
const POSE = {
  rifle: { hip: [0.168, -0.212, -0.33], rot: [1.2, 5, 0], ads: 0.2, aimFov: 0.78, handL: 'fore', handR: 'trigger' },
  shotgun: { hip: [0.168, -0.215, -0.32], rot: [1.2, 5, 0], ads: 0.2, aimFov: 0.85, handL: 'fore', handR: 'trigger' },
  sniper: { hip: [0.17, -0.212, -0.34], rot: [1, 4.5, 0], ads: 0.12, aimFov: 0.26, handL: 'cup', handR: 'trigger' },
  pistol: { hip: [0.13, -0.165, -0.36], rot: [2, 4, 0], ads: 0.28, aimFov: 0.86, handL: 'cup', handR: 'trigger' },
  multitool: { hip: [0.15, -0.185, -0.32], rot: [4, 5, 0], ads: 0.26, aimFov: 0.92, handL: null, handR: 'trigger' },
};

/** Material do clarão da boca (estrela com 4–6 pontas, HDR aditivo). */
function flashMaterial(color) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const U = { color: uniform(new THREE.Color(color)), k: uniform(0), seed: uniform(0) };
  m.colorNode = Fn(() => {
    const p = uv().sub(0.5).mul(2);
    const r = length(p);
    const a = atan(p.y, p.x);
    const star = pow(abs(cos(a.mul(3).add(U.seed))), 18).mul(0.8).add(pow(abs(cos(a.mul(2).add(U.seed.mul(1.7)))), 30).mul(0.6));
    const core = smoothstep(0.35, 0.0, r);
    const rays = star.mul(smoothstep(1.0, 0.1, r));
    const v = max(core.mul(2.2), rays).mul(U.k);
    return vec4(U.color.mul(v).mul(8).add(vec3(v.mul(v).mul(6))), 1);
  })();
  m.userData.U = U;
  return m;
}

/** Bolha de distorção/fumaça leve ao redor da boca (lateral). */
function sideFlashMaterial(color) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const U = { color: uniform(new THREE.Color(color)), k: uniform(0) };
  m.colorNode = Fn(() => {
    const p = uv().sub(vec3(0.5, 0.0, 0).xy);
    const along = p.y;
    const across = abs(p.x).mul(2);
    const flame = smoothstep(1.0, 0.0, along).mul(smoothstep(0.0, 0.08, along)).mul(smoothstep(0.5, 0.0, across.sub(along.mul(0.3)))).mul(sin(along.mul(40).sub(time.mul(90))).mul(0.2).add(0.8));
    return vec4(U.color.mul(flame.mul(U.k).mul(7)), 1);
  })();
  m.userData.U = U;
  return m;
}

export class ViewModel {
  constructor(ctx) {
    this.ctx = ctx;
    const lite = ctx.quality.name === 'mobile';
    this.lite = lite;
    this.M = weaponMaterials(lite);
    this.SM = suitMaterials(lite);
    this.root = new THREE.Group(); this.root.name = 'viewmodel';
    this.scale = 0.34;
    this.root.scale.setScalar(this.scale);
    this.pivot = new THREE.Group(); this.root.add(this.pivot);   // pose + animações
    this.holder = new THREE.Group(); this.pivot.add(this.holder); // arma atual
    this.models = {};
    this.current = null;
    this.wrist = new WristScreen();
    this.armR = new Arm(this.SM, 'right');
    this.armL = new Arm(this.SM, 'left', { wristScreen: this.wrist });
    this.root.add(this.armR.group, this.armL.group);
    this.grenade = buildGrenade(this.M); this.grenade.visible = false; this.root.add(this.grenade);
    // clarão
    this.flash = { k: 0, color: '#7fd8ff' };
    this.flashMat = flashMaterial('#7fd8ff');
    this.sideMat = sideFlashMaterial('#7fd8ff');
    const fg = new THREE.Group();
    const q1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), this.flashMat);
    fg.add(q1);
    for (let k = 0; k < 3; k++) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.2), this.sideMat);
      s.geometry.translate(0, 0.1, 0); s.rotation.set(-Math.PI / 2, 0, k * Math.PI / 1.5, 'YXZ');
      const w2 = new THREE.Group(); w2.rotation.z = k * Math.PI * 2 / 3; w2.add(s); s.rotation.set(-Math.PI / 2, 0, 0); fg.add(w2);
    }
    fg.visible = false; fg.renderOrder = 20;
    this.flashGroup = fg;
    this.light = new THREE.PointLight(0x88ddff, 0, 9, 2);
    this.light.castShadow = false;
    this.root.add(this.light);
    // estado de animação
    this.aimK = 0; this.sprintK = 0; this.crouchK = 0; this.airK = 0;
    this.sway = { x: { x: 0, v: 0 }, y: { x: 0, v: 0 } };
    this.recoil = { z: { x: 0, v: 0 }, rx: { x: 0, v: 0 }, ry: { x: 0, v: 0 }, rz: { x: 0, v: 0 } };
    this.bobT = 0; this.bobK = 0; this.breath = 0;
    this.land = { x: 0, v: 0 };
    this.equip = 1; this.equipTarget = 1; this.pending = null;
    this.reload = null; this.inspect = null; this.throwA = null; this.melee = null;
    this.magDrop = [];
    this.leftOverride = null;
    this.visible = true;
  }

  get pose() { return POSE[this.current] || POSE.rifle; }

  model(id) {
    if (!this.models[id]) {
      const b = BUILDERS[id]; if (!b) return null;
      const m = b(this.M);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
      this.models[id] = m;
    }
    return this.models[id];
  }

  /** Troca imediata (sem animação). */
  setWeapon(id) {
    const m = this.model(id);
    if (!m) return;
    this.holder.clear();
    this.holder.add(m);
    this.current = id;
    const s = m.userData.sockets;
    if (s.muzzle) s.muzzle.add(this.flashGroup);
    this.armR.setPose(this.pose.handR);
    if (this.pose.handL) this.armL.setPose(this.pose.handL);
    this.flashMat.userData.U.color.value.set(FLASH_COL[id] || '#7fd8ff');
    this.sideMat.userData.U.color.value.set(FLASH_COL[id] || '#7fd8ff');
    this.light.color.set(FLASH_COL[id] || '#7fd8ff');
    // peças móveis no lugar
    for (const p of Object.values(m.userData.parts)) { if (p !== m) { p.position.set(0, 0, 0); p.rotation.set(0, 0, 0); } }
    if (m.userData.parts.shell) m.userData.parts.shell.visible = false;
  }
  /** Troca animada (abaixa, troca, levanta). */
  switchTo(id) {
    if (id === this.current && this.equipTarget === 1) return;
    this.pending = id; this.equipTarget = 0;
    this.reload = null; this.inspect = null;
  }

  fire(kind = 'auto', strength = 1) {
    const R = this.recoil;
    const K = RECOIL[this.current] || RECOIL.rifle;
    const aimMul = 1 - this.aimK * 0.45;
    R.z.v += K.kick * strength * aimMul;
    R.rx.v += K.pitch * strength * aimMul;
    R.ry.v += (Math.random() - 0.5) * K.yaw * strength;
    R.rz.v += (Math.random() - 0.5) * K.roll * strength;
    this.flash.k = 1;
    this.flashMat.userData.U.seed.value = Math.random() * 6.28;
    this.flashGroup.rotation.z = Math.random() * Math.PI;
    this.flashGroup.scale.setScalar(K.flash * (0.85 + Math.random() * 0.3));
    void kind;
  }
  startReload(duration, { shells = 0 } = {}) {
    if (this.reload) return;
    this.reload = { t: 0, dur: duration, shells, dropped: false, kind: this.current };
    this.inspect = null;
  }
  cancelReload() { this.reload = null; this.resetParts(); }
  startInspect() { if (!this.reload && !this.inspect) this.inspect = { t: 0, dur: 3.2 }; }
  throwGrenade(onRelease) { if (!this.throwA) this.throwA = { t: 0, dur: 0.75, released: false, onRelease }; }
  resetParts() {
    const m = this.models[this.current]; if (!m) return;
    for (const p of Object.values(m.userData.parts)) if (p !== m) { p.position.set(0, 0, 0); p.rotation.set(0, 0, 0); }
    if (m.userData.parts.shell) m.userData.parts.shell.visible = false;
  }

  /**
   * Avança a animação. s = { dt, lookDX, lookDY, speed, grounded, sprint, aim,
   * crouch, stepT, landImpact, jetting, moveX, moveY }
   */
  frame(s) {
    const dt = Math.min(0.05, s.dt);
    const P = this.pose;
    // equipar / trocar
    this.equip = damp(this.equip, this.equipTarget, this.equipTarget > this.equip ? 9 : 14, dt);
    if (this.pending && this.equip < 0.04) { this.setWeapon(this.pending); this.pending = null; this.equipTarget = 1; }
    this.aimK = damp(this.aimK, s.aim && !this.reload && !s.sprint ? 1 : 0, 14, dt);
    this.sprintK = damp(this.sprintK, s.sprint && !this.reload ? 1 : 0, 8, dt);
    this.crouchK = damp(this.crouchK, s.crouch ? 1 : 0, 8, dt);
    this.airK = damp(this.airK, s.grounded ? 0 : 1, 6, dt);
    // balanço do passo
    const moveK = clamp(s.speed / 4.5, 0, 1.6) * (s.grounded ? 1 : 0.15);
    this.bobK = damp(this.bobK, moveK, 8, dt);
    this.bobT = s.stepT;
    this.breath += dt * (1 + this.sprintK * 1.5);
    // inércia do olhar (molas)
    const sw = this.sway;
    spring(sw.x, clamp(-s.lookDX * 1.6, -0.12, 0.12), 160, 18, dt);
    spring(sw.y, clamp(-s.lookDY * 1.6, -0.12, 0.12), 160, 18, dt);
    // recuo
    const R = this.recoil;
    for (const k of ['z', 'rx', 'ry', 'rz']) spring(R[k], 0, 260, 22, dt);
    spring(this.land, 0, 120, 12, dt);
    if (s.landImpact > 0) { this.land.v -= s.landImpact * 1.2; }
    this.flash.k = Math.max(0, this.flash.k - dt * 22);

    // ── pose base ──
    const hip = _v.set(...P.hip);
    // mira: posiciona `sight` em (0,0,−ads)
    const m = this.models[this.current];
    const sight = m?.userData.sockets.sight;
    const adsPos = _w.set(0, 0, -P.ads);
    if (sight) adsPos.sub(sight.position);
    const pos = new THREE.Vector3().copy(hip).lerp(adsPos, easeInOut(this.aimK));
    const rot = new THREE.Vector3(P.rot[0] * D, P.rot[1] * D, P.rot[2] * D).multiplyScalar(1 - this.aimK);
    // corrida
    const sk = easeInOut(this.sprintK);
    pos.add(_v.set(-0.03 * sk, -0.045 * sk, 0.03 * sk));
    rot.x += -14 * D * sk; rot.y += 34 * D * sk; rot.z += 20 * D * sk;
    // agachado: um pouco mais perto
    pos.z += 0.01 * this.crouchK;
    // passo (figura 8)
    const bk = this.bobK * (1 - this.aimK * 0.85) * (1 + sk * 0.6);
    const bt = this.bobT;
    pos.x += Math.sin(bt) * 0.009 * bk;
    pos.y += -Math.abs(Math.cos(bt)) * 0.008 * bk + 0.004 * bk;
    rot.z += Math.sin(bt) * 1.6 * D * bk;
    rot.x += Math.cos(bt * 2) * 0.6 * D * bk;
    // respiração
    const br = (1 - this.aimK * 0.7) * (1 - bk * 0.5);
    pos.y += Math.sin(this.breath * 1.6) * 0.0018 * br;
    rot.x += Math.sin(this.breath * 1.6 + 0.6) * 0.25 * D * br;
    rot.y += Math.sin(this.breath * 0.9) * 0.2 * D * br;
    // inércia
    rot.y += sw.x.x * (1 - this.aimK * 0.6);
    rot.x += sw.y.x * (1 - this.aimK * 0.6);
    pos.x += sw.x.x * 0.03; pos.y -= sw.y.x * 0.02;
    // ar / jetpack / pouso
    pos.y += this.airK * 0.006 + this.land.x * 0.02;
    rot.x += this.land.x * 0.08 - this.airK * 2 * D;
    // recuo
    pos.z += R.z.x; rot.x += R.rx.x; rot.y += R.ry.x; rot.z += R.rz.x;
    // equipar
    const eq = 1 - easeInOut(this.equip);
    pos.y -= eq * 0.18; rot.x -= eq * 40 * D; rot.z += eq * 20 * D;

    // ── recarga ──
    let leftTarget = null, leftPose = P.handL;
    if (this.reload) this.animReload(dt, pos, rot, m, (t, p) => { leftTarget = t; leftPose = p; });
    if (this.inspect) this.animInspect(dt, pos, rot);
    // ── granada ──
    let leftGrenade = false;
    if (this.throwA) leftGrenade = this.animThrow(dt, pos, rot);

    this.pivot.position.copy(pos);
    this.pivot.rotation.set(rot.x, rot.y, rot.z, 'YXZ');
    this.pivot.updateMatrixWorld(true);

    // clarão
    this.flashGroup.visible = this.flash.k > 0.02;
    this.flashMat.userData.U.k.value = this.flash.k;
    this.sideMat.userData.U.k.value = this.flash.k * 0.8;
    if (m?.userData.sockets.muzzle) {
      m.userData.sockets.muzzle.getWorldPosition(_v);
      this.root.worldToLocal(_v);
      this.light.position.copy(_v);
    }
    this.light.intensity = this.flash.k * this.flash.k * 26;

    // ── braços (IK) ──
    this.solveArms(m, leftTarget, leftPose, leftGrenade);
    // queda dos carregadores soltos
    for (let i = this.magDrop.length - 1; i >= 0; i--) {
      const d = this.magDrop[i];
      d.t += dt; d.v.y -= 3.2 * dt;
      d.obj.position.addScaledVector(d.v, dt);
      d.obj.rotation.x += d.spin * dt;
      if (d.t > 0.9) { d.obj.removeFromParent(); this.magDrop.splice(i, 1); }
    }
    this.root.visible = this.visible;
  }

  /** Posição/rotação do punho a partir de um soquete (espaço da raiz). */
  wristFrom(sock, outPos, outQuat) {
    sock.updateWorldMatrix(true, false);
    _m.copy(this.root.matrixWorld).invert().multiply(sock.matrixWorld);
    _m.decompose(outPos, outQuat, _w);
    outPos.add(_v.copy(WRIST_OFF).applyQuaternion(outQuat));
    return outPos;
  }

  solveArms(m, leftTarget, leftPose, leftGrenade) {
    if (!m) return;
    const S = m.userData.sockets;
    const pR = new THREE.Vector3(), qR = new THREE.Quaternion();
    this.wristFrom(S.gripR, pR, qR);
    this.armR.solve(pR, qR);
    const pL = new THREE.Vector3(), qL = new THREE.Quaternion();
    let showL = true;
    if (leftGrenade) {
      this.armL.setPose('hold');
      pL.copy(this.throwPos); qL.copy(this.throwQuat);
    } else if (leftTarget) {
      this.armL.setPose(leftPose || 'hold');
      this.wristFrom(leftTarget, pL, qL);
      if (this.leftBlend !== undefined && S.gripL && this.leftBlend < 1) {
        const p0 = new THREE.Vector3(), q0 = new THREE.Quaternion();
        this.wristFrom(S.gripL, p0, q0);
        pL.lerpVectors(p0, pL, this.leftBlend); qL.slerpQuaternions(q0, qL, this.leftBlend);
      }
    } else if (this.pose.handL && S.gripL) {
      this.armL.setPose(this.pose.handL);
      this.wristFrom(S.gripL, pL, qL);
    } else {
      showL = false;
    }
    // durante a corrida com a multiferramenta/pistola a mão esquerda balança fora da vista
    this.armL.group.visible = showL;
    if (showL) this.armL.solve(pL, qL);
  }

  animReload(dt, pos, rot, m, setLeft) {
    const r = this.reload;
    r.t += dt;
    const k = clamp(r.t / r.dur, 0, 1);
    const id = r.kind;
    const parts = m?.userData.parts || {};
    const S = m?.userData.sockets || {};
    // inclinação geral (entra, segura, sai)
    const tilt = smooth01(k / 0.15) * (1 - smooth01((k - 0.85) / 0.15));
    if (id === 'shotgun') {
      rot.z += 16 * D * tilt; rot.x += 8 * D * tilt; pos.x -= 0.02 * tilt; pos.y += 0.012 * tilt;
      // ciclo por cartucho: mão pega no tubo lateral e empurra na câmara
      const n = Math.max(1, r.shells || 1);
      const seg = clamp((k - 0.12) / 0.7, 0, 0.9999) * n;
      const f = seg % 1;
      const shell = parts.shell;
      if (k > 0.12 && k < 0.82 && shell) {
        shell.visible = true;
        // caminho: abaixo/direita → janela da câmara (lado esquerdo)
        const a = smooth01(f / 0.6);
        shell.position.set(lerp(0.0, -0.034, a), lerp(-0.1, 0.03, a), lerp(-0.02, -0.09, a));
        shell.rotation.set(lerp(-0.6, 0, a), 0, 0);
        setLeft(S.shellHand, 'hold');
        this.leftBlend = smooth01((k - 0.12) / 0.06);
        if (f > 0.6) { const b = smooth01((f - 0.6) / 0.4); shell.position.z = lerp(-0.09, -0.12, b); shell.visible = b < 0.95; pos.z += 0.006 * Math.sin(b * Math.PI); }
      } else if (shell) shell.visible = false;
      // bomba no fim
      if (parts.pump) { const pk = clamp((k - 0.84) / 0.14, 0, 1); parts.pump.position.z = Math.sin(pk * Math.PI) * 0.05; }
      if (k >= 1) this.endReload();
      return;
    }
    rot.z -= 30 * D * tilt; rot.x += 8 * D * tilt; rot.y += 20 * D * tilt;
    pos.x -= 0.075 * tilt; pos.y += 0.07 * tilt; pos.z += 0.04 * tilt;
    const mag = parts.mag;
    // 0.15–0.35: solta e cai; 0.35–0.6: mão busca novo; 0.6–0.78: encaixa; 0.8–0.92: alavanca
    if (mag) {
      if (k < 0.18) mag.position.set(0, 0, 0);
      else if (k < 0.32) {
        const a = smooth01((k - 0.18) / 0.14);
        mag.position.set(0, -0.06 * a, 0.012 * a); mag.rotation.x = -0.2 * a;
        if (!r.dropped && a > 0.6) {
          // carregador velho cai (cópia solta)
          r.dropped = true;
          const old = mag.clone(true);
          mag.updateWorldMatrix(true, false);
          _m.copy(this.root.matrixWorld).invert().multiply(mag.matrixWorld);
          _m.decompose(old.position, old.quaternion, old.scale);
          this.root.add(old);
          this.magDrop.push({ obj: old, v: new THREE.Vector3(0.05, -0.4, 0.05), t: 0, spin: 3 });
        }
      } else if (k < 0.62) {
        const a = smooth01((k - 0.32) / 0.3);
        mag.position.set(-0.02 * (1 - a), lerp(-0.22, -0.07, a), lerp(0.03, 0.01, a)); mag.rotation.x = lerp(-0.6, -0.15, a);
      } else if (k < 0.78) {
        const a = smooth01((k - 0.62) / 0.16);
        mag.position.set(0, lerp(-0.07, 0, a), lerp(0.01, 0, a)); mag.rotation.x = lerp(-0.15, 0, a);
        if (a > 0.85) { pos.y += 0.01 * Math.sin((a - 0.85) / 0.15 * Math.PI); }
      } else mag.position.set(0, 0, 0), mag.rotation.set(0, 0, 0);
      if (S.magHand && k > 0.24 && k < 0.8) {
        setLeft(S.magHand, k < 0.34 ? 'open' : 'hold');
        this.leftBlend = smooth01((k - 0.24) / 0.1) * (1 - smooth01((k - 0.74) / 0.06));
      }
    }
    // alavanca/ferrolho
    const bolt = parts.bolt || parts.slide;
    if (bolt) { const bk = clamp((k - 0.8) / 0.12, 0, 1); bolt.position.z = Math.sin(bk * Math.PI) * 0.035; if (bk > 0 && bk < 1) rot.z += 3 * D * Math.sin(bk * Math.PI); }
    if (k >= 1) this.endReload();
  }
  endReload() { this.reload = null; this.leftBlend = undefined; this.resetParts(); this.onReloadDone?.(); }

  animInspect(dt, pos, rot) {
    const i = this.inspect;
    i.t += dt;
    const k = clamp(i.t / i.dur, 0, 1);
    const a = smooth01(k / 0.2) * (1 - smooth01((k - 0.8) / 0.2));
    const turn = Math.sin(clamp((k - 0.15) / 0.7, 0, 1) * Math.PI);
    pos.x -= 0.06 * a; pos.y += 0.03 * a; pos.z += 0.04 * a;
    rot.y += 50 * D * a - 20 * D * turn; rot.z += 30 * D * a + 25 * D * turn; rot.x += 10 * D * a;
    if (k >= 1) this.inspect = null;
  }

  animThrow(dt, pos, rot) {
    const T = this.throwA;
    T.t += dt;
    const k = clamp(T.t / T.dur, 0, 1);
    // arma abaixa um pouco à direita; mão esquerda sobe, recua e lança
    const lower = Math.sin(k * Math.PI);
    pos.y -= 0.05 * lower; pos.x += 0.02 * lower; rot.z -= 10 * D * lower;
    const wind = smooth01(k / 0.45), fling = smooth01((k - 0.45) / 0.25);
    const p = new THREE.Vector3(-0.16, -0.12, -0.22)
      .lerp(new THREE.Vector3(-0.14, -0.02, -0.06), wind)
      .lerp(new THREE.Vector3(-0.05, 0.02, -0.42), fling);
    this.throwPos = p;
    this.throwQuat = (this.throwQuat || new THREE.Quaternion()).setFromEuler(_e.set(-0.4 - fling * 0.6, 0.6, -0.3 + fling * 0.5));
    this.grenade.visible = k < 0.62;
    if (this.grenade.visible) {
      this.grenade.position.copy(p).add(_v.set(0.0, -0.035, -0.06).applyQuaternion(this.throwQuat));
      this.grenade.quaternion.copy(this.throwQuat);
    }
    if (!T.released && k > 0.6) { T.released = true; T.onRelease?.(); }
    if (k >= 1) { this.throwA = null; this.grenade.visible = false; return false; }
    return k < 0.92;
  }

  /** Atualiza a tela da arma atual. */
  screen(state) { this.models[this.current]?.userData.screen?.draw(state); }
  /** Calor do cano (0..1). */
  setHeat(h) { this.M.barrel.userData.U.heat.value = h; }
  /** Posição de MUNDO da boca da arma. */
  muzzleWorld(out) {
    const m = this.models[this.current];
    const s = m?.userData.sockets.muzzle;
    if (!s) return null;
    s.getWorldPosition(out);
    return out;
  }
}

const FLASH_COL = { rifle: '#6fd6ff', shotgun: '#ff8a3a', sniper: '#d2b4ff', pistol: '#7dff9e', multitool: '#5fe8c8' };
const RECOIL = {
  rifle: { kick: 0.32, pitch: 0.55, yaw: 0.35, roll: 0.5, flash: 1 },
  shotgun: { kick: 0.9, pitch: 1.8, yaw: 0.6, roll: 1.2, flash: 1.7 },
  sniper: { kick: 1.1, pitch: 2.2, yaw: 0.5, roll: 0.6, flash: 1.5 },
  pistol: { kick: 0.4, pitch: 1.2, yaw: 0.5, roll: 0.6, flash: 0.8 },
  multitool: { kick: 0.05, pitch: 0.1, yaw: 0.1, roll: 0.1, flash: 0 },
};
void mix; void float; void _q2;
