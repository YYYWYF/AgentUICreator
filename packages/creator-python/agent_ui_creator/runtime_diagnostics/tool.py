from __future__ import annotations

import json
import logging
from typing import Annotated, Any

from langchain_core.tools import BaseTool, tool
from pydantic import Field

from ..activity import CreatorActivityRecorder
from ..domain_state import DomainObservationContext
from ..project_control import ProjectControlClient, ProjectControlError
from ..repair import CreatorRepairState
from .store import RuntimeDiagnosticStore


logger = logging.getLogger(__name__)

MAX_RUNTIME_LAYOUT_FILTER_IDS = 200
MAX_RUNTIME_LAYOUT_FILTER_ID_LENGTH = 200
RuntimeLayoutFilterId = Annotated[
    str,
    Field(
        min_length=1,
        max_length=MAX_RUNTIME_LAYOUT_FILTER_ID_LENGTH,
    ),
]
RuntimeLayoutFilter = Annotated[
    list[RuntimeLayoutFilterId] | None,
    Field(max_length=MAX_RUNTIME_LAYOUT_FILTER_IDS),
]


class RuntimeDiagnosticInspectionService:
    def __init__(
        self,
        *,
        store: RuntimeDiagnosticStore,
        thread_id: str | None,
        project_control: ProjectControlClient,
        observations: DomainObservationContext,
        activity: CreatorActivityRecorder,
        repair_state: CreatorRepairState | None = None,
    ) -> None:
        self.store = store
        self.thread_id = thread_id
        self.project_control = project_control
        self.observations = observations
        self.activity = activity
        self.repair_state = repair_state or CreatorRepairState()
        self.latest_result: dict[str, Any] | None = None
        self.last_inspected_revision: int | None = None

    @staticmethod
    def _current_hash(project: dict[str, Any]) -> str:
        app_ui_model = project.get("appUIModel")
        value = app_ui_model.get("hash") if isinstance(app_ui_model, dict) else None
        if not (
            isinstance(value, str)
            and len(value) == 64
            and all(character in "0123456789abcdef" for character in value)
        ):
            raise ValueError(
                "ProjectControl did not return a valid current AppUIModel hash."
            )
        return value

    @staticmethod
    def _authoring_targets(project: dict[str, Any]) -> dict[str, dict[str, Any]]:
        return {
            str(instance["id"]): dict(instance["target"])
            for instance in project.get("plugins", [])
            if isinstance(instance, dict)
            and isinstance(instance.get("id"), str)
            and isinstance(instance.get("target"), dict)
        }

    @classmethod
    def _sanitize_diagnostic(
        cls,
        record: dict[str, Any],
        authoring_targets: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        sanitized = {
            key: value
            for key, value in record.items()
            if key not in {"slotId", "slotPath"}
        }
        instance_id = sanitized.get("instanceId")
        if isinstance(instance_id, str):
            target = authoring_targets.get(instance_id)
            if target is not None:
                sanitized["target"] = target
        if (
            sanitized.get("kind") == "plugin-width-incompatible"
            and isinstance(sanitized.get("pluginId"), str)
            and isinstance(sanitized.get("actualWidthClass"), str)
        ):
            sanitized["errorMessage"] = (
                f'UI plugin "{sanitized["pluginId"]}" requires a wide container, '
                f'but its current container is {sanitized["actualWidthClass"]}.'
            )
        return sanitized

    @classmethod
    def _sanitize_result(
        cls,
        result: dict[str, Any],
        authoring_targets: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        sanitized = {
            key: value
            for key, value in result.items()
            if key not in {"runtimeInstances", "runtimeSlots"}
        }
        for key in ("currentErrors", "resolvedCurrent", "stale"):
            records = sanitized.get(key)
            if isinstance(records, list):
                sanitized[key] = [
                    cls._sanitize_diagnostic(record, authoring_targets)
                    for record in records
                    if isinstance(record, dict)
                ]
        return sanitized

    async def inspect(self, *, include_stale: bool = False) -> dict[str, Any]:
        self.repair_state.begin_verification(self.activity.revision)
        project = await self.project_control.inspect_ui_project()
        current_hash = self._current_hash(project)
        self.observations.observe_app_ui_model(
            hash=current_hash,
            revision=self.activity.revision,
            source="inspect_ui_project",
        )
        raw_result = self.store.inspect(
            thread_id=self.thread_id or "",
            current_app_ui_model_hash=current_hash,
            last_mutation_at=self.activity.last_mutation_at,
            include_stale=include_stale,
        )
        raw_composition = self.store.current_composition(
            thread_id=self.thread_id or "",
            app_ui_model_hash=current_hash,
        )
        verification = (
            await self.project_control.verify_runtime_composition(
                app_ui_model_hash=current_hash,
                composition=raw_composition,
            )
            if raw_composition is not None
            else {"verified": False, "checks": []}
        )
        result = self._sanitize_result(
            raw_result,
            self._authoring_targets(project),
        )
        composition_checks = verification.get("checks", [])
        result["compositionChecks"] = composition_checks
        result["compositionVerified"] = (
            result.get("compositionFresh") is True
            and verification.get("verified") is True
        )
        if (
            result["runtimeStatus"] == "passed"
            and not result["compositionVerified"]
        ):
            result["runtimeStatus"] = (
                "stale"
                if result.get("compositionFresh") is not True
                else "failed"
            )
        self.repair_state.record_result(
            self.activity.revision,
            passed=result["runtimeStatus"] in {"passed", "unavailable"},
        )
        result.update(self.repair_state.to_dict())
        self.latest_result = result
        self.last_inspected_revision = self.activity.revision
        if self.activity.logger is not None:
            self.activity.logger.record(
                "runtime_verification",
                {
                    "revision": self.activity.revision,
                    "currentHash": current_hash,
                    "runtimeStatus": result["runtimeStatus"],
                    "runtimeObserved": result["runtimeObserved"],
                    "currentOpenCount": result["summary"]["currentOpenCount"],
                },
            )
        return result

    def current_result(self) -> dict[str, Any] | None:
        result = self.latest_result
        if (
            result is None
            or self.last_inspected_revision != self.activity.revision
        ):
            return None
        return result

    @staticmethod
    def _validate_layout_filter(
        value: list[str] | None,
        *,
        field_name: str,
    ) -> list[str] | None:
        if value is None:
            return None
        if (
            not isinstance(value, list)
            or len(value) > MAX_RUNTIME_LAYOUT_FILTER_IDS
            or any(
                not isinstance(item, str)
                or not item
                or len(item) > MAX_RUNTIME_LAYOUT_FILTER_ID_LENGTH
                for item in value
            )
        ):
            raise ValueError(
                f"{field_name} must contain at most "
                f"{MAX_RUNTIME_LAYOUT_FILTER_IDS} non-empty ids of at most "
                f"{MAX_RUNTIME_LAYOUT_FILTER_ID_LENGTH} characters."
            )
        return list(value)

    async def inspect_layout(
        self,
        *,
        instance_ids: list[str] | None = None,
        layout_node_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        instance_ids = self._validate_layout_filter(
            instance_ids,
            field_name="instanceIds",
        )
        layout_node_ids = self._validate_layout_filter(
            layout_node_ids,
            field_name="layoutNodeIds",
        )
        project = await self.project_control.inspect_ui_project(view="composition")
        current_hash = self._current_hash(project)
        result = self.store.inspect_runtime_layout(
            thread_id=self.thread_id or "",
            current_app_ui_model_hash=current_hash,
            last_mutation_at=self.activity.last_mutation_at,
            instance_ids=instance_ids,
            layout_node_ids=layout_node_ids,
        )
        if self.activity.logger is not None:
            self.activity.logger.record(
                "runtime_layout_inspection",
                {
                    "toolName": "inspect_runtime_layout",
                    "currentHash": current_hash,
                    "compositionFresh": result["compositionFresh"],
                    "requestedInstanceCount": (
                        0 if instance_ids is None else len(instance_ids)
                    ),
                    "requestedLayoutNodeCount": (
                        0
                        if layout_node_ids is None
                        else len(layout_node_ids)
                    ),
                    "returnedInstanceCount": len(result["instances"]),
                    "returnedLayoutNodeCount": len(result["layoutNodes"]),
                },
            )
        return result


def create_runtime_diagnostic_tool(
    service: RuntimeDiagnosticInspectionService,
) -> BaseTool:
    @tool("inspect_runtime_errors")
    async def inspect_runtime_errors(includeStale: bool = False) -> str:
        """Inspect current-hash Runtime diagnostics and freshness. By default historical errors from older AppUIModel hashes are summarized but omitted. A passed result requires Runtime evidence received after the latest Creator source or composition mutation."""
        try:
            result = await service.inspect(include_stale=includeStale)
            return json.dumps(
                {"ok": True, "result": result},
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            )
        except ProjectControlError as error:
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "code": error.code,
                        "message": str(error),
                        **(
                            {"details": error.details}
                            if error.details is not None
                            else {}
                        ),
                    },
                },
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            )
        except Exception:
            logger.exception("Unexpected runtime diagnostic inspection failure")
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "code": "RUNTIME_DIAGNOSTIC_INSPECTION_FAILED",
                        "message": (
                            "The Creator Host could not inspect Runtime diagnostics."
                        ),
                    },
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )

    return inspect_runtime_errors


def create_runtime_layout_tool(
    service: RuntimeDiagnosticInspectionService,
) -> BaseTool:
    @tool("inspect_runtime_layout")
    async def inspect_runtime_layout(
        instanceIds: RuntimeLayoutFilter = None,
        layoutNodeIds: RuntimeLayoutFilter = None,
    ) -> str:
        """Inspect bounded, current-hash Runtime layout geometry after the frontend has rendered. Use this for explicit visible spacing, gap, alignment, size, position, overlap, or adjacency questions. It accepts only optional instanceIds and layoutNodeIds filters; it cannot evaluate arbitrary selectors, JavaScript, HTML, or CSS. runtimeStatus=available with compositionFresh=true is fresh geometry evidence. If geometry is stale or unavailable, do not claim visual verification."""
        try:
            result = await service.inspect_layout(
                instance_ids=instanceIds,
                layout_node_ids=layoutNodeIds,
            )
            return json.dumps(
                {"ok": True, "result": result},
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            )
        except ValueError as error:
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "code": "RUNTIME_LAYOUT_ARGUMENTS_INVALID",
                        "message": str(error),
                    },
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )
        except ProjectControlError as error:
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "code": error.code,
                        "message": str(error),
                        **(
                            {"details": error.details}
                            if error.details is not None
                            else {}
                        ),
                    },
                },
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            )
        except Exception:
            logger.exception("Unexpected runtime layout inspection failure")
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "code": "RUNTIME_LAYOUT_INSPECTION_FAILED",
                        "message": (
                            "The Creator Host could not inspect Runtime layout geometry."
                        ),
                    },
                },
                ensure_ascii=False,
                separators=(",", ":"),
            )

    return inspect_runtime_layout
