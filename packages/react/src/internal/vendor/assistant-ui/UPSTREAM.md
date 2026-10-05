# Vendored assistant-ui source

Repository: https://github.com/assistant-ui/assistant-ui.git
Source policy: fixed published release
Commit: `3542d602272a62eddeb8989befc910841c267022`
Previous commit: `da9a624496ae97864ae30e90f85c7533092a228d`
License: MIT
Source form: official Base UI registry output plus declared mechanical import adaptations

## Runtime package versions

- `@assistant-ui/react` = `0.15.23`
- `@assistant-ui/react-ag-ui` = `0.0.63`
- `@assistant-ui/react-markdown` = `0.14.16`
- `@ag-ui/client` = `0.0.59`

## Ownership

The files below are copied from the frozen revision above. Vendor sync may adapt only upstream import aliases, registry base-ui relative paths, the five recorded Agent UI Portal container bridges, and the recorded Quote selection primitive import bridge. Product presentation and policy stay in the Agent UI facade and Plugin layers.

- 45 tracked vendor files
- 25 tracked official Element files
- 154 official Element files discovered upstream
- 130 upstream Element files not adopted into the tracked set
- AG-UI remains at `0.0.59` because it follows the react-ag-ui compatibility matrix

## Upgrade command

`pnpm assistant-ui:update` resolves versions from npm, freezes the official remote main SHA, syncs the vendor, and writes the impact report.

Quote Elements are adopted from the frozen revision. The internal selection primitive adaptation is tracked separately in `../../quote-selection-UPSTREAM.json`; its algorithm is unchanged and its Portal uses AgentUIRoot.

Composer triggers adopt the official Directive Text Elements. Trigger Popover has one generic children seam for the adapter to register the official selection override. The pure matcher is unchanged upstream source and is synchronized with `composer-trigger-UPSTREAM.json`.
