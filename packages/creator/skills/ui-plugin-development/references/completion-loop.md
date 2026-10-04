# Development completion loop


Use the following loop autonomously when Plugin code is required:

```text
Reuse
-> Modify/Create source
-> Static Validation
-> Composition
-> Static Validation for the final revision
-> Runtime Verification (static_and_runtime only)
-> Repair when needed
-> Completion
```

- A static validation failure is normal development evidence, not a Tool failure. Read its bounded diagnostics, repair the relevant source, and validate the new revision.
- In `static_and_runtime` mode, a current Runtime error requires source inspection, repair, another current-revision static validation, and fresh Runtime verification.
- Runtime evidence received before the latest source mutation is stale even when the AppUIModel hash did not change.
- Stop after two unsuccessful automatic repair rounds and report passed checks plus remaining diagnostics.
- When Runtime is unavailable in a headless or CLI session, state exactly that static validation passed but no Runtime verification evidence is available. Never claim Runtime success without fresh evidence.

For conversation, locale, AG-UI, events, Services or Theme integration, use the relevant project contract. Read [contract-boundaries.md](references/contract-boundaries.md) when this task needs those details.

For Agent-invoked frontend operations, inspect the application-owned Frontend Tool boundary. Read [frontend-tool-consumers.md](references/frontend-tool-consumers.md) when this task needs those details.

For new Plugin delivery, distinguish source creation, registration, composition and verification. Read [delivery-obligations.md](references/delivery-obligations.md) when this task needs those details.
