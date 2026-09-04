from __future__ import annotations

from collections import OrderedDict
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MAX_DIAGNOSTIC_SCOPES = 50
MAX_DIAGNOSTICS_PER_SCOPE = 200
MAX_COMPOSITIONS_PER_SCOPE = 20
MAX_COMPOSITION_INSTANCES = 500


class RuntimeDiagnostic(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[1]
    kind: Literal["plugin-render", "plugin-activation"]
    status: Literal["error", "resolved"]
    appUIModelHash: str = Field(pattern=r"^[a-f0-9]{64}$")
    occurredAt: datetime
    pluginId: str = Field(min_length=1, max_length=200)
    instanceId: str = Field(min_length=1, max_length=200)
    pluginName: str | None = Field(default=None, max_length=200)
    slotId: str | None = Field(default=None, max_length=200)
    slotPath: str | None = Field(default=None, max_length=1_000)
    errorMessage: str | None = Field(default=None, max_length=2_000)
    componentStack: str | None = Field(default=None, max_length=8_000)

    @model_validator(mode="after")
    def require_error_message(self) -> "RuntimeDiagnostic":
        if self.status == "error" and self.errorMessage is None:
            raise ValueError("An error diagnostic must include errorMessage.")
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
        self.diagnostics: list[dict[str, object]] = []
        self.compositions: list[dict[str, object]] = []


class RuntimeDiagnosticStore:
    """Project-local runtime state. One store belongs to one sidecar process."""

    def __init__(self) -> None:
        self._scopes: OrderedDict[str, _Scope] = OrderedDict()

    def record(self, envelope: RuntimeDiagnosticEnvelope) -> dict[str, object]:
        scope = self._scope(envelope.threadId)
        if envelope.composition is not None:
            scope.compositions.insert(
                0, envelope.composition.model_dump(mode="json", exclude_none=True)
            )
            del scope.compositions[MAX_COMPOSITIONS_PER_SCOPE:]
            return {"accepted": True}

        diagnostic = envelope.diagnostic
        if diagnostic is None:  # guarded by RuntimeDiagnosticEnvelope
            raise ValueError("Runtime diagnostic payload is missing.")
        if diagnostic.status == "resolved":
            resolved_count = 0
            for record in scope.diagnostics:
                if (
                    record.get("status") == "error"
                    and record.get("kind") == diagnostic.kind
                    and record.get("appUIModelHash") == diagnostic.appUIModelHash
                    and record.get("pluginId") == diagnostic.pluginId
                    and record.get("instanceId") == diagnostic.instanceId
                ):
                    record["status"] = "resolved"
                    resolved_count += 1
            return {"accepted": True, "resolvedCount": resolved_count}

        serialized = diagnostic.model_dump(mode="json", exclude_none=True)
        fingerprint_fields = (
            "kind",
            "appUIModelHash",
            "pluginId",
            "instanceId",
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
            scope.diagnostics.insert(0, serialized)
        else:
            existing.update(serialized)
            existing["count"] = int(existing.get("count", 0)) + 1
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
