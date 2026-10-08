import { defineConfig } from 'vite';

// Publicado em https://xxxxsgh.github.io/mathref/exo/
// `base` PRECISA bater com esse caminho, senão os módulos, workers e assets
// são resolvidos a partir da raiz do domínio e o site carrega uma tela preta.
// Em `vite dev` o servidor também serve em /mathref/exo/.
export default defineConfig({
  base: '/mathref/exo/',
  build: {
    outDir: '../exo',
    emptyOutDir: true,
    // mesmos alvos do IRONLINE: Safari 15 não tem blocos `static {}` (usados
    // pelo three) — o bundler rebaixa a sintaxe.
    target: ['es2021', 'safari15', 'chrome90', 'firefox90', 'edge90'],
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // three num chunk próprio: grande e imutável entre versões do jogo
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
  // Web Workers de módulo (core/Workers.js): `new Worker(new URL(...), { type: 'module' })`
  worker: { format: 'es' },
  server: { host: true },
});
