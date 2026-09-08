from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.tools import BaseTool, tool
from pydantic import ValidationError

from .models import CreateUISourceFilesInput, SourceCreationError
from .source_creation_service import UISourceCreationService


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
                "message": "Source creation error details exceeded the tool limit.",
            },
        }
    )


def create_ui_source_files_tool(service: UISourceCreationService) -> BaseTool:
    @tool(
        "create_ui_source_files",
        args_schema=CreateUISourceFilesInput,
        description=(
            "Create all currently known new UI Plugin or Service source files in one "
            "create-only atomic operation. Paths are limited to /plugins/** and "
            "/services/**. Existing files, app-ui/**, runtime/**, framework/**, "
            "node_modules/**, environment files, and plugins/registry.generated.ts "
            "cannot be created or overwritten. Use read_file plus edit_file for an "
            "existing source file. The result returns paths and mutation revision, "
            "not the source content."
        ),
    )
    async def create_ui_source_files(files: list[dict[str, str]]) -> str:
        try:
            request = CreateUISourceFilesInput.model_validate({"files": files})
            result = await service.create(request.files)
            return _json({"ok": True, "result": result.to_dict()})
        except ValidationError as error:
            return _error("SOURCE_CREATION_INPUT_INVALID", str(error))
        except SourceCreationError as error:
            return _error(error.code, str(error), error.details)
        except Exception:
            logger.exception("Unexpected source creation failure")
            return _error(
                "SOURCE_CREATION_FAILED",
                "The Creator Host could not create the requested source files.",
            )

    return create_ui_source_files
