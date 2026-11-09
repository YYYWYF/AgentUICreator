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

## 服务端口

| 配置                                            | 用途                                            |
| --------------------------------------------- | --------------------------------------------- |
| CLI `--port` / 进程变量 `CREATOR_PORT`            | 指定 Creator 服务端口，CLI 参数优先。                     |
| Dock 的 `creatorUrl` / 进程变量 `CREATOR_DOCK_URL` | 让开发页面连接 Creator，显式 `creatorUrl` 优先，与服务端口保持一致。 |

启动示例和参数见 [CLI](/guide/cli.md)，页面入口按 [Vite](/guide/creator-dock-vite.md) 或 [Rsbuild / Webpack](/guide/creator-dock-rsbuild-webpack.md) 配置。
