import { defineConfig } from 'vite';

// Publicado em https://xxxxsgh.github.io/mathref/quadra/
// `base` PRECISA bater com esse caminho, senão os módulos são resolvidos a
// partir da raiz do domínio e o site carrega uma tela preta.
export default defineConfig({
  base: '/mathref/quadra/',
  build: {
    outDir: '../quadra',
    emptyOutDir: true,
    // Safari 15 (iOS 15) não entende blocos `static {}` de classe do three.
    target: ['es2021', 'safari15', 'chrome90', 'firefox90', 'edge90'],
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
  server: { host: true },
});
