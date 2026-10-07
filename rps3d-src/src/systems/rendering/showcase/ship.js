// Nave de demonstração do showcase de render (interceptador branco e dourado
// da Hegemonia). É conteúdo PRÓPRIO do sistema rendering para testar PBR,
// reflexos, bloom de luzes de navegação e motores; o jogo usa os modelos do
// sistema `ships` quando ele existe.
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, float, uniform, positionLocal, normalLocal, mix, smoothstep, fract, abs, max, min, pow, exp, length, uv, sin, time, clamp, bumpMap, dot, normalize, normalView, positionView,
} from 'three/tsl';
import { vnoise3 } from '../tslib.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/** Linhas de painel em coordenadas locais (m): 0 = painel, 1 = sulco. */
const panelLines = (p, sx = 2.1, sz = 3.0) => {
  // painéis em "tijolo": cada coluna desloca as juntas (menos cara de grade)
  const cx = p.x.div(sx).add(p.y.div(sx * 1.7));
  const a = fract(p.z.div(sz).add(cx.floor().mul(0.37)));
  const b = fract(cx.add(p.z.div(sz).floor().mul(0.21)));
  const la = smoothstep(0.012, 0.0, abs(a.sub(0.5)).sub(0.488).negate());
  const lb = smoothstep(0.016, 0.0, abs(b.sub(0.5)).sub(0.484).negate());
  return max(la, lb);
};

function paintMaterial({ base = [0.8, 0.8, 0.78], under = [0.11, 0.115, 0.125], trim = [0.95, 0.72, 0.3], stripe = true } = {}) {
  const m = new THREE.MeshPhysicalNodeMaterial();
  const p = positionLocal;
  const lines = panelLines(p);
  const grime = vnoise3(p.mul(0.9)).mul(0.6).add(vnoise3(p.mul(4.3)).mul(0.4));
  const wear = smoothstep(0.62, 0.8, grime);
  // ventre escuro (dois tons), faixa dourada lateral e filete no dorso
  const belly = smoothstep(0.05, -0.35, normalLocal.y);
  const band = stripe ? smoothstep(0.06, 0.0, abs(abs(p.x).sub(1.18)).sub(0.12)).mul(smoothstep(-2, 2, p.z)) : float(0);
  const dorsal = stripe ? smoothstep(0.05, 0.0, abs(p.x).sub(0.09)).mul(smoothstep(0.3, 0.6, normalLocal.y)) : float(0);
  const gold = max(band, dorsal);
  const paint = mix(vec3(...base), vec3(...under), belly);
  const col = mix(paint, vec3(...trim), gold).mul(float(1).sub(lines.mul(0.45))).mul(float(1).sub(wear.mul(0.22)));
  m.colorNode = col;
  m.metalnessNode = mix(mix(float(0.05), float(0.6), belly), float(0.95), gold);
  m.roughnessNode = mix(float(0.28), float(0.18), gold).add(wear.mul(0.3)).add(lines.mul(0.35)).add(belly.mul(0.12));
  m.clearcoatNode = float(1).sub(gold).sub(belly.mul(0.6)).mul(0.7).max(0);
  m.clearcoatRoughnessNode = float(0.1);
  m.normalNode = bumpMap(lines.mul(-0.006).add(grime.mul(0.0015)));
  return m;
}
function metalMaterial(color = [0.12, 0.12, 0.13], rough = 0.42) {
  const m = new THREE.MeshStandardNodeMaterial();
  const p = positionLocal;
  const n = vnoise3(p.mul(6)).mul(0.5).add(vnoise3(p.mul(23)).mul(0.5));
  m.colorNode = vec3(...color).mul(n.mul(0.4).add(0.8));
  m.metalnessNode = float(0.9);
  m.roughnessNode = float(rough).add(n.mul(0.15));
  return m;
}
function goldMaterial() {
  const m = new THREE.MeshStandardNodeMaterial();
  const n = vnoise3(positionLocal.mul(8));
  m.colorNode = vec3(1.0, 0.74, 0.33).mul(n.mul(0.15).add(0.9));
  m.metalnessNode = float(1);
  m.roughnessNode = float(0.22).add(n.mul(0.12));
  return m;
}
function glassMaterial() {
  const m = new THREE.MeshPhysicalNodeMaterial();
  m.colorNode = vec3(0.015, 0.02, 0.03);
  m.metalnessNode = float(0.0);
  m.roughnessNode = float(0.05);
  m.clearcoatNode = float(1);
  m.clearcoatRoughnessNode = float(0.02);
  // instrumentos do cockpit vistos através do vidro
  const p = positionLocal;
  const hud = smoothstep(0.55, 0.9, vnoise3(p.mul(vec3(14, 9, 3)))).mul(smoothstep(0.1, -0.3, p.y));
  m.emissiveNode = vec3(0.2, 0.6, 1.0).mul(hud.mul(0.6)).add(vec3(1.0, 0.55, 0.2).mul(0.02));
  m.specularIntensityNode = float(1);
  return m;
}
function emissive(color, power) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = vec3(...color).mul(power);
  return m;
}
/** Pluma do motor: cone aditivo com diamantes de choque. */
function plumeMaterial(color = [0.45, 0.65, 1.0]) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  m.fog = false;
  m.colorNode = Fn(() => {
    const t = uv().y; // 0 bocal → 1 ponta
    const around = uv().x;
    // borda do cone some (volume falso): mais brilho onde olhamos "através"
    const facing = abs(dot(normalize(normalView), normalize(positionView.negate())));
    const body = pow(facing, 2.5);
    const fall = pow(float(1).sub(t), 3.0);
    const diamonds = pow(sin(t.mul(46).sub(time.mul(18))).mul(0.5).add(0.5), 4).mul(exp(t.mul(-6)));
    const flick = vnoise3(vec3(around.mul(8), t.mul(6).sub(time.mul(14)), 1.0)).mul(0.4).add(0.6);
    const c = vec3(...color).mul(fall.mul(0.9).add(diamonds.mul(1.2))).mul(flick);
    const hot = vec3(0.85, 0.92, 1.0).mul(exp(t.mul(-18)).mul(2.5));
    return vec4(c.add(hot).mul(body), 1);
  })();
  return m;
}

export function buildShowcaseShip() {
  const ship = new THREE.Group();
  ship.name = 'rps.showcase.ship';
  const paint = paintMaterial();
  const dark = metalMaterial();
  const gold = goldMaterial();
  const glass = glassMaterial();

  // fuselagem (torno, seção elíptica)
  const prof = [[0, 0], [1.0, 0], [1.3, 0.5], [1.48, 2.5], [1.55, 5.5], [1.42, 8.5], [1.12, 11], [0.72, 13.4], [0.3, 15.3], [0.06, 16.2], [0, 16.3]].map(([r, y]) => new THREE.Vector2(r, y));
  const fg = new THREE.LatheGeometry(prof, 40);
  fg.rotateX(-Math.PI / 2);       // eixo Y → −Z (nariz para −Z)
  fg.scale(1.25, 0.62, 1);
  fg.translate(0, 0, 6);
  const fus = new THREE.Mesh(mergeVertices(fg), paint);
  fus.geometry.computeVertexNormals();
  ship.add(fus);
  // espinha dorsal (carenagem)
  const spine = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 7, 6, 16), paint);
  spine.rotation.x = Math.PI / 2; spine.scale.set(1.2, 1, 0.7); spine.position.set(0, 0.85, 3.2);
  ship.add(spine);
  // canopy
  const cg = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const canopy = new THREE.Mesh(cg, glass);
  canopy.scale.set(0.78, 0.62, 2.6); canopy.position.set(0, 0.62, -4.6);
  ship.add(canopy);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 40, Math.PI), gold);
  frame.scale.set(0.8, 0.66, 1); frame.rotation.y = Math.PI / 2; frame.position.set(0, 0.62, -4.0);
  ship.add(frame);

  // asas (delta com enflechamento) + anedro
  const ws = new THREE.Shape();
  ws.moveTo(0, -1.0); ws.lineTo(7.8, 2.6); ws.lineTo(8.1, 4.4); ws.lineTo(7.4, 4.9); ws.lineTo(0, 8.2); ws.lineTo(0, -1.0);
  const wg = new THREE.ExtrudeGeometry(ws, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.1, bevelSegments: 2 });
  wg.rotateX(Math.PI / 2);
  for (const side of [1, -1]) {
    const w = new THREE.Mesh(wg, paint);
    w.scale.set(side, 1, 1);
    w.position.set(side * 0.9, -0.15, -0.6);
    w.rotation.z = side * -0.09;
    ship.add(w);
    // ponta de asa dourada + canhão
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.42, 3.2), gold);
    tip.position.set(side * 8.55, -0.85, 3.4);
    ship.add(tip);
    const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.2, 12), dark);
    gun.rotation.x = Math.PI / 2; gun.position.set(side * 8.55, -0.85, 0.2);
    ship.add(gun);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 12), gold);
    muzzle.rotation.x = Math.PI / 2; muzzle.position.set(side * 8.55, -0.85, -1.9);
    ship.add(muzzle);
    // luz de navegação
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), emissive(side > 0 ? [0.2, 1.0, 0.35] : [1.0, 0.12, 0.08], 40));
    nav.position.set(side * 8.6, -0.55, 5.0);
    ship.add(nav);
    // aleta vertical inclinada
    const fs = new THREE.Shape();
    fs.moveTo(0, 0); fs.lineTo(2.6, 0); fs.lineTo(3.8, 2.6); fs.lineTo(3.0, 2.8); fs.lineTo(0, 0.4);
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(fs, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.05, bevelSegments: 1 }), paint);
    fin.rotation.set(0, -Math.PI / 2, side * 0.32);
    fin.position.set(side * 1.7, 0.45, 6.2);
    ship.add(fin);
    // nacela do motor
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 6.4, 32, 1), dark);
    nac.rotation.x = Math.PI / 2; nac.position.set(side * 2.05, -0.1, 7.2);
    ship.add(nac);
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.86, 3.0, 32, 1), paint);
    cowl.rotation.x = Math.PI / 2; cowl.position.set(side * 2.05, -0.1, 5.4);
    ship.add(cowl);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.07, 10, 40), gold);
    ring.position.set(side * 2.05, -0.1, 6.95);
    ship.add(ring);
    // bocal (torno) + núcleo incandescente
    const nz = new THREE.LatheGeometry([[0.62, 0], [0.75, 0.2], [0.95, 1.3], [0.98, 1.4], [0.7, 1.4]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
    nz.rotateX(Math.PI / 2);
    const nozzle = new THREE.Mesh(nz, metalMaterial([0.35, 0.3, 0.27], 0.3));
    nozzle.position.set(side * 2.05, -0.1, 10.3);
    nozzle.material.side = THREE.DoubleSide;
    ship.add(nozzle);
    const core = new THREE.Mesh(new THREE.CircleGeometry(0.66, 32), emissive([0.55, 0.75, 1.0], 28));
    core.position.set(side * 2.05, -0.1, 10.45);
    ship.add(core);
    const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.12, 6, 24, 1, true), plumeMaterial());
    pl.geometry.translate(0, -3, 0);
    pl.rotation.x = -Math.PI / 2; pl.position.set(side * 2.05, -0.1, 10.6);
    // uv.y do cilindro vai de cima (1) para baixo (0): inverte para 0 no bocal
    const uvA = pl.geometry.getAttribute('uv');
    for (let i = 0; i < uvA.count; i++) uvA.setY(i, 1 - uvA.getY(i));
    ship.add(pl);
  }
  // entradas de ar
  for (const side of [1, -1]) {
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 2.4), dark);
    intake.position.set(side * 1.45, -0.45, 0.8); intake.rotation.y = side * 0.08;
    ship.add(intake);
  }
  // greebles na espinha
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.35 + (i % 2) * 0.3, 0.18, 0.6), i % 3 ? dark : gold);
    g.position.set(((i % 3) - 1) * 0.45, 1.25, 1.2 + i * 0.9);
    ship.add(g);
  }
  // estrobo branco na cauda
  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), emissive([1, 1, 1], 60));
  strobe.position.set(0, 1.35, 7.4);
  ship.add(strobe);

  ship.traverse((o) => { if (o.isMesh && !o.material.isMeshBasicNodeMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  return ship;
}
