// Cockpit interior COMPLETO do caça do Rafael (Lança A-7 da Hegemonia,
// desertado). Filho da câmera: o casco exterior (com o dorso aberto sob o
// canopy) + tubo da cabine, painel com 3 MFDs funcionais (radar 3D,
// escudos/energia, alvo) e um 4º no console (mapa), teclado frontal,
// anunciadores, consoles laterais com bancos de botões e interruptores,
// manche e acelerador animados pelo input, HUD holográfico projetado no
// vidro, vidro com chuva/poeira/gelo/fogo e respiração/vibração de câmera.
import * as THREE from 'three/webgpu';
import {
  vec2, vec3, float, uniform, texture, uv, mix, smoothstep, sin, time, fract, abs, pow, dot, normalize, normalView, positionView, max, positionLocal, length,
} from 'three/tsl';
import { Z, M, Parts, box, cyl, cylZ, sphere, plate, pipe, vent, latheZ, cutBox } from './geo.js';
import { makeHullMaterial, makeLightsMaterial } from './materials.js';
import { blueprint, hullMaterial } from './ship.js';
import { makeCockpitGlass } from './glass.js';
import { loft } from './geo.js';
import { drawRadar, drawStatus, drawTarget, drawMap, drawHud } from './mfd.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

const INTERIOR_STYLE = {
  primary: [0.05, 0.053, 0.058], secondary: [0.022, 0.024, 0.027], trim: [1.0, 0.7, 0.3],
  metal: [0.45, 0.45, 0.47], dark: [0.016, 0.017, 0.019], glow: [0.45, 0.85, 1.0],
  paint: { metal: 0.2, rough: 0.55, clearcoat: 0.05 }, wear: 0.3, patch: 0, hazard: 0, teeth: 0, circuits: 0, iridescence: 0,
};

/** Matriz que posiciona algo em `pos` com +Z apontando para o olho (origem). */
function faceEye(pos, extraX = 0) {
  _m4.lookAt(new THREE.Vector3(0, 0, 0), pos, new THREE.Vector3(0, 1, 0));
  const m = new THREE.Matrix4().makeRotationFromQuaternion(_q.setFromRotationMatrix(_m4));
  m.multiply(new THREE.Matrix4().makeRotationX(extraX));
  // lookAt(0, pos) faz +Z apontar de pos para a origem? Garante: Matrix4.lookAt(eye, target) → z = eye − target
  m.setPosition(pos);
  return m;
}

/** Tela (MFD) com canvas → textura emissiva, retícula de pixels e reflexo. */
function screenMaterial(tex, gain) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = false;
  const u = uv();
  const c = texture(tex, u).rgb;
  const px = smoothstep(0.0, 0.25, abs(fract(u.mul(256.0)).sub(0.5))).mul(0.18).add(0.82);
  const scan = sin(u.y.mul(800.0).sub(time.mul(3.0))).mul(0.03).add(0.97);
  const vig = smoothstep(0.85, 0.35, length(u.sub(0.5)));
  const fres = pow(float(1).sub(abs(dot(normalize(normalView), normalize(positionView.negate())))), 4.0);
  m.colorNode = c.mul(gain).mul(px).mul(scan).mul(vig.mul(0.35).add(0.65)).add(vec3(0.05, 0.07, 0.09).mul(fres));
  return m;
}

export class Cockpit {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'cockpit';
    this.group.visible = false;
    this.mode = 'auto';
    this.head = new THREE.Group(); this.group.add(this.head);
    this.shipFrame = new THREE.Group(); this.head.add(this.shipFrame);
    this.cabin = new THREE.Group(); this.shipFrame.add(this.cabin);
    this.data = {
      speed: 0, altitude: Infinity, throttle: 0.4, boost: 0, heading: 0, pitch: 0, roll: 0,
      shields: { f: 1, b: 1, l: 1, r: 1 }, hull: 1, energy: { shield: 0.5, engine: 0.5, weapons: 0.5 }, heat: 0, fuel: 1,
      contacts: [], target: null, map: null, systemName: '', location: '', warnings: [], lock: 0, missiles: 4, mode: 'SCM',
      radarRange: 6000, stick: { x: 0, y: 0, roll: 0, yaw: 0 }, velLocal: null, gear: false, message: '',
      glass: { rain: 0, dust: 0, ice: 0, fire: 0 }, head: null, alert: 0, lights: 1,
    };
    this.auto = { glass: true, input: true };
    this.t = 0; this.drawIdx = 0; this.drawT = 0;
    this.glassState = { rain: 0, dust: 0, ice: 0, fire: 0, wind: 0 };
    this.build();
  }

  build() {
    const ctx = this.ctx;
    const lite = ctx.quality?.name === 'mobile';
    const bp = blueprint('fighter', 'hegemonia', 1, { cockpitCut: true });
    this.bp = bp;
    const eye = bp.eye.clone();
    this.eye = eye;
    this.shipFrame.position.copy(eye).negate();
    this.cabin.position.copy(eye);
    // exterior (nariz, asas, canhões) visto de dentro
    const hm = hullMaterial('hegemonia', 'fighter', lite);
    for (const k of ['hull', 'detail']) if (bp.geos[k]) { const m = new THREE.Mesh(bp.geos[k], hm); m.castShadow = m.receiveShadow = true; this.shipFrame.add(m); }
    this.lightsMat = makeLightsMaterial();
    if (bp.geos.lights) this.shipFrame.add(new THREE.Mesh(bp.geos.lights, this.lightsMat));

    // ── interior ─────────────────────────────────────────────────────────
    this.intMat = makeHullMaterial(INTERIOR_STYLE, { panel: 0.3, lite, fill: true });
    const P = new Parts(4242);
    const c = bp.canopy;
    const sill = c.y - eye.y;          // altura do peitoril relativa ao olho
    const cz0 = c.z0 - eye.z, cz1 = c.z1 - eye.z;
    this.sill = sill;
    // banheira: paredes, piso, antepara traseira
    for (const s of [1, -1]) {
      P.add(box(0.05, 0.75, 2.3), Z.PRIMARY, { m: M(s * 0.6, sill - 0.36, -0.25) });
      // estofamento lateral em gomos
      for (let i = 0; i < 5; i++) P.add(box(0.04, 0.2, 0.36, 0.015), Z.SECONDARY, { m: M(s * 0.565, sill - 0.2, -0.95 + i * 0.4) });
      // cabos e tubos ao longo da parede
      P.add(pipe([[s * 0.56, sill - 0.42, -1.2], [s * 0.555, sill - 0.44, -0.3], [s * 0.56, sill - 0.4, 0.6]], 0.012, 16), Z.RUBBER);
      P.add(pipe([[s * 0.555, sill - 0.47, -1.2], [s * 0.55, sill - 0.48, -0.2], [s * 0.555, sill - 0.5, 0.6]], 0.009, 16), Z.TRIM);
      // braçola do peitoril (acolchoada) com friso
      P.add(box(0.11, 0.05, 2.25, 0.02), Z.SECONDARY, { m: M(s * 0.56, sill + 0.005, -0.25) });
      P.add(box(0.012, 0.012, 2.1), Z.TRIM, { m: M(s * 0.505, sill + 0.012, -0.25) });
      // alças de apoio
      P.add(pipe([[s * 0.52, sill + 0.02, -0.85], [s * 0.5, sill + 0.09, -0.75], [s * 0.5, sill + 0.09, -0.45], [s * 0.52, sill + 0.02, -0.35]], 0.012, 16), Z.METAL);
    }
    P.add(box(1.25, 0.04, 2.3), Z.DARK, { m: M(0, -1.02, -0.25) });
    P.add(box(1.2, 1.0, 0.05), Z.PRIMARY, { m: M(0, sill - 0.3, 0.75) });

    // ── glare shield (capô curvo em arco em volta do piloto) ─────────────
    // perfil (raio horizontal a partir do olho, altura) girado em torno de Y
    const arc = (prof, half, seg = 28) => {
      const g = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg, Math.PI - half, half * 2);
      return g;
    };
    const gsProf = [[0.6, -0.19], [0.615, -0.168], [0.645, -0.156], [0.72, -0.152], [0.85, -0.168], [0.95, -0.2], [0.985, -0.235], [0.97, -0.27], [0.86, -0.285], [0.66, -0.235], [0.6, -0.19]];
    P.add(arc(gsProf.slice().reverse(), 0.66), Z.SECONDARY, { wear: 0.35 });
    // tampas laterais do capô
    for (const a of [0.66, -0.66]) {
      const cap = new THREE.ExtrudeGeometry(new THREE.Shape(gsProf.slice(0, -1).map(([r, y]) => new THREE.Vector2(r, y))), { depth: 0.012, bevelEnabled: false });
      cap.translate(0, 0, -0.006); cap.rotateY(Math.PI / 2 - a);
      P.add(cap, Z.SECONDARY);
    }
    // friso dourado na borda interna do capô
    P.add(arc([[0.618, -0.162], [0.622, -0.158], [0.628, -0.16], [0.624, -0.166], [0.618, -0.162]].reverse(), 0.64), Z.TRIM, { wear: 0.1 });
    // ── painel de instrumentos (arco quase vertical) ─────────────────────
    P.add(arc([[0.62, -0.2], [0.655, -0.215], [0.67, -0.4], [0.66, -0.62], [0.7, -0.65], [0.72, -0.4], [0.7, -0.22], [0.62, -0.2]], 0.62), Z.PRIMARY, { wear: 0.3 });
    // moldura entre os MFDs (nervuras) e parafusos
    for (const a of [-0.21, 0.21, -0.56, 0.56]) {
      const r = 0.648;
      P.add(box(0.016, 0.38, 0.03, 0.006), Z.DARK, { m: M(Math.sin(a) * r, -0.41, -Math.cos(a) * r, 0, -a, 0) });
      for (const y of [-0.24, -0.58]) P.add(cyl(0.006, 0.006, 0.01, 8), Z.METAL, { m: M(Math.sin(a) * (r - 0.016), y, -Math.cos(a) * (r - 0.016), Math.PI / 2, -a, 0) });
    }
    const mfdPos = [V(0, -0.395, -0.645), V(-Math.sin(0.4) * 0.628, -0.39, -Math.cos(0.4) * 0.628), V(Math.sin(0.4) * 0.628, -0.39, -Math.cos(0.4) * 0.628)];
    // painel inferior (pernas)
    P.add(arc([[0.6, -0.64], [0.66, -0.66], [0.64, -0.95], [0.58, -0.95], [0.6, -0.64]].reverse(), 0.36), Z.SECONDARY, { wear: 0.5 });
    P.add(box(0.5, 0.04, 0.3), Z.DARK, { m: M(0, -0.58, -0.62) });
    // ── MFDs ──────────────────────────────────────────────────────────────
    this.screens = [];
    const sz = 0.168, res = lite ? 256 : 384;
    const kinds = ['status', 'radar', 'target'];
    mfdPos.forEach((p, i) => {
      const fm = faceEye(p);
      P.add(box(0.215, 0.215, 0.028, 0.008), Z.DARK, { m: fm.clone().multiply(M(0, 0, -0.005)) });
      P.add(box(0.188, 0.188, 0.01), Z.SECONDARY, { m: fm.clone().multiply(M(0, 0, 0.006)) });
      // botões OSB: 5 por lado
      for (let k = 0; k < 5; k++) {
        const o = -0.072 + k * 0.036;
        for (const [bx, by, w, h] of [[o, 0.102, 0.024, 0.012], [o, -0.102, 0.024, 0.012], [0.102, o, 0.012, 0.024], [-0.102, o, 0.012, 0.024]]) {
          P.add(box(w, h, 0.012, 0.003), Z.RUBBER, { m: fm.clone().multiply(M(bx, by, 0.012)) });
          P.glowPart(box(w * 0.55, h * 0.18, 0.002), [0.45, 0.9, 1.0], 0.55, { m: fm.clone().multiply(M(bx, by, 0.0185)) });
        }
      }
      // controles giratórios de brilho nos cantos
      for (const [bx, by] of [[0.098, 0.098], [-0.098, 0.098]]) {
        const knob = cyl(0.009, 0.01, 0.014, 12); knob.rotateX(Math.PI / 2);
        P.add(knob, Z.METAL, { m: fm.clone().multiply(M(bx, by, 0.014)) });
      }
      const cv = document.createElement('canvas'); cv.width = cv.height = res;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), screenMaterial(tex, 2.4));
      mesh.applyMatrix4(fm.clone().multiply(M(0, 0, 0.0125)));
      this.cabin.add(mesh);
      this.screens.push({ kind: kinds[i], cv, g: cv.getContext('2d'), tex, mesh, W: res, H: res });
    });
    // luz falsa dos MFDs na cabine
    {
      const U = this.intMat.userData.U;
      U.fillAmb.value.setRGB(0.01, 0.012, 0.016);
      mfdPos.forEach((p, i) => { U.lamps.array[i].set(p.x * 0.8, p.y + 0.02, p.z * 0.8, 0.22); U.lampCol.array[i].setRGB(0.18, 0.42, 0.6); });
      U.rowCol.value.setRGB(0, 0, 0);
    }
    // ── teclado frontal (UFC) e anunciadores ──────────────────────────────
    const ufc = faceEye(V(0, -0.255, -0.652));
    P.add(box(0.2, 0.065, 0.03, 0.006), Z.DARK, { m: ufc.clone().multiply(M(0, 0, -0.01)) });
    for (let r = 0; r < 2; r++) for (let k = 0; k < 6; k++) {
      P.add(box(0.022, 0.018, 0.01, 0.003), Z.RUBBER, { m: ufc.clone().multiply(M(-0.07 + k * 0.028, 0.012 - r * 0.026, 0.008)) });
      P.glowPart(box(0.012, 0.004, 0.002), [0.5, 0.95, 1.0], 0.8, { m: ufc.clone().multiply(M(-0.07 + k * 0.028, 0.012 - r * 0.026, 0.0135)) });
    }
    this.annun = [];
    const anC = [[1.0, 0.55, 0.1], [0.2, 1.0, 0.4], [1.0, 0.55, 0.1], [0.4, 0.8, 1.0], [0.2, 1.0, 0.4], [1.0, 0.15, 0.08]];
    for (let k = 0; k < 6; k++) {
      const a = (k < 3 ? -1 : 1) * (0.2 + (k % 3) * 0.055);
      const m = faceEye(V(Math.sin(a) * 0.648, -0.248, -Math.cos(a) * 0.648));
      P.add(box(0.03, 0.016, 0.012, 0.003), Z.DARK, { m: m.clone().multiply(M(0, 0, -0.004)) });
      P.glowPart(box(0.024, 0.01, 0.002), anC[k], k === 5 ? 6 : 2.2, { m: m.clone().multiply(M(0, 0, 0.003)), blink: k === 5 ? 2.2 : 0 });
    }
    // alarmes mestre (laterais do capô)
    for (const s of [1, -1]) {
      const m = faceEye(V(Math.sin(s * 0.63) * 0.65, -0.3, -Math.cos(0.63) * 0.65));
      P.add(box(0.05, 0.035, 0.02, 0.005), Z.DARK, { m: m.clone().multiply(M(0, 0, -0.006)) });
      P.glowPart(box(0.04, 0.025, 0.004), s > 0 ? [1.0, 0.12, 0.05] : [1.0, 0.6, 0.1], 4.5, { m: m.clone().multiply(M(0, 0, 0.006)), blink: s > 0 ? 1.6 : 0 });
    }
    // ── combinador do HUD (moldura) ───────────────────────────────────────
    for (const s of [1, -1]) P.add(box(0.012, 0.14, 0.012), Z.DARK, { m: M(s * 0.11, -0.09, -0.78, -0.42, 0, 0) });
    P.add(box(0.235, 0.014, 0.02), Z.DARK, { m: M(0, -0.025, -0.81, -0.42, 0, 0) });
    P.add(box(0.2, 0.05, 0.06, 0.01), Z.DARK, { m: M(0, -0.165, -0.75) });
    const comb = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.13), new THREE.MeshPhysicalNodeMaterial({ transparent: true, opacity: 0.12, roughness: 0.03, metalness: 0, color: 0x9fe8d0, side: THREE.DoubleSide, depthWrite: false }));
    comb.position.set(0, -0.092, -0.785); comb.rotation.x = -0.42;
    this.cabin.add(comb);

    // ── consoles laterais ─────────────────────────────────────────────────
    const consoleY = sill - 0.13;
    for (const s of [1, -1]) {
      P.add(box(0.26, 0.05, 0.95, 0.01), Z.PRIMARY, { m: M(s * 0.43, consoleY, -0.15, 0, 0, s * 0.08) });
      P.add(box(0.26, 0.3, 0.95), Z.SECONDARY, { m: M(s * 0.44, consoleY - 0.18, -0.15) });
      // bancos de botões iluminados
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) {
        const x = s * (0.36 + k * 0.035), z = (s > 0 ? -0.5 : 0.08) + r * 0.05;
        P.add(box(0.026, 0.012, 0.03, 0.003), Z.RUBBER, { m: M(x, consoleY + 0.032 + s * (x - s * 0.43) * 0.08, z, 0, 0, s * 0.08) });
        const lit = (r * 4 + k + (s > 0 ? 1 : 0)) % 3;
        const col = lit === 0 ? [0.3, 1.0, 0.45] : lit === 1 ? [0.45, 0.85, 1.0] : [1.0, 0.6, 0.15];
        P.glowPart(box(0.014, 0.002, 0.006), col, lit === 2 ? 2.5 : 1.4, { m: M(x, consoleY + 0.04 + s * (x - s * 0.43) * 0.08, z - 0.006, 0, 0, s * 0.08) });
      }
      // interruptores com guarda
      for (let k = 0; k < 4; k++) {
        const x = s * (0.37 + k * 0.04), z = s > 0 ? -0.28 : -0.62;
        P.add(cyl(0.008, 0.01, 0.012, 10), Z.METAL, { m: M(x, consoleY + 0.032, z) });
        P.add(cyl(0.003, 0.003, 0.03, 6), Z.METAL, { m: M(x, consoleY + 0.05, z - 0.005, -0.4, 0, 0) });
        P.add(box(0.024, 0.024, 0.034, 0.003), k === 1 ? Z.SECONDARY : Z.DARK, { m: M(x, consoleY + 0.045, z + 0.02, 0.5, 0, 0) });
      }
      // botões giratórios
      for (let k = 0; k < 3; k++) {
        const x = s * (0.38 + k * 0.05), z = s > 0 ? -0.05 : 0.25;
        P.add(cyl(0.014, 0.017, 0.02, 14), Z.DARK, { m: M(x, consoleY + 0.035, z) });
        P.add(box(0.003, 0.004, 0.012), Z.TRIM, { m: M(x, consoleY + 0.047, z - 0.006) });
      }
      P.add(vent(0.16, 0.12, 6, 0.01), Z.DARK, { m: M(s * 0.43, consoleY + 0.03, s > 0 ? 0.2 : -0.45) });
    }
    // trilho do acelerador (esquerda)
    P.add(box(0.03, 0.02, 0.32), Z.DARK, { m: M(-0.44, consoleY + 0.035, -0.18) });
    // mapa no console direito (4º display)
    const mapM = new THREE.Matrix4().compose(V(0.44, consoleY + 0.06, 0.12), new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.15, -0.5, -0.32)), V(1, 1, 1));
    P.add(box(0.15, 0.15, 0.02, 0.006), Z.DARK, { m: mapM.clone().multiply(M(0, 0, -0.008)) });
    {
      const cv = document.createElement('canvas'); cv.width = cv.height = res;
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.125, 0.125), screenMaterial(tex, 2.2));
      mesh.applyMatrix4(mapM.clone().multiply(M(0, 0, 0.004)));
      this.cabin.add(mesh);
      this.screens.push({ kind: 'map', cv, g: cv.getContext('2d'), tex, mesh, W: res, H: res });
    }
    // ── assento e pernas do piloto (silhuetas sob o painel) ──────────────
    for (const s of [1, -1]) P.add(box(0.08, 0.5, 0.42, 0.03), Z.SECONDARY, { m: M(s * 0.25, -0.62, 0.2) });
    P.add(box(0.42, 0.08, 0.45, 0.03), Z.SECONDARY, { m: M(0, -0.84, 0.14) });
    // alça de ejeção (amarela/preta) e pedais
    P.add(pipe([[-0.06, -0.8, -0.1], [-0.04, -0.75, -0.13], [0.04, -0.75, -0.13], [0.06, -0.8, -0.1]], 0.009, 12), Z.TRIM);
    for (const s of [1, -1]) P.add(box(0.1, 0.16, 0.03, 0.01), Z.DARK, { m: M(s * 0.17, -0.92, -0.85, 0.5, 0, 0) });

    // malha estática do interior
    const g = Parts.merge(P.hull);
    this.intMesh = new THREE.Mesh(g, this.intMat); this.intMesh.castShadow = true; this.intMesh.receiveShadow = true;
    this.cabin.add(this.intMesh);
    const gl = Parts.merge(P.lights);
    if (gl) this.cabin.add(new THREE.Mesh(gl, this.lightsMat));

    // ── manche ────────────────────────────────────────────────────────────
    this.stick = new THREE.Group(); this.stick.position.set(0, -0.86, -0.36);
    const S = new Parts(77);
    S.add(cyl(0.05, 0.065, 0.1, 14), Z.RUBBER, { m: M(0, 0.04, 0) });
    S.add(cyl(0.012, 0.014, 0.3, 10), Z.METAL, { m: M(0, 0.2, 0) });
    S.add(box(0.05, 0.12, 0.055, 0.02), Z.DARK, { m: M(0, 0.39, 0.005, 0.25, 0, 0) });
    S.add(box(0.045, 0.03, 0.05, 0.012), Z.SECONDARY, { m: M(0, 0.46, -0.008, 0.25, 0, 0) });
    S.add(box(0.012, 0.03, 0.012, 0.004), Z.METAL, { m: M(0, 0.39, -0.032, 0.2, 0, 0) });       // gatilho
    S.add(cyl(0.007, 0.007, 0.012, 8), Z.TRIM, { m: M(0, 0.48, -0.01) });                          // chapéu
    S.add(cyl(0.008, 0.008, 0.01, 8), Z.SECONDARY, { m: M(0.018, 0.47, 0.01) });
    this.stick.add(new THREE.Mesh(Parts.merge(S.hull), this.intMat));
    this.cabin.add(this.stick);
    // ── acelerador ────────────────────────────────────────────────────────
    this.throttle = new THREE.Group(); this.throttle.position.set(-0.44, consoleY - 0.02, -0.18);
    const T = new Parts(78);
    T.add(box(0.02, 0.16, 0.02, 0.005), Z.METAL, { m: M(0, 0.08, 0) });
    T.add(box(0.07, 0.05, 0.11, 0.02), Z.DARK, { m: M(0.01, 0.17, -0.01) });
    T.add(box(0.03, 0.025, 0.06, 0.008), Z.SECONDARY, { m: M(0.04, 0.19, -0.02) });
    T.add(cyl(0.008, 0.008, 0.01, 8), Z.TRIM, { m: M(0.025, 0.2, -0.05, Math.PI / 2, 0, 0) });
    const tm = new THREE.Mesh(Parts.merge(T.hull), this.intMat);
    this.throttle.add(tm);
    T.glowPart(box(0.002, 0.012, 0.03), [1.0, 0.6, 0.15], 2, { m: M(0.046, 0.175, -0.01) });
    this.throttle.add(new THREE.Mesh(Parts.merge(T.lights), this.lightsMat));
    this.cabin.add(this.throttle);

    // ── vidro interno (mesmo loft do canopy exterior) ─────────────────────
    const cst = [
      { z: c.z0, w: c.w * 0.2, h: c.h * 0.15, hb: 0.02, e: 2.2 },
      { z: c.z0 + (c.z1 - c.z0) * 0.22, w: c.w * 0.78, h: c.h * 0.8, hb: 0.02, e: 2.2 },
      { z: c.z0 + (c.z1 - c.z0) * 0.455, w: c.w, h: c.h, hb: 0.02, e: 2.2 },
      { z: c.z1 - (c.z1 - c.z0) * 0.15, w: c.w * 0.92, h: c.h * 0.82, hb: 0.02, e: 2.2 },
      { z: c.z1, w: c.w * 0.7, h: c.h * 0.3, hb: 0.02, e: 2.2 },
    ].map((s0) => ({ ...s0, y: c.y - eye.y, z: s0.z - eye.z, w: s0.w * 0.985, h: s0.h * 0.985 }));
    const gl2 = loft(cst, { seg: 48, sub: 6, capStart: false, capEnd: false });
    // o loft é um tubo fechado: remove o "piso" de vidro sob o peitoril (senão
    // as gotas/geada apareceriam por cima do painel)
    const glassGeo = cutBox(gl2.geo.toNonIndexed(), { min: V(-5, -5, -10), max: V(5, sill + 0.004, 10) });
    glassGeo.computeVertexNormals();
    this.glassMat = makeCockpitGlass({ y: sill });
    this.glass = new THREE.Mesh(glassGeo, this.glassMat);
    this.glass.renderOrder = 10;
    this.cabin.add(this.glass);

    // ── HUD holográfico ───────────────────────────────────────────────────
    const HW = lite ? 768 : 1024, HH = Math.round(HW * 0.5625);
    const hcv = document.createElement('canvas'); hcv.width = HW; hcv.height = HH;
    const htex = new THREE.CanvasTexture(hcv); htex.colorSpace = THREE.SRGBColorSpace;
    this.hudD = 0.95; this.hudW = 1.12; this.hudH = this.hudW * 0.5625;
    const hm2 = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const ht = texture(htex, uv());
    const flick = sin(time.mul(60.0)).mul(0.02).add(0.98);
    this.hudGain = uniform(1.4);
    hm2.colorNode = ht.rgb.mul(ht.a).mul(this.hudGain).mul(flick);
    hm2.fog = false;
    this.hud = new THREE.Mesh(new THREE.PlaneGeometry(this.hudW, this.hudH), hm2);
    this.hud.position.set(0, 0, -this.hudD);
    this.hud.renderOrder = 12;
    this.cabin.add(this.hud);
    this.hudCanvas = { cv: hcv, g: hcv.getContext('2d'), tex: htex, W: HW, H: HH };

    // brilho dos instrumentos no interior (luz falsa barata, só no material da cabine)
    this.group.traverse((o) => { o.frustumCulled = false; });
    this.redraw(true);
  }

  /** Projeta uma direção LOCAL da nave no plano do HUD → [u, v] (0..1) ou null. */
  proj = (d) => {
    if (!d || d.z > -0.05) return null;
    const k = this.hudD / -d.z;
    const u = (d.x * k) / this.hudW + 0.5, v = 0.5 - (d.y * k) / this.hudH;
    if (u < -0.1 || u > 1.1 || v < -0.1 || v > 1.1) return null;
    return [u, v];
  };

  /** Atualiza dados (mescla rasa). */
  setData(d = {}) {
    for (const k in d) {
      if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k]) && !d[k].isVector3 && !d[k].isQuaternion && this.data[k] && typeof this.data[k] === 'object' && !Array.isArray(this.data[k])) Object.assign(this.data[k], d[k]);
      else this.data[k] = d[k];
    }
    if (d.glass) this.auto.glass = false;
  }
  /** Vidro: {rain, dust, ice, fire} 0..1 (desliga a leitura automática do clima). */
  setGlass(o) { this.setData({ glass: o }); }
  show(v) { this.mode = v; }

  redraw(all = false) {
    const t = this.t, d = this.data;
    const list = all ? this.screens : [this.screens[this.drawIdx++ % this.screens.length]];
    for (const s of list) {
      if (s.kind === 'radar') drawRadar(s.g, s.W, s.H, d, t);
      else if (s.kind === 'status') drawStatus(s.g, s.W, s.H, d, t);
      else if (s.kind === 'target') drawTarget(s.g, s.W, s.H, d, t);
      else drawMap(s.g, s.W, s.H, d, t);
      s.tex.needsUpdate = true;
    }
    const h = this.hudCanvas;
    drawHud(h.g, h.W, h.H, d, t, this.proj);
    h.tex.needsUpdate = true;
  }

  /** Lê o estado do jogo quando ninguém alimenta o cockpit (fallbacks). */
  autoData(ctx) {
    const d = this.data;
    const ship = ctx.player.ship;
    if (ship) {
      if (ship.throttle !== undefined) d.throttle = ship.throttle;
      if (ship.boost !== undefined) d.boost = ship.boost;
      if (ship.shields) Object.assign(d.shields, ship.shields);
      if (ship.hull !== undefined) d.hull = ship.hull;
      if (ship.heat !== undefined) d.heat = ship.heat;
      if (ship.gear !== undefined) d.gear = ship.gear;
    }
    if (ctx.player.vel) d.speed = ctx.player.vel.length();
    if (Number.isFinite(ctx.player.altitude)) d.altitude = ctx.player.altitude;
    // mapa do sistema a partir do universo
    const sys = ctx.universe.system;
    if (sys && (!d.map || d.map.sys !== sys.id)) {
      d.systemName = sys.name;
      d.map = { sys: sys.id, bodies: sys.bodies.map((b) => ({ name: b.name, x: b.pos.x, z: b.pos.z, kind: b.kind, parent: b.parent })), player: null };
      for (const st of sys.stations || []) if (!st.hidden) d.map.bodies.push({ name: st.name, x: st.pos.x, z: st.pos.z, kind: 'station', parent: st.body });
    }
    if (d.map) d.map.player = { x: ctx.player.camWorld.x, z: ctx.player.camWorld.z };
    const pl = ctx.services.planets;
    if (pl && !d.location) {
      const b = pl.bodyAt?.(ctx.player.camWorld);
      d.location = b ? b.name.toUpperCase() : (sys?.name || '').toUpperCase();
    }
  }

  /** Clima no vidro a partir de planets/eventos. */
  autoGlass(ctx, dt) {
    const g = this.glassState;
    let rain = 0, dust = 0, ice = 0;
    const pl = ctx.services.planets;
    if (pl?.weatherAt) {
      try {
        const w = pl.weatherAt(ctx.player.camWorld);
        const k = w?.kind || 'clear', i = w?.intensity ?? 0;
        if (k === 'rain' || k === 'storm' || k === 'acid') rain = i;
        else if (k === 'sandstorm' || k === 'ash' || k === 'dust') dust = i;
        else if (k === 'blizzard' || k === 'snow') ice = i * 0.9;
        const body = pl.bodyAt?.(ctx.player.camWorld);
        if (body?.type === 'ice') ice = Math.max(ice, 0.25);
      } catch { /* clima indisponível */ }
    }
    const spd = ctx.player.vel?.length?.() ?? 0;
    const k = 1 - Math.exp(-dt * 0.8);
    g.rain += (rain - g.rain) * (rain > g.rain ? 1 - Math.exp(-dt * 0.5) : 1 - Math.exp(-dt * Math.min(1.5, 0.08 + spd * 0.004)));
    g.dust += (dust - g.dust) * k * 0.4;
    g.ice += (ice - g.ice) * k * 0.15;
    g.fire = Math.max(0, g.fire - dt * 1.5);
    g.wind = Math.min(1, spd / 60);
  }

  onReentry(intensity) { this.glassState.fire = Math.max(this.glassState.fire, intensity); }

  frame(dt, ctx) {
    const visible = this.mode === 'auto' ? ctx.game.mode === 'ship' && !ctx.player.ship?.thirdPerson : !!this.mode;
    this.group.visible = visible;
    if (!visible) return;
    if (this.group.parent !== ctx.camera) ctx.camera.add(this.group);
    this.t += dt;
    const d = this.data;
    if (!this._fed) this.autoData(ctx);
    this._fed = false;
    // input direto para manche/acelerador quando o voo não informa
    const inp = ctx.input;
    if (this.auto.input && inp?.axis) {
      try {
        const lx = inp.axis('lookX') || 0, ly = inp.axis('lookY') || 0;
        d.stick.x += ((lx * 3) - d.stick.x) * Math.min(1, dt * 8);
        d.stick.y += ((ly * 3) - d.stick.y) * Math.min(1, dt * 8);
        d.stick.roll += ((inp.axis('roll') || 0) - d.stick.roll) * Math.min(1, dt * 8);
      } catch { /* sem input */ }
    }
    const st = d.stick;
    this.stick.rotation.set(THREE.MathUtils.clamp(-st.y, -1, 1) * 0.28, 0, THREE.MathUtils.clamp(-(st.x + st.roll), -1, 1) * 0.3);
    this.throttle.rotation.x = -0.45 + (d.throttle ?? 0) * 0.9;

    // olhar livre: o cockpit compensa a rotação da cabeça; respiração e vibração
    if (d.head) this.head.quaternion.copy(d.head).invert(); else this.head.quaternion.identity();
    const thr = d.throttle ?? 0, boost = d.boost ?? 0;
    const breath = Math.sin(this.t * 1.55) * 0.0035;
    const vib = (thr * 0.0008 + boost * 0.003 + (this.glassState.fire || 0) * 0.004);
    const n = (a) => Math.sin(this.t * a) * Math.sin(this.t * a * 1.37 + 1.1);
    this.head.position.set(n(37) * vib, -breath + n(41) * vib, n(29) * vib * 0.5);
    if (d.head) this.head.position.applyQuaternion(this.head.quaternion);

    // vidro
    if (this.auto.glass) this.autoGlass(ctx, dt);
    else Object.assign(this.glassState, d.glass);
    const U = this.glassMat.userData.U, g = this.glassState;
    U.rain.value = g.rain; U.dust.value = g.dust; U.ice.value = g.ice; U.fire.value = g.fire; U.wind.value = g.wind ?? 0;
    const sun = ctx.services.rendering?.sun;
    if (sun) {
      _v.copy(sun.direction).transformDirection(ctx.camera.matrixWorldInverse);
      U.sunDirV.value.copy(_v); U.sunColor.value.copy(sun.color); U.sunVis.value = sun.visibility ?? 1;
    }
    // telas a ~12 Hz (6 Hz no mobile), uma por vez
    this.drawT += dt;
    const hz = ctx.quality?.name === 'mobile' ? 6 : 14;
    if (this.drawT > 1 / hz) { this.drawT = 0; this.redraw(); }
  }

  dispose() {
    this.group.removeFromParent();
    for (const s of this.screens) s.tex.dispose();
    this.hudCanvas.tex.dispose();
  }
}
