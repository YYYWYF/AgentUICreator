---
title: 配置 Creator 使用的模型
---

# 配置 Creator 使用的模型

Creator 使用模型理解需求和修改前端；生成的助理通过另一个 AG-UI 接口与业务 Agent 对话。两者分别配置。

## 写入工具配置

在 Creator 的配置目录创建 `.env.agentui.local`，先使用下列最小配置：

```dotenv
CREATOR_MODEL_BASE_URL=https://your-model-service.example/v1
CREATOR_MODEL_API_KEY=replace-with-your-key
CREATOR_MODEL_NAME=replace-with-your-model
```

地址必须是模型服务支持的 API 基址，模型名称使用服务端实际开放的名称。示例地址不可直接使用。已有 `MODEL_PROVIDER`、`MODEL_BASE_URL`、`MODEL_API_KEY`、`MODEL_NAME` 配置的工程应按[配置参考](./configuration)核对选择顺序，避免同时保留两套相互冲突的值。

把 `.env.agentui.local` 加入 `.gitignore`。密钥保持服务端私有，不加 `VITE_` 前缀，也不放进 `Agent` props、AppUIModel 或截图中。

## 选择配置目录

默认在启动目录读取工具配置。需要共用一个工具宿主时，显式指定：

```sh
agent-ui-creator --project "C:\work\agent-app" --config-root "C:\work\creator-host" --no-open
```

选中另一个工程不会自动改用那个工程中的模型密钥。改完配置后重启 Creator；业务开发服务是否重启取决于它自己的配置。

## 验证模型连接

打开已初始化的工程，发送「说明当前界面有哪些组成部分，先不要修改文件」。确认收到正常回答，再尝试小范围修改。请求失败时记录错误码和状态码，检查服务地址、模型名、凭据与网络。

默认单次最大输出为 8192 tokens，可用 `CREATOR_MODEL_MAX_TOKENS` 覆盖。增大输出上限不能解决服务认证或网络超时。请求超时和输出参数的精确定义见[配置参考](./configuration)。

仅当 OpenCode 服务明确提示缺少 `x-opencode-session` 时，按该服务要求设置 `CREATOR_MODEL_OPENCODE_SESSION_HEADER=1` 并重启。不要把一个服务专用参数复制到所有提供商。

> 截图待补：脱敏配置文件与 Creator 收到只读问题回复的画面，保留服务错误码示例，遮盖密钥和真实业务内容。
