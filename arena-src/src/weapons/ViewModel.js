import * as THREE from 'three';
import { Animator, IDLE_CLIP } from './Animator.js';
import { buildArm } from './Models.js';
import { Pool } from '../core/Pool.js';
import { damp } from '../core/Rng.js';
import { flashStarTexture, glowTexture } from '../world/Textures.js';

/**
 * Arma em primeira pessoa.
 *
 * Renderizada numa cena própria, com câmera própria e FOV próprio, depois
 * do mundo e com o depth limpo: a arma nunca atravessa paredes e o FOV do
 * jogador não deforma o modelo.
 *
 * Hierarquia:
 *   rig (sway, bob, recuo, sprint — camadas procedurais aditivas)
 *     hand (pose de descanso da arma + canal "rp/rr" do Animator)
 *       braço direito
 *       item (canal "ip/ir" — giros nos dedos)
 *         modelo da arma (+ braço esquerdo no guarda-mão)
 */

/** Pose de descanso por tipo de arma (espaço da câmera da viewmodel). */
export const VM_BASE = {
  rifle: { pos: [0.17, -0.17, -0.47], rot: [0.02, 0.09, -0.03], item: [0, 0, 0] },
  smg: { pos: [0.16, -0.16, -0.44], rot: [0.02, 0.1, -0.03], item: [0, 0, 0] },
  dmr: { pos: [0.17, -0.175, -0.47], rot: [0.02, 0.08, -0.03], item: [0, 0, 0] },
  pistol: { pos: [0.12, -0.13, -0.38], rot: [0.03, 0.12, 0.0], item: [0, 0, 0] },
  heavy: { pos: [0.12, -0.135, -0.38], rot: [0.03, 0.12, 0.0], item: [0, 0, 0] },
  knife: { pos: [0.15, -0.14, -0.34], rot: [0.06, 0.22, -0.1], item: [0.42, 0.06, -0.35] },
};

/** Pose de corrida (aditiva) — arma baixa e de lado. */
const SPRINT = {
  gun: { pos: [-0.025, -0.045, 0.03], rot: [-0.32, 0.55, 0.35] },
  knife: { pos: [0.0, -0.03, 0.02], rot: [0.25, 0.15, 0.1] },
};

export class ViewModel {
  /**
   * @param {THREE.Texture|null} envMap
   * @param {number} fov
   */
  constructor(envMap, fov) {
    this.scene = new THREE.Scene();
    this.scene.environment = envMap;
    this.scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 10);
    const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x3a3026, 0.7);
    const key = new THREE.DirectionalLight(0xfff2e0, 1.7);
    key.position.set(-0.6, 1, 0.4);
    const rim = new THREE.DirectionalLight(0x9cc8ff, 0.8);
    rim.position.set(1, 0.3, -1);
    this.scene.add(hemi, key, rim);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.2, 2);
    this.scene.add(this.flashLight);

    this.rig = new THREE.Group();
    this.hand = new THREE.Group();
    this.item = new THREE.Group();
    this.rig.add(this.hand);
    this.hand.add(this.item);
    this.scene.add(this.rig);

    /** poses de descanso (exposto para ajuste fino/depuração) */
    this.base = VM_BASE;
    this.animator = new Animator();
    this.animator.play(IDLE_CLIP, { blend: 0 });
    this.type = 'rifle';
    /** @type {import('./Models.js').WeaponModel|null} */
    this.model = null;
    this.right = null;
    this.left = null;
    this.teamColor = 0x2fd3c4;

    // camadas procedurais
    this.swayX = 0;
    this.swayY = 0;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.sprintAmt = 0;
    this.crouchAmt = 0;
    this.kickZ = 0;
    this.kickZv = 0;
    this.kickR = 0;
    this.kickRv = 0;
    this.landY = 0;
    this.landYv = 0;
    this.time = 0;
    this.hidden = false;
    this.magBase = new THREE.Vector3();
    this.slideBase = 0;
    this.slideKick = 0;

    // flash do cano
    this.flash = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: flashStarTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    );
    this.flash.scale.setScalar(0.13);
    this.flash.visible = false;
    this.flashGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }),
    );
    this.flashGlow.scale.setScalar(0.2);
    this.flashGlow.visible = false;
    this.scene.add(this.flash, this.flashGlow);
    this.flashTime = 0;

    // cápsulas ejetadas (pool, física simples no espaço da câmera)
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a043, metalness: 1, roughness: 0.3 });
    const shellGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.022, 6);
    this.shells = new Pool(() => {
      const m = new THREE.Mesh(shellGeo, brass);
      m.visible = false;
      this.scene.add(m);
      return { mesh: m, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, active: false };
    }, 14);
    this.tmpV = new THREE.Vector3();
    this.eA = new THREE.Euler();
    this.eB = new THREE.Euler();
    this.qA = new THREE.Quaternion();
    this.qB = new THREE.Quaternion();
    this.qRest = new THREE.Quaternion();
    this.forearmRest = new THREE.Euler(0.5, 0.35, 0);
  }

  /**
   * Troca o modelo exibido.
   * @param {string} type
   * @param {import('./Models.js').WeaponModel} model
   */
  setWeapon(type, model) {
    if (this.model) this.item.remove(this.model.root);
    if (this.right) this.hand.remove(this.right.group);
    if (this.left) this.left.group.parent?.remove(this.left.group);
    this.type = type;
    this.model = model;
    this.item.add(model.root);
    this.right = buildArm(this.teamColor, false);
    this.right.forearm.rotation.set(0.5, 0.35, 0);
    this.hand.add(this.right.group);
    this.left = null;
    if (type === 'knife') {
      // cabo horizontal: gira o punho 90° para os dedos envolverem o cabo
      this.right.hand.rotation.x = -Math.PI / 2;
    } else if (model.leftHand) {
      this.left = buildArm(this.teamColor, true);
      this.left.group.position.copy(model.leftHand);
      this.left.hand.rotation.x = -Math.PI / 2;
      this.left.group.rotation.set(0.1, -0.55, 0.15);
      this.left.forearm.rotation.set(0.35, 0, 0);
      model.root.add(this.left.group);
    } else {
      // pistola: mão esquerda apoiando por baixo
      this.left = buildArm(this.teamColor, true);
      this.left.group.position.set(-0.03, -0.045, 0.02);
      this.left.group.rotation.set(0.25, -0.45, -0.2);
      model.root.add(this.left.group);
    }
    if (model.mag) this.magBase.copy(model.mag.position);
    this.slideBase = model.slide ? model.slide.position.z : 0;
  }

  /** @param {number} color */
  setTeamColor(color) {
    this.teamColor = color;
  }

  /** @param {number} fov @param {number} aspect */
  setProjection(fov, aspect) {
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Empurrão do tiro (mola amortecida). */
  kick(strength) {
    this.kickZv += 1.6 * strength;
    this.kickRv += 9 * strength;
    this.slideKick = 1;
  }

  /** Queda de pulo/aterrissagem. */
  land(impact) {
    this.landYv -= Math.min(1.2, impact * 0.18);
  }

  muzzleFlash() {
    if (!this.model) return;
    this.model.muzzle.getWorldPosition(this.flash.position);
    this.flashGlow.position.copy(this.flash.position);
    this.flash.material.rotation = Math.random() * Math.PI;
    const s = 0.1 + Math.random() * 0.06;
    this.flash.scale.setScalar(s);
    this.flash.visible = this.flashGlow.visible = true;
    this.flashLight.position.copy(this.flash.position);
    this.flashLight.intensity = 3.5;
    this.flashTime = 0.045;
  }

  ejectShell() {
    if (!this.model) return;
    const s = this.shells.acquire();
    s.active = true;
    s.life = 0.7;
    this.model.eject.getWorldPosition(s.mesh.position);
    s.vel.set(0.7 + Math.random() * 0.4, 0.9 + Math.random() * 0.4, 0.25 + Math.random() * 0.2);
    s.spin.set(Math.random() * 20, Math.random() * 20, 10 + Math.random() * 10);
    s.mesh.rotation.set(0, 0, Math.PI / 2);
    s.mesh.visible = true;
  }

  /**
   * @param {number} dt
   * @param {{ mouseDX: number, mouseDY: number, speed: number, grounded: boolean, crouching: boolean, sprinting: boolean }} m
   */
  update(dt, m) {
    this.time += dt;
    this.animator.update(dt);
    const pose = this.animator.pose;
    const base = VM_BASE[this.type] || VM_BASE.rifle;

    // sway: a arma "atrasa" em relação ao mouse
    const tx = Math.max(-0.09, Math.min(0.09, -m.mouseDX * 0.0011));
    const ty = Math.max(-0.07, Math.min(0.07, -m.mouseDY * 0.0011));
    this.swayX = damp(this.swayX, tx, 10, dt);
    this.swayY = damp(this.swayY, ty, 10, dt);

    // bob ao andar
    const moving = m.grounded && m.speed > 0.5;
    this.bobAmt = damp(this.bobAmt, moving ? Math.min(1, m.speed / 5) : 0, 8, dt);
    this.bobPhase += dt * (m.sprinting ? 11 : 8.5) * (moving ? 1 : 0.3);
    this.sprintAmt = damp(this.sprintAmt, m.sprinting ? 1 : 0, 9, dt);
    this.crouchAmt = damp(this.crouchAmt, m.crouching ? 1 : 0, 10, dt);

    // molas: recuo e aterrissagem
    const k = 160;
    const c = 2 * Math.sqrt(k) * 0.75;
    this.kickZv += (-k * this.kickZ - c * this.kickZv) * dt;
    this.kickZ += this.kickZv * dt;
    this.kickRv += (-k * this.kickR - c * this.kickRv) * dt;
    this.kickR += this.kickRv * dt;
    this.landYv += (-90 * this.landY - 12 * this.landYv) * dt;
    this.landY += this.landYv * dt;

    const breathe = Math.sin(this.time * 1.7) * 0.0016;
    const bx = Math.sin(this.bobPhase) * 0.007 * this.bobAmt;
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.009 * this.bobAmt;
    const sp = this.type === 'knife' ? SPRINT.knife : SPRINT.gun;
    const s = this.sprintAmt;

    this.rig.position.set(
      bx + sp.pos[0] * s + this.swayX * 0.12 - this.crouchAmt * 0.01,
      by + breathe + sp.pos[1] * s + this.swayY * 0.1 + this.landY * 0.05 - this.crouchAmt * 0.006,
      this.kickZ * 0.03 + sp.pos[2] * s,
    );
    this.rig.rotation.set(
      sp.rot[0] * s + this.swayY * 0.6 + this.kickR * 0.012,
      sp.rot[1] * s + this.swayX * 0.8,
      sp.rot[2] * s + bx * 1.5 - this.swayX * 0.4,
    );

    this.hand.position.set(base.pos[0] + pose.rp[0], base.pos[1] + pose.rp[1], base.pos[2] + pose.rp[2]);
    this.hand.rotation.set(base.rot[0] + pose.rr[0], base.rot[1] + pose.rr[1], base.rot[2] + pose.rr[2]);
    // O antebraço acompanha só parte da rotação animada do punho: em giros
    // grandes (inspeção) quem gira é o pulso, e o braço não invade a tela.
    if (this.right) {
      const k2 = 0.3;
      this.eA.set(base.rot[0] + pose.rr[0], base.rot[1] + pose.rr[1], base.rot[2] + pose.rr[2]);
      this.eB.set(base.rot[0] + pose.rr[0] * k2, base.rot[1] + pose.rr[1] * k2, base.rot[2] + pose.rr[2] * k2);
      this.qA.setFromEuler(this.eA).invert();
      this.qB.setFromEuler(this.eB).multiply(this.qRest.setFromEuler(this.forearmRest));
      this.right.forearm.quaternion.multiplyQuaternions(this.qA, this.qB);
    }
    this.item.position.set(pose.ip[0], pose.ip[1], pose.ip[2]);
    this.item.rotation.set(base.item[0] + pose.ir[0], base.item[1] + pose.ir[1], base.item[2] + pose.ir[2]);

    if (this.model?.mag) {
      // carregador: cai para baixo e para frente quando m → 1
      this.model.mag.position.set(this.magBase.x, this.magBase.y - pose.m * 0.24, this.magBase.z + pose.m * 0.05);
      this.model.mag.visible = pose.m < 0.98;
    }
    if (this.model?.slide) {
      this.slideKick = damp(this.slideKick, 0, 22, dt);
      this.model.slide.position.z = this.slideBase + this.slideKick * 0.03;
    }

    // flash
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      if (this.flashTime <= 0) {
        this.flash.visible = this.flashGlow.visible = false;
        this.flashLight.intensity = 0;
      }
    }
    // cápsulas
    this.shells.forEachActive((sh) => {
      sh.life -= dt;
      sh.vel.y -= 6 * dt;
      sh.mesh.position.addScaledVector(sh.vel, dt);
      sh.mesh.rotation.x += sh.spin.x * dt;
      sh.mesh.rotation.y += sh.spin.y * dt;
      if (sh.life <= 0) {
        sh.active = false;
        sh.mesh.visible = false;
      }
    });
  }

  /**
   * Posição do cano no MUNDO (para o tracer sair da arma, e não do olho).
   * Converte do espaço da câmera da viewmodel para a câmera do mundo,
   * corrigindo a diferença de FOV.
   * @param {THREE.PerspectiveCamera} worldCam
   * @param {THREE.Vector3} out
   */
  muzzleWorld(worldCam, out) {
    if (!this.model) return out.copy(worldCam.position);
    this.rig.updateMatrixWorld(true);
    this.model.muzzle.getWorldPosition(out);
    const f = Math.tan(THREE.MathUtils.degToRad(worldCam.fov / 2)) / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    out.x *= f;
    out.y *= f;
    return out.applyMatrix4(worldCam.matrixWorld);
  }

  /** @param {THREE.WebGLRenderer} renderer */
  render(renderer) {
    if (this.hidden || !this.model) return;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
