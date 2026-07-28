import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { EnemyShip } from '../entities/EnemyShip.js';
import { Projectiles } from './Projectiles.js';
import { Explosions } from './Explosions.js';
import { Health } from '../entities/Health.js';
import { computeLead } from './EnemyAI.js';
import { clamp } from '../core/MathUtils.js';

/** Velocidade nula reutilizada — explosões de asteroide não herdam movimento. */
const ZERO = new THREE.Vector3();

/**
 * Sistema de combate: dono das armas, dos inimigos, das colisões e da morte.
 *
 * ═══ SOBRE A BROADPHASE ═══
 *
 * Não há spatial hash aqui, de propósito. O número de pares a testar é
 * (projéteis × naves) ≈ 320 × 8 = 2560 testes por frame, cada um com ~15
 * operações de ponto flutuante. Isso é ~40k flops — algo que qualquer
 * dispositivo faz em muito menos de 0.1ms.
 *
 * Uma estrutura de aceleração aqui seria mais lenta que a força bruta,
 * porque manter o índice atualizado (todo projétil se move todo frame) custa
 * mais que os testes que ela evitaria. A spatial hash entra na Fase 3, quando
 * houver milhares de asteroides estáticos — que é o caso em que ela ganha.
 *
 * Escrever "otimização" antes de medir é o jeito mais comum de deixar um jogo
 * mais lento.
 */
export class Combat {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../entities/Ship.js').Ship} playerShip
   */
  constructor(scene, playerShip) {
    this.scene = scene;
    this.player = playerShip;
    this.playerHealth = new Health('player');

    this.projectiles = new Projectiles(scene);
    this.explosions = new Explosions(scene);

    /** @type {EnemyShip[]} */
    this.enemies = [];
    for (let i = 0; i < CONFIG.enemies.maxAlive; i++) {
      this.enemies.push(new EnemyShip(scene, i));
    }

    this.playerFireCooldown = 0;
    this.playerHeat = 0;
    this.overheatLock = 0;
    this.playerDead = false;
    this.respawnTimer = 0;
    this.ramCooldown = 0;

    this.waveTimer = 2.0;
    this.waveIndex = 0;
    this.kills = 0;
    this.deaths = 0;

    /** Alvo travado (o inimigo mais próximo do centro da tela). */
    this.currentTarget = null;
    this.leadPoint = new THREE.Vector3();
    this.hasLead = false;

    this.qualityTier = 'high';

    /** Injetado pelo Engine: devolve o AsteroidField ativo (ou null). */
    this.asteroidsProvider = () => null;
    this.asteroidCooldown = 0;
    /** Recursos coletados nesta sessão, por tipo. Consumidos na Fase 5. */
    this.resources = [0, 0, 0, 0];
    this.asteroidsDestroyed = 0;

    // Scratch.
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
    this._spawnPos = new THREE.Vector3();
    this._aimPoint = new THREE.Vector3();
    this._playerTargetRef = { position: null, velocity: null };
  }

  setQuality(tier) {
    this.qualityTier = tier.dust;   // reusa a mesma escala de detalhe
  }

  get aliveEnemies() {
    let n = 0;
    for (const e of this.enemies) if (e.active) n++;
    return n;
  }

  get entityCount() {
    return 1 + this.aliveEnemies + this.projectiles.activeCount
      + this.explosions.activeCount + (this.asteroidsProvider()?.visibleCount ?? 0);
  }

  /**
   * @param {import('../core/Input.js').ControlState} input
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} dt
   */
  update(input, camera, dt) {
    this.playerHealth.update(dt);
    if (this.ramCooldown > 0) this.ramCooldown -= dt;

    this._updateWaves(dt);
    this._updateTarget(camera);
    this._updatePlayerWeapons(input, dt);
    this._updateEnemies(dt);

    this.projectiles.update(dt);
    this._resolveHits();
    this._resolveAsteroids(dt);
    this._resolveRamming(dt);
    this.explosions.update(dt);

    this._updateRespawn(dt);
  }

  // ───────────────────────────────────────────────────────────────────────
  _updateWaves(dt) {
    if (this.playerDead) return;
    if (this.aliveEnemies > 0) return;

    this.waveTimer -= dt;
    if (this.waveTimer > 0) return;

    const sizes = CONFIG.enemies.waveSizes;
    const count = Math.min(
      sizes[Math.min(this.waveIndex, sizes.length - 1)],
      CONFIG.enemies.maxAlive,
    );
    this.spawnWave(count);
    this.waveIndex++;
    this.waveTimer = CONFIG.enemies.waveDelay;
  }

  /** Cria uma formação: um líder e alas com deslocamento fixo em relação a ele. */
  spawnWave(count) {
    const E = CONFIG.enemies;
    const free = this.enemies.filter((e) => !e.active).slice(0, count);
    if (free.length === 0) return;

    // Direção de chegada aleatória, mas SEMPRE à frente do jogador. Nascer
    // atrás significa tomar tiro sem aviso, o que o jogador lê como injusto —
    // e com razão: ele não teve informação pra reagir.
    const fwd = this.player.flight.getForward(this._tmp).clone();
    const right = this.player.flight.getRight(this._tmp2).clone();
    const up = new THREE.Vector3(0, 1, 0);

    const angle = (Math.random() - 0.5) * 1.5;
    const base = new THREE.Vector3()
      .addScaledVector(fwd, Math.cos(angle))
      .addScaledVector(right, Math.sin(angle))
      .normalize()
      .multiplyScalar(E.spawnDistance)
      .add(this.player.position);
    base.addScaledVector(up, (Math.random() - 0.5) * E.spawnSpread * 0.6);

    let leader = null;
    free.forEach((e, i) => {
      this._spawnPos.copy(base);
      if (i > 0) {
        this._spawnPos.x += (Math.random() - 0.5) * E.spawnSpread;
        this._spawnPos.y += (Math.random() - 0.5) * E.spawnSpread * 0.5;
        this._spawnPos.z += (Math.random() - 0.5) * E.spawnSpread;
      }
      e.spawn(this._spawnPos, this.player.position);

      if (i === 0) {
        leader = e.flight;
      } else {
        // Formação em "V": alas escalonados atrás e para os lados do líder.
        e.ai.leader = leader;
        const side = i % 2 === 0 ? 1 : -1;
        const rank = Math.ceil(i / 2);
        e.ai.formationOffset.set(
          side * CONFIG.enemies.ai.formationSpread * rank,
          rank * 8,
          CONFIG.enemies.ai.formationSpread * rank * 0.8,
        );
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  /**
   * Escolhe o alvo travado.
   *
   * ⚠ O cone de visão é uma PREFERÊNCIA, não um filtro. A primeira versão
   * descartava qualquer inimigo fora de ~56° do eixo da câmera, e isso criava
   * um impasse: um inimigo que passasse por você e ficasse às suas costas
   * nunca mais podia ser adquirido, então a seta de "alvo fora de tela" nunca
   * tinha o que apontar — exatamente na situação em que ela existe pra ajudar.
   * O jogador ficava sem nenhuma informação de onde estava a ameaça.
   *
   * Agora todo inimigo vivo é candidato. O alinhamento entra como bônus na
   * pontuação, de modo que quem está na frente ainda ganha, mas quem está
   * atrás pode ser travado — e aí a seta guia o jogador até ele.
   */
  _updateTarget(camera) {
    let best = null;
    let bestScore = -Infinity;
    const camFwd = this._tmp.set(0, 0, -1).applyQuaternion(camera.quaternion);

    for (const e of this.enemies) {
      if (!e.active) continue;
      this._tmp2.copy(e.position).sub(camera.position);
      const dist = this._tmp2.length();
      if (dist < 1) continue;
      this._tmp2.multiplyScalar(1 / dist);
      const alignment = this._tmp2.dot(camFwd);   // 1 = à frente, -1 = atrás

      // Alinhamento pesa muito mais que distância, mas a distância desempata
      // — e como nenhum candidato é descartado, sempre há um alvo enquanto
      // houver inimigo vivo.
      const score = alignment * 900 - dist * 0.35;
      if (score > bestScore) { bestScore = score; best = e; }
    }

    // Histerese: mantém o alvo atual enquanto ele estiver razoavelmente à
    // frente. Trocar de alvo sozinho durante a mira é um dos jeitos mais
    // rápidos de irritar o jogador.
    if (this.currentTarget && this.currentTarget.active) {
      this._tmp2.copy(this.currentTarget.position).sub(camera.position).normalize();
      if (this._tmp2.dot(camFwd) > 0.4) best = this.currentTarget;
    }
    this.currentTarget = best;

    this.hasLead = false;
    if (best) {
      computeLead(
        this.player.position, best.position, best.velocity,
        CONFIG.weapons.player.projectileSpeed, this.leadPoint,
      );
      this.hasLead = true;
    }
  }

  _updatePlayerWeapons(input, dt) {
    const W = CONFIG.weapons.player;

    // ── Calor ────────────────────────────────────────────────────────────
    // Superaquecimento existe pra impor RITMO. Sem ele, a estratégia ótima é
    // segurar o gatilho o tempo todo, e a arma deixa de ter decisão.
    if (this.overheatLock > 0) {
      this.overheatLock -= dt;
      this.playerHeat = Math.max(0, this.playerHeat - W.heatCooling * dt);
    } else {
      this.playerHeat = Math.max(0, this.playerHeat - W.heatCooling * dt);
    }

    this.playerFireCooldown -= dt;
    if (this.playerDead || !input.fire) return;
    if (this.overheatLock > 0 || this.playerFireCooldown > 0) return;

    this.playerFireCooldown = W.fireInterval;
    this.playerHeat += W.heatPerShot;
    if (this.playerHeat >= 1) {
      this.playerHeat = 1;
      this.overheatLock = W.overheatLock;
    }

    // Converge no ponto de interceptação do alvo, se houver um. Sem alvo,
    // converge na distância padrão à frente. Isso faz os dois canhões de asa
    // acertarem o mesmo ponto em vez de passarem raspando dos dois lados.
    if (this.hasLead) this._aimPoint.copy(this.leadPoint);
    else this._aimPoint.set(0, 0, -W.convergence)
      .applyQuaternion(this.player.quaternion).add(this.player.position);

    this.projectiles.fire(
      this.player.position, this.player.quaternion, this.player.flight.velocity,
      'player', 0, this._aimPoint,
    );
  }

  _updateEnemies(dt) {
    this._playerTargetRef.position = this.player.position;
    this._playerTargetRef.velocity = this.player.flight.velocity;

    for (const e of this.enemies) {
      if (!e.active) continue;
      e.update(this._playerTargetRef, dt, (origin, quat, vel) => {
        this.projectiles.fire(origin, quat, vel, 'enemy', 1);
      });

      // Inimigo que se afasta demais é reciclado. Sem isso, um que perde o
      // jogador de vista voa pra sempre em linha reta consumindo orçamento —
      // e trava a próxima onda, que só nasce quando todos morrem.
      // 4500u: precisa ser maior que a distância que um inimigo pode abrir
      // durante uma fuga do jogador, senão ele é reciclado justamente quando
      // estava voltando — e a onda nunca termina de forma legível.
      if (e.position.distanceToSquared(this.player.position) > 20_250_000) {
        e.despawn();
      }
    }
  }

  _resolveHits() {
    // ── Projéteis inimigos contra o jogador ──────────────────────────────
    if (!this.playerDead) {
      this.projectiles.collideSphere(
        this.player.position, this.playerHealth.radius, 0,
        (damage, point) => {
          const r = this.playerHealth.applyDamage(damage);
          if (r.absorbedByShield) this.explosions.shieldHit(point);
          else this.explosions.sparks(point, null);
          if (r.destroyed) this._killPlayer();
        },
      );
    }

    // ── Projéteis do jogador contra inimigos ─────────────────────────────
    for (const e of this.enemies) {
      if (!e.active) continue;
      this.projectiles.collideSphere(
        e.position, e.health.radius, 1,
        (damage, point) => {
          const r = e.health.applyDamage(damage);
          e.onHit();
          e.ai.onDamaged();
          if (r.absorbedByShield) this.explosions.shieldHit(point);
          else this.explosions.sparks(point, null);
          if (r.destroyed) this._killEnemy(e);
        },
      );
    }
  }

  /** Colisão nave-contra-nave. */
  _resolveRamming(dt) {
    if (this.playerDead || this.ramCooldown > 0) return;
    const pr = this.playerHealth.radius;

    for (const e of this.enemies) {
      if (!e.active) continue;
      const rSum = pr + e.health.radius;
      if (e.position.distanceToSquared(this.player.position) > rSum * rSum) continue;

      this.ramCooldown = CONFIG.combat.ramCooldown;
      this._tmp.copy(e.position).add(this.player.position).multiplyScalar(0.5);

      const pRes = this.playerHealth.applyDamage(CONFIG.combat.ramDamage);
      const eRes = e.health.applyDamage(CONFIG.combat.ramDamage * 2);
      this.explosions.sparks(this._tmp, null);
      if (eRes.destroyed) this._killEnemy(e);
      if (pRes.destroyed) this._killPlayer();
      break;
    }
  }

  /**
   * Colisões contra o cinturão de asteroides.
   *
   * Aqui a broadphase por spatial hash paga: são milhares de corpos estáticos
   * consultados por poucos móveis. Sem ela, cada projétil testaria 3200
   * asteroides por frame.
   */
  _resolveAsteroids(dt) {
    const field = this.asteroidsProvider();
    if (!field) return;
    if (this.asteroidCooldown > 0) this.asteroidCooldown -= dt;

    // ── Projéteis contra rocha ──────────────────────────────────────────
    this.projectiles.pool.forEachActive((p) => {
      const idx = field.querySegment(
        p.prevPosition.x, p.prevPosition.y, p.prevPosition.z,
        p.position.x, p.position.y, p.position.z,
      );
      if (idx < 0) return;

      field.getPosition(idx, this._tmp);
      const res = field.damage(idx, p.damage);
      if (res.destroyed) {
        this.explosions.explode(this._tmp, ZERO, Math.min(1.4, field.getScale(idx) / 45), this.qualityTier);
        this.asteroidsDestroyed++;
        // Só o tiro do JOGADOR credita recurso. Um inimigo destruindo rocha
        // não deveria encher a carga dele.
        if (res.resource > 0 && p.faction === 0) {
          this.resources[res.resource] = (this.resources[res.resource] ?? 0) + 1;
          this.onResourceCollected?.(res.resource);
        }
      } else {
        this.explosions.sparks(p.position, null);
      }
      this.projectiles.pool.release(p);
    });

    // ── Nave do jogador contra rocha ────────────────────────────────────
    if (!this.playerDead && this.asteroidCooldown <= 0) {
      const hit = field.querySphere(
        this.player.position.x, this.player.position.y, this.player.position.z,
        this.playerHealth.radius,
      );
      if (hit >= 0) {
        this.asteroidCooldown = CONFIG.asteroids.collisionCooldown;
        const r = this.playerHealth.applyDamage(CONFIG.asteroids.collisionDamage);
        field.getPosition(hit, this._tmp);
        this.explosions.sparks(this.player.position, null);
        // Empurra a nave pra fora da rocha. Sem isso ela fica presa dentro e
        // toma dano em ciclo até morrer, o que o jogador lê como travamento.
        this._tmp2.copy(this.player.position).sub(this._tmp);
        const d = this._tmp2.length();
        if (d > 1e-3) {
          this._tmp2.multiplyScalar(1 / d);
          const overlap = field.getRadius(hit) + this.playerHealth.radius - d;
          this.player.flight.position.addScaledVector(this._tmp2, overlap + 1.5);
          // Componente da velocidade contra a rocha é refletida e amortecida.
          const vn = this.player.flight.velocity.dot(this._tmp2);
          if (vn < 0) this.player.flight.velocity.addScaledVector(this._tmp2, -vn * 1.35);
        }
        if (r.destroyed) this._killPlayer();
      }
    }

    // ── Inimigos contra rocha ───────────────────────────────────────────
    // Sem isso os caças atravessam o cinturão como fantasmas, e a única
    // tática do jogador (atrair a perseguição pras rochas) deixa de existir.
    for (const e of this.enemies) {
      if (!e.active) continue;
      const hit = field.querySphere(e.position.x, e.position.y, e.position.z, e.health.radius);
      if (hit < 0) continue;
      const r = e.health.applyDamage(CONFIG.asteroids.collisionDamage * 1.6);
      e.onHit();
      if (r.destroyed) this._killEnemy(e);
    }
  }

  _killEnemy(e) {
    this.explosions.explode(e.position, e.velocity, 1, this.qualityTier);
    e.despawn();
    this.kills++;
    if (this.currentTarget === e) this.currentTarget = null;
  }

  _killPlayer() {
    this.playerDead = true;
    this.deaths++;
    this.respawnTimer = CONFIG.combat.player.respawnDelay;
    this.explosions.explode(this.player.position, this.player.flight.velocity, 1.9, this.qualityTier);
    this.player.object.visible = false;
    this.onPlayerDeath?.();
  }

  _updateRespawn(dt) {
    if (!this.playerDead) return;
    this.respawnTimer -= dt;
    if (this.respawnTimer > 0) return;

    this.playerDead = false;
    this.playerHealth.reset();
    this.playerHealth.invulnerable = CONFIG.combat.player.invulnAfterRespawn;

    // Reaparece parado, olhando pra onde estava. Não teleporta pra longe: o
    // jogador perde a noção de onde está se o mundo saltar embaixo dele.
    const f = this.player.flight;
    f.velocity.set(0, 0, 0);
    f.angularVelocity.set(0, 0, 0);
    f.throttle = CONFIG.flight.throttleInitial;
    this.player.object.visible = true;

    // Limpa os tiros em voo: reaparecer dentro de uma rajada já disparada
    // seria morte imediata e sem leitura.
    this.projectiles.clear();
    // Empurra os inimigos vivos pra longe, dando espaço pra retomar.
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (e.position.distanceToSquared(f.position) < 400 * 400) e.despawn();
    }

    this.onPlayerRespawn?.();
  }

  /** Fração 0..1 de calor da arma, para a HUD. */
  get heatPct() { return clamp(this.playerHeat, 0, 1); }
  get isOverheated() { return this.overheatLock > 0; }

  dispose() {
    this.projectiles.dispose();
    this.explosions.dispose();
    for (const e of this.enemies) e.dispose();
    EnemyShip.disposeShared();
  }
}
