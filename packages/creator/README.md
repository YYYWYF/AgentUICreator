# @agent-ui/creator

面向 AG-UI 前端项目的开发时 Creator Agent。它读取目标项目，并在受限权限下修改 `app-ui/app-ui.json` 与 `plugins/*`；目标前端不需要把 Creator 打进生产 Bundle。

## CLI

在包含 `.env.creator.local` 的目录运行：

```bash
npx @agent-ui/creator --project ./my-agent-frontend
```

也可以执行单次需求：

```bash
npx @agent-ui/creator \
  --project ./my-agent-frontend \
  --message "把用户消息放在左边，AI 消息放在右边"
```

模型配置：

```env
MODEL_PROVIDER=openai
MODEL_BASE_URL=https://example.com/v1
MODEL_API_KEY=your-key
MODEL_NAME=your-model
```

## API

```ts
import { createProjectCreatorSession } from "@agent-ui/creator";

const creator = createProjectCreatorSession({
  projectRoot: "/path/to/agent-frontend",
  configRoot: process.cwd(),
});

await creator.run("右侧增加一个文件预览区域");
```

Vite 开发服务适配器由 `@agent-ui/creator/vite` 导出，React 工作台面板由 `@agent-ui/creator/ui` 导出。它们是可选的开发时集成，不属于生成应用的生产运行时。

## Python Creator（默认控制面）

Python Creator 是默认 runtime，默认 agent mode 为 `domain-write`。正常开发只需配置
模型，无需设置 `CREATOR_AGENT_RUNTIME=python` 或
`CREATOR_PYTHON_AGENT_MODE=domain-write`：

```env
CREATOR_MODEL_NAME=mimo-v2.5-pro
CREATOR_MODEL_BASE_URL=https://example.com/v1
CREATOR_MODEL_API_KEY=your-key
```

未显式配置 executable 时，sidecar 优先使用 `packages/creator-python/.venv`（Windows
为 `.venv/Scripts/python.exe`，macOS/Linux 为 `.venv/bin/python`），不存在时才回退
到系统 `python` / `python3`。`pythonExecutable` option、环境变量
`CREATOR_PYTHON_EXECUTABLE` 和 host config 中的同名配置依次优先于 managed `.venv`；
显式路径不可用时会直接报错，不会静默回退。

Vite 插件会按项目惰性启动一个 Python 进程，透明代理 AG-UI 与运行时诊断流，
并在开发服务器关闭时终止 sidecar。Python 启动或模型配置失败会明确失败，绝不静默
回退到 TypeScript。

如需让 Vite Host 连接已在本机启动的 sidecar，而不再创建和管理子进程，可在
`.env.creator.local` 同时配置：

```env
CREATOR_PYTHON_ENDPOINT=http://127.0.0.1:8010
CREATOR_PYTHON_AUTH_TOKEN=development-only-token-1234567890
```

外部 endpoint 只允许 `http://127.0.0.1:<port>`。Vite 会在首次请求前校验 health、
协议版本与 agent mode，关闭开发服务器时不会终止外部 sidecar。

TypeScript Creator 仅作为 troubleshooting / emergency legacy fallback 保留：

```env
CREATOR_AGENT_RUNTIME=typescript
```

Minimal Agent 仅作为工具协议诊断模式保留：

```env
CREATOR_PYTHON_AGENT_MODE=minimal
CREATOR_MODEL_NAME=mimo-v2.5-pro
CREATOR_MODEL_BASE_URL=https://example.com/v1
CREATOR_MODEL_API_KEY=your-key
```

该模式只验证受限的 read/edit/grep 工具协议，不包含 AppUIModel、Project Control、
Fast Path、Validation 或 Completion 业务能力。Phase 3A 的实验性只读领域模式改用：

```env
CREATOR_PYTHON_AGENT_MODE=domain-read
```

Domain Read 模式复用相同模型栈，并通过正式 ProjectControl v2 入口开放六个只读领域工具；
不会开放 `mutate_app_ui_model`。

默认的静态组合写模式也可以显式写成：

```env
CREATOR_PYTHON_AGENT_MODE=domain-write
```

它在 Domain Read 工具面上增加 `mutate_app_ui_model`，由 Python Host 负责 project lock、
capture-before、changedPaths 对账、Activity revision、receipt、transaction 与 undo。
`app-ui/app-ui.json` 和 `plugins/registry.generated.ts` 仍禁止通用文件工具直接编辑。
本模式尚不迁移 Runtime Verification、Host Validation、Completion 或 Fast Path。

仓库根目录的 `pnpm test` 会先运行 Python unit/contract tests，再运行
TypeScript tests（其中包含真实 sidecar 进程集成测试）。可以使用
`pnpm test:python-sidecar` 单独运行跨语言链路验收。
