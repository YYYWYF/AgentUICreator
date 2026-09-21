# Vendored assistant-ui source

Repository: https://github.com/assistant-ui/assistant-ui.git
Branch: `main`
Commit: `039c3c32822632f2a564164f089f538926886124`
Previous commit: `039c3c32822632f2a564164f089f538926886124`
License: MIT
Source form: official Base UI registry output plus declared mechanical import adaptations

## Runtime package versions

- `@assistant-ui/react` = `0.15.21`
- `@assistant-ui/react-ag-ui` = `0.0.60`
- `@assistant-ui/react-markdown` = `0.14.16`
- `@ag-ui/client` = `0.0.59`

## Ownership

The files below are copied from the frozen revision above. Vendor sync may adapt only upstream import aliases and the registry's base-ui relative paths. Product presentation and policy stay in the Agent UI facade and Plugin layers.

- 42 tracked vendor files
- 23 tracked official Element files
- 148 official Element files discovered upstream
- 125 upstream Element files not adopted into the tracked set
- AG-UI remains at `0.0.59` because it follows the react-ag-ui compatibility matrix

## Upgrade command

`pnpm assistant-ui:update` resolves versions from npm, freezes the official remote main SHA, syncs the vendor, and writes the impact report.
