# Legacy HTML compatibility demo

Run `pnpm --filter @agent-ui/web-component-legacy-demo dev` from the workspace.
The page loads the standalone `agent-ui.js` classic script. There is no Vue or
React compiler in this Host. `config` is deliberately set before registration;
the optional demo-only module adds the existing mock attachment adapter.
The dev server supplies the existing AG-UI mock and `/api` conversation mock.
Production builds copy the standalone script into `dist`; deploy those static
files with your own API. The mock server is development-only.

No browser/visual acceptance has been run. Host styles are deliberately hostile
so Shadow DOM and Portal behavior can be checked later.
