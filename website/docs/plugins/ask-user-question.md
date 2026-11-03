---
title: "询问用户"
---

# 询问用户

`ask-user-question` 让 Agent 在对话中提出问题，收集单选、多选或文字回答，再根据答案继续处理。它是正式 UI 插件，随 `@za38.03/agent-ui-plugins` 提供，默认按需启用。

日常调整可以交给 Creator；需要自己写代码时，直接查看[手动开发](#手动开发)。

## 添加到项目

在 Creator 输入框输入 `/enable ask-user-question`，搜索并选择「询问用户」。也可以直接告诉 Creator：

> 在当前项目中添加并启用 ask-user-question 插件，并检查 Agent 服务是否支持提问、接收答案和继续回答。

添加后，项目的项目组件入口引用 npm 实现；不需要安装 Demo 源码。AppUIModel 只保存插件实例和启用状态，问题、选项和渲染器不写进布局配置。

启用插件不会立即发起提问。Agent 调用 `ask_user_question` 时才出现问题卡片。可在 Mock 的「询问用户偏好」场景验证前端交互；连接真实 Agent 时仍需接入下方协议。

![Agent 提问，用户点击选项回答](/images/plugins/human-interaction-question.png)

## 支持的问题

- 单选或多选：每题 2–7 个选项，可限制最少和最多选择数量。
- 文字回答：每题一段文字，最长 4000 字符，可设为可选。
- 多步提问：每次调用 1–3 题，最后提交一次答案。

已回答的卡片显示原答案；只读历史和不能继续回答的调用不提供提交入口。提交失败时可重试，能否恢复未完成的问题由 Agent 服务决定。

## Agent 服务接入

工具名是 `ask_user_question`，通过 AG-UI 的 `TOOL_CALL_START`、`TOOL_CALL_ARGS`、`TOOL_CALL_END` 传递调用与参数。它没有单独的问卷事件类型。前端注册的是 `human` 工具，等待用户回答后提交工具结果。

例如，工具参数为：

```json
{
  "steps": [{
    "id": "layout",
    "question": "你希望采用哪种首页布局？",
    "selectionMode": "single",
    "minSelections": 1,
    "maxSelections": 1,
    "options": [
      { "id": "dashboard", "label": "数据总览" },
      { "id": "sidebar", "label": "侧边导航" }
    ]
  }]
}
```

选择「数据总览」后，前端提交：

```json
{ "answers": { "layout": ["dashboard"] } }
```

答案以题目 ID 为键、字符串数组为值；文字题也使用数组，`options` 必须为空，`maxSelections` 为 `1`。题目 ID 和选项 ID 是协议标识，显示文案由 Agent 提供。

后端需要接受当前工具调用的结果，并按会话续答协议继续执行。内置 Mock 演示的是结束本轮工具调用后，将答案作为 ToolMessage 随后续请求发送；不要在后端一直等待前端关闭不了的流。仅启用插件或返回相似 JSON，不能代替后端的工具调用和续答接入。

React 接入可从 `@za38.03/agent-ui-plugins/ask-user-question` 导入 `askUserQuestionParameters`、`parseHumanQuestionRequest`、`parseHumanQuestionResult` 和对应类型。后端应按相同协议校验答案。

## 外观与交互定制

先编辑项目内 `plugins/ask-user-question/index.tsx` 的项目组件入口，组合公开的 `AskUserQuestionPlugin`，保留工具调用数据和提交答案的方法。需要完全替换问卷 UI 时，可以在本地定义中替换 `ask_user_question.render`，复用公开的参数与答案校验。

插件 ID 是 `ask-user-question`，工具名是 `ask_user_question`，两者用途不同。旧项目若已有 `ask-user-question-demo`，先检查其定制并停用旧实例，再启用正式插件；不要同时注册两个同名工具。此次添加不会自动改写旧项目。

[人机交互与操作确认](/plugins/human-interaction) · [前端工具接入](/development/frontend-tools) · [返回插件总览](/plugins/)

## 手动开发

打开项目中的 `plugins/ask-user-question/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

### 属性

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalAskUserQuestion`；类型：`AskUserQuestionProps`。还接受下方列出的工具调用数据、样式和无障碍属性。

| 属性 | 类型 | 省略时 / 用途 |
| --- | --- | --- |
| `submitText?` | `string` | 优先于 `labels.submit`，默认使用 `humanQuestion.submit` |
| `labels?` | `Partial<AgentUILocaleMessages['humanQuestion']>` | 覆盖问答域的部分文案，未覆盖字段沿用统一语言层 |

`labels` 的可选字段均为 `string`：

| 字段 | 用途 | 默认中文 |
| --- | --- | --- |
| `back` | 返回上一题 | 上一步 |
| `next` | 进入下一题 | 下一步 |
| `submit` | 提交回答 | 确认选择 |
| `submitting` | 提交中的提示 | 正在提交选择… |
| `answered` | 历史已回答标记 | 已选择 |
| `noneSelected` | 没有选择的提示 | 未选择 |
| `unavailable` | 无法回答的提示 | 此问题暂时无法回答 |

问题和答案分别来自工具 `args`、`result`。可回答状态还要求当前工具等待用户操作、Runtime 允许回答且有 `addResult`；历史记录保持只读。问答协议见[询问用户](./ask-user-question)。

#### 外观与无障碍属性

以下属性均可选。

| 属性 | 类型 | 用途 |
| --- | --- | --- |
| `className` | `string` | 整体样式类 |
| `style` | `CSSProperties` | 整体内联样式 |
| `id` | `string` | 元素标识 |
| `role` | `HTMLAttributes<HTMLElement>['role']` | 无障碍角色 |
| `aria-label` | `string` | 无障碍名称 |
| `aria-describedby` | `string` | 描述元素 ID |
| `onClick` | `MouseEventHandler<HTMLElement>` | 点击回调 |

#### 当前工具调用的数据与操作

这些数据和方法由现有会话传入，类型为 `ConversationToolCallProps`。`toolCallId`、`toolName`、`args`、`status` 是必需字段，其余已列出的字段可选；修改展示时保留原有传参。

| 属性 | 类型 | 用途 |
| --- | --- | --- |
| `type?` | `'tool-call'` | 消息片段类型 |
| `toolCallId` | `string` | 工具调用 ID |
| `toolName` | `string` | 工具名称 |
| `args` | `unknown` | 解析后的输入参数 |
| `argsText?` | `string` | 输入参数的文本形式 |
| `result?` | `unknown` | 工具结果 |
| `messages?` | `readonly ConversationMessage[]` | 关联的嵌套消息 |
| `isError?` | `boolean` | 结果是否为错误 |
| `status` | `ConversationToolCallStatus` | 工具当前状态：运行中、已完成、未完成或等待用户操作 |
| `addResult?` | `(result: unknown) => void` | 提交前端工具结果 |
| `resumeInterrupt?` | `(payload: unknown) => Promise<void>` | 提交恢复数据，让暂停的任务继续执行 |
| `decisionRequest?` | `ConversationCommandDecisionRequest` | 运行环境提供的操作确认请求 |
| `submitDecision?` | `(decisionType: string) => Promise<void>` | 提交后端支持的决定 |

`ConversationToolCallStatus` 为 `{ type: 'running' }`、`{ type: 'complete' }`、`{ type: 'incomplete'; reason?: string; error?: unknown }` 或 `{ type: 'requires-action'; reason?: string }`。`ConversationCommandDecisionRequest` 含 `allowedDecisions: readonly string[]` 和可选 `description: string`。

该类型允许传入额外字段，但字段是否生效取决于组件实现，不能据此添加任意配置项。

### 类型查询

可在编辑器中通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalAskUserQuestion } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalAskUserQuestion>;
```

组件定制方式见[组件定制指南](/development/component-customization)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition)。
这里的工具或消息参数由会话传入，属于数据接口；需要更换结构时，在项目注册处包装或更换渲染函数。
