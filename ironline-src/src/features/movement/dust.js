import * as THREE from 'three';

/**
 * Poeira levantada pelo corpo do jogador: rastro do slide (sai dos
 * calcanhares), lufada da aterrissagem, poeirinha do sprint em terra.
 *
 * Um único InstancedMesh de quads virados para a câmera (1 draw call), com
 * material Lambert — recebe a MESMA luz do mundo (sol + hemisfério), então a
 * poeira acompanha a exposição/gradação da cena em vez de "brilhar". A
 * opacidade por instância entra por um atributo injetado no shader, e as
 * bordas são suavizadas pela textura (ruído fBm em disco).
 */
const MAX = 96;
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _rz = new THREE.Quaternion();
const _Z = new THREE.Vector3(0, 0, 1);

/** Cor da poeira por material do chão (linear). */
const TINT = {
  asphalt: [0.66, 0.62, 0.56],
  concrete: [0.7, 0.67, 0.62],
  dirt: [0.62, 0.52, 0.38],
  grass: [0.42, 0.4, 0.3],
  brick: [0.55, 0.42, 0.34],
  wood: [0.45, 0.4, 0.33],
  metal: [0.4, 0.4, 0.4],
};

function puffTexture() {
  const N = 128;
  const d = new Uint8Array(N * N * 4);
  // ruído de valor simples em 3 oitavas (determinístico)
  const lat = (s, n) => {
    const a = new Float32Array(n * n);
    let x = s;
    for (let i = 0; i < a.length; i++) {
      x = (x * 16807) % 2147483647;
      a[i] = x / 2147483647;
    }
    return a;
  };
  const oct = [lat(7, 6), lat(11, 12), lat(13, 24)];
  const sample = (a, n, u, v) => {
    const fx = u * n, fy = v * n;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const g = (ii, jj) => a[((jj % n) + n) % n * n + (((ii % n) + n) % n)];
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    return (g(i, j) * (1 - sx) + g(i + 1, j) * sx) * (1 - sy) + (g(i, j + 1) * (1 - sx) + g(i + 1, j + 1) * sx) * sy;
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const r = Math.hypot(u - 0.5, v - 0.5) * 2;
      const n = sample(oct[0], 6, u, v) * 0.55 + sample(oct[1], 12, u, v) * 0.3 + sample(oct[2], 24, u, v) * 0.15;
      const edge = Math.max(0, 1 - r);
      const a = Math.max(0, Math.min(1, (edge * edge * (3 - 2 * edge)) * (0.35 + n * 1.1) - 0.08));
      const i = (y * N + x) * 4;
      const shade = 0.82 + n * 0.3; // leve volume interno
      d[i] = d[i + 1] = d[i + 2] = Math.min(255, shade * 255);
      d[i + 3] = a * 255;
    }
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

export class Dust {
  constructor(ctx) {
    this.ctx = ctx;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.MeshLambertMaterial({ map: puffTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.a *= vAlpha;');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'player-dust';
    this.mesh.userData.noSkyOcclusion = true;
    this.mesh.userData.noSunView = true;
    this.mesh.count = 0;
    ctx.scene.add(this.mesh);
    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ life: 0, age: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), s0: 0, s1: 0, a: 0, rot: 0, spin: 0, col: [1, 1, 1] });
    this.next = 0;
    this.acc = 0;
    this.color = new THREE.Color();
  }

  /** Emite uma lufada. */
  spawn(pos, vel, { life = 1, size = 0.3, grow = 1.2, alpha = 0.3, material = 'asphalt' } = {}) {
    const q = this.p[this.next];
    this.next = (this.next + 1) % MAX;
    const rng = this.ctx.rng;
    q.life = life * (0.8 + rng.next() * 0.4);
    q.age = 0;
    q.pos.copy(pos);
    q.vel.copy(vel);
    q.s0 = size * (0.8 + rng.next() * 0.4);
    q.s1 = q.s0 + grow * (0.8 + rng.next() * 0.4);
    q.a = alpha;
    q.rot = rng.next() * Math.PI * 2;
    q.spin = (rng.next() - 0.5) * 1.2;
    const t = TINT[material] || TINT.asphalt;
    const v = 0.9 + rng.next() * 0.2;
    q.col = [t[0] * v, t[1] * v, t[2] * v];
  }

  /** Rastro contínuo (chamar por passo): `rate` lufadas/s em `pos`. */
  trail(dt, pos, dir, speed, material, rate) {
    this.acc += dt * rate;
    const rng = this.ctx.rng;
    while (this.acc >= 1) {
      this.acc -= 1;
      _p.copy(pos);
      _p.x += (rng.next() - 0.5) * 0.25;
      _p.z += (rng.next() - 0.5) * 0.25;
      _p.y += 0.05;
      const k = Math.min(1, speed / 8);
      // o pé "empurra" a poeira: sai quase com a velocidade do jogador e
      // abre para os lados; o arrasto a faz ficar para trás em ~0.5 s
      const side = (rng.next() - 0.5) * 2.4;
      _s.set(dir.x * speed * 1.05 - dir.z * side, 0.3 + rng.next() * 0.5, dir.z * speed * 1.05 + dir.x * side);
      this.spawn(_p, _s, { life: 0.9 + k * 0.6, size: 0.3, grow: 1.2 + k * 0.8, alpha: 0.4 + k * 0.25, material });
    }
  }

  /** Anel de poeira na aterrissagem. */
  burst(pos, strength, material) {
    const n = Math.round(4 + strength * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.ctx.rng.next() * 0.5;
      const sp = 0.6 + strength * 1.4;
      _p.set(pos.x + Math.cos(a) * 0.2, pos.y + 0.05, pos.z + Math.sin(a) * 0.2);
      _s.set(Math.cos(a) * sp, 0.2 + this.ctx.rng.next() * 0.3, Math.sin(a) * sp);
      this.spawn(_p, _s, { life: 0.9, size: 0.2, grow: 0.9 + strength * 0.6, alpha: 0.12 + strength * 0.14, material });
    }
  }

  update(dt) {
    const cam = this.ctx.camera;
    const mesh = this.mesh;
    let n = 0;
    for (const q of this.p) {
      if (q.age >= q.life) continue;
      q.age += dt;
      if (q.age >= q.life) continue;
      const u = q.age / q.life;
      // arrasto forte (poeira freia rápido) e leve empuxo
      const drag = Math.exp(-dt * 3.2);
      q.vel.multiplyScalar(drag);
      q.vel.y += dt * 0.12;
      q.pos.addScaledVector(q.vel, dt);
      q.rot += q.spin * dt;
      const size = q.s0 + (q.s1 - q.s0) * (1 - Math.pow(1 - u, 2.2));
      _rz.setFromAxisAngle(_Z, q.rot);
      _q.copy(cam.quaternion).multiply(_rz);
      _m.compose(q.pos, _q, _s.set(size, size, size));
      mesh.setMatrixAt(n, _m);
      // entra rápido, some devagar; e some perto da câmera (sem "parede")
      const dc = q.pos.distanceTo(cam.position);
      const near = Math.min(1, Math.max(0, (dc - 0.35) / 0.6));
      this.alpha.array[n] = q.a * Math.min(1, u / 0.08) * Math.pow(1 - u, 1.4) * near;
      mesh.setColorAt(n, this.color.setRGB(q.col[0], q.col[1], q.col[2]));
      n++;
    }
    mesh.count = n;
    mesh.visible = n > 0;
    if (n) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.alpha.needsUpdate = true;
    }
  }

  dispose() {
    this.ctx.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.map.dispose();
    this.mesh.material.dispose();
  }
}
