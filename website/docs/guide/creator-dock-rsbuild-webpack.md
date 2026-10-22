---
title: 在 Rsbuild 或 Webpack 页面接入 Creator
---

# 在 Rsbuild 或 Webpack 页面接入 Creator

保留现有构建插件，只在开发配置接入 Dock。先启动 Creator，再启动或刷新业务页面；它们与 Vite 的启停检测方式不同。

## Rsbuild

```ts
import { createCreatorDockRsbuildPlugin } from '@za38.03/agent-ui-creator/dock/rsbuild';
const creatorPlugin = createCreatorDockRsbuildPlugin({
  creatorUrl: 'http://127.0.0.1:47833',
});
// 合并到现有开发配置的 plugins。
```

保留公司封装和原有 React/Vue 插件。适配器使用官方开发服务器及 HTML hooks，不要求安装 Creator 指定的 Rsbuild major。

## Webpack 5

```js
const { createCreatorDockWebpackPlugin } = require('@za38.03/agent-ui-creator/dock/webpack');
const creatorPlugin = createCreatorDockWebpackPlugin({
  creatorUrl: 'http://127.0.0.1:47833',
});
// mode: 'development'，加入现有 plugins，保留 HTML 生成插件。
```

适配器处理编译输出的 `.html` / `.htm`。后端模板或 `devServer.static` 直接提供的 HTML 不会自动改写，应在相应开发层显式注入。

用 Node API 启动服务器时，使用插件处理后的选项：

```js
const compiler = webpack(config);
const server = new WebpackDevServer(compiler.options.devServer, compiler);
```

自定义合并可使用同出口的 `createCreatorDockWebpackDevServerOptions`，不要复制原选项丢失工程身份与代理。

## 验证

确认端口一致、工程匹配、开发转发可达。生产配置不加载工具插件，生产 HTML 无 Dock。不同封装、旧版本和 HTML 来源要单独验证。

> 截图待补：两套真实开发服务的入口和网络连接，以及各自产出的生产 HTML 核对结果。
