# agent-ui-creator-core

Agent UI Creator 的 Python 控制面。当前 Phase 1 只实现经过鉴权的 FastAPI
sidecar、健康检查、AG-UI echo stream 和 runtime diagnostics 单一存储；
Creator Agent、Project Control、验证和完成编排将在后续阶段迁移。

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
