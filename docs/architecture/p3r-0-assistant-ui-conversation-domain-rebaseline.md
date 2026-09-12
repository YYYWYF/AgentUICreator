# P3R-0: assistant-ui Conversation Domain Architecture Rebaseline

状态：Accepted architecture baseline  
基线：`dev@477f1dd03c881590e6e73514cb536d6beb5cce79`  
范围：P3R-0 只定义架构，不迁移源码、不改变 Runtime 行为、不修改 AppUIModel Schema、不切换默认 Conversation Surface。

## 1. Executive Summary

assistant-ui 从“组件结构参考”升级为 AgentUICreator **Conversation Domain 的上游实现**。它在未来 canonical path 中拥有 active thread 的消息、part、streaming、reasoning、tool presentation、composer 与 active run projection；AgentUICreator 继续拥有 AppUIModel、Layout、Slot、Plugin、Workspace、Conversation Service、Inspector、Diagnostics、Frontend Tools、应用事件和 Creator 控制面。

最终结构固定为四层，不能互相混放：

```text
Backend Agent
  -> AG-UI
  -> @agent-ui/runtime-assistant-ui
  -> assistant-ui Conversation Runtime
  -> AgentUICreator assistant-ui Adapter
  -> semantic Slot / Plugin / Inspector / Workspace
  -> AppUIModel + Layout
```

核心 recommendation：

1. `workspace.conversation` 继续挂载 AgentUICreator 的 `conversation-surface`；assistant-ui `Thread` 是其内部 canonical implementation，不是新的顶层产品 Plugin。
2. upstream presentation 固定进入 `examples/agent-frontend/agent-ui/vendor/assistant-ui/`；项目集成进入 `examples/agent-frontend/agent-ui/adapters/assistant-ui/`。
3. P3R-2 新建 `packages/runtime-assistant-ui/`，由它唯一创建并拥有 canonical active-conversation Runtime。UI Plugin 不创建 Runtime。
4. 现有 conversation semantic Slots 全部保留，Slot 只表达可替换能力，不发展成 visual micro-slot。
5. `runtime-core`、`runtime-agui` 只能按 capability 迁移和删除；在 Frontend Tools、HITL、Custom Events、Subagent、History、Diagnostics 完成证明前，不允许 package 级删除。
6. Canonical cutover 前必须消除同一 active conversation 的双 transport / 双 send ownership；A/B 期间允许 legacy 与 Spike 共存，但只能有一个交互面处理用户动作。

本文件覆盖旧 launch plan 与 reference guide 中“assistant-ui 只可参考、不能成为 Runtime/Message Model”的 Conversation Domain 结论；其他架构边界继续有效。

## 2. Current Architecture

当前默认链路：

```text
App.tsx
  -> createAgUiTransport(endpoint, frontendTools)
  -> createAgentRuntime(transport)
  -> AgentRuntimeProvider
  -> PluginServiceProvider
  -> UIPluginRuntime
  -> workspace.conversation
  -> conversation-surface
     -> conversation.timeline        -> agent-message-list
     -> conversation.composer        -> agent-composer
     -> conversation.empty.*         -> welcome / suggestions
```

`runtime-agui` 当前同时承担：`HttpAgent` 生命周期、AG-UI message/input 映射、message/reasoning/tool/step/subagent projection、run 状态、abort、新 thread、structured interrupt、Frontend Tool 协调、Tool continuation 和 Custom Event wire boundary。`runtime-core` 提供协议无关的 snapshot、actions、message/execution/interrupt/event/tool contracts。`runtime-react` 只拥有 Layout language 与确定性 `LayoutRenderer`，不属于 Conversation Domain。

`agent-message-list` 再次投影 turn、reasoning execution 与 tool activity，并通过 `MessageRenderProvider` 把 normalized context 交给 reasoning、tool group、tool item、attachments、sources child Slots。`agent-tool-detail` 直接从 `AgentMessage[] + AgentExecution[]` 按 `toolCallId` 组装 Inspector 数据。

历史会话是 AgentUICreator-owned 的独立服务：

```text
conversation-data-source Plugin
  -> ConversationDataSource
conversation-controller Plugin
  -> AgentUIConversationService
agent-conversations Plugin
  -> list / select / new
conversation-surface + message-list
  -> live messages or read-only historyMessages
```

当前历史选择不会把 transport rebind 到所选 thread；它只加载文本 DTO 并切换为只读 `history` mode。新会话通过 Runtime `startNewConversation()` 创建新 thread，再由 controller 回到 live mode。

## 3. Spike Findings

当前 Spike 的真实依赖链是：

```text
assistant-ui-conversation-spike Plugin
  -> AssistantUiConversation
  -> AssistantUiRuntimeProvider
  -> HttpAgent(resolveAgentEndpoint())
  -> useAgUiRuntime({ showThinking: true })
  -> AssistantRuntimeProvider
  -> vendored assistant-ui Thread
```

`?assistantUiSpike=1` 只在 development 中关闭 legacy surface、打开 Spike surface。App 根部的 legacy Runtime 仍会创建，因此当前是同页双 Runtime 的实验结构；Spike Thread 不消费 AgentUICreator `AgentRuntimeProvider`。Debug Overlay 只从 `useAuiState()` 读取 thread/message/part/tool/reasoning 状态。

P3R-0 接受阶段输入给出的结果：Text、Reasoning、Tool Call/Result、Multi Tool、reasoning/tool/text 顺序、running/completed、Thread 嵌入与 Tailwind 加载已证明可行。仓库内旧 Spike 记录仍把多项检查标为 `NOT RUN`，因此这些结论足以支持架构 rebaseline，但不能替代 P3R-4 的 cutover evidence。

vendored Thread 已提供 `Welcome`、whole `AssistantMessage`、`ToolFallback`、`ToolGroup`、`ReasoningGroup` override。Composer、empty suggestions、message attachments 与 sources 暂无等价的顶层 typed override；这些是 P3R-3 的 adapter seam 设计项，不是 P3R-0 直接修改 upstream 的理由。

## 4. Target Architecture

```text
AgentUICreator App / Workspace
  |
  +-- AppUIModel -> LayoutRenderer -> SlotRegistry -> Plugin lifecycle
  |
  +-- Conversation Service
  |     list / persistence / selection / active identity policy
  |
  +-- Conversation Surface Plugin                  (product boundary)
  |     |
  |     +-- AssistantUi Conversation Adapter       (integration boundary)
  |           |
  |           +-- semantic Slot outlets
  |           +-- theme bridge
  |           +-- diagnostics bridge
  |           +-- assistant-ui component overrides
  |           |
  |           +-- vendored assistant-ui Thread     (upstream presentation)
  |
  +-- Inspector <- Conversation Observation Adapter
  |
  +-- @agent-ui/runtime-assistant-ui                (runtime boundary)
        |
        +-- one active HttpAgent / AG-UI connection
        +-- useAgUiRuntime + AssistantRuntimeProvider
        +-- AgentUICreator capability ports
              events / frontend tools / HITL / diagnostics as retained
```

Canonical mode has exactly one active conversation transport and one send/abort owner. Transitional compatibility hooks may expose AgentUICreator-shaped snapshots, but they must be projections of that same adapter instance, never a second `HttpAgent`.

## 5. Ownership Matrix

| Domain | Canonical owner | Boundary note |
| --- | --- | --- |
| AG-UI protocol and wire events | AG-UI | No private SSE schema |
| Active conversation Runtime | assistant-ui via `runtime-assistant-ui` | One active transport |
| Active thread message model / parts | assistant-ui | Adapter observes; AppUIModel does not encode it |
| Streaming text / optimistic message | assistant-ui | Cutover requires behavior proof |
| Reasoning projection | assistant-ui | Slot remains AgentUICreator-owned |
| Tool presentation state / result binding | assistant-ui | Tool capability execution is separate |
| Composer Runtime state | assistant-ui | Semantic composer replacement remains available |
| Active run projection | assistant-ui | AgentUICreator may expose a stable observation facade |
| App custom state | AgentUICreator application contract | Must not be collapsed into Thread UI state |
| AppUIModel / Layout | AgentUICreator | Independent of assistant-ui details |
| SlotRegistry / semantic Slots | AgentUICreator | Replacement boundary |
| Plugin Registry / lifecycle / services | AgentUICreator | Runtime adapter cannot activate Plugins |
| Creator / controlled mutation | AgentUICreator | Development control plane only |
| Workspace composition | AgentUICreator | `workspace.conversation` stays stable |
| Conversation list / metadata / persistence | AgentUICreator Conversation Service | Supplies selected identity to adapter |
| History selection policy | AgentUICreator Conversation Service | Current read-only behavior retained until proven otherwise |
| Inspector | AgentUICreator | Consumes stable observation contract |
| Runtime diagnostics infrastructure | AgentUICreator | Receives adapter events; no private assistant-ui imports |
| Frontend Tool registration / authorization | AgentUICreator | Retain until matrix proves integration |
| HITL / interrupt policy | AgentUICreator | assistant-ui may render, but does not take product ownership by default |
| Custom Application Events | AgentUICreator | AG-UI decoding stays at wire boundary |
| Mock scenarios | AgentUICreator | One AG-UI scenario drives both surfaces |
| Theme policy | AgentUICreator | Adapter maps theme into scoped assistant-ui root |
| assistant-ui integration | Adapter layer | Bridges owners without becoming either owner |
| Custom agent UI / subagent extensions | AgentUICreator | assistant-ui base plus custom part/Plugin |

## 6. Runtime Boundary

P3R-2 creates `@agent-ui/runtime-assistant-ui` with this allowed responsibility:

- create/configure the active `HttpAgent` from endpoint and thread identity;
- call `useAgUiRuntime` and provide `AssistantRuntimeProvider`;
- expose stable adapter inputs for conversation identity/history rebind;
- expose stable conversation actions and observation outputs needed by AgentUICreator bridges;
- coordinate a single wire lifecycle for assistant-ui plus retained Frontend Tool/HITL/Event capabilities.

It must not import AppUIModel, `LayoutRenderer`, Creator, Plugin implementations, SlotRegistry, workspace layout or generated Registry. It must not decide which Plugin occupies a Slot.

`runtime-core` remains the owner of protocol-independent AgentUICreator contracts while consumers still need them. `runtime-agui` retains only AG-UI capabilities not yet replaced or reused by `runtime-assistant-ui`. P3R migration may extract mappers/coordinators or add ports, but cannot keep a second `AgUiTransport` alive in canonical mode.

`runtime-react` is unchanged: Layout is not a Conversation capability and is not a deletion candidate.

## 7. Vendor / Adapter Boundary

Final repository paths:

```text
packages/
  runtime-assistant-ui/                 # P3R-2, Runtime integration only

examples/agent-frontend/agent-ui/
  vendor/assistant-ui/
    components/
    hooks/
    lib/
    styles/
    THIRD_PARTY_NOTICES.md
    UPSTREAM.json                        # provenance/patch inventory
  adapters/assistant-ui/
    conversation/
    slots/
    theme/
    diagnostics/
```

Vendor rules:

- preserve upstream Tailwind classes, CVA, Base UI, Lucide usage and component anatomy;
- only mechanical import-path adaptation is acceptable without a recorded patch;
- no AppUIModel, Plugin, SlotRegistry, Workspace or diagnostics business logic;
- every non-mechanical change is an explicit, hashable patch with reason and upstream path.

Adapter rules:

- own Slot outlets, Plugin render-context mapping, theme containment, diagnostics observation and typed component override configuration;
- translate AgentUICreator contracts at the boundary, never scatter them through vendor files;
- prefer public primitives and component overrides; zero upstream patch is the first attempt;
- if no viable seam exists, use the smallest recorded patch rather than rewriting presentation.

## 8. Conversation Surface Boundary

`conversation-surface` remains the Plugin mounted at `workspace.conversation`. It owns the product-level surface, history/live policy integration, semantic outlet wiring and adapter host. assistant-ui `Thread` owns the internal canonical conversation implementation.

The Spike Plugin is not promoted. The final chain is:

```text
workspace.conversation
  -> conversation-surface
  -> AssistantUiConversationAdapter
  -> assistant-ui Thread
```

This preserves Creator reasoning in semantic terms and keeps layout replacement independent from assistant-ui implementation details.

## 9. Semantic Slot Strategy

All current Slots remain. No icon, border, chevron, spinner, label or button fragment becomes a Slot; those remain upstream composition, props, class, CVA or theme concerns.

| AgentUICreator Slot | assistant-ui capability | Native support | Override support at baseline | Integration recommendation |
| --- | --- | --- | --- | --- |
| `workspace.conversation` | whole conversation surface | Thread | whole Thread composition | Keep `conversation-surface`; mount adapter internally |
| `conversation.empty.welcome` | Thread welcome | Yes | `ThreadComponents.Welcome` | Direct adapter override |
| `conversation.empty.suggestions` | new-thread suggestions | Yes | No dedicated typed override | Adapter wrapper first; minimal recorded seam only if required |
| `conversation.timeline` | Thread viewport/messages | Yes | Whole `AssistantMessage`, grouped parts | Adapter owns timeline outlet around Thread anatomy |
| `conversation.composer` | Composer | Yes | No dedicated Thread override | Adapter wrapper first; minimal recorded seam only if required |
| `conversation.message.reasoning` | reasoning part/group | Yes | `ReasoningGroup` plus primitives | Message-part adapter |
| `conversation.message.tool-activity` | tool group | Yes | `ToolGroup` plus primitives | Group adapter |
| `conversation.message.tool-item` | tool call item | Yes | `ToolFallback`; named `toolUI` wins | Tool adapter, preserve named custom Tool UI precedence |
| `conversation.message.attachments` | message attachments | Partial | No dedicated Thread override | Message-part adapter; capability proof required |
| `conversation.message.sources` | sources/citations | Unknown as a stable native part | Whole AssistantMessage/data renderer only | AgentUICreator wrapper/custom part; capability proof required |

P3R-3 must implement a typed Slot-to-component map inside the adapter. AppUIModel continues to contain only Slot and Plugin identities; it must not contain assistant-ui primitive names, grouped-part tags or override object shapes.

## 10. Plugin / assistant-ui Override Strategy

The layering is fixed:

```text
AgentUICreator Plugin selected by semantic Slot
  -> Adapter creates normalized render context
  -> assistant-ui component override / primitive composition
  -> assistant-ui upstream primitive
```

Plugin/Slot decides **which semantic capability** is used. assistant-ui override decides **how that capability is installed into Thread**. Named assistant-ui Tool UI remains valid below the AgentUICreator tool-item boundary; it does not become an AppUIModel implementation detail.

Fallback behavior is required for every child Slot so a missing/disabled Plugin cannot make the Thread structurally invalid.

## 11. Conversation Service / History Strategy

AgentUICreator Conversation Service keeps ownership of:

- list, metadata, persistence and data-source selection;
- create/delete/select policy;
- selected conversation identity;
- whether a selected history is read-only or continuable;
- switch cancellation and stale-request handling.

`runtime-assistant-ui` owns the active Thread Runtime after receiving the selected identity and normalized history input. The adapter is responsible for rebind/injection semantics, not the sidebar Plugin.

Current read-only history behavior remains the compatibility baseline. P3R-4 must prove thread switching, history injection, stale request cancellation, reconnect/resume and whether continuing a persisted conversation is supported before policy changes. `agent-conversations` never creates or owns an Agent client.

## 12. Inspector / Diagnostics Strategy

`workspace-inspector` and `agent-tool-detail` remain AgentUICreator capabilities. They must consume an AgentUICreator-owned observation model, not `useAuiState()` or private assistant-ui store types directly.

Recommended versioned seam:

```ts
interface ConversationObservationSnapshot {
  schemaVersion: 1;
  thread: {
    id: string;
    mode: "live" | "history";
    status: "idle" | "running" | "awaiting-input" | "error";
  };
  tools: Array<{
    threadId: string;
    messageId?: string;
    partId?: string;
    toolCallId: string;
    toolName: string;
    state: "preparing" | "awaiting-result" | "completed" | "error" | "interrupted";
    args: unknown;
    result?: unknown;
    error?: { message: string; code?: string };
    startedAt?: string;
    finishedAt?: string;
  }>;
}
```

Only `threadId`, `toolCallId`, `toolName`, state, args and available result/error are required initially. `messageId`, `partId` and timestamps are optional until the upstream Runtime can supply stable identities. The diagnostics adapter normalizes upstream state into this contract and reports it through AgentUICreator infrastructure. Existing plugin/composition diagnostics, width checks, AppUIModel hash and application lifecycle remain unchanged.

## 13. Frontend Tool / HITL Retention Strategy

Rendering a Tool does not prove Frontend Tool execution or HITL replacement. These remain retained AgentUICreator capabilities:

- Tool registration, authorization, schema validation and service resolution;
- one-time execution, abort protection, ToolMessage result and continuation run;
- pending interrupt projection, complete response-set validation and resume;
- application event schema registry and per-Plugin scoped delivery.

P3R-2 must find a single-transport integration point. Until it does, no Frontend Tool coordinator, `resumeInterrupts`, application event registry or related runtime-core contract is removed. assistant-ui may provide presentation controls, but AgentUICreator retains product policy and authorization.

## 14. Mock Strategy

The existing Mock Scenario remains the only test-data source:

```text
Mock Scenario -> standard AG-UI -> legacy surface / assistant-ui surface
```

No assistant-ui-specific message fixture, state bypass or custom SSE schema is allowed. A/B scenarios must cover text, reasoning, tool, multi-tool, tool error, interrupt, HITL, attachments, sources, long-running, subagent, history and reconnect. The same scenario and endpoint must drive both surfaces until cutover.

## 15. Theme / Tailwind Strategy

The host loads one Tailwind engine and scans the stable vendor path. No Plugin initializes Tailwind. Production Vite configuration must explicitly include `agent-ui/vendor/assistant-ui/**` in Tailwind source discovery.

The adapter renders one scoped theme root, for example:

```text
.agent-ui-assistant-ui[data-theme="light|dark"]
```

It maps AgentUICreator Theme Service mode to assistant-ui variables/classes. Preflight and CSS variables are scoped to that root; global Workspace selectors and unscoped resets are forbidden. The Spike-only hard-coded `<div className="assistant-ui-spike dark">` is not carried into canonical architecture. Upstream utility classes remain unchanged.

## 16. Upstream Upgrade Strategy

The pinned upstream reference is `assistant-ui@97bd4b39fce83163354c9ec8d9d4fb2c9bd1aac7`; Runtime packages are currently pinned to `@assistant-ui/react@0.15.19` and `@assistant-ui/react-ag-ui@0.0.59`.

Reuse and extend the existing Source Registry rather than creating an unmanaged copy. The Registry already records project/mode/component/revision/license and the project lock records installed item versions and file hashes. The assistant-ui vendor item additionally needs `UPSTREAM.json` (or an equivalent schema extension) recording:

- upstream project, exact commit/package versions and license;
- original path -> local path;
- original hash and installed local hash;
- mechanical import adaptations;
- explicit patch id, reason and description;
- notices files covered by the import.

Update workflow:

```text
inspect current lock/drift
  -> import candidate from pinned local assistant-ui checkout
  -> compute upstream/local diff
  -> apply declared mechanical adaptations and explicit patches
  -> update license/notices/provenance
  -> formal Source Registry apply
  -> run Slot Adapter and capability gates before promotion
```

Direct edits to installed vendor files or `.agent-ui/source-lock.json` are forbidden. Local drift must be detectable before update, and an upgrade cannot silently overwrite it.

## 17. Subagent Extension Strategy

Subagent, parallel-agent and agent-run timeline are independent extension capabilities. assistant-ui supplies the base Thread/part system; AgentUICreator may add a custom data/message part and Plugin-backed renderer through the adapter. Lack of a current first-class assistant-ui subagent model is not permission to flatten or delete AgentUICreator producer/execution semantics.

P3R-4 must decide the stable identity and lifecycle mapping for root/subagent/parent tool relationships before any legacy subagent projection is removed.

## 18. Existing Component Migration Matrix

Classification: **A retain**, **B replacement candidate**, **C future extension**. A component may be B+C: default presentation can be replaced while its Plugin remains a supported custom replacement.

| Existing component / Plugin | Class | Recommendation | Removal gate |
| --- | --- | --- | --- |
| `AgentMessageList` / `agent-message-list` | B+C | assistant-ui Thread becomes default timeline; keep Plugin as A/B fallback and future custom timeline | history, part ordering, Slots, Inspector and A/B parity |
| `AgentReasoning` / `agent-reasoning` | B+C | assistant-ui default; retain as replaceable reasoning Plugin | reasoning lifecycle, long stream, collapse and interruption parity |
| `AgentToolActivity` / `agent-tool-activity` | B+C | assistant-ui ToolGroup default; retain grouped/flat custom replacement | multi-tool, ordering, error/interruption parity |
| `AgentTool` / `agent-tool` | B+C | assistant-ui fallback/named Tool UI default; retain custom tool-item Plugin | args/result/error/HITL/Frontend Tool parity |
| `AgentToolDetail` / `agent-tool-detail` | A+C | Remains AgentUICreator Inspector | observation contract proven |
| `AgentAttachments` / `agent-message-attachments` | B+C | Candidate default replacement; retain thumbnail/custom Plugin | input/upload/history/media parity |
| `AgentSources` / `agent-message-sources` | B+C | Keep as custom part until native sources strategy is proven | citation identity, safety and history parity |
| `AgentComposer` / `agent-composer` | B+C | assistant-ui Composer becomes default; semantic replacement remains | send/abort/draft/history/HITL/attachment parity |
| `AgentThreadWelcome` / welcome Plugin | B+C | Map through `Welcome` override | empty/loading/switch parity |
| `AgentSuggestions` / suggestions Plugin | B+C | Adapter outlet; preserve configured suggestions | initial/follow-up suggestion semantics proven |
| `conversation-surface` | A | Product host remains; internals migrate | Never removed as the semantic product boundary |

No component is deleted in P3R-0.

## 19. Runtime Duplication Matrix

| Capability | Current owner | Future owner | Temporary duplication | Migration phase | Removal gate |
| --- | --- | --- | --- | --- | --- |
| message projection | runtime-agui -> runtime-core | assistant-ui | Yes in A/B | P3R-2/3 | all message consumers moved or adapted |
| reasoning projection | LifecycleProjector + message-list | assistant-ui | Yes | P3R-2/3 | lifecycle/long-stream/interruption parity |
| tool presentation projection | LifecycleProjector + message-list | assistant-ui | Yes | P3R-2/3 | call/result/group/error identity parity |
| active run | AgUiTransport | assistant-ui Runtime | Yes in Spike | P3R-2 | one wire owner and run-lock parity |
| composer state/actions | agent-composer + AgentRuntime actions | assistant-ui Runtime | Yes | P3R-2/3 | send/abort/draft/optimistic parity |
| history rendering | Conversation Service + message-list | Service + assistant-ui active Thread | Partial | P3R-2/4 | switch/rebind/loading/read-only policy proven |
| new conversation identity | AgUiTransport + controller | Conversation Service policy + adapter rebind | Partial | P3R-2/4 | atomic identity reset and stale-run safety |
| abort | AgUiTransport | runtime-assistant-ui action | Yes | P3R-2/4 | network/local state cancellation parity |
| Frontend Tools | runtime-agui + AppFrontendToolRuntime | AgentUICreator bridge through one adapter | No replacement yet | P3R-2/4 | advertise/execute/result/continuation parity |
| interrupts / resume | runtime-core + runtime-agui | AgentUICreator policy through adapter | No replacement yet | P3R-2/4 | full response, resume, producer/tool identity parity |
| application events | runtime-agui + AppEventRuntime | AgentUICreator bridge through adapter | No replacement | P3R-2 | validated live-only delivery through one wire owner |
| diagnostics | AgentUICreator diagnostics | AgentUICreator diagnostics + observation adapter | No replacement | P3R-2/3 | Inspector and reporters consume stable contract |
| subagent execution | LifecycleProjector | AgentUICreator extension over assistant-ui base | Unknown | P3R-4 | identity/tree/lifecycle strategy confirmed |
| App state | AgUiTransport snapshot + app contract | AgentUICreator app-state bridge | Unknown | P3R-4 | state snapshot/delta semantics proven |

Duplication is removed capability by capability. Package deletion is not an objective.

## 20. Deletion Candidate Matrix

| Candidate | Earliest phase | Required proof |
| --- | --- | --- |
| `assistant-ui` Spike query mode | P3R-6 | canonical surface shipped and fallback window closed |
| `assistant-ui-conversation-spike` Plugin | P3R-6 | no A/B consumer remains |
| Spike Debug Overlay | P3R-6 | diagnostics adapter provides equivalent observation |
| legacy message/turn projection | P3R-6 | no Plugin/Inspector/history consumer remains |
| legacy reasoning projection | P3R-6 | assistant-ui + extension path covers all states |
| legacy tool call/result presentation projection | P3R-6 | Tool, Inspector, Frontend Tool and HITL gates pass |
| legacy streaming projection | P3R-6 | text/reasoning/tool/abort/reconnect parity |
| legacy conversation-surface internal implementation | P3R-6 | product host remains; only replaced internals removed |
| old default presentation Plugins | P3R-6 or retain as optional | dependency proof plus explicit product decision |
| unused runtime-agui projection code | P3R-6 | same transport no longer calls it and no consumers |

`runtime-react`, SlotRegistry, Plugin Runtime, Conversation Service, Inspector and diagnostics are not deletion candidates. `runtime-core` and `runtime-agui` are not package-level deletion candidates in this plan.

## 21. Capability Matrix / Remaining Unknowns

| Capability | P3R-0 status | Owner direction |
| --- | --- | --- |
| normal text / streaming text | Proven baseline; repeat for cutover evidence | assistant-ui |
| reasoning and reasoning -> tool -> text order | Proven baseline; long/interrupted cases remain | assistant-ui |
| tool call/result and multi-tool | Proven baseline; error/interrupted/custom UI remain | assistant-ui presentation |
| running -> completed | Proven baseline | assistant-ui |
| abort / double-send / run lock | Unknown | runtime-assistant-ui |
| retry / reconnect | Unknown | runtime-assistant-ui |
| optimistic message / composer draft | Unknown | assistant-ui |
| conversation loading / switch / history injection | Unknown | Service + adapter |
| continue persisted conversation | Unknown; current behavior is read-only | Service policy + adapter |
| Frontend Tools | Unknown | AgentUICreator bridge |
| HITL / approval / interrupt-resume | Unknown | AgentUICreator policy + adapter |
| attachments / upload / media parts | Unknown | assistant-ui base + Slot adapter |
| sources / citations | Unknown | AgentUICreator custom part/Plugin unless native seam proves stable |
| Custom Application Events | Unknown on shared adapter | AgentUICreator |
| app state snapshots/deltas | Unknown on canonical adapter | AgentUICreator app contract |
| subagent / parallel agent | Unknown | AgentUICreator extension |
| Inspector identities | Contract recommended, not implemented | AgentUICreator |
| production Tailwind/theme isolation | Spike structure exists; production proof required | Adapter + host |
| upstream update/drift process | Designed, not implemented | Source Registry |

All `Unknown` rows are P3R-4 work unless P3R-2/3 must resolve them to establish their own boundary.

## 22. Canonical Cutover Gates

P3R-5 may make assistant-ui canonical only when all of the following have recorded PASS evidence:

### Runtime

- text, reasoning, tool, result, multi-tool, tool error and interrupted tool;
- abort, retry/reconnect, run lock, optimistic message and composer state;
- conversation loading, history rendering and active identity rebind;
- no double-send, double-abort or dual transport ownership.

### Product

- switching/history, Frontend Tools, HITL/approval, attachments, sources;
- long reasoning, streaming markdown and media strategy;
- subagent strategy explicitly confirmed.

### Architecture

- every semantic Slot remains replaceable with a fallback;
- reasoning, tool group, tool item, attachments, sources and composer Plugins can be replaced independently;
- Inspector and Runtime diagnostics consume stable AgentUICreator contracts;
- Creator still reasons in semantic capabilities;
- AppUIModel contains no assistant-ui implementation details.

### Engineering

- production build, typecheck and relevant tests pass;
- the same Mock Scenario drives both surfaces;
- license/notices/provenance and upstream diff/update work;
- every removal candidate has reverse-dependency proof.

Until then, legacy remains available as the A/B fallback.

## 23. P3R-1 - P3R-6 Dependency Plan

| Phase | Input | Scope | Output | Acceptance gate | Explicitly deferred |
| --- | --- | --- | --- | --- | --- |
| P3R-1 Formal assistant-ui Surface | This architecture + current Spike | Move/import upstream source into final vendor path; add adapter surface shell and provenance; keep feature-gated A/B | Formal paths, stable surface entry, no behavior cutover | Existing Spike scenarios still reachable; vendor/adapters separated; notices complete | runtime package, semantic child Slot wiring, default switch, deletion |
| P3R-2 Canonical Runtime Adapter | P3R-1 surface | Create `runtime-assistant-ui`; define one transport, identity/history inputs, actions, event/tool/HITL/diagnostic ports | Runtime provider and compatibility/observation seams | one wire owner; send/abort/run identity proven; no AppUIModel/Plugin imports | full Slot replacement, capability completion, cutover |
| P3R-3 Semantic Plugin / Slot Adapter | P3R-2 Runtime | Map all retained Slots to assistant-ui override/primitives with fallbacks | typed Slot map and Plugin render contexts | independent replacement for every listed semantic Slot; zero-patch result or justified minimal patch | broad capability validation, default switch, deletion |
| P3R-4 Capability Matrix Completion | P3R-2/3 adapters | Execute remaining Runtime/product/history/Inspector/theme/upstream scenarios | evidence table and resolved owner decisions | every cutover-required row PASS or explicit blocker | canonical default and dead-code removal |
| P3R-5 Canonical Cutover | completed P3R-4 | Make assistant-ui path default; legacy becomes explicit fallback | one canonical surface/runtime | all Cutover Gates remain PASS in production configuration | dead-code removal |
| P3R-6 Dead Code Removal | stable P3R-5 fallback window | remove only proven candidates and obsolete Spike controls | dependency-proven cleanup | no removed capability consumer; fallback decision explicit; checks pass | unrelated Runtime/Plugin redesign |

Each phase stops at its output. In particular, P3R-1 must not create the full Runtime package, and P3R-5 must not opportunistically perform P3R-6.

## 24. Open Questions

1. Can one `HttpAgent` instance expose every event/tool/HITL hook needed by both `useAgUiRuntime` and AgentUICreator bridges without private assistant-ui APIs?
2. What is the stable public API for injecting persisted messages and rebinding thread identity, and does it preserve optimistic/run state correctly?
3. Can Composer, empty suggestions and attachments be replaced through public composition alone, or is one minimal upstream seam required?
4. Should sources map to an assistant-ui native/data part or remain an AgentUICreator custom message part?
5. Which upstream ids are stable enough for `messageId`/`partId`, and how should missing timestamps be represented?
6. How should assistant-ui thread state and AgentUICreator application state snapshots/deltas coexist without dual ownership?
7. What is the canonical subagent part/tree mapping, including parent tool and producer identity?
8. Does continuing a historical conversation become supported, or should selected history remain read-only after cutover?
9. Should assistant-ui vendor provenance extend the Source Registry schema or use a registry-managed companion manifest?

These questions do not block P3R-1 formal source placement. They block the relevant P3R-2/3/4 gates and therefore block canonical cutover.
