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

## Python sidecar（迁移期）

Creator 当前保留 TypeScript Agent Runtime 作为默认路径。要仅验证 Python
sidecar transport，可先安装 `packages/creator-python` 的锁定环境，然后设置：

```env
CREATOR_AGENT_RUNTIME=python
CREATOR_PYTHON_EXECUTABLE=/absolute/path/to/python
```

Vite 插件会按项目惰性启动一个 Python 进程，透明代理 AG-UI 与运行时诊断流，
并在开发服务器关闭时终止 sidecar。此开关目前只提供 Phase 1 transport echo，
不会启动 Python Agent；不支持静默回退到 TypeScript。

仓库根目录的 `pnpm test` 会先运行 Python unit/contract tests，再运行
TypeScript tests（其中包含真实 sidecar 进程集成测试）。可以使用
`pnpm test:python-sidecar` 单独运行跨语言链路验收。
