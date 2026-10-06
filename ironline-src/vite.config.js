import { defineConfig } from 'vite';

// Publicado em https://xxxxsgh.github.io/mathref/ironline/
// `base` PRECISA bater com esse caminho, senão os módulos e assets são
// resolvidos a partir da raiz do domínio e o site carrega uma tela preta.
// Em `vite dev` o servidor também serve em /mathref/ironline/.
export default defineConfig({
  base: '/mathref/ironline/',
  build: {
    outDir: '../ironline',
    emptyOutDir: true,
    // Safari 15 (iOS 15): blocos `static {}` de classe (ES2022, usados pelo three)
    // só existem no Safari 16.4+ — com target es2022 o chunk do three não
    // compilava em iPhones mais antigos e o jogo nem começava. O bundler
    // rebaixa a sintaxe para estes alvos.
    target: ['es2021', 'safari15', 'chrome90', 'firefox90', 'edge90'],
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        // Three num chunk próprio: grande e imutável entre versões do jogo.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
  server: { host: true },
});
