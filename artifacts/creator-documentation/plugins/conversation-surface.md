# 会话界面（conversation-surface）

用户可以在同一区域阅读已有对话、查看新回复并继续提问；工具结果、计划等内容会显示在对应的消息中。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![显示完整对话区（conversation-surface）界面示例](/images/plugins/conversation-surface.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable conversation-surface`，点击下图中的 **「显示完整对话区」**。

![Creator 启用菜单：点击「显示完整对话区」，插件 ID 为 conversation-surface](/images/plugins/enable/conversation-surface.jpg)

## 显示条件与数据来源

**数据来源：**&#x4F1A;话界面由已有 Runtime 的消息、运行状态和子插件组成。普通回答使用[文字 SSE 示例](/plugins/ag-ui-data.md#共用的-sse-格式)，工具、思考和自定义卡片使用[各自事件](/plugins/ag-ui-data.md#按展示内容找事件)。历史消息由会话数据源加载。启用会话界面不会自动启用所有内容插件；无对应渲染器时不会凭事件名称创建新插件。

## 定制选项

| 可以改什么     | 效果                  |
| --------- | ------------------- |
| 对话区大小     | 调整高度、宽度和最小高度。       |
| 对话区外观     | 调整背景、边框、圆角和间距。      |
| 空白对话的备用内容 | 没有配置欢迎区时，显示一段自定义内容。 |

## 需求示例

```text
请修改「显示完整对话区（conversation-surface）」：
修改：对话区背景改为【浅灰色】，内边距设为【16px】，圆角设为【12px】。
保留：现有消息、欢迎区和输入区的组合。
```

## 属性

打开项目中的 `plugins/conversation-surface/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalConversationSurfacePlugin`；类型：`ConversationSurfacePluginProps`。继承 `div` 原生属性，排除 `children`。

| 属性               | 类型                                                                                                               | 省略时 / 用途                     |
| ---------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `autoFocus?`     | `boolean`                                                                                                        | 传给当前会话组件，决定是否自动聚焦输入框         |
| `welcome?`       | `ReactNode`                                                                                                      | 欢迎区内容；`emptyWelcome` 插槽优先    |
| `suggestions?`   | `ReactNode`                                                                                                      | 建议内容；`emptySuggestions` 插槽优先 |
| `composer?`      | `ReactNode`                                                                                                      | 输入区内容；`composer` 插槽优先        |
| `Adapter?`       | `ComponentType<ConversationSurfaceAdapterProps>`                                                                 | 负责显示消息和输入区的现有会话组件；没有时不显示会话主体 |
| `rendererSlots?` | `{ toolTimeline?: boolean; reasoningGroup?: boolean; thinkingIndicator?: boolean; transientMessages?: boolean }` | 标明当前启用了哪些消息展示插件；继续使用项目生成的配置  |
| `snapshot?`      | `{ mode?: string; detailStatus?: string }`                                                                       | 宿主页面传入的会话状态，用于给容器添加状态标记      |

`Adapter` 属性包括 `autoFocus`、`className`、`rendererSlots`、`welcome`、`suggestions`、`composer`、`renderScopedSlot`；完整类型见[类型查询](#类型查询)。外层 `className`／`style` 用于插件容器，不会自动变为 `Adapter` 组件的属性。

### 类型查询

可在编辑器中通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalConversationSurfacePlugin } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalConversationSurfacePlugin>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。

默认欢迎语及编辑、停止等按钮文案只从统一 `locales.conversation` 读取。标题用 `welcome`，说明用 `welcomeDescription`（空字符串隐藏）；在项目 `application/locales.ts` 中修改。`welcome` / `suggestions` 的 ReactNode 属性和语义插槽用于结构替换。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。
