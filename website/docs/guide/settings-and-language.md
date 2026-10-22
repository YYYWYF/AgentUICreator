---
title: Creator 设置与界面语言
---

# Creator 设置与界面语言

点击 Creator 顶部齿轮打开设置。当前菜单提供「连接 Agent」「示例与回放」「插件更新」，部分入口要求工程已初始化或当前任务结束。

| 入口 | 影响范围 |
| --- | --- |
| 连接 Agent | 当前工程开发预览的 Agent 来源和连接方式。 |
| 示例与回放 | 开发 Mock 服务、场景及本地录制数据。 |
| 插件更新 | 当前工程依赖和实现更新信息，以及工具安装信息。 |

连接入口不配置 Creator 的模型密钥。模型配置来自工具宿主的 `.env.agentui.local`，见[模型配置](./model-configuration)。

## 设置工具语言

Creator 支持 `zh-CN` 和 `en-US`。当前设置菜单没有独立的语言切换按钮；自定义工具宿主通过 `CreatorWorkbench` 的 `locale` / `onLocaleChange` 或 Dock 适配器的 `locale` 选项设置。

例如，在已有 Vite Dock 配置中传入 `locale: 'en-US'`，重载开发服务后查看英文入口与工具界面。只在开发配置中使用这些 Creator API。

生成助理的语言由目标工程的 locale provider、配置和可选 locale-switch 控件决定。修改 Creator 的语言不会自动翻译项目文案或改变协议字段。

## 返回对话

打开连接或回放面板后，使用返回按钮继续 Creator 对话。关闭面板不代表停止已经启动的 Mock；需要释放服务时执行面板中的停止操作，并确认运行状态。

> 截图待补：真实设置菜单与中英文工具界面对照；截图不添加当前实现中不存在的语言菜单项。

后续阅读：[连接 Agent](../integration/connect-agent)、[Mock](./mock/)、[更新中心](../updates/)。
