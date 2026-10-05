from __future__ import annotations

import json
from typing import Literal

from langchain_core.tools import BaseTool, tool

from ..project_control.errors import ProjectControlError
from .service import CreatorValidationService


def create_validation_tool(service: CreatorValidationService) -> BaseTool:
    last_key: tuple[object, ...] | None = None

    @tool("validate_creator_changes")
    async def validate_creator_changes(
        mode: Literal["delta", "clean"] = "delta",
    ) -> str:
        """Validate current revision completion and regressions. Unrelated pre-existing diagnostics remain workspace warnings. Use inspect_static_diagnostics for explicit static debugging discovery. Delta rejects introduced errors; clean requires zero TypeScript errors and is only for an explicit clean-workspace request. For an explicit existing-error repair, discover and select the requested debuggingTargetId first. Targets persist across revisions and do not authorize writes or expand scope."""
        nonlocal last_key
        service._synchronize_run_state()
        service.debugging.validation_reads += 1
        previous = service.current_result()
        key = (service.activity.run_id, service.activity.revision, mode)
        duplicate = previous is not None and previous.status != "stale" and key == last_key
        try:
            result = previous if duplicate else await service.validate(mode=mode)
            if mode == "clean":
                service.debugging.clean_requested = True
        except ValueError as error:
            return json.dumps({"ok": False, "error": {
                "code": "DEBUGGING_TARGET_INVALID", "message": str(error),
            }})
        except ProjectControlError as error:
            return json.dumps({
                "ok": False,
                "error": {
                    "code": error.code,
                    "message": str(error),
                    "details": error.details,
                },
            }, ensure_ascii=False, separators=(",", ":"))
        last_key = (service.activity.run_id, result.revision, mode)
        if duplicate:
            service.debugging.duplicates += 1
        evidence = result.to_dict()
        if duplicate:
            evidence.update({"code": "DIAGNOSTIC_ALREADY_OBSERVED", "reusePreviousResult": True})
        differential = result.differential
        if differential is not None:
            evidence["diagnosticIdentities"] = [
                {**service.debugging.static_identity(item),
                 "debuggingTargetId": "ts:" + service.debugging.static_key(item)} for item in differential.current_diagnostics[:8]
            ]
        evidence["debuggingMetrics"] = service.metrics()["debuggingMetrics"]
        priority = (
            "revision", "status", "validationMode", "differentialStatus",
            "newDiagnostics", "failureSemantics",
        )
        ordered = {key: evidence[key] for key in priority if key in evidence}
        failure = evidence.get("failureSemantics")
        if (
            result.status == "failed"
            and isinstance(failure, dict)
            and failure.get("automaticRepairAllowed") is True
            and evidence.get("newDiagnostics")
        ):
            ordered["repairGuidance"] = (
                "Repair the listed introduced diagnostics in their named files, "
                "then validate the current revision again. Use these paths and "
                "messages before searching other source files."
            )
        ordered["debuggingGuidance"] = (
            "Use current diagnostics and named owner files before broader discovery. "
            "Delta pass alone does not resolve a requested existing error: use inspect_static_diagnostics and select only "
            "the requested debuggingTargetId with select_debugging_target before mutation. If multiple targets are plausible, ask_user_question. Confirm selected targets disappear. "
            "Unrelated unchanged errors remain workspace warnings. Scope Guard still controls writes."
        ) if differential is not None and differential.current_diagnostics else (
            "Reuse current evidence; do not repeat diagnostics without a revision change."
        )
        ordered.update({
            key: value for key, value in evidence.items()
            if key not in ordered and key != "checks"
        })
        if "checks" in evidence:
            ordered["checks"] = evidence["checks"]
        return json.dumps(
            {
                "ok": True,
                "result": {
                    **ordered,
                    **service.repair_state.to_dict(),
                },
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    return validate_creator_changes


def create_static_diagnostic_tool(service: CreatorValidationService) -> BaseTool:
    validation = create_validation_tool(service)

    @tool("inspect_static_diagnostics")
    async def inspect_static_diagnostics() -> str:
        """Discover current static debugging targets using Host TypeScript validation evidence. Select the requested debuggingTargetId before repair; read the owner before or after selection. If several targets are plausible, ask_user_question. Discovery grants no write permission."""
        payload = json.loads(await validation.ainvoke({"mode": "delta"}))
        if payload.get("ok") is not True:
            return json.dumps(payload, ensure_ascii=False)
        current = service.current_result()
        differential = None if current is None else current.differential
        if differential is not None and differential.current_available:
            delivered = json.dumps(payload["result"])
            service.debugging.observe_static_targets(
                [item for item in differential.current_diagnostics
                 if "ts:" + service.debugging.static_key(item) in delivered], current.revision,
            )
        payload["result"]["debuggingMetrics"] = service.metrics()["debuggingMetrics"]
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))

    return inspect_static_diagnostics
