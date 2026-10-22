---
title: 模拟联调
description: 使用 Mock Agent 提供预设 AG-UI 响应，验证前端的消息、工具及运行状态。
---

# 模拟联调

Mock Agent 提供预设的 AG-UI 事件流，让你在业务后端尚未就绪时验证前端。它可以模拟文本流式输出、思考、工具调用、审批、错误和取消等过程，无需模型密钥。

## 启动服务并连接界面

1. 打开 Creator 设置中的「示例与回放」，点击「启动服务」，确认服务状态和地址。
2. 选择场景，例如 `reasoning-tool-success`。如果面板提示缺少展示资源，先按提示引入或启用，再运行场景。
3. 在「连接 Agent」中选择 Mock 来源，回到助理输入区发送一条消息，观察预设回复。

这里的连接设置用于 Creator 开发预览。要在业务页面中测试，需确认该页面的 `Agent` 也连接到 Mock 服务。服务默认地址为 `http://127.0.0.1:47831/agent`；新初始化项目会尝试在项目根目录的 `.env.agentui.local` 中写入：

```dotenv
VITE_AGENT_ENDPOINT=http://127.0.0.1:47831/agent
```

已有文件或 endpoint 配置会被保留，需自行核对。使用初始化生成的开发环境适配器时，修改后重启项目开发服务器；其他接入方式可在开发入口显式传入 `Agent` 的 `endpoint`。该本机地址只用于开发，发布配置使用业务 Agent 接口。

Mock 返回所选场景的预设内容。发送的文字用于触发场景，不会让它理解自然语言或执行新的业务任务。

## 选择验证场景

围绕本次界面改动选择场景：

| 验证目标 | 推荐场景 |
| --- | --- |
| 消息与 Markdown 排版 | `simple-chat`、`markdown-showcase` |
| 思考与工具执行 | `reasoning-tool-success`、`parallel-tools` |
| 用户审批 | `approval-resume` |
| 异常与取消 | `tool-error`、`cancel-before-first-output` |
| 计划与结构化内容 | `agent-plan`、`data-message-chart` |

完整清单和资源要求见[内置场景](./builtin-scenarios)。选择场景后，在助理中发送消息，核对对应内容的显示、操作和结束状态。切换前等待或停止当前运行；必要时新建会话，避免上次状态影响观察。

播放倍率用于调整演示时序，不表示真实 Agent 性能。关闭面板不会停止 Mock；结束测试后点击「停止服务」，确认状态已更新。

## 复现特定响应

已有一段需要反复验证的事件流时，使用[本地 JSONL 回放](./local-recordings)；需要编排新的消息、工具或状态变化时，参考[自定义场景](./author-scenarios)，也可按该页的 API 将场景接入已有 Vite 开发服务。

场景未显示预期效果时，先检查实际请求地址、场景和 Plugin 资源是否匹配，再按[诊断指引](../../troubleshooting/diagnostics)收集错误与事件信息。

## 接入业务后端

完成界面验证后，将开发预览和业务页面的 endpoint 分别切换到实际 AG-UI 接口，按[连接真实 Agent](../../integration/connect-agent)验证业务响应。使用 Vite Mock 插件的工程，同时移除对应开发插件。

Mock 验证的是预设数据下的前端表现。认证、上传、持久历史和服务端恢复仍需实际后端联调；前端工具场景也需要宿主提供相应执行能力。
