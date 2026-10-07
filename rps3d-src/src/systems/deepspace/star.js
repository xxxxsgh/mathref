// Estrela do sistema: superfície animada (granulação convectiva, supergranulos,
// manchas com penumbra, fáculas no limbo, escurecimento de limbo) em HDR para
// o bloom/lens flare + coroa (billboard aditivo com serpentinas radiais
// animadas, proeminências em arco no limbo e halo de espalhamento).
//
// Tipos: anã vermelha (manchas grandes, coroa curta, flares), amarela, branca,
// gigante azul (coroa enorme, granulação fina), binária (companheira + ponte
// de matéria). O buraco negro fica em blackhole.js.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, abs, dot,
  positionLocal, positionWorld, cameraPosition, normalWorld, uv, atan, cos, sin, fract,
} from 'three/tsl';
import { n3 } from './tsl.js';

const LOOK = {
  red_dwarf: { gain: 3.2, gran: 26, spots: 0.62, coronaSize: 5, streamers: 0.6, prom: 1.4, tint: [1.0, 0.36, 0.16] },
  yellow: { gain: 4, gran: 34, spots: 0.78, coronaSize: 7, streamers: 1.0, prom: 1.0, tint: [1.0, 0.82, 0.6] },
  white: { gain: 4.6, gran: 40, spots: 0.86, coronaSize: 8, streamers: 1.1, prom: 0.7, tint: [0.92, 0.95, 1.0] },
  blue_giant: { gain: 5.5, gran: 52, spots: 0.95, coronaSize: 10, streamers: 1.4, prom: 0.5, tint: [0.62, 0.74, 1.0] },
  binary: { gain: 4, gran: 34, spots: 0.75, coronaSize: 7, streamers: 1.0, prom: 1.0, tint: [1.0, 0.8, 0.6] },
};

const _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _z = new THREE.Vector3();

export class Star {
  /**
   * @param ctx
   * @param o { type, color:[r,g,b], radius, getPos(out) }
   */
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    const L = LOOK[o.type] || LOOK.yellow;
    this.look = L;
    const col = new THREE.Color(o.color[0], o.color[1], o.color[2]);
    const u = this.u = {
      color: uniform(col),
      gain: uniform(L.gain),
      time: uniform(0),
      gran: uniform(L.gran),
      spots: uniform(L.spots),
      seed: uniform(new THREE.Vector3(((o.seed || 1) % 97) * 0.37, ((o.seed || 1) % 13) * 1.7, 7.7)),
      streamers: uniform(L.streamers),
      prom: uniform(L.prom),
      coronaSize: uniform(L.coronaSize),
      fade: uniform(1),
    };
    this.group = new THREE.Group();
    this.group.name = 'estrela';

    // ── superfície ─────────────────────────────────────────────────────
    const surf = new THREE.MeshBasicNodeMaterial();
    surf.colorNode = Fn(() => {
      const n = normalize(positionLocal).toVar();
      const V = normalize(cameraPosition.sub(positionWorld));
      const mu = clamp(dot(normalWorld, V), 0, 1).toVar();
      const t = u.time;
      // supergranulação (células grandes) + granulação (fina, borbulhando)
      const p = n.add(u.seed);
      const cells = n3(p.mul(u.gran.mul(0.25)).add(vec3(0, 0, t.mul(0.004)))).b;
      const gran = n3(p.mul(u.gran).add(vec3(t.mul(0.011), 0, t.mul(-0.007)))).b.toVar();
      const gran2 = n3(p.mul(u.gran.mul(2.3)).add(vec3(0, t.mul(0.017), 0))).g;
      const conv = gran.mul(0.55).add(gran2.mul(0.25)).add(cells.mul(0.35)).toVar();
      // manchas: núcleo escuro (umbra) + penumbra com filamentos
      const sp = n3(p.mul(2.2).add(vec3(t.mul(0.0006), 0, 0))).r.mul(0.7).add(n3(p.mul(5.1)).g.mul(0.3)).toVar();
      const umbra = smoothstep(u.spots.add(0.035), u.spots.add(0.07), sp);
      const pen = smoothstep(u.spots, u.spots.add(0.04), sp);
      // fáculas: regiões brilhantes perto das manchas, visíveis no limbo
      const fac = smoothstep(u.spots.sub(0.08), u.spots, sp).mul(float(1).sub(pen)).mul(float(1).sub(mu)).mul(1.6);
      // escurecimento de limbo (lei quadrática) — o limbo fica mais vermelho
      const limb = float(1).sub(float(0.58).mul(float(1).sub(mu))).sub(float(0.22).mul(pow(float(1).sub(mu), 2.0))).toVar();
      const limbTint = mix(vec3(1.0, 0.55, 0.32), vec3(1), smoothstep(0.0, 0.55, mu));
      const base = u.color.mul(limbTint).mul(limb).mul(conv.mul(0.55).add(0.68)).toVar();
      base.mulAssign(float(1).sub(pen.mul(0.45)).sub(umbra.mul(0.45)));
      base.addAssign(u.color.mul(fac).mul(0.5));
      return vec4(base.mul(u.gain).mul(u.fade), 1);
    })();
    surf.fog = false;
    const segs = ctx.quality.name === 'mobile' ? 48 : 96;
    this.surface = new THREE.Mesh(new THREE.SphereGeometry(1, segs, segs / 2), surf);
    this.surface.name = 'estrela-superficie';
    this.surface.frustumCulled = false;
    this.group.add(this.surface);

    // ── coroa (billboard voltado à câmera) ──────────────────────────────
    const cor = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    cor.colorNode = Fn(() => {
      const q = uv().mul(2).sub(1).mul(u.coronaSize).toVar(); // em raios estelares
      const r = length(q).toVar();
      const a = atan(q.y, q.x);
      const dir = vec3(cos(a), sin(a), 0);
      const t = u.time;
      // serpentinas: ruído angular esticado radialmente, girando devagar
      const s1 = n3(dir.mul(2.2).add(vec3(0, 0, r.mul(0.05).sub(t.mul(0.004)))).add(u.seed)).r;
      const s2 = n3(dir.mul(5.5).add(vec3(0, 0, r.mul(0.12).sub(t.mul(0.007)))).add(u.seed.yzx)).a;
      const stream = pow(s1.mul(0.7).add(s2.mul(0.45)), 2.5).mul(u.streamers).mul(2.4).add(0.35);
      const rr = max(r.sub(0.985), 0.0005);
      const inner = exp(rr.mul(-9.0)).mul(1.4);                 // cromosfera/coroa interna
      const mid = exp(rr.mul(-2.2)).mul(stream).mul(0.55);       // coroa com serpentinas
      const outer = pow(r.max(1), -2.2).mul(0.22);               // halo largo (espalhamento)
      // proeminências: arcos brilhantes logo acima do limbo
      const pa = n3(dir.mul(3.0).add(vec3(r.mul(1.6), t.mul(0.01), 0)).add(u.seed.zxy)).a;
      const promBand = smoothstep(0.98, 1.02, r).mul(smoothstep(1.32, 1.04, r));
      const prom = smoothstep(0.72, 0.92, pa).mul(promBand).mul(u.prom).mul(2.2);
      const hot = mix(u.color, vec3(1), 0.35);
      const c = hot.mul(inner.add(mid).add(outer)).add(vec3(1.0, 0.28, 0.18).mul(prom)).toVar();
      // borda do quad: some suave
      const edge = smoothstep(u.coronaSize, u.coronaSize.mul(0.7), r);
      return vec4(c.mul(edge).mul(u.gain.mul(0.4)).mul(u.fade), 1);
    })();
    cor.fog = false;
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cor);
    this.corona.name = 'estrela-coroa';
    this.corona.frustumCulled = false;
    this.corona.renderOrder = 5;
    this.corona.matrixAutoUpdate = false;
    // a coroa vive fora do grupo (orientação própria), mas no mesmo lugar
    this.coronaHolder = new THREE.Group();
    this.coronaHolder.add(this.corona);

    this.entry = ctx.world.add(this.group, null, { getPos: (out) => o.getPos(out) });
    this.entry2 = ctx.world.add(this.coronaHolder, null, { getPos: (out) => o.getPos(out) });
    this.setRadius(o.radius);
  }

  setRadius(r) {
    this.radius = r;
    this.surface.scale.setScalar(r);
  }

  frame(ctx, t) {
    this.u.time.value = t;
    // orientação da coroa: plano perpendicular à linha de visada
    const p = this.o.getPos(_z).sub(ctx.player.camWorld); // relativo à câmera
    _m.lookAt(new THREE.Vector3(), p, Math.abs(p.clone().normalize().y) > 0.99 ? new THREE.Vector3(1, 0, 0) : _up);
    const s = this.radius * this.look.coronaSize;
    const q = new THREE.Quaternion().setFromRotationMatrix(_m);
    this.corona.matrix.compose(new THREE.Vector3(), q, new THREE.Vector3(s, s, s));
    this.corona.matrixWorldNeedsUpdate = true;
    this.surface.rotation.y = t * 0.002;
  }

  setVisible(v) { this.group.visible = v; this.coronaHolder.visible = v; }

  dispose() {
    this.entry.remove(); this.entry2.remove();
    this.surface.geometry.dispose(); this.surface.material.dispose();
    this.corona.geometry.dispose(); this.corona.material.dispose();
  }
}
