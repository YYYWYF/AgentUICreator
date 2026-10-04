# Official integrations


When assistant-ui provides a specialized integration:

1. Inspect the official integration at the project's pinned upstream revision first.
2. Reuse its public semantic contracts where possible.
3. Do not bypass AgentUICreator application permission.
4. Model reusable adaptation as an Integration, not as a Demo Plugin.

React Hook Form: reuse `@assistant-ui/react-hook-form.formTools` through
`integration/react-hook-form`. Use ordinary RHF `useForm()` plus an application
Service and `createReactHookFormFrontendTools({ serviceName, fields, expose })`.
`expose` is mandatory and has no default. Do not call `useAssistantForm()` or
`aui.modelContext.register(...)`; combining those with the factory creates duplicate
registration and bypasses application permission.

Integration installation != automatic Agent permission. Only application
frontend-tool modules included in the generated allowlist expose operations.
Integrations can be pluginless and tool-less. Demo consumers own UI, field names,
Service lifecycle and replayable receipts; the Integration owns reusable contracts.
