/**
 * Tutorial contextual de quatro passos, no primeiro voo.
 *
 * Cada passo só sai quando o jogador FAZ a coisa — não quando o tempo acaba.
 * Um tutorial cronometrado ensina a esperar; um tutorial que reage ensina a
 * pilotar. E ele nunca tira o controle: o jogo está rodando o tempo todo por
 * trás, então quem já sabe voar simplesmente cumpre os quatro passos sem notar
 * que havia um tutorial.
 *
 * Pulável a qualquer momento, e nunca mais aparece.
 */
const STEPS = [
  {
    id: 'subir',
    text: 'W sobe, S desce. Solto, o drone paira sozinho.',
    touch: 'Stick esquerdo (metade esquerda da tela) sobe e desce.',
    // 25 m e não 8: o drone já nasce a ~14 m acima do terreno na largada, e um
    // primeiro passo que se completa sozinho antes de o jogador tocar em nada
    // ensina que o tutorial pode ser ignorado.
    done: (ctx) => ctx.altitude > 25,
  },
  {
    id: 'avancar',
    text: 'Seta ↑ inclina pra frente: ganha velocidade e PERDE altura.',
    touch: 'Stick direito pra frente inclina o drone.',
    done: (ctx) => ctx.speedKmh > 25,
  },
  {
    id: 'gate',
    text: 'Siga a seta e cruze o gate 1 para largar. R reinicia a qualquer hora.',
    touch: 'Siga a seta até o gate 1.',
    done: (ctx) => ctx.raceState === 'running',
  },
  {
    id: 'acro',
    text: 'M troca para ACRO: sem auto-nivelamento, é onde estão os tempos de ouro.',
    touch: 'Botão MODO troca para ACRO.',
    done: (ctx) => ctx.mode === 'ACRO',
  },
];

export class Tutorial {
  constructor(container, save, isTouch) {
    this.save = save;
    this.isTouch = isTouch;
    this.step = 0;
    this.finished = Boolean(save.progress.tutorialDone);
    this._holdTimer = 0;

    this.root = document.createElement('div');
    this.root.id = 'tutorial';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="tut-step" data-el="step"></div>
      <div class="tut-text" data-el="text"></div>
      <button data-el="skip">pular</button>`;
    container.appendChild(this.root);

    this.els = {};
    for (const el of this.root.querySelectorAll('[data-el]')) this.els[el.dataset.el] = el;
    this.els.skip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.finish();
    });

    if (!this.finished) this._show();
  }

  _show() {
    const step = STEPS[this.step];
    if (!step) return this.finish();
    this.root.classList.remove('hidden');
    this.els.step.textContent = `${this.step + 1}/${STEPS.length}`;
    this.els.text.textContent = this.isTouch ? step.touch : step.text;
  }

  update(dt, ctx) {
    if (this.finished) return;
    const step = STEPS[this.step];
    if (!step) return this.finish();

    if (!step.done(ctx)) {
      this._holdTimer = 0;
      return;
    }
    // Segura meio segundo depois de cumprido pra dar tempo de ler que deu
    // certo, em vez de o texto sumir no instante do acerto.
    this._holdTimer += dt;
    if (this._holdTimer < 0.5) return;

    this._holdTimer = 0;
    this.step++;
    this._show();
  }

  finish() {
    this.finished = true;
    this.root.classList.add('hidden');
    this.save.progress.tutorialDone = true;
    this.save.write();
  }
}
