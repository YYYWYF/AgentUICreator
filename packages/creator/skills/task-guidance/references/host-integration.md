# Host integration recipes


Applicability: use these integration rules only for an actual Host embedding,
integration or producer-to-consumer publishing request established by the user
or current project evidence. A generic Plugin customization is not such a
request. Do not infer Vue, a producer/consumer pair or a publishing step from
the presence of these instructions. For an ordinary React application change,
use its own application and validation boundaries, without Vue guidance.
For a Creator-managed Vue integration, the editable workspace is the associated
React producer, not the Vue consumer. Integration tools resolve its reciprocal
Host binding and plan/apply only the selected Vue embedding recipe. UI/plugin
customizations belong in this producer's application layer. Do not edit Vue
business files through generic file tools. After customization, tell the user to
use "Build and update host" in the integration guide to publish the current
producer output. A module-required result on a bound project means its current
output is missing/stale: use that build action; never replace it with the tool's
official default bundle, invent another producer, or install React dependencies
into the Vue consumer.
Always retrieve the plan in the current run before apply/prepare/verify. Pass its
recipeReference as recipe (an object containing only the plan id); the tool forwards
the exact cached canonical recipe. Do not copy or regenerate long edits.after code
into mutation arguments. A missing reference means re-plan, not reconstruct it.
When users ask how to integrate, install, or enable Agent UI in an existing Host,
call plan_agent_ui_integration first. /install web-component-bridge and natural
language integration use this same Host-owned resource recipe. A guide is read-only:
display the returned paths and canonical edits.after, with no filesystem writes.
After target selection, a how-to guide needs no apply approval or automation choice;
display the recipe directly. When manualPrerequisites includes compiled-bridge,
show it before the canonical Vue code edits:
1. Prepare the compatibility runtime resource public/agent-ui.js.
2. Create src/components/AgentUIBridge.vue using its canonical edits.after.
3. Modify the selected target (e.g. src/App.vue) using its canonical edits.after.
If the prerequisite status is ready, say the resource is ready and needs no action.
If missing, say it is an official compiled asset, should not be edited manually,
and offer to prepare only this file while the user edits the Vue code themselves.
Do not write files in a guide or include bundle contents in code edits.
When the user asks only to prepare the resource file, call
prepare_agent_ui_integration_asset with the original recipe after authorization.
Do not call apply_agent_ui_integration, edit Vue files or install dependencies.
After preparation, say only public/agent-ui.js is ready and list the remaining
manual edit paths from the recipe. Never claim full integration is complete.
Keep the original recipe for verify after the user makes the canonical edits.
For automatic integration, present that same recipe, obtain user authorization,
then call apply_agent_ui_integration with the exact recipe. If target-required,
ask the user to select a discovered target; never guess a business page. For manual
edits, call verify_agent_ui_integration with the original recipe. The Host checks
the official compiled Bridge distribution during plan and prepares public/agent-ui.js
during approved apply; do not install its producer dependencies in the consumer. Follow canonical-react for React; do not recommend the
Bridge there. Nuxt is unsupported. Never infer Vue versions/entries or generate
framework-specific integration code, translate React Plugins into Vue, or add React
build tooling to a Vue consumer. The producer resource still uses the existing
Source Item/resource installation pipeline; consumers only load its compiled module.
