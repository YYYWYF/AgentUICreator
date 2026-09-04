# agent-ui-creator-core

Agent UI Creator 的 Python 控制面。当前 Phase 1 只实现经过鉴权的 FastAPI
sidecar、健康检查、AG-UI echo stream 和 runtime diagnostics 单一存储；
Creator Agent、Project Control、验证和完成编排将在后续阶段迁移。

此包是开发时依赖，不进入生成的 Agent Frontend。

```bash
python -m pip install -r requirements.lock
python -m agent_ui_creator.server \
  --project-root ../../examples/agent-frontend \
  --skills-root ../creator/skills \
  --port 0 \
  --auth-token development-only-token
```

服务启动后，stdout 第一行是版本化的 `creator_ready` JSON handshake；普通
运行日志只写 stderr。
