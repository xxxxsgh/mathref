import * as THREE from 'three';
import { CONFIG } from '../config.js';
import { Terrain } from './Terrain.js';
import { Props } from './Props.js';
import { Dust } from './Dust.js';
import { Collision } from './Collision.js';
import { Sky } from './Sky.js';

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
    this.terrain.onChunkLoad = (chunk) => this.props.populate(chunk);
    this.terrain.onChunkUnload = (chunk) => this.props.clear(chunk);

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
