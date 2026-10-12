// Controlador de personagem a pé.
//
// O jogador vive num ÂNCORA (referencial) que pode girar e se mover:
//   • 'body'  — superfície de um planeta que gira (gravidade radial; a posição
//               fica no referencial local do corpo, então o chão "carrega" o
//               jogador junto com a rotação)
//   • 'frame' — interior de nave/estação ({pos, quat} mutável pelo dono;
//               gravidade artificial no −Y local)
//   • 'world' — EVA no espaço (gravidade zero, jetpack em 6 eixos)
//
// Física no passo fixo: aceleração no plano do chão, atrito, pulo, agachar,
// correr, jetpack com combustível, degraus, inclinação máxima (escorrega),
// escalada leve de bordas (até ~2 m), queda com dano, nado raso. Colisão:
// chão procedural (ctx.collision.ground) + caixas/esferas (resolveSphere).
import * as THREE from 'three/webgpu';
import { clamp, damp, quatFromFwdUp, anyPerp, easeInOut } from './util.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qi = new THREE.Quaternion();
const _g = { height: Infinity, normal: new THREE.Vector3(), material: null };
const _res = { pos: new THREE.Vector3(), hit: false, normal: new THREE.Vector3(), onGround: false };
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);

export const K = {
  walk: 4.2, run: 7.6, crouch: 2.1, aimWalk: 2.6,
  accelGround: 42, accelAir: 7, friction: 11,
  jump: 5.4, stepUp: 0.48, snap: 0.42, maxSlope: 0.62, // cos(~52°)
  radius: 0.34, height: 1.8, crouchHeight: 1.15, eye: 1.66, crouchEye: 1.05,
  jetThrust: 17, jetFuelUse: 0.34, jetRegen: 0.22, jetRegenDelay: 0.9,
  fallSafe: 13, fallLethal: 34,
  mantleMin: 0.55, mantleMax: 2.15, mantleTime: 0.55,
};

export class Controller {
  constructor(ctx) {
    this.ctx = ctx;
    this.anchor = { kind: 'world' };
    this.local = new THREE.Vector3();     // pés, no referencial do âncora
    this.prevLocal = new THREE.Vector3();
    this.vel = new THREE.Vector3();       // m/s no referencial do âncora
    this.fwd = new THREE.Vector3(0, 0, -1); // frente horizontal (âncora)
    this.upL = new THREE.Vector3(0, 1, 0);
    this.pitch = 0;
    this.roll = 0;
    this.grounded = false; this.groundT = 0; this.airT = 0;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.groundMat = null;
    this.crouch = 0; this.crouching = false;
    this.sprinting = false; this.aiming = false;
    this.fuel = 1; this.jetting = false; this.jetIdle = 0;
    this.mantle = null;
    this.speed = 0;
    this.landImpact = 0;    // para a câmera (afunda ao pousar)
    this.stepT = 0;         // fase dos passos (head bob)
    this.footstep = 0;      // 1 no passo (som/poeira)
    this.swim = 0;
    this.noclip = false;
    this.frozen = false;
    this.lookYaw = 0; this.lookPitch = 0; // deltas do frame (sway da arma)
    this.minFall = 0;
    this.worldPos = new THREE.Vector3();
    this.worldUp = new THREE.Vector3(0, 1, 0);
    this.lastSupport = 'none';
    this.supportShapeT = 0;
  }

  // ─── âncoras ──────────────────────────────────────────────────────────
  anchorQuat(out = new THREE.Quaternion(), t = this.ctx.time.world) {
    const a = this.anchor;
    if (a.kind === 'body') return a.body.rotationAt(t, out);
    if (a.kind === 'frame') return out.copy(a.frame.quat);
    return out.identity();
  }
  toWorld(local, out = new THREE.Vector3(), t = this.ctx.time.world) {
    const a = this.anchor;
    if (a.kind === 'body') return a.body.localToWorld(local, t, out);
    if (a.kind === 'frame') return out.copy(local).applyQuaternion(a.frame.quat).add(a.frame.pos);
    return out.copy(local);
  }
  toLocal(world, out = new THREE.Vector3(), t = this.ctx.time.world) {
    const a = this.anchor;
    if (a.kind === 'body') return a.body.worldToLocal(world, t, out);
    if (a.kind === 'frame') return out.copy(world).sub(a.frame.pos).applyQuaternion(_qi.copy(a.frame.quat).invert());
    return out.copy(world);
  }
  dirToWorld(d, out = new THREE.Vector3()) { return out.copy(d).applyQuaternion(this.anchorQuat(_q2)); }
  dirToLocal(d, out = new THREE.Vector3()) { return out.copy(d).applyQuaternion(this.anchorQuat(_q2).invert()); }

  /** Up local (gravidade) para uma posição local. */
  upAt(local, out = new THREE.Vector3()) {
    const a = this.anchor;
    if (a.kind === 'body') return out.copy(local).normalize();
    if (a.kind === 'frame') return out.copy(a.up || Y);
    return out.copy(this.upL);
  }
  gravity() {
    const a = this.anchor;
    if (a.kind === 'body') return a.body.gravity || 9.2;
    if (a.kind === 'frame') return a.gravity ?? 9.4;
    return 0;
  }

  /**
   * Troca de âncora preservando a posição/orientação de mundo.
   * anchor: {kind:'body', body} | {kind:'frame', frame, up?, gravity?, id?} | {kind:'world'}
   */
  setAnchor(anchor, worldPos = null, worldFwd = null) {
    const t = this.ctx.time.world;
    const wp = worldPos ? _w.copy(worldPos) : this.toWorld(this.local, _w, t);
    const wf = worldFwd ? _f.copy(worldFwd) : this.dirToWorld(this.fwd, _f);
    const wv = this.dirToWorld(this.vel, _r);
    this.anchor = anchor;
    this.toLocal(wp, this.local, t);
    this.prevLocal.copy(this.local);
    this.upAt(this.local, this.upL);
    this.dirToLocal(wv, this.vel);
    this.dirToLocal(wf, this.fwd);
    this.fwd.addScaledVector(this.upL, -this.fwd.dot(this.upL));
    if (this.fwd.lengthSq() < 1e-6) anyPerp(this.upL, this.fwd);
    this.fwd.normalize();
  }

  /** Teleporta (posição de mundo dos pés + direção de olhar opcional). */
  place(worldPos, worldFwd = null, anchor = null) {
    if (anchor) this.anchor = anchor;
    this.setAnchor(this.anchor, worldPos, worldFwd || this.dirToWorld(this.fwd, new THREE.Vector3()));
    this.vel.set(0, 0, 0);
    this.mantle = null;
    this.grounded = false;
  }

  // ─── olhar ────────────────────────────────────────────────────────────
  look(dx, dy) {
    this.lookYaw += dx; this.lookPitch += dy;
    if (this.anchor.kind === 'world') {
      // EVA: guinada em torno do "up" da cabeça, arfagem livre girando a base
      this.fwd.applyAxisAngle(this.upL, -dx).normalize();
      this.pitch = clamp(this.pitch - dy, -1.5, 1.5);
      return;
    }
    this.fwd.applyAxisAngle(this.upL, -dx).normalize();
    this.pitch = clamp(this.pitch - dy, -1.52, 1.52);
  }

  /** Quaternion de mundo da cabeça (sem bob/recuo). */
  headQuat(out = new THREE.Quaternion(), t = this.ctx.time.world) {
    quatFromFwdUp(this.fwd, this.upL, _q);
    _q2.setFromAxisAngle(X, this.pitch);
    _q.multiply(_q2);
    if (this.roll) _q.multiply(_q2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.roll));
    return out.copy(this.anchorQuat(_qi, t)).multiply(_q);
  }
  eyeHeight() { return THREE.MathUtils.lerp(K.eye, K.crouchEye, this.crouch); }
  bodyHeight() { return THREE.MathUtils.lerp(K.height, K.crouchHeight, this.crouch); }

  // ─── passo fixo ───────────────────────────────────────────────────────
  step(dt, inp) {
    const ctx = this.ctx, t = ctx.time.world;
    this.prevLocal.copy(this.local);
    this.footstep = 0;
    if (this.frozen) { this.vel.set(0, 0, 0); this.syncWorld(t); return; }
    this.upAt(this.local, this.upL);
    const up = this.upL;
    // mantém a frente tangente (transporte paralelo sobre a esfera)
    this.fwd.addScaledVector(up, -this.fwd.dot(up));
    if (this.fwd.lengthSq() < 1e-8) anyPerp(up, this.fwd);
    this.fwd.normalize();

    if (this.mantle) { this.stepMantle(dt, t); return; }
    if (this.anchor.kind === 'world') { this.stepEva(dt, inp, t); return; }

    const right = _r.crossVectors(this.fwd, up).normalize();
    // agachar (segura) / correr
    const wantCrouch = !!inp.crouch;
    if (!wantCrouch && this.crouching) {
      // só levanta se couber
      if (!this.ceilingBlocked(t)) this.crouching = false;
    } else this.crouching = wantCrouch;
    this.crouch = damp(this.crouch, this.crouching ? 1 : 0, 12, dt);
    this.sprinting = !!inp.sprint && inp.moveY > 0.3 && !this.crouching && !this.aiming;
    let max = this.crouching ? K.crouch : this.sprinting ? K.run : this.aiming ? K.aimWalk : K.walk;
    if (this.swim > 0.5) max *= 0.45;
    max *= inp.speedMul ?? 1;
    // velocidade desejada no plano
    const wish = _v.set(0, 0, 0).addScaledVector(this.fwd, inp.moveY).addScaledVector(right, inp.moveX);
    const wl = Math.min(1, wish.length());
    if (wl > 1e-4) wish.normalize().multiplyScalar(wl * max);
    const vUp = this.vel.dot(up);
    const hv = _u.copy(this.vel).addScaledVector(up, -vUp);
    if (this.grounded) {
      // no chão: aceleração forte + atrito; projeta no plano do chão
      const n = this.groundNormal;
      const dv = wish.clone().sub(hv);
      const acc = K.accelGround * (wl > 0.01 ? 1 : 1.3);
      const m = dv.length(), lim = acc * dt;
      if (m > lim) dv.multiplyScalar(lim / m);
      hv.add(dv);
      if (wl < 0.01) hv.multiplyScalar(Math.exp(-K.friction * dt));
      this.vel.copy(hv).addScaledVector(up, Math.min(0, vUp));
      // segue o declive
      const into = this.vel.dot(n);
      if (into < 0) this.vel.addScaledVector(n, -into * 0.0);
    } else {
      const dv = wish.clone().sub(hv);
      const lim = K.accelAir * dt * (this.jetting ? 2.2 : 1);
      const m = dv.length();
      if (m > lim && wl > 0.01) dv.multiplyScalar(lim / m);
      if (wl > 0.01) hv.add(dv);
      this.vel.copy(hv).addScaledVector(up, vUp);
    }
    // pulo / jetpack / escalada
    this.jetting = false;
    if (inp.jumpPressed && this.grounded && !this.crouching) {
      if (!this.tryMantle(t)) { this.vel.addScaledVector(up, K.jump); this.grounded = false; this.airT = 0; this.jetLock = 0.22; }
    } else if (inp.jumpPressed && !this.grounded) {
      this.tryMantle(t);
    }
    this.jetLock = Math.max(0, (this.jetLock || 0) - dt);
    if (this.mantle) { this.syncWorld(t); return; }
    if (inp.jump && !this.grounded && this.jetLock <= 0 && this.fuel > 0.01 && inp.jetpack !== false) {
      this.jetting = true;
      const vu = this.vel.dot(up);
      const thrust = K.jetThrust * (vu < 0 ? 1.6 : 1) * (vu > 7 ? 0.25 : 1);
      this.vel.addScaledVector(up, thrust * dt);
      // empuxo também para a frente (planar)
      if (wl > 0.01) this.vel.addScaledVector(wish, 0.7 * dt);
      this.fuel = Math.max(0, this.fuel - K.jetFuelUse * dt);
      this.jetIdle = 0;
    } else {
      this.jetIdle += dt;
      if (this.grounded && this.jetIdle > K.jetRegenDelay) this.fuel = Math.min(1, this.fuel + K.jetRegen * dt);
      else if (this.jetIdle > K.jetRegenDelay * 2.5) this.fuel = Math.min(1, this.fuel + K.jetRegen * 0.25 * dt);
    }
    // gravidade
    const g = this.gravity();
    if (!this.grounded) this.vel.addScaledVector(up, -g * dt * (this.swim > 0.5 ? 0.15 : 1));
    // água: empuxo e arrasto
    if (this.swim > 0) {
      this.vel.addScaledVector(up, g * 0.9 * this.swim * dt);
      this.vel.multiplyScalar(Math.exp(-2.2 * this.swim * dt));
    }
    // integra e colide
    const wasGrounded = this.grounded;
    const fallSpeed = -this.vel.dot(up);
    this.local.addScaledVector(this.vel, dt);
    this.collide(dt, t, wasGrounded);
    // pouso: impacto (câmera + dano de queda)
    if (!wasGrounded && this.grounded) {
      this.landImpact = Math.min(1, fallSpeed / 12);
      if (fallSpeed > K.fallSafe && this.swim < 0.3) {
        const dmg = clamp((fallSpeed - K.fallSafe) / (K.fallLethal - K.fallSafe), 0, 1.2);
        ctx.bus.emit('player:damage', { amount: dmg, type: 'fall' });
      }
      if (fallSpeed > 3) this.footstep = Math.min(1, fallSpeed / 8);
    }
    if (this.grounded) { this.groundT += dt; this.airT = 0; } else { this.airT += dt; this.groundT = 0; }
    // passos
    const sp = _u.copy(this.vel).addScaledVector(up, -this.vel.dot(up)).length();
    this.speed = sp;
    if (this.grounded && sp > 0.4) {
      const prev = this.stepT;
      this.stepT += dt * (sp / (this.sprinting ? 2.35 : 1.75)) * Math.PI;
      if (Math.floor(prev / Math.PI) !== Math.floor(this.stepT / Math.PI)) this.footstep = Math.max(this.footstep, Math.min(1, sp / K.run));
    }
    this.syncWorld(t);
  }

  /** Atualiza posição/up de mundo em cache. */
  syncWorld(t) {
    this.toWorld(this.local, this.worldPos, t);
    this.dirToWorld(this.upL, this.worldUp);
  }

  /** Colisão: chão procedural + formas (caixas/esferas). */
  collide(dt, t, wasGrounded) {
    const ctx = this.ctx, col = ctx.collision;
    const up = this.upL;
    const W = this.toWorld(this.local, new THREE.Vector3(), t);
    const upW = this.dirToWorld(up, new THREE.Vector3());
    let grounded = false;
    let support = 'none';
    // ── formas (interiores, coberturas, rochas): esferas dos pés e da cabeça
    const R = K.radius;
    const H = this.bodyHeight();
    if (col.shapes.size) {
      for (let pass = 0; pass < 2; pass++) {
        const feet = _w.copy(W).addScaledVector(upW, R);
        col.resolveSphere(feet, R, upW, _res);
        if (_res.hit) {
          const corr = _v.copy(_res.pos).sub(feet);
          const nUp = _res.normal.dot(upW);
          // degrau: obstáculo baixo à frente → sobe em vez de parar
          if (nUp < 0.55 && pass === 0 && (wasGrounded || this.jetting)) {
            const lift = _u.copy(W).addScaledVector(upW, R + K.stepUp);
            const r2 = col.resolveSphere(lift, R, upW, { pos: new THREE.Vector3(), hit: false, normal: new THREE.Vector3(), onGround: false });
            if (!r2.hit) {
              // procura o topo do degrau
              const hit = col.raycast(_f.copy(lift).addScaledVector(upW, 0), _r.copy(upW).negate(), K.stepUp + R + 0.05);
              if (hit && hit.tag !== 'ground' && hit.normal.dot(upW) > K.maxSlope) {
                W.copy(hit.point);
                grounded = true; support = 'shape';
                continue;
              }
            }
          }
          W.add(corr);
          if (_res.onGround || nUp > K.maxSlope) { grounded = true; support = 'shape'; }
          // remove a componente da velocidade contra a normal
          const nL = this.dirToLocal(_res.normal, new THREE.Vector3());
          const vn = this.vel.dot(nL);
          if (vn < 0) this.vel.addScaledVector(nL, -vn);
        }
      }
      // cabeça
      const head = _w.copy(W).addScaledVector(upW, H - R);
      col.resolveSphere(head, R, null, _res);
      if (_res.hit) {
        const corr = _v.copy(_res.pos).sub(head);
        // não deixa a cabeça empurrar o corpo para dentro do chão
        const cu = corr.dot(upW);
        if (cu < 0 && grounded) corr.addScaledVector(upW, -cu);
        W.add(corr);
        const nL = this.dirToLocal(_res.normal, new THREE.Vector3());
        const vn = this.vel.dot(nL);
        if (vn < 0) this.vel.addScaledVector(nL, -vn);
      }
      // gruda no piso de formas (descendo rampas/escadas)
      if (!grounded && wasGrounded && this.vel.dot(up) <= 0.5) {
        const hit = col.raycast(_f.copy(W).addScaledVector(upW, 0.3), _r.copy(upW).negate(), 0.3 + K.snap);
        if (hit && hit.tag !== 'ground' && hit.normal.dot(upW) > K.maxSlope) { W.copy(hit.point); grounded = true; support = 'shape'; }
      }
    }
    // ── chão procedural (terreno do planeta)
    if (col.grounds.size) {
      col.ground(W, _g);
      if (Number.isFinite(_g.height)) {
        const h = _g.height;
        const slopeOk = _g.normal.dot(upW) > K.maxSlope;
        const vUp = this.vel.dot(up);
        if (h < 0 || (wasGrounded && h < K.snap && vUp <= 0.3 && support !== 'shape')) {
          W.addScaledVector(upW, -h);
          if (slopeOk) {
            grounded = true; support = support === 'shape' ? 'shape' : 'ground';
            this.groundNormal.copy(this.dirToLocal(_g.normal, _v));
            if (vUp < 0) this.vel.addScaledVector(up, -vUp);
          } else {
            // íngreme: escorrega pelo declive, sem andar para cima
            const nL = this.dirToLocal(_g.normal, _v);
            const vn = this.vel.dot(nL);
            if (vn < 0) this.vel.addScaledVector(nL, -vn);
            const slide = nL.clone().addScaledVector(up, -nL.dot(up));
            this.vel.addScaledVector(slide, this.gravity() * dt * 0.8);
          }
          this.groundMat = _g.material;
        }
        // água rasa / nado (mar no nível 0 do terreno)
        const mat = _g.material || '';
        if (this.anchor.kind === 'body' && mat.endsWith(':submerso')) {
          const r = this.anchor.body.worldToLocal(W, t, _v).length() - this.anchor.body.radius;
          this.swim = clamp((-r - 0.9) / 0.6, 0, 1);
          if (this.swim > 0.5) grounded = false;
        } else this.swim = 0;
      }
    }
    if (support === 'shape') this.groundNormal.copy(up);
    this.grounded = grounded;
    this.lastSupport = support;
    this.toLocal(W, this.local, t);
  }

  ceilingBlocked(t) {
    const col = this.ctx.collision;
    if (!col.shapes.size) return false;
    const W = this.toWorld(this.local, _w, t);
    const upW = this.dirToWorld(this.upL, _u);
    const hit = col.raycast(_f.copy(W).addScaledVector(upW, K.crouchHeight - 0.1), upW, K.height - K.crouchHeight + 0.15);
    return !!(hit && hit.tag !== 'ground');
  }

  // ─── escalada leve ────────────────────────────────────────────────────
  tryMantle(t) {
    const col = this.ctx.collision;
    const W = this.toWorld(this.local, new THREE.Vector3(), t);
    const upW = this.dirToWorld(this.upL, new THREE.Vector3());
    const fW = this.dirToWorld(this.fwd, new THREE.Vector3());
    // 1) parede à frente na altura do peito/cintura
    let wall = false;
    for (const hgt of [0.7, 1.2]) {
      const o = _v.copy(W).addScaledVector(upW, hgt);
      const hit = col.raycast(o, fW, 0.95);
      if (hit && hit.normal.dot(upW) < 0.5) { wall = true; break; }
    }
    if (!wall) return false;
    // 2) espaço livre acima da borda
    const top = _v.copy(W).addScaledVector(upW, K.mantleMax + 0.3);
    if (col.raycast(top, fW, 0.95)) return false;
    // 3) superfície do topo
    const probe = _u.copy(top).addScaledVector(fW, 0.7);
    const down = col.raycast(probe, _r.copy(upW).negate(), K.mantleMax + 0.3);
    if (!down || down.normal.dot(upW) < K.maxSlope) return false;
    const rise = down.point.clone().sub(W).dot(upW);
    if (rise < K.mantleMin || rise > K.mantleMax) return false;
    const target = down.point.clone();
    this.mantle = { t: 0, dur: K.mantleTime * (0.7 + rise / K.mantleMax * 0.4), from: this.local.clone(), to: this.toLocal(target, new THREE.Vector3(), t), rise };
    this.vel.set(0, 0, 0);
    this.ctx.bus.emit('foot:mantle', { rise });
    return true;
  }
  stepMantle(dt, t) {
    const m = this.mantle;
    m.t += dt;
    const k = Math.min(1, m.t / m.dur);
    // sobe primeiro, depois avança (arco)
    const ku = easeInOut(Math.min(1, k * 1.6));
    const kf = easeInOut(clamp((k - 0.35) / 0.65, 0, 1));
    const up = this.upAt(m.from, _u);
    const d = _v.copy(m.to).sub(m.from);
    const du = d.dot(up);
    const flat = _w.copy(d).addScaledVector(up, -du);
    this.local.copy(m.from).addScaledVector(up, du * ku + 0.06 * Math.sin(k * Math.PI)).addScaledVector(flat, kf);
    if (k >= 1) { this.mantle = null; this.grounded = true; this.landImpact = 0.35; }
    this.syncWorld(t);
  }

  // ─── EVA (gravidade zero) ─────────────────────────────────────────────
  stepEva(dt, inp, t) {
    const hq = this.headQuat(_q, t);
    const f = _v.set(0, 0, -1).applyQuaternion(hq), r = _w.set(1, 0, 0).applyQuaternion(hq), u = _u.set(0, 1, 0).applyQuaternion(hq);
    const thrust = _f.set(0, 0, 0).addScaledVector(f, inp.moveY).addScaledVector(r, inp.moveX).addScaledVector(u, (inp.jump ? 1 : 0) - (inp.crouch ? 1 : 0));
    this.jetting = thrust.lengthSq() > 0.01 && this.fuel > 0.01;
    if (this.jetting) {
      this.vel.addScaledVector(thrust.normalize(), 6 * dt * (inp.sprint ? 2 : 1));
      this.fuel = Math.max(0, this.fuel - K.jetFuelUse * 0.25 * dt);
    } else this.fuel = Math.min(1, this.fuel + K.jetRegen * 0.3 * dt);
    if (inp.brake) this.vel.multiplyScalar(Math.exp(-2.5 * dt));
    this.local.addScaledVector(this.vel, dt);
    this.grounded = false;
    // colisão com formas mesmo no vácuo (casco de estação/nave)
    const col = this.ctx.collision;
    if (col.shapes.size) {
      col.resolveSphere(this.local, K.radius * 1.4, null, _res);
      if (_res.hit) {
        this.local.copy(_res.pos);
        const vn = this.vel.dot(_res.normal);
        if (vn < 0) this.vel.addScaledVector(_res.normal, -vn * 1.3);
      }
    }
    this.speed = this.vel.length();
    this.syncWorld(t);
  }

  /** Posição de mundo interpolada (para a câmera). */
  interpWorld(alpha, out = new THREE.Vector3(), t = this.ctx.time.world) {
    _v.copy(this.prevLocal).lerp(this.local, clamp(alpha, 0, 1));
    return this.toWorld(_v, out, t);
  }
}
