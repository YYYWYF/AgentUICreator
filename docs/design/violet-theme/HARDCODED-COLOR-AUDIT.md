# Hardcoded color audit

Source commit: `662774fb8c3935584e03abf7ececea08c3d89110`. Static scan of source `.ts/.tsx/.css` in the two requested scopes, excluding tests/dist; line-level matches, not a count of bugs. Exact reproduction: `python3 docs/design/violet-theme/scripts/collect-source.py`.

Found **146 matching lines**; **5 brand-like blue/indigo/violet/purple lines** outside canonical token declarations. Full machine-readable evidence: [audit.json](audit.json).

Palette declarations in shadcn-theme-presets.css and agent-ui-theme-extensions.css are expected. Success emerald/green, error red, warning amber should keep their meaning. Transparent black overlays and neutral text are not automatically branding bugs. Hex/rgb in dynamic CSS or markdown syntax need manual interpretation.

Highest priority: AgentStatus working dot, JobProgress active bar, RetrievalChunks relevance bar, surfaces.tsx shared live constant, Sources info variant. Search for consumers before overriding a shared style. AgentPlan uses foreground alpha, not primary; no blue hardcode there.

No fixes performed.

| Category | Intent | Source | Literal matches |
| --- | --- | --- | --- |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-status.tsx:39` | emerald-500 |
| A upstream-owned | brand-like candidate | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/agent-status.tsx:48` | blue-500; blue-400 |
| A upstream-owned | review in context | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/attachment.aui.tsx:167` | ring-black/10; ring-white/10 |
| A upstream-owned | review in context | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/attachment.aui.tsx:221` | bg-black/50; text-white; bg-black/70; text-white |
| A upstream-owned | review in context | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/image.tsx:466` | bg-black/80 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.tsx:107` | emerald-500 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.tsx:109` | amber-500; amber-400 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.tsx:111` | red-600; red-400 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.tsx:130` | amber-500; amber-400 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.tsx:132` | red-600; red-400 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.tsx:136` | emerald-500 |
| A upstream-owned | brand-like candidate | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/job-progress.tsx:176` | emerald-500; blue-500; blue-400 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/option-list.tsx:253` | red-600; red-400 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/retrieval-chunks.tsx:85` | emerald-600; emerald-400 |
| A upstream-owned | brand-like candidate | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/retrieval-chunks.tsx:105` | blue-500/70; blue-400/70 |
| A upstream-owned | brand-like candidate | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/sources.aui.tsx:24` | blue-100; blue-700; blue-900/50; blue-300; blue-100/80 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/sources.aui.tsx:26` | amber-100; amber-700; amber-900/50; amber-300; amber-100/80 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/sources.aui.tsx:28` | emerald-100; emerald-700; emerald-900/50; emerald-300; emerald-100/80 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/sources.aui.tsx:30` | red-100; red-700; red-900/50; red-300; red-100/80 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/subagent-list.tsx:62` | emerald-500 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/subagent-list.tsx:84` | emerald-500/70 |
| A upstream-owned | brand-like candidate | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/surfaces.tsx:43` | blue-500; blue-400 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/task-card.tsx:35` | emerald-500 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/thread.aui.tsx:536` | red-200 |
| A upstream-owned | C status semantics; preserve unless evidence says otherwise | `packages/react/src/internal/vendor/assistant-ui/components/assistant-ui/elements/tool-call.tsx:69` | emerald-500 |
| A upstream-owned | review in context | `packages/react/src/internal/vendor/assistant-ui/components/ui/badge.tsx:16` | text-white |
| A upstream-owned | review in context | `packages/react/src/internal/vendor/assistant-ui/components/ui/dialog.tsx:37` | bg-black/10 |
| A upstream-owned | review in context | `packages/react/src/internal/vendor/assistant-ui/components/ui/sheet.tsx:34` | bg-black/10 |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:3` | #16865b |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:4` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:5` | #a86308 |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:6` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:7` | rgb(0 0 0 / 52%) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:11` | oklch(0.765 0.177 163.223) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:12` | oklch(0.262 0.051 172.552) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:13` | oklch(0.828 0.189 84.429) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:14` | oklch(0.279 0.077 45.635) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:56` | rgb(0 0 0 / 10%) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/agent-ui-theme-extensions.css:57` | rgb(0 0 0 / 18%) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:4` | oklch(1 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:5` | oklch(0.141 0.005 285.823) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:6` | oklch(1 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:7` | oklch(0.141 0.005 285.823) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:8` | oklch(1 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:9` | oklch(0.141 0.005 285.823) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:10` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:11` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:12` | oklch(0.967 0.001 286.375) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:13` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:14` | oklch(0.967 0.001 286.375) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:15` | oklch(0.552 0.016 285.938) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:16` | oklch(0.967 0.001 286.375) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:17` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:18` | oklch(0.577 0.245 27.325) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:19` | oklch(0.92 0.004 286.32) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:20` | oklch(0.92 0.004 286.32) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:21` | oklch(0.705 0.015 286.067) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:22` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:23` | oklch(0.141 0.005 285.823) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:24` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:25` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:26` | oklch(0.967 0.001 286.375) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:27` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:28` | oklch(0.92 0.004 286.32) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:29` | oklch(0.705 0.015 286.067) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:31` | oklch(0.871 0.006 286.286) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:32` | oklch(0.552 0.016 285.938) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:33` | oklch(0.442 0.017 285.786) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:34` | oklch(0.37 0.013 285.805) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:35` | oklch(0.274 0.006 286.033) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:40` | oklch(0.141 0.005 285.823) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:41` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:42` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:43` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:44` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:45` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:46` | oklch(0.92 0.004 286.32) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:47` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:48` | oklch(0.274 0.006 286.033) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:49` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:50` | oklch(0.274 0.006 286.033) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:51` | oklch(0.705 0.015 286.067) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:52` | oklch(0.274 0.006 286.033) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:53` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:54` | oklch(0.704 0.191 22.216) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:55` | oklch(1 0 0 / 10%) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:56` | oklch(1 0 0 / 15%) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:57` | oklch(0.552 0.016 285.938) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:58` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:59` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:60` | oklch(0.488 0.243 264.376) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:61` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:62` | oklch(0.274 0.006 286.033) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:63` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:64` | oklch(1 0 0 / 10%) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:65` | oklch(0.552 0.016 285.938) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:67` | oklch(0.871 0.006 286.286) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:68` | oklch(0.552 0.016 285.938) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:69` | oklch(0.442 0.017 285.786) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:70` | oklch(0.37 0.013 285.805) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:71` | oklch(0.274 0.006 286.033) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:76` | oklch(1 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:77` | oklch(0.141 0.005 285.823) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:78` | oklch(1 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:79` | oklch(0.141 0.005 285.823) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:80` | oklch(1 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:81` | oklch(0.141 0.005 285.823) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:82` | oklch(0.491 0.27 292.581) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:83` | oklch(0.969 0.016 293.756) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:84` | oklch(0.967 0.001 286.375) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:85` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:86` | oklch(0.967 0.001 286.375) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:87` | oklch(0.552 0.016 285.938) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:88` | oklch(0.967 0.001 286.375) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:89` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:90` | oklch(0.577 0.245 27.325) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:91` | oklch(0.92 0.004 286.32) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:92` | oklch(0.92 0.004 286.32) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:93` | oklch(0.705 0.015 286.067) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:94` | oklch(0.811 0.111 293.571) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:95` | oklch(0.606 0.25 292.717) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:96` | oklch(0.541 0.281 293.009) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:97` | oklch(0.491 0.27 292.581) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:98` | oklch(0.432 0.232 292.759) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:99` | oklch(0.985 0 0) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:100` | oklch(0.141 0.005 285.823) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:101` | oklch(0.541 0.281 293.009) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:102` | oklch(0.969 0.016 293.756) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:103` | oklch(0.967 0.001 286.375) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:104` | oklch(0.21 0.006 285.885) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:105` | oklch(0.92 0.004 286.32) |
| E canonical token declaration (expected) | review in context | `packages/react/src/theme/shadcn-theme-presets.css:106` | oklch(0.705 0.015 286.067) |
| B first-party | review in context | `packages/source-registry/registry/items/demo-frontend-tool-dialog/files/plugins/frontend-tool-dialog-demo/styles.css:2` | rgb(0 0 0 / 40%) |
| B first-party | review in context | `packages/source-registry/registry/items/demo-frontend-tool-dialog/files/plugins/frontend-tool-dialog-demo/styles.css:3` | rgb(0 0 0 / 25%) |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/application/application.css:11` | #f5f7fa |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/application/application.css:26` | rgb(240 68 56 / 34%) |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/application/application.css:28` | #b42318 |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/application/application.css:29` | #fff6f5 |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/plugin-runtime.css:92` | rgb(240 68 56 / 34%) |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/plugin-runtime.css:94` | #b42318 |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/plugin-runtime.css:97` | #fff6f5; #fef3f2 |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/plugin-runtime.css:120` | rgb(0 0 0 / 28%) |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/plugin-runtime.css:131` | #fff |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/plugin-runtime.css:132` | #d92d20 |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/plugin-runtime.css:143` | #912018 |
| B first-party | review in context | `packages/source-registry/registry/items/foundation-core-runtime/files/runtime/plugins/plugin-runtime.css:171` | rgb(255 255 255 / 10%) |
