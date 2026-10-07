// Domo do céu centrado na câmera (filho da CENA, não de ctx.root: não sofre
// origem flutuante). Amostra o cubo HDR do céu distante, aplica a lente
// gravitacional fraca de um buraco negro (deflexão α = 2·rs/b) e por cima
// desenha o campo de estrelas resolvidas. Some com o céu diurno do planeta
// (camU.skyVis).

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, uniform, normalize, positionLocal, cubeTexture, dot, cross, sin, cos, acos, clamp, sqrt, max, length, float, mix, smoothstep, select } from 'three/tsl';
import { camU } from './tslUtil.js';
import { StarField } from './StarField.js';

const R = 1.0e6;

/**
 * Gruda a matriz do objeto na posição da câmera PRINCIPAL no instante do
 * desenho (a nave/câmera pode ter andado depois do nosso frame()). Outras
 * câmeras (captura de mapa de ambiente etc.) não mexem na matriz — senão o
 * buffer de velocidade do pós-processamento veria o céu "pular" entre passes.
 */
function stickToCamera(mesh, mainCamera) {
  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (camera !== mainCamera) return;
    const e = camera.matrixWorld.elements;
    mesh.matrixWorld.makeTranslation(e[12], e[13], e[14]);
  };
  mesh.matrixAutoUpdate = false;
}

export class SkyDome {
  constructor(ctx, skyCube) {
    this.ctx = ctx;
    this.cube = skyCube;
    this.group = new THREE.Group();
    this.group.name = 'space-sky';
    ctx.scene.add(this.group);
    /** (dir.xyz do buraco negro a partir da câmera, rs/D); w=0 → sem lente */
    this.lensU = uniform(new THREE.Vector4(0, 0, 1, 0));
    this.stars = null;
    this.dome = null;
    this._cubeNode = null;
    this.live = ctx.params.has('skylive');
  }

  /** Remonta para um novo layout (sistema estelar) ou preset. */
  build(layout) {
    if (this.stars) {
      this.group.remove(this.stars.mesh);
      this.stars.dispose();
    }
    if (this.dome) {
      this.group.remove(this.dome);
      this.dome.geometry.dispose();
      this.dome.material.dispose();
    }
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthTest: false, depthWrite: false });
    mat.fog = false;
    const lens = this.lensU;
    const tex = this.cube.texture;
    const live = this.live;
    const cubeRef = this.cube;
    mat.colorNode = Fn(() => {
      const v = normalize(positionLocal).toVar();
      // lente fraca: gira a direção de amostragem em direção ao buraco negro
      const d = lens.xyz;
      const cosT = clamp(dot(v, d), -1.0, 1.0);
      const sinT = sqrt(max(float(1.0).sub(cosT.mul(cosT)), 1e-8));
      const alpha = clamp(lens.w.mul(2.0).div(sinT), 0.0, 3.0);
      const toward = normalize(d.sub(v.mul(cosT)).add(vec3(1e-6, 0, 0)));
      const bent = normalize(v.mul(cos(alpha)).add(toward.mul(sin(alpha))));
      const dir = select(lens.w.greaterThan(0.0), bent, v);
      const sky = live ? cubeRef.liveNode(dir) : cubeTexture(tex, dir).xyz;
      return vec4(sky.mul(camU.skyVis), 1.0);
    })();
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 24), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.dome.name = 'space-dome';
    stickToCamera(this.dome, this.ctx.camera);
    this.group.add(this.dome);

    this.stars = new StarField(layout, this.ctx.quality.name, R * 0.9, lens);
    stickToCamera(this.stars.mesh, this.ctx.camera);
    this.group.add(this.stars.mesh);
  }

  /** Mantém o domo grudado na câmera. */
  follow(camPos) {
    this.group.position.copy(camPos);
    this.group.updateMatrixWorld(true);
  }

  dispose() {
    this.stars?.dispose();
    this.dome?.geometry.dispose();
    this.dome?.material.dispose();
    this.ctx.scene.remove(this.group);
  }
}
