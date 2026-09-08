from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.tools import BaseTool, tool
from pydantic import ValidationError

from .models import CreateUIPluginInput, SourceCreationError
from .plugin_creation_service import UIPluginCreationService


logger = logging.getLogger(__name__)
MAX_SOURCE_TOOL_RESULT_CHARACTERS = 12_000


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
    if len(rendered) <= MAX_SOURCE_TOOL_RESULT_CHARACTERS:
        return rendered
    return _json(
        {
            "ok": False,
            "error": {
                "code": code,
                "message": "Plugin creation error details exceeded the tool limit.",
            },
        }
    )


def create_ui_plugin_tool(service: UIPluginCreationService) -> BaseTool:
    @tool(
        "create_ui_plugin",
        args_schema=CreateUIPluginInput,
        description=(
            "Create exactly one new UI Plugin in a create-only atomic operation. "
            "Each file uses a relativePath inside /plugins/<pluginId>/. The request "
            "must include manifest.json, definition.ts, and index.tsx; manifest.id "
            "must equal pluginId; and the Plugin directory must not exist. Use "
            "edit_file for one small existing-file change and "
            "mutate_ui_plugin_source for an existing Plugin change spanning files."
        ),
    )
    async def create_ui_plugin(pluginId: str, files: list[dict[str, str]]) -> str:
        try:
            request = CreateUIPluginInput.model_validate(
                {"pluginId": pluginId, "files": files}
            )
            result = await service.create(request.pluginId, request.files)
            return _json({"ok": True, "result": result.to_dict()})
        except ValidationError as error:
            return _error("PLUGIN_CREATION_INPUT_INVALID", str(error))
        except SourceCreationError as error:
            return _error(error.code, str(error), error.details)
        except Exception:
            logger.exception("Unexpected Plugin creation failure")
            return _error(
                "PLUGIN_CREATION_FAILED",
                "The Creator Host could not create the requested Plugin.",
            )

    return create_ui_plugin
