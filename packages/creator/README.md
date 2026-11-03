# Agent UI Creator

在你自己的开发页面里，用对话检查和修改 Agent UI。
业务工程照常启动，需要 Creator 时再启动工具服务。Creator 图形界面只能通过宿主开发页面中的入口使用，不提供独立页面。

以下适用于 React + Vite 项目。安装和使用 Creator 要求 Node.js 24，最低版本为 `24.22.1`（`^24.22.1`）；Creator Agent 和 Operator 工具均使用 TypeScript，随同一个 npm 包交付。工程结构见 [Creator TS 发行](docs/typescript-distribution.md)。

## 1. 安装

在你的工程目录执行：

```sh
pnpm add -D @za38.03/agent-ui-creator
```

## 2. 配置一次

在 `package.json` 的 `scripts` 中添加这一行，保留其他脚本：

```json
"dev:creator": "agent-ui-creator --port 47832"
```

在 `vite.config.ts` 顶部添加：

```ts
import { createCreatorDockVitePlugin } from "@za38.03/agent-ui-creator/dock/vite";
```

然后在已有的 `plugins` 数组中加上 `createCreatorDockVitePlugin()`。例如：

```ts
plugins: [react(), createCreatorDockVitePlugin()]
```

保留工程原有的插件。如果业务开发服务已经运行，配置完成后重启一次。

## 3. 需要时启动

业务工程仍用你原来的命令启动，例如 `pnpm dev`。
需要 Creator 时，另开一个终端，在同一工程目录执行：

```sh
pnpm dev:creator
```

回到业务开发页面，顶部的 **Creator Agent** 入口随页面加载。Creator 服务启动后，点击入口即可连接。

![启动后，业务页面顶部出现 Creator Agent 入口](dist/documentation/images/start/03-creator-entry.png)

点击入口展开，首次使用时选择工程，目录选择器默认从启动 Creator 的目录开始。同一浏览器和 Creator 服务地址下会尝试恢复上次选中的工程；路径失效时重新选择。「关闭当前项目」会清除这条记录。

React 新工程只需先安装 Creator，不必手动列出 Agent UI 运行依赖。选择产品形态和源码目录后，Creator 会展示当前工程的依赖声明计划。确认后只在 `package.json` 添加缺少的生产及构建依赖，不执行包管理器命令，不改写锁文件、`node_modules` 或宿主构建配置。已有兼容依赖直接复用，不兼容版本会明确提示。当前依赖准备支持独立 npm/pnpm 工程。

在该工程自行运行 `pnpm install` 或 `npm install`，然后回到 Creator 点击“重新检查依赖”；实际依赖就绪后，才继续初始化 Agent UI。默认模板的 Tailwind 样式配置由用户按构建工具自行完成，见《React 工程接入 → 工程依赖与样式》中 Vite、Rsbuild 和 Webpack 的步骤，不要求所有宿主安装 Vite 编译插件。工程 UI 库和样式方案仍由工程管理。

下面是已初始化工程的界面：

![展开 Creator，在当前工程中检查或修改 Agent UI](dist/documentation/images/start/05-initialized.png)

第一次对话前，请先完成 [模型配置](docs/advanced.md#模型配置)。之后可以直接告诉 Creator：

> 把这个助手调整成中文客服，保留当前业务页面。

在 Creator 终端按 **Ctrl+C** 停止服务，业务工程和页面入口仍保留；再次启动服务后可继续使用。
下次需要时，再执行 `pnpm dev:creator` 即可。Creator 浮层只在开发时显示，不进入生产页面。

## 其他接入方式与常见问题

- [模型配置](docs/advanced.md#模型配置)
- [端口占用或连接不上](docs/advanced.md#端口占用或连接不上)
- [Rsbuild、Webpack 和进阶配置](docs/advanced.md)

## 把 Agent UI 接入业务页面

安装并启动 Creator、打开界面后，在“查看接入方法”中按业务工程的框架选择：

- **React 工程**：直接在页面中使用生成的 `<Agent />`；需要业务按钮控制助手时，查看 Provider 示例。
- **Vue / 其他框架**：通过 Web Component 嵌入。当前提供 Vue 接入指引，其他框架需要先检查支持情况。

Vue 首次初始化会创建独立的 React Agent UI 工程（默认目录 `agent-ui/`），展示依赖计划，确认后仅在该目录安装依赖并构建。Vue 工程保留原有依赖与入口。当前支持独立 npm/pnpm 工程；共享 workspace 的自动创建尚不支持。

Vue 用户可以把引导中的示例请求发给 Creator，并补充希望展示助手的页面和区域。Creator 会检查工程、确认当前 Agent UI 的构建产物，并展示接入方案；你确认后再执行。也可以展开“手动接入”，让 Creator 只提供步骤和代码，由你修改，完成后再请它检查。

Vue 嵌入后，可以在助手里正常聊天。但目前没有现成接口让业务按钮替助手发消息、停止回答，或读取它是否正在回复；在 Vue 外面套一个 Provider 也不能直接实现。这些功能可以通过修改 Agent UI 的接入源码来补充，再重新构建，并不是 Vue 本身做不到。

Creator 会将定制修改保存在关联的 React Agent UI 工程。修改后点击“构建并更新到宿主”，会构建该工程并更新 Vue 的 `public/agent-ui.js`；刷新开发页面查看效果。部署时再运行 Vue 工程自己的构建命令，将更新后的资源包含在部署产物中。

关联信息保存在开发配置 `.agent-ui/producer.json`，不会成为生产依赖。更新会检查源码与产物是否匹配；宿主资源被手动修改时会停止，不能静默覆盖或改用官方默认界面。独立 Agent UI 工程可使用自己的 dev、test、typecheck 和 build 脚本；生产构建不需要 Creator。上面的 React 示例不适用于 Vue 页面。

## 在宿主页面中控制助理

只展示助理时，从初始化生成的入口导入 `Agent` 并渲染 `<Agent />`。
需要业务按钮发送消息或读取运行状态时，由业务代码从 npm 包导入 Provider 和 Hooks：

```tsx
import { useState } from "react";
import { Agent } from "./agent-ui";
import { AgentUIProvider, useAgentUI, useAgentUIState } from "@za38.03/agent-ui-runtime";

function AssistantRegion() {
  const agent = useAgentUI();
  const ready = useAgentUIState(s => s.status === "ready");
  const busy = useAgentUIState(s => s.runtime?.run.status === "running" || s.runtime?.run.status === "awaiting-input");
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  async function openAndSend() {
    setOpen(true);
    setFailed(false);
    try { await agent.sendMessage("请帮我分析当前页面"); }
    catch { setFailed(true); }
  }

  return <>
    <button disabled={!ready || busy} onClick={() => void openAndSend()}>打开助理并分析</button>
    {failed && <p role="alert">消息未能发送，请重试。</p>}
    <aside hidden={!open}><Agent /></aside>
  </>;
}

export default function SelfPage() {
  return <AgentUIProvider><AssistantRegion /></AgentUIProvider>;
}
```

Agent 的导入路径按你的源码目录调整，业务组件可放在任意目录。Provider 是 Agent UI 的运行时接入组件，不是 UI Plugin，也不需要从 assistant-ui 引入。它不进入 AppUIModel；原来的插件树仍决定界面布局和插件是否启用。

- `locale`、`endpoint`、附件/反馈适配器等项目配置传给 `<Agent />`。Provider 只接收 `children` 和可选的共享展示资料 `user`；Agent 自身的 `user` 可覆盖其继承值。一个 Provider 只挂载一个 Agent；独立使用 `<Agent />` 时会自动建立内部上下文。
- `user` 及其 `userId`、`userName`、`avatar` 均可选。账户插件启用时，缺失资料显示默认值。用户资料只用于前端展示，不会自动提供给模型，也不替代宿主鉴权。
- 需要隐藏面板但保留会话时，使用 `hidden` 或 CSS 并保持 `<Agent />` 挂载；宿主仍可读取状态和发送消息。卸载 Agent 或 Provider 会断开会话并停止当前执行。
- `useAgentUI()` 提供 `sendMessage`、`abortRun`、`startNewConversation`、`resumeInterrupts`。未就绪调用返回 `AGENT_UI_NOT_READY`；消息并发与中断继续遵循已有 Runtime 规则，不额外排队。
- `useAgentUIState(selector)` 订阅稳定字段，例如 `s.status`、`s.runtime?.run.status` 和 `s.runtime?.messages`。避免在 selector 中新建对象或数组。
- `useAgentUIEvent(name, handler)` 订阅 `ready`、`status-change`、`thread-change`、`run-start`、`run-end`。事件只通知变化；读取当前状态使用状态 Hook。`run-end` 包含完成、取消、错误和等待用户输入，不等于成功完成。
- `sendMessage()` 返回现有 Runtime 的结算 Promise；成功结算不保证模型成功回复。检查 `runtime.run` 和 `runtime.interrupts`。会话更换或 Provider 卸载会以 `AGENT_UI_SESSION_ENDED` 拒绝旧会话尚未结束的宿主发送请求，不会把请求转发给新会话。
- 退出登录、切换用户时，由宿主管理会话清理，例如卸载 Provider 或用用户 ID 作为 React `key`，并仅传入该用户的 `initialThreadId`。更新 `user` 资料本身不切换会话。

已有工程需按正常源码更新机制更新基础模板，并更新 Runtime 包；不要重新初始化或覆盖宿主已有定制。Creator 初始化后的“查看接入方法”中也提供可复制的 Provider 示例。

### 默认 npm 更新来源

更新中心直接使用目标工程的 npm registry 和凭据检查官方包版本；无需配置额外更新接口。兼容组合与变更历史随官方包发布，源码接管/同步读取实际安装的 Plugins 包 catalog 和源码快照。检查只读，安装需用户确认；npm 升级不会自动覆盖应用层和已托管源码，源码同步另行确认。尚未发布或 registry 无法访问时会明确显示不可用，不使用演示发行数据。

## Project Operator and contracts

Creator Agent and Operator ship together as `@za38.03/agent-ui-creator`. Agent control code lives in `src/agent`, UI/CLI/hosting in `src`, and the internal project-control implementation in `operator`. Canonical schemas and fixtures remain in `contracts/creator`; prompts and Skills ship with the same package. Operator is internal to Creator.

Public Node entry points include `/project`, `/project/dev`, `/project/protocol`, `/project/host`, `/project/resources`, `/project/updates`, `/project/commands`, `/bootstrap`, `/source-registry`, and `/mock-agent`. Production frontends remain independent of Creator and its Agent, tools and update services.

`pnpm --filter @za38.03/agent-ui-creator build` builds the complete development tool. Run its `typecheck`, `test:operator` or `typecheck:operator` scripts for the corresponding checks. Product behavior requires separate validation through live browser scenarios.
