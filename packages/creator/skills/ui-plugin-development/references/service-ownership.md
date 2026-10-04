# Service dependency and ownership decision


When a Plugin needs another capability, call `inspect_ui_services` instead of
guessing a Provider from Plugin names or source proximity.

```text
Plugin needs capability X
-> inspect_ui_services
-> existing Service?
   -> yes: classify core requirement as inject, enhancement as optionalInject
   -> no: is a cross-boundary shared Service actually necessary?
      -> no: keep the behavior private to the Plugin
      -> yes: resolve the natural Owner, exact Consumers and dependency modes
              -> prepare_ui_service_contract_change
              -> confirmation-required: ask the User and stop project writes
              -> authorized: create_ui_service_contract
                 -> wire Provider and Consumers
                 -> validate, then Runtime verify only in static_and_runtime mode
```

- `inject` is only for a capability without which the Plugin's core behavior cannot work.
- `optionalInject` is for an enhancement with a complete fallback when the Service is unavailable.
- A missing optional Service is not permission to create it. Omit the dependency unless the user explicitly authorizes a new shared capability.
- A new Plugin does not declare `provides` merely because another Plugin might use its behavior later.
- If the User explicitly identifies the Service Owner and Consumer, pass an exact substring of the current User message as authorization evidence and do not repeat confirmation. Never fabricate or paraphrase evidence.
- To change an existing Service Contract, inspect all `contractPaths`, Providers and Consumers, require one canonical path, read that file, authorize the exact impact, then use `mutate_ui_service_contract` exact edits and update affected Plugins.
- Generic `edit_file` and Plugin tools never write `<sourceRoot>/services/**`; only authorized Service Contract tools may do so.
- A public Service is justified only across a real boundary: multiple Plugins, another Plugin caller, Application Shell, or a Frontend Tool/Agent adapter. Private state and helpers stay inside the Plugin.
