# @agent-ui/creator

Python Agent UI Creator 的开发时 Node host、CLI、Vite 代理与 React Workbench。模型、Agent loop、项目工具、验证、回执和运行时诊断状态都由 `packages/creator-python` 负责；目标前端不需要把 Creator 打进生产 Bundle。

Creator 是 Agent UI 的开发助手。用户可以直接提问了解使用方法，让它检查当前工程、先设计方案，也可以要求修改和验证。仅在请求依赖工程现状时读取项目；仅在请求修改时进入写路径。普通对话直接显示回答，开发执行信息随实际工作出现。

## CLI

在包含 `.env.creator.local` 的目录运行：

```bash
npx @agent-ui/creator --project ./my-agent-app
```

也可以执行单次需求：

```bash
npx @agent-ui/creator \
  --project ./my-agent-app \
  --message "把用户消息放在左边，AI 消息放在右边"
```

模型配置：

```env
CREATOR_MODEL_BASE_URL=https://example.com/v1
CREATOR_MODEL_API_KEY=your-key
CREATOR_MODEL_NAME=your-model
```

## API

```ts
import { createPythonCreatorClient } from "@agent-ui/creator";

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

Vite 开发服务适配器由 `@agent-ui/creator/vite` 导出，React 工作台面板由 `@agent-ui/creator/ui` 导出。它们是可选的开发时集成，不属于生成应用的生产运行时。

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

### Installed @agent-ui/creator

安装 npm 包后，机器需要 Python 3.11+。第一次真正启动 Creator 时，会自动创建
isolated managed Python environment 并安装随包发布的 `requirements.lock`；首次安装需要
访问 Python package index。npm install 本身不安装 Python dependencies。
系统 Python 只用于创建 venv，Sidecar 始终通过 venv 的 Python 启动。

默认缓存位置为 macOS 的 `~/Library/Caches/agent-ui-creator/python/`、Linux 的
`$XDG_CACHE_HOME/agent-ui-creator/python/`（未设置时使用 `~/.cache/agent-ui-creator/python/`），
以及 Windows 的 `%LOCALAPPDATA%/agent-ui-creator/python/`。可通过
`CREATOR_PYTHON_ENV_ROOT` 或 host config 中的同名配置指定缓存根目录。环境按 Creator
版本、Python major.minor、platform、architecture 和 lockfile SHA-256 分开保存。
旧缓存不会自动清理；中断进程留下的 bootstrap lock 需要在确认没有 Creator 进程运行后手动删除。

`pythonExecutable` option、`CREATOR_PYTHON_EXECUTABLE` 环境变量、host config 中的同名
配置按顺序优先。显式配置表示用户自行管理完整 Python 3.11+ dependency environment；
Creator 检查版本并启动，不创建 venv，也不修改用户环境。缺依赖时直接报错。

### Repository development

仓库开发使用 `pnpm test:python:setup` 创建 `packages/creator-python/.venv`。
未显式配置 Python 时，source checkout 优先复用该环境；不存在时使用上述独立缓存。

### Distribution gate

发布前执行 `pnpm test:python:setup`，再执行 `pnpm verify:creator-distribution`。
该门禁包含 managed environment 单测、npm tarball 结构与完整 Contract parity、脱离仓库
运行的 Contract / Sidecar health smoke、isolated wheel 安装与 validator 初始化，以及真实
system Python → 临时缓存 venv → locked dependencies → Sidecar health 的 bootstrap。
测试不发送模型请求。`prepublishOnly` 和 Creator distribution CI 使用此门禁。

可分别执行 `pnpm verify:creator-package`、`pnpm verify:creator-python-wheel` 或较重的
`pnpm test:creator-package-runtime`。Contract 的唯一源码是 `contracts/creator`；npm
和 wheel 都自动打包为 `agent_ui_creator/_contracts/creator`，不依赖仓库目录结构。

Vite 插件会按项目惰性启动一个 Python 进程，透明代理 AG-UI 与运行时诊断流，
并在开发服务器关闭时终止 sidecar。Python 启动或模型配置失败会明确失败；工程中
没有其他 Creator runtime。

开发时如果希望 Python 源码变化后自动重启 sidecar，可在 `.env.creator.local` 中开启：

```env
CREATOR_PYTHON_HOT_RELOAD=1
```

该开关只监听 `packages/creator-python/agent_ui_creator/**/*.py`。内部托管的 sidecar
由 Creator Host 重启；使用 `pnpm creator:python` 启动的外部 sidecar 由开发监督器重启。
修改依赖或 `requirements.lock` 后仍需手动重新安装环境。

如需让 Vite Host 连接已在本机启动的 sidecar，而不再创建和管理子进程，可在
`.env.creator.local` 同时配置：

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

该模式只验证受限的 read/edit/grep 工具协议，不包含 AppUIModel、Project Control、
Fast Path、Validation 或 Completion 业务能力。Phase 3A 的历史领域诊断模式改用：

```env
CREATOR_PYTHON_AGENT_MODE=domain-read
```

Domain Read 模式复用相同模型栈，并通过正式 ProjectControl v2 入口开放六个只读领域工具；
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
