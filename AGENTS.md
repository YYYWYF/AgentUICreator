## Goal

Build an **Agent Frontend UI Plugin Creator**.

Users modify the frontend through a Creator Agent. The final app connects to **one Agent Runtime through API** and consumes **AG-UI** data.

## Architecture

Keep responsibilities separate:

- **Creator Agent**: understands requests and edits the UI project.
- **AppUIModel**: defines layout, slots, plugin instances, and bindings.
- **UI Plugin**: implements frontend behavior.
- **UI Runtime**: renders AppUIModel deterministically.
- **AG-UI**: provides Agent messages/state.

Creator Agent is a general coding agent specialized with prompts, skills, tools, and context. Do not turn it into a fixed workflow.

## Build and Deployment Boundary

Creator is a development-time tool only. It must not be a production runtime dependency of the generated Agent App.

The final Agent Frontend must build and deploy independently without Creator. Production capabilities such as Agent Frontend Runtime, AG-UI client, and Plugin Runtime belong to the generated project and must be built and shipped with the final application.

UI Plugin implementation dependencies also belong to the generated project, including UI libraries or styling systems such as Ant Design, MUI, or Tailwind. Creator must not prescribe a specific UI library or major version, and Plugins must not be required to share Creator's UI dependencies.

## Workspace Boundary

- `packages/creator` is the publishable development tool, including Creator core, CLI, optional Vite integration, UI, prompts, skills, and tool permissions.
- `examples/agent-frontend` is the independent Agent Frontend target and must not depend on `@agent-ui/creator`.
- `apps/creator-workbench` is a development-only composition shell that connects Creator to the example target through an explicit `projectRoot`.
- Creator configuration belongs to the tool host, not the generated Agent Frontend. The workspace workbench reads `.env.creator.local` from the workspace root.
- Keep the target project usable through its own `dev`, `test`, `typecheck`, and `build` scripts without the Creator package or workbench.

## Project Reference

`docs/agent-ui-plugin-creator-launch-plan.md` is the canonical design reference for this project.

`docs/agent-ui-reference-guide.md` is the detailed decision guide for Agent UI reference selection and responsibility boundaries.

Read the relevant sections before:

- creating the initial project structure;
- making architecture or technology decisions;
- changing AppUIModel, Layout Tree, UI Plugin, UI Runtime, or AG-UI boundaries;
- introducing new framework-level concepts.

Read the relevant sections of the Agent UI reference guide before:

- designing Agent interaction semantics such as HITL, approval, interruption, shared state, frontend tools, or generative UI;
- defining Message, Thread, Composer, Tool, Reasoning, Attachment, Source, or Artifact component structure;
- deciding how Agent UI states and interactions should be expressed with the generated project's selected UI stack, consulting Ant Design X only when Ant Design is applicable;
- mapping AG-UI events, streaming updates, tool calls, snapshots, deltas, errors, or run state into Frontend State and UI.

Select the reference project that matches the problem layer. Do not research, copy, or introduce all reference projects by default. Reference projects provide patterns and trade-offs; they do not override product requirements, AG-UI semantics, Plugin Contract, Project Frontend State, or this project's architecture.

For small, isolated implementation changes, consult only the applicable document and sections when the change may affect these design contracts.

Treat this `AGENTS.md` as the hard execution constraints, the launch plan as the canonical project design reference, and the Agent UI reference guide as the detailed reference-selection guide. The generated-project independence and UI-stack ownership rules in this file supersede any assumption in those references that Ant Design is mandatory; treat their Ant Design guidance as conditional guidance for generated projects that select Ant Design. For any other conflict, stop and surface it instead of guessing.

When encountering implementation problems, DeepSeek Harness may be used as a secondary reference for approaches and trade-offs. Do not copy its code wholesale. Adapt any borrowed ideas to this project's architecture, contracts, and conventions.

## Scope

Only build the Agent frontend.

Do not introduce:

- Tool / Skill / Runtime / Model plugins
- Agent backend logic
- Multi-page concepts
- Multiple Agent Runtimes

## Rules

- `AppUIModel` is the single source of truth for UI composition.
- Use Layout Tree concepts such as Row, Column, Stack, Panel, and Slot.
- Prefer editing AppUIModel for layout, size, placement, and composition changes.
- Edit or create UI Plugin code only when custom behavior is needed.
- Reuse existing plugins when practical.
- UI Plugins consume AG-UI messages/state through the provided runtime context.
- UI Plugins must not manage their own Agent Runtime.
- Creator may modify `app-ui/*`, `plugins/*`, and frontend dependencies required by the generated project.
- Do not couple the generated project to Creator packages, build tooling, runtime services, or UI dependencies.
- Treat `runtime/*` and `framework/*` as read-only unless explicitly working on the framework.
- Inspect existing project conventions before editing.
- Prefer the smallest correct change.
- Run relevant validation/typecheck after meaningful changes.
- Do not redesign unrelated architecture.

## Agent UI

本项目用于构建可消费 **AG-UI** 的 Agent 前端 UI Plugin。

UI Plugin 使用生成项目自己选择并安装的 UI Library 或样式方案。始终先检查生成项目的现有技术栈和约定，再使用其当前安装版本提供的稳定 API；Creator 不固定 Ant Design、MUI、Tailwind 或任何具体 major version。

Agent UI 设计按问题类型参考以下项目：

- **CopilotKit**：Agent UX、HITL、Shared State、Frontend Tool、Generative UI 等 Agent 交互语义。
- **assistant-ui**：Message、Thread、Composer、Tool、Reasoning 等 UI Primitive 和组件结构。
- **Ant Design X**：当生成项目使用 Ant Design 时，参考 Ant Design 风格下的 Agent UI 交互与视觉表达。
- **TDesign AIGC**：AG-UI Event / Streaming / Tool Call 到前端 State 和 UI 的映射实现。

参考顺序：

```text
Agent 行为      → CopilotKit
组件结构        → assistant-ui
AntD 表达       → Ant Design X（仅适用于选择 Ant Design 的项目）
AG-UI 状态映射  → TDesign AIGC
最终实现        → 生成项目选择的 UI Stack
```

参考库用于借鉴设计和实现方式，不作为本项目 Runtime、SDK、Message Model 或基础 UI 框架。

除非项目明确需要，不引入这些参考库作为运行时依赖。

始终保持：

```text
Agent Runtime
    ↓
AG-UI
    ↓
Frontend State
    ↓
UI Plugin
    ↓
生成项目选择的 UI Stack
```

优先级：

```text
产品需求
> AG-UI 语义
> Plugin Contract
> Project Frontend State
> Reference Projects
> 生成项目当前 UI Library API
```
