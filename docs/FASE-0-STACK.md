# Fase 0 — Decisão de Stack

> Registro de decisão arquitetural (ADR) para o jogo 3D de nave espacial.
> Data da pesquisa: 2026-07-28. Todas as versões foram consultadas no registry
> do npm nesta data — não são de memória.

## Resumo executivo

| Categoria | Escolha | Descartados |
|---|---|---|
| Renderer 3D | **Three.js 0.185.1** (`WebGLRenderer`, WebGL2) | Babylon.js 9.18.0, PlayCanvas 2.21.1, `three/webgpu` |
| Camada UI 3D | **JS puro** (HUD em DOM/CSS sobreposto) | R3F 9.6.1 + drei 10.7.7 |
| Física | **Custom arcade** (integrador + spatial hash) | Rapier 0.19.3, Cannon-es 0.20.0, Jolt |
| Ruído | **simplex-noise 4.0.3** + `mulberry32` próprio | fast-simplex-noise, alea, seedrandom |
| Áudio | **`THREE.AudioListener` / `PositionalAudio`** (Web Audio) | Howler 2.2.4, Tone 15.1.22 |
| Build | **Vite 8.1.5** | — |
| Pós-processamento | **postprocessing 6.39.4** (pmndrs) | `EffectComposer` nativo do Three |
| Debug GUI | **lil-gui 0.21.0** + painel próprio | Tweakpane 4.0.5, stats.js 0.17.0 |
| ECS | **Nenhum** (classes + pools + InstancedMesh) | bitECS 0.4.0, Miniplex 2.0.0 |

## Decisões do usuário (Fase 0)

1. **Deploy:** subpasta `/game/` dentro do repo `xxxxsgh/mathref`.
   Fonte em `game-src/`, build commitado em `game/`.
   URL final: `https://xxxxsgh.github.io/mathref/game/` → `base: '/mathref/game/'`.
   O hub MathRaf (`index.html` na raiz) permanece intacto.
2. **Alvo mobile:** iPad recente com iPadOS 26+. Orçamento visual mais folgado;
   WebGPU volta à mesa como avaliação opcional na Fase 6.
3. **Linguagem:** JS puro (`.js`) com anotações JSDoc nas assinaturas públicas.
   Sem passo de compilação de tipos; autocomplete e detecção de typo no editor.

## Justificativas (o porquê)

### Three.js em vez de Babylon/PlayCanvas
Three.js é uma biblioteca de renderização, não uma engine com opiniões. O game
loop, o sistema de entidades e a câmera são nossos — que é exatamente o que se
quer aprender. Babylon entregaria mais pronto, mas o aprendizado seria *Babylon*,
não gráficos 3D.

### WebGL2 em vez de WebGPU (por ora)
O `WebGPURenderer` está production-ready desde o r171 e o iPadOS 26 já suporta
WebGPU. Mesmo assim, WebGL2 vence agora por dois motivos concretos:

- `pmndrs/postprocessing` é **WebGL-only** (verificado no README do repo — não há
  menção a `WebGPURenderer`). No WebGPU usaríamos o `PostProcessing` nativo via
  **TSL**, uma segunda linguagem para aprender simultaneamente.
- Para ~50–200 objetos visíveis com instancing, o gargalo é draw call e overdraw,
  resolvido por arquitetura — não pela API de baixo nível.

Mitigação: a criação do renderer fica isolada em `src/core/Renderer.js`, para que
migrar seja um arquivo e não um refactor.

### Sem React / R3F
Estado que muda 60×/s não pode passar pela reconciliação do React; na prática
tudo vira mutação via `useRef` dentro de `useFrame`, ou seja, JS imperativo com
cerimônia em volta. Custo: +180–250 KB gzip e um segundo modelo mental a aprender
junto com o primeiro. R3F é ótimo para 3D dentro de apps React — não é o caso.

### Física custom em vez de Rapier
O pedido é "arcade com peso": inércia e damping sob controle direto, e a nave
**não** deve capotar realisticamente ao raspar num asteroide. Com um solver de
rigid body o projeto inteiro vira uma luta para desfazer o realismo que ele dá de
graça, ao custo de ~1,2–1,5 MB de WASM.

O que precisamos de fato:
- Integração de velocidade linear + angular com damping (`src/systems/Physics.js`).
- Broadphase por **spatial hash** (grid uniforme) — O(n) em vez de O(n²).
- Narrowphase esfera-vs-esfera e esfera-vs-AABB.
- `three-mesh-bvh` **apenas** na Fase 4, para raycast contra terreno.

### PRNG próprio em vez de `alea`
`simplex-noise@4` aceita uma função `random` na construção, então a seed é nossa.
`alea` teve última publicação em 2021; um `mulberry32` de 8 linhas em
`src/procgen/rng.js` elimina a dependência e serve de material didático.
Seeds derivadas por camada — `hash(seed, "planet", index)` — garantem que gerar o
planeta 3 não dependa de ter gerado o planeta 2 antes.

### Áudio nativo do Three em vez de Howler
`PositionalAudio` sincroniza automaticamente com a matriz de transformação do
objeto e com o listener da câmera — exatamente o que a Howler não faz. Zero
dependência extra. SFX sintetizados com osciladores Web Audio crus (mais leve que
samples e coerente com a estética retrô).

### `postprocessing` da pmndrs em vez do `EffectComposer` nativo
Funde vários efeitos num **único fragment shader**: bloom + vinheta + aberração
cromática = 1 pass em vez de 4. Em iPad é a diferença entre 30 e 45 fps.

### Sem ECS
ECS paga por si a partir de ~10k entidades heterogêneas; teremos ~500. Onde a
localidade de dados importa de verdade (asteroides, projéteis) já usaremos
`TypedArray` + `InstancedMesh` — o benefício do ECS sem o paradigma novo.

## `package.json` proposto

```json
{
  "name": "starfarer",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "three": "0.185.1",
    "postprocessing": "6.39.4",
    "simplex-noise": "4.0.3"
  },
  "devDependencies": {
    "vite": "8.1.5",
    "lil-gui": "0.21.0"
  }
}
```

Adicionados só quando a fase pedir (bundle inicial enxuto):

- `three-mesh-bvh@0.9.13` → Fase 4 (raycast em terreno)
- `vite-plugin-pwa@1.3.0` → Fase 6 (manifest + service worker)

Estimativa de bundle inicial: ~200–230 KB gzip.

### Compatibilidade de peer dependencies (verificada)

| Pacote | Peer declarado | Status |
|---|---|---|
| `postprocessing@6.39.4` | `three >= 0.168.0 < 0.186.0` | ✅ com `three@0.185.1` |
| `three-mesh-bvh@0.9.13` | `three >= 0.159.0` | ✅ |

## Riscos e limitações conhecidas (iOS / iPadOS)

### Afetam o design desde a Fase 1

1. **Pointer Lock não é confiável no iOS/iPadOS.** O esquema "mouse com mira
   livre" é desktop-only. O esquema touch é o primário no iPad, não um fallback —
   precisa ser projetado como cidadão de primeira classe desde já.
2. **`devicePixelRatio` = 2.0 no iPad** → 4× o custo de fill rate em resolução
   nativa. Clampar em `Math.min(dpr, 1.5)`, exposto no `config.js`. É o botão de
   performance mais eficaz que existe.
3. **Throttling térmico:** um iPad segura 60 fps por ~3–5 min e depois cai. Daí a
   necessidade de **qualidade adaptativa** (mede frame time médio e degrada pixel
   ratio → sombras → pós-processamento) já na Fase 1. Retrofitar isso na Fase 6 é
   doloroso.

### Técnicos

4. Render targets `float` de 32 bits travam ou não são filtráveis em vários iOS —
   usar `HalfFloatType` em todo o pós-processamento.
5. `AudioContext` nasce suspenso; só destrava com gesto do usuário (resolvido no
   botão "Iniciar" do menu).
6. Memória de GPU limitada; o iOS Safari **mata a aba sem aviso** ao estourar.
   Texturas procedurais de planeta precisam de teto explícito de resolução e
   `dispose()` disciplinado.
7. **PWA no iOS:** cache do service worker tem limite (~50 MB) e é evictado
   agressivamente. Não pré-cachear assets grandes.
8. Fullscreen API inexistente no Safari do iPhone e parcial no iPad. A solução
   real é `display: standalone` no manifest.
9. `postprocessing@6.39.4` trava em `three < 0.186.0`. Quando o Three lançar
   0.186 ficaremos presos em 0.185.1 por um tempo — aceitável, mas é uma
   dependência de versionamento consciente.

## Estrutura de diretórios planejada

```
mathref/
├── index.html            ← hub MathRaf (intocado)
├── docs/
│   └── FASE-0-STACK.md   ← este documento
├── game-src/             ← fonte do jogo (Vite)
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   └── src/
│       ├── config.js     ← TODAS as constantes de gameplay
│       ├── core/         ← loop, renderer, input, pool, tempo
│       ├── entities/     ← nave, inimigo, projétil, asteroide
│       ├── systems/      ← física, colisão, IA, spawn, câmera
│       ├── procgen/      ← rng, noise, sistema solar, terreno
│       ├── ui/           ← HUD, menus, painel de debug
│       └── audio/        ← listener, SFX sintetizados, música
└── game/                 ← build de produção commitado (GitHub Pages)
```

## Fontes

- [Three.js 2026 — o que mudou (WebGPU, TSL)](https://www.utsubo.com/blog/threejs-2026-what-changed)
- [Guia de migração Three.js → WebGPU (2026)](https://www.utsubo.com/blog/webgpu-threejs-migration-guide)
- [WebKit — novidades do Safari 26 (WWDC25)](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)
- [gpuweb — Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)
- [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing)
- [Guia de pós-processamento em Three.js (2026)](https://threejsroadmap.com/blog/the-complete-guide-to-threejs-post-processing-in-2026)
