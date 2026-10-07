// Fundo de céu para os cenários do render quando o sistema "space" não
// existe: campo de estrelas procedural + nebulosa suave + disco da estrela
// HDR (alimenta bloom, lens flare e god rays). Só usado em cenários.

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, float, normalize, positionLocal, dot, max, pow, smoothstep, floor, fract, exp, uniform, mix } from 'three/tsl';
import { hash33, hash13, fbm3 } from '../tsl-lib.js';

export function makeBackdrop(ctx, { sunDir = new THREE.Vector3(0.4, 0.25, -1), sunColor = 0xfff1dc, nebula = 0x2a1440, nebula2 = 0x082a3a, sunSize = 0.012 } = {}) {
  const group = new THREE.Group();
  group.name = 'render-backdrop';
  const dir = sunDir.clone().normalize();
  const uSun = uniform(dir);
  const uSunCol = uniform(new THREE.Color(sunColor));
  const uNeb = uniform(new THREE.Color(nebula));
  const uNeb2 = uniform(new THREE.Color(nebula2));
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
  mat.toneMapped = false;
  mat.colorNode = Fn(() => {
    const d = normalize(positionLocal);
    // estrelas: células 3D na esfera
    const stars = float(0).toVar();
    const tint = vec3(0).toVar();
    for (const sc of [180, 420]) {
      const p = d.mul(sc);
      const id = floor(p);
      const f = fract(p).sub(0.5);
      const h = hash33(id);
      const off = h.sub(0.5).mul(0.7);
      const r = f.sub(off).length();
      const b = pow(hash13(id.add(7.1)), 18.0).mul(sc === 180 ? 60 : 18);
      const s = exp(r.mul(r).mul(-900.0)).mul(b);
      stars.addAssign(s);
      tint.addAssign(mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.6), h.z).mul(s));
    }
    const n = fbm3(d.mul(1.8), 5);
    const n2 = fbm3(d.mul(3.3).add(vec3(4.0, 1.0, 2.0)), 4);
    const band = exp(dot(d, normalize(vec3(0.2, 1.0, 0.35))).abs().mul(-3.0));
    const neb = uNeb.mul(smoothstep(0.35, 0.85, n).mul(2.2)).add(uNeb2.mul(smoothstep(0.4, 0.9, n2).mul(1.8))).mul(band.mul(0.8).add(0.35));
    const milky = vec3(0.05, 0.045, 0.06).mul(band).mul(n2.mul(0.6).add(0.4));
    // estrela do sistema: disco + coroa (HDR forte)
    const cs = max(dot(d, uSun), 0);
    const cosR = Math.cos(sunSize);
    const disk = smoothstep(cosR - 0.00002, cosR + 0.00002, cs).mul(400.0);
    const corona = pow(cs, 2500).mul(30.0).add(pow(cs, 300).mul(2.0)).add(pow(cs, 30).mul(0.08));
    const col = tint.add(neb).add(milky).add(uSunCol.mul(disk.add(corona)));
    return vec4(col, 1);
  })();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4e8, 64, 32), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);
  // segue a câmera (céu no infinito)
  group.onBeforeRender = () => {};
  group.userData.update = () => sky.position.copy(ctx.camera.position);
  // sol direcional coerente
  ctx.sun.position.copy(dir).multiplyScalar(1000);
  ctx.sun.target.position.set(0, 0, 0);
  ctx.sun.color.set(sunColor);
  ctx.sun.intensity = 3.2;
  if (ctx.ambient) {
    ctx.ambient.intensity = 0.25;
    ctx.ambient.color.set(0x6a7aa0);
    ctx.ambient.groundColor?.set(0x1a1410);
  }
  ctx.get('render')?.setSky({ nebula: nebula, nebula2: nebula2, atmo: 0 });
  return group;
}
