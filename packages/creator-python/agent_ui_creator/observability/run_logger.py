from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping


CREATOR_DIAGNOSTIC_LOG_SCHEMA_VERSION = 1
_SECRET_KEY = re.compile(
    r"(?:^(?:authorization|cookie|password|secret|token)$|(?:^|[_-])(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)$)",
    re.IGNORECASE,
)
_BEARER = re.compile(r"\bBearer\s+[A-Za-z0-9._~+/=-]+", re.IGNORECASE)
_OPENAI_KEY = re.compile(r"\bsk-[A-Za-z0-9_-]{12,}")
_TOOL_OBSERVATION_EVENT = "creator_tool_observation"
_TOOL_OBSERVATION_PHASES = frozenset(
    {"before_first_mutation", "after_first_mutation"}
)
_FILESYSTEM_TOOL_NAMES = frozenset({"read_file", "ls", "glob", "grep"})


def _safe_segment(value: str) -> str:
    normalized = re.sub(r"[^A-Za-z0-9._-]+", "-", value).strip("-")[:80]
    return normalized or "run"


def _redact(value: Any, key: str = "") -> Any:
    if _SECRET_KEY.search(key):
        return "[REDACTED]"
    if isinstance(value, str):
        return _OPENAI_KEY.sub("sk-[REDACTED]", _BEARER.sub("Bearer [REDACTED]", value))[:50_000]
    if isinstance(value, Mapping):
        return {str(item_key): _redact(item, str(item_key)) for item_key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(item) for item in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)


def _sanitized_tool_arguments(
    tool_name: str, arguments: Mapping[str, Any]
) -> dict[str, object]:
    """Keep only stable, non-content fields for a tool trajectory event."""

    if tool_name == "inspect_ui_project":
        view = arguments.get("view")
        return {"view": view} if isinstance(view, str) else {}
    if tool_name == "inspect_ui_plugin":
        plugin_id = arguments.get("pluginId")
        return {"pluginId": plugin_id} if isinstance(plugin_id, str) else {}
    if tool_name == "inspect_ui_plugin_source_references":
        plugin_id = arguments.get("pluginId")
        return {"pluginId": plugin_id} if isinstance(plugin_id, str) else {}
    if tool_name == "inspect_ui_slots":
        result: dict[str, object] = {}
        target = arguments.get("target")
        if isinstance(target, Mapping):
            target_fields = {
                key: target[key]
                for key in ("type", "slotRef", "parentInstanceId", "slot")
                if isinstance(target.get(key), str)
            }
            if target_fields:
                result["target"] = target_fields
        if "appUIModelHash" in arguments:
            result["hasAppUIModelHash"] = isinstance(
                arguments.get("appUIModelHash"), str
            )
        return result
    if tool_name in _FILESYSTEM_TOOL_NAMES:
        key = "file_path" if tool_name == "read_file" else "path"
        if tool_name == "glob":
            key = "pattern"
        value = arguments.get(key)
        return {key: value} if isinstance(value, str) else {}
    if tool_name == "mutate_app_ui_model":
        operations = arguments.get("operations")
        operation_types = [
            operation.get("type")
            for operation in operations
            if isinstance(operation, Mapping)
            and isinstance(operation.get("type"), str)
        ] if isinstance(operations, (list, tuple)) else []
        return {
            "operationCount": len(operation_types),
            "operationTypes": operation_types,
        }
    if tool_name in {
        "create_ui_plugin",
        "mutate_ui_plugin_source",
        "prepare_ui_service_contract_change",
        "create_ui_service_contract",
        "mutate_ui_service_contract",
    }:
        for key in ("pluginId", "serviceName", "service_name"):
            value = arguments.get(key)
            if isinstance(value, str):
                return {key: value}
        return {}
    if tool_name == "apply_agent_ui_source_item":
        item_id = arguments.get("itemId")
        return {"itemId": item_id} if isinstance(item_id, str) else {}
    return {}


def _filesystem_fact_kinds(arguments: Mapping[str, Any]) -> list[str]:
    value = next(
        (
            arguments.get(key)
            for key in ("file_path", "path", "pattern")
            if isinstance(arguments.get(key), str)
        ),
        None,
    )
    if not isinstance(value, str):
        return ["filesystem.observation"]
    root = value.lstrip("/").split("/", 1)[0]
    return {
        "plugins": ["plugin.source"],
        "services": ["service.contract"],
        "agent-ui": ["agent-ui.source"],
        "agent-contract": ["agent-contract.source"],
        "skills": ["skill.instructions"],
    }.get(root, ["filesystem.observation"])


def _tool_fact_kinds(
    tool_name: str, arguments: Mapping[str, Any]
) -> list[str]:
    if tool_name == "inspect_ui_project":
        return (
            ["composition.snapshot", "capability.summary", "service.readiness"]
            if arguments.get("view") == "composition"
            else ["project.snapshot"]
        )
    return {
        "inspect_app_ui_model": ["composition.model"],
        "list_ui_plugins": ["capability.inventory"],
        "inspect_ui_slots": ["composition.slots"],
        "inspect_ui_plugin": ["plugin.manifest"],
        "inspect_ui_services": ["service.readiness"],
        "inspect_ui_plugin_source_references": ["plugin.source.references"],
        "inspect_agent_ui_sources": ["agent-ui.source.inventory"],
        "verify_runtime_composition": ["runtime.verification"],
        "mutate_app_ui_model": ["composition.commit"],
    }.get(tool_name, _filesystem_fact_kinds(arguments) if tool_name in _FILESYSTEM_TOOL_NAMES else [])


def _tool_result_status(
    result: Any = None, error: BaseException | None = None
) -> tuple[str, str | None]:
    if error is not None:
        code = getattr(error, "code", None)
        return "error", code if isinstance(code, str) else None
    payload: Mapping[str, Any] | None = None
    if isinstance(result, Mapping):
        payload = result
    else:
        content = getattr(result, "content", result)
        if isinstance(content, str):
            try:
                value = json.loads(content)
            except (TypeError, ValueError):
                value = None
            if isinstance(value, Mapping):
                payload = value
    if payload is not None:
        nested_error = payload.get("error")
        code = (
            nested_error.get("code")
            if isinstance(nested_error, Mapping)
            else payload.get("code")
        )
        if payload.get("ok") is False or nested_error is not None:
            return "rejected", code if isinstance(code, str) else None
        status = payload.get("status")
        if status in {"error", "failed"}:
            return "error", code if isinstance(code, str) else None
    if getattr(result, "status", None) in {"error", "failed"}:
        return "error", None
    if getattr(result, "error", None):
        return "rejected", None
    return "success", None


class CreatorRunLogger:
    def __init__(self, project_root: str | Path) -> None:
        self.project_root = Path(project_root).resolve()
        self.run_id = "unstarted"
        self.thread_id: str | None = None
        self.sequence = 0
        self.path: Path | None = None
        self.agent_mode = "domain-write"
        self._finished = False

    def begin(
        self,
        *,
        run_id: str,
        thread_id: str | None = None,
        agent_mode: str = "domain-write",
    ) -> None:
        self.run_id = run_id
        self.thread_id = thread_id
        self.agent_mode = agent_mode
        self.sequence = 0
        self._finished = False
        try:
            directory = self.project_root / ".agentuicreator" / "logs"
            resolved_directory = directory.resolve(strict=False)
            resolved_directory.relative_to(self.project_root.resolve(strict=True))
            directory.mkdir(parents=True, exist_ok=True)
            directory.resolve(strict=True).relative_to(self.project_root.resolve(strict=True))
            gitignore = directory.parent / ".gitignore"
            try:
                with gitignore.open("x", encoding="utf-8", newline="") as stream:
                    stream.write("*\n")
            except FileExistsError:
                pass
            timestamp = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
            timestamp = timestamp.replace("+00:00", "Z").replace(":", "-").replace(".", "-")
            self.path = directory / f"{timestamp}_{_safe_segment(run_id)}.jsonl"
            self.record(
                "run_started",
                {"runtime": "python", "agentMode": self.agent_mode},
            )
        except (OSError, ValueError):
            self.path = None

    def reference(self) -> dict[str, object] | None:
        if self.path is None:
            return None
        return {
            "format": "jsonl",
            "path": self.path.relative_to(self.project_root).as_posix(),
            "schemaVersion": CREATOR_DIAGNOSTIC_LOG_SCHEMA_VERSION,
        }

    def record(self, event_type: str, data: Mapping[str, object]) -> None:
        if self.path is None:
            return
        self.sequence += 1
        entry = {
            "schemaVersion": CREATOR_DIAGNOSTIC_LOG_SCHEMA_VERSION,
            "sequence": self.sequence,
            "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
            "type": event_type,
            "runId": self.run_id,
            **({"threadId": self.thread_id} if self.thread_id is not None else {}),
            "data": _redact(data),
        }
        try:
            with self.path.open("a", encoding="utf-8", newline="") as stream:
                stream.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
        except OSError:
            self.path = None

    def record_tool_observation(
        self,
        *,
        model_call_sequence: int,
        tool_name: str,
        phase: str,
        arguments: Mapping[str, Any],
        result: Any = None,
        error: BaseException | None = None,
    ) -> None:
        normalized_phase = (
            phase if phase in _TOOL_OBSERVATION_PHASES else "before_first_mutation"
        )
        status, code = _tool_result_status(result, error)
        self.record(
            _TOOL_OBSERVATION_EVENT,
            {
                "modelCallSequence": max(0, int(model_call_sequence)),
                "toolName": tool_name,
                "phase": normalized_phase,
                "arguments": _sanitized_tool_arguments(tool_name, arguments),
                "result": {
                    "status": status,
                    "code": code,
                    "factKinds": _tool_fact_kinds(tool_name, arguments),
                },
            },
        )

    def finish(
        self,
        outcome: str,
        *,
        metrics: Mapping[str, object] | None = None,
        mutation_metrics: Mapping[str, object] | None = None,
        change_layer_metrics: Mapping[str, object] | None = None,
        composition_fast_path_metrics: Mapping[str, object] | None = None,
        project_control_metrics: Mapping[str, object] | None = None,
        error: BaseException | None = None,
    ) -> None:
        if self._finished:
            return
        self._finished = True
        self.record(
            "run_finished",
            {
                "runtime": "python",
                "agentMode": self.agent_mode,
                "status": outcome,
                "outcome": outcome,
                "modelToolMetrics": dict(metrics) if metrics is not None else {},
                **(dict(mutation_metrics) if mutation_metrics is not None else {}),
                **(
                    {"mutationMetrics": dict(mutation_metrics)}
                    if mutation_metrics is not None
                    else {}
                ),
                **(
                    {"changeLayer": dict(change_layer_metrics)}
                    if change_layer_metrics is not None
                    else {}
                ),
                **(
                    {"changeLayerMetrics": dict(change_layer_metrics)}
                    if change_layer_metrics is not None
                    else {}
                ),
                **(
                    {
                        "compositionFastPath": dict(
                            composition_fast_path_metrics
                        )
                    }
                    if composition_fast_path_metrics is not None
                    else {}
                ),
                **(
                    {"projectControlMetrics": dict(project_control_metrics)}
                    if project_control_metrics is not None
                    else {}
                ),
                **({"error": str(error)} if error is not None else {}),
            },
        )
