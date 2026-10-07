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
  positionWorld, Loop, If, Break, int, uv,
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
        // contorno irregular, achatado (bigorna), com lóbulos erodidos
        const lobes = n3(p.mul(0.9).add(u.seed.zxy)).r;
        const rr = length(p.mul(vec3(1.0, 1.8, 1.0))).add(warp.x.mul(0.6)).add(lobes.sub(0.5).mul(0.7));
        const shape = smoothstep(0.92, 0.25, rr);
        const dens = shape.mul(smoothstep(0.42, 0.68, base)).toVar();
        // filamentos de plasma (ridged), finos e pulsando
        const fr = n3(q.mul(3.3).add(vec3(0, 0, tt.mul(0.03)))).a;
        const fil = smoothstep(0.9, 0.985, fr).mul(smoothstep(1.0, 0.35, rr)).mul(float(0.45).add(abs(fract(tt.mul(0.37).add(base)).sub(0.5))));
        // relâmpago: ilumina em volta do ponto da descarga
        const bd = length(p.sub(u.boltPos));
        const flash = exp(bd.mul(bd).mul(-6.0)).mul(u.bolt);
        const arc = smoothstep(0.975, 0.997, n3(q.mul(4.5).add(u.boltPos.mul(7.0))).a).mul(exp(bd.mul(-6.0))).mul(u.bolt).mul(2.2);
        // cor: núcleo índigo profundo, filamentos ciano → violeta
        const hue = smoothstep(0.35, 0.75, n3(q.mul(0.7).add(2.2)).g);
        const filCol = mix(vec3(0.15, 0.75, 1.6), vec3(0.9, 0.35, 1.7), hue);
        // veias de plasma concentradas na casca externa (o miolo é poeira escura)
        const shell = smoothstep(0.2, 0.7, rr).mul(smoothstep(1.0, 0.8, rr)).add(0.15);
        const glow = mix(vec3(0.004, 0.008, 0.025), vec3(0.02, 0.006, 0.03), hue).mul(dens).add(filCol.mul(fil.mul(shell).mul(0.2)));
        const lit = vec3(0.35, 0.5, 1.4).mul(flash.mul(dens).mul(1.6)).add(vec3(0.85, 0.92, 1.8).mul(arc));
        // espalhamento da luz do sol na poeira: borda prateada do lado iluminado
        const sunF = smoothstep(-0.2, 0.9, dot(normalize(p), u.sun));
        const sunlit = vec3(0.42, 0.45, 0.62).mul(dens.mul(0.07).mul(sunF));
        col.addAssign(glow.add(lit).add(sunlit).mul(T).mul(dt).mul(4.0));
        T.mulAssign(exp(dens.mul(dt).mul(-30.0)));
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
    const bolt = new Bolt(new Rng(mixSeed(s.seed, 0xb017)));
    mesh.add(bolt.mesh);
    return { s, u, mesh, entry, bolt, nextBolt: 0.5, boltT: 0 };
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
      it.mesh.visible = d < s.radius * 60 && ctx.params.get('ion') !== '0';
      if (!it.mesh.visible) continue;
      u.camRel.value.copy(cam).sub(s.pos).divideScalar(s.radius);
      u.time.value = ctx.time.world;
      ctx.universe.system?.sunDir(s.pos, u.sun.value);
      // relâmpagos: descargas aleatórias com decaimento rápido e repique
      it.boltT -= dt;
      if (it.boltT <= 0 && (it.nextBolt -= dt) <= 0) {
        it.boltT = 0.18 + Math.random() * 0.25;
        it.nextBolt = 0.4 + Math.random() * 2.2;
        _v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.1);
        u.boltPos.value.copy(_v);
        it.bolt.strike(_v);
        // a câmera dentro da tempestade sente o clarão
        if (d < s.radius) ctx.bus.emit('flash', { color: '#9fb8ff', intensity: 0.15 });
      }
      if (this.forceBolt) {
        if (!it.forced) { it.forced = true; u.boltPos.value.set(0.15, 0.05, 0.2); it.bolt.strike(u.boltPos.value); }
        u.bolt.value = 1; it.bolt.u.i.value = 1; continue;
      }
      const flick = it.boltT > 0 ? (0.6 + 0.4 * Math.sin(it.boltT * 90)) * Math.min(1, it.boltT * 8) : 0;
      u.bolt.value = flick;
      it.bolt.u.i.value = flick;
    }
  }
}

/**
 * Raio visível: canal principal irregular (deslocamento de ponto médio) com
 * ramificações, desenhado como fitas cruzadas aditivas em HDR (o bloom faz o
 * halo). Coordenadas em raios da tempestade (filho da esfera).
 */
class Bolt {
  constructor(rng) {
    this.r = rng;
    this.maxSeg = 96;
    const nv = this.maxSeg * 8, ni = this.maxSeg * 12;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(nv * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.uvA = new THREE.BufferAttribute(new Float32Array(nv * 2), 2).setUsage(THREE.DynamicDrawUsage);
    const idx = new Uint16Array(ni);
    for (let k = 0; k < this.maxSeg * 2; k++) {
      const v = k * 4, o = k * 6;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], o);
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setAttribute('position', this.pos);
    g.setAttribute('uv', this.uvA);
    g.setDrawRange(0, 0);
    this.geo = g;
    const u = this.u = { i: uniform(0) };
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.colorNode = Fn(() => {
      const t = uv();
      const x = abs(t.y.sub(0.5)).mul(2.0);
      const core = exp(x.mul(x).mul(-40.0)).mul(6.0);
      const halo = exp(x.mul(-4.0)).mul(0.5);
      // t.x = intensidade do ramo (o canal principal é mais forte)
      return vec4(mix(vec3(0.45, 0.6, 1.6), vec3(1.1, 1.15, 1.6), x.oneMinus()).mul(core.add(halo)).mul(t.x).mul(u.i), 1);
    })();
    m.fog = false;
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.mesh.name = 'raio-ions';
  }

  /** Gera um novo raio passando perto de `c` (coordenadas da tempestade). */
  strike(c) {
    const r = this.r;
    const pts = [];
    const a = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize().multiplyScalar(r.range(0.35, 0.6)).add(c);
    const b = new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).normalize().multiplyScalar(r.range(0.45, 0.75)).add(c);
    const path = (p0, p1, depth, rough) => {
      let line = [p0.clone(), p1.clone()];
      for (let d = 0; d < depth; d++) {
        const nl = [line[0]];
        for (let i = 1; i < line.length; i++) {
          const A = line[i - 1], B = line[i];
          const len = A.distanceTo(B);
          const m = A.clone().lerp(B, 0.5).add(new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).multiplyScalar(len * rough));
          nl.push(m, B);
        }
        line = nl;
      }
      return line;
    };
    const main = path(a, b, 5, 0.32);
    pts.push({ line: main, w: 0.01, k: 1 });
    const nb = 2 + Math.floor(r.next() * 3);
    for (let i = 0; i < nb; i++) {
      const j = 3 + Math.floor(r.next() * (main.length - 6));
      const s0 = main[j];
      const dir = main[j + 1].clone().sub(main[j - 1]).normalize().add(new THREE.Vector3(r.range(-1, 1), r.range(-1, 1), r.range(-1, 1)).multiplyScalar(0.9)).normalize();
      const e = s0.clone().addScaledVector(dir, r.range(0.12, 0.3));
      pts.push({ line: path(s0, e, 3, 0.4), w: 0.006, k: 0.55 });
    }
    // fitas cruzadas (dois planos por segmento)
    const P = this.pos.array, UV = this.uvA.array;
    let q = 0;
    const side = new THREE.Vector3(), up = new THREE.Vector3(), t = new THREE.Vector3();
    for (const br of pts) {
      for (let i = 1; i < br.line.length && q < this.maxSeg * 2 - 2; i++) {
        const A = br.line[i - 1], B = br.line[i];
        t.copy(B).sub(A).normalize();
        side.set(Math.abs(t.y) < 0.9 ? 0 : 1, Math.abs(t.y) < 0.9 ? 1 : 0, 0).cross(t).normalize();
        up.crossVectors(t, side);
        const taper = 1 - (i / br.line.length) * 0.6;
        for (const ax of [side, up]) {
          const w = br.w * taper * 3.0; // largura da fita inclui o halo
          const v = q * 4;
          const set = (k, p, sgn, vv) => { P[(v + k) * 3] = p.x + ax.x * w * sgn; P[(v + k) * 3 + 1] = p.y + ax.y * w * sgn; P[(v + k) * 3 + 2] = p.z + ax.z * w * sgn; UV[(v + k) * 2] = br.k * taper; UV[(v + k) * 2 + 1] = vv; };
          set(0, A, -1, 0); set(1, A, 1, 1); set(2, B, -1, 0); set(3, B, 1, 1);
          q++;
        }
      }
    }
    this.pos.needsUpdate = true; this.uvA.needsUpdate = true;
    this.geo.setDrawRange(0, q * 6);
  }
}
