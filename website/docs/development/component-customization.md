---
title: "组件属性与组合定制"
---

# 组件属性与组合定制

修改已有插件时，先打开项目中的 `plugins/<插件名>/index.tsx`。它是项目自己的定制入口，可以给公开组件传属性、替换子组件或自定义渲染函数。完成这些修改不需要接管官方源码。

各插件页面的“属性”列出完整属性、类型、默认行为与嵌套配置。页面会分别说明可修改的展示属性，以及会话自动传入的数据和方法。调整外观时，保留原有传参和函数调用。

## 示例：调整输入框

新生成的 `plugins/composer/index.tsx` 使用 npm 组件的薄应用入口。保留现有导入、别名和转发参数，在已有 JSX 上设置需要修改的属性：

```tsx
import { ConversationComposerPlugin as Composer } from '@za38.03/agent-ui-plugins/composer';
import type { ComponentProps } from 'react';

export const ConversationComposerPlugin = (props: ComponentProps<typeof Composer>) => {
  return <Composer {...props} rows={3} maxLength={2000} />;
};
```

这是薄应用入口的示例，npm 实现继续负责原有的语义插槽与会话接线。已有源码项目或自定义入口应保留自己的组件、作用域和 `renderSlot(...)` 调用；不要为了套用示例重建入口。底层公开展示组件 `ConversationCanonicalComposer` 仍可用于需要自行组合的场景。

`input` 插槽未配置独立组件时，包内部提供默认输入框，并应用 `rows`、`maxLength`、`submitMode`。该插槽有独立插件或项目传入自定义 React 元素时，它优先显示；这时在那个组件的项目入口中调整输入属性。

| 属性 | 类型 | 省略时 / 用途 |
| --- | --- | --- |
| `rows`、`maxLength`、`submitMode`、`inputProps` | `ConversationComposerInputProps` | 传给默认输入组件，支持 `rows`、`maxLength` 等输入属性 |
| `className`、`style`、`onSubmit` | 标准 React 属性 | 直接设置整体样式和提交事件 |
| `dropzoneProps` | `ConversationComposerDropzoneProps` | 拖入附件区域的属性 |
| `autoFocus` | `boolean` | 沿用项目输入设置，决定是否自动进入输入状态 |
| `input`、`beforeInput`、`leadingActions`、`trailingActions`、`submitAction`、`triggers` | `ReactNode` | 输入区内的各个位置，通过已有 `renderSlot(...)` 调用显示对应子插件 |

完整类型可由编辑器读取已安装包：

```ts
import type { ConversationCanonicalComposerProps } from '@za38.03/agent-ui-plugins';

type InputOptions = ConversationCanonicalComposerProps['inputProps'];
```

插件固定文案随 npm 的统一语言层提供；项目可以按需覆盖输入提示等呈现文字，见[样式与文案开发](./styling-and-localization)。

## 选择合适的定制方式

| 目标 | 使用方式 |
| --- | --- |
| 改尺寸、样式或行为选项 | 组件公开 props，原生输入/按钮 props，项目 CSS |
| 更换图标或固定内容 | `children` 或组件提供的内容属性 |
| 改变结果卡片的结构 | 组件提供的 `render…` 回调，见[结果展示](./custom-renderers) |
| 独立启停、排序或更换子功能 | 对应功能的插槽与[布局配置](./layout-and-composition) |
| 公开接口确实无法满足，需要维护实现内部逻辑 | 单独评估[源码接管](./source-takeover) |

不同插件开放的属性不同，从[插件](/plugins/)进入对应页面。修改组件时，继续传入已有会话状态、服务方法和当前消息数据，并保留 `renderSlot(...)` / `renderScopedSlot(...)` 调用。这样子插件仍能显示，发送、重试等操作也继续使用同一个会话。

`renderSlot(name, fallback)` 按名称显示配置好的子插件，例如输入框旁的附件按钮。`renderScopedSlot(name, scope, fallback)` 还会传入本次渲染的数据，例如当前工具调用或推理分组。`scope.kind` 表示数据类型，`scope.value` 是具体数据；不同类型使用同一个函数。两个函数均由插件运行环境提供，详见[组件与子插槽](./plugin-api#组件与子插槽)。

修改事件回调时检查组件是否继续执行默认动作。某些操作支持通过 `event.preventDefault()` 阻止默认行为；不要在只想记录点击时意外阻止发送、复制或重试。

默认文案统一在 `application/locales.ts` 的对应命名空间修改。例如输入提示用 `composer.placeholder`，欢迎语用 `conversation.welcome`，示例问题用 `starterSuggestions`。原生属性与渲染函数继续负责行为和结构。
