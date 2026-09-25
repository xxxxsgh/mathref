// Ginásio: piso, mesa oficial, rede, barreiras, arquibancadas com torcida,
// iluminação, placar físico.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TY, L, W, NH, NET_OVER, rnd, pick } from './const.js';

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat); }
  return t;
}

export const TABLE_COLORS = {
  azul: { top: 0x1b4f9e, name: 'Azul ITTF' },
  verde: { top: 0x146b3a, name: 'Verde clássico' },
  preta: { top: 0x15171c, name: 'Preta' },
  roxa: { top: 0x4c1d95, name: 'Roxa' },
  rosa: { top: 0xbe185d, name: 'Rosa' },
};

export class Arena {
  constructor(scene, renderer, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.quality = quality;
    this.crowd = null;
    this.excite = 0;
    this.buildEnv();
    this.buildLights();
    this.buildFloor();
    this.buildTable();
    this.buildNet();
    this.buildBarriers();
    this.buildStands();
    this.buildScoreboard();
    this.buildCeiling();
  }

  buildEnv() {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const env = pm.fromScene(new RoomEnvironment(this.renderer), 0.04).texture;
    this.scene.environment = env;
    this.scene.background = new THREE.Color(0x05070f);
    this.scene.fog = new THREE.Fog(0x05070f, 14, 34);
  }

  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0xcfe0ff, 0x241a14, 0.55));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.1);
    key.position.set(1.2, 9, 2.2);
    key.target.position.set(0, 0, 0);
    key.castShadow = this.quality !== 'baixa';
    const sm = this.quality === 'alta' ? 2048 : 1024;
    key.shadow.mapSize.set(sm, sm);
    Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 5, bottom: -5, near: 2, far: 16 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    s.add(key, key.target);
    this.key = key;
    // Poças de luz sobre a mesa
    for (const z of [-1.2, 1.2]) {
      const sp = new THREE.SpotLight(0xffffff, 18, 12, 0.55, 0.6, 1.4);
      sp.position.set(0, 6.5, z);
      sp.target.position.set(0, TY, z * 0.6);
      s.add(sp, sp.target);
    }
    // Contra-luz colorida nas arquibancadas
    const c1 = new THREE.PointLight(0xff7a2f, 18, 16, 1.6); c1.position.set(-6, 4, -7); s.add(c1);
    const c2 = new THREE.PointLight(0x3aa0ff, 18, 16, 1.6); c2.position.set(6, 4, -7); s.add(c2);
  }

  buildFloor() {
    const floorTex = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#12151f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 64; i++) {
        g.fillStyle = `rgba(255,255,255,${0.012 + Math.random() * 0.02})`;
        g.fillRect(0, i * 16, w, 1);
      }
    }, { repeat: [8, 8] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    this.group.add(floor);
    // Piso esportivo (borracha vermelha) dentro da quadra
    const courtTex = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#8a2f22'; g.fillRect(0, 0, w, h);
      const img = g.getImageData(0, 0, w, h), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 18;
        d[i] += n; d[i + 1] += n * 0.6; d[i + 2] += n * 0.5;
      }
      g.putImageData(img, 0, 0);
      g.globalAlpha = 0.07;
      for (let i = 0; i < 12; i++) {
        const gr = g.createRadialGradient(rnd(0, w), rnd(0, h), 0, rnd(0, w), rnd(0, h), rnd(100, 400));
        gr.addColorStop(0, '#000'); gr.addColorStop(1, 'transparent');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }
    });
    const court = new THREE.Mesh(new THREE.PlaneGeometry(8, 14), new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.62, metalness: 0.0, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 }));
    court.rotation.x = -Math.PI / 2; court.position.y = 0.012; court.receiveShadow = true;
    this.group.add(court);
  }

  buildTable() {
    const g = new THREE.Group();
    this.table = g;
    this.topMat = new THREE.MeshStandardMaterial({ color: 0x1b4f9e, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.9 });
    const top = new THREE.Mesh(new RoundedBoxGeometry(2 * W, 0.025, 2 * L, 3, 0.006), this.topMat);
    top.position.y = TY - 0.0125; top.castShadow = top.receiveShadow = true;
    g.add(top);
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8 });
    const line = (w, d, x, z) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
      m.rotation.x = -Math.PI / 2; m.position.set(x, TY + 0.0012, z); m.receiveShadow = true; g.add(m);
    };
    line(0.02, 2 * L, -W + 0.01, 0); line(0.02, 2 * L, W - 0.01, 0);
    line(2 * W, 0.02, 0, -L + 0.01); line(2 * W, 0.02, 0, L - 0.01);
    line(0.003, 2 * L - 0.04, 0, 0);
    // Borda lateral branca fina
    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.02, 2 * L), edgeMat); e.position.set(sx * (W + 0.0005), TY - 0.012, 0); g.add(e); }
    for (const sz of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.02, 0.004), edgeMat); e.position.set(0, TY - 0.012, sz * (L + 0.0005)); g.add(e); }
    // Estrutura
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0f1a, roughness: 0.55, metalness: 0.4 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa3b5, roughness: 0.3, metalness: 0.9 });
    const apron = new THREE.Mesh(new THREE.BoxGeometry(2 * W - 0.12, 0.07, 2 * L - 0.12), dark);
    apron.position.y = TY - 0.06; apron.castShadow = true; g.add(apron);
    for (const sz of [-1, 1]) {
      const fr = new THREE.Group(); fr.position.z = sz * (L - 0.32);
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, TY - 0.14, 0.05), dark);
        leg.position.set(sx * (W - 0.14), (TY - 0.14) / 2 + 0.05, 0); leg.castShadow = true; fr.add(leg);
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.025, 16), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 }));
        wheel.rotation.z = Math.PI / 2; wheel.position.set(sx * (W - 0.14), 0.036, 0); fr.add(wheel);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2 * W - 0.28, 10), steel);
      bar.rotation.z = Math.PI / 2; bar.position.y = 0.25; fr.add(bar);
      g.add(fr);
    }
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 2 * L - 0.7), dark);
    spine.position.y = 0.3; g.add(spine);
    this.group.add(g);
  }

  setTableColor(key) {
    const c = TABLE_COLORS[key] || TABLE_COLORS.azul;
    this.topMat.color.setHex(c.top);
  }

  buildNet() {
    const g = new THREE.Group();
    const netTex = canvasTex(512, 64, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.strokeStyle = 'rgba(20,24,40,0.95)'; c.lineWidth = 1.4;
      for (let x = 0; x <= w; x += 7) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y <= h; y += 7) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    });
    netTex.wrapS = THREE.RepeatWrapping; netTex.repeat.x = 2.2;
    const net = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * (W + NET_OVER), NH - 0.012),
      new THREE.MeshStandardMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9, alphaTest: 0.05 })
    );
    net.position.set(0, TY + (NH - 0.012) / 2, 0);
    g.add(net);
    const tape = new THREE.Mesh(new THREE.BoxGeometry(2 * (W + NET_OVER), 0.015, 0.006), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
    tape.position.set(0, TY + NH - 0.0075, 0); tape.castShadow = true; g.add(tape);
    this.netTape = tape;
    const postMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.6 });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, NH + 0.03, 12), postMat);
      post.position.set(s * (W + NET_OVER), TY + (NH + 0.03) / 2 - 0.02, 0); post.castShadow = true; g.add(post);
      const clampM = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.05), postMat);
      clampM.position.set(s * (W + 0.03), TY - 0.02, 0); g.add(clampM);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(NET_OVER, 0.012, 0.02), postMat);
      arm.position.set(s * (W + NET_OVER / 2 - 0.01), TY - 0.02, 0); g.add(arm);
    }
    this.net = net;
    this.netWobble = 0;
    this.group.add(g);
  }

  buildBarriers() {
    const tex = canvasTex(1024, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#1d2a6b'); gr.addColorStop(1, '#0d1440');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f97316'; g.fillRect(0, h - 18, w, 18);
      g.font = '900 96px Outfit, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#ffffff';
      g.fillText('VICIANTE 3D', w / 2, h / 2 - 8);
    });
    const tex2 = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = '#7c1d12'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#fbbf24'; g.fillRect(0, h - 18, w, 18);
      g.font = '800 76px Outfit, system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
      g.fillText('🏓 TÊNIS DE MESA', w / 2, h / 2 - 8);
    });
    const mats = [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }), new THREE.MeshStandardMaterial({ map: tex2, roughness: 0.45 })];
    const back = new THREE.MeshStandardMaterial({ color: 0x0d1330, roughness: 0.6 });
    const geo = new THREE.BoxGeometry(1.98, 0.72, 0.05);
    const place = (x, z, ry, i) => {
      const m = new THREE.Mesh(geo, [back, back, back, back, mats[i % 2], back]);
      m.position.set(x, 0.36, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    };
    let i = 0;
    for (let x = -3; x <= 3; x += 2) { place(x, -7, 0, i++); place(x, 7, Math.PI, i++); }
    for (let z = -6; z <= 6; z += 2) { place(-4, z, Math.PI / 2, i++); place(4, z, -Math.PI / 2, i++); }
  }

  buildStands() {
    const standMat = new THREE.MeshStandardMaterial({ color: 0x10131f, roughness: 0.85, envMapIntensity: 0.3 });
    const seats = [];
    const addBlock = (cx, cz, rotY, width, rows) => {
      const blk = new THREE.Group();
      blk.position.set(cx, 0, cz); blk.rotation.y = rotY;
      for (let r = 0; r < rows; r++) {
        const step = new THREE.Mesh(new THREE.BoxGeometry(width, 0.45, 0.9), standMat);
        step.position.set(0, 0.225 + r * 0.45, -r * 0.9);
        step.receiveShadow = true;
        blk.add(step);
        for (let s = -width / 2 + 0.35; s < width / 2 - 0.2; s += 0.55) {
          if (Math.random() < 0.12) continue;
          seats.push({ blk, x: s + rnd(-0.06, 0.06), y: 0.45 + r * 0.45, z: -r * 0.9 - 0.15 });
        }
      }
      this.group.add(blk);
      blk.updateMatrixWorld(true);
    };
    addBlock(0, -8.2, 0, 14, 7);
    addBlock(-5.6, 0, Math.PI / 2, 14, 6);
    addBlock(5.6, 0, -Math.PI / 2, 14, 6);
    // Torcida instanciada
    const n = seats.length;
    const bodyGeo = new THREE.CapsuleGeometry(0.15, 0.26, 3, 10);
    const headGeo = new THREE.SphereGeometry(0.1, 12, 10);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8a, roughness: 0.9, envMapIntensity: 0.3 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.8, envMapIntensity: 0.3 });
    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, n);
    const heads = new THREE.InstancedMesh(headGeo, headMat, n);
    const shirt = [0xef4444, 0xf97316, 0xfbbf24, 0x22c55e, 0x3b82f6, 0x8b5cf6, 0xe5e7eb, 0x111827, 0xec4899, 0x14b8a6];
    const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
    const c = new THREE.Color();
    const people = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const s = seats[i];
      v.set(s.x, s.y, s.z).applyMatrix4(s.blk.matrixWorld);
      people.push({ x: v.x, y: v.y, z: v.z, ph: Math.random() * 10, sp: rnd(0.7, 1.4), fan: Math.random() });
      bodies.setColorAt(i, c.setHex(pick(shirt)));
      heads.setColorAt(i, c.setHex(pick(skins)));
    }
    this.crowd = { bodies, heads, people, m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(1, 1, 1), p: new THREE.Vector3() };
    bodies.castShadow = false;
    this.group.add(bodies, heads);
    this.updateCrowd(0, 0);
  }

  cheer(amount = 1) { this.excite = Math.min(1.5, this.excite + amount); }

  updateCrowd(t, dt) {
    const cr = this.crowd;
    if (!cr) return;
    this.excite = Math.max(0, this.excite - dt * 0.45);
    const e = this.excite;
    const { m, q, s, p } = cr;
    for (let i = 0; i < cr.people.length; i++) {
      const o = cr.people[i];
      const idle = Math.sin(t * o.sp + o.ph) * 0.015;
      const jump = e > 0.05 ? Math.max(0, Math.sin(t * (7 + o.sp * 3) + o.ph)) * 0.22 * Math.min(1, e) * (0.4 + o.fan) : 0;
      p.set(o.x, o.y + 0.3 + idle + jump, o.z);
      m.compose(p, q, s); cr.bodies.setMatrixAt(i, m);
      p.y += 0.33;
      m.compose(p, q, s); cr.heads.setMatrixAt(i, m);
    }
    cr.bodies.instanceMatrix.needsUpdate = true;
    cr.heads.instanceMatrix.needsUpdate = true;
  }

  buildCeiling() {
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xfff6e8 });
    for (let x = -3; x <= 3; x += 3) for (let z = -4; z <= 4; z += 4) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.35), panelMat);
      p.position.set(x, 7.2, z); this.group.add(p);
    }
    // Faixas de LED nas arquibancadas
    const led = new THREE.MeshBasicMaterial({ color: 0xff7a2f });
    const led2 = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(14, 0.05, 0.05), led); a.position.set(0, 0.74, -7.03); this.group.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 14), led2); b.position.set(-4.03, 0.74, 0); this.group.add(b);
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 14), led2); c.position.set(4.03, 0.74, 0); this.group.add(c);
  }

  buildScoreboard() {
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
    this.sbCanvas = cv;
    this.sbTex = new THREE.CanvasTexture(cv); this.sbTex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.72, 0.08), new THREE.MeshStandardMaterial({ color: 0x0b0f1a, roughness: 0.4, metalness: 0.5 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshBasicMaterial({ map: this.sbTex, toneMapped: false }));
    screen.position.z = 0.041;
    const sb = new THREE.Group(); sb.add(frame, screen);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 10), new THREE.MeshStandardMaterial({ color: 0x222831, metalness: 0.7, roughness: 0.3 }));
    pole.position.y = -0.9; sb.add(pole);
    sb.position.set(-2.6, 1.45, -0.6); sb.rotation.y = 0.75;
    this.group.add(sb);
    this.setScoreboard('VOCÊ', 'CPU', 0, 0, 0, 0);
  }

  setScoreboard(n0, n1, s0, s1, g0, g1) {
    const g = this.sbCanvas.getContext('2d'), w = 512, h = 256;
    g.fillStyle = '#05070d'; g.fillRect(0, 0, w, h);
    g.font = '700 30px Outfit, system-ui, sans-serif'; g.textBaseline = 'middle';
    const row = (y, name, s, gm, col) => {
      g.fillStyle = col; g.fillRect(14, y - 44, 8, 88);
      g.fillStyle = '#e5e7eb'; g.textAlign = 'left'; g.fillText(name.toUpperCase().slice(0, 14), 36, y);
      g.fillStyle = '#fbbf24'; g.textAlign = 'center'; g.font = '800 40px Outfit, system-ui'; g.fillText(gm, 360, y);
      g.fillStyle = '#ffffff'; g.font = '900 78px Outfit, system-ui'; g.fillText(s, 450, y + 4);
      g.font = '700 30px Outfit, system-ui, sans-serif';
    };
    row(68, n0, s0, g0, '#fb923c');
    row(190, n1, s1, g1, '#38bdf8');
    g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(14, 127, w - 28, 2);
    this.sbTex.needsUpdate = true;
  }

  update(t, dt) {
    this.updateCrowd(t, dt);
    if (this.netWobble > 0) {
      this.netWobble = Math.max(0, this.netWobble - dt * 3);
      const k = Math.sin(t * 60) * this.netWobble * 0.012;
      this.net.position.z = k; this.netTape.position.z = k;
    }
  }
}
