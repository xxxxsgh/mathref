// Ruínas de uma civilização antiga: o grande arco no topo da colina, um anel
// de colunas na margem do lago e colunas solitárias marcando o caminho.
// Todas as peças são fundidas numa só malha (uma draw call), pintadas com
// musgo nas faces de cima, e registradas como colisores (dá para subir).

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from '../core/math.js';
import { RUINS } from './layout.js';
import { paintStone, stoneMaterial, STONE_COLORS } from './stone.js';
import { withFog } from '../render/fog.js';

const UP = new THREE.Vector3(0, 1, 0);

export class Ruins {
  constructor(scene, terrain, colliders) {
    this.terrain = terrain;
    this.colliders = colliders;
    this.pieces = [];
    this.r = rng(2024);
    this.group = new THREE.Group();
    this.group.name = 'ruins';

    this._arch(RUINS.arch);
    this._ring(RUINS.ring);
    for (const c of RUINS.lone) {
      const y = terrain.heightAt(c.x, c.z) - 0.2;
      this._column(c.x, y, c.z, c.h, c.broken, this.r() * 6);
      if (c.broken) this._fallen(c.x + 2.5, c.z + 1.2, this.r() * 6, 1.6);
    }

    const geo = mergeGeometries(this.pieces);
    const mesh = new THREE.Mesh(geo, stoneMaterial());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    scene.add(this.group);
  }

  /** Adiciona uma peça já transformada para o mundo. */
  _piece(geo, pos, rotY = 0, rotX = 0, rotZ = 0, opts = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(
      pos,
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m);
    g.deleteAttribute('uv');
    paintStone(g, { base: STONE_COLORS.ruin, alt: STONE_COLORS.ruinDark, moss: opts.moss ?? 0.6, mossAmount: opts.mossAmount ?? 0.9, seed: this.pieces.length });
    this.pieces.push(g);
    return g;
  }

  _block(w, h, d) {
    // Bloco com cantos levemente chanfrados: fica mais "pedra" no toon.
    const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      p.setXYZ(i, p.getX(i) * (1 + (this.r() - 0.5) * 0.04), p.getY(i), p.getZ(i) * (1 + (this.r() - 0.5) * 0.04));
    }
    return g;
  }

  _arch({ x, z, rot }) {
    const t = this.terrain;
    const y0 = t.heightAt(x, z) + 0.05;
    const r = this.r;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    // Local (lx ao longo do vão, lz profundidade) → mundo.
    const W = (lx, ly, lz) => new THREE.Vector3(x + lx * cos + lz * sin, y0 + ly, z - lx * sin + lz * cos);

    // Plataforma circular.
    const plat = new THREE.CylinderGeometry(8.5, 9.2, 0.9, 14, 1);
    this._piece(plat, W(0, -0.38, 0), r() * 3, 0, 0, { moss: 0.5, mossAmount: 0.55 });
    this.colliders.addCylinder(x, z, 8.8, y0 - 3, y0 + 0.07, 'stone');
    // Lajes quebradas ao redor.
    for (let i = 0; i < 9; i++) {
      const a = r() * Math.PI * 2, d = 12 + r() * 4;
      const sx = x + Math.cos(a) * d, sz = z + Math.sin(a) * d;
      this._piece(this._block(1.4 + r(), 0.3, 1.2 + r()), new THREE.Vector3(sx, t.heightAt(sx, sz) - 0.05, sz), r() * 6, (r() - 0.5) * 0.2, (r() - 0.5) * 0.2, { moss: 0.8 });
    }

    const PILLAR_X = 4.3, BLOCK_H = 1.2, N_BLOCKS = 5;
    const topY = BLOCK_H * N_BLOCKS + 0.2;
    for (const side of [-1, 1]) {
      // Base.
      this._piece(this._block(2.3, 0.6, 2.1), W(side * PILLAR_X, 0.5, 0), rot);
      for (let i = 0; i < N_BLOCKS; i++) {
        const jx = (r() - 0.5) * 0.08, jr = (r() - 0.5) * 0.08;
        this._piece(this._block(1.75, BLOCK_H - 0.04, 1.55), W(side * PILLAR_X + jx, 0.8 + BLOCK_H * i + BLOCK_H / 2, 0), rot + jr);
      }
      const c = W(side * PILLAR_X, 0, 0);
      this.colliders.addBox(c.x, c.z, 0.95, 0.85, rot, y0 - 1, y0 + topY + 0.6, 'stone');
    }
    // Arco de aduelas.
    const R = PILLAR_X, NV = 11;
    const len = ((Math.PI * R) / NV) * 0.96;
    for (let i = 0; i < NV; i++) {
      const a = Math.PI * ((i + 0.5) / NV);
      const lx = Math.cos(a) * R, ly = topY + 0.6 + Math.sin(a) * R;
      const key = i === (NV - 1) / 2;
      const g = this._block(1.45 + (key ? 0.25 : 0), len, 1.55 + (key ? 0.2 : 0));
      // A aduela fica radial: gira em Z (no plano do arco), depois Y.
      const q = new THREE.Quaternion().setFromAxisAngle(UP, rot).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), a - Math.PI / 2 + Math.PI / 2));
      let gg = g.toNonIndexed();
      gg.applyMatrix4(new THREE.Matrix4().compose(W(lx, ly, 0), q, new THREE.Vector3(1, 1, 1)));
      gg.deleteAttribute('uv');
      paintStone(gg, { base: STONE_COLORS.ruin, alt: STONE_COLORS.ruinDark, moss: 0.62, seed: i * 3 });
      this.pieces.push(gg);
      const c = W(lx, 0, 0);
      const bb = new THREE.Box3().setFromBufferAttribute(gg.attributes.position);
      const hx = Math.max(0.5, Math.abs(Math.sin(a)) * len * 0.5 + Math.abs(Math.cos(a)) * 0.7);
      this.colliders.addBox(c.x, c.z, hx, 0.78, rot, bb.min.y, bb.max.y, 'stone');
      if (key) this._glyph(W(lx, ly, 0.86), W(lx, ly, -0.86), rot);
    }
    // Blocos caídos.
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2, d = 5 + r() * 5;
      const bx = x + Math.cos(a) * d, bz = z + Math.sin(a) * d;
      const by = t.heightAt(bx, bz) + 0.35;
      this._piece(this._block(1.7, 1.15, 1.5), new THREE.Vector3(bx, by, bz), r() * 6, (r() - 0.5) * 0.5, (r() - 0.5) * 0.5);
      this.colliders.addCylinder(bx, bz, 0.9, by - 1, by + 0.55, 'stone');
    }
    this.archTop = y0 + topY + 0.6 + R + 0.7;
  }

  _glyph(front, back, rot) {
    // Símbolo original de "vento": três arcos concêntricos com um ponto.
    const S = 128;
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const g = cv.getContext('2d');
    g.strokeStyle = '#fff';
    g.lineCap = 'round';
    g.lineWidth = 7;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(S / 2, S / 2 + 10, 18 + i * 16, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(S / 2, S / 2 + 10, 7, 0, Math.PI * 2);
    g.fill();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = withFog(new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0.35, 1.7, 1.5), transparent: true, depthWrite: false }), 'glyph');
    for (const [p, flip] of [[front, 0], [back, Math.PI]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), mat);
      m.position.copy(p);
      m.rotation.y = rot + flip;
      this.group.add(m);
    }
  }

  _column(x, y, z, h, broken, rot) {
    const r = this.r;
    this._piece(this._block(1.6, 0.45, 1.6), new THREE.Vector3(x, y + 0.22, z), rot);
    const shaft = new THREE.CylinderGeometry(0.52, 0.6, h, 12, Math.max(2, Math.round(h / 1.5)));
    if (broken) {
      // Topo quebrado: vértices do anel de cima descem aleatoriamente.
      const p = shaft.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > h / 2 - 0.01) p.setY(i, p.getY(i) - r() * 0.7);
      }
    }
    this._piece(shaft, new THREE.Vector3(x, y + 0.45 + h / 2, z), rot);
    let top = y + 0.45 + h;
    if (!broken) {
      this._piece(this._block(1.5, 0.4, 1.5), new THREE.Vector3(x, top + 0.2, z), rot);
      top += 0.4;
    }
    this.colliders.addCylinder(x, z, 0.62, y - 1, top - (broken ? 0.35 : 0), 'stone');
    return top;
  }

  _fallen(x, z, rot, len) {
    const y = this.terrain.heightAt(x, z) + 0.4;
    const g = new THREE.CylinderGeometry(0.5, 0.55, len, 12, 1);
    this._piece(g, new THREE.Vector3(x, y, z), rot, 0, Math.PI / 2);
    this.colliders.addBox(x, z, len / 2, 0.55, rot, y - 1, y + 0.45, 'stone');
  }

  _ring({ x, z, r: R }) {
    const t = this.terrain;
    const r = this.r;
    const y0 = t.heightAt(x, z);
    const plat = new THREE.CylinderGeometry(R + 2.2, R + 2.8, 0.7, 20, 1);
    this._piece(plat, new THREE.Vector3(x, y0 - 0.1, z), 0.3, 0, 0, { moss: 0.9, mossAmount: 0.4 });
    this.colliders.addCylinder(x, z, R + 2.4, y0 - 3, y0 + 0.25, 'stone');
    const N = 8;
    const tops = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + 0.2;
      const cx = x + Math.cos(a) * R, cz = z + Math.sin(a) * R;
      const broken = [1, 3, 4, 6].includes(i);
      const h = broken ? 1.5 + r() * 3 : 6.2;
      tops.push(this._column(cx, y0 + 0.2, cz, h, broken, a));
      if (broken && r() < 0.7) {
        // Pedaços caídos para fora do anel.
        const fx = x + Math.cos(a) * (R + 3.2), fz = z + Math.sin(a) * (R + 3.2);
        this._fallen(fx, fz, a + Math.PI / 2 + (r() - 0.5) * 0.6, 2.2 + r() * 1.5);
      }
    }
    // Lintel apoiado nas colunas 7 e 0 (intactas, vizinhas).
    const a0 = (7 / N) * Math.PI * 2 + 0.2, a1 = 0.2 + Math.PI * 2;
    const am = (a0 + a1) / 2;
    const lx = x + Math.cos(am) * R * 0.93, lz = z + Math.sin(am) * R * 0.93;
    const span = 2 * R * Math.sin(Math.PI / N) + 1.4;
    const ly = tops[0] + 0.35;
    this._piece(this._block(span, 0.7, 1.1), new THREE.Vector3(lx, ly, lz), -am + Math.PI / 2);
    this.colliders.addBox(lx, lz, span / 2, 0.55, -am + Math.PI / 2, ly - 0.35, ly + 0.35, 'stone');
  }
}
