from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.tools import BaseTool, tool

from ..activity import CreatorActivityRecorder
from ..domain_state import DomainObservationContext
from ..project_control import ProjectControlClient, ProjectControlError
from ..repair import CreatorRepairState
from .store import RuntimeDiagnosticStore


logger = logging.getLogger(__name__)


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

    async def inspect(self, *, include_stale: bool = False) -> dict[str, Any]:
        self.repair_state.begin_verification(self.activity.revision)
        project = await self.project_control.inspect_ui_project()
        current_hash = self._current_hash(project)
        self.observations.observe_app_ui_model(
            hash=current_hash,
            revision=self.activity.revision,
            source="inspect_ui_project",
        )
        result = self.store.inspect(
            thread_id=self.thread_id or "",
            current_app_ui_model_hash=current_hash,
            last_mutation_at=self.activity.last_mutation_at,
            include_stale=include_stale,
        )
        actual_by_id = {
            instance.get("instanceId"): instance
            for instance in result.get("runtimeInstances", [])
            if isinstance(instance, dict)
            and isinstance(instance.get("instanceId"), str)
        }
        composition_checks: list[dict[str, Any]] = []
        plugin_instances = project.get("pluginInstances")
        for instance in plugin_instances if isinstance(plugin_instances, list) else []:
            if not isinstance(instance, dict) or instance.get("enabled") is not True:
                continue
            mount = instance.get("mount")
            if not isinstance(mount, dict) or not isinstance(
                mount.get("slotId"), str
            ):
                continue
            instance_id = instance.get("id")
            plugin_id = instance.get("pluginId")
            if not isinstance(instance_id, str) or not isinstance(plugin_id, str):
                continue
            actual = actual_by_id.get(instance_id)
            status = "passed"
            if actual is None:
                status = "missing"
            elif actual.get("pluginId") != plugin_id:
                status = "plugin-mismatch"
            elif actual.get("slotId") != mount["slotId"]:
                status = "slot-mismatch"
            composition_checks.append(
                {
                    "instanceId": instance_id,
                    "status": status,
                    "expected": {
                        "pluginId": plugin_id,
                        "slotId": mount["slotId"],
                    },
                    "actual": actual or {"mounted": False},
                }
            )
        result["compositionChecks"] = composition_checks
        result["compositionVerified"] = all(
            check["status"] == "passed" for check in composition_checks
        )
        if (
            result["runtimeStatus"] == "passed"
            and not result["compositionVerified"]
        ):
            result["runtimeStatus"] = "failed"
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
