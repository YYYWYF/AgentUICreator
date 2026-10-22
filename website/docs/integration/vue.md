---
title: 在 Vue 工程中接入
---

# 在 Vue 工程中接入

Vue 使用 Web Component 消费 React Agent UI。consumer 负责挂载、配置和事件；Plugin 源码与定制在 React producer，不生成另一套 Vue Plugin。

## 准备资源

已有 React producer 时，在其中安装官方 `web-component-bridge` 兼容资源，然后运行：

```sh
pnpm exec vite build --config src/agent-ui/integrations/web-component-bridge/vite.config.ts
```

路径随源码位置调整。项目配置输出 `dist/agent-ui-web-component/agent-ui.js` ESM 文件，按业务发布流程放到 consumer 的 `public/agent-ui.js`。它与官方独立包的 classic 资源有不同加载方式。

也可先请 Creator 只读检查 Vue 工程并提供接入方案，明确目标文件和编译资源来源。未绑定 consumer 使用 Host 准备的官方编译资源，不向 Vue 工程安装 producer 的 React 构建依赖闭包。

## Vue 3 最小 wrapper

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
const container = ref<HTMLDivElement>();
let disposed = false;
let element: HTMLElement | undefined;
onMounted(async () => {
  const moduleUrl = new URL('/agent-ui.js', window.location.origin).href;
  try {
    await import(/* @vite-ignore */ moduleUrl);
    if (disposed || !container.value) return;
    element = document.createElement('agent-ui');
    element.setAttribute('endpoint', '/api/agent');
    element.setAttribute('locale', 'zh-CN');
    container.value.append(element);
  } catch (error) { console.error('AGENT_UI_MODULE_LOAD_FAILED', error); }
});
onBeforeUnmount(() => { disposed = true; element?.remove(); });
</script>
<template><div ref="container" style="height: 100dvh" /></template>
```

生产工程把错误接入本地化提示和日志。动态配置时赋新的 `config` 对象；监听事件时在卸载清理。Vue 2 使用对应销毁生命周期；规范接入方案按实际版本生成。普通容器 wrapper 不要求修改 Vue Custom Element 编译选项。

## 更新与验证

改 producer 的 AppUIModel 或应用层后重新构建、发布资源，保留 consumer 业务布局和配置。仅刷新 Vue 页面不会改变旧编译代码。

> 截图待补：Vue 成功挂载、模块加载失败，以及 producer 重建后 consumer 生效的对照。

事件与重建规则见[Web Component API](./web-component-api)。
