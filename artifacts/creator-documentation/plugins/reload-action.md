# 回复重新生成（reload-action）

## 功能与效果

为当前整次回答重新发起生成，并沿用原有回复版本与分支生命周期。


### 重新生成回复


![重新生成回复界面](/images/plugins/reload-action.png)

在已有回复操作栏中使用，组件读取当前回答的内容与可用状态。

点击重试会通过当前会话重新发起 Agent 请求，保留原 `threadId`。服务端按本次请求的 `runId` 和新消息 ID 返回[AG-UI 响应流](/plugins/ag-ui-data.md#共用的-sse-格式)。

## 常见定制




### 按钮尺寸与提示位置 \{#尺寸与提示位置}


调整重新生成按钮的展示；按钮继续操作当前整次回复。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationCanonicalResponseReloadAction } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationCanonicalResponseReloadAction>) {
  return <ConversationCanonicalResponseReloadAction {...props}
    variant="ghost"
    size="icon-sm"
    side="top" />;
}
```


### 禁用状态 \{#按业务状态禁用}


![重新生成回复界面](/images/plugins/features/reload-action-states.png)

同一次回答中的可用与禁用状态。

示例直接禁用；实际项目把 true 换成自己的权限或业务状态表达式。组件仍叠加当前会话的可用性判断。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationCanonicalResponseReloadAction } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationCanonicalResponseReloadAction>) {
  return <ConversationCanonicalResponseReloadAction {...props}
    disabled={true} />;
}
```

### 点击前检查

`onClick` 先于重新生成执行。业务状态不允许重试时调用 `preventDefault()`；允许时沿用组件原有的重试流程。

```tsx fold height=180
import { ConversationCanonicalResponseReloadAction } from '@za38.03/agent-ui-plugins';

export function CheckedReload({ canRetry }: { canRetry: () => boolean }) {
  return <ConversationCanonicalResponseReloadAction onClick={event => {
    if (!canRetry()) event.preventDefault();
  }} />;
}
```

## 属性与 API



### API

组件：`ConversationCanonicalResponseReloadAction`。保留提示按钮的原生样式、事件与 icon 属性；默认提示从 locales 读取。

| 属性          | 类型                                              | 省略时 / 用途                                      |
| ----------- | ----------------------------------------------- | --------------------------------------------- |
| `icon?`     | `ReactNode`                                     | 自定义操作图标；文案使用统一 locale                         |
| `disabled?` | `boolean`                                       | 只有当前回答允许重试（`canReload`）且此属性未设为 `true` 时，按钮才可用 |
| `onClick?`  | `ConversationTooltipIconButtonProps['onClick']` | 调用后执行重试；`preventDefault()` 可阻止默认动作            |

#### 按钮属性

提示按钮使用 `ConversationTooltipIconButtonProps`，继承 Base UI 按钮属性：

- 状态与事件：`disabled`、`onClick`。
- 内容与样式：`icon`、`className`、`style`。
- 组合与无障碍：`render`、`nativeButton` 和无障碍属性。

组件会叠加运行状态判断，传入 `disabled={false}` 不会解除当前会话的禁用条件。

| 属性         | 类型                                                                                           | 省略时 / 用途          |
| ---------- | -------------------------------------------------------------------------------------------- | ----------------- |
| `variant?` | `'default' \| 'outline' \| 'secondary' \| 'ghost' \| 'destructive' \| 'link' \| null`        | 按钮样式；各操作按钮可能预设不同值 |
| `size?`    | `'default' \| 'xs' \| 'sm' \| 'lg' \| 'icon' \| 'icon-xs' \| 'icon-sm' \| 'icon-lg' \| null` | 按钮尺寸；各操作按钮可能预设不同值 |
| `side?`    | `'top' \| 'bottom' \| 'left' \| 'right'`                                                     | 默认 `bottom`，提示位置  |

提示按钮默认 `variant="ghost"`、`size="icon"`；普通 `Button` 默认均为 `default`，本插件的预设值以上文为准。普通 `Button` 不包含 `tooltip`、`side`。

默认提示文案只读取 `locales.common.refresh`。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。


在已有回复页脚中调用 `useResponse()`，通过 `canReload` 控制业务“重新生成”入口，点击时调用 `reload(): void`。它沿用当前回答的分支和运行生命周期；不是刷新整个页面，也不新建 Thread。状态与操作说明见[回复操作栏](/plugins/response-footer.md#hook)。
