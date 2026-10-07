// Tempestades de íons: nuvens de plasma de dezenas de km, raymarch
// volumétrico (emissão + absorção) com filamentos, núcleo mais denso e
// RELÂMPAGOS — descargas que acendem regiões da nuvem por frações de
// segundo, com arcos finos visíveis. Funciona de fora e de dentro (esfera
// desenhada pelo lado de trás). intensityAt(pos) alimenta interferência de
// HUD/radar/escudos nos outros sistemas.
//
// Posições: POIs `ion_storm` do Universe + tempestades próprias do espaço
// profundo (determinísticas por sistema; nebulosas têm mais).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, min, abs, dot, sqrt, fract, floor,
  positionWorld, Loop, If, Break, int,
} from 'three/tsl';
import { Rng, mix as mixSeed } from '../../core/Rng.js';
import { n3, hash13 } from './tsl.js';

const STEPS = { ultra: 40, high: 28, medium: 18, mobile: 12 };
const _v = new THREE.Vector3();

export class IonStorms {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.items = [];
    this.steps = STEPS[ctx.quality.name] || STEPS.high;
  }

  setSystem(sys) {
    for (const it of this.items) { it.entry.remove(); it.mesh.geometry.dispose(); it.mesh.material.dispose(); }
    this.items = []; this.list = [];
    const r = new Rng(mixSeed(sys.seed, 0x1057));
    for (const p of sys.pois || []) if (p.kind === 'ion_storm') this.list.push({ id: p.id, pos: p.pos.clone(), radius: r.range(45e3, 90e3), seed: p.seed });
    // tempestades próprias: mais comuns em sistemas com nebulosa
    const n = (sys.nebula ? 2 : r.chance(0.5) ? 1 : 0);
    const planets = sys.bodies.filter((b) => !b.parent);
    for (let i = 0; i < n && planets.length; i++) {
      const b = r.pick(planets);
      const dir = new THREE.Vector3(r.range(-1, 1), r.range(-0.2, 0.2), r.range(-1, 1)).normalize();
      this.list.push({ id: `${sys.id}:ion${i}`, pos: b.pos.clone().addScaledVector(dir, b.radius * r.range(9, 16)), radius: r.range(50e3, 95e3), seed: r.int(1, 9999) });
    }
    for (const s of this.list) this.items.push(this.make(s));
  }

  make(s) {
    const ctx = this.ctx;
    const u = {
      camRel: uniform(new THREE.Vector3()), // câmera relativa ao centro, em raios
      time: uniform(0),
      bolt: uniform(0),
      boltPos: uniform(new THREE.Vector3()),
      seed: uniform(new THREE.Vector3((s.seed % 97) * 0.31, (s.seed % 13) * 0.7, 1.3)),
      sun: uniform(new THREE.Vector3(1, 0, 0)),
    };
    const N = this.steps;
    const node = Fn(() => {
      const rd = normalize(positionWorld).toVar();
      const ro = u.camRel;
      // interseção com a esfera unitária
      const b = dot(ro, rd), c = dot(ro, ro).sub(1.0);
      const disc = b.mul(b).sub(c);
      const t0 = max(b.negate().sub(sqrt(max(disc, 0.0))), 0.0);
      const t1 = b.negate().add(sqrt(max(disc, 0.0)));
      const len = max(t1.sub(t0), 0.0);
      const dt = len.div(N);
      const jit = hash13(rd.mul(613.0).add(u.time.mul(0.0)));
      const col = vec3(0).toVar();
      const T = float(1).toVar();
      const tt = u.time;
      Loop({ start: int(0), end: int(N), type: 'int', condition: '<' }, ({ i }) => {
        const t = t0.add(float(i).add(jit).mul(dt));
        const p = ro.add(rd.mul(t)).toVar();
        const r = length(p);
        const warp = n3(p.mul(0.6).add(u.seed).add(vec3(0, tt.mul(0.004), 0))).rgb.sub(0.5);
        const q = p.mul(1.5).add(warp.mul(1.1)).add(u.seed);
        const base = n3(q).r.mul(0.65).add(n3(q.mul(2.6).add(vec3(tt.mul(0.01), 0, 0))).g.mul(0.35));
        // contorno irregular, achatado (bigorna)
        const rr = length(p.mul(vec3(1.0, 1.7, 1.0))).add(warp.x.mul(0.55));
        const shape = smoothstep(0.95, 0.3, rr);
        const dens = shape.mul(smoothstep(0.5, 0.78, base)).toVar();
        // filamentos de plasma (ridged), pulsando
        const fil = pow(n3(q.mul(3.3).add(vec3(0, 0, tt.mul(0.03)))).a, 5.0).mul(smoothstep(1.0, 0.4, rr)).mul(float(0.5).add(abs(fract(tt.mul(0.37).add(base)).sub(0.5))));
        // relâmpago: ilumina em volta do ponto da descarga
        const bd = length(p.sub(u.boltPos));
        const flash = exp(bd.mul(bd).mul(-9.0)).mul(u.bolt);
        const arc = smoothstep(0.93, 0.985, n3(q.mul(4.5).add(u.boltPos.mul(7.0))).a).mul(exp(bd.mul(-5.0))).mul(u.bolt).mul(14.0);
        const glow = vec3(0.04, 0.09, 0.3).mul(dens.mul(0.6)).add(vec3(0.25, 0.55, 1.4).mul(fil.mul(2.2)));
        const lit = vec3(0.6, 0.75, 1.5).mul(flash.mul(dens).mul(5.0)).add(vec3(0.85, 0.92, 1.8).mul(arc));
        const sunlit = vec3(0.35, 0.36, 0.45).mul(dens.mul(0.05));
        col.addAssign(glow.add(lit).add(sunlit).mul(T).mul(dt).mul(4.0));
        T.mulAssign(exp(dens.mul(dt).mul(-9.0)));
        If(T.lessThan(0.02), () => { Break(); });
      });
      return vec4(col, float(1).sub(T));
    });
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.NormalBlending, premultipliedAlpha: true });
    mat.colorNode = node();
    mat.fog = false;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat);
    mesh.scale.setScalar(s.radius);
    mesh.frustumCulled = false;
    mesh.renderOrder = 20;
    mesh.name = 'tempestade-ions';
    const entry = ctx.world.add(mesh, s.pos);
    return { s, u, mesh, entry, nextBolt: 0.5, boltT: 0 };
  }

  intensityAt(p) {
    let best = 0;
    for (const s of this.list) { const d = p.distanceTo(s.pos) / s.radius; if (d < 1.3) best = Math.max(best, Math.min(1, (1.3 - d) / 0.9)); }
    return best;
  }

  frame(dt, ctx) {
    const cam = ctx.player.camWorld;
    for (const it of this.items) {
      const { s, u } = it;
      const d = cam.distanceTo(s.pos);
      it.mesh.visible = d < s.radius * 60;
      if (!it.mesh.visible) continue;
      u.camRel.value.copy(cam).sub(s.pos).divideScalar(s.radius);
      u.time.value = ctx.time.world;
      // relâmpagos: descargas aleatórias com decaimento rápido e repique
      it.boltT -= dt;
      if (it.boltT <= 0 && (it.nextBolt -= dt) <= 0) {
        it.boltT = 0.18 + Math.random() * 0.25;
        it.nextBolt = 0.4 + Math.random() * 2.2;
        _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.1);
        u.boltPos.value.copy(_v);
        // a câmera dentro da tempestade sente o clarão
        if (d < s.radius) ctx.bus.emit('flash', { color: '#9fb8ff', intensity: 0.15 });
      }
      const flick = it.boltT > 0 ? (0.6 + 0.4 * Math.sin(it.boltT * 90)) * Math.min(1, it.boltT * 8) : 0;
      u.bolt.value = flick;
    }
  }
}
