import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Marcadores de navegação: planetas e estações na HUD.
 *
 * ═══ O PROBLEMA QUE ISTO RESOLVE ═══
 *
 * O jogo tinha entrada atmosférica, terreno e pouso funcionando — e mesmo
 * assim, da cadeira do jogador, era indistinguível de "não dá pra entrar no
 * planeta". O motivo é simples: não havia NENHUMA indicação de onde os
 * planetas estão. Um planeta de 2.300 unidades de raio a 4.000 de distância
 * ocupa poucos pixels num céu cheio de estrelas. Você só chegava lá por
 * acidente.
 *
 * A mecânica existir não basta: o jogador precisa saber que ela existe e para
 * onde ir. Este é o elo que faltava.
 *
 * ═══ COMO ═══
 *
 * Um elemento DOM por corpo, criado uma vez e reposicionado por frame com
 * `transform` (nunca `left`/`top`, que forçariam recálculo de layout).
 *
 * Dentro da tela: losango + rótulo. Fora da tela: preso à borda, apontando na
 * direção certa — é o que transforma "está em algum lugar" em "vire para lá".
 *
 * Para não virar poluição com 9 planetas e 3 estações em cena, o rótulo
 * completo só aparece no corpo mais próximo do centro da tela. Os outros
 * ficam como marcas discretas.
 */
export class NavMarkers {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    /** @type {Array<{el: HTMLElement, label: HTMLElement, body: object}>} */
    this.markers = [];
    this._proj = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._invCam = new THREE.Quaternion();
    this._built = false;
  }

  /**
   * Cria um marcador por corpo. Chamado uma vez, quando o sistema existe.
   * @param {import('../procgen/SolarSystem.js').SolarSystem} system
   */
  build(system) {
    if (this._built) return;
    this._built = true;

    const add = (body, kind, name, subtitle) => {
      const el = document.createElement('div');
      el.className = `nav nav--${kind}`;
      el.innerHTML = `
        <svg viewBox="0 0 22 22" class="nav__glyph">
          ${kind === 'station'
            ? '<circle cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="2.5"/>'
            : '<circle cx="11" cy="11" r="7.5"/>'}
        </svg>
        <div class="nav__label"><b></b><span></span></div>`;
      this.root.appendChild(el);
      this.markers.push({
        el,
        label: el.querySelector('.nav__label'),
        name: el.querySelector('.nav__label b'),
        sub: el.querySelector('.nav__label span'),
        body, kind, title: name, subtitle,
        onScreen: false,
      });
    };

    for (const p of system.planets) {
      add(
        p,
        p.spec.landable ? 'planet' : 'gas',
        `PLANETA ${p.spec.name}`,
        p.spec.landable ? p.spec.type.toUpperCase() : 'GIGANTE GASOSO · SEM POUSO',
      );
    }
    for (const s of system.stations) {
      add(s, 'station', s.spec.name, 'ATRACAÇÃO');
    }
  }

  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {THREE.Vector3} shipPos
   */
  update(camera, shipPos) {
    if (!this._built) return;
    const margin = CONFIG.hud.offscreenMargin;
    const halfW = window.innerWidth * 0.5;
    const halfH = window.innerHeight * 0.5;

    // Qual corpo recebe o rótulo completo: o mais alinhado com o centro da
    // tela, entre os que estão visíveis. Mostrar o nome de todos com 12
    // corpos em cena transforma a HUD em sopa de texto.
    let focus = null;
    let focusScore = -Infinity;

    for (const m of this.markers) {
      const pos = m.body.object.position;
      const dist = shipPos.distanceTo(pos) - (m.body.radius ?? 0);

      this._proj.copy(pos).project(camera);
      const inFront = this._proj.z < 1;
      const onScreen = inFront &&
        Math.abs(this._proj.x) < 0.96 && Math.abs(this._proj.y) < 0.96;

      let x, y, rot = 0;
      if (onScreen) {
        x = this._proj.x * halfW;
        y = -this._proj.y * halfH;
        const align = 1 - Math.hypot(this._proj.x, this._proj.y);
        // Alinhamento manda; a distância só desempata entre corpos igualmente
        // centralizados.
        const score = align * 1000 - dist * 0.001;
        if (score > focusScore) { focusScore = score; focus = m; }
      } else {
        // Fora de tela: prende na borda, na direção correta. Mesma matemática
        // do marcador de alvo — sem isso, um planeta atrás de você é
        // informação perdida.
        this._tmp.copy(pos).sub(camera.position);
        this._tmp.applyQuaternion(this._invCam.copy(camera.quaternion).conjugate());
        let ang = Math.atan2(this._tmp.x, -this._tmp.y);
        if (this._tmp.z > 0) ang = Math.atan2(-this._tmp.x, this._tmp.y);
        x = Math.sin(ang) * (halfW - margin);
        y = -Math.cos(ang) * (halfH - margin);
        rot = ang;
      }

      m.el.style.transform = `translate(${x}px, ${y}px)`;
      m.el.classList.toggle('is-offscreen', !onScreen);
      m.el.style.setProperty('--nav-rot', `${rot}rad`);
      m.onScreen = onScreen;
      m._dist = dist;
    }

    // Rótulos: só o corpo em foco mostra nome e distância.
    for (const m of this.markers) {
      const active = m === focus;
      if (m._labelOn !== active) {
        m._labelOn = active;
        m.label.classList.toggle('is-on', active);
      }
      if (!active) continue;
      const d = Math.round(m._dist);
      if (m._lastText !== d) {
        m._lastText = d;
        m.name.textContent = m.title;
        m.sub.textContent = `${m.subtitle} · ${formatDist(d)}`;
      }
    }
  }

  setVisible(v) {
    this.root.style.display = v ? '' : 'none';
  }
}

/** Distâncias na casa das dezenas de milhares viram ruído se mostradas
 *  inteiras. Abreviar mantém a informação útil (ordem de grandeza) legível. */
function formatDist(d) {
  if (d < 0) return 'CHEGANDO';
  if (d >= 10000) return `${(d / 1000).toFixed(1)} km`;
  if (d >= 1000) return `${(d / 1000).toFixed(2)} km`;
  return `${d} u`;
}
