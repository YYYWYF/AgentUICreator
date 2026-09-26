# Optional Dialog and Form Frontend Tool demos

Dialog and Form scenarios are always listed in Mock Studio. Their code belongs to
`demo/frontend-tool-dialog` and `demo/frontend-tool-form` Source Registry bundles
(kind `demo`), rather than the default foundation. Select a scenario to see its
resource readiness; install resources explicitly before activating it. Missing packages are reported from the full dependency closure, including
`react-hook-form ^7` and `@assistant-ui/react-hook-form 0.12.34`; Mock Studio
generates a copyable package command from these requirements.
The installer never runs a package manager.

`installScenarioResources` installs source through the existing registry transaction,
regenerates the existing Plugin Registry and explicit Frontend Tool/UI imports,
places the capability in AppUIModel, and checks the resulting composition with
`verifyUIProject`. The Form is a visible panel beside the conversation. Install is
an application permission decision: only application-owned generated imports expose
tools, and service requirements filter tools when their provider is disabled.
Production uses these generated files without Creator or a registry scanner.
Legacy v1 application files at Project Root use a separate
`.agent-ui/scenario-resources` source lock; v2 projects use their configured managed
source root and source lock. The legacy adapter registry remains independent.

## Upstream reference and adaptation

Pinned assistant-ui revision: `039c3c32822632f2a564164f089f538926886124`.
The local source repository is `/Users/yifei/Coding/assistant-ui`.
`@assistant-ui/react` is `0.15.21`, `@assistant-ui/react-ag-ui` is `0.0.60`.

Dialog follows `examples/with-ag-ui/app/page.tsx`: the `browser_alert` frontend
tool provides description, parameters, execute and render. Our `open_demo_dialog`
uses the application-owned `demo.dialog` service instead of `alert()`.

Form references `packages/react-hook-form` (`0.12.34` at the pinned revision),
especially `src/formTools.ts` and `src/useAssistantForm.ts`. Canonical tools are
`set_form_field`, `submit_form` and `reset_form`. `integration/react-hook-form` imports the public `formTools` contract from
`@assistant-ui/react-hook-form 0.12.34` as the source of truth for descriptions,
then routes execution through application-owned Frontend Tool policy.
`useAssistantForm` is appropriate for ordinary assistant-ui applications; its direct
model-context registration does not fit our explicit permission boundary. This demo
uses React Hook Form's `useForm`, `FormProvider`, `register`, `setValue`, `reset`,
`handleSubmit` and `formState`; it uses the assistant-ui package only for its public `formTools` contract,
never calls `useAssistantForm`, and does not copy its implementation. Agent submission requests the native form submit event
and awaits React Hook Form validation and the same handler used for manual submit.

The default scenario fills Alice's first name and email and returns a continuation
receipt after both ToolMessages. It never submits or resets. All three tools remain
available for explicit requests to a connected Agent; submission and reset tool
descriptions require user confirmation. Mock fixtures are deterministic, so the
fill scenario itself always demonstrates filling, regardless of chat wording.

## History safety contract

Only Frontend Tool `execute` calls mutate services. Tool UIs render historical
args/result/status receipts; they never bind RHF controllers or mutate current fields.
Controller attachment/subscription and cleanup belong to the visible Form Plugin.
There is one native assistant-ui executor and no CUSTOM tool protocol.

Replay coverage should exercise:

1. Live `set_form_field(firstName, Alice)` and `set_form_field(email, alice@example.com)`
   each execute once and update the visible RHF inputs.
2. Manually change first name to Bob; switch conversation and return. Current form
   stays Bob while the historical receipt still reports Alice.
3. Live submit increments `submitCount` once; historical renderer remount,
   StrictMode, and thread revisit never increment it.
4. Historical reset receipts never reset current input values.
5. Disabling the provider hides all three tools on the next `RunAgentInput.tools`.
6. Historical Dialog receipts never reopen a closed Dialog.

This document states the intended contract. No runtime acceptance is claimed for
this implementation delivery; checks are skipped when requested by the user.

The native Form regression harness is retained as a development template at
`packages/source-registry/registry/items/demo-frontend-tool-form/tests/frontend-tool-form-lifecycle.test.tsx.template`.
It is deliberately excluded from resource installation to keep generated projects
free of the test harness's dev-only Mock Agent/Vitest dependencies. After installing
the Form bundle into the example target and its RHF dependency, copy this template
to `examples/agent-frontend/tests/frontend-tool-form-lifecycle.test.tsx` to run it in
that target's existing test environment. Dialog coverage remains in the example's
lifecycle tests with test-only fixtures. Catalog and readiness coverage is in the
Mock Agent, Source Registry and Creator test suites.

## Official Integration resource contract

Source Registry supports `integration` for official adaptations of third-party
frameworks, protocols and specialized assistant-ui capabilities. An Integration
need not contribute a Plugin, Frontend Tool or AppUIModel instance.
`integration/react-hook-form` owns package requirements, `ReactHookFormCapability`,
`reactHookFormToolContracts` and `createReactHookFormFrontendTools`. Form Demo
requires that Integration and owns its fields, visible UI, controller, snapshots,
Tool modules and historical receipts. Dialog remains an independent Demo.

The factory requires an explicit `expose` list. Installing the Integration creates
no application Tool module and grants no Agent permission. Only modules included
in the application generated allowlist expose tools; service availability continues
to filter them through `AppFrontendToolRuntime`. Do not combine `useAssistantForm`
(which directly registers with model context) with this factory.

`installOptionalAgentUIResource(projectRoot, sourceItemId)` installs a full
requires closure, checks package readiness, regenerates source-derived registries,
and checks source integrity without changing AppUIModel. `installScenarioResources`
adds Demo composition and project verification afterward. Neither runs a package
manager. Direct `requirements` remain item-local; `dependencies`,
`resolvedRequirements` and `dependencyIssues` describe transitive readiness.
Installed consumers prevent dependency removal with
`AGENT_UI_SOURCE_DEPENDENCY_IN_USE`. Legacy v1 hosts explicitly provide the existing
core Runtime: its source files are checked, never adopted or overwritten by the
optional-resource lock. V2 foundations remain managed through the project source lock.

## Future A2UI public boundary (contract only)

A future `integration/a2ui` may supply Runtime, renderer and action bridges without
any Plugin or Frontend Tool. A future Demo can depend on that resource. This change
does not implement A2UI. Ordinary Plugins should consume a thin public facade in
`@agent-ui/runtime-conversation`, such as `useConversationA2uiAction`, rather than
import `useAgUiSendA2uiAction` directly from `@assistant-ui/react-ag-ui`.
Integration adapters should centralize `JSONGenerativeUI` and
`defaultGenerativeUILibrary` usage so assistant-ui API changes stay at that boundary.

The Integration's upstream semantic and permission regression template lives at
`packages/source-registry/registry/items/integration-react-hook-form/tests/frontend-tool-contract.test.ts.template`.
Copy it to the example target's `tests/` after explicitly installing the resource
and its dependencies. It is excluded from production resource installation.
