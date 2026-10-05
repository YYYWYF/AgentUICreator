# Plugin hiding and permanent deletion

Creator presents two removal outcomes. Hiding disables the existing Composition
instance and retains its source, Source Lock ownership and Service Providers.
Permanent deletion calls `purge_ui_plugin` with only `pluginId`, a fresh
`appUIModelHash` and a fresh `sourceStateHash`. File paths and cleanup lists are
never model inputs. Ordinary Composition Remove operations remain internal.

The existing Intent Selector emits `GENERAL HIDE`, `GENERAL PURGE` or
`GENERAL REMOVAL_UNCERTAIN`. Uncertain removal hands off to the existing
`ask_user_question` interrupt flow. Before an answer, the write agent exposes only
the question tool. Server validation of the interrupt answer precedes resuming
the normal write agent. No natural-language removal regex is used.

## Host preparation and commit

`planPluginPurge` prepares a disposable project copy, retaining access to installed
dependency metadata. It reuses AppUIModel removal/reflow, opted-in orphan Service
cleanup and `removeAgentUISourceItems` admission, dependency and shared-file
ownership rules there. The live project is untouched during preparation.

All instances of the selected Plugin are removed. Orphan Providers are removed
only through the existing cleanup contract; disabled and optional consumers still
protect them. Removing an ancestor does not authorize purging unrelated child
Plugin source. Explicit headless deletion has a Host-only authority restricted to
the selected pluginId; the public generic Composition interface keeps its lifecycle
protection.

Managed source deletion uses Source Lock ownership, preserving files owned by
remaining items. Customized owned files can be deleted. Unowned additions to a
managed Plugin directory cause refusal. User-authored Plugins must have a matching
manifest in their own `sourceRoot/plugins/pluginId` directory and no managed
ownership; the complete directory is deleted. Symlink traversal, retained source
references, unprovable declarations, shared-item Plugin ownership and dependencies
still in use cause refusal before live file effects.

The final source inventory produces the generated Plugin, frontend-tool and
conversation-integration registries. The Host compiles the final AppUIModel,
refreshes its Composition revision and runs the existing static UI verifier.
Preparation produces before/after file states and removed directories.

One `pending-plugin-purge-transaction.json` covers the live Composition, generated
registries/revision, Source Lock and deleted source. Immediately before committing,
the Host rechecks cancellation, both hashes and the entire source snapshot. File
failures restore all original files and directories. Admission conflicts never
restore snapshots over external edits. Crash recovery runs before subsequent
ProjectControl requests, under cross-process Host admission locking. Active
requests fail closed with `PROJECT_CONTROL_BUSY`; active purge owners are not
recovered as crashed transactions.

A successful purge includes static verification of the prepared final project and
byte verification of committed files. It does not promise ordinary undo recovery.
Official source can later be reinstalled and composed; user-authored source needs
recreation or recovery outside this product action.

## Development checks

Regression coverage includes hiding, managed and user-authored deletion, optional
disabled consumer protection, shared files, customized ownership, hash conflicts,
unprovable installed dependencies, symlinks, rollback and crash recovery. Selector
fixtures cover hide/purge/uncertain; policy and routing tests cover the no-write
question handoff. Interactive or real-model acceptance is separate from these
checks.
