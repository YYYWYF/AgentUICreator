# 文档检索片段（retrieval-chunks）

## 功能与效果


![文档检索完成后的片段](/images/plugins/behavior/retrieval-finished.jpg)

检索完成后显示 1 个片段；卡片同时保留文档来源、页码、正文与 0.91 的相关度。

将文档检索工具的查询和命中片段展示在回答中，自动切换检索中与结果状态，并显示来源、定位和相关度。

### 检索过程中显示查询

工具运行时，插件从调用参数读取查询词并显示检索中的状态。此时可以尚无结果，无需业务代码自行维护加载状态或构造占位片段。


![文档检索正在进行](/images/plugins/behavior/retrieval-running.jpg)

结果返回前保留查询词和“正在检索”提示，此时还没有片段卡片。

### 检索完成后展示命中片段

成功结果中的每个片段展示来源名称、页码或章节等定位提示、相关度数值和正文摘要。默认展示全部已接收片段，并在摘要中显示实际片段数量。

相关度会以数值和进度条表达；插件按服务返回的顺序展示，不会自行重新检索或按分数筛掉结果。正文较长时默认以摘要方式呈现。

### 空结果与异常结果

成功返回空 `chunks` 数组时显示零条结果，表示检索已结束且没有命中。工具报错、等待用户操作、处于未完成状态，或结束后的片段数据无效时，插件回到通用工具详情。

片段中的来源名称和定位文字用于阅读与业务定位，不会自动变成可点击的文件地址。

## 数据来源与显示条件

### 接入文档检索结果 \{#显示条件与数据来源}

当前默认注册工具名为 `search_docs`。参数的 `query` 显示查询内容，结果从 `chunks` 数组读取。以下按顺序列出本插件需要的事件；通用运行事件和 SSE 包装见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```jsonl
{"type":"TOOL_CALL_START","toolCallId":"call-1","toolCallName":"search_docs"}
{"type":"TOOL_CALL_ARGS","toolCallId":"call-1","delta":"{\"query\":\"退款期限\"}"}
{"type":"TOOL_CALL_END","toolCallId":"call-1"}
{"type":"TOOL_CALL_RESULT","messageId":"result-1","toolCallId":"call-1","role":"tool","content":"{\"chunks\":[{\"id\":\"chunk-1\",\"source\":\"退款政策.pdf\",\"locator\":\"第 14 页\",\"score\":0.91,\"text\":\"退款申请需在 30 天内提交。\"}]}"}
```

- **片段字段**：每项需要字符串 `id`、`source`、`locator`、`text`，以及有限数值 `score`。
- **运行中**：可显示检索状态。
- **完成后**：需要有效的 `chunks` 数组；空数组表示无结果。
- **回退条件**：错误、等待操作、未完成或结果无效时，显示工具详情。

该结果结构属于 `search_docs`，与 `CUSTOM CONTEXT_CONTENT` 的上下文展示路径不同。


`renderRetrieval(view, tool)` 提供查询词、片段集合和检索状态；片段包含来源、定位、相关度和正文。可据此打开对应文档、展示业务明细，或将用户选中的片段交给其他插件，见[插件联动与取数](/development/plugin-interaction.md)。

## 常见定制





### 限制片段展示数量 \{#展示前-4-个检索片段}


在已有检索插件入口只展示前 4 个片段，并为长列表设置滚动区域：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { RetrievalChunksPlugin as Implementation } from '@za38.03/agent-ui-plugins/retrieval-chunks';

export function RetrievalChunksPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    visibleCount={4}
    style={{ ...props.style, maxHeight: 320, overflow: 'auto' }} />;
}
```

这不会改变服务端检索数量或结果总数摘要，也不会为隐藏片段自动增加分页入口。

### 为结果增加业务容器 \{#使用自定义列表容器}


需要放入项目自己的列表区域时，继续复用默认检索展示，可保留检索状态、来源、分数和正文：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { RetrievalChunksPlugin as Implementation } from '@za38.03/agent-ui-plugins/retrieval-chunks';
import { RetrievalChunks } from '@za38.03/agent-ui-plugins';

export function RetrievalChunksPlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    renderRetrieval={retrieval => <section className="project-retrieval"><RetrievalChunks {...retrieval} /></section>} />;
}
```

完全替换 `renderRetrieval` 时，查询、加载状态、数量和各片段的展示也由新内容负责；错误和无效结果的回退仍在插件中处理。

## 属性与 API



### API

以下选项用于定制已有工具展示。当前工具的参数、结果和运行状态由原入口提供，正常使用无需重新构造它们。

| 属性                 | 类型                                                                            | 省略时 / 用途                    |
| ------------------ | ----------------------------------------------------------------------------- | --------------------------- |
| `visibleCount?`    | `number`                                                                      | 默认展示全部片段                    |
| `renderRetrieval?` | `(props: RetrievalChunksProps, tool: ConversationToolCallProps) => ReactNode` | 自定义整个检索组件                   |
| `Fallback?`        | `ComponentType<ConversationToolCallProps>`                                    | 默认 `ConversationToolResult` |

原始工具数据仍先经过校验，再应用自定义展示属性。

#### 当前工具调用的数据与操作

`renderRetrieval(view, tool)` 提供已解析的检索内容和当前工具调用。点击片段时使用 `view.chunks` 中的来源与定位信息，业务记录可关联 `tool.toolCallId`；不要从卡片 DOM 反查片段。

公共字段、状态判断和操作回调见[工具调用参数](/plugins/tool-result.md#当前工具调用的数据与操作)。

#### 将片段关联到业务文档 \{#retrievalchunk}

`renderRetrieval(view, tool)` 中的 `view.chunks` 是已解析的片段数组，每项都包含：

| 字段        | 类型       | 在业务操作中怎样用                |
| --------- | -------- | ------------------------ |
| `id`      | `string` | 作为片段稳定标识，关联收藏或选择         |
| `source`  | `string` | 来源名称，交给业务文档映射而不是直接当成 URL |
| `locator` | `string` | 页码、章节等定位提示，打开文档时传给项目定位方法 |
| `score`   | `number` | 检索相关度；含义由检索服务决定，不表示业务可信度 |
| `text`    | `string` | 正文，可预览、复制或交给引用动作         |

例如 `{ id: 'chunk-7', source: '请假制度', locator: '第 3 页', score: 0.91, text: '年度假期规则…' }` 可用于“查看原文”按钮；服务需要文档 ID 时，应在项目的业务映射中补齐，不能从来源名称推断文件地址。

检索状态与评分文案统一在 `locales.searchTools` 修改：`retrieving`、`passages`、`relevance`、`score`。检索内容仍是工具数据。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。


