from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.tools import BaseTool, tool
from pydantic import ValidationError

from .models import MutateUIPluginSourceInput, PluginSourceMutationError
from .plugin_mutation_service import UIPluginSourceMutationService


logger = logging.getLogger(__name__)
MAX_PLUGIN_MUTATION_TOOL_RESULT_CHARACTERS = 12_000


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _error(code: str, message: str, details: Any = None) -> str:
    rendered = _json(
        {
            "ok": False,
            "error": {
                "code": code,
                "message": message,
                **({"details": details} if details is not None else {}),
            },
        }
    )
    if len(rendered) <= MAX_PLUGIN_MUTATION_TOOL_RESULT_CHARACTERS:
        return rendered
    return _json(
        {
            "ok": False,
            "error": {
                "code": code,
                "message": "Plugin source mutation error details exceeded the tool limit.",
            },
        }
    )


def mutate_ui_plugin_source_tool(service: UIPluginSourceMutationService) -> BaseTool:
    @tool(
        "mutate_ui_plugin_source",
        args_schema=MutateUIPluginSourceInput,
        description=(
            "Atomically modify source inside exactly one existing UI Plugin. Use it "
            "when one resolved change spans multiple Plugin files or combines edits "
            "to existing files with new Plugin-local files. Every edit target must "
            "have been read in the current run. Changes support only exact text edit "
            "and create-only operations; deletion, rename, move, and cross-Plugin "
            "paths are forbidden."
        ),
    )
    async def mutate_ui_plugin_source(
        pluginId: str, changes: list[dict[str, Any]]
    ) -> str:
        try:
            request = MutateUIPluginSourceInput.model_validate(
                {"pluginId": pluginId, "changes": changes}
            )
            result = await service.mutate(request.pluginId, request.changes)
            return _json({"ok": True, "result": result.to_dict()})
        except ValidationError as error:
            return _error("PLUGIN_SOURCE_MUTATION_INPUT_INVALID", str(error))
        except PluginSourceMutationError as error:
            return _error(error.code, str(error), error.details)
        except Exception:
            logger.exception("Unexpected Plugin source mutation failure")
            return _error(
                "PLUGIN_SOURCE_MUTATION_FAILED",
                "The Creator Host could not mutate the requested Plugin source.",
            )

    return mutate_ui_plugin_source

