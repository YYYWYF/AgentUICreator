# Delivery obligations


Start broad capability discovery with `inspect_ui_capabilities`. It is a live,
paged navigation index over the existing ProjectControl catalog, formal Sources,
and project component paths. Complete every page before treating an inventory
as complete; filenames alone never prove component behavior. Inspect the selected
implementation and use an existing Plugin or formal Source whenever it fits.

Before implementation, provide `deliveryContract` to
`prepare_ui_plugin_development`: `capability`, `renderingCategory`, `placement`,
`lifecycle`, `dependencies`, `reusedComponents`, `verificationMethod`, and
`interactions`. `renderingCategory` is `panel`, `semantic-slot`, or `application`.
`verificationMethod` is `runtime` or `browser-test`. Bind placement to actual
current authoring choices. For requested dimensions/positions, include `geometry`
entries with `instanceId`, `property` (`x`, `y`, `width`, `height`), `expected`, and
`tolerance` in pixels. Do not change the Runtime manifest schema for this plan.

Creation, registration, enabled composition, static validation, Runtime observation,
and behavioral validation are separate facts. The Host completion gate derives
delivery from those facts at the current revision. `static_only` cannot establish
Runtime or interaction success. Missing placement or verification leaves a blocked
receipt naming saved changes and the last successful stage.

For declared interactions, the Host tool `verify_ui_plugin_behavior` runs the
project's installed Playwright configuration. Test titles must exactly match
`[delivery:<pluginId>] <interaction>`; use `runtime` when the browser-test method has
no interaction list. Every required test must pass without skips or flaky retries.
Reuse existing test infrastructure and respect the writable project boundary;
if tests/configuration cannot be supplied within that boundary, report the blocker.
Do not replace an absent browser test with a model-written PASS claim. Composer
adapters require send, stop, attachment add/remove/attachment-only send, and draft
parity for the capabilities already enabled in the target project.
