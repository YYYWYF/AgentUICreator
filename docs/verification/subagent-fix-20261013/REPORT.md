# Subagent 展示修复验收（2026-10-13）

停止/失败后 TaskCard transcript 不可访问、正常完成后展开状态丢失两项问题已修复。此次修改仅涉及 @agent-ui/react 产品 composition 和回归测试，保留当前公司锁定依赖，没有修改 vendor、AG-UI 数据、Agent Runtime、AppUIModel、Slot 合同或后端逻辑。

## 实现

- composable-thread.tsx 先计算语义分组。已识别为 task 的调用保留 TaskGroup，随后才处理普通工具的 Timeline protection；原有具名 Tool UI / standalone / MCP 优先级仍由基础分组决定，普通失败工具仍保持可见。
- task-disclosure-context.tsx 在当前 ComposableThread 内保存临时展开状态，位于按 assistant message ID 渲染的子树之外。切换 active thread 时销毁，清空消息时清理，不使用全局状态或持久化配置。
- conversation-task-group.tsx 按用户请求、assistant creation time、父工具路径、nested message ID 和 toolCallId 关联展开状态，避免 optimistic message ID 替换时重置；同名/重复工具调用、子任务和重新生成消息保持隔离。直接在没有 Thread disclosure provider 的环境使用 TaskGroup 时，仍沿用 TaskCard 的本地 uncontrolled 行为。

## 静态与 Runtime 验证

- @agent-ui/react typecheck（源码与测试）、生产 build / public boundary / Lexical boundary 通过。
- assistant-ui upstream-owned Elements guard 通过，vendor 未修改。
- dependency pins 检查通过，本次未调整依赖声明或锁文件。
- 7 个相关测试文件，42 项通过。其中新增 6 项回归检查覆盖：取消父任务、失败父任务、消息 ID 替换后保持展开/折叠、不同请求及重新生成消息的相同工具 ID 隔离、会话切换/清空时清理、不同 nested sibling messages 下的同 ID child task 隔离。
- 现有测试同时覆盖普通 ToolTimeline 错误保护、具名 Tool UI 优先级、递归、子任务错误及流式语义。42 项包含 2 项 upstream presentation gap guards，其通过意味着上游缺口仍由产品 composition 补齐。

证据：[react-tests.log](react-tests.log)、[react-build.log](react-build.log)。

## Chromium 验收：20 passed

- 完成态矩阵 16 组：单层、递归、子任务错误、sibling TaskGroup，分别在 en-US / zh-CN、1440px / 420px 下验证。TaskCard、数量、nested transcript、状态、错误及父子关系正确，没有 pageerror。
- 实时 stream：完成前 partial reasoning / working 状态可见；完成后卡片保持展开，完整子任务输出仍可见。
- Stop：partial reasoning 已可见时点击停止，TaskCard 为 cancelled、保持展开，已有内容可见；等待 2 秒内容不再增加。
- 交错 sibling SSE replay：三个子任务内容不串，独立完成。
- 父级 RUN_ERROR：卡片为 failed，已产生的子任务内容及错误信息可见。
- 已目视检查 Stop 和正常完成后的截图，确认真实页面保留 transcript。

证据：[browser-results.json](browser-results.json)、[streaming-results.json](streaming-results.json)、[Stop 截图](stop-complete.png)、[完成截图](streaming-complete.png)。同目录保留矩阵截图、native message snapshots 和可重跑的 browser harness。

```bash
pnpm --filter @agent-ui/react exec vitest run tests/tool-timeline-composition.test.tsx tests/tool-timeline-projection.test.ts tests/migrated/assistant-ui-nested-subagent.test.tsx tests/migrated/task-group-boundary.test.ts tests/migrated/assistant-ui-agent-elements-contract.test.ts tests/migrated/assistant-ui-agent-elements-rendering.test.tsx tests/assistant-message-ownership.test.ts
pnpm --filter @agent-ui/react typecheck
pnpm --filter @agent-ui/react build
pnpm --filter @agent-ui/react exec node --import tsx ../../docs/verification/subagent-fix-20261013/browser-matrix.mts
pnpm --filter @agent-ui/react exec node --import tsx ../../docs/verification/subagent-fix-20261013/browser-streaming.mts
```

执行环境为 macOS / Node 24.20.0 / pnpm 8.12.0。浏览器 fixture 使用当前产品 package、Source Registry composition、HttpAgent / react-ag-ui 和本地 Mock 服务。没有调用真实模型或真实多 Agent 后端；没有执行 Windows 实机、nested HITL/中断恢复、全仓库测试或历史恢复验收。42 项和 20 组验收只覆盖本次修改的相关路径。
