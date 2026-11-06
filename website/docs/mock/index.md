---
title: "Mock 服务"
description: 无需业务后端或模型密钥，用内置场景和本地数据回放验证 Agent 前端。
---

# Mock 服务

Mock 服务为 Agent 前端提供预设的 AG-UI 事件流。业务后端还没就绪时，可以先体验流式回复、思考、工具调用和等待用户操作；修改界面后，也可以反复播放相同内容，对照检查效果。

它随 Creator 提供，无需单独安装，也无需模型密钥。先完成[Creator 与助理界面的接入](/start/)，再从 Creator 右上角齿轮打开「示例与回放」，启动服务并选择场景。

![Creator 设置菜单中的示例与回放入口](/images/start/10-creator-mock-menu.png)

## 从哪里开始

| 想做什么 | 阅读说明 |
| --- | --- |
| 第一次连接 Mock，发送一条模拟回复 | [启动与连接](/mock/getting-started) |
| 检查消息、工具、审批、图表等不同状态 | [内置场景](/mock/builtin-scenarios) |
| 重现一段特定事件流，反复检查修改结果 | [本地数据回放](/mock/local-recordings) |

## 两种模拟方式

**内置场景**覆盖常见的对话和交互过程。在面板中阅读说明、搜索名称或 ID 并选择，回到页面助理发送消息即可触发。部分场景需要额外的展示插件，按面板提示引入或启用后再测试。

**本地数据回放**使用从浏览器 EventStream 或 Response 复制的 AG-UI 数据，适合重现实际请求中的内容和事件顺序。保存到当前工程的 `.agent-ui/mocks/` 下，刷新后会出现在同一面板的「本地 Mock」中。

## 验证场景选择

先确定要检查的行为，再在「示例与回放」中阅读场景说明、选择对应示例。一次布局或样式修改，通常需要同时查看正常回复、处理中和失败时的效果。

从一次具体修改开始，查看[检查修改结果](/guide/examples/verify-results)：先读 Creator 的修改回执，再选择需要复测的回复状态。

| 本次修改 | 可选场景 | 重点检查 |
| --- | --- | --- |
| 消息和 Markdown 样式 | `simple-chat`、`markdown-showcase` | 长文本、列表、表格和代码块的排版，消息区能否正常滚动 |
| 思考和工具展示 | `reasoning-tool-success`、`parallel-tools` | 流式更新、展开收起、多个工具的状态与最终结果 |
| 审批和信息收集 | `approval-legacy`、`approval-resume`、`ask-user-question` | 旧版 CUSTOM 与新版 interrupt 审批、问题卡片，以及提交后的继续回复 |
| 错误和停止按钮 | `tool-error`、`cancel-before-first-output` | 出错前内容是否保留，停止后输入框和按钮是否恢复可用 |
| 计划和结构化结果 | `agent-plan`、`data-message-chart` | 状态更新、卡片布局和数据展示 |

完整目录见[内置场景](/mock/builtin-scenarios)。

切换场景后，再次发送消息即可触发新场景的 Mock 回复。可以调大播放时长倍率，放慢事件输出，观察每一步变化；具体操作见[启动与连接](/mock/getting-started#切换场景与调整播放时长)。

## 测试范围

Mock 返回预设内容，输入的文字用于触发所选场景，不会调用模型理解或执行新的自然语言任务。回放文件需要自行准备，当前不支持自动录制真实业务流量。

Mock 连接只用于开发预览，不会修改应用代码中的 `endpoint`。正式应用仍通过自己的业务接口独立运行，构建和部署无需启动 Creator 或 Mock。

Mock 可以检查预设数据下的前端表现。完成后，按[连接真实 Agent](/development/connect-agent)验证实际业务响应；认证、文件上传、历史持久化和服务端恢复需要与业务后端联调。
