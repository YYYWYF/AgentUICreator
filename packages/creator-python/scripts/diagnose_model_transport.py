"""One-shot OpenCode/MiMo transport A/B harness.

This script is intentionally outside the Creator runtime.  It builds the
small and Creator-like Chat Completions request shapes from the existing
Creator model/tool configuration, then sends each request directly through
the OpenAI-compatible client with no retry budget.

The emitted JSONL contains bounded timing and protocol metadata only.  It
never emits request messages, tool schemas, completion text, tool arguments,
authorization headers, or API keys.
"""

from __future__ import annotations

import argparse
import asyncio
import copy
import inspect
import json
import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path
from statistics import median
from tempfile import TemporaryDirectory
from time import monotonic
from typing import Any
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
import openai
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI

SCRIPT_PACKAGE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SCRIPT_PACKAGE_ROOT.parents[1]
if str(SCRIPT_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(SCRIPT_PACKAGE_ROOT))

from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.model_factory import (
    CREATOR_MODEL_USER_AGENT,
    create_creator_chat_model,
)
from agent_ui_creator.model_settings import CreatorModelSettings


MAX_EXCEPTION_MESSAGE_CHARS = 500
MAX_EXCEPTION_CHAIN = 8
CONNECT_TIMEOUT_SECONDS = 30.0
APPROX_30_SECOND_MIN_MS = 29_000.0
APPROX_30_SECOND_MAX_MS = 32_000.0


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def package_version(name: str) -> str:
    try:
        return version(name)
    except PackageNotFoundError:
        return "<missing>"


def redact_message(message: str, api_key: str) -> str:
    """Bound and redact exception text without retaining transport secrets."""

    redacted = message.replace(api_key, "[REDACTED_SECRET]") if api_key else message
    redacted = re.sub(
        r"(?i)(authorization\s*[:=]\s*bearer\s+)[^\s,;]+",
        r"\1[REDACTED_SECRET]",
        redacted,
    )
    redacted = re.sub(
        r"(?i)((?:api[_-]?key|token|secret|password)\s*[:=]\s*)[^\s,;]+",
        r"\1[REDACTED_SECRET]",
        redacted,
    )
    redacted = redacted.replace("\x00", "\\0")
    return redacted[:MAX_EXCEPTION_MESSAGE_CHARS]


def exception_chain(error: BaseException, api_key: str) -> list[dict[str, str]]:
    chain: list[dict[str, str]] = []
    seen: set[int] = set()
    current: BaseException | None = error
    while current is not None and len(chain) < MAX_EXCEPTION_CHAIN:
        identity = id(current)
        if identity in seen:
            break
        seen.add(identity)
        chain.append(
            {
                "type": type(current).__name__,
                "message": redact_message(str(current), api_key),
            }
        )
        current = current.__cause__ or current.__context__
    return chain


@dataclass(slots=True)
class RequestObservation:
    request_started_at: str
    response_headers_at: str | None = None
    first_chunk_at: str | None = None
    request_finished_at: str | None = None
    status_code: int | None = None
    provider_request_id: str | None = None
    response_id: str | None = None
    first_chunk_monotonic: float | None = None
    headers_monotonic: float | None = None


class ObservedByteStream(httpx.AsyncByteStream):
    def __init__(self, stream: httpx.AsyncByteStream, observation: RequestObservation):
        self._stream = stream
        self._observation = observation

    async def __aiter__(self):
        async for chunk in self._stream:
            if chunk and self._observation.first_chunk_at is None:
                self._observation.first_chunk_at = utc_now()
                self._observation.first_chunk_monotonic = monotonic()
            yield chunk

    async def aclose(self) -> None:
        await self._stream.aclose()


class ObservedAsyncTransport(httpx.AsyncBaseTransport):
    """Wrap HTTPX transport to observe headers and first body bytes only."""

    def __init__(self) -> None:
        self._inner = httpx.AsyncHTTPTransport(retries=0)
        self.current_observation: RequestObservation | None = None

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        observation = self.current_observation
        response = await self._inner.handle_async_request(request)
        if observation is not None:
            observation.response_headers_at = utc_now()
            observation.headers_monotonic = monotonic()
            observation.status_code = response.status_code
            for header_name in (
                "x-request-id",
                "request-id",
                "x-opencode-request-id",
                "openai-request-id",
            ):
                request_id = response.headers.get(header_name)
                if request_id:
                    observation.provider_request_id = request_id[:200]
                    break
            response.stream = ObservedByteStream(response.stream, observation)
        return response

    async def aclose(self) -> None:
        await self._inner.aclose()


@dataclass(slots=True)
class ClientBundle:
    http_client: httpx.AsyncClient
    api_client: openai.AsyncOpenAI
    transport: ObservedAsyncTransport

    @classmethod
    def create(
        cls,
        settings: CreatorModelSettings,
        headers: dict[str, str],
    ) -> "ClientBundle":
        transport = ObservedAsyncTransport()
        timeout = httpx.Timeout(
            timeout=settings.timeout_seconds,
            connect=CONNECT_TIMEOUT_SECONDS,
        )
        http_client = httpx.AsyncClient(timeout=timeout, transport=transport)
        api_client = openai.AsyncOpenAI(
            api_key=settings.api_key,
            base_url=settings.base_url,
            timeout=settings.timeout_seconds,
            max_retries=0,
            default_headers=headers,
            http_client=http_client,
        )
        return cls(
            http_client=http_client,
            api_client=api_client,
            transport=transport,
        )

    async def close(self) -> None:
        await self.api_client.close()


@dataclass(frozen=True, slots=True)
class CaseSpec:
    name: str
    payload_label: str
    stream: bool
    connection_mode: str
    payload: dict[str, Any]


@dataclass(slots=True)
class RunResult:
    case: str
    repeat: int
    stream: bool
    connection_mode: str
    request_started_at: str
    response_headers_at: str | None
    first_chunk_at: str | None
    request_finished_at: str
    success: bool
    duration_ms: float
    time_to_headers_ms: float | None
    time_to_first_chunk_ms: float | None
    error_type: str | None
    exception_chain: list[dict[str, str]]
    status_code: int | None
    provider_request_id: str | None
    model: str
    endpoint_host: str
    message_count: int
    tool_count: int
    estimated_input_size: dict[str, int]
    stream_tool_call_completed: bool = False
    stream_tool_call_count: int = 0
    stream_tool_names: list[str] = field(default_factory=list)

    def as_json(self) -> dict[str, Any]:
        return {
            "recordType": "result",
            "case": self.case,
            "repeat": self.repeat,
            "stream": self.stream,
            "connectionMode": self.connection_mode,
            "requestStartedAt": self.request_started_at,
            "responseHeadersAt": self.response_headers_at,
            "firstChunkAt": self.first_chunk_at,
            "requestFinishedAt": self.request_finished_at,
            "success": self.success,
            "durationMs": round(self.duration_ms, 3),
            "timeToHeadersMs": (
                None
                if self.time_to_headers_ms is None
                else round(self.time_to_headers_ms, 3)
            ),
            "timeToFirstChunkMs": (
                None
                if self.time_to_first_chunk_ms is None
                else round(self.time_to_first_chunk_ms, 3)
            ),
            "errorType": self.error_type,
            "exceptionChain": self.exception_chain,
            "statusCode": self.status_code,
            "providerRequestId": self.provider_request_id,
            "model": self.model,
            "endpointHost": self.endpoint_host,
            "messageCount": self.message_count,
            "toolCount": self.tool_count,
            "estimatedInputSize": self.estimated_input_size,
            "streamToolCallCompleted": self.stream_tool_call_completed,
            "streamToolCallCount": self.stream_tool_call_count,
            "streamToolNames": self.stream_tool_names,
        }


def tool_schema_and_message_sizes(payload: dict[str, Any]) -> dict[str, int]:
    tools = payload.get("tools", [])
    messages = payload.get("messages", [])
    compact = lambda value: json.dumps(
        value, ensure_ascii=False, separators=(",", ":"), default=str
    )
    return {
        "serializedRequestChars": len(compact(payload)),
        "messageCount": len(messages),
        "toolCount": len(tools),
        "toolSchemaChars": len(compact(tools)),
    }


def endpoint_host(base_url: str) -> str:
    return urlsplit(base_url).hostname or "<unknown>"


def creator_like_messages(system_message: SystemMessage) -> list[Any]:
    snapshot = {
        "ok": True,
        "view": "composition",
        "appUIModelHash": "a" * 64,
        "layout": {
            "root": "row",
            "slots": ["conversation-main", "conversation-sidebar"],
            "sizes": ["minmax(0, 1fr)", "300px"],
        },
        "instances": [
            {
                "id": "conversation-thread-main",
                "pluginId": "conversation-thread",
                "enabled": True,
            },
            {
                "id": "conversation-thread-list-main",
                "pluginId": "conversation-thread-list",
                "enabled": True,
            },
        ],
        "requiredServices": {"status": "resolved", "missing": []},
        "hostGuarantees": {"postCommitVerificationRequired": True},
    }
    services = {
        "ok": True,
        "services": [
            {
                "name": "conversation",
                "provider": "conversation-runtime",
                "availability": "available",
                "requiredConsumers": ["conversation-thread"],
                "optionalConsumers": ["conversation-thread-list"],
            }
        ],
    }
    return [
        system_message,
        HumanMessage(
            content=(
                "Add the existing conversation thread list to the left side of the "
                "Agent frontend. Keep the request within the Composition layer and "
                "use the current authoring model."
            )
        ),
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "inspect_ui_project",
                    "args": {"view": "composition"},
                    "id": "call_transport_inspect_project",
                    "type": "tool_call",
                }
            ],
        ),
        ToolMessage(
            content=json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")),
            name="inspect_ui_project",
            tool_call_id="call_transport_inspect_project",
        ),
        AIMessage(
            content=(
                "The composition snapshot is current. The existing thread-list "
                "capability is selected and the required conversation service is "
                "available; I will verify service topology before composing it."
            )
        ),
        HumanMessage(
            content=(
                "Continue from the grounded snapshot and preserve all unrelated "
                "layout and plugin configuration."
            )
        ),
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "inspect_ui_services",
                    "args": {},
                    "id": "call_transport_inspect_services",
                    "type": "tool_call",
                }
            ],
        ),
        ToolMessage(
            content=json.dumps(services, ensure_ascii=False, separators=(",", ":")),
            name="inspect_ui_services",
            tool_call_id="call_transport_inspect_services",
        ),
        HumanMessage(
            content=(
                "Report the grounded facts, then proceed with one complete semantic "
                "composition operation if the target is already satisfied by the "
                "existing capability."
            )
        ),
    ]


async def build_payloads(
    settings: CreatorModelSettings,
    session_id: str,
) -> dict[str, dict[str, Any]]:
    """Use current Creator graph/tool construction only to build request shapes."""

    model: ChatOpenAI = create_creator_chat_model(settings, thread_id=session_id)
    try:
        with TemporaryDirectory(prefix="agent-ui-transport-diagnostic-") as temp_root:
            agent = create_domain_write_creator_agent(
                model=model,
                workspace=Path(temp_root),
                mode="conformance",
                thread_id=session_id,
            )
            model_node = agent.graph.nodes["model"].bound
            closures = inspect.getclosurevars(model_node.func).nonlocals
            system_message = closures.get("system_message")
            if not isinstance(system_message, SystemMessage):
                raise RuntimeError(
                    "Unable to recover the current domain-write system prompt from the graph."
                )
            default_tools = closures.get("default_tools")
            if not isinstance(default_tools, list) or not default_tools:
                raise RuntimeError(
                    "Unable to recover the current domain-write tool schemas from the graph."
                )

            bound = model.bind_tools(default_tools)
            small_payload = model._get_request_payload(
                [HumanMessage(content="Reply with exactly: OK")],
                stream=False,
            )
            history = creator_like_messages(system_message)
            creator_payloads = {
                stream: bound.bound._get_request_payload(
                    history,
                    stream=stream,
                    **bound.kwargs,
                )
                for stream in (False, True)
            }
            return {
                "small": small_payload,
                "creatorNonStream": creator_payloads[False],
                "creatorStream": creator_payloads[True],
            }
    finally:
        model.http_client.close()
        # ChatOpenAI owns an independent async client.  It has not sent a
        # request, but close it so the one-shot harness leaves no open sockets.
        await model.http_async_client.aclose()


def stream_tool_state() -> dict[str, Any]:
    return {
        "ids": {},
        "names": {},
        "arguments": {},
        "completed": set(),
    }


def observe_stream_chunk(state: dict[str, Any], chunk: Any) -> None:
    choices = getattr(chunk, "choices", None) or []
    for choice in choices:
        delta = getattr(choice, "delta", None)
        if delta is None:
            continue
        for tool_call in getattr(delta, "tool_calls", None) or []:
            index = int(getattr(tool_call, "index", 0) or 0)
            function = getattr(tool_call, "function", None)
            if function is None:
                continue
            call_id = getattr(tool_call, "id", None)
            if call_id:
                state["ids"][index] = str(call_id)
            name = getattr(function, "name", None)
            if name:
                state["names"][index] = str(name)
            arguments = getattr(function, "arguments", None)
            if arguments:
                state["arguments"][index] = (
                    state["arguments"].get(index, "") + str(arguments)
                )


def completed_stream_tool_calls(state: dict[str, Any]) -> tuple[bool, int, list[str]]:
    names = [state["names"][index] for index in sorted(state["names"])]
    completed = bool(names)
    # The harness deliberately does not parse or emit arguments.  Receiving a
    # complete stream is enough for this transport experiment; tool execution
    # is never dispatched.
    return completed, len(names), names


async def run_one(
    *,
    case: CaseSpec,
    repeat: int,
    settings: CreatorModelSettings,
    bundle: ClientBundle,
    session_id: str,
) -> RunResult:
    payload = copy.deepcopy(case.payload)
    sizes = tool_schema_and_message_sizes(payload)
    observation = RequestObservation(request_started_at=utc_now())
    started = monotonic()
    bundle.transport.current_observation = observation
    error: BaseException | None = None
    stream_state = stream_tool_state()
    saw_stream_chunk = False
    stream_completed = False
    response: Any = None
    stream_response: Any = None
    try:
        response = await bundle.api_client.chat.completions.create(**payload)
        if case.stream:
            stream_response = response
            async for chunk in response:
                saw_stream_chunk = True
                observe_stream_chunk(stream_state, chunk)
            stream_completed = True
            if not saw_stream_chunk:
                error = RuntimeError("Streaming response contained no chunks.")
        else:
            observation.response_id = getattr(response, "id", None)
    except Exception as caught:
        error = caught
    finally:
        if stream_response is not None and not stream_completed:
            try:
                await stream_response.close()
            except Exception:
                pass
        observation.request_finished_at = utc_now()
        finished = monotonic()
        bundle.transport.current_observation = None

    duration_ms = (finished - started) * 1000.0
    headers_ms = (
        None
        if observation.headers_monotonic is None
        else (observation.headers_monotonic - started) * 1000.0
    )
    first_chunk_ms = (
        None
        if observation.first_chunk_monotonic is None
        else (observation.first_chunk_monotonic - started) * 1000.0
    )
    stream_tool_completed, stream_tool_count, stream_tool_names = (
        completed_stream_tool_calls(stream_state)
    )
    success = (
        error is None
        and observation.status_code is not None
        and 200 <= observation.status_code < 300
        and (not case.stream or stream_completed)
    )
    chain = [] if error is None else exception_chain(error, settings.api_key)
    error_type = None if error is None else type(error).__name__
    return RunResult(
        case=case.name,
        repeat=repeat,
        stream=case.stream,
        connection_mode=case.connection_mode,
        request_started_at=observation.request_started_at,
        response_headers_at=observation.response_headers_at,
        first_chunk_at=observation.first_chunk_at,
        request_finished_at=observation.request_finished_at or utc_now(),
        success=success,
        duration_ms=duration_ms,
        time_to_headers_ms=headers_ms,
        time_to_first_chunk_ms=first_chunk_ms,
        error_type=error_type,
        exception_chain=chain,
        status_code=observation.status_code,
        provider_request_id=observation.provider_request_id,
        model=settings.model_name,
        endpoint_host=endpoint_host(settings.base_url),
        message_count=sizes["messageCount"],
        tool_count=sizes["toolCount"],
        estimated_input_size={
            "serializedRequestChars": sizes["serializedRequestChars"],
            "messageCount": sizes["messageCount"],
            "toolCount": sizes["toolCount"],
            "toolSchemaChars": sizes["toolSchemaChars"],
        },
        stream_tool_call_completed=stream_tool_completed,
        stream_tool_call_count=stream_tool_count,
        stream_tool_names=stream_tool_names,
    )


def is_remote_close(result: RunResult) -> bool:
    return any(
        entry["type"] == "RemoteProtocolError"
        or "server disconnected without sending a response" in entry["message"].lower()
        for entry in result.exception_chain
    )


def numeric_median(values: Iterable[float]) -> float | None:
    numbers = list(values)
    return None if not numbers else round(float(median(numbers)), 3)


def duration_stats(values: Iterable[float]) -> dict[str, float | int | None]:
    numbers = sorted(values)
    return {
        "count": len(numbers),
        "min": None if not numbers else round(numbers[0], 3),
        "median": None if not numbers else round(float(median(numbers)), 3),
        "max": None if not numbers else round(numbers[-1], 3),
    }


def summarize_case(results: list[RunResult], case: str) -> dict[str, Any]:
    case_results = [result for result in results if result.case == case]
    failure_durations = [result.duration_ms for result in case_results if not result.success]
    remote_close_results = [result for result in case_results if is_remote_close(result)]
    first_times = [
        result.time_to_first_chunk_ms
        for result in case_results
        if result.time_to_first_chunk_ms is not None
    ]
    return {
        "case": case,
        "payload": (
            "small" if case == "A" else "creator-like"
        ),
        "stream": None if not case_results else case_results[0].stream,
        "connection": None
        if not case_results
        else case_results[0].connection_mode,
        "runs": len(case_results),
        "success": sum(result.success for result in case_results),
        "remoteClose": len(remote_close_results),
        "medianTTFBOrFirstChunkMs": numeric_median(first_times),
        "medianTotalMs": numeric_median(result.duration_ms for result in case_results),
        "failureDurationsMs": [round(value, 3) for value in failure_durations],
        "remoteCloseDurationsMs": [
            round(result.duration_ms, 3) for result in remote_close_results
        ],
    }


def classify(results: list[RunResult]) -> str:
    by_case = {case: [item for item in results if item.case == case] for case in "ABCEF"}
    a, b, c, e = by_case["A"], by_case["B"], by_case["C"], by_case["E"]
    if not results or not a or not b or not c or not e:
        return "S5"
    if sum(item.success for item in a) <= len(a) // 2:
        return "S4"
    b_remote = sum(is_remote_close(item) for item in b)
    c_remote = sum(is_remote_close(item) for item in c)
    b_success = sum(item.success for item in b)
    c_success = sum(item.success for item in c)
    e_success = sum(item.success for item in e)
    if b_remote >= max(1, len(b) // 2 + 1) and c_success > b_success and c_remote < b_remote:
        return "S1"
    if b_success < len(b) and e_success > b_success and (
        sum(is_remote_close(item) for item in e) < b_remote
    ):
        return "S2"
    if (
        sum(item.success for item in a) == len(a)
        and b_success < len(b)
        and c_success < len(c)
        and e_success < len(e)
    ):
        return "S3"
    if b_success == len(b) and c_success == len(c) and e_success == len(e):
        return "S5"
    return "S5"


def build_summary(
    *,
    settings: CreatorModelSettings,
    session_id: str,
    results: list[RunResult],
    include_f: bool,
) -> dict[str, Any]:
    remote_close_durations = [
        result.duration_ms for result in results if is_remote_close(result)
    ]
    approx_30s = [
        value
        for value in remote_close_durations
        if APPROX_30_SECOND_MIN_MS <= value <= APPROX_30_SECOND_MAX_MS
    ]
    matrix_cases = ["A", "B", "C", "D", "E"] + (["F"] if include_f else [])
    matrix = []
    for case in matrix_cases:
        if case == "D":
            row = summarize_case(results, "B")
            row.update(
                {
                    "case": "D",
                    "connection": "pooled",
                    "aliasOf": "B",
                    "note": "Same payload/stream/pooled setup as B; not re-run.",
                }
            )
        else:
            matrix.append(summarize_case(results, case))
            continue
        matrix.append(row)
    return {
        "recordType": "summary",
        "environment": {
            "model": settings.model_name,
            "endpointHost": endpoint_host(settings.base_url),
            "timeout": {
                "requestSeconds": settings.timeout_seconds,
                "connectSeconds": CONNECT_TIMEOUT_SECONDS,
            },
            "python": sys.version.split()[0],
            "httpx": package_version("httpx"),
            "openai": package_version("openai"),
            "langchain-openai": package_version("langchain-openai"),
            "deepagents": package_version("deepagents"),
            "headers": {
                "userAgent": CREATOR_MODEL_USER_AGENT,
                "opencodeSession": "sent (value omitted)",
            },
            "httpAttemptsPerRun": 1,
        },
        "sessionId": session_id,
        "matrix": matrix,
        "remoteClose30SecondBoundary": {
            "allRemoteCloseDurationsMs": duration_stats(remote_close_durations),
            "within29To32Seconds": duration_stats(approx_30s),
        },
        "streamComparison": {
            "case": "C",
            "timeToFirstChunkMs": duration_stats(
                result.time_to_first_chunk_ms
                for result in results
                if result.case == "C" and result.time_to_first_chunk_ms is not None
            ),
            "remoteProtocolErrors": sum(
                is_remote_close(result) for result in results if result.case == "C"
            ),
            "success": sum(
                result.success for result in results if result.case == "C"
            ),
        },
        "connectionComparison": {
            "pooledCase": "B",
            "freshCase": "E",
            "pooledSuccess": sum(
                result.success for result in results if result.case == "B"
            ),
            "freshSuccess": sum(
                result.success for result in results if result.case == "E"
            ),
            "pooledRemoteClose": sum(
                is_remote_close(result) for result in results if result.case == "B"
            ),
            "freshRemoteClose": sum(
                is_remote_close(result) for result in results if result.case == "E"
            ),
        },
        "conclusion": classify(results),
        "diagnosticScope": {
            "productionCodeChanged": False,
            "toolExecution": False,
            "retryMiddlewareChanged": False,
            "payloadBodiesLogged": False,
        },
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--config-root",
        type=Path,
        default=REPO_ROOT,
        help="Root containing .env.creator.local (default: repository root).",
    )
    parser.add_argument(
        "--runs",
        type=int,
        default=5,
        help="Repeats per requested case (default: 5).",
    )
    parser.add_argument(
        "--include-f",
        action="store_true",
        help="Also run creator-like streaming with a fresh connection.",
    )
    parser.add_argument(
        "--cases",
        default="A,B,C,E",
        help="Comma-separated cases to run; default A,B,C,E (D aliases B).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional JSONL output path. Request/response bodies are never written.",
    )
    parser.add_argument(
        "--build-only",
        action="store_true",
        help="Build and report request-shape metadata without sending requests.",
    )
    args = parser.parse_args()
    if args.runs <= 0:
        parser.error("--runs must be positive")
    requested = {item.strip().upper() for item in args.cases.split(",") if item.strip()}
    allowed = {"A", "B", "C", "E"} | ({"F"} if args.include_f else set())
    invalid = requested - allowed
    if invalid:
        parser.error(f"unsupported cases: {', '.join(sorted(invalid))}")
    args.requested_cases = requested
    return args


async def async_main(args: argparse.Namespace) -> int:
    settings = CreatorModelSettings.from_environment(config_root=args.config_root.resolve())
    session_id = f"transport-diagnostic-{uuid4()}"
    payloads = await build_payloads(settings, session_id)
    case_payloads = {
        "A": CaseSpec("A", "small", False, "pooled", payloads["small"]),
        "B": CaseSpec(
            "B", "creator-like", False, "pooled", payloads["creatorNonStream"]
        ),
        "C": CaseSpec(
            "C", "creator-like", True, "pooled", payloads["creatorStream"]
        ),
        "E": CaseSpec(
            "E", "creator-like", False, "fresh", payloads["creatorNonStream"]
        ),
        "F": CaseSpec(
            "F", "creator-like", True, "fresh", payloads["creatorStream"]
        ),
    }
    output_handle = None
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        output_handle = args.output.open("w", encoding="utf-8")

    def emit(value: dict[str, Any]) -> None:
        line = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        print(line, flush=True)
        if output_handle is not None:
            output_handle.write(line + "\n")
            output_handle.flush()

    try:
        if args.build_only:
            emit(
                {
                    "recordType": "buildOnly",
                    "environment": {
                        "model": settings.model_name,
                        "endpointHost": endpoint_host(settings.base_url),
                        "timeoutSeconds": settings.timeout_seconds,
                    },
                    "payloadShapes": {
                        name: tool_schema_and_message_sizes(payload)
                        for name, payload in payloads.items()
                    },
                    "productionCodeChanged": False,
                }
            )
            return 0

        headers = {
            "User-Agent": CREATOR_MODEL_USER_AGENT,
            "x-opencode-session": session_id,
        }
        results: list[RunResult] = []
        pooled_bundle = ClientBundle.create(settings, headers)
        try:
            for case_name in ("A", "B", "C"):
                if case_name not in args.requested_cases:
                    continue
                case = case_payloads[case_name]
                for repeat in range(1, args.runs + 1):
                    result = await run_one(
                        case=case,
                        repeat=repeat,
                        settings=settings,
                        bundle=pooled_bundle,
                        session_id=session_id,
                    )
                    results.append(result)
                    emit(result.as_json())
        finally:
            await pooled_bundle.close()

        for case_name in ("E", "F"):
            if case_name not in args.requested_cases:
                continue
            case = case_payloads[case_name]
            for repeat in range(1, args.runs + 1):
                bundle = ClientBundle.create(settings, headers)
                try:
                    result = await run_one(
                        case=case,
                        repeat=repeat,
                        settings=settings,
                        bundle=bundle,
                        session_id=session_id,
                    )
                finally:
                    await bundle.close()
                results.append(result)
                emit(result.as_json())

        include_f_in_summary = "F" in args.requested_cases
        emit(
            build_summary(
                settings=settings,
                session_id=session_id,
                results=results,
                include_f=include_f_in_summary,
            )
        )
        return 0
    finally:
        if output_handle is not None:
            output_handle.close()


def main() -> int:
    args = parse_args()
    try:
        return asyncio.run(async_main(args))
    except KeyboardInterrupt:
        print("diagnostic interrupted", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
