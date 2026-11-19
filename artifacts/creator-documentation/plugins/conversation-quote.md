# 消息引用（conversation-quote）


![消息引用界面](/images/plugins/conversation-quote.png)

消息中的选中文本出现在引用预览；补充问题后一起发送，关闭预览取消引用。

选中已有消息中的一段文字后发起引用，输入区立即显示引用预览。用户可以补充问题，也可以直接移除预览；插件已经把选择工具栏、原消息标识和当前草稿连起来。

## 引用一段消息再提问

选择消息内容后使用引用入口，预览中保留这段内容。正文与引用分别编辑，关闭预览取消本次引用，不会删除原消息。默认发送时，将引用转换为 Markdown 引用段落，加在用户输入之前。

例如引用“合同下周到期”，再输入“请提醒我续签”，发送的用户正文为：

```text
> 合同下周到期

请提醒我续签
```

不需要自己给 Composer 拼接这段前缀。只希望后端接收消息 ID 和原文时，使用下方局部适配器替换默认引用前缀。

## 交给 Composer 的数据





原始引用只有消息标识和所选正文。假设引用插件实例 ID 为 `quote`，未配置局部适配器时，Composer 最终适配器收到：

```json
{
  "pluginData": { "quote": { "messageId": "message-1", "text": "合同下周到期" } },
  "selections": { "quote": [{ "messageId": "message-1", "text": "合同下周到期" }] }
}
```

`pluginData.quote` 是**对象**，`selections.quote` 是原始选择数组。默认行为是前面的 Markdown 正文，不会再自动增加 `forwardedProps.quote`。

在已有应用入口转换为后端所需字段：

```tsx
import type { ComponentProps } from 'react';
import { ConversationQuotePlugin as Implementation } from '@za38.03/agent-ui-plugins/conversation-quote';

export function ConversationQuotePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    requestAdapter={quote => ({ sourceMessageId: quote.messageId, passage: quote.text })} />;
}
```

局部适配器在选择变化时同步执行，返回 JSON。此时 `pluginData.quote` 改为 `{ sourceMessageId, passage }`，原始 `selections.quote` 保持不变；默认请求改为：

```json
{ "forwardedProps": { "quote": { "sourceMessageId": "message-1", "passage": "合同下周到期" } } }
```

配置局部适配器后不再自动拼接 Markdown 引用前缀。Composer 的[最终适配器](/plugins/composer.md#请求适配)可以继续移动这些字段、写入 AG-UI `context` 或重新组织正文；它返回的是完整最终请求。

实例键以实际 AppUIModel 实例为准，嵌入其他插件时使用该实例的 `:quote` 子键。局部回调抛错或返回非法 JSON 时保留原引用并提示错误，不用失败结果替换草稿。

## 取消、发送与恢复引用

关闭预览后，这份引用不再参与本次请求。普通发送被接受后释放本次待发送数据；排队、重试和续答沿用原次快照。后续修改引用不会改写已提交请求。

插件订阅原生 `composer.quote`，因此业务卡片使用 `setQuote()` 也会更新同一个预览与数据，不需要再手动调用 `setData()`。已有消息的编辑与历史恢复还需要保留前端元数据，见 [Composer 生命周期](/plugins/composer.md#提交后的快照重发与会话切换)。

## 业务卡片引用 \{#hook}

业务结果卡片要把一段文字引用到当前草稿时，使用 Composer 的 `setQuote({ text, messageId })`。`text` 是选中的原文，`messageId` 是来源消息的实际 ID：

```tsx
import { useComposer } from '@za38.03/agent-ui-plugins';

export function QuotePassage({ text, messageId, label }: {
  text: string;
  messageId: string;
  label: string;
}) {
  const composer = useComposer();
  return <button type="button"
    onClick={() => composer.setQuote({ text, messageId })}>{label}</button>;
}
```

把组件放入已有消息卡片中，`label` 来自项目文案。点击后，现有输入区的引用预览更新，用户仍需发送草稿；`setQuote(undefined)` 清除引用。引用数据的发送格式见[自定义引用数据](#自定义引用数据)。

只有手动组合会话边界时才需要 `useConversationQuoteLifecycle(): void`，从 Plugins 根入口导入，在边界卸载时清理该 Thread 的待引用内容。生成项目已经安装此生命周期。定位自定义引用工具栏需要的 `useThreadRootElementRef()` 从 Runtime `/plugin-api` 导入，返回已有根元素 ref 或 `null`，不创建容器。

## 隐藏选择工具栏，保留引用预览 \{#隐藏选择工具栏保留引用预览}


renderToolbar 返回 null 后不显示默认选择工具栏；引用仍可由项目已有引用入口或 useComposer 设置。

```tsx
import type { ComponentProps } from 'react';
import { CanonicalConversationQuote } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalConversationQuote>) {
  return <CanonicalConversationQuote {...props}
    renderToolbar={() => null} />;
}
```

## API



在 `CanonicalConversationQuote` 上设置以下属性。

没有独立的界面容器；预览与选择工具栏为两个表面。

| 属性                | 类型                                               | 省略时 / 用途                        |
| ----------------- | ------------------------------------------------ | ------------------------------- |
| `requestAdapter?` | `(quote: ConversationQuoteData) => ComposerData` | 同步定义引用 JSON；省略时保留 Markdown 引用正文 |
| `renderPreview?`  | `() => ReactNode`                                | 自定义引用预览                         |
| `renderToolbar?`  | `() => ReactNode`                                | 自定义选择工具栏                        |

默认组件没有根级 `className`／`style`；预览与工具栏分别使用 renderPreview、renderToolbar。引用的保存、移除和切换会话时的清理，仍由现有会话处理。

- **文案**：在 `locales.conversationQuote.quote` / `dismiss` 中修改引用与关闭文字，保持 `en-US` / `zh-CN` 对应。
- **结构**：`renderPreview` 与 `renderToolbar` 是无参数的渲染回调。





