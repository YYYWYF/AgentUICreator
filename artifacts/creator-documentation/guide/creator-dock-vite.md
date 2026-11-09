# Vite 开发面板接入

Vite Dock 在开发页面中添加 **Creator Agent** 按钮，展开后即可对话修改工程。

## 配置启动脚本

在 `package.json` 中添加脚本，保留原有 `dev` 和 `build`：

```json
{ "scripts": { "dev:creator": "agent-ui-creator --port 47833" } }
```

## 配置开发面板

在 `vite.config.ts` 中保留已有配置，只在开发分支加载 Creator。以下以已有 React 插件的工程为例：

```ts
import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(async ({ command }) => {
  const plugins: PluginOption[] = [react()];
  if (command === 'serve') {
    const creatorModule = '@za38.03/agent-ui-creator/dock/vite';
    const { createCreatorDockVitePlugin } = await import(creatorModule);
    plugins.push(createCreatorDockVitePlugin({ creatorUrl: 'http://127.0.0.1:47833' }));
  }
  return { plugins };
});
```

将已有插件、代理和其他选项合并保留。Creator 只在开发分支按需加载；生产构建无需安装 Creator。开发前请先完成 Creator 安装。

Creator 面板自带样式。本步骤完成后，安装模板，再按 [Vite 样式配置](/development/react.md#vite-样式配置)准备生成助理界面的 Tailwind CSS。

## 启动与验证

配置完成后，先运行 `pnpm dev:creator`，保持终端运行；另开终端，使用该工程原有的启动命令启动开发服务器。开发服务已运行时，重启一次。

打开工程开发地址，确认出现 **Creator Agent** 按钮并能连接。生产构建的页面应没有 Creator 面板。

## 常用选项

| 选项            | 用途                            |
| ------------- | ----------------------------- |
| `creatorUrl`  | Creator 服务地址，与启动端口保持一致。       |
| `projectRoot` | 标识当前页面对应的工程目录，默认使用 Vite root。 |
| `locale`      | 工具语言，`zh-CN` 或 `en-US`。       |

展开后按[开始使用](/start/index.md#选择工程)选择目标工程。模型配置见[模型与工具配置](/guide/configuration.md)。
