# Web Component 配置与事件

在业务页面通过元素属性或 `config` 配置服务地址、语言和主题，并监听就绪、会话切换和错误事件。

## 配置与事件类型

类型从已安装包的公开根入口导入：

```ts
import type {
  AgentUIConfig,
  AgentUIElement,
  AgentUIEventDetails,
} from '@za38.03/agent-ui-web-component';

const config: AgentUIConfig = {
  endpoint: '/api/agent',
  locale: 'zh-CN',
  theme: 'light',
};

const element = document.querySelector<AgentUIElement>('agent-ui');
if (element) element.config = config;

type ReadyDetail = AgentUIEventDetails['agent-ready'];
type ErrorDetail = AgentUIEventDetails['agent-error'];
```

运行时先在客户端通过 `import '@za38.03/agent-ui-web-component/register'` 或独立脚本注册元素，见[嵌入教程](/development/web-component.md)。**`import type` 只用于类型检查，不执行注册**。

`AgentUIConfig` 还支持 `threadId` 和 `appUIModel`。`threadId` 用于打开持久会话，需要项目中接好历史服务。需要修改布局时，让 Creator 修改提供组件的 React 工程并重新构建。历史、附件等业务服务由 Creator 在 React 生产项目的实现中接入后重新构建，见[历史服务地址](/development/history-backend.md#地址与鉴权配置)和[附件服务](/development/attachments-dictation-feedback.md)。

## Attributes 与优先级

| Attribute   | 对应字段     | 默认                      |
| ----------- | -------- | ----------------------- |
| `endpoint`  | endpoint | `/agent`                |
| `locale`    | locale   | React 工程的默认值，官方为 zh-CN  |
| `theme`     | theme    | React 工程的默认值，官方为 violet |
| `thread-id` | threadId | 未指定则使用新会话               |

`config` 中已设置的字段优先于同名 HTML 属性。**每次更新时给 `config` 赋一个新对象**；直接修改读取到的对象不会更新界面。移除 HTML 属性后使用默认值。`appUIModel` 只能通过 `config` 设置。

## 事件

以下事件都为 bubbles/composed 的 CustomEvent，`detail` 类型由 `AgentUIEventDetails` 定义：

| 事件              | detail                   | 含义                                                                         |
| --------------- | ------------------------ | -------------------------------------------------------------------------- |
| `agent-ready`   | `{ threadId: string }`   | 组件已就绪，不代表 Agent 服务可用。                                                      |
| `thread-change` | `{ threadId: string }`   | 初始或切换后的会话 ID。                                                              |
| `agent-error`   | `{ code, error: Error }` | code 为 `AGENT_UI_CONFIG_ERROR` 或 `AGENT_UI_RUNTIME_ERROR`，错误信息从 detail 读取。 |

## 配置更新行为

**修改 endpoint、threadId 或历史服务地址会重建会话，并取消当前运行**。修改 locale 或 theme 会保留会话和草稿。元素断开连接时释放服务，同步移动 DOM 时可保留会话，重新连接时建立新会话。每个元素单独配置。

重复注册不会创建多个组件定义。注册前设置的属性会在组件连接后生效。
