import { defineConfig } from 'vite';

// O jogo é publicado em https://xxxxsgh.github.io/mathref/game/
// `base` PRECISA bater exatamente com esse caminho, senão os imports de módulo
// e os assets são resolvidos a partir da raiz do domínio e quebram em produção.
// Em `vite dev` o base é ignorado, então dá pra desenvolver em localhost normal.
export default defineConfig({
  base: '/mathref/game/',
  build: {
    // O build sai direto na pasta `game/` do repo, que é o que o GitHub Pages
    // serve. Por isso o outDir aponta pra fora da raiz do Vite.
    outDir: '../game',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: true, // permite abrir pelo IP na rede local (testar no iPad)
  },
});
