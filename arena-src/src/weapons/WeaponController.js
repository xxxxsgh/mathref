import * as THREE from 'three';
import { RecoilSystem } from './RecoilSystem.js';
import { buildWeaponModel } from './Models.js';
import { IDLE_CLIP } from './Animator.js';
import {
  KNIFE_DRAW, KNIFE_EQUIP, KNIFE_SLASH_A, KNIFE_SLASH_B, KNIFE_STAB, GUN_INSPECTS,
  pickKnifeInspect, gunDraw, rifleReload, pistolReload,
} from './Animations.js';
import { KNIFE_HEAVY } from './WeaponData.js';
import { weightedPick } from '../core/Rng.js';
import { skinById, STOCK_SKIN } from '../skins/SkinCatalog.js';

/**
 * Armas do jogador: estado (pronto, sacando, recarregando, inspecionando,
 * golpeando), munição, cadência, troca de arma e a ponte com a viewmodel.
 *
 * Inspeção: só começa com a arma ociosa; qualquer ação (atirar, recarregar,
 * trocar, mirar) a CANCELA na hora — o Animator faz crossfade da pose atual
 * (no meio de um giro, inclusive) para a ação seguinte, sem salto.
 */

/** @typedef {'primary'|'secondary'|'melee'} Slot */

export class WeaponController {
  /**
   * @param {import('../combat/Combatant.js').Combatant} actor
   * @param {import('./ViewModel.js').ViewModel} vm
   * @param {import('../combat/CombatSystem.js').CombatSystem} combat
   * @param {import('../audio/AudioManager.js').AudioManager} audio
   */
  constructor(actor, vm, combat, audio) {
    this.actor = actor;
    this.vm = vm;
    this.combat = combat;
    this.audio = audio;
    this.recoil = new RecoilSystem();
    this.rng = Math.random;
    /** @type {'ready'|'drawing'|'reloading'|'inspecting'|'attacking'} */
    this.state = 'ready';
    this.timer = 0;
    this.nextFire = 0;
    /** @type {Slot} */
    this.lastSlot = 'melee';
    this.knifeSide = 0;
    this.knifeChain = 0;
    this.lastKnifeInspect = '';
    this.zoomed = false;
    /** variação da inspeção atual (para o HUD mostrar) */
    this.inspectLabel = '';
    this.inspectRare = false;
    /** @type {Map<string, import('./Models.js').WeaponModel>} */
    this.models = new Map();
    /** @type {((r: import('../combat/CombatSystem.js').ShotResult) => void)|null} */
    this.onShotResult = null;
    /** @type {((r: any) => void)|null} */
    this.onMelee = null;
    /** primeiro saque da faca desde o spawn usa a animação de "equipar" */
    this.knifeFresh = true;
    this.spreadNow = 0;
    this.tmpO = new THREE.Vector3();
    this.tmpD = new THREE.Vector3();
    this.tmpM = new THREE.Vector3();
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();

    vm.animator.onEvent = (name, clip) => this.onAnimEvent(name, clip);
  }

  /** Modelo de primeira pessoa com a skin do item (cache por item). */
  modelFor(ws) {
    const item = ws.item;
    const type = ws.def.type;
    const key = item ? item.id : `stock-${type}`;
    let m = this.models.get(key);
    if (!m) {
      const inst = item
        ? { skin: skinById(item.skinId), floatValue: item.floatValue, patternSeed: item.patternSeed, wearSeed: item.wearSeed }
        : { skin: skinById(STOCK_SKIN[type]), floatValue: 0.02, patternSeed: 1, wearSeed: 7 };
      m = buildWeaponModel(type, inst);
      this.models.set(key, m);
    }
    return m;
  }

  /** Esquece os modelos em cache (troca de loadout). */
  clearModels() {
    this.models.clear();
  }

  get current() {
    return this.actor.weapon;
  }

  /**
   * Equipa um slot.
   * @param {Slot} slot
   * @param {boolean} [flourish] usa a animação de "equipar" (início de round)
   */
  equip(slot, flourish = false) {
    const a = this.actor;
    if (!a.weapons[slot]) return false;
    if (slot !== a.slot) this.lastSlot = a.slot;
    a.slot = slot;
    const ws = a.weapons[slot];
    this.vm.setWeapon(ws.def.type, this.modelFor(ws));
    this.state = 'drawing';
    this.zoomed = false;
    if (ws.def.type === 'knife' && this.knifeFresh) {
      flourish = true;
      this.knifeFresh = false;
    }
    this.timer = ws.def.type === 'knife' && flourish ? KNIFE_EQUIP.duration : ws.def.drawTime;
    const clip = ws.def.type === 'knife' ? (flourish ? KNIFE_EQUIP : KNIFE_DRAW) : gunDraw(ws.def.drawTime);
    this.vm.animator.play(clip, { blend: 0 });
    this.audio.mech('draw');
    this.recoil.reset();
    this.knifeChain = 0;
    return true;
  }

  /** Melhor slot disponível (primária > secundária > faca). */
  bestSlot() {
    const w = this.actor.weapons;
    return w.primary ? 'primary' : w.secondary ? 'secondary' : 'melee';
  }

  cancelInspect() {
    if (this.state !== 'inspecting') return;
    this.state = 'ready';
    this.inspectLabel = '';
    this.vm.animator.stop(0.16);
  }

  startInspect() {
    if (this.state !== 'ready' || this.zoomed) return;
    const type = this.current.def.type;
    let variant;
    if (type === 'knife') {
      variant = pickKnifeInspect(this.rng, this.lastKnifeInspect);
      this.lastKnifeInspect = variant.id;
    } else variant = weightedPick(this.rng, GUN_INSPECTS);
    this.state = 'inspecting';
    this.inspectLabel = variant.label;
    this.inspectRare = !!variant.rare;
    this.vm.animator.play(variant.clip);
    this.audio.mech(type === 'knife' && variant.id !== 'C' && variant.id !== 'A' ? 'flip' : 'inspect');
    if (variant.rare) this.audio.ui('rare');
  }

  startReload() {
    const ws = this.current;
    if (ws.def.type === 'knife' || ws.ammo >= ws.def.mag || ws.reserve <= 0) return;
    if (this.state !== 'ready' && this.state !== 'inspecting') return;
    this.cancelInspect();
    this.state = 'reloading';
    this.zoomed = false;
    const t = ws.def.reloadTime;
    this.timer = t;
    const clip = ws.def.slot === 'secondary' ? pistolReload(t) : rifleReload(t);
    this.vm.animator.play(clip);
  }

  /** @param {string} name @param {import('./Animator.js').Clip} clip */
  onAnimEvent(name, clip) {
    if (name === 'magOut') this.audio.mech('magOut');
    else if (name === 'magIn') {
      this.audio.mech('magIn');
      const ws = this.current;
      const need = ws.def.mag - ws.ammo;
      const take = Math.min(need, ws.reserve);
      ws.ammo += take;
      ws.reserve -= take;
    } else if (name === 'bolt') this.audio.mech('bolt');
    else if (name === 'hit') this.doMeleeHit(clip.name === 'stab');
    else if (name === 'end') {
      if (clip.name === 'inspect') {
        this.state = 'ready';
        this.inspectLabel = '';
      }
      if (clip.name !== 'idle') this.vm.animator.play(IDLE_CLIP, { blend: 0.2 });
    }
  }

  doMeleeHit(heavy) {
    const a = this.actor;
    const o = a.eye(this.tmpO);
    const r = this.combat.melee(a, o, a.yaw, a.pitch, heavy, !heavy && this.knifeChain > 1);
    this.onMelee?.(r);
  }

  /**
   * @param {number} dt
   * @param {import('../core/Input.js').Input} input
   * @param {{ canAct: boolean, speed: number, grounded: boolean, sprinting: boolean, camera: THREE.PerspectiveCamera }} s
   */
  update(dt, input, s) {
    const a = this.actor;
    const ws = this.current;
    const def = ws.def;
    this.recoil.update(dt, def);
    this.nextFire -= dt;
    if (this.state === 'drawing' || this.state === 'reloading' || this.state === 'attacking') {
      this.timer -= dt;
      if (this.timer <= 0) this.state = 'ready';
    }
    this.spreadNow = this.recoil.spread(def, {
      speed: s.speed,
      grounded: s.grounded,
      crouching: a.crouching,
      sprinting: s.sprinting,
      zoomed: this.zoomed,
    });
    if (!a.alive || !s.canAct) return;

    // ─── troca de arma ───
    /** @type {Slot|null} */
    let want = null;
    if (input.pressed('primary')) want = 'primary';
    else if (input.pressed('secondary')) want = 'secondary';
    else if (input.pressed('knife')) want = 'melee';
    else if (input.pressed('lastWeapon')) want = this.lastSlot;
    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      const order = /** @type {Slot[]} */ (['primary', 'secondary', 'melee']).filter((k) => a.weapons[k]);
      const i = order.indexOf(a.slot);
      want = order[(i + (wheel > 0 ? 1 : order.length - 1)) % order.length];
    }
    if (want && want !== a.slot && a.weapons[want]) {
      this.cancelInspect();
      this.equip(want);
      return;
    }

    if (input.pressed('reload')) this.startReload();
    if (input.pressed('inspect')) {
      if (this.state === 'inspecting') this.cancelInspect();
      else this.startInspect();
    }

    // ─── botão direito: golpe pesado (faca) / luneta (DMR) ───
    if (input.buttonsPressed[2]) {
      if (def.type === 'knife') {
        if (this.state === 'ready' || this.state === 'inspecting') {
          this.cancelInspect();
          this.state = 'attacking';
          this.timer = KNIFE_HEAVY.interval;
          this.vm.animator.play(KNIFE_STAB);
          this.audio.knifeSwish(true);
          this.knifeChain = 0;
        }
      } else if (def.zoomFov && (this.state === 'ready' || this.state === 'inspecting')) {
        this.cancelInspect();
        this.zoomed = !this.zoomed;
        this.audio.mech('zoom');
      }
    }

    // ─── botão esquerdo ───
    const trigger = def.auto ? input.buttons[0] : input.buttonsPressed[0];
    if (!trigger) return;
    if (this.state === 'inspecting') this.cancelInspect();
    if (this.state !== 'ready' || this.nextFire > 0) return;

    if (def.type === 'knife') {
      this.state = 'attacking';
      this.timer = def.interval;
      this.nextFire = def.interval;
      this.knifeChain++;
      this.knifeSide ^= 1;
      this.vm.animator.play(this.knifeSide ? KNIFE_SLASH_A : KNIFE_SLASH_B);
      this.audio.knifeSwish(false);
      return;
    }
    if (ws.ammo <= 0) {
      this.audio.mech('dry');
      this.nextFire = 0.25;
      if (ws.reserve > 0) this.startReload();
      return;
    }
    this.fire(s.camera);
  }

  /** @param {THREE.PerspectiveCamera} cam */
  fire(cam) {
    const a = this.actor;
    const ws = this.current;
    const def = ws.def;
    ws.ammo--;
    this.nextFire = def.interval;

    // direção: centro da tela (já inclui o recuo da câmera) + cone de dispersão
    const origin = cam.getWorldPosition(this.tmpO);
    const dir = cam.getWorldDirection(this.tmpD);
    const spread = this.spreadNow;
    if (spread > 0) {
      this.right.set(1, 0, 0).applyQuaternion(cam.quaternion);
      this.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
      // distribuição concentrada no centro (raiz do aleatório = uniforme no disco)
      const r = spread * Math.sqrt(this.rng());
      const th = this.rng() * Math.PI * 2;
      dir.addScaledVector(this.right, Math.cos(th) * r).addScaledVector(this.up, Math.sin(th) * r).normalize();
    }
    const muzzle = this.vm.muzzleWorld(cam, this.tmpM);
    const res = this.combat.fireHitscan(a, origin, dir, def, this.zoomed ? null : muzzle);
    this.recoil.addShot(def, this.rng);
    this.vm.kick(def.kick);
    if (!this.zoomed) {
      this.vm.muzzleFlash();
      this.vm.ejectShell();
    }
    this.audio.shot(def.sound, null);
    this.onShotResult?.(res);
    if (ws.ammo === 0 && ws.reserve > 0) setTimeout(() => this.state === 'ready' && this.startReload(), 180);
  }

  /** Inclinação extra de câmera a aplicar (recuo). */
  get cameraRecoil() {
    return { pitch: this.recoil.pitch, yaw: this.recoil.yaw };
  }
}
