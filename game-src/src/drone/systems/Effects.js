import * as THREE from 'three';
import { Pool } from '../../core/Pool.js';

/**
 * Partículas: poeira das hélices, respingo de água e destroços do acidente.
 *
 * ═══ POR QUE A POEIRA IMPORTA MAIS DO QUE PARECE ═══
 *
 * Pairar a meio metro do chão num campo de grama uniforme é visualmente
 * ambíguo: sem nada se movendo, a imagem é a mesma a 0,5 m e a 5 m. A poeira
 * levantada pelas hélices resolve isso — ela só aparece perto do chão, e a
 * intensidade dela é a leitura de altura que o piloto usa para pousar.
 *
 * É o mesmo papel que a poeira espacial tem no jogo de nave: dar movimento
 * ao referencial. Lá o problema era não ter referência de velocidade no
 * vazio; aqui é não ter referência de altura sobre um campo liso.
 *
 * Tudo num único `Points` com atributos por partícula: um draw call,
 * independente de haver 3 ou 400 partículas. Mistura NORMAL e não aditiva —
 * poeira em luz do dia é opaca e escura, e aditivo faria grãos luminosos.
 */

const MAX = 420;

export class Effects {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    this.pool = new Pool(MAX, () => ({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0, maxLife: 1, size: 1, gravity: 0, drag: 1,
      color: new THREE.Color(),
      __poolIndex: -1,
    }), (p) => { p.life = 0; });

    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.sizes = new Float32Array(MAX);
    this.alphas = new Float32Array(MAX);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setDrawRange(0, 0);
    // As partículas mudam todo frame; recalcular a esfera envolvente custaria
    // mais do que o culling economizaria.
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uPixelRatio: { value: 1 }, uScale: { value: 500 } },
      vertexShader: /* glsl */`
        attribute vec3 aColor;
        attribute float aSize;
        attribute float aAlpha;
        uniform float uPixelRatio;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          // aSize esta em METROS, e uScale converte metros na distancia
          // 1 para pixels (ver setProjection). Sem essa conversao o tamanho
          // vira um numero arbitrario que parece certo a uma distancia e
          // cobre a tela em qualquer outra: uma particula de poeira vista a
          // dois metros no pouso e justamente o caso que denuncia o erro.
          gl_PointSize = aSize * uScale * uPixelRatio / max(0.05, -mv.z);
          // Teto de seguranca: uma particula muito perto da camera pediria
          // milhares de pixels, e alguns drivers ignoram o draw inteiro.
          gl_PointSize = min(gl_PointSize, 180.0 * uPixelRatio);
          vColor = aColor;
          vAlpha = aAlpha;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = 1.0 - smoothstep(0.18, 0.5, r);
          gl_FragColor = vec4(vColor, a * vAlpha);
        }
      `,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);

    this._accum = 0;
    this._tmp = new THREE.Vector3();
    // Vetor de velocidade reutilizado na emissão. `_spawn` copia o conteúdo,
    // então um só basta — e alocar um Vector3 por partícula devolveria ao
    // coletor de lixo exatamente o stutter que o pool existe para evitar.
    this._vel = new THREE.Vector3();
  }

  setPixelRatio(r) { this.material.uniforms.uPixelRatio.value = r; }

  /** Recalcula a conversão metro→pixel. Depende da altura da viewport e do
   *  FOV, então precisa ser chamada quando qualquer um dos dois muda — e o
   *  FOV muda a cada troca de câmera. */
  setProjection(fovDegrees, viewportHeight) {
    const halfFov = (fovDegrees * Math.PI / 180) / 2;
    this.material.uniforms.uScale.value = (viewportHeight / 2) / Math.tan(halfFov);
  }

  get activeCount() { return this.pool.activeCount; }

  _spawn(pos, vel, opts) {
    // `acquireForced`: com o pool cheio, perder a partícula MAIS VELHA é
    // imperceptível; a nova simplesmente não aparecer é um buraco visível
    // exatamente no momento de mais ação.
    const p = this.pool.acquireForced();
    p.position.copy(pos);
    p.velocity.copy(vel);
    p.life = p.maxLife = opts.life;
    p.size = opts.size;
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 1.4;
    p.color.setHex(opts.color);
    return p;
  }

  /**
   * Sopro das hélices no solo.
   *
   * Emite em ANEL, não em ponto: o fluxo de um quadricóptero desce no centro
   * e sai radialmente pelos lados ao encontrar o chão. Um jato central
   * pareceria fumaça saindo do drone; o anel é o que lê como "vento batendo
   * no chão", e é o que a imagem de um drone pousando de verdade mostra.
   *
   * @param {THREE.Vector3} groundPoint ponto do solo sob o drone
   * @param {THREE.Vector3} normal normal do terreno ali
   * @param {number} intensity 0..1 — empuxo × proximidade do chão
   */
  propWash(groundPoint, normal, intensity, isWater, dt) {
    if (intensity <= 0.02) return;
    this._accum += intensity * 90 * dt;
    let n = Math.floor(this._accum);
    if (n <= 0) return;
    this._accum -= n;
    n = Math.min(n, 5);   // teto por frame, para não estourar o pool

    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.5;
      this._tmp.set(groundPoint.x + Math.cos(ang) * r, groundPoint.y + 0.05,
                    groundPoint.z + Math.sin(ang) * r);
      const speed = 1.6 + Math.random() * 2.8 * intensity;
      this._vel.set(Math.cos(ang) * speed, 0.5 + Math.random() * 0.9, Math.sin(ang) * speed)
        .addScaledVector(normal, 0.8);

      this._spawn(this._tmp, this._vel, {
        life: 0.5 + Math.random() * 0.6,
        size: isWater ? 0.22 : 0.34,
        color: isWater ? 0xd8ecf5 : 0xbdae90,
        gravity: isWater ? -3.2 : -0.8,
        drag: 2.1,
      });
    }
  }

  /** Destroços do acidente: fibra de carbono, plástico de hélice e terra. */
  debris(position, count = 26) {
    for (let i = 0; i < count; i++) {
      this._vel.set((Math.random() - 0.5) * 9, Math.random() * 6, (Math.random() - 0.5) * 9);
      this._spawn(position, this._vel, {
        life: 0.8 + Math.random() * 1.4,
        size: 0.05 + Math.random() * 0.09,
        color: Math.random() < 0.4 ? 0x8f7f68 : 0x2b2e34,
        gravity: -9.81,
        drag: 0.5,
      });
    }
  }

  /** Fagulhas brancas do impacto — o clarão que marca o instante da batida. */
  sparks(position, count = 14) {
    for (let i = 0; i < count; i++) {
      this._vel.set((Math.random() - 0.5) * 5, Math.random() * 3.5, (Math.random() - 0.5) * 5);
      this._spawn(position, this._vel, {
        life: 0.22 + Math.random() * 0.2,
        size: 0.07,
        color: 0xfff0c0,
        gravity: -4,
        drag: 3.5,
      });
    }
  }

  update(dt) {
    let n = 0;
    this.pool.forEachActive((p) => {
      p.life -= dt;
      if (p.life <= 0) { this.pool.release(p); return; }

      p.velocity.y += p.gravity * dt;
      p.velocity.multiplyScalar(Math.exp(-p.drag * dt));
      p.position.addScaledVector(p.velocity, dt);

      const t = p.life / p.maxLife;
      const i3 = n * 3;
      this.positions[i3] = p.position.x;
      this.positions[i3 + 1] = p.position.y;
      this.positions[i3 + 2] = p.position.z;
      this.colors[i3] = p.color.r;
      this.colors[i3 + 1] = p.color.g;
      this.colors[i3 + 2] = p.color.b;
      // A partícula CRESCE enquanto some. Poeira se dispersa; encolher
      // enquanto some faria ela parecer sugada de volta.
      this.sizes[n] = p.size * (1.7 - t * 0.7);
      this.alphas[n] = t * t * 0.75;
      n++;
    });

    this.geometry.setDrawRange(0, n);
    if (n > 0) {
      this.geometry.attributes.position.needsUpdate = true;
      this.geometry.attributes.aColor.needsUpdate = true;
      this.geometry.attributes.aSize.needsUpdate = true;
      this.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
