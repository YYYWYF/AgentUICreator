# 回复操作栏（response-footer）

同一次回复即使分成多段，也**只在最后显示一组操作**。具体显示哪些按钮，由项目选择的操作插件决定。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![回复操作栏（response-footer）界面示例](/images/plugins/response-footer.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable response-footer`，点击下图中的 **「回复操作栏」**。

![Creator 启用菜单：点击「回复操作栏」，插件 ID 为 response-footer](/images/plugins/enable/response-footer.jpg)

## 定制选项

| 可以改什么         | 效果                                                 |
| ------------- | -------------------------------------------------- |
| 显示哪些操作        | 组合复制、重试、评价、导出或自己的按钮。                               |
| 按钮间距和外观       | 调整操作栏的布局、间距、背景和圆角。                                 |
| 生成期间隐藏        | 决定回复尚未结束时是否隐藏操作栏。                                  |
| 鼠标移上去才显示      | always 对所有回复使用自动隐藏；not-last 仅隐藏较早回复的操作；never 始终显示。 |
| 只有一个版本时隐藏切换箭头 | 不需要切换版本时，隐藏左右箭头。                                   |
| 版本切换按钮        | 修改左右按钮的提示、图标和大小。                                   |

## 需求示例

```text
请修改「回复操作栏（response-footer）」：
修改：按钮间距设为【8px】，操作栏在【回复完成后始终显示】。
保留：现有操作按钮和版本切换，每次完整回复只显示一组操作栏。
```

## 属性

打开项目中的 `plugins/response-footer/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`ConversationCanonicalResponseFooter`；类型：`ConversationCanonicalResponseFooterProps`。继承 `div` 原生属性。

| 属性                   | 类型                                      | 省略时 / 用途                     |
| -------------------- | --------------------------------------- | ---------------------------- |
| `actions?`           | `ReactNode`                             | 操作栏内容；插件入口默认从 `actions` 插槽取得 |
| `children?`          | `ReactNode`                             | 替换默认分支切换与操作栏                 |
| `actionBarProps?`    | `ConversationResponseActionBarProps`    | 操作栏配置，见下表                    |
| `branchPickerProps?` | `ConversationResponseBranchPickerProps` | 分支切换配置，见下表                   |

| 嵌套属性                                      | 类型                                            | 省略时 / 用途                      |
| ----------------------------------------- | --------------------------------------------- | ----------------------------- |
| `actionBarProps.hideWhenRunning?`         | `boolean`                                     | 默认 `true`，运行时隐藏               |
| `actionBarProps.autohide?`                | `'always' \| 'not-last' \| 'never'`           | 默认 `not-last`，控制哪些回答的操作栏自动隐藏  |
| `actionBarProps.autohideFloat?`           | `'always' \| 'single-branch' \| 'never'`      | 控制浮动操作栏何时自动隐藏，省略时使用现有操作栏的默认设置 |
| `actionBarProps.asChild?`                 | `boolean`                                     | 把操作栏属性传给已有子元素，避免再增加一层容器       |
| `actionBarProps.render?`                  | `ReactElement`                                | 自定义操作栏元素                      |
| `actionBarProps.children?`                | `ReactNode`                                   | 优先于 `actions` 的操作内容           |
| `branchPickerProps.hideWhenSingleBranch?` | `boolean`                                     | 默认 `true`，单分支或不能切换时隐藏         |
| `branchPickerProps.previousProps?`        | `Partial<ConversationTooltipIconButtonProps>` | 上一分支按钮                        |
| `branchPickerProps.nextProps?`            | `Partial<ConversationTooltipIconButtonProps>` | 下一分支按钮                        |
| `branchPickerProps.children?`             | `ReactNode`                                   | 替换默认分支按钮和计数                   |

两个嵌套对象均继承 `div` 原生属性。分支切换针对当前整次回答，继续使用现有会话的方法。

### 类型查询

可在编辑器中通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { ConversationCanonicalResponseFooter } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof ConversationCanonicalResponseFooter>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。
