# Golden examples


Each example shows the reasoning contract; ids and refs must come from current
inspection, never from these examples.

### 1. Remove left conversation history

```text
User request: Remove the left conversation history.
Current composition: row(left panel -> thread-list, main panel -> surface).
Desired state: conversation surface only; ConversationService remains.
Owning layer: Composition.
Semantic delta: remove thread-list instance and collapse its dedicated left
Layout region.
Correct tool: one mutate_app_ui_model transaction with
`remove_plugin(reflow="collapse-empty-region")`.
Incorrect: edit thread-list source, edit conversation-surface source, remove
ConversationService, or submit layout removal first as a probing mutation.
```

### 2. Hide left conversation history

```text
User request: Hide the history for now.
Current composition: enabled thread-list in the left region.
Desired state: same composition and Layout, instance disabled.
Owning layer: Composition.
Semantic delta: enabled true -> false.
Correct tool: set_plugin_enabled(false).
Incorrect: remove the instance, delete the left Layout, or edit CSS/source.
```

### 3. Remove Suggestions

```text
User request: Remove suggested questions.
Current composition: conversation-surface.emptySuggestions contains a
conversation-suggestions instance.
Desired state: the child Slot remains declared but has no Suggestions occupant.
Owning layer: Composition.
Semantic delta: remove the Suggestions child Plugin instance.
Correct tool: remove_plugin.
Incorrect: delete emptySuggestions from the parent manifest or edit the parent.
```

### 4. Move an existing Plugin

```text
User request: Move the existing inspector to the right region.
Current composition: one inspector instance in another Slot; destination known.
Desired state: same persistent instance in the destination.
Owning layer: Composition.
Semantic delta: placement only.
Correct tool: move_plugin.
Incorrect: remove plus insert, create a new Plugin, or copy Plugin source.
```

### 5. Resize the left panel

```text
User request: Make the left panel 320px wide.
Current composition: left Panel identified by current nodeRef.
Desired state: same subtree with width 320.
Owning layer: Composition.
Semantic delta: one Layout property update.
Correct tool: update_layout_node_props using the current snapshot ref.
Incorrect: edit Plugin CSS or persist a runtime Layout id.
```

### 6. Add an existing Theme Switch

```text
User request: Add a theme switch.
Current composition: Theme Switch asset exists but is not selected.
Desired state: one enabled instance in the requested or uniquely resolved Slot.
Owning layer: Composition.
Semantic delta: insert the existing asset with final identity and placement.
Correct tools: inspect_ui_project(view=composition), then insert_plugin in one
mutation.
Incorrect: create a duplicate Theme Switch Plugin or add Runtime theme state.
```

### 7. Remove UI entry versus capability

```text
User request A: Remove the history entry from the UI.
Desired state A: visual instance and now-unused Layout region are absent.
Owning layer A: Composition.

User request B: Completely remove history capability.
Desired state B: capability, providers, and consumers may all change.
Owning layers B: Runtime Capability plus any explicitly required Composition or
Plugin Behavior changes, after inspecting consumers.

Incorrect: interpret request A as authorization to delete a Service or source.
```

### 8. Add conversation management

```text
User request: Add conversation management.
Current composition: conversation-surface is mounted;
conversation-thread-list is an unselected capability whose authoring intents
cover conversation management/history/selection, whose visual role is
conversation navigation, whose typical placement is before conversation-surface,
and whose required Services are resolved. No product default width is declared
by this capability. Desired state: an enabled conversation-thread-list in a
valid sized region before the existing conversation surface; existing
ConversationService remains.
Owning layer: Composition.
Semantic delta: insert the recommended left Layout region and the existing
capability in one atomic mutation.
Correct tools for an eligible authoring-default insertion:
inspect_ui_project(view=composition), then one `mutate_app_ui_model` call with
`insert_plugin_default`; the Host owns deterministic Layout lowering and
post-commit verification. Load this Skill and `ui-layout` only when the
semantic operation is unavailable or the request specifies custom placement.
Incorrect: read the manifest, inspect Services, read Plugin source/CSS, or scan
the project to preflight checks listed in hostGuarantees.
```

### 9. Remove or restore a Renderer presentation

```text
User request: I don't want to show the reasoning process.
Current composition: conversation-surface.reasoningGroup contains the selected
assistant-ui-reasoning Renderer Plugin.
Desired state: reasoning presentation absent while conversation text remains.
Owning layer: Composition.
Semantic delta: remove the reasoningGroup occupant.
Correct tool: remove_plugin(assistant-ui-reasoning-main).
Result: reasoningGroup is empty and renders nothing; the Host does not reveal a
hidden canonical fallback or modify the assistant-ui Thread.
Incorrect: edit ConversationAdapter, edit assistant-ui Thread/grouping, create
a hidden Renderer Plugin, or modify reasoning Runtime state.

User request: Restore the reasoning process.
Semantic delta: insert the existing assistant-ui-reasoning capability into
conversation-surface.reasoningGroup.
Correct tool: insert the existing Plugin instance through Composition.
```
