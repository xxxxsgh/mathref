import { defineConfig } from 'vite';

// Publicado em https://xxxxsgh.github.io/mathref/rps3d/
// `base` PRECISA bater com esse caminho, senão os módulos são resolvidos a
// partir da raiz do domínio e o jogo abre numa tela preta.
export default defineConfig({
  base: '/mathref/rps3d/',
  build: {
    outDir: '../rps3d',
    emptyOutDir: true,
    // three/webgpu usa sintaxe ES2022 (static blocks); Safari 16.4+ já tem,
    // e WebGPU/TSL não roda em Safari mais antigo de qualquer jeito.
    target: ['es2022', 'safari16.4', 'chrome113', 'firefox115'],
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
