/**
 * JOGADOR (ctx.player) — estado em double + controladores plugáveis por modo.
 *
 *   player.worldPos     WorldPos (double): PÉS (walk) ou centro da nave (ship/space)
 *   player.velocity     Vector3 m/s (referencial do mundo = fixo no planeta)
 *   player.quaternion   orientação do CORPO no mundo (−Z = frente, +Y = cima).
 *                       Em 'walk' o corpo fica em pé (+Y = up local) e a
 *                       inclinação da visão fica em player.pitch (rad).
 *   player.mode         'walk' | 'ship' | 'space'
 *   player.view         'first' | 'third'
 *   player.up           Vector3 normal local (do centro do planeta para fora)
 *   player.altitude     m acima do solo (planet.heightAt) — atualizado a cada passo
 *   player.grounded     a pé e apoiado no solo
 *   player.eyeHeight    1,7 m (walk)
 *   player.cockpitEye   Vector3 — olho do piloto no referencial da nave (ship)
 *   player.fov          FOV vertical (graus) da câmera do mundo
 *   player.cameraWorld  WorldPos (double) da câmera neste frame = ORIGEM DE RENDER
 *   player.cameraQuat   orientação da câmera neste frame
 *
 *   player.setController(mode, controller)   o sistema dono troca o controlador
 *   player.setMode(mode)                      → evento 'player:mode' { mode, prev }
 *   player.place({ lat, lon, alt, heading, pitch, mode, worldPos })
 *
 * Controlador = { name, enter?(p, ctx, prevMode), exit?(p, ctx, nextMode),
 *   update(dt, p, ctx), camera?(p, ctx, cam) }.
 * `update` roda no PASSO FIXO (1/60 s) e integra worldPos/velocity/quaternion
 * em double. `camera` (opcional) pode sobrescrever cam.worldPos /
 * cam.quaternion / cam.fov depois da câmera padrão (ex.: câmera de
 * perseguição da nave). O núcleo interpola entre passos (alpha).
 */
import { Vector3, Quaternion } from 'three';
import { WorldPos } from './Space.js';
import { WalkController } from './controllers/Walk.js';
import { FlyController } from './controllers/Fly.js';
import { DEG, dirFromLatLon, quatFromHeadingPitch, quatFromForwardUp } from './Geo.js';

const X = new Vector3(1, 0, 0);
const _q = new Quaternion();
const _q2 = new Quaternion();
const _v = new Vector3();
const _v2 = new Vector3();

export const MODES = ['walk', 'ship', 'space'];

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.worldPos = new WorldPos();
    this.prevPos = new WorldPos();
    this.renderPos = new WorldPos();
    this.velocity = new Vector3();
    this.quaternion = new Quaternion();
    this.prevQuat = new Quaternion();
    this.renderQuat = new Quaternion();
    this.pitch = 0;
    this.prevPitch = 0;
    this.mode = 'walk';
    this.view = 'first';
    this.up = new Vector3(0, 1, 0);
    this.altitude = 0;
    this.groundHeight = 0;
    this.grounded = false;
    this.eyeHeight = 1.7;
    this.cockpitEye = new Vector3(0, 0, 0);
    this.fov = 75;
    this.cameraWorld = new WorldPos();
    this.cameraQuat = new Quaternion();
    /** distâncias da 3ª pessoa por modo: atrás (m) e acima (m) */
    this.thirdPerson = { walk: { back: 4.5, up: 1.1 }, ship: { back: 24, up: 6 }, space: { back: 24, up: 6 } };
    this.lookEnabled = true;
    this.moveEnabled = true;
    /** true congela a simulação do jogador (modo shot) */
    this.frozen = false;
    this.controllers = {
      walk: new WalkController(),
      ship: new FlyController({ name: 'ship' }),
      space: new FlyController({ name: 'space', altFactor: 1.2, minSpeed: 50, maxSpeed: 2e6, autoLevel: false }),
    };
    this._cam = { worldPos: this.cameraWorld, quaternion: this.cameraQuat, fov: this.fov };
  }

  get controller() {
    return this.controllers[this.mode];
  }

  /** Troca o controlador de um modo (o sistema dono chama no init). */
  setController(mode, ctrl) {
    const prev = this.controllers[mode];
    if (prev && this.mode === mode) prev.exit?.(this, this.ctx, mode);
    this.controllers[mode] = ctrl;
    if (this.mode === mode) ctrl.enter?.(this, this.ctx, mode);
    return prev;
  }

  setMode(mode) {
    if (!this.controllers[mode] || mode === this.mode) return;
    const prev = this.mode;
    this.controllers[prev]?.exit?.(this, this.ctx, mode);
    // walk ↔ voo: a inclinação da visão vira parte da orientação (e vice-versa)
    if (prev === 'walk' && mode !== 'walk') {
      this.quaternion.multiply(_q.setFromAxisAngle(X, this.pitch));
      this.pitch = 0;
    }
    this.mode = mode;
    if (mode === 'walk') this.uprightFromCurrent();
    this.controllers[mode].enter?.(this, this.ctx, prev);
    this.prevQuat.copy(this.quaternion);
    this.prevPitch = this.pitch;
    this.ctx.bus.emit('player:mode', { mode, prev });
  }

  /** Põe o corpo em pé (up local) mantendo o rumo; a inclinação vai para pitch. */
  uprightFromCurrent() {
    this.updateSurface();
    const fwd = _v.set(0, 0, -1).applyQuaternion(this.quaternion);
    const el = Math.asin(Math.max(-1, Math.min(1, fwd.dot(this.up))));
    _v2.copy(fwd).addScaledVector(this.up, -fwd.dot(this.up));
    if (_v2.lengthSq() < 1e-10) _v2.set(0, 1, 0).applyQuaternion(this.quaternion).negate();
    quatFromForwardUp(_v2, this.up, this.quaternion);
    this.pitch = Math.max(-1.5, Math.min(1.5, el));
  }

  /** Planeta atual (serviço — sempre existe: real ou placeholder). */
  get planet() {
    return this.ctx.services.planet;
  }

  /** Centro do planeta atual. */
  get center() {
    return this.planet?.center || this.ctx.space.planetCenter;
  }

  /**
   * Recalcula up / altitude / altura do solo em worldPos (double).
   * Retorna { up, r, groundR, altitude }.
   */
  updateSurface(pos = this.worldPos) {
    const c = this.center;
    const up = this.up.set(pos.x - c.x, pos.y - c.y, pos.z - c.z);
    const r = up.length();
    if (r > 0) up.multiplyScalar(1 / r);
    else up.set(0, 1, 0);
    const planet = this.planet;
    const R = planet?.radius ?? 0;
    let h = 0;
    try {
      h = planet?.heightAt ? planet.heightAt(up) : 0;
    } catch {
      h = 0;
    }
    if (!Number.isFinite(h)) h = 0;
    this.groundHeight = h;
    this.altitude = r - (R + h);
    return { up, r, groundR: R + h, altitude: this.altitude };
  }

  /** Alinha a orientação do corpo ao up atual pelo menor giro (transporte paralelo). */
  alignBodyToUp() {
    const bodyUp = _v.set(0, 1, 0).applyQuaternion(this.quaternion);
    _q.setFromUnitVectors(bodyUp, this.up);
    this.quaternion.premultiply(_q).normalize();
  }

  /**
   * Posiciona por coordenadas do planeta.
   * { lat, lon (graus), alt (m acima do solo: olhos em walk, nave em ship/space),
   *   heading, pitch (graus), mode, worldPos (alternativa a lat/lon), fov }
   */
  place(o = {}) {
    if (o.mode && o.mode !== this.mode) this.setMode(o.mode);
    const planet = this.planet;
    const c = this.center;
    const R = planet?.radius ?? 1e5;
    let dir;
    if (o.worldPos) {
      dir = _v.set(o.worldPos.x - c.x, o.worldPos.y - c.y, o.worldPos.z - c.z).normalize().clone();
    } else dir = dirFromLatLon(o.lat ?? 0, o.lon ?? 0, new Vector3());
    const h = planet?.heightAt ? planet.heightAt(dir) : 0;
    const alt = o.alt ?? (this.mode === 'walk' ? this.eyeHeight : 100);
    if (this.mode === 'walk') {
      this.eyeHeight = o.alt ?? this.eyeHeight;
      this.worldPos.set(c.x, c.y, c.z).addScaledVector(dir, R + h);
    } else if (o.worldPos) this.worldPos.copy(o.worldPos);
    else this.worldPos.set(c.x, c.y, c.z).addScaledVector(dir, R + h + alt);
    this.updateSurface();
    const heading = o.heading ?? 0;
    const pitch = o.pitch ?? 0;
    if (this.mode === 'walk') {
      quatFromHeadingPitch(this.up, heading, 0, this.quaternion);
      this.pitch = pitch * DEG;
    } else {
      quatFromHeadingPitch(this.up, heading, pitch, this.quaternion);
      this.pitch = 0;
    }
    if (o.fov) this.fov = o.fov;
    this.velocity.set(0, 0, 0);
    this.grounded = this.mode === 'walk';
    this.snap();
  }

  /** Sem interpolação no próximo frame (teleporte). */
  snap() {
    this.prevPos.copy(this.worldPos);
    this.prevQuat.copy(this.quaternion);
    this.prevPitch = this.pitch;
  }

  /** Passo fixo. */
  update(dt) {
    this.prevPos.copy(this.worldPos);
    this.prevQuat.copy(this.quaternion);
    this.prevPitch = this.pitch;
    const input = this.ctx.input;
    if (this.frozen) {
      this.updateSurface();
      return;
    }
    if (input.pressed('toggleView')) this.view = this.view === 'first' ? 'third' : 'first';
    // sem sistema 'ship', G alterna os modos (depuração do núcleo)
    if (input.pressed('cycleMode') && !this.ctx.services.ship) {
      this.setMode(MODES[(MODES.indexOf(this.mode) + 1) % MODES.length]);
    }
    this.controller?.update(dt, this, this.ctx);
    this.updateSurface();
  }

  /**
   * Interpola e calcula a câmera (double). Chamado uma vez por frame antes
   * do rebase da origem.
   */
  syncCamera(alpha = 1, camera) {
    const rp = this.renderPos.copy(this.prevPos).lerp(this.worldPos, alpha);
    // lerp de Vector3 é double: (a + (b − a)·t) sem perda relevante
    const q = this.renderQuat.copy(this.prevQuat).slerp(this.quaternion, alpha);
    const pitch = this.prevPitch + (this.pitch - this.prevPitch) * alpha;
    const c = this.center;
    const up = _v2.set(rp.x - c.x, rp.y - c.y, rp.z - c.z).normalize();
    const cam = this._cam;
    cam.fov = this.fov;
    if (this.mode === 'walk') {
      cam.worldPos.copy(rp).addScaledVector(up, this.eyeHeight);
      cam.quaternion.copy(q).multiply(_q2.setFromAxisAngle(X, pitch));
    } else {
      cam.worldPos.copy(rp).add(_v.copy(this.cockpitEye).applyQuaternion(q));
      cam.quaternion.copy(q);
    }
    if (this.view === 'third') {
      const tp = this.thirdPerson[this.mode] || this.thirdPerson.ship;
      const off = _v.set(0, tp.up, tp.back).applyQuaternion(cam.quaternion);
      cam.worldPos.add(off);
      // não deixa a câmera entrar no solo
      const planet = this.planet;
      if (planet) {
        const d = _v.set(cam.worldPos.x - c.x, cam.worldPos.y - c.y, cam.worldPos.z - c.z);
        const r = d.length();
        d.multiplyScalar(1 / r);
        const g = planet.radius + (planet.heightAt?.(d) || 0) + 0.6;
        if (r < g) cam.worldPos.set(c.x, c.y, c.z).addScaledVector(d, g);
      }
    }
    const ctrl = this.controller;
    if (ctrl?.camera) ctrl.camera(this, this.ctx, cam);
    if (camera) {
      camera.position.set(0, 0, 0);
      camera.quaternion.copy(cam.quaternion);
      if (camera.fov !== cam.fov) {
        camera.fov = cam.fov;
        camera.updateProjectionMatrix();
      }
    }
    return cam;
  }

  /** Velocidade escalar (m/s). */
  get speed() {
    return this.velocity.length();
  }

  /** Vetor de frente da visão (mundo). */
  forward(out = new Vector3()) {
    return out.set(0, 0, -1).applyQuaternion(this.cameraQuat);
  }
}

