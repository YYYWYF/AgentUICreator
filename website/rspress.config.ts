import { defineConfig } from '@rspress/core';
import { pluginPreview } from '@rspress/plugin-preview';

export default defineConfig({
  root: 'docs',
  lang: 'zh',
  title: 'Agent UI',
  description: 'Agent UI 用户手册、Plugin 展示与接入文档',
  // Use locally bundled search/assets; deployment does not require external services.
  llms: true,
  themeConfig: {
    llmsUI: false,
  },
  plugins: [pluginPreview()],
});
