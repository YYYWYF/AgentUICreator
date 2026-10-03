from __future__ import annotations

import json
from typing import Literal

from langchain_core.tools import BaseTool, tool

from ..project_control.errors import ProjectControlError
from .service import CreatorValidationService


def create_validation_tool(service: CreatorValidationService) -> BaseTool:
    @tool("validate_creator_changes")
    async def validate_creator_changes(
        mode: Literal["delta", "clean"] = "delta",
    ) -> str:
        """Validate the current revision; delta rejects newly introduced errors, clean requires no TypeScript errors."""
        try:
            result = await service.validate(mode=mode)
        except ProjectControlError as error:
            return json.dumps({
                "ok": False,
                "error": {
                    "code": error.code,
                    "message": str(error),
                    "details": error.details,
                },
            }, ensure_ascii=False, separators=(",", ":"))
        evidence = result.to_dict()
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
