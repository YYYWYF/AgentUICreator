# 临时通知（transient-assistant-messages）

提示显示在对话的对应位置，但**不作为用户问题发送给 Agent，也不写入后端聊天历史**。它只保留在当前页面内存中，适合临时通知。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![显示临时通知（transient-assistant-messages）界面示例](/images/plugins/transient-assistant-messages.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable transient-assistant-messages`，点击下图中的 **「显示临时通知」**。

![Creator 启用菜单：点击「显示临时通知」，插件 ID 为 transient-assistant-messages](/images/plugins/enable/transient-assistant-messages.jpg)

## 使用提示

通知可以显示为用户提示、助理提示或居中的系统提示，也可以突出显示错误。启用插件后，还需要将业务事件接到通知，例如连接恢复或请求失败；可把事件和期望文案一起交给 Creator。

通知不会发送给 Agent，也不会写入后端历史。刷新页面后会消失；“临时”不表示几秒后自动关闭。

## 定制选项

| 可以改什么   | 效果                        |
| ------- | ------------------------- |
| 提示区域外观  | 调整每条通知的背景、边框、圆角和间距。       |
| 提示文字    | 调整字号、颜色和行距。               |
| 单条提示的排版 | 按用户提示、助理提示或系统通知分别设置图标和排列。 |

## 需求示例

```text
请修改「显示临时通知（transient-assistant-messages）」：
修改：系统通知【居中】，用户提示【靠右】，助理提示【靠左】，错误提示加【红色边框】。
保留：消息的角色、类型和原有临时消息行为。
```

## 属性

打开项目中的 `plugins/transient-assistant-messages/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`ConversationTransientMessages`；类型：`ConversationTransientMessagesProps`。继承 `div` 原生属性，排除 `children`；外观属性作用于每条默认消息。

| 属性               | 类型                                                              | 省略时 / 用途                       |
| ---------------- | --------------------------------------------------------------- | ------------------------------ |
| `afterMessageId` | `string \| null`                                                | 消息锚点；插件入口省略时为 `null`，单独使用组件时必需 |
| `classNames?`    | `{ text?: string }`                                             | 正文样式类                          |
| `styles?`        | `{ text?: CSSProperties }`                                      | 正文内联样式                         |
| `renderMessage?` | [`(message: TransientMessage) => ReactNode`](#transientmessage) | 替换单条消息；自定义渲染自行处理根属性与外观         |

消息从现有临时消息服务读取，不传入另一份消息列表，也不会写入会话历史。

### 类型说明

#### TransientMessage

`renderMessage` 接收的一条临时消息，所有字段均为只读且必需。

| 字段                  | 类型                                  | 含义                                             |
| ------------------- | ----------------------------------- | ---------------------------------------------- |
| `id`                | `string`                            | 临时消息的唯一标识，由服务生成                                |
| `conversationId`    | `string`                            | 所属会话的标识                                        |
| `role`              | `'user' \| 'assistant' \| 'system'` | 决定默认展示为用户、助理或系统提示                              |
| `type`              | `'normal' \| 'error'`               | 普通提示或错误提示                                      |
| `text`              | `string`                            | 提示正文                                           |
| `afterMessageId`    | `string \| null`                    | 插入时位于哪条会话消息之后；`null` 表示插入时会话没有消息               |
| `afterMessageIndex` | `number`                            | 插入时的会话消息索引，从 `0` 开始；没有消息时为 `-1`，用于锚点 ID 变化后的定位 |

这些字段由现有临时消息服务提供，自定义渲染无需自行生成锚点或修改消息对象。

### 类型查询

React 原生属性等复杂类型可在编辑器中查询；通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { ConversationTransientMessages } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof ConversationTransientMessages>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
