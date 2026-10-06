/**
 * Acessórios das armas (supressor, empunhadura vertical, laser, ótica 3x).
 *
 * `ATTACHMENTS` diz o que cada arma aceita; `applyAttachments(g, cfg, ctx)`
 * monta/desmonta as peças nos pontos `g.mounts` e devolve os modificadores
 * que index.js usa no tiro:
 *   suppressor → boca avança, clarão pequeno e escuro, som abafado
 *                ('shot_supp'), recuo −8 %
 *   foregrip   → recuo vertical −18 % (subida e chute), horizontal −10 %
 *   laser      → dispersão do tiro sem mirar −25 %; feixe visível + ponto no
 *                mundo (LaserBeam)
 *   optic '3x' → troca a mira padrão por uma ótica 3x com imagem ampliada
 *                (lente de scope.js): nova linha de visada, FOV do ADS e zoom
 */
import * as THREE from 'three';
import { buildSuppressor, buildForegrip, buildLaser, buildOptic3x } from './parts.js';

export const ATTACHMENTS = {
  kr9: { muzzle: ['none', 'suppressor'], grip: ['none', 'foregrip'], laser: ['none', 'laser'], optic: ['default', '3x'] },
  p11: { muzzle: ['none', 'suppressor'], laser: ['none', 'laser'] },
  mx9: { muzzle: ['none', 'suppressor'], grip: ['none', 'foregrip'], laser: ['none', 'laser'], optic: ['default', '3x'] },
  br12: { laser: ['none', 'laser'] },
  lr50: { muzzle: ['none', 'suppressor'], laser: ['none', 'laser'] },
  hm60: { muzzle: ['none', 'suppressor'], grip: ['none', 'foregrip'], laser: ['none', 'laser'], optic: ['default', '3x'] },
  sr7: { muzzle: ['none', 'suppressor'], grip: ['none', 'foregrip'], laser: ['none', 'laser'] },
};
export const DEFAULT_ATT = { muzzle: 'none', grip: 'none', laser: 'none', optic: 'default' };

/** Normaliza um pedido parcial contra o que a arma aceita. */
export function normAttachments(id, cfg = {}, cur = DEFAULT_ATT) {
  const allow = ATTACHMENTS[id] || {};
  const out = { ...DEFAULT_ATT, ...cur };
  for (const k of Object.keys(DEFAULT_ATT)) {
    let v = cfg[k];
    if (v === undefined) continue;
    if (v === true) v = (allow[k] || [])[1];
    if (v === false || v == null) v = DEFAULT_ATT[k];
    if ((allow[k] || [DEFAULT_ATT[k]]).includes(v)) out[k] = v;
  }
  return out;
}

/**
 * Monta os acessórios em `g` (objeto arma de guns.js/rig.js). `view` =
 * ScopeView para a ótica 3x. Idempotente: desmonta o que havia antes.
 */
export function applyAttachments(g, M, cfg, view) {
  const R = g.R;
  const mt = g.mounts || {};
  const A = (g.att ||= { parts: {}, cfg: { ...DEFAULT_ATT } });
  for (const p of Object.values(A.parts)) p?.parent?.remove(p);
  A.parts = {};
  A.cfg = { ...cfg };
  const mods = { suppressed: false, flash: 1, recoilV: 1, recoilH: 1, hipSpread: 1, laser: null, scope: null };
  // boca: o ponto da boca volta para a posição de fábrica antes de avançar
  if (!A.muzzle0) A.muzzle0 = R.muzzle.position.clone();
  R.muzzle.position.copy(A.muzzle0);
  if (cfg.muzzle === 'suppressor' && mt.muzzle) {
    const thin = !!mt.muzzle.thread;
    const s = buildSuppressor(M, thin ? { len: 0.13, r: 0.0165 } : { len: g.kind === 'sniper' ? 0.2 : 0.17, r: Math.max(0.018, mt.muzzle.r * 1.45) });
    s.position.set(0, 0, -mt.muzzle.u);
    // pistola: a boca é filha do ferrolho; o supressor vai na armação (cano)
    R.root.add(s);
    A.parts.suppressor = s;
    R.muzzle.position.set(A.muzzle0.x, A.muzzle0.y, -(mt.muzzle.u + s.userData.len + 0.004) - (R.muzzle.parent === R.root ? 0 : R.muzzle.parent.position.z));
    mods.suppressed = true;
    mods.flash = 0.22;
    mods.recoilV *= 0.92;
    mods.recoilH *= 0.92;
  }
  if (cfg.grip === 'foregrip' && mt.under) {
    const f = buildForegrip(M);
    f.position.set(0, mt.under.y, -mt.under.u);
    R.root.add(f);
    A.parts.foregrip = f;
    mods.recoilV *= 0.82;
    mods.recoilH *= 0.9;
  }
  if (cfg.laser === 'laser' && mt.side) {
    const l = buildLaser(M);
    const sc = mt.side.scale || 1;
    l.scale.setScalar(sc);
    if (mt.side.under) l.position.set(0, mt.side.y - 0.0105 * sc, -mt.side.u);
    else l.position.set(mt.side.x - 0.012, mt.side.y, -mt.side.u);
    // escopeta: o laser vai na telha da bomba (anda junto)
    if (mt.side.onPump && R.pump) {
      l.position.z -= R.pump.position.z;
      R.pump.add(l);
    } else R.root.add(l);
    A.parts.laser = l;
    mods.hipSpread = 0.75;
    mods.laser = l.userData.emitter;
  }
  // ótica
  const optic = cfg.optic === '3x' && mt.top ? '3x' : 'default';
  if (g.opticRoot) g.opticRoot.visible = optic === 'default';
  if (g.lensDefault === undefined) g.lensDefault = g.lens;
  if (optic === '3x') {
    const o = buildOptic3x(M, view);
    const par = mt.top.parent || R.root;
    o.root.position.set(0, mt.top.y + o.ringH, -mt.top.u);
    if (par !== R.root) o.root.position.sub(par.position);
    par.add(o.root);
    A.parts.optic = o.root;
    g.lens = null;
    g.scopeLens = o.lens;
    g.glint = o.glint;
    g.setSight(new THREE.Vector3(0, mt.top.y + o.ringH, -mt.top.u + 0.004), 0.085);
    g.vmFov.ads = 24;
    g.zoom = 3;
    mods.scope = 3;
  } else {
    g.lens = g.lensDefault;
    g.scopeLens = g.scopeLensDefault || null;
    g.glint = g.glintDefault || null;
    if (g.adsBase) {
      g.setSight(g.adsBase.sight, g.adsBase.eyeRelief);
      g.vmFov.ads = g.adsBase.vmFov;
    }
    g.zoom = g.zoomDefault || 1;
    mods.scope = g.zoomDefault > 1 ? g.zoomDefault : null;
  }
  for (const p of Object.values(A.parts)) p.traverse((o) => o.isMesh && (o.frustumCulled = false));
  A.mods = mods;
  return mods;
}

/**
 * Feixe do laser (viewmodel) + ponto no mundo. O feixe é um cilindro
 * aditivo que some com a distância (partículas no ar); o ponto é um sprite
 * na cena do mundo, no acerto do raio a partir do emissor.
 */
export class LaserBeam {
  constructor(ctx) {
    this.ctx = ctx;
    const geo = new THREE.CylinderGeometry(0.0007, 0.0012, 1, 8, 1, true);
    geo.translate(0, 0.5, 0);
    geo.rotateX(-Math.PI / 2); // ao longo de −Z
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.08, 0.04) }, uLen: { value: 4 } },
      vertexShader: 'varying float vZ; void main(){ vZ = -position.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uLen; varying float vZ; void main(){ float k = exp(-vZ * 1.6) * 0.9 + 0.1 * (1.0 - smoothstep(0.0, 1.0, vZ)); gl_FragColor = vec4(uColor * k * 1.4, 1.0); }',
    });
    this.beam = new THREE.Mesh(geo, mat);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 6;
    this.beam.visible = false;
    // ponto (mundo)
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let tex = null;
    if (cv) {
      cv.width = cv.height = 64;
      const g = cv.getContext('2d');
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.2, 'rgba(255,80,50,0.9)');
      gr.addColorStop(0.5, 'rgba(255,30,10,0.25)');
      gr.addColorStop(1, 'rgba(255,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      tex = new THREE.CanvasTexture(cv);
    }
    this.dot = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.dot.visible = false;
    this.dot.renderOrder = 8;
    ctx.scene.add(this.dot);
    this._o = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }
  /** emitter = Object3D na viewmodel (ou null). */
  update(emitter, visible) {
    const ctx = this.ctx;
    if (!emitter || !visible) {
      this.beam.visible = false;
      this.dot.visible = false;
      return;
    }
    if (this.beam.parent !== emitter) emitter.add(this.beam);
    this.beam.visible = true;
    emitter.updateMatrixWorld(true);
    // origem/direção no mundo: a viewmodel tem a mesma orientação do mundo, com a câmera na origem
    emitter.getWorldPosition(this._o);
    emitter.getWorldQuaternion(this._q);
    this._d.set(0, 0, -1).applyQuaternion(this._q);
    const eye = ctx.camera.getWorldPosition(new THREE.Vector3());
    const org = eye.clone().add(this._o.clone().multiplyScalar(1));
    const hit = ctx.collision?.raycast(org, this._d, 120, { filter: (c) => c.tag !== 'player' });
    const len = hit ? hit.distance : 4;
    this.beam.scale.set(1, 1, Math.min(len, 4) / emitter.getWorldScale(new THREE.Vector3()).z);
    if (hit) {
      this.dot.visible = true;
      this.dot.position.copy(hit.point).addScaledVector(hit.normal || this._d.clone().negate(), 0.01);
      const s = 0.03 + hit.distance * 0.0025;
      this.dot.scale.set(s, s, s);
    } else this.dot.visible = false;
  }
  dispose() {
    this.beam.parent?.remove(this.beam);
    this.ctx.scene.remove(this.dot);
  }
}
