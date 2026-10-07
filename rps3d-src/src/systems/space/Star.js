// Estrela do sistema em escala real: fotosfera HDR (escurecimento de borda,
// granulação animada, manchas e fáculas), coroa com serpentinas e
// proeminências (billboard aditivo, ocluído por planetas via profundidade),
// e o "brilho de lente" (glare/raios) com tamanho angular mínimo para a
// estrela parecer um sol ofuscante de qualquer ponto do sistema.
//
// Um StarBody serve à estrela principal e à companheira de uma binária.

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uniform, positionLocal, positionWorld, cameraPosition, normalize, dot, max, min, pow, exp, mix, clamp, smoothstep, length,
  atan, cos, sin, abs, uv, normalWorld, sqrt, fract,
} from 'three/tsl';
import { fbm, billow, ridged, noise4, camU } from './tslUtil.js';
import { sstep } from './tslUtil.js';

const lin = (c) => c.map((x) => Math.pow(x, 2.2));

/** Perfil visual por tipo de estrela. */
const PROFILE = {
  red_dwarf: { I: 6, corona: 4.0, coronaI: 0.9, glare: 0.7, spots: 0.75, gran: 6 },
  orange: { I: 8, corona: 5.0, coronaI: 1.0, glare: 1.0, spots: 0.5, gran: 8 },
  yellow: { I: 9, corona: 5.0, coronaI: 1.0, glare: 1.05, spots: 0.45, gran: 9 },
  binary: { I: 9, corona: 5.0, coronaI: 1.0, glare: 1.0, spots: 0.45, gran: 9 },
  blue_giant: { I: 12, corona: 6.5, coronaI: 1.5, glare: 1.5, spots: 0.15, gran: 14 },
  white_dwarf: { I: 16, corona: 7.0, coronaI: 0.8, glare: 1.25, spots: 0.0, gran: 4 },
  companion: { I: 9, corona: 4.5, coronaI: 0.9, glare: 0.85, spots: 0.3, gran: 8 },
};

export class StarBody {
  /**
   * @param {object} def {type, radius, color:[r,g,b], lum}
   */
  constructor(def, seed = 1) {
    this.def = def;
    const prof = PROFILE[def.type] || PROFILE.yellow;
    this.prof = prof;
    this.radius = def.radius;
    this.color = new THREE.Color().setRGB(...lin(def.color));
    this.group = new THREE.Group();
    this.group.name = 'star-' + def.type;
    const col = uniform(this.color);
    this.colorU = col;
    // "exposição" da fotosfera: disco grande na tela → menos brilho por pixel
    // (como a adaptação do olho/câmera), revelando granulação e manchas
    this.photoScale = uniform(1);
    const photoScale = this.photoScale;
    const s0 = (seed % 1000) * 0.013;

    // ── fotosfera ──────────────────────────────────────────────────────
    const pm = new THREE.MeshBasicNodeMaterial();
    pm.fog = false;
    pm.colorNode = Fn(() => {
      const n = normalize(positionLocal);
      const V = normalize(cameraPosition.sub(positionWorld));
      const mu = clamp(dot(normalize(normalWorld), V), 0.0, 1.0);
      const limb = float(1.0).sub(float(0.62).mul(float(1.0).sub(sqrt(mu)))).sub(float(0.18).mul(float(1.0).sub(mu).mul(float(1.0).sub(mu))));
      const t = camU.time;
      // granulação (células de convecção) em duas escalas, evoluindo devagar
      const g1 = noise4(n.mul(prof.gran).add(vec3(t.mul(0.004), s0, t.mul(-0.003))));
      const g2 = noise4(n.mul(prof.gran * 3.1).add(vec3(s0, t.mul(0.01), 0.3)));
      const gran = g1.z.mul(0.6).add(g2.z.mul(0.4));
      // manchas estelares (umbra + penumbra) e fáculas brilhantes perto da borda
      const sp = fbm(n.mul(1.25).add(vec3(s0, 2.0, t.mul(0.0006))));
      const umbra = sstep(0.64, 0.7, sp).mul(prof.spots);
      const pen = sstep(0.6, 0.66, sp).mul(prof.spots);
      const fac = sstep(0.52, 0.6, sp).mul(float(1.0).sub(mu)).mul(0.6);
      const spot = float(1.0).sub(pen.mul(0.45)).sub(umbra.mul(0.45)).add(fac);
      // borda mais vermelha (camadas mais frias)
      const redden = mix(vec3(1.0, 0.55, 0.32), vec3(1, 1, 1), pow(mu, 0.35));
      const I = float(prof.I).mul(limb).mul(float(0.62).add(gran.mul(0.76))).mul(spot);
      return col.mul(redden).mul(I).mul(photoScale);
    })();
    this.photo = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), pm);
    this.photo.scale.setScalar(def.radius);
    this.photo.name = 'photosphere';
    this.group.add(this.photo);

    // ── coroa (billboard em escala real) ───────────────────────────────
    const E = prof.corona; // extensão em raios estelares
    this.coronaExtent = E;
    const cm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    cm.fog = false;
    const cornerC = positionLocal.xy;
    cm.positionNode = camU.right.mul(cornerC.x).add(camU.up.mul(cornerC.y)).mul(def.radius * E);
    cm.colorNode = Fn(() => {
      const p = uv().sub(0.5).mul(2.0 * E); // em raios estelares
      const r = length(p).toVar();
      const dir = p.div(max(r, 1e-4));
      const t = camU.time;
      const h = max(r.sub(1.0), 0.0);
      const q = vec3(dir.mul(1.6), h.mul(0.22).sub(t.mul(0.01)));
      const streams = ridged(q.add(vec3(s0, 0, 0))).mul(0.9).add(fbm(vec3(dir.mul(3.0), h.mul(0.5).add(s0))).mul(0.5));
      const base = exp(h.mul(-3.2)).mul(0.9).add(float(0.22).div(r.mul(r)));
      const k = base.mul(float(0.35).add(streams.mul(0.9))).mul(sstep(E, E * 0.55, r));
      // proeminências (arcos de plasma rente à borda, vermelho-alaranjado)
      const pn = fbm(vec3(dir.mul(5.0), t.mul(0.004).add(s0 + 3.0)));
      const loops = sstep(0.6, 0.74, pn).mul(exp(h.mul(-14.0))).mul(sstep(0.98, 1.02, r));
      const corona = col.mul(k).mul(prof.coronaI * 2.2).add(vec3(1.0, 0.32, 0.12).mul(loops).mul(5.0));
      return vec4(corona.mul(sstep(0.985, 1.01, r)).mul(camU.skyVis.mul(0.85).add(0.15)), 1.0);
    })();
    this.corona = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cm);
    this.corona.frustumCulled = false;
    this.corona.renderOrder = 5;
    this.corona.name = 'corona';
    this.group.add(this.corona);

    // ── glare (raios/brilho; tamanho angular mínimo, desenhado por cima) ──
    this.glareSize = uniform(1); // metros (meia-largura do quad)
    this.glareI = uniform(1); // intensidade (visibilidade × distância)
    this.diskFrac = uniform(0); // raio do disco em unidades do quad do glare
    const gm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    gm.fog = false;
    const gs = this.glareSize;
    gm.positionNode = camU.right.mul(positionLocal.x).add(camU.up.mul(positionLocal.y)).mul(gs);
    const gI = this.glareI;
    const diskFrac = this.diskFrac;
    gm.colorNode = Fn(() => {
      const p = uv().sub(0.5).mul(2.0);
      const r = length(p).toVar();
      const a = atan(p.y, p.x);
      const t = camU.time;
      const fall = float(1.0).sub(r).max(0.0).pow(2.0);
      const glow = exp(r.mul(-30.0)).mul(0.6).add(float(0.012).div(r.mul(r).add(0.004)).mul(fall)).add(exp(r.mul(-5.0)).mul(0.015));
      // espículas principais (4) e raios secundários finos girando devagar
      const spike = pow(abs(cos(a.mul(2.0))), 260.0).mul(exp(r.mul(-4.5))).mul(0.7);
      const rays = pow(abs(cos(a.mul(7.0).add(t.mul(0.02)))), 40.0).mul(exp(r.mul(-6.0))).mul(0.2);
      const flick = noise4(vec3(a.mul(1.5915), t.mul(0.15), 0.5)).x.mul(0.6).add(0.7);
      const streaks = pow(fract(a.mul(9.549).add(0.5)).sub(0.5).abs().mul(2.0), 1.0).oneMinus().pow(30.0).mul(exp(r.mul(-7.0))).mul(flick).mul(0.25);
      // não cobre o disco quando ele é grande na tela (deixa ver a fotosfera)
      const diskMask = mix(float(1.0), smoothstep(diskFrac.mul(0.95), diskFrac.mul(1.25), r), smoothstep(0.02, 0.08, diskFrac));
      const I = glow.add(spike).add(rays).add(streaks).mul(sstep(1.0, 0.75, r)).mul(diskMask);
      return vec4(col.mul(I).mul(gI).mul(float(prof.glare * 4.0)), 1.0);
    })();
    this.glare = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), gm);
    this.glare.frustumCulled = false;
    this.glare.renderOrder = 900;
    this.glare.name = 'glare';
    this.group.add(this.glare);
  }

  /**
   * Atualiza o glare. `camPos` local; `visible` 0..1 (oclusão/atmosfera).
   */
  update(camPos, visible = 1) {
    const d = camPos.distanceTo(this.group.position);
    const angR = this.radius / Math.max(d, 1); // raio angular (rad)
    // glare ocupa no mínimo ~0,22 rad e cresce devagar com o disco aparente
    const ang = Math.min(0.75, Math.max(0.22, angR * 7));
    this.glareSize.value = d * Math.tan(ang);
    // intensidade: estrela distante = ponto ofuscante menor; perto = forte,
    // mas com o disco enorme na tela o glare cede lugar aos detalhes
    const k = Math.min(1.2, Math.max(0.3, Math.pow(angR / 0.012, 0.5))) * Math.min(1, Math.max(0.3, 0.035 / angR));
    this.photoScale.value = Math.min(1, Math.max(Math.min(1, 5 / this.prof.I), Math.pow(0.02 / angR, 0.5)));
    this.diskFrac.value = Math.tan(Math.asin(Math.min(0.999, angR))) / Math.tan(ang);
    this.glareI.value = k * visible;
    this.group.visible = true;
    this.angularRadius = angR;
    this.distance = d;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
