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
