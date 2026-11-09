# 上下文检索结果（context-retrieval-message）

例如 Agent 查询请假制度后，卡片按检索词列出供它参考的制度片段，用户可以展开阅读。它展示已提供给 Agent 的上下文；文档检索片段插件则展示文档搜索工具的命中结果。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![查看上下文检索结果（context-retrieval-message）界面示例](/images/plugins/context-retrieval-message.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable context-retrieval-message`，点击下图中的 **「查看上下文检索结果」**。

![Creator 启用菜单：点击「查看上下文检索结果」，插件 ID 为 context-retrieval-message](/images/plugins/enable/context-retrieval-message.jpg)

## 显示条件与数据来源

**Agent 服务接入：**&#x53D1;送 `CUSTOM`，名称必须是 `CONTEXT_CONTENT`，`value` 为检索上下文。以下事件按顺序发送；完整 SSE 包装和运行开始、结束事件见[共用格式](/plugins/ag-ui-data.md#共用的-sse-格式)。

```json
[
  {
    "type": "CUSTOM",
    "name": "CONTEXT_CONTENT",
    "value": {
      "source": "rag",
      "content": [
        {
          "query": "退款期限是多少？",
          "context": [
            "退款申请需在 30 天内提交。"
          ]
        }
      ]
    }
  }
]
```

`source` 是字符串；`content` 是数组，每组包含字符串 `query` 和字符串数组 `context`。`rag`、`long_term_memory` 使用内置来源名称，其他来源显示原字符串。数据无效时不渲染。Mock 中的 `CONTEXT_STARTED`、`CONTEXT_FINISHED` 不提供本插件的卡片内容，不能替代 `CONTEXT_CONTENT`。

## 定制选项

通过 `className`、`style` 调整卡片样式，通过 `defaultExpanded` 设置默认展开，通过 `title` 替换卡片标题；需要改变内容排版时使用 `renderContent`。检索词和片段内容继续来自 Agent 返回的数据。

## 需求示例

```text
请修改「查看上下文检索结果（context-retrieval-message）」：
修改：卡片最大宽度设为【640px】并居中，卡片间距设为【12px】。
保留：Agent 返回的来源、检索词和片段内容。
```

## 属性

打开项目中的 `plugins/context-retrieval-message/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalContextRetrievalMessage`；类型：`ContextRetrievalMessageProps`。继承 `details` 原生属性，排除 `children`、`title`、`open`、`onToggle`。

| 属性                  | 类型                                                                                              | 省略时 / 用途                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `data`              | `unknown`                                                                                       | 必需；有效结构为 [`ContextRetrievalData`](#contextretrievaldata)，无效时不渲染 |
| `title?`            | `ReactNode`                                                                                     | 默认按来源使用统一检索文案或来源值                                               |
| `expanded?`         | `boolean`                                                                                       | 受控展开                                                            |
| `defaultExpanded?`  | `boolean`                                                                                       | 默认 `false`                                                      |
| `onExpandedChange?` | `(expanded: boolean) => void`                                                                   | 展开变化通知                                                          |
| `renderContent?`    | [`(data: ContextRetrievalData, defaultContent: ReactNode) => ReactNode`](#contextretrievaldata) | 替换检索正文，保留标题和展开容器                                                |

### 类型说明

#### ContextRetrievalData

一次上下文检索的数据，按查询分组。

```ts
interface ContextRetrievalData {
  source: string; // 检索来源
  content: readonly ContextRetrievalGroup[]; // 查询及其检索片段
}
```

每个分组的结构见 [`ContextRetrievalGroup`](#contextretrievalgroup)。

#### ContextRetrievalGroup

```ts
interface ContextRetrievalGroup {
  query: string; // 本组的查询文本
  context: readonly string[]; // 检索到的正文片段
}
```

### 类型查询

React 原生属性、组件组合及嵌套会话数据等复杂类型，可在编辑器中查询。通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalContextRetrievalMessage } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalContextRetrievalMessage>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
这里的工具或消息参数由会话传入，属于数据接口；需要更换结构时，在项目注册处包装或更换渲染函数。
