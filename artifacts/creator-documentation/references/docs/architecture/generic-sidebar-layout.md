# Generic Sidebar Layout

AppUIModel owns navigation layout and semantic composition. Runtime renders the selected model deterministically; the Sidebar container is optional.

## Default template layout

Platform presets now use ordinary Row/Panel/Slot composition for navigation and
conversation regions. AppUIModel owns their order, tracks and responsive drawer
policy. Moving history left or right changes the model through the existing
composition operations; templates must not reverse regions with CSS. The Row
`drawer` policy identifies the primary and navigation children on either side;
its indices follow child identity during structural moves. The legacy
`trailing-drawer` policy and existing Sidebar models remain compatible.

Platform uses a 280px left navigation Panel. Assistant and Embedded use their selected project Shell and header composition. Sidebar remains available for custom layouts. Template synchronization must preserve Plugin identities, enablement, child Slots and application customizations; starting tools or upgrading npm does not overwrite the project model.

## Contract and ownership

`sidebar` wraps ordered `items: [{ id, child: Slot }]` and a normal Layout `content` tree. Each item has exactly one visual plugin; item IDs are unique and `defaultActive` is either null or an existing item ID. Disabled instances retain their authoring entry but disappear from runtime navigation. The compiler produces deterministic node/Slot IDs and keeps plugin mounts in `pluginInstances`, never in Runtime Slot nodes.

Navigation metadata belongs to `UIPluginManifest.sidebar`: a finite, validated Lucide icon name and optional `en-US`/`zh-CN` labels with manifest-name fallback. Icons are static imports; no dynamic code loading. Sidebar is neither a Plugin type nor an Agent Runtime.

`renderer` calls the Host's `renderSidebar(node, renderNode)` adapter. Runtime `/ui` `UIPluginRuntime` resolves item mounts and manifest metadata, renders the active Slot through the existing outlet, and delegates main content to the same LayoutRenderer. The frame owns only local active-item state; changing it never edits AppUIModel. Removed/disabled items clear selection, reordering preserves selection by item ID, and inactive content unmounts.

## Reused assistant-ui components

Use the pinned sources recorded in canonical Plugin/shared provenance and inspect them in the local assistant-ui repository when changing an upstream seam. `threadlist-sidebar.aui.tsx` supplies composition guidance; `clone-thread-shell.tsx` supplies collapse/drawer guidance. Neither conversation-specific shell is copied wholesale.

The frame composes the shared npm product adapters for `SidebarProvider`, `Sidebar`, `SidebarContent`, `SidebarMenu`, `SidebarMenuItem`, `SidebarMenuButton`, `SidebarInset`, `Sheet`, `SheetContent`, `SheetTitle` and Tooltip. Sheet retains Base UI focus trapping, Escape and focus restoration; its close action uses the existing upstream Button. History continues using `ConversationThreadListRoot`, `ConversationThreadListNew`, search and item composition; create/search/group/select/delete/loading/retry business logic stays in the history Plugin.

## Product adapter differences

- Frame uses controlled `Sidebar collapsible="icon"`: 48px collapsed and 280px total expanded, including its 48px navigation rail. `activeItemId` determines provider open state; the upstream gap/container own the total width. Product utility-layer CSS scopes absolute positioning and desktop visibility to this frame, including nested and narrow Hosts. Other Sidebar consumers and vendor/adapters are unchanged.
- ResizeObserver measures the frame; below 648px the panel uses a contained Sheet. The provider stays in its desktop branch to retain the rail; narrow containers use the existing contained Sheet for plugin content with the same active-item state, without viewport listeners.
- Product provider does not write Cookie state or install global shortcuts.
- Sheet accepts a nested container only within its owning AgentUIRoot. Contained backdrop/popup use absolute positioning and available-container width. `modal="trap-focus"` preserves focus handling without page-wide scroll locking.
- Thread items expose `onNavigate`; the Plugin calls the generic Sidebar navigation context after selection/new-thread interaction. No DOM selector determines navigation.
- Product CSS is layered and AgentUIRoot-scoped, uses theme variables and respects reduced motion.

Every upstream edit is a regenerable, guarded seam in `sync-product-adapters.mjs`, with adapter provenance regenerated. Vendor files are unchanged. A changed upstream seam fails generation until reviewed.

## Creator and templates

Inspector exposes Sidebar children/refs and manifest navigation metadata. Deterministic operations include `insert_sidebar_item` (new plugin or existing instance), `remove_sidebar_item`, `reorder_sidebar_items`, and `update_layout_node_props.defaultActive`. Ordinary `move_plugin` moves instances back into existing Slots; an emptied Sidebar entry is pruned at batch end. Operations retain transaction/hash admission and final composition validation. Creator Skills document exact arguments and icon vocabulary. Operator inspection, source scope and layout diagnostics include both Sidebar branches.

Workspace operations use authoring refs from the complete tree. Default presets use Row/Panel or header composition; they do not require Sidebar or impose its local collapsed state. Existing custom AppUIModel files are preserved.

## Optional identity Header

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

A custom Sidebar may place `agent-identity` in its optional Header. With a Header and one enabled navigation item, the frame renders a single column and hides repeated navigation labels; multiple items retain switching. Without a Header, ordinary Sidebar behavior applies. Sidebar frame widths remain 280px expanded and 48px collapsed; default preset Panel width is owned separately by AppUIModel.

Identity uses its public Plugin component and project-owned application props for `name`, `logo` and `description`, with bilingual defaults from the shared `agentIdentity` namespace. The logo is not a toggle. SidebarFrame owns its trigger and shares the existing npm Sidebar context. Product identity content is not stored in AppUIModel or a framework theme configuration file.

Default initialization uses canonical presets and the installed Plugin application templates. Changing a template does not rewrite existing project applications; npm upgrades preserve them. Validate composition, responsive drawer direction, services and focus behavior separately from static checks, including actual Windows coverage when available.
