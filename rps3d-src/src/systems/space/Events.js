// Eventos espaciais aleatórios — apenas o SPAWN visual e os dados; combat,
// story e hud dão a jogabilidade (escutam 'space:event').
//
//   derelict  nave à deriva (casco quebrado girando, luzes de navegação
//             falhando, faíscas) — pode ser abordada (data.boardable)
//   distress  sinal de socorro: baliza com estroboscópio e pulsos de rádio
//   ambush    emboscada: marcador para o combat gerar inimigos (data.faction)
//   ionstorm  tempestade de íons (IonStorm) com relâmpagos e interferência
//
// Eventos têm posição no referencial do SISTEMA (double) e expõem a posição
// local atual em events(). Somem quando o jogador se afasta muito.

import * as THREE from 'three/webgpu';
import { makeRng, hash } from '../../core/Rng.js';
import { debrisGeometries, debrisMaterial, PAINTS } from './DebrisKit.js';
import { glowSprite } from './Glow.js';
import { IonStorm } from './IonStorm.js';

const FACTIONS = ['hegemony', 'free', 'corsairs', 'guild'];
const NAMES = {
  derelict: ['Cargueiro Aurora-7', 'Transporte Benedita', 'Rebocador Kessler', 'Patrulha HS-114', 'Mineradora Caliandra', 'Nave-colmeia sem registro'],
  distress: ['Cápsula de fuga', 'Baliza de emergência', 'Sinal civil fraco', 'Sinal codificado da Frente Livre'],
};

export class Events {
  constructor(ctx) {
    this.ctx = ctx;
    this.group = new THREE.Group();
    this.group.name = 'space-events';
    this.list = [];
    this.seq = 0;
    this.rng = makeRng(hash('space-events', Date.now() & 0xffff));
    this.cooldown = 90;
    this.auto = true;
  }

  setSeed(s) {
    this.rng = makeRng(hash('space-events', s));
  }

  /**
   * Cria um evento. `sysPos` {x,y,z} em coordenadas do sistema.
   * @returns o registro do evento
   */
  spawn(type, sysPos, data = {}) {
    const id = `ev-${type}-${++this.seq}`;
    const r = makeRng(hash(id, sysPos.x | 0, sysPos.z | 0));
    const ev = { id, type, sys: { ...sysPos }, data: { ...data }, object3d: null, age: 0, ttl: data.ttl ?? 1800 };
    if (type === 'derelict') {
      ev.data.name ??= r.pick(NAMES.derelict);
      ev.data.faction ??= r.pick(FACTIONS);
      ev.data.boardable ??= true;
      ev.object3d = this.makeDerelict(r, ev.data.faction);
    } else if (type === 'distress') {
      ev.data.name ??= r.pick(NAMES.distress);
      ev.data.trap ??= r() < 0.3; // às vezes é isca de corsários
      ev.object3d = this.makeBeacon(r);
    } else if (type === 'ambush') {
      ev.data.faction ??= r.pick(['corsairs', 'corsairs', 'hegemony']);
      ev.data.count ??= r.int(2, 5);
      ev.object3d = new THREE.Group(); // só marcador
    } else if (type === 'ionstorm') {
      const radius = data.radius ?? r.range(12000, 22000);
      ev.data.radius = radius;
      ev.storm = new IonStorm(this.ctx, id, sysPos, radius, hash(id));
      ev.object3d = ev.storm.group;
    }
    ev.object3d.name = id;
    this.group.add(ev.object3d);
    this.list.push(ev);
    const local = this.ctx.world.toLocal(ev.sys.x, ev.sys.y, ev.sys.z);
    this.ctx.bus.emit('space:event', { event: this.view(ev, local) });
    this.announce(ev);
    return ev;
  }

  /** Integração opcional com hud (marcador) e rádio (legenda/estática). */
  announce(ev) {
    const hud = this.ctx.get('hud');
    const LABEL = { derelict: ev.data.name || 'Nave à deriva', distress: 'Sinal de socorro', ionstorm: 'Tempestade de íons', ambush: null };
    const COLOR = { derelict: '#9fb4c8', distress: '#ff5a3a', ionstorm: '#8f7bff' };
    try {
      if (hud?.marker && LABEL[ev.type]) hud.marker(ev.id, { object3d: ev.object3d, label: LABEL[ev.type], color: COLOR[ev.type], kind: 'event' });
    } catch (e) {
      /* hud opcional */
    }
    if (ev.type === 'distress') {
      this.ctx.bus.emit('radio', { from: ev.data.name, faction: ev.data.trap ? 'corsairs' : 'guild', text: 'Aqui é uma nave civil... suporte de vida falhando... alguém na escuta? Por favor...', duration: 6 });
    } else if (ev.type === 'ionstorm') {
      this.ctx.bus.emit('radio', { from: 'Alerta de navegação', faction: 'guild', text: 'Tempestade de íons detectada no setor. Interferência em sensores e comunicações.', duration: 5 });
    }
  }

  view(ev, local) {
    return { id: ev.id, type: ev.type, position: local || this.ctx.world.toLocal(ev.sys.x, ev.sys.y, ev.sys.z), data: ev.data, object3d: ev.object3d };
  }

  remove(id) {
    const i = this.list.findIndex((e) => e.id === id);
    if (i < 0) return;
    const ev = this.list[i];
    if (ev.storm) ev.storm.dispose();
    else
      ev.object3d.traverse((o) => {
        if (o.isMesh && o.material && !o.userData.sharedGeo) o.material.dispose?.();
      });
    ev.object3d.removeFromParent();
    this.list.splice(i, 1);
    try {
      this.ctx.get('hud')?.unmarker?.(id);
    } catch (e) {
      /* hud opcional */
    }
    this.ctx.bus.emit('space:eventEnd', { id });
  }

  makeDerelict(r, faction) {
    const g = new THREE.Group();
    const geos = debrisGeometries();
    const pal = PAINTS[faction] || PAINTS.civil;
    const paint = r.pick(pal);
    // casco inteiro (~90 m) avariado + pedaços soltos ao redor
    const parts = [
      ['hull', [0, 0, 0], [0, 0, 0], 2.2],
      ['plate', [16, 9, -14], [0.5, 0.2, 0.9], 1.6],
      ['plate', [-14, -6, 22], [1.1, 0.4, 0.2], 1.2],
      ['girder', [-19, 5, -6], [0.2, 0.9, 0.4], 1.4],
      ['container', [9, -9, 30], [0.3, 0.6, 0.1], 1.0],
      ['tank', [-6, 13, 34], [Math.PI / 2, 0.3, 0], 0.9],
    ];
    for (const [kind, p, rot, s] of parts) {
      const pa = new THREE.InstancedBufferAttribute(new Float32Array([paint[0], paint[1], paint[2], r.range(0.15, 0.4)]), 4);
      const fa = new THREE.InstancedBufferAttribute(new Float32Array([r() * 100, kind === 'hull' ? 0.4 : r.range(0.3, 0.9), kind === 'hull' ? 0.9 : r() < 0.5 ? 0.8 : 0, s]), 4);
      const mesh = new THREE.InstancedMesh(geos[kind], debrisMaterial(pa, fa), 1);
      mesh.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(s, s, s)));
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.sharedGeo = true;
      g.add(mesh);
    }
    // luzes de navegação falhando + estrobo de emergência
    const red = glowSprite({ color: 0xff2a1a, size: 1.6, minPx: 2.5, intensity: 14, period: 1.7, duty: 0.12, phase: 0 });
    red.position.set(-13.2, 0.9, 6);
    const green = glowSprite({ color: 0x2aff6a, size: 1.6, minPx: 2.5, intensity: 14, period: 1.7, duty: 0.12, phase: 0.5 });
    green.position.set(13.2, 0.9, 6);
    const strobe = glowSprite({ color: 0xffffff, size: 2.5, minPx: 3.5, intensity: 30, period: 2.9, duty: 0.05, phase: 0.2 });
    strobe.position.set(0, 15.4, 19.8);
    g.add(red, green, strobe);
    g.userData.spin = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
    g.userData.rate = r.range(0.01, 0.04);
    g.quaternion.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
    return g;
  }

  makeBeacon(r) {
    const g = new THREE.Group();
    const geos = debrisGeometries();
    const pa = new THREE.InstancedBufferAttribute(new Float32Array([0.85, 0.45, 0.1, 0.2]), 4);
    const fa = new THREE.InstancedBufferAttribute(new Float32Array([r() * 100, 0.1, 0, 0.6]), 4);
    const body = new THREE.InstancedMesh(geos.tank, debrisMaterial(pa, fa), 1);
    body.setMatrixAt(0, new THREE.Matrix4().makeScale(0.6, 0.6, 0.6));
    body.userData.sharedGeo = true;
    g.add(body);
    const strobe = glowSprite({ color: 0xff3b22, size: 2, minPx: 4, intensity: 40, period: 1.2, duty: 0.18 });
    strobe.position.set(0, 1.8, 0);
    const pulse = glowSprite({ color: 0xff5530, size: 45, minPx: 0, intensity: 1.6, period: 2.4, ring: true });
    const pulse2 = glowSprite({ color: 0xff5530, size: 45, minPx: 0, intensity: 1.6, period: 2.4, ring: true, phase: 0.5 });
    g.add(strobe, pulse, pulse2);
    g.userData.spin = new THREE.Vector3(0.2, 1, 0.1).normalize();
    g.userData.rate = 0.3;
    return g;
  }

  /** Passo fixo. `player` = posição do sistema do foco; `mode` = ctx.mode. */
  update(dt, playerSys, mode) {
    for (const ev of this.list) {
      ev.age += dt;
      ev.storm?.update(dt);
    }
    // limpeza: muito longe ou expirado
    for (let i = this.list.length - 1; i >= 0; i--) {
      const ev = this.list[i];
      const d = Math.hypot(ev.sys.x - playerSys.x, ev.sys.y - playerSys.y, ev.sys.z - playerSys.z);
      if (!ev.data.persistent && (d > 400000 || ev.age > ev.ttl)) this.remove(ev.id);
    }
    // surgimento automático só pilotando
    if (!this.auto || mode !== 'ship') return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.cooldown = this.rng.range(150, 420);
    if (this.list.length >= 3 || this.rng() < 0.35) return;
    const types = ['derelict', 'distress', 'ambush', 'ionstorm', 'derelict', 'distress'];
    const type = this.rng.pick(types);
    const dir = new THREE.Vector3(this.rng() - 0.5, (this.rng() - 0.5) * 0.3, this.rng() - 0.5).normalize();
    const dist = type === 'ionstorm' ? this.rng.range(40000, 90000) : this.rng.range(8000, 25000);
    this.spawn(type, { x: playerSys.x + dir.x * dist, y: playerSys.y + dir.y * dist, z: playerSys.z + dir.z * dist });
  }

  /** Por frame: posiciona os objetos e anima. */
  frame(ctx, camLocal, time) {
    const w = ctx.world;
    this.group.position.set(0, 0, 0);
    for (const ev of this.list) {
      const o = ev.object3d;
      if (ev.storm) {
        ev.storm.frame(ctx, camLocal);
        continue;
      }
      o.position.set(ev.sys.x - w.origin.x, ev.sys.y - w.origin.y, ev.sys.z - w.origin.z);
      if (o.userData.spin) {
        if (!o.userData.q0) o.userData.q0 = o.quaternion.clone();
        o.quaternion.setFromAxisAngle(o.userData.spin, time * o.userData.rate).multiply(o.userData.q0);
      }
    }
  }

  /** Interferência total das tempestades (0..1). */
  interference() {
    let v = 0;
    for (const ev of this.list) if (ev.storm) v = Math.max(v, ev.storm.interference);
    return v;
  }

  active() {
    return this.list.map((ev) => this.view(ev));
  }

  clear() {
    for (const ev of [...this.list]) this.remove(ev.id);
  }
}
