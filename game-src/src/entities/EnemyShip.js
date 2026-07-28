import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { createEnemyShip, getGlowTexture } from './ShipModel.js';
import { FlightModel } from '../systems/FlightModel.js';
import { EnemyAI } from '../systems/EnemyAI.js';
import { Health } from './Health.js';
import { damp } from '../core/MathUtils.js';

/**
 * Caça inimigo: modelo de voo + IA + saúde + malha.
 *
 * Inimigos são POOLADOS, não criados e destruídos. Cada um mantém sua malha na
 * cena com `visible = false` quando morto. Criar um `Mesh` novo a cada spawn
 * obrigaria o Three a recompilar/reassociar estado de material e alocaria
 * geometria — justamente no frame de uma explosão, que já é o mais pesado.
 *
 * A geometria e os materiais são COMPARTILHADOS entre todos os inimigos: uma
 * cópia só na memória da GPU, e o renderer consegue agrupar os draw calls.
 */

/** Recursos compartilhados, criados uma vez. */
let shared = null;
function getShared() {
  if (shared) return shared;
  const built = createEnemyShip();
  const glow = getGlowTexture();
  shared = {
    geometry: built.mesh.geometry,
    materials: built.mesh.material,
    nozzles: built.nozzles,
    flameMaterial: new THREE.SpriteMaterial({
      map: glow, color: 0xff7a3c, blending: THREE.AdditiveBlending,
      depthWrite: false, transparent: true, toneMapped: false,
    }),
    dispose: built.dispose,
  };
  // O grupo temporário não é usado; só queríamos a geometria mesclada.
  built.group.clear();
  return shared;
}

export class EnemyShip {
  /** @param {THREE.Scene} scene @param {number} index */
  constructor(scene, index) {
    const S = getShared();
    this.scene = scene;
    this.index = index;

    this.flight = new FlightModel();
    // Sobrescreve as constantes de voo do jogador pelas do inimigo. O
    // FlightModel lê de CONFIG.flight, então injetamos um perfil próprio.
    //
    // Cópia, e não referência a `CONFIG.enemies.flight`: o escalonamento por
    // onda ajusta a velocidade máxima POR NAVE, e escrever direto no config
    // faria a onda 12 acelerar permanentemente todos os inimigos do jogo,
    // inclusive os das ondas seguintes que deveriam partir do valor base.
    this.flightProfile = { ...CONFIG.enemies.flight };
    /** Multiplicador de dano dos tiros, vindo do escalonamento por onda. */
    this.damageMul = 1;

    this.ai = new EnemyAI(index);
    this.health = new Health('enemy');
    this.active = false;
    this.fireCooldown = 0;

    this.mesh = new THREE.Mesh(S.geometry, S.materials);
    this.object = new THREE.Group();
    this.object.add(this.mesh);
    this.object.visible = false;
    scene.add(this.object);

    this.flames = [];
    for (const n of S.nozzles) {
      const s = new THREE.Sprite(S.flameMaterial);
      s.position.copy(n).add(new THREE.Vector3(0, 0, 0.3));
      s.scale.setScalar(1);
      this.object.add(s);
      this.flames.push(s);
    }

    /** Estado de controle reaproveitado — a IA escreve aqui todo frame. */
    this.control = {
      pitch: 0, yaw: 0, roll: 0, throttle: 0.8,
      strafeX: 0, strafeY: 0, boost: false, brake: false, barrelRoll: 0,
    };

    this._glow = 0.5;
    this._hitFlash = 0;
  }

  get position() { return this.flight.position; }
  get velocity() { return this.flight.velocity; }
  get quaternion() { return this.flight.quaternion; }

  /**
   * Aplica o escalonamento da onda. Sempre a partir dos valores BASE do
   * config, nunca do estado anterior — o mesmo princípio de `_applyUpgrades`
   * no Engine, e pelo mesmo motivo: assim dá pra chamar quantas vezes quiser
   * sem os números inflarem.
   *
   * @param {{hull:number, shield:number, damage:number, speed:number, aimError:number}} [k]
   */
  applyScale(k) {
    const C = CONFIG.combat.enemy;
    this.health.hullMax = C.hullMax * (k?.hull ?? 1);
    this.health.shieldMax = C.shieldMax * (k?.shield ?? 1);
    this.damageMul = k?.damage ?? 1;
    this.ai.aimErrorMul = k?.aimError ?? 1;
    // Recarrega o perfil inteiro do config antes de escalar: assim mexer nos
    // valores pelo painel de tuning tem efeito no próximo spawn.
    Object.assign(this.flightProfile, CONFIG.enemies.flight);
    this.flightProfile.maxSpeed = CONFIG.enemies.flight.maxSpeed * (k?.speed ?? 1);
  }

  /** Coloca o inimigo em jogo.
   *  @param {object} [scale] escalonamento da onda; ver applyScale */
  spawn(position, lookAt, scale) {
    this.flight.position.copy(position);
    this.flight.velocity.set(0, 0, 0);
    this.flight.angularVelocity.set(0, 0, 0);
    this.flight.throttle = 0.8;

    // Orienta pro alvo. `lookAt` de Matrix4 monta a base; extrair o quaternion
    // dela evita ter que compor rotações na mão.
    const m = new THREE.Matrix4();
    m.lookAt(position, lookAt, new THREE.Vector3(0, 1, 0));
    this.flight.quaternion.setFromRotationMatrix(m);

    this.ai = new EnemyAI(this.index);
    // A escala vem ANTES do reset: é ela que define hullMax/shieldMax, e o
    // reset é o que enche as barras até esses máximos.
    this.applyScale(scale);
    this.health.reset();
    this.active = true;
    this.fireCooldown = 0.4 + Math.random() * 0.6;
    this.object.visible = true;
    this._hitFlash = 0;
  }

  despawn() {
    this.active = false;
    this.object.visible = false;
    this.ai.leader = null;
  }

  /**
   * @param {{position: THREE.Vector3, velocity: THREE.Vector3}} target
   * @param {number} dt
   * @param {(origin, quat, vel) => void} onFire
   */
  update(target, dt, onFire) {
    if (!this.active) return;

    this.ai.update(this.flight, target, CONFIG.weapons.enemy.projectileSpeed, dt, this.control);

    // Aplica o perfil de voo do inimigo trocando temporariamente as constantes
    // globais. É feio, mas a alternativa (parametrizar o FlightModel inteiro)
    // duplicaria a assinatura de todo método por um ganho nulo — e assim os
    // dois perfis continuam ajustáveis do mesmo `config.js`.
    withProfile(this.flightProfile, () => this.flight.update(this.control, dt));

    this.health.update(dt);

    this.object.position.copy(this.flight.position);
    this.object.quaternion.copy(this.flight.quaternion);

    this.fireCooldown -= dt;
    if (this.ai.wantsFire && this.fireCooldown <= 0) {
      this.fireCooldown = CONFIG.weapons.enemy.fireInterval;
      onFire(this.flight.position, this.flight.quaternion, this.flight.velocity);
    }

    // Brilho dos motores e piscada ao levar dano.
    this._glow = damp(this._glow, 0.35 + this.flight.throttle * 0.9 + (this.control.boost ? 0.7 : 0), 8, dt);
    for (const f of this.flames) f.scale.setScalar(0.5 + this._glow * 0.8);

    if (this._hitFlash > 0) {
      this._hitFlash = Math.max(0, this._hitFlash - dt * 6);
      // Escala pulsante no impacto: feedback tátil sem custo de shader.
      const k = 1 + this._hitFlash * 0.12;
      this.mesh.scale.setScalar(k);
    } else if (this.mesh.scale.x !== 1) {
      this.mesh.scale.setScalar(1);
    }
  }

  onHit() { this._hitFlash = 1; }

  dispose() {
    this.scene.remove(this.object);
  }

  /** Libera os recursos compartilhados. Chamado uma vez, no fim. */
  static disposeShared() {
    if (!shared) return;
    shared.dispose();
    shared.flameMaterial.dispose();
    shared = null;
  }
}

/**
 * Executa `fn` com as constantes de voo trocadas por `profile`.
 *
 * O `FlightModel` lê direto de `CONFIG.flight` — o que é ótimo pro jogador,
 * porque deixa tudo ajustável em runtime pelo painel de tuning. Para os
 * inimigos, trocamos os campos, rodamos e restauramos. É síncrono e sem
 * reentrância, então não há risco de estado vazado.
 */
const _saved = {};
function withProfile(profile, fn) {
  const F = CONFIG.flight;
  for (const k in profile) { _saved[k] = F[k]; F[k] = profile[k]; }
  try {
    fn();
  } finally {
    for (const k in profile) F[k] = _saved[k];
  }
}
