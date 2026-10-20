"""Read-only, hash-verified evidence from unfinished runs in the same thread.

This is provenance for derived registry maintenance, never a write/read grant.
"""
from __future__ import annotations

import json
from pathlib import Path

from ..files import read_creator_file_state
from ..resource_scope import project_logical_path


def recover_registry_evidence(activity) -> tuple[str, ...]:
    thread_id = getattr(activity.logger, "thread_id", None)
    if not thread_id:
        return ()
    directory = activity.project_root / ".agent-ui/creator" / "logs"
    # Refuse redirected tooling history. File-state readers also check each
    # referenced receipt and source path against the native project boundary.
    if directory.is_symlink() or directory.parent.is_symlink() or not directory.is_dir():
        return ()
    paths: set[str] = set()
    for log in sorted(directory.glob("*.jsonl"), reverse=True)[:64]:
        try:
            if log.is_symlink() or log.stat().st_size > 8_000_000:
                continue
            with log.open(encoding="utf-8") as stream:
                first = json.loads(stream.readline(100_000))
                if not isinstance(first, dict) or first.get("threadId") != thread_id or first.get("runId") == activity.run_id:
                    continue
                last = None
                for line in stream:
                    item = json.loads(line)
                    if isinstance(item, dict) and item.get("type") == "run_finished":
                        last = item
            if not last or last.get("runId") != first.get("runId"):
                continue
            if last.get("data", {}).get("status") not in {"error", "failed", "blocked", "interrupted", "committed_unverified"}:
                continue
            record = activity.transactions.load(first["runId"])
            relevant = [file.path for file in record.files
                        if project_logical_path(file.path, activity.project_root).startswith("/plugins/")
                        and Path(file.path).name in {"manifest.json", "definition.ts"}]
            if not relevant:
                continue
            # Whole-receipt matching prevents attributing changed/undone source
            # or silently accepting an unrelated edit as the previous run's work.
            if not all(read_creator_file_state(activity.project_root, file.path).hash == file.after.hash
                       for file in record.files):
                continue
            paths.update(file.path for file in record.files)
        except (OSError, ValueError, KeyError, TypeError, RuntimeError):
            continue
    return tuple(sorted(paths))
