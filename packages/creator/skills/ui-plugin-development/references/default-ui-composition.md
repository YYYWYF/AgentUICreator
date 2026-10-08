# Default UI composition

1. Start with existing `inspect_ui_capabilities` / full `inspect_ui_project` navigation. `uiContext` supplies all direct dependency declarations, package-manager declaration and script names; `uiStack` is a configured subset, not a recommendation. Read the target's `package.json`, closest page/Plugin and style entry on demand. Do not read environment files, credentials or unrelated configuration, scan the whole repository, or add a parallel UI discovery service.
2. Locate Host-owned wrappers/design-system components first using `glob`/`grep`, then read actual exports/props, imports and direct UI dependencies. Inspect the relevant Provider, CSS variables/tokens, font/spacing/radius conventions, dark-mode and locale consumers. Use source/type declarations within readable project paths; filenames and package declarations do not prove usable APIs. Inspect installed `/agent-ui/components`, `/agent-ui/primitives`, Source Item descriptions and the nearest target Plugin that imports the needed public `@agent-ui/react` control. Use `inspect_agent_ui_sources` for missing formal resources; install with returned `itemId` and `stateHash` when appropriate. Creator filesystem tools cannot read `node_modules`; do not search it or its symlinks. Confirm uncertain public imports with the target's typecheck.
3. AI chooses from actual use on the target page and nearest Plugins: prefer Host-owned wrappers/design system, then the established component library, then reusable project primitives. These are judgment priorities, not package-name matching or import-count rules. A declared antd dependency does not outrank actively used `components/ui` or a custom Design System. With multiple libraries, choose the relevant page's convention and explain the source evidence. In this workspace, the public `@agent-ui/react` boundary currently exports `Button`, `Input`, `Badge`, `Skeleton`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`, and the Agent UI Tooltip/Popover/Dialog facades. Recheck the target's installed version and an existing target consumer before importing. A Checkbox export is not established by this list.
4. Reuse the target's theme tokens, typography, spacing, focus states and overlay boundary. When the installed project exposes a public Button, use it for action controls instead of restyling raw `<button>` elements. Native semantic elements are fine for structure and accessibility; when a control has no public default component, style it to the project's existing control conventions and document that basis.
5. Derive the Plugin's `authoring.intents`, `defaultPlacement` and axis-specific `recommendedSize` from the actual target Slot and Agent container. Renderer, application and headless Plugin placement follows their own contracts. For a new side panel, inspect the current Layout tracks, gap, existing panel minimums and container constraints before adding another. Two fixed 280px side rails leave no chat width in a 560px Agent container; shrinking both to 25% would make each rail only 140px wide and may make their controls unusable. Preserve the user's explicit sizes and existing tracks. A Row with a reserved responsive drawer must place the new business panel at its `drawerIndex` after the primary conversation region; inserting it before the conversation turns the chat into the drawer. Reuse the public Layout collapse and restore controls rather than implementing Plugin-local collapse that leaves the Grid track occupied. Do not add a Platform sidebar to an Embedded or narrow project that lacks that structure. Use a responsive container already owned by the template when its controls and Composer remain usable; otherwise ask for a layout decision. Validate the whole Agent container at normal and narrow sizes when browser access is available. Static validation alone cannot establish this geometry.
6. Confirm current-revision static validation after source and composition writes, using `validate_creator_changes(includeBuild=true)` for new visual Plugins or UI dependency/style integration. Check real import paths and exported props with typecheck, then the target build; a missing build script/tool is a named blocker, never PASS. Review dependency changes against explicit approval, scoped CSS, Provider reachability (including portals/Shadow DOM), theme and locale conventions, and React/bridge boundaries. No vendor changes are permitted. Visual consistency with the target page and light/dark/narrow rendering require separate browser evidence; honor a user request to skip acceptance and report it as unverified. Only `static_and_runtime` permits Creator Runtime verification; independent browser interaction remains separate acceptance evidence.


## No suitable UI system

For new `panel` / `semantic-slot` plans, bind `componentBasisRefs` to inspected
Host pages/components/UI entry points, plus relevant Provider, theme and dependency
files. Package metadata or styles alone cannot establish UI investigation. The
Host fixes content hashes and rejects stale evidence at authorization resume and
before writing; refresh the plan when source changes. File existence does not
prove the selection is correct. Explain the selected system, actual imports,
Provider/theme and rejected alternatives in `uiScope`, and name reused controls
in `deliveryContract.reusedComponents`. A negative investigation is valid with
real page and dependency evidence and a reasoned existing-stack or approved Antd
choice; it does not waive evidence. Public `@agent-ui/react` controls are available
foundations, but familiarity is no reason to replace the Host's Design System.

Only after targeted source evidence establishes that no suitable reusable UI exists, recommend Ant Design 5 for a compatible React target. Present the exact additional dependencies/ranges (normally `antd@^5`, add others only when required), package manager from project/workspace facts, and necessary Provider/style changes. Obtain explicit dependency approval with `ask_user_question`; a Plugin development grant alone is insufficient. Reuse a Host installer that supports those exact approved packages. Do not repurpose `apply_agent_ui_source_item` as an arbitrary package installer, invent a tool, edit package.json to simulate installation, or silently upgrade existing dependencies. If the Host has no supported installer, state the blocker and the exact command for the user to run; continue only after observing successful installation and integration. If declined, implement with the existing stack and scoped styles/tokens without new dependencies.

Vue/HTML/Web Component consumers retain the existing compatibility bridge. A Vue component cannot be imported into the canonical React Plugin; use compatible existing producer components and bridge theme mechanisms. React Antd is not a universal consumer fallback, and dependencies belong to the actual producer/target that uses them. Inspect available boundary/theme seams; report unavailable seams instead of adding a UI Adapter or changing Runtime protocol.

Project-owned custom Plugins may import Host business components. Official Plugins preserve existing independent package/source ownership and upgrade contracts; do not bind them to a Host-specific path. Reuse Button/Input/Select/Dialog/Card where available, retain native semantic markup for structure, and avoid a second Design System, hard-coded colors or global CSS. Record selected component/API and theme paths, additions/approval and verification method in the existing development plan/delivery contract; do not create another decision schema.

## Thinking and tool execution presentation

Use Source Registry `plugin/assistant-ui-tool-timeline` in the optional message-level
`conversation-surface.toolTimeline` renderer Slot (not `toolGroup`). It summarizes
ordinary tools once per message and reuses the installed ToolFallback for original
details. Keep `toolGroup`, `toolFallback`, TaskGroup and dedicated tool UIs installed.
Approval, waiting input and failures stay visible outside collapsed summaries.

Use `plugin/assistant-ui-thinking-indicator` in
`conversation-surface.thinkingIndicator`. For “只显示正在思考，不展示具体内容” /
“only show thinking”, enable ThinkingIndicator and disable the Reasoning **display
instance**. Never remove reasoning data from the Runtime. For detailed reasoning,
enable `assistant-ui-reasoning`. For an initial placeholder followed by detailed
reasoning, enable both. Answer text, approval and active tool timeline take priority
over the placeholder. Keep optional renderer placement and Add/Restore deterministic;
validate after removing or disabling any one of these independent plugins.

New Assistant/Platform presets enable both renderers alongside Reasoning. Embedded
and existing projects require an explicit composition change; never auto-migrate them.
