# Internationalization implementation checks — 2026-10-07

These are implementation checks, not acceptance. The user explicitly requested
completion and push without acceptance; no browser, visual, narrow-screen,
real-Agent or deployed-backend acceptance was performed.

## Passed

- Recursive locale key, non-empty message and placeholder parity: Creator 614,
  public presentation 214, generated registry 292 keys per locale. Generated
  messages include the public presentation defaults; these counts overlap.
- Creator package build and typecheck; product React package build and typecheck,
  including public declaration and Lexical boundaries.
- Working-tree Creator focused tests: 31 passed. Product locale/foundation/toolkit
  and vendor guard tests: 26 passed. Source Registry loader/release fixtures:
  7 passed. Current release descriptor resolution passed.
- Isolated commit content: Creator build/typecheck and 16 focused tests passed;
  React build/typecheck and 25 focused tests passed before the additional file
  download assertion. The complete canonical template dependency closure for
  all three independent example Hosts passed TypeScript compilation in disposable
  copies. No Creator dependency was introduced into their production UI.
- Clean vendor and generated adapter provenance checks passed; localization
  recipes regenerate deterministically. `git diff --check` passed.

## Existing constraints observed

The starting workspace contained independent pending edits. Overlapping Creator
UI changes were regenerated against the branch baseline for the commit, leaving
those pending edits in the working tree. The locale catalogs also cover the
pending UI's copy, so it can continue using the same infrastructure.

Two original `CreatorWorkbenchQuestion` request-mock assertions fail on the
unmodified branch implementation as well: they count/inspect every fetch while
connection settings also issue requests. They were reproduced with the original
Workbench and are not claimed as fixed by localization. The working-tree version
has the independent connection changes and its corresponding focused suite passes.

Existing ignored Host source trees contain old/customized framework revisions.
Their automatic source synchronization correctly preserves them, so their normal
local typechecks cannot see the new `Agent.locale` API until those managed sources
are upgraded. Disposable copies with the full current Source Registry closure
compile successfully; the customized originals were not reset.

The broader Host preparation command also encountered an existing consumer-fixture
npm resolution failure for `@radix-ui/react-portal@1.1.18`. That network-dependent
check is not reported as passed; package compilation and the focused checks above
were verified separately using installed dependencies.

Unsupported pinned upstream copy remains documented in
[upstream-localization-gaps.md](./upstream-localization-gaps.md). Agent messages,
recording content, diagnostic details and protocol labels remain data.
