// Céu de reserva do showcase (só quando o sistema `deepspace` não está
// presente): campo estelar em 3 camadas com cores de corpo negro, nebulosa
// com filamentos e faixas de poeira, faixa galáctica e o disco do sol com
// escurecimento de borda e coroa (HDR, alimenta bloom/flare/god rays).
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, normalize, positionLocal, dot, max, pow, mix, smoothstep, exp, abs, floor, length, acos, clamp, cos,
} from 'three/tsl';
import { hash33, fbm3, vnoise3, blackbody } from '../tslib.js';

export function makeSky(sunUniforms, { nebA = [0.55, 0.25, 0.75], nebB = [0.15, 0.55, 0.8], density = 0.8 } = {}) {
  const U = {
    nebA: uniform(new THREE.Color(...nebA)),
    nebB: uniform(new THREE.Color(...nebB)),
    density: uniform(density),
    sunDisk: uniform(1),
  };
  const stars = (d, scale, thresh, bright) => {
    const p = d.mul(scale);
    const cell = floor(p);
    const h = hash33(cell);
    const sp = normalize(cell.add(h.mul(0.8).add(0.1)));
    const dd = length(d.sub(sp)).mul(scale);
    const on = smoothstep(thresh, 1.0, h.x);
    const core = exp(dd.mul(dd).mul(-180)).mul(on);
    const col = blackbody(h.y.mul(0.6).add(0.38)).add(vec3(0.15, 0.17, 0.22)).mul(pow(h.z, 3).mul(bright).add(bright * 0.06));
    return col.mul(core);
  };
  const node = Fn(() => {
    const d = normalize(positionLocal).toVar();
    // faixa galáctica (plano inclinado)
    const gN = normalize(vec3(0.25, 0.92, -0.3));
    const gy = dot(d, gN);
    const band = exp(gy.mul(gy).mul(-22)).toVar();
    // nebulosa: domínio deformado → filamentos
    const w = vec3(fbm3(d.mul(2.4)), fbm3(d.mul(2.4).add(5.2)), fbm3(d.mul(2.4).add(9.7)));
    const n = fbm3(d.mul(3.1).add(w.mul(1.8))).toVar();
    const fil = pow(smoothstep(0.42, 0.85, n), 1.6);
    const dust = smoothstep(0.5, 0.72, fbm3(d.mul(6.5).add(w.mul(2.3))));
    const regionMask = smoothstep(0.15, 0.8, fbm3(d.mul(0.9).add(3.3)));
    const neb = mix(U.nebB, U.nebA, smoothstep(0.35, 0.8, w.x)).mul(fil.mul(0.22).add(n.mul(0.015))).mul(regionMask.mul(regionMask).mul(U.density)).toVar();
    neb.addAssign(vec3(1.0, 0.45, 0.35).mul(pow(fil, 3).mul(0.12)).mul(regionMask));
    const milky = vec3(0.85, 0.8, 0.95).mul(band.mul(0.05).mul(vnoise3(d.mul(40)).mul(0.6).add(0.6)));
    const absorb = float(1).sub(dust.mul(0.75).mul(band.add(regionMask).min(1)));
    // estrelas: 3 camadas (densidade maior na faixa)
    const st = stars(d, 160, 0.965, 9).add(stars(d, 380, 0.94, 3.5)).add(stars(d, 900, mix(0.93, 0.8, band), 1.4)).toVar();
    const col = neb.add(milky).mul(absorb).add(st.mul(absorb.mul(0.7).add(0.3))).toVar();
    // sol: disco com escurecimento de borda + coroa
    const sd = dot(d, normalize(sunUniforms.dir));
    const ang = acos(clamp(sd, -1, 1));
    const r = max(sunUniforms.angularRadius, 0.004);
    const x = clamp(ang.div(r), 0, 1);
    const limb = float(1).sub(float(0.6).mul(float(1).sub(pow(float(1).sub(x.mul(x)), 0.5))));
    const disk = smoothstep(r.mul(1.02), r.mul(0.97), ang).mul(limb);
    const corona = exp(ang.div(r).sub(1).max(0).mul(-3.2)).mul(0.9).add(exp(ang.div(r).mul(-0.55)).mul(0.08));
    const sunC = sunUniforms.color.mul(disk.mul(60).add(corona.mul(smoothstep(r.mul(0.95), r.mul(1.05), ang))).mul(1.5)).mul(sunUniforms.visibility.max(0.05)).mul(U.sunDisk);
    col.addAssign(sunC);
    return vec4(col, 1);
  })();
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, depthTest: false });
  mat.colorNode = node;
  mat.fog = false;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1e9, 64, 32), mat);
  mesh.name = 'rps.showcase.sky';
  mesh.renderOrder = -1000;
  mesh.frustumCulled = false;
  mesh.userData.uniforms = U;
  return mesh;
}
