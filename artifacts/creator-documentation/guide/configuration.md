# 模型与工具配置

## 模型服务配置

按[开始使用](/start/index.md)教程接入时，在**前端工程根目录**下创建 `.agent-ui/creator/.env.local`（先创建父目录），然后从该目录运行 `pnpm dev:creator`。配置文件不放在生成的 Agent UI 源码目录（如 `src/agent-ui/`）中。

填写兼容 OpenAI API 的模型服务信息：

```dotenv
CREATOR_MODEL_BASE_URL=https://your-model-service.example/v1
CREATOR_MODEL_API_KEY=your-api-key
CREATOR_MODEL_NAME=your-model-name
```

替换为实际地址、密钥和模型名，在工程根目录的 `.gitignore` 中加入 `.agent-ui/creator/`，保存后重启 Creator。密钥只供工具服务使用，不加 `VITE_` 前缀，也不写入前端代码。

Creator 默认从启动时的工作目录读取 `.agent-ui/creator/.env.local`；如果从其他目录启动，应将配置文件放在那个目录，或通过 `--config-root` 指定配置根目录（其下读取 `.agent-ui/creator/.env.local`）。切换目标工程不改变配置目录。同名的非空进程环境变量优先于文件配置。

`.agent-ui` 不应整体忽略：`project.json`、`source-lock.json`、`plugin-ownership.json` 及源码 BASE 等项目记录需要随项目提交。新初始化的项目会生成 `.agent-ui/.gitignore`，忽略 `creator/`、`operator/`、`connection.local.json` 和 `visual-observations/`；已有项目保留自己的忽略规则，按需补充这些条目。共享 Mock 测试数据可以继续提交。

`--config-root` 指向工程或工具根目录，不是 `creator/` 目录。

打开 Creator，发送「说明当前界面有哪些组成部分，先不要修改文件」，收到正常回答后即可开始使用。

## 可选模型参数

| 字段                                      | 用途与默认值                                        |
| --------------------------------------- | --------------------------------------------- |
| `CREATOR_MODEL_PROVIDER`                | 模型接口类型，当前仅支持 `openai`，可省略。                    |
| `CREATOR_MODEL_TEMPERATURE`             | 输出随机性，默认 `0.2`，非负数。                           |
| `CREATOR_MODEL_MAX_TOKENS`              | 单次最大输出，默认 `8192`。                             |
| `CREATOR_MODEL_TIMEOUT_SECONDS`         | 单次请求超时，默认 `120` 秒，至少 `1` 秒。                   |
| `CREATOR_MODEL_OPENCODE_SESSION_HEADER` | OpenCode 服务要求时设为 `1`，发送 `x-opencode-session`。 |

## 长任务上下文配置

连续检查代码、修改和验证时，工具结果与对话会逐渐占满模型窗口。Creator 会按预算归档较大的成功只读结果，必要时生成历史摘要，并保留回查原文的入口。这里配置的是 **Creator 每次模型请求的上下文预算**，不控制业务 Agent，也不是整项任务累计能消耗多少 tokens。

这些字段同样放在工具配置根目录的 `.agent-ui/creator/.env.local`，保存后结束当前任务并重启 Creator。进程环境变量优先，切换目标工程不会切换这些配置。Windows、macOS 使用同一份文件格式，无需在命令中设置环境变量。

### 参数与默认值

| 字段                                   | 默认值     | 作用与约束                                                                       |
| ------------------------------------ | ------- | --------------------------------------------------------------------------- |
| `CREATOR_CONTEXT_MAX_TOKENS`         | `65536` | 总请求预算，包含系统提示、工具声明、对话、工作上下文和输出预留；必须是至少 `4096` 的安全整数。不会自动读取模型服务支持的窗口大小。       |
| `CREATOR_CONTEXT_KEEP_TOKENS`        | `12000` | 摘要时尽量保留的近期消息预算，实际会按可用空间缩小；必须是至少 `256` 且小于总预算的安全整数。                          |
| `CREATOR_CONTEXT_COMPRESSION`        | `1`     | `1` 启用大结果归档和历史摘要；`0` 关闭这两项。只读检查结果去重仍保留。                                     |
| `CREATOR_CONTEXT_HISTORY_TOKENS`     | `8000`  | 多轮对话进入新请求时的历史投影预算；`0` 关闭这项预处理，其他值须为至少 `2048` 的安全整数。单次长任务的上下文压缩仍受总预算与压缩开关控制。 |
| `CREATOR_CONTEXT_SUMMARY_MAX_TOKENS` | `8192`  | 单次摘要模型输出的上限，实际取它与 `CREATOR_MODEL_MAX_TOKENS` 中较小的值；必须是正的安全整数。它不限制主模型的单次输出。  |

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

归档和摘要调整发送给模型的内容，不删除原始对话、检查点、工具记录或文件事务。Creator 可以按回查入口读取原文；摘要不会代替重新读取待编辑文件，也不产生新的修改授权或验证结果。

摘要会增加模型调用与等待时间。Creator 没有固定累计模型调用数或图步数上限；上下文预算也不会给任务设置累计调用上限。用户仍可停止任务，单次模型请求仍受 `CREATOR_MODEL_TIMEOUT_SECONDS` 限制，权限、确认和无进展检测继续生效。页面刷新后的重连与服务重启后的处理见[使用 Creator](/guide/index.md)。

### 配置与运行失败

| 现象或错误                                   | 处理方法                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `CREATOR_CONTEXT_CONFIGURATION_INVALID` | 检查错误指出的字段、整数约束、压缩开关值，以及 `KEEP_TOKENS < MAX_TOKENS`。                     |
| 模型服务报告上下文超限                             | 核对所选模型的实际窗口，下调总预算并留余量；检查是否关闭了压缩，或将输出预留设得过大。                             |
| `CREATOR_CONTEXT_FIXED_BUDGET_EXCEEDED` | 系统提示、工具声明、输出预留等占用过大，没有足够摘要空间；减少输出预留或自定义提示／工具规模，确有更大模型窗口时才提高总预算。         |
| `CREATOR_CONTEXT_COMPACTION_FAILED`     | 当前任务压缩失败，检查模型服务可用性、超时和诊断原因；原始消息保留，但已有文件修改不会因此自动撤销。先检查修改回执与工程差异，再决定后续请求。 |

验证时先确认重启后能完成一次普通请求，再使用较长的工程检查任务，查看是否能在摘要后继续读取和处理未完成事项。一次短对话成功只能证明基本连接正常，不能证明所有长任务都不会超限。

## 服务端口

| 配置                                            | 用途                                            |
| --------------------------------------------- | --------------------------------------------- |
| CLI `--port` / 进程变量 `CREATOR_PORT`            | 指定 Creator 服务端口，CLI 参数优先。                     |
| Dock 的 `creatorUrl` / 进程变量 `CREATOR_DOCK_URL` | 让开发页面连接 Creator，显式 `creatorUrl` 优先，与服务端口保持一致。 |

启动示例和参数见 [CLI](/guide/cli.md)，页面入口按 [Vite](/guide/creator-dock-vite.md) 或 [Rsbuild / Webpack](/guide/creator-dock-rsbuild-webpack.md) 配置。
