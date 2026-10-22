# Creator 进阶配置与维护参考

首次接入请先阅读 [三步接入指引](../README.md)。本文面向需要自定义配置或维护 Creator 的开发者。

`packages/creator/python` 是 Python Agent，`packages/creator/skills` 是 Agent 技能。Node Host、CLI、UI 和项目操作等 TS 实现位于 `packages/operator`。用户只安装 Creator，Operator 和含解释器/全部 Python 依赖的平台包自动安装，部署产物不依赖仓库目录。详见 [Creator Python 发行](python-distribution.md)。

Python Agent UI Creator 的开发时 Node host、CLI、Vite 代理与 React Workbench。模型、Agent loop、项目工具、验证、回执和运行时诊断状态都由 `packages/creator/python` 负责；目标前端不需要把 Creator 打进生产 Bundle。

Creator 是 Agent UI 的开发助手。用户可以直接提问了解使用方法，让它检查当前工程、先设计方案，也可以要求修改和验证。仅在请求依赖工程现状时读取项目；仅在请求修改时进入写路径。普通对话直接显示回答，开发执行信息随实际工作出现。

## CLI

安装到工具宿主工程的 `devDependencies`，在包含 `.env.agentui.local` 的目录运行：

```bash
npm install -D @za38.03/agent-ui-creator
npx agent-ui-creator
```

命令启动本地服务并打开带有顶部折叠条的启动页。点击 **Creator Agent** 展开浮层。
工程选择、安装位置、产品模式、资源安装和模型对话
都在现有 Creator 界面中完成；不传工程参数时不会自动选择仓库示例。
选择已有前端工程后，未初始化的工程会显示初始化界面；已初始化工程可通过 `/install`
选择官方能力。模型配置仍从启动目录的 `.env.agentui.local` 读取，与选中的目标工程分开。

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

### 最小图形启动演示与公司构建接入

在本仓库运行 `pnpm creator:demo`，会准备开发工具依赖、构建 Creator，再启动图形界面。
它不启动或初始化示例 Host。结束时按 Ctrl+C；项目预览仍由目标工程自己的开发服务提供，
这个最小入口只提供 Creator 界面和本地操作接口，不自动启动目标工程预览。

### 在自己的开发页面显示顶部浮层

目标工程的开发服务只需接入一次。Creator 界面由 `dock.html` 的 iframe 承载，顶部标签
使用 Shadow DOM 隔离宿主样式；收起时保留 iframe 和会话，支持拖动标签位置。
独立启动页也使用同样的浮层，不再显示占满屏幕的左右工作台。

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
    "dev:creator": "agent-ui-creator --project . --port 47832 --no-open",
    "build": "vite build"
  }
}
```

在现有 Vite 配置里接入一次开发插件。以下 React 示例保留业务插件；生产构建不加载 Creator，
卸载 Creator 后普通开发也可以继续运行。其他 Vite 工程保留各自的插件：

```ts
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react()];
  if (command === "serve") {
    let creatorEntry: string | undefined;
    try { creatorEntry = import.meta.resolve("@za38.03/agent-ui-creator/dock/vite"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ERR_MODULE_NOT_FOUND") throw error;
    }
    if (creatorEntry) {
      const { createCreatorDockVitePlugin } = await import(creatorEntry);
      plugins.push(createCreatorDockVitePlugin());
    }
  }
  return { plugins };
});
```

日常使用时，用户照常通过自己的 `pnpm dev` 启动业务工程。需要 Creator 时，另开终端执行
`pnpm dev:creator`；这个命令只启动 Creator，不启动、重启或停止业务工程。
业务页面已打开也无需刷新，约 2–4 秒内出现顶部 Creator 入口。停止 Creator 后入口自动移除，
业务工程继续运行。展开入口后可确认当前工程、选择产品形态与源码目录并初始化；
`--project .` 只预选当前工程，不会自动初始化或改写业务源码。

无需配置页面路由。插件只接入当前工程的开发服务，并核对 Creator 当前选择的工程身份；
其他工程、预览 iframe 和生产页面不会出现这个入口。切换 Creator 到其他工程时，原工程入口隐藏。
初次修改 Vite 配置需要正常重载开发服务，之后开关 Creator 不需要重启业务服务。

默认连接 `http://127.0.0.1:47832`。`--port 47832` 在端口占用时明确报错，避免自动切到
浮层不知道的端口；如需多个工程同时运行独立 Creator，为每个工程配置不同的 `--port` 和
`createCreatorDockVitePlugin({ creatorUrl: "http://127.0.0.1:另一个端口" })`。
模型配置默认读取当前工程的 `.env.agentui.local`；也可在脚本末尾添加 `--config-root <工具配置目录>`。
脚本不依赖 Bash 或内联环境变量，Windows 使用相同命令。

如果使用 Rsbuild，在开发工具宿主的配置中添加：

```ts
import { createCreatorDockRsbuildPlugin } from "@za38.03/agent-ui-creator/dock/rsbuild";

// 加入现有 plugins 数组，不需要为 Creator 加入宿主 React 插件。
createCreatorDockRsbuildPlugin({ creatorUrl: "http://127.0.0.1:47832" });
```

如果使用 Webpack 5，在现有开发配置的 `plugins` 数组中加入：

```js
// webpack.config.cjs / webpack.dev.cjs
const { createCreatorDockWebpackPlugin } = require("@za38.03/agent-ui-creator/dock/webpack");

// mode 必须为 development。保留已有的 HTML 生成插件和其他配置。
createCreatorDockWebpackPlugin({ creatorUrl: "http://127.0.0.1:47832" });
```

ESM 配置使用 `import { createCreatorDockWebpackPlugin } from "@za38.03/agent-ui-creator/dock/webpack"`。
Webpack 适配器在 `processAssets` 的 Report 阶段处理编译产生的 `.html` / `.htm` 资产，
兼容已有 HtmlWebpackPlugin 或复制到输出的 HTML，不安装第二份 Webpack 或 HTML 插件。
如果 HTML 由后端或 `devServer.static` 直接提供、不经过 Webpack 输出，则应在那一层
使用通用脚本注入方式；此插件不会自动改写那些磁盘文件或服务器模板。
非 `development` 模式不注册注入 hook，也不修改开发服务器选项。

普通 `webpack serve` 会使用插件配置的 `compiler.options.devServer`。通过 Node API
启动 webpack-dev-server 时，也请使用这份选项，而不是从原始配置重新复制：

```js
const compiler = webpack(config);
const server = new WebpackDevServer(compiler.options.devServer, compiler);
```

自定义 Node 启动器需要另行合并服务器选项时，可用同一出口提供的
`createCreatorDockWebpackDevServerOptions(serverOptions, { projectRoot, creatorUrl })`。
插件会保留已有设置和代理，并为 Creator 的四个开发转发路径补上工程身份。
已实际验证 Webpack 5.111.1、HtmlWebpackPlugin 5.6.8、webpack-dev-server 5.2.2 / 6.0.0；
其他封装或旧版本需要按其实际入口验收。

三个适配器都只在开发页面接入已构建的 `dock-client.js`，并配置开发时 Agent 转发路径。
Vite 由业务开发服务提供连接脚本和状态检测，支持 Creator 独立启停；Rsbuild / Webpack
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

当前 `packages/operator/scripts/build-browser.mjs` 仅在构建阶段调用 Vite，安装后启动不需要 Vite。
接入公司 Rsbuild 时，用公司构建命令替换这一段，输出保持为：

```text
packages/creator/
  dist/cli.js              # package.json bin 指向的薄 Node 启动入口
  dist/standaloneServer.js # 兼容转发入口
  dist/python-sidecar.json # 平台包所需 Agent/依赖锁/协议源摘要
  skills/*                 # Creator Skills
packages/operator/
  dist/cli.js              # CLI 实现，由 Creator 入口加载
  dist/standaloneServer.js # 本地服务与工程操作装配
  dist/browser/index.html  # Creator 界面
  dist/browser/dock.html   # 浮层 iframe 中的 Creator 界面
  dist/browser/dock-client.js # 注入宿主页面的 classic script
  dist/browser/assets/*   # HTML 引用的静态资源
```

浏览器源码均归 `packages/operator/browser/`。Rsbuild 入口对应其中的 `main.tsx` 与 `dock.tsx`，HTML 对应 `index.html` 与
`dock.html`。其中的 `dock-client.ts` 需单独输出一个无外部 imports 的 classic/IIFE
`dock-client.js`，供宿主开发页面加载；其内容包含顶部标签和 Preview bridge。界面的 React
依赖应打入浏览器产物，不要求目标工程安装 Creator 的 React 版本。静态资源引用使用相对
路径或本站绝对路径。Node 入口目前保留 TypeScript 编译产物的目录结构；如果再改成单文件
Node bundle，须一并调整 package.json、Python、Skills、更新服务等使用 `import.meta.url`
解析的路径，并重新跑发行验收，不能直接合并文件。

CLI 默认监听 `127.0.0.1:47832`，端口占用时自动选择空闲端口。
测试时可设置 `CREATOR_PORT=0` 和 `CREATOR_OPEN_BROWSER=0`；普通用户无需设置。
用户机器只需安装受支持的 Node.js；Creator 自动依赖匹配平台的完整 Python 执行包，启动不需要 pip 源。
Creator 以 `@za38.03/agent-ui-creator` 独立发行，包含开发用 Mock Agent。
通过 `@za38.03/agent-ui-creator/mock-agent` 导入场景、HTTP handler 和 Vite Mock 集成。
Operator 的 TS 实现位于 `packages/operator`，拥有独立 npm 身份和版本，由 Creator 自动依赖。项目操作模块位于 `control/`，通过 Operator `/project/*`、`/bootstrap` 和 `/source-registry` 公开；Creator 原有导入路径继续转发。Plugins 的资源与 catalog 仍独立交付。
更新 Creator 不会自动修改已经生成的项目源码。

`pnpm verify:creator-workbench` 会构建、打包本仓库的 npm 包，用本地 tarball 模拟内部
Registry，然后在仓库外的新工程中仅直接安装 Creator，验证图形资产、工程选择、
初始化设置、dock 资产和退出清理。该验收不发送模型请求，也不修改已有工程。
已构建时可加 `--skip-build`。验收通过本地临时 registry 提供未发布的官方包；第三方依赖继续使用配置的 npm 源与缓存。

## API

```ts
import { createPythonCreatorClient } from "@za38.03/agent-ui-creator";

const creator = createPythonCreatorClient({
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

## Python Creator

Creator 只使用 Python 控制面，默认 agent mode 为 `domain-write`。正常开发只需配置
模型，无需设置 `CREATOR_PYTHON_AGENT_MODE=domain-write`：

```env
CREATOR_MODEL_NAME=mimo-v2.5-pro
CREATOR_MODEL_BASE_URL=https://example.com/v1
CREATOR_MODEL_API_KEY=your-key
# 默认安全关闭 Runtime Verification；需要时显式打开
CREATOR_VERIFICATION_MODE=static_only
```

`CREATOR_VERIFICATION_MODE=static_only` 是默认值：完成门槛只使用当前 revision 的
Host 静态验证，Workbench 也不会发送 Runtime diagnostics 或 composition reports。
需要 Runtime Verification 和这些上报时，把它改成 `static_and_runtime`；Runtime
`stale` 或 `unavailable` 不会把已经提交的修改标成红色失败。

### Installed @za38.03/agent-ui-creator

安装 npm 包时，npm 自动安装匹配 OS/CPU 的平台 optionalDependency，包含解释器、锁定依赖和 Agent 源码。首次与后续启动都直接使用平台包，不查找系统 Python、不创建 venv、不执行 pip。请启用可选依赖，并确保公司 npm 镜像提供所有声明的平台包。

以下缓存仅用于源码仓库开发：macOS 的 `~/Library/Caches/agent-ui-creator/python/`、Linux 的
`$XDG_CACHE_HOME/agent-ui-creator/python/`（未设置时使用 `~/.cache/agent-ui-creator/python/`），
以及 Windows 的 `%LOCALAPPDATA%/agent-ui-creator/python/`。可通过
`CREATOR_PYTHON_ENV_ROOT` 或 host config 中的同名配置指定缓存根目录。环境按 Creator
版本、Python major.minor、platform、architecture 和 lockfile SHA-256 分开保存。
旧缓存不会自动清理；中断进程留下的 bootstrap lock 需要在确认没有 Creator 进程运行后手动删除。

`pythonExecutable` option、`CREATOR_PYTHON_EXECUTABLE` 环境变量、host config 中的同名
配置按顺序优先。显式配置表示用户自行管理完整 Python 3.11+ dependency environment；
Creator 检查版本并启动，不创建 venv，也不修改用户环境。缺依赖时直接报错。

### Repository development

仓库开发使用 `pnpm test:python:setup` 创建 `packages/creator/python/.venv`。
未显式配置 Python 时，source checkout 优先复用该环境；不存在时使用上述独立缓存。

### Distribution gate

发布前先在各平台 Python 构建任务生成完整 sidecar npm artifact，再在 Node 任务还原并执行 `pnpm verify:creator-distribution`。该门禁包含平台解析单测、npm tarball 结构与完整 Contract parity、脱离仓库的 Sidecar health，以及清空 PATH 后不依赖系统 Python/pip 的真实启动与重启。
测试不发送模型请求。Creator distribution CI 使用此门禁；独立 npm 包发行还执行 `pnpm verify:package`。

可分别执行 `pnpm verify:creator-package`、`pnpm test:creator-package-runtime`。`pnpm verify:creator-python-wheel` 保留用于 Python 开发包验收，不再是 Node 发布任务的前置条件。Contract 的唯一源码是 `packages/creator/contracts/creator`；平台包和 wheel 都打包为 `agent_ui_creator/_contracts/creator`，不依赖仓库目录结构。

Vite 插件会按项目惰性启动一个 Python 进程，透明代理 AG-UI 与运行时诊断流，
并在开发服务器关闭时终止 sidecar。Python 启动或模型配置失败会明确失败；工程中
没有其他 Creator runtime。

开发时如果希望 Python 源码变化后自动重启 sidecar，可在 `.env.agentui.local` 中开启：

```env
CREATOR_PYTHON_HOT_RELOAD=1
```

该开关只监听 `packages/creator/python/agent_ui_creator/**/*.py`。内部托管的 sidecar
由 Creator Host 重启；使用 `pnpm creator:python` 启动的外部 sidecar 由开发监督器重启。
修改依赖或 `requirements.lock` 后仍需手动重新安装环境。

如需让 Vite Host 连接已在本机启动的 sidecar，而不再创建和管理子进程，可在
`.env.agentui.local` 同时配置：

```env
CREATOR_PYTHON_ENDPOINT=http://127.0.0.1:8010
CREATOR_PYTHON_AUTH_TOKEN=development-only-token-1234567890
```

外部 endpoint 只允许 `http://127.0.0.1:<port>`。Vite 会在首次请求前校验 health、
协议版本与 agent mode，关闭开发服务器时不会终止外部 sidecar。

Minimal Agent 仅作为工具协议诊断模式保留：

```env
CREATOR_PYTHON_AGENT_MODE=minimal
CREATOR_MODEL_NAME=mimo-v2.5-pro
CREATOR_MODEL_BASE_URL=https://example.com/v1
CREATOR_MODEL_API_KEY=your-key
```

该模式只验证受限的 read/edit/grep 工具协议，不包含 AppUIModel、Operator、
Fast Path、Validation 或 Completion 业务能力。Phase 3A 的历史领域诊断模式改用：

```env
CREATOR_PYTHON_AGENT_MODE=domain-read
```

Domain Read 模式复用相同模型栈，并通过正式 Operator v2 入口开放六个只读领域工具；
不会开放 `mutate_app_ui_model`，但仍保留受限 `edit_file`，不能据此认定该显式模式是只读执行边界。
默认模式的 `INSPECT` 请求使用单独的只读权限作用域，模型工具与文件系统执行侧均禁止写入。

默认的静态组合写模式也可以显式写成：

```env
CREATOR_PYTHON_AGENT_MODE=domain-write
```

它在 Domain Read 工具面上增加 `mutate_app_ui_model`，由 Python Host 负责 project lock、
capture-before、changedPaths 对账、Activity revision、receipt、transaction 与 undo。
`app-ui/app-ui.json`、`app-ui/composition-revision.generated.json` 和
`plugins/registry.generated.ts` 仍禁止通用文件工具直接编辑。
Runtime Verification（可选）、Host Validation、Completion、回执与 transaction 状态同样
由 Python Creator 持有。

仓库根目录的 `pnpm test` 会先运行 Python unit/contract tests，再运行 Node host、
Workbench 与前端 TypeScript tests（其中包含真实 sidecar 进程集成测试）。可以使用
`pnpm test:python-sidecar` 单独运行跨语言链路验收。

## 端口占用或连接不上

先确认业务开发服务与 `pnpm dev:creator` 都在运行。首次接入 Vite 插件后，需要重启一次业务开发服务。
Creator 停止后入口隐藏属于正常行为；重新启动后稍等几秒即可。

若出现 `EADDRINUSE`，先检查是否已经启动了一个 Creator，避免重复启动。
需要同时运行多个工程时，为每个 Creator 使用不同端口，并让脚本和 Vite 配置中的地址一致。
例如把脚本改为 `agent-ui-creator --project . --port 47833 --no-open`，Vite 中对应使用：

```ts
createCreatorDockVitePlugin({ creatorUrl: "http://127.0.0.1:47833" })
```

浮层仅在接入插件的工程、且 Creator 当前选择了同一工程时显示。可在独立 Creator 页面检查当前选择的工程。

卸载 Creator 时，删除快速接入示例中的插件导入、插件调用和 `dev:creator` 脚本即可。
若希望卸载后也保留原配置，请使用上文 Vite 的可选加载写法。

### 统一本地配置文件

本地工具配置统一为 `.env.agentui.local`（参考仓库根目录 `.env.agentui.example`）；旧 `.env.creator.local` 请手动重命名，不再读取。工具配置目录与目标项目目录可不同；目录相同时，Creator 配置和开发期 `VITE_AGENT_ENDPOINT` 可共用此文件。密钥使用 `CREATOR_MODEL_API_KEY` 等服务端字段，不使用 `VITE_` 前缀，也不导入配置文件到浏览器代码。初始化生成的独立 Vite 适配器只在开发时向前端传入 endpoint；生产构建不读取本地文件，不需要 `.env.agentui`。不要扩大 Vite 的 `envPrefix` 或将文件内容整体注入 `define`。详见 [本地 Mock 服务配置](../../../docs/creator-local-mock-service.md)。
