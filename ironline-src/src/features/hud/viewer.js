/**
 * Visualizador 3D de itens (inspeção do inventário e revelação da caixa):
 * WebGLRenderer próprio (como o gunsmith — não toca no pipeline da feature
 * rendering), luz de estúdio com RoomEnvironment, pedestal com anel na cor
 * da raridade, órbita por arrasto (inércia), zoom pela roda, giro
 * automático e entrada com "pop".
 *
 * Modelo: `services.weapon.buildPreview(item)` (contrato v3). Enquanto a
 * feature weapon não publica, a reserva é local: o KR-9 clonado da
 * viewmodel ou a silhueta da arma/faca extrudada, ambos com a textura do
 * padrão da skin (itemart.js) — dá para inspecionar padrão, semente e
 * desgaste do mesmo jeito.
 */
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SIL, parsePath, bbox, patternCanvas, charmPath } from './itemart.js';

export class ItemViewer {
  constructor(THREE, host, { w = 900, h = 520, k = 1, color = '#e2b45a', interactive = true } = {}) {
    this.THREE = THREE;
    this.w = w; this.h = h;
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }));
    r.setPixelRatio(Math.min(2, k));
    r.setSize(w, h, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.setClearColor(0x000000, 0);
    const el = r.domElement;
    el.style.width = w + 'px';
    el.style.height = h + 'px';
    el.className = 'iv-canvas';
    host.appendChild(el);
    const scene = (this.scene = new THREE.Scene());
    const pm = new THREE.PMREMGenerator(r);
    this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    pm.dispose();
    scene.environment = this.env;
    scene.environmentIntensity = 0.7;
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(1.5, 3, 2.2);
    const rim = new THREE.DirectionalLight(0xbcd6ff, 3.0);
    rim.position.set(-2.5, 1.4, -2);
    const fill = new THREE.DirectionalLight(0xffb870, 0.5);
    fill.position.set(0, -2, 1);
    scene.add(key, rim, fill);
    // pedestal + anel da raridade
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.9 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.005, 8, 96), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.33;
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.53, 0.04, 64), new THREE.MeshStandardMaterial({ color: 0x0f1114, roughness: 0.6, metalness: 0.3 }));
    ped.position.y = -0.355;
    this.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.1, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 48), this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.376;
    scene.add(ped, ring, glow);
    this.holder = new THREE.Group();
    scene.add(this.holder);
    this.camera = new THREE.PerspectiveCamera(28, w / h, 0.01, 50);
    this.yaw = -0.5; this.pitch = 0.2; this.dist = 2.45;
    this.tYaw = this.yaw; this.tPitch = this.pitch; this.tDist = this.dist;
    this.vYaw = 0;
    this.auto = true;
    this.t = 0;
    this.pop = 1;
    this.ok = true;
    if (interactive) this.bindInput(el);
  }

  setColor(c) {
    this.ringMat.color.set(c);
    this.glowMat.color.set(c);
  }

  /** Troca o objeto exibido (normalizado para caber no pedestal). */
  setObject(obj) {
    const THREE = this.THREE;
    for (const c of [...this.holder.children]) { this.holder.remove(c); disposeTree(c); }
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const len = Math.max(size.x, size.y, size.z) || 1;
    const s = 1.05 / len;
    const pivot = new THREE.Group();
    obj.position.sub(center);
    pivot.add(obj);
    pivot.scale.setScalar(s);
    // cano ao longo de X na tela: modelos da weapon apontam para −Z
    if (size.z > size.x * 1.2) pivot.rotation.y = Math.PI / 2;
    obj.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = false; } });
    this.holder.add(pivot);
    this.pop = 0;
  }

  bindInput(el) {
    el.style.cursor = 'grab';
    el.style.pointerEvents = 'auto';
    el.style.touchAction = 'none';
    let px = 0, py = 0;
    const down = (e) => {
      this.drag = true; this.auto = false;
      px = e.clientX; py = e.clientY;
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const move = (e) => {
      if (!this.drag) return;
      const dx = e.clientX - px, dy = e.clientY - py;
      px = e.clientX; py = e.clientY;
      this.tYaw -= dx * 0.008;
      this.vYaw = -dx * 0.008;
      this.tPitch = Math.max(-0.7, Math.min(0.9, this.tPitch + dy * 0.006));
    };
    const up = () => { this.drag = false; el.style.cursor = 'grab'; };
    const wheel = (e) => {
      e.preventDefault();
      this.tDist = Math.max(0.9, Math.min(4, this.tDist * Math.exp(e.deltaY * 0.0012)));
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('dblclick', () => { this.tYaw = -0.5; this.tPitch = 0.2; this.tDist = 2.45; this.auto = true; });
  }

  /** Ângulo de vista predefinido (QA/screenshots). */
  view(yaw, pitch, dist) {
    this.yaw = this.tYaw = yaw;
    this.pitch = this.tPitch = pitch;
    if (dist) this.dist = this.tDist = dist;
    this.auto = false;
  }

  render(dt) {
    if (!this.ok) return;
    this.t += dt;
    if (this.auto) this.tYaw += dt * 0.35;
    else if (!this.drag && Math.abs(this.vYaw) > 1e-4) { this.tYaw += this.vYaw; this.vYaw *= Math.pow(0.02, dt); }
    const a = 1 - Math.pow(0.0005, dt);
    this.yaw += (this.tYaw - this.yaw) * a;
    this.pitch += (this.tPitch - this.pitch) * a;
    this.dist += (this.tDist - this.dist) * a;
    this.pop = Math.min(1, this.pop + dt * 2.2);
    const e = 1 - Math.pow(1 - this.pop, 3);
    const p = this.holder.children[0];
    if (p) {
      p.position.y = 0.05 * Math.sin(this.t * 1.3) * 0.3 + (1 - e) * -0.25;
      this.holder.scale.setScalar(0.6 + 0.4 * e);
    }
    const c = this.camera;
    c.position.set(Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist, Math.sin(this.pitch) * this.dist + 0.02, Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist);
    c.lookAt(0, -0.1, 0);
    this.renderer.render(this.scene, c);
  }

  dispose() {
    this.ok = false;
    try {
      for (const ch of [...this.holder.children]) disposeTree(ch);
      this.env.dispose();
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    } catch {}
    this.renderer.domElement.remove();
  }
}

function disposeTree(o) {
  o.traverse?.((m) => {
    if (m.userData?.ivOwned || m.userData?.ivMat) {
      if (m.userData.ivOwned) m.geometry?.dispose?.();
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mt of mats) { mt?.map?.dispose?.(); mt?.dispose?.(); }
    }
  });
}

/**
 * Modelo 3D de um item: `weapon.buildPreview(spec)` (contrato) com reserva
 * local. `spec` = previewSpec do inventário; `def` = definição do catálogo.
 */
export async function buildItemModel(ctx, spec, def, it = {}) {
  const THREE = ctx.THREE;
  const w = ctx.services.weapon;
  if (w?.buildPreview && spec) {
    try {
      const obj = await w.buildPreview(spec);
      if (obj) return { obj, source: 'weapon' };
    } catch (err) {
      console.warn('[hud] buildPreview falhou — usando reserva', err);
    }
  }
  return { obj: fallbackModel(THREE, ctx, def, it), source: 'fallback' };
}

/** Reserva local: KR-9 clonado (com textura do padrão) ou silhueta extrudada. */
export function fallbackModel(THREE, ctx, def, it = {}) {
  if (!def) return new THREE.Group();
  if (def.type === 'charm') return charmModel(THREE, def);
  const skin = def.type === 'skin' || def.type === 'knife' ? { id: def.id, pattern: def.pattern, palette: def.palette, seed: it.seed ?? 0, wear: it.wear ?? 0 } : null;
  const tex = skin ? new THREE.CanvasTexture(patternCanvas(skin, 512)) : null;
  if (tex) {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
  }
  const fin = def.finish || { metalness: 0.4, roughness: 0.5 };
  const wear = it.wear ?? 0;
  const base = def.type === 'sticker' ? 'kr9' : def.base;
  // KR-9: o modelo real da viewmodel, se for a arma ativa
  const gun = ctx.services.weapon?.gun;
  if (base === 'kr9' && gun && (ctx.services.weapon?.id ?? 'kr9') === 'kr9') {
    try {
      const m = gun.clone(true);
      m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1);
      const drop = [];
      m.traverse((o) => { if (/^(hand|sleeve)/i.test(o.name) || o.isSkinnedMesh) drop.push(o); });
      for (const o of drop) o.parent?.remove(o);
      if (tex) {
        tex.repeat.set(6, 6);
        const cache = new Map();
        m.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const src = Array.isArray(o.material) ? o.material[0] : o.material;
          // vidro/lentes/emissivos ficam como estão
          if (src.transparent || src.emissiveIntensity > 0.5 || !src.color) return;
          if (!cache.has(src)) {
            const mt = new THREE.MeshStandardMaterial({ map: tex, metalness: fin.metalness, roughness: Math.min(1, fin.roughness + wear * 0.25), envMapIntensity: 1 });
            cache.set(src, mt);
          }
          o.material = cache.get(src);
          // geometria é compartilhada com a viewmodel: descarta só o material
          o.userData.ivMat = true;
        });
      }
      return m;
    } catch (err) {
      console.warn('[hud] clone da arma falhou', err);
    }
  }
  return extrudeModel(THREE, base in SIL ? base : 'kr9', tex, fin, wear, def.type === 'knife');
}

function extrudeModel(THREE, key, tex, fin, wear, knife) {
  const polys = parsePath(SIL[key]);
  const b = bbox(polys);
  const sc = 1 / b.w;
  const toV = ([x, y]) => new THREE.Vector2((x - b.x0) * sc, -(y - b.y0) * sc);
  const area = (p) => p.reduce((a, [x, y], i) => { const [x2, y2] = p[(i + 1) % p.length]; return a + (x * y2 - x2 * y); }, 0) / 2;
  const inside = ([px, py], p) => {
    let c = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const [xi, yi] = p[i], [xj, yj] = p[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const main = polys[0];
  const shapes = [new THREE.Shape(main.map(toV))];
  for (const p of polys.slice(1)) {
    const cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
    if (Math.abs(area(p)) < Math.abs(area(main)) * 0.2 && inside([cx, cy], main)) shapes[0].holes.push(new THREE.Path(p.map(toV)));
    else shapes.push(new THREE.Shape(p.map(toV)));
  }
  const depth = knife ? 0.012 : 0.05;
  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: true, bevelThickness: depth * 0.25, bevelSize: knife ? 0.003 : 0.006, bevelSegments: 2, curveSegments: 4 });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  if (tex) tex.repeat.set(3, 3);
  const mat = new THREE.MeshStandardMaterial({ map: tex || null, color: tex ? 0xffffff : 0x3a3e42, metalness: fin.metalness, roughness: Math.min(1, fin.roughness + wear * 0.25) });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.ivOwned = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

function charmModel(THREE, def) {
  // silhueta do chaveiro extrudada + argola
  const polys = [];
  const d = charmPath(def.shape, 0, 0, 1).replace(/A[^Z]*Z/g, ''); // só a parte poligonal
  for (const p of parsePath(d.replace(/Z/g, ' Z '))) if (p.length > 2) polys.push(p);
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color || '#e2b45a'), metalness: 0.7, roughness: 0.3 });
  if (polys.length) {
    const shapes = polys.slice(0, 1).map((p) => new THREE.Shape(p.map(([x, y]) => new THREE.Vector2(x * 0.3, -y * 0.3))));
    const geo = new THREE.ExtrudeGeometry(shapes, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 });
    geo.translate(0, 0, -0.04);
    const m = new THREE.Mesh(geo, mat);
    m.userData.ivOwned = true;
    g.add(m);
  } else {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.07, 16, 48), mat);
    m.userData.ivOwned = true;
    g.add(m);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 24), new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 1, roughness: 0.2 }));
  ring.position.y = 0.36;
  ring.userData.ivOwned = true;
  g.add(ring);
  return g;
}
