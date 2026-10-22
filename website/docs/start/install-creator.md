---
title: 安装并启动 Creator
---

# 安装并启动 Creator

:::tip 环境要求
Node.js `^20.19.0 || >=22.12.0`。以下步骤使用 React + Vite 工程，命令以 pnpm 为例；包管理器沿用工程现有配置。
:::

## 1. 安装

打开自己的工程，在根目录安装 Creator：

```sh
pnpm add -D @za38.03/agent-ui-creator
```

## 2. 启动工具

在 `package.json` 的 `scripts` 中新增：

```json
{
  "scripts": {
    "dev:creator": "agent-ui-creator --project . --port 47833 --no-open"
  }
}
```

启动 Creator：

```sh
pnpm dev:creator
```

保持 Creator 运行，页面入口将连接 `http://127.0.0.1:47833`。

如果端口被占用，将脚本中的 `47833` 和下面的 `creatorUrl` 端口改为同一个可用端口。

## 3. 在页面上添加入口

安装官方 Plugin 所需的样式构建依赖。已有 Tailwind 配置时合并使用：

```sh
pnpm add -D tailwindcss@4.3.3 @tailwindcss/vite@4.3.3
```

打开 `vite.config.ts`，保留原有配置，加入 Tailwind 和 Creator 插件。React + Vite 工程可参考以下写法：

```ts
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react(), tailwindcss()];
  if (command === 'serve') {
    let creatorEntry: string | undefined;
    try {
      creatorEntry = import.meta.resolve('@za38.03/agent-ui-creator/dock/vite');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND') throw error;
    }
    if (creatorEntry) {
      const { createCreatorDockVitePlugin } = await import(creatorEntry);
      plugins.push(createCreatorDockVitePlugin({ creatorUrl: 'http://127.0.0.1:47833' }));
    }
  }
  return { plugins };
});
```

## 4. 打开页面

启动或重启工程开发服务器，例如 `pnpm dev`，使 Vite 配置生效。

打开自己的开发页面，点击右上角的 **Creator Agent**：

![页面右上角出现带星形图标的 Creator Agent 按钮。](/images/start/03-creator-entry.png)

点击这个按钮，右侧应展开 Creator 面板。继续[创建助理界面](./project-modes)。

如果没有看到入口，检查工程开发服务器是否已重启，以及 Vite 配置中是否加入 `createCreatorDockVitePlugin`；展开后无法连接时，检查 Creator 服务是否仍在运行。
