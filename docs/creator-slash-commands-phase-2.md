# Creator Slash Commands Phase 2

The existing Creator command registry and `/__creator/commands` endpoints own
`/theme`, `/install`, and `/sync`. Slash requests never enter Agent message
history or fall back to a model. Natural-language requests retain the original
Creator Agent transport.

`/install` discovers capabilities from `officialResourceRegistry` entries with
`discoverable: true`. ProjectControl produces the public Catalog and owns source,
package, and composition admission. Creator's locale dictionary supplies display
names, with Host label and resource ID fallbacks. Filtering is substring matching
against ID, translated label, and description. Installed and conflicting options
are disabled; missing and disabled options can be selected.

The execute protocol is a discriminated union with exact fields. Install accepts
only `resourceId`; official dependency closures determine all package manager
commands. ProjectControl re-inspects current facts, rejects source/package or
duplicate-instance conflicts, retains complete managed/customized source, and
activates composition through the existing AppUI transaction. Only successful
`verifyUIProject` followed by a `ready` inspection produces an installation
success receipt. Already-ready resources are a no-op. Source mutation journals,
AppUI rollback, and recovery remain in use. Compatible package additions can
survive a later failure and are safe to retry.

`/sync` holds the existing ProjectControl lock, recovers pending AppUI writes,
and regenerates only Plugin Registry from current source and AppUIModel. It
checks the published output against a fresh generation. Missing/stale output is
changed; fresh output is a no-op. Its receipt records the real
`synchronize_plugin_registry` postcondition and uses `changed-unverified`, not a
full-project verification claim.

Install and Sync have no Creator Undo transaction or fabricated file diffs.
Theme retains its existing verified storage and Undo/Reapply path. Changed
commands refresh project state, remount Preview, and reload command options;
no-op commands do not force a Preview refresh.

The Workspace Manager reserves a mutation gate before queuing operations, rejects
new Creator requests or commands while reserved, and queues workspace switches
behind it. The authenticated Python Host also rejects active runs/pending
questions and holds its existing writing lock throughout Install/Sync. It accepts
only acquire/release operations with an opaque Host token; this endpoint is not
exposed to Creator UI. The lock is released in the Host's finally path, and Python
process disposal releases it on Host shutdown. Theme uses the same Workspace gate
and its existing Python commit lock.

## Checks and acceptance boundary

Focused command/UI/Workspace tests, real ProjectControl source/composition
regressions, fake package-runner tests, Python command/transaction tests, package
builds, typechecks, and locale parity checks are the implementation checks.

The existing command CI job now includes the resource Catalog/customized-source
and Sync tests plus two disposable real Host browser scenarios. The scenarios
exercise capability installation/rendering/persistence and stale/missing/fresh
registry synchronization without mocking command APIs or ProjectControl. Only
workspace display metadata is supplied by the fixture.

Per the user's instruction, browser E2E, visual acceptance, the full assistant-ui
upgrade gate, and full CI acceptance are not run for this delivery. The browser
specs were discovered with Playwright `--list`; discovery is not an E2E pass.
assistant-ui vendor source is unchanged.

An additional run of the legacy `conversation-quote-resource-install` fixture
suite failed all three tests (including a fixture that now starts with Quote
already installed). The same three failures reproduced using the pre-change
installer. These fixture failures are outside this phase's focused passing gates
and are not reported as green.
