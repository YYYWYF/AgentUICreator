# 锁定版本下的 Subagent 功能验证（2026-10-13）

结论：正常 Subagent 前端路径可用；Stop 后 transcript 展示未通过，不能判定完整验收通过。没有修改产品源码或 vendor，也没有改动已锁定版本。

## 当前依赖

@assistant-ui/core 0.3.27、@assistant-ui/store 0.3.19、@assistant-ui/tap 0.9.23、assistant-stream 0.3.50、assistant-cloud 0.2.6、@assistant-ui/react 0.15.23、@assistant-ui/react-ag-ui 0.0.63、React/react-dom 19.1.1。其余依赖沿用本轮公司锁定清单。执行环境为 macOS / Node 24.20.0 / pnpm 8.12.0。

## 定向静态/Runtime/DOM 测试：34 passed

- React：5 个测试文件，25 项通过。覆盖 nested Subagent Streaming Contract、产品 TaskGroup/TaskCard、递归任务、错误、未知父工具名、具名 Tool UI 优先级、消息归属、TaskGroup 边界。
- Mock Agent：p6-nested-subagent 8 项通过，覆盖 parentToolCallId / subagentRunId / parentSubagentRunId、错误前内容和各类流式事件时序。
- Conversation Runtime：application-event-source 1 项通过，CUSTOM 保留 Subagent producer identity。
- 25 项 React 测试中有 2 项是 upstream presentation gap guards：锁定 upstream TaskCard 不显示 nested reasoning/error 的缺口仍存在，产品 ConversationTaskGroup composition 补齐。不能把这 2 项描述为 upstream 原生功能通过。
- cancel/unsubscribe 单元测试只证明 iterator 停止；不证明浏览器停止后仍能访问 transcript。

命令：

```bash
pnpm --filter @agent-ui/react exec vitest run tests/migrated/assistant-ui-nested-subagent.test.tsx tests/migrated/task-group-boundary.test.ts tests/migrated/assistant-ui-agent-elements-contract.test.ts tests/migrated/assistant-ui-agent-elements-rendering.test.tsx tests/assistant-message-ownership.test.ts
pnpm --filter @agent-ui/mock-agent exec vitest run tests/p6-nested-subagent.test.ts
pnpm --filter @agent-ui/runtime-conversation exec vitest run tests/application-event-source.test.ts
```

## Chromium 完成态矩阵：16 passed

单层 nested conversation、两层 recursive、Subagent error、3 个 sibling TaskGroup，分别在 en-US / zh-CN 与 1440px / 420px 下验证。通过现有 generated-project visual fixture，安装当前 Source Registry 的产品 composition，使用真正的 HttpAgent / AG-UI adapter / assistant-ui Runtime；服务由本地 Mock Agent 提供。

所有组合验证：输入/发送、等待完成、展开 TaskCard、卡片数量、nested transcript 内容、完成状态、递归父子卡片关系、错误内容保留和 nested alert，以及无 pageerror。已目视检查窄屏递归截图和桌面错误截图。

证据：[browser-results.json](browser-results.json)，同目录包含每个组合的截图。

## Chromium 流式/取消/交错检查

| 检查 | 结果 |
| --- | --- |
| speed=1 时 SUBAGENT_FINISHED 之前出现 working TaskCard、partial reasoning，Composer 仍可停止 | 通过 |
| 完成后 done 状态，重新展开仍显示完整子任务内容 | 通过 |
| 在子任务流式期间点击 Stop 后保留可访问 transcript | **失败** |
| 同一 run 中三个 Subagent 的交错事件归属和展示 | 通过 |

交错检查把同一标准 Mock scenario 的父工具事件/三个 SUBAGENT_STARTED 提前，再对三个 scope 的子事件按轮交错，最终发送 finished/results。通过浏览器 HTTP SSE 接口回放，验证三个独立完成卡片，各自 transcript 包含对应内容且不包含另外两个子任务的内容。该检查证明前端消费交错事件的能力，不证明后端真正并行调度或真实模型表现。

### 已复现的问题

1. Stop 后 TaskCard 消失，变为普通“工具调用已取消: delegate_specialist”条目，无法访问已输出的子任务思考 transcript。该现象在三轮浏览器 Stop 检查中复现。原生 assistant-ui ThreadMessage 的工具 part 仍包含 1 个 nested message，reasoning 内容保留，nested status 变为 incomplete/cancelled；这是前端展示问题，不能称为 Runtime 数据丢失。尚未确认是否由本轮版本调整引入，未做依赖回退对照或修改实现。
2. 正常完成时已展开 TaskCard 回到折叠状态；重新展开后内容完整。记录为 disclosure 状态保持问题，不计为嵌套数据丢失。Runtime 会把 optimistic message ID 变为正式 ID，但尚未证明这是折叠状态重置的完整根因。

证据：[streaming-results.json](streaming-results.json)、[stop-before-native-messages.json](stop-before-native-messages.json)、[stop-after-native-messages.json](stop-after-native-messages.json)、[停止后的截图](stop-failed.png)、[运行中的截图](stop-running.png)、[完成后的 disclosure](completion-disclosure.json)、[交错 SSE 事件](interleaved-agui-events.json)。

## 范围与重跑

本轮主要验证 Agent Frontend 消费 Subagent AG-UI 数据。Creator Python 的 subagent delegation 不在本轮范围；没有调用真实模型/后端多 Agent 服务。Nested transcript 目前是 readonly composition，不提供子任务内的审批操作，本轮也未验收 nested HITL/中断恢复、历史刷新后恢复或后端并行调度。

复用现有 fixture 的验收 harness 保存在本目录。运行 streaming harness 预计返回非零，因为 Stop transcript 问题尚未修复：

```bash
pnpm --filter @agent-ui/react exec node --import tsx ../../docs/verification/subagent-company-pins-20261013/browser-matrix.mts
pnpm --filter @agent-ui/react exec node --import tsx ../../docs/verification/subagent-company-pins-20261013/browser-streaming.mts
```

报告结论仅覆盖当前检出的源码和依赖组合，不覆盖 Windows 实机、公司网络或真实 Agent 后端。

## 后续修复

本报告记录的是修复前状态。Stop 展示和 disclosure 重置两项问题已在产品 composition 修复，相关 42 项测试与 20 组 Chromium 验收通过，见 [修复验收报告](../subagent-fix-20261013/REPORT.md)。
