# Vendored assistant-ui source

Repository: https://github.com/assistant-ui/assistant-ui.git
Source policy: fixed published release
Commit: `3542d602272a62eddeb8989befc910841c267022`
Previous commit: `3542d602272a62eddeb8989befc910841c267022`
License: MIT
Source form: official Base UI registry output plus declared mechanical import adaptations

## Runtime package versions

- `@assistant-ui/react` = `0.15.23`
- `@assistant-ui/react-ag-ui` = `0.0.63`
- `@assistant-ui/react-markdown` = `0.14.16`
- `@ag-ui/client` = `0.0.59`

## Ownership

The files below are copied from the frozen revision above. Vendor sync may adapt only deterministic upstream import aliases and registry base-ui relative paths. Product presentation and policy stay in the Agent UI facade and Plugin layers.

- 52 tracked vendor files
- 32 tracked official Element files
- 154 official Element files discovered upstream
- 122 upstream Element files not adopted into the tracked set
- AG-UI remains at `0.0.59` because it follows the react-ag-ui compatibility matrix

Composer trigger range matching is copied unchanged from this revision; hashes are recorded in composer-trigger-UPSTREAM.json.

## Upgrade command

`pnpm assistant-ui:update` resolves versions from npm, freezes the official remote main SHA, syncs the vendor, and writes the impact report.
