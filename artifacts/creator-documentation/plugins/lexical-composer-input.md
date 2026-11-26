# 输入标签展示（lexical-composer-input）

## 功能与效果


![富文本输入界面](/images/plugins/lexical-composer-input.png)

草稿中的引用显示为标签；标签和前后文字仍属于当前 Composer。

让当前草稿中的 @ 提及和 / 指令以标签形式编辑。它替换输入界面，继续使用现有 Composer 的文本、会话和发送流程；选择、删除标签与中文输入法处理已内置。

### 文字与引用标签一起编辑

[@ 提及](/plugins/mention-trigger.md)或[/ 命令](/plugins/slash-command-trigger.md)选中项目后，草稿中的引用由 Lexical 展示为可整体选择、删除的标签。普通文字仍可在标签前后编辑；默认 Enter 提交、Shift+Enter 换行，沿用所在输入区的提示与自动聚焦设置。

例如可见标签“小李”对应正文 `:user[小李]{name=u-1}`。展示名与稳定 ID 分开，标签外观不会把业务 ID 改成文案。

## 数据来源与显示条件

### 与 Composer 联动

此插件读写**同一份草稿文本**，不另建 `pluginData` 条目。原始业务选择由 @ 或 / 触发器保存，其数据格式、默认发送位置分别见[提及数据](/plugins/mention-trigger.md#交给-composer-的数据)与[命令数据](/plugins/slash-command-trigger.md#交给-composer-的数据)。

删除标签会同步移除正文引用，提交时不再携带那条选择。反过来，只调用 `useComposer().setText()` 填入一个引用标记，可以恢复文字或标签显示，但不会凭空还原原始候选的 `data`；历史编辑要恢复完整业务选择，需要保留对应前端消息元数据，见 [Composer 快照规则](/plugins/composer.md#提交后的快照重发与会话切换)。

业务插件填入问题或订阅输入状态时继续使用 [Composer hooks](/plugins/composer.md#hook)，不创建另一份 Lexical 草稿。这里编辑的是待发送问题；编辑已有消息使用[消息编辑插件](/plugins/lexical-edit-composer.md#与-composer-联动)。

## 常见定制




### 自定义引用标签 \{#改引用标签外观保留编辑器行为}

在现有输入组件上传入标签组件。`label` 继续来自引用数据，稳定 ID 保留在数据属性中，业务样式使用项目主题变量：

```tsx fold height=180
import type { ComponentProps } from 'react';
import {
  CanonicalConversationLexicalComposerInput,
  type ConversationComposerDirectiveChipProps,
} from '@za38.03/agent-ui-plugins/lexical';

function ProjectDirectiveChip({ directiveId, directiveType, label }:
  ConversationComposerDirectiveChipProps) {
  return <span data-directive-id={directiveId} data-directive-type={directiveType}
    style={{ border: '1px solid var(--border)', borderRadius: 6, paddingInline: 4 }}>
    {label}
  </span>;
}

export function ProjectLexicalInput(props:
  ComponentProps<typeof CanonicalConversationLexicalComposerInput>) {
  return <CanonicalConversationLexicalComposerInput {...props}
    directiveChip={ProjectDirectiveChip} />;
}
```

这里替换的是标签展示，没有创建新的草稿或改变发送数据。

### 观察标签选择与扩展文本格式

`directivePluginProps.onDirectiveSelect(item)` 观察标签选择，收到引用身份、展示数据及实际存在的元数据；这个回调本身不会登记 Composer 业务参数或发送请求。需要新增业务选择时仍使用对应选择服务或 `setData()`。

确实使用项目自定义序列化时，`formatter.serialize()` 和 `formatter.parse()` 必须能往返保留文字顺序、引用类型和 ID，并与候选插入格式一致。只改颜色或标签样式时使用 `directiveChip` 即可，具体签名见末尾 API。

### 快捷键与自动聚焦 \{#快捷键与自动聚焦}


Lexical 为可选输入实现，通过 /lexical 入口导入；沿用项目已有编辑与输入组合。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { CanonicalConversationLexicalComposerInput } from '@za38.03/agent-ui-plugins/lexical';

export function Example(props: ComponentProps<typeof CanonicalConversationLexicalComposerInput>) {
  return <CanonicalConversationLexicalComposerInput {...props}
    submitMode="ctrlEnter"
    autoFocus={false} />;
}
```


### Escape 不取消编辑 \{#escape-不取消编辑}

关闭 Escape 取消后，用户继续通过已有取消按钮退出编辑。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { CanonicalConversationLexicalComposerInput } from '@za38.03/agent-ui-plugins/lexical';

export function Example(props: ComponentProps<typeof CanonicalConversationLexicalComposerInput>) {
  return <CanonicalConversationLexicalComposerInput {...props}
    cancelOnEscape={false} />;
}
```

## 属性与 API



### API

入口来自 `@za38.03/agent-ui-plugins/lexical`：`CanonicalConversationLexicalComposerInput`。继承 `div` 原生属性，`autoFocus`、`children` 单独定义。

| 属性                      | 类型                                                                                                                                                           | 省略时 / 用途                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `submitMode?`           | `'enter' \| 'ctrlEnter' \| 'none'`                                                                                                                           | 默认 `enter`；由已安装 Lexical 输入组件处理                                                 |
| `cancelOnEscape?`       | `boolean`                                                                                                                                                    | 默认 `true`，Esc 取消编辑策略                                                           |
| `placeholder?`          | `string`                                                                                                                                                     | 默认使用所在输入区的提示文字                                                                 |
| `autoFocus?`            | `boolean`                                                                                                                                                    | 默认使用所在输入区的自动聚焦设置                                                               |
| `directivePluginProps?` | [`{ onDirectiveSelect?: (item: ConversationLexicalTriggerItem) => void }`](#conversationlexicaltriggeritem)                                                  | 指令选中回调                                                                         |
| `directiveChip?`        | [`FC<ConversationComposerDirectiveChipProps>`](#conversationcomposerdirectivechipprops)                                                                      | 默认 `ConversationComposerDirectiveChip`，替换指令标签组件                                |
| `formatter?`            | [`{ serialize(item: ConversationLexicalTriggerItem): string; parse(text: string): readonly ConversationLexicalSegment[] }`](#conversationlexicaltriggeritem) | 默认项目统一指令格式化器；返回片段见 [`ConversationLexicalSegment`](#conversationlexicalsegment) |
| `children?`             | `ReactNode`                                                                                                                                                  | 追加 Lexical 子插件；现有中文输入法保护仍保留                                                    |

这个输入组件需要放在项目现有的消息输入区或消息编辑区内，才能读取草稿、提示文字和聚焦设置。它只替换输入界面，继续使用原有会话。

#### 定制引用标签及其数据 \{#conversationcomposerdirectivechipprops}

指令标签的三个输入是 `directiveId`（稳定对象 ID）、`directiveType`（类别）和 `label`（展示名称）。仅改变标签外观时，使用以下 `directiveChip` 示例；编辑器仍负责原子选择、删除、草稿同步及中文输入。


`directivePluginProps.onDirectiveSelect(item)` 收到 `id`、`type`、`label`，以及可选 `description` 和只读 JSON `metadata`。这些是当前引用的身份与展示数据；改变 `label` 不应改变对象 ID，回调也不会自动启动业务请求。


只有需要支持项目自己的序列化格式时才替换 `formatter`：`serialize(item)` 返回写入草稿的字符串，`parse(text)` 将草稿拆为只读片段。普通片段为 `{ kind: 'text', text }`，提及片段为 `{ kind: 'mention', type, label, id }`；字段均为字符串。两者必须能往返保留文本、引用身份和顺序，保存后重新编辑也应能恢复。只改颜色或名称时不需要自定义格式。


其他业务插件要填入问题、引用或附加参数时，调用 [Composer 的草稿接口](/plugins/composer.md#hook)，沿用当前 Thread 的输入状态。按钮填入文字并携带业务 ID 的完整示例见[从订单卡片填入问题](/plugins/composer.md#example-3)。


