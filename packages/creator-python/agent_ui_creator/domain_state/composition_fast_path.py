from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any, Mapping


COMPOSITION_FAST_PATH_CROSS_LAYER_READ_PROHIBITED = (
    "COMPOSITION_FAST_PATH_CROSS_LAYER_READ_PROHIBITED"
)
COMPOSITION_FAST_PATH_CROSS_LAYER_READ_MESSAGE = (
    "Fresh Composition grounding is active. This read belongs to another "
    "authoring layer. Use the current snapshot and converge to "
    "mutate_app_ui_model, or explicitly leave the Composition fast path before "
    "cross-layer inspection."
)

CROSS_LAYER_DOMAIN_READ_NAMES = frozenset(
    {
        "inspect_ui_services",
        "inspect_ui_plugin",
        "inspect_ui_plugin_source_references",
        "inspect_agent_ui_sources",
    }
)

_SOURCE_ROOTS = frozenset(
    {
        "plugins",
        "services",
        "agent-ui",
        "agent-contract",
    }
)
_FILESYSTEM_SOURCE_READ_NAMES = frozenset({"read_file", "ls", "glob", "grep"})


def composition_fast_path_error() -> dict[str, object]:
    return {
        "ok": False,
        "error": {
            "code": COMPOSITION_FAST_PATH_CROSS_LAYER_READ_PROHIBITED,
            "message": COMPOSITION_FAST_PATH_CROSS_LAYER_READ_MESSAGE,
        },
    }


def _normalized_root(value: Any) -> str | None:
    if not isinstance(value, str) or not value or "\\" in value:
        return None
    path = value if value.startswith("/") else f"/{value}"
    parts = PurePosixPath(path).parts
    if len(parts) < 2 or ".." in parts:
        return None
    return parts[1]


def filesystem_source_read_path(
    name: str, arguments: Mapping[str, Any]
) -> str | None:
    """Return an explicit generated-project source path, without guessing patterns."""

    if name == "read_file":
        path = arguments.get("file_path")
    elif name in {"ls", "grep"}:
        path = arguments.get("path")
    elif name == "glob":
        path = arguments.get("pattern")
    else:
        return None
    if _normalized_root(path) not in _SOURCE_ROOTS:
        return None
    return path if isinstance(path, str) else None


def is_cross_layer_read(name: str, arguments: Mapping[str, Any]) -> bool:
    return name in CROSS_LAYER_DOMAIN_READ_NAMES or (
        name in _FILESYSTEM_SOURCE_READ_NAMES
        and filesystem_source_read_path(name, arguments) is not None
    )


def _result_payload(result: Any) -> dict[str, Any] | None:
    if isinstance(result, Mapping):
        return dict(result)
    content = getattr(result, "content", result)
    if not isinstance(content, str):
        return None
    try:
        value = json.loads(content)
    except (TypeError, ValueError):
        return None
    return value if isinstance(value, dict) else None


@dataclass(slots=True)
class CompositionFastPathMetrics:
    attempted: bool = False
    eligible: bool = False
    compositionSnapshots: int = 0
    fastPathExits: int = 0
    modelCallsBeforeFirstMutation: int | None = None
    readRoundsBeforeFirstMutation: int = 0
    readToolsBeforeFirstMutation: int = 0
    duplicateObservationAttempts: int = 0
    crossLayerReadAttemptsBeforeMutation: int = 0
    filesystemSourceReadsBeforeMutation: int = 0
    firstMutationSucceeded: bool | None = None
    firstMutationErrorCode: str | None = None
    inputTokensBeforeFirstMutation: int | None = None
    modelLatencyBeforeFirstMutationMs: int | None = None
    _first_mutation_started: bool = field(default=False, init=False, repr=False)
    _first_mutation_finished: bool = field(default=False, init=False, repr=False)

    def record_snapshot_attempt(self) -> None:
        self.attempted = True

    def record_snapshot(self) -> None:
        self.eligible = True
        self.compositionSnapshots += 1

    def record_exit(self) -> None:
        self.fastPathExits += 1

    def record_duplicate_observation_attempt(self) -> None:
        self.duplicateObservationAttempts += 1

    def record_cross_layer_read_attempt(self) -> None:
        if not self._first_mutation_started:
            self.crossLayerReadAttemptsBeforeMutation += 1

    def record_filesystem_source_read(self) -> None:
        if not self._first_mutation_started:
            self.filesystemSourceReadsBeforeMutation += 1

    def record_first_mutation_started(
        self,
        protocol: Any,
        *,
        read_only_tool_names: frozenset[str],
    ) -> None:
        if self._first_mutation_started:
            return
        self._first_mutation_started = True
        self.modelCallsBeforeFirstMutation = int(
            getattr(protocol, "modelCalls", 0)
        )
        traces = list(getattr(protocol, "traces", ()))
        self.inputTokensBeforeFirstMutation = (
            int(getattr(protocol, "inputTokens", 0))
            if any(
                isinstance(getattr(trace, "inputTokens", None), int)
                for trace in traces
            )
            else None
        )
        self.modelLatencyBeforeFirstMutationMs = sum(
            int(getattr(trace, "durationMs", 0)) for trace in traces
        )
        mutation_trace_index = next(
            (
                index
                for index, trace in enumerate(traces)
                if "mutate_app_ui_model"
                in tuple(getattr(trace, "toolCallNames", ()))
            ),
            len(traces),
        )
        for trace in traces[:mutation_trace_index]:
            names = tuple(getattr(trace, "toolCallNames", ()))
            if any(name in read_only_tool_names for name in names):
                self.readRoundsBeforeFirstMutation += 1
                self.readToolsBeforeFirstMutation += int(
                    getattr(trace, "toolCallCount", 0)
                )

    def record_first_mutation_result(self, result: Any) -> None:
        if not self._first_mutation_started or self._first_mutation_finished:
            return
        self._first_mutation_finished = True
        payload = _result_payload(result)
        if payload is not None and payload.get("ok") is True:
            self.firstMutationSucceeded = True
            self.firstMutationErrorCode = None
            return
        self.firstMutationSucceeded = False
        error = payload.get("error") if payload is not None else None
        code = error.get("code") if isinstance(error, Mapping) else None
        self.firstMutationErrorCode = code if isinstance(code, str) else None

    def record_first_mutation_exception(self, error: BaseException) -> None:
        if not self._first_mutation_started or self._first_mutation_finished:
            return
        self._first_mutation_finished = True
        self.firstMutationSucceeded = False
        code = getattr(error, "code", None)
        self.firstMutationErrorCode = (
            code if isinstance(code, str) else type(error).__name__
        )

    def to_dict(self) -> dict[str, object]:
        return {
            "attempted": self.attempted,
            "eligible": self.eligible,
            "compositionSnapshots": self.compositionSnapshots,
            "fastPathExits": self.fastPathExits,
            "modelCallsBeforeFirstMutation": self.modelCallsBeforeFirstMutation,
            "readRoundsBeforeFirstMutation": self.readRoundsBeforeFirstMutation,
            "readToolsBeforeFirstMutation": self.readToolsBeforeFirstMutation,
            "duplicateObservationAttempts": self.duplicateObservationAttempts,
            "crossLayerReadAttemptsBeforeMutation": (
                self.crossLayerReadAttemptsBeforeMutation
            ),
            "filesystemSourceReadsBeforeMutation": (
                self.filesystemSourceReadsBeforeMutation
            ),
            "firstMutationSucceeded": self.firstMutationSucceeded,
            "firstMutationErrorCode": self.firstMutationErrorCode,
            "inputTokensBeforeFirstMutation": self.inputTokensBeforeFirstMutation,
            "modelLatencyBeforeFirstMutationMs": self.modelLatencyBeforeFirstMutationMs,
        }
