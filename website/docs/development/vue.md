---
title: "Vue 工程接入"
---

# Vue 工程接入

Vue 页面通过 Web Component 显示 Agent UI。Vue 工程负责放置组件、传入配置和监听事件；**助理的组件实现和定制在提供该 Web Component 的 React 工程中维护**。

按是否需要定制选择接入方式：

| 需求 | 接入方式 |
| --- | --- |
| 用 Creator 创建并持续定制助理 | [创建关联的 Agent UI 工程](#通过-creator-创建并定制) |
| 直接使用官方默认界面 | [安装官方默认界面](#安装官方默认界面) |
| 已有自己维护的 React Agent UI 工程 | [构建并接入定制产物](#使用定制的-react-工程产物) |

## 通过 Creator 创建并定制

当前自动创建流程支持**独立的 npm/pnpm Vue 工程**，沿用工程现有的包管理器及锁文件。共享 workspace、其他包管理器和 Nuxt 暂不支持此流程；已有独立 React 工程时，可按下方[定制产物接入](#使用定制的-react-工程产物)自行构建和发布。

### 1. 启动 Creator 并选择 Vue 工程

按[开始使用](/start/#安装工具)安装 Creator、添加 `dev:creator` 脚本，并按 [Vite](/guide/creator-dock-vite#配置开发面板)或 [Rsbuild / Webpack](/guide/creator-dock-rsbuild-webpack#配置开发面板)接入开发面板。保留 Vue 工程已有的框架插件和其他配置；Vite 示例中的 `react()` 应沿用你工程现有的 Vue 插件。

分别启动 Creator 和 Vue 工程的开发服务，在 Vue 页面展开 Creator，从顶部文件夹菜单选择 **Vue 工程根目录**。

### 2. 创建关联的 Agent UI 工程

Creator 检测到 Vue 后，会显示创建独立 React Agent UI 工程的说明：

1. 选择工作台、助手或嵌入式形态。
2. 在 **独立 Agent UI 工程目录** 中填写相对于 Vue 工程的目录，默认为 `agent-ui`。使用尚不存在或为空的目录；这一步选择的是完整工程的位置，保留 Vue 工程原有的 `src/`。
3. 展开 **查看将安装到独立工程的依赖**，核对包管理器、目录及依赖清单。
4. 确认后点击 **创建工程、安装依赖并构建**，等待完成。

Creator 会在该目录安装依赖、生成助理源码并完成首次构建，将产物更新到 Vue 工程的 `public/agent-ui.js`。以默认目录为例，后续的组件和布局修改位于 `agent-ui/src/agent-ui/`。Vue 工程的依赖保持原有配置。

安装或构建失败时，已创建的目录会保留。按面板提示检查网络、registry、依赖或构建错误，再处理重试；失败提示不代表文件已自动回退。

### 3. 将助理放入 Vue 页面

打开 **查看接入方法 → Vue / 其他框架**，将面板提供的接入需求复制到 Creator 输入框，补充要放置助理的页面和区域。Creator 会检查已有工程和产物，展示具体接入方案，确认后将助理组件添加到指定页面，并传入所需配置。

也可以手动接入：使用下方 [Vue 3 组件示例](#vue-3-组件示例)，将其中的包注册导入替换为关联工程的 ESM 产物：

```ts
const moduleUrl = new URL('/agent-ui.js', window.location.origin).href;
await import(/* @vite-ignore */ moduleUrl);
```

保留示例中的挂载与卸载处理，把 `endpoint` 改为业务 AG-UI 地址。按[各模板的说明](/start/#选择模板和源码位置)设置挂载区域尺寸；嵌入式会填满该区域，助手自带悬浮入口。部署到子目录时调整资源 URL；同一页面只加载所选的一份 Web Component 实现。

### 4. 定制后更新到 Vue 页面

按[模型与工具配置](/guide/configuration)配置 Creator，再描述要修改的布局、组件或文案。Creator 的助理界面修改保存在关联的 React 工程中。

修改完成后，等待当前任务结束，在 **查看接入方法 → Vue / 其他框架** 点击 **构建并更新到宿主**。显示“已更新宿主产物”后，刷新 Vue 页面检查效果。仅修改源码不会自动替换 Vue 页面加载的文件。

以后仍在 Creator 中打开同一个 Vue 工程，工具会读取关联记录并定位到对应的 Agent UI 工程。保留生成的独立工程及两边的 `.agent-ui` 关联记录，便于继续定制和更新。正式发布时，将更新后的 `public/agent-ui.js` 随 Vue 工程正常构建和部署；线上运行无需启动 Creator。

## 安装官方默认界面

在 Vue 工程安装生产依赖，包管理器沿用工程现有配置：

```sh
pnpm add @za38.03/agent-ui-web-component
```

下面示例通过公开入口 `@za38.03/agent-ui-web-component/register` 加载并注册组件。构建工具会把脚本和样式纳入业务产物，Vue 工程无需安装用于编译 React 源码的依赖。包内文件和独立脚本复制方法见 [Web Component 接入](/development/web-component)。

## Vue 3 组件示例

新建 `src/components/AgentPanel.vue` 放入下例，再在 `src/App.vue` 中导入并渲染 `<AgentPanel />`：

```vue
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
const container = ref<HTMLDivElement>();
let disposed = false;
let element: HTMLElement | undefined;
onMounted(async () => {
  try {
    await import('@za38.03/agent-ui-web-component/register');
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

生产工程将错误接入本地化提示和日志，动态配置见[Web Component 配置与事件](/development/web-component-api)。Vue 2 使用对应销毁生命周期。示例通过普通容器挂载，无需修改 Custom Element 编译选项。

## 使用定制的 React 工程产物

已有对应的 React 工程时，在其中安装官方 `web-component-bridge` 兼容资源，然后运行：

```sh
pnpm exec vite build --config src/agent-ui/integrations/web-component-bridge/vite.config.ts
```

配置路径随源码位置调整。项目输出 `dist/agent-ui-web-component/agent-ui.js` ESM 文件，按业务发布流程复制到 Vue 工程的 `public/agent-ui.js`。在上面的 Vue 组件中，将包的动态 import 替换为：

```ts
const moduleUrl = new URL('/agent-ui.js', window.location.origin).href;
await import(/* @vite-ignore */ moduleUrl);
```

`/agent-ui.js` 对应复制后发布的静态文件，部署到子目录时调整为实际 URL。这份 ESM 资源来自自己的 React 工程，包含该工程的定制。官方包公开的 `@za38.03/agent-ui-web-component/agent-ui.js` 则是 classic script，加载方式见 [Web Component 接入](/development/web-component#加载独立脚本)。使用定制资源时**移除官方包的注册导入**，避免同时加载两份实现。

## 更新与验证

使用 npm 入口时，升级兼容版本后重新构建和部署 Vue 工程。通过 Creator 关联工程时，按上方[定制后的更新步骤](#4-定制后更新到-vue-页面)重新构建并更新宿主。自行维护 React 工程时，修改 AppUIModel 或组件后，**重新构建、复制并发布 Web Component 资源**，保留 Vue 页面的业务布局和配置。

事件与重建规则见[Web Component 配置与事件](/development/web-component-api)。
