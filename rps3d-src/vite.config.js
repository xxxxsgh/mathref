import { defineConfig } from 'vite';

// Publicado em https://xxxxsgh.github.io/mathref/rps3d/
// `base` PRECISA bater com esse caminho, senão os módulos são resolvidos a
// partir da raiz do domínio e o site carrega uma tela preta.
export default defineConfig({
  base: '/mathref/rps3d/',
  build: {
    outDir: '../rps3d',
    emptyOutDir: true,
    // WebGPU/TSL exigem navegadores recentes; o fallback WebGL2 cobre o resto.
    // Safari 16.4+ (iPadOS 16.4) por causa dos blocos `static {}` de classe.
    target: ['es2022', 'safari16.4', 'chrome113', 'firefox115', 'edge113'],
    sourcemap: false,
    chunkSizeWarningLimit: 3000,
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
