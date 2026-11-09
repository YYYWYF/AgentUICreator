import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { finalizeShadowStyles } from './build-styles.mjs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'agent-ui-shadow-css',
      async writeBundle(options) {
        if (!options.dir) throw new Error('AGENT_UI_SHADOW_OUTPUT_MISSING');
        await finalizeShadowStyles(options.dir);
      },
    },
  ],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist/agent-ui-web-component',
    lib: {
      entry: fileURLToPath(new URL('./register.tsx', import.meta.url)),
      formats: ['es'],
      fileName: () => 'agent-ui.js',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
