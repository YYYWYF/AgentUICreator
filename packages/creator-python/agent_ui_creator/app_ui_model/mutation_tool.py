from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from langchain_core.tools import BaseTool, tool

from ..domain_state import DomainObservationContext, DomainObservationError
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
        "required": ["operations"],
        "properties": {
            "appUIModelHash": {
                "type": "string",
                "pattern": "^[a-f0-9]{64}$",
                "description": (
                    "Optional compatibility value. The Creator Host owns the current "
                    "observed hash and verifies this value against its observation."
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
    observations: DomainObservationContext,
) -> BaseTool:
    @tool(
        "mutate_app_ui_model",
        args_schema=APP_UI_MODEL_MUTATION_TOOL_SCHEMA,
        description=(
            "Atomically apply semantic AppUIModel operations using the Creator Host's most "
            "recent valid AppUIModel observation. Inspect current ProjectControl state "
            "before the first mutation, but do not repeat inspection solely to refresh the "
            "hash. Use this instead of direct edits for layout, Slots, PluginInstances, "
            "enabling, mounting, moving, replacing, or removing composition. If the Host "
            "reports APP_UI_MODEL_OBSERVATION_REQUIRED or APP_UI_MODEL_HASH_CONFLICT, "
            "inspect again before retrying. Success is a static composition commit only, "
            "not runtime or Host validation."
        ),
    )
    async def mutate_app_ui_model(
        operations: list[dict[str, Any]], appUIModelHash: str | None = None
    ) -> str:
        try:
            observed_hash = observations.require_app_ui_model_hash(
                current_revision=service.activity.revision
            )
            if appUIModelHash is not None:
                observations.verify_explicit_hash(
                    appUIModelHash,
                    observed_hash=observed_hash,
                )
            result = await service.mutate(
                app_ui_model_hash=observed_hash,
                operations=operations,
            )
            observations.observe_app_ui_model(
                hash=result.target_result["appUIModel"]["afterHash"],
                revision=service.activity.revision,
                source="mutation_result",
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
        except DomainObservationError as error:
            return _bounded_error(error.code, str(error), error.details)
        except AppUIModelMutationError as error:
            observations.invalidate_app_ui_model(reason=error.code)
            return _bounded_error(error.code, str(error), error.details)
        except Exception as error:
            logger.exception("Unexpected AppUIModel mutation failure")
            return _bounded_error(
                "APP_UI_MODEL_MUTATION_FAILED",
                "The Creator Host could not complete the AppUIModel mutation.",
            )

    return mutate_app_ui_model
