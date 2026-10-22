# Generic Sidebar Layout

Implemented 2026-10-08. Browser, visual, live-model and product acceptance were explicitly excluded by the requested delivery scope.

## Contract and ownership

`sidebar` wraps ordered `items: [{ id, child: Slot }]` and a normal Layout `content` tree. Each item has exactly one visual plugin; item IDs are unique and `defaultActive` is either null or an existing item ID. Disabled instances retain their authoring entry but disappear from runtime navigation. The compiler produces deterministic node/Slot IDs and keeps plugin mounts in `pluginInstances`, never in Runtime Slot nodes.

Navigation metadata belongs to `UIPluginManifest.sidebar`: a finite, validated Lucide icon name and optional `en-US`/`zh-CN` labels with manifest-name fallback. Icons are static imports; no dynamic code loading. Sidebar is neither a Plugin type nor an Agent Runtime.

`renderer` calls the Host's `renderSidebar(node, renderNode)` adapter. Source Registry `UIPluginRuntime` resolves item mounts and manifest metadata, renders the active Slot through the existing outlet, and delegates main content to the same LayoutRenderer. The frame owns only local active-item state; changing it never edits AppUIModel. Removed/disabled items clear selection, reordering preserves selection by item ID, and inactive content unmounts.

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
