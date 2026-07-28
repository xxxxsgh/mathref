import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Pool } from '../core/Pool.js';
import { getGlowTexture } from '../entities/ShipModel.js';

/**
 * Partículas: explosões, faíscas de impacto e clarões.
 *
 * Tudo desenhado em UM sistema de `Points` com atributos por partícula
 * (posição, cor, tamanho, opacidade). Um Points = um draw call, independente
 * de haver 5 ou 900 partículas em tela.
 *
 * Os buffers são escritos na CPU e enviados uma vez por frame. Isso é mais
 * caro que fazer a animação no shader, mas muito mais simples de controlar —
 * e com ~900 partículas o custo é irrelevante (é menos trabalho que uma única
 * transformação de malha de nave).
 *
 * O clarão inicial e o anel de impacto de escudo são sprites separados,
 * porque precisam de escala grande e curva de opacidade própria.
 */
export class Explosions {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    const E = CONFIG.effects.explosion;
    const max = E.maxActive;

    this.pool = new Pool(max, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      size: 1,
      colorA: new THREE.Color(),
      colorB: new THREE.Color(),
      drag: 1,
      __poolIndex: -1,
    }), (p) => { p.life = 0; });

    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setDrawRange(0, 0);
    // Sem bounding sphere calculada: as partículas mudam todo frame e o
    // recálculo custaria mais que o culling economizaria.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uPixelRatio: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPixelRatio;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = max(0.001, -mv.z);
          gl_PointSize = aSize * uPixelRatio * (420.0 / dist);
          vColor = aColor;
          vAlpha = aAlpha;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          // Queda quadrática: núcleo forte e borda macia, sem textura.
          float a = 1.0 - smoothstep(0.08, 0.5, r);
          a *= a;
          gl_FragColor = vec4(vColor, a * vAlpha);
        }
      `,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);

    // ── Clarões e anéis de escudo: sprites com vida própria ───────────────
    const glow = getGlowTexture();
    this.flashMaterial = new THREE.SpriteMaterial({
      map: glow,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    });
    this.flashes = new Pool(24, () => {
      const s = new THREE.Sprite(this.flashMaterial.clone());
      s.visible = false;
      scene.add(s);
      return { sprite: s, life: 0, maxLife: 1, size: 1, __poolIndex: -1 };
    }, (f) => { f.life = 0; });

    this._tmpColor = new THREE.Color();
  }

  setPixelRatio(r) { this.material.uniforms.uPixelRatio.value = r; }

  get activeCount() { return this.pool.activeCount; }

  /**
   * Explosão de nave destruída.
   * @param {THREE.Vector3} position
   * @param {THREE.Vector3} inheritVelocity a explosão herda o movimento da
   *        nave — sem isso a bola de fogo fica parada enquanto os destroços
   *        deveriam continuar viajando, e o efeito parece descolado.
   * @param {number} scale
   * @param {string} tier qualidade ('high'|'medium'|'low')
   */
  explode(position, inheritVelocity, scale, tier) {
    const E = CONFIG.effects.explosion;
    const n = Math.round(E.particles[tier] * scale);

    for (let i = 0; i < n; i++) {
      const p = this.pool.acquire();
      if (!p) break;   // pool cheio: melhor perder partícula que estourar orçamento
      p.position.copy(position);

      // Direção uniformemente distribuída na esfera. Sortear os três eixos
      // independentemente concentraria partículas nas diagonais do cubo —
      // o resultado seria uma explosão com cara de octaedro.
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const speed = E.speed * scale * (1 + (Math.random() - 0.5) * 2 * E.speedVariance);
      p.velocity.set(s * Math.cos(theta), s * Math.sin(theta), u).multiplyScalar(speed);
      p.velocity.add(inheritVelocity);

      p.maxLife = E.life * (1 + (Math.random() - 0.5) * 2 * E.lifeVariance);
      p.life = p.maxLife;
      p.size = E.size * scale * (0.5 + Math.random());
      p.drag = E.drag;
      // Cada partícula esfria de uma cor quente pra uma fria ao longo da vida.
      // Partículas com temperatura inicial variada é o que dá profundidade —
      // uma bola de fogo monocromática parece um decalque.
      p.colorA.setHex(Math.random() < 0.35 ? E.colorHot : E.colorMid);
      p.colorB.setHex(E.colorCool);
    }

    this._flash(position, E.flashSize * scale, E.flashDuration, 0xffdca8);
  }

  /** Faíscas de acerto no casco. */
  sparks(position, normalHint) {
    const S = CONFIG.effects.hitSpark;
    for (let i = 0; i < S.particles; i++) {
      const p = this.pool.acquire();
      if (!p) break;
      p.position.copy(position);
      p.velocity.set(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2,
      ).normalize().multiplyScalar(S.speed * (0.5 + Math.random()));
      if (normalHint) p.velocity.addScaledVector(normalHint, S.speed * 0.5);
      p.maxLife = S.life * (0.6 + Math.random() * 0.8);
      p.life = p.maxLife;
      p.size = S.size;
      p.drag = 3.5;
      p.colorA.setHex(S.color);
      p.colorB.setHex(0x803000);
    }
  }

  /** Anel de impacto de escudo: um clarão ciano, maior e mais curto. */
  shieldHit(position) {
    const S = CONFIG.effects.shieldHit;
    this._flash(position, S.size, S.duration, S.color);
  }

  _flash(position, size, duration, colorHex) {
    const f = this.flashes.acquire();
    if (!f) return;
    f.sprite.position.copy(position);
    f.sprite.material.color.setHex(colorHex);
    f.sprite.material.opacity = 1;
    f.sprite.scale.setScalar(size * 0.35);
    f.sprite.visible = true;
    f.maxLife = duration;
    f.life = duration;
    f.size = size;
  }

  /** @param {number} dt */
  update(dt) {
    let n = 0;
    this.pool.forEachActive((p) => {
      p.life -= dt;
      if (p.life <= 0) { this.pool.release(p); return; }

      // Arrasto exponencial: os destroços desaceleram rápido no início e
      // depois flutuam. Sem arrasto a explosão vira uma casca esférica
      // perfeita se expandindo, que denuncia o sistema de partículas.
      p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
      p.position.addScaledVector(p.velocity, dt);

      const t = p.life / p.maxLife;          // 1 → 0
      this._tmpColor.copy(p.colorB).lerp(p.colorA, t);

      const i3 = n * 3;
      this.positions[i3] = p.position.x;
      this.positions[i3 + 1] = p.position.y;
      this.positions[i3 + 2] = p.position.z;
      this.colors[i3] = this._tmpColor.r;
      this.colors[i3 + 1] = this._tmpColor.g;
      this.colors[i3 + 2] = this._tmpColor.b;
      // Cresce um pouco e some. A curva de alpha em t² faz a partícula sumir
      // rápido no fim, evitando o "pontilhado" de partículas quase invisíveis.
      this.sizes[n] = p.size * (1.6 - t * 0.6);
      this.alphas[n] = t * t;
      n++;
    });

    this.geometry.setDrawRange(0, n);
    if (n > 0) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.aColor.needsUpdate = true;
      this.geometry.attributes.aSize.needsUpdate = true;
      this.geometry.attributes.aAlpha.needsUpdate = true;
    }

    this.flashes.forEachActive((f) => {
      f.life -= dt;
      if (f.life <= 0) {
        f.sprite.visible = false;
        this.flashes.release(f);
        return;
      }
      const t = f.life / f.maxLife;
      // O clarão EXPANDE enquanto some — é o que lê como onda de choque.
      f.sprite.scale.setScalar(f.size * (1.3 - t * 0.75));
      f.sprite.material.opacity = t * t;
    });
  }

  clear() {
    this.pool.releaseAll();
    this.flashes.forEachActive((f) => { f.sprite.visible = false; });
    this.flashes.releaseAll();
    this.geometry.setDrawRange(0, 0);
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.flashes.items.forEach((f) => {
      this.scene.remove(f.sprite);
      f.sprite.material.dispose();
    });
    this.flashMaterial.dispose();
  }
}
