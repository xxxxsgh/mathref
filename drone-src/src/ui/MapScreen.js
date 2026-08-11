import { ZONES, dominantZone } from '../world/Zones.js';
import { CONFIG } from '../config.js';

/**
 * Mapa em tela cheia.
 *
 * O relevo é desenhado uma vez num canvas fora da tela e reaproveitado: são
 * ~26 mil consultas de altura, coisa de dezenas de milissegundos, inaceitável
 * por frame e irrelevante uma vez só. Só a camada de cima (drone, POIs, alcance)
 * é redesenhada enquanto o mapa está aberto.
 *
 * O jogo PAUSA com o mapa aberto. Sem pausa, abrir o mapa em voo é sinônimo de
 * bater — e aí o mapa vira uma coisa que o jogador aprende a não usar.
 */
const SAMPLES = 160;

export class MapScreen {
  constructor(container, terrain, pois, save) {
    this.terrain = terrain;
    this.pois = pois;
    this.save = save;
    this.open = false;

    // Limites do mundo conhecido: todas as zonas mais uma folga.
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const zone of ZONES) {
      minX = Math.min(minX, zone.center.x - zone.radius);
      maxX = Math.max(maxX, zone.center.x + zone.radius);
      minZ = Math.min(minZ, zone.center.z - zone.radius);
      maxZ = Math.max(maxZ, zone.center.z + zone.radius);
    }
    const pad = 260;
    this.bounds = { minX: minX - pad, maxX: maxX + pad, minZ: minZ - pad, maxZ: maxZ + pad };

    this.root = document.createElement('div');
    this.root.id = 'map';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="map-frame">
        <canvas></canvas>
        <div class="map-head">
          <span class="map-zone" data-el="zone"></span>
          <span class="map-hint">TAB fecha</span>
        </div>
        <div class="map-legend" data-el="legend"></div>
      </div>`;
    container.appendChild(this.root);

    this.canvas = this.root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.zoneEl = this.root.querySelector('[data-el="zone"]');
    this.legendEl = this.root.querySelector('[data-el="legend"]');

    this.relief = null;
  }

  /** Projeta coordenada de mundo em pixel do canvas. */
  _project(x, z, w, h) {
    const b = this.bounds;
    return [
      ((x - b.minX) / (b.maxX - b.minX)) * w,
      ((z - b.minZ) / (b.maxZ - b.minZ)) * h,
    ];
  }

  /**
   * Relevo sombreado, gerado sob demanda na primeira abertura.
   * A iluminação é por gradiente leste-oeste: barato e suficiente pra ler onde
   * estão os penhascos e por onde passa o vale.
   */
  _buildRelief() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SAMPLES;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(SAMPLES, SAMPLES);
    const b = this.bounds;
    const stepX = (b.maxX - b.minX) / SAMPLES;
    const stepZ = (b.maxZ - b.minZ) / SAMPLES;

    for (let j = 0; j < SAMPLES; j++) {
      for (let i = 0; i < SAMPLES; i++) {
        const x = b.minX + i * stepX;
        const z = b.minZ + j * stepZ;
        const h = this.terrain.heightAt(x, z);
        const hx = this.terrain.heightAt(x + stepX, z);
        const shade = Math.max(-1, Math.min(1, (h - hx) / 12));

        const { zone } = dominantZone(x, z);
        const base = zone.palette.grass;
        const light = 0.45 + Math.min(1, Math.max(0, (h + 40) / 140)) * 0.5 + shade * 0.22;

        const o = (j * SAMPLES + i) * 4;
        image.data[o] = Math.min(255, ((base >> 16) & 0xff) * light);
        image.data[o + 1] = Math.min(255, ((base >> 8) & 0xff) * light);
        image.data[o + 2] = Math.min(255, (base & 0xff) * light);
        image.data[o + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
    this.relief = canvas;
  }

  toggle(force) {
    this.open = force ?? !this.open;
    this.root.classList.toggle('hidden', !this.open);
    if (this.open && !this.relief) this._buildRelief();
    return this.open;
  }

  /** Redesenha a camada dinâmica. Só roda com o mapa aberto. */
  draw(dronePosition, heading, homePosition) {
    if (!this.open) return;

    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }

    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.relief, 0, 0, w, h);

    // Alcance de rádio a partir da base.
    const [hx, hy] = this._project(homePosition.x, homePosition.z, w, h);
    const scale = w / (this.bounds.maxX - this.bounds.minX);
    ctx.strokeStyle = '#35e0c855';
    ctx.setLineDash([6 * dpr, 6 * dpr]);
    ctx.lineWidth = dpr;
    ctx.beginPath();
    ctx.arc(hx, hy, CONFIG.RADIO.range * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Base
    ctx.fillStyle = '#35e0c8';
    ctx.fillRect(hx - 4 * dpr, hy - 4 * dpr, 8 * dpr, 8 * dpr);

    // POIs descobertos. Os não descobertos não aparecem — o mapa é o registro
    // do que foi visto, não um índice do conteúdo.
    ctx.font = `${11 * dpr}px ui-monospace, monospace`;
    for (const poi of this.pois.discovered) {
      const [px, py] = this._project(poi.origin.x, poi.origin.z, w, h);
      ctx.fillStyle = poi.done ? '#ffcf49' : '#dfe8f2';
      ctx.beginPath();
      ctx.arc(px, py, 4 * dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(poi.def.name, px + 8 * dpr, py + 4 * dpr);
    }

    // Drone: triângulo apontando pra proa.
    const [dx, dy] = this._project(dronePosition.x, dronePosition.z, w, h);
    ctx.save();
    ctx.translate(dx, dy);
    // A proa é medida a partir de -Z, e no mapa -Z aponta pra cima.
    ctx.rotate(-heading);
    ctx.fillStyle = '#ff4d5e';
    ctx.beginPath();
    ctx.moveTo(0, -9 * dpr);
    ctx.lineTo(6 * dpr, 7 * dpr);
    ctx.lineTo(-6 * dpr, 7 * dpr);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const { zone } = dominantZone(dronePosition.x, dronePosition.z);
    this.zoneEl.textContent = zone.name.toUpperCase();
    this.legendEl.textContent =
      `${this.pois.discovered.length}/${this.pois.list.length} pontos encontrados · ` +
      `${Math.round(Math.hypot(dronePosition.x - homePosition.x, dronePosition.z - homePosition.z))} m da base`;
  }
}
