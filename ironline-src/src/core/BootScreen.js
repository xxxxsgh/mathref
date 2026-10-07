/**
 * Tela de carga (#boot do index.html) com progresso REAL e falhas legíveis.
 *
 * - `step(label, frac)` atualiza a barra (0..1) e o texto e devolve uma
 *   Promise que cede o thread ao navegador (um frame pintado), para a barra
 *   aparecer de verdade e o celular não matar a aba por "página travada".
 * - `fail(title, detail)` troca a barra por uma mensagem e o botão
 *   "Tentar modo leve" (recarrega com ?q=low&lite=1) — nunca gira para sempre.
 * - `done()` marca a carga como concluída (limpa o detector de travamento
 *   do index.html, que força o modo leve se a carga anterior não terminou).
 *
 * Tudo é tolerante: sem #boot (modo shot, ?only=) vira no-op.
 */
const LITE_KEY = 'ironline.boot';

/** URL desta página em modo leve (q=low&lite=1), sem o modo shot. */
export function liteUrl(loc = location) {
  const u = new URL(loc.href);
  u.searchParams.set('q', 'low');
  u.searchParams.set('lite', '1');
  return u.toString();
}

/**
 * Cede o thread principal: espera o próximo frame pintado (rAF + tarefa),
 * com teto de 50 ms para abas em segundo plano (rAF pausado).
 */
export function yieldFrame() {
  return new Promise((resolve) => {
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };
    try {
      requestAnimationFrame(() => setTimeout(go, 0));
    } catch {
      /* sem rAF */
    }
    setTimeout(go, 50);
  });
}

export class BootScreen {
  constructor(doc = globalThis.document) {
    this.doc = doc;
    this.el = doc?.getElementById?.('boot') || null;
    this.bar = doc?.getElementById?.('boot-bar') || null;
    this.msg = doc?.getElementById?.('boot-msg') || null;
    this.frac = 0;
    this.failed = false;
    this.log = [];
    this.t0 = performance.now();
    if (this.el) this.el.classList.add('progress');
  }

  get visible() {
    return !!this.el?.isConnected;
  }

  /** Atualiza o progresso e cede um frame ao navegador. */
  step(label, frac) {
    if (frac != null) this.frac = Math.max(this.frac, Math.min(1, frac));
    if (!this.failed) {
      if (this.bar) this.bar.style.width = `${Math.round(this.frac * 100)}%`;
      if (this.msg && label) this.msg.textContent = `${label} · ${Math.round(this.frac * 100)}%`;
    }
    // avisa o vigia do index.html que a carga está andando
    globalThis.__bootBeat = performance.now();
    return yieldFrame();
  }

  /** Nota curta abaixo da barra (ex.: "modo leve automático"). */
  note(text) {
    const d = this.doc;
    if (!this.el || !d) return;
    let n = d.getElementById('boot-note');
    if (!n) {
      n = d.createElement('small');
      n.id = 'boot-note';
      this.el.appendChild(n);
    }
    n.textContent = text;
  }

  /** Mostra erro legível + botões. Não lança. */
  fail(title, detail = '') {
    this.failed = true;
    globalThis.__bootFailed = { title, detail };
    const d = this.doc;
    if (!d) return;
    // o index.html define a mesma UI em ES5 (vale também quando o módulo nem roda)
    if (typeof globalThis.__bootFailUI === 'function') {
      try {
        globalThis.__bootFailUI(title, detail);
        return;
      } catch {
        /* cai na versão local */
      }
    }
    // sem #boot (já removido): recria um painel mínimo por cima de tudo
    if (!this.visible) {
      this.el = d.createElement('div');
      this.el.id = 'boot';
      d.body.appendChild(this.el);
    }
    this.el.style.opacity = 1;
    this.el.classList.add('failed');
    let box = d.getElementById('boot-err');
    if (!box) {
      box = d.createElement('div');
      box.id = 'boot-err';
      this.el.appendChild(box);
    }
    box.hidden = false;
    box.textContent = '';
    const h = d.createElement('p');
    h.textContent = title;
    const p = d.createElement('code');
    p.textContent = String(detail || '').slice(0, 300);
    const row = d.createElement('div');
    const lite = d.createElement('button');
    lite.textContent = 'Tentar modo leve';
    lite.onclick = () => location.assign(liteUrl());
    const again = d.createElement('button');
    again.textContent = 'Recarregar';
    again.className = 'ghost';
    again.onclick = () => location.reload();
    row.append(lite, again);
    box.append(h, p, row);
  }

  /** Carga concluída: limpa o detector de travamento. */
  done() {
    globalThis.__bootDone = true;
    try {
      sessionStorage.removeItem(LITE_KEY);
    } catch {
      /* armazenamento bloqueado */
    }
  }

  /** Remove a tela (quando a hud não está presente para removê-la). */
  remove() {
    const el = this.el;
    if (!el?.isConnected || this.failed) return;
    el.style.opacity = 0;
    setTimeout(() => el.remove(), 600);
  }
}
