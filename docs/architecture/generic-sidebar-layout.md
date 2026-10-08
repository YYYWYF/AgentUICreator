# Generic Sidebar Layout

Implemented 2026-10-08. Browser, visual, live-model and product acceptance were explicitly excluded by the requested delivery scope.

## Contract and ownership

`sidebar` wraps ordered `items: [{ id, child: Slot }]` and a normal Layout `content` tree. Each item has exactly one visual plugin; item IDs are unique and `defaultActive` is either null or an existing item ID. Disabled instances retain their authoring entry but disappear from runtime navigation. The compiler produces deterministic node/Slot IDs and keeps plugin mounts in `pluginInstances`, never in Runtime Slot nodes.

Navigation metadata belongs to `UIPluginManifest.sidebar`: a finite, validated Lucide icon name and optional `en-US`/`zh-CN` labels with manifest-name fallback. Icons are static imports; no dynamic code loading. Sidebar is neither a Plugin type nor an Agent Runtime.

`runtime-react` calls the Host's `renderSidebar(node, renderNode)` adapter. Source Registry `UIPluginRuntime` resolves item mounts and manifest metadata, renders the active Slot through the existing outlet, and delegates main content to the same LayoutRenderer. The frame owns only local active-item state; changing it never edits AppUIModel. Removed/disabled items clear selection, reordering preserves selection by item ID, and inactive content unmounts.

## Reused assistant-ui components

Reference revision: `3542d602272a62eddeb8989befc910841c267022`, inspected in the local assistant-ui repository. `threadlist-sidebar.aui.tsx` supplies composition guidance; `clone-thread-shell.tsx` supplies collapse/drawer guidance. Neither conversation-specific shell is copied wholesale.

The frame composes the existing generated product adapters for `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarInset`, `Sheet`, `SheetContent`, `SheetTitle` and Tooltip. Sheet retains Base UI focus trapping, Escape and focus restoration; its close action uses the existing upstream Button. History continues using `ConversationThreadListRoot`, `ConversationThreadListNew`, search and item composition; create/search/group/select/delete/loading/retry business logic stays in the history Plugin.

## Product adapter differences

- Frame uses controlled `Sidebar collapsible="icon"`: 48px collapsed and 280px total expanded, including its 48px navigation rail. `activeItemId` determines provider open state; the upstream gap/container own the total width. Product utility-layer CSS scopes absolute positioning and desktop visibility to this frame, including nested and narrow Hosts. Other Sidebar consumers and vendor/adapters are unchanged.
- ResizeObserver measures the frame; below 648px the panel uses a contained Sheet. The provider stays in its desktop branch to retain the rail; narrow containers use the existing contained Sheet for plugin content with the same active-item state, without viewport listeners.
- Product provider does not write Cookie state or install global shortcuts.
- Sheet accepts a nested container only within its owning AgentUIRoot. Contained backdrop/popup use absolute positioning and available-container width. `modal="trap-focus"` preserves focus handling without page-wide scroll locking.
- Thread items expose `onNavigate`; the Plugin calls the generic Sidebar navigation context after selection/new-thread interaction. No DOM selector determines navigation.
- Product CSS is layered and AgentUIRoot-scoped, uses theme variables and respects reduced motion.

Every upstream edit is a regenerable, guarded seam in `sync-product-adapters.mjs`, with adapter provenance regenerated. Vendor files are unchanged. A changed upstream seam fails generation until reviewed.

## Creator and templates

Inspector exposes Sidebar children/refs and manifest navigation metadata. Deterministic operations include `insert_sidebar_item` (new plugin or existing instance), `remove_sidebar_item`, `reorder_sidebar_items`, and `update_layout_node_props.defaultActive`. Ordinary `move_plugin` moves instances back into existing Slots; an emptied Sidebar entry is pruned at batch end. Operations retain transaction/hash admission and final composition validation. Creator Skills document exact arguments and icon vocabulary. Python resource scope and layout diagnostics include both Sidebar branches.

New platform/assistant presets default to a collapsed Sidebar. Platform content retains optional trailing drawer at indices 0/1. Assistant's 26rem container uses drawer mode. Embedded remains lightweight. Existing user AppUIModel files are not migrated or overwritten. Workspace operations project the content Row using refs from the complete tree.

## Validation and limitations

Passed:

- Contract/compiler/composition/operations/topology: 112 tests.
- Bootstrap presets: 35 tests, including all three preset compilations.
- Source Registry: 29 tests.
- Sidebar/Portal/adapter generation: 10 focused tests.
- Python Sidebar schema, diagnostic traversal and resource scope: 3 tests.
- Runtime React, React, Project Control and Bootstrap typechecks; Sidebar E2E TypeScript check.
- i18n parity, Project Control contract inventory, upstream purity and 33 assistant-ui upgrade-contract tests.

Requested broad commands were attempted: `pnpm typecheck`, `pnpm test:ts`, and `pnpm verify:ui` hit the temporary published-consumer dependency-install network timeout before completing. A separate recursive local typecheck also encountered existing customized Host foundations that predate the new Runtime union and a Web Component shell missing `@agent-ui/plugins`. Their layouts and customized files were preserved.

Expanded package results: React 654 passed / 7 failed; Runtime React 164 passed / 2 failed; Project Control 390 passed / 182 failed (plus two errors). HEAD-only source archive runs reproduced the same seven React failures, two Runtime failures and five representative Project Control package-requirement failures. Python expanded checks yielded 54 passed / 4 failed; all four failures reproduced on HEAD. These results do not establish an all-green full regression suite.

Added browser coverage lives in `apps/creator-workbench/tests/sidebar.spec.ts`, with `playwright.sidebar.config.ts`. It covers desktop collapse/expansion/switching and narrow-container Sheet focus/Escape/navigation. Per request it was not executed; no screenshots or visual acceptance were produced. Real Host/Web Component responsive and theme acceptance remains unverified.

Existing generated foundation sources must be upgraded together when adopting the expanded Runtime Layout type; exhaustive consumers of the previous union require source regeneration. The fixed icon vocabulary may be extended explicitly with corresponding manifest validation. No KeepAlive is introduced. Optional `UIPluginDefinition.RailAction` uses the existing Slot declaration, admission, service and instance contexts; history supplies the public `ConversationThreadListNew`. Its rail shortcut hides while its own panel is open. The React frame extension requires `@agent-ui/react >=0.1.3`; regenerate foundation/core and the history source together. This version is prepared in source, not published by this change.

Official Sidebar alignment implementation and static/unit check results: [2026-10-08 report](../sidebar/official-alignment-2026-10-08/REPORT.md). Browser and visual acceptance remain excluded by the user request.

## Optional identity Header (2026-10-08 follow-up)

`sidebar.header?: Slot` adds an ordinary Layout Slot, with zero or one visual
Plugin. Header mounts have deterministic `layout-node:root.header` and
`layout-slot:root.header` IDs at the root; nested paths follow existing encoding.
The Header is traversed by compiler, composition, Inspector and diagnostics. It
uses the same Slot outlet, lifecycle, service admission and error boundary. It
requires no manifest navigation metadata and never enters the items array.

Creator uses ordinary Slot operations to install, replace, disable, remove or
restore Header plugins. Removing its last Plugin leaves the optional empty Slot,
so it remains an inspectable target for restoration. Local refs work inside
`replace_layout_node` batches. The Header cannot be replaced with a container.

New platform defaults include `agent-identity` and history, with history selected
by default. Assistant includes the same plugins but remains initially collapsed
and uses the existing contained Sheet. Embedded does not gain a Sidebar. Existing
user projects are not rewritten. With Header and one enabled navigation plugin,
the frame renders a single column and hides the history navigation icon and
repeated title. Multiple enabled items keep icon switching under the Header.
Without Header, the legacy path is unchanged. Width variables stay 280px/48px.

Identity composes the public product facades for upstream-derived SidebarHeader,
SidebarMenu, SidebarMenuItem and SidebarMenuButton. Its config.ts owns branding;
its default bilingual names come from the generated agentIdentity namespace.
The Logo is not a toggle. SidebarFrame owns the official SidebarTrigger. The
public facades share the same Sidebar context as the frame. No vendor or adapter
recipe changes, service, conversation runtime or backend logic were introduced.

Adoption requires React >=0.1.4 and Runtime React >=0.1.2, with regenerated
foundation contracts/runtime and plugin sources. These source package versions
are prepared but have not been published to npm. See
[implementation report](../sidebar/identity-header-2026-10-08/REPORT.md).
