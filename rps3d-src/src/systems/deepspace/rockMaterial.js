// Material PBR dos asteroides (instanciados). Tudo procedural no espaço do
// objeto (positionGeometry → a textura gruda na rocha, mesmo quando as
// matrizes de instância são reconstruídas). Atributo por instância `aRock`:
//   x, y = sementes  ·  z = tipo (0 carbonáceo, 1 silicato, 2 metálico,
//   3 gelo, 4 cristalino raro)  ·  w = raio (m)
import * as THREE from 'three/webgpu';
import {
  Fn, vec3, vec4, float, mix, smoothstep, clamp, pow, abs, attribute, positionGeometry, normalGeometry, select, max, fwidth, length,
} from 'three/tsl';
import { n3, bumpNormal } from './tsl.js';

export const ROCK_TYPES = [
  { id: 'carbonaceo', name: 'Carbonáceo', resources: ['carbono', 'água'] },
  { id: 'silicato', name: 'Silicato', resources: ['silício', 'ferro'] },
  { id: 'metalico', name: 'Metálico', resources: ['ferro', 'níquel', 'titânio'] },
  { id: 'gelo', name: 'Gelo', resources: ['água', 'deutério'] },
  { id: 'cristalino', name: 'Cristalino', resources: ['cristal', 'irídio'] },
];

export function makeRockMaterial(quality = 'high') {
  const m = new THREE.MeshStandardNodeMaterial();
  const a = attribute('aRock', 'vec4');
  const type = a.z;
  const P = positionGeometry.mul(1.6).add(vec3(a.x, a.y, a.x.add(a.y)).mul(17.0)).toVar();

  const isT = (k) => smoothstep(k - 0.5, k, type).mul(smoothstep(k + 0.5, k, type));
  const m0 = isT(0), m1 = isT(1), m2 = isT(2), m3 = isT(3), m4 = isT(4);

  // ruídos compartilhados (cor + rugosidade + altura)
  const lo = n3(P.mul(0.55)).r.toVar();          // manchas grandes
  const mid = n3(P.mul(1.7)).g.toVar();          // regolito
  const cell = n3(P.mul(1.1)).b.toVar();         // células (crateras/blocos)
  const veinN = n3(P.mul(1.3).add(5.1)).a.toVar(); // veios (ridged)
  // detalhe fino: crateras pequenas e grãos (some com a distância via derivadas)
  const hi = quality !== 'mobile';
  // anti-serrilhado: o detalhe some quando fica menor que ~1 pixel
  const fw = hi ? length(fwidth(P)) : float(1);
  const fadeC = hi ? smoothstep(0.05, 0.02, fw) : float(0);
  const fadeG = hi ? smoothstep(0.016, 0.006, fw) : float(0);
  const crat2 = hi ? mix(float(0.5), n3(P.mul(6.2).add(1.7)).b, fadeC).toVar() : float(0.5);
  const grain = hi ? mix(float(0.5), n3(P.mul(19.0).add(4.4)).g, fadeG).toVar() : float(0.5);

  m.colorNode = Fn(() => {
    const t = lo.mul(0.6).add(mid.mul(0.4)).toVar();
    // paletas por tipo (albedo linear)
    const c0 = mix(vec3(0.07, 0.064, 0.058), vec3(0.17, 0.15, 0.125), t);
    const c1 = mix(vec3(0.17, 0.135, 0.1), vec3(0.36, 0.29, 0.21), t);
    const c2 = mix(vec3(0.2, 0.19, 0.18), vec3(0.42, 0.4, 0.38), t);
    const c3 = mix(vec3(0.42, 0.5, 0.58), vec3(0.78, 0.84, 0.9), t);
    const c4 = mix(vec3(0.1, 0.09, 0.11), vec3(0.22, 0.2, 0.25), t);
    const c = c0.mul(m0).add(c1.mul(m1)).add(c2.mul(m2)).add(c3.mul(m3)).add(c4.mul(m4)).toVar();
    // oclusão de cavidade (bake por vértice)
    const ao = attribute('aAO', 'float');
    c.mulAssign(mix(float(0.22), float(1.18), pow(ao, 1.3)));
    // poeira escura acumulada nas crateras / clara nas bordas
    c.mulAssign(mix(float(0.62), float(1.12), smoothstep(0.25, 0.7, cell)));
    // crateras pequenas: fundo escuro, borda clara (material fresco exposto)
    const rimC = smoothstep(0.5, 0.6, crat2).mul(smoothstep(0.7, 0.6, crat2));
    c.mulAssign(mix(float(1.0), float(0.72), smoothstep(0.66, 0.9, crat2)));
    c.mulAssign(float(1).add(rimC.mul(0.3)));
    // grão do regolito
    c.mulAssign(grain.mul(0.35).add(0.83));
    // intemperismo espacial: manchas frescas mais claras e frias
    c.assign(mix(c, c.mul(vec3(1.25, 1.3, 1.4)), smoothstep(0.62, 0.8, lo).mul(m0.add(m1).mul(0.6))));
    // gelo: sujeira escura em faixas
    c.assign(mix(c, vec3(0.12, 0.11, 0.1), m3.mul(smoothstep(0.55, 0.75, veinN)).mul(0.7)));
    // veios minerais: dourados no metálico, ferrugem no silicato
    const vein = smoothstep(0.62, 0.85, veinN);
    c.assign(mix(c, vec3(0.75, 0.55, 0.25), vein.mul(m2).mul(0.8)));
    c.assign(mix(c, vec3(0.42, 0.18, 0.08), vein.mul(m1).mul(0.6)));
    return c;
  })();
  m.roughnessNode = Fn(() => {
    const r = float(0.92).toVar();
    r.assign(mix(r, float(0.42), m2.mul(smoothstep(0.5, 0.8, veinN).mul(0.8).add(0.3))));
    r.assign(mix(r, float(0.3), m3.mul(0.7)));
    r.assign(mix(r, float(0.25), m4.mul(smoothstep(0.6, 0.8, veinN))));
    return r;
  })();
  m.metalnessNode = m2.mul(smoothstep(0.55, 0.8, veinN)).mul(0.85).add(m4.mul(0.1));
  // cristais: veios que brilham (fluorescência ciano)
  m.emissiveNode = vec3(0.1, 0.9, 1.0).mul(m4.mul(smoothstep(0.7, 0.9, veinN)).mul(2.5));

  // relevo fino: crateras pequenas + grãos
  const fine = quality === 'mobile' ? null : n3(P.mul(5.3).add(2.2)).r;
  const H = Fn(() => {
    const h = mid.mul(0.5).add(cell.mul(0.6)).add(veinN.mul(0.15)).toVar();
    if (fine) h.addAssign(fine.mul(0.35));
    if (hi) {
      // bacia + borda das crateras pequenas, e grão bem fino
      const rimH = smoothstep(0.5, 0.6, crat2).mul(smoothstep(0.7, 0.6, crat2));
      h.addAssign(smoothstep(0.62, 0.9, crat2).mul(-0.22).add(rimH.mul(0.1)));
      h.addAssign(grain.mul(0.06));
    }
    return h;
  })();
  // escala do relevo em METROS (proporcional ao raio da rocha)
  m.normalNode = bumpNormal(H, a.w.mul(quality === 'mobile' ? 0.025 : 0.035));
  m.fog = false;
  return m;
}
