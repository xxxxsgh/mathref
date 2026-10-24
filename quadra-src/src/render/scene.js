// ═══════════════════════════════════════════════════════════════════════════
// Renderização (three.js): ginásio/quadra, gols com rede que balança, bola,
// jogadores, câmera de transmissão e as linhas do modo de teste.
// Tudo interpolado entre o estado anterior e o atual da simulação (B).
// ═══════════════════════════════════════════════════════════════════════════
import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { GEO } from '../sim/ball.js';
import { PlayerModel } from './playerModel.js';

const C = CONFIG.court;
const HL = GEO.halfL, HW = GEO.halfW;

const FLOORS = {
  madeira: { base: '#c58c52', plank: true, run: '#2c5e4a', area: 'rgba(30, 90, 160, 0.55)', line: '#f6f3ea' },
  emborrachado: { base: '#2d6f93', plank: false, run: '#2f7a52', area: 'rgba(240, 140, 50, 0.5)', line: '#f6f3ea' },
  rua: { base: '#55595c', plank: false, run: '#6b6c68', area: 'rgba(0,0,0,0)', line: 'rgba(240,240,230,0.75)', asphalt: true },
};

function courtTexture(floorKey, puddles, maxAniso) {
  const F = FLOORS[floorKey];
  const W = 2048, H = 1152;
  const mx = 3, mz = 3; // margem em metros ao redor da quadra
  const sx = W / (C.length + 2 * mx), sz = H / (C.width + 2 * mz);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const X = (x) => (x + HL + mx) * sx;
  const Z = (z) => (z + HW + mz) * sz;
  // entorno
  g.fillStyle = F.run;
  g.fillRect(0, 0, W, H);
  // piso da quadra
  g.fillStyle = F.base;
  g.fillRect(X(-HL), Z(-HW), C.length * sx, C.width * sz);
  if (F.plank) {
    // tábuas ao longo do comprimento
    const pw = 0.12 * sz;
    for (let z = Z(-HW - mz), i = 0; z < H; z += pw, i++) {
      const l = 0.9 + ((i * 37) % 11) / 55;
      g.fillStyle = `rgba(${Math.round(120 * l)}, ${Math.round(70 * l)}, ${Math.round(30 * l)}, 0.18)`;
      g.fillRect(0, z, W, pw - 1);
      for (let x = ((i * 53) % 7) * 40; x < W; x += 220 + ((i * 17) % 5) * 30) {
        g.fillStyle = 'rgba(60, 30, 10, 0.25)';
        g.fillRect(x, z, 1.5, pw);
      }
    }
    // reflexo do verniz
    const grd = g.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.55);
    grd.addColorStop(0, 'rgba(255,240,210,0.18)');
    grd.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  }
  if (F.asphalt) {
    for (let i = 0; i < 26000; i++) {
      const v = Math.random() * 60 + 50;
      g.fillStyle = `rgba(${v},${v},${v},0.35)`;
      g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
    }
    g.strokeStyle = 'rgba(25,25,25,0.6)';
    g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      let x = Math.random() * W, y = Math.random() * H;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  } else {
    // ruído leve para não ficar plástico
    for (let i = 0; i < 9000; i++) {
      g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
    }
  }
  // áreas pintadas (semicírculos de 6 m das traves + reta entre eles)
  const area = (s) => {
    g.beginPath();
    const gx = s * HL;
    const r = C.areaRadius;
    const p0 = GEO.gw;
    g.moveTo(X(gx), Z(-p0 - r));
    g.ellipse(X(gx), Z(-p0), r * sx, r * sz, 0, s > 0 ? -Math.PI / 2 : -Math.PI / 2, s > 0 ? -Math.PI : 0, s > 0);
    g.lineTo(X(gx - s * r), Z(p0));
    g.ellipse(X(gx), Z(p0), r * sx, r * sz, 0, s > 0 ? Math.PI : 0, Math.PI / 2, s > 0);
    g.closePath();
  };
  for (const s of [-1, 1]) {
    area(s);
    g.fillStyle = F.area;
    g.fill();
  }
  // linhas (8 cm)
  g.strokeStyle = F.line;
  g.fillStyle = F.line;
  g.lineWidth = 0.08 * sx;
  g.strokeRect(X(-HL), Z(-HW), C.length * sx, C.width * sz);
  g.beginPath();
  g.moveTo(X(0), Z(-HW));
  g.lineTo(X(0), Z(HW));
  g.stroke();
  g.beginPath();
  g.ellipse(X(0), Z(0), 3 * sx, 3 * sz, 0, 0, Math.PI * 2);
  g.stroke();
  const dot = (x, z, r = 0.1) => {
    g.beginPath();
    g.ellipse(X(x), Z(z), r * sx, r * sz, 0, 0, Math.PI * 2);
    g.fill();
  };
  dot(0, 0, 0.12);
  for (const s of [-1, 1]) {
    area(s);
    g.stroke();
    dot(s * (HL - C.penaltySpot), 0);
    dot(s * (HL - C.tenMeterSpot), 0);
    // marcas de 5 m para a barreira na linha de fundo
    for (const zz of [-1, 1]) {
      g.beginPath();
      g.ellipse(X(s * HL), Z(zz * HW), 0.25 * sx, 0.25 * sz, 0, 0, Math.PI * 2);
      g.stroke();
    }
    // zona de substituição (lado do banco, z = −10)
    for (const xx of [C.subZoneX, C.subZoneX - 5]) {
      g.beginPath();
      g.moveTo(X(s * xx), Z(-HW - 0.4));
      g.lineTo(X(s * xx), Z(-HW + 0.4));
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  void puddles;
  return { tex, w: C.length + 2 * mx, h: C.width + 2 * mz };
}

function stripeTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#d62828' : '#f4f4f4';
    g.fillRect(0, i * 8, 4, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f2e4';
  g.fillRect(0, 0, 256, 128);
  const cols = ['#f2c14e', '#1d4ed8', '#f2c14e', '#1d4ed8'];
  for (let i = 0; i < 12; i++) {
    const x = (i % 6) * 44 + (i >= 6 ? 22 : 0), y = i >= 6 ? 88 : 40;
    g.fillStyle = cols[i % 4];
    g.beginPath();
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15 * 0.9);
    }
    g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.25)';
  g.lineWidth = 2;
  for (let x = 0; x < 256; x += 32) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 16, 128);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Rede deformável: planos em arame que balançam com o impacto. */
class Net {
  constructor(side, material) {
    this.side = side;
    this.group = new THREE.Group();
    this.parts = [];
    const d = GEO.depth, gw = GEO.gw + GEO.pr * 2, gh = GEO.gh + GEO.pr * 2;
    const x0 = side * (HL + GEO.pr * 2), x1 = side * (HL + d);
    const add = (geom, pos, rot, normal) => {
      const m = new THREE.Mesh(geom, material);
      m.position.copy(pos);
      m.rotation.set(rot[0], rot[1], rot[2]);
      this.group.add(m);
      const base = geom.attributes.position.array.slice();
      this.parts.push({ m, geom, base, normal });
    };
    // fundo
    add(new THREE.PlaneGeometry(gw * 2, gh, 18, 12), new THREE.Vector3(x1, gh / 2, 0), [0, Math.PI / 2, 0], new THREE.Vector3(side, 0, 0));
    // laterais
    for (const zs of [-1, 1]) {
      add(new THREE.PlaneGeometry(Math.abs(x1 - x0), gh, 6, 12), new THREE.Vector3((x0 + x1) / 2, gh / 2, zs * gw), [0, 0, 0], new THREE.Vector3(0, 0, zs));
    }
    // teto
    add(new THREE.PlaneGeometry(Math.abs(x1 - x0), gw * 2, 6, 18), new THREE.Vector3((x0 + x1) / 2, gh, 0), [-Math.PI / 2, 0, 0], new THREE.Vector3(0, 1, 0));
    this.hits = [];
  }

  hit(x, y, z, speed) {
    this.hits.push({ x, y, z, a: Math.min(0.35, speed * 0.02), t: 0 });
    if (this.hits.length > 3) this.hits.shift();
  }

  update(dt) {
    if (!this.hits.length) return;
    for (const h of this.hits) h.t += dt;
    this.hits = this.hits.filter((h) => h.t < 1.6);
    const tmp = new THREE.Vector3();
    for (const part of this.parts) {
      const pos = part.geom.attributes.position;
      const arr = pos.array, base = part.base;
      part.m.updateMatrixWorld();
      // normal no espaço local do plano é +z
      for (let i = 0; i < arr.length; i += 3) {
        tmp.set(base[i], base[i + 1], base[i + 2]).applyMatrix4(part.m.matrixWorld);
        let off = 0;
        for (const h of this.hits) {
          const d2 = (tmp.x - h.x) ** 2 + (tmp.y - h.y) ** 2 + (tmp.z - h.z) ** 2;
          off += h.a * Math.exp(-d2 / 0.35) * Math.exp(-3 * h.t) * Math.cos(16 * h.t);
        }
        arr[i] = base[i];
        arr[i + 1] = base[i + 1];
        arr[i + 2] = base[i + 2] + off;
      }
      pos.needsUpdate = true;
    }
  }
}

export class Scene3D {
  constructor(container, quality) {
    this.quality = quality;
    const low = quality === 'low';
    this.renderer = new THREE.WebGLRenderer({ antialias: !low, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = !low;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
    this.camX = 0;
    this.camZoom = 0; // 0 = padrão, 1 = aberta
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.models = new Map();
    this.world = null;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // telas estreitas: abre o campo de visão para caber a largura
    this.camera.fov = this.camera.aspect < 1.3 ? 52 : 40;
    this.camera.updateProjectionMatrix();
  }

  /** Monta o ambiente para uma partida. */
  build(match) {
    if (this.world) {
      this.scene.remove(this.world);
      this.world.traverse((o) => {
        o.geometry?.dispose?.();
      });
    }
    this.models.clear();
    const W = new THREE.Group();
    this.world = W;
    this.scene.add(W);
    const venue = match.venue;
    const outdoor = venue.floor === 'rua';
    this.scene.background = new THREE.Color(outdoor ? '#9cc6e8' : '#0d1311');
    this.scene.fog = outdoor ? new THREE.Fog('#9cc6e8', 60, 160) : new THREE.Fog('#0d1311', 40, 90);

    // luzes
    const hemi = new THREE.HemisphereLight(outdoor ? '#e4f1ff' : '#fff6e6', outdoor ? '#5a5a50' : '#3a3026', outdoor ? 1.1 : 0.9);
    W.add(hemi);
    const sun = new THREE.DirectionalLight(outdoor ? '#fff2dc' : '#fffaf0', outdoor ? 2.4 : 1.8);
    sun.position.set(outdoor ? 14 : 4, 30, outdoor ? 18 : 10);
    sun.castShadow = this.quality !== 'low';
    sun.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
    const sc = sun.shadow.camera;
    sc.left = -24;
    sc.right = 24;
    sc.top = 14;
    sc.bottom = -14;
    sc.near = 5;
    sc.far = 70;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    W.add(sun);
    if (!outdoor) {
      const fill = new THREE.DirectionalLight('#cfe3ff', 0.45);
      fill.position.set(-10, 18, -14);
      W.add(fill);
    }

    // piso
    const { tex, w, h } = courtTexture(venue.floor, match.puddles, this.renderer.capabilities.getMaxAnisotropy());
    const floorMat = new THREE.MeshStandardMaterial({ map: tex, roughness: venue.floor === 'madeira' ? 0.42 : 0.85, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, h), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    W.add(floor);
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 120),
      new THREE.MeshStandardMaterial({ color: outdoor ? '#6f706a' : '#1c2420', roughness: 0.95 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.01;
    outer.receiveShadow = true;
    W.add(outer);
    // poças
    for (const q of match.puddles) {
      const m = new THREE.Mesh(
        new THREE.CircleGeometry(q.r, 28),
        new THREE.MeshStandardMaterial({ color: '#27343a', roughness: 0.05, metalness: 0.35, transparent: true, opacity: 0.82 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(q.x, 0.004, q.z);
      m.scale.set(1, 0.75 + ((q.r * 10) % 3) / 10, 1);
      W.add(m);
    }

    // gols
    const stripe = stripeTexture();
    const postMat = new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.35, metalness: 0.2 });
    const netMat = new THREE.MeshBasicMaterial({ color: '#f2f2f2', wireframe: true, transparent: true, opacity: 0.55 });
    this.nets = {};
    for (const s of [-1, 1]) {
      for (const p of GEO.posts.filter((q) => q.side === s)) {
        const len = Math.hypot(p.bx - p.ax, p.by - p.ay, p.bz - p.az);
        const cyl = new THREE.Mesh(new THREE.CylinderGeometry(p.r, p.r, len + (p.kind === 'travessao' ? p.r * 2 : 0), 12), postMat);
        cyl.position.set((p.ax + p.bx) / 2, (p.ay + p.by) / 2, (p.az + p.bz) / 2);
        if (p.kind === 'travessao') cyl.rotation.x = Math.PI / 2;
        cyl.castShadow = true;
        W.add(cyl);
      }
      const net = new Net(s, netMat);
      this.nets[s] = net;
      W.add(net.group);
    }

    if (outdoor) this.buildStreet(W);
    else this.buildArena(W, match);

    // bola
    const bt = ballTexture();
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(CONFIG.ball.radius, 24, 16), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.45 }));
    this.ball.castShadow = this.quality !== 'low';
    W.add(this.ball);
    this.ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.12, 18), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35, depthWrite: false }));
    this.ballShadow.rotation.x = -Math.PI / 2;
    W.add(this.ballShadow);
    this.ballQ = new THREE.Quaternion();
    this.ballPrev = null;

    // jogadores
    for (const p of match.players) {
      const colors = match.teams[p.team].def.colors;
      const m = new PlayerModel(p, colors, this.quality !== 'low');
      this.models.set(p, m);
      W.add(m.root);
      if (this.quality === 'low') {
        const blob = new THREE.Mesh(new THREE.CircleGeometry(0.3, 14), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.28, depthWrite: false }));
        blob.rotation.x = -Math.PI / 2;
        blob.position.y = 0.006;
        m.root.add(blob);
      }
    }

    // indicadores
    const ringMat = new THREE.MeshBasicMaterial({ color: '#f2c14e', transparent: true, opacity: 0.95, depthWrite: false });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.44, 0.54, 32), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    W.add(this.ring);
    this.staminaArc = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.42, 32, 1, 0, Math.PI * 2), new THREE.MeshBasicMaterial({ color: '#3ddc97', transparent: true, opacity: 0.9, depthWrite: false }));
    this.staminaArc.rotation.x = -Math.PI / 2;
    W.add(this.staminaArc);
    this.chargeBack = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.5, depthWrite: false }));
    this.chargeBack.rotation.x = -Math.PI / 2;
    W.add(this.chargeBack);
    this.chargeBar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: '#f2c14e', transparent: true, depthWrite: false }));
    this.chargeBar.rotation.x = -Math.PI / 2;
    W.add(this.chargeBar);
    this.target = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false }));
    this.target.rotation.x = -Math.PI / 2;
    W.add(this.target);
    this.landing = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 20), new THREE.MeshBasicMaterial({ color: '#f2c14e', transparent: true, opacity: 0.7, depthWrite: false }));
    this.landing.rotation.x = -Math.PI / 2;
    W.add(this.landing);

    // linhas do modo de teste
    const dbgGeom = new THREE.BufferGeometry();
    dbgGeom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(256 * 6), 3));
    dbgGeom.setAttribute('color', new THREE.BufferAttribute(new Float32Array(256 * 6), 3));
    this.debugLines = new THREE.LineSegments(dbgGeom, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.debugLines.frustumCulled = false;
    this.debugLines.renderOrder = 10;
    W.add(this.debugLines);
    this.debugN = 0;
    this.snapCamera(match);
  }

  buildArena(W, match) {
    // placas de publicidade (só nomes fictícios) e arquibancadas com torcida
    const boardMat = new THREE.MeshStandardMaterial({ color: '#1b4d3e', roughness: 0.6 });
    const boards = [
      [0, -HW - 2.6, C.length + 6, 0],
      [0, HW + 2.6, C.length + 6, 0],
      [-HL - 2.6, 0, C.width + 5.2, Math.PI / 2],
      [HL + 2.6, 0, C.width + 5.2, Math.PI / 2],
    ];
    for (const [x, z, len, ry] of boards) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), boardMat);
      b.position.set(x, 0.45, z);
      b.rotation.y = ry;
      W.add(b);
    }
    const brand = document.createElement('canvas');
    brand.width = 1024;
    brand.height = 64;
    const g = brand.getContext('2d');
    g.fillStyle = '#1b4d3e';
    g.fillRect(0, 0, 1024, 64);
    g.font = 'bold 34px Arial Narrow, Arial';
    g.fillStyle = '#f2c14e';
    g.textBaseline = 'middle';
    const words = ['QUADRA VIVA', 'PADARIA DO BAIRRO', 'AÇAÍ DA PRAÇA', 'BORRACHARIA 24H'];
    let wx = 24;
    for (const w of words) {
      g.fillText(w, wx, 34);
      wx += g.measureText(w).width + 60;
    }
    const bt = new THREE.CanvasTexture(brand);
    bt.colorSpace = THREE.SRGBColorSpace;
    bt.wrapS = THREE.RepeatWrapping;
    bt.repeat.set(2, 1);
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(C.length + 6, 0.8), new THREE.MeshBasicMaterial({ map: bt }));
    ad.position.set(0, 0.45, -HW - 2.53);
    W.add(ad);

    // bancos de reservas (lado z−)
    for (const s of [-1, 1]) {
      const bench = new THREE.Mesh(new THREE.BoxGeometry(5, 0.45, 0.6), new THREE.MeshStandardMaterial({ color: match.teams[s > 0 ? 0 : 1].def.colors.shirt, roughness: 0.7 }));
      bench.position.set(s * 9, 0.22, -HW - 1.6);
      W.add(bench);
    }

    // arquibancadas
    const tierMat = new THREE.MeshStandardMaterial({ color: '#3b4440', roughness: 0.9 });
    const stands = [];
    const addStand = (cx, cz, len, ry, rows) => {
      for (let r = 0; r < rows; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.9), tierMat);
        const off = 3.4 + r * 0.9;
        step.position.set(cx + Math.sin(ry) * off, 0.25 + r * 0.5, cz + Math.cos(ry) * off);
        step.rotation.y = ry;
        W.add(step);
        stands.push({ cx: cx + Math.sin(ry) * off, cz: cz + Math.cos(ry) * off, y: 0.5 + r * 0.5, len, ry });
      }
    };
    addStand(0, -HW, C.length + 6, Math.PI, 8);
    addStand(-HL, 0, C.width + 4, -Math.PI / 2, 6);
    addStand(HL, 0, C.width + 4, Math.PI / 2, 6);
    // torcida (instâncias)
    const per = this.quality === 'low' ? 0.35 : this.quality === 'high' ? 1 : 0.7;
    const n = Math.floor(900 * per * match.venue.crowd);
    const fan = new THREE.BoxGeometry(0.42, 0.95, 0.32);
    const fanMat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
    const inst = new THREE.InstancedMesh(fan, fanMat, n);
    const home = new THREE.Color(match.teams[0].def.colors.shirt), away = new THREE.Color(match.teams[1].def.colors.shirt);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    this.fans = [];
    for (let i = 0; i < n; i++) {
      const s = stands[Math.floor(Math.random() * stands.length)];
      const t = (Math.random() - 0.5) * (s.len - 1);
      const x = s.cx + Math.cos(s.ry) * t, z = s.cz - Math.sin(s.ry) * t;
      const y = s.y + 0.47;
      this.fans.push({ x, y, z, ry: s.ry, ph: Math.random() * 6, team: Math.random() < 0.72 ? 0 : 1 });
      m4.makeRotationY(s.ry);
      m4.setPosition(x, y, z);
      inst.setMatrixAt(i, m4);
      const r = Math.random();
      col.copy(this.fans[i].team === 0 ? home : away).lerp(new THREE.Color(r < 0.5 ? '#ffffff' : '#222222'), r * 0.35);
      inst.setColorAt(i, col);
    }
    inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    W.add(inst);
    this.crowd = inst;
    // teto/vigas sugeridas
    const beamMat = new THREE.MeshStandardMaterial({ color: '#2a302d' });
    for (let x = -24; x <= 24; x += 8) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 40), beamMat);
      beam.position.set(x, 16, -2);
      W.add(beam);
    }
  }

  buildStreet(W) {
    // alambrado, postes e prédios ao fundo
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(200,205,210,0.9)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(64, 64);
    g.moveTo(64, 0);
    g.lineTo(0, 64);
    g.stroke();
    const ft = new THREE.CanvasTexture(c);
    ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
    const fence = (x, z, len, ry) => {
      const t = ft.clone();
      t.repeat.set(len / 0.6, 4 / 0.6);
      t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 4), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      m.position.set(x, 2, z);
      m.rotation.y = ry;
      W.add(m);
      for (let k = -len / 2; k <= len / 2 + 0.01; k += 4) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.1, 6), new THREE.MeshStandardMaterial({ color: '#8a8f94', metalness: 0.6, roughness: 0.4 }));
        post.position.set(x + Math.cos(ry) * k, 2.05, z - Math.sin(ry) * k);
        W.add(post);
      }
    };
    fence(0, -HW - 2.7, C.length + 6, 0);
    fence(-HL - 2.7, 0, C.width + 5.4, Math.PI / 2);
    fence(HL + 2.7, 0, C.width + 5.4, Math.PI / 2);
    const cols = ['#d8c3a5', '#e98074', '#8e8d8a', '#eae7dc', '#c9a227', '#4a7c59', '#a26769'];
    for (let i = 0; i < 18; i++) {
      const hgt = 6 + Math.random() * 14;
      const b = new THREE.Mesh(new THREE.BoxGeometry(6 + Math.random() * 6, hgt, 6), new THREE.MeshStandardMaterial({ color: cols[i % cols.length], roughness: 0.9 }));
      const a = (i / 18) * Math.PI * 1.2 - Math.PI * 1.1;
      b.position.set(Math.cos(a) * 42, hgt / 2, Math.sin(a) * 26 - 8);
      W.add(b);
    }
    this.fans = [];
    this.crowd = null;
  }

  snapCamera(match) {
    this.camX = Math.max(-8, Math.min(8, match.ball.pos.x * 0.85));
    this.ballPrev = null;
  }

  toggleZoom() {
    this.camZoom = (this.camZoom + 1) % 2;
  }

  /** Desenha o quadro com interpolação `alpha` entre prev e atual. */
  render(match, alpha, dt, extra) {
    const b = match.ball;
    const bp = extra.ballPrev;
    const bx = bp.x + (b.pos.x - bp.x) * alpha;
    const by = bp.y + (b.pos.y - bp.y) * alpha;
    const bz = bp.z + (b.pos.z - bp.z) * alpha;
    this.ball.position.set(bx, by, bz);
    // giro da bola coerente com o deslocamento (sem patinar)
    if (this.ballPrev) {
      const dx = bx - this.ballPrev.x, dz = bz - this.ballPrev.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-5 && d < 2) {
        const axis = new THREE.Vector3(dz / d, 0, -dx / d);
        const q = new THREE.Quaternion().setFromAxisAngle(axis, d / CONFIG.ball.radius);
        this.ballQ.premultiply(q);
        this.ball.quaternion.copy(this.ballQ);
      }
    }
    this.ballPrev = { x: bx, z: bz };
    this.ballShadow.position.set(bx, 0.005, bz);
    const sh = Math.max(0.35, 1 - by * 0.25);
    this.ballShadow.scale.setScalar(sh);
    this.ballShadow.material.opacity = 0.35 * sh;

    for (const [p, m] of this.models) {
      m.root.visible = p.onCourt;
      if (!p.onCourt) continue;
      const x = p.prev.x + (p.pos.x - p.prev.x) * alpha;
      const z = p.prev.z + (p.pos.z - p.prev.z) * alpha;
      let df = p.facing - p.prev.facing;
      while (df > Math.PI) df -= 2 * Math.PI;
      while (df < -Math.PI) df += 2 * Math.PI;
      m.place(x, z, p.prev.facing + df * alpha, dt);
    }

    // indicadores do jogador controlado
    const cp = extra.controlled;
    this.ring.visible = this.staminaArc.visible = !!cp && cp.onCourt;
    this.chargeBar.visible = this.chargeBack.visible = false;
    if (cp && cp.onCourt) {
      const m = this.models.get(cp);
      const x = m.root.position.x, z = m.root.position.z;
      this.ring.position.set(x, 0.012, z);
      this.staminaArc.position.set(x, 0.013, z);
      const frac = Math.max(0.01, cp.stamina / 100);
      this.staminaArc.geometry.dispose();
      this.staminaArc.geometry = new THREE.RingGeometry(0.36, 0.42, 32, 1, Math.PI / 2, Math.PI * 2 * frac);
      this.staminaArc.material.color.set(cp.stamina < CONFIG.player.stamina.tiredBelow ? '#ef476f' : '#3ddc97');
      if (cp.charge) {
        const pw = cp.charge.power;
        this.chargeBack.visible = this.chargeBar.visible = true;
        this.chargeBack.position.set(x, 0.014, z + 0.75);
        this.chargeBar.scale.x = Math.max(0.02, pw);
        this.chargeBar.position.set(x - 0.5 + pw / 2, 0.016, z + 0.75);
        this.chargeBar.material.color.set(cp.charge.over > 0 ? '#ef476f' : cp.charge.kind === 'shoot' ? '#f2c14e' : '#3ddc97');
      }
    }
    // alvo do passe
    const tgt = extra.passTarget;
    this.target.visible = !!tgt;
    if (tgt) {
      const m = this.models.get(tgt);
      const pulse = 1 + Math.sin(performance.now() * 0.012) * 0.08;
      this.target.position.set(m.root.position.x, 0.012, m.root.position.z);
      this.target.scale.setScalar(pulse);
    }
    // ponto de queda de bola alta
    this.landing.visible = false;
    if (by > 0.6 && extra.landing) {
      this.landing.visible = true;
      this.landing.position.set(extra.landing.x, 0.012, extra.landing.z);
    }

    for (const s of [-1, 1]) this.nets[s].update(dt);
    this.animateCrowd(extra.excite || 0);

    // câmera de transmissão: lateral, acompanhando a bola
    // enquadramento calculado para mostrar as duas laterais (z = ±10)
    const z0 = this.camZoom ? 24 : 19.5, y0 = this.camZoom ? 13.5 : 10.5;
    const target = Math.max(-9, Math.min(9, bx * 0.85));
    this.camX += (target - this.camX) * (1 - Math.exp(-dt * 2.8));
    const narrow = this.camera.aspect < 1.3 ? 1.2 : 1;
    this.camera.position.set(this.camX, y0 * narrow, z0 * narrow + bz * 0.05);
    this.camera.lookAt(this.camX, 0, 2.5 + bz * 0.08);

    this.debugLines.visible = !!extra.debug;
    this.renderer.render(this.scene, this.camera);
  }

  animateCrowd(excite) {
    if (!this.crowd || excite < 0.02) return;
    const m4 = new THREE.Matrix4();
    const t = performance.now() * 0.001;
    for (let i = 0; i < this.fans.length; i++) {
      const f = this.fans[i];
      const jump = Math.max(0, Math.sin(t * 9 + f.ph)) * 0.35 * Math.min(1, excite);
      m4.makeRotationY(f.ry);
      m4.setPosition(f.x, f.y + jump, f.z);
      this.crowd.setMatrixAt(i, m4);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  netHit(e) {
    this.nets[e.side]?.hit(e.x, e.y, e.z, e.speed);
  }

  // ── modo de teste: linhas ───────────────────────────────────────────────
  debugBegin() {
    this.debugN = 0;
  }
  debugLine(a, b, color) {
    if (this.debugN >= 256) return;
    const pos = this.debugLines.geometry.attributes.position.array;
    const col = this.debugLines.geometry.attributes.color.array;
    const i = this.debugN * 6;
    pos[i] = a.x;
    pos[i + 1] = a.y ?? 0.05;
    pos[i + 2] = a.z;
    pos[i + 3] = b.x;
    pos[i + 4] = b.y ?? 0.05;
    pos[i + 5] = b.z;
    const c = new THREE.Color(color);
    col[i] = col[i + 3] = c.r;
    col[i + 1] = col[i + 4] = c.g;
    col[i + 2] = col[i + 5] = c.b;
    this.debugN++;
  }
  debugEnd() {
    const g = this.debugLines.geometry;
    g.setDrawRange(0, this.debugN * 2);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}
