import { defineConfig } from 'vite';

// O jogo é publicado em https://xxxxsgh.github.io/mathref/drone/
// `base` PRECISA bater com esse caminho, senão os imports de módulo e os
// assets são resolvidos a partir da raiz do domínio e quebram em produção.
// Em `vite dev` o base é ignorado, então dá pra desenvolver em localhost normal.
export default defineConfig({
  base: '/mathref/drone/',
  build: {
    // Sai direto na pasta `drone/` do repo, que é o que o GitHub Pages serve.
    outDir: '../drone',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
    rolldownOptions: {
      output: {
        // Three num chunk próprio: é grande e praticamente imutável entre
        // versões do jogo. Separado, uma atualização do nosso código não
        // invalida o cache dele no navegador do jogador.
        codeSplitting: {
          groups: [{ name: 'three', test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
  worker: {
    format: 'es',
  },
  server: {
    host: true, // permite abrir pelo IP na rede local (testar no iPad)
  },
});
