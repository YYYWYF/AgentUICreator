# Host-owned Integration Recipe

The development Host owns host detection, canonical integration code, application,
and static verification. Creator understands user intent and presents the Host's
recipe. The generated application has no Creator dependency.

`plan_agent_ui_integration(options)` reads package declarations, Vite/Vue CLI
configuration, entry files and target candidates. It writes no project files. Its
result is `planned`, `target-required`, `module-required`, `canonical-react`, or
`unsupported`. Target selection is a user/product decision. Nuxt is unsupported;
React continues to use the existing canonical Source Item/resource path.

A recipe resolves the official `web-component-bridge` resource. It contains a
project-bound content ID, host facts, configuration, canonical before/after edits,
verification identifiers and warning identifiers. Both the guide and automatic
application consume these same edits. There is no Vue Plugin renderer or second
Agent Runtime. Templates live in Project Control, not in Creator prompts.

Creator tools expose the three phases through the existing canonical Project
Control protocol. Guide and manual-check requests route to the read-only agent;
application is classified as a side effect and requires authorization for the
presented plan. `/install web-component-bridge` on a compatibility consumer returns
a Host plan and continues through the same Creator integration request. On a React
producer it retains the existing official resource installer.

## Producer and consumer

The existing installer installs `integration/web-component-bridge` in the canonical
React producer. Its build emits a compiled ESM bundle containing that project's
AppUIModel and React Plugins. Do not install this producer's dependency closure
into a Vue consumer: it includes React/Vite/Tailwind build dependencies.

The consumer recipe defaults to `@agentui/web-component/register` where a bundler
can resolve the already installed distribution. Alternatively, supply an existing
compiled local ESM module as `moduleSpecifier`. A root URL such as `/agent-ui.js`
uses Vite's public directory in a Vue/Vite consumer, and the document root in a
plain HTML consumer. Plain HTML without a bundler requires a local compiled module;
there is no implicit browser support for bare package imports. The Host reports
`COMPILED_BRIDGE_REQUIRED` and refuses automatic application when the module cannot
be resolved. Module resolution is a static file/export check, not a claim that the
bundle executes successfully.

## Edits and verification

Vue recipes create `src/components/AgentUIBridge.vue` and mount it in the selected
target. The wrapper alone imports/registers the compiled module, creates the Custom
Element, maps endpoint/locale/theme/threadId props to `element.config`, forwards
`agent-ready`, `thread-change`, `agent-error`, and removes listeners and the element
on unmount. Public modules load through a Vite-ignored dynamic import with disposal
and load-error handling. The wrapper uses a div container, so the consumer need
not change Vue compiler options for custom elements. Vue 2 uses `beforeDestroy`;
Vue 3 uses `beforeUnmount`. No-script Vue 2 targets receive an Options API script.

Initial target edits deliberately support a bounded set of shapes: a single
non-self-closing root in a template, script setup, or a literal default-export
Options API object without an existing components registry. Other shapes return
`INTEGRATION_TARGET_FORMAT_UNSUPPORTED`; Creator must not synthesize an alternative
framework tutorial or rewrite the page. Candidate discovery currently includes
App.vue and top-level views/pages. Recipes reject unknown targets, symlink
traversal, oversized files, modified wrappers, unsafe module specifiers and
noncanonical/tampered recipes. HTML recipes create one registration module and a
mount plus script tag in the selected document.

`apply_agent_ui_integration(recipe)` regenerates the canonical recipe using the
original snapshots, validates its project identity/content, and checks conflicts
before writing. It uses the existing Project Control lock, cancellation markers,
atomic file replacement and rollback on ordinary commit errors. Repeating the
same apply is a no-op. It does not provide a durable crash-recovery journal.

`verify_agent_ui_integration(recipe)` is read-only. It checks the same expected
file contents, module resolution and consumer dependency boundary. Manual edits
must preserve the canonical snippets to pass this first version's exact-content
check; semantically equivalent reformatted code is not inferred as passing. Keep
the original recipe in conversation history for follow-up checks. Verification
can fail without changing files and never implies browser or backend acceptance.

## Development checks

The focused tests cover read-only planning through the actual protocol, explicit
target selection, unchanged entry files, apply/manual/repeat semantics, rejected
stale/tampered input, unresolved modules, symlink boundaries, React/Nuxt decisions,
plain HTML and the Vue CLI/Vue 2 lifecycle. Creator's command and tool-policy tests
cover the shared entry and read-only exclusion of apply. Typechecks, canonical
contract alignment and locale parity are separate from runtime acceptance.

No browser, real model, or backend acceptance was run for this change.

The existing `test_domain_tools.py` and `test_project_control_client.py` suites
have 36 failures and 18 passes. The same failure list was reproduced using HEAD
Python sources and HEAD canonical contracts in an isolated temporary package.
Those fixtures include outdated positional tool expectations and the retired
scripts/tsx control entry. The focused recipe tool test passes separately.
