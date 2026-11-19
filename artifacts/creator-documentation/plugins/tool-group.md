# 工具调用分组（tool-group）


![展开后的工具分组](/images/plugins/behavior/tool-group-expanded.jpg)

手动展开后的同一工具组：标题汇总 3 次调用，组内保留各个工具入口。

将会话中归入同一组的工具调用集中展示，自动显示调用数量和运行状态，并保留每个工具原有的详情与操作。

## 汇总一组工具调用

插件从会话取得当前工具分组和其中的内容，标题自动显示本组调用数量；运行中的分组带有进行中提示。普通分组初始收起，点击标题可以查看或隐藏各次调用。


![普通工具组的初始收起状态](/images/plugins/behavior/tool-group-collapsed.jpg)

同一组的初始状态只显示“3 次工具调用”；点击后才出现开头截图中的工具条目。

分组和数量由现有会话渲染链提供，业务代码无需自己计数，也无需将工具名逐个拼成一组。

## 待处理操作自动展开

本组出现需要用户处理的操作时，插件自动展开，方便查看详情中的审批或补充输入入口。普通工具组随后进入待处理状态时，也会触发展开。

展开只是让操作入口可见；实际提交、批准或继续运行沿用各个工具已有的处理流程。离开待处理状态后，插件不会强制把当前分组收起，用户仍可自行切换。

## 分组内查看工具详情

展开分组后，原有工具内容继续在组内展示。工具的输入、结果和错误由对应的工具展示处理，分组本身不会把它们改造成一段摘要，也不会替用户执行其中的操作。

## 从会话取得工具分组 \{#显示条件与数据来源}

插件消费当前回复中的工具调用，由会话渲染链组织分组，不需要后端另外发送分组对象。下面展示同一回复中的两次调用，省略外层运行事件与 SSE 包装，完整格式见[通用工具事件](/plugins/ag-ui-data.md#通用工具事件)：

```jsonl
{"type":"TOOL_CALL_START","toolCallId":"config-1","toolCallName":"read_config"}
{"type":"TOOL_CALL_ARGS","toolCallId":"config-1","delta":"{\"path\":\"app-ui.json\"}"}
{"type":"TOOL_CALL_END","toolCallId":"config-1"}
{"type":"TOOL_CALL_START","toolCallId":"inspect-1","toolCallName":"inspect_component"}
{"type":"TOOL_CALL_ARGS","toolCallId":"inspect-1","delta":"{\"name\":\"composer\"}"}
{"type":"TOOL_CALL_END","toolCallId":"inspect-1"}
{"type":"TOOL_CALL_RESULT","messageId":"config-result-1","toolCallId":"config-1","role":"tool","content":"{\"found\":true}"}
{"type":"TOOL_CALL_RESULT","messageId":"inspect-result-1","toolCallId":"inspect-1","role":"tool","content":"{\"available\":true}"}
```

每次调用使用不同的 `toolCallId`；同一次调用的参数、结束和结果沿用相同 ID。`TOOL_CALL_ARGS.delta` 是可分段追加的 JSON 字符串，`TOOL_CALL_END` 只表示参数结束，不表示工具执行完成；结果通过对应的 `TOOL_CALL_RESULT` 返回。

工具名和参数是业务接口的一部分，上面的名称仅用于示例。分组边界与数量由会话中的实际内容决定，不通过后端传入 `count`、`expanded` 或单独的分组 ID 来控制；已配置的专用工具卡片和子任务展示继续生效。

需要用户审批或补充输入时，还需沿用[审批／中断事件格式](/plugins/tool-fallback.md#显示条件与数据来源)。运行时据此得到待处理状态，再触发分组自动展开；普通工具参数结束事件不会让分组进入待审批状态。


## 普通工具组也初始展开 \{#初始展开}


默认只为待处理操作自动展开。希望普通调用也从展开状态开始时，在项目已有工具组入口设置 `defaultExpanded`：

```tsx
import type { ComponentProps } from 'react';
import { ConversationToolGroupPlugin as Implementation } from '@za38.03/agent-ui-plugins/tool-group';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';

export function ConversationToolGroupPlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== 'conversation.tool-group') return null;
  return <Implementation {...scope.value} {...props}
    defaultExpanded />;
}
```

调用数量、运行状态和待处理操作的展开逻辑仍由插件提供，用户仍可点击标题收起。

## 调整工具组外观


默认工具组使用无边框样式。需要将整组工具与正文明确分隔时，可增加边框：

```tsx
import type { ComponentProps } from 'react';
import { ConversationToolGroupPlugin as Implementation } from '@za38.03/agent-ui-plugins/tool-group';
import { usePluginRenderScope } from '@za38.03/agent-ui-plugins';

export function ConversationToolGroupPlugin(props: ComponentProps<typeof Implementation>) {
  const scope = usePluginRenderScope<Partial<ComponentProps<typeof Implementation>>>();
  if (scope?.kind !== 'conversation.tool-group') return null;
  return <Implementation {...scope.value} {...props}
    variant="outline" />;
}
```

## API

以下选项用于定制已有分组展示。当前分组与内部消息由会话提供，正常使用无需重新组织这些数据。



继承公开 ToolGroupRoot 的属性，排除 `children`、`open`、`defaultOpen`、`onOpenChange`。插件入口缺少 `group` 时不渲染。

| 属性                  | 类型                                                                                          | 省略时 / 用途                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `group`             | `ConversationMessagePartGroup`                                                              | 会话运行环境提供的当前工具分组；单独使用展示组件时必需                                    |
| `children?`         | `ReactNode`                                                                                 | Runtime 提供的组内工具内容，不作为普通用户配置                                    |
| `expanded?`         | `boolean`                                                                                   | 项目完全控制展开状态；设置后待处理操作也不能覆盖传入值                                    |
| `defaultExpanded?`  | `boolean`                                                                                   | 初始展开状态；省略时，含待处理操作的组展开，其余收起。后续进入待处理状态时自动展开；`expanded` 可完全控制展开状态 |
| `onExpandedChange?` | `(expanded: boolean) => void`                                                               | 展开变化通知                                                         |
| `buttonProps?`      | `Partial<Omit<ComponentProps<typeof ToolGroupTrigger>, 'active' \| 'count' \| 'children'>>` | 标题按钮外观与原生属性；数量和运行状态由分组提供                                       |
| `contentProps?`     | `Omit<ComponentProps<typeof ToolGroupContent>, 'children'>`                                 | 折叠内容面板属性                                                       |
| `variant?`          | `'outline' \| 'ghost' \| 'muted' \| null`                                                   | 完整工具组组件默认 `ghost`                                              |

根组件还继承外观、无障碍与其余折叠根组件属性。子组件类型从公开 `/plugin-support` 入口取得。








defaultExpanded 与 expanded 有什么区别？

前者决定第一次展示时的状态，后续由组件管理；后者由项目每次渲染传入，需配套处理 onExpandedChange。
