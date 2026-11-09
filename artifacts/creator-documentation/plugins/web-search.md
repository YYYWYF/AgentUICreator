# 网页搜索结果（web-search）

结果显示可用的网页标题、摘要和来源，用户可以选择结果并打开原网页。搜索本身由 Agent 或业务搜索服务执行。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![查看网页搜索结果（web-search）界面示例](/images/plugins/web-search.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable web-search`，点击下图中的 **「查看网页搜索结果」**。

![Creator 启用菜单：点击「查看网页搜索结果」，插件 ID 为 web-search](/images/plugins/enable/web-search.jpg)

搜索结果使用 `title` 和 `domain`；提供完整的 HTTP(S) `url` 时，标题可打开原网页，提供 `snippet` 时显示摘要。只有标题和域名的旧格式仍可展示；缺少或不支持的链接不会变成可点击入口。

## 显示条件与数据来源

**Agent 服务接入：**&#x5F53;前默认注册工具名为 `web_search`。参数的 `query` 显示查询内容，结果从 `results` 数组读取。以下事件按顺序发送；完整 SSE 包装和运行开始、结束事件见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```json
[
  {
    "type": "TOOL_CALL_START",
    "toolCallId": "call-1",
    "toolCallName": "web_search"
  },
  {
    "type": "TOOL_CALL_ARGS",
    "toolCallId": "call-1",
    "delta": "{\"query\":\"Agent UI 文档\"}"
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
    "content": "{\"results\":[{\"title\":\"文档首页\",\"domain\":\"example.com\",\"url\":\"https://example.com/docs\",\"snippet\":\"接入与开发说明。\"}]}"
  }
]
```

每项需要字符串 `title`、`domain`，`url`、`snippet` 是可选字符串。调用运行中可显示搜索状态；完成后必须返回有效的 `results` 数组，空数组表示无结果。错误、等待操作、未完成或结果无效时回退工具详情。实际搜索由服务端执行，启用插件不会发起搜索。

## 定制选项

| 可以改什么    | 效果                |
| -------- | ----------------- |
| 一次显示几个结果 | 限制卡片中同时展示的网页数量。   |
| 搜索提示     | 修改搜索中、已找到结果等提示文字。 |
| 卡片样式     | 调整宽度、间距、字号和背景。    |
| 整个结果列表   | 自定义网页标题、摘要和来源的排列。 |

## 需求示例

```text
请修改「查看网页搜索结果（web-search）」：
修改：同时展示【5】条搜索结果，卡片间距设为【12px】，标题字号设为【14px】。
保留：真实网页标题、摘要和链接。
```

## 属性

打开项目中的 `plugins/web-search/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalWebSearch`；类型：`WebSearchPluginProps`。还接受下方列出的工具调用数据、样式和无障碍属性。

| 属性                | 类型                                                                      | 省略时 / 用途                                        |
| ----------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
| `query?`          | `string`                                                                | 默认工具输入中的 `query`，没有时为空字符串                       |
| `results?`        | [`readonly WebSearchResult[]`](#websearchresult)                        | 默认从工具结果读取                                       |
| `searching?`      | `boolean`                                                               | 默认按工具是否正在运行推导                                   |
| `visibleResults?` | `number`                                                                | 默认展示全部结果                                        |
| `cycle?`          | `number`                                                                | 默认 `0`，参与结果项的 React key；可用于新一轮展示时重建结果项，不是自动轮播时间 |
| `renderSearch?`   | `(props: WebSearchProps, tool: ConversationToolCallProps) => ReactNode` | 自定义整个搜索组件                                       |
| `Fallback?`       | `ComponentType<ConversationToolCallProps>`                              | 默认 `ConversationToolFallback`                   |

原始工具数据仍先经过校验，再应用自定义展示属性。

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

#### WebSearchResult

一条网页搜索结果。

```ts
interface WebSearchResult {
  title: string; // 网页标题
  domain: string; // 来源域名
  url?: string; // 网页链接
  snippet?: string; // 结果摘要
}
```

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
import type { CanonicalWebSearch } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalWebSearch>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。

搜索状态文案统一在 `locales.searchTools` 修改：`searching`、`sources`。搜索结果标题和摘要仍是工具数据。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。
