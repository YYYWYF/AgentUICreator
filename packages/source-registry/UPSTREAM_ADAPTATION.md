# Upstream Adaptation Standard

shadcn/ui is an upstream implementation reference for Agent UI primitives. It is
not a runtime or CLI dependency. Preserve behavior, accessibility, component
composition, and important states while replacing styling and integration with
the generated project's isolated Agent UI foundation.

An adapted component may enter the Source Registry only after every item below is
complete:

- [ ] Pin the exact upstream Git revision.
- [ ] Reference the Base UI implementation.
- [ ] Remove Tailwind classes and configuration assumptions.
- [ ] Remove `cn` and class utility assumptions.
- [ ] Remove global CSS dependencies.
- [ ] Remove host theme assumptions.
- [ ] Move production styling to CSS Modules.
- [ ] Express colors and shared design values with `--aui-*` semantic tokens.
- [ ] Route every overlay portal through `AgentUIRoot`.
- [ ] Preserve Base UI accessibility behavior.
- [ ] Preserve the composition API and underlying component capabilities.
- [ ] Add stable `data-slot` attributes and expose state through data attributes.
- [ ] Add component and runtime tests.
- [ ] Record complete `upstream` metadata in the Registry item.
