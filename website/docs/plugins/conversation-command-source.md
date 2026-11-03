---
title: "会话命令源（conversation-command-source）"
---

# 会话命令源（conversation-command-source）

提供项目定义的 `/` 快捷命令，由现有命令服务读取命令列表，本身不显示界面。

## 手动开发

项目入口为源码目录下的 `plugins/conversation-command-source/index.tsx`。服务如何创建、如何调用、何时清理，继续由项目原有代码负责。

### 属性

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalConversationCommandSourcePlugin`；类型：`ConversationCommandSourcePluginProps`。没有独立的界面容器；命令服务由项目已有的插件定义提供。

| 属性 | 类型 | 省略时 / 用途 |
| --- | --- | --- |
| `children?` | `ReactNode` | 默认不渲染内容 |
| `renderSlot?` | `(name: string, fallback?: ReactNode) => ReactNode` | 按插槽名称显示子插件；当前组件未调用此函数 |

命令列表在项目现有的命令服务中配置；这个组件没有 `commands` 或样式属性。

