# Third-Party Notices

Agent UI primitives marked with `upstream.project = "shadcn/ui"` are adaptations
of component architecture and behavior from the shadcn/ui Base UI implementation.
The adaptations replace Tailwind and host-global assumptions with CSS Modules,
Agent UI semantic tokens, and the AgentUIRoot portal boundary.

## shadcn/ui

Pinned reference revision:
`3ba91b1cc83e1bbe4ab35a422ff2a694849c5048`.

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

## assistant-ui

The Agent Composer adapts component anatomy and interaction behavior from the
assistant-ui React Composer and Elements Composer sources, pinned at revision
`3a45a01c0d6141102638ecd4f32d1af4d01fb510`.

Agent Reasoning adapts the assistant-ui Reasoning, ReasoningRoot, live preview,
and useScrollLock interaction behavior, pinned at revision
`97bd4b39fce83163354c9ec8d9d4fb2c9bd1aac7`.

These adaptations do not include assistant-ui runtime state, packages, hooks,
or contexts.

MIT License

Copyright (c) 2025 AgentbaseAI Inc.

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

## assistant-ui React Hook Form integration

`integration/react-hook-form` adapts application-owned execution to the public
`formTools` contract of `@assistant-ui/react-hook-form` 0.12.34, pinned at
assistant-ui revision `039c3c32822632f2a564164f089f538926886124` (MIT, AgentbaseAI Inc.).
It imports official descriptions from the installed package and does not copy or
call `useAssistantForm`. The assistant-ui MIT notice above applies.

## assistant-ui A2UI integration

`integration/a2ui` adapts the public `JSONGenerativeUI`,
`defaultGenerativeUILibrary`, and `createActionRegistry` contracts from
`@assistant-ui/react-generative-ui` 0.0.19 at assistant-ui revision
`039c3c32822632f2a564164f089f538926886124` (MIT, AgentbaseAI Inc.).
Native AG-UI surface conversion and actions remain in `@assistant-ui/react-ag-ui`
0.0.60; the integration does not copy their parser, reducer or converter.
The default vocabulary is imported from the installed official package, with
Agent UI semantic-token styling. The assistant-ui MIT notice above applies.
