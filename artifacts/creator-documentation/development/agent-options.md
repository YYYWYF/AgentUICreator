# Agent 参数与配置

通过 `Agent` 参数设置服务地址、主题、语言，以及打开已有会话。首次挂载见 [React 接入](/development/react.md)，完整类型见 [React 页面参数与方法](/development/react-host-api.md)。

## 页面参数

在业务页面导入生成的 `Agent`，传入当前需要的配置：

```tsx
import { Agent } from './agent-ui';

export function Chat() {
  return <Agent endpoint="/api/agent" locale="zh-CN" theme="violet" />;
}
```

每次发送时，AG-UI 请求的 `messages` 默认只包含本次用户消息，不附带历史用户和 AI 消息。前端继续展示完整历史，后端按 `threadId` 维护会话上下文。前端工具续传只带本次工具结果；中断恢复通过 `resume` 传递，没有新消息时 `messages` 为空。

参数可传字符串、用户资料或回调，完整字段见[Agent 属性表](/development/react-host-api.md#agent-属性表)。用户资料的传法例如：

```tsx
<Agent user={{ userId: 'u-1', userName: '张三', avatar: '/avatar.png' }} />
```

新模板的欢迎语、示例问题与按钮文案统一在 `application/locales.ts` 覆盖，不再通过 `Agent welcome` / `suggestions` 属性传入。例如：

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

`project-config.tsx` 已绑定这个 locale 模块。三条示例分别使用 `architecture*`、`debug*`、`next*` 的 `Title` / `Label` / `Prompt` 字段；含义是标题、副标题和点击后发送的内容。数量、顺序由 `getConversationStarterSuggestions(locale, messages)` 组织，返回 `[]` 隐藏；纯文案修改只改 locales。Host 的 `Agent locales` 仍可按字段覆盖项目默认值，未覆盖字段保留。

建议项的结构也由该回调组织：移除副标题时，保留 `title`、`prompt`，省略返回对象的 `label`，见[推荐问题结构示例](/plugins/conversation-suggestions.md#设置建议内容)。必需 locale 标签的空字符串会回退到默认值，不表示隐藏该字段。

附件默认转 Base64，语音默认使用受支持的浏览器识别，评价默认保留当前会话选择。上传、转写、评价和历史服务的 URL、鉴权写在项目实现里，需要接入或修改时交给 Creator。见[附件、语音与评价服务](/development/attachments-dictation-feedback.md)及[历史服务地址](/development/history-backend.md#地址与鉴权配置)。临时提示见[临时通知](/plugins/transient-assistant-messages.md)。

## 传入业务上下文

在业务页面给 `<Agent />` 传入 `getRunContext`，将当前选中记录、筛选条件等数据放进每次 AG-UI 请求的 `context`。业务系统继续维护自己的状态，回调只负责读取当前快照；无需把这些数据改成 AG-UI 共享 `state`。

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

此用法遵循 [assistant-ui 的 Run context 约定](https://github.com/assistant-ui/assistant-ui/blob/d8124e7b427021d977abf9aabc9a057705a81644/apps/docs/content/docs/runtimes/ag-ui/runtime-options.mdx#run-context)：

- 回调同步返回条目数组，不能使用 `async`；需要请求接口时，先由业务页面加载数据。
- 每次运行都会重新调用，包括工具续跑和审批恢复；返回条目追加在已有 system context 之后。
- 回调也能读取 `{ messages, runConfig }`：`messages` 是本次运行转换后的 AG-UI 消息，恢复时对应恢复请求使用的记录范围；`runConfig` 是运行配置，可通过 `runConfig?.custom` 读取自定义配置。
- 回调抛错时调用 `onError`，请求仍会继续发送，但不包含这次回调提供的条目。

`context` 用于为本次请求补充信息，不会自动拼进用户消息。AG-UI 共享 `state` 通过 `STATE_SNAPSHOT` / `STATE_DELTA` 等协议状态事件同步，与这里的请求上下文独立。`context` 来自浏览器，后端仍须独立校验身份和权限。

## 主题切换

`theme` 支持 `light`、`dark`、`violet`。切换主题不会清空聊天记录或输入框中未发送的内容。主题只从 `Agent` 属性传入。不传 `theme` 时使用内置紫色主题，并允许主题控件自行切换。传入固定值（例如 `<Agent theme="dark" />`）时固定显示该主题；允许内置控件切换时，页面通过 `onThemeChange` 接受变更：

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

## 其他配置入口

| 设置             | 当前入口                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| 默认主题           | `Agent theme`，见[默认主题配置](/development/styling-and-localization.md#默认主题)。                                           |
| 默认语言           | `Agent locale`；由页面管理语言切换见[界面语言配置](#界面语言切换)。                                                                       |
| 历史服务地址         | `Agent conversationDataSource`，见[地址配置](/development/history-backend.md#地址与鉴权配置)。                                  |
| `/` 命令与 `@` 候选 | 项目的来源服务，见[命令来源配置](/guide/adjustments/mention-and-commands.md)与[提及扩展](/guide/adjustments/mention-and-commands.md)。 |

路径相对于生成的 Agent UI 源码目录。

业务按钮的发送、停止和新建操作见[业务页面联动](/development/react-host-control.md)。
