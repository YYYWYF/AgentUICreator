# 思考内容展示（reasoning）

Agent 提供思考内容时，对话中会出现「思考」区域，并随返回内容更新。它展示思考文字；只有「正在思考」提示时，并没有这些详情。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![展开 Agent 思考内容（reasoning）界面示例](/images/plugins/reasoning.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable reasoning`，点击下图中的 **「展开 Agent 思考内容」**。

![Creator 启用菜单：点击「展开 Agent 思考内容」，插件 ID 为 reasoning](/images/plugins/enable/reasoning.jpg)

## 显示条件与数据来源

**Agent 服务接入：**&#x53D1;送专用 reasoning 事件，普通 `TEXT_MESSAGE_CONTENT` 中的文字不会自动变成思考区域。以下事件按顺序发送；完整 SSE 包装和运行开始、结束事件见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```json
[
  {
    "type": "REASONING_START",
    "messageId": "reasoning-1"
  },
  {
    "type": "REASONING_MESSAGE_START",
    "messageId": "reasoning-text-1",
    "role": "reasoning"
  },
  {
    "type": "REASONING_MESSAGE_CONTENT",
    "messageId": "reasoning-text-1",
    "delta": "正在核对用户提供的资料。"
  },
  {
    "type": "REASONING_MESSAGE_END",
    "messageId": "reasoning-text-1"
  },
  {
    "type": "REASONING_END",
    "messageId": "reasoning-1"
  }
]
```

外层 reasoning 和其中的文本各自保持 ID 一致。内容可分多条 `REASONING_MESSAGE_CONTENT` 逐步发送；结束后仍可发送正式回答。插件须启用并组合到会话的思考展示位置；没有思考内容时不会凭空生成文字。

## 定制选项

| 可以改什么     | 效果                                     |
| --------- | -------------------------------------- |
| 开始时展开还是收起 | 选择默认展开或收起思考内容。                         |
| 背景和边框     | outline 显示边框，ghost 使用透明背景，muted 使用淡背景。 |
| 正文排版      | 调整思考文字的字号、颜色和行距。                       |
| 标题和内容区样式  | 调整标题按钮、内容区的间距和外观。                      |

## 需求示例

```text
请修改「展开 Agent 思考内容（reasoning）」：
修改：思考内容默认【收起】，正文字号设为【13px】，行高设为【1.6】。
保留：原有思考内容和展开、收起操作。
```

## 属性

打开项目中的 `plugins/reasoning/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`ConversationCanonicalReasoningGroup`；类型：`ConversationCanonicalReasoningGroupProps`。继承公开 ReasoningRoot 的属性，排除 `children`、`open`、`defaultOpen`、`onOpenChange` 后单独定义如下。插件入口将属性变为可选；缺少 `group` 时不渲染。

| 属性                  | 类型                                                          | 省略时 / 用途                           |
| ------------------- | ----------------------------------------------------------- | ---------------------------------- |
| `group`             | `ConversationMessagePartGroup`                              | 会话运行环境提供的当前推理分组；单独使用展示组件时必需        |
| `children?`         | `ReactNode`                                                 | 分组中的推理内容                           |
| `expanded?`         | `boolean`                                                   | 受控展开                               |
| `defaultExpanded?`  | `boolean`                                                   | 初始默认 `false`；非受控时流式推理可自动展开         |
| `onExpandedChange?` | `(expanded: boolean) => void`                               | 展开变化通知                             |
| `buttonProps?`      | `ComponentProps<typeof ReasoningTrigger>`                   | 标题按钮，可配置 `active`、`duration` 和原生属性 |
| `contentProps?`     | `Omit<ComponentProps<typeof ReasoningContent>, 'children'>` | 折叠内容面板属性                           |
| `textProps?`        | `Omit<ComponentProps<typeof ReasoningText>, 'children'>`    | 正文 `div` 属性                        |
| `variant?`          | `'outline' \| 'ghost' \| 'muted' \| null`                   | 根区域样式，底层默认 `outline`               |
| `streaming?`        | `boolean`                                                   | 默认从 `group.status` 推导；覆盖流式展示标记     |
| `onAnimationStart?` | `() => void`                                                | 折叠／流式状态动画开始前通知                     |

根组件还继承外观、无障碍与其余折叠根组件属性。这里的 `ReasoningTrigger` 等类型从公开 `/plugin-support` 入口取得。

### 类型查询

可在编辑器中通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { ConversationCanonicalReasoningGroup } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof ConversationCanonicalReasoningGroup>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
