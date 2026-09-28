from __future__ import annotations

from typing import Any

from langchain_core.tools import tool
from langgraph.types import interrupt

from .models import QuestionAnswers, QuestionRequest, QuestionStep


@tool("ask_user_question", args_schema=QuestionRequest)
def ask_user_question(steps: list[QuestionStep], schemaVersion: int = 1) -> dict[str, Any]:
    """Ask the user to decide a material ambiguity before continuing work."""
    request = QuestionRequest(schemaVersion=schemaVersion, steps=steps)
    answer = interrupt({
        "kind": "ask_user_question",
        **request.model_dump(mode="json", exclude_none=True),
    })
    return QuestionAnswers.model_validate(answer).validate_for(request).model_dump(mode="json")
