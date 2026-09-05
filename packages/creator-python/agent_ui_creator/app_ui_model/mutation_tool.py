from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from langchain_core.tools import BaseTool, tool

from .mutation_models import (
    MAX_MUTATION_RESULT_CHARACTERS,
    AppUIModelMutationError,
)
from .mutation_service import AppUIModelMutationService

logger = logging.getLogger(__name__)


def load_app_ui_model_mutation_tool_schema() -> dict[str, Any]:
    repository_root = Path(__file__).resolve().parents[4]
    contract_path = (
        repository_root / "contracts" / "creator" / "app-ui-model-operation.schema.json"
    )
    try:
        operation_contract = json.loads(contract_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("AppUIModel operation contract is unavailable.") from error
    operation_schema = {
        key: value
        for key, value in operation_contract.items()
        if key not in {"$schema", "$id", "$defs", "title"}
    }
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["appUIModelHash", "operations"],
        "properties": {
            "appUIModelHash": {
                "type": "string",
                "pattern": "^[a-f0-9]{64}$",
                "description": (
                    "Exact SHA-256 hash returned by inspect_ui_project or "
                    "inspect_app_ui_model."
                ),
            },
            "operations": {
                "type": "array",
                "minItems": 1,
                "maxItems": 100,
                "items": operation_schema,
            },
        },
        "$defs": operation_contract.get("$defs", {}),
    }


APP_UI_MODEL_MUTATION_TOOL_SCHEMA = load_app_ui_model_mutation_tool_schema()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _bounded_error(code: str, message: str, details: Any = None) -> str:
    value = {
        "ok": False,
        "error": {
            "code": code,
            "message": message,
            **({"details": details} if details is not None else {}),
        },
    }
    rendered = _json(value)
    if len(rendered) <= MAX_MUTATION_RESULT_CHARACTERS:
        return rendered
    return _json(
        {
            "ok": False,
            "error": {
                "code": code,
                "message": "AppUIModel mutation error details exceeded the tool limit.",
                "details": {
                    "limitChars": MAX_MUTATION_RESULT_CHARACTERS,
                    "resultChars": len(rendered),
                },
            },
        }
    )


def create_app_ui_model_mutation_tool(
    service: AppUIModelMutationService,
) -> BaseTool:
    @tool(
        "mutate_app_ui_model",
        args_schema=APP_UI_MODEL_MUTATION_TOOL_SCHEMA,
        description=(
            "Atomically apply one or more semantic AppUIModel operations using the exact "
            "hash returned by ProjectControl inspection. Use this instead of direct edits "
            "for layout, Slots, PluginInstances, enabling, mounting, moving, replacing, or "
            "removing composition. A hash conflict requires a fresh inspection; do not "
            "retry with the same hash. Success is a static composition commit only, not "
            "runtime or Host validation."
        ),
    )
    async def mutate_app_ui_model(
        appUIModelHash: str, operations: list[dict[str, Any]]
    ) -> str:
        try:
            result = await service.mutate(
                app_ui_model_hash=appUIModelHash,
                operations=operations,
            )
            rendered = _json({"ok": True, "result": result.to_dict()})
            if len(rendered) <= MAX_MUTATION_RESULT_CHARACTERS:
                return rendered
            return _bounded_error(
                "APP_UI_MODEL_MUTATION_RESULT_TOO_LARGE",
                f"Mutation result exceeds {MAX_MUTATION_RESULT_CHARACTERS} characters.",
                {
                    "limitChars": MAX_MUTATION_RESULT_CHARACTERS,
                    "resultChars": len(rendered),
                },
            )
        except AppUIModelMutationError as error:
            return _bounded_error(error.code, str(error), error.details)
        except Exception as error:
            logger.exception("Unexpected AppUIModel mutation failure")
            return _bounded_error(
                "APP_UI_MODEL_MUTATION_FAILED",
                "The Creator Host could not complete the AppUIModel mutation.",
            )

    return mutate_app_ui_model
