# 会话界面（conversation-surface）


![会话展示界面](/images/plugins/conversation-surface.png)

会话中的消息和输入区共享当前 Thread；输入插件继续通过原有插槽组合。

组合消息、欢迎内容、建议和输入区，复用已有 Conversation 生命周期。





## 容器适配 \{#让会话填满业务容器}


容器高度由业务页面提供。保留现有 Adapter 和插槽转发，外层使用 flex 布局时允许内容收缩。

```tsx
import type { ComponentProps } from 'react';
import { CanonicalConversationSurfacePlugin } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalConversationSurfacePlugin>) {
  return <CanonicalConversationSurfacePlugin {...props}
    style={{ ...props.style, height: "100%", minHeight: 0, borderRadius: 12 }} />;
}
```


## 关闭自动聚焦 \{#关闭自动聚焦}

打开对话区域后，光标留在业务页面原来的位置。欢迎文案在 application/locales.ts 的 conversation 域中配置；空 welcomeDescription 隐藏说明。

```tsx
import type { ComponentProps } from 'react';
import { CanonicalConversationSurfacePlugin } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalConversationSurfacePlugin>) {
  return <CanonicalConversationSurfacePlugin {...props}
    autoFocus={false} />;
}
```

## 读取当前会话 \{#hook}

需要让其他组件读取当前聊天时，从 `@za38.03/agent-ui-plugins` 选择以下入口，沿用已有 Conversation 上下文：

| 需求                    | 调用方式                                             | 返回值与更新方式                                                     |
| --------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| 随列表加载状态更新工具栏          | `useConversationState(s => s.threads.isLoading)` | `boolean`，状态变化时重新渲染；selector 只能读取公开 `ConversationState` 中的字段 |
| 点击时读取当前 Thread 的全部消息  | `useConversationThread().getSnapshot()`          | `{ messages, state?, isRunning }`；一次读取，不自动订阅                 |
| 订阅 Thread 供项目自己的展示更新  | `useConversationThread().subscribe(listener)`    | 返回取消订阅函数；在 listener 中重新读取快照，在 effect 清理时取消订阅                 |
| 一次读取整个 Thread 的消息内容片段 | `useConversationMessageParts()`                  | `readonly unknown[]`，所有消息的内容片段展平结果；不是当前单条消息，也不自动订阅           |

例如，工具栏“查看会话数据”按钮需要把当前消息交给业务详情面板：

```tsx
import { useConversationThread, type ConversationThreadSnapshot }
  from '@za38.03/agent-ui-plugins';

export function InspectConversation({ label, onInspect }: {
  label: string;
  onInspect: (snapshot: ConversationThreadSnapshot) => void;
}) {
  const thread = useConversationThread();
  return <button type="button"
    onClick={() => onInspect(thread.getSnapshot())}>{label}</button>;
}
```

`label` 来自项目文案，`onInspect` 接已有面板或导出逻辑。快照跟随当前 Thread；这次读取不会加载其他历史或发送请求。持续显示消息、运行与业务状态时，也可使用[会话状态 Hook](/development/plugin-api.md#读取会话状态)。

自定义消息组件要复用当前工具 renderer 时，从 `@za38.03/agent-ui-runtime/plugin-api` 导入 `useConversationToolRenderer()`，得到工具组件或 `undefined`；传入原 renderer 的工具调用 props，缺失时由项目决定备用展示。

## 输入区与会话作用域

Composer 和它的附件、引用、提及、技能及发送入口需要使用同一个 Agent 与 Conversation 上下文。会话界面把当前消息、输入区及其语义插槽放在这个作用域内；它本身不向 `pluginData` 或 `selections` 再提供一份业务数据。

调整会话容器或输入区位置时，保留项目现有的 Composer 插槽与 `renderSlot` 组合。这样 @ 与 / 继续写入可见输入框，技能和引用继续参与同一次发送。不要为了改布局再创建一个独立 Runtime 或第二份 Composer。

其他业务插件如何读写和订阅同一草稿，见 [Composer hooks](/plugins/composer.md#hook)；各插件提供的数据格式从 [Composer 联动入口](/plugins/composer.md#与哪些插件共享输入和发送)进入对应页面。切换 Thread 后使用新作用域的草稿；异步回调中保存的旧句柄仍绑定原 Thread，不会自动改为当前会话。

## API



在 `CanonicalConversationSurfacePlugin` 上设置以下属性。

继承 `div` 原生属性，排除 `children`。

| 属性               | 类型                                                                                                               | 省略时 / 用途                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `autoFocus?`     | `boolean`                                                                                                        | 传给当前会话组件，决定是否自动聚焦输入框         |
| `welcome?`       | `ReactNode`                                                                                                      | 欢迎区内容；`emptyWelcome` 插槽优先    |
| `suggestions?`   | `ReactNode`                                                                                                      | 建议内容；`emptySuggestions` 插槽优先 |
| `composer?`      | `ReactNode`                                                                                                      | 输入区内容；`composer` 插槽优先        |
| `Adapter?`       | `ComponentType<ConversationSurfaceAdapterProps>`                                                                 | 负责显示消息和输入区的现有会话组件；没有时不显示会话主体 |
| `rendererSlots?` | `{ toolTimeline?: boolean; reasoningGroup?: boolean; thinkingIndicator?: boolean; transientMessages?: boolean }` | 标明当前启用了哪些消息展示插件；继续使用项目生成的配置  |
| `snapshot?`      | `{ mode?: string; detailStatus?: string }`                                                                       | 宿主页面传入的会话状态，用于给容器添加状态标记      |

`Adapter` 接收的属性包括：

- 输入与容器：`autoFocus`、`className`。
- 内容组合：`welcome`、`suggestions`、`composer`。
- 渲染组合：`rendererSlots`、`renderScopedSlot`。

外层 `className`／`style` 用于插件容器，不会自动变为 `Adapter` 的属性。

默认欢迎语和编辑、停止等按钮文案，统一在项目 `application/locales.ts` 的 `locales.conversation` 中修改：

- `welcome`：欢迎标题。
- `welcomeDescription`：说明；空字符串隐藏。

需要替换结构时，使用 `welcome` / `suggestions` 的 ReactNode 属性或语义插槽。语言覆盖需保持 `en-US` / `zh-CN` 对应。

### 显示条件与数据来源 \{#显示条件与数据来源}

**数据来源：**&#x4F1A;话界面由已有 Runtime 的消息、运行状态和子插件组成。普通回答使用[文字 SSE 示例](/plugins/ag-ui-data.md#共用的-sse-格式)，工具、思考和自定义卡片使用[各自事件](/plugins/ag-ui-data.md#按展示内容找事件)。历史消息由会话数据源加载。启用会话界面不会自动启用所有内容插件；无对应渲染器时不会凭事件名称创建新插件。



传了 welcome 为什么没有显示？

生成项目已配置 `emptyWelcome` 插槽时，插槽内容优先。修改该插槽里的组件，或在项目组合中调整它；单独传 welcome 不会替换已配置的插槽。

