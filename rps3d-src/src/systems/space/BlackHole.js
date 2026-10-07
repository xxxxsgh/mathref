// Buraco negro de Schwarzschild com disco de acreção — traçado de raios
// curvos no fragment shader (impostor esférico em escala real).
//
// Em unidades de rs (raio de Schwarzschild = 1), o fóton segue
//   a = −1,5 · h² · r̂ / r⁴    (h = |r × v| conservado)
// que reproduz a sombra (~2,6 rs), o anel de fótons e a imagem "dobrada"
// do disco por cima e por baixo da sombra. A cada cruzamento do plano do
// disco acumulamos emissão com:
//   • temperatura ∝ r^(−3/4)·(1−√(rin/r))^(1/4) → cor de corpo negro
//   • feixe relativístico: g = 1/(γ(1 − v·n)), intensidade ∝ g⁴, cor ∝ g
//   • desvio gravitacional √(1 − 1/r)
//   • turbulência em rotação kepleriana diferencial (filamentos espirais)
// Raios que escapam amostram o cubo do céu na direção FINAL → lente forte
// do fundo (o domo aplica a lente fraca fora do impostor). Jatos
// relativísticos tênues saem pelos polos.

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec2, vec3, vec4, uniform, positionWorld, cameraPosition, normalize, dot, cross, length, sqrt, max, min, clamp, exp, pow, mix, smoothstep,
  Loop, If, Break, cubeTexture, abs, sin, cos, atan, select,
} from 'three/tsl';
import { noise4, blackbody, camU } from './tslUtil.js';
import { sstep } from './tslUtil.js';

const RIMP = 26; // raio do impostor em rs

export class BlackHole {
  constructor(ctx, system, skyTexture) {
    this.ctx = ctx;
    const st = system.star;
    this.rs = st.radius; // usamos o "raio" do tipo como raio de Schwarzschild
    this.diskIn = 3.0;
    this.diskOut = 15.0;
    this.group = new THREE.Group();
    this.group.name = 'black-hole';
    // orientação do disco (determinística por sistema)
    const s = (system.seed % 10000) / 10000;
    const tilt = 0.25 + s * 0.35;
    const az = s * 6.283;
    this.N = new THREE.Vector3(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)).normalize();
    this.U = new THREE.Vector3().crossVectors(this.N, new THREE.Vector3(0, 0, 1)).normalize();
    this.W = new THREE.Vector3().crossVectors(this.U, this.N).normalize();
    this.uCam = uniform(new THREE.Vector3(0, 0.3, -40)); // câmera no referencial do disco (rs)
    this.uU = uniform(this.U.clone());
    this.uN = uniform(this.N.clone());
    this.uW = uniform(this.W.clone());
    this.skyTex = skyTexture;
    const steps = { ultra: 160, high: 120, medium: 80, mobile: 56 }[ctx.quality.name] || 100;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.makeMaterial(steps));
    this.mesh.scale.setScalar(this.rs * RIMP);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);
    // cor dominante da luz (para ctx.sun)
    this.lightColor = new THREE.Color(1.0, 0.72, 0.45);
  }

  makeMaterial(STEPS) {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false });
    m.fog = false;
    const { uCam, uU, uN, uW } = this;
    const rin = this.diskIn;
    const rout = this.diskOut;
    const tex = this.skyTex;
    m.colorNode = Fn(() => {
      // raio da câmera no referencial do disco (x=U, y=N, z=W), unidades de rs
      const rdW = normalize(positionWorld.sub(cameraPosition));
      const rd = vec3(dot(rdW, uU), dot(rdW, uN), dot(rdW, uW));
      const ro = uCam;
      // entra na esfera do impostor (fora dela o espaço é ~plano)
      const b = dot(ro, rd);
      const c = dot(ro, ro).sub(RIMP * RIMP);
      const disc = b.mul(b).sub(c);
      const t0 = select(c.greaterThan(0.0), max(b.negate().sub(sqrt(max(disc, 0.0))), 0.0), float(0.0));
      const pos = ro.add(rd.mul(t0)).toVar();
      const vel = rd.toVar();
      const h = cross(pos, vel);
      const h2 = dot(h, h);
      const col = vec3(0).toVar();
      const T = float(1).toVar();
      const captured = float(0).toVar();
      const t = camU.time;
      // quão perto o raio passa (para o desvanecimento da borda do impostor)
      const impact = sqrt(max(dot(ro, ro).sub(b.mul(b)), 0.0));
      Loop(STEPS, () => {
        const r2 = dot(pos, pos);
        const r = sqrt(r2);
        // passo adaptativo: fino perto do horizonte, largo longe
        const dt = clamp(r.mul(0.06), 0.02, 1.0);
        // Verlet de velocidade (estável, sem "anéis" de erro de integração)
        const acc = pos.mul(h2.mul(-1.5).div(r2.mul(r2).mul(r)));
        const prev = pos.toVar();
        pos.addAssign(vel.mul(dt).add(acc.mul(dt.mul(dt).mul(0.5))));
        const r2n = dot(pos, pos);
        const acc2 = pos.mul(h2.mul(-1.5).div(r2n.mul(r2n).mul(sqrt(r2n))));
        vel.addAssign(acc.add(acc2).mul(dt.mul(0.5)));
        // cruzou o plano do disco?
        If(prev.y.mul(pos.y).lessThan(0.0), () => {
          const f = prev.y.div(prev.y.sub(pos.y));
          const hit = mix(prev, pos, f);
          const rr = length(hit.xz);
          If(rr.greaterThan(rin * 0.92).and(rr.lessThan(rout)), () => {
            // rotação kepleriana diferencial (estilizada no tempo) + braços espirais
            const omega = pow(rr, -1.5).mul(1.1);
            const ang = atan(hit.z, hit.x).sub(t.mul(omega)).add(rr.log().mul(1.4));
            const q = vec3(cos(ang).mul(0.7), sin(ang).mul(0.7), rr.mul(0.42));
            const n1 = noise4(q.add(vec3(0.0, 0.0, t.mul(0.002))));
            const wob = n1.xy.sub(0.5);
            const a2 = ang.add(wob.x.mul(0.9));
            const q2 = vec3(cos(a2).mul(1.7), sin(a2).mul(1.7), rr.mul(2.1).add(wob.y.mul(1.6)));
            const n2 = noise4(q2.add(vec3(5.1, 1.3, 0.0)));
            const n3 = noise4(q2.mul(2.3).add(vec3(1.7, 4.2, 0.5)));
            const turb = n1.z.mul(0.35).add(n2.y.mul(0.35)).add(n2.w.mul(0.15)).add(n3.y.mul(0.15));
            const lanes = sstep(0.28, 0.72, turb);
            // perfil radial (disco fino): quente por dentro, frio por fora
            const x = float(rin).div(rr);
            // feixe relativístico + desvio gravitacional
            const v = sqrt(float(0.5).div(rr));
            const vdir = vec3(hit.z.negate(), 0.0, hit.x).div(rr);
            const toCam = normalize(vel).negate();
            const gamma = float(1.0).div(sqrt(float(1.0).sub(v.mul(v))));
            const dop = float(1.0).div(gamma.mul(float(1.0).sub(v.mul(dot(vdir, toCam)))));
            const g = dop.mul(sqrt(max(float(1.0).sub(float(1.0).div(rr)), 0.02)));
            const temp = mix(float(1600.0), float(8200.0), pow(x, 1.3)).mul(g);
            const hot = sstep(rin * 1.7, rin * 1.0, rr);
            const I = pow(g, 3.5).mul(pow(x, 1.5)).mul(float(8.0)).mul(lanes.mul(1.0).add(0.3)).mul(hot.mul(1.4).add(1.0));
            const edge = sstep(rin * 0.92, rin * 1.1, rr).mul(sstep(rout, rout * 0.55, rr));
            const a = clamp(edge.mul(lanes.mul(0.62).add(0.3)), 0.0, 0.92);
            const emis = blackbody(temp).mul(I);
            col.addAssign(T.mul(emis).mul(a));
            T.mulAssign(float(1.0).sub(a));
          });
        });
        // jatos polares tênues (emissão volumétrica ao longo do eixo)
        const rho2 = dot(pos.xz, pos.xz);
        const ay = abs(pos.y);
        const jet = exp(rho2.div(ay.mul(0.02).add(0.06)).negate()).mul(sstep(1.5, 3.0, ay)).mul(exp(ay.mul(-0.22)));
        col.addAssign(T.mul(vec3(0.4, 0.6, 1.0)).mul(jet).mul(dt).mul(0.12));
        If(r.lessThan(1.0), () => {
          captured.assign(1.0);
          Break();
        });
        If(r.greaterThan(RIMP * 1.02).and(dot(pos, vel).greaterThan(0.0)), () => {
          Break();
        });
        If(T.lessThan(0.01), () => {
          Break();
        });
      });
      // escapou → completa a deflexão restante (campo fraco: α = (rs/b)(1 − sen φ))
      // e amostra o céu na direção final (lente forte)
      const vN0 = normalize(vel);
      const rf = length(pos);
      const bimp = length(cross(pos, vN0)).max(1.0);
      const sinPhi = clamp(dot(pos, vN0).div(rf), -1.0, 1.0);
      const rem = clamp(float(1.0).sub(sinPhi).div(bimp), 0.0, 0.5);
      const toward = normalize(pos.negate().add(vN0.mul(dot(pos, vN0))).add(vec3(0, 1e-5, 0)));
      const vN = normalize(vN0.mul(cos(rem)).add(toward.mul(sin(rem))));
      const dirW = uU.mul(vN.x).add(uN.mul(vN.y)).add(uW.mul(vN.z));
      const sky = cubeTexture(tex, dirW, 0).xyz.mul(camU.skyVis); // nível explícito: fora de fluxo uniforme (WGSL)
      col.addAssign(sky.mul(T).mul(float(1.0).sub(captured)));
      // borda do impostor funde com o domo (que faz a lente fraca)
      const fade = sstep(RIMP * 0.985, RIMP * 0.8, impact);
      return vec4(col, fade);
    })();
    return m;
  }

  /** `camLocal` = posição local da câmera; `bhLocal` = posição local do BH. */
  update(camLocal, bhLocal) {
    this.group.position.copy(bhLocal);
    const d = camLocal.clone().sub(bhLocal).divideScalar(this.rs);
    this.uCam.value.set(d.dot(this.U), d.dot(this.N), d.dot(this.W));
    this.distance = d.length() * this.rs;
  }

  setSkyTexture(tex) {
    this.skyTex = tex;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.group.removeFromParent();
  }
}
