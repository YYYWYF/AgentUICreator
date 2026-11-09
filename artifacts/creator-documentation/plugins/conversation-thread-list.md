# 会话列表（conversation-thread-list）

点击记录打开对话，可搜索会话并使用已接入的管理操作。

日常调整可以交给 Creator；需要自己写代码时，直接查看[属性](#属性)。

![查找与切换会话（conversation-thread-list）界面示例](/images/plugins/conversation-thread-list.png)

## 启用与使用

在 **Creator 输入框**输入 `/enable conversation-thread-list`，点击下图中的 **「查找与切换会话」**。

![Creator 启用菜单：点击「查找与切换会话」，插件 ID 为 conversation-thread-list](/images/plugins/enable/conversation-thread-list.jpg)

## 使用前提

按[历史服务接入](/development/history-backend.md)配置列表和详情，按业务需要支持重命名、归档与删除。

重命名、归档与取消归档通过项目的业务接口执行；接口缺失或请求失败会报错。已归档记录显示在「已归档会话」区域，可在那里取消归档；列表接口需返回对应的归档状态。请求约定和接入位置见[会话管理接口](/development/history-backend.md#重命名归档与取消归档)。

## 定制选项

| 可以改什么   | 效果                      |
| ------- | ----------------------- |
| 显示搜索框   | 显示或隐藏会话搜索框。             |
| 搜索提示    | 修改搜索框里的提示文字。            |
| 每条会话的操作 | 选择是否显示重命名、归档、取消归档和删除入口。 |
| 已归档会话   | 显示或隐藏归档区域，沿用会话搜索与条目定制。  |
| 列表大小和外观 | 调整侧栏宽度、背景和内边距。          |
| 列表上方的按钮 | 在列表顶部增加自己的操作。           |
| 每条会话的排版 | 自定义会话名称、图标和按钮的排列。       |

新建会话使用[新建会话插件](/plugins/conversation-new.md)。

## 需求示例

```text
请修改「查找与切换会话（conversation-thread-list）」：
修改：搜索提示改为【搜索历史对话】，列表内边距设为【12px】。
保留：搜索、打开会话和现有会话操作。
```

## 属性

打开项目中的 `plugins/conversation-thread-list/index.tsx`，在已有公开组件调用处设置属性或调整组合。修改外观时，保留文件中读取会话状态、调用服务、显示子插件和注册消息组件的代码。

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalConversationThreadList`；类型：`ConversationThreadListPluginProps`。继承 `aside` 原生属性。

| 属性                  | 类型                                                             | 省略时 / 用途                                 |
| ------------------- | -------------------------------------------------------------- | ---------------------------------------- |
| `showSearch?`       | `boolean`                                                      | 默认 `true`；设为 `false` 同时取消搜索条件对列表的过滤      |
| `showArchived?`     | `boolean`                                                      | 默认 `true`，展示归档会话区                        |
| `searchProps?`      | `Partial<ComponentProps<typeof ConversationThreadListSearch>>` | 搜索组件属性                                   |
| `itemProps?`        | `ConversationThreadListItemProps`                              | 列表项属性，见下表                                |
| `components?`       | `{ ThreadListItem?: ComponentType }`                           | 替换列表项组件                                  |
| `headerActions?`    | `ReactNode`                                                    | 顶部操作区                                    |
| `children?`         | `ReactNode`                                                    | 替换默认列表主体；外层错误提示仍由组件处理                    |
| `snapshot?`         | `ConversationThreadListPluginProps['snapshot']`                | 宿主页面传入的会话状态；单独使用组件时默认为 `{}`，字段见下文        |
| `serviceAvailable?` | `boolean`                                                      | 宿主页面提供的会话服务是否可用，单独使用组件时默认 `false`        |
| `onRefresh?`        | `() => void \| Promise<void>`                                  | 列表加载失败后的重试方法                             |
| `theme?`            | [`AgentUITheme`](/plugins/theme-switch.md#agentuitheme)        | 宿主页面传入的主题；单独使用组件时默认 `light`，生成项目会传入自己的主题 |
| `runStatus?`        | `string`                                                       | 宿主页面传入的运行状态，用于标记当前会话是否正在运行               |

| `itemProps` 字段 | 类型                                                                        | 用途      |
| -------------- | ------------------------------------------------------------------------- | ------- |
| `onNavigate?`  | `() => void`                                                              | 导航回调    |
| `actions?`     | [`ConversationThreadListItemActions`](#conversationthreadlistitemactions) | 操作可见性配置 |

`snapshot` 字段均可选：`activeConversationId`、`listStatus`、`detailStatus`、`listError`、`detailError`、`detailErrorConversationId`，类型均为 `string`。这些值继续从项目已有的会话服务和主题设置中读取。

另导出的旧组件 `CanonicalConversationThreadListRailAction` 已弃用，推荐使用独立的 `conversation-new`。它仍公开 `enabled?: boolean`（默认 `true`）、`buttonProps?: ComponentProps<typeof ConversationThreadListNew>`、`tooltipProps?: ComponentProps<typeof AgentUITooltip>`、`tooltipContentProps?: ComponentProps<typeof AgentUITooltipContent>`。

### 类型说明

#### ConversationThreadListItemActions

控制列表项菜单中显示哪些操作；这些字段是开关，不是操作回调。

```ts
interface ConversationThreadListItemActions {
  rename?: boolean; // 重命名
  archive?: boolean; // 归档
  unarchive?: boolean; // 取消归档
  delete?: boolean; // 删除
}
```

省略整个 `actions` 时保留默认的全部操作；传入对象后，只有值为 `true` 的操作才显示。

### 类型查询

React 原生属性、组件组合及嵌套会话数据等复杂类型，可在编辑器中查询。通过公开组件取得完整属性类型：

```ts
import type { ComponentProps } from 'react';
import type { CanonicalConversationThreadList } from '@za38.03/agent-ui-plugins';

type ImplementationProps = ComponentProps<typeof CanonicalConversationThreadList>;
```

组件定制方式见[组件定制指南](/development/component-customization.md)；配置位置和子插件顺序见[布局与插件组合](/development/layout-and-composition.md)。

列表项默认按钮与无障碍文案统一在 `locales.threadList` 修改，`itemProps` 只配置操作和导航。 所有语言覆盖均需保持 `en-US` / `zh-CN` 对应。
