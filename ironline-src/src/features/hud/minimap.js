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
    this.builtCount = cols.length;
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
    g.fillStyle = '#0b0f11';
    g.fillRect(0, 0, w, h);
    if (b) {
      g.fillStyle = '#151b1e';
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
    g.fillStyle = '#2b3438';
    for (const bx of walk) g.fillRect(...rect(bx));
    // pista + meio-fio + faixa tracejada no eixo longo
    g.fillStyle = '#101417';
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
      g.fillStyle = '#56636a';
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
    g.fillStyle = 'rgba(178,206,218,.95)';
    for (const bx of tall) g.fillRect(...rect(bx, 1.4));
    for (const bx of tall) {
      const r = rect(bx);
      const t = (bx.max.y - hMin) / span; // elevação
      // ardósia azulada: mais alto = mais claro (leitura de elevação)
      const base = 56 + t * 46;
      const gr = g.createLinearGradient(r[0], r[1], r[0] + r[2], r[1] + r[3]);
      gr.addColorStop(0, `rgb(${base + 8},${base + 22},${base + 30})`);
      gr.addColorStop(1, `rgb(${base - 12},${base},${base + 8})`);
      g.fillStyle = gr;
      g.fillRect(...r);
    }
    // hachura diagonal fina dentro dos prédios (estilo carta tática)
    g.save();
    g.beginPath();
    for (const bx of tall) g.rect(...rect(bx));
    g.clip();
    g.strokeStyle = 'rgba(200,226,236,.07)';
    g.lineWidth = 1;
    g.beginPath();
    for (let d = -h; d < w; d += 6) { g.moveTo(d, 0); g.lineTo(d + h, h); }
    g.stroke();
    g.restore();
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
    this.boxes = { tall, low, road, w, h };
    try {
      this.aerial(ctx, { minX, maxX, minZ, maxZ, ppm, w, h });
    } catch (err) {
      console.warn('[hud] foto aérea do minimapa indisponível', err);
    }
  }

  /**
   * "Foto aérea" do mapa: renderiza a cena real de cima (câmera ortográfica,
   * sem neblina, sem inimigos) uma única vez, no próprio canvas do jogo,
   * antes do frame normal ser desenhado por cima — e copia para a planta.
   * Depois gradua (dessatura/escurece, como uma carta tática sobre imagem
   * de satélite) e sobrepõe contornos finos dos prédios por legibilidade.
   * Eixo longo do mapa (Z) vai na horizontal da tela para usar a resolução.
   */
  aerial(ctx, { minX, maxX, minZ, maxZ, ppm, w, h }) {
    const THREE = ctx.THREE, r = ctx.renderer, scene = ctx.scene;
    if (!THREE || !r || !scene) return;
    const pr = r.getPixelRatio();
    const cw = r.domElement.width, ch = r.domElement.height;
    const Lx = maxX - minX, Lz = maxZ - minZ;
    const k = Math.min(cw / Lz, ch / Lx);
    const vw = Math.floor(Lz * k), vh = Math.floor(Lx * k);
    if (vw < 64 || vh < 64) return;
    const cam = new THREE.OrthographicCamera(-Lz / 2, Lz / 2, Lx / 2, -Lx / 2, 1, 400);
    cam.up.set(1, 0, 0);
    cam.position.set((minX + maxX) / 2, 180, (minZ + maxZ) / 2);
    cam.lookAt((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
    cam.updateMatrixWorld();
    // esconde o que não é "terreno": inimigos, corpos, câmera do jogador
    const hidden = [];
    const hide = (o) => { if (o && o.visible) { o.visible = false; hidden.push(o); } };
    for (const e of ctx.services.enemies?.list || []) { hide(e.group); hide(e.ragdoll?.group); }
    scene.traverse((o) => { if (o.isSkinnedMesh || o.isPoints || o.isSprite) hide(o); });
    hide(ctx.camera);
    const fog = scene.fog;
    scene.fog = null;
    const vp = new THREE.Vector4(), sc = new THREE.Vector4();
    r.getViewport(vp); r.getScissor(sc);
    const scT = r.getScissorTest();
    const prevRT = r.getRenderTarget();
    try {
      r.setRenderTarget(null);
      r.setViewport(0, 0, vw / pr, vh / pr);
      r.setScissor(0, 0, vw / pr, vh / pr);
      r.setScissorTest(true);
      r.render(scene, cam);
      // copia já com tone mapping/sRGB; WebGL lê de baixo para cima
      const snap = document.createElement('canvas');
      snap.width = vw; snap.height = vh;
      snap.getContext('2d').drawImage(r.domElement, 0, ch - vh, vw, vh, 0, 0, vw, vh);
      // checagem: imagem vazia (contexto perdido etc.) → mantém a planta
      const px = snap.getContext('2d').getImageData(0, 0, vw, vh).data;
      let sum = 0;
      for (let i = 0; i < px.length; i += 4 * 97) sum += px[i] + px[i + 1] + px[i + 2];
      if (sum / (px.length / (4 * 97)) < 6) return;
      this.compose(snap, { Lx, Lz, minX, minZ, ppm, w, h });
    } finally {
      r.setViewport(vp); r.setScissor(sc); r.setScissorTest(scT);
      r.setRenderTarget(prevRT);
      scene.fog = fog;
      for (const o of hidden) o.visible = true;
    }
  }

  compose(snap, { Lx, Lz, minX, minZ, ppm, w, h }) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    g.fillStyle = '#121518';
    g.fillRect(0, 0, w, h);
    // transposição: snap x = Z, snap y = (maxX − x)
    const Wx = Lx * ppm;
    g.save();
    g.setTransform(0, ppm * Lz / snap.width, -ppm * Lx / snap.height, 0, Wx, 0);
    g.filter = 'grayscale(.55) sepia(.12) brightness(.82) contrast(1.12)';
    g.drawImage(snap, 0, 0);
    g.restore();
    g.filter = 'none';
    // véu escuro uniforme: dá contraste para seta/pings sem esconder a foto
    g.fillStyle = 'rgba(10,13,15,.22)';
    g.fillRect(0, 0, w, h);
    // contornos finos dos prédios (legibilidade de "carta")
    const rect = (bx) => [(bx.min.x - minX) * ppm, (bx.min.z - minZ) * ppm, (bx.max.x - bx.min.x) * ppm, (bx.max.z - bx.min.z) * ppm];
    g.strokeStyle = 'rgba(236,235,228,.42)';
    g.lineWidth = Math.max(1, ppm * 0.16);
    for (const bx of this.boxes.tall) {
      const [x, y, rw, rh] = rect(bx);
      if (rw < 4 || rh < 4) continue;
      g.strokeRect(x, y, rw, rh);
    }
    this.plan = cv;
    this.aerialOk = true;
  }

  draw(ctx, { yaw, pos, pings = [] }) {
    // reconstrói só se o conjunto ESTÁTICO mudar (checado a cada ~2 s)
    if (!this.plan) this.build(ctx);
    else if (ctx.time.frame % 120 === 0) {
      let n = 0;
      for (const c of ctx.collision.colliders.values()) if (!c.dynamic && c.box && !c.trigger && c.tag !== 'player') n++;
      if (n !== this.builtCount) this.build(ctx);
    }
    const g = this.g, k = this.k;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, S, S);
    const cx = S / 2, cy = S / 2;
    const rot = this.rotate ? yaw : 0;
    // quadro quadrado (cantos levemente chanfrados) — leitura de carta
    const P = 10, E = S - P * 2, C = 10; // margem, lado útil, chanfro
    const frame = () => {
      g.beginPath();
      g.moveTo(P + C, P); g.lineTo(P + E, P); g.lineTo(P + E, P + E - C); g.lineTo(P + E - C, P + E);
      g.lineTo(P, P + E); g.lineTo(P, P + C); g.closePath();
    };
    g.save();
    frame();
    g.fillStyle = 'rgba(14,17,19,.86)';
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
      g.imageSmoothingQuality = 'high';
      g.drawImage(this.plan, 0, 0);
      g.restore();
    }
    // cone de visão: leque branco muito sutil
    const fov = 0.55;
    const dir = this.rotate ? -Math.PI / 2 : -Math.PI / 2 - yaw;
    const cg = g.createRadialGradient(cx, cy, 0, cx, cy, E * 0.55);
    cg.addColorStop(0, 'rgba(236,235,228,.24)');
    cg.addColorStop(1, 'rgba(236,235,228,0)');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, E * 0.55, dir - fov, dir + fov);
    g.closePath();
    g.fill();
    // pings de inimigos: pontos vermelhos, presos na borda se longe
    for (const p of pings) {
      let dx = (p.x - pos.x) * VIEW, dz = (p.z - pos.z) * VIEW;
      if (this.rotate) {
        const cs = Math.cos(rot), sn = Math.sin(rot);
        [dx, dz] = [dx * cs - dz * sn, dx * sn + dz * cs];
      }
      const lim = E / 2 - 8;
      const m = Math.max(Math.abs(dx), Math.abs(dz));
      if (m > lim) { dx *= lim / m; dz *= lim / m; }
      const x = cx + dx, y = cy + dz;
      g.globalAlpha = Math.min(1, p.a * 1.5);
      g.fillStyle = 'rgba(217,72,61,.25)';
      g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e04b3f';
      g.strokeStyle = 'rgba(0,0,0,.7)';
      g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.globalAlpha = 1;
    // escurece levemente as bordas (profundidade)
    const vg = g.createRadialGradient(cx, cy, E * 0.35, cx, cy, E * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.38)');
    g.fillStyle = vg;
    g.fillRect(0, 0, S, S);
    g.restore();

    // ── moldura: linha fina + cantoneiras ──
    frame();
    g.strokeStyle = 'rgba(236,235,228,.28)';
    g.lineWidth = 1;
    g.stroke();
    g.strokeStyle = 'rgba(236,235,228,.8)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(P + E - 18, P); g.lineTo(P + E, P); g.lineTo(P + E, P + 18);
    g.moveTo(P + 18, P + E); g.lineTo(P, P + E); g.lineTo(P, P + E - 18);
    g.stroke();
    // norte: letra pequena na borda, na direção do norte do mapa
    const nA = (this.rotate ? rot : 0) - Math.PI / 2;
    const ux = Math.cos(nA), uy = Math.sin(nA);
    const t = (E / 2) / Math.max(Math.abs(ux), Math.abs(uy));
    const nx = cx + ux * t, ny = cy + uy * t;
    g.fillStyle = 'rgba(10,12,14,.9)';
    g.fillRect(nx - 8, ny - 8, 16, 16);
    g.strokeStyle = 'rgba(226,180,90,.9)';
    g.lineWidth = 1;
    g.strokeRect(nx - 7.5, ny - 7.5, 15, 15);
    drawText(g, 'N', nx, ny - 4.5, { size: 9, weight: 1.6, align: 'center', color: '#e2b45a' });
    // jogador: seta branca com contorno escuro
    g.save();
    g.translate(cx, cy);
    if (!this.rotate) g.rotate(-yaw);
    g.shadowColor = 'rgba(0,0,0,.6)';
    g.shadowBlur = 4;
    g.fillStyle = '#f2f1ea';
    g.strokeStyle = 'rgba(0,0,0,.85)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3); g.lineTo(-6.5, 7);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.stroke();
    g.restore();
  }
}
