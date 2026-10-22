---
title: "AppUIModel 布局与组合参数"
---

# AppUIModel 布局与组合参数

需要手动调布局时，编辑生成目录 app-ui 中的现有 AppUIModel。先复制当前文件作审查或使用版本控制，按局部目标调整，不整体覆盖已有组合。

## 顶层与 Plugin 节点

| 字段 | 用途 |
| --- | --- |
| `applicationPlugins` | 不占布局区域的项目功能设置。 |
| `root` | 页面布局根节点。 |
| `id` | 可选。省略时自动生成确定性的运行时身份；已有显式身份继续兼容。 |
| `pluginId` | 已注册 Plugin 的准确名称。 |
| `enabled` | 可选，省略时默认为 `true`；显式设为 `false` 可停用实例，停用不等于删除源码。 |
| `slots` | 该 Plugin 允许的子内容组合。 |

新建项目和 Creator 保存组合时会省略 `enabled: true`，仅保留禁用实例的
`enabled: false`。解析后的内部模型仍包含明确的布尔值。

默认模板也不写 Plugin 实例的 `id`。Creator 用当前快照的临时 `pN` 引用编辑，
引用和自动 ID 都不会保存进 JSON。相同结构生成相同运行时 ID；移动或重排可能
改变自动 ID。需要跨布局调整保持组件身份时，可继续显式填写 `id`。
侧栏导航项的 `id` 和 `defaultActive` 仍需保留。

## 布局节点

| type | 常用字段 | 作用 |
| --- | --- | --- |
| `row` | children、gap、sizes | 横向分配。 |
| `column` | children、gap、sizes | 纵向分配。 |
| `panel` | child、width、height、minWidth、maxWidth、resizable | 控制区域尺寸。 |
| `stack` | children、activeIndex | 在已有区域间选择当前内容。 |
| `slot` | plugins | 放置 Plugin 组合。 |
| `sidebar` | items、content、defaultActive、header、footer | 侧栏与主体。 |

轨道 sizes 可用 `minmax(0, 1fr)` 等网格语法；Panel width/height 使用实际 CSS 元素尺寸，不能写 `1fr`。gap 采用已有数值约定。

## 局部示例

下面只替换当前布局中需要调整的区域，保留原有服务和其他节点：

```json
{
  "type": "column",
  "gap": 12,
  "sizes": [
    "minmax(0, 1fr)"
  ],
  "children": [
    {
      "type": "slot",
      "plugins": [
        {
          "pluginId": "conversation-surface"
        }
      ]
    }
  ]
}
```

## 子内容组合

composer 的 input、submitAction、leadingActions 等分别放输入、发送与附件动作。response-footer 的 actions 放回复操作。位置名称以该 Plugin 公开支持的 Slot 为准，单项位置不要重复添加多个主控件。

组件颜色、文案、函数和 renderer 在项目组件文件里配置，不放入此 JSON。改完运行检查，再查看窄屏、滚动与键盘焦点。更多步骤见[布局教程](./layout-and-composition)。

> 截图待补：局部 JSON 修改与实际宽度、间距和控件位置的前后对照。
