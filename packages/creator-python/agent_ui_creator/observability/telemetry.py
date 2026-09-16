from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _to_dict(value: Any, method: str = "to_dict") -> dict[str, object] | None:
    if value is None:
        return None
    converter = getattr(value, method, None)
    if callable(converter):
        converted = converter()
        return dict(converted) if isinstance(converted, dict) else None
    if isinstance(value, dict):
        return dict(value)
    return None


@dataclass(slots=True)
class CreatorRunTelemetry:
    """Run-scoped metric references that survive agent success or failure."""

    activity: Any | None = None
    protocol: Any | None = None
    project_control: Any | None = None
    mutation: Any | None = None
    scope: Any | None = None

    def bind(
        self,
        *,
        activity: Any | None = None,
        protocol: Any | None = None,
        project_control: Any | None = None,
        mutation: Any | None = None,
        scope: Any | None = None,
    ) -> None:
        if activity is not None:
            self.activity = activity
        if protocol is not None:
            self.protocol = protocol
        if project_control is not None:
            self.project_control = project_control
        if mutation is not None:
            self.mutation = mutation
        if scope is not None:
            self.scope = scope

    def model_tool_metrics(self) -> dict[str, object]:
        return _to_dict(self.protocol) or {}

    def project_control_metrics(self) -> dict[str, object] | None:
        return _to_dict(self.project_control)

    def mutation_metrics(self) -> dict[str, object] | None:
        return _to_dict(self.mutation, method="summary") or _to_dict(self.mutation)

    def change_layer_metrics(self) -> dict[str, object] | None:
        if self.scope is None:
            return None
        try:
            from ..domain_agent.change_scope import build_change_layer_run_metrics

            if self.activity is not None:
                return build_change_layer_run_metrics(
                    scope=self.scope,
                    activity=self.activity,
                    protocol=self.protocol,
                    project_control=self.project_control,
                    mutation=self.mutation,
                )
        except Exception:
            # Preserve the already-bound scope evidence if a late receipt
            # projection is unavailable while handling another failure.
            pass
        return _to_dict(self.scope)

    def snapshot(self) -> dict[str, object]:
        snapshot: dict[str, object] = {
            "modelToolMetrics": self.model_tool_metrics(),
        }
        project_control = self.project_control_metrics()
        if project_control is not None:
            snapshot["projectControlMetrics"] = project_control
        mutation = self.mutation_metrics()
        if mutation is not None:
            snapshot["mutationMetrics"] = mutation
        change_layer = self.change_layer_metrics()
        if change_layer is not None:
            snapshot["changeLayerMetrics"] = change_layer
        return snapshot

