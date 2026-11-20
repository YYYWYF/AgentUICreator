# Agent 参数与配置

通过 `Agent` 参数设置服务地址、主题、语言，以及打开已有会话。首次挂载见 [React 接入](/development/react.md)，完整类型见 [Agent API](/development/react-host-api.md)。

## 页面参数

在业务页面导入生成的 `Agent`，传入当前需要的配置：

```tsx
import { Agent } from './agent-ui';

export function Chat() {
  return <Agent endpoint="/api/agent" locale="zh-CN" theme="violet" />;
}
```

`endpoint` 可选，没有内置默认地址。使用自定义 `fetch` 自行决定请求地址时可以省略；使用浏览器默认 fetch 时，由项目提供 `endpoint` 或按次指定工作流地址。

Agent 接口需要鉴权时，通过 `request.headers` 传入请求头，通过 `request.credentials` 设置 Cookie 策略，完整示例及开发预览限制见[请求头与鉴权](/development/connect-agent.md#请求头与鉴权)。

普通发送默认只带本次用户消息，前端仍展示完整历史，后端按 `threadId` 维护上下文。工具续传和审批恢复格式见[请求体与响应流](/development/connect-agent.md#请求体与响应流)。

参数可传字符串、用户资料或回调，完整字段见[Agent 属性表](/development/react-host-api.md#agent-属性表)。用户资料的传法例如：

```tsx
<Agent user={{ userId: 'u-1', userName: '张三', avatar: '/avatar.png' }} />
```

欢迎语、示例问题与按钮文案在 `application/locales.ts` 中覆盖。例如：

```ts
export const locales = {
  'zh-CN': {
    conversation: { welcome: '今天心情好吗', welcomeDescription: '' },
    starterSuggestions: {
      architectureTitle: '学习游泳', architectureLabel: '从入门开始', architecturePrompt: '初学游泳应该如何开始？',
    },
  },
  'en-US': {
    conversation: { welcome: 'How are you feeling today?', welcomeDescription: '' },
    starterSuggestions: {
      architectureTitle: 'Learn to swim', architectureLabel: 'Start with the basics', architecturePrompt: 'How should a beginner start swimming?',
    },
  },
};
```

`project-config.tsx` 已绑定这个 locale 模块。调整建议时按以下位置修改：

- **文案**：三条示例分别使用 `architecture*`、`debug*`、`next*` 的 `Title` / `Label` / `Prompt`，对应标题、副标题和点击后发送的内容。纯文案修改只改 locales。
- **数量和顺序**：由 `getConversationStarterSuggestions(locale, messages)` 组织，返回 `[]` 隐藏。
- **Host 覆盖**：`Agent locales` 按字段覆盖项目默认值，未覆盖字段保留。

建议项的结构也由该回调组织：移除副标题时，保留 `title`、`prompt`，省略返回对象的 `label`，见[推荐问题结构示例](/plugins/conversation-suggestions.md#设置建议内容)。必需 locale 标签的空字符串会回退到默认值，不表示隐藏该字段。

附件默认转 Base64，语音默认使用受支持的浏览器识别，评价默认保留当前会话选择。接自己的上传、评价、历史等接口时，按[业务服务接入](/development/service-integration.md)修改项目配置或数据源；业务语音转写服务标为[开发中](/development/speech-to-text.md)。临时提示见[临时通知](/plugins/transient-assistant-messages.md)。

## 传入业务上下文

通过 `ctx` 向 Agent 传递业务参数：

```tsx
<Agent endpoint="/api/agent" ctx={{ orderId: selectedOrder.id, scene: 'order-detail' }} />
```

参数会放在请求体的 `forwardedProps.ctx` 中。发送消息时也可通过 `sendMessage(text, { ctx: { ... } })` 附加本次参数，同名参数以本次发送的值为准。示例见[业务参数 ctx](/development/business-context.md#业务参数-ctx)。

在业务页面给 `<Agent />` 传入 `getRunContext`，将当前选中记录、筛选条件等数据放进每次 AG-UI 请求的 `context`。

```tsx
import { Agent } from './agent-ui';

interface Order {
  id: string;
  status: string;
}

export function OrderAssistant({ selectedOrder }: { selectedOrder: Order }) {
  return (
    <Agent
      endpoint="/api/agent"
      getRunContext={() => [
        {
          description: 'selectedOrder',
          value: JSON.stringify(selectedOrder),
        },
      ]}
    />
  );
}
```

每个条目包含字符串 `description` 和 `value`。对象用 `JSON.stringify()` 转成字符串；后端从 `RunAgentInput.context` 读取，并按双方约定解析。回调可以直接读取 React props、state 或业务 store。页面更新后，下次请求会读取最新值，不会自动向正在执行的 Agent 推送变化。

回调同步读取已有数据，每次请求前重新执行。读取失败会报告 `onError`，请求继续；需要等待业务接口或准备失败时停止发送，使用 [`beforeRequest`](/development/connect-agent.md#发送前准备请求)。

`context` 单独传递，不会自动拼进用户正文。身份和权限仍由后端校验。

## 主题切换

`theme` 支持 `light`、`dark`、`violet`，只从 `Agent` 属性传入。切换主题保留聊天记录和未发送草稿。

| 设置方式                              | 行为                                         |
| --------------------------------- | ------------------------------------------ |
| 不传 `theme`                        | 初始使用内置紫色主题，允许主题控件自行切换。                     |
| 传入固定值，例如 `<Agent theme="dark" />` | 固定显示该主题。                                   |
| 业务页面控制切换                          | 在 `onThemeChange` 中更新 `theme`，接受内置控件发出的变更。 |

受控切换示例：

```tsx
import { useState } from 'react';
import { Agent, type AgentUITheme } from './agent-ui';

export function Chat() {
  const [theme, setTheme] = useState<AgentUITheme>('violet');
  return <Agent theme={theme} onThemeChange={setTheme} />;
}
```

## 界面语言切换

`locale` 支持 `zh-CN`（中文）和 `en-US`（英文）。不传时默认使用中文。

由业务页面管理语言，并允许用户通过[语言切换控件](/plugins/locale-switch.md)切换时，同时传入当前值和回调：

```tsx
import { useState } from 'react';
import { Agent } from './agent-ui';

export function Chat() {
  const [locale, setLocale] = useState<'zh-CN' | 'en-US'>('zh-CN');
  return <Agent locale={locale} onLocaleChange={setLocale} />;
}
```

## 打开已有会话

`initialThreadId` 指定初始化时打开的会话：

```tsx
<Agent initialThreadId={threadId} />
```

`threadId` 使用业务保存的会话 ID，`initialThreadId` 只在初始化时生效，之后通过会话列表或导航切换。历史数据的接入见[接入历史会话](/development/history-backend.md)。

需要首次发送前通过业务接口申请新会话 ID 时，使用可选的 [`beforeRequest`](/development/connect-agent.md#发送前准备请求)。返回的 `threadId` 会绑定到当前 Thread，后续请求自动沿用；这条新建路径不加载已有历史。

## 其他配置入口

| 设置             | 当前入口                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| 默认主题           | `Agent theme`，见[默认主题配置](/development/theme-and-styling.md#默认主题)。                                                  |
| 默认语言           | `Agent locale`；由页面管理语言切换见[界面语言配置](#界面语言切换)。                                                                       |
| 历史服务地址         | `Agent conversationDataSource`，见[地址配置](/development/history-backend.md#地址与鉴权配置)。                                  |
| `/` 命令与 `@` 候选 | 项目的来源服务，见[命令来源配置](/guide/adjustments/mention-and-commands.md)与[提及扩展](/guide/adjustments/mention-and-commands.md)。 |

表中的文件路径相对于生成的 Agent UI 源码目录；`Agent` 属性设置在实际挂载它的业务页面中。

业务按钮的发送、停止和新建操作见[业务页面联动](/development/react-host-control.md)。
