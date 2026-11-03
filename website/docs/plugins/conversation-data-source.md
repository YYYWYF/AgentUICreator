---
title: "会话数据源（conversation-data-source）"
---

# 会话数据源（conversation-data-source）

让会话组件读取业务服务中的会话列表与历史记录。请求由宿主页面和项目已有的数据适配器处理，本插件不显示界面。

## 手动开发

项目入口为源码目录下的 `plugins/conversation-data-source/index.tsx`。服务如何创建、如何调用、何时清理，继续由项目原有代码负责。

### 属性

`?` 表示可选；“省略时”描述当前组件行为。`ReactNode`、`CSSProperties`、`ComponentProps` 等为 React 类型；完整类型以项目实际安装版本为准。

组件：`CanonicalConversationDataSourcePlugin`；类型：`ConversationDataSourcePluginProps`。没有独立的界面容器。

| 属性 | 类型 | 省略时 / 用途 |
| --- | --- | --- |
| `children?` | `ReactNode` | 默认不渲染内容 |
| `renderSlot?` | `(name: string, fallback?: ReactNode) => ReactNode` | 按插槽名称显示子插件；当前组件未调用此函数 |

历史数据继续通过项目现有服务读取；请求地址和适配器的设置见[历史会话服务](/development/history-backend)。

