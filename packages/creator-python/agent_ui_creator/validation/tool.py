from __future__ import annotations

import json

from langchain_core.tools import BaseTool, tool

from .service import CreatorValidationService


def create_validation_tool(service: CreatorValidationService) -> BaseTool:
    @tool("validate_creator_changes")
    async def validate_creator_changes() -> str:
        """Run only the Host-owned verify:ui and typecheck checks for the current mutation revision. Results are cached only for that exact revision; ordinary compile failures are returned as failed validation evidence, not tool execution errors."""
        result = await service.validate()
        return json.dumps(
            {
                "ok": True,
                "result": {
                    **result.to_dict(),
                    **service.repair_state.to_dict(),
                },
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )

    return validate_creator_changes
