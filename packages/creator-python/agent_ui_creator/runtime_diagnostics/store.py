from __future__ import annotations

import hashlib
import json
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_DIAGNOSTIC_SCOPES = 50
MAX_DIAGNOSTICS_PER_SCOPE = 200
MAX_COMPOSITIONS_PER_SCOPE = 20
MAX_COMPOSITION_INSTANCES = 500
MAX_DIAGNOSTIC_RESULTS = 20
MAX_RUNTIME_HASH_EVIDENCE_PER_SCOPE = (
    MAX_DIAGNOSTICS_PER_SCOPE + MAX_COMPOSITIONS_PER_SCOPE
)


class RuntimeDiagnostic(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1]
    kind: Literal[
        "plugin-render",
        "plugin-activation",
        "application-event-unknown",
        "application-event-invalid-payload",
        "plugin-event-undeclared-subscription",
        "plugin-event-handler-error",
    ]
    status: Literal["error", "resolved"]
    appUIModelHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    occurredAt: datetime
    pluginId: str | None = Field(default=None, min_length=1, max_length=200)
    instanceId: str | None = Field(default=None, min_length=1, max_length=200)
    pluginName: str | None = Field(default=None, max_length=200)
    eventName: str | None = Field(default=None, min_length=1, max_length=300)
    issuePaths: list[str] | None = Field(default=None, max_length=100)
    slotId: str | None = Field(default=None, max_length=200)
    slotPath: str | None = Field(default=None, max_length=1_000)
    errorMessage: str | None = Field(default=None, max_length=2_000)
    componentStack: str | None = Field(default=None, max_length=8_000)

    @model_validator(mode="after")
    def require_error_message(self) -> "RuntimeDiagnostic":
        if self.status == "error" and self.errorMessage is None:
            raise ValueError("An error diagnostic must include errorMessage.")
        plugin_scoped = self.kind in {
            "plugin-render",
            "plugin-activation",
            "plugin-event-undeclared-subscription",
            "plugin-event-handler-error",
        }
        event_scoped = self.kind in {
            "application-event-unknown",
            "application-event-invalid-payload",
            "plugin-event-undeclared-subscription",
            "plugin-event-handler-error",
        }
        if plugin_scoped and (self.pluginId is None or self.instanceId is None):
            raise ValueError("A plugin-scoped diagnostic must include plugin identity.")
        if event_scoped and self.eventName is None:
            raise ValueError("An event diagnostic must include eventName.")
        if self.issuePaths is not None and any(
            not path or len(path) > 500 for path in self.issuePaths
        ):
            raise ValueError("diagnostic.issuePaths entries must be 1-500 characters.")
        return self


class RuntimeCompositionInstance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    instanceId: str = Field(min_length=1, max_length=200)
    pluginId: str = Field(min_length=1, max_length=200)
    slotId: str = Field(min_length=1, max_length=200)
    slotPath: str | None = Field(default=None, max_length=1_000)


class RuntimeComposition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1]
    appUIModelHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    observedAt: datetime
    instances: list[RuntimeCompositionInstance] = Field(
        max_length=MAX_COMPOSITION_INSTANCES
    )

    @model_validator(mode="after")
    def require_unique_instance_ids(self) -> "RuntimeComposition":
        instance_ids = [instance.instanceId for instance in self.instances]
        if len(instance_ids) != len(set(instance_ids)):
            raise ValueError("composition.instances contains duplicate instanceId values.")
        return self


class RuntimeDiagnosticEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")

    threadId: str = Field(min_length=1, max_length=200)
    diagnostic: RuntimeDiagnostic | None = None
    composition: RuntimeComposition | None = None

    @model_validator(mode="after")
    def require_exactly_one_payload(self) -> "RuntimeDiagnosticEnvelope":
        if (self.diagnostic is None) == (self.composition is None):
            raise ValueError(
                "Runtime request must contain exactly one of diagnostic or composition."
            )
        return self


class _Scope:
    def __init__(self) -> None:
        self.diagnostics: list[dict[str, Any]] = []
        self.compositions: list[dict[str, Any]] = []
        self.latest_received_by_hash: dict[str, str] = {}
        self.latest_observed_by_hash: dict[str, str] = {}
        self.latest_diagnostic_received_by_hash: dict[str, str] = {}
        self.latest_diagnostic_observed_by_hash: dict[str, str] = {}


class RuntimeDiagnosticStore:
    """Project-local runtime state. One store belongs to one sidecar process."""

    def __init__(self) -> None:
        self._scopes: OrderedDict[str, _Scope] = OrderedDict()

    def record(self, envelope: RuntimeDiagnosticEnvelope) -> dict[str, object]:
        scope = self._scope(envelope.threadId)
        received_at = datetime.now(timezone.utc).isoformat().replace(
            "+00:00", "Z"
        )
        if envelope.composition is not None:
            composition = envelope.composition.model_dump(
                mode="json", exclude_none=True
            )
            composition["receivedAt"] = received_at
            self._record_received_at(
                scope, envelope.composition.appUIModelHash, received_at
            )
            self._record_observed_at(
                scope,
                envelope.composition.appUIModelHash,
                str(composition["observedAt"]),
            )
            scope.compositions.insert(0, composition)
            scope.compositions.sort(
                key=lambda item: (
                    str(item.get("observedAt") or ""),
                    str(item.get("receivedAt") or ""),
                ),
                reverse=True,
            )
            del scope.compositions[MAX_COMPOSITIONS_PER_SCOPE:]
            return {"accepted": True}

        diagnostic = envelope.diagnostic
        if diagnostic is None:  # guarded by RuntimeDiagnosticEnvelope
            raise ValueError("Runtime diagnostic payload is missing.")
        self._record_received_at(scope, diagnostic.appUIModelHash, received_at)
        self._record_observed_at(
            scope,
            diagnostic.appUIModelHash,
            str(diagnostic.model_dump(mode="json")["occurredAt"]),
        )
        self._record_timestamp(
            scope.latest_diagnostic_received_by_hash,
            diagnostic.appUIModelHash,
            received_at,
        )
        self._record_observed_timestamp(
            scope.latest_diagnostic_observed_by_hash,
            diagnostic.appUIModelHash,
            str(diagnostic.model_dump(mode="json")["occurredAt"]),
        )
        if diagnostic.status == "resolved":
            resolved_count = 0
            for record in scope.diagnostics:
                if (
                    record.get("status") == "error"
                    and record.get("kind") == diagnostic.kind
                    and record.get("appUIModelHash") == diagnostic.appUIModelHash
                    and record.get("pluginId") == diagnostic.pluginId
                    and record.get("instanceId") == diagnostic.instanceId
                    and record.get("eventName") == diagnostic.eventName
                ):
                    record["status"] = "resolved"
                    record["lastSeenAt"] = received_at
                    record["resolvedAt"] = received_at
                    resolved_count += 1
            scope.diagnostics.sort(
                key=lambda item: str(item.get("lastSeenAt") or ""),
                reverse=True,
            )
            return {"accepted": True, "resolvedCount": resolved_count}

        serialized = diagnostic.model_dump(mode="json", exclude_none=True)
        fingerprint_fields = (
            "kind",
            "appUIModelHash",
            "pluginId",
            "instanceId",
            "eventName",
            "issuePaths",
            "slotId",
            "slotPath",
            "errorMessage",
            "componentStack",
        )
        existing = next(
            (
                record
                for record in scope.diagnostics
                if all(
                    record.get(field) == serialized.get(field)
                    for field in fingerprint_fields
                )
            ),
            None,
        )
        if existing is None:
            serialized["count"] = 1
            serialized["id"] = hashlib.sha256(
                json.dumps(
                    [serialized.get(field) for field in fingerprint_fields],
                    ensure_ascii=False,
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest()[:24]
            serialized["firstSeenAt"] = received_at
            serialized["lastSeenAt"] = received_at
            scope.diagnostics.insert(0, serialized)
        else:
            existing.update(serialized)
            existing["count"] = int(existing.get("count", 0)) + 1
            existing["lastSeenAt"] = received_at
            existing.pop("resolvedAt", None)
            scope.diagnostics.remove(existing)
            scope.diagnostics.insert(0, existing)
        del scope.diagnostics[MAX_DIAGNOSTICS_PER_SCOPE:]
        return {"accepted": True, "resolvedCount": 0}

    def _scope(self, thread_id: str) -> _Scope:
        existing = self._scopes.pop(thread_id, None)
        scope = existing if existing is not None else _Scope()
        self._scopes[thread_id] = scope
        while len(self._scopes) > MAX_DIAGNOSTIC_SCOPES:
            self._scopes.popitem(last=False)
        return scope

    @staticmethod
    def _as_datetime(value: str | None) -> datetime | None:
        if value is None:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return (
                parsed
                if parsed.tzinfo is not None
                else parsed.replace(tzinfo=timezone.utc)
            )
        except ValueError:
            return None

    @staticmethod
    def _record_received_at(scope: _Scope, app_hash: str, received_at: str) -> None:
        RuntimeDiagnosticStore._record_timestamp(
            scope.latest_received_by_hash, app_hash, received_at
        )

    @staticmethod
    def _record_timestamp(
        timestamps: dict[str, str], app_hash: str, value: str
    ) -> None:
        timestamps.pop(app_hash, None)
        timestamps[app_hash] = value
        while len(timestamps) > MAX_RUNTIME_HASH_EVIDENCE_PER_SCOPE:
            del timestamps[next(iter(timestamps))]

    @classmethod
    def _record_observed_at(
        cls, scope: _Scope, app_hash: str, observed_at: str
    ) -> None:
        cls._record_observed_timestamp(
            scope.latest_observed_by_hash, app_hash, observed_at
        )

    @classmethod
    def _record_observed_timestamp(
        cls, timestamps: dict[str, str], app_hash: str, observed_at: str
    ) -> None:
        existing = timestamps.get(app_hash)
        current_time = cls._as_datetime(observed_at)
        existing_time = cls._as_datetime(existing)
        if current_time is not None and (
            existing_time is None or current_time >= existing_time
        ):
            timestamps.pop(app_hash, None)
            timestamps[app_hash] = observed_at
        while len(timestamps) > MAX_RUNTIME_HASH_EVIDENCE_PER_SCOPE:
            del timestamps[next(iter(timestamps))]

    @staticmethod
    def _compact(record: dict[str, Any], *, stale: bool) -> dict[str, Any]:
        result = {**record, "stale": stale}
        message = result.get("errorMessage")
        if isinstance(message, str) and len(message) > 1_000:
            result["errorMessage"] = message[:1_000] + "…"
        stack = result.get("componentStack")
        if isinstance(stack, str) and len(stack) > 1_200:
            result["componentStack"] = stack[:1_200] + "…"
        return result

    def inspect(
        self,
        *,
        thread_id: str,
        current_app_ui_model_hash: str,
        last_mutation_at: datetime | None = None,
        include_stale: bool = False,
    ) -> dict[str, Any]:
        scope = self._scopes.get(thread_id)
        if scope is None:
            return {
                "available": True,
                "currentHash": current_app_ui_model_hash,
                "runtimeObserved": False,
                "runtimeStatus": "unavailable",
                "diagnosticFresh": False,
                "compositionFresh": False,
                "currentErrors": [],
                "resolvedCurrent": [],
                "stale": [],
                "summary": {
                    "currentOpenCount": 0,
                    "resolvedCurrentCount": 0,
                    "staleOpenCount": 0,
                    "staleResolvedCount": 0,
                    "truncated": False,
                },
            }
        self._scopes.move_to_end(thread_id)
        records = sorted(
            scope.diagnostics,
            key=lambda item: str(item.get("lastSeenAt") or ""),
            reverse=True,
        )
        current = [
            item
            for item in records
            if item.get("appUIModelHash") == current_app_ui_model_hash
        ]
        historical = [
            item
            for item in records
            if item.get("appUIModelHash") != current_app_ui_model_hash
        ]
        current_errors = [item for item in current if item.get("status") == "error"]
        resolved_current = [
            item for item in current if item.get("status") == "resolved"
        ]
        stale_open_count = sum(
            item.get("status") == "error" for item in historical
        )
        selected_stale = historical if include_stale else []
        latest_composition = next(
            (
                item
                for item in scope.compositions
                if item.get("appUIModelHash") == current_app_ui_model_hash
            ),
            None,
        )
        latest_runtime_received_at = scope.latest_received_by_hash.get(
            current_app_ui_model_hash
        )
        latest_runtime_observed_at = scope.latest_observed_by_hash.get(
            current_app_ui_model_hash
        )
        latest_diagnostic_received_at = scope.latest_diagnostic_received_by_hash.get(
            current_app_ui_model_hash
        )
        latest_diagnostic_observed_at = scope.latest_diagnostic_observed_by_hash.get(
            current_app_ui_model_hash
        )
        runtime_observed = (
            latest_runtime_received_at is not None
            and latest_runtime_observed_at is not None
        )
        diagnostic_received_time = self._as_datetime(latest_diagnostic_received_at)
        diagnostic_observed_time = self._as_datetime(latest_diagnostic_observed_at)
        diagnostic_fresh = (
            latest_diagnostic_received_at is not None
            and latest_diagnostic_observed_at is not None
            and (
                last_mutation_at is None
                or (
                    diagnostic_received_time is not None
                    and diagnostic_received_time >= last_mutation_at
                    and diagnostic_observed_time is not None
                    and diagnostic_observed_time >= last_mutation_at
                )
            )
        )
        composition_received_time = self._as_datetime(
            None if latest_composition is None else latest_composition.get("receivedAt")
        )
        composition_observed_time = self._as_datetime(
            None if latest_composition is None else latest_composition.get("observedAt")
        )
        composition_fresh = (
            latest_composition is not None
            and (
                last_mutation_at is None
                or (
                    composition_received_time is not None
                    and composition_received_time >= last_mutation_at
                    and composition_observed_time is not None
                    and composition_observed_time >= last_mutation_at
                )
            )
        )
        evidence_fresh = diagnostic_fresh or composition_fresh
        if not runtime_observed:
            runtime_status = (
                "stale"
                if scope.compositions or scope.diagnostics
                else "unavailable"
            )
        elif not evidence_fresh:
            runtime_status = "stale"
        elif current_errors:
            runtime_status = "failed"
        else:
            runtime_status = "passed"
        selected_count = (
            len(current_errors) + len(resolved_current) + len(selected_stale)
        )
        summary: dict[str, Any] = {
            "currentOpenCount": len(current_errors),
            "resolvedCurrentCount": len(resolved_current),
            "staleOpenCount": stale_open_count,
            "staleResolvedCount": len(historical) - stale_open_count,
            "truncated": selected_count > MAX_DIAGNOSTIC_RESULTS,
        }
        if records:
            summary["latestAt"] = records[0].get("lastSeenAt")
        return {
            "available": True,
            "currentHash": current_app_ui_model_hash,
            "runtimeObserved": runtime_observed,
            "runtimeStatus": runtime_status,
            "diagnosticFresh": diagnostic_fresh,
            "compositionFresh": composition_fresh,
            "runtimeInstances": (
                []
                if latest_composition is None
                else latest_composition.get("instances", [])
            ),
            **(
                {}
                if latest_composition is None
                else {
                    "latestCompositionObservedAt": latest_composition.get(
                        "observedAt"
                    ),
                    "latestCompositionReceivedAt": latest_composition.get(
                        "receivedAt"
                    ),
                }
            ),
            **(
                {}
                if latest_runtime_observed_at is None
                else {"latestRuntimeObservedAt": latest_runtime_observed_at}
            ),
            **(
                {}
                if latest_runtime_received_at is None
                else {"latestRuntimeReceivedAt": latest_runtime_received_at}
            ),
            **(
                {}
                if last_mutation_at is None
                else {
                    "lastMutationAt": last_mutation_at.isoformat(
                        timespec="milliseconds"
                    ).replace("+00:00", "Z")
                }
            ),
            "currentErrors": [
                self._compact(item, stale=False)
                for item in current_errors[:MAX_DIAGNOSTIC_RESULTS]
            ],
            "resolvedCurrent": [
                self._compact(item, stale=False)
                for item in resolved_current[:MAX_DIAGNOSTIC_RESULTS]
            ],
            "stale": [
                self._compact(item, stale=True)
                for item in selected_stale[:MAX_DIAGNOSTIC_RESULTS]
            ],
            "summary": summary,
        }
