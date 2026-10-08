# Official Sidebar: identity Header and single column — 2026-10-08

Delivery is implementation and push on dev. The user's final “做完推送，不要验收” excludes browser E2E execution, screenshots, visual/theme comparison, live Creator model acceptance and independent packed Host acceptance. No browser was opened and no visual acceptance is claimed.

## Implementation

- New `plugin/agent-identity` follows Source Registry → Manifest → Definition → generated Host installation. Its five source files are manifest.json, definition.ts, index.tsx, config.ts and styles.css. It provides no Service, runtime, authentication or backend capability. Optional locale injection uses the existing locale owner.
- `config.ts` is the branding entry: default `name` maps en-US/zh-CN to the agentIdentity locale namespace; replace it with a string for custom product content, set `logo` to an image URL and optionally set `description`. Creator authoring intents and existing layout/plugin skills direct branding edits to this file.
- Identity reuses existing upstream-derived SidebarHeader/Menu/MenuItem/MenuButton through product facades, including Tooltip. Default Bot icon sits in a 32px container. Text truncates and hides when collapsed; the Logo has no toggle action. No Avatar/Button/Tooltip implementation is copied.
- `sidebar.header` is optional and accepts only an ordinary Slot containing at most one visual plugin. Empty Header is valid after plugin removal. Compiler IDs, composition ownership, Inspector refs, diagnostics and operations include Header. Header plugins require no navigation metadata and are never navigation items. Ordinary insert/remove/replace/move/enable operations apply, including transaction-local refs; there is no separate Header installer.
- Header plus one enabled item selects the single-column frame. The 48px history navigation rail/icon and repeated history heading disappear while expanded content fills the 280px Sidebar. SidebarTrigger remains an explicit control; the existing RailAction appears when its content is closed and uses the same Slot and plugin lifecycle. Multiple items retain switching and defaultActive; no-Header models retain legacy rendering.
- History business logic is unchanged: the public Root/New/Search/Item, grouped history, switching, delete Portal, loading, empty and retry handling remain. The new-thread button uses a lighter borderless style. Expanded history has no second rail +.
- Platform defaults install identity and history and select history; Assistant installs both and remains collapsed, with the existing contained Sheet; Embedded remains unchanged. Bootstrap infers install source items from these presets. Existing custom AppUIModel files are not overwritten.
- Package source versions: React 0.1.4 and Runtime React 0.1.2; foundation dependency minima reflect both. History source is 0.0.5, Identity is 0.0.1. npm publication was not requested.

Reference: inspected assistant-ui pinned revision `3542d602272a62eddeb8989befc910841c267022` locally, specifically its ThreadListSidebar Header composition. Vendor and generated adapter recipes are unchanged. Runtime React continues to have no dependency on @agent-ui/react. AG-UI, Conversation Runtime, footer and new configuration frameworks are unchanged.

## Engineering checks

Final logs are in logs/. These are static/unit checks, not product acceptance.

| Check | Result |
| --- | --- |
| Contract/compiler/composition/ordinary operations | 109 passed; final Sidebar rerun 19 passed |
| Identity, SidebarFrame, history policy and locale | 19 passed |
| Bootstrap initialization/presets/modes | 26 passed |
| Source Registry | 29 passed |
| Python Creator schema/diagnostic traversal/resource scope | 11 passed |
| assistant-ui upgrade contract | 33 passed |
| React, Runtime React, Project Control, Bootstrap, Source Registry typechecks | Passed |
| Sidebar E2E source typecheck | Passed; browser execution excluded |
| React and Runtime React builds/public boundaries | Passed |
| i18n parity and upstream purity/provenance | Passed |

Identity tests render the actual generated plugin and exercise both default languages, custom name, image Logo and description. Contract tests cover normal Slot compilation, cardinality, visual plugin admission, local refs, remove/restore, replacement and disable/enable. SidebarFrame tests cover single-column navigation suppression, existing shortcut behavior, multi-item switching, multiple instances and narrow Sheet behavior in jsdom.

## Failure attribution and remaining verification

Expanded Creator Inspector checks: 7 passed / 1 failed. `creator-project-inspector.test.ts:105` expects malformed app-ui JSON to report broken but receives uninitialized. A clean HEAD source archive reproduces the same failure (inspector-baseline.log); this is unrelated to Header rendering or plugin installation and was not repaired. No all-green full repository regression claim is made.

Browser geometry (280px/48px), screenshot comparison, Light/Dark/Violet visual behavior, narrow Assistant browser behavior, live model authoring requests and packed independent Host consumption remain unverified by explicit delivery scope. Static tests cannot establish visual similarity to the user's official screenshot. The workspace's pre-existing theme/Web Component/command-source changes are excluded from this commit.

Full file inventory: [CHANGED_FILES.md](CHANGED_FILES.md). Identity source/config: `packages/source-registry/registry/items/plugin-agent-identity/files/plugins/agent-identity/`.
