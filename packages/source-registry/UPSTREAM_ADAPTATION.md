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

## Official Generative UI source

`pnpm assistant-ui:update` resolves the `@assistant-ui/react-generative-ui`
release tag, records its commit in `assistant-ui-upgrade-target.json`, and runs
`sync:generative-ui-upstream --revision <release-sha>` automatically. For a
manual regeneration, pass that exact `--revision` and optionally `--repo` to
`pnpm --filter @agent-ui/source-registry sync:generative-ui-upstream`.
The sync updates the styled element, CSS, provenance, and the package/version
metadata of the Generative UI agent-component and integration items.
The styled source is unchanged. Official vocabulary CSS declarations are unchanged;
each selector is mechanically prefixed with `.agent-ui-conversation`, including
comma-separated selectors and rules within media queries. No theme translation,
visual redesign or local vocabulary is introduced. The installed `UPSTREAM.json`
is Registry-managed alongside both source files.
`integration/a2ui` has no direct Generative UI package requirement. Its
`upstream.revision` identifies the release reviewed when its wrapper was last
implemented; it changes only with an A2UI wrapper review, not with each
Generative UI source sync.

The upgrade scans package manifests for every package named in the target.
Dependency, devDependency and optionalDependency declarations use the exact
target version. Peer dependencies keep their declared policy: exact stays
exact, `^` stays `^`, and `~` stays `~`, with the floor raised to the target
version. Other peer range forms fail the update for an explicit review.
