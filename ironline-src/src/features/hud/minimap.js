/**
 * Minimapa giratório (canto superior esquerdo).
 *
 * A planta é RASTERIZADA uma vez a partir dos colisores estáticos do mundo
 * (`ctx.collision`) — não depende de malhas nem de dados extras da feature
 * world. Paredes/prédios (altos) saem claros; coberturas baixas, mais
 * escuras. A cada frame só desenhamos essa imagem girada em torno do
 * jogador + seta, cone de visão, norte e pings de inimigos.
 */
import { drawText } from './font.js';

const S = 268; // tamanho na prancheta
const PPM = 8; // pixels por metro na planta rasterizada
const VIEW = 5.2; // pixels da prancheta por metro (≈ 51 m de lado)

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
    const pad = 30;
    minX -= pad; minZ -= pad; maxX += pad; maxZ += pad;
    const w = Math.min(4096, Math.ceil((maxX - minX) * PPM)), h = Math.min(4096, Math.ceil((maxZ - minZ) * PPM));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const ppm = Math.min(PPM, w / (maxX - minX), h / (maxZ - minZ));
    this.origin = { x: minX, z: minZ, ppm };
    // chão / ruas: tom levemente mais claro dentro dos limites jogáveis
    if (b) {
      g.fillStyle = 'rgba(160,170,178,.07)';
      g.fillRect((b.min.x - minX) * ppm, (b.min.z - minZ) * ppm, (b.max.x - b.min.x) * ppm, (b.max.z - b.min.z) * ppm);
    }
    // grade fina (10 m)
    g.strokeStyle = 'rgba(255,255,255,.035)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = Math.ceil(minX / 10) * 10; x < maxX; x += 10) { g.moveTo((x - minX) * ppm, 0); g.lineTo((x - minX) * ppm, h); }
    for (let z = Math.ceil(minZ / 10) * 10; z < maxZ; z += 10) { g.moveTo(0, (z - minZ) * ppm); g.lineTo(w, (z - minZ) * ppm); }
    g.stroke();
    // classifica: alto (parede/prédio) × baixo (cobertura)
    const tall = [], low = [];
    for (const c of cols) {
      const bx = c.box;
      const hgt = bx.max.y - bx.min.y;
      if (bx.max.y < 0.45 || bx.min.y > 2.6) continue; // chão, calçada, telhados
      const area = (bx.max.x - bx.min.x) * (bx.max.z - bx.min.z);
      if (area > 2500) continue; // lajes gigantes
      if (hgt >= 1.7) tall.push(bx);
      else low.push(bx);
    }
    const rect = (bx) => [(bx.min.x - minX) * ppm, (bx.min.z - minZ) * ppm, (bx.max.x - bx.min.x) * ppm, (bx.max.z - bx.min.z) * ppm];
    g.fillStyle = 'rgba(120,128,134,.55)';
    for (const bx of low) g.fillRect(...rect(bx));
    // prédios: preenchimento + contorno nítido por união (desenha contorno
    // engordado atrás e preenchimento por cima, apagando costuras internas)
    g.fillStyle = 'rgba(214,220,224,.9)';
    for (const bx of tall) { const r = rect(bx); g.fillRect(r[0] - 1.5, r[1] - 1.5, r[2] + 3, r[3] + 3); }
    g.fillStyle = 'rgba(84,91,97,1)';
    for (const bx of tall) g.fillRect(...rect(bx));
    // hachura diagonal nos prédios (leitura de "estrutura", como nos mapas táticos)
    const hp = document.createElement('canvas');
    hp.width = hp.height = 12;
    const hg = hp.getContext('2d');
    hg.strokeStyle = 'rgba(200,206,210,.28)';
    hg.lineWidth = 1.4;
    hg.beginPath();
    hg.moveTo(-2, 14); hg.lineTo(14, -2);
    hg.moveTo(-2, 2); hg.lineTo(2, -2);
    hg.moveTo(10, 14); hg.lineTo(14, 10);
    hg.stroke();
    g.fillStyle = g.createPattern(hp, 'repeat');
    for (const bx of tall) g.fillRect(...rect(bx));
    this.plan = cv;
  }

  draw(ctx, { yaw, pos, pings = [], northOnly = false }) {
    if (!this.plan || ctx.collision.colliders.size !== this.builtCount && ctx.time.frame % 60 === 0) this.build(ctx);
    const g = this.g, k = this.k;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, S, S);
    const c = 18; // chanfro
    // forma: quadrado com canto superior direito chanfrado
    const shape = () => {
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(S - c, 0);
      g.lineTo(S, c);
      g.lineTo(S, S);
      g.lineTo(0, S);
      g.closePath();
    };
    g.save();
    shape();
    g.fillStyle = 'rgba(8,11,13,.74)';
    g.fill();
    g.clip();
    const rot = this.rotate ? yaw : 0;
    const cx = S / 2, cy = S / 2 + 22; // jogador um pouco abaixo do centro (vê mais à frente)
    if (this.plan) {
      const o = this.origin;
      g.save();
      g.translate(cx, cy);
      g.rotate(rot);
      const sc = VIEW / o.ppm;
      g.scale(sc, sc);
      g.translate(-(pos.x - o.x) * o.ppm, -(pos.z - o.z) * o.ppm);
      g.imageSmoothingEnabled = true;
      g.drawImage(this.plan, 0, 0);
      g.restore();
    }
    // cone de visão
    const fov = 0.78;
    const dir = this.rotate ? -Math.PI / 2 : -Math.PI / 2 - yaw;
    const cg = g.createRadialGradient(cx, cy, 0, cx, cy, 150);
    cg.addColorStop(0, 'rgba(242,244,239,.22)');
    cg.addColorStop(1, 'rgba(242,244,239,0)');
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, 150, dir - fov, dir + fov);
    g.closePath();
    g.fill();
    // pings de inimigos (posições de disparo)
    for (const p of pings) {
      let dx = (p.x - pos.x) * VIEW, dz = (p.z - pos.z) * VIEW;
      if (this.rotate) {
        const cs = Math.cos(rot), sn = Math.sin(rot);
        [dx, dz] = [dx * cs - dz * sn, dx * sn + dz * cs];
      }
      const x = Math.max(8, Math.min(S - 8, cx + dx)), y = Math.max(8, Math.min(S - 8, cy + dz));
      g.globalAlpha = Math.min(1, p.a * 1.5);
      g.fillStyle = 'rgba(255,61,51,.3)';
      g.beginPath(); g.arc(x, y, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff3d33';
      g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke();
    }
    g.globalAlpha = 1;
    // vinheta interna
    const vg = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = vg;
    g.fillRect(0, 0, S, S);
    g.restore();
    // jogador
    g.save();
    g.translate(cx, cy);
    if (!this.rotate) g.rotate(-yaw);
    g.fillStyle = '#ffb22e';
    g.strokeStyle = 'rgba(0,0,0,.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -10); g.lineTo(7.5, 8); g.lineTo(0, 4); g.lineTo(-7.5, 8);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
    // borda
    shape();
    g.strokeStyle = 'rgba(242,244,239,.28)';
    g.lineWidth = 1.5;
    g.stroke();
    // cantoneiras
    g.strokeStyle = 'rgba(242,244,239,.85)';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 22); g.lineTo(0, 0); g.lineTo(22, 0);
    g.moveTo(0, S - 22); g.lineTo(0, S); g.lineTo(22, S);
    g.moveTo(S - 22, S); g.lineTo(S, S); g.lineTo(S, S - 22);
    g.moveTo(S - c - 14, 0); g.lineTo(S - c, 0); g.lineTo(S, c); g.lineTo(S, c + 14);
    g.stroke();
    // norte na borda
    const na = (this.rotate ? rot : 0) - Math.PI / 2;
    const R = S / 2 - 15;
    let nx = S / 2 + Math.cos(na) * R * 1.4, ny = S / 2 + Math.sin(na) * R * 1.4;
    nx = Math.max(15, Math.min(S - 15, nx));
    ny = Math.max(15, Math.min(S - 15, ny));
    g.fillStyle = 'rgba(8,11,13,.85)';
    g.beginPath(); g.arc(nx, ny, 11, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,178,46,.9)'; g.lineWidth = 1.2; g.stroke();
    drawText(g, 'N', nx, ny - 5, { size: 10, weight: 1.6, align: 'center', color: '#ffb22e' });
  }
}
