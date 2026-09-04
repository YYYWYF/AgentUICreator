# agent-ui-creator-core

Agent UI Creator 的 Python 控制面。Phase 2 在经过鉴权的 FastAPI sidecar、
AG-UI stream 和 runtime diagnostics 基础上，增加独立的 Minimal Agent，用于验证
MiMo 在 `langchain-openai + deepagents` 下的连续结构化工具调用。Project Control、
Fast Path、Snapshot、Validation 和 Completion 尚未迁移。

此包是开发时依赖，不进入生成的 Agent Frontend。

## 测试门禁

仓库使用锁定的 `requirements.lock` 自动维护
`packages/creator-python/.venv`，不需要开发者手工创建或激活虚拟环境。

```bash
# Python unit + contract tests
pnpm test:python

# 真实 Node → Python sidecar 进程 / Proxy / SSE 测试
pnpm test:python-sidecar

# Python + TypeScript + sidecar integration 统一门禁
pnpm test

# 显式调用真实 MiMo，运行 A/B/C 各十次共 30 个 conformance run
pnpm test:python-live-model
```

正式门禁要求 Python 3.11+ 且不会默认 skip。仅本地开发需要临时
跳过真实进程集成测试时，可显式设置
`CREATOR_SKIP_PYTHON_INTEGRATION=1`。如果用于 CI required check，不得设置该变量。

## 手工启动

先执行 `pnpm test:python:setup` 安装开发/测试依赖，然后运行：

```bash
packages/creator-python/.venv/bin/python -m agent_ui_creator.server \
  --project-root examples/agent-frontend \
  --skills-root packages/creator/skills \
  --port 0 \
  --auth-token development-only-token
```

服务启动后，stdout 第一行是版本化的 `creator_ready` JSON handshake；普通
运行日志只写 stderr。

默认 `CREATOR_PYTHON_AGENT_MODE=echo`，不会调用模型。实验性 Minimal Agent 配置：

```env
CREATOR_AGENT_RUNTIME=python
CREATOR_PYTHON_AGENT_MODE=minimal

CREATOR_MODEL_NAME=mimo-v2.5-pro
CREATOR_MODEL_BASE_URL=https://example.com/v1
CREATOR_MODEL_API_KEY=your-key
CREATOR_MODEL_TEMPERATURE=0.2
CREATOR_MODEL_MAX_TOKENS=2048
CREATOR_MODEL_TIMEOUT_SECONDS=120
CREATOR_MODEL_MAX_RETRIES=1
```

`CREATOR_*` 的模型配置优先于兼容的 `MODEL_API_NAME` / `MODEL_NAME`、
`MODEL_BASE_URL`、`MODEL_API_KEY` 和 `OPENAI_API_KEY`。模型请求固定使用
OpenAI-compatible Chat Completions、`streaming=false`，并把预初始化的
`ChatOpenAI` 实例传给 DeepAgents。

Minimal Agent 每轮只暴露 `ls`、`read_file`、`glob`、`grep`、`edit_file`。
`task`、`write_todos`、`execute`、`write_file` 和 `delete` 均不可用。开发模式可以
读取项目内非敏感文件，但拒绝 `.env*`、`.git`、`node_modules`、`dist`、`build`、
`coverage` 和 `cache`；写入只允许 `plugins/**`，并额外拒绝
`plugins/registry.generated.ts` 和 `app-ui/app-ui.json`。

每次 `RUN_FINISHED.result.toolProtocol` 包含模型调用、有效/无效工具调用、pseudo
call 恢复、单次 protocol repair、参数解析、缺失 ID、token 和有界 model trace
统计。设置 `CREATOR_MODEL_RAW_TRACE=1` 会额外向 stderr 写入 LangChain 暴露的
provider metadata 摘要，不记录完整 Prompt、源码或工具结果。

当前锁定的 Agent 栈为 Python 3.11+、`langchain-openai 1.3.3`、
`langchain-core 1.6.1`、`langchain 1.3.18`、`langgraph 1.2.11`、
`deepagents 0.7.11` 和 `openai 2.54.0`。升级其中任意依赖后必须重新运行 live
tool protocol conformance。
