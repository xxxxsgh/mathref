/**
 * Minimapa tático circular (canto superior esquerdo).
 *
 * A planta é RASTERIZADA uma vez a partir dos colisores estáticos do mundo
 * (`ctx.collision`) — não depende de malhas nem de dados extras da feature
 * world — e classificada por material/altura:
 *   - asfalto plano → pista (com faixa central tracejada no eixo longo);
 *   - concreto plano → calçada;
 *   - volumes altos → prédios: sombra projetada, "elevação" (mais alto =
 *     mais claro), borda de luz no topo-esquerda e contorno nítido;
 *   - volumes baixos → coberturas/veículos (cinza médio com aresta escura).
 * A cada frame só desenhamos essa imagem girada + cone de visão, pings,
 * seta do jogador e a moldura com bisel de rumo (N/E/S/W giram juntos).
 */
import { drawText } from './font.js';

const S = 280; // tamanho na prancheta
const R = 122; // raio da área do mapa
const PPM = 8; // pixels por metro na planta rasterizada
const VIEW = 3.4; // pixels da prancheta por metro (raio ≈ 36 m)

export class Minimap {
  constructor(parent) {
    this.el = document.createElement('div');
    this.el.className = 'mm';
    this.cv = document.createElement('canvas');
    this.el.appendChild(this.cv);
    parent.appendChild(this.el);
    this.g = this.cv.getContext('2d');
    this.plan = null;
    this.k = 1;
    this.rotate = true;
    this.builtCount = -1;
  }
  resize(k) {
    this.k = k;
    this.cv.width = Math.round(S * k);
    this.cv.height = Math.round(S * k);
  }

  /** Rasteriza a planta a partir dos colisores estáticos. */
  build(ctx) {
    const cols = [...ctx.collision.colliders.values()].filter((c) => !c.dynamic && c.box && !c.trigger && c.tag !== 'player');
    this.builtCount = ctx.collision.colliders.size;
    const b = ctx.services.world?.bounds;
    let minX = b ? b.min.x : Infinity, maxX = b ? b.max.x : -Infinity, minZ = b ? b.min.z : Infinity, maxZ = b ? b.max.z : -Infinity;
    if (!b) for (const c of cols) {
      minX = Math.min(minX, c.box.min.x); maxX = Math.max(maxX, c.box.max.x);
      minZ = Math.min(minZ, c.box.min.z); maxZ = Math.max(maxZ, c.box.max.z);
    }
    if (!isFinite(minX)) { minX = -50; maxX = 50; minZ = -50; maxZ = 50; }
    const pad = 40;
    minX -= pad; minZ -= pad; maxX += pad; maxZ += pad;
    const w = Math.min(4096, Math.ceil((maxX - minX) * PPM)), h = Math.min(4096, Math.ceil((maxZ - minZ) * PPM));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const ppm = Math.min(PPM, w / (maxX - minX), h / (maxZ - minZ));
    this.origin = { x: minX, z: minZ, ppm };
    const rect = (bx, grow = 0) => [(bx.min.x - minX) * ppm - grow, (bx.min.z - minZ) * ppm - grow, (bx.max.x - bx.min.x) * ppm + grow * 2, (bx.max.z - bx.min.z) * ppm + grow * 2];

    // terreno: tom escuro levemente esverdeado (fora da área jogável mais escuro)
    g.fillStyle = '#0e1214';
    g.fillRect(0, 0, w, h);
    if (b) {
      g.fillStyle = '#161b1e';
      g.fillRect((b.min.x - minX) * ppm, (b.min.z - minZ) * ppm, (b.max.x - b.min.x) * ppm, (b.max.z - b.min.z) * ppm);
    }
    // classifica
    const road = [], walk = [], tall = [], low = [];
    for (const c of cols) {
      const bx = c.box;
      const hgt = bx.max.y - bx.min.y;
      const area = (bx.max.x - bx.min.x) * (bx.max.z - bx.min.z);
      if (bx.max.y <= 0.2 && area > 4) {
        if (area > 6000) continue; // plano de chão gigante
        if (c.material === 'asphalt') road.push(bx);
        else if (c.material === 'concrete') walk.push(bx);
        continue;
      }
      if (bx.max.y < 0.35 || bx.min.y > 2.6) continue; // tapetes, telhados, marquises
      if (area > 2500) continue;
      if (hgt >= 1.7) tall.push(bx);
      else low.push(bx);
    }
    // calçadas
    g.fillStyle = '#353d42';
    for (const bx of walk) g.fillRect(...rect(bx));
    // pista + meio-fio + faixa tracejada no eixo longo
    g.fillStyle = '#20262a';
    for (const bx of road) g.fillRect(...rect(bx));
    g.strokeStyle = 'rgba(214,190,120,.55)';
    g.lineWidth = Math.max(1.2, ppm * 0.18);
    g.setLineDash([ppm * 3, ppm * 3]);
    g.beginPath();
    for (const bx of road) {
      const [x, y, rw, rh] = rect(bx);
      if (rh >= rw) { g.moveTo(x + rw / 2, y); g.lineTo(x + rw / 2, y + rh); }
      else { g.moveTo(x, y + rh / 2); g.lineTo(x + rw, y + rh / 2); }
    }
    g.stroke();
    g.setLineDash([]);
    // grade fina (10 m) por cima do chão
    g.strokeStyle = 'rgba(255,255,255,.035)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.ceil(minX / 10) * 10; x < maxX; x += 10) { g.moveTo((x - minX) * ppm, 0); g.lineTo((x - minX) * ppm, h); }
    for (let z = Math.ceil(minZ / 10) * 10; z < maxZ; z += 10) { g.moveTo(0, (z - minZ) * ppm); g.lineTo(w, (z - minZ) * ppm); }
    g.stroke();

    // coberturas baixas (carros, barreiras, caixas)
    for (const bx of low) {
      const r = rect(bx);
      g.fillStyle = 'rgba(0,0,0,.45)';
      g.fillRect(r[0] + 2, r[1] + 2, r[2], r[3]);
      g.fillStyle = '#6b757c';
      g.fillRect(...r);
      g.strokeStyle = 'rgba(0,0,0,.6)';
      g.lineWidth = 1;
      g.strokeRect(r[0] + 0.5, r[1] + 0.5, r[2] - 1, r[3] - 1);
    }
    // prédios: sombra projetada (sudeste), depois corpo, por fim contorno.
    let hMin = Infinity, hMax = -Infinity;
    for (const bx of tall) { hMin = Math.min(hMin, bx.max.y); hMax = Math.max(hMax, bx.max.y); }
    const span = Math.max(1, hMax - hMin);
    g.fillStyle = 'rgba(0,0,0,.5)';
    for (const bx of tall) {
      const r = rect(bx);
      const off = 4 + ((bx.max.y - hMin) / span) * 6;
      g.fillRect(r[0] + off, r[1] + off, r[2], r[3]);
    }
    // contorno engordado (união) atrás
    g.fillStyle = '#e4eaee';
    for (const bx of tall) g.fillRect(...rect(bx, 1.8));
    for (const bx of tall) {
      const r = rect(bx);
      const t = (bx.max.y - hMin) / span; // elevação
      const base = 104 + t * 52;
      const gr = g.createLinearGradient(r[0], r[1], r[0] + r[2], r[1] + r[3]);
      gr.addColorStop(0, `rgb(${base + 14},${base + 20},${base + 24})`);
      gr.addColorStop(1, `rgb(${base - 10},${base - 5},${base - 2})`);
      g.fillStyle = gr;
      g.fillRect(...r);
    }
    // aresta de luz (topo/esquerda) e de sombra (base/direita) por bloco
    for (const bx of tall) {
      const [x, y, rw, rh] = rect(bx);
      if (rw < 3 || rh < 3) continue;
      g.fillStyle = 'rgba(255,255,255,.16)';
      g.fillRect(x, y, rw, 2);
      g.fillRect(x, y, 2, rh);
      g.fillStyle = 'rgba(0,0,0,.22)';
      g.fillRect(x, y + rh - 2, rw, 2);
      g.fillRect(x + rw - 2, y, 2, rh);
    }
    this.plan = cv;
  }

  draw(ctx, { yaw, pos, pings = [] }) {
    if (!this.plan || (ctx.collision.colliders.size !== this.builtCount && ctx.time.frame % 60 === 0)) this.build(ctx);
    const g = this.g, k = this.k;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2;
    const rot = this.rotate ? yaw : 0;
    // fundo + recorte circular
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = 'rgba(10,13,15,.9)';
    g.fill();
    g.clip();
    if (this.plan) {
      const o = this.origin;
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      const sc = VIEW / o.ppm;
      g.scale(sc, sc);
      g.translate(-(pos.x - o.x) * o.ppm, -(pos.z - o.z) * o.ppm);
      g.imageSmoothingEnabled = true;
      g.globalAlpha = 0.96;
      g.drawImage(this.plan, 0, 0);
      g.globalAlpha = 1;
      g.restore();
    }
    // anéis de distância (10 m / 20 m / 30 m)
    g.strokeStyle = 'rgba(242,244,239,.07)';
    g.lineWidth = 1;
    for (const m of [10, 20, 30]) { g.beginPath(); g.arc(cx, cy, m * VIEW, 0, Math.PI * 2); g.stroke(); }
    // cone de visão
    const fov = 0.62;
    const dir = this.rotate ? -Math.PI / 2 : -Math.PI / 2 - yaw;
    const cg = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    cg.addColorStop(0, 'rgba(255,214,140,.30)');
    cg.addColorStop(0.7, 'rgba(255,214,140,.08)');
    cg.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R, dir - fov, dir + fov);
    g.closePath();
    g.fill();
    // pings de inimigos (posições de disparo) — presos na borda se longe
    for (const p of pings) {
      let dx = (p.x - pos.x) * VIEW, dz = (p.z - pos.z) * VIEW;
      if (this.rotate) {
        const cs = Math.cos(rot), sn = Math.sin(rot);
        [dx, dz] = [dx * cs - dz * sn, dx * sn + dz * cs];
      }
      const d = Math.hypot(dx, dz);
      const lim = R - 9;
      if (d > lim) { dx *= lim / d; dz *= lim / d; }
      const x = cx + dx, y = cy + dz;
      g.globalAlpha = Math.min(1, p.a * 1.5);
      g.fillStyle = 'rgba(255,61,51,.28)';
      g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff3d33';
      g.strokeStyle = 'rgba(0,0,0,.75)';
      g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 5.5, y); g.lineTo(x, y + 6); g.lineTo(x - 5.5, y); g.closePath();
      g.fill(); g.stroke();
    }
    g.globalAlpha = 1;
    // vinheta interna (profundidade)
    const vg = g.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = vg;
    g.fillRect(0, 0, S, S);
    g.restore();

    // ── moldura com bisel de rumo ──
    // anel escuro
    g.beginPath();
    g.arc(cx, cy, R + 8, 0, Math.PI * 2);
    g.arc(cx, cy, R, 0, Math.PI * 2, true);
    g.fillStyle = 'rgba(8,10,12,.82)';
    g.fill();
    g.strokeStyle = 'rgba(242,244,239,.5)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(242,244,239,.16)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, R + 8, 0, Math.PI * 2); g.stroke();
    // marcas a cada 10° no bisel (giram com o mapa)
    const nRot = (this.rotate ? rot : 0) - Math.PI / 2; // ângulo de tela do norte
    g.strokeStyle = 'rgba(242,244,239,.55)';
    g.beginPath();
    for (let i = 0; i < 36; i++) {
      if (i % 9 === 0) continue;
      const a = nRot + (i / 36) * Math.PI * 2;
      const r0 = R + 2, r1 = R + (i % 3 === 0 ? 7 : 4.5);
      g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      g.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    }
    g.lineWidth = 1.2;
    g.stroke();
    // cardeais no bisel
    const card = [['N', 0], ['E', 1], ['S', 2], ['W', 3]];
    for (const [l, q] of card) {
      const a = nRot + (q * Math.PI) / 2;
      const x = cx + Math.cos(a) * (R + 4), y = cy + Math.sin(a) * (R + 4);
      const isN = l === 'N';
      g.fillStyle = isN ? '#ffb22e' : 'rgba(14,17,20,.95)';
      g.strokeStyle = isN ? 'rgba(0,0,0,.6)' : 'rgba(242,244,239,.6)';
      g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, isN ? 11 : 9, 0, Math.PI * 2); g.fill(); g.stroke();
      drawText(g, l, x, y - (isN ? 5.5 : 4.5), { size: isN ? 11 : 9, weight: isN ? 2 : 1.6, align: 'center', color: isN ? '#121110' : '#f2f4ef' });
    }
    // marcador de rumo fixo no topo (direção para onde olho)
    if (this.rotate) {
      g.fillStyle = '#f2f4ef';
      g.beginPath();
      g.moveTo(cx, cy - R + 1); g.lineTo(cx - 5, cy - R - 6); g.lineTo(cx + 5, cy - R - 6); g.closePath();
      g.fill();
    }
    // jogador
    g.save();
    g.translate(cx, cy);
    if (!this.rotate) g.rotate(-yaw);
    g.shadowColor = 'rgba(255,178,46,.7)';
    g.shadowBlur = 8;
    g.fillStyle = '#ffc13a';
    g.strokeStyle = 'rgba(0,0,0,.8)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -11); g.lineTo(8, 8); g.lineTo(0, 3.5); g.lineTo(-8, 8);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.stroke();
    g.restore();
  }
}
