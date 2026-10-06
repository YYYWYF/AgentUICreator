# Screenshot index

**47 captured scenes**, each with a crop/primary PNG and `-context.png` (94 PNG files). Desktop context 1440×900, device scale 1; one narrow context 390×844. Crops keep the actual component dimensions and anatomy. No AI image generation or HTML/React component replicas.

Production screenshots 01–03 use existing generated embedded Host (older foundation theme API). All other main components use actual current public components or registry implementation in an isolated development fixture. ThreadList uses the existing Theme Showcase. Static props are presentation evidence, not a claim of AG-UI integration for that optional plugin.

Creator dock visible in some context images is injected by the existing development server and is outside design scope. Atlas host document and all fixture outer padding are also outside design scope. Use the cropped images for component proposals.

## Top 10 — feed these to the visual model first

1. [conversation-full-light.png](screenshots/conversation-full-light.png)
2. [component-plan-running.png](screenshots/component-plan-running.png)
3. [component-plan-completed.png](screenshots/component-plan-completed.png)
4. [composer-mention.png](screenshots/composer-mention.png)
5. [composer-slash.png](screenshots/composer-slash.png)
6. [showcase-thread-list.png](screenshots/showcase-thread-list.png)
7. [component-status-working.png](screenshots/component-status-working.png)
8. [component-tool-completed.png](screenshots/component-tool-completed.png)
9. [component-retrieval.png](screenshots/component-retrieval.png)
10. [component-question.png](screenshots/component-question.png)

Compare `conversation-full-dark.png` / `conversation-full-violet.png`; use Composer idle variants, chart and Markdown top/middle as additional evidence. Current Violet is a baseline, not the proposed modern brand design.

## Capture records

### 01-embedded-production-full.png

[Primary/crop](screenshots/01-embedded-production-full.png) · [Full context](screenshots/01-embedded-production-full-context.png)

- Surface / rendered by: Existing generated embedded Agent + AppUIModel plugins; fixture state `existing target/showcase`.
- Viewport: 1440×900; primary PNG: 1440×900.
- Capture URL: `http://127.0.0.1:5186/`.
- Origin/data: Actual existing Host App and installed default composition. Atlas document pane is host-owned, outside Agent UI design scope.
- Relevant files: `examples/creator-embedded-host/src/App.tsx`, `examples/creator-embedded-host/src/AgentMount.tsx`, `examples/creator-embedded-host/src/agent-ui/app-ui/app-ui.json`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-plugin"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`, `[data-slot="button"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Per Plugin; Host document excluded. Existing target composition. Stale foundation noted; do not copy Atlas host elements or Creator dock into design.

### 02-production-empty.png

[Primary/crop](screenshots/02-production-empty.png) · [Full context](screenshots/02-production-empty-context.png)

- Surface / rendered by: Existing generated embedded Agent + AppUIModel plugins; fixture state `existing target/showcase`.
- Viewport: 1440×900; primary PNG: 480×900.
- Capture URL: `http://127.0.0.1:5186/`.
- Origin/data: Actual default embedded AppUIModel; no screenshot fixture.
- Relevant files: `examples/creator-embedded-host/src/App.tsx`, `examples/creator-embedded-host/src/AgentMount.tsx`, `examples/creator-embedded-host/src/agent-ui/app-ui/app-ui.json`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-plugin"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`, `[data-slot="button"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Per Plugin; Host document excluded. Existing target composition. Stale foundation noted; do not copy Atlas host elements or Creator dock into design.

### 03-production-conversation.png

[Primary/crop](screenshots/03-production-conversation.png) · [Full context](screenshots/03-production-conversation-context.png)

- Surface / rendered by: Existing generated embedded Agent + AppUIModel plugins; fixture state `existing target/showcase`.
- Viewport: 1440×900; primary PNG: 480×900.
- Capture URL: `http://127.0.0.1:5186/`.
- Origin/data: Actual default plugins, Mock reasoning-tool-success.
- Relevant files: `examples/creator-embedded-host/src/App.tsx`, `examples/creator-embedded-host/src/AgentMount.tsx`, `examples/creator-embedded-host/src/agent-ui/app-ui/app-ui.json`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="aui_chain-of-thought"]`, `[data-slot="reasoning-root"]`, `[data-slot="reasoning-trigger"]`, `[data-slot="reasoning-trigger-icon"]`, `[data-slot="reasoning-trigger-label"]`, `[data-slot="reasoning-trigger-chevron"]`, `[data-slot="tool-call"]`, `[data-slot="collapsible-trigger"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-plugin"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`, `[data-slot="button"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Per Plugin; Host document excluded. Existing target composition. Stale foundation noted; do not copy Atlas host elements or Creator dock into design.

### component-plan-running.png

[Primary/crop](screenshots/component-plan-running.png) · [Full context](screenshots/component-plan-running-context.png)

- Surface / rendered by: AgentPlan; fixture state `plan-running`.
- Viewport: 1440×900; primary PNG: 384×159.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=plan-running&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-plan.tsx`.
- Observed selectors in rendered page: `[data-slot="agent-plan"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve title/progress/step order; foreground alpha makes Violet subtle.

### component-plan-completed.png

[Primary/crop](screenshots/component-plan-completed.png) · [Full context](screenshots/component-plan-completed-context.png)

- Surface / rendered by: AgentPlan; fixture state `plan-completed`.
- Viewport: 1440×900; primary PNG: 384×159.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=plan-completed&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-plan.tsx`.
- Observed selectors in rendered page: `[data-slot="agent-plan"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve title/progress/step order; foreground alpha makes Violet subtle.

### component-status-working.png

[Primary/crop](screenshots/component-status-working.png) · [Full context](screenshots/component-status-working-context.png)

- Surface / rendered by: AgentStatus; fixture state `status-working`.
- Viewport: 1440×900; primary PNG: 600×38.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=status-working&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-status.tsx`.
- Observed selectors in rendered page: `[data-slot="agent-status"]`, `[data-slot="agent-status-trailing"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve indicator/label/elapsed/trailing structure. Working blue, done emerald.

### component-status-done.png

[Primary/crop](screenshots/component-status-done.png) · [Full context](screenshots/component-status-done-context.png)

- Surface / rendered by: AgentStatus; fixture state `status-done`.
- Viewport: 1440×900; primary PNG: 600×38.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=status-done&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-status.tsx`.
- Observed selectors in rendered page: `[data-slot="agent-status"]`, `[data-slot="agent-status-trailing"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve indicator/label/elapsed/trailing structure. Working blue, done emerald.

### component-status-waiting.png

[Primary/crop](screenshots/component-status-waiting.png) · [Full context](screenshots/component-status-waiting-context.png)

- Surface / rendered by: AgentStatus; fixture state `status-waiting`.
- Viewport: 1440×900; primary PNG: 600×38.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=status-waiting&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-status.tsx`.
- Observed selectors in rendered page: `[data-slot="agent-status"]`, `[data-slot="agent-status-trailing"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve indicator/label/elapsed/trailing structure. Working blue, done emerald.

### component-job-running.png

[Primary/crop](screenshots/component-job-running.png) · [Full context](screenshots/component-job-running-context.png)

- Surface / rendered by: JobProgress; fixture state `job-running`.
- Viewport: 1440×900; primary PNG: 384×99.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=job-running&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.tsx`.
- Observed selectors in rendered page: `[data-slot="job-progress"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve stage weights, progress and outcome semantics. Blue running; emerald success.

### component-job-success.png

[Primary/crop](screenshots/component-job-success.png) · [Full context](screenshots/component-job-success-context.png)

- Surface / rendered by: JobProgress; fixture state `job-success`.
- Viewport: 1440×900; primary PNG: 384×129.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=job-success&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.tsx`.
- Observed selectors in rendered page: `[data-slot="job-progress"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve stage weights, progress and outcome semantics. Blue running; emerald success.

### component-web-search.png

[Primary/crop](screenshots/component-web-search.png) · [Full context](screenshots/component-web-search-context.png)

- Surface / rendered by: WebSearch; fixture state `web-search`.
- Viewport: 1440×900; primary PNG: 384×160.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=web-search&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/web-search.tsx`.
- Observed selectors in rendered page: `[data-slot="web-search"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve query, status and results. Foreground alpha.

### component-retrieval.png

[Primary/crop](screenshots/component-retrieval.png) · [Full context](screenshots/component-retrieval-context.png)

- Surface / rendered by: RetrievalChunks; fixture state `retrieval`.
- Viewport: 1440×900; primary PNG: 384×244.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=retrieval&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/retrieval-chunks.tsx`.
- Observed selectors in rendered page: `[data-slot="retrieval-chunks"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve source/locator/score/text hierarchy. Blue relevance bar and emerald high score.

### component-tool-running.png

[Primary/crop](screenshots/component-tool-running.png) · [Full context](screenshots/component-tool-running-context.png)

- Surface / rendered by: ConversationToolCall; fixture state `tool-running`.
- Viewport: 1440×900; primary PNG: 600×143.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=tool-running&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/tool-call.tsx`.
- Observed selectors in rendered page: `[data-slot="tool-call"]`, `[data-slot="collapsible-trigger"]`, `[data-slot="collapsible-content"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve request/result disclosure. Foreground alpha and shared paper surface.

### component-tool-completed.png

[Primary/crop](screenshots/component-tool-completed.png) · [Full context](screenshots/component-tool-completed-context.png)

- Surface / rendered by: ConversationToolCall; fixture state `tool-completed`.
- Viewport: 1440×900; primary PNG: 600×143.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=tool-completed&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/tool-call.tsx`.
- Observed selectors in rendered page: `[data-slot="tool-call"]`, `[data-slot="collapsible-trigger"]`, `[data-slot="collapsible-content"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve request/result disclosure. Foreground alpha and shared paper surface.

### component-fallback-error.png

[Primary/crop](screenshots/component-fallback-error.png) · [Full context](screenshots/component-fallback-error-context.png)

- Surface / rendered by: ConversationToolFallback; fixture state `fallback-error`.
- Viewport: 1440×900; primary PNG: 600×28.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=fallback-error&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/tool-fallback.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="tool-fallback-root"]`, `[data-slot="tool-fallback-trigger"]`, `[data-slot="tool-fallback-trigger-icon"]`, `[data-slot="tool-fallback-trigger-label"]`, `[data-slot="tool-fallback-trigger-chevron"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 4. Actual collapsed error tool; inner error details not expanded in this screenshot. Preserve lifecycle/disclosure.

### component-reasoning.png

[Primary/crop](screenshots/component-reasoning.png) · [Full context](screenshots/component-reasoning-context.png)

- Surface / rendered by: ConversationCanonicalReasoningGroup; fixture state `reasoning`.
- Viewport: 1440×900; primary PNG: 600×87.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=reasoning&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/reasoning.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="reasoning-root"]`, `[data-slot="reasoning-trigger"]`, `[data-slot="reasoning-trigger-icon"]`, `[data-slot="reasoning-trigger-label"]`, `[data-slot="reasoning-trigger-chevron"]`, `[data-slot="reasoning-content"]`, `[data-slot="reasoning-fade"]`, `[data-slot="reasoning-text"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve trigger, content, fade/scroll and collapse anatomy. Expanded in capture.

### component-question.png

[Primary/crop](screenshots/component-question.png) · [Full context](screenshots/component-question-context.png)

- Surface / rendered by: ConversationQuestionFlow → upstream OptionList; fixture state `question`.
- Viewport: 1440×900; primary PNG: 600×218.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=question&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/option-list.tsx`.
- Observed selectors in rendered page: `[data-slot="option-list"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 3 product flow / Level 4 upstream internals. Preserve steps, choices, submission and receipt model. Additional selected shot is submitting/waiting for receipt.

### component-source.png

[Primary/crop](screenshots/component-source.png) · [Full context](screenshots/component-source-context.png)

- Surface / rendered by: ConversationSource; fixture state `source`.
- Viewport: 1440×900; primary PNG: 600×26.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=source&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/sources.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="source"]`, `[data-slot="source-icon"]`, `[data-slot="source-title"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve source URL/title/icon. No invented citation numbers.

### component-file.png

[Primary/crop](screenshots/component-file.png) · [Full context](screenshots/component-file-context.png)

- Surface / rendered by: ConversationFile; fixture state `file`.
- Viewport: 1440×900; primary PNG: 600×56.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=file&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/file.tsx`.
- Observed selectors in rendered page: `[data-slot="file-root"]`, `[data-slot="file-icon"]`, `[data-slot="file-name"]`, `[data-slot="file-size"]`, `[data-slot="file-download"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve filename, MIME and download action.

### component-dialog.png

[Primary/crop](screenshots/component-dialog.png) · [Full context](screenshots/component-dialog-context.png)

- Surface / rendered by: AgentUIDialogContent; fixture state `dialog`.
- Viewport: 1440×900; primary PNG: 384×164.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=dialog&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/../../ui/dialog.tsx`.
- Observed selectors in rendered page: `[data-slot="dialog-portal"]`, `[data-slot="dialog-overlay"]`, `[data-slot="dialog-content"]`, `[data-slot="button"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 1. Preserve title/description/action and scoped portal. Do not change modal positioning DOM.

### component-popover.png

[Primary/crop](screenshots/component-popover.png) · [Full context](screenshots/component-popover-context.png)

- Surface / rendered by: AgentUIPopoverContent; fixture state `popover`.
- Viewport: 1440×900; primary PNG: 288×64.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=popover&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/../../ui/popover.tsx`.
- Observed selectors in rendered page: `[data-slot="popover-trigger"]`, `[data-slot="popover-content"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 1. Preserve anchor and popup behavior. Popover tokens plus foreground/10 ring.

### component-tooltip.png

[Primary/crop](screenshots/component-tooltip.png) · [Full context](screenshots/component-tooltip-context.png)

- Surface / rendered by: AgentUITooltipContent; fixture state `tooltip`.
- Viewport: 1440×900; primary PNG: 112×28.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=tooltip&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real @agent-ui/react public component with fixed mock props, development fixture; not proof that this surface is installed in default composition.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/../../ui/tooltip.tsx`.
- Observed selectors in rendered page: `[data-slot="tooltip-trigger"]`, `[data-slot="tooltip-content"]`, `[data-slot="tooltip-arrow"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 1. Preserve trigger/placement. Tooltip uses foreground/background, not popover tokens.

### 04-composer-idle-light.png

[Primary/crop](screenshots/04-composer-idle-light.png) · [Full context](screenshots/04-composer-idle-light-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 672×102.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=light&scenario=markdown-showcase`.
- Origin/data: Real canonical Composer in isolated ConversationRuntimeProvider.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### 05-markdown-conversation-light.png

[Primary/crop](screenshots/05-markdown-conversation-light.png) · [Full context](screenshots/05-markdown-conversation-light-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=light&scenario=markdown-showcase`.
- Origin/data: Actual ConversationThread driven by built-in AG-UI markdown-showcase. Scroll position as rendered, full viewport context retained.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_assistant-response-footer"]`, `[data-slot="assistant-ui-copy-action-idle"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### 04-composer-idle-dark.png

[Primary/crop](screenshots/04-composer-idle-dark.png) · [Full context](screenshots/04-composer-idle-dark-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 672×102.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=dark&scenario=markdown-showcase`.
- Origin/data: Real canonical Composer in isolated ConversationRuntimeProvider.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### 05-markdown-conversation-dark.png

[Primary/crop](screenshots/05-markdown-conversation-dark.png) · [Full context](screenshots/05-markdown-conversation-dark-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=dark&scenario=markdown-showcase`.
- Origin/data: Actual ConversationThread driven by built-in AG-UI markdown-showcase. Scroll position as rendered, full viewport context retained.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_assistant-response-footer"]`, `[data-slot="assistant-ui-copy-action-idle"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### 04-composer-idle-violet.png

[Primary/crop](screenshots/04-composer-idle-violet.png) · [Full context](screenshots/04-composer-idle-violet-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 672×102.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=violet&scenario=markdown-showcase`.
- Origin/data: Real canonical Composer in isolated ConversationRuntimeProvider.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### 05-markdown-conversation-violet.png

[Primary/crop](screenshots/05-markdown-conversation-violet.png) · [Full context](screenshots/05-markdown-conversation-violet-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=violet&scenario=markdown-showcase`.
- Origin/data: Actual ConversationThread driven by built-in AG-UI markdown-showcase. Scroll position as rendered, full viewport context retained.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_assistant-response-footer"]`, `[data-slot="assistant-ui-copy-action-idle"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### composer-mention.png

[Primary/crop](screenshots/composer-mention.png) · [Full context](screenshots/composer-mention-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real trigger components; fixture mention source deliberately supplies success, empty, and error.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`, `packages/react/src/internal/conversation-composer-triggers.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/directive-text.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="composer-trigger-popover"]`, `[data-slot="composer-trigger-popover-items"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback. Preserve selection/async errors, retry and raw directive result. Result captures currently show encoded directives as textarea text; do not assume styled chips exist.

### composer-mention-empty.png

[Primary/crop](screenshots/composer-mention-empty.png) · [Full context](screenshots/composer-mention-empty-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real trigger components; fixture mention source deliberately supplies success, empty, and error.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`, `packages/react/src/internal/conversation-composer-triggers.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/directive-text.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="composer-trigger-popover"]`, `[data-slot="composer-trigger-popover-items"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback. Preserve selection/async errors, retry and raw directive result. Result captures currently show encoded directives as textarea text; do not assume styled chips exist.

### composer-mention-error.png

[Primary/crop](screenshots/composer-mention-error.png) · [Full context](screenshots/composer-mention-error-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real trigger components; fixture mention source deliberately supplies success, empty, and error.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`, `packages/react/src/internal/conversation-composer-triggers.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/directive-text.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="composer-trigger-popover"]`, `[data-slot="composer-trigger-popover-items"]`, `[data-slot="composer-trigger-error"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback. Preserve selection/async errors, retry and raw directive result. Result captures currently show encoded directives as textarea text; do not assume styled chips exist.

### composer-slash.png

[Primary/crop](screenshots/composer-slash.png) · [Full context](screenshots/composer-slash-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real trigger components; fixture mention source deliberately supplies success, empty, and error.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`, `packages/react/src/internal/conversation-composer-triggers.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/directive-text.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="composer-trigger-popover"]`, `[data-slot="composer-trigger-popover-items"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback. Preserve selection/async errors, retry and raw directive result. Result captures currently show encoded directives as textarea text; do not assume styled chips exist.

### component-chart.png

[Primary/crop](screenshots/component-chart.png) · [Full context](screenshots/component-chart-context.png)

- Surface / rendered by: Actual registry chartMessageUI; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 416×192.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=light&scenario=data-message-chart`.
- Origin/data: Actual registry chart-message implementation mounted via DataMessageUIRegistration and AG-UI mock scenario.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/source-registry/registry/items/plugin-chart-message/files/plugins/chart-message/index.tsx`, `packages/source-registry/registry/items/plugin-chart-message/files/plugins/chart-message/style.css`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="aui_assistant-response-footer"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="assistant-ui-copy-action-idle"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 3. Preserve chart title/labels/value and bar ratios. Uses --chart-1, --muted and --border. Real Plugin CSS imported after root CSS.

### showcase-thread-list.png

[Primary/crop](screenshots/showcase-thread-list.png) · [Full context](screenshots/showcase-thread-list-context.png)

- Surface / rendered by: ConversationThreadListRoot / Item / New; fixture state `existing target/showcase`.
- Viewport: 1440×900; primary PNG: 224×626.
- Capture URL: `http://127.0.0.1:5186/theme-showcase.html`.
- Origin/data: Real ThreadList public surfaces with fixture thread binding. Showcase samples are not product Messages.
- Relevant files: `examples/creator-embedded-host/src/theme-showcase.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread-list.aui.tsx`, `packages/react/src/internal/conversation-thread-list-item.tsx`.
- Observed selectors in rendered page: `[data-slot="native-select-wrapper"]`, `[data-slot="native-select"]`, `[data-slot="native-select-option"]`, `[data-slot="native-select-icon"]`, `[data-slot="aui_thread-list-root"]`, `[data-slot="aui_thread-list-new"]`, `[data-slot="aui_thread-list-item"]`, `[data-slot="aui_thread-list-item-trigger"]`, `[data-slot="aui_thread-list-item-title"]`, `[data-slot="button"]`, `[data-slot="popover-trigger"]`, `[data-slot="tool-call"]`, `[data-slot="collapsible-trigger"]`, `[data-slot="collapsible-content"]`, `[data-slot="collapsible"]`, `[data-slot="source"]`, `[data-slot="source-icon"]`, `[data-slot="source-title"]`, `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve existing new-chat/thread item/control hierarchy. Thread binding is fixture-only; no sidebar in embedded default.

### 06-conversation-narrow.png

[Primary/crop](screenshots/06-conversation-narrow.png) · [Full context](screenshots/06-conversation-narrow-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 390×844; primary PNG: 390×844.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&theme=light&scenario=reasoning-tool-success`.
- Origin/data: Real canonical thread/composer at narrow viewport; fixture outer padding 48px is not production layout.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### component-quote.png

[Primary/crop](screenshots/component-quote.png) · [Full context](screenshots/component-quote-context.png)

- Surface / rendered by: ConversationQuoteBlock; fixture state `quote`.
- Viewport: 1440×900; primary PNG: 600×20.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=quote&scenario=reasoning-tool-success&theme=light`.
- Origin/data: Actual public component, fixed props; does not assert default installation.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/quote.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="quote-block"]`, `[data-slot="quote-block-icon"]`, `[data-slot="quote-block-text"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve quote text and source message identity.

### component-subagents.png

[Primary/crop](screenshots/component-subagents.png) · [Full context](screenshots/component-subagents-context.png)

- Surface / rendered by: SubagentList; fixture state `subagents`.
- Viewport: 1440×900; primary PNG: 600×232.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=subagents&scenario=reasoning-tool-success&theme=light`.
- Origin/data: Actual public component, fixed props; does not assert default installation.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/subagent-list.tsx`.
- Observed selectors in rendered page: `[data-slot="subagent-list"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 2. Preserve agent/model/progress/completion and summary distinction.

### question-selected.png

[Primary/crop](screenshots/question-selected.png) · [Full context](screenshots/question-selected-context.png)

- Surface / rendered by: ConversationQuestionFlow → upstream OptionList; fixture state `question`.
- Viewport: 1440×900; primary PNG: 600×242.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=question&scenario=reasoning-tool-success&theme=light`.
- Origin/data: Real QuestionFlow / OptionList selected state.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/option-list.tsx`.
- Observed selectors in rendered page: `[data-slot="option-list"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Level 3 product flow / Level 4 upstream internals. Preserve steps, choices, submission and receipt model. Additional selected shot is submitting/waiting for receipt.

### composer-attachment.png

[Primary/crop](screenshots/composer-attachment.png) · [Full context](screenshots/composer-attachment-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 672×166.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&scenario=reasoning-tool-success&theme=light`.
- Origin/data: Actual Composer PDF attachment with official PDF-only DemoAttachmentAdapter, mock PDF bytes; no claim of PDF content validation.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/attachment.aui.tsx`, `packages/mock-agent/src/demo-attachment-adapter.ts`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="avatar"]`, `[data-slot="avatar-fallback"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback. Actual PDF tile; filename is tooltip presentation, not always visible text.

### composer-focus.png

[Primary/crop](screenshots/composer-focus.png) · [Full context](screenshots/composer-focus-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 672×102.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&scenario=reasoning-tool-success&theme=light`.
- Origin/data: Real focus state, not a CSS reconstruction.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### conversation-full-light.png

[Primary/crop](screenshots/conversation-full-light.png) · [Full context](screenshots/conversation-full-light-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&scenario=reasoning-tool-success&theme=light`.
- Origin/data: Actual current public Thread with AG-UI reasoning-tool-success, current root/tokens. Fixture tool registry is empty: actual fallback is visible.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="aui_chain-of-thought"]`, `[data-slot="reasoning-root"]`, `[data-slot="reasoning-trigger"]`, `[data-slot="reasoning-trigger-icon"]`, `[data-slot="reasoning-trigger-label"]`, `[data-slot="reasoning-trigger-chevron"]`, `[data-slot="tool-group-root"]`, `[data-slot="tool-group-trigger"]`, `[data-slot="tool-group-trigger-label"]`, `[data-slot="tool-group-trigger-chevron"]`, `[data-slot="aui_assistant-response-footer"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="assistant-ui-copy-action-idle"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### conversation-full-dark.png

[Primary/crop](screenshots/conversation-full-dark.png) · [Full context](screenshots/conversation-full-dark-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&scenario=reasoning-tool-success&theme=dark`.
- Origin/data: Actual current public Thread with AG-UI reasoning-tool-success, current root/tokens. Fixture tool registry is empty: actual fallback is visible.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="aui_chain-of-thought"]`, `[data-slot="reasoning-root"]`, `[data-slot="reasoning-trigger"]`, `[data-slot="reasoning-trigger-icon"]`, `[data-slot="reasoning-trigger-label"]`, `[data-slot="reasoning-trigger-chevron"]`, `[data-slot="tool-group-root"]`, `[data-slot="tool-group-trigger"]`, `[data-slot="tool-group-trigger-label"]`, `[data-slot="tool-group-trigger-chevron"]`, `[data-slot="aui_assistant-response-footer"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="assistant-ui-copy-action-idle"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### conversation-full-violet.png

[Primary/crop](screenshots/conversation-full-violet.png) · [Full context](screenshots/conversation-full-violet-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&scenario=reasoning-tool-success&theme=violet`.
- Origin/data: Actual current public Thread with AG-UI reasoning-tool-success, current root/tokens. Fixture tool registry is empty: actual fallback is visible.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="aui_chain-of-thought"]`, `[data-slot="reasoning-root"]`, `[data-slot="reasoning-trigger"]`, `[data-slot="reasoning-trigger-icon"]`, `[data-slot="reasoning-trigger-label"]`, `[data-slot="reasoning-trigger-chevron"]`, `[data-slot="tool-group-root"]`, `[data-slot="tool-group-trigger"]`, `[data-slot="tool-group-trigger-label"]`, `[data-slot="tool-group-trigger-chevron"]`, `[data-slot="aui_assistant-response-footer"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="assistant-ui-copy-action-idle"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### markdown-top.png

[Primary/crop](screenshots/markdown-top.png) · [Full context](screenshots/markdown-top-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&scenario=markdown-showcase&theme=light`.
- Origin/data: Actual streamed Markdown at top scroll position.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_assistant-response-footer"]`, `[data-slot="assistant-ui-copy-action-idle"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### markdown-middle.png

[Primary/crop](screenshots/markdown-middle.png) · [Full context](screenshots/markdown-middle-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 900×760.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&scenario=markdown-showcase&theme=light`.
- Origin/data: Actual streamed Markdown at middle scroll position.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="aui_user-message-root"]`, `[data-slot="aui_assistant-message-root"]`, `[data-slot="aui_assistant-message-content"]`, `[data-slot="aui_assistant-message-parts"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_assistant-response-footer"]`, `[data-slot="assistant-ui-copy-action-idle"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback.

### composer-mention-result.png

[Primary/crop](screenshots/composer-mention-result.png) · [Full context](screenshots/composer-mention-result-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 672×102.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&scenario=reasoning-tool-success&theme=light`.
- Origin/data: Actual selected mention result in Composer.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`, `packages/react/src/internal/conversation-composer-triggers.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/directive-text.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback. Preserve selection/async errors, retry and raw directive result. Result captures currently show encoded directives as textarea text; do not assume styled chips exist.

### composer-slash-result.png

[Primary/crop](screenshots/composer-slash-result.png) · [Full context](screenshots/composer-slash-result-context.png)

- Surface / rendered by: ConversationThread / CanonicalComposer; fixture state `conversation`.
- Viewport: 1440×900; primary PNG: 672×102.
- Capture URL: `http://127.0.0.1:5186/dev/violet-input/index.html?surface=conversation&scenario=reasoning-tool-success&theme=light`.
- Origin/data: Actual selected slash directive result in Composer.
- Relevant files: `examples/creator-embedded-host/dev/violet-input/fixture.tsx`, `packages/react/src/public.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx`, `packages/react/src/internal/conversation-composer-triggers.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/composer-trigger-popover.aui.tsx`, `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/directive-text.tsx`.
- Observed selectors in rendered page: `[data-slot="aui_thread-viewport"]`, `[data-slot="aui_message-group"]`, `[data-slot="tooltip-trigger"]`, `[data-slot="aui_composer-shell"]`, `[data-slot="aui_composer-before-input"]`, `[data-slot="aui_composer-leading-actions"]`, `[data-slot="aui_composer-trailing-actions"]`. These are observed page-wide hooks; verify component scope before overriding.
- Design freedom / current visual characteristics / must preserve: Mixed: Level 2 composer / Level 4 message internals. Actual current public Thread driven by AG-UI Mock. Preserve controls/message anatomy; fixture welcome is upstream fallback. Preserve selection/async errors, retry and raw directive result. Result captures currently show encoded directives as textarea text; do not assume styled chips exist.

## Missing / limited states

No screenshot proof for installed frontend form/dialog capability lifecycle, A2UI/Generative UI integration (not active in inspected embedded target), image zoom, quote selection toolbar, nested task-group transcript, archived/renamed/deleted thread menu, resumed plan events, all hover/disabled states, warning/error/success for every component, Mention loading, or asynchronous command failure. These remain available source surfaces where noted; do not invent a design from absent evidence.

AgentPlan running/completed shots use the actual public component with authoritative props, not proof of latest resumed Activity stream behavior. AgentStatus/JobProgress fixed props are similarly visual baselines. ToolFallback error is collapsed, so it is not an expanded error-detail screenshot. Question selected shot shows submission awaiting a receipt, not a completed receipt.

This is an input collection, not behavioral acceptance of every optional Plugin. Errors discovered in product sources would be recorded, not fixed. Production code/styles and vendor were not modified by this task.
