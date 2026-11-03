---
title: "会话服务（conversation-service）"
---

# 会话服务（conversation-service）

让插件使用项目已有的会话列表、会话切换和历史加载服务，本身不显示界面。

## 手动开发

项目入口为源码目录下的 `plugins/conversation-service/index.tsx`。服务如何创建、如何调用、何时清理，继续由项目原有代码负责。

### 属性

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalConversationServicePlugin`；类型：`ConversationServicePluginProps`。没有独立的界面容器。

| 属性 | 类型 | 省略时 / 用途 |
| --- | --- | --- |
| `children?` | `ReactNode` | 默认不渲染内容 |
| `renderSlot?` | `(name: string, fallback?: ReactNode) => ReactNode` | 按插槽名称显示子插件；当前组件未调用此函数 |

会话服务仍由项目现有的宿主组件创建并提供，在不再使用时清理。这里的展示组件只负责显示 `children`。

