"""Host-owned execution authority for a Selector removal decision."""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, Iterator, Literal, Mapping

RemovalIntent = Literal["none", "hide", "purge", "uncertain"]
_CURRENT: ContextVar[RemovalIntent] = ContextVar("creator_removal_intent", default="none")


class RemovalIntentViolation(ValueError):
    code = "PLUGIN_REMOVAL_INTENT_VIOLATION"


def assert_removal_mutation(intent: RemovalIntent, name: str, arguments: Mapping[str, Any]) -> None:
    if intent == "none":
        return
    if intent == "purge" and name == "purge_ui_plugin":
        return
    if intent == "hide" and name == "mutate_app_ui_model":
        operations = arguments.get("operations")
        if (arguments.get("featureRemoval", False) is False
                and isinstance(operations, list) and len(operations) > 0
                and all(isinstance(operation, dict)
                        and set(operation) == {"type", "instanceId", "enabled"}
                        and operation["type"] == "set_plugin_enabled"
                        and operation["enabled"] is False
                        and isinstance(operation["instanceId"], str)
                        and bool(operation["instanceId"].strip()) for operation in operations)):
            return
    raise RemovalIntentViolation(f"{intent} removal does not authorize {name} or these operations.")


def assert_removal_question(arguments: Mapping[str, Any]) -> None:
    steps = arguments.get("steps")
    if isinstance(steps, list) and len(steps) == 1 and isinstance(steps[0], dict):
        step = steps[0]
        options = step.get("options")
        if (step.get("id") == "plugin-removal" and step.get("selectionMode") == "single"
                and step.get("minSelections") == 1 and step.get("maxSelections") == 1
                and isinstance(options, list) and len(options) == 2
                and all(isinstance(option, dict) for option in options)
                and {option.get("id") for option in options} == {"hide", "purge"}):
            return
    raise RemovalIntentViolation("Uncertain removal requires the single hide/purge plugin-removal question.")


def assert_current_removal_mutation(name: str, arguments: Mapping[str, Any]) -> None:
    assert_removal_mutation(_CURRENT.get(), name, arguments)


@contextmanager
def bind_removal_intent(intent: RemovalIntent) -> Iterator[None]:
    token = _CURRENT.set(intent)
    try:
        yield
    finally:
        _CURRENT.reset(token)
