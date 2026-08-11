import * as THREE from 'three';
import { DCFG } from '../config.js';
import { fbm, ridgedNoise } from '../../procgen/noise.js';
import { clamp, smoothstep } from '../../core/MathUtils.js';

/**
 * Terreno: um campo de altura procedural.
 *
 * ═══ POR QUE UM ARRAY DE ALTURAS E NÃO A FUNÇÃO DE RUÍDO ═══
 *
 * O jeito óbvio de responder "qual a altura do chão em (x,z)?" é chamar a
 * mesma função de ruído que gerou a malha. É também um bug: a malha é feita
 * de TRIÂNGULOS PLANOS entre os vértices, e a função de ruído é curva. Entre
 * dois vértices a função fica sistematicamente ACIMA do triângulo nos vales
 * e abaixo nos cumes. O sintoma é o drone encostar no ar em algumas partes
 * do relevo e afundar visivelmente em outras — e o pior é que só acontece em
 * alguns lugares, o que faz parecer bug de colisão em vez de erro de
 * amostragem.
 *
 * Guardamos então as alturas dos vértices num Float32Array e respondemos por
 * interpolação BILINEAR nessa mesma grade. O erro que sobra é a diferença
 * entre a bilinear (um paraboloide hiperbólico dentro do quadrado) e os dois
 * triângulos de fato desenhados: milímetros numa célula de 13 metros, contra
 * os metros de erro da amostragem direta.
 *
 * O array custa (segments+1)² floats — 146 KB na resolução padrão. É o
 * melhor negócio do projeto.
 */
export class Terrain {
  /** @param {THREE.Scene} scene */
  constructor(scene) {
    const T = DCFG.terrain;
    this.size = T.size;
    this.segments = T.segments;
    this.half = T.size / 2;
    this.cell = T.size / T.segments;
    this.n = T.segments + 1;

    this.heights = new Float32Array(this.n * this.n);
    this.water = new Uint8Array(this.n * this.n);

    this._buildHeights();
    this.mesh = this._buildMesh();
    scene.add(this.mesh);

    this.waterMesh = this._buildWater();
    scene.add(this.waterMesh);

    // Névoa exponencial. A cor tem que ser a MESMA do horizonte do céu,
    // senão os morros distantes desbotam para uma cor que não existe no céu
    // e aparece uma linha dura exatamente onde deveria haver continuidade.
    scene.fog = new THREE.FogExp2(DCFG.world.skyHorizon, DCFG.world.fogDensity);
  }

  /**
   * Altura do relevo num ponto do plano, em metros.
   *
   * Três camadas, e a ordem entre elas é o que faz o vale parecer um vale:
   *   1. relevo base (FBM) — as ondulações grandes;
   *   2. cristas (ridged) mascaradas — as serras nas bordas, que fecham o
   *      horizonte e dão escala ao voo;
   *   3. achatamento do pad — uma clareira plana em volta do ponto de
   *      decolagem.
   */
  _sampleHeight(x, z) {
    const T = DCFG.terrain;
    const s = T.noiseScale / 1000;
    const nx = x * s + 31.7;
    const nz = z * s + 12.3;

    // Base: ondulação larga. O `0.5` no eixo Y do ruído 3D é só um corte
    // fixo — usamos o ruído 3D existente como se fosse 2D.
    let h = fbm(nx, 0.5, nz, 5);

    // Serra: cresce com a distância do centro. O centro é onde se voa, e
    // manter o centro suave enquanto as bordas fecham o horizonte dá um
    // "estádio" natural — o mundo parece grande sem ser um campo vazio.
    const d = Math.hypot(x, z) / this.half;
    const serra = smoothstep(0.34, 0.95, d);
    if (serra > 0) {
      h += ridgedNoise(nx * 2.1 + 5.3, 0.5, nz * 2.1 + 5.3, 4) * serra * 0.85;
    }

    // Vale: uma depressão suave no meio do mapa, onde fica o lago. Sem ela o
    // terreno é uniformemente ondulado e não há nenhuma feição que se
    // reconheça de longe — e reconhecer o terreno é como se navega em FPV.
    h -= Math.exp(-((x + 160) ** 2 + (z - 220) ** 2) / (2 * 190 ** 2)) * 0.42;

    let height = h * DCFG.terrain.amplitude;

    // Clareira de decolagem. A transição usa smoothstep até `padBlend`: um
    // achatamento com borda dura viraria um platô de mesa de bilhar no meio
    // do relevo.
    const dPad = Math.hypot(x, z);
    if (dPad < T.padBlend) {
      const k = smoothstep(T.padRadius, T.padBlend, dPad);
      height = height * k + DCFG.terrain.amplitude * 0.30 * (1 - k);
    }
    return height;
  }

  _buildHeights() {
    const T = DCFG.terrain;
    for (let j = 0; j < this.n; j++) {
      const z = -this.half + j * this.cell;
      for (let i = 0; i < this.n; i++) {
        const x = -this.half + i * this.cell;
        let h = this._sampleHeight(x, z);
        const k = j * this.n + i;
        if (h < T.waterLevel) {
          // Fundo do lago achatado no nível da água. Modelar o fundo de
          // verdade não acrescenta nada — ninguém vai vê-lo — e criaria um
          // relevo submerso onde o drone bateria sem que nada explicasse.
          h = T.waterLevel - 0.6;
          this.water[k] = 1;
        }
        this.heights[k] = h;
      }
    }
  }

  _buildMesh() {
    const T = DCFG.terrain;
    const geo = new THREE.PlaneGeometry(T.size, T.size, T.segments, T.segments);
    // O PlaneGeometry nasce no plano XY olhando para +Z; girar -90° em X o
    // deita no plano XZ com a normal para cima.
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const C = T.colors;
    const grass = new THREE.Color(C.grass);
    const dry = new THREE.Color(C.grassDry);
    const rock = new THREE.Color(C.rock);
    const cliff = new THREE.Color(C.cliff);
    const sand = new THREE.Color(C.sand);

    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const k = j * this.n + i;
        const h = this.heights[k];
        pos.setY(k, h);

        // ── Cor por altura E por inclinação ──────────────────────────
        // Só por altura, o terreno vira um bolo de camadas horizontais. A
        // inclinação é o que faz a rocha aparecer onde a rocha aparece de
        // verdade: nas paredes, não numa faixa de altitude.
        const dh = Math.hypot(
          this._h(i + 1, j) - this._h(i - 1, j),
          this._h(i, j + 1) - this._h(i, j - 1),
        ) / (2 * this.cell);
        const slope = Math.atan(dh);

        const alt = clamp((h - T.waterLevel) / (T.amplitude * 0.9), 0, 1);
        c.copy(grass).lerp(dry, smoothstep(0.20, 0.62, alt));
        c.lerp(rock, smoothstep(0.55, 0.88, alt));
        c.lerp(sand, smoothstep(0.09, 0.0, alt));       // faixa de praia
        c.lerp(cliff, smoothstep(0.55, 0.95, slope));   // paredão

        // Ruído fino de cor. Sem ele, superfícies grandes de uma cor só
        // parecem plástico — e é barato: o olho lê variação como textura.
        const t = 0.90 + fbm(i * 0.35, 2.7, j * 0.35, 2) * 0.22;
        colors[k * 3] = c.r * t;
        colors[k * 3 + 1] = c.g * t;
        colors[k * 3 + 2] = c.b * t;
      }
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      // ═══ POR QUE UMA TEXTURA, SE JÁ HÁ COR POR VÉRTICE ═══
      //
      // A cor por vértice varia a cada 13,7 metros — a resolução da grade.
      // Isso é suficiente visto de 50 metros e é um vazio absoluto visto de
      // um metro, que é onde este jogo acontece. Voando rasante sobre uma
      // superfície de cor chapada, NÃO HÁ SENSAÇÃO DE VELOCIDADE: nada se
      // move na imagem, e 100 km/h parecem 10.
      //
      // A textura repetida resolve isso com um canvas de 128 px e nenhum
      // download. Ela não precisa parecer grama de perto — precisa dar ao
      // olho algo que passe rápido.
      map: this._detailTexture(),
      roughness: 0.95,
      metalness: 0.0,
      // `flatShading` daria um look low-poly bonito e mentiria sobre o
      // relevo: em FPV rasante o piloto lê a inclinação do chão pela
      // iluminação, e facetas planas escondem justamente as ondulações
      // suaves que ele precisa antecipar.
      flatShading: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.name = 'terreno';
    return mesh;
  }

  /**
   * Textura de detalhe do solo, desenhada num canvas.
   *
   * Cinza quase neutro, porque ela MULTIPLICA a cor por vértice: a cor vem
   * do terreno (grama, rocha, areia) e a textura só acrescenta variação.
   * Uma textura colorida sobrescreveria a paleta do relevo e faria a praia
   * ficar verde.
   *
   * O `repeat` alto (uma repetição a cada ~6 metros) é o que dá cadência
   * visual em voo rasante. Alto demais vira ruído cintilante; o mipmap
   * cuida da distância.
   */
  _detailTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    // Base clara e traços em volta dela: como a textura MULTIPLICA a cor do
    // vértice, uma média muito abaixo de 1 escureceria o mapa inteiro. A
    // média aqui fica em ~0,88 — o pouco que falta vira contraste, não
    // sujeira.
    ctx.fillStyle = '#dcdcdc';
    ctx.fillRect(0, 0, 128, 128);
    // Manchas curtas e orientadas, não pontos: grama tem direção, e traços
    // leem como grama enquanto pontos leem como areia.
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 128;
      const y = Math.random() * 128;
      const g = 190 + Math.random() * 65;
      ctx.strokeStyle = `rgb(${g},${g},${g})`;
      ctx.lineWidth = Math.random() < 0.5 ? 1 : 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 5, y + (Math.random() - 0.5) * 5);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(DCFG.terrain.size / 6, DCFG.terrain.size / 6);
    // Anisotropia importa MUITO aqui: o chão é visto em ângulo rasante quase
    // o tempo todo, que é exatamente o caso em que a filtragem trilinear
    // borra a textura até virar cinza uniforme.
    tex.anisotropy = 4;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _h(i, j) {
    const ii = clamp(i, 0, this.n - 1);
    const jj = clamp(j, 0, this.n - 1);
    return this.heights[jj * this.n + ii];
  }

  _buildWater() {
    const T = DCFG.terrain;
    const geo = new THREE.PlaneGeometry(T.size, T.size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      color: T.colors.water,
      roughness: 0.08,
      metalness: 0.55,
      transparent: true,
      opacity: 0.86,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = T.waterLevel;
    mesh.renderOrder = 1;
    return mesh;
  }

  // ─────────────────────────────────────────────────────────────────────
  /** Altura do chão em (x,z), por interpolação bilinear na grade. */
  heightAt(x, z) {
    const gx = (x + this.half) / this.cell;
    const gz = (z + this.half) / this.cell;
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;

    const h00 = this._h(i, j);
    const h10 = this._h(i + 1, j);
    const h01 = this._h(i, j + 1);
    const h11 = this._h(i + 1, j + 1);

    const a = h00 + (h10 - h00) * fx;
    const b = h01 + (h11 - h01) * fx;
    return a + (b - a) * fz;
  }

  /** Normal do terreno por diferenças centrais. Usada pelo quique, pela
   *  poeira e pela inclinação com que o drone descansa no chão. */
  normalAt(x, z, out = new THREE.Vector3()) {
    const e = this.cell;
    const hL = this.heightAt(x - e, z);
    const hR = this.heightAt(x + e, z);
    const hD = this.heightAt(x, z - e);
    const hU = this.heightAt(x, z + e);
    // O gradiente aponta para a subida; a normal é o gradiente negado no
    // plano, com 2e no eixo vertical (o comprimento do passo em cada eixo).
    return out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  isWater(x, z) {
    const gx = clamp(Math.round((x + this.half) / this.cell), 0, this.n - 1);
    const gz = clamp(Math.round((z + this.half) / this.cell), 0, this.n - 1);
    return this.water[gz * this.n + gx] === 1;
  }

  /** Está dentro do campo? Fora dele não há grade — e nada deveria chegar
   *  lá, porque a cerca virtual é bem menor que o terreno. */
  contains(x, z) {
    return Math.abs(x) < this.half && Math.abs(z) < this.half;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
    this.waterMesh.geometry.dispose();
    this.waterMesh.material.dispose();
  }
}
