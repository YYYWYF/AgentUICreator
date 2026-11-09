# 生成文件（generated-file-message）

例如生成一份报告后，对话中会出现文件名和下载入口。文件内容和可访问地址由业务服务提供。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![获取生成文件（generated-file-message）界面示例](/images/plugins/generated-file-message.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable generated-file-message`，点击下图中的 **「获取生成文件」**。

![Creator 启用菜单：点击「获取生成文件」，插件 ID 为 generated-file-message](/images/plugins/enable/generated-file-message.jpg)

## 显示条件与数据来源

**Agent 服务接入：**&#x5F53;前默认注册工具名为 `generate_file`，成功结果使用本工具的 `{ filename, mimeType, url }` 业务结构。以下事件按顺序发送；完整 SSE 包装和运行开始、结束事件见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```json
[
  {
    "type": "TOOL_CALL_START",
    "toolCallId": "call-1",
    "toolCallName": "generate_file"
  },
  {
    "type": "TOOL_CALL_ARGS",
    "toolCallId": "call-1",
    "delta": "{\"filename\":\"报告.pdf\",\"format\":\"pdf\"}"
  },
  {
    "type": "TOOL_CALL_END",
    "toolCallId": "call-1"
  },
  {
    "type": "TOOL_CALL_RESULT",
    "messageId": "result-1",
    "toolCallId": "call-1",
    "role": "tool",
    "content": "{\"filename\":\"报告.pdf\",\"mimeType\":\"application/pdf\",\"url\":\"https://example.com/report.pdf\"}"
  }
]
```

`filename`、`mimeType`、`url` 都是非空字符串，URL 必须是有效的 HTTP(S) 地址。仅工具已完成、非错误且结果有效时显示文件卡片，运行中或数据无效时使用工具详情回退。该对象是 `generate_file` 的业务结果，不是 AG-UI 通用文件事件；通用文档内容数组见[工具结果](/plugins/tool-result.md)。示例网址需换成可访问的真实文件地址。

## 定制选项

| 可以改什么      | 效果                           |
| ---------- | ---------------------------- |
| 文件名        | 修改卡片显示的文件名和下载时使用的名字。         |
| 卡片宽度和排版    | 调整文件名、图标和下载入口的排列，也可以在外层设置宽度。 |
| 未完成或失败时的展示 | 修改文件尚未生成或生成失败时显示的内容。         |

## 需求示例

```text
请修改「获取生成文件（generated-file-message）」：
修改：文件卡片最大宽度设为【480px】，文件名与下载入口按【左右排列】展示。
保留：真实文件名、下载地址和下载操作。
```

## 属性

打开项目中的 `plugins/generated-file-message/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalGeneratedFileMessage`；类型：`GeneratedFileMessageProps`。还接受下方列出的工具调用数据、样式和无障碍属性。

| 属性            | 类型                                                                                               | 省略时 / 用途                                       |
| ------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `filename?`   | `string`                                                                                         | 默认有效结果的文件名                                     |
| `mimeType?`   | `string`                                                                                         | 默认有效结果的 MIME 类型                                |
| `data?`       | `string`                                                                                         | 默认有效结果的文件 URL                                  |
| `sourceType?` | `'url' \| 'id'`                                                                                  | 默认 `url`                                       |
| `renderFile?` | `(props: ComponentProps<typeof ConversationFile>, tool: ConversationToolCallProps) => ReactNode` | 自定义文件展示                                        |
| `Fallback?`   | `ComponentType<ConversationToolCallProps>`                                                       | 默认 `ConversationToolFallback`；工具未完成、出错或结果无效时使用 |

### 外观与无障碍属性

以下属性均可选。

| 属性                 | 类型                                    | 用途      |
| ------------------ | ------------------------------------- | ------- |
| `className`        | `string`                              | 整体样式类   |
| `style`            | `CSSProperties`                       | 整体内联样式  |
| `id`               | `string`                              | 元素标识    |
| `role`             | `HTMLAttributes<HTMLElement>['role']` | 无障碍角色   |
| `aria-label`       | `string`                              | 无障碍名称   |
| `aria-describedby` | `string`                              | 描述元素 ID |
| `onClick`          | `MouseEventHandler<HTMLElement>`      | 点击回调    |

### 当前工具调用的数据与操作

这些数据和方法由现有会话传入，类型为 `ConversationToolCallProps`。`toolCallId`、`toolName`、`args`、`status` 是必需字段，其余已列出的字段可选；修改展示时保留原有传参。

| 属性                 | 类型                                                                          | 用途                        |
| ------------------ | --------------------------------------------------------------------------- | ------------------------- |
| `type?`            | `'tool-call'`                                                               | 消息片段类型                    |
| `toolCallId`       | `string`                                                                    | 工具调用 ID                   |
| `toolName`         | `string`                                                                    | 工具名称                      |
| `args`             | `unknown`                                                                   | 解析后的输入参数                  |
| `argsText?`        | `string`                                                                    | 输入参数的文本形式                 |
| `result?`          | `unknown`                                                                   | 工具结果                      |
| `messages?`        | `readonly ConversationMessage[]`                                            | 关联的嵌套消息                   |
| `isError?`         | `boolean`                                                                   | 结果是否为错误                   |
| `status`           | [`ConversationToolCallStatus`](#conversationtoolcallstatus)                 | 工具当前状态：运行中、已完成、未完成或等待用户操作 |
| `addResult?`       | `(result: unknown) => void`                                                 | 提交前端工具结果                  |
| `resumeInterrupt?` | `(payload: unknown) => Promise<void>`                                       | 提交恢复数据，让暂停的任务继续执行         |
| `decisionRequest?` | [`ConversationCommandDecisionRequest`](#conversationcommanddecisionrequest) | 运行环境提供的操作确认请求             |
| `submitDecision?`  | `(decisionType: string) => Promise<void>`                                   | 提交后端支持的决定                 |

该类型允许传入额外字段，但字段是否生效取决于组件实现，不能据此添加任意配置项。

### 类型说明

#### ConversationToolCallStatus

按 `type` 区分工具状态：运行中、已完成、未完成和等待用户操作。

```ts
type ConversationToolCallStatus =
  | { type: 'running' }
  | { type: 'complete' }
  | { type: 'incomplete'; reason?: string; error?: unknown }
  | { type: 'requires-action'; reason?: string };
```

`reason` 是可选原因，`error` 是未完成时的可选错误详情。

#### ConversationCommandDecisionRequest

运行环境提供的操作确认请求。

```ts
interface ConversationCommandDecisionRequest {
  allowedDecisions: readonly string[]; // 后端允许提交的决定标识
  description?: string; // 请求说明
}
```

提交决定时使用 `allowedDecisions` 中的原始标识。

### 类型查询

React 原生属性、组件组合及嵌套会话数据等复杂类型，可在编辑器中查询。通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalGeneratedFileMessage } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalGeneratedFileMessage>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
