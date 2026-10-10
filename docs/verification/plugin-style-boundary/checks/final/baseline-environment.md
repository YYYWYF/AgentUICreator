Baseline source snapshot: f66c4129 (git archive of packages/examples/scripts/package manifests).
Snapshot: /tmp/plugin-style-baseline-f66, /private/tmp on macOS.
Same installed dependency tree as current execution: symlinked node_modules and built package dist.
Initial baseline run lacked built official package metadata and the theme test could not load.
The prepared rerun baseline-f66-tests-ready.log reaches both assertions and reproduces:
- assistant-ui-integration-boundary: old literal <AgentUIRoot theme={theme}> assertion.
- assistant-ui-theme-bridge: light expected / violet actual.
These match the current execution's failures. No production test assertions were changed.
