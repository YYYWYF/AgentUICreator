from __future__ import annotations

import asyncio
import json
import os
import secrets
import socket
import sys
from collections.abc import Awaitable
from contextlib import closing
from dataclasses import dataclass
from typing import Any, AsyncIterator
from uuid import uuid4

import uvicorn
from ag_ui.core import (
    EventType,
    RunErrorEvent,
    RunFinishedEvent,
    RunFinishedSuccessOutcome,
    RunStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)
from ag_ui.encoder import EventEncoder
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .config import CREATOR_PYTHON_PROTOCOL_VERSION, CreatorServerSettings
from .activity import CreatorActivityRecorder
from .app_ui_model import ProjectMutationCoordinator
from .model_settings import (
    CreatorModelConfigurationError,
    CreatorModelSettings,
    load_python_agent_mode,
)
from .runtime_diagnostics import RuntimeDiagnosticEnvelope, RuntimeDiagnosticStore
from .observability import CreatorRunLogger
from .streaming import CreatorEventBus, CreatorEventSink, map_runtime_event

MAX_CREATOR_REQUEST_BYTES = 512 * 1024
MAX_RUNTIME_DIAGNOSTIC_REQUEST_BYTES = 64 * 1024


class AgUiRunInput(BaseModel):
    model_config = ConfigDict(extra="allow")

    threadId: str = Field(min_length=1)
    runId: str = Field(min_length=1)
    messages: list[dict[str, Any]]
    tools: list[Any] = Field(default_factory=list)
    context: list[Any] = Field(default_factory=list)
    state: Any = None


async def _json_body(request: Request, maximum_bytes: int) -> Any:
    chunks: list[bytes] = []
    body_bytes = 0
    async for chunk in request.stream():
        body_bytes += len(chunk)
        if body_bytes > maximum_bytes:
            raise ValueError("Creator request body is too large.")
        chunks.append(chunk)
    body = b"".join(chunks)
    try:
        return json.loads(body)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("Creator request body must be valid JSON.") from error


def _echo_text(run_input: AgUiRunInput) -> str:
    for message in reversed(run_input.messages):
        if message.get("role") != "user":
            continue
        content = message.get("content")
        if isinstance(content, str):
            return content
    return ""


async def _minimal_agent_result(
    settings: CreatorServerSettings,
    prompt: str,
    activity: CreatorActivityRecorder,
    event_sink: CreatorEventSink,
):
    # Agent dependencies stay lazy so echo mode remains a transport-only path.
    from .minimal_agent import create_minimal_creator_agent
    from .model_factory import create_creator_chat_model
    from .model_protocol.provider_trace import ProviderResponseTraceCollector

    model_settings = CreatorModelSettings.from_environment(
        config_root=settings.config_root
    )
    provider_trace_collector = ProviderResponseTraceCollector(
        enabled=model_settings.raw_trace
    )
    model = create_creator_chat_model(
        model_settings,
        provider_trace_collector=provider_trace_collector,
    )
    agent = create_minimal_creator_agent(
        model=model,
        workspace=settings.project_root,
        mode="development",
        raw_trace=model_settings.raw_trace,
        provider_trace_collector=provider_trace_collector,
        activity=activity,
        event_sink=event_sink,
    )
    return await agent.run(prompt)


async def _domain_read_agent_result(
    settings: CreatorServerSettings,
    prompt: str,
    activity: CreatorActivityRecorder,
    event_sink: CreatorEventSink,
):
    from .domain_agent import create_domain_read_creator_agent
    from .model_factory import create_creator_chat_model
    from .model_protocol.provider_trace import ProviderResponseTraceCollector

    model_settings = CreatorModelSettings.from_environment(
        config_root=settings.config_root
    )
    provider_trace_collector = ProviderResponseTraceCollector(
        enabled=model_settings.raw_trace
    )
    model = create_creator_chat_model(
        model_settings,
        provider_trace_collector=provider_trace_collector,
    )
    agent = create_domain_read_creator_agent(
        model=model,
        workspace=settings.project_root,
        mode="development",
        raw_trace=model_settings.raw_trace,
        provider_trace_collector=provider_trace_collector,
        activity=activity,
        event_sink=event_sink,
    )
    return await agent.run(prompt)


async def _domain_write_agent_result(
    settings: CreatorServerSettings,
    prompt: str,
    activity: CreatorActivityRecorder,
    mutation_coordinator: ProjectMutationCoordinator,
    event_sink: CreatorEventSink,
):
    from .domain_agent import create_domain_write_creator_agent
    from .model_factory import create_creator_chat_model
    from .model_protocol.provider_trace import ProviderResponseTraceCollector

    model_settings = CreatorModelSettings.from_environment(
        config_root=settings.config_root
    )
    provider_trace_collector = ProviderResponseTraceCollector(
        enabled=model_settings.raw_trace
    )
    model = create_creator_chat_model(
        model_settings,
        provider_trace_collector=provider_trace_collector,
    )
    agent = create_domain_write_creator_agent(
        model=model,
        workspace=settings.project_root,
        mode="development",
        raw_trace=model_settings.raw_trace,
        provider_trace_collector=provider_trace_collector,
        activity=activity,
        mutation_coordinator=mutation_coordinator,
        event_sink=event_sink,
    )
    return await agent.run(prompt)


def _error_code(error: Exception) -> str:
    code = getattr(error, "code", None)
    if isinstance(code, str) and code:
        return code
    if isinstance(error, CreatorModelConfigurationError):
        return "MODEL_CONFIGURATION_ERROR"
    return "CREATOR_PYTHON_AGENT_ERROR"


@dataclass(frozen=True, slots=True)
class _AgentExecution:
    result: Any
    receipt: dict[str, Any]


async def _execute_agent_run(
    agent_result: Awaitable[Any],
    *,
    activity: CreatorActivityRecorder,
    logger: CreatorRunLogger,
    event_bus: CreatorEventBus,
) -> _AgentExecution:
    result: Any = None
    try:
        result = await agent_result
        receipt = activity.finish()
        logger.finish("success", metrics=result.metrics.to_dict())
        return _AgentExecution(result=result, receipt=receipt)
    except BaseException as error:
        try:
            activity.finish()
        except Exception:
            pass
        logger.finish(
            "error",
            metrics=(
                result.metrics.to_dict()
                if result is not None and hasattr(result, "metrics")
                else None
            ),
            error=error,
        )
        raise
    finally:
        event_bus.close()


def create_app(settings: CreatorServerSettings) -> FastAPI:
    agent_mode = load_python_agent_mode(config_root=settings.config_root)
    app = FastAPI(
        title="Agent UI Creator Python Control Plane",
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    diagnostics = RuntimeDiagnosticStore()
    writing_run_lock = asyncio.Lock()
    mutation_coordinator = ProjectMutationCoordinator()

    @app.middleware("http")
    async def authorize(request: Request, call_next: Any):
        expected = f"Bearer {settings.auth_token}"
        actual = request.headers.get("authorization", "")
        if not secrets.compare_digest(actual, expected):
            return JSONResponse(
                status_code=401,
                content={"error": "Creator sidecar authentication failed."},
            )
        return await call_next(request)

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "runtime": "python",
            "protocolVersion": CREATOR_PYTHON_PROTOCOL_VERSION,
            "projectRoot": str(settings.project_root),
            "phase": (
                f"{agent_mode}-agent"
                if agent_mode in {"domain-read", "domain-write"}
                else "minimal-agent" if agent_mode == "minimal" else "sidecar-skeleton"
            ),
            "agentMode": agent_mode,
        }

    @app.post("/runtime-diagnostics")
    async def runtime_diagnostics(request: Request) -> JSONResponse:
        try:
            payload = await _json_body(
                request, MAX_RUNTIME_DIAGNOSTIC_REQUEST_BYTES
            )
            envelope = RuntimeDiagnosticEnvelope.model_validate(payload)
            return JSONResponse(status_code=202, content=diagnostics.record(envelope))
        except (ValueError, ValidationError) as error:
            return JSONResponse(status_code=400, content={"error": str(error)})

    @app.post("/creator")
    async def creator(request: Request):
        try:
            payload = await _json_body(request, MAX_CREATOR_REQUEST_BYTES)
            run_input = AgUiRunInput.model_validate(payload)
        except (ValueError, ValidationError) as error:
            return JSONResponse(status_code=400, content={"error": str(error)})

        encoder = EventEncoder(accept=request.headers.get("accept"))

        def encode(event: Any) -> bytes:
            return encoder.encode(event).encode("utf-8")

        async def events() -> AsyncIterator[bytes]:
            async with writing_run_lock:
                message_id = str(uuid4())
                logger: CreatorRunLogger | None = None
                activity: CreatorActivityRecorder | None = None
                if agent_mode in {"minimal", "domain-read", "domain-write"}:
                    logger = CreatorRunLogger(settings.project_root)
                    logger.begin(
                        run_id=run_input.runId,
                        thread_id=run_input.threadId,
                        agent_mode=agent_mode,
                    )
                    activity = CreatorActivityRecorder(
                        settings.project_root, logger=logger
                    )
                    activity.begin(run_input.runId)
                yield encode(
                    RunStartedEvent(
                        type=EventType.RUN_STARTED,
                        thread_id=run_input.threadId,
                        run_id=run_input.runId,
                    )
                )
                if agent_mode in {"minimal", "domain-read", "domain-write"}:
                    assert activity is not None
                    assert logger is not None
                    event_bus = CreatorEventBus()
                    if agent_mode == "domain-write":
                        agent_result = _domain_write_agent_result(
                            settings,
                            _echo_text(run_input),
                            activity,
                            mutation_coordinator,
                            event_bus,
                        )
                    elif agent_mode == "domain-read":
                        agent_result = _domain_read_agent_result(
                            settings,
                            _echo_text(run_input),
                            activity,
                            event_bus,
                        )
                    else:
                        agent_result = _minimal_agent_result(
                            settings,
                            _echo_text(run_input),
                            activity,
                            event_bus,
                        )
                    agent_task = asyncio.create_task(
                        _execute_agent_run(
                            agent_result,
                            activity=activity,
                            logger=logger,
                            event_bus=event_bus,
                        )
                    )

                    def consume_background_result(task: asyncio.Task[Any]) -> None:
                        try:
                            task.exception()
                        except asyncio.CancelledError:
                            pass

                    agent_task.add_done_callback(consume_background_result)
                    try:
                        async for runtime_event in event_bus.events():
                            for ag_ui_event in map_runtime_event(runtime_event):
                                yield encode(ag_ui_event)
                        execution = await agent_task
                    except asyncio.CancelledError:
                        event_bus.request_cancel()
                        if not event_bus.has_active_tools and not agent_task.done():
                            agent_task.cancel()
                        raise
                    except Exception as error:
                        event_bus.request_cancel()
                        if not event_bus.has_active_tools and not agent_task.done():
                            agent_task.cancel()
                        yield encode(
                            RunErrorEvent(
                                type=EventType.RUN_ERROR,
                                code=_error_code(error),
                                message=str(error),
                            )
                        )
                        return
                    finally:
                        if not agent_task.done():
                            event_bus.request_cancel()
                            if not event_bus.has_active_tools:
                                agent_task.cancel()
                    result = execution.result
                    response_text = result.text
                    if agent_mode in {"domain-read", "domain-write"}:
                        run_result = {
                            "runtime": "python",
                            "agentMode": agent_mode,
                            "phase": f"{agent_mode}-agent",
                            "toolProtocol": result.metrics.to_dict(),
                            "projectControl": {
                                **result.project_control.to_dict(),
                                "repeatedProjectControlReads": (
                                    result.repeated_project_control_reads
                                ),
                            },
                            "domainObservations": result.domain_observations.to_dict(),
                            "streaming": event_bus.metrics().to_dict(),
                        }
                        if agent_mode == "domain-write":
                            run_result["appUIModelMutations"] = (
                                result.app_ui_model_mutations.to_dict()
                            )
                    else:
                        run_result = {
                            "runtime": "python",
                            "agentMode": agent_mode,
                            "phase": "minimal-agent",
                            "toolProtocol": result.metrics.to_dict(),
                            "streaming": event_bus.metrics().to_dict(),
                        }
                    run_result["receipt"] = execution.receipt
                else:
                    response_text = _echo_text(run_input)
                    run_result = {
                        "runtime": "python",
                        "agentMode": "echo",
                        "phase": "sidecar-skeleton",
                        "echo": True,
                    }
                yield encode(
                    TextMessageStartEvent(
                        type=EventType.TEXT_MESSAGE_START,
                        message_id=message_id,
                        role="assistant",
                    )
                )
                yield encode(
                    TextMessageContentEvent(
                        type=EventType.TEXT_MESSAGE_CONTENT,
                        message_id=message_id,
                        delta=response_text,
                    )
                )
                yield encode(
                    TextMessageEndEvent(
                        type=EventType.TEXT_MESSAGE_END,
                        message_id=message_id,
                    )
                )
                yield encode(
                    RunFinishedEvent(
                        type=EventType.RUN_FINISHED,
                        thread_id=run_input.threadId,
                        run_id=run_input.runId,
                        outcome=RunFinishedSuccessOutcome(type="success"),
                        result=run_result,
                    )
                )

        return StreamingResponse(
            events(),
            media_type=encoder.get_content_type(),
            headers={
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return app


def _listening_socket(settings: CreatorServerSettings) -> socket.socket:
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server_socket.bind((settings.host, settings.port))
    server_socket.listen(2048)
    server_socket.setblocking(False)
    return server_socket


async def _monitor_parent(server: uvicorn.Server, parent_pid: int) -> None:
    while not server.should_exit:
        await asyncio.sleep(1)
        if os.getppid() != parent_pid:
            server.should_exit = True


async def _serve(settings: CreatorServerSettings) -> None:
    with closing(_listening_socket(settings)) as server_socket:
        port = int(server_socket.getsockname()[1])
        handshake = {
            "type": "creator_ready",
            "port": port,
            "protocolVersion": CREATOR_PYTHON_PROTOCOL_VERSION,
        }
        print(json.dumps(handshake, separators=(",", ":")), flush=True)
        config = uvicorn.Config(
            create_app(settings),
            host=settings.host,
            port=port,
            log_level="info",
            access_log=False,
        )
        server = uvicorn.Server(config)
        parent_pid = settings.parent_pid or os.getppid()
        monitor = asyncio.create_task(_monitor_parent(server, parent_pid))
        try:
            await server.serve(sockets=[server_socket])
        finally:
            monitor.cancel()
            await asyncio.gather(monitor, return_exceptions=True)


def main(arguments: list[str] | None = None) -> None:
    try:
        settings = CreatorServerSettings.from_arguments(arguments)
        asyncio.run(_serve(settings))
    except Exception as error:
        print(str(error), file=sys.stderr, flush=True)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
