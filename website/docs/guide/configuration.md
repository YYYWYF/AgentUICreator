---
title: "模型与工具配置"
description: 配置 Creator 模型服务、长任务上下文预算和服务端口。
---

# 模型与工具配置

## 模型服务配置

按[开始使用](/start/)教程接入时，在**前端工程根目录**下创建 `.agent-ui/creator/.env.local`（先创建父目录），然后从该目录运行 `pnpm dev:creator`。配置文件不放在生成的 Agent UI 源码目录（如 `src/agent-ui/`）中。

填写兼容 OpenAI API 的模型服务信息：

```dotenv
CREATOR_MODEL_BASE_URL=https://your-model-service.example/v1
CREATOR_MODEL_API_KEY=your-api-key
CREATOR_MODEL_NAME=your-model-name
```

替换为实际地址、密钥和模型名，在工程根目录的 `.gitignore` 中加入 `.agent-ui/creator/`，保存后重启 Creator。密钥只供工具服务使用，不加 `VITE_` 前缀，也不写入前端代码。

Creator 默认从启动时的工作目录读取 `.agent-ui/creator/.env.local`；如果从其他目录启动，应将配置文件放在那个目录，或通过 `--config-root` 指定配置根目录（其下读取 `.agent-ui/creator/.env.local`）。切换目标工程不改变配置目录。同名的非空进程环境变量优先于文件配置。

`.agent-ui` 按内容决定是否提交，不要整体忽略：

- **项目记录需要提交**：`project.json`、`source-lock.json`、`plugin-ownership.json` 及源码 BASE 等。
- **本地数据忽略**：`creator/`、`operator/`、`connection.local.json`、`visual-observations/`。
- **共享 Mock 测试数据**：可以继续提交。

新项目会生成 `.agent-ui/.gitignore`；已有项目保留自己的规则，按需补充上述忽略条目。

`--config-root` 指向工程或工具根目录，不是 `creator/` 目录。

打开 Creator，发送「说明当前界面有哪些组成部分，先不要修改文件」，收到正常回答后即可开始使用。

## 可选模型参数

| 字段 | 用途与默认值 |
| --- | --- |
| `CREATOR_MODEL_PROVIDER` | 模型接口类型，当前仅支持 `openai`，可省略。 |
| `CREATOR_MODEL_TEMPERATURE` | 输出随机性，默认 `0.2`，非负数。 |
| `CREATOR_MODEL_MAX_TOKENS` | 单次最大输出，默认 `8192`。 |
| `CREATOR_MODEL_TIMEOUT_SECONDS` | 单次请求超时，默认 `120` 秒，至少 `1` 秒。 |
| `CREATOR_MODEL_OPENCODE_SESSION_HEADER` | OpenCode 服务要求时设为 `1`，发送 `x-opencode-session`。 |

## 长任务上下文配置

长任务中，Creator 会整理较长的工具结果和对话摘要，保留回查原文的入口。下列参数控制每次模型请求的容量，不限制整项任务的累计用量。通常保留默认值即可。

这些字段同样写入 `.agent-ui/creator/.env.local`，保存后结束当前任务并重启 Creator。Windows、macOS 使用相同文件格式。

### 参数与默认值

| 字段 | 默认值 | 作用与约束 |
| --- | --- | --- |
| `CREATOR_CONTEXT_MAX_TOKENS` | `65536` | 每次请求的总预算，包含输入和输出预留；整数，至少 `4096`，按模型容量设置。 |
| `CREATOR_CONTEXT_KEEP_TOKENS` | `12000` | 摘要时尽量保留的近期消息量；整数，至少 `256`，小于总预算。 |
| `CREATOR_CONTEXT_COMPRESSION` | `1` | `1` 开启工具结果整理和对话摘要；`0` 关闭。 |
| `CREATOR_CONTEXT_HISTORY_TOKENS` | `8000` | 新一轮请求使用的历史预算；`0` 关闭这项预处理，否则为至少 `2048` 的整数。 |
| `CREATOR_CONTEXT_SUMMARY_MAX_TOKENS` | `8192` | 摘要输出上限；正整数，实际不超过 `CREATOR_MODEL_MAX_TOKENS`。 |

tokens 数量由本地估算，可能与模型服务的实际计数不同。总预算应低于服务实际支持的上下文窗口，并留出余量。`CREATOR_MODEL_MAX_TOKENS` 是总预算中要预留的单次输出空间，不是额外增加的窗口；增大它会减少可用于输入的空间。

### 配置示例

下面沿用默认总预算，明确写出各项配置。先确认模型服务支持这个请求规模；窗口较小时下调总预算，并同时检查近期保留预算和输出预留。

```dotenv
CREATOR_MODEL_MAX_TOKENS=8192
CREATOR_CONTEXT_MAX_TOKENS=65536
CREATOR_CONTEXT_KEEP_TOKENS=12000
CREATOR_CONTEXT_COMPRESSION=1
CREATOR_CONTEXT_HISTORY_TOKENS=8000
CREATOR_CONTEXT_SUMMARY_MAX_TOKENS=8192
```

只想关闭跨轮历史投影预处理、保留当前长任务压缩时，设置 `CREATOR_CONTEXT_HISTORY_TOKENS=0`；当前请求超出总预算时，仍可能压缩其中的历史。不要把 `CREATOR_CONTEXT_COMPRESSION=0` 当作增加容量：关闭后，大结果和历史更容易触及服务端窗口限制。

### 压缩保留什么

整理和摘要只调整发送给模型的内容，原始对话、工具记录和文件修改仍保留，可按需回查。

生成摘要会增加等待时间。长任务没有固定的累计调用次数限制，可随时停止；单次请求仍受超时配置限制。页面刷新和服务重启后的处理见[使用 Creator](/guide/)。

### 配置与运行失败

| 现象或错误 | 处理方法 |
| --- | --- |
| `CREATOR_CONTEXT_CONFIGURATION_INVALID` | 检查错误指出的字段、整数约束、压缩开关值，以及 `KEEP_TOKENS < MAX_TOKENS`。 |
| 模型服务报告上下文超限 | 核对所选模型的实际窗口，下调总预算并留余量；检查是否关闭了压缩，或将输出预留设得过大。 |
| `CREATOR_CONTEXT_FIXED_BUDGET_EXCEEDED` | 系统提示、工具声明、输出预留等占用过大，没有足够摘要空间；减少输出预留或自定义提示／工具规模，确有更大模型窗口时才提高总预算。 |
| `CREATOR_CONTEXT_COMPACTION_FAILED` | 当前任务压缩失败，检查模型服务可用性、超时和诊断原因；原始消息保留，但已有文件修改不会因此自动撤销。先检查修改回执与工程差异，再决定后续请求。 |

修改后先检查普通对话，再用较长的工程检查任务确认能继续处理。若模型仍报告容量超限，下调总预算并留出余量。

## 服务端口

| 配置 | 用途 |
| --- | --- |
| CLI `--port` / 进程变量 `CREATOR_PORT` | 指定 Creator 服务端口，CLI 参数优先。 |
| Dock 的 `creatorUrl` / 进程变量 `CREATOR_DOCK_URL` | 让开发页面连接 Creator，显式 `creatorUrl` 优先，与服务端口保持一致。 |

启动示例和参数见 [CLI](/guide/cli)，页面入口按 [Vite](/guide/creator-dock-vite) 或 [Rsbuild / Webpack](/guide/creator-dock-rsbuild-webpack) 配置。
