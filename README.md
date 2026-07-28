# mathref

Repositório com dois sites estáticos publicados pelo GitHub Pages.

| Caminho | O que é |
|---|---|
| [`/`](https://xxxxsgh.github.io/mathref/) | **MathRaf** — hub de matemática (`index.html` na raiz) |
| [`/game/`](https://xxxxsgh.github.io/mathref/game/) | **Starfarer** — jogo 3D de nave espacial |

## Starfarer

Jogo 3D de nave espacial em Three.js: voo 6DOF arcade, combate contra caças
com IA, sistema solar procedural com cinturão de asteroides e estações, voo
contínuo do espaço até a superfície planetária, progressão com upgrades e
missões. Roda no navegador, sem backend, e é instalável como PWA.

- Fonte: [`game-src/`](./game-src)
- Build publicado: `game/` (commitado — o Pages serve a pasta diretamente)
- **Documentação técnica:** [`docs/STARFARER.md`](./docs/STARFARER.md)
- **Decisão de stack:** [`docs/FASE-0-STACK.md`](./docs/FASE-0-STACK.md)

```bash
cd game-src
npm install
npm run dev      # desenvolvimento
npm run build    # gera ../game/ — precisa ser commitado
```

O `index.html` da raiz (MathRaf) não é tocado pelo build do jogo.
