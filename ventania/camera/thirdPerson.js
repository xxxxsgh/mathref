// Câmera em terceira pessoa: órbita suave com pointer lock, alvo que segue o
// jogador com atraso diferente no horizontal e no vertical (pulo não sacode a
// tela), colisão com terreno e objetos (aproxima rápido, afasta devagar), FOV
// que abre ao correr/planar e tremida curta em aterrissagens fortes.

import * as THREE from 'three';
import { clamp, damp, lerp } from '../core/math.js';

export class ThirdPersonCamera {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.yaw = 0; // 0 = câmera ao sul (+Z) olhando para o norte
    this.pitch = 0.22; // positivo = acima do jogador
    this.dist = 5.6;
    this.wantDist = 5.6;
    this.curDist = 5.6;
    this.target = new THREE.Vector3();
    this.baseFov = 58;
    this.fov = 58;
    this.shake = 0;
    this.sensitivity = 1;
    this.invertY = false;
    this.free = null; // pose fixa (modo screenshot)
    this._yawVel = 0;
    this._d = new THREE.Vector3();
    this.lastInput = 0;
  }

  snap(player) {
    this.target.copy(player.pos).add(new THREE.Vector3(0, 1.45, 0));
    this.yaw = player.yaw + Math.PI;
    this.curDist = this.dist;
  }

  update(dt, input, player) {
    const cam = this.camera;
    if (this.free) {
      player.hero.root.visible = player.hero.scarf.mesh.visible = true;
      cam.position.copy(this.free.pos);
      cam.lookAt(this.free.look);
      cam.fov = this.free.fov ?? this.baseFov;
      cam.updateProjectionMatrix();
      return;
    }

    // Mouse → órbita.
    const s = 0.0022 * this.sensitivity;
    if (input.mouseDX || input.mouseDY) this.lastInput = 0;
    this.lastInput += dt;
    this.yaw -= input.mouseDX * s;
    this.pitch += input.mouseDY * s * (this.invertY ? -1 : 1);
    this.pitch = clamp(this.pitch, -0.55, 1.25);
    if (input.wheel) this.wantDist = clamp(this.wantDist + input.wheel * 0.7, 2.6, 11);
    this.dist = lerp(this.dist, this.wantDist, damp(10, dt));

    // Planando: a câmera se ajeita sozinha atrás do jogador (se o mouse está
    // parado), para enxergar para onde se está indo.
    if (player.gliding && this.lastInput > 0.6) {
      const behind = player.yaw + Math.PI;
      let d = behind - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * damp(1.2, dt);
      this.pitch += (0.32 - this.pitch) * damp(0.8, dt);
    }

    // Alvo: horizontal acompanha firme, vertical com mais folga.
    const want = player.pos.clone();
    want.y += 1.45;
    const kh = damp(14, dt);
    const kv = damp(player.grounded ? 10 : 4.5, dt);
    this.target.x += (want.x - this.target.x) * kh;
    this.target.z += (want.z - this.target.z) * kh;
    this.target.y += (want.y - this.target.y) * kv;
    // Nunca deixa o jogador sair muito do quadro na vertical.
    this.target.y = clamp(this.target.y, want.y - 1.2, want.y + 1.0);

    // Direção da órbita.
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = this._d.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);

    // Colisão: marcha ao longo do raio alvo → câmera.
    let allowed = this.dist;
    const steps = 22;
    const tw = this.world.terrain, cols = this.world.colliders;
    for (let i = 1; i <= steps; i++) {
      const d = (i / steps) * this.dist;
      const x = this.target.x + dir.x * d, y = this.target.y + dir.y * d, z = this.target.z + dir.z * d;
      if (y < tw.heightAt(x, z) + 0.35 || cols.inside(x, y, z, 0.3)) {
        allowed = Math.max(0.9, d - this.dist / steps);
        break;
      }
    }
    // Aproxima rápido (não atravessa) e afasta devagar (não "pula").
    this.curDist += (allowed - this.curDist) * damp(allowed < this.curDist ? 25 : 3.5, dt);
    this.curDist = Math.min(this.curDist, allowed + 0.05);

    const pos = cam.position.copy(this.target).addScaledVector(dir, this.curDist);
    // Ombro: leve deslocamento lateral para o personagem não tapar o centro.
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    pos.addScaledVector(right, 0.35 * Math.min(1, this.curDist / 4));
    const minY = tw.heightAt(pos.x, pos.z) + 0.3;
    if (pos.y < minY) pos.y = minY;

    // Câmera espremida contra obstáculo: esconde o herói em vez de atravessá-lo.
    const showHero = this.curDist > 1.05;
    player.hero.root.visible = showHero;
    player.hero.scarf.mesh.visible = showHero;

    // Tremida de aterrissagem.
    this.shake = Math.max(0, this.shake - dt * 3);
    const sh = this.shake * this.shake;
    const t = performance.now() * 0.001;
    const look = this.target.clone().addScaledVector(right, 0.35 * Math.min(1, this.curDist / 4));
    look.y += Math.sin(t * 43) * 0.06 * sh;
    look.x += Math.sin(t * 37) * 0.04 * sh;
    cam.lookAt(look);
    cam.position.copy(pos);
    cam.lookAt(look);

    // FOV: abre ao correr e mais ainda planando/caindo rápido.
    const hs = Math.hypot(player.vel.x, player.vel.z);
    let f = this.baseFov;
    if (player.grounded && player.running && hs > 5) f += 7 * clamp((hs - 5) / 3, 0, 1);
    if (player.gliding) f += 9;
    if (!player.grounded && player.vel.y < -12) f += clamp((-player.vel.y - 12) * 0.5, 0, 8);
    this.fov += (f - this.fov) * damp(3, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  /** Vetor "para frente" da câmera no plano (para a bússola). */
  heading() {
    return this.free ? Math.atan2(this.free.look.x - this.free.pos.x, this.free.look.z - this.free.pos.z) : this.yaw + Math.PI;
  }
}
