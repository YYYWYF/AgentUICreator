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

## shadcn/ui theme snapshots and NativeSelect

Project: https://github.com/shadcn-ui/ui

The semantic theme palettes are checked-in official shadcn snapshots. The
NativeSelect primitive is copied via the pinned assistant-ui source with one
mechanical utils import adaptation. Provenance is in `src/theme/UPSTREAM.md`.

MIT License

Copyright (c) 2023 shadcn

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
