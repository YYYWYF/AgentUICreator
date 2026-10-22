---
title: 配置文件与环境变量
---

# 配置文件与环境变量

工具配置位于 `--config-root` 指定目录的 `.env.agentui.local`，默认启动目录。选中工程目录不自动替代它。环境修改通常需要重启工具；生产构建不能读取工具秘密。

## 模型字段

同一字段按下面列出的别名顺序检查；**每个名字先查进程环境，再查文件，随后才检查下一个别名**。因此文件中的 `CREATOR_MODEL_NAME` 可以优先于环境中的 `MODEL_NAME`，并非所有环境变量统一压过所有文件字段。

| 字段/别名顺序 | 默认或约束 |
| --- | --- |
| `CREATOR_MODEL_PROVIDER` → `MODEL_PROVIDER` | 当前仅接受兼容 OpenAI API 的 `openai`；省略不改变该接口要求。 |
| `CREATOR_MODEL_NAME` → `MODEL_API_NAME` → `MODEL_NAME` | 当前源码回退 `mimo-v2.5-pro`；建议显式填实际服务可用模型。 |
| `CREATOR_MODEL_BASE_URL` → `MODEL_BASE_URL` | 必填，去尾部 `/`。 |
| `CREATOR_MODEL_API_KEY` → `MODEL_API_KEY` → `OPENAI_API_KEY` | 必填，服务端私有。 |
| `CREATOR_MODEL_TEMPERATURE` | 0.2，非负数。 |
| `CREATOR_MODEL_MAX_TOKENS` | 8192，正整数，单次输出上限。 |
| `CREATOR_MODEL_TIMEOUT_SECONDS` | 120，正数，单请求超时。 |
| `CREATOR_MODEL_MAX_RETRIES` | 2，非负整数。 |
| `CREATOR_MODEL_RAW_TRACE` | 仅 `1` 启用；可能记录敏感内容。 |
| `CREATOR_MODEL_OPENCODE_SESSION_HEADER` | 仅 `1` 启用服务专用会话头。 |

这些是当前配置默认值，不是模型服务保证。输出过短或请求超时可检查这些参数，认证和网络失败先解决实际原因。

## 工具运行字段

| 字段 | 用途与边界 |
| --- | --- |
| `CREATOR_PORT` | CLI 服务端口，可被 `--port` 覆盖。 |
| `CREATOR_OPEN_BROWSER` | 进程环境为 `0` 时不自动开浏览器。 |
| `CREATOR_DOCK_URL` | 开发适配器的工具地址，显式 creatorUrl 依其 options 处理。 |
| `CREATOR_VERIFICATION_MODE` | 默认 `static_only`，可选 `static_and_runtime`；需要实际运行报告才可验证 Runtime。 |

正常安装后无需配置解释器或内部服务。安装错误按[启动排障](../troubleshooting/startup)处理。

## 文件格式与前端字段

文件使用 `KEY=VALUE`，支持空行、整行 `#` 注释和成对引号。不要假定支持 shell 插值、多行 shell 语法或任意 dotenv 特性。示例值不包含真实秘密。

生成 `Agent` 的 endpoint 默认可取 `VITE_AGENT_ENDPOINT` 或 `/agent`；这是公开业务地址，不是模型服务。只将明确允许的开发字段传给前端，`VITE_` 前缀不能用于秘密。

> 截图待补：脱敏配置与 config-root 选择、字段错误提示和重启后的生效检查。

相关：[模型教程](./model-configuration)、[网络认证](../integration/authentication-and-network)。
