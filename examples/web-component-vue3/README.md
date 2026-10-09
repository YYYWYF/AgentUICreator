# Vue 3 compatibility demo

Run `pnpm --filter @agent-ui/web-component-vue3-demo dev` from the workspace.
The predev step builds the independent Web Component bundle. This Vue/Vite
application does not depend directly on React or use the React Vite plugin.
`AgentUIWrapper.vue` creates the element, assigns configuration, forwards three
CustomEvents, and removes its listeners/element on unmount. Replace the mock API
and mock attachment adapter with your Host APIs for deployment.

The mock default exercises reasoning and a tool response; the official embedded
preset also supplies Markdown, attachments, slash commands and quote context.
Locale/theme controls and deliberately hostile Host styles exercise both isolation
directions. Run `pnpm test:web-component` for the Chromium/Vue acceptance suite,
which also checks Slash, Quote, attachments, tools, history identity, errors and
unmount/remount. Compilation and browser acceptance are recorded separately.
