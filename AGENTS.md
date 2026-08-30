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

## Project Reference

`docs/agent-ui-plugin-creator-launch-plan.md` is the canonical design reference for this project.

Read the relevant sections before:

- creating the initial project structure;
- making architecture or technology decisions;
- changing AppUIModel, Layout Tree, UI Plugin, UI Runtime, or AG-UI boundaries;
- introducing new framework-level concepts.

For small, isolated implementation changes, consult the document only when the change may affect these design contracts.

Treat this `AGENTS.md` as the hard execution constraints and the launch plan as the detailed design reference. If they appear to conflict, stop and surface the conflict instead of guessing.

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
- Creator may modify `app-ui/*`, `plugins/*`, and required frontend dependencies.
- Treat `runtime/*` and `framework/*` as read-only unless explicitly working on the framework.
- Inspect existing project conventions before editing.
- Prefer the smallest correct change.
- Run relevant validation/typecheck after meaningful changes.
- Do not redesign unrelated architecture.
