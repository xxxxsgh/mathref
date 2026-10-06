/**
 * Rig auxiliar da viewmodel: mão direita "livre" (com manga) que segura a
 * faca no corpo a corpo rápido e a granada no arremesso, enquanto a arma
 * desce para fora do quadro. As pegas são resolvidas contra a geometria
 * real (SDF do cabo da faca / do corpo da granada) com o mesmo resolvedor
 * das armas (grip.js).
 *
 * Trilhas no espaço da câmera da viewmodel: [px, py, pz, rx, ry, rz] (rad).
 */
import * as THREE from 'three';
import { Hand, POSES, clonePose, buildSleeve } from './arms.js';
import { fitHand, sdCapsule } from './grip.js';
import { buildKnife, buildFrag, buildFlash } from './equipment.js';
import { buildKnifeModel, knifeGrip, KNIFE_MODELS } from './knives.js';
import { basis, basisFD } from './guns.js';
import { Track } from './anim.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ─── trilhas ─────────────────────────────────────────────────────────────
/** Corpo a corpo: prepara à direita, corta em diagonal para a esquerda. */
export function meleeTracks(T = 0.62) {
  const aux = new Track([
    { t: 0, v: [0.26, -0.36, -0.18, 0.6, 0.9, -0.6] },
    { t: 0.1, v: [0.1, -0.01, -0.32, 0.55, 0.5, -1.2], e: 'out' }, // armado à direita, lâmina p/ cima-esquerda
    { t: 0.15, v: [0.09, 0.0, -0.33, 0.5, 0.45, -1.25] },
    { t: 0.24, v: [-0.12, -0.1, -0.4, 0.05, -0.15, -0.5], e: 'in' }, // corte
    { t: 0.32, v: [-0.22, -0.22, -0.34, -0.2, -0.4, -0.2], e: 'out' }, // acompanhamento
    { t: 0.46, v: [-0.12, -0.45, -0.25, -0.5, -0.2, 0.2], e: 'inOut' },
    { t: T, v: [-0.12, -0.6, -0.2, -0.6, -0.2, 0.2] },
  ]);
  const gun = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.1, v: [-0.06, -0.28, 0.08, -0.75, -0.25, -0.35], e: 'out' },
    { t: 0.38, v: [-0.06, -0.28, 0.08, -0.75, -0.25, -0.35] },
    { t: T, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' },
  ]);
  return { name: 'melee', duration: T, gun, aux, item: 'knife', hitAt: 0.19, busy: true, auxVis: [0.0, 0.47] };
}
/** Granada: arma desce, a mão sobe com a granada e puxa o pino (cozinhar). */
export function nadeRaiseTracks(item = 'frag', T = 0.34) {
  const aux = new Track([
    { t: 0, v: [0.2, -0.38, -0.12, 0.7, 0.4, -0.2] },
    { t: T, v: [0.1, -0.075, -0.3, 0.3, 0.3, -0.2], e: 'out3' },
  ]);
  const gun = new Track([
    { t: 0, v: [0, 0, 0, 0, 0, 0] },
    { t: 0.16, v: [-0.06, -0.28, 0.08, -0.75, -0.25, -0.35], e: 'out' },
    { t: T, v: [-0.06, -0.28, 0.08, -0.75, -0.25, -0.35] },
  ]);
  return { name: 'nadeRaise', duration: T, gun, aux, item, pinAt: 0.22, busy: true, auxVis: [0, 99], hold: true };
}
/** Arremesso: recua o braço, lança por cima do ombro e volta à arma. */
export function nadeThrowTracks(item = 'frag', T = 0.62) {
  const aux = new Track([
    { t: 0, v: [0.1, -0.075, -0.3, 0.3, 0.3, -0.2] },
    { t: 0.12, v: [0.2, 0.0, -0.12, 0.7, 0.35, -0.3], e: 'inOut' }, // braço atrás
    { t: 0.2, v: [0.05, 0.02, -0.55, -0.6, 0.0, 0.1], e: 'in' }, // solta
    { t: 0.34, v: [-0.02, -0.3, -0.45, -1.0, -0.1, 0.2], e: 'out' },
    { t: T, v: [-0.02, -0.55, -0.3, -1.0, -0.1, 0.2] },
  ]);
  const gun = new Track([
    { t: 0, v: [-0.06, -0.28, 0.08, -0.75, -0.25, -0.35] },
    { t: 0.28, v: [-0.06, -0.28, 0.08, -0.75, -0.25, -0.35] },
    { t: T, v: [0, 0, 0, 0, 0, 0], e: 'inOut5' },
  ]);
  return { name: 'nadeThrow', duration: T, gun, aux, item, releaseAt: 0.2, busy: true, auxVis: [0, 0.36] };
}

export class AuxRig {
  constructor(M, rig) {
    this.root = new THREE.Group();
    this.root.name = 'aux';
    this.root.visible = false;
    rig.add(this.root);
    this.hand = new Hand(M, { left: false });
    this.sleeve = buildSleeve(M, { left: false });
    this.sleeve.visible = false;
    rig.add(this.sleeve);
    this.anchor = V(0.3, -0.5, 0.05);

    // ─ faca: pega de martelo, polegar sobre o dorso perto da guarda ─
    this.knife = buildKnife(M);
    this.root.add(this.knife, this.hand.root);
    const hk = basis([0, 0, 1], [1, 0.45, 0], [0, 0, 0]);
    // ponto da palma junto aos nós (0, −0.011, −0.082 local) no flanco direito do cabo
    const off = V(0, -0.011, -0.082).applyQuaternion(hk.quat);
    hk.pos.copy(V(0.0125, -0.006, 0.058)).sub(off);
    this.hand.root.position.copy(hk.pos);
    this.hand.root.quaternion.copy(hk.quat);
    const handleSdf = (p) => sdCapsule({ x: p.x / 0.8, y: (p.y + 0.006) / 1.1, z: p.z }, { x: 0, y: 0, z: 0.012 }, { x: 0, y: 0, z: 0.122 }, 0.0122);
    const fk = fitHand(this.hand, this.root, {
      sdf: handleSdf,
      gap: 0.0008,
      spread: [0.0, 0.0, -0.02, -0.05],
      maxFlex: [1.7, 1.8, 1.4],
      thumb: { target: V(-0.006, 0.0045, 0.01), weight: 25 },
    });
    this.grips = { knife: { pos: hk.pos.clone(), quat: hk.quat.clone(), pose: fk.pose } };

    // ─ granadas: palma sobre a alavanca (lado +Z), dedos abraçando o corpo ─
    const frag = buildFrag(M);
    const flash = buildFlash(M);
    this.items = { knife: { root: this.knife }, frag, flash };
    for (const it of [frag, flash]) {
      this.root.add(it.root);
      it.root.visible = false;
    }
    // palma no flanco direito, dedos abraçando a frente até o lado esquerdo,
    // polegar sobre a espoleta; dorso da mão para a direita (a granada fica à
    // vista da câmera)
    const hg = basisFD([0.05, 0.2, -1], [1, 0.15, 0.1], [0, 0, 0]);
    const offG = V(0, -0.0195, -0.035).applyQuaternion(hg.quat);
    hg.pos.copy(V(0.034, -0.008, 0.012)).sub(offG);
    this.hand.root.position.copy(hg.pos);
    this.hand.root.quaternion.copy(hg.quat);
    const ballSdf = (p) => Math.hypot(p.x / 1.0, p.y / 1.25, p.z / 1.0) * 1.0 - 0.031;
    const fg = fitHand(this.hand, this.root, {
      sdf: ballSdf,
      gap: 0.0008,
      spread: [0.12, 0.03, -0.05, -0.14],
      maxFlex: [1.6, 1.8, 1.5],
      thumb: { target: V(-0.008, 0.036, 0.012), weight: 25 },
    });
    this.grips.frag = { pos: hg.pos.clone(), quat: hg.quat.clone(), pose: fg.pose };
    this.grips.flash = this.grips.frag;
    this.pose = clonePose(POSES.relaxed);
    this.current = null;
    this.setItem('knife');
  }

  /**
   * Troca o modelo da faca do golpe rápido (pega resolvida por modelo e
   * cacheada). M = materiais da faca (skin própria).
   */
  setKnifeModel(id, M) {
    this.knifeCache ||= {};
    let k = this.knifeCache[id];
    if (!k) {
      const model = buildKnifeModel(M, id);
      model.visible = false;
      this.root.add(model);
      const spec = KNIFE_MODELS[id] || KNIFE_MODELS.tk7;
      const grip = knifeGrip(this.hand, this.root, model.userData.info, !!spec.reverse);
      k = this.knifeCache[id] = { model, grip };
    }
    if (this.items.knife.root !== k.model) {
      this.items.knife.root.visible = false;
      this.items.knife = { root: k.model };
    }
    this.grips.knife = k.grip;
    if (this.current === 'knife') this.setItem('knife');
    else k.model.visible = false;
  }

  /** Mostra o item e posiciona a mão na pega dele. */
  setItem(name) {
    this.current = name;
    for (const [k, it] of Object.entries(this.items)) it.root.visible = k === name;
    const g = this.grips[name];
    this.hand.root.position.copy(g.pos);
    this.hand.root.quaternion.copy(g.quat);
    this.hand.apply(g.pose);
    const it = this.items[name];
    if (it.pin) it.pin.visible = true, it.pin.position.set(0, 0, 0), it.pin.rotation.set(0, 0, 0);
    if (it.lever) it.lever.visible = true;
  }

  /** Pino arrancado: voa para a esquerda e some (k = 0..1 do puxão). */
  pullPin(k) {
    const it = this.items[this.current];
    if (!it?.pin) return;
    it.pin.position.set(-0.05 * k, 0.04 * k, 0.02 * k);
    it.pin.rotation.set(0, 0, k * 2.5);
    it.pin.visible = k < 1;
  }

  /** Aplica a pose de trilha (espaço da câmera) e mostra/esconde. */
  place(o, visible) {
    this.root.visible = visible;
    this.sleeve.visible = visible;
    if (!visible) return;
    this.root.position.set(o[0], o[1], o[2]);
    this.root.rotation.set(o[3], o[4], o[5], 'YXZ');
  }
}
