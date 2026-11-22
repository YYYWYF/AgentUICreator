---
title: "询问用户"
---

# 询问用户

## 功能与效果

展示工具提出的选择题或文字题，支持用户提交、只读回执和独立问卷。

### 交互问答

<figure className="plugin-preview">

![交互问答界面](/images/plugins/human-interaction-question.png)

</figure>

### 支持的问题 {#支持的问题}

- 单选或多选：每题 2–7 个选项，可限制最少和最多选择数量。
- 文字回答：每题一段文字，最长 4000 字符，可设为可选。
- 多步提问：每次调用 1–3 题，最后提交一次答案。

完整插件已经包含以下交互，无需另写问卷：

| 能力 | 当前行为 |
| --- | --- |
| 多步作答 | 显示当前题号和进度，支持返回上一题修改；最后一题统一提交答案。 |
| 提交等待 | 提交期间显示等待状态，防止重复提交。 |
| 已回答回执 | 有有效的 `result.answers` 时显示原答案，不再提供提交入口。 |
| 只读展示 | 当前调用不能回答时展示问题，不开放新的提交操作。 |
| 历史回显 | 历史恢复原始问题参数与工具结果后，展示对应问题和已保存的答案。 |

完整插件沿用 Runtime 的工具结果提交与续答流程；[提交状态与历史展示](#提交状态与历史展示)说明其条件。需要在自己的业务卡片中单独使用选项或问卷部件，见[独立复用问卷组件](#独立复用问卷组件)。

## 修改与启用

<span id="添加到项目"></span>

### 外观与交互定制 {#外观与交互定制}

先编辑项目内 `plugins/ask-user-question/index.tsx` 的项目组件入口，组合公开的 `AskUserQuestionPlugin`，保留工具调用数据和提交答案的方法。需要完全替换问卷 UI 时，可以在本地定义中替换 `ask_user_question.render`，复用公开的参数与答案校验。

插件 ID 是 `ask-user-question`，工具名是 `ask_user_question`，两者用途不同。同一个工具名只能注册一次，自定义展示时直接修改该插件的工具注册。

[前端工具接入](/development/frontend-tools) · [返回插件总览](/plugins/)

## 数据来源与显示条件

插件注册前端 `human` 工具 `ask_user_question`，用户回答后通过 `addResult()` 提交工具结果并请求续答，不要求后端使用 interrupt。具体事件和续答要求见[Agent 服务接入](#agent-服务接入)。

### 提交状态与历史展示 {#提交状态与历史展示}

完整插件同时满足以下条件才允许作答：没有已有结果、`status.type === 'requires-action'`、当前 Runtime 允许回答工具，且存在 `addResult()`。参数或已有结果不能通过校验时，显示统一语言层中的不可用提示。

用户完成最后一题后，插件调用 `addResult({ answers })`，由现有 Runtime 回传工具结果并请求 Agent 续答。

- `addResult()` 的公开返回类型为 `void`，不能作为可等待的业务 HTTP 保存回执；持久化和续答结果仍按原会话流程处理。
- 完整插件没有独立的 `onSubmit` 或 `onComplete` 属性。
- 需要接自己的异步保存方法时，使用下方独立组件，或在现有工具 renderer 中实现业务流程。

底层问卷组件的提交回调支持 Promise：等待期间限制重复提交，回调抛错或 Promise 被拒绝后允许重试。这个能力不表示后端续答发生的所有错误都能通过原生 `addResult()` 变成 Promise 拒绝。

刷新后显示历史答案，需要业务历史保存并恢复：

- 原始 `ask_user_question` 工具调用参数，包括题目、选项和稳定 ID。
- 相同的 `toolCallId`、工具名及其关联结果 `{ "answers": { "题目ID": ["答案"] } }`。

历史格式与字段转换沿用[历史会话服务](/development/history-backend)，不能只保存最终回复文字。恢复有效结果后，插件显示只读回执，不会因查看历史再次提交答案。没有已保存结果且当前不能回答时，只展示问题；恢复未完成调用的可回答状态需要 Agent 服务和 Runtime 配合。

当前题号和未提交答案保存在组件内存中，刷新或卸载后不保证恢复；已有答案回显与未提交草稿恢复是两个不同需求。

<figure className="plugin-preview">

![问答提交后显示已选答案和后续回复](/images/guide/mock-question-complete.png)

<figcaption>本地 Mock 示例：提交后，选项变为“✓ 数据总览”的只读回执，Agent 在下方继续回复；这里不再显示提交按钮。</figcaption>
</figure>

### 显示条件与数据来源 {#显示条件与数据来源}

**数据来源：**只在工具 `ask_user_question` 发起提问时显示，参数和答案见[Agent 服务接入](#agent-服务接入)。一次提问需要的事件如下，以 `RUN_FINISHED` 的成功 outcome 结束本轮，等待用户提交工具结果并通过后续请求续答；此时服务端不预先发送 `TOOL_CALL_RESULT`：

```jsonl
{"type":"TOOL_CALL_START","toolCallId":"call-1","toolCallName":"ask_user_question"}
{"type":"TOOL_CALL_ARGS","toolCallId":"call-1","delta":"{\"steps\":[{\"id\":\"layout\",\"question\":\"你希望采用哪种首页布局？\",\"selectionMode\":\"single\",\"minSelections\":1,\"maxSelections\":1,\"options\":[{\"id\":\"dashboard\",\"label\":\"数据总览\"},{\"id\":\"sidebar\",\"label\":\"侧边导航\"}]}]}"}
{"type":"TOOL_CALL_END","toolCallId":"call-1"}
{"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1","outcome":{"type":"success"}}
```

`RUN_FINISHED` 使用当前请求的 `threadId`、`runId`；这条结束事件用于交还控制，等待用户回答。

事件逐条包装成 SSE，见[共用格式](./ag-ui-data#共用的-sse-格式)。问题卡片使用 human 工具结果提交，与 `outcome.type: "interrupt"` 的后端审批是两条接入路径。

### Agent 服务接入 {#agent-服务接入}

工具名是 `ask_user_question`，通过 AG-UI 的 `TOOL_CALL_START`、`TOOL_CALL_ARGS`、`TOOL_CALL_END` 传递调用与参数。前端注册的是 `human` 工具，等待用户回答后提交工具结果。

例如，工具参数为：

```json ag-ui
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

```json ag-ui
{ "answers": { "layout": ["dashboard"] } }
```

答案以题目 ID 为键、字符串数组为值；文字题也使用数组，`options` 必须为空，`maxSelections` 为 `1`。题目 ID 和选项 ID 是协议标识，显示文案由 Agent 提供。

后端需要接受当前工具调用的结果，并按会话续答协议继续执行。内置 Mock 演示的是结束本轮工具调用后，将答案作为 ToolMessage 随后续请求发送；不要在后端一直等待前端关闭不了的流。仅启用插件或返回相似 JSON，不能代替后端的工具调用和续答接入。

React 接入可从 `@za38.03/agent-ui-plugins/ask-user-question` 导入 `askUserQuestionParameters`、`parseHumanQuestionRequest`、`parseHumanQuestionResult` 和对应类型。后端应按相同协议校验答案。

## 常见定制

<span id="常见需求"></span>

<span id="代码示例"></span>

### 完整问答卡片的外观 {#完整问答卡片的外观}

<span id="example-1"></span>


保留工具参数、addResult 与可回答状态，沿用完整插件的提交和历史回显行为。

```tsx
import type { ComponentProps } from 'react';
import { CanonicalAskUserQuestion } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof CanonicalAskUserQuestion>) {
  return <CanonicalAskUserQuestion {...props}
    style={{ ...props.style, maxWidth: 560, padding: 16 }} />;
}
```

<span id="example-2"></span>

### 只读回显业务问卷 {#只读回显业务问卷}

choice 传入保存的答案后展示回执，不提供新的提交入口。steps 和 choice 由调用方提供；文字题仍使用完整插件。

```tsx
import type { ComponentProps } from 'react';
import { ConversationQuestionFlow } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationQuestionFlow>) {
  return <ConversationQuestionFlow {...props}
    choice={props.choice ?? {}} />;
}
```

### 问卷校验与回执 {#hook}

自定义问卷放在现有工具 renderer 内时，`useConversationCanAnswerToolCall(): boolean` 从 Plugins 根入口读取当前 Thread 是否允许回答。还需同时检查原 props 的 `status.type === 'requires-action'`、结果未提交，以及 `addResult` 存在；历史卡片不能仅凭该布尔值开放提交。

需要从业务数据恢复问卷回执时，先验证请求，再按该请求验证答案：

```tsx
import {
  parseHumanQuestionRequest, parseHumanQuestionResult,
} from '@za38.03/agent-ui-plugins';

export function readQuestionReceipt(args: unknown, result: unknown) {
  const request = parseHumanQuestionRequest(args);
  if (!request) return undefined;
  const receipt = parseHumanQuestionResult(result, request);
  if (!receipt) return undefined;
  return { steps: request.steps, answers: receipt.answers };
}
```

`args` / `result` 来自当前工具或保存的历史；合法时返回题目和按题目 ID 组织的答案，无效时返回 `undefined`，交给项目显示无法还原的状态。`parseHumanQuestionResult` 同时接受结果对象和 JSON 字符串，并检查答案数量及选项 ID。解析器只做校验，不发送回答；实际提交继续使用原工具的 `addResult()`。

### 单题选择 {#单题选项conversationoptionlist}

自己的工具卡片需要收集选项时，可从 `@za38.03/agent-ui-plugins` 导入以下部件。它们只处理问卷展示与回调，不会自行注册 `ask_user_question`、发起 AG-UI 请求或保存业务历史。放在现有 Agent UI 的主题、语言和样式环境中使用，沿用项目已导入的 Plugins CSS。


回调成功后，组件显示本次选择的回执。失败提示会显示回调抛出的错误信息，项目应先转换为统一语言层中的业务文案。需要从已保存答案直接恢复回执时，使用下方 `ConversationQuestionFlow.choice`；公开的 `ConversationOptionListProps` 没有 `choice` 属性。

```tsx
import { ConversationOptionList, type ConversationOption } from '@za38.03/agent-ui-plugins';

export function SingleQuestion({ options, save }: {
  options: readonly ConversationOption[];
  save: (ids: string[]) => Promise<void>;
}) {
  return <ConversationOptionList options={options} onConfirm={save} />;
}
```

### 多步问卷 {#多步选项conversationquestionflow}


此独立组件只支持 `single` / `multiple`。文字题和混合题型继续使用完整的 `CanonicalAskUserQuestion`。在原工具调用中复用组件时，保留前文的 1–3 题、选项数量等协议约束，并使用公开解析器校验工具参数与结果。

回调成功后，调用方需要更新 `choice`，组件才会结束最终提交等待并进入回执。示例接收项目自己的异步保存方法，保存成功后在本地显示回执；传入历史 `choice` 或 `readOnly` 时关闭提交入口：

```tsx
import { useState } from 'react';
import {
  ConversationQuestionFlow,
  useLocale,
  type ConversationQuestionStep,
} from '@za38.03/agent-ui-plugins';

type Answers = Record<string, string[]>;
interface BusinessQuestionnaireProps {
  steps: readonly ConversationQuestionStep[];
  choice?: Readonly<Record<string, readonly string[]>>;
  readOnly?: boolean;
  onSubmit?: (answers: Answers) => Promise<void>;
}

export function BusinessQuestionnaire({
  steps, choice, readOnly = false, onSubmit,
}: BusinessQuestionnaireProps) {
  const messages = useLocale('humanQuestion');
  const [receipt, setReceipt] = useState<Answers>();

  return <ConversationQuestionFlow
    steps={steps}
    choice={choice ?? receipt}
    onComplete={readOnly || !onSubmit ? undefined : async answers => {
      try {
        await onSubmit(answers);
        setReceipt(answers);
      } catch {
        throw new Error(messages.unavailable);
      }
    }}
  />;
}
```

`onSubmit` 由项目提供，负责实际业务请求；示例中的本地 `receipt` 不代替后端持久化。重新打开时，把保存的答案传回 `choice`。展示另一份问卷时，以工具调用 ID 或业务问卷 ID 作为组件的 React `key`，避免沿用上一份问卷的步骤和本地回执。

若仍在同一个 `ask_user_question` 工具调用内收集答案，沿用原有 `addResult()` 与可回答状态判断，保持该工具只注册一次。直接复用完整插件即可获得其原有提交、混合题型和历史展示行为，无需接管源码。

## 属性与 API

<span id="属性"></span>

<span id="开发-api"></span>

### API



在 `CanonicalAskUserQuestion` 上设置以下属性。

工具数据由原 renderer 提供。样式设置在当前组件的 `className` / `style`；需要调整无障碍名称时使用 `aria-label`。

`locales.humanQuestion` 的字段均为 `string`：

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

#### 当前工具调用的数据与操作

完整问答组件直接接收现有 renderer 的 `args`、`result`、`status`、`toolCallId` 和 `addResult`。`args` 描述题目，`result` 用于历史回执；只有当前调用允许回答、仍在等待操作且尚未提交时才开放 `addResult()`。实际判断见[提交状态与历史展示](#提交状态与历史展示)和[前端工具提交示例](/development/frontend-tools#2-在组件中提交结果)。

公共字段、状态判断和操作回调见[工具调用参数](./tool-result#当前工具调用的数据与操作)。

<span id="独立复用问卷组件"></span>


#### ConversationOptionList

| 属性 | 类型 | 用途 |
| --- | --- | --- |
| `options` | `readonly ConversationOption[]` | 必填；每项包含 `id`、`label`，可选 `description`、`disabled`。 |
| `selectionMode?` | `'single' \| 'multiple'` | 默认 `single`；单选点击即提交，多选点击确认按钮后提交。 |
| `defaultValue?` | `readonly string[]` | 初始化时的选中 ID，不是受控答案或历史回执属性。 |
| `minSelections?` / `maxSelections?` | `number` | 多选数量限制；默认最少 1 项，最多为选项数量。 |
| `onConfirm?` | `(ids: string[]) => void \| Promise<void>` | 提交选中 ID；省略时只展示选项。等待 Promise 期间禁止重复提交，拒绝后重新开放操作。 |

#### ConversationQuestionFlow

| 属性 | 类型 | 用途 |
| --- | --- | --- |
| `steps` | `readonly ConversationQuestionStep[]` | 必填；每题包含 `id`、`question`、`options`、`selectionMode`、`minSelections`、`maxSelections`，可选 `description`。 |
| `choice?` | `Readonly<Record<string, readonly string[]>>` | 已保存答案；传入后直接展示只读回执。 |
| `onComplete?` | `(answers: Record<string, string[]>) => void \| Promise<void>` | 全部题目完成后调用；没有 `choice` 且省略回调时，只读展示问题。 |

## 常见问题

<details className="plugin-faq" id="为什么单独传-submittext-或-labels-没有效果">
<summary>为什么单独传 submitText 或 labels 没有效果？</summary>

完整插件的按钮文案使用 locales.humanQuestion，没有这两个展示属性。独立复用问卷时也沿用统一语言层。

</details>
