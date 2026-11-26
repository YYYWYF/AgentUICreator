# 回复复制（copy-action）

## 功能与效果

复制当前版本整次回答的文字，包含工具续跑后产生的多段助理内容。


### 复制完整回复


![复制完整回复界面](/images/plugins/copy-action.png)

在已有回复操作栏中使用，组件读取当前回答的内容与可用状态。

回答文字由 `TEXT_MESSAGE_CONTENT.delta` 追加，复制使用当前版本的完整回答文本。事件格式见[文字回复](/plugins/ag-ui-data.md#共用的-sse-格式)。

## 常见定制




### 按钮尺寸与提示位置 \{#尺寸与提示位置}


调整复制按钮的展示；按钮继续操作当前整次回复。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationCanonicalResponseCopyAction } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationCanonicalResponseCopyAction>) {
  return <ConversationCanonicalResponseCopyAction {...props}
    variant="ghost"
    size="icon-sm"
    side="top" />;
}
```


### 禁用状态 \{#按业务状态禁用}


![复制完整回复界面](/images/plugins/features/copy-action-states.png)

同一次回答中的可用与禁用状态。

示例直接禁用；实际项目把 true 换成自己的权限或业务状态表达式。组件仍叠加当前会话的可用性判断。

```tsx fold height=180
import type { ComponentProps } from 'react';
import { ConversationCanonicalResponseCopyAction } from '@za38.03/agent-ui-plugins';

export function Example(props: ComponentProps<typeof ConversationCanonicalResponseCopyAction>) {
  return <ConversationCanonicalResponseCopyAction {...props}
    disabled={true} />;
}
```

## 属性与 API



### API

组件：`ConversationCanonicalResponseCopyAction`。保留提示按钮的原生样式、事件与 icon 属性；默认提示从 locales 读取。

| 属性          | 类型                                              | 省略时 / 用途                           |
| ----------- | ----------------------------------------------- | ---------------------------------- |
| `icon?`     | `ReactNode`                                     | 自定义操作图标；文案使用统一 locale              |
| `disabled?` | `boolean`                                       | 与回答生成中／没有正文的禁用条件叠加                 |
| `onClick?`  | `ConversationTooltipIconButtonProps['onClick']` | 调用后执行复制；`preventDefault()` 可阻止默认动作 |

复制范围为当前完整回答的文本，由现有会话提供。

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

默认提示文案只读取 `locales.common.copy`，失败提示读取 `locales.copyAction.failed`。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。


自定义“复制到业务表单”等操作时，在已有回复页脚中调用 `useResponse()`，使用 `text` 取得当前版本的整次回答；它会包含工具续跑后的多段助理文字。业务动作可沿用[保存整次回答](/plugins/response-footer.md#收藏或保存整次回答)的按钮示例，将 `save` 接到自己的表单方法。只改复制按钮外观时，使用前面的组件属性即可。
