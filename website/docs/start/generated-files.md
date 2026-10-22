---
title: 认识生成的文件
---

# 认识生成的文件

初始化后，按修改内容找到对应文件：

| 要做什么 | 修改位置 |
| --- | --- |
| 将助理挂到页面 | `src/agent-ui` 导出的 `Agent` 组件 |
| 调整布局和 Plugin 组合 | `src/agent-ui/app-ui` 中的 AppUIModel |
| 修改组件外观和交互 | `src/agent-ui/plugins` 中的应用层 props、组合和 renderer |
| 配置 Creator 模型 | 工程根目录 `.env.agentui.local`，加入 `.gitignore` |

源码目录以初始化时的选择为准。`.agent-ui` 是工具元数据目录，无需手动编辑。

优先修改 Plugin 应用层。需要接管官方实现源码时，先在 Creator 中确认具体计划。

发布时使用业务工程自己的构建命令，无需启动 Creator。
