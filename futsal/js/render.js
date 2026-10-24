// Renderização: cena em baixa resolução escalada com NEAREST (pixel art),
// ginásios procedurais, torcida em InstancedMesh, sombras em blob,
// rede que balança e efeitos (flash, poeira, rastro).
import * as THREE from 'three';
import { COURT } from './physics.js';
import { GYMS } from './data.js';
import { buildPlayerModel, posePlayer, buildBall } from './models.js';
import { rng, clamp } from './util.js';

const { HL, HW, GOAL_W, GOAL_H, GOAL_D } = COURT;
export const QUALITY = {
  baixa: { h: 180, crowd: 320, pools: false, phong: false },
  media: { h: 270, crowd: 760, pools: true, phong: true },
  alta: { h: 360, crowd: 1400, pools: true, phong: true },
};
const CTRL_COLORS = [0x38bdf8, 0xf87171, 0xfacc15, 0x4ade80];

function nearestTex(canvas, repeat, mip = false) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  // texturas grandes vistas de longe (piso, placas) usam mipmap para não gerar moiré
  if (mip) { t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4; }
  else { t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

function radialTex(inner = 'rgba(0,0,0,0.55)', outer = 'rgba(0,0,0,0)', size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  // quantiza o gradiente em poucos degraus (visual pixelado)
  const img = g.getImageData(0, 0, size, size);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.round(img.data[i] / 48) * 48;
  g.putImageData(img, 0, 0);
  return nearestTex(c);
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255), gg = clamp(Math.round(((n >> 8) & 255) * f), 0, 255), b = clamp(Math.round((n & 255) * f), 0, 255);
  return `rgb(${r},${gg},${b})`;
}

// ─── Textura da quadra ──────────────────────────────────────────────────────
const FX = 48, FZ = 28, PPM = 20;
function drawCourt(gym) {
  const c = document.createElement('canvas');
  c.width = FX * PPM; c.height = FZ * PPM;
  const g = c.getContext('2d');
  const r = rng(7 + gym.id.length);
  const P = (x, z) => [(x + FX / 2) * PPM, (z + FZ / 2) * PPM];

  // piso de fundo (fora da quadra)
  g.fillStyle = shade(gym.floorB, 0.78);
  g.fillRect(0, 0, c.width, c.height);
  const [cx0, cz0] = P(-HL, -HW);
  const cw = COURT.L * PPM, ch = COURT.W * PPM;

  if (gym.floor === 'wood') {
    // tábuas ao longo da quadra
    const plank = 6;
    for (let y = 0; y < c.height; y += plank) {
      let x = -Math.floor(r() * 80);
      while (x < c.width) {
        const len = 50 + Math.floor(r() * 90);
        const f = 0.9 + r() * 0.2;
        const inside = y >= cz0 && y < cz0 + ch;
        g.fillStyle = shade(r() < 0.5 ? gym.floorA : gym.floorB, f * (inside ? 1 : 0.8));
        g.fillRect(x, y, len, plank);
        g.fillStyle = shade(gym.floorB, 0.86 * (inside ? 1 : 0.8));
        g.fillRect(x, y + plank - 1, len, 1);
        g.fillRect(x + len - 1, y, 1, plank);
        x += len;
      }
    }
  } else {
    g.fillStyle = gym.floorA;
    g.fillRect(cx0, cz0, cw, ch);
    // ruído pontilhado
    const img = g.getImageData(0, 0, c.width, c.height);
    const amp = gym.floor === 'rubber' ? 6 : gym.floor === 'concrete' ? 14 : 18;
    for (let i = 0; i < img.data.length; i += 4) {
      const n = (r() - 0.5) * amp * 2;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    if (gym.floor === 'concrete' || gym.floor === 'asphalt') {
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
      for (let k = 0; k < 18; k++) {
        g.beginPath();
        let x = r() * c.width, y = r() * c.height;
        g.moveTo(x, y);
        for (let s = 0; s < 6; s++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
        g.stroke();
      }
    }
  }

  // áreas pintadas
  g.fillStyle = gym.area;
  g.globalAlpha = gym.floor === 'wood' ? 0.55 : 0.9;
  for (const s of [-1, 1]) {
    g.beginPath();
    const R6 = COURT.AREA_R * PPM;
    const [gx, gz1] = P(s * HL, -1.58), [, gz2] = P(s * HL, 1.58);
    g.moveTo(gx, gz1 - R6);
    if (s < 0) {
      g.arc(gx, gz1, R6, -Math.PI / 2, 0);
      g.lineTo(gx + R6, gz2);
      g.arc(gx, gz2, R6, 0, Math.PI / 2);
    } else {
      g.arc(gx, gz1, R6, -Math.PI / 2, -Math.PI, true);
      g.lineTo(gx - R6, gz2);
      g.arc(gx, gz2, R6, Math.PI, Math.PI / 2, true);
    }
    g.closePath();
    g.fill();
  }
  const [ccx, ccz] = P(0, 0);
  g.beginPath(); g.arc(ccx, ccz, COURT.CENTER_R * PPM, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;

  // linhas (2 px, sem antialias: desenhadas pixel a pixel via retângulos/arcos)
  g.fillStyle = gym.lines;
  g.strokeStyle = gym.lines;
  g.lineWidth = 2;
  g.imageSmoothingEnabled = false;
  const rect = (x, z, w, h) => { const [a, b] = P(x, z); g.fillRect(Math.round(a), Math.round(b), Math.max(2, Math.round(w * PPM)), Math.max(2, Math.round(h * PPM))); };
  rect(-HL, -HW, COURT.L, 0.08); rect(-HL, HW - 0.08, COURT.L, 0.08);
  rect(-HL, -HW, 0.08, COURT.W); rect(HL - 0.08, -HW, 0.08, COURT.W);
  rect(-0.04, -HW, 0.08, COURT.W);
  const arc = (x, z, rad, a0, a1, ccw) => { const [a, b] = P(x, z); g.beginPath(); g.arc(a, b, rad * PPM, a0, a1, ccw); g.stroke(); };
  arc(0, 0, COURT.CENTER_R, 0, Math.PI * 2);
  rect(-0.15, -0.15, 0.3, 0.3);
  for (const s of [-1, 1]) {
    const gx = s * HL;
    if (s < 0) { arc(gx, -1.58, 6, -Math.PI / 2, 0); arc(gx, 1.58, 6, 0, Math.PI / 2); }
    else { arc(gx, -1.58, 6, -Math.PI / 2, -Math.PI, true); arc(gx, 1.58, 6, Math.PI, Math.PI / 2, true); }
    rect(gx - s * 6 - 0.04, -1.58, 0.08, 3.16);
    rect(gx - s * COURT.PEN - 0.1, -0.1, 0.2, 0.2);
    rect(gx - s * COURT.PEN2 - 0.1, -0.1, 0.2, 0.2);
    // marcas de 5 m ao lado da marca de 10 m
    rect(gx - s * COURT.PEN2 - 0.04, -5.1, 0.08, 0.2); rect(gx - s * COURT.PEN2 - 0.04, 4.9, 0.08, 0.2);
    for (const zz of [-1, 1]) arc(gx, zz * HW, 0.25, 0, Math.PI * 2);
    // zona de substituição
    rect(s * 5 - 0.04, HW, 0.08, 0.4); rect(s * 10 - 0.04, HW, 0.08, 0.4);
  }
  return c;
}

function drawAdBoard(seed) {
  const names = ['PIXEL', 'FUTSAL', 'QUADRA', 'GOLAÇO', 'TÊNIS 8BIT', 'SUCO BIT', 'RÁDIO 16', 'BOLA&CIA'];
  const cols = [['#1d4ed8', '#fde047'], ['#dc2626', '#fff'], ['#111827', '#22d3ee'], ['#16a34a', '#fff'], ['#f97316', '#111']];
  const c = document.createElement('canvas');
  c.width = 256; c.height = 16;
  const g = c.getContext('2d');
  const r = rng(seed);
  let x = 0;
  while (x < 256) {
    const [bg, fg] = cols[Math.floor(r() * cols.length)];
    const w = 48 + Math.floor(r() * 24);
    g.fillStyle = bg; g.fillRect(x, 0, w, 16);
    g.fillStyle = fg; g.font = 'bold 9px monospace'; g.textBaseline = 'middle';
    g.fillText(names[Math.floor(r() * names.length)], x + 4, 9);
    x += w;
  }
  return c;
}

function stripeTex() {
  const c = document.createElement('canvas');
  c.width = 4; c.height = 16;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#dc2626' : '#f8fafc'; g.fillRect(0, i * 2, 4, 2); }
  return nearestTex(c);
}

export class Renderer {
  constructor(canvas, settings) {
    this.settings = settings;
    this.canvas = canvas;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    this.gl.setPixelRatio(1);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.5, 200);
    this.gymGroup = new THREE.Group();
    this.scene.add(this.gymGroup);
    this.dyn = new THREE.Group();
    this.scene.add(this.dyn);
    this.models = [];
    this.excite = 0;
    this.time = 0;
    this.netShake = { '-1': 0, '1': 0 };
    this.setQuality(settings.quality);
    this.initDynamic();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(q) {
    this.q = QUALITY[q] || QUALITY.media;
    this.resize();
    if (this.gym) this.buildGym(this.gym);
  }

  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const h = this.q.h;
    const w = Math.round(h * (W / H));
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lowW = w; this.lowH = h;
  }

  // ─── Ginásio ──────────────────────────────────────────────────────────────
  buildGym(gymDef) {
    this.gym = gymDef;
    const grp = this.gymGroup;
    while (grp.children.length) {
      const o = grp.children.pop();
      o.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose?.(); } });
    }
    const gym = gymDef;
    this.scene.background = new THREE.Color(gym.sky);

    // Luzes
    const hemi = new THREE.HemisphereLight(gym.light, 0x3a2a20, 1.35);
    grp.add(hemi);
    this.hemi = hemi;
    const sun = new THREE.DirectionalLight(gym.light, 1.25);
    sun.position.set(-6, 20, 10);
    grp.add(sun);

    // Piso
    const courtTex = nearestTex(drawCourt(gym), null, true);
    const floorMat = this.q.phong
      ? new THREE.MeshPhongMaterial({ map: courtTex, shininess: gym.floor === 'wood' ? 40 : 12, specular: gym.floor === 'wood' ? 0x332211 : 0x111111 })
      : new THREE.MeshLambertMaterial({ map: courtTex });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FX, FZ), floorMat);
    floor.rotation.x = -Math.PI / 2;
    grp.add(floor);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(120, 90), new THREE.MeshLambertMaterial({ color: shade(gym.floorB, 0.45) }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.01;
    grp.add(outer);

    // Placas de publicidade (fictícias)
    const adMat = new THREE.MeshLambertMaterial({ map: nearestTex(drawAdBoard(gym.id.length * 13), [3, 1], true) });
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(46, 0.8, 0.15), adMat);
      b.position.set(0, 0.4, s * 13.2);
      grp.add(b);
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 26.4), adMat);
      e.position.set(s * 23.6, 0.4, 0);
      grp.add(e);
    }

    // Arquibancadas em degraus
    const standMat = new THREE.MeshLambertMaterial({ color: gym.stands });
    const standMat2 = new THREE.MeshLambertMaterial({ color: shade(gym.stands, 0.8) });
    const tiers = gym.crowd > 0.5 ? 7 : 4;
    this.seats = [];
    for (const s of [-1, 1]) {
      for (let t = 0; t < tiers; t++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(50, 0.5 + t * 0.55, 1.1), t % 2 ? standMat2 : standMat);
        const z = s * (14.6 + t * 1.1);
        step.position.set(0, (0.5 + t * 0.55) / 2, z);
        grp.add(step);
        for (let x = -24; x <= 24; x += 0.55) this.seats.push([x, 0.5 + t * 0.55, z, s]);
      }
      // fundos (atrás dos gols): menos degraus
      for (let t = 0; t < Math.ceil(tiers / 2); t++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5 + t * 0.55, 26), t % 2 ? standMat2 : standMat);
        const x = s * (25 + t * 1.1);
        step.position.set(x, (0.5 + t * 0.55) / 2, 0);
        grp.add(step);
        for (let z = -12.5; z <= 12.5; z += 0.6) this.seats.push([x, 0.5 + t * 0.55, z, s * 2]);
      }
    }
    // Paredes e teto
    const wallMat = new THREE.MeshLambertMaterial({ color: gym.wall });
    // As paredes ficam longe o bastante para a câmera de TV (z ≈ +25) estar
    // dentro do ginásio; do lado da câmera não há parede.
    const wh = gym.roof ? 20 : 3;
    const wallMat2 = new THREE.MeshLambertMaterial({ color: shade(gym.wall, 0.8) });
    const back = new THREE.Mesh(new THREE.BoxGeometry(80, wh, 0.5), wallMat);
    back.position.set(0, wh / 2, -(15.2 + tiers * 1.1));
    grp.add(back);
    for (const s of [-1, 1]) {
      const w2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, wh, 70), wallMat2);
      w2.position.set(s * (26 + Math.ceil(tiers / 2) * 1.1), wh / 2, 0);
      grp.add(w2);
    }
    // faixa decorativa na parede do fundo
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(80, 0.6, 0.1), new THREE.MeshBasicMaterial({ color: gym.area }));
    stripe.position.set(0, 0.5 + tiers * 0.55 + 2.2, -(15.2 + tiers * 1.1) + 0.3);
    grp.add(stripe);
    const lightPos = [];
    if (gym.roof) {
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshBasicMaterial({ color: gym.roof }));
      roof.rotation.x = Math.PI / 2; roof.position.y = 20;
      grp.add(roof);
      const lampMat = new THREE.MeshBasicMaterial({ color: gym.light });
      for (let x = -15; x <= 15; x += 7.5) for (const z of [-5, 5]) {
        const l = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.2, 0.8), lampMat);
        l.position.set(x, 19, z - 6);
        grp.add(l);
        lightPos.push([x, z]);
      }
    } else {
      // quadra de rua: postes de luz
      const poleMat = new THREE.MeshLambertMaterial({ color: '#52525b' });
      const lampMat = new THREE.MeshBasicMaterial({ color: gym.light });
      // postes só do lado oposto à câmera (do lado dela, tampariam a quadra)
      for (const x of [-16, 0, 16]) for (const s of [-1]) {
        lightPos.push([x, 7]);
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 9, 0.25), poleMat);
        p.position.set(x, 4.5, s * 16.5);
        grp.add(p);
        const l = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.7), lampMat);
        l.position.set(x, 9, s * 15.8);
        grp.add(l);
        lightPos.push([x, s * 7]);
      }
      // prédios ao fundo
      const r = rng(99);
      for (let i = 0; i < 18; i++) {
        const h = 6 + r() * 14;
        const b = new THREE.Mesh(new THREE.BoxGeometry(5 + r() * 4, h, 4), new THREE.MeshLambertMaterial({ color: shade('#3f3a52', 0.6 + r() * 0.5) }));
        const side = i % 2 ? 1 : -1;
        b.position.set(-40 + i * 4.8, h / 2, side * (24 + r() * 6));
        grp.add(b);
      }
    }
    // "Reflexo" das luminárias no piso (manchas aditivas)
    if (this.q.pools) {
      const poolTex = radialTex('rgba(255,245,220,0.9)', 'rgba(255,245,220,0)', 32);
      const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: gym.floor === 'wood' ? 0.16 : 0.08, blending: THREE.AdditiveBlending, depthWrite: false });
      for (const [x, z] of lightPos) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), poolMat);
        m.rotation.x = -Math.PI / 2;
        m.position.set(x, 0.012, z * 0.6);
        grp.add(m);
      }
    }

    this.buildGoals(grp);
    this.buildCrowd(grp, gym);
  }

  buildGoals(grp) {
    const postMat = new THREE.MeshLambertMaterial({ map: stripeTex() });
    const frameMat = new THREE.MeshLambertMaterial({ color: '#cbd5e1' });
    const netMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    this.nets = {};
    for (const s of [-1, 1]) {
      const g = new THREE.Group();
      g.position.x = s * HL;
      const p = 0.08;
      for (const z of [-GOAL_W / 2, GOAL_W / 2]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(p, GOAL_H, p), postMat);
        post.position.set(0, GOAL_H / 2, z);
        g.add(post);
        const back = new THREE.Mesh(new THREE.BoxGeometry(GOAL_D, 0.04, 0.04), frameMat);
        back.position.set(s * GOAL_D / 2, 0.02, z);
        g.add(back);
      }
      const bar = new THREE.Mesh(new THREE.BoxGeometry(p, p, GOAL_W + p), postMat);
      bar.position.set(0, GOAL_H, 0);
      bar.material = new THREE.MeshLambertMaterial({ map: stripeTex() });
      bar.material.map.rotation = Math.PI / 2;
      g.add(bar);
      // rede
      const pts = [];
      const d = s * GOAL_D, step = 0.25;
      for (let z = -GOAL_W / 2; z <= GOAL_W / 2 + 1e-3; z += step) { pts.push(d, 0, z, d * 0.6, GOAL_H, z); pts.push(0, GOAL_H, z, d * 0.6, GOAL_H, z); }
      for (let y = 0; y <= GOAL_H + 1e-3; y += step) { const xx = d - (d * 0.4) * (y / GOAL_H); pts.push(xx, y, -GOAL_W / 2, xx, y, GOAL_W / 2); }
      for (const z of [-GOAL_W / 2, GOAL_W / 2]) {
        for (let x = 0; Math.abs(x) <= GOAL_D + 1e-3; x += s * step) pts.push(x, 0, z, Math.min(Math.abs(x), GOAL_D * 0.6) * s, GOAL_H, z);
        for (let y = 0; y <= GOAL_H + 1e-3; y += step) pts.push(0, y, z, (d - (d * 0.4) * (y / GOAL_H)), y, z);
      }
      for (let x = 0; Math.abs(x) <= GOAL_D * 0.6 + 1e-3; x += s * step) pts.push(x, GOAL_H, -GOAL_W / 2, x, GOAL_H, GOAL_W / 2);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      const net = new THREE.LineSegments(geo, netMat);
      g.add(net);
      this.nets[s] = net;
      grp.add(g);
    }
  }

  buildCrowd(grp, gym) {
    const want = Math.round(this.q.crowd * gym.crowd);
    const r = rng(31);
    const seats = this.seats.filter(() => r() < Math.min(1, want / this.seats.length));
    const n = seats.length;
    const geo = new THREE.BoxGeometry(0.42, 0.7, 0.32);
    geo.translate(0, 0.35, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    const palette = ['#ef4444', '#3b82f6', '#facc15', '#f8fafc', '#22c55e', '#a855f7', '#f97316', '#111827', '#ec4899', '#14b8a6'];
    const col = new THREE.Color();
    this.crowdData = [];
    const m4 = new THREE.Matrix4();
    seats.forEach((s, i) => {
      col.set(palette[Math.floor(r() * palette.length)]);
      mesh.setColorAt(i, col);
      const rot = Math.abs(s[3]) === 2 ? (s[3] > 0 ? -Math.PI / 2 : Math.PI / 2) : (s[3] > 0 ? Math.PI : 0);
      this.crowdData.push({ x: s[0] + (r() - 0.5) * 0.1, y: s[1], z: s[2], rot, ph: r() * 6, amp: 0.5 + r() * 0.5 });
      m4.makeRotationY(rot); m4.setPosition(s[0], s[1], s[2]);
      mesh.setMatrixAt(i, m4);
    });
    mesh.count = n;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    grp.add(mesh);
    this.crowd = mesh;
    this.crowdTimer = 0;
  }

  updateCrowd(dt) {
    if (!this.crowd || !this.crowdData.length) return;
    this.crowdTimer += dt;
    if (this.crowdTimer < 1 / 30) return; // 30 Hz é suficiente
    this.crowdTimer = 0;
    const m4 = this.m4 || (this.m4 = new THREE.Matrix4());
    const t = this.time, ex = this.excite;
    for (let i = 0; i < this.crowdData.length; i++) {
      const c = this.crowdData[i];
      const jump = ex > 0.05 ? Math.max(0, Math.sin(t * (8 + c.amp * 4) + c.ph)) * 0.45 * ex * c.amp : Math.max(0, Math.sin(t * 1.5 + c.ph)) * 0.03;
      m4.makeRotationY(c.rot);
      m4.setPosition(c.x, c.y + jump, c.z);
      this.crowd.setMatrixAt(i, m4);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  // ─── Objetos dinâmicos ────────────────────────────────────────────────────
  initDynamic() {
    this.ballMesh = buildBall();
    this.dyn.add(this.ballMesh);
    const shadowMat = new THREE.MeshBasicMaterial({ map: radialTex('rgba(0,0,0,0.6)', 'rgba(0,0,0,0)', 16), transparent: true, depthWrite: false });
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(sg, shadowMat, 16);
    this.shadows.renderOrder = 1;
    this.dyn.add(this.shadows);

    // marcadores dos jogadores controlados
    this.markers = CTRL_COLORS.map((c) => {
      const g = new THREE.Group();
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.35, 3), new THREE.MeshBasicMaterial({ color: c }));
      tri.rotation.x = Math.PI; tri.position.y = 2.65;
      g.add(tri);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 16), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015;
      g.add(ring);
      g.visible = false;
      this.dyn.add(g);
      return g;
    });

    // seta de mira em cobranças
    const arrowShape = new THREE.Shape();
    arrowShape.moveTo(0, 0.25); arrowShape.lineTo(2.2, 0.25); arrowShape.lineTo(2.2, 0.55); arrowShape.lineTo(3, 0); arrowShape.lineTo(2.2, -0.55); arrowShape.lineTo(2.2, -0.25); arrowShape.lineTo(0, -0.25);
    const ag = new THREE.ShapeGeometry(arrowShape);
    ag.rotateX(-Math.PI / 2);
    this.arrow = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.75, depthWrite: false }));
    this.arrow.position.y = 0.02;
    this.arrow.visible = false;
    this.dyn.add(this.arrow);

    // partículas: poeira e rastro
    this.dust = this.makePoints(64, 0xd6c4a8, THREE.NormalBlending, 3);
    this.trail = this.makePoints(24, 0xffffff, THREE.AdditiveBlending, 3);
    this.dustP = [];
    this.trailHist = [];
  }

  makePoints(n, color, blending, size) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const mat = new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, blending, depthWrite: false });
    const p = new THREE.Points(geo, mat);
    p.frustumCulled = false;
    p.userData.base = new THREE.Color(color);
    this.dyn.add(p);
    return p;
  }

  setupMatch(match) {
    for (const m of this.models) this.dyn.remove(m);
    this.models = match.players.map((p) => buildPlayerModel(p.data, match.kitFor(p), p.isGK));
    for (const m of this.models) this.dyn.add(m);
    this.dustP = []; this.trailHist = [];
  }

  refreshPlayer(match, i) {
    const p = match.players[i];
    this.dyn.remove(this.models[i]);
    this.models[i] = buildPlayerModel(p.data, match.kitFor(p), p.isGK);
    this.dyn.add(this.models[i]);
  }

  spawnDust(x, z, n = 10) {
    for (let i = 0; i < n; i++) {
      if (this.dustP.length >= 64) this.dustP.shift();
      this.dustP.push({ x, y: 0.1, z, vx: (Math.random() - 0.5) * 2.5, vy: 0.6 + Math.random() * 1.4, vz: (Math.random() - 0.5) * 2.5, life: 0.6 + Math.random() * 0.4 });
    }
  }

  goalNet(side) { this.netShake[side] = 1; }

  // `view` = { players[], ball, controlled[] , aim } (partida ou replay)
  update(dt, view) {
    this.time += dt;
    this.excite = Math.max(0, this.excite - dt * 0.25);
    const m4 = this.m4s || (this.m4s = new THREE.Matrix4());
    let si = 0;
    view.players.forEach((p, i) => {
      const model = this.models[i];
      if (!model) return;
      model.visible = p.onCourt !== false;
      if (!model.visible) return;
      posePlayer(model, p, dt);
      const lying = p.anim === 'slide' || p.anim === 'fall' || p.anim === 'dive';
      m4.makeScale(lying ? 1.6 : 1.0, 1, lying ? 1.6 : 1.0);
      m4.setPosition(p.x, 0.01, p.z);
      this.shadows.setMatrixAt(si++, m4);
    });
    const b = view.ball;
    this.ballMesh.position.set(b.x, b.y + 0.06, b.z);
    const dx = b.x - (this._bx ?? b.x), dz = b.z - (this._bz ?? b.z);
    const d = Math.hypot(dx, dz);
    if (d > 1e-4 && d < 2) {
      const ax = new THREE.Vector3(dz / d, 0, -dx / d);
      this.ballMesh.rotateOnWorldAxis(ax, d / 0.17);
    }
    this._bx = b.x; this._bz = b.z;
    const sh = clamp(0.5 - b.y * 0.12, 0.15, 0.5);
    m4.makeScale(sh, 1, sh); m4.setPosition(b.x, 0.012, b.z);
    this.shadows.setMatrixAt(si++, m4);
    this.shadows.count = si;
    this.shadows.instanceMatrix.needsUpdate = true;

    // marcadores
    this.markers.forEach((mk, k) => {
      const ci = view.controlled ? view.controlled[k] : -1;
      const p = ci != null && ci >= 0 ? view.players[ci] : null;
      mk.visible = !!p && p.onCourt !== false;
      if (mk.visible) { mk.position.set(p.x, 0, p.z); mk.children[0].position.y = 2.65 + Math.sin(this.time * 6) * 0.06; }
    });
    if (view.aim) {
      this.arrow.visible = true;
      this.arrow.position.set(view.aim.x, 0.02, view.aim.z);
      this.arrow.rotation.y = -view.aim.angle;
    } else this.arrow.visible = false;

    // rede balançando
    for (const s of [-1, 1]) {
      const k = this.netShake[s];
      if (!this.nets[s]) continue;
      this.netShake[s] = Math.max(0, k - dt * 1.2);
      this.nets[s].position.x = s * Math.sin(this.time * 28) * 0.12 * k;
      this.nets[s].scale.x = 1 + 0.18 * k;
    }

    // poeira
    const dpos = this.dust.geometry.attributes.position, dcol = this.dust.geometry.attributes.color;
    const base = this.dust.userData.base;
    for (let i = 0; i < 64; i++) {
      const q = this.dustP[i];
      if (q) {
        q.life -= dt; q.vy -= 4 * dt;
        q.x += q.vx * dt; q.y = Math.max(0.02, q.y + q.vy * dt); q.z += q.vz * dt;
        dpos.setXYZ(i, q.x, q.y, q.z);
        const a = Math.max(0, q.life);
        dcol.setXYZ(i, base.r * a + 0.2, base.g * a + 0.2, base.b * a + 0.2);
      } else dpos.setXYZ(i, 0, -50, 0);
    }
    this.dustP = this.dustP.filter((q) => q.life > 0);
    dpos.needsUpdate = true; dcol.needsUpdate = true;
    this.dust.material.opacity = 0.85;

    // rastro de chute forte
    const tpos = this.trail.geometry.attributes.position, tcol = this.trail.geometry.attributes.color;
    if ((b.trail || 0) > 0.05) this.trailHist.unshift([b.x, b.y + 0.06, b.z, b.trail]);
    else if (this.trailHist.length) this.trailHist.pop();
    if (this.trailHist.length > 24) this.trailHist.length = 24;
    for (let i = 0; i < 24; i++) {
      const h = this.trailHist[i];
      if (h) {
        tpos.setXYZ(i, h[0], h[1], h[2]);
        const a = h[3] * (1 - i / 24) * 0.9;
        tcol.setXYZ(i, a, a * 0.95, a * 0.7);
      } else tpos.setXYZ(i, 0, -50, 0);
    }
    tpos.needsUpdate = true; tcol.needsUpdate = true;

    this.updateCrowd(dt);
  }

  render() {
    this.gl.render(this.scene, this.camera);
  }

  flash(strength = 1) {
    const el = document.getElementById('flash');
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = String(0.85 * strength);
    requestAnimationFrame(() => { el.style.transition = 'opacity 0.6s'; el.style.opacity = '0'; });
    if (this.hemi) { this.hemi.intensity = 2.6; setTimeout(() => this.hemi && (this.hemi.intensity = 1.35), 250); }
  }
}

export { GYMS };
