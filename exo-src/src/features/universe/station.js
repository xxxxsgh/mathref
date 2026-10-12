/**
 * ESTAÇÃO ESPACIAL procedural (âncora do sistema): anel habitacional com
 * raios, eixo central com baía de atracação iluminada, treliças com painéis
 * solares, antenas e detalhes ("greebles"). Texturas de chapas, janelas e
 * rugosidade geradas em canvas. 3 draw calls (casco, painéis, luzes).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry } from './bodies.js';
import { spaceMaterial } from './shading.js';

function hullTextures(seed) {
  const S = 512;
  const r = mulberry(seed);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#8d9096';
  g.fillRect(0, 0, S, S);
  // chapas
  for (let i = 0; i < 140; i++) {
    const w = 16 + r() * 120, h = 16 + r() * 90;
    const x = r() * S, y = r() * S;
    const v = 120 + r() * 60;
    g.fillStyle = `rgb(${v},${v + 3},${v + 8})`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(30,32,36,0.8)';
    g.lineWidth = 1.5;
    g.strokeRect(x + 0.5, y + 0.5, w, h);
  }
  // listras de aviso e marcas
  for (let i = 0; i < 10; i++) {
    const x = r() * S, y = r() * S;
    g.fillStyle = r() < 0.5 ? '#c8662a' : '#d9b23a';
    g.fillRect(x, y, 40 + r() * 60, 6);
  }
  // sujeira
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(20,20,20,${r() * 0.08})`;
    g.fillRect(r() * S, r() * S, 2 + r() * 8, 2 + r() * 8);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  // janelas (emissivo)
  const e = document.createElement('canvas');
  e.width = e.height = S;
  const ge = e.getContext('2d');
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, S, S);
  for (let row = 0; row < 24; row++) {
    const y = row * (S / 24) + 8;
    for (let x = 0; x < S; x += 9) {
      if (r() < 0.55) continue;
      const warm = r() < 0.75;
      ge.fillStyle = warm ? `rgba(255,${200 + r() * 40},${130 + r() * 60},1)` : `rgba(140,210,255,1)`;
      ge.fillRect(x, y, 5, 4);
    }
  }
  const emis = new THREE.CanvasTexture(e);
  emis.colorSpace = THREE.SRGBColorSpace;
  emis.wrapS = emis.wrapT = THREE.RepeatWrapping;
  return { map, emis };
}

function panelTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#0b1a3a';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#5a7bb0';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    g.beginPath();
    g.moveTo((i * S) / 8, 0);
    g.lineTo((i * S) / 8, S);
    g.stroke();
    g.beginPath();
    g.moveTo(0, (i * S) / 8);
    g.lineTo(S, (i * S) / 8);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Monta a estação (unidades em metros; anel com ~430 m de raio). */
export function buildStation(seed = 1) {
  const r = mulberry(seed);
  const hull = [];
  const lights = [];
  const panels = [];
  const add = (list, geo, pos, rot, scl) => {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(pos || [0, 0, 0])),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(rot || [0, 0, 0]))),
      new THREE.Vector3(...(scl || [1, 1, 1])),
    );
    geo.applyMatrix4(m);
    list.push(geo.index ? geo.toNonIndexed() : geo);
  };
  const RING = 430;
  // anel habitacional (eixo Z = eixo da estação)
  add(hull, new THREE.TorusGeometry(RING, 34, 20, 160), [0, 0, 0]);
  add(hull, new THREE.TorusGeometry(RING, 12, 8, 160), [0, 0, 42]);
  add(hull, new THREE.TorusGeometry(RING, 12, 8, 160), [0, 0, -42]);
  // faixa de janelas (emissiva) por fora do anel
  add(lights, new THREE.CylinderGeometry(RING + 34.5, RING + 34.5, 14, 160, 1, true), [0, 0, 0], [Math.PI / 2, 0, 0]);
  // raios
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    add(hull, new THREE.CylinderGeometry(9, 9, RING - 60, 10), [Math.cos(a) * (RING / 2 + 20), Math.sin(a) * (RING / 2 + 20), 0], [0, 0, a - Math.PI / 2]);
    add(hull, new THREE.BoxGeometry(30, 30, 60), [Math.cos(a) * (RING - 40), Math.sin(a) * (RING - 40), 0], [0, 0, a]);
  }
  // eixo central
  add(hull, new THREE.CylinderGeometry(70, 70, 360, 32), [0, 0, 0], [Math.PI / 2, 0, 0]);
  add(hull, new THREE.CylinderGeometry(95, 70, 60, 32), [0, 0, 200], [Math.PI / 2, 0, 0]);
  add(hull, new THREE.CylinderGeometry(70, 95, 60, 32), [0, 0, -200], [Math.PI / 2, 0, 0]);
  add(hull, new THREE.SphereGeometry(80, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0, -230], [-Math.PI / 2, 0, 0]);
  // baía de atracação (abertura iluminada)
  add(hull, new THREE.BoxGeometry(150, 70, 90), [0, 0, 270]);
  add(lights, new THREE.PlaneGeometry(120, 44), [0, 0, 315.5]);
  for (let i = 0; i < 2; i++) add(lights, new THREE.BoxGeometry(150, 3, 3), [0, i ? 37 : -37, 316]);
  // treliças e painéis solares
  for (const sgn of [-1, 1]) {
    add(hull, new THREE.BoxGeometry(16, 16, 720), [sgn * 0, 0, 0], [0, Math.PI / 2, 0]);
    for (let k = 0; k < 3; k++) {
      const x = sgn * (RING + 140 + k * 150);
      add(panels, new THREE.BoxGeometry(130, 2, 240), [x, 0, 0], [0.35, 0, 0]);
      add(hull, new THREE.BoxGeometry(150, 8, 8), [x, 0, 0]);
    }
    add(hull, new THREE.BoxGeometry(460, 10, 10), [sgn * (RING + 280), 0, 0]);
  }
  // antenas e greebles no anel e no eixo
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2;
    const rr = RING + (r() < 0.5 ? 30 : -30);
    const w = 8 + r() * 26, h = 6 + r() * 18, d = 8 + r() * 30;
    add(hull, new THREE.BoxGeometry(w, h, d), [Math.cos(a) * rr, Math.sin(a) * rr, (r() - 0.5) * 50], [0, 0, a]);
  }
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    add(hull, new THREE.BoxGeometry(12 + r() * 20, 12 + r() * 20, 10 + r() * 40), [Math.cos(a) * 75, Math.sin(a) * 75, (r() - 0.5) * 300], [0, 0, a]);
  }
  add(hull, new THREE.CylinderGeometry(2, 2, 220, 6), [0, 0, -380], [Math.PI / 2, 0, 0]);
  add(hull, new THREE.SphereGeometry(30, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), [0, 60, -300], [0, 0, 0]);
  // luzes de navegação
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    add(lights, new THREE.SphereGeometry(4, 6, 4), [Math.cos(a) * (RING + 36), Math.sin(a) * (RING + 36), 46]);
  }

  const strip = (list) => list.map((g) => {
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    return g;
  });
  const tex = hullTextures(seed);
  const group = new THREE.Group();
  group.name = 'universe:station';
  const hullGeo = mergeGeometries(strip(hull));
  const hullMat = spaceMaterial({ map: tex.map, mapRepeat: [6, 2], rough: 0.45, metal: 0.55, color: 0xd8dce4 });
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  const panelMesh = new THREE.Mesh(mergeGeometries(strip(panels)), spaceMaterial({ map: panelTexture(), rough: 0.3, metal: 0.6, color: 0xaabbee, side: THREE.DoubleSide }));
  const lightMat = new THREE.MeshBasicMaterial({ map: tex.emis, color: new THREE.Color(6, 5, 4) });
  tex.emis.repeat.set(10, 1);
  const lightMesh = new THREE.Mesh(mergeGeometries(strip(lights)), lightMat);
  group.add(hullMesh, panelMesh, lightMesh);
  for (const m of [hullMesh, panelMesh, lightMesh]) m.frustumCulled = false;
  group.userData.dispose = () => {
    for (const m of [hullMesh, panelMesh, lightMesh]) {
      m.geometry.dispose();
      m.material.map?.dispose();
      m.material.uniforms?.uMap?.value?.dispose();
      m.material.dispose();
    }
  };
  return { group, lightMesh };
}
