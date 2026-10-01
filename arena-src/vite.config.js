import { defineConfig } from 'vite';

// Publicado em https://xxxxsgh.github.io/mathref/arena/
// `base` PRECISA bater com esse caminho, senão os módulos e assets são
// resolvidos a partir da raiz do domínio e o site carrega uma tela preta.
// Em `vite dev` o base é ignorado.
export default defineConfig({
  base: '/mathref/arena/',
  build: {
    outDir: '../arena',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
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
