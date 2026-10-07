/**
 * Cosméticos renderizados na arma/faca (o inventário é dono dos dados):
 *
 *  - `KillCounterView`: módulo pequeno (caixa de polímero com visor recuado)
 *    com 6 dígitos de 7 segmentos LARANJA emissivos (segmentos apagados
 *    aparecem fracos, como num visor real). Redesenha só quando o número muda.
 *  - `applyStickers(root, spots, list)`: até 4 adesivos como DECALQUES
 *    projetados na geometria real (DecalGeometry) — seguem chanfros e
 *    curvas do receptor. Arte do adesivo: recorte com borda branca, cor de
 *    fundo e o glifo; leve brilho de vinil.
 *  - `Charm`: chaveiro (argola + 2 elos + pingente) pendurado num ponto da
 *    arma, com física de corrente (CharmSim) recebendo a gravidade e a
 *    aceleração do ponto de fixação (virar a câmera / andar balança).
 *    Formatos: skull, die, star, heart, bullet, tag, orb, diamond, ring,
 *    cube, paw, grenade (qualquer outro vira 'tag').
 */
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { formatKills, CharmSim } from './cosmetic-logic.js';
import { rbox, cylY, torus } from './geo.js';

const hasDOM = typeof document !== 'undefined';
const canvas = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

// ─── contador de abates ──────────────────────────────────────────────────
// segmentos: a b c d e f g
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };

function drawDigits(g, W, H, str) {
  g.fillStyle = '#060504';
  g.fillRect(0, 0, W, H);
  const n = str.length;
  const pad = W * 0.05;
  const cw = (W - pad * 2) / n;
  const dh = H * 0.62, top = H * 0.26;
  const t = cw * 0.13;
  // rótulo
  g.fillStyle = 'rgba(255,140,40,0.55)';
  g.font = `bold ${Math.round(H * 0.15)}px monospace`;
  g.textBaseline = 'top';
  g.fillText('KILLS', pad, H * 0.05);
  for (let i = 0; i < n; i++) {
    const x0 = pad + i * cw + cw * 0.14, w = cw * 0.66;
    const on = SEG[str[i]] || '';
    const seg = (id, x, y, sw, sh) => {
      const lit = on.includes(id);
      g.fillStyle = lit ? '#ffa13a' : 'rgba(255,120,30,0.08)';
      g.beginPath();
      if (sw > sh) {
        g.moveTo(x + sh / 2, y);
        g.lineTo(x + sw - sh / 2, y);
        g.lineTo(x + sw, y + sh / 2);
        g.lineTo(x + sw - sh / 2, y + sh);
        g.lineTo(x + sh / 2, y + sh);
        g.lineTo(x, y + sh / 2);
      } else {
        g.moveTo(x + sw / 2, y);
        g.lineTo(x + sw, y + sw / 2);
        g.lineTo(x + sw, y + sh - sw / 2);
        g.lineTo(x + sw / 2, y + sh);
        g.lineTo(x, y + sh - sw / 2);
        g.lineTo(x, y + sw / 2);
      }
      g.closePath();
      g.fill();
    };
    const sk = 0.08 * w; // inclinação (itálico) aproximada por deslocamento
    seg('a', x0 + t * 0.6 + sk, top, w - t * 1.2, t);
    seg('g', x0 + t * 0.6 + sk / 2, top + dh / 2 - t / 2, w - t * 1.2, t);
    seg('d', x0 + t * 0.6, top + dh - t, w - t * 1.2, t);
    seg('f', x0 + sk * 0.75, top + t * 0.5, t, dh / 2 - t * 0.6);
    seg('b', x0 + w - t + sk * 0.75, top + t * 0.5, t, dh / 2 - t * 0.6);
    seg('e', x0 + sk * 0.2, top + dh / 2 + t * 0.1, t, dh / 2 - t * 0.6);
    seg('c', x0 + w - t + sk * 0.2, top + dh / 2 + t * 0.1, t, dh / 2 - t * 0.6);
  }
}

export class KillCounterView {
  constructor(M, { scale = 1 } = {}) {
    this.root = new THREE.Group();
    this.root.name = 'killCounter';
    const W = 0.034 * scale, H = 0.0125 * scale, D = 0.0042 * scale;
    // carcaça de polímero com moldura e dois parafusos
    const geo = mergeGeometries([
      rbox(D, H, W, 0.0012 * scale, -D / 2, 0, 0, 2),
      rbox(D * 0.6, H * 0.35, W * 1.18, 0.0008 * scale, -D * 0.3, 0, 0, 1),
    ].map((g) => (g.index ? g.toNonIndexed() : g)));
    const body = new THREE.Mesh(geo, M.polymer);
    body.castShadow = body.receiveShadow = true;
    this.root.add(body);
    for (const sz of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0011 * scale, 0.0011 * scale, 0.001, 10).rotateZ(Math.PI / 2), M.steel);
      s.position.set(-D - 0.0003, 0, sz * W * 0.56);
      this.root.add(s);
    }
    this.value = null;
    if (hasDOM) {
      this.cv = canvas(256, 80);
      this.g = this.cv.getContext('2d');
      this.tex = new THREE.CanvasTexture(this.cv);
      this.tex.colorSpace = THREE.SRGBColorSpace;
      this.tex.anisotropy = 4;
    }
    const mat = new THREE.MeshStandardMaterial({
      map: this.tex || null, emissiveMap: this.tex || null, emissive: new THREE.Color(1, 0.55, 0.18), emissiveIntensity: 1.6,
      roughness: 0.15, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.92, H * 0.78), mat);
    screen.rotation.y = -Math.PI / 2;
    screen.position.set(-D - 0.0002, 0, 0);
    this.root.add(screen);
    this.screen = screen;
    this.set(0);
  }
  set(n) {
    const s = formatKills(n);
    if (s === this.value) return;
    this.value = s;
    if (this.g) {
      drawDigits(this.g, this.cv.width, this.cv.height, s);
      this.tex.needsUpdate = true;
    }
  }
}

// ─── adesivos ────────────────────────────────────────────────────────────
const stickerTex = new Map();
function stickerTexture(st) {
  const key = `${st.glyph}|${st.color}`;
  if (stickerTex.has(key)) return stickerTex.get(key);
  if (!hasDOM) return null;
  const N = 256;
  const cv = canvas(N, N);
  const g = cv.getContext('2d');
  const r = N * 0.18;
  const path = (inset) => {
    const a = inset, b = N - inset;
    g.beginPath();
    g.moveTo(a + r, a);
    g.arcTo(b, a, b, b, r);
    g.arcTo(b, b, a, b, r);
    g.arcTo(a, b, a, a, r);
    g.arcTo(a, a, b, a, r);
    g.closePath();
  };
  // borda branca (recorte) + fundo colorido + brilho diagonal
  g.fillStyle = '#f4f1ea';
  path(6);
  g.fill();
  g.fillStyle = st.color || '#e2b45a';
  path(22);
  g.fill();
  const gr = g.createLinearGradient(0, 0, N, N);
  gr.addColorStop(0, 'rgba(255,255,255,0.25)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = gr;
  path(22);
  g.fill();
  // glifo (texto ou símbolo), contorno escuro para leitura
  const glyph = String(st.glyph ?? '★').slice(0, 6);
  const fs = glyph.length <= 2 ? N * 0.56 : N * (0.9 / glyph.length) * 1.4;
  g.font = `900 ${Math.round(fs)}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = N * 0.03;
  g.strokeStyle = 'rgba(10,10,10,0.75)';
  g.strokeText(glyph, N / 2, N / 2 + N * 0.03);
  g.fillStyle = '#ffffff';
  g.fillText(glyph, N / 2, N / 2 + N * 0.03);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  stickerTex.set(key, t);
  return t;
}

/**
 * Projeta os adesivos sobre as malhas de `targets` (Mesh[], filhos de
 * `root`). spots = [{ pos, n, size }] no espaço de root. Devolve o Group.
 */
export function applyStickers(root, targets, spots, list) {
  const old = root.getObjectByName('stickers');
  if (old) {
    old.traverse((o) => o.geometry?.dispose?.());
    root.remove(old);
  }
  if (!list?.length || !spots?.length) return null;
  const grp = new THREE.Group();
  grp.name = 'stickers';
  root.add(grp);
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const helper = new THREE.Object3D();
  list.slice(0, 4).forEach((st, i) => {
    const sp = spots[i % spots.length];
    if (!st || !sp) return;
    const pos = sp.pos.clone().applyMatrix4(root.matrixWorld);
    const nW = sp.n.clone().transformDirection(root.matrixWorld);
    helper.position.copy(pos);
    helper.lookAt(pos.clone().add(nW));
    helper.rotateZ(((i * 37) % 11 - 5) * 0.03); // leve torto, colado à mão
    const size = new THREE.Vector3(sp.size, sp.size, 0.02);
    const geos = [];
    for (const m of targets) {
      try {
        const g = new DecalGeometry(m, pos, helper.rotation, size);
        if (g.attributes.position.count) {
          g.applyMatrix4(inv);
          geos.push(g);
        }
      } catch {
        /* malha sem índice compatível: ignora */
      }
    }
    if (!geos.length) return;
    const geo = geos.length > 1 ? mergeGeometries(geos) : geos[0];
    const mat = new THREE.MeshStandardMaterial({
      map: stickerTexture(st), transparent: true, alphaTest: 0.02, roughness: 0.38, metalness: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    // recorte: o alfa vem do canvas (borda arredondada)
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    mesh.receiveShadow = true;
    mesh.name = 'sticker:' + (st.id || i);
    grp.add(mesh);
  });
  return grp;
}

// ─── chaveiros ───────────────────────────────────────────────────────────
function shapeGeo(shape, k = 1) {
  const s = 0.011 * k;
  const ext = (pts, depth = 0.004) => {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x * s, y * s)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: depth * k, bevelEnabled: true, bevelThickness: 0.0008 * k, bevelSize: 0.0008 * k, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -depth * k / 2);
    return g;
  };
  switch (shape) {
    case 'skull': {
      const head = new THREE.SphereGeometry(s * 0.9, 20, 16);
      head.scale(1, 1.05, 0.95);
      const jaw = rbox(s * 1.1, s * 0.6, s * 1.2, s * 0.2, 0, -s * 0.75, 0.0);
      return [head, jaw].map((g) => (g.index ? g.toNonIndexed() : g));
    }
    case 'die':
      return [rbox(s * 1.5, s * 1.5, s * 1.5, s * 0.3, 0, 0, 0, 3)];
    case 'cube':
      return [rbox(s * 1.4, s * 1.4, s * 1.4, s * 0.12, 0, 0, 0, 2)];
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 ? 0.45 : 1.1;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      return [ext(pts)];
    }
    case 'heart': {
      const pts = [];
      for (let i = 0; i < 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        pts.push([(16 * Math.sin(t) ** 3) / 16, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]);
      }
      return [ext(pts)];
    }
    case 'bullet': {
      const pts = [new THREE.Vector2(0.0001, -1.4), new THREE.Vector2(0.42, -1.4), new THREE.Vector2(0.42, -1.3), new THREE.Vector2(0.36, -1.25), new THREE.Vector2(0.42, -1.2), new THREE.Vector2(0.42, 0.3), new THREE.Vector2(0.3, 0.55), new THREE.Vector2(0.18, 1.2), new THREE.Vector2(0.0001, 1.45)].map((v) => v.multiplyScalar(s));
      return [new THREE.LatheGeometry(pts, 20)];
    }
    case 'orb':
      return [new THREE.SphereGeometry(s * 0.85, 24, 18)];
    case 'diamond': {
      const g = new THREE.OctahedronGeometry(s, 0);
      g.scale(0.8, 1.2, 0.8);
      return [g];
    }
    case 'ring':
      return [new THREE.TorusGeometry(s * 0.75, s * 0.22, 12, 32)];
    case 'grenade': {
      const b = new THREE.SphereGeometry(s * 0.75, 16, 12);
      b.scale(1, 1.25, 1);
      return [b, cylY(s * 0.3, s * 0.4, 0, s * 1.05, 0, 12)].map((g) => (g.index ? g.toNonIndexed() : g));
    }
    case 'paw': {
      const pad = new THREE.SphereGeometry(s * 0.6, 16, 12);
      pad.scale(1.1, 0.9, 0.45);
      pad.translate(0, -s * 0.25, 0);
      const toes = [-0.75, -0.25, 0.25, 0.75].map((x, i) => {
        const t = new THREE.SphereGeometry(s * 0.25, 12, 8);
        t.scale(1, 1.2, 0.5);
        t.translate(x * s, s * (0.55 + (i === 1 || i === 2 ? 0.15 : 0)), 0);
        return t;
      });
      return [pad, ...toes];
    }
    default: {
      // plaqueta tipo "dog tag" com furo
      const g = rbox(s * 1.1, s * 1.8, s * 0.22, s * 0.4, 0, 0, 0, 2);
      return [g];
    }
  }
}

export class Charm {
  constructor(spec, { M = null } = {}) {
    this.spec = { shape: 'tag', color: '#e2b45a', ...(spec || {}) };
    this.root = new THREE.Group();
    this.root.name = 'charm';
    const chainMat = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.28, metalness: 1 });
    const col = new THREE.Color(this.spec.color || '#e2b45a');
    const shape = this.spec.shape;
    const metal = ['bullet', 'tag', 'ring', 'diamond'].includes(shape);
    const pmat = new THREE.MeshPhysicalMaterial({
      color: col, roughness: metal ? 0.25 : 0.35, metalness: metal ? 0.9 : 0.05, clearcoat: metal ? 0 : 0.6, clearcoatRoughness: 0.2,
      transmission: shape === 'diamond' || shape === 'orb' ? 0.0 : 0, emissive: shape === 'orb' ? col.clone().multiplyScalar(0.25) : new THREE.Color(0),
    });
    // argola presa na arma
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.0035, 0.0007, 8, 20), chainMat);
    this.root.add(this.ring);
    // elos
    this.links = [0, 1].map(() => {
      const l = new THREE.Mesh(new THREE.TorusGeometry(0.0028, 0.0006, 6, 16), chainMat);
      l.scale.set(1, 1.6, 1);
      this.root.add(l);
      return l;
    });
    // pingente (argolinha + forma)
    this.pend = new THREE.Group();
    const parts = shapeGeo(shape);
    for (const g of parts) {
      const m = new THREE.Mesh(g, pmat);
      m.castShadow = true;
      this.pend.add(m);
    }
    if (shape === 'skull') {
      const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.8 });
      for (const sx of [-1, 1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 10, 8), eyeMat);
        e.position.set(sx * 0.0036, -0.0005, 0.0088);
        this.pend.add(e);
      }
    } else if (shape === 'die') {
      const pipMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.4 });
      const s = 0.0083;
      for (const [x, y] of [[-0.45, -0.45], [0.45, 0.45], [0, 0], [-0.45, 0.45], [0.45, -0.45]]) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.0013, 8, 6), pipMat);
        p.position.set(x * s, y * s, s + 0.0002);
        p.scale.z = 0.4;
        this.pend.add(p);
      }
    }
    const top = new THREE.Mesh(new THREE.TorusGeometry(0.0022, 0.0006, 6, 14), chainMat);
    top.position.y = 0.0145;
    this.pend.add(top);
    this.pend.children.forEach((c) => {
      if (c !== top) c.position.y -= 0.002;
    });
    this.root.add(this.pend);
    this.sim = new CharmSim({ L1: 0.007, L2: 0.009 });
    this.sim.reset([0, -1, 0]);
    this.prev = null;
    this.prevV = null;
    this._a = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this.place();
  }
  /** Posiciona elos e pingente pelos pontos da simulação (espaço local da montagem). */
  place() {
    const p = this.sim.p;
    const A = new THREE.Vector3(...p[0]), B = new THREE.Vector3(...p[1]), C = new THREE.Vector3(...p[2]);
    const up = new THREE.Vector3(0, 1, 0);
    const orient = (obj, a, b, twist = 0) => {
      obj.position.copy(a).add(b).multiplyScalar(0.5);
      const d = b.clone().sub(a).normalize();
      obj.quaternion.setFromUnitVectors(up, d.negate());
      if (twist) obj.rotateY(twist);
    };
    orient(this.links[0], A, B, 0);
    orient(this.links[1], B, C, Math.PI / 2);
    // pingente: pendurado no último ponto, alinhado ao último elo
    const d = C.clone().sub(B).normalize();
    this.pend.position.copy(C).addScaledVector(d, 0.0145);
    this.pend.quaternion.setFromUnitVectors(up, d.clone().negate());
  }
  /**
   * Passo de física: `mount` = Object3D de montagem (pai do root), `dt`,
   * `extraAccW` = aceleração do jogador no mundo (opcional).
   */
  update(dt, extraAccW = null) {
    if (dt <= 0) return;
    const r = this.root;
    r.updateMatrixWorld(true);
    r.getWorldPosition(this._p);
    r.getWorldQuaternion(this._q);
    const inv = this._q.clone().invert();
    const acc = this._a.set(0, 0, 0);
    if (this.prev) {
      const v = this._p.clone().sub(this.prev).divideScalar(dt);
      if (this.prevV) acc.copy(v).sub(this.prevV).divideScalar(dt);
      this.prevV = v;
      // limite: troca de arma/teleporte não "explode" a corrente
      if (acc.length() > 400) acc.setLength(400);
    }
    this.prev = this._p.clone();
    if (extraAccW) acc.add(extraAccW);
    const g = new THREE.Vector3(0, -9.8, 0).applyQuaternion(inv);
    const a = acc.applyQuaternion(inv);
    this.sim.step(dt, [g.x, g.y, g.z], [a.x, a.y, a.z]);
    this.place();
  }
  /** Assenta na gravidade imediatamente (prévia, modo shot). */
  settle() {
    this.root.updateMatrixWorld(true);
    const q = this.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const g = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
    this.sim.reset([g.x, g.y, g.z]);
    for (let i = 0; i < 120; i++) this.sim.step(1 / 60, [g.x * 9.8, g.y * 9.8, g.z * 9.8]);
    this.prev = null;
    this.prevV = null;
    this.place();
  }
}
