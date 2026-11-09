# 新建会话（conversation-new）

点击后进入空白对话，可以重新输入问题；之前的会话记录仍保留在历史列表中。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![新建会话（conversation-new）界面示例](/images/plugins/conversation-new.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable conversation-new`，点击下图中的 **「新建会话」**。

![Creator 启用菜单：点击「新建会话」，插件 ID 为 conversation-new](/images/plugins/enable/conversation-new.jpg)

在会话列表或现有页面的新建入口创建对话。开发者加入此能力后，检查新建后输入区和列表是否指向新会话。

## 定制选项

| 可以改什么       | 效果               |
| ----------- | ---------------- |
| 显示文字还是只显示图标 | 选择显示按钮文字，或只显示加号。 |
| 按钮图标和文字     | 换成自己的图标或按钮内容。    |
| 按钮大小和外观     | 调整大小、颜色、边框和圆角。   |
| 按钮周围的间距     | 调整按钮与周围内容的距离。    |
| 鼠标提示        | 修改提示内容和出现的位置。    |

## 需求示例

```text
请修改「新建会话（conversation-new）」：
修改：按钮改为【只显示图标】，圆角设为【8px】。
保留：新建会话和保留历史记录的行为。
```

## 属性

打开项目中的 `plugins/conversation-new/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalConversationNew`；类型：`ConversationNewPluginProps`。继承外层 `div` 原生属性，但 `onClick` 单独转发给按钮。

| 属性                     | 类型                                                            | 省略时 / 用途                                     |
| ---------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `showLabel?`           | `boolean`                                                     | 组件默认 `true`；部分初始化模板设置为 `false`，仅显示图标但保留无障碍名称 |
| `disabled?`            | `boolean`                                                     | 禁用新建按钮                                       |
| `onClick?`             | `ComponentProps<typeof ConversationThreadListNew>['onClick']` | 新建按钮点击回调                                     |
| `buttonProps?`         | `ComponentProps<typeof ConversationThreadListNew>`            | 按钮属性，保留默认新建与导航行为                             |
| `tooltipProps?`        | `ComponentProps<typeof AgentUITooltip>`                       | 提示根组件配置                                      |
| `tooltipContentProps?` | `ComponentProps<typeof AgentUITooltipContent>`                | 提示内容与位置配置                                    |
| `children?`            | `ReactNode`                                                   | 自定义按钮内容                                      |

### 类型查询

可在编辑器中通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalConversationNew } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalConversationNew>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
