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

## 按职责查看目录

以下是职责示意，具体文件名和实际存在的目录以生成结果为准：

```text
src/agent-ui/
├── application/       # Agent 入口、应用组合和 Host 集成
├── app-ui/            # 布局及 Plugin 实例语义组合
├── plugins/           # 项目拥有的薄应用层、定义和可选本地实现
├── services/          # Host 服务合同与配置接缝
├── agent-contract/    # state、应用事件及前端工具允许范围
├── agent-ui/          # 本地化、主题、会话集成与派生文件
├── runtime/           # 生成项目运行支持，普通定制保持只读
└── framework/         # 现有合同，普通定制保持只读
.agent-ui/             # 工程、所有权、事务等工具元数据
```

带 `generated` 的 Registry 和集成文件由现有生成机制维护，调整 Plugin 定义后按需要同步，不把手工长期修改放进派生文件。普通 props、children、renderer 保留在应用入口。

## 应用层和实现源码

本地 `plugins/<id>` 的存在不代表已经接管 npm 实现。默认应用入口 import 官方包，首次接管需要逐 Plugin 计划和明确同意；成功后只有实现 import 指向本地拥有源码。应用层不属于实现源码基线。

升级 npm 不覆盖应用层或本地实现。源码更新只处理已接管组件的实现，保留自己的应用参数和页面组合。只移植一个修复时，不把它标记成整个版本已完成更新。

> 截图待补：生成目录中标注应用层、布局、派生文件和只读运行支持，并对比接管前后的实现 import。

优先修改 Plugin 应用层。需要接管官方实现源码时，先在 Creator 中确认具体计划。

发布时使用业务工程自己的构建命令，无需启动 Creator。

继续阅读[应用层定制](../customization/application-layer)、[源码接管](../customization/source-takeover)与[独立部署](../integration/production-build)。
