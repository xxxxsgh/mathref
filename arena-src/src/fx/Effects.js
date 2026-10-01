import * as THREE from 'three';
import { Pool } from '../core/Pool.js';
import { bulletHoleTexture, glowTexture, flashStarTexture } from '../world/Textures.js';

/**
 * Efeitos no mundo, todos em pools de tamanho fixo:
 * marcas de bala, faíscas, poeira, tracers, flashes de cano de terceiros e
 * faíscas de acerto em personagens. Nada é alocado durante a partida.
 *
 * As luzes de flash ficam SEMPRE na cena (intensidade 0 quando ociosas):
 * adicionar/remover luz no Three força recompilar os shaders.
 */
export class Effects {
  /** @param {THREE.Scene} scene @param {'low'|'medium'|'high'} quality */
  constructor(scene, quality) {
    this.scene = scene;
    const lim = quality === 'low' ? 0.5 : 1;

    const holeMat = new THREE.MeshBasicMaterial({
      map: bulletHoleTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    const holeGeo = new THREE.PlaneGeometry(0.09, 0.09);
    this.decals = new Pool(() => {
      const m = new THREE.Mesh(holeGeo, holeMat);
      m.visible = false;
      m.matrixAutoUpdate = false;
      scene.add(m);
      return { mesh: m, active: false };
    }, Math.round(80 * lim));

    const glow = glowTexture();
    this.sparks = new Pool(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      scene.add(s);
      return { s, vel: new THREE.Vector3(), life: 0, max: 0, active: false, size: 0.05 };
    }, Math.round(70 * lim));

    const dustMat = new THREE.SpriteMaterial({ map: glow, color: 0x9a9183, transparent: true, depthWrite: false, opacity: 0.5 });
    this.dust = new Pool(() => {
      const s = new THREE.Sprite(dustMat.clone());
      s.visible = false;
      scene.add(s);
      return { s, vel: new THREE.Vector3(), life: 0, max: 0, active: false };
    }, Math.round(24 * lim));

    const tracerGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 4, 1, true);
    tracerGeo.rotateX(Math.PI / 2);
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.tracers = new Pool(() => {
      const m = new THREE.Mesh(tracerGeo, tracerMat);
      m.visible = false;
      scene.add(m);
      return { mesh: m, from: new THREE.Vector3(), dir: new THREE.Vector3(), dist: 0, t: 0, active: false };
    }, 30);

    const star = flashStarTexture();
    this.flashes = new Pool(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.visible = false;
      s.scale.setScalar(0.5);
      scene.add(s);
      return { s, life: 0, active: false };
    }, 10);
    this.lights = [0, 1].map(() => {
      const l = new THREE.PointLight(0xffa860, 0, 7, 2);
      scene.add(l);
      return { l, life: 0 };
    });
    this.lightCursor = 0;
    this.tmp = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 0, 1);
  }

  /** Marca de bala alinhada à normal da superfície. */
  decal(p, n) {
    const d = this.decals.acquire();
    d.active = true;
    const m = d.mesh;
    m.position.set(p.x + n.x * 0.004, p.y + n.y * 0.004, p.z + n.z * 0.004);
    this.tmpQ.setFromUnitVectors(this.up, this.tmp.set(n.x, n.y, n.z));
    m.quaternion.copy(this.tmpQ);
    m.rotateZ(Math.random() * Math.PI * 2);
    const s = 0.7 + Math.random() * 0.6;
    m.scale.set(s, s, 1);
    m.updateMatrix();
    m.visible = true;
  }

  /**
   * Impacto em superfície: marca + faíscas (metal) ou poeira (concreto).
   * @param {{x:number,y:number,z:number}} p @param {{x:number,y:number,z:number}} n @param {string} surface
   */
  impact(p, n, surface) {
    this.decal(p, n);
    const metal = surface === 'metal';
    const count = metal ? 6 : 3;
    for (let i = 0; i < count; i++) {
      this.spark(p, n, metal ? 0xffc070 : 0xffe0b0, metal ? 5 : 3, 0.18 + Math.random() * 0.15, 0.035);
    }
    if (!metal) {
      const d = this.dust.acquire();
      d.active = true;
      d.life = d.max = 0.55;
      d.s.position.set(p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05);
      d.vel.set(n.x * 0.6, n.y * 0.6 + 0.25, n.z * 0.6);
      d.s.scale.setScalar(0.12);
      d.s.visible = true;
    }
  }

  spark(p, n, color, speed, life, size) {
    const s = this.sparks.acquire();
    s.active = true;
    s.life = s.max = life;
    s.size = size;
    s.s.material.color.setHex(color);
    s.s.position.set(p.x, p.y, p.z);
    s.vel.set(
      n.x * speed + (Math.random() - 0.5) * speed,
      n.y * speed + Math.random() * speed * 0.8,
      n.z * speed + (Math.random() - 0.5) * speed,
    );
    s.s.visible = true;
  }

  /** Acerto em personagem: estouro de energia na cor do time (sem sangue). */
  bodyHit(p, dir, color, headshot) {
    const n = { x: -dir.x, y: -dir.y + 0.3, z: -dir.z };
    const count = headshot ? 10 : 5;
    for (let i = 0; i < count; i++) this.spark(p, n, color, headshot ? 3.5 : 2.2, 0.25, headshot ? 0.06 : 0.045);
  }

  /** Tracer que viaja do cano ao ponto de impacto. */
  tracer(from, to) {
    const t = this.tracers.acquire();
    t.active = true;
    t.from.copy(from);
    t.dir.subVectors(to, from);
    t.dist = t.dir.length();
    if (t.dist < 1.5) {
      t.active = false;
      return;
    }
    t.dir.divideScalar(t.dist);
    t.t = 0;
    t.mesh.position.copy(from);
    t.mesh.quaternion.setFromUnitVectors(this.up, t.dir);
    t.mesh.visible = true;
  }

  /** Flash de cano de outro combatente. */
  muzzle(p) {
    const f = this.flashes.acquire();
    f.active = true;
    f.life = 0.05;
    f.s.position.copy(p);
    f.s.material.rotation = Math.random() * Math.PI;
    f.s.scale.setScalar(0.35 + Math.random() * 0.2);
    f.s.visible = true;
    const L = this.lights[this.lightCursor];
    this.lightCursor = (this.lightCursor + 1) % this.lights.length;
    L.l.position.copy(p);
    L.l.intensity = 6;
    L.life = 0.05;
  }

  /** @param {number} dt */
  update(dt) {
    this.sparks.forEachActive((s) => {
      s.life -= dt;
      s.vel.y -= 9 * dt;
      s.s.position.addScaledVector(s.vel, dt);
      const k = s.life / s.max;
      s.s.scale.setScalar(s.size * (0.4 + k));
      s.s.material.opacity = k;
      if (s.life <= 0) {
        s.active = false;
        s.s.visible = false;
      }
    });
    this.dust.forEachActive((d) => {
      d.life -= dt;
      d.s.position.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(1 - dt * 3);
      const k = d.life / d.max;
      d.s.scale.setScalar(0.12 + (1 - k) * 0.35);
      d.s.material.opacity = k * 0.45;
      if (d.life <= 0) {
        d.active = false;
        d.s.visible = false;
      }
    });
    this.tracers.forEachActive((t) => {
      t.t += dt;
      const speed = 320;
      const head = Math.min(t.dist, t.t * speed);
      const len = Math.min(4, head);
      const tail = head - len;
      if (tail >= t.dist - 0.05) {
        t.active = false;
        t.mesh.visible = false;
        return;
      }
      t.mesh.position.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
      t.mesh.scale.set(1, 1, Math.max(0.01, len));
    });
    this.flashes.forEachActive((f) => {
      f.life -= dt;
      if (f.life <= 0) {
        f.active = false;
        f.s.visible = false;
      }
    });
    for (const L of this.lights) {
      if (L.life > 0) {
        L.life -= dt;
        if (L.life <= 0) L.l.intensity = 0;
      }
    }
  }

  /** Limpa marcas e partículas (troca de round). */
  clear() {
    for (const pool of [this.decals, this.sparks, this.dust, this.tracers, this.flashes]) {
      for (const it of /** @type {any[]} */ (pool.items)) {
        it.active = false;
        (it.mesh || it.s).visible = false;
      }
    }
  }
}
