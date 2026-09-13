# assistant-ui upstream provenance

Repository: https://github.com/assistant-ui/assistant-ui

Branch: `main`

Commit: `bd7e8fa9f79ffea10fab0741026d53cdba4cfa70`

Synced at: `2026-09-13`

The vendored presentation files are based on the assistant-ui Base UI registry
output at the commit above. This update adds the official AgentPlan,
AgentStatus, and SubagentList elements plus their shared range utility, and the
official Sidebar, Sheet, Separator, and mobile hook foundation; their import
paths remain mechanically adapted for this project's vendor root.

Runtime packages:

- `@assistant-ui/react` = `0.15.19`
- `@assistant-ui/react-ag-ui` = `0.0.59`
- `@assistant-ui/react-markdown` = `0.14.15`
- `@ag-ui/client` = `0.0.59`

The selected upstream-owned Element set is declared in `upstream-elements.json`.
All declared elements, including `thread.aui.tsx`, are pinned to the local
assistant-ui revision above and may only receive mechanical import adaptations.

`assistant-ui-upstream.lock.json` records the SHA-256 of each installed,
import-adapted upstream-owned Element. Run the project
`check:assistant-ui-upstream` command before changing this boundary.

AgentUICreator local patches are limited to thin adapter seams:

- semantic Slot wrappers;
- explicit presentation configuration seam;
- requires-action native fallback protection;
- additive Agent Message composition seam;
- ThreadBinding compatibility;
- import path adaptation.

There is no custom visual redesign, spacing, color, or card layout in the
vendored files declared `owned`.
