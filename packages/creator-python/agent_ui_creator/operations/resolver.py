from __future__ import annotations

import inspect
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import ValidationError

from ..model_protocol.reliability import create_creator_model_invocation_reliability
from ..model_settings import DEFAULT_CREATOR_MODEL_MAX_RETRIES
from .models import (
    CreatorOperationKind,
    CreatorOperationResolution,
    PluginCapabilityIndex,
)

MAX_RESOLVER_REPAIR_CALLS = 1
MAX_RESOLVER_OUTPUT_TOKENS = 512

_RESOLVER_SYSTEM_PROMPT = """You are the Creator Operation Resolver.

Your only job is to map the user's original request to one operation kind and
the existing Plugin or instance targets. Return the structured schema only.
Do not plan steps, choose tools, read files, name Skills, propose mutations, or
design verification.

Productized operation rules:
- add_existing_plugin: add one existing Plugin using its product default placement.
- remove_plugin: remove one existing Plugin instance; the Host decides deterministic reflow.
- modify_plugin_logic: change behavior inside one identified Plugin's own source.
- general_change: use for custom placement/size, unsupported operations, or broader scope.
- needs_clarification: use when the request is materially ambiguous and ask one concise question.

Preserve the user's request exactly for downstream coding. Only identify intent and targets.
"""


class CreatorOperationResolutionError(RuntimeError):
    """A bounded resolver failure that must not enter the General Agent."""

    code = "RESOLUTION_FAILED"
    details: Any

    def __init__(self, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.details = details


@dataclass(slots=True)
class CreatorOperationResolverMetrics:
    modelCalls: int = 0
    repairCalls: int = 0
    invalidResponses: int = 0

    def to_dict(self) -> dict[str, int]:
        return {
            "operationResolverCalls": self.modelCalls,
            "operationResolverRepairCalls": self.repairCalls,
            "operationResolverInvalidResponses": self.invalidResponses,
        }


class _InvalidResolution(ValueError):
    pass


def _bounded_error(error: BaseException) -> str:
    return str(error).strip()[:500] or error.__class__.__name__


def _coerce_plugin_index(value: PluginCapabilityIndex | Mapping[str, Any]) -> PluginCapabilityIndex:
    if isinstance(value, PluginCapabilityIndex):
        return value
    try:
        return PluginCapabilityIndex.model_validate(value)
    except ValidationError as error:
        raise CreatorOperationResolutionError(
            "Resolver context is not a valid Plugin Capability Index.",
            {"cause": _bounded_error(error)},
        ) from error


class CreatorOperationResolver:
    """Resolve intent and targets with one tool-free structured model call."""

    def __init__(
        self,
        model: Any | None = None,
        *,
        structured_model: Any | None = None,
        max_retries: int = DEFAULT_CREATOR_MODEL_MAX_RETRIES,
        recovery_factory: Callable[[], Any] | None = None,
    ) -> None:
        if model is None and structured_model is None:
            raise ValueError("A model or structured_model is required.")
        self.model = model
        self._structured_model = structured_model
        self._structured_model_supplied = structured_model is not None
        self._invocation_model: Any | None = None
        self._recovery_factory = recovery_factory
        self._invocation_reliability = create_creator_model_invocation_reliability(
            max_retries=max_retries,
            recovery_factory=(
                self._recover_invocation_model if recovery_factory is not None else None
            ),
        )
        self.metrics = CreatorOperationResolverMetrics()

    async def resolve(
        self,
        user_message: str,
        plugin_index: PluginCapabilityIndex | Mapping[str, Any],
    ) -> CreatorOperationResolution:
        if not isinstance(user_message, str) or not user_message.strip():
            raise CreatorOperationResolutionError(
                "The original user message must be a non-empty string."
            )
        normalized_index = _coerce_plugin_index(plugin_index)
        last_error: str | None = None

        for attempt in range(MAX_RESOLVER_REPAIR_CALLS + 1):
            if attempt > 0:
                self.metrics.repairCalls += 1
            try:
                resolution = await self._invoke(
                    user_message=user_message,
                    plugin_index=normalized_index,
                    repair_reason=last_error,
                )
                self.validate_resolution(resolution, normalized_index)
                return resolution
            except _InvalidResolution as error:
                self.metrics.invalidResponses += 1
                last_error = _bounded_error(error)
                if attempt >= MAX_RESOLVER_REPAIR_CALLS:
                    raise CreatorOperationResolutionError(
                        "Creator Operation Resolver returned an invalid resolution.",
                        {
                            "attempts": attempt + 1,
                            "reason": last_error,
                        },
                    ) from error

        raise AssertionError("Resolver loop must return or raise.")

    def validate_resolution(
        self,
        resolution: CreatorOperationResolution,
        plugin_index: PluginCapabilityIndex | Mapping[str, Any],
    ) -> None:
        """Apply Host target and operation policy validation to model output."""

        normalized_index = _coerce_plugin_index(plugin_index)
        plugins_by_id = {plugin.pluginId: plugin for plugin in normalized_index.plugins}
        target_plugin_ids = list(resolution.targetPluginIds)
        target_instance_ids = list(resolution.targetInstanceIds)

        if len(set(target_plugin_ids)) != len(target_plugin_ids):
            raise _InvalidResolution("targetPluginIds must not contain duplicates.")
        if len(set(target_instance_ids)) != len(target_instance_ids):
            raise _InvalidResolution("targetInstanceIds must not contain duplicates.")
        unknown_plugins = [plugin_id for plugin_id in target_plugin_ids if plugin_id not in plugins_by_id]
        if unknown_plugins:
            raise _InvalidResolution(
                f"Unknown target Plugin ids: {', '.join(unknown_plugins)}."
            )

        instances_by_id = {
            instance.instanceId: plugin.pluginId
            for plugin in normalized_index.plugins
            for instance in plugin.instances
        }
        unknown_instances = [
            instance_id
            for instance_id in target_instance_ids
            if instance_id not in instances_by_id
        ]
        if unknown_instances:
            raise _InvalidResolution(
                f"Unknown target instance ids: {', '.join(unknown_instances)}."
            )
        mismatched_instances = [
            instance_id
            for instance_id in target_instance_ids
            if instances_by_id[instance_id] not in target_plugin_ids
        ]
        if mismatched_instances:
            raise _InvalidResolution(
                "Every target instance must belong to a target Plugin."
            )

        self._validate_operation_policy(
            resolution.kind,
            target_plugin_ids=target_plugin_ids,
            target_instance_ids=target_instance_ids,
            plugins_by_id=plugins_by_id,
        )

    @staticmethod
    def _validate_operation_policy(
        kind: CreatorOperationKind,
        *,
        target_plugin_ids: list[str],
        target_instance_ids: list[str],
        plugins_by_id: Mapping[str, Any],
    ) -> None:
        if kind == "add_existing_plugin":
            if len(target_plugin_ids) != 1 or target_instance_ids:
                raise _InvalidResolution(
                    "add_existing_plugin requires exactly one Plugin and no instance target."
                )
            return

        if kind == "remove_plugin":
            if len(target_plugin_ids) != 1:
                raise _InvalidResolution(
                    "remove_plugin requires exactly one target Plugin."
                )
            current_instances = plugins_by_id[target_plugin_ids[0]].instances
            if current_instances and len(target_instance_ids) != 1:
                raise _InvalidResolution(
                    "remove_plugin requires exactly one target instance when the Plugin is mounted."
                )
            if not current_instances and target_instance_ids:
                raise _InvalidResolution(
                    "remove_plugin cannot target an instance when the Plugin is not mounted."
                )
            return

        if kind == "modify_plugin_logic":
            if len(target_plugin_ids) != 1:
                raise _InvalidResolution(
                    "modify_plugin_logic requires exactly one target Plugin."
                )
            return

        if kind == "needs_clarification":
            return

        if kind == "general_change":
            return

        raise _InvalidResolution(f"Unsupported operation kind {kind!r}.")

    async def _invoke(
        self,
        *,
        user_message: str,
        plugin_index: PluginCapabilityIndex,
        repair_reason: str | None,
    ) -> CreatorOperationResolution:
        structured_model = self._get_structured_model()
        messages = self._messages(
            user_message=user_message,
            plugin_index=plugin_index,
            repair_reason=repair_reason,
        )
        self.metrics.modelCalls += 1
        try:
            if self._structured_model_supplied:
                invocation_model = structured_model
                invocation = lambda current_model: current_model.ainvoke(messages)
            else:
                invocation_model = self._invocation_model
                if invocation_model is None:
                    raise CreatorOperationResolutionError(
                        "A resolver invocation model is unavailable."
                    )
                invocation = lambda current_model: self._invoke_bound_structured_model(
                    current_model, messages
                )
            result = await self._invocation_reliability.ainvoke(
                invocation_model,
                invocation,
            )
        except Exception as error:
            raise CreatorOperationResolutionError(
                "Creator Operation Resolver model call failed.",
                {"cause": _bounded_error(error)},
            ) from error

        if isinstance(result, Mapping) and "parsed" in result:
            parsing_error = result.get("parsing_error")
            if parsing_error is not None:
                raise _InvalidResolution(
                    f"Structured resolver output could not be parsed: {_bounded_error(parsing_error)}"
                )
            result = result.get("parsed")
        try:
            return (
                result
                if isinstance(result, CreatorOperationResolution)
                else CreatorOperationResolution.model_validate(result)
            )
        except ValidationError as error:
            raise _InvalidResolution(
                f"Structured resolver output failed schema validation: {_bounded_error(error)}"
            ) from error

    def _get_structured_model(self) -> Any:
        if self._structured_model is not None:
            return self._structured_model
        if self.model is None:
            raise CreatorOperationResolutionError("A resolver model is unavailable.")
        resolver_model = self._model_with_resolver_budget()
        self._invocation_model = resolver_model
        self._structured_model = self._bind_structured_model(resolver_model)
        return self._structured_model

    @staticmethod
    def _bind_structured_model(model: Any) -> Any:
        factory = getattr(model, "with_structured_output", None)
        if not callable(factory):
            raise CreatorOperationResolutionError(
                "The configured Creator model does not support structured output."
            )
        try:
            structured_model = factory(
                CreatorOperationResolution,
                include_raw=True,
                method="function_calling",
            )
        except TypeError:
            structured_model = factory(
                CreatorOperationResolution,
                include_raw=True,
            )
        return structured_model

    def _invoke_bound_structured_model(
        self, model: Any, messages: list[SystemMessage | HumanMessage]
    ) -> Any:
        structured_model = (
            self._structured_model
            if model is self._invocation_model
            else self._bind_structured_model(model)
        )
        return structured_model.ainvoke(messages)

    async def _recover_invocation_model(self) -> Any:
        if self._recovery_factory is None:
            raise RuntimeError("A resolver model recovery factory is unavailable.")
        fresh_model = self._recovery_factory()
        if inspect.isawaitable(fresh_model):
            fresh_model = await fresh_model
        return (
            fresh_model
            if self._structured_model_supplied
            else self._model_with_resolver_budget(fresh_model)
        )

    def _model_with_resolver_budget(self, model: Any | None = None) -> Any:
        """Use an independent model copy so resolver output stays bounded."""

        candidate = self.model if model is None else model
        if candidate is None:
            return None
        copier = getattr(candidate, "model_copy", None)
        if not callable(copier):
            return candidate
        try:
            return copier(update={"max_tokens": MAX_RESOLVER_OUTPUT_TOKENS})
        except (TypeError, ValueError):
            return candidate

    @staticmethod
    def _messages(
        *,
        user_message: str,
        plugin_index: PluginCapabilityIndex,
        repair_reason: str | None,
    ) -> list[SystemMessage | HumanMessage]:
        payload: dict[str, Any] = {
            "userMessage": user_message,
            "pluginCapabilityIndex": plugin_index.model_dump(
                mode="json", exclude_none=True
            ),
        }
        if repair_reason is not None:
            payload["hostValidationFeedback"] = (
                "The previous structured result was rejected. Correct only the "
                f"resolution fields; do not change the original user request. Reason: {repair_reason}"
            )
        return [
            SystemMessage(content=_RESOLVER_SYSTEM_PROMPT),
            HumanMessage(
                content=json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
            ),
        ]
