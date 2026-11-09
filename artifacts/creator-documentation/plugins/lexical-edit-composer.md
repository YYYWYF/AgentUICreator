# 消息与标签编辑（lexical-edit-composer）

将鼠标移到已发送的用户消息上，点击旁边的「编辑」按钮，原有 @ 对象和 / 指令标签会回填到编辑框。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![已发送的用户消息旁显示编辑按钮](/images/plugins/lexical-edit-composer-entry.png)

原消息的位置会切换为编辑框，修改后可以「更新」或「取消」，下方仍保留已有回复。

![在原位置编辑历史用户消息，下方保留已有回复](/images/plugins/lexical-edit-composer.png)

## 启用与使用

默认模板使用普通文本框编辑已发送的消息，支持更新和取消，无需安装 Lexical。需要在编辑框中展示 @ 对象和 / 指令标签时，再按需启用此插件，并安装工程缺少的 Lexical 依赖。

该插件是 `conversation-surface.userEditComposer` 的 renderer，复用当前消息和编辑草稿。未启用时使用父级提供的普通文本编辑，不重建会话或重新初始化草稿；它的启停不改变主输入框的实现。保留原生输入、composition、取消和提交处理。

在 **Creator 输入框**输入 `/enable lexical-edit-composer`，点击下图中的 **「编辑已发送的消息与标签」**。

![Creator 启用菜单：点击「编辑已发送的消息与标签」，插件 ID 为 lexical-edit-composer](/images/plugins/enable/lexical-edit-composer.jpg)

## 定制选项

| 可以改什么    | 效果                           |
| -------- | ---------------------------- |
| 重新发送快捷键  | 选择回车或 Ctrl/Cmd + Enter 提交修改。 |
| 编辑提示     | 修改编辑框为空时的提示。                 |
| 编辑区大小和外观 | 调整高度、字号、边框和间距。               |
| 引用标签的样式  | 调整原消息中 @ 对象和 / 指令标签的外观。      |
| 整个编辑区域   | 换成自己的编辑组件。                   |

更多输入设置见[标签输入框的调整选项](/plugins/lexical-composer-input.md#定制选项)。

## 需求示例

```text
请修改「编辑已发送的消息与标签（lexical-edit-composer）」：
修改：编辑提示改为【修改这条消息】，重新发送快捷键改为【Ctrl/Cmd + Enter】，编辑区最小高度设为【96px】。
保留：原消息的引用标签和重新发送行为。
```

## 属性

打开项目中的 `plugins/lexical-edit-composer/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

入口来自 `@za38.03/agent-ui-plugins/lexical`：`CanonicalConversationLexicalEditComposer`；类型：`ConversationLexicalEditComposerProps`。样式通过 `inputProps` 配置，自定义输入内容通过 `input` 提供。

| 属性            | 类型                              | 省略时 / 用途          |
| ------------- | ------------------------------- | ----------------- |
| `input?`      | `ReactNode`                     | 替换消息编辑输入          |
| `inputProps?` | `ConversationLexicalInputProps` | Lexical 输入属性，详见下表 |

没有自定义 `input` 时，默认使用 Lexical；草稿含不支持的指令时保留现有普通输入回退。保存修改和取消编辑仍由现有消息编辑组件处理。

### inputProps

下表是编辑输入组件的嵌套属性；输入元素还继承 `div` 原生属性。

| 属性                                 | 类型                                                                                                                                                           | 省略时 / 用途                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `inputProps.submitMode?`           | `'enter' \| 'ctrlEnter' \| 'none'`                                                                                                                           | 默认 `enter`；由已安装 Lexical 输入组件处理                                                 |
| `inputProps.cancelOnEscape?`       | `boolean`                                                                                                                                                    | 默认 `true`，Esc 取消编辑策略                                                           |
| `inputProps.placeholder?`          | `string`                                                                                                                                                     | 默认使用所在输入区的提示文字                                                                 |
| `inputProps.autoFocus?`            | `boolean`                                                                                                                                                    | 默认使用所在输入区的自动聚焦设置                                                               |
| `inputProps.directivePluginProps?` | [`{ onDirectiveSelect?: (item: ConversationLexicalTriggerItem) => void }`](#conversationlexicaltriggeritem)                                                  | 指令选中回调                                                                         |
| `inputProps.directiveChip?`        | [`FC<ConversationComposerDirectiveChipProps>`](#conversationcomposerdirectivechipprops)                                                                      | 默认 `ConversationComposerDirectiveChip`，替换指令标签组件                                |
| `inputProps.formatter?`            | [`{ serialize(item: ConversationLexicalTriggerItem): string; parse(text: string): readonly ConversationLexicalSegment[] }`](#conversationlexicaltriggeritem) | 默认项目统一指令格式化器；返回片段见 [`ConversationLexicalSegment`](#conversationlexicalsegment) |
| `inputProps.children?`             | `ReactNode`                                                                                                                                                  | 追加 Lexical 子插件；现有中文输入法保护仍保留                                                    |

这个输入组件需要放在项目现有的消息输入区或消息编辑区内，才能读取草稿、提示文字和聚焦设置。它只替换输入界面，继续使用原有会话。

`inputProps` 还支持输入元素的 `className`、`style`、`id`、`role`、`aria-*`、`data-*` 与原生事件回调；它们属于嵌套输入属性，不是本插件的根属性。

### 类型说明

#### ConversationLexicalTriggerItem

指令候选项，字段均只读。

```ts
interface ConversationLexicalTriggerItem {
  readonly id: string; // 稳定标识
  readonly type: string; // 指令类型
  readonly label: string; // 展示文字
  readonly description?: string; // 补充说明
  readonly metadata?: import('assistant-stream/utils').ReadonlyJSONObject;
}
```

`metadata` 是可选的只读 JSON 对象，完整 JSON 类型可在编辑器中查询。

#### ConversationComposerDirectiveChipProps

指令标签组件接收的属性。

```ts
interface ConversationComposerDirectiveChipProps {
  directiveId: string; // 指令标识
  directiveType: string; // 指令类型
  label: string; // 展示文字
}
```

#### ConversationLexicalSegment

格式化器解析后的片段，字段均只读；按 `kind` 区分普通文本和提及。

```ts
type ConversationLexicalSegment =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'mention'; readonly type: string; readonly label: string; readonly id: string };
```

### 类型查询

React 原生属性、组件组合及嵌套会话数据等复杂类型，可在编辑器中查询。通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalConversationLexicalEditComposer } from '@za38.03/agent-ui-plugins/lexical';

type ImplementationProps = ComponentProps<typeof CanonicalConversationLexicalEditComposer>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
