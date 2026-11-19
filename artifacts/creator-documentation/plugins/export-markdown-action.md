# Markdown 回复导出（export-markdown-action）

将当前版本的完整回答导出为 Markdown，支持独立按钮和菜单入口。





## Markdown 导出


![Markdown 导出界面](/images/plugins/export-markdown-action.png)

在已有回复操作栏中使用，组件读取当前回答的内容与可用状态。

```tsx
import { ConversationCanonicalResponseExportMarkdownAction } from '@za38.03/agent-ui-plugins';

export function ResponseAction() {
  return <ConversationCanonicalResponseExportMarkdownAction presentation="button" />;
}
```

## 菜单中的 Markdown 导出 \{#菜单中的-markdown-导出}


将组件放进项目已有菜单内容中。直接配置菜单项属性；该模式不使用按钮的 size/variant。

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalResponseExportMarkdownAction } from '@za38.03/agent-ui-plugins';

export function Example(props: Extract<ComponentProps<typeof ConversationCanonicalResponseExportMarkdownAction>, { presentation: "menu" }>) {
  return <ConversationCanonicalResponseExportMarkdownAction {...props}
    presentation="menu"
    className={[props.className, "project-export-item"].filter(Boolean).join(" ")} />;
}
```


## 独立的描边导出按钮 \{#独立的描边导出按钮}

按钮样式与菜单项分别配置，导出的仍是当前整次回复。

```tsx
import type { ComponentProps } from 'react';
import { ConversationCanonicalResponseExportMarkdownAction } from '@za38.03/agent-ui-plugins';

export function Example(props: Extract<ComponentProps<typeof ConversationCanonicalResponseExportMarkdownAction>, { presentation?: "button" }>) {
  return <ConversationCanonicalResponseExportMarkdownAction {...props}
    presentation="button"
    size="sm"
    variant="outline" />;
}
```

## 禁用状态


![导出按钮的可用与禁用状态](/images/plugins/features/export-markdown-action-states.png)

两种模式统一使用 `disabled`。生成中或没有正文时，组件也会自动禁用。

```tsx
import { ConversationCanonicalResponseExportMarkdownAction } from '@za38.03/agent-ui-plugins';

export function DisabledExport() {
  return <ConversationCanonicalResponseExportMarkdownAction
    presentation="button" disabled />;
}
```

## API



组件：`ConversationCanonicalResponseExportMarkdownAction`。保留提示按钮的原生样式、事件与 icon 属性；默认提示从 locales 读取。

| 属性              | 类型                                              | 省略时 / 用途                         |
| --------------- | ----------------------------------------------- | -------------------------------- |
| `icon?`         | `ReactNode`                                     | 自定义操作图标；文案使用统一 locale            |
| `presentation?` | `"button" \| "menu"`                            | 选择按钮或菜单项结构；组件默认按钮，插件入口默认菜单       |
| `disabled?`     | `boolean`                                       | 两种模式均生效                          |
| `onClick?`      | `ConversationTooltipIconButtonProps['onClick']` | 按钮模式点击回调，`preventDefault()` 阻止导出 |

当前插件入口使用菜单模式并放在更多操作菜单中。菜单模式使用 `onSelect?: (event: Event) => void`，同样支持 `preventDefault()`。生成中或无正文时不能导出。

### 按钮属性

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

默认导出文案只读取 `locales.conversation.exportMarkdown`，更多菜单标题读取 `moreActions`。`presentation?: "button" | "menu"` 选择结构，插件入口默认菜单模式。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。


需要把回答交给业务导出服务时，在已有回复页脚中调用 `useConversationResponseRuntime()`，将 `text` 传给项目导出方法；它是当前版本整次回答的文字，不包含附件本体或图表数据。完整调用与错误处理见[保存整次回答](/plugins/response-footer.md#收藏或保存整次回答)。只需下载 Markdown 时使用前面的现有导出组件。
