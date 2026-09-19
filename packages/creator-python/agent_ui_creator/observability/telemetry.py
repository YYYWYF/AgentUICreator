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
    composition_fast_path: Any | None = None
    validation: Any | None = None
    run_control: Any | None = None
    action_selector: dict[str, object] | None = None
    action_selection: dict[str, object] | None = None
    selected_creator_action: dict[str, object] | None = None
    operation_route: dict[str, object] | None = None
    operation_presentation: dict[str, object] | None = None

    def bind(
        self,
        *,
        activity: Any | None = None,
        protocol: Any | None = None,
        project_control: Any | None = None,
        mutation: Any | None = None,
        scope: Any | None = None,
        composition_fast_path: Any | None = None,
        validation: Any | None = None,
        run_control: Any | None = None,
        action_selector: dict[str, object] | None = None,
        action_selection: dict[str, object] | None = None,
        selected_creator_action: dict[str, object] | None = None,
        operation_route: dict[str, object] | None = None,
        operation_presentation: dict[str, object] | None = None,
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
        if composition_fast_path is not None:
            self.composition_fast_path = composition_fast_path
        if validation is not None:
            self.validation = validation
        if run_control is not None:
            self.run_control = run_control
        if action_selector is not None:
            self.action_selector = dict(action_selector)
        if action_selection is not None:
            self.action_selection = dict(action_selection)
        if selected_creator_action is not None:
            self.selected_creator_action = dict(selected_creator_action)
        if operation_route is not None:
            self.operation_route = dict(operation_route)
        if operation_presentation is not None:
            self.operation_presentation = dict(operation_presentation)

    def model_tool_metrics(self) -> dict[str, object]:
        metrics = _to_dict(self.protocol) or {}
        if self.run_control is not None:
            converter = getattr(self.run_control, "metrics", None)
            if callable(converter):
                metrics.update(dict(converter()))
        if self.action_selector is not None:
            selector_metrics = dict(self.action_selector)
            selector_calls = selector_metrics.get("actionSelectorCalls", 0)
            protocol_calls = metrics.get("modelCalls")
            metrics.update(selector_metrics)
            if isinstance(selector_calls, int):
                metrics["totalModelCalls"] = (
                    protocol_calls if isinstance(protocol_calls, int) else 0
                ) + selector_calls
        return metrics

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
                    run_control=self.run_control,
                )
        except Exception:
            # Preserve the already-bound scope evidence if a late receipt
            # projection is unavailable while handling another failure.
            pass
        return _to_dict(self.scope)

    def composition_fast_path_metrics(self) -> dict[str, object] | None:
        return _to_dict(self.composition_fast_path)

    def validation_metrics(self) -> dict[str, object] | None:
        return _to_dict(self.validation, method="metrics")

    def snapshot(self) -> dict[str, object]:
        snapshot: dict[str, object] = {
            "modelToolMetrics": self.model_tool_metrics(),
        }
        if self.action_selector is not None:
            snapshot["actionSelector"] = dict(self.action_selector)
        if self.action_selection is not None:
            snapshot["actionSelection"] = dict(self.action_selection)
        if self.selected_creator_action is not None:
            snapshot["selectedCreatorAction"] = dict(self.selected_creator_action)
        project_control = self.project_control_metrics()
        if project_control is not None:
            snapshot["projectControlMetrics"] = project_control
        mutation = self.mutation_metrics()
        if mutation is not None:
            snapshot["mutationMetrics"] = mutation
        change_layer = self.change_layer_metrics()
        if change_layer is not None:
            snapshot["changeLayerMetrics"] = change_layer
        composition_fast_path = self.composition_fast_path_metrics()
        if composition_fast_path is not None:
            snapshot["compositionFastPath"] = composition_fast_path
        validation = self.validation_metrics()
        if validation is not None:
            snapshot["validationMetrics"] = validation
        return snapshot
