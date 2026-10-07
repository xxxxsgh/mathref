/**
 * Ataque de morteiro (5 abates) com DESIGNADOR em tablet.
 *
 * Ao ativar, abre um tablet tático (DOM + canvas) com a vista de cima do
 * mapa: o mundo é renderizado UMA vez por uma câmera ortográfica a 80 m de
 * altura (num render target, tonemap ACES + gama aplicados à mão), girado
 * para que a frente do jogador fique para cima, e tratado como imagem de
 * satélite (contraste, leve tom verde-ciano, linhas de varredura, vinheta),
 * com grade de 10 m, anéis de distância, o jogador (seta âmbar), inimigos
 * conhecidos (revelados pela UAV ou à vista) e o retículo com o raio letal.
 *
 * Controles: mouse (movimento relativo, com pointer lock) ou WASD/setas
 * movem o retículo; botão esquerdo / Enter / F confirmam; botão direito /
 * Backspace / X cancelam (a killstreak volta para os prontos). Toque: tocar
 * no mapa posiciona, tocar no botão CONFIRMAR dispara. API:
 * `services.streaks.designator.{ move(dx,dz), confirm(), cancel() }`.
 *
 * Disparo: 8 granadas (strikePattern) em ~4 s, cada uma com assobio 3D
 * descendente 1,5 s antes, um risco luminoso caindo do céu e a explosão pelo
 * bus ('explosion' → vfx/áudio/câmera). Dano pelo caminho normal
 * (`collider.data.damage` com linha de visão, `source:'player'`,
 * `weapon/streak:'airstrike'`, `explosion:true`) — barris encadeiam. O
 * jogador não leva dano do próprio morteiro (só o tranco).
 */
import * as THREE from 'three';
import { strikePattern } from './logic.js';
import { el, streakIcon } from './ui.js';

const IMG = 512; // resolução da captura
const SPAN = 96; // metros cobertos pela captura
const RADIUS = 6.5; // raio de cada granada
const SPREAD = 7;

const _v = new THREE.Vector3();

export class Airstrike {
  constructor(feat) {
    this.f = feat;
    this.ctx = feat.ctx;
    this.open = false;
    this.shells = [];
  }

  // ─── designador ────────────────────────────────────────────────────────
  begin() {
    const ctx = this.ctx;
    const pl = ctx.player;
    this.open = true;
    this.center = pl.position.clone();
    this.yaw = pl.yaw; // frente do jogador = cima do tablet
    // retículo começa 28 m à frente
    const fwd = _v.set(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
    this.target = this.center.clone().addScaledVector(fwd, 28);
    this.capture();
    this.buildDom();
    this.f.lockActions(true);
    pl.lookEnabled = false;
    pl.moveEnabled = false;
    this.f.sfx.beep(1600, 0.05, 0.1);
    this.f.sfx.beep(2100, 0.05, 0.1);
    this.onMove = (e) => {
      if (!this.open) return;
      if (document.pointerLockElement) this.move(e.movementX * 0.08, e.movementY * 0.08);
    };
    this.onDown = (e) => {
      if (!this.open) return;
      if (e.button === 0 && document.pointerLockElement) this.confirm();
      else if (e.button === 2) this.cancel();
    };
    this.onKey = (e) => {
      if (!this.open) return;
      if (e.code === 'Enter' || e.code === 'KeyF') this.confirm();
      else if (e.code === 'Backspace' || e.code === 'KeyX') this.cancel();
    };
    document.addEventListener('mousemove', this.onMove);
    document.addEventListener('mousedown', this.onDown);
    window.addEventListener('keydown', this.onKey);
    ctx.bus.emit('designator:open', { id: 'airstrike' });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    const pl = this.ctx.player;
    pl.lookEnabled = true;
    pl.moveEnabled = true;
    this.f.lockActions(false);
    document.removeEventListener('mousemove', this.onMove);
    document.removeEventListener('mousedown', this.onDown);
    window.removeEventListener('keydown', this.onKey);
    this.dom?.remove();
    this.dom = null;
    this.ctx.bus.emit('designator:close', { id: 'airstrike' });
  }

  /** Move o retículo (metros, no referencial do tablet: x = direita, z = baixo). */
  move(dx, dz) {
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    // direita do tablet = direita do jogador; baixo = trás
    const rx = c, rz = -s; // direita
    const bx = Math.sin(this.yaw), bz = Math.cos(this.yaw); // trás
    this.target.x += rx * dx + bx * dz;
    this.target.z += rz * dx + bz * dz;
    // limite: dentro da captura
    const h = SPAN / 2 - 4;
    const ox = this.target.x - this.center.x, oz = this.target.z - this.center.z;
    const lx = ox * rx + oz * rz, lz = ox * bx + oz * bz;
    const cx = Math.max(-h, Math.min(h, lx)), cz = Math.max(-h, Math.min(h, lz));
    this.target.x = this.center.x + rx * cx + bx * cz;
    this.target.z = this.center.z + rz * cx + bz * cz;
  }

  confirm() {
    if (!this.open) return;
    const tgt = this.target.clone();
    this.close();
    this.f.sfx.beep(900, 0.08, 0.12);
    this.f.sfx.beep(1350, 0.14, 0.12);
    this.f.confirmed('airstrike');
    this.fire(tgt);
  }

  cancel() {
    if (!this.open) return;
    this.close();
    this.f.sfx.beep(500, 0.12, 0.1);
    this.f.refund('airstrike');
  }

  /** Câmera ortográfica de cima → pixels (uma vez por abertura). */
  capture() {
    const ctx = this.ctx;
    const r = ctx.renderer;
    const cam = new THREE.OrthographicCamera(-SPAN / 2, SPAN / 2, SPAN / 2, -SPAN / 2, 1, 260);
    cam.position.set(this.center.x, this.center.y + 120, this.center.z);
    // "cima" do tablet = frente do jogador
    cam.up.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    cam.lookAt(this.center.x, this.center.y, this.center.z);
    cam.updateMatrixWorld();
    const rt = new THREE.WebGLRenderTarget(IMG, IMG, { type: THREE.UnsignedByteType });
    const prevRT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    const fog = ctx.scene.fog;
    const vmVis = ctx.vm.visible;
    ctx.scene.fog = null;
    const hidden = [];
    // esconde inimigos/marionetes (o tablet mostra marcadores, não corpos)
    for (const e of ctx.services.enemies?.list || []) if (e.group.visible) (e.group.visible = false), hidden.push(e.group);
    const buf = new Uint8Array(IMG * IMG * 4);
    try {
      r.setRenderTarget(rt);
      r.autoClear = true;
      r.setClearColor(0x20262a, 1);
      r.clear();
      r.render(ctx.scene, cam);
      r.readRenderTargetPixels(rt, 0, 0, IMG, IMG, buf);
    } catch (err) {
      console.warn('[streaks] captura do designador falhou', err);
    } finally {
      r.setRenderTarget(prevRT);
      r.autoClear = prevAuto;
      ctx.scene.fog = fog;
      ctx.vm.visible = vmVis;
      for (const g of hidden) g.visible = true;
      rt.dispose();
    }
    // tonemap ACES + gama, contraste "satélite", tom frio e linhas de varredura
    const cv = document.createElement('canvas');
    cv.width = cv.height = IMG;
    const g = cv.getContext('2d');
    const img = g.createImageData(IMG, IMG);
    const exp = (r.toneMappingExposure || 1) * 1.35;
    const aces = (x) => {
      x *= exp;
      return Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
    };
    const lut = new Float32Array(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.pow(aces(Math.pow(i / 255, 1)), 1 / 2.2);
    for (let y = 0; y < IMG; y++) {
      const sy = IMG - 1 - y; // WebGL lê de baixo para cima
      const scan = y % 3 === 0 ? 0.9 : 1;
      for (let x = 0; x < IMG; x++) {
        const i = (sy * IMG + x) * 4, o = (y * IMG + x) * 4;
        let R = lut[buf[i]], G = lut[buf[i + 1]], B = lut[buf[i + 2]];
        const L = 0.3 * R + 0.59 * G + 0.11 * B;
        // dessatura + contraste + tom verde-ciano
        R = L + (R - L) * 0.35;
        G = L + (G - L) * 0.35;
        B = L + (B - L) * 0.35;
        const k = (v) => Math.min(1, Math.max(0, (v - 0.5) * 1.35 + 0.5));
        img.data[o] = k(R * 0.86) * 255 * scan;
        img.data[o + 1] = k(G * 1.04 + 0.02) * 255 * scan;
        img.data[o + 2] = k(B * 0.98 + 0.03) * 255 * scan;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.map = cv;
  }

  buildDom() {
    const root = this.f.root;
    const d = el('div', 'stk-desig interactive', null, root);
    Object.assign(d.style, { position: 'absolute', inset: '0', background: 'radial-gradient(ellipse at center, rgba(5,7,8,.35), rgba(3,4,5,.8))', display: 'grid', placeItems: 'center' });
    const tab = el('div', null, null, d);
    // tablet: moldura com bezel, parafusos, LED e alça
    Object.assign(tab.style, { position: 'relative', padding: '26px 30px 26px 30px', borderRadius: '22px', background: 'linear-gradient(160deg,#2c3034,#15181b 60%,#202427)', boxShadow: '0 30px 80px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.08), inset 0 -2px 6px rgba(0,0,0,.6)', display: 'flex', gap: '18px', border: '1px solid #0b0d0e' });
    const sq = Math.min(innerHeight * 0.72, innerWidth * 0.52, 620);
    const screen = el('canvas', null, null, tab);
    screen.width = screen.height = 640;
    Object.assign(screen.style, { width: sq + 'px', height: sq + 'px', borderRadius: '6px', boxShadow: 'inset 0 0 0 2px #050607, 0 0 0 3px #0c0e0f', background: '#0a0d0f', cursor: 'crosshair', touchAction: 'none' });
    const side = el('div', null, null, tab);
    Object.assign(side.style, { width: '190px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '11px', textTransform: 'uppercase', color: 'rgba(200,240,215,.85)' });
    side.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;color:#e2b45a">${streakIcon('mortar', 34)}<div><div style="font-size:15px;font-weight:700;letter-spacing:.14em">MORTAR STRIKE</div><div class="mono" style="font-size:10px;opacity:.75">FIRE MISSION · HE ×8</div></div></div>
      <div style="height:1px;background:rgba(200,240,215,.15)"></div>
      <div class="mono stk-dg-info" style="line-height:1.8"></div>
      <div style="flex:1"></div>
      <button class="stk-btn stk-dg-ok" style="width:100%">CONFIRM</button>
      <button class="stk-btn stk-dg-no" style="width:100%;background:transparent;color:#f2f4ef;border:1px solid rgba(242,244,239,.3)">CANCEL</button>
      <div class="mono" style="font-size:9px;opacity:.6;line-height:1.6">MOUSE/WASD MOVE<br>LMB · ENTER · F CONFIRM<br>RMB · X CANCEL</div>`;
    // LED e parafusos
    const led = el('div', null, null, tab);
    Object.assign(led.style, { position: 'absolute', top: '10px', left: '50%', width: '6px', height: '6px', borderRadius: '50%', background: '#5aff8a', boxShadow: '0 0 8px #5aff8a' });
    for (const [x, y] of [['10px', '10px'], ['calc(100% - 16px)', '10px'], ['10px', 'calc(100% - 16px)'], ['calc(100% - 16px)', 'calc(100% - 16px)']]) {
      const s = el('div', null, null, tab);
      Object.assign(s.style, { position: 'absolute', left: x, top: y, width: '6px', height: '6px', borderRadius: '50%', background: '#3a3f44', boxShadow: 'inset 0 1px 1px rgba(0,0,0,.6)' });
    }
    side.querySelector('.stk-dg-ok').onclick = () => this.confirm();
    side.querySelector('.stk-dg-no').onclick = () => this.cancel();
    // toque/clique no mapa posiciona o retículo
    screen.addEventListener('pointerdown', (e) => {
      if (document.pointerLockElement) return;
      const r = screen.getBoundingClientRect();
      const u = (e.clientX - r.left) / r.width - 0.5, v = (e.clientY - r.top) / r.height - 0.5;
      const pos = this.toTablet(this.target);
      this.move(u * SPAN - pos.x, v * SPAN - pos.z);
      e.preventDefault();
    });
    this.dom = d;
    this.screen = screen;
    this.sg = screen.getContext('2d');
    this.info = side.querySelector('.stk-dg-info');
  }

  /** Mundo → tablet (m, x direita, z baixo, centro = jogador). */
  toTablet(p) {
    const ox = p.x - this.center.x, oz = p.z - this.center.z;
    const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
    return { x: ox * c - oz * s, z: ox * Math.sin(this.yaw) + oz * Math.cos(this.yaw) };
  }

  drawDesignator() {
    const g = this.sg;
    if (!g) return;
    const ctx = this.ctx;
    const S = 640, k = S / SPAN;
    const now = performance.now() * 0.001;
    g.drawImage(this.map, 0, 0, S, S);
    // grade de 10 m (alinhada ao jogador) + anéis de distância
    g.strokeStyle = 'rgba(140,255,190,0.16)';
    g.lineWidth = 1;
    for (let m = -SPAN / 2; m <= SPAN / 2; m += 10) {
      const p = S / 2 + m * k;
      g.beginPath();
      g.moveTo(p, 0);
      g.lineTo(p, S);
      g.moveTo(0, p);
      g.lineTo(S, p);
      g.stroke();
    }
    g.strokeStyle = 'rgba(140,255,190,0.28)';
    g.setLineDash([4, 6]);
    for (const r of [15, 30, 45]) {
      g.beginPath();
      g.arc(S / 2, S / 2, r * k, 0, Math.PI * 2);
      g.stroke();
    }
    g.setLineDash([]);
    g.fillStyle = 'rgba(140,255,190,0.55)';
    g.font = '11px monospace';
    for (const r of [15, 30, 45]) g.fillText(r + 'M', S / 2 + 4, S / 2 - r * k - 4);
    // inimigos conhecidos: revelados (UAV) ou à vista agora
    const known = new Map();
    for (const r of this.f.revealedList()) known.set(r.id, r);
    const eye = ctx.player.eyePosition;
    for (const e of ctx.services.enemies?.list || []) {
      if (!e.alive) continue;
      const c = e.group.position.clone().setY(e.group.position.y + 1.4);
      if (!known.has(e.id) && ctx.collision.lineOfSight(eye, c, { filter: (o) => !o.data?.enemy && o.tag !== 'player' })) known.set(e.id, { x: c.x, z: c.z, alpha: 1 });
    }
    for (const r of known.values()) {
      const t = this.toTablet(r);
      const x = S / 2 + t.x * k, y = S / 2 + t.z * k;
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.fillStyle = `rgba(255,70,55,${0.35 + 0.65 * (r.alpha ?? 1)})`;
      g.fillRect(-6, -6, 12, 12);
      g.strokeStyle = 'rgba(20,0,0,.8)';
      g.strokeRect(-6, -6, 12, 12);
      g.restore();
    }
    // jogador
    g.save();
    g.translate(S / 2, S / 2);
    g.fillStyle = '#e2b45a';
    g.strokeStyle = '#141414';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -13);
    g.lineTo(9, 10);
    g.lineTo(0, 5);
    g.lineTo(-9, 10);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // retículo + raio letal (pulsa) + linha até o jogador
    const t = this.toTablet(this.target);
    const tx = S / 2 + t.x * k, ty = S / 2 + t.z * k;
    const pulse = 0.5 + 0.5 * Math.sin(now * 6);
    g.strokeStyle = 'rgba(255,90,60,0.9)';
    g.fillStyle = `rgba(255,70,40,${0.1 + 0.08 * pulse})`;
    g.lineWidth = 2;
    g.beginPath();
    g.arc(tx, ty, (SPREAD + RADIUS * 0.5) * k, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.setLineDash([3, 5]);
    g.strokeStyle = 'rgba(226,180,90,0.7)';
    g.beginPath();
    g.moveTo(S / 2, S / 2);
    g.lineTo(tx, ty);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#ffd9a0';
    g.lineWidth = 2;
    for (const [a, b] of [[[-18, 0], [-6, 0]], [[6, 0], [18, 0]], [[0, -18], [0, -6]], [[0, 6], [0, 18]]]) {
      g.beginPath();
      g.moveTo(tx + a[0], ty + a[1]);
      g.lineTo(tx + b[0], ty + b[1]);
      g.stroke();
    }
    g.strokeRect(tx - 24, ty - 24, 48, 48);
    // vinheta + moldura de interface
    const vg = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(140,255,190,0.85)';
    g.font = 'bold 13px monospace';
    g.fillText('◉ LIVE  ORTHO 1:' + Math.round(SPAN * 10), 14, 22);
    g.textAlign = 'right';
    g.fillText('GRID ' + Math.round(this.target.x) + ' / ' + Math.round(-this.target.z), S - 14, 22);
    g.textAlign = 'left';
    // N (norte do mundo) na borda
    const nAng = -this.yaw;
    g.save();
    g.translate(S / 2 + Math.sin(nAng) * (S / 2 - 18), S / 2 - Math.cos(nAng) * (S / 2 - 18));
    g.fillStyle = '#e2b45a';
    g.font = 'bold 14px monospace';
    g.textAlign = 'center';
    g.fillText('N', 0, 5);
    g.restore();
    const dist = Math.hypot(this.target.x - this.center.x, this.target.z - this.center.z);
    const danger = dist < SPREAD + RADIUS;
    this.info.innerHTML = `RANGE <b style="color:#fff">${dist.toFixed(0)} M</b><br>AZIMUTH <b style="color:#fff">${String(Math.round(((Math.atan2(this.target.x - this.center.x, -(this.target.z - this.center.z)) * 180) / Math.PI + 360) % 360)).padStart(3, '0')}°</b><br>ROUNDS <b style="color:#fff">8 × HE</b><br>TIME TO IMPACT <b style="color:#fff">~3 S</b><br>${danger ? '<b style="color:#ff6a50">⚠ DANGER CLOSE</b>' : '<span style="opacity:.6">TARGET CLEAR</span>'}`;
  }

  // ─── disparo ───────────────────────────────────────────────────────────
  fire(center) {
    const ctx = this.ctx;
    const pat = strikePattern(center, 8, SPREAD, () => ctx.rng.next());
    const t0 = ctx.time.now + 2.2;
    for (const p of pat) {
      const y = ctx.collision.groundHeight?.(p.x, p.z, center.y + 30);
      this.shells.push({ x: p.x, z: p.z, y: Number.isFinite(y) ? y : center.y, t: t0 + p.delay, whistle: false, streak: false });
    }
    this.f.hint(`<b>MORTAR INBOUND</b> · ${Math.round(center.distanceTo(ctx.player.position))} M`, 2.6);
    // inimigos gritam quando o primeiro assobio começa (ver update)
    this.warned = false;
  }

  update() {
    const ctx = this.ctx;
    const now = ctx.time.now;
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i];
      const p = new THREE.Vector3(s.x, s.y, s.z);
      if (!s.whistle && now >= s.t - 1.5) {
        s.whistle = true;
        this.f.sfx.whistle(p.clone().setY(s.y + 6), 1.5);
        if (!this.warned) {
          this.warned = true;
          const en = ctx.services.enemies;
          const e = en?.list?.filter((x) => x.alive).sort((a, b) => a.group.position.distanceTo(p) - b.group.position.distanceTo(p))[0];
          if (e && en.squad) en.squad.callout(e, 'airstrike', now, true);
          // quem está na área tenta correr
          for (const x of en?.list || []) if (x.alive && x.group.position.distanceTo(p) < 9) x.brain?.evade?.(p);
        }
      }
      if (!s.streak && now >= s.t - 0.18) {
        s.streak = true;
        // risco luminoso caindo (quase vertical, leve inclinação)
        const from = p.clone().add(new THREE.Vector3(6, 70, -4));
        ctx.services.vfx?.tracer?.(from, p, { speed: 420, length: 14, width: 2.2 });
      }
      if (now >= s.t) {
        this.shells.splice(i, 1);
        this.detonate(p);
      }
    }
  }

  detonate(point) {
    const ctx = this.ctx;
    const up = new THREE.Vector3(0, 1, 0);
    ctx.bus.emit('explosion', { point: point.clone().add(new THREE.Vector3(0, 0.1, 0)), radius: RADIUS, normal: up, source: 'player', streak: 'airstrike' });
    this.f.blast(point, RADIUS, 210, { weapon: 'airstrike', streak: 'airstrike' });
  }

  frame() {
    if (this.open) this.drawDesignator();
  }

  cancelAll() {
    this.close();
    this.shells.length = 0;
  }
}
