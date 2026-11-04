import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'agent-ui-shadow-css',
      async writeBundle(options) {
        const directory = options.dir!;
        let css = '';
        for (const name of await readdir(directory)) {
          if (name.endsWith('.css')) {
            css += await readFile(path.join(directory, name), 'utf8');
            await unlink(path.join(directory, name));
          }
        }
        const file = path.join(directory, 'agent-ui.js');
        const script = await readFile(file, 'utf8');
        const marker = /(["'`])__AGENT_UI_BUNDLED_PLUGIN_CSS__\1/g;
        if (!marker.test(script)) {
          throw new Error('AGENT_UI_SHADOW_STYLES_MARKER_MISSING');
        }
        await writeFile(
          file,
          script.replace(marker, () => JSON.stringify(css)),
        );
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
