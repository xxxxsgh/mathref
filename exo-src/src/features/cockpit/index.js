/**
 * COCKPIT — interior modelado da nave em 1ª pessoa, desenhado na camada de
 * cockpit do núcleo (ctx.cockpit.scene, referencial da NAVE; ver CONTRACT §8).
 *
 *   • o MESMO casco do jogador (serviço ship → kit.createPlayerHull) visto
 *     de dentro: nariz, estrutura do canopi e asas alinhados com o mundo
 *   • painel esculpido em três seções voltadas ao piloto, capô anti-ofuscante,
 *     consoles laterais, manche e manete, pilares do canopi, botões
 *   • telas emissivas (um atlas em canvas: radar, voo, escudo, faixa, sistemas)
 *   • HUD DIEGÉTICO projetado num plano de vidro fixo à nave: retícula,
 *     escada de arfagem, rumo, velocidade/altitude, escudo, alvo e contatos
 *   • luz própria: o sol do cockpit (núcleo) com SOMBRA (pilares e capô
 *     projetam sombra no painel) + brilho das telas
 *
 * Dependências: `ship` (obrigatória para o casco; sem ela o cockpit só não
 * desenha o casco externo), `combat` (opcional: contatos/alvo), `sky` (IBL).
 */
import * as THREE from 'three';
import { ATLAS, drawAtlas, drawHUD } from './screens.js';

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const EYE = new THREE.Vector3(0, 1.02, -3.25);

export default {
  name: 'cockpit',
  order: 42,

  init(ctx) {
    this.ctx = ctx;
    const ship = ctx.services.ship;
    const kit = ship && !ship.placeholder ? ship.kit : null;
    this.kit = kit;
    const eye = ship?.points?.eye || EYE;
    this.eye = eye.clone();
    this.group = new THREE.Group();
    this.group.name = 'cockpit:interior';
    ctx.cockpit.scene.add(this.group);

    // casco do jogador visto de dentro
    if (kit?.createPlayerHull) {
      this.hull = kit.createPlayerHull();
      this.hull.plumes.mesh.visible = false;
      // abre a fuselagem onde fica a cabine (senão a pele do casco cruza as pernas do piloto)
      this.hull.hull.material = kit.createPanelMaterial({
        scale: 0.42,
        cutBox: [new THREE.Vector3(-0.8, 0.22, -4.5), new THREE.Vector3(0.8, 1.32, -1.75)],
      });
      this.hull.glass.visible = false;
      this.hull.hull.castShadow = false;
      for (const g of this.hull.gear) g.visible = false;
      this.group.add(this.hull.group);
    }

    this.buildInterior(kit);
    this.buildScreens();
    this.buildHUD();
    this.setupLights(ctx);
    this.t = 0;
    this.redrawAt = 0;
  },

  /** Peças do interior (fundidas por material). */
  buildInterior(kit) {
    const THREEc = THREE;
    const G = kit?.geo;
    const parts = [];
    const glow = [];
    const C = {
      shell: new THREEc.Color(0x24262c),
      panel: new THREEc.Color(0x30333b),
      plum: new THREEc.Color(0x3d2c4f),
      orange: new THREEc.Color(0xd36a22),
      rubber: new THREEc.Color(0x0b0c0e),
      steel: new THREEc.Color(0x8a8f99),
    };
    // superfícies: [metal, rough, desgaste, painéis]
    const S_PANEL = [0.55, 0.55, 0.5, 1];
    const S_PAINT = [0.3, 0.45, 0.8, 1];
    const S_RUB = [0, 0.9, 0, 0.1];
    const S_STEEL = [1, 0.28, 0.2, 0.3];
    if (!G) {
      // sem kit (serviço ship ausente): interior mínimo com material padrão
      const m = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.5 });
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.6), m);
      b.position.set(0, 0.6, -3.9);
      this.group.add(b);
      return;
    }
    const { paint, mergePainted, bevelBox, plate, mat } = G;
    const add = (geo, col, surf, m) => parts.push(paint(geo, col, surf, m));
    const light = (geo, col, m) => glow.push(paint(geo, col, [0, 0, 0, 0], m));
    const yawM = (x, rotY) => new THREE.Matrix4().makeTranslation(x, 0, 0).multiply(new THREE.Matrix4().makeRotationY(rotY));
    // perfil lateral do painel (shape x = z do mundo, y = y) extrudado em X
    const dashProfile = [
      [-4.38, 0.18], [-3.62, 0.18], [-3.62, 0.4], [-3.74, 0.47], [-3.94, 0.79], [-3.92, 0.84], [-3.98, 0.885], [-4.22, 0.87], [-4.38, 0.74],
    ];
    const profM = (w) => new THREE.Matrix4().makeRotationY(-Math.PI / 2).multiply(new THREE.Matrix4().makeScale(1, 1, 1));
    const sec = (width, x, rotY, col) => {
      const g = plate(dashProfile, width, 0.025);
      const m = yawM(x, rotY).multiply(profM());
      add(g, col, S_PANEL, m);
    };
    // seção central e asas laterais voltadas ao piloto
    sec(0.62, 0, 0, C.shell);
    const wingYaw = 0.42;
    // pivô na borda interna: desloca a seção para fora do eixo
    for (const sx of [1, -1]) {
      const m = new THREE.Matrix4().makeTranslation(0.31 * sx, 0, -3.62).multiply(new THREE.Matrix4().makeRotationY(-wingYaw * sx)).multiply(new THREE.Matrix4().makeTranslation(0.27 * sx, 0, 3.62)).multiply(profM());
      add(plate(dashProfile, 0.54, 0.025), C.shell, S_PANEL, m);
    }
    // capô anti-ofuscante (aba arredondada sobre as telas)
    {
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const a = -1 + (2 * i) / 24;
        const x = a * 0.86;
        const z = -3.97 - (1 - Math.cos(a * 1.2)) * 0.14 + Math.abs(a) * 0.08;
        pts.push(new THREE.Vector3(x, 0.885 - Math.abs(a) * 0.04, z));
      }
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.032, 8, false), C.plum, S_PAINT);
      // faixa laranja sob a aba
      const pts2 = pts.map((p) => p.clone().add(new THREE.Vector3(0, -0.045, 0.012)));
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 48, 0.009, 6, false), C.orange, S_PAINT);
    }
    // carenagem superior do painel (cobre o vão entre seções e o casco)
    add(plate([[-0.95, -4.55], [0.95, -4.55], [0.9, -4.0], [-0.9, -4.0]], 0.05, 0.015), C.plum, S_PAINT, new THREE.Matrix4().makeTranslation(0, 0.84, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)));
    // molduras das telas (bisel em volta) — retângulos vazados
    const bezel = (w, h, m) => {
      const t = 0.03;
      add(bevelBox(w + 2 * t, t, 0.03, 0.008), C.plum, S_PAINT, m.clone().multiply(mat([0, h / 2 + t / 2, 0])));
      add(bevelBox(w + 2 * t, t, 0.03, 0.008), C.plum, S_PAINT, m.clone().multiply(mat([0, -h / 2 - t / 2, 0])));
      add(bevelBox(t, h, 0.03, 0.008), C.plum, S_PAINT, m.clone().multiply(mat([w / 2 + t / 2, 0, 0])));
      add(bevelBox(t, h, 0.03, 0.008), C.plum, S_PAINT, m.clone().multiply(mat([-w / 2 - t / 2, 0, 0])));
      // parafusos nos cantos
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 6), C.steel, S_STEEL, m.clone().multiply(mat([sx * (w / 2 + 0.015), sy * (h / 2 + 0.015), 0.018], [Math.PI / 2, 0, 0])));
    };
    // matrizes das telas (no plano inclinado da face do painel)
    const faceTilt = -Math.atan2(0.32, 0.2) + Math.PI / 2; // face → normal para o piloto
    const scrM = (x, rotY, y, z, w, h) => {
      const m = new THREE.Matrix4();
      if (rotY) m.makeTranslation(0.31 * Math.sign(x), 0, -3.62).multiply(new THREE.Matrix4().makeRotationY(-rotY * Math.sign(x))).multiply(new THREE.Matrix4().makeTranslation(x - 0.31 * Math.sign(x), y, z + 3.62));
      else m.makeTranslation(x, y, z);
      m.multiply(new THREE.Matrix4().makeRotationX(-faceTilt));
      return m;
    };
    this.screenSlots = [
      { key: 'radar', m: scrM(0, 0, 0.635, -3.845, 0.44, 0.31), w: 0.44, h: 0.31 },
      { key: 'flight', m: scrM(-0.58, wingYaw, 0.635, -3.845, 0.42, 0.31), w: 0.42, h: 0.31 },
      { key: 'status', m: scrM(0.58, wingYaw, 0.635, -3.845, 0.42, 0.31), w: 0.42, h: 0.31 },
    ];
    for (const s of this.screenSlots) bezel(s.w, s.h, s.m.clone().multiply(mat([0, 0, 0.03])));
    // faixa de status (sobre a aba, inclinada para trás)
    {
      const m = new THREE.Matrix4().makeTranslation(0, 0.935, -4.09).multiply(new THREE.Matrix4().makeRotationX(-0.35));
      this.screenSlots.push({ key: 'strip', m, w: 0.34, h: 0.105 });
      add(bevelBox(0.4, 0.15, 0.06, 0.015), C.shell, S_PANEL, m.clone().multiply(mat([0, -0.005, -0.035])));
      add(bevelBox(0.16, 0.08, 0.1, 0.012), C.panel, S_PANEL, m.clone().multiply(mat([0, -0.08, -0.04])));
    }
    // consoles laterais
    for (const sx of [1, -1]) {
      add(bevelBox(0.32, 0.5, 1.5, 0.04), C.shell, S_PANEL, mat([0.66 * sx, 0.45, -3.05]));
      // parede/joelheira que fecha o vão entre o painel e o console
      add(bevelBox(0.22, 0.62, 0.75, 0.04), C.shell, S_PANEL, mat([0.86 * sx, 0.5, -4.05], [0, 0.35 * sx, 0]));
      add(bevelBox(0.06, 0.5, 0.7, 0.02), C.plum, S_PAINT, mat([0.75 * sx, 0.55, -4.0], [0, 0.35 * sx, 0]));
      add(bevelBox(0.3, 0.04, 1.45, 0.012), C.panel, S_PANEL, mat([0.66 * sx, 0.715, -3.05]));
      add(bevelBox(0.05, 0.06, 1.45, 0.01), C.orange, S_PAINT, mat([(0.66 - 0.16) * sx, 0.7, -3.05]));
      // fileiras de botões
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 2; j++) {
          add(bevelBox(0.045, 0.02, 0.045, 0.006), C.rubber, S_RUB, mat([0.66 * sx + (j - 0.5) * 0.08, 0.745, -3.6 + i * 0.075]));
          const lc = (i + j) % 3 === 0 ? new THREE.Color(1, 0.35, 0.08) : (i + j) % 3 === 1 ? new THREE.Color(0.2, 0.9, 1) : new THREE.Color(0.1, 0.12, 0.14);
          light(new THREE.BoxGeometry(0.026, 0.006, 0.026), lc, mat([0.66 * sx + (j - 0.5) * 0.08, 0.757, -3.6 + i * 0.075]));
        }
      }
      // grelha de ventilação
      for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(0.22, 0.012, 0.02), C.rubber, S_RUB, mat([0.66 * sx, 0.735, -2.75 + i * 0.04]));
      // tubos/cabos ao longo da parede
      const pts = [new THREE.Vector3(0.82 * sx, 0.6, -4.3), new THREE.Vector3(0.84 * sx, 0.78, -3.7), new THREE.Vector3(0.86 * sx, 0.8, -2.6)];
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.035, 8, false), C.rubber, S_RUB);
      add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => p.clone().add(new THREE.Vector3(0, 0.07, 0.02)))), 24, 0.02, 6, false), C.orange, S_PAINT);
    }
    // pilares do canopi: diagonais dos cantos do painel até o alto do canopi
    const cs = this.kit?.canopySample;
    if (cs && cs(-3, 1)) {
      for (const sx of [1, -1]) {
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14;
          const z = -4.75 + t * 2.6;
          const ang = 0.12 + t * 1.0;
          const s = cs(z, sx > 0 ? ang : Math.PI - ang);
          if (!s) continue;
          pts.push(s.p.addScaledVector(s.n, -0.07));
        }
        if (pts.length > 3) {
          const curve = new THREE.CatmullRomCurve3(pts);
          add(new THREE.TubeGeometry(curve, 48, 0.075, 10, false), C.shell, S_PANEL);
          // aba de reforço e filete laranja por dentro
          const inner = pts.map((p) => p.clone().multiplyScalar(1).add(new THREE.Vector3(-0.06 * sx, -0.05, 0)));
          add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(inner), 48, 0.022, 6, false), C.orange, S_PAINT);
          // parafusos/ressaltos ao longo
          for (let i = 1; i < 6; i++) {
            const pp = curve.getPoint(i / 6);
            add(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 8), C.plum, S_PAINT, mat([pp.x - 0.05 * sx, pp.y - 0.05, pp.z], [0, 0, Math.PI / 2]));
          }
        }
      }
    }
    // manche (direita) e manete (esquerda)
    {
      const base = mat([0.24, 0.36, -3.66], [-0.35, 0, 0]);
      add(new THREE.CylinderGeometry(0.075, 0.1, 0.08, 16), C.rubber, S_RUB, base.clone().multiply(mat([0, 0.0, 0])));
      add(new THREE.CylinderGeometry(0.03, 0.035, 0.32, 10), C.steel, S_STEEL, base.clone().multiply(mat([0, 0.18, 0])));
      add(new THREE.CapsuleGeometry(0.04, 0.12, 4, 10), C.plum, S_PAINT, base.clone().multiply(mat([0, 0.38, 0.0], [0.25, 0, 0])));
      add(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 10), C.orange, S_PAINT, base.clone().multiply(mat([0, 0.47, -0.02], [0.25, 0, 0])));
      light(new THREE.SphereGeometry(0.012, 8, 6), new THREE.Color(1, 0.12, 0.05), base.clone().multiply(mat([0.0, 0.46, -0.045])));
      // fole na base
      for (let i = 0; i < 4; i++) add(new THREE.TorusGeometry(0.06 - i * 0.008, 0.012, 6, 16), C.rubber, S_RUB, base.clone().multiply(mat([0, 0.03 + i * 0.03, 0], [Math.PI / 2, 0, 0])));
      // manete
      const tb = mat([-0.56, 0.74, -3.38]);
      add(bevelBox(0.16, 0.05, 0.36, 0.015), C.panel, S_PANEL, tb);
      add(bevelBox(0.04, 0.02, 0.3, 0.005), C.rubber, S_RUB, tb.clone().multiply(mat([0, 0.03, 0])));
      add(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 8), C.steel, S_STEEL, tb.clone().multiply(mat([0, 0.1, -0.05], [-0.4, 0, 0])));
      add(bevelBox(0.11, 0.07, 0.07, 0.02), C.orange, S_PAINT, tb.clone().multiply(mat([0, 0.18, -0.09], [-0.4, 0, 0])));
      light(new THREE.BoxGeometry(0.06, 0.008, 0.012), new THREE.Color(0.2, 0.9, 1), tb.clone().multiply(mat([0, 0.218, -0.1], [-0.4, 0, 0])));
    }
    // botões e luzes na face do painel (sob as telas)
    for (let i = 0; i < 8; i++) {
      const x = -0.21 + i * 0.06;
      const m = new THREE.Matrix4().makeTranslation(x, 0.445, -3.74).multiply(new THREE.Matrix4().makeRotationX(-faceTilt));
      add(bevelBox(0.042, 0.042, 0.02, 0.006), C.rubber, S_RUB, m);
      const lc = i % 4 === 0 ? new THREE.Color(1, 0.12, 0.05) : i % 4 === 2 ? new THREE.Color(1, 0.6, 0.1) : new THREE.Color(0.25, 0.95, 1);
      light(new THREE.BoxGeometry(0.024, 0.024, 0.006), lc, m.clone().multiply(mat([0, 0, 0.012])));
    }
    // listras de advertência no centro
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Matrix4().makeTranslation(-0.27, 0.53 + i * 0.03, -3.8 - i * 0.02).multiply(new THREE.Matrix4().makeRotationX(-faceTilt)).multiply(new THREE.Matrix4().makeRotationZ(0.6));
      add(new THREE.BoxGeometry(0.03, 0.012, 0.01), i % 2 ? C.rubber : new THREE.Color(0.85, 0.6, 0.05), S_PAINT, m);
    }
    // luzes de leitura no capô (faixa ciano)
    light(new THREE.BoxGeometry(0.5, 0.008, 0.01), new THREE.Color(0.25, 0.85, 1), mat([0, 0.836, -3.93]));
    light(new THREE.BoxGeometry(0.06, 0.012, 0.012), new THREE.Color(1, 0.1, 0.05), mat([-0.62, 0.84, -3.98]));
    light(new THREE.BoxGeometry(0.06, 0.012, 0.012), new THREE.Color(1, 0.1, 0.05), mat([0.62, 0.84, -3.98]));
    // piso e laterais da cuba (quase sempre na penumbra)
    add(new THREE.BoxGeometry(1.5, 0.05, 2.6), C.rubber, S_RUB, mat([0, 0.15, -3.0]));

    const matPanel = this.kit.createPanelMaterial({ scale: 1.6, grime: 0.7, wear: 0.8, normalStrength: 0.8 });
    const geo = mergePainted(parts);
    this.interior = new THREE.Mesh(geo, matPanel);
    this.interior.castShadow = this.interior.receiveShadow = true;
    this.interior.name = 'cockpit:shell';
    this.group.add(this.interior);
    const lights = new THREE.Mesh(mergePainted(glow), this.kit.createEmissiveMaterial(5));
    lights.name = 'cockpit:leds';
    this.group.add(lights);
  },

  buildScreens() {
    const N = ATLAS.size;
    this.atlas = document.createElement('canvas');
    this.atlas.width = this.atlas.height = N;
    this.atlasG = this.atlas.getContext('2d');
    this.atlasTex = new THREE.CanvasTexture(this.atlas);
    this.atlasTex.colorSpace = THREE.SRGBColorSpace;
    this.atlasTex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.atlasTex, toneMapped: false });
    mat.color.setScalar(1.7);
    this.screenMat = mat;
    const geos = [];
    for (const s of this.screenSlots || []) {
      const r = ATLAS[s.key];
      const g = new THREE.PlaneGeometry(s.w, s.h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        uv.setXY(i, (r[0] + u * r[2]) / N, 1 - (r[1] + (1 - v) * r[3]) / N);
      }
      g.applyMatrix4(s.m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, s.key === 'strip' ? 0.006 : 0.034)));
      geos.push(g.toNonIndexed());
    }
    if (!geos.length) return;
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'uv']) {
      const size = geos[0].attributes[name].itemSize;
      const arr = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].array.length, 0));
      let o = 0;
      for (const g of geos) {
        arr.set(g.attributes[name].array, o);
        o += g.attributes[name].array.length;
      }
      merged.setAttribute(name, new THREE.BufferAttribute(arr, size));
    }
    this.screens = new THREE.Mesh(merged, mat);
    this.screens.name = 'cockpit:screens';
    this.group.add(this.screens);
  },

  buildHUD() {
    const W = 1024;
    const H = 640;
    this.hudCanvas = document.createElement('canvas');
    this.hudCanvas.width = W;
    this.hudCanvas.height = H;
    this.hudG = this.hudCanvas.getContext('2d');
    this.hudTex = new THREE.CanvasTexture(this.hudCanvas);
    this.hudTex.colorSpace = THREE.SRGBColorSpace;
    const D = 0.95;
    const half = 46 * DEG;
    const pw = 2 * D * Math.tan(half);
    const ph = (pw * H) / W;
    this.hudSpec = { D, pw, ph, W, H, f: W / (2 * Math.tan(half)) };
    const mat = new THREE.MeshBasicMaterial({ map: this.hudTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    mat.color.setScalar(1.6);
    this.hud = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), mat);
    this.hud.position.set(this.eye.x, this.eye.y, this.eye.z - D);
    this.hud.renderOrder = 20;
    this.hud.name = 'cockpit:hud';
    this.group.add(this.hud);
  },

  setupLights(ctx) {
    const cp = ctx.cockpit;
    const sun = cp.sun;
    if (sun && ctx.renderer.shadowMap.enabled) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      const c = sun.shadow.camera;
      c.left = -2.4;
      c.right = 2.4;
      c.top = 2.4;
      c.bottom = -2.4;
      c.near = 0.1;
      c.far = 40;
      c.updateProjectionMatrix();
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.015;
      sun.shadow.radius = 2;
    }
    // brilho das telas sobre o painel e as mãos
    this.screenLight = new THREE.PointLight(0x7fd8ff, 0.6, 1.6, 2);
    this.screenLight.position.set(0, 0.72, -3.6);
    this.group.add(this.screenLight);
    this.warmLight = new THREE.PointLight(0xff8a3a, 0.35, 1.4, 2);
    this.warmLight.position.set(-0.5, 0.8, -3.5);
    this.group.add(this.warmLight);
  },

  /** Dados do painel/HUD a partir dos serviços. */
  gather(ctx) {
    const p = ctx.player;
    const ship = ctx.services.ship;
    const q = p.renderQuat;
    const up = p.up;
    const fwd = _v.set(0, 0, -1).applyQuaternion(q);
    const pitch = Math.asin(Math.max(-1, Math.min(1, fwd.dot(up))));
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const bodyUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const roll = Math.atan2(-right.dot(up), bodyUp.dot(up));
    const heading = ctx.Geo?.headingOf ? ctx.Geo.headingOf(up, fwd.clone()) : 0;
    let lat = 0;
    let lon = 0;
    if (ctx.Geo?.latLonFromDir) ({ lat, lon } = ctx.Geo.latLonFromDir(up));
    const combat = ctx.services.combat;
    _qi.copy(q).invert();
    const eyeW = ship?.renderPos || p.renderPos;
    const rel = (wp) => new THREE.Vector3(wp.x - eyeW.x, wp.y - eyeW.y, wp.z - eyeW.z).applyQuaternion(_qi);
    const contacts = [];
    for (const c of combat?.contacts || []) contacts.push({ kind: c.kind, rel: rel(c.worldPos) });
    const S = this.hudSpec;
    const proj = (vShip) => {
      const d = vShip.clone().sub(this.eye);
      if (d.z > -0.5) return null;
      const x = S.W / 2 + (d.x / -d.z) * S.f;
      const y = S.H / 2 - (d.y / -d.z) * S.f;
      if (x < 0 || x > S.W || y < 0 || y > S.H) return null;
      return [x, y];
    };
    let target = null;
    const tg = combat?.target;
    if (tg?.worldPos) {
      const r = rel(tg.worldPos);
      const scr = proj(r.clone().add(this.eye));
      const dist = r.length();
      target = { name: tg.name || 'ALVO', hp: tg.hp ?? 1, distance: dist, screen: scr, size: ((tg.radius || 8) / Math.max(1, dist)) * S.f * 1.2 + 16 };
      if (tg.lead) {
        const lr = rel(tg.lead);
        target.lead = proj(lr.add(this.eye));
      }
    }
    const vel = ship?.velocity || p.velocity;
    let fpm = null;
    if (vel && vel.lengthSq() > 4) fpm = proj(vel.clone().applyQuaternion(_qi).normalize().multiplyScalar(100).add(this.eye));
    const edges = [];
    for (const c of contacts) {
      if (c.kind !== 'hostile') continue;
      const s = proj(c.rel.clone().add(this.eye));
      if (s) continue;
      const a = Math.atan2(-c.rel.y, c.rel.x);
      const r = S.H * 0.38;
      edges.push({ kind: c.kind, x: S.W / 2 + Math.cos(a) * r * 1.3, y: S.H / 2 + Math.sin(a) * r, a });
    }
    return {
      speed: ship?.speed ?? p.velocity.length(),
      altitude: Math.max(0, p.altitude),
      throttle: ship?.throttle ?? 0.5,
      air: ship?.air ?? 1,
      heat: ship?.heat ?? 0,
      shield: ship?.shield ?? 1,
      hull: ship?.hull ?? 1,
      gear: ship?.gear ?? 0,
      pulse: !!ship?.pulsing,
      state: ship?.state || 'voo',
      heading,
      pitchDeg: pitch / DEG,
      roll,
      lat,
      lon,
      contacts,
      target,
      fpm,
      edges,
      f: S.f,
      centerY: 0.5,
    };
  },

  frame(dt, ctx) {
    const p = ctx.player;
    const on = p.mode !== 'walk' && p.view === 'first';
    this.group.visible = on;
    if (!on) return;
    this.t += ctx.time.frozen ? 1 / 60 : dt;
    const cp = ctx.cockpit;
    // FOV do cockpit = FOV do mundo (o casco visto de dentro casa com o exterior)
    const fov = ctx.camera.fov;
    if (Math.abs(cp.camera.fov - fov) > 0.01) {
      cp.camera.fov = fov;
      cp.camera.updateProjectionMatrix();
    }
    const env = ctx.services.sky?.envMap;
    if (env && cp.scene.environment !== env) cp.scene.environment = env;
    // sombra do sol centrada no cockpit
    if (cp.sun?.castShadow) {
      cp.sun.position.add(_v.set(0, 0.8, -3.3));
      cp.sun.target.position.set(0, 0.8, -3.3);
      cp.sun.target.updateMatrixWorld();
      cp.sun.updateMatrixWorld();
    }
    // telas a ~12 Hz (sempre no modo shot)
    if (ctx.time.frozen || this.t >= this.redrawAt) {
      this.redrawAt = this.t + 1 / 12;
      const d = this.gather(ctx);
      drawAtlas(this.atlasG, d, this.t);
      this.atlasTex.needsUpdate = true;
      drawHUD(this.hudG, this.hudSpec.W, this.hudSpec.H, d, this.t);
      this.hudTex.needsUpdate = true;
    }
    // reentrada: o vidro esquenta
    const heat = ctx.services.ship?.heat ?? 0;
    this.warmLight.intensity = 0.35 + heat * 3;
  },

  dispose(ctx) {
    ctx.cockpit.scene.remove(this.group);
    if (ctx.cockpit.sun) ctx.cockpit.sun.castShadow = false;
  },
};
