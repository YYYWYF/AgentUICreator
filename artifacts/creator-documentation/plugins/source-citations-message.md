# 引用来源（source-citations-message）

## 功能与效果


![引用来源界面](/images/plugins/source-citations-message.png)

左侧是可打开的网页来源，右侧是文档来源；两类资料保留各自的展示方式。

将来源工具的成功结果展示为引用来源列表，自动区分网页和文档来源，并保留来源的真实标识。

### 成功检索后显示来源

来源工具完成且结果有效时，插件读取 `sources` 数组，按返回顺序展示来源条目。业务代码无需再次解析工具结果或逐个判断它们何时可以显示。

工具尚未完成、报错或来源结构无效时，继续展示通用工具详情；空来源数组不会凭空产生来源条目。

### 网页与文档分别展示

网页来源使用标题或 URL 展示，并提供网页入口。文档来源使用文档标题、类型和可用的文件名展示；文档 ID 不是一个网页下载地址。

需要为文档增加业务预览时，可以在来源展示回调中按 ID 接入项目已有入口。默认插件不会根据 ID 猜测业务文档的访问路径。

## 数据来源与显示条件

### 保持来源数据完整

来源 ID 必须非空且在同一列表中唯一；网页来源需要有效 HTTP(S) 地址，文档来源需要标题和 MIME 类型。来源列表中存在无效条目时，插件保留工具详情，而不是展示一组缺损来源。

### 接入来源结果 \{#显示条件与数据来源}

当前默认注册工具名为 `search_sources`，从工具结果的 `sources` 数组显示来源。以下按顺序列出本插件需要的事件；通用运行事件和 SSE 包装见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```jsonl
{"type":"TOOL_CALL_START","toolCallId":"call-1","toolCallName":"search_sources"}
{"type":"TOOL_CALL_ARGS","toolCallId":"call-1","delta":"{\"query\":\"退款政策\"}"}
{"type":"TOOL_CALL_END","toolCallId":"call-1"}
{"type":"TOOL_CALL_RESULT","messageId":"result-1","toolCallId":"call-1","role":"tool","content":"{\"sources\":[{\"sourceType\":\"url\",\"id\":\"policy-web\",\"url\":\"https://example.com/policy\",\"title\":\"退款政策\"},{\"sourceType\":\"document\",\"id\":\"policy-doc\",\"title\":\"内部政策\",\"mediaType\":\"application/pdf\",\"filename\":\"政策.pdf\"}]}"}
```

每个来源都需要唯一且非空的 `id`。按来源类型填写其他字段：

| 来源类型                     | 必需字段                   | 可选字段                |
| ------------------------ | ---------------------- | ------------------- |
| `sourceType: "url"`      | 有效 HTTP(S) `url`       | `title`，提供时不能为空。    |
| `sourceType: "document"` | 非空 `title`、`mediaType` | `filename`，提供时不能为空。 |

文档来源描述引用资料，不自动提供下载地址。

仅工具已完成、非错误且整个结果有效时展示来源，否则回退工具详情。`sources` 是工具业务结构，与附件的 `document.source` 含义不同。


`renderSource(source, index, tool)` 读取一条来源，`renderSources(sources, tool)` 读取整组 URL／文档来源，同时保留原工具调用。可组合项目的文档预览、收藏或引用按钮；独立插件需要同步当前来源时，使用[共享 Service](/development/plugin-interaction.md#插件之间共享选择或结果)。

## 常见定制





### 调整来源列表间距 \{#调整来源列表间距}


在已有来源消息入口调整间距，列表解析、网页与文档的展示区分继续由插件处理：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { SourceCitationsMessagePlugin as Implementation } from '@za38.03/agent-ui-plugins/source-citations-message';

export function SourceCitationsMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    style={{ ...props.style, gap: 12 }} />;
}
```

### 为网页来源增加业务参数 \{#为-url-来源增加业务参数}


`sourceProps` 处理已校验的来源。下面只调整网页链接，文档来源继续使用原数据：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { SourceCitationsMessagePlugin as Implementation } from '@za38.03/agent-ui-plugins/source-citations-message';

export function SourceCitationsMessagePlugin(props: ComponentProps<typeof Implementation>) {
  return <Implementation {...props}
    sourceProps={source => {
      if (source.sourceType !== 'url') return source;
      const url = new URL(source.url);
      url.searchParams.set('from', 'agent-ui');
      return { ...source, url: url.href };
    }} />;
}
```

替换 `renderSource` 或 `renderSources` 可以接入项目预览；整体替换时需由业务展示负责保留各类来源的打开方式。

## 属性与 API



### API

以下选项用于定制已有工具展示。当前工具的参数、结果和运行状态由原入口提供，正常使用无需重新构造它们。

| 属性               | 类型                                                                                                                         | 省略时 / 用途                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `sourceProps?`   | [`(source: ConversationSourcePart, index: number) => ConversationSourcePart`](#conversationsourcepart)                     | 转换每个来源对象；需保持 URL／文档来源的联合类型约束                 |
| `renderSource?`  | [`(source: ConversationSourcePart, index: number, tool: ConversationToolCallProps) => ReactNode`](#conversationsourcepart) | 自定义单个来源，默认 `ConversationSource`              |
| `renderSources?` | [`(sources: readonly ConversationSourcePart[], tool: ConversationToolCallProps) => ReactNode`](#conversationsourcepart)    | 自定义整个列表，优先于 `renderSource`                   |
| `Fallback?`      | `ComponentType<ConversationToolCallProps>`                                                                                 | 默认 `ConversationToolResult`；未完成、出错或来源数据无效时使用 |

`sourceProps` 是转换函数，不是任意 HTML 属性对象。

#### 当前工具调用的数据与操作

`renderSource(source, index, tool)` / `renderSources(sources, tool)` 同时提供来源对象和原工具调用。业务预览根据 `source.sourceType` 选择网页或文档处理，关联当前回答中的调用使用 `tool.toolCallId`。

公共字段、状态判断和操作回调见[工具调用参数](/plugins/tool-result.md#当前工具调用的数据与操作)。

#### 按来源决定预览方式 \{#conversationsourcepart}

`sourceProps` / `renderSource` 收到的来源以 `sourceType` 区分：

| 来源           | 必需字段                                             | 可选字段与使用方式                                                 |
| ------------ | ------------------------------------------------ | --------------------------------------------------------- |
| `'url'`      | `id: string`、`url: string`                       | `title?: string`；用 URL 打开网页，转换链接时保留 `sourceType: 'url'`   |
| `'document'` | `id: string`、`title: string`、`mediaType: string` | `filename?: string`；用 `id` 交给项目文档预览，`mediaType` 是 MIME 类型 |

例如 `{ sourceType: 'document', id: 'policy-1', title: '请假制度', mediaType: 'application/pdf' }` 提供的是文档标识，不是可以直接下载的 URL。需要预览或下载时，由业务方法解析该 ID；不要对文档来源无条件读取 `url`。

前面的 `sourceProps` 示例先判断 `sourceType` 再改写网页链接，因此能保留另一种来源。



