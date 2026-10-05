from __future__ import annotations

import hashlib
import json
from typing import Any


def evidence_hash(value: object) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


class DebuggingEvidence:
    """Run-scoped projection of existing diagnostics, not a diagnostic store or router.

    Selecting evidence does not grant write permission. Scope Guard remains the
    authority for every repair. Identities omit positions so a moved error is
    still unresolved; locations remain available in the source diagnostic.
    """

    def __init__(self) -> None:
        self.run_id: str | None = None
        self.reset(None)

    def reset(self, run_id: str | None) -> None:
        self.run_id = run_id
        self.validation_reads = 0
        self.runtime_reads = 0
        self.duplicates = 0
        self.targets: dict[str, dict[str, Any]] = {}
        self.runtime_targets: dict[str, dict[str, Any]] = {}
        self.runtime_revision: int | None = None
        self.runtime_current: set[str] | None = None
        self.runtime_evidence_hash: str | None = None
        self.clean_requested = False
        self.final_state: str | None = None
        self.reason: str | None = None

    def ensure_run(self, run_id: str | None) -> None:
        if self.run_id != run_id:
            self.reset(run_id)

    @property
    def active(self) -> bool:
        return bool(self.targets or self.runtime_targets or self.clean_requested)

    @staticmethod
    def static_identity(diagnostic: Any) -> dict[str, Any]:
        return {"path": diagnostic.path, "code": diagnostic.code,
                "messageHash": evidence_hash(diagnostic.message),
                "line": diagnostic.line, "column": diagnostic.column}

    @staticmethod
    def static_key(diagnostic: Any) -> str:
        return evidence_hash(diagnostic.fingerprint)

    @staticmethod
    def static_matches(diagnostic: Any, target: dict[str, Any]) -> bool:
        return (diagnostic.path == target.get("path") and diagnostic.code == target.get("code")
                and (not target.get("messageHash") or
                     evidence_hash(diagnostic.message) == target["messageHash"]))

    @staticmethod
    def runtime_identity(record: dict[str, Any]) -> dict[str, Any]:
        return {key: record.get(key) for key in (
            "kind", "pluginId", "instanceId", "source",
        )} | {"messageHash": evidence_hash(record.get("errorMessage", ""))}

    def metrics(self, *, differential: Any, repair_state: Any, revision: int) -> dict[str, Any]:
        current = None if differential is None or not differential.current_available else differential.current_diagnostics
        return {
            "validationReads": self.validation_reads,
            "runtimeDiagnosticReads": self.runtime_reads,
            "duplicateDiagnosticCalls": self.duplicates,
            "implicatedPaths": sorted({item["path"] for item in self.targets.values()} | {
                item.path for item in (() if differential is None else differential.new_diagnostics)
            }),
            "repairAttempts": repair_state.repair_rounds,
            "revision": revision,
            "runtimeEvidenceHash": self.runtime_evidence_hash if self.runtime_revision == revision else None,
            "targetDiagnostics": list(self.targets.values()),
            "runtimeTargetDiagnostics": list(self.runtime_targets.values()),
            "resolvedTargetDiagnostics": None if current is None else [
                item for item in self.targets.values()
                if not any(self.static_matches(diagnostic, item) for diagnostic in current)
            ],
            "resolvedRuntimeTargetDiagnostics": None if self.runtime_revision != revision or self.runtime_current is None else [
                item for key, item in self.runtime_targets.items() if key not in self.runtime_current
            ],
            "finalState": self.final_state,
            "reason": self.reason,
        }
