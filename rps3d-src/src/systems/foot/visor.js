// Visor do capacete como gancho de pós-processamento HDR do `rendering`
// (amostra a cena para REFRATAR): gotas de chuva paradas e escorrendo (com
// rastro), flocos de neve grudados derretendo, geada que cresce das bordas e
// embaça (frio), condensação da respiração, cinza e poeira, película ácida,
// rachaduras com dano, borda do casco e reflexo leve do vidro.
// Sem o `rendering`, o visor simplesmente não aparece (o jogo segue).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec2, vec3, float, floor, fract, sin, cos, mix, smoothstep, length, dot, max, min, abs, clamp, pow, exp, If, normalize, atan,
} from 'three/tsl';
import { hash12, hash22, vnoise2, fbm2, voronoi2 } from './tsl.js';

export class Visor {
  constructor(ctx) {
    this.ctx = ctx;
    this.U = {
      on: uniform(0), t: uniform(0),
      rain: uniform(0), snow: uniform(0), ash: uniform(0), dust: uniform(0), acid: uniform(0),
      frost: uniform(0), fog: uniform(0), crack: uniform(0), breath: uniform(0), wipe: uniform(0),
      down: uniform(new THREE.Vector2(0, 1)), // direção da gravidade na tela (uv, y para baixo)
      frame: uniform(1), tint: uniform(new THREE.Color(1, 1, 1)), hurt: uniform(0),
      wet: uniform(0), // gotas acumuladas (fica após a chuva e seca)
    };
    this.state = { rain: 0, snow: 0, ash: 0, dust: 0, acid: 0, frost: 0, fog: 0, wet: 0, snowAcc: 0 };
    this.installed = false;
    this.breathT = 0;
  }

  install() {
    const R = this.ctx.services.rendering;
    if (!R?.addPostEffect || this.installed) return;
    const U = this.U;
    R.addPostEffect('foot-visor', ({ color, uv, U: PU, scene }) => this.node(color, uv, PU, scene, U), { stage: 'hdr', order: 50 });
    this.installed = true;
  }
  uninstall() { if (!this.installed) return; this.ctx.services.rendering?.removePostEffect?.('foot-visor'); this.installed = false; }

  /** Grafo TSL do visor. */
  node(color, uvN, PU, scene, U) {
    const out = vec3(color).toVar();
    If(U.on.greaterThan(0.001), () => {
      const asp = PU?.aspect || float(16 / 9);
      // espaço do visor: x proporcional, y para "baixo" da gravidade
      const c = uvN.sub(0.5).mul(vec2(asp, 1));
      const dn = normalize(U.down);
      const side = vec2(dn.y.negate(), dn.x);
      const q = vec2(dot(c, side), dot(c, dn)); // q.y cresce para baixo
      const t = U.t;
      const ofs = vec2(0, 0).toVar();     // refração acumulada (uv)
      const add = vec3(0, 0, 0).toVar();  // luz adicionada (reflexos)
      const mulc = vec3(1, 1, 1).toVar(); // atenuação
      const blur = float(0).toVar();      // embaçamento

      // ── gotas de chuva ────────────────────────────────────────────────
      const rainK = max(U.rain, U.wet);
      If(rainK.greaterThan(0.01), () => {
        // camada de gotas paradas (duas escalas)
        for (const [S, seed, rate] of [[11.0, 1.7, 0.35], [23.0, 5.3, 0.6]]) {
          const p = q.mul(S).add(vec2(seed, seed * 2.1));
          const cell = floor(p);
          const f = fract(p).sub(0.5);
          const h = hash22(cell);
          const ph = fract(t.mul(rate * 0.25).add(h.x.mul(7.0)));
          const life = smoothstep(0.0, 0.05, ph).mul(smoothstep(1.0, 0.6, ph));
          const present = smoothstep(1.0 - 0.7, 1.0, h.y.add(rainK.mul(0.75)).sub(0.25)).mul(life);
          const ctr = h.sub(0.5).mul(0.55);
          const d = f.sub(ctr);
          const r = hash12(cell.add(9.1)).mul(0.14).add(0.08);
          const dl = length(d.mul(vec2(1.0, 0.85)));
          const m = smoothstep(r, r.mul(0.55), dl).mul(present);
          // lente: inverte e amplia o que está atrás
          ofs.addAssign(d.div(r).mul(m).mul(-0.012 * (S < 15 ? 1.6 : 0.9)));
          // borda escura + brilho especular no topo
          const rim = smoothstep(r.mul(0.55), r, dl).mul(smoothstep(r.mul(1.05), r.mul(0.85), dl)).mul(present);
          mulc.mulAssign(float(1).sub(rim.mul(0.35)));
          const spec = smoothstep(r.mul(0.35), 0.0, length(d.sub(vec2(r.mul(-0.25), r.mul(-0.35))))).mul(present);
          add.addAssign(vec3(spec.mul(0.6)));
        }
        // gotas escorrendo (colunas) com rastro
        const S2 = 6.0;
        const colX = q.x.mul(S2);
        const col = floor(colX);
        const fx = fract(colX).sub(0.5);
        const hc = hash12(vec2(col, 3.3));
        const speed = hc.mul(0.35).add(0.12);
        const yy = q.y.add(0.6).mul(1.4).sub(t.mul(speed)).add(hc.mul(11.0));
        const seg = floor(yy);
        const fy = fract(yy);
        const hs = hash12(vec2(col, seg));
        const active = smoothstep(0.55, 0.85, hs.add(rainK.mul(0.5)).sub(0.2)).mul(U.rain.mul(1.2).min(1));
        const wob = sin(q.y.mul(26.0).add(hc.mul(9.0))).mul(0.025);
        const dx = fx.sub(hs.sub(0.5).mul(0.5)).sub(wob);
        const head = smoothstep(0.1, 0.05, length(vec2(dx, fy.sub(0.85).mul(0.5)))).mul(active);
        const trail = smoothstep(0.035, 0.0, abs(dx)).mul(smoothstep(0.85, 0.3, fy)).mul(smoothstep(0.0, 0.3, fy)).mul(active).mul(0.6);
        const beads = smoothstep(0.03, 0.0, length(vec2(dx, fract(fy.mul(6.0)).sub(0.5).mul(0.18)))).mul(trail);
        ofs.addAssign(vec2(dx.mul(-0.06), -0.02).mul(head.add(beads.mul(0.6))));
        ofs.addAssign(vec2(dx.mul(-0.05), 0.004).mul(trail));
        add.addAssign(vec3(head.mul(0.06).add(beads.mul(0.03))));
        mulc.mulAssign(float(1).sub(trail.mul(0.12)).sub(head.mul(0.15)));
      });

      // ── neve grudada: flocos de 6 pontas espalhados, parte derretendo em gotas ──
      If(U.snow.greaterThan(0.01), () => {
        for (const [S, seed] of [[9.0, 2.1], [17.0, 7.7]]) {
          const p = q.mul(S).add(vec2(seed, seed * 1.3));
          const cell = floor(p);
          const h = hash22(cell);
          const on = smoothstep(1.0 - 0.001, 1.0, h.x.add(U.snow.mul(S < 10 ? 0.35 : 0.5)));
          const f = fract(p).sub(0.5).sub(h.sub(0.5).mul(0.5));
          const r = length(f);
          const ang = atan2v(f);
          const size = hash12(cell.add(5.5)).mul(0.12).add(0.08);
          const arms = abs(cos(ang.mul(3.0).add(h.y.mul(6.0))));
          const star = smoothstep(size.mul(arms.mul(0.65).add(0.35)), size.mul(arms.mul(0.65).add(0.35)).mul(0.6), r);
          const core = smoothstep(size.mul(0.35), 0.0, r);
          const melt = fract(t.mul(0.04).add(h.y.mul(9.0)));
          const wetK = smoothstep(0.55, 0.9, melt);
          const flake = max(star.mul(0.7), core).mul(on);
          const white = flake.mul(float(1).sub(wetK));
          const drop = smoothstep(size.mul(0.9), size.mul(0.5), r).mul(on).mul(wetK);
          add.addAssign(vec3(0.92, 0.95, 1.0).mul(white.mul(0.5)));
          mulc.mulAssign(float(1).sub(white.mul(0.2)));
          blur.addAssign(white.mul(0.5));
          ofs.addAssign(f.div(size).mul(drop).mul(-0.01));
        }
      });

      // ── geada (só nas bordas, plumas de cristal crescendo para dentro) ──
      const edgeR = length(c.mul(vec2(0.82, 1.0)));
      const nf = fbm2(c.mul(5.0)).toVar();
      If(U.frost.greaterThan(0.01), () => {
        const front = float(1.02).sub(U.frost.mul(0.42));
        const fr = smoothstep(front, front.add(0.16), edgeR.add(nf.mul(0.18)));
        // plumas: ruído esticado na direção radial
        const rad = normalize(c.add(1e-4));
        const tang = vec2(rad.y.negate(), rad.x);
        const pr = vec2(dot(c, tang).mul(46.0), dot(c, rad).mul(9.0));
        const feather = smoothstep(0.5, 0.85, vnoise2(pr.add(nf.mul(4.0)))).mul(fr);
        const sparkle = smoothstep(0.985, 1.0, hash12(floor(c.mul(400.0)))).mul(fr);
        blur.addAssign(fr.mul(0.85));
        add.addAssign(vec3(0.62, 0.74, 0.86).mul(fr.mul(0.07).add(feather.mul(0.16)).add(sparkle.mul(0.5))));
        mulc.mulAssign(float(1).sub(fr.mul(0.1)));
      });
      // condensação da respiração (parte de baixo, pulsando)
      If(U.fog.greaterThan(0.01), () => {
        const lower = smoothstep(0.05, 0.5, c.y).mul(smoothstep(0.75, 0.2, abs(c.x)));
        const fogK = lower.mul(U.fog).mul(U.breath.mul(0.6).add(0.4)).mul(nf.mul(0.6).add(0.6)).min(1);
        blur.addAssign(fogK);
        add.addAssign(vec3(0.5, 0.55, 0.6).mul(fogK.mul(0.06)));
      });

      // ── cinza / poeira / ácido ────────────────────────────────────────
      If(U.ash.add(U.dust).add(U.acid).greaterThan(0.01), () => {
        const sp = hash12(floor(q.mul(220.0)));
        const ashSpeck = step01(sp, float(1).sub(U.ash.mul(0.025)));
        const smear = smoothstep(0.6, 0.9, vnoise2(q.mul(vec2(9.0, 2.0)).add(vec2(0, t.mul(0.02))))).mul(U.ash).mul(0.35);
        mulc.mulAssign(float(1).sub(ashSpeck.mul(0.85)).sub(smear.mul(0.4)));
        // poeira: película quente nas bordas + riscos finos
        const film = smoothstep(0.3, 0.95, edgeR.add(nf.mul(0.3))).mul(U.dust);
        const scr = smoothstep(0.92, 1.0, vnoise2(vec2(q.x.mul(3.0).add(q.y.mul(40.0)), q.y.mul(2.0)))).mul(U.dust).mul(0.3);
        add.addAssign(vec3(0.9, 0.6, 0.35).mul(film.mul(0.05).add(scr.mul(0.08))));
        mulc.mulAssign(float(1).sub(film.mul(0.18)));
        blur.addAssign(film.mul(0.35));
        // ácido: manchas esverdeadas escorridas
        const ac = smoothstep(0.65, 0.85, fbm2(q.mul(vec2(7.0, 2.5)).add(vec2(0, t.mul(0.04))))).mul(U.acid);
        mulc.mulAssign(mix(vec3(1), vec3(0.85, 1.0, 0.7), ac));
        ofs.addAssign(vec2(ac.mul(0.004)));
      });

      // ── rachaduras (dano) ─────────────────────────────────────────────
      If(U.crack.greaterThan(0.01), () => {
        const cp = c.sub(vec2(asp.mul(-0.32), -0.3));
        const rr = length(cp);
        const v3 = voronoi2(cp.mul(14.0).div(rr.add(0.2)));
        const lines = smoothstep(0.035, 0.0, v3.x).mul(smoothstep(U.crack.mul(0.5), 0.0, rr.sub(U.crack.mul(0.05))));
        const radial = smoothstep(0.02, 0.0, abs(fract(cp.x.div(cp.y.add(1e-3)).mul(1.3)).sub(0.5)).mul(rr.mul(10.0))).mul(smoothstep(U.crack.mul(0.4), 0.0, rr));
        const cr = max(lines, radial.mul(0.6)).mul(U.crack);
        add.addAssign(vec3(0.7, 0.85, 1.0).mul(cr.mul(0.35)));
        ofs.addAssign(normalize(cp.add(1e-4)).mul(cr.mul(0.01)));
      });

      // ── amostra a cena com refração e embaçamento ─────────────────────
      const suv = uvN.add(ofs.mul(vec2(1, 1)));
      const base = scene ? scene.sample(suv).rgb.toVar() : vec3(color).toVar();
      const b = clamp(blur, 0, 1);
      if (scene) {
        If(b.greaterThan(0.02), () => {
          const o = b.mul(0.012);
          const acc = base.mul(0.2).toVar();
          for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) acc.addAssign(scene.sample(suv.add(vec2(ax, ay).mul(o))).rgb.mul(0.1));
          base.assign(mix(base, acc, b));
        });
      }
      // quanto da imagem refratada substitui a original (só onde há efeito)
      const effK = clamp(length(ofs).mul(200.0).add(b), 0, 1);
      const img = mix(vec3(color), base, scene ? effK : float(0));
      // borda do casco: cantos superiores/inferiores escurecidos com aresta curva,
      // reflexo fino na aresta do vidro e leve tom do policarbonato perto da borda
      const er = length(c.mul(vec2(0.72, 1.18)).add(vec2(0, 0.06)));
      const rim = smoothstep(0.74, 0.98, er).mul(U.frame);
      const rimHi = smoothstep(0.018, 0.0, abs(er.sub(0.8))).mul(U.frame).mul(smoothstep(0.1, -0.4, c.y)).mul(0.07);
      const glassTint = smoothstep(0.5, 0.85, er).mul(U.frame).mul(0.06);
      const res = img.mul(mulc).add(add.mul(U.tint)).toVar();
      res.mulAssign(vec3(1).sub(vec3(0.02, 0.0, -0.01).add(0.0).mul(glassTint.mul(10))));
      res.mulAssign(float(1).sub(rim.mul(0.82)));
      res.addAssign(vec3(0.55, 0.7, 0.85).mul(rimHi));
      out.assign(mix(vec3(color), res, U.on));
    });
    return out;
  }

  /**
   * Atualiza (frame). env = { weather {kind,intensity}, temp, inside, health,
   * frameUpScreen (Vector2), dt, on }
   */
  frame(dt, env) {
    const U = this.U, s = this.state;
    U.t.value += dt;
    U.on.value = env.on ? 1 : 0;
    if (!env.on) return;
    const w = env.weather || { kind: 'clear', intensity: 0 };
    const I = env.inside ? 0 : w.intensity;
    const tgt = (k) => (w.kind === k ? I : 0);
    const approach = (cur, target, up, down) => cur + (target - cur) * (1 - Math.exp(-(target > cur ? up : down) * dt));
    s.rain = approach(s.rain, tgt('rain') + tgt('acid') * 0.6, 1.2, 0.8);
    s.wet = approach(s.wet, Math.max(s.wet * 0.995, s.rain * 0.8), 0.6, 0.05);
    if (env.wipe) s.wet = 0;
    s.snow = approach(s.snow, tgt('blizzard'), 0.25, env.inside ? 0.4 : 0.06);
    s.ash = approach(s.ash, tgt('ash'), 0.2, 0.05);
    s.dust = approach(s.dust, tgt('sandstorm'), 0.4, 0.08);
    s.acid = approach(s.acid, tgt('acid'), 0.3, 0.06);
    const cold = Math.max(0, Math.min(1, (-8 - env.temp) / 60));
    s.frost = approach(s.frost, env.inside ? 0 : cold * 0.9, 0.06, 0.3);
    s.fog = approach(s.fog, env.inside ? 0 : Math.max(cold * 0.8, env.exert ? 0.3 : 0) * 0.8, 0.5, 0.3);
    this.breathT += dt * (env.exert ? 2.4 : 1.3);
    U.breath.value = Math.max(0, Math.sin(this.breathT)) ** 2;
    U.rain.value = s.rain; U.wet.value = s.wet; U.snow.value = s.snow; U.ash.value = s.ash; U.dust.value = s.dust; U.acid.value = s.acid;
    U.frost.value = s.frost; U.fog.value = s.fog;
    U.crack.value = Math.max(0, Math.min(1, (0.45 - (env.health ?? 1)) / 0.4));
    if (env.down) U.down.value.copy(env.down);
    U.frame.value = env.frame ?? 1;
  }
  /** Força valores (screenshots). */
  force(o) { Object.assign(this.state, o); }
}

// passo suave (0/1) com limiar
const step01 = (x, e) => smoothstep(e, e.add(0.002), x);
const atan2v = (f) => atan(f.y, f.x);
void sin; void cos; void pow; void exp; void min; void dot;
