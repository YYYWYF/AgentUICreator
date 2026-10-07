# Clean Vue/Vite integration fixture

This is an independent Vue 3/Vite consumer. The committed initial fixture has no
React, React Vite plugin, assistant-ui Vue package, Web Component package,
compiled Bridge or wrapper. Run integration checks on a temporary copy.

The development Host resolves its official compiled Web Component distribution,
plans `/agent-ui.js` without writing, and copies it to `public/agent-ui.js` during
approved apply. Consumer dependencies and the original entry stay unchanged.

Live guide/apply/manual-check scenarios are in
`packages/creator-python/tests/live/test_vue_integration.py`.
