# 开场建议（conversation-suggestions）


![建议问题界面](/images/plugins/conversation-suggestions.png)

会话中的建议卡片；卡片展示标题和说明，实际发送内容由 prompt 决定。

把固定业务问题或当前会话的建议展示为入口。默认点击即把建议问题交给现有 Composer 发送；也可以只填写草稿，让用户补充后再发送。插件已处理建议项、草稿与选中数据之间的关联。

## 点击建议并发送问题

省略 `items` 时读取当前会话建议；项目也可以提供固定业务建议。`title` 是展示标题，`label` 是说明，`prompt` 才是实际填写或发送的正文。显示标题不等于发送标题。

默认 `sendOnSelect` 为 `true`。设为 `false` 后只填写同一个草稿，不发请求；之后仍通过原来的附件、引用和发送入口完成问题。`clearComposer` 控制是否替换已有草稿；不清空时沿用现有追加逻辑。

## 点击建议后只填写草稿 \{#点击建议后只填写草稿}


用户点击后可继续编辑，再通过发送按钮提交。clearComposer 控制选择时是否清空原草稿。

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalSuggestions } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationCanonicalSuggestions>) {
  return <ConversationCanonicalSuggestions {...props}
    sendOnSelect={false}
    clearComposer={true} />;
}
```


## 交给 Composer 的数据

例如项目提供下列建议项：

```json ag-ui
{ "title": "订单进度", "prompt": "查询这笔订单的进度", "data": { "orderId": "O-1" } }
```

假设插件实例 ID 为 `suggestions`，选择后，最终 Composer 适配器可读取：

```json ag-ui
{
  "pluginData": {
    "suggestions": [
      {
        "title": "订单进度",
        "prompt": "查询这笔订单的进度",
        "data": {
          "orderId": "O-1"
        }
      }
    ]
  }
}
```

`pluginData.suggestions` 是**数组**。原始条目保留实际存在的 `prompt/title/label/data`；运行时建议以它真正提供的字段为准，不额外补造业务数据。

**默认只发送 `prompt`，不自动增加结构化外带字段。** `sendOnSelect={false}` 时先保留数据供之后提交；删除草稿中对应问题文本后不再携带该条选择。清空原草稿的选择会清理本建议入口先前的数据，不清理别的插件。

例如在空草稿中选择上面的建议，默认请求中的用户消息为（仅列相关字段）：

```json ag-ui
{
  "messages": [
    {
      "id": "user-1",
      "role": "user",
      "content": "查询这笔订单的进度"
    }
  ]
}
```

## 为建议附加业务参数 \{#自定义建议问题的数据}

项目在 `items` 的 `data` 中提供订单 ID 等业务字段，建议插件将所选条目交给 Composer。在项目已有的 `plugins/composer/request-adapter.ts` 中决定最终发送位置：

```tsx
import type { ComposerRequestAdapter } from '@za38.03/agent-ui-plugins';

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>) : {};
}

export const requestAdapter: ComposerRequestAdapter = ({ request, pluginData }) => {
  if (!Object.hasOwn(pluginData, 'suggestions')) return request;
  return {
    ...request,
    forwardedProps: {
      ...record(request.forwardedProps),
      suggestions: pluginData['suggestions'],
    },
  };
};
```

将它接到项目已有 Composer 的 `requestAdapter` 属性，见 [Composer 最终适配器](/plugins/composer.md#请求适配)。本次没有提交建议数据时，不新增 `suggestions` 字段；明确提交的空数组或 `null` 则保留原值。上例发送完整建议项，相关字段为：

```json ag-ui
{
  "forwardedProps": {
    "suggestions": [{ "title": "订单进度", "prompt": "查询这笔订单的进度", "data": { "orderId": "O-1" } }]
  }
}
```

需要只发送订单 ID、改变字段名或最终位置时，在同一个 Composer 回调中提取并映射 `pluginData`。建议插件没有局部请求适配器，正文仍使用 `prompt`。实例键以实际实例 ID 为准；嵌入其他插件时使用其 `:suggestions` 子键。

条目包含非 JSON 数据时取消本次选择并保留草稿，使用 `starterSuggestions.requestFailed` 提示。正常提交与续答保留本次数据快照，后续点击不会改写已提交数据。

## 固定的双语开场建议 \{#固定的双语开场建议}

title 是卡片上的名称，label 是附加说明，prompt 是实际填入或发送的正文。下面点击建议后先填写草稿，不立即发送。

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalSuggestions, useLocaleCode } from '@za38.03/agent-ui-plugins';

const messages = {
  'zh-CN': { title: '总结材料', description: '提取重点与后续行动', prompt: '请总结我提供的材料，列出重点与后续行动。' },
  'en-US': { title: 'Summarize material', description: 'Find key points and next steps', prompt: 'Summarize the material I provide, including key points and next steps.' },
};
export function Example(props: ComponentProps<typeof ConversationCanonicalSuggestions>) {
  const labels = messages[useLocaleCode()];
  return <ConversationCanonicalSuggestions {...props} sendOnSelect={false}
    items={[{ title: labels.title, label: labels.description, prompt: labels.prompt }]} />;
}
```

## 自定义运行时建议 \{#自定义运行时建议并保留原点击行为}

未传固定 `items` 时，回调取得当前运行时建议的标题、说明和完整问题。下面将可见结构改为粗体标题与说明，仍使用现有 Trigger 提交或填入草稿：

```tsx
import type { ComponentProps } from 'react';
import {
  ConversationCanonicalSuggestions, ConversationSuggestionTrigger,
} from '@za38.03/agent-ui-plugins';

export function RuntimeSuggestions(props:
  Omit<ComponentProps<typeof ConversationCanonicalSuggestions>, 'items'>) {
  return <ConversationCanonicalSuggestions {...props}
    renderSuggestion={(suggestion, defaultView) => <div className="project-suggestion">{defaultView}</div>} />;
}
```

渲染器同时适用于固定业务建议和运行时建议。复用 defaultView 保留标题、发送行为、草稿与请求参数采集。

`buttonProps.onClick` 调用 `preventDefault()` 会取消本次数据采集与默认动作。完全替换交互节点时，需要保留原有 Trigger 的提交与采集行为，不能只画一个外观相同的按钮。

## 回复后继续追问

会话运行时提供回复后的建议时，默认建议行沿用同一套选择采集，数据形状和本页相同。它展示已有建议，不负责向后端生成建议。

在已有 Thread 组件组合中显式使用默认建议行，保留其他组件与 Composer 配置；它提交的数据同样由 Composer 最终适配器处理：

```tsx
import type { ComponentProps } from 'react';
import { ConversationThread, ConversationFollowupSuggestions } from '@za38.03/agent-ui-plugins';

function Followups() {
  return <ConversationFollowupSuggestions />;
}

export function ProjectThread(props: ComponentProps<typeof ConversationThread>) {
  return <ConversationThread {...props}
    components={{ ...props.components, FollowupSuggestions: Followups }} />;
}
```

独立 `ConversationSuggestion` 可提供 `requestItem` 作为完整原始条目；省略时仅按 `{ prompt }` 采集。`ConversationSuggestionTrigger` 从当前运行时建议作用域读取条目。

## 隐藏建议问题 \{#隐藏当前建议}

传入空 items 明确覆盖会话提供的建议。省略 items 则继续读取当前会话建议。

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalSuggestions } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationCanonicalSuggestions>) {
  return <ConversationCanonicalSuggestions {...props}
    items={[]} />;
}
```


## API



在 `ConversationCanonicalSuggestions` 上设置以下属性。

继承 `div` 原生属性，排除 `children`。

| 属性                  | 类型                                                                                                | 省略时 / 用途                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `items?`            | [`readonly ConversationSuggestionItem[]`](#conversationsuggestionitem)                            | 省略时读取当前会话建议；空数组表示不显示列表项                                  |
| `sendOnSelect?`     | `boolean`                                                                                         | 默认 `true`；`false` 时将建议写入输入框                              |
| `clearComposer?`    | `boolean`                                                                                         | 选择建议后是否清空原有草稿；省略时使用现有建议组件的默认设置                           |
| `buttonProps?`      | `Omit<ComponentProps<typeof SuggestionActions.Trigger>, 'send' \| 'clearComposer' \| 'children'>` | 建议按钮的属性；是否发送、是否清空草稿分别由 `sendOnSelect`、`clearComposer` 控制 |
| `classNames?`       | `Partial<Record<'title' \| 'description', string>>`                                               | 标题与说明的样式类                                                |
| `styles?`           | `Partial<Record<'title' \| 'description', CSSProperties>>`                                        | 标题与说明的内联样式                                               |
| `renderSuggestion?` | `(item: ConversationSuggestionItem, defaultView: ReactNode) => ReactNode`                         | 定制每条固定或运行时建议；复用默认节点可保留已有交互                               |

`SuggestionActions` 来自公开 `/plugin-support` 入口。

### 设置建议内容

默认推荐问题的文案在 `application/locales.ts` 的 `starterSuggestions` 中维护，`application/project-config.tsx` 将解析后的项目和 Host 文案映射为建议项。修改点击行为时，保留内容来源，在现有薄应用入口设置公开属性：

```tsx
import { ConversationSuggestionsPlugin as Suggestions } from '@za38.03/agent-ui-plugins/conversation-suggestions';
import type { ComponentProps } from 'react';

export const ConversationSuggestionsPlugin = (props: ComponentProps<typeof Suggestions>) => {
  return <Suggestions {...props} sendOnSelect={false} />;
};
```

`false` 表示只写入草稿；默认 `true` 表示立即发送。不要把 `send` 放入 `buttonProps`，它由 `sendOnSelect` 管理。动态业务建议也可以通过公开 `items` 或 `renderSuggestion` 定制。

要移除标题下方的附加说明，在 `project-config.tsx` 的现有 `getConversationStarterSuggestions` 回调中省略 `label`，保留其他项目配置和文案绑定：

```tsx
getConversationStarterSuggestions: (_locale, messages) => [
  { title: messages.architectureTitle, prompt: messages.architecturePrompt },
  { title: messages.debugTitle, prompt: messages.debugPrompt },
  { title: messages.nextTitle, prompt: messages.nextPrompt },
],
```

将必需的 locale 标签设为 `''` 会回退到默认文案，不能用于隐藏说明。`title` 控制展示标题，`prompt` 控制发送内容；检查两种语言下完整问句、说明是否存在及实际发送行为。

### 一条建议如何展示和发送 \{#conversationsuggestionitem}

`items` 中每项必需 `prompt: string`，这是写入草稿或发送的正文。`title?: string` 控制可见标题，省略时显示 `prompt`；`label?: string` 是标题下方的说明，省略时不显示说明。

例如，业务上可以用简短标题“订单进度”展示按钮，让 `prompt` 保留完整问题；前面的双语示例已经分开设置这两个字段。`data?: ComposerData` 用于附带订单 ID 等 JSON，如何采集和发送见[自定义建议问题的数据](#自定义建议问题的数据)。

文案由项目语言层提供；订单 ID 等业务数据保持原值。


为什么 renderSuggestion 没有改变固定 items 的样式？

现在同时适用于固定 items 与运行时建议，回调接收当前项和默认展示节点。






