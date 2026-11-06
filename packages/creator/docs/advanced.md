# Creator 进阶配置与维护参考

首次接入请先阅读 [Vite 接入指引](../dist/documentation/guide/creator-dock-vite.md)。本文面向需要自定义配置或维护 Creator 的开发者。

Creator 的 TypeScript Agent 位于 `packages/creator/src/agent`，Skills 位于 `packages/creator/skills`，内部 Operator 位于 `packages/creator/operator`。用户只安装一个 Creator npm 包，运行产物不依赖仓库目录。详见 [TypeScript 发行](typescript-distribution.md)。

Creator 包含开发时 Node Host、CLI、Vite 代理、React Workbench，以及模型、Agent loop、受控项目工具、验证、回执和诊断服务。目标前端保持独立，生产 Bundle 不包含 Creator。

Creator 是 Agent UI 的开发助手。用户可以直接提问了解使用方法，让它检查当前工程、先设计方案，也可以要求修改和验证。仅在请求依赖工程现状时读取项目；仅在请求修改时进入写路径。普通对话直接显示回答，开发执行信息随实际工作出现。

## 离线文档与按需查询

包内 [Creator 文档索引](../dist/documentation/creator-index.md) 连接公开文档目录与内部开发参考。Agent 使用只读工具 `read_creator_documentation`，先搜索目录和查看章节，再读取相关正文；不会自动加载整本文档。索引随 Creator 发行，离开源码仓库也可使用。文档版本可能与目标项目依赖不同，修改前仍需核对项目实际安装的公开 API。

## CLI

安装到工具宿主工程的 `devDependencies`，在包含 `.agent-ui/creator/.env.local` 的目录运行：

```bash
npm install -D @za38.03/agent-ui-creator
npx agent-ui-creator
```

命令只启动本地 Creator 服务。必须先在宿主工程接入 Dock 并启动宿主开发服务，再在宿主页面点击 **Creator Agent** 展开浮层；不提供独立启动页。
工程选择、安装位置、产品模式、资源安装和模型对话
都在现有 Creator 界面中完成；不传工程参数时不会自动选择仓库示例。
选择已有前端工程后，未初始化的工程会显示初始化界面；已初始化工程通过 `/enable` 补齐并启用官方插件，通过自然语言请求新增组合。模型配置仍从启动目录的 `.agent-ui/creator/.env.local` 读取，与选中的目标工程分开。

也可以用 `--project ./my-agent-app` 预选工程，或执行单次需求：

```bash
npx @za38.03/agent-ui-creator \
  --project ./my-agent-app \
  --message "把用户消息放在左边，AI 消息放在右边"
```

## 模型配置

Creator 主模型的默认单次输出上限为 8192 tokens，可通过 `CREATOR_MODEL_MAX_TOKENS` 显式覆盖。

```env
CREATOR_MODEL_BASE_URL=https://example.com/v1
CREATOR_MODEL_API_KEY=your-key
CREATOR_MODEL_NAME=your-model
```

### Creator 服务启动与公司构建接入

在本仓库运行 `pnpm creator:demo`，会准备开发工具依赖、构建 Creator，再启动本地服务。
必须另行启动已接入 Dock 的宿主工程，并从宿主页面使用 Creator。结束时按 Ctrl+C。

### 在自己的开发页面显示顶部浮层

目标工程的开发服务只需接入一次。Creator 界面由 `dock.html` 的 iframe 承载，顶部标签
使用 Shadow DOM 隔离宿主样式；收起时保留 iframe 和会话，支持拖动标签位置。
Creator 不提供独立启动页，直接访问工具根地址或单独打开 `dock.html` 会被拒绝。

#### Vite：业务工程与 Creator 分别启动

首次在目标工程安装开发依赖：

```sh
pnpm add -D @za38.03/agent-ui-creator
```

在 `package.json` 中添加脚本，保留原有 `dev` 和 `build`：

```json
{
  "scripts": {
    "dev": "vite",
    "dev:creator": "agent-ui-creator --port 47832",
    "build": "vite build"
  }
}
```

在现有 Vite 配置里接入一次开发插件。以下 React 示例保留业务插件；生产构建不加载 Creator，
卸载 Creator 后普通开发也可以继续运行。其他 Vite 工程保留各自的插件：

```ts
import { createRequire } from "node:module";
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

const hostRequire = createRequire(import.meta.url);

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react()];
  if (command === "serve") {
    let creatorInstalled = false;
    try {
      hostRequire.resolve("@za38.03/agent-ui-creator/package.json");
      creatorInstalled = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
    }
    if (creatorInstalled) {
      const creatorModule = "@za38.03/agent-ui-creator/dock/vite";
      const { createCreatorDockVitePlugin } = await import(creatorModule);
      plugins.push(createCreatorDockVitePlugin());
    }
  }
  return { plugins };
});
```

日常使用时，用户照常通过自己的 `pnpm dev` 启动业务工程。需要 Creator 时，另开终端执行
`pnpm dev:creator`；这个命令只启动 Creator，不启动、重启或停止业务工程。
Creator 入口随已接入的业务开发页面加载，不检测工具在线状态。停止 Creator 后入口仍保留，
业务工程继续运行。展开入口后可选择工程、产品形态与源码目录并初始化；
默认不预选工程；首次打开时由用户选择，目录选择器从启动 Creator 的目录开始，不受 `--config-root` 影响。
同一浏览器和 Creator 服务地址下会尝试恢复上次选中的工程；路径失效时重新选择。
清除浏览器站点数据、使用无痕窗口、换浏览器或换服务端口后，需要重新选择。

无需配置页面路由。插件只接入配置它的宿主开发服务，并携带宿主工程身份；
没有接入的其他工程、预览 iframe 和生产页面不会出现这个入口。修改前请核对 Creator 中选中的目标工程。
初次修改 Vite 配置需要正常重载开发服务，之后开关 Creator 不需要重启业务服务。

默认连接 `http://127.0.0.1:47832`。`--port 47832` 在端口占用时明确报错，避免自动切到
浮层不知道的端口；如需多个工程同时运行独立 Creator，为每个工程配置不同的 `--port` 和
`createCreatorDockVitePlugin({ creatorUrl: "http://127.0.0.1:另一个端口" })`。
模型配置默认读取当前工程的 `.agent-ui/creator/.env.local`；也可在脚本末尾添加 `--config-root <工具配置目录>`。
脚本不依赖 Bash 或内联环境变量，Windows 使用相同命令。

Creator 适配器使用 ESM。以下 Creator 加载写法在开发分支使用 `await import()`，兼容 Node.js `22.0.0`；CommonJS 工程可以保留 `module.exports` 和其他依赖的 `require()`，无需修改工程的模块类型。实际 Node 版本还需满足所用构建工具的要求。

如果使用 Rsbuild，合并到开发工具宿主的现有配置中：

```ts
import { defineConfig, type RsbuildPlugin } from "@rsbuild/core";

export default defineConfig(async ({ command }) => {
  const plugins: RsbuildPlugin[] = []; // 保留已有的宿主插件。
  if (command === "dev") {
    const creatorModule = "@za38.03/agent-ui-creator/dock/rsbuild";
    const { createCreatorDockRsbuildPlugin } = await import(creatorModule);
    plugins.push(createCreatorDockRsbuildPlugin({ creatorUrl: "http://127.0.0.1:47832" }));
  }
  return { plugins };
});
```

如果使用 Webpack 5，合并到现有配置函数中：

```js
// webpack.config.cjs / webpack.dev.cjs
module.exports = async (_env, argv) => {
  const plugins = []; // 保留已有的 HTML 生成插件和其他配置。
  if (argv.mode === "development") {
    const { createCreatorDockWebpackPlugin } = await import("@za38.03/agent-ui-creator/dock/webpack");
    plugins.push(createCreatorDockWebpackPlugin({ creatorUrl: "http://127.0.0.1:47832" }));
  }
  return { mode: argv.mode, plugins };
};
```

开发命令设置 `--mode development`，生产构建使用 `--mode production`。ESM 配置沿用 `export default`，在异步配置函数内按相同方式加载。CRACO 需要同时配置 Webpack 插件和独立的开发服务器配置，完整示例见 [Rsbuild / Webpack / CRACO 接入](../dist/documentation/guide/creator-dock-rsbuild-webpack.md)。
Webpack 适配器在 `processAssets` 的 Report 阶段处理编译产生的 `.html` / `.htm` 资产，
兼容已有 HtmlWebpackPlugin 或复制到输出的 HTML，不安装第二份 Webpack 或 HTML 插件。
如果 HTML 由后端或 `devServer.static` 直接提供、不经过 Webpack 输出，则应在那一层
使用通用脚本注入方式；此插件不会自动改写那些磁盘文件或服务器模板。
非 `development` 模式不注册注入 hook，也不修改开发服务器选项。

普通 `webpack serve` 会使用插件配置的 `compiler.options.devServer`。通过 Node API
启动 webpack-dev-server 时，也请使用这份选项，而不是从原始配置重新复制：

```js
// 在异步启动函数内，先等待配置函数返回配置对象。
const config = await require("./webpack.config.cjs")({}, { mode: "development" });
const compiler = webpack(config);
const server = new WebpackDevServer(compiler.options.devServer, compiler);
```

自定义 Node 启动器需要另行合并服务器选项时，可用同一出口提供的
`createCreatorDockWebpackDevServerOptions(serverOptions, { projectRoot, creatorUrl })`。
插件会保留已有设置和代理，并为 Creator 的四个开发转发路径补上工程身份。
已实际验证 Webpack 5.111.1、HtmlWebpackPlugin 5.6.8、webpack-dev-server 5.2.2 / 6.0.0；
其他封装或旧版本需要按其实际入口验收。

三个适配器都只在开发页面接入已构建的 `dock-client.js`，并配置开发时 Agent 转发路径。
Vite 由业务开发服务提供连接脚本，不检测 Creator 在线状态；Rsbuild / Webpack
仍直接加载 Creator 脚本，需要先启动 Creator，后启动或刷新业务页面。
Rsbuild 适配器使用官方 `onBeforeStartDevServer` / `modifyHTMLTags` hooks；生产构建不注入
浮层。没有捆绑或要求用户安装特定 Rsbuild major version。
可选 `projectRoot` 指定开发页面对应的工程（默认配置执行目录，Vite 优先使用其 root，Webpack 使用 compiler context），
可选 `locale` 为 `zh-CN` / `en-US`。它们是宿主接入配置，用户日常的工程与资源选择仍在界面中完成。
CLI 端口占用而改用其他端口时，将实际地址填入 `creatorUrl`，或通过 `CREATOR_DOCK_URL`
配置开发适配器。适配器不会扫描工程、自动改写宿主配置或自动打开任意网页。

请把这段接入放在可选的开发配置或工具宿主中；生成 Agent Frontend 的普通生产配置和源码
保持 Creator 独立，仍可卸载 Creator 后构建。未接入的已有工程页面不会自动出现标签。
公司若有统一 HTML 注入封装，也可让它在开发时加载 `http://127.0.0.1:47832/dock-client.js`；
使用现成适配器还能携带工程身份，并接通 Preview 的开发转发。

当前 `packages/creator/scripts/build-browser.mjs` 仅在构建阶段调用 Vite，安装后启动不需要 Vite。
接入公司 Rsbuild 时，用公司构建命令替换这一段，输出保持为：

```text
packages/creator/
  dist/cli.js              # npm 命令入口
  dist/standaloneServer.js # 本地服务与工程装配
  dist/agent/              # Node Agent、提示词与受控工具
  dist/operator/           # 内部项目操作、资源、更新模块
  dist/contracts/creator/  # canonical 契约
  dist/browser/dock.html   # 浮层 iframe 中的 Creator 界面
  dist/browser/dock-client.js # 注入宿主页面的 classic script
  dist/browser/assets/*   # HTML 引用的静态资源
  skills/*                # Creator Skills
```

浏览器入口位于 `packages/creator/browser/`：`dock.html` 加载 `dock.tsx`，复用 `src/ui/` 的 Creator 界面。
替换为公司 Rsbuild 构建时保留这个 HTML 入口；`dock-client.ts` 需单独输出一个无外部 imports 的 classic/IIFE
`dock-client.js`，供宿主开发页面加载；其内容包含顶部标签和 Preview bridge。界面的 React
依赖应打入浏览器产物，不要求目标工程安装 Creator 的 React 版本。静态资源引用使用相对
路径或本站绝对路径。Node 入口目前保留 TypeScript 编译产物的目录结构；如果再改成单文件
Node bundle，须一并调整 package.json、Agent、Skills、更新服务等使用 `import.meta.url`
解析的路径，并重新跑发行验收，不能直接合并文件。

CLI 默认监听 `127.0.0.1:47832`，端口占用时自动选择空闲端口。
测试时可设置 `CREATOR_PORT=0` 让系统分配空闲端口；普通用户无需设置。Creator 始终不自动打开浏览器。
用户机器使用受支持的 Node.js 启动包内 Agent。
Creator 以 `@za38.03/agent-ui-creator` 独立发行，包含开发用 Mock Agent。
`@za38.03/agent-ui-creator/mock-agent` 仅提供官方场景目录、按 ID 执行的官方 Mock、官方 HTTP/Vite 集成及 JSONL 解析与回放，不提供自定义场景定义、注册器或执行回调。普通工程通过 Creator 的「示例与回放」使用官方 Mock 和本地 JSONL 回放。
内部 Operator 的 TS 实现位于 `packages/creator/operator`，通过 Creator 的 `/project/*`、`/bootstrap` 和 `/source-registry` 入口公开。Plugins 的资源与 catalog 仍独立交付。
更新 Creator 不会自动修改已经生成的项目源码。

`pnpm verify:package` 检查公开包归属、真实 tarball、消费者类型及生成应用的生产依赖边界。Creator 构建由 `pnpm --filter @za38.03/agent-ui-creator build` 执行，类型检查由同包的 `typecheck` 执行。浏览器功能验收需单独进行。

## API

```ts
import { createCreatorClient } from "@za38.03/agent-ui-creator";

const creator = createCreatorClient({
  projectRoot: "/path/to/creator-host-sandbox",
  configRoot: process.cwd(),
});

try {
  await creator.run("右侧增加一个文件预览区域");
} finally {
  await creator.dispose();
}
```

Vite 开发服务适配器由 `@za38.03/agent-ui-creator/vite` 导出，React 工作台面板由 `@za38.03/agent-ui-creator/ui` 导出。它们是可选的开发时集成，不属于生成应用的生产运行时。

## Node Agent 配置

Creator 使用 TypeScript / Node.js Agent，默认模式为 `domain-write`。模型配置属于工具宿主，始终留在服务端：

```env
CREATOR_MODEL_NAME=mimo-v2.5-pro
CREATOR_MODEL_BASE_URL=https://example.com/v1
CREATOR_MODEL_API_KEY=your-key
CREATOR_VERIFICATION_MODE=static_only
```

`static_only` 使用当前修订的类型和结构验证。需要运行诊断时显式设置 `static_and_runtime`；过期或缺失的运行证据不能算作通过。类型检查和构建不能替代浏览器外观、焦点或交互验收。

项目 Playwright 交互验证默认关闭，独立于上述静态/Runtime 模式。需要时设置 `CREATOR_BEHAVIOR_VERIFICATION_ENABLED=1` 并重启 Creator，`0` 为关闭。关闭后不提供交互测试工具，也不因缺少交互测试阻塞交付；回执记录未执行，不标记浏览器验证通过。启用前需由目标项目提供 `@playwright/test` 和 Playwright 配置；Creator 不自动安装测试设施。

Vite Host 按项目惰性启动 Node Agent，通过认证的本地 HTTP 接口转发 AG-UI、运行诊断和控制请求，并在关闭时清理受管进程。模型配置或启动失败会明确报错。

源码开发可设置 `CREATOR_HOT_RELOAD=1`，监听 Agent、契约及 Skills；进行中的运行和暂停的问题保持原检查点，待空闲后重启。npm 安装产物使用已经构建的 Node Agent。

如需连接已经运行的本地 Node Agent，可在支持外部 endpoint 的 Host 中同时配置：

```env
CREATOR_ENDPOINT=http://127.0.0.1:8010
CREATOR_AUTH_TOKEN=development-only-token-1234567890
```

地址仅允许 `http://127.0.0.1:<port>`。Host 检查运行时身份和目标工程；关闭时不终止外部进程。独立 CLI 的工程管理使用自身受管进程。

`CREATOR_AGENT_MODE` 支持 `echo`、`minimal`、`domain-read` 和默认的 `domain-write`。`echo` 用于传输诊断；`domain-read` 禁止项目写入。默认模式也会为分析/检查请求采用只读权限。工具可见性不代表写入授权。

Node Agent 负责工程写入锁、修改记录、修订、回执、事务和撤销。通用文件工具禁止直接修改 AppUIModel 与生成 Registry，使用各自的受控工具。撤销前检查全部文件的当前哈希，保留后续人工修改。

`pnpm test` 运行 TypeScript 测试；契约 fixture 使用 JSON Schema 验证，进程测试运行真实 Node Agent。安装包包含 Agent、内部 Operator、提示词、Skills 和 `dist/contracts/creator`，不需要仓库测试目录或其他语言构建步骤。

## 端口占用或连接不上

先确认业务开发服务与 `pnpm dev:creator` 都在运行。首次接入 Vite 插件后，需要重启一次业务开发服务。
Creator 停止后入口隐藏属于正常行为；重新启动后稍等几秒即可。

若出现 `EADDRINUSE`，先检查是否已经启动了一个 Creator，避免重复启动。
需要同时运行多个工程时，为每个 Creator 使用不同端口，并让脚本和 Vite 配置中的地址一致。
例如把脚本改为 `agent-ui-creator --port 47833`，Vite 中对应使用：

```ts
createCreatorDockVitePlugin({ creatorUrl: "http://127.0.0.1:47833" })
```

浮层仅在接入插件的工程、且 Creator 当前选择了同一工程时显示。可在独立 Creator 页面检查当前选择的工程。

卸载 Creator 时，删除快速接入示例中的插件导入、插件调用和 `dev:creator` 脚本即可。
若希望卸载后也保留原配置，请使用上文 Vite 的可选加载写法。

### 统一本地配置文件

本地工具配置使用 `.agent-ui/creator/.env.local`（参考仓库根目录 `.agent-ui/creator/.env.example`），仅由 Creator 的 Node.js 工具进程读取。密钥使用 `CREATOR_MODEL_API_KEY` 等服务端字段，不添加 `VITE_` 前缀。开发预览的 Agent 和 Mock 连接由 Creator 内部桥接管理；初始化不会生成前端环境配置适配器或包装工程的 Vite 配置。正式应用通过 `<Agent endpoint="业务地址" />` 配置服务，构建和运行不依赖 Creator。用法见随包的 [模型与工具配置](../dist/documentation/guide/configuration.md) 和 [Mock 服务](../dist/documentation/mock/index.md)。
