# Rsbuild / Webpack / CRACO 开发面板接入

在对应构建工具的开发配置中接入 Creator 面板，保留已有插件、代理和其他选项。Creator 面板自带样式。

## 配置启动脚本

在 `package.json` 中添加脚本，保留原有 `dev` 和 `build`：

```json
{ "scripts": { "dev:creator": "agent-ui-creator --port 47833" } }
```

## 配置开发面板

以下示例只在开发分支加载 Creator，生产构建无需安装 Creator。开发前请先完成 Creator 安装。

Creator 适配器使用 ESM。以下 Creator 加载写法通过 `async` 函数和 `await import()` 加载，兼容最低支持版本 Node.js `22.0.0`。CommonJS 工程继续使用 `module.exports`，其他依赖的 `require()` 可以保留，无需修改 `package.json` 的 `type`。实际 Node 版本还需满足所用构建工具的要求。

## Rsbuild

在 `rsbuild.config.ts` 中合并以下写法，保留工程原有 React/Vue 插件和其他配置：

```ts
import { defineConfig, type RsbuildPlugin } from '@rsbuild/core';

export default defineConfig(async ({ command }) => {
  const plugins: RsbuildPlugin[] = []; // 保留已有插件。
  if (command === 'dev') {
    const creatorModule = '@za38.03/agent-ui-creator/dock/rsbuild';
    const { createCreatorDockRsbuildPlugin } = await import(creatorModule);
    plugins.push(createCreatorDockRsbuildPlugin({ creatorUrl: 'http://127.0.0.1:47833' }));
  }
  return { plugins };
});
```

安装模板后，按 [Rsbuild 样式配置](/development/react.md#rsbuild-样式配置)准备生成助理界面的 Tailwind CSS。

## Webpack 5

以下以 CommonJS 配置 `webpack.config.cjs` 为例。将加载分支合并到已有配置函数中，保留入口、loader、HTML 插件和其他选项。使用 `.js` 文件时，沿用工程的模块格式。

```js
module.exports = async (_env, argv) => {
  const plugins = []; // 保留已有插件。
  if (argv.mode === 'development') {
    const { createCreatorDockWebpackPlugin } = await import('@za38.03/agent-ui-creator/dock/webpack');
    plugins.push(createCreatorDockWebpackPlugin({ creatorUrl: 'http://127.0.0.1:47833' }));
  }
  return { mode: argv.mode, plugins };
};
```

开发命令需设置 `--mode development`；生产构建使用 `--mode production`。安装模板后，按 [Webpack 样式配置](/development/react.md#webpack-5-样式配置)准备生成助理界面的 Tailwind CSS。

适配器处理编译输出的 `.html` / `.htm`。后端模板或 `devServer.static` 直接提供的 HTML 不会自动改写，应在相应开发层显式注入。

用 Node API 启动服务器时，使用插件处理后的选项：

```js
// 在异步启动函数内，先等待配置函数返回配置对象。
const config = await require('./webpack.config.cjs')({}, { mode: 'development' });
const compiler = webpack(config);
const server = new WebpackDevServer(compiler.options.devServer, compiler);
```

自定义合并可使用同一导入路径的 `createCreatorDockWebpackDevServerOptions`，保留处理后的项目路径和代理配置。

## CRACO（Create React App）

在已有的 CommonJS `craco.config.js` 中合并以下配置，保留原有插件、代理和其他选项：

```js
module.exports = async function () {
  const development = process.env.NODE_ENV === 'development';
  const creatorOptions = { creatorUrl: 'http://127.0.0.1:47833' };
  const creatorDock = development
    ? await import('@za38.03/agent-ui-creator/dock/webpack')
    : undefined;

  return {
    // 保留已有的 eslint、style、babel 等配置。
    webpack: {
      // 保留已有的 alias、configure 等配置。
      plugins: {
        add: [
          // 保留已有的 plugins.add 项。
          ...(development
            ? [creatorDock.createCreatorDockWebpackPlugin(creatorOptions)]
            : []),
        ],
      },
    },
    devServer: (config) => development
      ? creatorDock.createCreatorDockWebpackDevServerOptions(config, creatorOptions)
      : config,
  };
};
```

若已有 `module.exports = function (...) { return { ... }; }`，在原函数上添加 `async`，将 `await import()` 放在该函数内、`return` 前，保留原参数和返回配置。删除旧的 Creator `require()` 加载语句；仅添加 `async` 不会改变 `require()` 的行为。标准 CRACO 支持异步配置，自定义脚本封装也需要等待配置函数返回的 Promise。

CRACO / CRA 会单独创建开发服务器配置，因此需要同时接入 `webpack.plugins.add` 和 `devServer`。前者注入页面入口，后者配置携带工程身份的开发代理。若已有 `devServer` 配置函数，先应用原有修改，再将结果传给 `createCreatorDockWebpackDevServerOptions`。

宿主继续使用已有的 `craco start` / `craco build` 脚本。生产构建不加载 Creator 适配器。安装模板后，按 [CRACO 样式配置](/development/react.md#craco--cra-样式配置)将 Tailwind 显式加入内置 PostCSS 处理链；仅新建 `postcss.config.*` 不足以接入。

## 启动与验证

配置完成后，按工程包管理器运行 `npm run dev:creator` 或 `pnpm dev:creator`，保持终端运行；另开终端运行工程原有的开发命令。开发服务已运行时，重启一次。

打开工程开发地址，确认出现 **Creator Agent** 按钮并能连接。工程选择见[开始使用](/start/index.md#选择工程)。

确认端口一致、工程匹配、开发转发可达。生产配置不加载工具插件，**生产 HTML 无 Dock**。不同封装、旧版本和 HTML 来源要单独验证。

### 已验证的启动组合

2026-11-02，在 macOS、Node.js 24.22.1 下，将当前仓库构建的 Creator 链接到两个独立的 React 18.3.1 宿主工程，完成以下验证：

| 宿主          | 版本                                                                        | 启动结果 |
| ----------- | ------------------------------------------------------------------------- | ---- |
| Rsbuild     | 2.3.0                                                                     | 通过   |
| CRACO / CRA | CRACO 7.1.0、react-scripts 5.0.1、Webpack 5.112.2、webpack-dev-server 4.15.2 | 通过   |

两种宿主均可显示 Creator 入口、打开初始化界面、收起后重新打开，并在刷新宿主后恢复面板；工程识别正确，浏览器无运行错误。分别以宿主工程为目标启动的 Creator Agent 子进程健康检查通过，宿主生产构建通过，输出 HTML 不含 Dock。

代理检查确认请求到达未初始化工程的校验接口并返回预期的 409 JSON。此次验证未执行完整 Agent UI 初始化、真实模型对话、真实后端转发或 Windows 验收。

### 配置加载兼容性

2026-11-06，在 macOS、Node.js `22.0.0` 下，提取本文、Creator README 和进阶文档中的配置示例，使用仓库构建的 Creator Dock 入口完成以下检查：

- Webpack `5.112.2` / webpack-cli `6.0.1` 加载异步配置，开发构建通过；移除 Creator 后，生产配置加载与生产构建通过。
- CRACO `7.1.0` 的异步配置加载通过，开发代理保留已有设置和工程身份；移除 Creator 后，生产配置加载通过。
- Vite `6.4.5` 加载现有 CommonJS 工程中的 TypeScript 配置，开发与生产分支通过；进阶文档的可选接入在移除 Creator 后仍可加载开发配置。

Rsbuild `2.2.14` 自身要求 Node.js `^20.19.0 || >=22.12.0`，其开发与生产配置加载在 Node.js `22.23.2` 下验证。以上是配置和模块加载检查，未进行完整宿主启动、浏览器或 Windows 实机验收。
