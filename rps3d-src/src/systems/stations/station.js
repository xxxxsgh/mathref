// StationView — uma estação do sistema atual no mundo: referencial
// {pos, quat} (estático, origem flutuante via ctx.world), malhas do exterior
// (montadas sob demanda quando a câmera chega perto), anel girando, luzes,
// hangares (dados de atracação) e o interior andável (só da Meridiana e do
// Refúgio, construído quando o jogador está a poucos km).
import * as THREE from 'three/webgpu';
import { lightsGeometry, V3 } from './geo.js';
import { makeHullMaterial, makeLightsMaterial, makeFieldMaterial, ZONE } from './materials.js';
import { buildMeridiana, bayBasis, bayCavity, MERIDIANA } from './meridiana.js';
import { buildPlatform, buildRebel, buildMilitary, buildGeneric } from './others.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

/** Tipo arquitetônico de uma estação dos dados do universo. */
export function archetypeOf(st) {
  if (st.name === 'Estação Meridiana') return 'meridiana';
  if (st.kind === 'floating') return 'platform';
  if (st.kind === 'rebel') return 'rebel';
  if (st.kind === 'military') return 'military';
  return 'generic';
}

/** Estilo de material por facção/tipo. */
function styleOf(st, arch) {
  if (arch === 'platform') return 'industrial';
  if (arch === 'rebel') return 'frente';
  if (st.faction === 'hegemonia') return 'hegemonia';
  if (st.faction === 'corsarios') return 'corsarios';
  if (st.faction === 'frente') return 'frente';
  return 'guilda';
}

/** Orientação determinística: espinha (Y) quase tangente à órbita, um pouco inclinada para fora. */
export function stationQuat(st, sys) {
  const body = st.body ? sys.body(st.body) : null;
  const out = body ? st.pos.clone().sub(body.pos).normalize() : st.pos.clone().normalize();
  let tan = V3().crossVectors(out, V3(0, 1, 0));
  if (tan.lengthSq() < 1e-4) tan = V3(1, 0, 0);
  tan.normalize();
  const arch = archetypeOf(st);
  let Y;
  if (arch === 'platform' || arch === 'rebel') Y = out.clone(); // convés virado para fora do planeta / do sol
  else Y = tan.clone().multiplyScalar(0.94).addScaledVector(out, 0.34).normalize();
  // X: perpendicular a Y, girando um pouco por semente
  const ref = Math.abs(Y.dot(out)) < 0.95 ? out : V3(0, 1, 0);
  const Zv = V3().crossVectors(ref, Y).normalize();
  const Xv = V3().crossVectors(Y, Zv).normalize();
  const m = new THREE.Matrix4().makeBasis(Xv, Y, Zv);
  const q = new THREE.Quaternion().setFromRotationMatrix(m);
  let spin = ((st.seed || 1) % 628) / 100;
  if (arch === 'meridiana' && body) {
    // gira em torno da espinha para Verídia aparecer a ~30° da boca do hangar 03 (+Z)
    // e na diagonal da janela do bar (+X)
    const dL = body.pos.clone().sub(st.pos).normalize().applyQuaternion(q.clone().invert());
    spin = Math.atan2(dL.x, dL.z) - 30 * Math.PI / 180;
  }
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), spin));
}

export class StationView {
  constructor(ctx, st, sys) {
    this.ctx = ctx; this.st = st; this.sys = sys;
    this.arch = archetypeOf(st);
    this.style = styleOf(st, this.arch);
    this.frame = { pos: st.pos.clone(), quat: stationQuat(st, sys) };
    this.group = new THREE.Group();
    this.group.name = 'estacao:' + st.id;
    this.group.quaternion.copy(this.frame.quat);
    this.entry = ctx.world.add(this.group, this.frame.pos);
    this.built = false;
    this.ring = null; this.ringSpeed = 0;
    this.bays = [];
    this.radius = 400;
    this.mats = [];
    this.hubGroup = null;       // escondido quando o jogador está no interior
    this.bay0Cavity = null;     // cavidade simples do hangar 0 (troca pelo interior detalhado)
    this.fields = [];
    this.ringAngle = 0;
    this.visible = true;
    this.layout();
  }

  /** Dados que não dependem das malhas (hangares, raio, caminhos de aproximação). */
  layout() {
    const a = this.arch;
    if (a === 'meridiana') {
      this.radius = MERIDIANA.radius;
      const B = MERIDIANA.bay;
      for (let i = 0; i < 4; i++) {
        const b = bayBasis(i);
        const rc = MERIDIANA.hubR - B.d / 2 + 4;
        const pad = b.out.clone().multiplyScalar(rc).setY(MERIDIANA.floorY);
        const mouth = b.out.clone().multiplyScalar(MERIDIANA.hubR + 4).setY(MERIDIANA.floorY + B.h * 0.42);
        this.bays.push({
          index: i, number: [3, 4, 1, 2][i], kind: 'hangar', pad, up: b.up.clone(), fwd: b.out.clone().negate(), out: b.out.clone(), w: B.w, h: B.h, d: B.d,
          path: [mouth.clone().addScaledVector(b.out, 1600), mouth.clone().addScaledVector(b.out, 520), mouth.clone().addScaledVector(b.out, 140), mouth.clone(), pad.clone().addScaledVector(b.up, 7)],
          hover: 6, occupied: i === 2,
        });
      }
    } else {
      const spec = { platform: buildPlatform, rebel: buildRebel, military: buildMilitary, generic: buildGeneric }[a];
      const info = spec.layout(this.st);
      this.radius = info.radius;
      for (const b of info.bays) this.bays.push(b);
    }
  }

  build() {
    if (this.built) return;
    this.built = true;
    const ctx = this.ctx, lite = ctx.quality.name === 'mobile';
    const hull = makeHullMaterial(this.style, { lite });
    this.hull = hull; this.mats.push(hull);
    const lightsMat = makeLightsMaterial();
    this.mats.push(lightsMat);
    const addKit = (kit, parent, name) => {
      const g = kit.merge('hull');
      if (g) {
        const mesh = new THREE.Mesh(g, hull);
        mesh.name = name; mesh.castShadow = true; mesh.receiveShadow = true;
        parent.add(mesh);
      }
      const lg = lightsGeometry(kit.lights);
      if (lg) { const lm = new THREE.Mesh(lg, lightsMat); lm.name = name + ':luzes'; lm.renderOrder = 5; lm.frustumCulled = false; parent.add(lm); }
    };
    if (this.arch === 'meridiana') {
      const { kits } = buildMeridiana(this.st.seed || 4711, { lite });
      addKit(kits.main, this.group, 'espinha');
      this.ring = new THREE.Group(); this.ring.name = 'anel';
      this.group.add(this.ring);
      addKit(kits.ring, this.ring, 'anel');
      this.ringSpeed = TAU_PER(118); // uma volta a cada ~2 min (gravidade ~0,15 g no anel)
      this.hubGroup = new THREE.Group(); this.hubGroup.name = 'disco';
      this.group.add(this.hubGroup);
      addKit(kits.hub, this.hubGroup, 'disco');
      // cavidade simples do hangar 0 (vista de longe)
      const kc = new (kits.hub.constructor)(91);
      bayCavity(kc, 'hull', bayBasis(0), MERIDIANA.bay, MERIDIANA.floorY, MERIDIANA.hubR);
      this.bay0Cavity = new THREE.Group(); this.bay0Cavity.name = 'hangar0-simples';
      this.group.add(this.bay0Cavity);
      addKit(kc, this.bay0Cavity, 'hangar0');
    } else {
      const spec = { platform: buildPlatform, rebel: buildRebel, military: buildMilitary, generic: buildGeneric }[this.arch];
      const out = spec.build(this.st, { lite });
      addKit(out.kit, this.group, this.arch);
      if (out.ring) { this.ring = new THREE.Group(); this.group.add(this.ring); addKit(out.ring, this.ring, 'anel'); this.ringSpeed = TAU_PER(out.ringPeriod || 90); }
      if (out.extra) for (const o of out.extra) this.group.add(o);
      this.animate = out.animate || null;
    }
    // campos de contenção das bocas (véu azul)
    const fm = makeFieldMaterial(this.style === 'hegemonia' ? [0.9, 0.75, 0.4] : this.style === 'frente' ? [1.0, 0.5, 0.25] : [0.25, 0.75, 1.0]);
    this.mats.push(fm);
    for (const b of this.bays) {
      if (b.kind !== 'hangar') continue;
      const g = new THREE.PlaneGeometry(b.w, b.h, 1, 1);
      // UV em metros para o padrão do campo
      const uvA = g.attributes.uv;
      for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * b.w, uvA.getY(i) * b.h);
      const m = new THREE.Mesh(g, fm);
      const side = V3().crossVectors(b.up, b.out).normalize();
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, b.up, b.out));
      const mouthC = b.mouthPos ? b.mouthPos.clone() : b.pad.clone().addScaledVector(b.out, b.d / 2 - 4);
      m.position.copy(mouthC).addScaledVector(b.up, b.h / 2 - (b.mouthPos ? 0 : 0));
      if (!b.mouthPos) m.position.copy(b.pad).addScaledVector(b.out, b.d / 2 - 3).addScaledVector(b.up, b.h / 2);
      m.renderOrder = 7;
      this.group.add(m);
      this.fields.push(m);
    }
  }

  /** Mundo ← local da estação. */
  toWorld(local, out = new THREE.Vector3()) { return out.copy(local).applyQuaternion(this.frame.quat).add(this.frame.pos); }
  toLocal(world, out = new THREE.Vector3()) { return out.copy(world).sub(this.frame.pos).applyQuaternion(_q.copy(this.frame.quat).invert()); }
  dirToWorld(d, out = new THREE.Vector3()) { return out.copy(d).applyQuaternion(this.frame.quat); }

  frameUpdate(dt, ctx) {
    const d = ctx.player.camWorld.distanceTo(this.frame.pos);
    const near = d < 420e3;
    if (near && !this.built) this.build();
    if (!this.built) return;
    if (near !== this.visible) { this.visible = near; this.group.visible = near; }
    if (!near) return;
    if (this.ring) {
      this.ringAngle = (ctx.time.world * this.ringSpeed) % (Math.PI * 2);
      this.ring.rotation.y = this.ringAngle;
    }
    this.animate?.(ctx.time.world, this);
  }

  dispose() {
    this.entry.remove();
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
  }
}

function TAU_PER(period) { return (Math.PI * 2) / period; }
void ZONE; void _v;
