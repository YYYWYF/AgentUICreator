# 工具调用分组（tool-group）

收起时显示调用数量，例如「2 次工具调用」。展开后可以看到组内每个工具的名称和状态，并继续打开单次调用的详情。

组内出现等待审批或用户操作的工具时，默认自动展开，直接显示待处理内容；仍可手动收起。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![展开多个工具调用（tool-group）界面示例](/images/plugins/tool-group.jpg)

## 启用与使用

在 **Creator 输入框**输入 `/enable tool-group`，点击下图中的 **「展开多个工具调用」**。

![Creator 启用菜单：点击「展开多个工具调用」，插件 ID 为 tool-group](/images/plugins/enable/tool-group.jpg)

## 显示条件与数据来源

**数据来源：**&#x5F53;前回复中的工具调用。服务端发送[通用工具事件](/plugins/ag-ui-data.md#通用工具事件)后，界面将调用组织成分组，可展开查看参数、状态和结果。已配置的专用工具卡片和子任务展示会继续生效。

## 定制选项

| 可以改什么     | 效果                                     |
| --------- | -------------------------------------- |
| 开始时展开还是收起 | 选择默认展开组内工具，或只显示摘要。                     |
| 背景和边框     | outline 显示边框，ghost 使用透明背景，muted 使用淡背景。 |
| 摘要按钮样式    | 调整工具数量和摘要所在按钮的外观。                      |
| 详情区域样式    | 调整展开后的背景、间距和边框。                        |

## 需求示例

```text
请修改「展开多个工具调用（tool-group）」：
修改：工具组默认【收起】，背景改为【淡灰色】，摘要按钮字号设为【13px】。
保留：现有工具数量、执行状态和详情交互。
```

## 属性

打开项目中的 `plugins/tool-group/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`ConversationCanonicalToolGroup`；类型：`ConversationCanonicalToolGroupProps`。继承公开 ToolGroupRoot 的属性，排除 `children`、`open`、`defaultOpen`、`onOpenChange`。插件入口缺少 `group` 时不渲染。

| 属性                  | 类型                                                          | 省略时 / 用途                                                       |
| ------------------- | ----------------------------------------------------------- | -------------------------------------------------------------- |
| `group`             | `ConversationMessagePartGroup`                              | 会话运行环境提供的当前工具分组；单独使用展示组件时必需                                    |
| `children?`         | `ReactNode`                                                 | 组内工具内容                                                         |
| `expanded?`         | `boolean`                                                   | 受控展开                                                           |
| `defaultExpanded?`  | `boolean`                                                   | 初始展开状态；省略时，含待处理操作的组展开，其余收起。后续进入待处理状态时自动展开；`expanded` 可完全控制展开状态 |
| `onExpandedChange?` | `(expanded: boolean) => void`                               | 展开变化通知                                                         |
| `buttonProps?`      | `Partial<ComponentProps<typeof ToolGroupTrigger>>`          | 标题按钮，支持 `count`、`active` 和原生属性；默认从分组推导数量与运行状态                  |
| `contentProps?`     | `Omit<ComponentProps<typeof ToolGroupContent>, 'children'>` | 折叠内容面板属性                                                       |
| `variant?`          | `'outline' \| 'ghost' \| 'muted' \| null`                   | 完整工具组组件默认 `ghost`                                              |

根组件还继承外观、无障碍与其余折叠根组件属性。子组件类型从公开 `/plugin-support` 入口取得。

### 类型查询

可在编辑器中通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { ConversationCanonicalToolGroup } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof ConversationCanonicalToolGroup>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
