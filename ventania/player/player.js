// Controle do herói: física em passo fixo, estados (chão, ar, planando,
// nadando), coyote time, buffer de pulo, pulo de altura variável, aceleração
// e desaceleração suaves, sem deslizar em rampas.

import * as THREE from 'three';
import { Hero } from './hero.js';
import { Animator } from './animator.js';
import { clamp, damp, angleDelta, lerp } from '../core/math.js';
import { LAKE, SEA_LEVEL } from '../world/layout.js';

export const TUNING = {
  walk: 4.3,
  run: 8.4,
  accel: 11, // resposta ao acelerar (1/s)
  decel: 15, // resposta ao frear
  turnAccel: 13, // resposta na reversão (> ~130°)
  turnRate: 11, // rad/s: giro do vetor velocidade nas curvas
  airControl: 3.2,
  airDrag: 0.35,
  gravity: 30,
  gravityHold: 21, // subindo com Espaço segurado (pulo mais alto)
  gravityFall: 38, // caindo (queda mais firme, menos "lunar")
  jumpSpeed: 8.6,
  coyote: 0.14,
  jumpBuffer: 0.14,
  maxFall: 48,
  turnSpeed: 13, // giro do corpo (rad/s, exponencial)
  maxSlope: 0.62, // normal.y mínima para subir andando (~52°)
  stepUp: 0.45,
  snapDown: 0.6,
  // Planador.
  glideMinHeight: 2.0,
  glideSink: 2.3,
  glideSpeed: 9.5,
  glideFast: 12.5,
  glideTurn: 2.4,
  // Água.
  swimDepth: 1.15,
  swimSpeed: 2.6,
};

const RADIUS = 0.35;
const HEIGHT = 1.7;

export class Player {
  constructor(scene, world, audio) {
    this.world = world;
    this.audio = audio;
    this.hero = new Hero();
    scene.add(this.hero.root);
    scene.add(this.hero.scarf.mesh);
    this.anim = new Animator(this.hero);
    this.anim.onStep = (surface, k) => this.audio?.footstep(surface, k);

    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.gliding = false;
    this.swimming = false;
    this.running = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumpHeld = false;
    this.airTime = 0;
    this.surface = 'grass';
    this.turnRate = 0;
    this.accel = 0;
    this.lastSpeed = 0;
    this.fallStartY = 0;
    this.onLand = null;
    this.groundY = 0;
    this._acc = 0;
    this._wasGliding = false;
    this.landCarry = 0;
  }

  spawn(x, z, yaw) {
    this.pos.set(x, this.world.terrain.heightAt(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.gliding = false;
    this.hero.root.position.copy(this.pos);
    this.hero.root.rotation.y = yaw;
    this.hero.root.updateMatrixWorld(true);
    this.hero.scarf.reset();
  }

  /** Altura do chão sob (x,z): terreno ou topo de colisor alcançável. */
  _ground(x, z, y) {
    const t = this.world.terrain.heightAt(x, z);
    const c = this.world.colliders.groundAt(x, z, y, RADIUS, TUNING.stepUp);
    if (c.y > t) return { y: c.y, surface: c.surface === 'rock' ? 'rock' : c.surface === 'wood' ? 'wood' : 'stone' };
    return { y: t, surface: this.world.terrain.surfaceAt(x, z) };
  }

  _waterLevel(x, z) {
    return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.5 ? LAKE.level : SEA_LEVEL;
  }

  /** Entrada do frame (bordas). */
  input(input, camYaw) {
    const a = input.axes();
    // Direção relativa à câmera.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    this.wish = { x: fx * a.y + rx * a.x, z: fz * a.y + rz * a.x, mag: Math.min(1, Math.hypot(a.x, a.y)) };
    this.running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    if (input.consume('Space')) {
      this.jumpBuf = TUNING.jumpBuffer;
      this._spacePressed = true;
    }
    this.jumpHeld = input.isDown('Space');
  }

  update(dt) {
    // Passo fixo de 1/120 s.
    this._acc += Math.min(dt, 0.1);
    const h = 1 / 120;
    while (this._acc >= h) {
      this._step(h);
      this._acc -= h;
    }
    this._spacePressed = false;
    this._visual(dt);
  }

  _step(dt) {
    const T = TUNING;
    const w = this.wish || { x: 0, z: 0, mag: 0 };
    const p = this.pos, v = this.vel;
    const wasGrounded = this.grounded;
    this._wasGliding = this.gliding;

    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.coyote = this.grounded ? T.coyote : Math.max(0, this.coyote - dt);

    // ── Horizontal ──
    const speed = this.running ? T.run : T.walk;
    let tx = w.x * speed * w.mag, tz = w.z * speed * w.mag;
    if (w.mag > 0.01) {
      const l = Math.hypot(w.x, w.z) || 1;
      tx = (w.x / l) * speed * w.mag;
      tz = (w.z / l) * speed * w.mag;
    }
    const hs = Math.hypot(v.x, v.z);

    if (this.swimming) {
      tx *= T.swimSpeed / speed;
      tz *= T.swimSpeed / speed;
      const k = damp(4, dt);
      v.x += (tx - v.x) * k;
      v.z += (tz - v.z) * k;
    } else if (this.gliding) {
      // Planador: mantém embalo para a frente; a entrada só curva a trajetória.
      const fwd = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
      if (w.mag > 0.01) {
        const want = Math.atan2(w.x, w.z);
        const d = angleDelta(this.yaw, want);
        this.yaw += clamp(d, -T.glideTurn * dt, T.glideTurn * dt);
      }
      const gs = this.running ? T.glideFast : T.glideSpeed;
      const target = w.mag > 0.01 ? gs : gs * 0.75;
      const k = damp(1.6, dt);
      v.x += (fwd.x * target - v.x) * k;
      v.z += (fwd.z * target - v.z) * k;
    } else if (this.grounded) {
      // Acelera / freia / vira com respostas diferentes: arranque firme, parada
      // rápida mas não instantânea, e mudança brusca de direção um pouco mais
      // lenta (dá peso ao personagem).
      const tl = Math.hypot(tx, tz);
      const decel = this.landCarry > 0 ? 3 : T.decel; // embalo de aterrissagem
      if (hs > 0.5 && tl > 0.5) {
        const cur = Math.atan2(v.x, v.z), want = Math.atan2(tx, tz);
        const d = angleDelta(cur, want);
        if (Math.abs(d) < 2.3) {
          // Curva: gira o vetor velocidade (não perde embalo) e ajusta o módulo.
          const na = cur + clamp(d, -T.turnRate * dt, T.turnRate * dt);
          const mag = hs + (tl - hs) * damp(tl > hs ? T.accel : decel, dt);
          v.x = Math.sin(na) * mag;
          v.z = Math.cos(na) * mag;
        } else {
          // Reversão: freia firme e arranca para o outro lado.
          v.x += (tx - v.x) * damp(T.turnAccel, dt);
          v.z += (tz - v.z) * damp(T.turnAccel, dt);
        }
      } else {
        const k = tl > hs ? T.accel : decel;
        v.x += (tx - v.x) * damp(k, dt);
        v.z += (tz - v.z) * damp(k, dt);
      }
    } else {
      // Ar: controle reduzido e quase sem atrito.
      if (w.mag > 0.01) {
        const k = damp(T.airControl, dt);
        v.x += (tx - v.x) * k;
        v.z += (tz - v.z) * k;
      } else {
        const k = damp(T.airDrag, dt);
        v.x -= v.x * k;
        v.z -= v.z * k;
      }
    }

    // ── Pulo / planador ──
    if (this.jumpBuf > 0 && (this.grounded || this.coyote > 0) && !this.gliding) {
      v.y = T.jumpSpeed;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      this._spacePressed = false;
      this.fallStartY = p.y;
      this.audio?.jump();
    } else if (this.swimming && this.jumpBuf > 0) {
      // Na água, Espaço dá um impulso para sair na margem.
      v.y = 5.5;
      this.jumpBuf = 0;
      this._spacePressed = false;
    } else if (this._spacePressed && !this.grounded && !this.swimming) {
      this._spacePressed = false;
      // Perto do chão o aperto fica no buffer (vira pulo ao aterrissar).
      if (this.gliding) {
        this.gliding = false;
        this.jumpBuf = 0;
        this.audio?.glider(false);
      } else if (p.y - this.groundY > T.glideMinHeight) {
        this.gliding = true;
        this.jumpBuf = 0;
        this.audio?.glider(true);
      }
    }

    // ── Vertical ──
    if (this.gliding) {
      v.y += (-T.glideSink - v.y) * damp(v.y < -T.glideSink ? 5 : 2, dt);
    } else if (!this.grounded && !this.swimming) {
      const g = v.y > 0 ? (this.jumpHeld ? T.gravityHold : T.gravity * 1.5) : T.gravityFall;
      v.y = Math.max(-T.maxFall, v.y - g * dt);
    }

    // ── Integra ──
    const ox = p.x, oz = p.z;
    p.x += v.x * dt;
    p.z += v.z * dt;
    p.y += v.y * dt;

    // Barranco íngreme: não sobe andando (mas também não escorrega).
    if (this.grounded) {
      const n = this.world.terrain.normalAt(p.x, p.z);
      if (n.y < T.maxSlope) {
        const up = (p.x - ox) * -n.x + (p.z - oz) * -n.z; // >0 = subindo
        if (up > 0) {
          const l = Math.hypot(n.x, n.z) || 1;
          const ux = -n.x / l, uz = -n.z / l;
          const vn = v.x * ux + v.z * uz;
          if (vn > 0) { v.x -= vn * ux; v.z -= vn * uz; }
          p.x = ox + v.x * dt;
          p.z = oz + v.z * dt;
        }
      }
    }

    // Colisores (troncos, pedras, colunas).
    if (this.world.colliders.resolve(p, RADIUS, HEIGHT, T.stepUp, v) && this.gliding) {
      // Bateu planando: perde o embalo.
      v.x *= 0.5; v.z *= 0.5;
    }

    // Limite da ilha (mar aberto): empurra de volta com suavidade.
    const r = Math.hypot(p.x, p.z);
    if (r > 540) {
      const k = (r - 540) / r;
      p.x -= p.x * k * 0.2;
      p.z -= p.z * k * 0.2;
    }

    // ── Chão ──
    const gr = this._ground(p.x, p.z, p.y);
    this.groundY = gr.y;
    const water = this._waterLevel(p.x, p.z);
    const depth = water - gr.y;

    if (depth > T.swimDepth && p.y < water - T.swimDepth + 0.3) {
      // Nadando: flutua na superfície.
      if (!this.swimming) {
        this.swimming = true;
        this.gliding = false;
        this.audio?.splash(Math.min(1, -v.y / 15));
      }
      const floatY = water - T.swimDepth + Math.sin(performance.now() * 0.002) * 0.04;
      if (v.y <= 0 || p.y < floatY) {
        p.y += (floatY - p.y) * damp(6, dt);
        v.y *= 1 - damp(5, dt);
      }
      this.grounded = false;
      this.surface = 'water';
    } else {
      this.swimming = false;
      if (p.y <= gr.y + 0.001 && v.y <= 0.001) {
        if (!wasGrounded) this._landed(-v.y, gr.surface);
        p.y = gr.y;
        v.y = 0;
        this.grounded = true;
        this.surface = depth > 0.05 ? 'water' : gr.surface;
      } else if (wasGrounded && v.y <= 0 && p.y - gr.y < T.snapDown + hs * 0.06) {
        // Descendo rampa: gruda no chão em vez de "voar" degrau por degrau.
        p.y = gr.y;
        v.y = 0;
        this.grounded = true;
        this.surface = depth > 0.05 ? 'water' : gr.surface;
      } else {
        if (wasGrounded) this.fallStartY = p.y;
        this.grounded = false;
      }
    }
    if (this.grounded && this.gliding) {
      this.gliding = false;
      this.audio?.glider(false);
    }
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    this.landCarry = Math.max(0, this.landCarry - dt);
  }

  _landed(impact, surface) {
    if (this._wasGliding) this.landCarry = 0.35;
    const k = clamp((impact - 4) / 18, 0, 1);
    this.anim.landed(0.25 + k * 0.75);
    this.audio?.land(surface, k);
    // Tremida de câmera só em quedas de verdade (não em todo pulo).
    const shake = clamp((impact - 13) / 14, 0, 1);
    if (shake > 0) this.onLand?.(shake);
  }

  _visual(dt) {
    const v = this.vel;
    const hs = Math.hypot(v.x, v.z);
    // Gira o corpo para a direção do movimento (no planador o yaw é da física).
    const prevYaw = this.yaw;
    if (!this.gliding && hs > 0.3) {
      const want = Math.atan2(v.x, v.z);
      this.yaw += angleDelta(this.yaw, want) * damp(TUNING.turnSpeed, dt);
    }
    this.turnRate = lerp(this.turnRate, angleDelta(prevYaw, this.yaw) / Math.max(dt, 1e-4), damp(10, dt));
    this.accel = lerp(this.accel, (hs - this.lastSpeed) / Math.max(dt, 1e-4), damp(8, dt));
    this.lastSpeed = hs;

    const root = this.hero.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    root.updateMatrixWorld(true);

    this.anim.update(dt, {
      speed: hs,
      runBlend: clamp((hs - TUNING.walk) / (TUNING.run - TUNING.walk), 0, 1),
      grounded: this.grounded,
      vy: v.y,
      gliding: this.gliding,
      swimming: this.swimming,
      turnRate: this.turnRate,
      accel: this.accel,
      surface: this.surface,
    });
    this.hero.root.updateMatrixWorld(true);
  }

  updateScarf(dt, wind) {
    this.hero.scarf.update(dt, wind, this.vel);
  }
}
