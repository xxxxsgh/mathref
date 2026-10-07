// Corpos do sistema vistos de LONGE — reserva visual enquanto o sistema
// `planets` não está presente (ou foi desligado por erro). Assim o céu de um
// sistema nunca fica vazio: os planetas aparecem com superfície por bioma
// (continentes, mares com brilho especular, calotas, rachaduras de lava,
// luzes de cidade no lado noturno da colônia), nuvens que giram, terminador
// com crepúsculo, atmosfera de Rayleigh/Mie no limbo, gigantes gasosos em
// faixas turbulentas com tempestade oval e anéis com sombra do planeta.
//
// Quando `ctx.services.planets` existe, tudo aqui fica invisível (o dono dos
// planetas é o sistema `planets`). As cores saem das paletas do Universe.js.
//
// Uniforms por corpo; a ESTRUTURA dos nós é a mesma para todos os corpos de
// um tipo, então o programa de GPU é compilado uma vez e reaproveitado.
import * as THREE from 'three/webgpu';
import {
  Fn, uniform, vec3, vec4, float, normalize, length, exp, pow, mix, smoothstep, clamp, max, min, abs, dot, sqrt,
  positionLocal, positionWorld, positionView, normalView, If, sin, cos, atan, asin, fract,
  cameraViewMatrix, modelWorldMatrix,
} from 'three/tsl';
import { n3, bumpNormal } from './tsl.js';

const BIOME_ID = { lush: 0, desert: 1, ice: 2, volcanic: 3, toxic: 4, ocean: 5, dead: 6, gas: 7 };
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();

const lin = (hex) => { const c = new THREE.Color(hex); return new THREE.Vector3(c.r, c.g, c.b); };

/** Ruído suave (fBm) na esfera unitária a partir da textura 3D periódica. */
const fbm3 = (p) => n3(p).r.mul(0.6).add(n3(p.mul(2.7).add(0.37)).g.mul(0.4));

function makeUniforms(body, sysSeed) {
  const s = (body.seed % 1000) / 1000;
  const pal = (body.palette || ['#777777', '#888888', '#999999', '#aaaaaa', '#bbbbbb']).map(lin);
  const at = body.atmosphere;
  const ray = at ? at.rayleigh : [0, 0, 0];
  return {
    sunDirW: uniform(new THREE.Vector3(0, 0, 1)), // em mundo
    sunCol: uniform(new THREE.Color(1, 0.9, 0.8)),
    sunI: uniform(3.0),
    radius: uniform(body.radius),
    atmoR: uniform(body.radius * (1 + (at ? Math.min(0.06, at.height / body.radius * 0.55) : 0))),
    biome: uniform(BIOME_ID[body.type] ?? 6),
    seed: uniform(new THREE.Vector3(s * 7.31, s * 3.17 + 1.3, s * 5.53 + 2.1)),
    p0: uniform(pal[0]), p1: uniform(pal[1]), p2: uniform(pal[2]), p3: uniform(pal[3]), p4: uniform(pal[4]),
    sea: uniform(body.seaLevel ?? -1),
    clouds: uniform(body.clouds || 0),
    atmoCol: uniform(new THREE.Vector3(ray[0], ray[1], ray[2])),
    atmoDen: uniform(at ? at.density : 0),
    mie: uniform(at ? at.mie : 0),
    city: uniform(body.colony ? 1 : 0),
    time: uniform(0),
    fade: uniform(1),
    relief: uniform(Math.max(600, body.terrainAmplitude || 2000)),
  };
}

/** Nós derivados: sol em espaço de vista e centro do corpo relativo à câmera
 * (lidos da GPU no próprio draw → sem atraso de um frame se a câmera mexer
 * depois do nosso `frame`). */
function derive(u) {
  u.sunDirV = cameraViewMatrix.mul(vec4(u.sunDirW, 0.0)).xyz.normalize();
  u.center = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xyz;
  return u;
}

// ─── superfície de planeta rochoso/lua ───────────────────────────────────
function rockyMaterial(u, mobile) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = false;
  const nL = normalize(positionLocal).toVar('fbN');
  const P = nL.mul(1.15).add(u.seed);
  // domínio torcido → continentes com litoral recortado
  const w = vec3(n3(P.mul(0.6)).r, n3(P.mul(0.6).add(3.7)).r, n3(P.mul(0.6).add(7.1)).r).sub(0.5);
  const Q = P.add(w.mul(0.55)).toVar('fbQ');
  const cont = n3(Q.mul(0.75)).r;
  const det = n3(Q.mul(2.6)).g;
  const ridge = n3(Q.mul(1.4).add(1.1)).a;
  const fine = mobile ? float(0.5) : n3(Q.mul(7.3)).g;
  const hRaw = cont.mul(0.62).add(det.mul(0.22)).add(ridge.mul(0.16)).add(fine.mul(0.06));
  const h = clamp(hRaw.sub(0.5).mul(3.4).add(0.5), 0.0, 1.0).toVar('fbH');
  const lat = abs(nL.y);

  m.colorNode = Fn(() => {
    const isSea = float(0).toVar();
    const col = vec3(0).toVar();
    const emis = vec3(0).toVar();
    const rough = float(1).toVar(); // 0 = espelho (mar)
    const b = u.biome;
    const seaT = u.sea.greaterThan(-0.5).select(u.sea, float(-1));
    const cells = n3(Q.mul(1.9)).b;
    // ── paletas por bioma ──
    If(b.lessThan(0.5).or(b.greaterThan(4.5).and(b.lessThan(5.5))), () => {
      // exuberante / oceânico: verde → seco → rocha → neve
      const land = mix(u.p0, u.p1, smoothstep(0.0, 0.45, det)).toVar();
      land.assign(mix(land, u.p2, smoothstep(0.55, 0.8, det.add(lat.mul(0.3)))));
      land.assign(mix(land, u.p3.mul(0.8), smoothstep(0.55, 0.85, ridge).mul(0.6)));
      col.assign(land);
    }).ElseIf(b.lessThan(1.5), () => {
      // desértico: dunas em faixas, cânions escuros
      const dune = sin(Q.x.mul(60).add(n3(Q.mul(4.0)).r.mul(14.0))).mul(0.5).add(0.5);
      const d = mix(u.p2, u.p3, dune.mul(0.35).add(det.mul(0.65))).toVar();
      d.assign(mix(d, u.p1, smoothstep(0.35, 0.1, h)));
      d.assign(mix(d, u.p4.mul(0.7), smoothstep(0.7, 0.92, ridge)));
      col.assign(d);
    }).ElseIf(b.lessThan(2.5), () => {
      // gelado: branco-azulado com fendas e mares congelados
      const ice = mix(u.p1, u.p0, smoothstep(0.25, 0.75, det.add(lat.mul(0.4)))).toVar();
      ice.assign(mix(ice, u.p2, smoothstep(0.78, 0.95, ridge).mul(0.8)));
      ice.assign(mix(ice, u.p4.mul(0.6), smoothstep(0.3, 0.12, h).mul(0.5)));
      col.assign(ice);
      rough.assign(0.6);
    }).ElseIf(b.lessThan(3.5), () => {
      // vulcânico: basalto e veias de lava brilhantes
      const bas = mix(u.p0, u.p2, det.mul(0.7)).toVar();
      bas.assign(mix(bas, u.p1, smoothstep(0.4, 0.8, cont)));
      col.assign(bas);
      const crack = smoothstep(0.86, 0.97, ridge).mul(smoothstep(0.55, 0.3, h).add(0.25));
      const pool = smoothstep(0.15, 0.04, h);
      emis.assign(mix(u.p3, u.p4, fine).mul(crack.add(pool).mul(9.0)));
    }).ElseIf(b.lessThan(4.5), () => {
      // tóxico: amarelo-esverdeado com manchas púrpuras
      const t = mix(u.p1, u.p2, det).toVar();
      t.assign(mix(t, u.p3, smoothstep(0.7, 0.95, cells)));
      t.assign(mix(t, u.p4, smoothstep(0.65, 0.85, ridge).mul(0.6)));
      col.assign(t);
    }).Else(() => {
      // morto/irradiado: cinzas com crateras (células) e raios claros
      const c = mix(u.p0, u.p2, det.mul(0.6).add(cont.mul(0.4))).toVar();
      const crat = smoothstep(0.55, 0.9, cells);
      c.assign(mix(c, u.p1.mul(0.6), crat.mul(0.7)));
      c.assign(mix(c, u.p3, smoothstep(0.88, 0.97, cells).mul(0.6)));
      c.assign(mix(c, u.p3, smoothstep(0.9, 0.99, ridge).mul(0.35)));
      col.assign(c);
    });
    // ── mar ──
    If(seaT.greaterThan(0.0).and(h.lessThan(seaT)), () => {
      const depth = clamp(seaT.sub(h).mul(6.0), 0, 1);
      const deep = vec3(0.004, 0.025, 0.06), shallow = vec3(0.02, 0.16, 0.2);
      const sc = mix(shallow, deep, pow(depth, 0.5)).toVar();
      If(b.greaterThan(3.5).and(b.lessThan(4.5)), () => { sc.assign(mix(vec3(0.12, 0.05, 0.14), vec3(0.04, 0.012, 0.05), depth)); });
      col.assign(sc);
      isSea.assign(1);
      rough.assign(0);
    });
    // calotas polares (não no deserto/vulcânico)
    If(b.lessThan(0.5).or(b.greaterThan(4.5).and(b.lessThan(5.5))).or(b.greaterThan(1.5).and(b.lessThan(2.5))), () => {
      const cap = smoothstep(0.78, 0.9, lat.add(det.mul(0.12)).add(h.mul(0.05)));
      col.assign(mix(col, vec3(0.8, 0.85, 0.9), cap));
      isSea.mulAssign(float(1).sub(cap));
    });

    // ── relevo + iluminação ──
    const N = isSea.greaterThan(0.5).select(normalView, bumpNormal(h.mul(u.relief), float(1.0))).toVar();
    const L = u.sunDirV;
    const NL = dot(N, L);
    const NLs = dot(normalView, L).toVar(); // geométrico (terminador suave)
    const diff = clamp(NL, 0.0, 1.0).mul(smoothstep(-0.12, 0.1, NLs));
    // crepúsculo: luz avermelhada filtrada perto do terminador
    const twi = smoothstep(0.32, 0.0, NLs).mul(smoothstep(-0.14, 0.02, NLs)).mul(u.atmoDen.min(1.5));
    const sunTint = mix(u.sunCol, u.sunCol.mul(vec3(1.0, 0.45, 0.18)), twi.mul(0.85));
    const lit = col.mul(sunTint).mul(diff).mul(u.sunI).toVar();
    // especular do mar (brilho do sol + halo largo)
    const V = normalize(positionView.negate());
    const H = normalize(L.add(V));
    const NH = max(dot(N, H), 0.0);
    const spec = pow(NH, 220.0).mul(9.0).add(pow(NH, 24.0).mul(0.18)).mul(isSea).mul(smoothstep(-0.05, 0.1, NLs));
    const fres = pow(float(1).sub(max(dot(N, V), 0.0)), 5.0).mul(0.7).add(0.02);
    lit.addAssign(sunTint.mul(spec).mul(u.sunI).mul(fres.mul(4.0).add(0.4)));
    // ── nuvens (giram mais rápido que a superfície) ──
    If(u.clouds.greaterThan(0.01), () => {
      const ca = u.time.mul(0.00012);
      const cs = cos(ca), sn = sin(ca);
      const cn = vec3(nL.x.mul(cs).sub(nL.z.mul(sn)), nL.y, nL.x.mul(sn).add(nL.z.mul(cs)));
      const cw = vec3(n3(cn.mul(0.9).add(5.5)).r, n3(cn.mul(0.9).add(9.1)).g, 0).sub(0.5);
      const cq = cn.mul(1.6).add(cw.mul(vec3(1.2, 0.5, 1.2))).add(u.seed.zxy);
      const cl = fbm3(cq).mul(0.75).add(n3(cq.mul(4.3)).a.mul(0.25));
      // faixas de latitude (células de Hadley)
      const band = sin(nL.y.mul(9.0).add(cl.mul(4.0))).mul(0.08);
      const cov = smoothstep(float(1).sub(u.clouds).sub(0.02), float(1).sub(u.clouds).add(0.3), cl.add(band));
      const cLit = smoothstep(-0.18, 0.25, NLs).mul(clamp(NLs.mul(0.8).add(0.35), 0.0, 1.0));
      const cCol = sunTint.mul(cLit).mul(u.sunI).mul(0.82);
      lit.assign(mix(lit, cCol, cov.mul(0.92)));
      emis.mulAssign(float(1).sub(cov.mul(0.85)));
      // sombra suave das nuvens sobre o chão
      lit.mulAssign(float(1).sub(cov.mul(0.25)));
    });
    // ── lado noturno: cidades (colônia) e lava ──
    const night = smoothstep(0.05, -0.15, NLs);
    If(u.city.greaterThan(0.5), () => {
      const land = float(1).sub(isSea);
      const grid = smoothstep(0.62, 0.9, n3(Q.mul(9.0)).b).mul(smoothstep(0.55, 0.85, n3(Q.mul(2.1).add(8.0)).r));
      const coast = smoothstep(0.12, 0.0, abs(h.sub(seaT))).mul(0.6);
      emis.addAssign(vec3(1.0, 0.62, 0.28).mul(grid.add(coast.mul(grid.add(0.15)))).mul(land).mul(night).mul(3.5));
    });
    // espalhamento atmosférico sobre a superfície (azulado no limbo iluminado)
    const mu = max(dot(normalView, V), 0.0);
    const haze = pow(float(1).sub(mu), 2.5).mul(u.atmoDen.min(1.4)).mul(smoothstep(-0.2, 0.4, NLs));
    lit.addAssign(u.atmoCol.mul(haze).mul(u.sunI).mul(0.45));
    return vec4(lit.add(emis).mul(u.fade), 1);
  })();
  return m;
}

// ─── gigante gasoso ──────────────────────────────────────────────────────
function gasMaterial(u) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.fog = false;
  m.colorNode = Fn(() => {
    const nL = normalize(positionLocal).toVar();
    const lat = asin(clamp(nL.y, -1, 1));
    const lon = atan(nL.z, nL.x);
    const t = u.time;
    // cisalhamento: faixas giram com velocidades diferentes por latitude
    const shear = sin(lat.mul(7.0)).mul(t).mul(0.00008);
    const lo = lon.add(shear);
    const p = vec3(cos(lo).mul(cos(lat)), nL.y.mul(5.5), sin(lo).mul(cos(lat))).add(u.seed);
    const turb = n3(p.mul(vec3(1.4, 0.6, 1.4))).r.sub(0.5).mul(0.9).add(n3(p.mul(vec3(4.0, 1.6, 4.0))).g.sub(0.5).mul(0.35));
    const y = nL.y.add(turb.mul(0.09));
    const bands = sin(y.mul(22.0).add(u.seed.x)).mul(0.5).add(0.5);
    const bands2 = sin(y.mul(57.0).add(u.seed.y)).mul(0.5).add(0.5);
    const c = mix(u.p0, u.p2, bands).toVar();
    c.assign(mix(c, u.p1, smoothstep(0.55, 0.95, bands2).mul(0.55)));
    c.assign(mix(c, u.p4, smoothstep(0.7, 1.0, sin(y.mul(9.0).add(2.0)).mul(0.5).add(0.5)).mul(0.5)));
    c.assign(mix(c, u.p3, smoothstep(0.82, 0.9, abs(nL.y)).mul(0.55)));
    // tempestade oval
    const sc = vec3(0.8, -0.32, 0.5).normalize();
    const so = nL.sub(sc);
    const sd = length(so.mul(vec3(0.6, 1.7, 0.6)));
    const storm = smoothstep(0.17, 0.05, sd);
    const swirl = n3(so.mul(9.0).add(vec3(0, 0, sd.mul(12.0)))).r;
    c.assign(mix(c, mix(vec3(0.62, 0.22, 0.1), vec3(0.95, 0.7, 0.5), swirl), storm.mul(0.85)));
    const N = normalView;
    const L = u.sunDirV;
    const NL = dot(N, L);
    const diff = smoothstep(-0.08, 0.6, NL).mul(clamp(NL.mul(0.7).add(0.3), 0.0, 1.0));
    const V = normalize(positionView.negate());
    const mu = max(dot(N, V), 0.0);
    const limb = pow(mu, 0.35); // escurecimento de limbo de atmosfera profunda
    const lit = c.mul(u.sunCol).mul(diff).mul(limb).mul(u.sunI).toVar();
    const haze = pow(float(1).sub(mu), 3.0).mul(smoothstep(-0.2, 0.5, NL));
    lit.addAssign(u.atmoCol.mul(haze).mul(u.sunI).mul(0.25));
    return vec4(lit.mul(u.fade), 1);
  })();
  return m;
}

// ─── atmosfera (casca aditiva com caminho óptico analítico) ──────────────
function atmoMaterial(u) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  m.fog = false;
  m.colorNode = Fn(() => {
    const rd = normalize(positionWorld);
    const c = u.center;
    const tca = dot(c, rd);
    const d2 = max(dot(c, c).sub(tca.mul(tca)), 0.0);
    const d = sqrt(d2);
    const R = u.radius, Ra = u.atmoR;
    const H = Ra.sub(R);
    const hitPlanet = d.lessThan(R);
    const lenOuter = sqrt(max(Ra.mul(Ra).sub(d2), 0.0));
    const lenInner = sqrt(max(R.mul(R).sub(d2), 0.0));
    // comprimento atravessado (só o trecho na frente do planeta se acertar)
    const path = hitPlanet.select(lenOuter.sub(lenInner), lenOuter.mul(2.0));
    const hgt = clamp(max(d, R).sub(R).div(H), 0.0, 1.0);
    const dens = exp(hgt.mul(-3.2));
    const optical = path.div(H.mul(6.0)).mul(dens).mul(u.atmoDen);
    // ponto representativo: aproximação mais próxima (ou entrada no planeta)
    const tp = hitPlanet.select(tca.sub(lenInner), tca);
    const pt = rd.mul(tp).sub(c);
    const nrm = normalize(pt);
    const L = u.sunDirW;
    const NL = dot(nrm, L);
    const lit = smoothstep(-0.3, 0.25, NL);
    // transmitância → crepúsculo alaranjado no terminador
    const sunset = smoothstep(0.3, -0.05, NL).mul(lit);
    const ray = u.atmoCol.mul(1.0);
    const scat = float(1).sub(exp(optical.mul(-1.6)));
    const col = mix(ray, vec3(1.0, 0.42, 0.16).mul(ray.length().max(0.6)), sunset.mul(0.75)).mul(scat).mul(lit).toVar();
    // Mie: brilho para a frente quando o sol está atrás do planeta
    const cosT = dot(rd, L);
    const g = 0.76;
    const mieP = float(1 - g * g).div(pow(float(1 + g * g).sub(cosT.mul(2 * g)), 1.5)).mul(0.08);
    col.addAssign(u.sunCol.mul(mieP).mul(u.mie).mul(scat).mul(smoothstep(-0.35, 0.1, NL)));
    return vec4(col.mul(u.sunI).mul(0.9).mul(u.fade), 1);
  })();
  return m;
}

// ─── anéis ───────────────────────────────────────────────────────────────
function ringMaterial(u, inner, outer) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.fog = false;
  m.colorNode = Fn(() => {
    const p = positionLocal;
    const r = length(p.xy).div(u.radius); // em raios do planeta
    const x = r.sub(inner).div(outer - inner).toVar();
    const b1 = n3(vec3(x.mul(3.1), u.seed.x, 0.5)).r;
    const b2 = n3(vec3(x.mul(11.0), u.seed.y, 0.25)).g;
    const b3 = n3(vec3(x.mul(37.0), 0.7, u.seed.z)).g;
    const dens = clamp(b1.mul(1.3).add(b2.mul(0.7)).add(b3.mul(0.4)).sub(0.75), 0.0, 1.0).toVar();
    // divisões (lacunas nítidas)
    dens.mulAssign(smoothstep(0.012, 0.03, abs(x.sub(0.62))));
    dens.mulAssign(smoothstep(0.004, 0.012, abs(x.sub(0.31))));
    dens.mulAssign(smoothstep(0.0, 0.06, x).mul(smoothstep(1.0, 0.9, x)));
    const col = mix(u.p2, u.p0, b2).mul(mix(float(0.7), float(1.15), b3));
    // sombra do planeta: raio do fragmento até o sol cruza a esfera?
    const wp = positionWorld.sub(u.center);
    const L = u.sunDirW;
    const tc = dot(wp, L).negate();
    const dd = length(wp.add(L.mul(tc)));
    const shadow = tc.greaterThan(0.0).select(smoothstep(u.radius.mul(0.97), u.radius.mul(1.03), dd), float(1));
    const V = normalize(positionWorld.negate());
    const fwd = pow(max(dot(V.negate(), L), 0.0), 6.0).mul(1.5); // espalhamento p/ frente (contra o sol)
    const lit = col.mul(u.sunCol).mul(u.sunI).mul(shadow).mul(float(0.55).add(fwd));
    return vec4(lit.mul(u.fade), dens.mul(0.85).mul(u.fade));
  })();
  return m;
}

export class FarBodies {
  constructor(ctx) {
    this.ctx = ctx;
    this.items = [];
    this.mobile = ctx.quality.name === 'mobile';
    this.geo = new THREE.SphereGeometry(1, this.mobile ? 64 : 128, this.mobile ? 32 : 64);
    this.visible = true;
  }

  setSystem(sys) {
    for (const it of this.items) it.dispose();
    this.items = [];
    if (!sys) return;
    for (const b of sys.bodies) this.items.push(this.makeBody(b, sys));
  }

  makeBody(body, sys) {
    const ctx = this.ctx;
    const u = derive(makeUniforms(body, sys.seed));
    const group = new THREE.Group();
    group.name = 'corpo-distante:' + body.name;
    const spin = new THREE.Group();
    group.add(spin);
    const gas = body.kind === 'gas_giant';
    const surf = new THREE.Mesh(this.geo, gas ? gasMaterial(u) : rockyMaterial(u, this.mobile));
    surf.scale.setScalar(body.radius);
    surf.frustumCulled = false;
    spin.add(surf);
    let atmo = null;
    if (body.atmosphere) {
      atmo = new THREE.Mesh(this.geo, atmoMaterial(u));
      atmo.scale.setScalar(u.atmoR.value);
      atmo.frustumCulled = false;
      atmo.renderOrder = 2;
      group.add(atmo);
    }
    let ring = null;
    if (body.rings) {
      const inner = gas ? 1.35 : 1.6, outer = gas ? 2.45 : 2.3;
      const g = new THREE.RingGeometry(body.radius * inner, body.radius * outer, 256, 1);
      ring = new THREE.Mesh(g, ringMaterial(u, inner, outer));
      ring.rotation.x = -Math.PI / 2; // plano equatorial (XZ local)
      ring.frustumCulled = false;
      ring.renderOrder = 3;
      spin.add(ring);
    }
    const entry = ctx.world.add(group, null, { getPos: (out) => out.copy(body.pos) });
    const self = this;
    return {
      body, u, group, spin, surf, atmo, ring,
      frame(c, t) {
        // rotação do planeta (anéis no plano equatorial acompanham o eixo)
        body.rotationAt(t, _q);
        spin.quaternion.copy(_q);
        u.time.value = t;
        const sys = c.universe.system;
        sys.sunDir(body.pos, _v);
        u.sunDirW.value.copy(_v);
        const st = sys.star;
        u.sunCol.value.setRGB(st.color[0], st.color[1], st.color[2]);
        // luminosidade (com queda suave pela distância, calibrada p/ jogo)
        const dist = body.pos.distanceTo(st.pos);
        u.sunI.value = (st.type === 'black_hole' ? 1.2 : 3.1) * Math.min(1.5, Math.max(0.45, (1.2e7 / Math.max(dist, 1)) ** 0.35)) * (st.luminosity || 1) ** 0.5;
        group.visible = self.visible;
      },
      dispose() {
        entry.remove();
        surf.material.dispose(); atmo?.material.dispose();
        if (ring) { ring.geometry.dispose(); ring.material.dispose(); }
      },
    };
  }

  frame(ctx, t) {
    // o sistema `planets` assume quando presente
    this.visible = !ctx.services.planets && ctx.params.get('farbodies') !== '0';
    if (!this.visible) { for (const it of this.items) it.group.visible = false; return; }
    for (const it of this.items) it.frame(ctx, t);
  }

  dispose() { for (const it of this.items) it.dispose(); this.items = []; this.geo.dispose(); }
}
