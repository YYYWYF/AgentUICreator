---
name: ui-plugin-development
description: Inspect or customize UI Plugins; implement a new Plugin or new behavior only after a direct user commission, satisfied conditional commission, or approval of a bound development proposal.
---

# UI Plugin Development

For the exact reuse and development authorization decision, read [development-decision-contract.md](references/development-decision-contract.md) when the project inventory leaves a material gap.
Reading this Skill never grants development permission. Before first new Plugin
source or new business behavior, `prepare_ui_plugin_development` must return a
Host-authorized plan bound to this user task. Legitimate entry sources are a
direct development commission, a conditional commission after complete discovery
proves the gap, or approval of the exact pending proposal. Ordinary clarification
and a prior task's grant cannot authorize development. A normal existing Plugin
customization does not need a new development approval.

Inspect project conventions before deciding that Plugin source must change:

Resolve `sourceRoot` from Host inspection. Paths below are project-relative;
filesystem tools need a leading `/` (for example, `/src/agent-ui/plugins/x/index.tsx`
when `sourceRoot` is `src/agent-ui`). Never pass `<sourceRoot>` literally.

- `<sourceRoot>/plugins/*/manifest.json` declares identity, purpose, capabilities, and data needs.
- `<sourceRoot>/plugins/*/definition.ts` joins a validated manifest to a React component.
- `<sourceRoot>/plugins/*/index.tsx` implements the component or adapts an existing project component.
- `<sourceRoot>/plugins/*/styles.css` owns Plugin-specific presentation when that stack uses CSS.
- If creating `styles.css`, import it from Plugin source (usually `index.tsx`); an unimported stylesheet is absent from the Host even when TypeScript and CSS syntax checks pass.
- Scope every Plugin CSS selector under a stable Plugin-owned class or `data-ui-plugin` root. Never use bare element selectors, `html`, `body`, `:root`, `*`, global resets, CSS imports, or Host DOM ancestors. Inherit theme tokens from AgentUIRoot.
- Use the `@agent-ui/react` Agent UI Tooltip, Popover, and Dialog facades for overlays; do not import Base UI Portal primitives or create body-level Portals.
- `<sourceRoot>/plugins/registry.generated.ts` is the generated capability catalog: manifest metadata plus lazy definition loaders for available Plugins. AppUIModel selection resolves the published Active Registry at runtime; never edit this file or `<sourceRoot>/plugins/index.ts` by hand.
- `<sourceRoot>/framework/contracts/ui-plugin.ts` is the Plugin Contract.
- `<sourceRoot>/agent-contract/agent-events.ts` is the application-owned registry for backend Application Event names and payload schemas.
- `<sourceRoot>/agent-contract/agent-tools.ts` is the application-owned allowlist for capability operations exposed to the Agent.
- `<sourceRoot>/services/*` contains stable project-owned Service seams when multiple Plugins share one capability. Treat these seams as read-only unless the host explicitly authorizes capability-contract work.

## Reuse decision

1. List and inspect existing Plugins.
2. If a Plugin already supplies the requested behavior, reuse its `manifest.id` in an AppUIPluginNode and change only AppUIModel as needed. Stop source discovery when no source change is required.
3. If no installed Plugin matches, inspect relevant installable Source Items. Installation through `apply_agent_ui_source_item` is reuse, not new development. A failed install or incomplete inventory is not permission to handwrite a substitute.
4. Otherwise, locate and inspect matching UI components elsewhere in project source, especially when the user says the UI already exists. An absent Plugin does not mean the UI is absent.
5. If a reusable component exists and the user commissioned adaptation, adopt it through the smallest Plugin adapter. If a normal request has a material gap, prepare the development decision before authoring.
6. If no reusable implementation exists, create a Plugin only after direct, satisfied conditional, or approved proposal authorization.
7. For an ordinary Plugin without an eligible authoring default, insert its node into a Layout Slot or parent plugin's local Slot through AppUIModel. For a new relative default placement, use `insert_plugin_default` after preflight. For an existing nested extension point, inspect its exact contract and occupy it without adding a Layout node.
8. When the user requires login, License, organization selection, onboarding, or initialization before the Workspace can be used, prefer a first-class `manifest.application.gate` Plugin in `applicationPlugins`; it is an Application lifecycle surface, not visual Slot composition.

After `create_ui_plugin`, run static validation to synchronize the generated
Plugin registry. Then call `inspect_ui_project(view="composition")` again before
`mutate_app_ui_model`: the earlier observation is stale even if the AppUIModel
file itself did not change. Compose the new Plugin and validate that final
revision. A static check before composition does not prove that the Plugin is
mounted. Keep this sequence within the existing model-call budget by batching
independent reads and using short exact anchors for locale `edit_file` calls.

If the user asks Creator to hide or restore a whole panel while keeping its
source, change AppUIModel composition so the Layout track reflows. Hiding a
Plugin's inner content with local React state leaves its Panel track occupied;
do not describe that as freeing chat space. A Plugin-local disclosure control
is appropriate only when retaining its allocated panel width is intended.

Before implementation, inspect `references/default-ui-composition.md` for the
project's public component and style discovery path. Use actual exported APIs,
not guessed Button, Checkbox, Dialog, or overlay names. If the user did not
specify a component, use the project's mature default controls and tokens; do
not make an unstyled native form or placeholder panel the product result.
Once one closest Plugin, the used public control, and the relevant locale/theme
conventions are known, stop exploratory reads and implement. Inspect another
component or contract section only for a concrete API or ownership question;
do not search unrelated Conversation Tool UIs or Thread views to compare styles.
For a requested list with named items, make each named value one item. Do not
turn those values into group headings and invent extra tasks unless the user
explicitly requested groups or subtasks.
Do not inspect `node_modules` with Creator filesystem tools. Use a target Plugin
already importing the public control, then check new imports with typecheck.
New Plugin presentation text, including titles, controls, empty states, aria
labels, and static item labels, must use the Agent UI locale layer. Add typed
keys and both locale dictionaries with `edit_file` before creating the Plugin.
Keep them in the canonical `agent-ui/i18n` directory; Plugin-local locale files
or ambient type declarations do not register a namespace. Never
claim a completed Plugin while its rendered copy is hard-coded in TSX.

For a project-owned Composer replacement, read [composer-adapter.md](references/composer-adapter.md) when adapting the current component to the existing Conversation Runtime. It contains the hook contract, attachment handling, send conditions, and Slot replacement details.

## Existing component adoption

When the user identifies an existing UI, Component, or Widget, or project inspection finds a close match, locate and read its source and direct dependencies before choosing an import path or writing Plugin source. Inspect the closest Plugin convention, then choose the smallest ownership change. Do not reimplement an existing UI merely to satisfy the Plugin directory convention.

- Prefer a thin Plugin adapter that imports and composes the existing project-owned component. Do not copy its JSX, styles, state, or business logic into `<sourceRoot>/plugins/<plugin-id>/index.tsx` just to make that file exist.
- Keep Agent Runtime, Plugin Context, Agent data, service, event, and action adaptation in the Plugin layer. Pass derived data and callbacks into a reusable component through its existing interface where practical. A shared product component must not import Plugin Runtime internals solely for adoption.
- Move implementation into the Plugin only when it is Agent UI-specific with no other consumers, the user requests a self-contained Plugin, project ownership conventions require it, or a thin wrapper would create a reverse cross-layer dependency. The required `index.tsx` file alone is not a reason to migrate source.
- Preserve the component's UI, interaction, state model, and styling. Add only integration required by the request. Do not use Plugin adoption as a reason to refactor, restyle, replace the UI library, rename behavior, or implement backend capabilities. If an existing Install button is mock, keep it mock unless the user asks for installation behavior. Do not invent a Service, AG-UI event, Frontend Tool, or persistence layer for it.
- Use the same manifest authoring, placement, size, and child Slot contracts as any other Plugin. Component reuse is a Creator development choice, not a new Runtime or manifest field.

For this task: inspect the project and component source, inspect the closest Plugin, decide ownership, create the thin adapter, run `validate_creator_changes`, compose through AppUIModel, and validate the final revision. In `static_and_runtime` mode, also call `inspect_runtime_errors` after source changes; in `static_only` mode, do not call Runtime verification tools. Existing UI does not waive current-revision static validation.

For a new Plugin that users should add or restore, decide its authoring manifest and placement from the current project. Read [authoring-contract.md](references/authoring-contract.md) when this task needs those details.

For a capability shared across Plugins or an application-owned Service, resolve its owner and authorization. Read [service-ownership.md](references/service-ownership.md) when this task needs those details.

## Safe source editing

- Read every existing Plugin source file in the current run before editing it with `edit_file`.
- For an existing Plugin, inspect it, identify the exact source files, and read all existing targets in one bounded read-only batch when their paths are already known.
- Use `edit_file` for one small localized existing-file change. Use `mutate_ui_plugin_source` when one resolved change spans multiple Plugin files or combines existing-file edits with new Plugin-local files.
- Every `mutate_ui_plugin_source.changes` entry needs `type: "edit"` with `relativePath` and `edits: [{oldText, newText}]`, or `type: "create"` with `relativePath` and `content`.
- `mutate_ui_plugin_source` is one atomic, Plugin-local `edit`/`create` transaction. Never use it to delete, rename, move, cross into another Plugin, or overwrite a newly appeared file. If it reports a stale path, reread only that path, reconcile it, and resubmit the complete mutation.
- A prior run, project snapshot, `inspect_ui_plugin` result, or remembered source is not a current file observation for generic edit tools.
- If an edit reports `stale-version`, read the file again and reconcile the concurrent content; do not retry the old replacement unchanged.
- A new path is created without overwriting a file that appeared concurrently.
- Source creation and edits are recorded in the Creator transaction receipt for Host-level undo. Never use Git checkout, reset, or stash to overwrite the user's working tree.

When creating a new Plugin, use the current Host authorization, manifest, source and placement sequence. Read [plugin-creation.md](references/plugin-creation.md) for the exact sequence and failure handling.

After source or Composition writes, use the current verification mode and distinguish each delivery stage. Read [completion-loop.md](references/completion-loop.md) for the exact sequence and failure handling.

