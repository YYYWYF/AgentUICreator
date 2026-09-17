from __future__ import annotations

import json
from typing import Literal

from langchain_core.tools import BaseTool, tool

from .service import CreatorValidationService


def create_validation_tool(service: CreatorValidationService) -> BaseTool:
    @tool("validate_creator_changes")
    async def validate_creator_changes(
        mode: Literal["delta", "clean"] = "delta",
    ) -> str:
        """Validate the current revision; delta rejects newly introduced errors, clean requires no TypeScript errors."""
        result = await service.validate(mode=mode)
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
