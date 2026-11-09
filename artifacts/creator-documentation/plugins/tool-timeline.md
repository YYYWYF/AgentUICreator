# 工具执行时间线（tool-timeline）

摘要显示工具调用的数量和运行状态；展开后按步骤展示动作及具体目标，例如读取的文件路径或执行的命令。它关注这条回复用了哪些工具，不表示构建或测试等后台作业的完成百分比。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![汇总工具执行过程（tool-timeline）界面示例](/images/plugins/tool-timeline.jpg)

## 启用与使用

在 **Creator 输入框**输入 `/enable tool-timeline`，点击下图中的 **「汇总工具执行过程」**。

![Creator 启用菜单：点击「汇总工具执行过程」，插件 ID 为 tool-timeline](/images/plugins/enable/tool-timeline.jpg)

## 显示条件与数据来源

**数据来源：**&#x6D88;费当前回复的工具调用和运行状态，不要求时间线专用事件。使用[通用工具事件](/plugins/ag-ui-data.md#通用工具事件)；同一回复的多次调用使用不同 `toolCallId`。已注册的专用工具和子任务可自行展示状态，不一定重复进入通用摘要。单独发送一段工具名称文字不会建立时间线。

## 定制选项

| 可以改什么     | 效果                 |
| --------- | ------------------ |
| 开始时展开还是收起 | 选择默认展开工具步骤，或只显示摘要。 |
| 显示几个步骤    | 设置最多显示多少个工具步骤。     |
| 摘要文字      | 分别修改执行结束和执行中显示的说明。 |
| 整体外观      | 调整宽度、背景、间距和边框。     |

## 需求示例

```text
请修改「汇总工具执行过程（tool-timeline）」：
修改：工具步骤默认【展开】，最多显示【4】步，执行中摘要改为【正在处理】。
保留：真实步骤和执行状态。
```

## 属性

打开项目中的 `plugins/tool-timeline/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`ConversationToolTimeline`；类型：`ConversationToolTimelineProps`。继承 `div` 原生属性，排除默认 `children` 定义。

| 属性                  | 类型                            | 省略时 / 用途                  |
| ------------------- | ----------------------------- | ------------------------- |
| `expanded?`         | `boolean`                     | 受控展开                      |
| `defaultExpanded?`  | `boolean`                     | 默认 `false`                |
| `onExpandedChange?` | `(expanded: boolean) => void` | 展开变化通知                    |
| `visibleSteps?`     | `number`                      | 默认全部步骤                    |
| `children?`         | `ReactNode`                   | 当前类型保留，但实现忽略；工具详情由独立渲染器展示 |

步骤来自当前助手消息的工具调用，不通过此属性表创建工具或新的运行状态。

### 类型查询

可在编辑器中通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { ConversationToolTimeline } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof ConversationToolTimeline>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。

摘要与进行中文案统一在 `locales.toolTimeline` 修改；保留 `{count}`、`{files}` 等占位符。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。
