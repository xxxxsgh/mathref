// Motor do jogo: renderizador, céu de tinta, planetas esféricos com gravidade
// radial, controle do personagem, câmera e interações.
import * as THREE from 'three';
import { Hero } from './hero.js';
import { toon, mesh, flat, PAL, starGeom, glow } from './style.js';

export const DEG = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();

export function dirLL(lat, lon) {
  const la = lat * DEG, lo = lon * DEG;
  return new THREE.Vector3(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo));
}
/** Direção tangente em `n` apontando para `target` (ambos unitários). */
export function tangentTo(n, target, out = new THREE.Vector3()) {
  out.copy(target).addScaledVector(n, -target.dot(n));
  const l = out.length();
  return l < 1e-6 ? out.set(0, 0, 0) : out.multiplyScalar(1 / l);
}
export function angleBetween(a, b) { return Math.acos(Math.min(1, Math.max(-1, a.dot(b)))); }

// ─── céu ───
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FS = /* glsl */`
uniform vec3 uTop, uHorizon, uBottom, uUp, uSunDir, uSunCol;
uniform float uNebula, uTime, uSun;
varying vec3 vDir;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = dot(d, uUp);
  vec3 col = h > 0.0 ? mix(uHorizon, uTop, smoothstep(-0.02, 0.75, h)) : mix(uHorizon, uBottom, smoothstep(0.0, 0.6, -h));
  float n1 = fbm(d * 2.2 + vec3(0.0, uTime * 0.004, 0.0));
  float n2 = fbm(d * 3.1 + vec3(7.1, 2.3, uTime * 0.003));
  // manchas de aquarela: pigmento suave com a borda mais escura (tinta que secou)
  float w1 = smoothstep(0.5, 0.72, n1);
  float w2 = smoothstep(0.54, 0.76, n2);
  float e1 = w1 * (1.0 - w1) * 4.0, e2 = w2 * (1.0 - w2) * 4.0;
  col += uNebula * (vec3(0.22, 0.10, 0.30) * w1 + vec3(0.10, 0.16, 0.30) * w2);
  col += uNebula * (vec3(0.16, 0.08, 0.20) * e1 + vec3(0.08, 0.12, 0.2) * e2);
  col += (hash(d * 500.0) - 0.5) * 0.03;
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunCol * uSun * (smoothstep(0.9985, 0.999, s) * 1.2 + pow(s, 10.0) * 0.28);
  gl_FragColor = vec4(col, 1.0);
}`;
const STAR_VS = /* glsl */`
attribute float aSize; attribute float aPhase;
uniform float uTime, uPR, uAlpha, uBoost;
varying float vA; varying float vS;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.6 + 0.4 * sin(uTime * (1.3 + aPhase) + aPhase * 20.0);
  vA = tw * uAlpha * (1.0 + uBoost * step(3.4, aSize));
  vS = aSize;
  gl_PointSize = aSize * uPR * (0.8 + 0.35 * tw) * (1.0 + uBoost * 0.6);
}`;
const STAR_FS = /* glsl */`
uniform vec3 uColor;
varying float vA; varying float vS;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float core = smoothstep(0.5, 0.0, d);
  float cr = vS > 3.4 ? (max(0.0, 1.0 - abs(c.x) * 10.0) + max(0.0, 1.0 - abs(c.y) * 10.0)) * smoothstep(0.5, 0.1, d) : 0.0;
  float a = (core * core + cr * 0.7) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export const SKIES = {
  space:  { top: '#1a1540', horizon: '#3d2f70', bottom: '#120f2a', nebula: 1.0, stars: 1.0, sun: 0, light: '#fff3dc', lightI: 2.1, hemiSky: '#c9c2ff', hemiGround: '#4a3a66', hemiI: 1.1, amb: 0.35 },
  cisco:   { top: '#1d1a4c', horizon: '#6e5aa6', bottom: '#171335', nebula: 0.9, stars: 1.0, sun: 0, light: '#fff0d8', lightI: 2.2, hemiSky: '#d6c9ff', hemiGround: '#5a4468', hemiI: 1.1, amb: 0.35 },
  sunset: { top: '#3a2a6e', horizon: '#ff9f6e', bottom: '#4a2a5c', nebula: 0.35, stars: 0.35, sun: 0, light: '#ffb07a', lightI: 2.3, hemiSky: '#ffc3a0', hemiGround: '#6a3a5a', hemiI: 1.0, amb: 0.3 },
  day:    { top: '#6fa3d8', horizon: '#f6dcb0', bottom: '#e0c08a', nebula: 0.0, stars: 0.0, sun: 1, light: '#fff6e4', lightI: 2.5, hemiSky: '#cfe4ff', hemiGround: '#b89a6a', hemiI: 1.2, amb: 0.4 },
  dusk:   { top: '#2e2d6a', horizon: '#f59a74', bottom: '#5a3a5a', nebula: 0.15, stars: 0.3, sun: 1, light: '#ffb58a', lightI: 2.0, hemiSky: '#ffc8a8', hemiGround: '#6a4a5a', hemiI: 1.0, amb: 0.32 },
  night:  { top: '#0d1030', horizon: '#2a3470', bottom: '#0a0c22', nebula: 0.55, stars: 1.25, sun: 0, light: '#aebcff', lightI: 1.3, hemiSky: '#8a9aff', hemiGround: '#2a2a4a', hemiI: 0.9, amb: 0.35 },
  dawn:   { top: '#4a5aa0', horizon: '#ffc68a', bottom: '#8a6a7a', nebula: 0.1, stars: 0.2, sun: 1, light: '#ffd9a8', lightI: 2.2, hemiSky: '#ffe0c0', hemiGround: '#8a6a6a', hemiI: 1.1, amb: 0.35 },
  rose:   { top: '#2a1f55', horizon: '#c8709a', bottom: '#2a1838', nebula: 0.8, stars: 0.9, sun: 0, light: '#ffe0e8', lightI: 2.1, hemiSky: '#ffd0e0', hemiGround: '#5a3a5a', hemiI: 1.1, amb: 0.35 },
  gold:   { top: '#2a2350', horizon: '#d6a45a', bottom: '#2a1c30', nebula: 0.7, stars: 0.9, sun: 0, light: '#fff0c8', lightI: 2.2, hemiSky: '#ffe8b0', hemiGround: '#5a4a3a', hemiI: 1.1, amb: 0.35 },
  teal:   { top: '#10284a', horizon: '#3f8a9a', bottom: '#0c1a30', nebula: 0.9, stars: 1.0, sun: 0, light: '#e8fff8', lightI: 2.1, hemiSky: '#c0f0ff', hemiGround: '#2a4a5a', hemiI: 1.1, amb: 0.35 },
};
const COLOR_KEYS = ['top', 'horizon', 'bottom', 'light', 'hemiSky', 'hemiGround'];
const NUM_KEYS = ['nebula', 'stars', 'sun', 'lightI', 'hemiI', 'amb'];
function toSky(t) {
  const o = {};
  for (const k of COLOR_KEYS) o[k] = new THREE.Color(t[k]);
  for (const k of NUM_KEYS) o[k] = t[k];
  return o;
}
function cloneSky(s) {
  const o = {};
  for (const k of COLOR_KEYS) o[k] = s[k].clone();
  for (const k of NUM_KEYS) o[k] = s[k];
  return o;
}

export class World {
  constructor(canvas, input, ui, sound) {
    this.input = input; this.ui = ui; this.sound = sound;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 2500);
    this.scene.add(this.camera);
    addEventListener('resize', () => this.resize());

    // céu
    this.skyU = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
      uUp: { value: new THREE.Vector3(0, 1, 0) }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color('#fff2c8') },
      uNebula: { value: 1 }, uTime: { value: 0 }, uSun: { value: 0 },
    };
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24),
      new THREE.ShaderMaterial({ uniforms: this.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false }));
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    this.starU = { uTime: { value: 0 }, uPR: { value: r.getPixelRatio() }, uAlpha: { value: 1 }, uBoost: { value: 0 }, uColor: { value: new THREE.Color('#fff6dc') } };
    this.stars = this.makeStars(2600, 1300, this.starU);
    this.scene.add(this.stars);

    // luzes
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.amb = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.amb);
    this.sunDir = new THREE.Vector3(0.3, 1, 0.4).normalize();
    this.sunMode = 'follow';

    this.stage = new THREE.Group();
    this.scene.add(this.stage);

    this.hero = new Hero();
    this.hero.addTo(this.scene);
    this.avatar = this.hero;

    // brilho-guia
    this.guideObj = new THREE.Group();
    const gs = mesh(starGeom(0.13, 0.06, 0.04), PAL.gold, { outline: 0.01, emissive: 0x806020 });
    const gg = glow(0xffc850, 1.3, 0.9);
    this.guideObj.add(gs, gg);
    this.guideObj.userData.star = gs;
    this.guideObj.visible = false;
    this.scene.add(this.guideObj);

    this.ctrl = {
      n: new THREE.Vector3(0, 1, 0), h: 0, vh: 0, camFwd: new THREE.Vector3(0, 0, 1), face: new THREE.Vector3(0, 0, 1),
      pitch: 0.42, dist: 6, speed: 4.3, speedNow: 0, camUp: new THREE.Vector3(0, 1, 0), look: new THREE.Vector3(),
    };
    this.time = 0;
    this.locked = 0;
    this.mode = 'none';
    this.resetStageState();
    this.setSky('space');
  }

  makeStars(count, radius, uniforms) {
    const pos = new Float32Array(count * 3), size = new Float32Array(count), phase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(radius);
      pos.set([v.x, v.y, v.z], i * 3);
      const r = Math.random();
      size[i] = r < 0.9 ? 1.4 + Math.random() * 1.6 : 3.6 + Math.random() * 3;
      phase[i] = Math.random() * 3;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    const p = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms, vertexShader: STAR_VS, fragmentShader: STAR_FS, transparent: true, depthWrite: false }));
    p.frustumCulled = false;
    p.renderOrder = -9;
    return p;
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  resetStageState() {
    this.colliders = [];
    this.interactables = [];
    this.hooks = [];
    this.actors = [];
    this.camOverride = null;
    this.camShot = null;
    this.guide = null;
    this.sunMode = 'follow';
    this.planet = null;
    this.busy = false;
    this.holdT = 0;
    this.current = null;
    this.onJump = null;
  }

  clearStage() {
    const dispose = [];
    this.stage.traverse((o) => { if (o.geometry && o.name !== 'outline' && !o.isSprite) dispose.push(o.geometry); });
    this.stage.clear();
    dispose.forEach((g) => g.dispose());
    this.resetStageState();
    this.setAvatar(this.hero);
    this.hero.visible = true;
    this.hero.pose = 'walk';
    this.hero.fall = 0;
    this.hero.wind.set(0, 0, 0);
    this.hero.resetScarf();
    this.starU.uBoost.value = 0;
    this.ui.prompt(null);
    this.ui.meter(null);
  }

  setAvatar(b) {
    if (this.avatar && this.avatar !== b && this.avatar !== this.hero) this.avatar.root.visible = true;
    this.avatar = b;
    if (b !== this.hero && !b.root.parent) this.stage.add(b.root);
  }

  // ─── céu ───
  setSky(name, dur = 0) {
    const to = toSky(typeof name === 'string' ? SKIES[name] : name);
    if (dur <= 0 || !this.skyCur) { this.skyCur = to; this.skyTween = null; this.applySky(); return Promise.resolve(); }
    return new Promise((res) => { this.skyTween = { from: cloneSky(this.skyCur), to, t: 0, dur, res }; });
  }
  applySky() {
    const s = this.skyCur, u = this.skyU;
    u.uTop.value.copy(s.top); u.uHorizon.value.copy(s.horizon); u.uBottom.value.copy(s.bottom);
    u.uNebula.value = s.nebula; u.uSun.value = s.sun;
    this.starU.uAlpha.value = s.stars;
    this.sun.color.copy(s.light); this.sun.intensity = s.lightI;
    this.hemi.color.copy(s.hemiSky); this.hemi.groundColor.copy(s.hemiGround); this.hemi.intensity = s.hemiI;
    this.amb.intensity = s.amb;
  }
  tickSky(dt) {
    const tw = this.skyTween;
    if (!tw) return;
    tw.t = Math.min(1, tw.t + dt / tw.dur);
    const e = tw.t * tw.t * (3 - 2 * tw.t);
    for (const k of COLOR_KEYS) this.skyCur[k].copy(tw.from[k]).lerp(tw.to[k], e);
    for (const k of NUM_KEYS) this.skyCur[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
    this.applySky();
    if (tw.t >= 1) { this.skyTween = null; tw.res(); }
  }

  // ─── planeta ───
  setPlanet({ radius, seg = 72, height = () => 0, color = () => new THREE.Color(0xc9b48f), outline = 0.05 }) {
    const R = radius;
    const ground = (n) => R + height(n);
    const geo = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    const cols = new Float32Array(pos.count * 3);
    const n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3(), p0 = new THREE.Vector3(), p1 = new THREE.Vector3(), p2 = new THREE.Vector3();
    const e = 0.01;
    for (let i = 0; i < pos.count; i++) {
      n.fromBufferAttribute(pos, i).normalize();
      const r = ground(n);
      p0.copy(n).multiplyScalar(r);
      pos.setXYZ(i, p0.x, p0.y, p0.z);
      // normal analítica (diferenças finitas sobre a função de altura)
      t1.set(0, 1, 0).cross(n);
      if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0).cross(n);
      t1.normalize();
      t2.crossVectors(n, t1);
      p1.copy(n).addScaledVector(t1, e).normalize(); p1.multiplyScalar(ground(p1));
      p2.copy(n).addScaledVector(t2, e).normalize(); p2.multiplyScalar(ground(p2));
      p1.sub(p0); p2.sub(p0);
      const nn = p2.cross(p1).normalize();
      if (nn.dot(n) < 0) nn.negate();
      nor.setXYZ(i, nn.x, nn.y, nn.z);
      const c = color(n);
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = mesh(geo, 0xffffff, { outline, vertexColors: true });
    this.stage.add(m);
    this.planet = { R, ground, mesh: m, height };
    return m;
  }

  ground(n) { return this.planet ? this.planet.ground(n) : 0; }
  surface(n, lift = 0, out = new THREE.Vector3()) { return out.copy(n).normalize().multiplyScalar(this.ground(n) + lift); }

  /** Coloca um objeto sobre a superfície, com o eixo Y apontando para fora. */
  place(obj, n, { yaw = 0, lift = 0, face = null } = {}) {
    const nn = n.clone().normalize();
    obj.position.copy(nn).multiplyScalar(this.ground(nn) + lift);
    if (face) this.orient(obj, nn, _a.subVectors(face, obj.position));
    else {
      obj.quaternion.setFromUnitVectors(Y, nn);
      if (yaw) obj.quaternion.multiply(_q.setFromAxisAngle(Y, yaw));
    }
    obj.userData.n = nn;
    if (!obj.parent) this.stage.add(obj);
    return obj;
  }
  orient(obj, up, fwd) {
    _c.copy(fwd).addScaledVector(up, -fwd.dot(up));
    if (_c.lengthSq() < 1e-8) return;
    _c.normalize();
    _d.crossVectors(up, _c);
    _m.makeBasis(_d, up, _c);
    obj.quaternion.setFromRotationMatrix(_m);
  }
  /** Gira um objeto já posicionado para olhar um ponto. */
  lookAt(obj, target) {
    const up = _b.copy(obj.position).normalize();
    this.orient(obj, up, _a.subVectors(target, obj.position));
  }

  collider(n, r) { const c = { n: n.clone().normalize(), r }; this.colliders.push(c); return c; }
  removeCollider(c) { this.colliders = this.colliders.filter((x) => x !== c); }

  /** Registra algo interagível. `at`: Object3D ou Vector3 (posição no mundo). */
  interact(o) {
    const it = { r: 1.7, when: () => true, hold: 0, ...o };
    this.interactables.push(it);
    return it;
  }
  removeInteract(it) { this.interactables = this.interactables.filter((x) => x !== it); }

  hook(fn) { this.hooks.push(fn); return fn; }
  unhook(fn) { this.hooks = this.hooks.filter((h) => h !== fn); }
  addActor(b) { if (!this.actors.includes(b)) this.actors.push(b); if (b !== this.hero && !b.root.parent) this.stage.add(b.root); return b; }

  // ─── jogador ───
  spawn(n, towards = null) {
    const c = this.ctrl;
    c.n.copy(n).normalize();
    c.h = 0; c.vh = 0;
    const t = towards ? tangentTo(c.n, towards.clone().normalize()) : tangentTo(c.n, Y.clone().negate());
    if (t.lengthSq() < 0.5) t.copy(tangentTo(c.n, new THREE.Vector3(1, 0, 0)));
    c.camFwd.copy(t); c.face.copy(t);
    c.camUp.copy(c.n);
    this.placeAvatar();
    this.snapCamera();
    this.hero.resetScarf();
  }
  get playerPos() { return this.avatar.root.position; }

  placeAvatar() {
    const c = this.ctrl;
    const p = _a.copy(c.n).multiplyScalar(this.ground(c.n) + c.h);
    this.avatar.setPose(p, c.n, c.face);
  }

  stepOnSphere(state, dir, dist) {
    const r = this.ground(state.n);
    state.n.addScaledVector(dir, dist / r).normalize();
  }

  /** Move um estado {n, face} na direção de `targetN`; devolve a distância restante. */
  walkToward(state, targetN, speed, dt, stopAt = 0.5) {
    const R = this.planet.R;
    const d = angleBetween(state.n, targetN) * R;
    if (d <= stopAt) return d;
    const dir = tangentTo(state.n, targetN, _c);
    state.n.addScaledVector(dir, Math.min(speed * dt, d - stopAt) / this.ground(state.n)).normalize();
    if (state.face) state.face.lerp(dir, 1 - Math.exp(-dt * 8)).normalize();
    return d;
  }

  updatePlayer(dt) {
    const c = this.ctrl, inp = this.input;
    const n = c.n;
    // câmera orbital
    let yaw = -inp.look.dx * 0.006;
    if (inp.isDown('camL')) yaw += 1.8 * dt;
    if (inp.isDown('camR')) yaw -= 1.8 * dt;
    if (yaw) c.camFwd.applyAxisAngle(n, yaw);
    c.pitch = Math.min(1.25, Math.max(0.08, c.pitch + inp.look.dy * 0.004));

    const right = _b.crossVectors(c.camFwd, n).normalize();
    const mv = this.locked ? { x: 0, y: 0, mag: 0 } : inp.move();
    const dir = _a.set(0, 0, 0).addScaledVector(c.camFwd, mv.y).addScaledVector(right, mv.x);
    let moved = 0;
    if (mv.mag > 0 && dir.lengthSq() > 1e-4) {
      dir.normalize();
      moved = c.speed * mv.mag * dt;
      c.face.lerp(dir, 1 - Math.exp(-dt * 14));
      this.stepOnSphere(c, dir, moved);
    }
    // colisões simples (círculos na superfície)
    const R = this.planet.R;
    for (const col of this.colliders) {
      const ang = angleBetween(n, col.n);
      const min = (col.r + 0.28) / R;
      if (ang < min) {
        const away = tangentTo(col.n, n, _c);
        if (away.lengthSq() < 0.5) continue;
        n.copy(col.n).multiplyScalar(Math.cos(min)).addScaledVector(away, Math.sin(min)).normalize();
      }
    }
    // transporte paralelo da câmera e do olhar
    c.camFwd.addScaledVector(n, -c.camFwd.dot(n)).normalize();
    c.face.addScaledVector(n, -c.face.dot(n)).normalize();
    // pulo
    if (!this.locked && inp.wasPressed('jump') && c.h <= 0.001) { c.vh = 6.2; this.sound.sfx('jump'); if (this.onJump) this.onJump(); }
    c.vh -= 19 * dt;
    c.h += c.vh * dt;
    if (c.h < 0) { c.h = 0; c.vh = 0; }
    c.speedNow += (moved / Math.max(dt, 1e-4) - c.speedNow) * Math.min(1, dt * 10);
    this.placeAvatar();
    this.avatar.animate(dt, Math.min(1, c.speedNow / c.speed), c.h > 0.05);
  }

  snapCamera() { this.updateCamera(1, true); }

  updateCamera(dt, snap = false) {
    const c = this.ctrl, cam = this.camera;
    const P = this.playerPos;
    const tgtPos = _a, look = _b;
    let up = c.n;
    if (this.camShot) {
      tgtPos.copy(this.camShot.pos); look.copy(this.camShot.look);
      up = _d.copy(this.camShot.up || look).normalize();
    } else if (this.camOverride) {
      const T = this.camOverride.target;
      const mid = _c.addVectors(P, T).multiplyScalar(0.5);
      up = _d.copy(mid).normalize();
      const axis = tangentTo(up, T.clone().sub(P).normalize());
      let side = new THREE.Vector3().crossVectors(up, axis);
      if (side.dot(cam.position.clone().sub(mid)) < 0) side.negate();
      const sep = P.distanceTo(T);
      const dist = Math.max(3.4, sep * 1.35) * (this.camOverride.zoom || 1);
      tgtPos.copy(mid).addScaledVector(side, dist).addScaledVector(up, 1.2 + dist * 0.12).addScaledVector(axis, -0.4);
      look.copy(mid).addScaledVector(up, 0.85);
    } else {
      const d = c.dist;
      tgtPos.copy(P).addScaledVector(c.n, 0.9 + Math.sin(c.pitch) * d).addScaledVector(c.camFwd, -Math.cos(c.pitch) * d);
      look.copy(P).addScaledVector(c.n, 1.0);
    }
    // nunca abaixo do chão
    if (this.planet) {
      const cn = _c.copy(tgtPos).normalize();
      const minR = this.ground(cn) + 0.6;
      if (tgtPos.length() < minR) tgtPos.copy(cn).multiplyScalar(minR);
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * (this.camShot ? 2.2 : 5));
    cam.position.lerp(tgtPos, k);
    c.camUp.lerp(up, snap ? 1 : 1 - Math.exp(-dt * 4)).normalize();
    c.look.lerp(look, snap ? 1 : 1 - Math.exp(-dt * 8));
    cam.up.copy(c.camUp);
    cam.lookAt(c.look);
  }

  /** Enquadra o jogador e um alvo em plano lateral (conversas). */
  focus(target, zoom = 1) { this.camOverride = target ? { target: target.clone(), zoom } : null; }
  shot(pos, look, up) { this.camShot = pos ? { pos: pos.clone(), look: look.clone(), up: up ? up.clone() : null } : null; }

  updateSun(dt) {
    let dir;
    if (this.sunMode === 'follow' && this.planet) {
      const c = this.ctrl;
      const right = _a.crossVectors(c.camFwd, c.n).normalize();
      dir = _b.copy(c.n).multiplyScalar(1).addScaledVector(right, 0.55).addScaledVector(c.camFwd, -0.45).normalize();
      this.sunDir.lerp(dir, 1 - Math.exp(-dt * 3)).normalize();
    }
    const P = this.planet ? this.playerPos : this.camera.position;
    this.sun.target.position.copy(P);
    this.sun.position.copy(P).addScaledVector(this.sunDir, 60);
    this.hemi.position.copy(this.planet ? this.ctrl.n : Y);
    this.skyU.uUp.value.lerp(this.planet ? this.ctrl.n : this.skyUpFree || Y, 1 - Math.exp(-dt * 3)).normalize();
    this.skyU.uSunDir.value.copy(this.sunDir);
  }

  updateGuide(dt) {
    const g = this.guideObj;
    const tgt = typeof this.guide === 'function' ? this.guide() : this.guide;
    if (!tgt || !this.planet || this.mode !== 'walk') { g.visible = false; return; }
    const c = this.ctrl;
    const tn = _a.copy(tgt).normalize();
    const dist = angleBetween(c.n, tn) * this.planet.R;
    if (dist < 2.2) { g.visible = false; return; }
    g.visible = true;
    const dir = tangentTo(c.n, tn, _b);
    const pos = _c.copy(this.playerPos).addScaledVector(dir, 2.2).addScaledVector(c.n, 1.1 + Math.sin(this.time * 3) * 0.12);
    g.position.lerp(pos, 1 - Math.exp(-dt * 8));
    g.quaternion.copy(this.camera.quaternion);
    g.userData.star.rotation.z += dt * 2;
  }

  updateInteract(dt) {
    const inp = this.input, ui = this.ui;
    if (this.mode !== 'walk' || this.locked || this.busy) { ui.prompt(null); ui.meter(null); this.holdT = 0; return; }
    const P = this.playerPos;
    let best = null, bd = Infinity;
    for (const it of this.interactables) {
      if (!it.when()) continue;
      const p = it.at.isVector3 ? it.at : it.at.getWorldPosition(_a);
      const d = p.distanceTo(P);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    if (best !== this.current) { this.holdT = 0; this.current = best; this.releaseHoldPose(); }
    ui.prompt(best ? (typeof best.label === 'function' ? best.label() : best.label) : null);
    if (!best) { ui.meter(null); return; }
    const fire = () => {
      this.releaseHoldPose();
      this.busy = true; this.holdT = 0; ui.meter(null); ui.prompt(null);
      Promise.resolve(best.act()).catch((e) => console.error(e)).finally(() => { this.busy = false; });
    };
    if (best.hold > 0) {
      if (inp.isDown('act')) {
        this.holdT += dt;
        if (best.pose) { this.avatar.pose = best.pose; this.holdPose = best.pose; }
        ui.meter(this.holdT / best.hold);
        if (best.onHold) best.onHold(this.holdT / best.hold, dt);
        if (this.holdT >= best.hold) fire();
      } else {
        if (this.holdT > 0) ui.meter(null);
        this.holdT = Math.max(0, this.holdT - dt * 2);
        this.releaseHoldPose();
      }
    } else if (inp.wasPressed('act')) fire();
  }

  releaseHoldPose() {
    if (this.holdPose && this.avatar.pose === this.holdPose) this.avatar.pose = 'walk';
    this.holdPose = null;
  }

  update(dt) {
    this.time += dt;
    this.tickSky(dt);
    if (this.mode === 'walk' && this.planet) {
      this.updatePlayer(dt);
      this.updateCamera(dt);
    }
    for (const h of [...this.hooks]) h(dt, this.time);
    for (const a of this.actors) if (a !== this.avatar) a.animate(dt, a.walkAmt || 0, false);
    this.updateSun(dt);
    this.updateGuide(dt);
    this.updateInteract(dt);
    if (this.hero.visible) {
      const up = this.planet ? _d.copy(this.hero.root.position).normalize() : Y;
      this.hero.updateScarf(dt, up);
    }
    this.sky.position.copy(this.camera.position);
    this.stars.position.copy(this.camera.position);
    this.skyU.uTime.value = this.time;
    this.starU.uTime.value = this.time;
    this.renderer.render(this.scene, this.camera);
  }
}
