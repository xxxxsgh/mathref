/**
 * SHIP — nave do jogador: modelo procedural, física de voo atmosférica e
 * espacial, reentrada, pulso, pouso/decolagem assistidos, câmera de 3ª
 * pessoa cinematográfica, embarcar/desembarcar. Publica o serviço `ship`.
 *
 * Arquivos:
 *   model.js      geometria procedural (casco, canopi, naceles, asas, greebles, trem)
 *   materials.js  PBR com detalhe triplanar (painéis, sujeira, lascas, calor)
 *   textures.js   texturas procedurais (painéis/normal, brilho, poeira)
 *   fx.js         chamas, plasma de reentrada, estrias do pulso, poeira do solo
 *   flight.js     controlador de voo (modos 'ship' e 'space') + auto-piloto
 *   util.js       loft, fusão de peças, RNG
 *
 * Serviço `ship` (CONTRACT §13) + extras para cockpit/combate:
 *   state, worldPos, quaternion, speed, velocity, land(), takeoff(), pulse(on),
 *   warp(id), board(), exit(), throttle, heat, air, altitude, gear, shield,
 *   hull, damage(n), target (definido pelo combate), kit (fábrica de cascos
 *   para naves de IA e para o cockpit), muzzles(), points.
 *
 * Presets (preset.params.ship): { state, throttle, heat, gear, pulse,
 *   speed, cam: { az, el, dist, look:[x,y,z], roll, fov }, place: { dist,
 *   bearing, heading } (nave pousada vista a pé) }.
 */
import * as THREE from 'three';
import { WorldPos } from '../../core/Space.js';
import { buildShipGeometry, PALETTES, SHIP_POINTS } from './model.js';
import { createPanelMaterial, createGlassMaterial, createEmissiveMaterial } from './materials.js';
import { generateHullDetail } from './textures.js';
import { EnginePlumes, ReentryPlasma, SpeedStreaks, GroundDust } from './fx.js';
import { paint, mergePainted, bevelBox, plate, mat, loft, spline } from './util.js';
import { makeGlowTexture } from './textures.js';
import { ShipController } from './flight.js';

const DEG = Math.PI / 180;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export default {
  name: 'ship',
  order: 40,

  async init(ctx) {
    this.ctx = ctx;
    const q = ctx.quality || {};
    const lvl = q.level || 'high';
    const texSize = lvl === 'low' ? 512 : 1024;
    this.detailLevel = lvl === 'low' ? 0.5 : 1;

    await ctx.bootProgress?.('nave: texturas', 0.1);
    const tex = generateHullDetail(texSize, 7);
    this.tex = tex;
    this.materials = new Map();

    await ctx.bootProgress?.('nave: casco', 0.5);
    // estado compartilhado
    const S = (this.S = {
      state: 'flying',
      throttle: 0.45,
      heat: 0,
      air: 1,
      atmTop: 10000,
      gear: 0,
      gearTarget: 0,
      pulsing: false,
      requestPulse: undefined,
      boost: false,
      bank: 0,
      shield: 1,
      hull: 1,
      auto: null,
      worldPos: new WorldPos(),
      quaternion: new THREE.Quaternion(),
      renderPos: new WorldPos(),
      renderQuat: new THREE.Quaternion(),
      api: null,
      cameraHook: null,
      target: null,
    });

    // ── nave do jogador
    this.view = this.createHull('explorer', 11, this.detailLevel);
    this.view.group.name = 'ship:player';
    ctx.scene.add(this.view.group);
    this.plasma = new ReentryPlasma();
    ctx.scene.add(this.plasma.group);
    this.streaks = new SpeedStreaks(lvl === 'low' ? 200 : 420);
    ctx.scene.add(this.streaks.mesh);
    this.dust = new GroundDust(lvl === 'low' ? 70 : 140);
    this.dustGroup = new THREE.Group();
    this.dustGroup.add(this.dust.points);
    ctx.scene.add(this.dustGroup);
    ctx.services.render?.registerSelectiveBloom?.(this.view.plumes.mesh);

    // ── controlador de voo
    this.ctrl = new ShipController(S);
    ctx.player.setController('ship', this.ctrl);
    ctx.player.setController('space', this.ctrl);
    ctx.player.cockpitEye.copy(SHIP_POINTS.eye);
    ctx.player.thirdPerson.ship = { back: 24, up: 6 };
    ctx.player.thirdPerson.space = { back: 26, up: 6.5 };
    S.cameraHook = (p, c, cam) => this.cameraHook(p, c, cam);

    // câmera cinematográfica
    this.cam = { q: new THREE.Quaternion(), init: false, fov: 70, shake: 0 };
    this.time = 0;
    this.lastCam = new WorldPos();
    this.hasLastCam = false;

    // pouso/embarque iniciais: se o jogo começa a pé, a nave fica pousada perto
    this.offs = [
      ctx.bus.on('space:recenter', ({ offset }) => {
        if (ctx.player.mode === 'walk') S.worldPos.add(offset);
      }),
      ctx.bus.on('player:mode', ({ mode }) => {
        if (mode !== 'walk') this.cam.init = false;
      }),
      ctx.bus.on('quality:change', () => {}),
    ];

    this.publish();
    this.applyShotParams();
  },

  /** Cria um casco completo (usado pelo jogador, IA e cockpit). */
  createHull(paletteName = 'explorer', seed = 11, detail = 1) {
    const palette = PALETTES[paletteName] || PALETTES.explorer;
    const key = `${paletteName}:${seed}:${detail}`;
    let geo = this._geoCache?.get(key);
    if (!geo) {
      geo = buildShipGeometry({ palette, seed, detail });
      (this._geoCache ||= new Map()).set(key, geo);
    }
    const mats = this.getMaterials(paletteName);
    const group = new THREE.Group();
    const hull = new THREE.Mesh(geo.hull, mats.panel);
    hull.castShadow = hull.receiveShadow = true;
    hull.name = 'hull';
    const glass = new THREE.Mesh(geo.glass, mats.glass);
    glass.name = 'glass';
    glass.renderOrder = 2;
    const emis = new THREE.Mesh(geo.emissive, mats.emissive);
    emis.name = 'lights';
    group.add(hull, glass, emis);
    const gear = geo.gear.map((g) => {
      const pivot = new THREE.Group();
      pivot.position.copy(g.pivot);
      const m = new THREE.Mesh(g.geo, mats.panel);
      m.castShadow = m.receiveShadow = true;
      pivot.add(m);
      pivot.userData.stow = g.stowAngle;
      group.add(pivot);
      return pivot;
    });
    const plumes = new EnginePlumes(SHIP_POINTS.engines, palette.glow);
    group.add(plumes.mesh);
    const setGear = (k) => {
      for (const p of gear) {
        p.rotation.x = p.userData.stow * (1 - k);
        p.visible = k > 0.02;
      }
    };
    setGear(0);
    return { group, hull, glass, emis, gear, plumes, setGear, palette, materials: mats };
  },

  getMaterials(paletteName) {
    let m = this.materials.get(paletteName);
    if (m) return m;
    const panel = createPanelMaterial({ detail: this.tex.detail, normal: this.tex.normal, scale: 0.42, grime: paletteName === 'hostile' ? 1.3 : 1, wear: 1 });
    m = { panel, glass: createGlassMaterial(), emissive: createEmissiveMaterial(6) };
    this.materials.set(paletteName, m);
    return m;
  },

  publish() {
    const self = this;
    const ctx = this.ctx;
    const S = this.S;
    const p = ctx.player;
    const piloting = () => p.mode !== 'walk';
    const api = {
      get state() {
        return S.state;
      },
      get worldPos() {
        return piloting() ? p.worldPos : S.worldPos;
      },
      get quaternion() {
        return piloting() ? p.quaternion : S.quaternion;
      },
      get renderPos() {
        return S.renderPos;
      },
      get renderQuat() {
        return S.renderQuat;
      },
      get velocity() {
        // modo shot: velocidade nominal do preset ao longo do nariz
        if (p.frozen && self.shotP?.speed != null && piloting()) return _v.set(0, 0, -self.shotP.speed).applyQuaternion(p.quaternion);
        return piloting() ? p.velocity : _v.set(0, 0, 0);
      },
      get speed() {
        if (p.frozen && self.shotP?.speed != null && piloting()) return self.shotP.speed;
        return piloting() ? p.velocity.length() : 0;
      },
      get altitude() {
        return piloting() ? p.altitude : 0;
      },
      get throttle() {
        return S.throttle;
      },
      get heat() {
        return S.heat;
      },
      get air() {
        return S.air;
      },
      get gear() {
        return S.gear;
      },
      get pulsing() {
        return S.pulsing;
      },
      get boost() {
        return S.boost;
      },
      get bank() {
        return S.bank;
      },
      get shield() {
        return S.shield;
      },
      get hull() {
        return S.hull;
      },
      get piloting() {
        return piloting();
      },
      get controller() {
        return self.ctrl;
      },
      target: null,
      points: SHIP_POINTS,
      /** fábrica de cascos (IA, cockpit). paletteName: explorer | hostile | trader */
      kit: {
        createHull: (pal, seed, detail) => self.createHull(pal, seed, detail ?? self.detailLevel * 0.6),
        get panelTextures() {
          return self.tex;
        },
        createPanelMaterial: (o) => createPanelMaterial({ detail: self.tex.detail, normal: self.tex.normal, ...o }),
        createEmissiveMaterial,
        /** o MESMO casco do jogador (geometria compartilhada) — o cockpit o desenha em 1ª pessoa */
        createPlayerHull: () => self.createHull('explorer', 11, self.detailLevel),
        makeGlowTexture,
        /** ponto/normal na superfície do canopi (z, ângulo 0..π) */
        canopySample: (z, ang) => self.view && self._geoCache?.values().next().value?.canopySample?.(z, ang),
        /** utilitários de geometria (peças pintadas fundidas numa malha) */
        geo: { paint, mergePainted, bevelBox, plate, mat, loft, spline },
      },
      /** posições de mundo (WorldPos) das bocas dos canhões neste passo */
      muzzles(out = []) {
        const pos = api.worldPos;
        const qq = api.quaternion;
        SHIP_POINTS.muzzles.forEach((m, i) => {
          out[i] = (out[i] || new WorldPos()).copy(pos).add(_v.copy(m).applyQuaternion(qq));
        });
        return out;
      },
      damage(n = 0.1) {
        if (S.shield > 0) S.shield = Math.max(0, S.shield - n);
        else S.hull = Math.max(0, S.hull - n * 0.6);
        S.lastHit = ctx.time.now;
        ctx.bus.emit('ship:damage', { shield: S.shield, hull: S.hull });
      },
      land() {
        if (!piloting() || S.auto) return Promise.resolve(false);
        return new Promise((resolve) => {
          S.pulsing = false;
          S.auto = { kind: 'landing', t: 0, resolve: () => resolve(true) };
        });
      },
      takeoff() {
        if (!piloting()) return Promise.resolve(false);
        if (S.auto?.kind !== 'landed') return Promise.resolve(false);
        return new Promise((resolve) => {
          S.auto = { kind: 'takeoff', t: 0, resolve: () => resolve(true) };
          S.state = 'flying';
        });
      },
      pulse(on = !S.pulsing) {
        S.requestPulse = !!on;
        return S.requestPulse;
      },
      warp(systemId) {
        const uni = ctx.services.universe;
        if (!uni?.warpTo) return Promise.resolve(false);
        S.state = 'warp';
        ctx.bus.emit('ship:warp', { systemId });
        return Promise.resolve(uni.warpTo(systemId)).finally(() => {
          S.state = p.mode === 'space' ? 'space' : 'flying';
        });
      },
      board() {
        if (piloting()) return false;
        p.setMode('ship');
        p.worldPos.copy(S.worldPos);
        p.quaternion.copy(S.quaternion);
        p.velocity.set(0, 0, 0);
        p.cockpitEye.copy(SHIP_POINTS.eye);
        S.auto = { kind: 'landed', t: 0 };
        S.state = 'landed';
        S.gear = S.gearTarget = 1;
        p.snap();
        ctx.bus.emit('ship:board', {});
        return true;
      },
      exit() {
        if (!piloting() || S.auto?.kind !== 'landed') return false;
        S.worldPos.copy(p.worldPos);
        S.quaternion.copy(p.quaternion);
        // desce pela esquerda da nave
        const out = _v2.set(-4.8, 0, -1.5).applyQuaternion(p.quaternion);
        const pos = new WorldPos().copy(p.worldPos).add(out);
        p.setMode('walk');
        p.place({ worldPos: pos, heading: 0, pitch: 0 });
        // vira para a nave
        const toShip = _v3.set(S.worldPos.x - p.worldPos.x, S.worldPos.y - p.worldPos.y, S.worldPos.z - p.worldPos.z);
        const head = ctx.Geo?.headingOf ? ctx.Geo.headingOf(p.up, toShip) : 0;
        if (ctx.Geo?.quatFromHeadingPitch) ctx.Geo.quatFromHeadingPitch(p.up, head, 0, p.quaternion);
        p.snap();
        S.state = 'landed';
        ctx.bus.emit('ship:exit', {});
        return true;
      },
      /** distância (m) do jogador à nave (a pé) */
      distanceToPlayer() {
        const a = S.worldPos;
        const b = p.worldPos;
        return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      },
    };
    S.api = api;
    this.api = ctx.provide('ship', api);
    // o provide pode devolver um objeto mesclado; mantém as duas referências
    S.api = this.api || api;
  },

  /** Aplica preset.params.ship (modo shot). */
  applyShotParams() {
    const ctx = this.ctx;
    const P = ctx.shot?.preset?.params?.ship;
    this.shotP = P || null;
    if (!P) {
      // fora do modo shot: se começou a pé, pousa a nave ao lado
      if (!ctx.shot) this.pendingStartLanding = true;
      return;
    }
    const S = this.S;
    S.throttle = P.throttle ?? S.throttle;
    S.heat = P.heat ?? 0;
    S.gear = S.gearTarget = P.gear ?? (P.state === 'landed' ? 1 : 0);
    S.pulsing = !!P.pulse;
    S.state = P.state || S.state;
    S.shield = P.shield ?? 1;
    if (P.state === 'landed') S.auto = { kind: 'landed', t: 0 };
  },

  update(dt, ctx) {
    const S = this.S;
    const p = ctx.player;
    const input = ctx.input;
    this.time += dt;
    // a nave do jogo pousada ao lado no início a pé
    if (this.pendingStartLanding && p.mode === 'walk' && ctx.time.frame > 0) {
      this.pendingStartLanding = false;
      this.placeLandedNear(p, { dist: 16, bearing: 35, heading: -60 });
    } else if (this.pendingStartLanding && p.mode !== 'walk') this.pendingStartLanding = false;

    // posição do preset "nave pousada vista do solo" (acompanha a reaplicação da pose)
    if (this.shotP?.place && p.mode === 'walk') this.placeLandedNear(p, this.shotP.place);

    // F: pousar / desembarcar / embarcar
    if (!p.frozen && p.moveEnabled && input.pressed('interact')) {
      if (p.mode === 'walk') {
        if (this.api.distanceToPlayer() < 10) {
          input.consume('interact');
          this.api.board();
        }
      } else if (S.auto?.kind === 'landed') {
        input.consume('interact');
        this.api.exit();
      } else if (!S.auto && p.altitude < 450 && !S.pulsing) {
        input.consume('interact');
        this.api.land();
      }
    }
    if (p.mode !== 'walk') {
      S.worldPos.copy(p.worldPos);
      S.quaternion.copy(p.quaternion);
    }
    // trem de pouso
    const gk = 1 - Math.exp(-dt * 1.6);
    S.gear += (S.gearTarget - S.gear) * gk;
    if (Math.abs(S.gearTarget - S.gear) < 0.002) S.gear = S.gearTarget;
    // escudo regenera
    if (S.shield < 1 && ctx.time.now - (S.lastHit || -99) > 4) S.shield = Math.min(1, S.shield + dt * 0.08);
  },

  /** Põe a nave pousada perto do jogador (a pé). */
  placeLandedNear(p, o) {
    const S = this.S;
    const ctx = this.ctx;
    const planet = ctx.services.planet;
    if (!planet) return;
    const c = planet.center || ctx.space.planetCenter;
    const up = p.up.clone();
    const fwd = _v.set(0, 0, -1).applyQuaternion(p.quaternion);
    fwd.addScaledVector(up, -fwd.dot(up)).normalize();
    const dir = fwd.clone().applyAxisAngle(up, -(o.bearing ?? 0) * DEG);
    const pos = new THREE.Vector3(p.worldPos.x, p.worldPos.y, p.worldPos.z).addScaledVector(dir, o.dist ?? 16);
    const d = _v2.set(pos.x - c.x, pos.y - c.y, pos.z - c.z).normalize();
    const R = planet.radius + (planet.heightAt?.(d) || 0);
    // usa o ponto mais alto sob as três sapatas para não enterrar
    S.worldPos.set(c.x, c.y, c.z).addScaledVector(d, R + SHIP_POINTS.gearHeight + (o.lift ?? 0));
    const n = planet.normalAt ? planet.normalAt(d, new THREE.Vector3()) : d.clone();
    const lvl = d.clone().lerp(n, 0.5).normalize();
    // nariz: direção do jogador → nave girada por `heading`
    const nose = dir.clone().applyAxisAngle(lvl, -(o.heading ?? 0) * DEG);
    nose.addScaledVector(lvl, -nose.dot(lvl)).normalize();
    const right = new THREE.Vector3().crossVectors(nose, lvl).normalize();
    _m.makeBasis(right, lvl, nose.clone().negate());
    S.quaternion.setFromRotationMatrix(_m);
    // apoia pelas 3 sapatas: sobe/desce até a sapata mais "enterrada" tocar o solo
    let lift = -Infinity;
    for (const f of [[0, -4.5], [2.55, 3.3], [-2.55, 3.3]]) {
      const fp = _v3.set(f[0], -SHIP_POINTS.gearHeight, f[1]).applyQuaternion(S.quaternion).add(S.worldPos);
      const fd = _v2.set(fp.x - c.x, fp.y - c.y, fp.z - c.z);
      const r = fd.length();
      fd.multiplyScalar(1 / r);
      const gR = planet.radius + (planet.heightAt?.(fd) || 0);
      lift = Math.max(lift, gR - r);
    }
    if (Number.isFinite(lift)) S.worldPos.addScaledVector(d, lift);
    S.state = 'landed';
    S.gear = S.gearTarget = 1;
    S.throttle = 0;
  },

  /** Câmera de 3ª pessoa: perseguição com atraso, FOV com a velocidade, tremor. */
  cameraHook(p, ctx, cam) {
    if (p.view !== 'third') return;
    const S = this.S;
    const C = this.cam;
    const dt = Math.min(0.1, ctx.time.frameDt || 1 / 60);
    const pos = p.renderPos;
    const qShip = p.renderQuat;
    const P = this.shotP?.cam;
    if (P) {
      // enquadramento do preset: esférico no referencial da nave
      const az = (P.az ?? 0) * DEG;
      const el = (P.el ?? 10) * DEG;
      const dist = P.dist ?? 26;
      const off = _v.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(dist).applyQuaternion(qShip);
      cam.worldPos.copy(pos).add(off);
      const look = _v2.fromArray(P.look || [0, 0, 0]).applyQuaternion(qShip);
      const target = _v3.copy(pos).add(look).sub(cam.worldPos);
      const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(qShip);
      if (P.worldUp) upv.copy(p.up);
      _m.lookAt(new THREE.Vector3(0, 0, 0), target, upv);
      // lookAt de Matrix4 olha de eye→target com −Z; queremos −Z apontando ao alvo
      cam.quaternion.setFromRotationMatrix(_m);
      if (P.roll) cam.quaternion.multiply(_q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), P.roll * DEG));
      if (P.fov) cam.fov = P.fov;
      return;
    }
    if (!C.init) {
      C.q.copy(qShip);
      C.init = true;
    }
    const speed = p.velocity.length();
    C.q.slerp(qShip, 1 - Math.exp(-dt * (S.pulsing ? 8 : 4.5)));
    const sp = clamp(speed / 320, 0, 1);
    const back = 21 + sp * 6 + (S.pulsing ? 6 : 0);
    const upo = 5.2 + sp * 0.8;
    const off = _v.set(0, upo, back).applyQuaternion(C.q);
    cam.worldPos.copy(pos).add(off);
    const fwd = _v2.set(0, 0, -1).applyQuaternion(qShip);
    const target = _v3.copy(pos).addScaledVector(fwd, 14).sub(cam.worldPos);
    const upv = new THREE.Vector3(0, 1, 0).applyQuaternion(C.q);
    _m.lookAt(new THREE.Vector3(0, 0, 0), target, upv);
    cam.quaternion.setFromRotationMatrix(_m);
    // tremor: reentrada, pós-combustor, pulso
    const shake = S.heat * 0.012 + (S.boost ? 0.003 : 0) + (S.pulsing ? 0.004 : 0);
    if (shake > 0) {
      const t = this.time * 37;
      cam.quaternion.multiply(_q.setFromEuler(new THREE.Euler(Math.sin(t) * shake, Math.sin(t * 1.3 + 1) * shake, Math.sin(t * 0.7 + 2) * shake * 0.5)));
    }
    cam.fov = (p.fov || 70) + sp * 10 + (S.pulsing ? 22 : 0);
    // não entra no solo
    const planet = p.planet;
    if (planet) {
      const c = p.center;
      const d = _v.set(cam.worldPos.x - c.x, cam.worldPos.y - c.y, cam.worldPos.z - c.z);
      const r = d.length();
      d.multiplyScalar(1 / r);
      const g = planet.radius + (planet.heightAt?.(d) || 0) + 1.2;
      if (r < g) cam.worldPos.set(c.x, c.y, c.z).addScaledVector(d, g);
    }
  },

  frame(dt, ctx) {
    const S = this.S;
    const p = ctx.player;
    const V = this.view;
    const t = (this.fxTime = (this.fxTime || 0) + (ctx.time.frozen ? 1 / 60 : dt));
    const piloting = p.mode !== 'walk';
    if (piloting) {
      S.renderPos.copy(p.renderPos);
      S.renderQuat.copy(p.renderQuat);
    } else {
      S.renderPos.copy(S.worldPos);
      S.renderQuat.copy(S.quaternion);
    }
    // visibilidade: em 1ª pessoa o cockpit desenha o casco no referencial da nave
    const firstPerson = piloting && p.view === 'first';
    V.group.visible = !firstPerson;
    ctx.space.toRender(S.renderPos, V.group.position);
    V.group.quaternion.copy(S.renderQuat);
    V.setGear(S.gear);
    const engineOn = piloting && S.state !== 'landed' ? 1 : this.shotP?.throttle != null && S.state !== 'landed' ? 1 : 0;
    const thr = engineOn ? clamp(S.throttle * (S.boost ? 1.3 : 1) + (S.pulsing ? 0.4 : 0), 0.08, 1.2) : this.shotP?.idle ? 0.06 : 0;
    V.plumes.update(t, thr, S.air);
    V.plumes.mesh.visible = thr > 0.01;

    // calor no casco e plasma orientado pelo vento relativo
    const heat = S.heat;
    const panel = V.materials.panel.userData.uniforms;
    panel.uHeat.value = heat;
    const vel = piloting ? p.velocity : _v.set(0, 0, 0);
    const wind = _v2.copy(vel);
    if (wind.lengthSq() < 1) wind.set(0, 0, -1).applyQuaternion(S.renderQuat);
    wind.normalize();
    _q.copy(S.renderQuat).invert();
    panel.uHeatDir.value.copy(wind).applyQuaternion(_q).normalize();
    this.plasma.update(t, heat);
    if (heat > 0.01) {
      this.plasma.group.position.copy(V.group.position);
      // −Z do plasma ao longo do movimento
      _m.lookAt(new THREE.Vector3(0, 0, 0), wind, new THREE.Vector3(0, 1, 0).applyQuaternion(S.renderQuat));
      this.plasma.group.quaternion.setFromRotationMatrix(_m);
    }

    // estrias do pulso / poeira de velocidade (no espaço)
    const cw = p.cameraWorld;
    const move = _v3.set(0, 0, 0);
    if (this.hasLastCam) move.set(cw.x - this.lastCam.x, cw.y - this.lastCam.y, cw.z - this.lastCam.z);
    this.lastCam.copy(cw);
    this.hasLastCam = true;
    if (move.lengthSq() > 1e10) move.set(0, 0, 0);
    const speed = piloting ? p.velocity.length() : 0;
    const spaceK = 1 - clamp(S.air * 20, 0, 1);
    let k = 0;
    let stretch = 1;
    if (S.pulsing) {
      k = 1;
      stretch = 60;
    } else if (piloting && speed > 60) {
      k = clamp((speed - 60) / 900, 0, 0.6) * spaceK + clamp((speed - 200) / 400, 0, 0.15) * (1 - spaceK);
      stretch = 1 + speed * 0.015;
    }
    const dir = _v.copy(vel.lengthSq() > 1 ? vel : _v.set(0, 0, -1).applyQuaternion(S.renderQuat)).normalize();
    this.streaks.uniforms.uColor.value.setRGB(S.pulsing ? 0.75 : 0.85, S.pulsing ? 0.85 : 0.9, 1.0);
    this.streaks.update(S.pulsing ? move.clone().multiplyScalar(0.0015) : move, dir, k, stretch);

    // poeira no solo: empuxo perto do chão (pouso, decolagem, voo rasante)
    let dustK = 0;
    const altShip = piloting ? p.altitude : SHIP_POINTS.gearHeight;
    if (piloting && S.state !== 'landed') dustK = clamp(1 - (altShip - 2) / 35, 0, 1) * clamp(thr * 2, 0.3, 1);
    if (this.shotP?.dust != null) dustK = this.shotP.dust;
    if (dustK > 0.01) {
      const planet = ctx.services.planet;
      const c = planet?.center || ctx.space.planetCenter;
      const d = _v2.set(S.renderPos.x - c.x, S.renderPos.y - c.y, S.renderPos.z - c.z).normalize();
      const R = (planet?.radius ?? 0) + (planet?.heightAt?.(d) || 0);
      const gp = new WorldPos().set(c.x, c.y, c.z).addScaledVector(d, R);
      ctx.space.toRender(gp, this.dustGroup.position);
      this.dustGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      const pal = planet?.biomeAt?.(d)?.palette || planet?.palette;
      const col = pal?.sand || pal?.rock || null;
      if (col) this.dust.uniforms.uColor.value.setRGB(col[0] ?? col.r, col[1] ?? col.g, col[2] ?? col.b).multiplyScalar(1.1);
      const sky = ctx.services.sky;
      this.dust.uniforms.uLight.value = clamp((sky?.sunIntensity ?? 3) / 3, 0.15, 1.5);
    }
    this.dust.update(ctx.time.frozen ? 1 / 60 : dt, dustK);
    if (ctx.time.frozen && dustK > 0.01 && !this._dustWarm) {
      // shot: avança a nuvem para um estado "desenvolvido"
      this._dustWarm = true;
      this.dust.update(2.5, dustK);
    }
  },

  dispose(ctx) {
    for (const off of this.offs || []) off();
    ctx.scene.remove(this.view.group, this.plasma.group, this.streaks.mesh, this.dustGroup);
  },
};
