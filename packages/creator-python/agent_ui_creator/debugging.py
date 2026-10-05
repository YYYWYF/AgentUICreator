from __future__ import annotations

import hashlib
import json
from typing import Any

from .resource_scope import (
    contains_identifier,
    resource_keys_for_evidence,
    resource_keys_for_path,
    runtime_failure_layer,
)


DEBUGGING_SELECTION_TOOL_NAMES = (
    "select_debugging_target",
    "select_all_current_runtime_diagnostics",
)


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
        self.runtime_baseline: dict[str, dict[str, Any]] | None = None
        self.runtime_observation: dict[str, dict[str, Any]] | None = None
        self.runtime_evidence_hash: str | None = None
        self.observed_targets: dict[str, dict[str, Any]] = {}
        self.selected_target_ids: set[str] = set()
        self.target_selection_calls = 0
        self.ambiguous_target_stops = 0
        self.all_current_runtime = False
        self.clean_requested = False
        self.final_state: str | None = None
        self.reason: str | None = None

    def ensure_run(self, run_id: str | None) -> None:
        if self.run_id != run_id:
            self.reset(run_id)

    @property
    def active(self) -> bool:
        return bool(self.targets or self.runtime_targets or self.clean_requested)

    @property
    def diagnostic_scope_pending(self) -> bool:
        kinds = {item["kind"] for item in self.observed_targets.values()}
        return (("static" in kinds and not self.targets and not self.clean_requested)
                or ("runtime" in kinds and not self.runtime_targets))

    def observe_static_targets(self, diagnostics: Any, revision: int) -> None:
        for item in diagnostics:
            if item.path.startswith("<"):
                continue
            target_id = "ts:" + self.static_key(item)
            self.observed_targets[target_id] = {
                "kind": "static", "identity": self.static_identity(item),
                "revision": revision, "owner": {"path": item.path},
                "repairLayer": None, "repairResources": list(resource_keys_for_path(item.path)),
                "ownerEvidence": {"path": item.path},
                "summary": f"{item.path} / {item.code}",
            }

    def observe_runtime_targets(self, result: dict[str, Any], revision: int) -> None:
        if result.get("diagnosticFresh") is not True or result.get("compositionFresh") is not True:
            return
        for item in result.get("currentErrors", []):
            layer, resources, owner_evidence = self.runtime_owner(item)
            target_id = "runtime:" + self.runtime_key(item)
            previous = self.observed_targets.get(target_id)
            if (previous is not None and previous.get("revision") == revision
                    and previous.get("ownerEvidence", {}).get("message") == owner_evidence.get("message")):
                resources = sorted(set(resources) | set(previous.get("repairResources", [])))
            self.observed_targets[target_id] = {
                "kind": "runtime", "identity": self.runtime_identity(item),
                "revision": revision,
                "owner": {key: item.get(key) for key in ("pluginId", "instanceId")},
                "repairLayer": layer, "repairResources": resources,
                "ownerEvidence": owner_evidence,
                "summary": f"{item.get('pluginId')} / {item.get('kind')}",
            }

    @staticmethod
    def runtime_owner(item: dict[str, Any]) -> tuple[str | None, list[str], dict[str, Any]]:
        layer = runtime_failure_layer(item)
        evidence = {key: item[key] for key in (
            "kind", "pluginId", "instanceId", "target", "eventName", "issuePaths",
        ) if item.get(key) is not None}
        resources: set[str] = set()
        if layer == "plugin_behavior" and item.get("pluginId"):
            resources.add("plugin:" + item["pluginId"])
        elif layer == "composition" and item.get("instanceId"):
            resources.add("plugin-instance:" + item["instanceId"])
            if isinstance(item.get("target"), dict):
                resources.add("app-ui-model")
        elif layer == "agent_integration" and item.get("eventName"):
            # The application owns the event registry, including payload schemas.
            resources.update(resource_keys_for_path("agent-contract/agent-events.ts"))
            if item.get("kind") == "plugin-event-undeclared-subscription" and item.get("pluginId"):
                resources.add("plugin:" + item["pluginId"])
        elif layer == "runtime_capability":
            resources.update(resource for resource in resource_keys_for_evidence(
                item.get("errorMessage") or "") if resource.startswith("service:"))
        if layer == "runtime_capability":
            evidence["message"] = item.get("errorMessage") or ""
        if resources:
            evidence["resolvedResources"] = sorted(resources)
        return layer, sorted(resources), evidence

    def enrich_runtime_owners(self, service_inspection: dict[str, Any]) -> None:
        """Resolve a gate's named Service from targeted Host contract evidence.

        Reading an unrelated Service never binds it to a diagnostic. The named
        Service must also list the implicated Plugin as a participant.
        """
        for target in self.observed_targets.values():
            if target.get("repairLayer") != "runtime_capability":
                continue
            evidence = target["ownerEvidence"]
            for service in service_inspection.get("services", []):
                name = service.get("name")
                participants = [participant for key in ("providers", "requiredConsumers", "optionalConsumers")
                                for participant in service.get(key, [])]
                if (not isinstance(name, str)
                        or not contains_identifier(evidence.get("message", ""), name)
                        or not any(participant.get("pluginId") == evidence.get("pluginId")
                                   for participant in participants)):
                    continue
                resource = "service:" + name
                if resource not in target["repairResources"]:
                    target["repairResources"].append(resource)
                evidence["serviceName"] = name
                evidence["resolvedResources"] = sorted(target["repairResources"])

    def candidate_targets(self) -> list[dict[str, Any]]:
        return [{"targetId": key, "summary": value["summary"]}
                for key, value in self.observed_targets.items()]

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
        # Render/setup failures are states of an instance; event failures also
        # have an application-owned event/code/payload-path identity. Message,
        # stack positions, report IDs, hashes and timestamps are evidence only.
        return {key: record.get(key) for key in (
            "kind", "pluginId", "instanceId", "eventName", "code",
        )} | {"issuePaths": sorted(set(record.get("issuePaths") or []))}

    @classmethod
    def runtime_key(cls, record: dict[str, Any]) -> str:
        return evidence_hash(cls.runtime_identity(record))

    @classmethod
    def runtime_identities(cls, result: dict[str, Any]) -> dict[str, dict[str, Any]] | None:
        if not isinstance(result, dict):
            return None
        errors = result.get("currentErrors")
        summary = result.get("summary", {})
        if (result.get("diagnosticFresh") is not True or result.get("compositionFresh") is not True
                or result.get("runtimeObserved") is not True or not isinstance(errors, list)
                or summary.get("truncated") is True
                or summary.get("currentOpenCount", len(errors)) != len(errors)):
            return None
        return {cls.runtime_key(item): {**cls.runtime_identity(item),
                "messageHash": evidence_hash(item.get("errorMessage", ""))} for item in errors}

    def observe_runtime(self, result: dict[str, Any], revision: int) -> None:
        self.runtime_revision = revision
        self.runtime_observation = self.runtime_identities(result)
        self.runtime_current = None if self.runtime_observation is None else set(self.runtime_observation)
        self.runtime_evidence_hash = result.get("runtimeEvidenceHash")

    def runtime_differential(self, result: dict[str, Any], revision: int) -> dict[str, Any] | None:
        current = self.runtime_identities(result)
        if (not self.runtime_targets or self.runtime_baseline is None or current is None
                or revision != self.runtime_revision):
            return None
        return self._runtime_difference(current)

    def _runtime_difference(self, current: dict[str, dict[str, Any]]) -> dict[str, Any]:
        targets, baseline, observed = set(self.runtime_targets), set(self.runtime_baseline or {}), set(current)
        return {
            "targetRemaining": [current[key] for key in sorted(targets & observed)],
            "targetResolved": [self.runtime_targets[key] for key in sorted(targets - observed)],
            "introducedRuntimeDiagnostics": [current[key] for key in sorted(observed - baseline)],
            "unchangedPreexistingRuntimeDiagnostics": [current[key] for key in sorted((observed & baseline) - targets)],
            "resolvedUnrelatedRuntimeDiagnostics": [self.runtime_baseline[key] for key in sorted(baseline - observed - targets)],
        }

    def runtime_completion_view(self, result: dict[str, Any], revision: int) -> dict[str, Any]:
        differential = self.runtime_differential(result, revision)
        if differential is None:
            return result
        relevant = set(self.runtime_targets) | (set(self.runtime_identities(result) or {}) - set(self.runtime_baseline or {}))
        errors = [item for item in result["currentErrors"] if self.runtime_key(item) in relevant]
        # Filter only unrelated baseline errors. Keep every other Host obligation
        # and the global evidence untouched for inspection and warning output.
        view = {**result, "currentErrors": errors, "runtimeDebuggingDifferential": differential}
        if (not errors and result.get("runtimeStatus") == "failed"
                and result.get("compositionVerified") is True
                and all(check.get("status") == "passed" for check in result.get("compositionChecks", []))
                and (result.get("verificationTail") or {}).get("geometryVerification", {}).get("status") != "failed"):
            view["runtimeStatus"] = "passed"
        return view

    def _runtime_metric_differential(self, revision: int) -> dict[str, Any] | None:
        if (revision != self.runtime_revision or self.runtime_observation is None
                or self.runtime_baseline is None or not self.runtime_targets):
            return None
        return self._runtime_difference(self.runtime_observation)

    def metrics(self, *, differential: Any, repair_state: Any, revision: int) -> dict[str, Any]:
        current = None if differential is None or not differential.current_available else differential.current_diagnostics
        return {
            "observedDebuggingTargets": self.candidate_targets(),
            "selectedDebuggingTargetIds": sorted(self.selected_target_ids),
            "diagnosticScopePending": self.diagnostic_scope_pending,
            "targetSelectionCalls": self.target_selection_calls,
            "ambiguousTargetStops": self.ambiguous_target_stops,
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
            "runtimeBaselineDiagnostics": None if self.runtime_baseline is None else list(self.runtime_baseline.values()),
            "runtimeDifferential": self._runtime_metric_differential(revision),
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
