# Optional Dialog and Form Frontend Tool demos

Dialog and Form scenarios are always listed in Mock Studio. Their code belongs to
`demo/frontend-tool-dialog` and `demo/frontend-tool-form` Source Registry bundles
(kind `demo`), rather than the default foundation. Select a scenario to see its
resource readiness; install resources explicitly before activating it. A missing
`react-hook-form ^7` dependency is reported with `pnpm add react-hook-form`.
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
`set_form_field`, `submit_form` and `reset_form`. AgentUICreator mirrors these tool
semantics but routes execution through its application-owned Frontend Tool policy.
`useAssistantForm` is appropriate for ordinary assistant-ui applications; its direct
model-context registration does not fit our explicit permission boundary. This demo
uses React Hook Form's `useForm`, `FormProvider`, `register`, `setValue`, `reset`,
`handleSubmit` and `formState`; it does not install the assistant-ui form hook package
or copy its implementation. Agent submission requests the native form submit event
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
