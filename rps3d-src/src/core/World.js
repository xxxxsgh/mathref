// Mundo: sistema estelar atual + origem flutuante.
//
// O universo usa coordenadas do SISTEMA (estrela em 0,0,0, metros, double).
// A cena do Three usa coordenadas LOCAIS: local = sistema − world.origin.
// Tudo que existe "no mundo" fica dentro de ctx.root (Group). Quando o foco
// (nave ou jogador) se afasta mais que SHIFT_DIST da origem local, o núcleo
// desloca TODOS os filhos de ctx.root e emite 'world:originShift' {x,y,z}
// (o deslocamento aplicado, em metros) para quem guarda posições locais
// fora da cena (física, partículas em buffers, etc.).
//
// Corpos celestes têm um FRAME girante (Object3D filho de root) criado pelo
// sistema de planetas. Perto/na superfície, nave e jogador viram filhos desse
// frame — a física roda no referencial do planeta, que gira com o dia/noite.
// Use world.reparent(obj, novoPai) para trocar de referencial sem "pulo".

import { Vector3, Matrix4 } from 'three/webgpu';
import { bodyPosition } from './Galaxy.js';

const SHIFT_DIST = 3000;
const _v = new Vector3();
const _m = new Matrix4();

export class World {
  constructor(ctx) {
    this.ctx = ctx;
    this.galaxy = ctx.galaxy;
    this.system = null;
    this.origin = { x: 0, y: 0, z: 0 }; // em coordenadas do sistema
    this.time = 0; // segundos de tempo do sistema (dia/noite, órbitas)
    this.timeScale = 1;
    this.focus = null; // Object3D que a origem segue (nave/jogador)
  }

  /** Troca de sistema estelar (salto). Emite 'world:system' {system, prev}. */
  loadSystem(id, arrivalSysPos = null) {
    const prev = this.system;
    this.system = this.galaxy.get(id);
    this.ctx.state.systemId = id;
    const p = arrivalSysPos || { x: 0, y: 0, z: -this.system.star.radius * 40 };
    this.origin = { x: p.x, y: p.y, z: p.z };
    this.ctx.bus.emit('world:system', { system: this.system, prev });
    return this.system;
  }

  /** Posição de um corpo em coordenadas LOCAIS (Vector3). */
  bodyLocal(bodyOrId, out = new Vector3()) {
    const b = typeof bodyOrId === 'string' ? this.system.bodies.find((q) => q.id === bodyOrId) : bodyOrId;
    const s = bodyPosition(this.system, b, this.time);
    return out.set(s.x - this.origin.x, s.y - this.origin.y, s.z - this.origin.z);
  }
  /** Coordenadas do sistema → locais. */
  toLocal(sx, sy, sz, out = new Vector3()) {
    return out.set(sx - this.origin.x, sy - this.origin.y, sz - this.origin.z);
  }
  /** Locais → coordenadas do sistema ({x,y,z} double). */
  toSystem(v) {
    return { x: v.x + this.origin.x, y: v.y + this.origin.y, z: v.z + this.origin.z };
  }

  setFocus(obj) {
    this.focus = obj;
  }

  /** Move um objeto para outro pai preservando a transformação no mundo. */
  reparent(obj, parent) {
    if (obj.parent === parent) return;
    obj.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    _m.copy(parent.matrixWorld).invert().multiply(obj.matrixWorld);
    _m.decompose(obj.position, obj.quaternion, obj.scale);
    parent.add(obj);
  }

  /** Chamado pelo núcleo a cada frame (antes de renderizar). */
  rebase() {
    if (!this.focus) return;
    this.focus.getWorldPosition(_v);
    if (_v.lengthSq() < SHIFT_DIST * SHIFT_DIST) return;
    this.shift(_v.x, _v.y, _v.z);
  }

  /** Desloca a origem em (x,y,z) metros locais. */
  shift(x, y, z) {
    this.origin.x += x;
    this.origin.y += y;
    this.origin.z += z;
    for (const c of this.ctx.root.children) {
      c.position.x -= x;
      c.position.y -= y;
      c.position.z -= z;
    }
    const cam = this.ctx.camera;
    if (cam.parent === this.ctx.scene) cam.position.set(cam.position.x - x, cam.position.y - y, cam.position.z - z);
    this.ctx.bus.emit('world:originShift', { x, y, z });
  }
}
