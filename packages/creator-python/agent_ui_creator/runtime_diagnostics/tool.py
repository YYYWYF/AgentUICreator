from __future__ import annotations

import json
import logging
from typing import Annotated, Any
from urllib.parse import quote, unquote_to_bytes

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

RUNTIME_LAYOUT_NODE_PREFIX = "layout-node:"
RUNTIME_LAYOUT_SLOT_PREFIX = "layout-slot:"
RUNTIME_PLUGIN_SLOT_PREFIX = "plugin:"


class RuntimeLayoutReferenceError(ValueError):
    """Raised when a snapshot-scoped authoring Layout reference is stale."""

    code = "RUNTIME_LAYOUT_REFERENCE_INVALID"


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

    @staticmethod
    def _build_authoring_layout_index(
        project: dict[str, Any],
    ) -> dict[str, dict[str, str]]:
        app_ui_model = project.get("appUIModel")
        layout = app_ui_model.get("layout") if isinstance(app_ui_model, dict) else None
        path_to_node_ref: dict[str, str] = {}
        node_ref_to_path: dict[str, str] = {}
        path_to_node_type: dict[str, str] = {}
        ambiguous_node_refs: set[str] = set()

        def visit(node: Any, path: str) -> None:
            if not isinstance(node, dict):
                return
            node_ref = node.get("nodeRef")
            node_type = node.get("type")
            if not isinstance(node_ref, str) or not node_ref:
                return
            if not isinstance(node_type, str) or not node_type:
                return
            path_to_node_ref[path] = node_ref
            path_to_node_type[path] = node_type
            if node_ref in ambiguous_node_refs:
                pass
            elif node_ref in node_ref_to_path:
                # An ambiguous snapshot-scoped ref must not become a filter
                # target. The current ProjectControl snapshot is authoritative
                # only when it yields a unique translation.
                node_ref_to_path.pop(node_ref, None)
                ambiguous_node_refs.add(node_ref)
            elif node_ref not in node_ref_to_path:
                node_ref_to_path[node_ref] = path

            if node_type in {"row", "column", "stack"}:
                children = node.get("children")
                if isinstance(children, list):
                    for index, child in enumerate(children):
                        visit(child, f"{path}.children[{index}]")
            elif node_type == "panel":
                visit(node.get("child"), f"{path}.child")

        visit(layout, "root")
        return {
            "path_to_node_ref": path_to_node_ref,
            "node_ref_to_path": node_ref_to_path,
            "path_to_node_type": path_to_node_type,
        }

    @staticmethod
    def _encode_runtime_layout_path(path: str) -> str:
        # Match encodeURIComponent's unescaped character set. Runtime IDs are
        # derived here only as an internal Store filter key.
        return quote(path, safe="-_.!~*'()")

    @classmethod
    def _runtime_layout_node_id_for_path(cls, path: str) -> str:
        return f"{RUNTIME_LAYOUT_NODE_PREFIX}{cls._encode_runtime_layout_path(path)}"

    @staticmethod
    def _decode_runtime_id_part(value: str) -> str | None:
        try:
            return unquote_to_bytes(value).decode("utf-8")
        except UnicodeDecodeError:
            return None

    @classmethod
    def _decode_runtime_layout_node_path(
        cls,
        runtime_node_id: Any,
        path_to_node_ref: dict[str, str],
    ) -> str | None:
        if not isinstance(runtime_node_id, str) or not runtime_node_id.startswith(
            RUNTIME_LAYOUT_NODE_PREFIX
        ):
            return None
        encoded_path = runtime_node_id[len(RUNTIME_LAYOUT_NODE_PREFIX) :]
        path = cls._decode_runtime_id_part(encoded_path)
        if path is None or path not in path_to_node_ref:
            return None
        return path

    @classmethod
    def _runtime_layout_node_ref(
        cls,
        runtime_node_id: Any,
        layout_index: dict[str, dict[str, str]],
    ) -> str | None:
        path = cls._decode_runtime_layout_node_path(
            runtime_node_id,
            layout_index["path_to_node_ref"],
        )
        if path is None:
            return None
        node_ref = layout_index["path_to_node_ref"].get(path)
        if (
            node_ref is None
            or layout_index["node_ref_to_path"].get(node_ref) != path
        ):
            return None
        return node_ref

    @staticmethod
    def _authoring_plugin_slot_targets(
        project: dict[str, Any],
    ) -> dict[tuple[str, str], dict[str, str]]:
        app_ui_model = project.get("appUIModel")
        slots = app_ui_model.get("slots") if isinstance(app_ui_model, dict) else None
        targets: dict[tuple[str, str], dict[str, str]] = {}
        ambiguous: set[tuple[str, str]] = set()
        if not isinstance(slots, list):
            return targets
        for entry in slots:
            if not isinstance(entry, dict):
                continue
            target = entry.get("target")
            if not isinstance(target, dict) or target.get("type") != "plugin_slot":
                continue
            parent_instance_id = target.get("parentInstanceId")
            local_slot = target.get("slot")
            if not isinstance(parent_instance_id, str) or not parent_instance_id:
                continue
            if not isinstance(local_slot, str) or not local_slot:
                continue
            key = (parent_instance_id, local_slot)
            if key in targets:
                ambiguous.add(key)
                continue
            targets[key] = {
                "type": "plugin_slot",
                "parentInstanceId": parent_instance_id,
                "slot": local_slot,
            }
        for key in ambiguous:
            targets.pop(key, None)
        return targets

    @staticmethod
    def _authoring_layout_slot_refs(
        project: dict[str, Any],
        layout_index: dict[str, dict[str, str]],
    ) -> dict[str, str]:
        app_ui_model = project.get("appUIModel")
        slots = app_ui_model.get("slots") if isinstance(app_ui_model, dict) else None
        refs: dict[str, str] = {}
        if not isinstance(slots, list):
            return refs
        for entry in slots:
            if not isinstance(entry, dict):
                continue
            target = entry.get("target")
            if not isinstance(target, dict) or target.get("type") != "layout_slot":
                continue
            slot_ref = target.get("slotRef")
            node_ref = entry.get("nodeRef")
            if not isinstance(slot_ref, str) or not slot_ref:
                continue
            if not isinstance(node_ref, str) or not node_ref:
                node_ref = slot_ref
            path = layout_index["node_ref_to_path"].get(node_ref)
            if (
                path is None
                or layout_index["path_to_node_type"].get(path) != "slot"
                or path in refs
            ):
                continue
            refs[path] = slot_ref
        return refs

    @classmethod
    def _runtime_slot_target(
        cls,
        runtime_slot_id: Any,
        *,
        layout_index: dict[str, dict[str, str]],
        layout_slot_refs: dict[str, str],
        plugin_slot_targets: dict[tuple[str, str], dict[str, str]],
    ) -> dict[str, str] | None:
        if not isinstance(runtime_slot_id, str):
            return None
        if runtime_slot_id.startswith(RUNTIME_LAYOUT_SLOT_PREFIX):
            encoded_path = runtime_slot_id[len(RUNTIME_LAYOUT_SLOT_PREFIX) :]
            path = cls._decode_runtime_id_part(encoded_path)
            if (
                path is None
                or layout_index["path_to_node_type"].get(path) != "slot"
            ):
                return None
            node_ref = layout_index["path_to_node_ref"].get(path)
            if (
                node_ref is None
                or layout_index["node_ref_to_path"].get(node_ref) != path
            ):
                return None
            slot_ref = layout_slot_refs.get(path, node_ref)
            return (
                None if slot_ref is None else {"type": "layout_slot", "slotRef": slot_ref}
            )

        if not runtime_slot_id.startswith(RUNTIME_PLUGIN_SLOT_PREFIX):
            return None
        parts = runtime_slot_id.split(":")
        if len(parts) != 3 or parts[0] != "plugin":
            return None
        parent_instance_id = cls._decode_runtime_id_part(parts[1])
        local_slot = cls._decode_runtime_id_part(parts[2])
        if not parent_instance_id or not local_slot:
            return None
        # The target must already exist in the same current composition
        # snapshot. Never manufacture a Plugin Slot from the Runtime ID alone.
        return plugin_slot_targets.get((parent_instance_id, local_slot))

    @classmethod
    def _project_runtime_layout_result(
        cls,
        result: dict[str, Any],
        *,
        project: dict[str, Any],
        layout_index: dict[str, dict[str, str]],
    ) -> tuple[dict[str, Any], int, int]:
        layout_slot_refs = cls._authoring_layout_slot_refs(project, layout_index)
        plugin_slot_targets = cls._authoring_plugin_slot_targets(project)
        projected = dict(result)
        unmapped_layout_node_count = 0
        projected_layout_nodes: list[dict[str, Any]] = []
        for item in result.get("layoutNodes") or []:
            if not isinstance(item, dict):
                continue
            node_ref = cls._runtime_layout_node_ref(item.get("nodeId"), layout_index)
            if node_ref is None:
                unmapped_layout_node_count += 1
                continue
            projected_layout_nodes.append(
                {
                    "nodeRef": node_ref,
                    **(
                        {"type": item["type"]}
                        if "type" in item
                        else {}
                    ),
                    **(
                        {"rect": item["rect"]}
                        if "rect" in item
                        else {}
                    ),
                }
            )

        unmapped_slot_count = 0
        projected_slots: list[dict[str, Any]] = []
        for item in result.get("slots") or []:
            if not isinstance(item, dict):
                continue
            target = cls._runtime_slot_target(
                item.get("slotId"),
                layout_index=layout_index,
                layout_slot_refs=layout_slot_refs,
                plugin_slot_targets=plugin_slot_targets,
            )
            if target is None:
                unmapped_slot_count += 1
                continue
            projected_slots.append(
                {
                    "target": target,
                    **(
                        {"widthClass": item["widthClass"]}
                        if "widthClass" in item
                        else {}
                    ),
                    **(
                        {"rect": item["rect"]}
                        if "rect" in item
                        else {}
                    ),
                }
            )

        projected["layoutNodes"] = projected_layout_nodes
        projected["slots"] = projected_slots
        return projected, unmapped_layout_node_count, unmapped_slot_count

    async def inspect_layout(
        self,
        *,
        instance_ids: list[str] | None = None,
        node_refs: list[str] | None = None,
    ) -> dict[str, Any]:
        instance_ids = self._validate_layout_filter(
            instance_ids,
            field_name="instanceIds",
        )
        node_refs = self._validate_layout_filter(
            node_refs,
            field_name="nodeRefs",
        )
        project = await self.project_control.inspect_ui_project(view="composition")
        current_hash = self._current_hash(project)
        layout_index = self._build_authoring_layout_index(project)
        if node_refs is not None:
            missing_refs = [
                node_ref
                for node_ref in node_refs
                if node_ref not in layout_index["node_ref_to_path"]
            ]
            if missing_refs:
                raise RuntimeLayoutReferenceError(
                    "nodeRefs contains a reference that is not valid for the "
                    "current AppUIModel observation."
                )
        layout_node_ids = (
            None
            if node_refs is None
            else [
                self._runtime_layout_node_id_for_path(
                    layout_index["node_ref_to_path"][node_ref]
                )
                for node_ref in node_refs
            ]
        )
        raw_result = self.store.inspect_runtime_layout(
            thread_id=self.thread_id or "",
            current_app_ui_model_hash=current_hash,
            last_mutation_at=self.activity.last_mutation_at,
            instance_ids=instance_ids,
            layout_node_ids=layout_node_ids,
        )
        result, unmapped_layout_node_count, unmapped_slot_count = (
            self._project_runtime_layout_result(
                raw_result,
                project=project,
                layout_index=layout_index,
            )
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
                    "requestedNodeRefCount": (
                        0 if node_refs is None else len(node_refs)
                    ),
                    "unmappedLayoutNodeCount": unmapped_layout_node_count,
                    "unmappedSlotCount": unmapped_slot_count,
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
        nodeRefs: RuntimeLayoutFilter = None,
    ) -> str:
        """Inspect bounded, current-hash Runtime layout geometry after the frontend has rendered. Use this for explicit visible spacing, gap, alignment, size, position, overlap, or adjacency questions. It accepts only optional instanceIds and Authoring Layout nodeRefs filters; it cannot evaluate arbitrary selectors, JavaScript, HTML, or CSS. runtimeStatus=available with compositionFresh=true is fresh geometry evidence. If geometry is stale or unavailable, do not claim visual verification."""
        try:
            result = await service.inspect_layout(
                instance_ids=instanceIds,
                node_refs=nodeRefs,
            )
            return json.dumps(
                {"ok": True, "result": result},
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            )
        except RuntimeLayoutReferenceError as error:
            return json.dumps(
                {
                    "ok": False,
                    "error": {
                        "code": error.code,
                        "message": str(error),
                    },
                },
                ensure_ascii=False,
                separators=(",", ":"),
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
