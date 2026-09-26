# Third-Party Notices

## assistant-ui

Project: https://github.com/assistant-ui/assistant-ui

License: MIT

Pinned revision: `b712ee83bde9a89fce2812968f951a5742d757b9`

The presentation source in this directory is the official assistant-ui Base UI
conversation registry output associated with the pinned revision. It preserves
the upstream Tailwind classes, CVA usage, Base UI primitives, Lucide icons, and
component anatomy, including the AgentPlan, AgentStatus, SubagentList,
TaskCard, TaskGroup, and TaskTray elements.

AgentUICreator-owned changes in the upstream-owned Elements are limited to the
mechanical module-resolution adaptations recorded in `UPSTREAM.json`. There are
no local presentation patches in the upstream-owned Elements.

The Conversation Toolkit provider facade uses the pinned assistant-ui public
`AuiProvider`, `AuiConfig`, `Tools` and renderer registration APIs to compose
optional render-only integrations. No A2UI parser or renderer is copied.
