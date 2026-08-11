import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'DRONEFARER',
        short_name: 'Dronefarer',
        description: 'Simulador arcade de drone FPV — corridas, missões e mundo aberto',
        lang: 'pt-BR',
        theme_color: '#0a0d12',
        background_color: '#0a0d12',
        // `standalone` + `landscape`: no iPad, adicionar à tela de início
        // esconde a barra do Safari e trava a orientação — a única forma de ter
        // tela cheia de verdade lá, já que a Fullscreen API não é confiável.
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/mathref/drone/',
        scope: '/mathref/drone/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Sourcemaps fora do cache: são megabytes que nenhum jogador usa, e o
        // iOS evicta o cache inteiro do site quando passa de ~50 MB.
        globIgnores: ['**/*.map'],
        // O bundle do Three passa do teto padrão de 2 MB do Workbox.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
