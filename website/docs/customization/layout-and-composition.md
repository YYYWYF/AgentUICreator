---
title: 布局、语义 Slot 与 Plugin 组合
---

# 布局、语义 Slot 与 Plugin 组合

AppUIModel 是生成布局和 Plugin 实例组合的源。编辑前读取当前模型，保留已有实例 ID、启用状态与子 Slot，不把整份模型替换成教程示例。

## 布局节点

Row 横向分配，Column 纵向分配，Stack 选择当前区域，Panel 限定容器，Slot 放置语义贡献。已有 sidebar 表达侧栏导航，使用现有合同，不新增页面系统。

轨道 `sizes` 支持数字或字符串；`minmax(0, 1fr)` 属于 grid 轨道语法，写在 Row/Column 的 sizes。Panel 的 width/height 是元素尺寸，不能把 `1fr` 当作 CSS width。

以下是作者模型中的一个局部组合，合并到现有模型，保留所需服务：

```json
{
  "type": "column",
  "gap": 12,
  "sizes": ["minmax(0, 1fr)"],
  "children": [{
    "type": "slot",
    "plugins": [{
      "id": "agent-conversation-surface-main",
      "pluginId": "conversation-surface",
      "enabled": true
    }]
  }]
}
```

## 组合位置

在当前 AppUIModel 的 Slot 中调整 plugins。移动时保留实例 ID，使已有设置继续属于同一控件；不要为了换位置复制第二个同名实例。

Plugin 的 `slots` 是语义子边界，例如 composer.input、composer.submitAction、surface.assistantResponseFooter。遵守 cardinality、capability 和 renderer scope，不为颜色或图标再增加微 Slot。

## 修改与验证

移动现有节点时保留实例 ID；停用用 `enabled: false`，不等于删除实现或卸载包。改完校验模型、同步需要的派生注册表、运行 typecheck/build，并检查滚动、缩放和窄屏抽屉。

> 截图待补：原布局与调整后布局及对应模型差异，展示同一实例 ID 被保留。

完整字段见[AppUIModel API](./app-ui-model)。
