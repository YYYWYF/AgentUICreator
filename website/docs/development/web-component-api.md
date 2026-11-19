---
title: "Web Component API"
---

# Web Component API

在业务页面通过元素属性或 `config` 配置服务地址、语言和主题，并监听就绪、会话切换和错误事件。

本页导航：[配置](#配置) · [事件](#事件)。

## 配置

### 给元素设置配置 {#配置与事件类型}

在已经注册的元素上设置配置：

```ts
import type {
  AgentUIConfig,
  AgentUIElement,
} from '@za38.03/agent-ui-web-component';

const config: AgentUIConfig = {
  endpoint: '/api/agent',
  locale: 'zh-CN',
  theme: 'light',
};

const element = document.querySelector<AgentUIElement>('agent-ui');
if (element) element.config = config;

```

运行时先在客户端通过 `import '@za38.03/agent-ui-web-component/register'` 或独立脚本注册元素，见[嵌入教程](/development/web-component)。**`import type` 只用于类型检查，不执行注册**。

`AgentUIConfig` 还支持：

- `threadId`：打开已保存的会话，需要先配置历史服务。
- `appUIModel`：设置布局与插件组合。
- `agents`：配置多个助手。

需要用函数转换服务请求或响应时，在 React 生产工程中编写函数，通过包装入口的 `agentProps` 传给 `Agent` 后重新构建；不能直接把函数添加到 Web Component 的 config。具体文件与示例见[业务服务接入](./service-integration#vue--html-服务适配位置)。

### Attributes 与优先级

| Attribute | 对应字段 | 默认 |
| --- | --- | --- |
| `endpoint` | endpoint | 无，可省略，由 React 生产工程的自定义 fetch 决定请求地址 |
| `locale` | locale | React 工程的默认值，官方为 zh-CN |
| `theme` | theme | React 工程的默认值，官方为 violet |
| `thread-id` | threadId | 未指定则使用新会话 |

`config` 的更新与优先级规则：

- **更新**：每次赋一个新对象；直接修改读取到的对象不会更新界面。保留其他配置可用 `element.config = { ...element.config, theme: 'dark' }`。
- **优先级**：`config` 中已设置的字段优先；未设置对应字段时，才使用 HTML 属性。
- **布局模型**：`appUIModel` 只能通过 `config` 设置。
- **发送前回调**：单助手可设置 `element.config = { ...element.config, beforeRequest }`；多助手在对应的 `config.agents` 项设置 `beforeRequest`。该函数只支持 JavaScript property，不支持 HTML attribute 或 JSON 序列化。也可在 React 生产工程的 `agentProps.beforeRequest` 中设置。签名及 ID 绑定规则见[发送前准备请求](./connect-agent#发送前准备请求)。

默认值和移除配置后的行为：

- **主题**：表中默认值用于首次挂载。移除 `theme` 属性且 config 也没有 theme 时，转为内部管理并保留当前选择；要立即显示紫色，显式设置 `theme: 'violet'`。
- **语言**：移除 `locale` 后使用表中的默认值。
- **请求地址**：省略 `endpoint` 不会回退到内置地址。React 生产工程可通过 `agentProps.fetch` 自行发送请求；使用浏览器默认 fetch 时，由项目提供请求地址。

### 配置更新行为

单助手 **修改 endpoint 或 threadId 会重建会话，并取消当前运行**；历史地址在 React 生产工程的服务配置中维护，不是此 config 的字段。修改 locale 或 theme 会保留会话和草稿。元素断开连接时释放服务，同步移动 DOM 时可保留会话，重新连接时建立新会话。每个元素单独配置。

重复注册不会创建多个组件定义。注册前设置的属性会在组件连接后生效。

### 多助手配置与控制

`config.agents` 按助手分别配置：

- 必填：`agentId`、`endpoint`。
- 可选：`hidden`、`threadId`、`request`、`appUIModel`。

各助手使用自己的地址和会话 ID，顶层 `endpoint/threadId` 不替代它们；`locale/theme` 由顶层统一设置。示例见[多 Agent](./multiple-agents#web-component-与-creator)。

保持各项挂载，只改 `hidden` 可以切换可见助手并保留后台运行。从数组中删除一项会卸载该助手；更改 `agentId` 或默认 `endpoint` 会重建它。每项的 `threadId` 只用于首次打开会话，挂载后导航使用集合方法。

元素的只读 `agents` 属性在多助手挂载后提供助手集合，未就绪或单助手模式下为 `null`。收到带 `agentId` 的 `agent-ready` 后，可在业务按钮的处理函数中操作目标助手：

```ts
// element 使用上面的 AgentUIElement 类型。
async function askResearch(prompt: string) {
  const host = element?.agents?.agent('research');
  if (!host || host.getSnapshot().status !== 'ready') return;
  try { await host.sendMessage(prompt); }
  catch (error) { console.error('AGENT_UI_SEND_FAILED', error); }
}
```

新建用 `element.agents.createThread(agentId)`，打开历史用 `element.agents.openThread({ agentId, threadId })`，调用处同样处理失败。集合方法不会自动修改 `hidden`，需要显示目标助手时再更新 config 中对应项。接口与后台 Thread 操作见[助手集合接口](./multiple-agents#助手集合接口)。

## 事件

以下事件都为 bubbles/composed 的 CustomEvent，`detail` 类型由 `AgentUIEventDetails` 定义：

| 事件 | detail | 含义 |
| --- | --- | --- |
| `agent-ready` | `{ threadId, agentId? }` | 组件已就绪，不代表 Agent 服务可用。 |
| `thread-change` | `{ threadId, agentId? }` | 初始或切换后的会话 ID。 |
| `theme-change` | `{ theme, agentId? }` | 用户请求切换主题；Host 已设置 theme 时，需更新 config 接受变更。 |
| `agent-error` | `{ code, error: Error, agentId? }` | code 为 `AGENT_UI_CONFIG_ERROR` 或 `AGENT_UI_RUNTIME_ERROR`，错误信息从 detail 读取。 |

`threadId`、`agentId` 均为字符串，`theme` 为 `light/dark/violet`。多助手事件用 `agentId` 定位来源；先绑定监听再挂载，过去的事件不会重放。

### 监听就绪并在页面卸载时清理

把返回的函数交给页面的卸载清理。`onReady` 可将当前 threadId 同步到业务状态；配置更新、重新挂载等场景可能再次触发就绪，回调应允许重复更新：

```ts
import type { AgentUIElement, AgentUIEventDetails }
  from '@za38.03/agent-ui-web-component';

export function listenAgentReady(element: AgentUIElement,
  onReady: (detail: AgentUIEventDetails['agent-ready']) => void) {
  const listener = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (typeof detail !== 'object' || detail === null ||
      !('threadId' in detail) || typeof detail.threadId !== 'string') return;
    onReady({ threadId: detail.threadId,
      ...('agentId' in detail && typeof detail.agentId === 'string'
        ? { agentId: detail.agentId } : {}) });
  };
  element.addEventListener('agent-ready', listener);
  return () => element.removeEventListener('agent-ready', listener);
}
```

先绑定监听再将元素插入页面，避免漏掉首次事件；解除监听不卸载元素，也不停止 Agent 运行。
