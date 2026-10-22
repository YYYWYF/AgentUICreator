import { defineConfig } from '@rspress/core';
import { pluginPreview } from '@rspress/plugin-preview';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'docs',
  lang: 'zh',
  title: 'Agent UI',
  description: 'Agent UI 用户手册、插件展示与接入文档',
  // Use locally bundled search/assets; deployment does not require external services.
  llms: true,
  globalStyles: fileURLToPath(new URL('./theme/sidebar.css', import.meta.url)),
  // _nav.json selects modules; each module's _meta.json orders its own sidebar.
  // A root _meta.json would combine every module into one global sidebar.
  themeConfig: {
    llmsUI: false,
  },
  plugins: [pluginPreview()],
});
