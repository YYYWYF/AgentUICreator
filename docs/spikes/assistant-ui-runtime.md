# assistant-ui Runtime + AG-UI 架构 Spike

## 状态

实现日期：2026-09-12

本阶段在既有 A/B 实验链路上补齐了 assistant-ui 的 scoped Tailwind Preflight。按本次执行要求，没有运行测试、typecheck、build、浏览器验收或 Runtime 场景验证；下表中的 `NOT RUN` 不是失败结论，也不能作为迁移依据。

正式设计仍以 `docs/agent-ui-reference-guide.md` 为准：正式 Agent UI 组件不依赖 assistant-ui Runtime。本 Spike 是隔离的、可关闭的架构例外，目的仅是取得是否值得改变正式设计的证据。

## 实验链路

```text
现有 Mock Agent / 真后端
  -> 标准 AG-UI endpoint
  -> @ag-ui/client HttpAgent
  -> @assistant-ui/react-ag-ui useAgUiRuntime
  -> AssistantRuntimeProvider
  -> assistant-ui 官方 Base UI Thread 源码
  -> assistant-ui-conversation-spike Plugin
  -> workspace.conversation Slot
```

`?assistantUiSpike=1` 只在 Vite development mode 生效。开启时，运行时模型会关闭 `agent-conversation-surface-main` 并开启 `assistant-ui-conversation-spike-main`；未开启时使用签入 AppUIModel 的原始状态，现有 conversation surface 保持开启，Spike 实例保持关闭。

Mock 场景继续由现有 `resolveAgentEndpoint()` 解析，例如：

```text
?assistantUiSpike=1&mockScenario=reasoning-tool-success
```

没有新增 Mock adapter、私有 endpoint 或现有 Runtime action 桥接。现有 AgentUICreator Runtime 仍在 App 根部运行，但 Spike conversation 不消费它。

## 依赖与源码边界

- Runtime 精确锁定：`@assistant-ui/react@0.15.19`、`@assistant-ui/react-ag-ui@0.0.59`、`@ag-ui/client@0.0.59`。
- assistant-ui 官方 Base UI Thread 及递归 registry 源码位于 `examples/agent-frontend/src/spikes/assistant-ui/**`。
- Plugin 入口只位于 `examples/agent-frontend/plugins/assistant-ui-conversation-spike/**`。
- `packages/source-registry/**` 与 `examples/agent-frontend/agent-ui/**` 继续禁止 assistant-ui、Tailwind、CVA 和 Lucide 依赖。
- Tailwind CSS 只在 development query 开启时动态加载；Theme、Utilities 与基于 `tailwindcss@4.3.3` 的 scoped Preflight 分层加载，所有 reset 与颜色变量都限定在 `.assistant-ui-spike`。
- Vendored assistant-ui presentation source 保持上游 Tailwind、CVA 与 Base UI 实现。AgentUICreator 不把上游 Tailwind class 翻译为 CSS Modules；集成层只负责 Runtime、Plugin/Slot 边界、theme containment 与 scoped Tailwind baseline。
- 新增 policy test，禁止 assistant-ui 及其 Spike-only 实现依赖从上述两个实验目录泄漏到正式生产源码。

## 观察结果

| 项目 | 结果 | 备注 |
| --- | --- | --- |
| HttpAgent -> 当前 Mock endpoint | NOT RUN | 已复用现有 endpoint resolver，未发起浏览器请求 |
| TEXT_MESSAGE | NOT RUN | 待用 `simple-chat` 人工观察 |
| REASONING | NOT RUN | 待用 `reasoning-chat` 与 `reasoning-long-preview` 人工观察 |
| Tool Call | NOT RUN | 待用 `reasoning-tool-success` 人工观察 |
| Multi Tool | NOT RUN | 待用 `multi-tool` 人工观察 |
| Abort | NOT RUN | 官方 Thread stop action 已保留，未操作 |
| Thread UI 与官网一致度 | IMPLEMENTED / NOT RUN | 已恢复官方源码依赖的 scoped baseline，未做浏览器视觉对比 |
| Plugin/Slot 集成 | IMPLEMENTED / NOT RUN | AppUIModel 与生成 Registry 已接入，未渲染 |
| CSS/Tailwind 隔离 | IMPLEMENTED / NOT RUN | scoped Preflight 与 policy gate 已建立，未检查产物或页面 |
| Runtime 与当前框架冲突 | UNKNOWN | Spike 允许同页双 Runtime；尚无运行证据 |
| 可删除的自研代码 | 无 | 本阶段只记录候选，禁止删除 |

## Debug Overlay

开发态 Spike surface 内包含只读 Overlay，全部数据通过 `useAuiState()` 取得：

- `thread.isRunning`
- message count
- last message role
- last message parts
- part types
- running tool
- reasoning parts

Overlay 不调用 AgentUICreator Runtime，不参与 Thread UI 的状态或交互。

## assistant-ui Runtime API 使用面

当前 Spike 实际需要：

- `HttpAgent`
- `useAgUiRuntime({ agent, showThinking: true })`
- `AssistantRuntimeProvider`
- `useAuiState()`（仅 Debug Overlay）
- 官方 Thread 内部使用的 Thread、Message、Composer、Reasoning、Tool、滚动与 action primitives

## 尚待验证或缺失的能力

在场景验证前，以下全部只能视为待确认项：

- 当前 Mock endpoint 的 request/response 与 `HttpAgent` 是否完全兼容
- AG-UI reasoning lifecycle 是否映射为官方 Reasoning parts
- Tool Call/Result 和多 Tool grouping 是否符合现有产品语义
- cancel 是否会正确终止当前 Mock/真后端 run
- 错误、断线、重连与运行锁的行为
- 历史会话、conversation data source 与 thread switching
- frontend tool execution、HITL、Subagent、附件、Sources 和自定义 Tool UI
- AppUIModel props 对 assistant-ui Thread 的可配置边界
- Tailwind utilities 与现有 App/Ant Design 样式在生产 bundle 中的实际冲突面

## 与现有 agent-runtime 的能力对照（待场景证实）

assistant-ui 预期可覆盖的候选：

- 基础消息、流式文本与 Composer send/cancel
- Thread auto-scroll 与 follow-latest
- Reasoning 展示与折叠
- Tool fallback、Tool grouping 与运行状态展示
- Message actions 与 Thread loading/empty surface

AgentUICreator 当前仍独有或仍由其架构拥有：

- AppUIModel、Layout Tree、SlotRegistry 与 Plugin instance composition
- Plugin lifecycle、Plugin Service、application gate、diagnostics 与 width contract
- Project Frontend State 和现有 conversation data source/controller
- Runtime Core 的 execution projection、structured interrupt 语义与 frontend tool registry
- Creator 控制面、Source Registry、受控 mutation、生成 Registry 与完成门禁
- 当前 Mode shell、Theme service、Inspector 以及其他非 conversation Plugins

## 可删除候选（仅记录，不删除）

只有在本 Spike 的协议、视觉、交互、隔离和缺失能力完成验收后，才可以进一步评估：

- conversation surface 内部的 timeline/composer 组合层
- AgentMessage / AgentComposer / AgentReasoning / AgentTool / AgentToolActivity 的 conversation-domain 展示实现
- `@agent-ui/runtime-core` 与 `@agent-ui/runtime-agui` 中仅被 assistant-ui 完整覆盖、且没有其他 Plugin 使用的 conversation-domain 投影

这些只是候选集合，不表示已经证明可以删除，也不包含 AppUIModel、Plugin/Slot/Layout Runtime 或 Creator 控制面。

## 待执行验收矩阵

1. `simple-chat`
2. `reasoning-chat`
3. `reasoning-long-preview`
4. `reasoning-tool-success`
5. `multi-tool`
6. normal mode 回归
7. `pnpm typecheck`
8. `pnpm test`
9. 带现有 `VITE_AGENT_ENDPOINT` 门禁的 `pnpm build`

本提交没有执行以上任何一项。
