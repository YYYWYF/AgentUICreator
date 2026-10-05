# Runtime diagnostic evidence

Use only tools offered under `static_and_runtime`. In `static_only`, explain
that Runtime evidence is unavailable; do not open another execution channel.

Read `inspect_runtime_errors` first for Runtime failure. Check `currentHash`,
`diagnosticFresh`, `compositionFresh`, Runtime status and source attribution.
Old-hash diagnostics are history; `includeStale` never promotes them to current
root causes. Missing/freshness failures require reporting or fresh observations,
not speculative code edits.

A render/activation failure with Plugin, instance, authoring target and component
stack identifies the owner directly. Bind requested IDs from `currentErrors`
with `targetDiagnosticIds` before repair. Do not list every Plugin or scan all
source to rediscover the owner. Plain console errors cannot establish Plugin
attribution. Diagnostic selection does not grant scope or cross-layer writes.

Layout uncertainty uses `inspect_runtime_layout` with the smallest instance or
snapshot-scoped authoring node refs. Runtime Slot IDs/paths are compiler output;
repair Composition through AppUIModel, not internal Runtime IDs.

After a repair, validate the current source revision and obtain fresh Runtime
observations. The same model hash alone is insufficient after a source edit.
Duplicate protection includes run, revision, arguments and the current bounded
Runtime evidence hash; updated evidence or changed scope remains observable.

Fresh failures outside the task's layer/resource scope end blocked. Current
static pass with absent/stale Runtime evidence is unverified, never resolved.
Do not undo an entire Creator transaction for an ordinary Runtime error.
