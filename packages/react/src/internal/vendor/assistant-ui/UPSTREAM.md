# Vendored assistant-ui source

Repository: https://github.com/assistant-ui/assistant-ui.git
Branch: `main`
Commit: `039c3c32822632f2a564164f089f538926886124`
Previous commit: `c2917dba8783b3e250ab484102627901e611c56a`
License: MIT
Source form: official Base UI registry output plus declared mechanical import adaptations

## Runtime package versions

- `@assistant-ui/react` = `0.15.21`
- `@assistant-ui/react-ag-ui` = `0.0.60`
- `@assistant-ui/react-markdown` = `0.14.16`
- `@ag-ui/client` = `0.0.59`

## Ownership

The files below are copied from the frozen revision above. Vendor sync may adapt only upstream import aliases and the registry's base-ui relative paths. Product presentation and policy stay in the Agent UI facade and Plugin layers.

- 41 tracked vendor files
- 22 tracked official Element files
- 148 official Element files discovered upstream
- 126 upstream Element files not adopted into the tracked set
- AG-UI remains at `0.0.59` because it follows the react-ag-ui compatibility matrix

## Upgrade command

`pnpm assistant-ui:update` resolves versions from npm, freezes the official remote main SHA, syncs the vendor, and writes the impact report.
