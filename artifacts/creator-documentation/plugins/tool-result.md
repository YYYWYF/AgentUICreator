# 工具调用卡片（tool-result）

## 功能与效果


![展开的工具卡片显示调用参数和 JSON 结果](/images/plugins/tool-fallback.jpg)

展开一次工具调用后，可以查看工具名、调用参数和返回结果；点击标题可以收起详情。

展示一次工具调用的状态、参数、错误、审批和结果。结果支持普通文字、JSON，以及约定格式的图片、音频、视频和文档片段。

### 操作审批


![工具卡片中的操作说明与允许、拒绝按钮](/images/plugins/tool-fallback-approval.jpg)

需要用户确认时，卡片显示操作说明和审批入口，用户提交决定后由后端继续执行。

### 多模态结果


![同一次工具调用返回图片、音频、视频和 PDF 文档](/images/plugins/tool-result.png)

同一次调用可以按返回顺序展示多种结果：图片预览、音视频播放器和文档下载入口。

### 自定义卡片的展开与收起

自定义 `render` 可以根据工具状态实现“调用时展开，成功完成后收起”。下面两张图来自同一个 `standalone` 卡片的实际 Mock 演示；实现方式见[自定义卡片示例](#自定义卡片自动展开收起)。


![自定义卡片在调用中展开并逐段显示工具结果](/images/plugins/behavior/custom-tool-streaming.jpg)

调用中：卡片保持展开，工具输出逐段追加；图中的 isPreliminary 为 true。


![自定义卡片收到最终结果后自动收起](/images/plugins/behavior/custom-tool-completed.jpg)

成功完成后：卡片自动收起，保留标题；用户仍可点击标题查看完整结果。这一行为由示例组件自己的状态逻辑实现。

## 数据来源与显示条件


### 操作确认与中断 \{#操作确认}



![工具卡片展示待确认的操作，并提供允许和拒绝按钮](/images/plugins/tool-fallback-approval.jpg)

后端需要先发送工具调用，再返回审批或中断数据。用户允许操作只表示提交了决定，实际执行结果仍由后端返回。

`CUSTOM ON_INTERRUPT` 的关键事件如下；每条按[共用 SSE 格式](/plugins/ag-ui-data.md#共用的-sse-格式)发送，示例省略消息、状态快照和运行外层事件：

```jsonl
{"type":"TOOL_CALL_START","toolCallId":"call-1","toolCallName":"remove_cache"}
{"type":"TOOL_CALL_ARGS","toolCallId":"call-1","delta":"{\"path\":\".cache\"}"}
{"type":"TOOL_CALL_END","toolCallId":"call-1"}
{"type":"CUSTOM","name":"ON_INTERRUPT","value":{"action_requests":[{"name":"remove_cache","args":{"path":".cache"},"description":"请确认是否清理缓存"}],"review_configs":[{"action_name":"remove_cache","allowed_decisions":["approve","reject"]}]}}
```

命令审批通过工具名与参数匹配到当前调用。用户决定通过已有 command 通道续跑；不伪造工具结果。

原生 interrupt 同样按 AG-UI 事件顺序发送，每条按上述 SSE 格式传输；通过 `RUN_FINISHED.outcome` 中的 `toolCallId` 关联前面的工具调用。以下省略消息、状态快照和运行开始事件：

```jsonl
{"type":"TOOL_CALL_START","toolCallId":"call-1","toolCallName":"remove_cache"}
{"type":"TOOL_CALL_ARGS","toolCallId":"call-1","delta":"{\"path\":\".cache\"}"}
{"type":"TOOL_CALL_END","toolCallId":"call-1"}
{"type":"RUN_FINISHED","threadId":"thread-1","runId":"run-1","outcome":{"type":"interrupt","interrupts":[{"id":"confirm-1","reason":"tool_call","toolCallId":"call-1","responseSchema":{"type":"object","properties":{"approved":{"type":"boolean"}},"required":["approved"]}}]}}
```

用户回答通过同一 Thread 的 `resume[]` 提交；未处理中断不能用普通消息替代。现有原生 `approval` / `respondToApproval` 和 `interrupt` / `resume` 交互字段继续由 Runtime 提供。组件不解析另一条 SSE 流，也不创建独立 Runtime。

### 图片、音视频和文档结果 \{#接入多模态工具结果}


结果通过 `TOOL_CALL_RESULT` 返回。`content` 是约定片段数组的 JSON 字符串：

```jsonl
{"type":"TOOL_CALL_START","toolCallId":"media-1","toolCallName":"render_report"}
{"type":"TOOL_CALL_ARGS","toolCallId":"media-1","delta":"{}"}
{"type":"TOOL_CALL_END","toolCallId":"media-1"}
{"type":"TOOL_CALL_RESULT","messageId":"result-1","toolCallId":"media-1","content":"[{\"type\":\"text\",\"text\":\"报告已生成\"},{\"type\":\"image\",\"source\":{\"type\":\"url\",\"value\":\"https://example.test/report.png\",\"mimeType\":\"image/png\"}}]"}
```

文本片段为 `{ type: 'text', text: string }`；媒体类型为 `image`、`audio`、`video`、`document`，通过 `source` 指定来源：

| 来源     | 数据                                                  |
| ------ | --------------------------------------------------- |
| `url`  | `value` 为 HTTP(S) 或 Blob URL，`mimeType` 可选          |
| `data` | `value` 为 Base64，必须提供 `mimeType`                    |
| `file` | `value` 为业务文件引用，可带 `provider`，通过项目 `resolveFile` 解析 |

文件引用不会被猜测成 URL。`resolveFile(source, { signal })` 返回地址或 Promise；更换来源、卸载时取消旧解析。媒体不自动播放，无效地址或 MIME 使用统一语言提示。普通 JSON 和不符合片段约定的结果继续使用通用结果展示。

每项可带 `id` 和 `metadata`；`metadata.filename` 提供文件名。`components` 按片段类型替换组件，例如 `Image: MyImage`；未指定的片段保持默认。结果组件还能从 `result.parts` 读取按原顺序排列的数据和展示节点。

## 常见定制



除“自定义卡片自动展开收起”外，下面每个示例都是一个完整的 `plugins/tool-result/index.tsx`，可单独使用。示例采用默认 npm 实现；已接管源码的项目保留现有 `Implementation` 导入路径。所有可用配置见下方 [API](#api)。

### 修改审批按钮样式 \{#审批按钮样式}

修改 `plugins/tool-result/index.tsx`，把默认审批按钮改成蓝色确认、红色拒绝，并增大按钮间距：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationToolResultPlugin as Implementation }
  from '@za38.03/agent-ui-plugins/tool-result';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';

type PluginProps = ComponentProps<typeof Implementation>;

export function ConversationToolResultPlugin(props: PluginProps) {
  const scope = usePluginRenderScope<Partial<PluginProps>>();
  if (scope?.kind !== 'conversation.tool-fallback') return null;
  const input = { ...scope.value, ...props };

  return <Implementation {...input}
    approvalStyles={{
      ...input.approvalStyles,
      actions: { ...input.approvalStyles?.actions, gap: 12 },
      approveButton: {
        ...input.approvalStyles?.approveButton,
        backgroundColor: '#1677ff', color: '#fff', borderRadius: 10,
      },
      rejectButton: {
        ...input.approvalStyles?.rejectButton,
        color: '#b42318', borderRadius: 10,
      },
    }}
  />;
}
```

这里只修改 `approvalStyles`：`actions` 控制操作行，`approveButton`、`rejectButton` 分别控制确认和拒绝按钮，原有审批行为保留。

### 设置展开与内容高度 \{#展开详情并限制内容高度}



修改 `plugins/tool-result/index.tsx`，默认展开工具详情，内容超过 360px 时在详情区内滚动：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationToolResultPlugin as Implementation }
  from '@za38.03/agent-ui-plugins/tool-result';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';

type PluginProps = ComponentProps<typeof Implementation>;

export function ConversationToolResultPlugin(props: PluginProps) {
  const scope = usePluginRenderScope<Partial<PluginProps>>();
  if (scope?.kind !== 'conversation.tool-fallback') return null;
  const input = { ...scope.value, ...props };

  return <Implementation {...input}
    defaultExpanded
    contentProps={{
      ...input.contentProps,
      style: {
        ...input.contentProps?.style,
        maxHeight: 360,
        overflow: 'auto',
      },
    }}
  />;
}
```

`defaultExpanded` 设置初始展开状态；`contentProps.style` 设置详情区的样式。

### 自定义卡片自动展开收起 \{#自定义卡片自动展开收起}

这个示例放在业务侧的 Agent 引用文件（如 `src/App.tsx`）：替换 `check_workspace` 工具的整张卡片，调用时展开，成功完成后收起。

```tsx fold height=180
import { useEffect, useId, useState } from 'react';
import type { ConversationToolCallProps, ConversationToolkit } from '@za38.03/agent-ui-plugins';
import { Agent } from './agent-ui';
import { agentUIProject } from './agent-ui/application/project-config';

function CustomStreamTool({ toolName, status, result, isPreliminary, isError }: ConversationToolCallProps) {
  const completed = status.type === 'complete' && !isPreliminary && !isError;
  const [expanded, setExpanded] = useState(!completed);
  const detailsId = useId();

  useEffect(() => {
    setExpanded(!completed);
  }, [completed]);

  const output = result === undefined ? ''
    : typeof result === 'string' ? result : JSON.stringify(result, null, 2);

  return <section>
    <button type="button" aria-expanded={expanded} aria-controls={detailsId}
      onClick={() => setExpanded(value => !value)}>
      {toolName}
    </button>
    <div id={detailsId} hidden={!expanded}>
      <pre>{output}</pre>
    </div>
  </section>;
}

const toolkit = {
  ...agentUIProject.baseConversationToolkit,
  check_workspace: {
    type: 'backend',
    display: 'standalone',
    render: CustomStreamTool,
  },
} satisfies ConversationToolkit;

export default function App() {
  return <Agent endpoint="/api/agent" toolkit={toolkit} />;
}
```

把 `check_workspace` 换成后端实际工具名。`status.type === 'complete'` 且 `isPreliminary`、`isError` 都不为 true 时视为成功完成；`display: 'standalone'` 让该卡片独立于工具分组显示。

### 替换工具名称和入参 \{#业务渲染}

修改 `plugins/tool-result/index.tsx`，用自己的按钮显示工具名，用自己的代码块显示入参，保留默认结果和审批区域：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationToolResultPlugin as Implementation }
  from '@za38.03/agent-ui-plugins/tool-result';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';
import type { ToolHeaderProps, ToolArgsProps }
  from '@za38.03/agent-ui-plugins';

type PluginProps = ComponentProps<typeof Implementation>;

function MyHeader({
  tool, expanded, onExpandedChange,
}: ToolHeaderProps) {
  return <button type="button" aria-expanded={expanded}
    onClick={() => onExpandedChange(!expanded)}>
    {tool.toolName}
  </button>;
}

function MyArguments({ args }: ToolArgsProps) {
  return <pre style={{ padding: 12, background: '#f5f5f5' }}>
    {JSON.stringify(args, null, 2)}
  </pre>;
}

export function ConversationToolResultPlugin(props: PluginProps) {
  const scope = usePluginRenderScope<Partial<PluginProps>>();
  if (scope?.kind !== 'conversation.tool-fallback') return null;
  const input = { ...scope.value, ...props };

  return <Implementation {...input}
    components={{
      ...input.components,
      Header: MyHeader,
      Args: MyArguments,
    }}
  />;
}
```

`components.Header`、`components.Args` 分别指定这两个区域使用的组件。`tool.toolName` 是工具名，`args` 是入参；按钮通过 `expanded`、`onExpandedChange` 保留展开和收起操作。

### 自定义审批卡片 \{#自己画审批卡片和按钮}

修改 `plugins/tool-result/index.tsx`，只替换审批工具的名称、入参、结果和按钮，其他工具保持默认。这个示例用于后端提供“允许、拒绝”两种动作的审批：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationToolResultPlugin as Implementation }
  from '@za38.03/agent-ui-plugins/tool-result';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';
import { useLocale, type ApprovalCardProps }
  from '@za38.03/agent-ui-plugins';

type PluginProps = ComponentProps<typeof Implementation>;

function MyApprovalCard({
  tool, approval, result, views,
}: ApprovalCardProps) {
  const messages = useLocale('toolPresentation');

  return <section {...approval.containerProps}
    style={{ padding: 16, border: '1px solid #ddd', borderRadius: 12 }}>
    <h3>{tool.toolName}</h3>
    <pre>{JSON.stringify(tool.args, null, 2)}</pre>
    <p>{approval.prompt}</p>

    <button disabled={approval.disabled}
      onClick={() => approval.approve()}>
      {messages.allow}
    </button>
    <button disabled={approval.disabled}
      onClick={() => approval.reject()}>
      {messages.deny}
    </button>

    {approval.error && <p role="alert">{approval.error}</p>}
    {approval.receipt?.label}
    {views.error}
    {result.kind !== 'none' && <pre>{result.text}</pre>}
  </section>;
}

export function ConversationToolResultPlugin(props: PluginProps) {
  const scope = usePluginRenderScope<Partial<PluginProps>>();
  if (scope?.kind !== 'conversation.tool-fallback') return null;
  const input = { ...scope.value, ...props };

  return <Implementation {...input}
    components={{
      ...input.components,
      ApprovalCard: MyApprovalCard,
    }}
  />;
}
```

`components.ApprovalCard` 让审批调用使用 `MyApprovalCard`，框架自动传入数据和方法。`tool` 提供名称、入参；`result.text` 提供格式化结果；`views.error` 保留工具执行错误提示。

按钮直接调用 `approval.approve()` / `reject()`。`disabled` 控制能否点击，`error` 显示提交失败原因，`receipt.label` 显示已允许或已拒绝的回执。`containerProps` 挂到审批区域根元素以保留焦点处理。

### 替换图片组件

修改 `plugins/tool-result/index.tsx`，将工具结果里的图片交给自己的 `MyImage`，保留工具标题、入参和其他结果：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationToolResultPlugin as Implementation }
  from '@za38.03/agent-ui-plugins/tool-result';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';
import type { ToolImageProps } from '@za38.03/agent-ui-plugins';

type PluginProps = ComponentProps<typeof Implementation>;

function MyImage({ src, filename }: ToolImageProps) {
  return <figure style={{ margin: 0, padding: 12, border: '1px solid #ddd' }}>
    <img src={src} alt={filename ?? ''}
      style={{ maxWidth: '100%', borderRadius: 12 }} />
    {filename && <figcaption>{filename}</figcaption>}
  </figure>;
}

export function ConversationToolResultPlugin(props: PluginProps) {
  const scope = usePluginRenderScope<Partial<PluginProps>>();
  if (scope?.kind !== 'conversation.tool-fallback') return null;
  const input = { ...scope.value, ...props };

  return <Implementation {...input}
    components={{
      ...input.components,
      Image: MyImage,
    }}
  />;
}
```

关键配置是 `components.Image: MyImage`。框架把已解析的图片地址作为 `src`、可选文件名作为 `filename` 传入，因此用户不需要判断工具类型或遍历结果。

### 统一卡片布局 \{#统一布局}

修改 `plugins/tool-result/index.tsx`，把每次工具调用的默认名称、入参和内容放进一个带间距的容器：

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationToolResultPlugin as Implementation }
  from '@za38.03/agent-ui-plugins/tool-result';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';

type PluginProps = ComponentProps<typeof Implementation>;

export function ConversationToolResultPlugin(props: PluginProps) {
  const scope = usePluginRenderScope<Partial<PluginProps>>();
  if (scope?.kind !== 'conversation.tool-fallback') return null;
  const input = { ...scope.value, ...props };

  return <Implementation {...input}
    renderToolCall={({ header, defaultView }) => (
      <div style={{ display: 'grid', gap: 16 }}>
        {header}
        {defaultView}
      </div>
    )}
  />;
}
```

`header` 包含默认名称、状态和入参；`defaultView` 是不含 header 的错误、审批及结果区域。示例同时引用两者，因此保留默认内容，只调整排列和间距。

## 属性与 API





以下配置传给插件入口的 `Implementation`；工具调用数据由现有作用域提供。复杂属性可点击名称查看下面的子属性表。`—` 表示未设置。

| 参数                                           | 说明                     | 类型                                                  | 默认值                      |
| -------------------------------------------- | ---------------------- | --------------------------------------------------- | ------------------------ |
| [`components`](#components)                  | 替换指定区域或结果组件，未配置的使用默认组件 | 组件映射                                                | —                        |
| [`renderToolCall`](#render-tool-call)        | 统一组合工具调用的布局            | `({ header, defaultView }) => ReactNode`            | —                        |
| `expanded`                                   | 受控展开状态                 | `boolean`                                           | —                        |
| `defaultExpanded`                            | 初始展开状态                 | `boolean`                                           | 待操作时为 `true`，其余为 `false` |
| `onExpandedChange`                           | 展开状态改变时回调              | `(expanded: boolean) => void`                       | —                        |
| `className`                                  | 根容器的 CSS 类名            | `string`                                            | —                        |
| `style`                                      | 根容器样式                  | `CSSProperties`                                     | —                        |
| `buttonProps`                                | 默认工具标题按钮的属性            | 按钮属性                                                | —                        |
| `contentProps`                               | 默认详情容器的属性，如高度、滚动样式     | 容器属性                                                | —                        |
| `argsProps`                                  | 默认入参区域的属性              | 容器属性                                                | —                        |
| `resultProps`                                | 默认普通结果区域的属性            | 容器属性                                                | —                        |
| `errorProps`                                 | 默认执行错误区域的属性            | 容器属性                                                | —                        |
| `approvalProps`                              | 默认审批区域外层的属性            | `div` 属性                                            | —                        |
| [`approvalClassNames`](#approval-appearance) | 默认审批各区域的 CSS 类名        | 类名映射                                                | —                        |
| [`approvalStyles`](#approval-appearance)     | 默认审批各区域的行内样式           | 样式映射                                                | —                        |
| [`resolveFile`](#resolve-file)               | 将业务文件引用解析为资源地址         | `(source, { signal }) => string \| Promise<string>` | —                        |
| `resultOnly`                                 | 只显示结果，跳过名称、入参和审批区域     | `boolean`                                           | `false`                  |

根容器还支持 `id`、`role`、`onClick`、`aria-label` 和 `aria-describedby`。外观属性作用于默认区域，自定义组件自行决定其 UI。

普通工具成功完成时自动收起，之后仍可手动展开；流式中间结果、失败和取消不会触发成功收起。设置 `expanded` 后由应用控制。`resultOnly` 仍应用 Result 和片段组件，但不调用 Header、ApprovalCard 或 `renderToolCall`。

### components \{#components}

`components` 的每个值都是一个 React 组件。组件在模块顶层定义，框架负责选择何时渲染，并注入下表参数。

| 键              | 替换范围                               | 接收的参数                                                                     |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `Header`       | 工具名、状态和展开按钮                        | [通用参数](#component-props) + [Header 参数](#header-args-props)                |
| `Args`         | 入参区域                               | [通用参数](#component-props) + [Args 参数](#header-args-props)                  |
| `Approval`     | 审批提示、备注、按钮和回执区域                    | [通用参数](#component-props)，且 `approval` 保证存在                                |
| `ApprovalCard` | 审批工具的完整卡片，含名称、入参和结果                | [通用参数](#component-props)，且 `approval` 保证存在；另有[整卡参数](#approval-card-props) |
| `Result`       | 整个结果区域                             | [通用参数](#component-props)                                                  |
| `Error`        | 工具执行错误区域                           | [通用参数](#component-props)，且 `error` 保证存在                                   |
| `Text`         | 普通文字、格式化 JSON 或文字片段                | [文字参数](#text-props)                                                       |
| `Image`        | 结构化结果中的图片片段                        | [媒体参数](#media-props)                                                      |
| `Audio`        | 结构化结果中的音频片段                        | [媒体参数](#media-props)                                                      |
| `Video`        | 结构化结果中的视频片段                        | [媒体参数](#media-props)                                                      |
| `File`         | 结构化结果中的文档／文件片段（`type: 'document'`） | [媒体参数](#media-props)                                                      |

替换父区域后，其内部内容由自定义组件决定。例如 Result 自己画结果时，不会再自动追加 Image；它若引用收到的 `defaultView`，其中已经应用 Image 等片段配置。

这些配置作用于 tool-result 负责的调用，已有 toolkit 专属渲染和外层分组保持原来的选择关系。

#### 区域组件参数 \{#component-props}

Header、Args、Approval、ApprovalCard、Result、Error 接收以下参数：

| 参数            | 内容                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------- |
| `tool`        | 工具调用数据，常用字段为 `toolCallId`、`toolName`、`args`、`argsText`、`status`、`result`、`isPreliminary` |
| `methods`     | 当前可用的原有工具操作，见[methods](#tool-methods)                                                    |
| `approval`    | [approval](#hook)；普通工具可能为空                                                               |
| `result`      | [result](#result-props)                                                                  |
| `error`       | 执行错误；没有时为空。有值时包含原始 `error`、格式化 `errorText`、`status` 和取消标记 `cancelled`                    |
| `defaultView` | 对应区域的默认 React 节点，已应用内部组件配置；ApprovalCard 中为不含 header 的默认内容区                               |

##### approval：审批数据与操作 \{#hook}

| approval 参数                              | 内容                                                       |
| ---------------------------------------- | -------------------------------------------------------- |
| `approve(optionId?)`、`reject(optionId?)` | 同意／拒绝，沿用原提交通道、防重复提交、失败重试和续跑流程                            |
| `disabled`                               | 当前不能提交时为 `true`，用于按钮 `disabled`                          |
| `kind`                                   | `command`、`approval`、`interrupt`、`frontend`              |
| `phase`                                  | `pending`、`confirming`、`submitting`、`settled`、`readonly` |
| `prompt`                                 | 审批说明                                                     |
| `actions`                                | 当前按钮描述，包含 `id`、`label`、`kind`、`disabled`；可据此决定显示哪些按钮     |
| `options`、`confirming`                   | 审批选项、当前二次确认的选项                                           |
| `acceptsNote`、`note`、`setNote(text)`     | 是否允许备注、备注内容及更新方法                                         |
| `error`                                  | 提交失败提示；与工具执行错误 `error` 区分                                |
| `receipt`                                | 回执，包含 `outcome`、`label`、可选 `option`                      |
| `containerProps`                         | 挂到自定义审批区域根元素，保留焦点处理                                      |
| `approval`、`interrupt`、`decisionRequest` | 原始审批／中断／命令请求数据                                           |

多个同类选项时，用 `approve(optionId)` / `reject(optionId)` 指定选择。需要二次确认时，第一次调用进入 `confirming`，再次调用同一动作确认提交。

##### methods：工具操作 \{#tool-methods}

`methods` 只提供当前可用的方法，使用前判断是否存在。审批按钮优先使用 `approval.approve()` / `reject()`。

| 方法                                           | 用途                            |
| -------------------------------------------- | ----------------------------- |
| `addResult(result)`                          | 提交前端工具结果                      |
| `respondToApproval(response)`                | 提交原生审批回答                      |
| `resume(payload)`、`resumeInterrupt(payload)` | 提交中断回答并恢复运行                   |
| `submitDecision(decision)`                   | 提交命令审批决定，如 `approve`、`reject` |
| `unstable_recordInteraction(input)`          | 上游提供时，记录工具交互                  |

##### result：结果数据 \{#result-props}

| result 参数 | 内容                                           |
| --------- | -------------------------------------------- |
| `value`   | 原始结果                                         |
| `text`    | 格式化文字，可用于自己的文字／JSON 结果卡片                     |
| `kind`    | `none` 无结果、`plain` 普通结果、`parts` 结构化片段        |
| `parts`   | 按原顺序排列的片段描述；每项有 `part`、`index`、`defaultView` |

`parts` 的文字项另有 `text`；媒体项另有 `url`、`mimeType`、`filename`、`pending`、`available`。这里的 `defaultView` 是可复用的片段节点。

#### Header、Args 参数 \{#header-args-props}

除[通用参数](#component-props)外，这两个组件分别接收：

| 组件     | 参数                 | 说明          | 类型                            |
| ------ | ------------------ | ----------- | ----------------------------- |
| Header | `expanded`         | 当前展开状态      | `boolean`                     |
| Header | `onExpandedChange` | 更新展开状态      | `(expanded: boolean) => void` |
| Args   | `args`             | 原始工具入参      | `unknown`                     |
| Args   | `argsText`         | 入参文本，可能尚未生成 | `string \| undefined`         |

#### ApprovalCard 参数 \{#approval-card-props}

ApprovalCard 除通用参数外，还接收：

| 参数                            | 内容                                                 |
| ----------------------------- | -------------------------------------------------- |
| `header`                      | 完整的默认调用信息区，含名称、状态、入参和展开行为；引用才保留，省略即可自行重画           |
| `views`                       | 默认节点集合：`header`、`args`、`approval`、`result`、`error` |
| `expanded`、`onExpandedChange` | 调用信息区的展开状态和更新方法                                    |

`views.header` 与 `header` 相同，已包含入参，避免再重复拼上 `views.args`。`views.approval` 是可直接复用的审批交互区域，默认包含已接好提交的按钮；自己画按钮时使用 `approval.approve()` / `reject()`。

#### Text 参数 \{#text-props}

| 参数             | 内容                       |
| -------------- | ------------------------ |
| `value`、`text` | 原始展示值、格式化文字              |
| `part`、`index` | 结构化文字片段及其序号；普通结果中没有这两个字段 |
| `defaultView`  | 默认文字／JSON 展示节点           |

#### Image、Audio、Video、File 参数 \{#media-props}

Image、Audio、Video、File 接收：

| 参数                    | 内容                   |
| --------------------- | -------------------- |
| `src`                 | 已解析并校验的资源地址          |
| `filename`            | 可选文件名                |
| `mimeType`            | MIME 类型              |
| `part`、`index`        | 原始片段及其在结果中的序号        |
| `pending`、`available` | 解析状态与可用状态            |
| `defaultView`         | 对应资源的默认图片、播放器或文件展示节点 |

解析中或不可用时显示默认提示，资源可用后才挂载这些自定义组件。图片预览、播放器等被替换组件自身的 UI 交互由自定义组件实现。

### renderToolCall \{#render-tool-call}

`renderToolCall` 只接收一个对象，包含两个 React 节点：

| 参数            | 内容                                        |
| ------------- | ----------------------------------------- |
| `header`      | 默认名称、状态、入参及其展开行为                          |
| `defaultView` | 不含 header 的默认错误、审批和结果区域，已应用 components 配置 |

引用哪个节点就保留哪个；返回 `null` 隐藏本次卡片。完整 ApprovalCard 优先接管审批调用，因此不再进入这个通用布局回调。

### approvalClassNames / approvalStyles \{#approval-appearance}

两者使用相同的键。`approvalClassNames` 的值为 CSS 类名字符串，`approvalStyles` 的值为 `CSSProperties` 样式对象。

| 键               | 作用区域   |
| --------------- | ------ |
| `actions`       | 审批按钮容器 |
| `button`        | 所有审批按钮 |
| `approveButton` | 同意按钮   |
| `rejectButton`  | 拒绝按钮   |

专用按钮样式覆盖通用 `button` 样式；替换审批组件后，使用自定义组件自己的样式。

### resolveFile \{#resolve-file}

仅解析 `source.type: 'file'` 的业务文件引用，返回 HTTP(S) 或 Blob URL，可返回 Promise。

| 参数                | 说明           | 类型                    |
| ----------------- | ------------ | --------------------- |
| `source.type`     | 文件引用标记       | `'file'`              |
| `source.value`    | 业务文件标识       | `string`              |
| `source.provider` | 可选的文件服务标识    | `string \| undefined` |
| `source.mimeType` | 可选的 MIME 类型  | `string \| undefined` |
| `options.signal`  | 用于取消已过期的解析请求 | `AbortSignal`         |
