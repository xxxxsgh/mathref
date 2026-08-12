import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Terrain } from './Terrain.js';
import { Props } from './Props.js';
import { Dust } from './Dust.js';
import { Collision } from './Collision.js';
import { Sky } from './Sky.js';
import { terrainProfileAt, propMixAt, atmosphereAt, ZONES } from './Zones.js';

/**
 * Junta terreno, cenário, poeira, céu e luz num objeto só, pra que o `main`
 * fale com UM mundo em vez de coordenar cinco sistemas na mão.
 */
export class World {
  constructor(scene, quality, { seed = CONFIG.WORLD.seed } = {}) {
    this.scene = scene;
    this.quality = quality;

    this.sky = new Sky(scene);
    this.terrain = new Terrain(scene, quality, { seed });
    this.props = new Props(scene, this.terrain, quality);
    this.dust = new Dust(scene, quality);
    this.collision = new Collision(this.terrain);

    // O ciclo de vida do chunk arrasta os props junto: um chunk que sai de
    // alcance leva embora as instâncias e os colliders dele.
    // Fase 3: o relevo e o que nasce nele passam a depender da zona. O terreno
    // não sabe o que é uma zona — ele só chama estes dois ganchos.
    this.terrain.profileAt = terrainProfileAt;
    this.props.mixAt = propMixAt;

    this.terrain.onChunkLoad = (chunk) => this.props.populate(chunk);
    this.terrain.onChunkUnload = (chunk) => this.props.clear(chunk);

    this._buildWater();
    this._atmosphereClock = 0;
    this._currentZone = null;

    this._setupLights();
    this._applyFog();
    quality.onChange(() => this._applyFog());

    this._sunOffset = new THREE.Vector3(96, 150, 74);
  }

  _setupLights() {
    // Hemisférica faz o trabalho pesado: sombra do lado de baixo com a cor do
    // chão custa uma luz só e evita que o drone fique preto por baixo.
    this.hemi = new THREE.HemisphereLight(0xbcd4e6, 0x4a4438, 1.55);
    this.scene.add(this.hemi);

    // Sol atrás e à direita da proa inicial. Na frente ele deixa todo o cenário
    // em contraluz, e um mundo de silhuetas pretas não dá referência de
    // profundidade nenhuma — que é justamente o que os props existem pra dar.
    this.sun = new THREE.DirectionalLight(0xfff2da, 2.0);
    this.sun.position.set(96, 150, 74);
    this.sun.castShadow = this.quality.settings.shadows;

    const size = this.quality.settings.shadowMapSize;
    this.sun.shadow.mapSize.set(size, size);
    // Caixa de sombra pequena e colada no drone: sombra nítida onde importa.
    // Cobrir o mundo inteiro com um mapa só daria sombra de 2 px por objeto.
    const extent = 60;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 420;
    this.sun.shadow.bias = -0.0012;
    this.sun.shadow.normalBias = 0.04;

    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.sky.setSunDirection(this.sun.position.clone().normalize());
  }

  /**
   * Água só na costa, num disco em volta do centro da zona.
   *
   * Um plano infinito no nível do mar alagaria o vale industrial junto: o
   * relevo dele oscila em torno do zero e ficaria metade submerso. O disco
   * resolve sem precisar de máscara nem de shader especial.
   */
  _buildWater() {
    const coast = ZONES.find((z) => z.id === 'costa');
    if (!coast) return;
    const geometry = new THREE.CircleGeometry(coast.radius + 420, 40);
    geometry.rotateX(-Math.PI / 2);
    this.waterMaterial = new THREE.MeshLambertMaterial({
      color: coast.palette.water,
      transparent: true,
      opacity: 0.86,
    });
    this.water = new THREE.Mesh(geometry, this.waterMaterial);
    this.water.position.set(coast.center.x, coast.terrain.seaLevel, coast.center.z);
    this.scene.add(this.water);

    // Térmicas subindo pela face dos penhascos: é o que faz a costa exigir
    // pilotagem diferente em vez de ser só uma cor nova.
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      this.thermals = this.thermals ?? [];
      this.thermals.push({
        x: coast.center.x + Math.cos(angle) * coast.radius * 0.62,
        z: coast.center.z + Math.sin(angle) * coast.radius * 0.62,
      });
    }
  }

  /** Registra as térmicas da costa no vento (chamado uma vez pelo jogo). */
  registerThermals(wind) {
    for (const spot of this.thermals ?? []) {
      wind.addSource(new THREE.Vector3(spot.x, this.groundHeight(spot.x, spot.z), spot.z), {
        type: 'thermal',
        radius: 150,
        strength: 4.2,
      });
    }
  }

  _applyFog() {
    // O fog fecha exatamente onde os chunks acabam. Se fechasse depois, o
    // jogador veria a borda do mundo; se fechasse muito antes, estaríamos
    // pagando por geometria invisível.
    const reach = this.quality.settings.viewChunks * CONFIG.WORLD.chunkSize;
    this.scene.fog = new THREE.Fog(this.sky.horizonColor.getHex(), reach * 0.35, reach * 0.95);
    this.sun.castShadow = this.quality.settings.shadows;
  }

  /** Recoloca fog e céu quando a zona ou o clima muda (Fases 3 e 6). */
  setAtmosphere({ fogNear, fogFar, fogColor, ...palette } = {}) {
    this.sky.setPalette(palette);
    if (this.scene.fog) {
      if (fogColor !== undefined) this.scene.fog.color.set(fogColor);
      else this.scene.fog.color.copy(this.sky.horizonColor);
      if (fogNear !== undefined) this.scene.fog.near = fogNear;
      if (fogFar !== undefined) this.scene.fog.far = fogFar;
    }
  }

  groundHeight(x, z) {
    return this.terrain.heightAt(x, z);
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} position  posição do drone
   * @param {THREE.Vector3} velocity
   */
  /**
   * Céu, bruma e vento seguem a zona sob o drone.
   *
   * Recalculado a cada 0,4 s e não por frame: a mistura de zonas custa algumas
   * dezenas de operações e o resultado muda devagar demais pra alguém notar a
   * diferença — mas a transição continua contínua porque os pesos são suaves.
   */
  updateZone(dt, position, wind) {
    this._atmosphereClock -= dt;
    if (this._atmosphereClock > 0) return this._currentZone;
    this._atmosphereClock = 0.4;

    const atmosphere = atmosphereAt(position.x, position.z);
    const reach = this.quality.settings.viewChunks * CONFIG.WORLD.chunkSize;

    this.setAtmosphere({
      horizon: atmosphere.horizon,
      zenith: atmosphere.zenith,
      fogNear: reach * 0.35 * atmosphere.fogScale,
      fogFar: reach * 0.95 * atmosphere.fogScale,
    });
    wind?.setScale(atmosphere.windScale, atmosphere.windDirectionDeg);
    this._currentZone = atmosphere;
    return atmosphere;
  }

  update(dt, position, velocity) {
    this.terrain.update(position);

    // A luz e a caixa de sombra seguem o drone, senão a sombra some assim que
    // o jogador sai da área onde o mapa foi renderizado.
    this.sun.target.position.copy(position);
    this.sun.position.copy(position).add(this._sunOffset);
    this.sun.target.updateMatrixWorld();

    this.dust.update(position, velocity, this.groundHeight(position.x, position.z));
  }

  /** Chamado no render, com a posição já interpolada da câmera. */
  updateVisual(cameraPosition) {
    this.sky.update(cameraPosition);
  }

  dispose() {
    this.terrain.dispose();
    this.props.dispose();
    this.dust.dispose();
    this.sky.dispose();
  }
}
