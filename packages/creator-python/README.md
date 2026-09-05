# agent-ui-creator-core

Agent UI Creator 的默认 Python 控制面。它通过经过鉴权的 FastAPI sidecar 提供
AG-UI stream、runtime diagnostics、ProjectControl v2 领域读取，以及由 Python Host
拥有 transaction / receipt / undo 的 AppUIModel semantic mutation。Runtime
Verification、Host Validation、Completion 和 Fast Path 尚未迁移。

HTTP wire event 由锁定的 `ag-ui-protocol` 官方模型和 `EventEncoder` 产生。每次
`POST /creator` 都创建独立的 bounded `CreatorEventBus`；RuntimeGuard 在 tool handler
执行前发布调用定义，在 handler 返回或抛错后发布有界结果，server 并发消费并立即输出，
不会在 Agent 完成后从 `activities` 重放工具事件。

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

默认 `CREATOR_PYTHON_AGENT_MODE=domain-write`，无需显式配置 runtime 或 agent mode。
正常配置只需要：

```env
CREATOR_MODEL_NAME=mimo-v2.5-pro
CREATOR_MODEL_BASE_URL=https://example.com/v1
CREATOR_MODEL_API_KEY=your-key
CREATOR_MODEL_TEMPERATURE=0.2
CREATOR_MODEL_MAX_TOKENS=2048
CREATOR_MODEL_TIMEOUT_SECONDS=120
CREATOR_MODEL_MAX_RETRIES=1
```

如需紧急使用 legacy TypeScript Creator，在 Vite Host 配置：

```env
CREATOR_AGENT_RUNTIME=typescript
```

Minimal Agent 仅作为工具协议诊断模式保留：

```env
CREATOR_PYTHON_AGENT_MODE=minimal
```

只读领域模式使用相同模型配置，并设置：

```env
CREATOR_PYTHON_AGENT_MODE=domain-read
```

该模式在 Minimal Agent 的 `ls`、`read_file`、`glob`、`grep`、`edit_file` 之外，
新增 `inspect_ui_project`、`inspect_app_ui_model`、`list_ui_plugins`、
`inspect_ui_slots`、`inspect_ui_plugin` 和
`inspect_ui_plugin_source_references`。领域事实只通过目标工程固定的
`scripts/ui-project-control.ts` 获取；不会自动向每轮模型调用注入全量 snapshot。

默认的可写领域模式在上述工具面上增加唯一的组合写入口：

```env
CREATOR_PYTHON_AGENT_MODE=domain-write
```

`mutate_app_ui_model` 复用正式 AppUIModel operation JSON Schema，由
`AppUIModelMutationService` 在 project-level lock 内统一完成双文件 capture-before、
ProjectControl transaction、真实磁盘 changedPaths 对账、Activity touch、receipt 与 undo
证据记录。Hash conflict 不会自动重试，必须重新 inspect；成功只表示静态组合 transaction
提交，不代表 Runtime Verification 或 Host Validation 通过。

`ProjectControlClient` 固定从目标工程的 `node_modules/.bin/tsx`（Windows 为
`tsx.cmd`）启动该入口，`cwd` 为目标工程，环境固定 `CI=1`、`FORCE_COLOR=0`，
超时 15 秒，stdout/stderr 合计上限 1,000,000 bytes。请求和响应均通过
`contracts/creator/project-control.schema.json` 验证，并严格要求 schemaVersion 2。
Client 保留上述六个 public read operation，并提供只供
`AppUIModelMutationService` 使用的内部 mutation transport；Agent 不直接拿到 Client。

`CREATOR_*` 的模型配置优先于兼容的 `MODEL_API_NAME` / `MODEL_NAME`、
`MODEL_BASE_URL`、`MODEL_API_KEY` 和 `OPENAI_API_KEY`。模型请求固定使用
OpenAI-compatible Chat Completions、`streaming=false`，并把预初始化的
`ChatOpenAI` 实例传给 DeepAgents。

Minimal Agent 每轮只暴露 `ls`、`read_file`、`glob`、`grep`、`edit_file`。
`task`、`write_todos`、`execute`、`write_file` 和 `delete` 均不可用。开发模式可以
读取项目内非敏感文件，但拒绝 `.env*`、`.git`、`node_modules`、`dist`、`build`、
`coverage` 和 `cache`；写入只允许 `plugins/**`，并额外拒绝
`plugins/registry.generated.ts` 和 `app-ui/app-ui.json`。

Domain Read Agent 复用相同 PathPolicy，因此仍不能直接写
`plugins/registry.generated.ts` 或 `app-ui/app-ui.json`。普通 Plugin 源码修改仍可通过
`edit_file` 完成；Domain Write 同样禁止直接编辑这两个文件，注册、挂载、移动或删除实例
必须使用 semantic mutation tool。Domain Read 始终不开放 mutation，用作安全回归模式。

每次 `RUN_FINISHED.result.toolProtocol` 包含模型调用、有效/无效工具调用、pseudo
call 恢复、单次 protocol repair、参数解析、缺失 ID、token 和有界 model trace
统计。设置 `CREATOR_MODEL_RAW_TRACE=1` 会在 HTTPX response hook 中读取已缓存的
Chat Completions response body，并只保存有界的协议结构摘要（状态码、request id、
finish reason、content 形态、tool call 名称与 arguments 长度/JSON 有效性、重试状态），
随后与 LangChain `AIMessage` 摘要配对。不会保存 prompt、完整 content、完整 tool
arguments、源码、Authorization header 或 API key。原先容易误解为 provider raw response
的 LangChain 元数据现命名为 `langChainProviderMetadata`；真实的 pre-LangChain 摘要位于
`providerResponse`。关闭该开关时不会安装 response hook，也不会读取或解析响应 body。

当前锁定的 Agent 栈为 Python 3.11+、`langchain-openai 1.3.3`、
`langchain-core 1.6.1`、`langchain 1.3.18`、`langgraph 1.2.11`、
`deepagents 0.7.11`、`openai 2.54.0` 和 `ag-ui-protocol 0.1.22`。升级其中任意依赖后必须重新运行 live
tool protocol conformance。
