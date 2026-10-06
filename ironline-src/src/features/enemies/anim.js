/**
 * Animação procedural do soldado — sem clipes: a pose sai de parâmetros
 * contínuos (velocidade, direção, agachamento, mira, recuo, impacto,
 * recarga, inclinação) e é resolvida a cada frame:
 *
 *   1. quadril/coluna/pescoço/cabeça por FK (ângulos)
 *   2. fuzil ancorado no "bolso" do ombro direito (quadro do peito), mas
 *      APONTADO exatamente para (aimYaw, aimPitch) no espaço do modelo
 *   3. braços por IK de 2 ossos até a empunhadura e o guarda-mão
 *   4. pernas por IK de 2 ossos até alvos de pé gerados por um ciclo de
 *      marcha sem deslizamento (passada = velocidade × fase de apoio)
 *
 * Toda a pose é calculada em espaço do modelo (Qm/Pm) e convertida para
 * rotações locais dos ossos no final. O ragdoll reusa `applyModelPose`.
 */
import * as THREE from 'three';
import { B, NB, PARENT, OFFSET, REST, LEN, frameQuat, twoBoneIK, perp } from './rig.js';
import { GRIP, RIFLE } from './soldier.js';
import { solveSling } from './sling.js';

const TAU = Math.PI * 2;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const [T1, T2, T3, T4, T5, T6, T7] = Array.from({ length: 7 }, () => new THREE.Vector3());

const BLADE = 0.5;
const _e2 = new THREE.Euler();
const qEuler = (x, y, z, out = new THREE.Quaternion(), order = 'YXZ') => out.setFromEuler(_e.set(x, y, z, order));

// quaternions fixos das mãos em relação ao fuzil (ver soldier.js / GRIP)
const HAND_Q = {
  R: qEuler(-1.22, 0, 0, new THREE.Quaternion(), 'XYZ'),
  L: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2 - 0.25, 'XYZ')),
};
const GRIP_OFF = { L: new THREE.Vector3(...GRIP.L), R: new THREE.Vector3(...GRIP.R) };
const W_GRIP_R = new THREE.Vector3(...RIFLE.gripR);
const W_GRIP_L = new THREE.Vector3(...RIFLE.gripL);
const W_GRIP_L_LOW = new THREE.Vector3(0, 0.066, 0.165);
const _lt = new THREE.Vector3();
const _lq = new THREE.Quaternion();
const _rt = new THREE.Vector3();
const _rt2 = new THREE.Vector3();
const W_MAGWELL = new THREE.Vector3(0, -0.04, 0.13);
const W_CHARGE = new THREE.Vector3(0.02, 0.1, -0.03);

/** direções de repouso dos segmentos (filho - pai) */
const REST_DIR = REST.map((p, i) => (PARENT[i] >= 0 ? OFFSET[i].clone().normalize() : new THREE.Vector3(0, 1, 0)));
const Z = new THREE.Vector3(0, 0, 1);
const restSeg = (a, b) => REST[b].clone().sub(REST[a]).normalize();
const D0 = {
  upperArmL: restSeg(B['upperArm.L'], B['foreArm.L']),
  foreArmL: restSeg(B['foreArm.L'], B['hand.L']),
  upperArmR: restSeg(B['upperArm.R'], B['foreArm.R']),
  foreArmR: restSeg(B['foreArm.R'], B['hand.R']),
  thighL: restSeg(B['thigh.L'], B['shin.L']),
  shinL: restSeg(B['shin.L'], B['foot.L']),
  thighR: restSeg(B['thigh.R'], B['shin.R']),
  shinR: restSeg(B['shin.R'], B['foot.R']),
};
void REST_DIR;

/** Mola amortecida escalar. */
class Spring {
  constructor(k = 120, c = 14) {
    this.x = 0;
    this.v = 0;
    this.k = k;
    this.c = c;
  }
  step(dt) {
    this.v += (-this.k * this.x - this.c * this.v) * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

export class Animator {
  constructor(bones, seed = 0) {
    this.bones = bones;
    this.Qm = Array.from({ length: NB }, () => new THREE.Quaternion());
    this.Pm = REST.map((p) => p.clone());
    this.weaponQ = new THREE.Quaternion();
    this.weaponP = new THREE.Vector3();
    this.seed = seed;
    // parâmetros dirigidos pela IA
    this.p = {
      speed: 0, // m/s
      moveX: 0, // direção local (unitária) do movimento
      moveZ: 1,
      crouch: 0, // 0..1
      aim: 0, // 0 = pronto-baixo, 1 = mirando
      aimYaw: 0, // rad, relativo ao corpo (+ = para a esquerda dele)
      aimPitch: 0, // rad, + = para cima
      lean: 0, // -1..1 (+ = inclina para a esquerda dele)
      reload: -1, // progresso 0..1 ou -1
      sprint: 0,
      duck: 0, // 0..1 encolhe sob fogo (cabeça baixa, ombros para dentro)
      headBack: 0, // 0..1 cabeça puxada para trás (execução)
    };
    /**
     * Alvos das mãos no ESPAÇO DO MODELO com peso (0..1): escudo na mão
     * esquerda, faca/agarrão da execução, arremesso de granada. Com peso 0
     * a mão fica na arma (padrão).
     */
    this.over = { L: new THREE.Vector3(), wL: 0, R: new THREE.Vector3(), wR: 0 };
    this.phase = seed * 0.37;
    this.t = seed * 3.1;
    this.recoil = new Spring(260, 22);
    this.hitPitch = new Spring(90, 9);
    this.hitYaw = new Spring(90, 9);
    this.hitRoll = new Spring(90, 9);
    this.headHit = new Spring(150, 11);
    this.legHit = new Spring(70, 8);
    this._gait = 0; // 0 parado .. 1 andando
    this._run = 0;
  }

  fire() {
    this.recoil.v += 3.2 + Math.random() * 0.8;
  }

  /** Impacto de bala: dir no espaço do modelo, parte do corpo. */
  hit(dirLocal, part = 'torso', strength = 1) {
    const k = 7 * strength;
    if (part === 'head') this.headHit.v += 14 * strength;
    if (part === 'leg') this.legHit.v += 6 * strength;
    this.hitPitch.v += -dirLocal.z * k + 2;
    this.hitYaw.v += dirLocal.x * k * 0.6;
    this.hitRoll.v += -dirLocal.x * k * 0.5;
  }

  /** Bala passando rente (near miss): sobressalto curto, sem dano. */
  nearMiss(sideSign = 1, k = 1) {
    this.headHit.v += 4 * k;
    this.hitYaw.v += sideSign * 1.6 * k;
    this.hitPitch.v += 1.2 * k;
  }

  /** Passo da animação. */
  update(dt) {
    const p = this.p;
    this.t += dt;
    const Qm = this.Qm, Pm = this.Pm;
    const v = p.speed;
    this._gait = lerp(this._gait, clamp(v / 0.6, 0, 1), 1 - Math.exp(-dt * 8));
    this._run = lerp(this._run, clamp((v - 2.2) / 1.8, 0, 1), 1 - Math.exp(-dt * 6));
    const gait = this._gait, run = this._run;
    const freq = 0.62 + 0.3 * Math.max(v, 0.6);
    this.phase = (this.phase + dt * freq * gait) % 1;
    const ph = this.phase;
    const rec = this.recoil.step(dt);
    const hp = this.hitPitch.step(dt), hy = this.hitYaw.step(dt), hr = this.hitRoll.step(dt);
    const hh = this.headHit.step(dt), lh = this.legHit.step(dt);
    const breath = Math.sin(this.t * 1.7) * (1 - gait);
    const crouch = p.crouch;
    const aim = p.aim;
    const duck = p.duck || 0;

    // ── quadril ──
    // postura de tiro "lâmina": quadril e peito giram para a direita do
    // atirador, o fuzil continua apontado exatamente para a mira
    const blade = aim * (1 - run) * BLADE;
    const bob = gait * (run > 0.5 ? 0.045 * Math.abs(Math.sin(ph * TAU)) : 0.022 * (0.5 + 0.5 * Math.cos(ph * 2 * TAU)));
    // postura atlética ao mirar: joelhos flexionados, peso sobre a perna de
    // trás; parado sem mirar, o peso troca devagar de uma perna para a outra
    const still = 1 - gait;
    const athletic = aim * still * (1 - crouch);
    const shift = still * (1 - aim) * Math.sin(this.t * 0.37 + this.seed * 5) * 0.034 - athletic * 0.03;
    const kneelH = clamp((crouch - 0.72) / 0.28, 0, 1) * (1 - gait);
    const hipsY = 0.952 - crouch * 0.36 - kneelH * 0.06 - bob - run * 0.04 - Math.abs(lh) * 0.05 - athletic * 0.05 - Math.abs(shift) * 0.25;
    this._shift = shift;
    Pm[B.hips].set(p.lean * 0.04 + Math.sin(ph * TAU) * 0.018 * gait + shift, hipsY, crouch * -0.04 + run * 0.02 - athletic * 0.02);
    const hipYaw = Math.sin(ph * TAU) * 0.12 * gait + p.aimYaw * 0.25 - blade * 1.35;
    const hipPitch = crouch * 0.42 + run * 0.12 + gait * 0.03 + athletic * 0.08;
    // quadril cai do lado da perna sem peso
    const hipRoll = Math.cos(ph * TAU) * 0.035 * gait - shift * 1.6;
    qEuler(hipPitch, hipYaw, hipRoll, Qm[B.hips]);
    Qm[B.root].identity();

    // ── coluna ── (distribui mira em pitch/yaw, compensa a pelve)
    const chestYawT = p.aimYaw - blade; // guinada final desejada do peito
    const yawRest = chestYawT - hipYaw;
    // ombros "para dentro" da arma ao mirar; o recuo empurra o peito para trás
    // meio agachado mirando (por cima de cobertura baixa): tronco projetado
    // para frente, apoiado na mira
    const leanForward = 0.06 + aim * 0.16 + run * 0.14 - crouch * 0.32 - rec * 0.22 + aim * crouch * (1 - crouch) * 0.7 + duck * 0.5;
    const pitchUp = p.aimPitch;
    const comp = shift * 1.2; // coluna compensa a inclinação do quadril
    qEuler(leanForward * 0.5 - pitchUp * 0.25 + hp * 0.5 + breath * 0.01 + athletic * -0.04, yawRest * 0.45 + hy * 0.5 + rec * 0.04, p.lean * 0.12 + hr * 0.5 + comp, _q);
    Qm[B.spine].multiplyQuaternions(Qm[B.hips], _q);
    qEuler(leanForward * 0.5 - pitchUp * 0.35 + hp * 0.5 + breath * 0.015, yawRest * 0.55 + hy * 0.5 + rec * 0.06, p.lean * 0.18 + hr * 0.5 + comp * 0.6 - rec * 0.05, _q);
    Qm[B.chest].multiplyQuaternions(Qm[B.spine], _q);

    // FK das posições até o peito
    for (const b of [B.spine, B.chest]) Pm[b].copy(OFFSET[b]).applyQuaternion(Qm[PARENT[b]]).add(Pm[PARENT[b]]);

    // ── pescoço/cabeça ── olha na direção da mira; encosta no fuzil ao mirar
    const chestE = _e2.setFromQuaternion(Qm[B.chest], 'YXZ');
    const lookYaw = p.aimYaw - chestE.y;
    const lookPitch = -pitchUp - chestE.x;
    qEuler(lookPitch * 0.4 + aim * 0.2, lookYaw * 0.45, -aim * 0.1, _q);
    Qm[B.neck].multiplyQuaternions(Qm[B.chest], _q);
    qEuler(lookPitch * 0.6 + aim * 0.12 + hh * 0.6 + duck * 0.55 - (p.headBack || 0) * 0.9, lookYaw * 0.55 + hh * 0.2 - aim * 0.12, -aim * 0.22 + hh * 0.2, _q);
    Qm[B.head].multiplyQuaternions(Qm[B.neck], _q);
    for (const b of [B.neck, B.head, B['upperArm.L'], B['upperArm.R'], B['thigh.L'], B['thigh.R']])
      Pm[b].copy(OFFSET[b]).applyQuaternion(Qm[PARENT[b]]).add(Pm[PARENT[b]]);
    // protração dos ombros ao mirar (escápulas para frente)
    // (sem clavícula: a protração vem da postura lâmina + inclinação)
    // ── fuzil ──
    // bolso do ombro (espaço do peito) — mirando vs. pronto-baixo
    const pocket = _v.set(lerp(-0.125, -0.09, 1 - aim), lerp(0.2, 0.12, 1 - aim), lerp(0.085, 0.15, 1 - aim));
    pocket.applyQuaternion(Qm[B.chest]).add(Pm[B.chest]);
    // orientação: mira exata (aim) ou cano para baixo (pronto-baixo / corrida)
    const lowPitch = -0.62 - run * 0.2, lowYaw = 0.55 + run * 0.25;
    const relaxed = 1 - aim;
    const rl = p.reload >= 0 ? Math.sin(Math.PI * clamp(p.reload * 1.15, 0, 1)) : 0;
    const wy = lerp(p.aimYaw, chestYawT + lowYaw, relaxed) + rl * 0.25;
    const wp = lerp(pitchUp, lowPitch + pitchUp * 0.3, relaxed) + rec * 0.07 - rl * 0.35;
    const wr = lerp(0, -0.5, relaxed) * (1 - run * 0.3) + rl * 0.7;
    qEuler(-wp, wy, wr, this.weaponQ);
    // coronha no bolso: origem = bolso - Q·coronha
    this.weaponP.copy(RIFLE_BUTT).applyQuaternion(this.weaponQ).negate().add(pocket);
    // mirando: a mira fica logo abaixo/à frente do olho direito (solda de
    // bochecha) — a coronha cai naturalmente no ombro
    if (aim > 0) {
      const eye = _v3.copy(EYE_R).applyQuaternion(Qm[B.head]).add(Pm[B.head]);
      eye.addScaledVector(_v2.set(0, -0.042, 0.17).applyQuaternion(this.weaponQ), 1);
      const wEye = eye.sub(_v2.copy(OPTIC).applyQuaternion(this.weaponQ));
      this.weaponP.lerp(wEye, aim * (1 - rl * 0.7));
    }
    this.weaponP.addScaledVector(_v2.set(0, 0, -1).applyQuaternion(this.weaponQ), rec * 0.045);
    if (relaxed > 0) this.weaponP.addScaledVector(_v2.set(0.03, -0.05, -0.02).applyQuaternion(Qm[B.chest]), relaxed);
    if (rl > 0) this.weaponP.addScaledVector(_v2.set(0.05, -0.05, 0.02).applyQuaternion(Qm[B.chest]), rl);


    // ── braços (IK até o fuzil) ──
    const ov = this.over;
    let rightTarget = W_GRIP_R;
    if (ov.wR > 0) rightTarget = this._toWeapon(ov.R, _rt).lerpVectors(W_GRIP_R, _rt, Math.min(1, ov.wR));
    this._arm('R', rightTarget, _v3.set(-0.7, -0.6, -0.25));
    // mão esquerda: guarda-mão, ou ciclo de recarga
    let leftTarget = _lt.lerpVectors(W_GRIP_L, W_GRIP_L_LOW, 1 - aim);
    let leftQ = null;
    if (p.reload >= 0) {
      const r = p.reload;
      const pouch = _v2.set(0.0, -0.08, 0.26).applyQuaternion(Qm[B.chest]).add(Pm[B.chest]);
      const inv = _q2.copy(this.weaponQ).invert();
      const pouchW = pouch.sub(this.weaponP).applyQuaternion(inv); // bolsa no espaço do fuzil
      const seq = [
        [0.0, W_GRIP_L],
        [0.18, W_MAGWELL],
        [0.42, pouchW.clone()],
        [0.68, W_MAGWELL],
        [0.82, W_CHARGE],
        [1.0, W_GRIP_L],
      ];
      for (let i = 0; i < seq.length - 1; i++) {
        if (r <= seq[i + 1][0]) {
          const t = (r - seq[i][0]) / (seq[i + 1][0] - seq[i][0]);
          const s = t * t * (3 - 2 * t);
          leftTarget = _lt.lerpVectors(seq[i][1], seq[i + 1][1], s);
          break;
        }
      }
      leftQ = qEuler(0, 0, -0.6, _lq, 'XYZ');
    }
    if (ov.wL > 0) leftTarget = _lt.lerp(this._toWeapon(ov.L, _rt2), Math.min(1, ov.wL));
    this._arm('L', leftTarget, _v3.set(0.45, -0.85, -0.1), leftQ);

    // ── pernas (IK até alvos de pé) ──
    this._legs(dt, gait, run, crouch, ph, hipYaw, aim);

    this.applyModelPose();
  }

  /** Ponto do espaço do modelo → espaço do fuzil. */
  _toWeapon(pm, out) {
    return out.copy(pm).sub(this.weaponP).applyQuaternion(_q2.copy(this.weaponQ).invert());
  }

  /** IK do braço até um ponto do fuzil (espaço do fuzil). */
  _arm(side, wPoint, poleChest, handQOverride = null) {
    const Qm = this.Qm, Pm = this.Pm;
    const ua = B['upperArm.' + side], fa = B['foreArm.' + side], hd = B['hand.' + side];
    const qHand = Qm[hd].multiplyQuaternions(this.weaponQ, handQOverride || HAND_Q[side]);
    const grip = _v.copy(wPoint).applyQuaternion(this.weaponQ).add(this.weaponP);
    const wrist = grip.sub(_v2.copy(GRIP_OFF[side]).applyQuaternion(qHand));
    const S = Pm[ua];
    const pole = _v3.copy(poleChest).applyQuaternion(Qm[B.chest]);
    const E = twoBoneIK(S, wrist, LEN.upperArm, LEN.foreArm, pole, Pm[fa]);
    // upper arm
    const du = _d.subVectors(E, S).normalize();
    const fdir = T1.subVectors(wrist, E);
    const sU = perp(fdir, du, _s) || perp(pole, du, _s) || _s.set(0, 0, 1);
    const d0u = side === 'L' ? D0.upperArmL : D0.upperArmR;
    frameQuat(du, sU, d0u, Z, Qm[ua]);
    // forearm: mesmo eixo de dobradiça
    const a = T2.crossVectors(du, sU);
    const df = fdir.normalize();
    const sF = T3.crossVectors(a, df);
    const d0f = side === 'L' ? D0.foreArmL : D0.foreArmR;
    const a0 = T4.crossVectors(d0u, perp(Z, d0u, T5));
    const s0f = T5.crossVectors(a0, d0f);
    frameQuat(df, sF, d0f, s0f, Qm[fa]);
    Pm[hd].copy(OFFSET[hd]).applyQuaternion(Qm[fa]).add(Pm[fa]);
  }

  _legs(dt, gait, run, crouch, ph, hipYaw, aim) {
    const Qm = this.Qm, Pm = this.Pm, p = this.p;
    const v = p.speed;
    const duty = lerp(0.62, 0.36, run);
    const freq = 0.62 + 0.3 * Math.max(v, 0.6);
    const stride = (v * duty) / freq; // deslocamento durante o apoio
    const mx = p.moveX, mz = p.moveZ;
    const fwd = _v3.set(0, 0, 1).applyQuaternion(Qm[B.hips]);
    fwd.y = 0;
    fwd.normalize();
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const th = B['thigh.' + side], sh = B['shin.' + side], ft = B['foot.' + side];
      // posição de descanso do pé (postura)
      // base de tiro: pé esquerdo à frente, direito atrás e aberto, girados
      // com a "lâmina" do quadril (senão as pernas torcem)
      const st = aim * (1 - gait);
      let stanceZ = (side === 'L' ? 0.17 : -0.15) * st + (side === 'L' ? 0.18 : -0.2) * crouch;
      let stanceX = sx * (0.12 + 0.06 * st + 0.05 * crouch);
      const by = -BLADE * aim * (1 - gait) * 0.85;
      const cb = Math.cos(by), sb = Math.sin(by);
      [stanceX, stanceZ] = [stanceX * cb + stanceZ * sb, -stanceX * sb + stanceZ * cb];
      let fx = stanceX, fz = stanceZ, fy = 0.095;
      let pitch = 0;
      // ciclo de marcha
      if (gait > 0.01) {
        const lph = (ph + (side === 'L' ? 0 : 0.5)) % 1;
        let off, lift = 0;
        if (lph < duty) {
          const u = lph / duty;
          off = stride * (0.5 - u);
          pitch = u > 0.75 ? -(u - 0.75) * 2.2 : 0; // calcanhar sobe no fim do apoio
        } else {
          const u = (lph - duty) / (1 - duty);
          const s = u * u * (3 - 2 * u);
          off = stride * (-0.5 + s);
          lift = Math.sin(Math.PI * u) * lerp(0.09, 0.2, run);
          pitch = lerp(-0.5, 0.35, u) * (0.6 + run * 0.6);
        }
        fx = lerp(fx, sx * 0.1, gait) + mx * off * gait;
        fz = lerp(fz, 0, gait) + mz * off * gait;
        fy += lift * gait;
      }
      // agachado: calcanhar de trás levanta; bem agachado e parado, o
      // joelho de trás desce ao chão (ajoelhado de cobertura), peito do pé
      // apoiado nos dedos
      const kneel = clamp((crouch - 0.72) / 0.28, 0, 1) * (1 - gait);
      if (side === 'R' && crouch > 0) {
        fy += 0.05 * crouch * (1 - kneel);
        pitch -= 0.6 * crouch + 0.55 * kneel;
        fz -= 0.2 * kneel;
        fx -= 0.03 * kneel;
      }
      if (side === 'L') fz += 0.1 * kneel;
      const target = _v.set(fx, fy, fz);
      const H = Pm[th];
      const pole = _v2.copy(fwd);
      pole.x += sx * 0.15;
      pole.normalize();
      const K = twoBoneIK(H, target, LEN.thigh, LEN.shin, pole, Pm[sh]);
      const dt_ = T1.subVectors(K, H).normalize();
      const shinDir = T2.subVectors(target, K);
      const back = perp(shinDir, dt_, T3);
      const sT = back ? back.negate() : perp(pole, dt_, T3) || T3.set(0, 0, 1);
      const d0t = side === 'L' ? D0.thighL : D0.thighR;
      frameQuat(dt_, sT, d0t, Z, Qm[th]);
      const a = T4.crossVectors(dt_, sT);
      const ds = shinDir.normalize();
      const sS = T5.crossVectors(a, ds);
      const d0s = side === 'L' ? D0.shinL : D0.shinR;
      const a0 = T6.crossVectors(d0t, perp(Z, d0t, T7));
      const s0s = T7.crossVectors(a0, d0s);
      frameQuat(ds, sS, d0s, s0s, Qm[sh]);
      Pm[ft].copy(OFFSET[ft]).applyQuaternion(Qm[sh]).add(Pm[sh]);
      // pé: plano no chão, guinada do corpo + ponta para fora
      const yaw = Math.atan2(fwd.x, fwd.z) * 0.6 + sx * 0.12;
      qEuler(-pitch, yaw, 0, Qm[ft]);
    }
  }

  /** Converte Qm/Pm (espaço do modelo) em transformações locais dos ossos. */
  applyModelPose() {
    const bones = this.bones, Qm = this.Qm;
    for (let i = 0; i < NB; i++) {
      const bone = bones[i];
      if (i > B.weapon) continue; // bandoleira: sling.js
      if (i === B.weapon) {
        bone.position.copy(this.weaponP);
        bone.quaternion.copy(this.weaponQ);
        continue;
      }
      const par = PARENT[i];
      if (par < 0) bone.quaternion.copy(Qm[i]);
      else bone.quaternion.copy(_q.copy(Qm[par]).invert().multiply(Qm[i]));
      if (i === B.hips) bone.position.copy(this.Pm[B.hips]);
    }
    solveSling(this);
  }

  /** Posição de um ponto do fuzil no espaço do modelo. */
  weaponPoint(local, out = new THREE.Vector3()) {
    return out.copy(local).applyQuaternion(this.weaponQ).add(this.weaponP);
  }
}

const RIFLE_BUTT = new THREE.Vector3(...RIFLE.butt);
const EYE_R = new THREE.Vector3(-0.032, 0.11, 0.085);
const OPTIC = new THREE.Vector3(0, 0.153, 0.07);
