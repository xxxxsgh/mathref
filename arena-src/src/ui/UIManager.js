import { h } from './dom.js';
import { HUD } from './HUD.js';
import { MainMenu, QuitScreen } from './screens/MainMenu.js';
import { PlayScreen } from './screens/PlayScreen.js';
import { InventoryScreen } from './screens/InventoryScreen.js';
import { LoadoutScreen } from './screens/LoadoutScreen.js';
import { MarketScreen } from './screens/MarketScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';
import { ViewerScreen } from './screens/ViewerScreen.js';
import { PauseMenu, BuyMenu, Scoreboard, MatchEnd } from './MatchOverlays.js';

/**
 * Roteador de telas + sobreposições da partida. Cada tela é uma função que
 * devolve um elemento; trocar de tela = substituir o nó (sem framework).
 */
export class UIManager {
  /** @param {any} game */
  constructor(game) {
    this.game = game;
    this.root = /** @type {HTMLElement} */ (document.getElementById('ui'));
    this.layer = h('div', { style: { position: 'absolute', inset: '0' } });
    this.overlayLayer = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    this.root.append(this.layer, this.overlayLayer);
    this.hud = new HUD(this.root, game.settings);
    // HUD por baixo de telas e menus da partida
    this.root.prepend(this.hud.el);
    this.current = '';
    /** @type {HTMLElement|null} */
    this.overlay = null;
    this.overlayKind = '';
    this.scoreboard = null;
    this.lastMode = 'competitive';
    this.invState = null;
    this.settingsTab = 'controls';
    /** de onde o visualizador foi aberto */
    this.viewerReturn = 'main';
  }

  /** Barra superior padrão das telas. */
  topbar(title, extra = [], onBack) {
    return h('div', { class: 'topbar' }, [
      h('button', { class: 'back', onclick: () => { this.game.audio.ui('click'); (onBack || (() => this.show('main')))(); } }, '← Voltar'),
      h('h2', {}, title),
      h('div', { class: 'spacer' }),
      ...extra,
    ]);
  }

  /** @param {'main'|'play'|'inventory'|'loadout'|'market'|'settings'|'quit'|''} name */
  show(name) {
    this.current = name;
    const map = { main: MainMenu, play: PlayScreen, inventory: InventoryScreen, loadout: LoadoutScreen, market: MarketScreen, settings: SettingsScreen, quit: QuitScreen };
    const fn = map[name];
    this.layer.replaceChildren(fn ? fn(this) : h('div'));
    this.layer.style.pointerEvents = fn ? 'auto' : 'none';
  }

  /** Abre o visualizador 3D para 1 item (ou 2 para comparar). */
  openViewer(items) {
    this.viewerReturn = this.current || 'main';
    this.game.setState('viewer');
    this.current = 'viewer';
    this.layer.replaceChildren(
      ViewerScreen(this, items, () => {
        this.game.setState('menu');
        this.show(/** @type {any} */ (this.viewerReturn === 'viewer' ? 'main' : this.viewerReturn));
      }),
    );
    this.layer.style.pointerEvents = 'auto';
  }

  toast(msg) {
    const t = h('div', { class: 'toast' }, msg);
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  // ───── partida ─────

  enterMatch() {
    this.show('');
    this.hud.show(true);
    this.closeOverlay();
    this.showClickToPlay();
  }

  leaveMatch() {
    this.closeOverlay();
    this.hud.show(false);
    this.hideScoreboard();
  }

  /** @param {HTMLElement} el @param {string} kind */
  setOverlay(el, kind) {
    this.closeOverlay();
    this.overlay = el;
    this.overlayKind = kind;
    el.style.pointerEvents = 'auto';
    this.overlayLayer.appendChild(el);
  }

  closeOverlay() {
    if (this.overlay) {
      /** @type {any} */ (this.overlay).cleanup?.();
      this.overlay.remove();
    }
    this.overlay = null;
    this.overlayKind = '';
  }

  /** Menu aberto que bloqueia o input de jogo? */
  get menuOpen() {
    return !!this.overlay && this.overlayKind !== 'click';
  }

  showClickToPlay() {
    const el = h('div', { class: 'click-to-play', onclick: () => this.resumeMatch() }, ['CLIQUE PARA JOGAR', h('small', {}, 'Esc pausa • B loja • Tab placar • F inspecionar')]);
    this.setOverlay(el, 'click');
  }

  resumeMatch() {
    this.closeOverlay();
    this.game.audio.unlock();
    this.game.input.lock();
  }

  /** Perdeu o pointer lock (Esc): pausa, a não ser que outro menu esteja aberto. */
  onUnlock() {
    if (this.game.state !== 'match' || this.game.match?.over) return;
    if (this.overlayKind === 'buy' || this.overlayKind === 'settings' || this.overlayKind === 'end') return;
    this.setOverlay(PauseMenu(this), 'pause');
  }

  showMatchSettings() {
    const el = SettingsScreen(this, { inMatch: true, onBack: () => this.setOverlay(PauseMenu(this), 'pause') });
    el.style.position = 'absolute';
    el.style.inset = '0';
    this.setOverlay(el, 'settings');
  }

  toggleBuyMenu() {
    const m = this.game.match;
    if (!m) return;
    if (this.overlayKind === 'buy') {
      this.closeBuyMenu();
      return;
    }
    const can = m.mode === 'practice' || m.round.phase === 'buy';
    if (!can) {
      this.toast('A loja só abre na fase de compra');
      return;
    }
    if (!m.player.alive) return;
    this.setOverlay(BuyMenu(this), 'buy');
    this.game.input.unlock();
  }

  closeBuyMenu() {
    if (this.overlayKind !== 'buy') return;
    this.closeOverlay();
    this.game.input.lock();
    // se o navegador recusar o lock sem clique, mostra o "clique para jogar"
    setTimeout(() => {
      if (this.game.state === 'match' && !this.game.input.locked && !this.overlay) this.showClickToPlay();
    }, 250);
  }

  showScoreboard() {
    if (this.scoreboard) {
      this.scoreboard.remove();
    }
    this.scoreboard = Scoreboard(this);
    this.overlayLayer.appendChild(this.scoreboard);
  }

  hideScoreboard() {
    this.scoreboard?.remove();
    this.scoreboard = null;
  }

  /** @param {any} m */
  showMatchEnd(m) {
    this.game.input.unlock();
    this.hud.show(false);
    this.hideScoreboard();
    setTimeout(() => this.setOverlay(MatchEnd(this), 'end'), 50);
  }
}
