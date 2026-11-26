---
title: "功能菜单（navigation-menu）"
---

# 功能菜单（navigation-menu）

## 功能与效果

在会话列表上方添加功能入口，点击后切换右侧内容，或执行新建会话、刷新等操作。默认提供“新建会话”，其他菜单项可以按需添加。

### 界面效果

**平台式：**功能菜单显示在会话列表上方。

![功能菜单位于会话列表上方](/images/plugins/navigation-menu-expanded.png)

**收起侧栏：**菜单保留图标，点击图标仍可切换内容。

![收起后通过图标选择功能](/images/plugins/navigation-menu-collapsed.png)

**助理式和嵌入式：**菜单显示为右上角的图标按钮。

![右上角的新建会话图标和历史会话按钮](/images/plugins/navigation-menu-toolbar.png)

## 修改与启用

### 添加和修改菜单项

以下路径相对于生成目录，默认为 `src/agent-ui/`。

修改 `plugins/navigation-menu/index.tsx` 中菜单组件的 `items` 属性。例如，在“新建会话”后加入“项目空间”：

```tsx
items={props.items ?? (defaults => [
  ...defaults,
  {
    id: 'projects',
    type: 'view',
    viewId: 'projects',
    label: messages.projects,
    icon: <FolderKanbanIcon />,
  },
])}
```

`messages` 用 `useLocale('navigationMenu')` 读取，`FolderKanbanIcon` 从 `lucide-react` 导入。保留组件上的其他属性。

| 想调整什么 | 修改方式 |
| --- | --- |
| 文字和图标 | 修改菜单项的 `label`、`icon`；自定义文字见[语言与文案](/development/localization) |
| 菜单顺序 | 调整数组中的排列顺序 |
| 保留“新建会话” | 保留 `...defaults`；放在最前面就是首项 |
| 移除某个入口 | 从数组中删除对应菜单项；直接传数组可替换全部默认项 |
| 暂时禁用入口 | 为该项设置 `disabled: true` |

## 常见定制

### 菜单与右侧内容联动 {#content-switching}

点击“项目空间”后，右侧显示对应的功能内容：

<figure className="plugin-preview navigation-menu-demo">

![点击项目空间后，右侧显示项目内容](/images/plugins/navigation-menu-projects.png)

</figure>

先准备要显示的功能插件，例如 `project-workspace`。如果是新插件，按[创建自定义插件](/development/create-plugin)完成创建和注册。

#### 1. 将内容放入右侧 Stack

在 `app-ui.json` 中找到右侧的 Stack，保留原有聊天分支，在 `children` 末尾追加项目插件：

```json fold height=180
{
  "type": "slot",
  "plugins": [
    { "id": "project-workspace-view", "pluginId": "project-workspace" }
  ]
}
```

在同一个 Stack 上设置以下属性，`children` 保留原有内容和刚追加的分支：

```json fold height=180
{
  "id": "main",
  "viewIds": ["chat", "projects"],
  "keepMounted": true
}
```

| 字段 | 配置方式 |
| --- | --- |
| `id` | 给 Stack 命名，供菜单和其他插件选择它 |
| `viewIds` | 按 `children` 的顺序命名：第一项聊天为 `chat`，第二项项目空间为 `projects` |
| `keepMounted` | 设为 `true`，切走后保留内容组件的界面状态 |

#### 2. 对应菜单与内容

上面菜单项的 `viewId: 'projects'` 对应 Stack 中的 `projects` 分支。点击后，右侧就会显示这个分支。

菜单默认控制 `id: "main"` 的 Stack。要控制其他 Stack，将菜单组件的 `stackId` 设置为对应的 ID。

**菜单项显示为灰色时，检查目标 Stack 是否存在，以及 `viewId` 是否已加入它的 `viewIds`。**

### 让其他插件切换内容

在调用方插件 `definition.ts` 的原有 `inject` 数组中追加 `'agent-ui.stack-navigation'`。然后在按钮组件中取得服务，点击时选择目标内容：

```tsx fold height=180
import {
  Button, usePluginService, STACK_NAVIGATION_SERVICE,
  type StackNavigationService,
} from '@za38.03/agent-ui-plugins';

export function OpenProjects({ label }: { label: string }) {
  const service = usePluginService<StackNavigationService>(STACK_NAVIGATION_SERVICE);
  return (
    <Button onClick={() => service?.selectView('main', 'projects')}>
      {label}
    </Button>
  );
}
```

`label` 传入按钮文字。`selectView('main', 'projects')` 表示显示 `main` 容器里的 `projects` 内容；返回当前聊天用 `selectView('main', 'chat')`。切换后，菜单的选中状态也会同步更新。

### 添加执行操作的菜单项

刷新数据等操作使用 `type: 'action'`，在 `onSelect` 中执行自己的函数。将下面的条目加入 `items`：

```tsx fold height=180
{
  id: 'refresh',
  type: 'action',
  label: labels.refresh,
  icon: <RefreshCwIcon />,
  onSelect: refresh,
}
```

`labels.refresh` 使用你配置的菜单文案，`RefreshCwIcon` 从 `lucide-react` 导入，`refresh` 是你的刷新函数。`onSelect` 可以返回 Promise；执行期间会阻止重复点击，失败后可重试。

## 属性与 API

### 属性参考 {#api}

| 属性 | 用法 |
| --- | --- |
| `items` | 菜单项数组，或接收默认项并返回数组的函数；`items={[]}` 清空菜单 |
| 视图项 | `{ id, type: 'view', viewId, label, icon?, disabled? }`，选择右侧内容 |
| 操作项 | `{ id, type: 'action', label, icon?, disabled?, onSelect }`，执行操作 |
| `stackId` | 要控制的 Stack ID，默认 `main` |
| `presentation` | `sidebar`（默认）显示侧栏菜单，`toolbar` 显示图标按钮 |
| `defaultOpen` | 侧栏是否初始展开，默认 `true` |
| `onNewConversation` | 自定义“新建会话”的点击行为 |
| `header` / `content` | 侧栏顶部和菜单下方的内容；使用插件插槽时配置同名子 Slot |
| `service` | 显式传入切换服务，通常无需设置 |
| 原生 `nav` 属性 | 支持 `className`、`style`、`aria-label` 等；下方内容用 `content` 传入 |

#### 切换服务的方法

| 方法 | 用途 |
| --- | --- |
| `selectView(stackId, viewId)` | 选择指定内容 |
| `getSnapshot()` | 获取当前选择；例如 `getSnapshot().stacks.main?.activeViewId` |
| `subscribe(listener)` | 监听选择变化，返回取消订阅函数 |

需要持续展示选中状态时，见[插件联动与取数](/development/plugin-interaction)。
