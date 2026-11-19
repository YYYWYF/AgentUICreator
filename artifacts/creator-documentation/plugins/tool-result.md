# 工具结果（tool-result）


![多模态工具结果界面](/images/plugins/tool-result.png)

同一次工具结果中的多种内容按类型展示，文字、媒体和文件各自使用对应的呈现方式。

将工具返回的文字、图片、音频、视频和文档按类型展示，并保留当前工具原有的状态、详情与操作入口。

## 同一结果中展示多种内容

当结果符合内容片段数组格式时，插件按顺序展示各个片段：文字保留换行，图片使用图片展示，音视频使用播放器，文档使用文件展示。无需业务代码逐项判断媒体类型再拼接卡片。

普通对象、字符串或不符合该格式的结果继续使用通用工具详情，不会被强行识别为多模态内容。

## 保留工具详情和待处理操作

默认在结果之外保留原有工具详情，参数、错误、审批和中断操作沿用当前工具调用。多模态内容单独展示，避免在详情中再重复输出一份相同结果。

仅改变结果片段样式时，不需要另外实现一套审批或工具续答流程。

## 解析媒体与文件引用

HTTP(S)、Blob 地址和有效的 Base64 数据可用于相应媒体展示。文件引用则由项目提供的解析方法转换为可访问地址，解析期间显示加载提示。

引用变化或展示卸载时，插件会取消旧解析，并避免迟到结果覆盖当前内容。解析失败、地址或媒体类型不适合展示时显示不可用提示，保留可用的文件名和文件标识。

## 接入多模态工具结果 \{#显示条件与数据来源}

结果通过当前工具的 `TOOL_CALL_RESULT` 返回。下面展示文字与图片片段的组合，省略外层运行事件：

```jsonl
{"type":"TOOL_CALL_START","toolCallId":"call-1","toolCallName":"render_report"}
{"type":"TOOL_CALL_ARGS","toolCallId":"call-1","delta":"{}"}
{"type":"TOOL_CALL_END","toolCallId":"call-1"}
{"type":"TOOL_CALL_RESULT","messageId":"result-1","toolCallId":"call-1","role":"tool","content":"[{\"type\":\"text\",\"text\":\"报告图已生成\"},{\"type\":\"image\",\"source\":{\"type\":\"url\",\"value\":\"https://example.com/report.png\",\"mimeType\":\"image/png\"}}]"}
```

片段与来源格式见末尾[结果数据参考](#toolresultpart)。`render_report` 是示例业务工具名；没有同名专用展示时才使用这个通用结果插件。

仅发送图片 URL 或插件 ID 不会创建多模态工具结果。

本插件与 `tool-fallback` 使用同一语义位置；有同名专用 Tool UI 时，专用展示优先。

审批区默认可用，支持两种事件格式：

- [旧版 CUSTOM `ON_INTERRUPT`](/plugins/tool-fallback.md#旧版格式custom-on_interrupt)。
- [新版 `RUN_FINISHED` interrupt](/plugins/tool-fallback.md#新版格式run_finished-interrupt)。

两者读取相同的 `action_requests`、`review_configs`，显示「允许」「拒绝」按钮。审批要求由事件表达，不放在媒体内容中。

Mock 中的 `approval-legacy` 和 `approval-resume` 分别演示两种格式；新建项目无需另启用审批插件。若同一轮收到两种格式，只显示一组审批按钮，并通过新版 `resume[]` 提交。完整事件结构和回传字段见[审批数据接入](/plugins/tool-fallback.md#显示条件与数据来源)。

## 展开工具详情查看参数 \{#在工具详情中展开结果}


希望同时查看参数与结果时，在已有工具结果入口设置初始展开：

```tsx
import type { ComponentProps } from 'react';
import { ConversationToolResultPlugin as Implementation } from '@za38.03/agent-ui-plugins/tool-result';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';

export function ConversationToolResultPlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== 'conversation.tool-fallback') return null;
  return <Implementation {...scope.value} {...props}
    defaultExpanded />;
}
```

这只改变详情的初始展开状态，结果类型识别和工具原有操作继续保留。

## 为每个结果片段增加容器


`renderPart` 同时提供片段数据和默认展示。只增加布局时复用 `defaultContent`，继续使用已有媒体解析和播放器：

```tsx
import type { ComponentProps } from 'react';
import { ConversationToolResultPlugin as Implementation } from '@za38.03/agent-ui-plugins/tool-result';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';

export function ConversationToolResultPlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== 'conversation.tool-fallback') return null;
  return <Implementation {...scope.value} {...props}
    renderPart={(_part, _index, defaultContent) => <section className="project-result-part">{defaultContent}</section>} />;
}
```

`resultOnly` 用于已有外层工具或任务卡片负责状态和操作的场景。设为 `true` 会省略整个工具详情与审批界面，只保留结果；普通工具结果入口无需开启它。

## API

以下选项用于定制已有工具展示。当前工具的参数、结果和运行状态由原入口提供，正常使用无需重新构造它们。



项目应用层的 `plugins/tool-result/index.tsx` 引用公开的 `ConversationToolResultPlugin`，继续传入已有的 `tool` 数据并保留子插件渲染调用，通过 React 属性定制展示，无需接管官方源码。

插件入口：`ConversationToolResultPlugin`；展示组件：`ConversationToolResult`；类型：`ConversationToolResultProps`。入口接收下表属性及下列 `ToolFallbackPresentationProps`，包括基础外观属性。

| 属性             | 类型                                                                                                                                          | 省略时 / 用途                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `tool?`        | `ConversationToolResultProps`                                                                                                               | 插件入口工具上下文，缺少时不渲染；独立展示组件直接接收工具上下文                 |
| `resultOnly?`  | `boolean`                                                                                                                                   | 默认不启用；设为 `true` 直接展示结果内容，省略整个工具详情／审批界面，与是否已有结果无关 |
| `resolveFile?` | [`(source: Extract<ToolResultSource, { type: 'file' }>, options: { signal: AbortSignal }) => string \| Promise<string>`](#toolresultsource) | 将文件引用解析为可呈现 URL，支持取消                             |
| `renderPart?`  | [`(part: ToolResultPart, index: number, defaultContent: ReactNode) => ReactNode`](#toolresultpart)                                          | 自定义每个结果片段，可复用默认内容                                |

结果读取与展示按以下规则处理：

- **数据入口**：使用 `tool.result` 或展示组件的 `result`，不向插件入口另传一份结果。
- **多模态片段数组**：外层分别显示工具详情和结果，内部覆盖 `renderResult` 避免重复；使用 `renderPart` 定制内容。
- **其他结果**：使用默认工具结果回退，不调用 `renderPart`。

`resultOnly` 会省略整个工具卡片，包括审批区；使用时保留业务所需的交互入口。

独立内容组件 `ConversationToolResultContent` 接受 `ToolResultContentProps`：必需的 `result: unknown`，以及同上 `resolveFile?`、`renderPart?`。

文件来源未提供 `resolveFile` 时显示不可用提示；工具结果整体还支持默认文本／结构化回退。

### 工具卡片展示属性

除上表的结果属性外，还接受以下展示属性。

| 属性                  | 类型                                                                                                                                | 省略时 / 用途                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `expanded?`         | `boolean`                                                                                                                         | 受控展开                                      |
| `defaultExpanded?`  | `boolean`                                                                                                                         | 默认按是否等待操作决定；等待操作时初始展开                     |
| `onExpandedChange?` | `(expanded: boolean) => void`                                                                                                     | 展开变化通知                                    |
| `buttonProps?`      | `Omit<ComponentProps<typeof ConversationToolFallback.Trigger>, 'toolName' \| 'status' \| 'responseDeliveryStatus' \| 'children'>` | 标题按钮的样式、无障碍属性与事件；工具名和运行状态仍由当前调用提供         |
| `contentProps?`     | `Omit<ComponentProps<typeof ConversationToolFallback.Content>, 'children'>`                                                       | 折叠内容容器，可设置 `style.maxHeight` / `overflow` |
| `argsProps?`        | `Omit<ComponentProps<typeof ConversationToolFallback.Args>, 'argsText' \| 'children'>`                                            | 参数区容器样式；不会替换真实输入参数，改内容需自定义组合              |
| `resultProps?`      | `Omit<ComponentProps<typeof ConversationToolFallback.Result>, 'result' \| 'children'>`                                            | 结果区容器样式；替换内容用 `renderResult(result)`      |
| `renderResult?`     | `(result: unknown) => ReactNode`                                                                                                  | 替换默认结果内容                                  |
| `errorProps?`       | `Omit<ComponentProps<typeof ConversationToolFallback.Error>, 'status' \| 'children'>`                                             | 错误区容器样式；错误状态仍由当前调用提供                      |
| `approvalProps?`    | `Omit<ComponentPropsWithoutRef<'div'>, 'children'>`                                                                               | 审批区外观和无障碍属性                               |
| `renderDetails?`    | `(defaultDetails: ReactNode) => ReactNode`                                                                                        | 定制详情区域；复用默认节点可保留审批、错误与结果                  |

### 当前工具调用的数据与操作

插件入口接收完整的 `tool` 对象；单独使用 `ConversationToolResult` 时直接展开当前工具 props。`result` 提供待展示内容，`toolCallId` 用于业务关联；保留原 `approval`、`respondToApproval`、`interrupt`、`resume` 等交互字段。设置 `resultOnly` 会连同审批区一起省略，不能据此判断工具是否已完成。

公共字段、状态判断和操作回调见[工具调用参数](/plugins/tool-fallback.md#当前工具调用的数据与操作)。

### 保留审批和中断操作

改变结果外观时，继续将现有 `tool` 传给完整组件。它会使用原调用的 `approval` / `respondToApproval` 处理原生审批，使用 `interrupt` / `resume` 处理暂停后的恢复，使用 `responseDeliveryStatus` 保留传输状态。

这些对象的结构由当前运行时提供，不由展示参数重新创建。通常只需转发原 props；更改结果内容时，使用 `renderPart` 或[工具详情的 `renderResult` 示例](/plugins/tool-fallback.md#自定义工具内容顺序)，保留完整卡片处理原有交互。

### 文件名和提示文案

文件名可通过内容块的 `metadata.filename` 提供。这是展示约定，不影响 AG-UI 的字段和消息结构。新文案使用 Agent UI 的统一 locale；文件无法解析时显示可本地化的状态提示。

### 从结果片段决定渲染和文件解析 \{#toolresultpart}

`renderPart(part, index, defaultContent)` 收到已识别的片段，`index` 对应原数组位置。文本片段用 `{ type: 'text', text: string }`；图片、音频、视频和文档用 `{ type: 'image' | 'audio' | 'video' | 'document', source }`。每项可带 `id` 和 `metadata`，例如 `metadata.filename` 可提供文件名。

```json
[
  { "type": "text", "text": "报告已生成" },
  { "type": "document", "source": { "type": "file", "value": "report-42", "mimeType": "application/pdf" }, "metadata": { "filename": "月报.pdf" } }
]
```


媒体的 `source` 决定怎样取得内容：

| `source.type` | `value` 与其他字段                                   | 项目需要做什么                                                      |
| ------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| `url`         | `value: string` 是 URL；可选 `mimeType`             | 提供当前用户可访问的地址；原内容组件负责显示                                       |
| `data`        | `value: string` 是 Base64；必需 `mimeType: string`  | 按实际媒体格式填写 MIME；不是文件 ID                                       |
| `file`        | `value: string` 是文件 ID；可选 `provider`、`mimeType` | 实现 `resolveFile(source, { signal })`，异步返回可展示 URL，向业务请求透传取消信号 |

上例的 `report-42` 必须经过 `resolveFile`，不能直接当作 `href`。自定义 `renderPart` 可以保留 `defaultContent` 再追加业务入口；返回自己的完整内容时，其样式和操作由项目负责。不是有效片段数组的结果继续使用默认回退，不会触发该回调。









为什么设置 resultOnly 后看不到确认按钮？

这个属性直接绕过工具详情展示，包括审批界面。仍需用户确认的工具应保留默认模式，或在项目组合中显式提供确认入口。
