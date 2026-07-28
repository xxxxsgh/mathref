import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
    rolldownOptions: {
      output: {
        // Separa o Three num chunk próprio. Ele é grande e praticamente
        // imutável entre versões do jogo; num chunk separado, uma atualização
        // do nosso código não invalida o cache dele no navegador do jogador.
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'postprocessing', test: /node_modules[\\/]postprocessing[\\/]/ },
          ],
        },
      },
    },
  },
  server: {
    host: true, // permite abrir pelo IP na rede local (testar no iPad)
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Sem `includeAssets`: o `globPatterns` abaixo já cobre svg e png, e
      // declarar os dois faz cada ícone entrar duas vezes no manifesto de
      // precache (o Workbox deduplica, mas o número reportado no build fica
      // enganoso — 16 entradas para 12 arquivos).

      manifest: {
        name: 'Starfarer',
        short_name: 'Starfarer',
        description: 'Jogo 3D de nave espacial — exploração e combate num sistema solar procedural',
        lang: 'pt-BR',
        theme_color: '#06080f',
        background_color: '#06080f',
        // `standalone` + `landscape`: no iPad, adicionar à tela de início
        // esconde a barra do Safari e trava a orientação — que é a única
        // forma de ter tela cheia de verdade no iOS, já que a Fullscreen API
        // não é confiável lá.
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/mathref/game/',
        scope: '/mathref/game/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        // Sourcemaps não vão pro cache: são megabytes que nenhum jogador usa,
        // e o iOS evicta o cache inteiro quando ele passa de ~50MB.
        globIgnores: ['**/*.map'],
        // O bundle do Three passa do limite padrão de 2MB do Workbox.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
});
