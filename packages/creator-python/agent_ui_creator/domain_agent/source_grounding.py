from __future__ import annotations

import hashlib
import json
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass
from typing import Any, Literal

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage
from langchain_core.tools import BaseTool, tool

from ..minimal_agent.path_policy import PathPolicyViolation, PolicyFilesystemBackend
from ..minimal_agent.tool_policy import tool_name
from ..operations.models import CreatorAuthoringHandoff
from ..model_protocol.trace import ToolProtocolMetrics


SOURCE_LANE_TOOLS = frozenset({
    "read_file", "ls", "grep", "glob", "edit_file_from_read", "edit_file",
    "ask_user_question", "validate_creator_changes",
    "inspect_ui_project", "inspect_ui_services", "inspect_runtime_layout",
    "inspect_agent_ui_sources", "inspect_ui_capabilities",
    "prepare_ui_plugin_development", "inspect_ui_plugin",
    "inspect_ui_plugin_source_references", "mutate_ui_plugin_source",
})
SOURCE_EXPANSION_TOOLS = frozenset({
    "inspect_ui_project", "inspect_ui_services", "inspect_runtime_layout",
    "inspect_agent_ui_sources", "inspect_ui_capabilities",
    "prepare_ui_plugin_development", "inspect_ui_plugin",
    "inspect_ui_plugin_source_references",
})
SOURCE_CONTROL = """The Host has resolved the source owner. Read its supplied source
directly; do not rediscover the target through Composition or capability catalogs.
If an exact file path is known, prefer read_file. Use ls or grep when a path or
symbol is unknown or a direct read contradicts the navigation context. Fresh
reads establish current content; prior conversation and handoff do not.
Prefer edit_file_from_read for a stable read range. Its line numbers refer to
the current fresh read. edit_file remains available for other edits. If another
authoring layer is needed, call its inspection tool; it executes normally and
the full General Agent tool surface returns on the next model call."""
SOURCE_CONVERGENCE_CONTROL = """Fresh source evidence is available for this
scoped change. Prefer the mutation now. Continue discovery only for a specific
missing fact or another authoring-layer dependency."""


@dataclass(frozen=True, slots=True)
class FileReadEvidence:
    path: str
    digest: str
    start_line: int
    end_line: int
    content: str
    revision: int


@dataclass(slots=True)
class SourceGroundingMetrics:
    sourceFastPathAttempted: bool = False
    sourceFastPathActivated: bool = False
    sourceFastPathExited: bool = False
    sourceFastPathExitTool: str | None = None
    sourceFastPathExitReason: str | None = None
    scopedAuthoringTarget: str | None = None
    filesystemReadsBeforeFirstSourceWrite: int = 0
    modelCallsBeforeFirstSourceWrite: int | None = None
    directReads: int = 0
    filesystemSearches: int = 0
    sourceEditAttempts: int = 0
    sourceEditSuccesses: int = 0
    sourceEditRangeAttempts: int = 0
    sourceEditRangeSuccesses: int = 0
    replacementNotFoundErrors: int = 0
    fileChangedSinceReadErrors: int = 0

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


class SourceGroundingConvergenceMiddleware(AgentMiddleware):
    """Run-scoped source navigation and fresh read evidence."""

    def __init__(
        self, backend: PolicyFilesystemBackend,
        handoff: CreatorAuthoringHandoff | None,
        protocol_metrics: ToolProtocolMetrics,
    ) -> None:
        self.backend = backend
        self.handoff = handoff
        self.protocol_metrics = protocol_metrics
        self.metrics = SourceGroundingMetrics(
            sourceFastPathAttempted=handoff is not None,
            sourceFastPathActivated=handoff is not None and handoff.kind == "plugin_source",
            scopedAuthoringTarget=handoff.targetId if handoff is not None else None,
        )
        self.reads: dict[str, FileReadEvidence] = {}
        self.first_write = False

    def _request(self, request: ModelRequest) -> ModelRequest:
        if not self.metrics.sourceFastPathActivated or self.metrics.sourceFastPathExited:
            return request
        control = SOURCE_CONTROL
        if self.reads:
            control += "\n" + SOURCE_CONVERGENCE_CONTROL
        return request.override(
            messages=[*request.messages, SystemMessage(content=control)],
            tools=[candidate for candidate in request.tools
                   if tool_name(candidate) in SOURCE_LANE_TOOLS],
        )

    def wrap_model_call(self, request: ModelRequest,
                        handler: Callable[[ModelRequest], ModelResponse]) -> ModelResponse:
        return handler(self._request(request))

    async def awrap_model_call(self, request: ModelRequest,
                               handler: Callable[[ModelRequest], Awaitable[ModelResponse]]) -> ModelResponse:
        return await handler(self._request(request))

    def _after(self, request: Any, result: Any) -> None:
        call = request.tool_call
        name = call.get("name")
        args = call.get("args") if isinstance(call.get("args"), dict) else {}
        content = str(getattr(result, "content", ""))
        if name == "read_file" and getattr(result, "status", None) == "success":
            path = args.get("file_path")
            if isinstance(path, str):
                self.metrics.directReads += 1
                if not self.first_write:
                    self.metrics.filesystemReadsBeforeFirstSourceWrite += 1
                try:
                    authorized = self.backend._authorize(path, "read")
                    file = self.backend.cwd / authorized.lstrip("/")
                    raw = file.read_bytes()
                    observation = self.backend.activity.file_observations.get(authorized)
                    if observation is None or observation.hash != hashlib.sha256(raw).hexdigest():
                        return
                    lines = raw.decode("utf-8").splitlines(keepends=True)
                    offset = args.get("offset", 0)
                    limit = args.get("limit", 2000)
                    start = max(1, offset + 1) if isinstance(offset, int) else 1
                    count = max(1, limit) if isinstance(limit, int) else 2000
                    self.reads[authorized] = FileReadEvidence(
                        path=authorized, digest=hashlib.sha256(raw).hexdigest(),
                        start_line=start, end_line=min(len(lines), start + count - 1),
                        content="".join(lines[start - 1:start + count - 1]),
                        revision=self.backend.mutation_revision,
                    )
                except (OSError, UnicodeError, PathPolicyViolation):
                    pass
        elif name in {"ls", "grep", "glob"}:
            self.metrics.filesystemSearches += 1
        if name in {"edit_file", "edit_file_from_read"}:
            self.metrics.sourceEditAttempts += 1
            if name == "edit_file_from_read":
                self.metrics.sourceEditRangeAttempts += 1
            success = (getattr(result, "status", None) == "success"
                       and (name == "edit_file" or '"ok":true' in content))
            if success:
                self.metrics.sourceEditSuccesses += 1
                if name == "edit_file_from_read":
                    self.metrics.sourceEditRangeSuccesses += 1
                if not self.first_write:
                    self.first_write = True
                    self.metrics.modelCallsBeforeFirstSourceWrite = self.protocol_metrics.modelCalls
            if "String not found" in content:
                self.metrics.replacementNotFoundErrors += 1
            if "FILE_CHANGED_SINCE_READ" in content:
                self.metrics.fileChangedSinceReadErrors += 1
        if (self.metrics.sourceFastPathActivated and not self.metrics.sourceFastPathExited
                and name in SOURCE_EXPANSION_TOOLS):
            self.metrics.sourceFastPathExited = True
            self.metrics.sourceFastPathExitTool = name
            self.metrics.sourceFastPathExitReason = "cross_layer_dependency"

    def wrap_tool_call(self, request: Any, handler: Callable[[Any], Any]) -> Any:
        try:
            result = handler(request)
        except BaseException:
            self._failed(request)
            raise
        self._after(request, result)
        return result

    async def awrap_tool_call(self, request: Any,
                              handler: Callable[[Any], Awaitable[Any]]) -> Any:
        try:
            result = await handler(request)
        except BaseException:
            self._failed(request)
            raise
        self._after(request, result)
        return result

    def _failed(self, request: Any) -> None:
        name = request.tool_call.get("name")
        if name in {"edit_file", "edit_file_from_read"}:
            self.metrics.sourceEditAttempts += 1
            if name == "edit_file_from_read":
                self.metrics.sourceEditRangeAttempts += 1
        if (self.metrics.sourceFastPathActivated and not self.metrics.sourceFastPathExited
                and name in SOURCE_EXPANSION_TOOLS):
            self.metrics.sourceFastPathExited = True
            self.metrics.sourceFastPathExitTool = name
            self.metrics.sourceFastPathExitReason = "cross_layer_dependency"


def create_edit_file_from_read_tool(
    backend: PolicyFilesystemBackend,
    grounding: SourceGroundingConvergenceMiddleware,
) -> BaseTool:
    @tool("edit_file_from_read")
    def edit_file_from_read(
        file_path: str,
        mode: Literal["replace_lines", "insert_before_line", "insert_after_line"],
        start_line: int,
        replacement: str,
        end_line: int | None = None,
    ) -> str:
        """Edit fresh-read lines without retyping old text; reread after a changed-file error."""
        try:
            path = backend._authorize(file_path, "write")
            evidence = grounding.reads.get(path)
            if evidence is None:
                return json.dumps({"ok": False, "error": {"code": "FILE_READ_REQUIRED"}})
            file = backend.cwd / path.lstrip("/")
            raw = file.read_bytes()
            if hashlib.sha256(raw).hexdigest() != evidence.digest:
                return json.dumps({"ok": False, "error": {"code": "FILE_CHANGED_SINCE_READ"}})
            lines = raw.decode("utf-8").splitlines(keepends=True)
            end = start_line if end_line is None else end_line
            if (start_line < evidence.start_line or end > evidence.end_line
                    or start_line > end or end > len(lines)):
                return json.dumps({"ok": False, "error": {"code": "READ_RANGE_REQUIRED"}})
            index = start_line - 1
            stop = end if mode == "replace_lines" else index
            if mode == "insert_after_line":
                index = end
                stop = end
            text = replacement.replace("\r\n", "\n").replace("\r", "\n")
            if mode == "insert_after_line" and index and not lines[index - 1].endswith("\n"):
                text = "\n" + text
            if text and not text.endswith("\n") and index < len(lines):
                text += "\n"
            new_content = "".join([*lines[:index], text, *lines[stop:]])
            result = backend.write(path, new_content)
            if result.error:
                code = ("FILE_CHANGED_SINCE_READ" if "stale-version" in result.error
                        else "SOURCE_WRITE_FAILED")
                return json.dumps({"ok": False, "error": {"code": code, "message": result.error}})
            grounding.reads.pop(path, None)
            return json.dumps({"ok": True, "file_path": path}, separators=(",", ":"))
        except PathPolicyViolation as error:
            return json.dumps({"ok": False, "error": {"code": error.code, "message": str(error)}})
        except (OSError, UnicodeError) as error:
            return json.dumps({"ok": False, "error": {"code": "SOURCE_EDIT_FAILED", "message": str(error)}})

    return edit_file_from_read
