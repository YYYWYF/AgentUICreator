from __future__ import annotations

import asyncio
import json
import os
import secrets
import socket
import sys
from contextlib import closing
from typing import Any, AsyncIterator
from uuid import uuid4

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .config import CREATOR_PYTHON_PROTOCOL_VERSION, CreatorServerSettings
from .model_settings import (
    CreatorModelConfigurationError,
    CreatorModelSettings,
    load_python_agent_mode,
)
from .runtime_diagnostics import RuntimeDiagnosticEnvelope, RuntimeDiagnosticStore

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


def _sse(event: dict[str, Any]) -> bytes:
    return f"data: {json.dumps(event, ensure_ascii=False, separators=(',', ':'))}\n\n".encode(
        "utf-8"
    )


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


async def _minimal_agent_result(settings: CreatorServerSettings, prompt: str):
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
    )
    return await agent.run(prompt)


async def _domain_read_agent_result(settings: CreatorServerSettings, prompt: str):
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
    )
    return await agent.run(prompt)


def _error_code(error: Exception) -> str:
    code = getattr(error, "code", None)
    if isinstance(code, str) and code:
        return code
    if isinstance(error, CreatorModelConfigurationError):
        return "MODEL_CONFIGURATION_ERROR"
    return "CREATOR_PYTHON_AGENT_ERROR"


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
            "protocolVersion": CREATOR_PYTHON_PROTOCOL_VERSION,
            "projectRoot": str(settings.project_root),
            "phase": (
                "domain-read-agent"
                if agent_mode == "domain-read"
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

        async def events() -> AsyncIterator[bytes]:
            async with writing_run_lock:
                message_id = str(uuid4())
                yield _sse(
                    {
                        "type": "RUN_STARTED",
                        "threadId": run_input.threadId,
                        "runId": run_input.runId,
                    }
                )
                if agent_mode in {"minimal", "domain-read"}:
                    try:
                        result = await (
                            _domain_read_agent_result(settings, _echo_text(run_input))
                            if agent_mode == "domain-read"
                            else _minimal_agent_result(settings, _echo_text(run_input))
                        )
                    except Exception as error:
                        yield _sse(
                            {
                                "type": "RUN_ERROR",
                                "threadId": run_input.threadId,
                                "runId": run_input.runId,
                                "code": _error_code(error),
                                "message": str(error),
                            }
                        )
                        return
                    for activity in result.activities:
                        yield _sse(
                            {
                                "type": "TOOL_CALL_START",
                                "toolCallId": activity.callId,
                                "toolCallName": activity.name,
                            }
                        )
                        yield _sse(
                            {
                                "type": "TOOL_CALL_ARGS",
                                "toolCallId": activity.callId,
                                "delta": json.dumps(
                                    activity.arguments,
                                    ensure_ascii=False,
                                    separators=(",", ":"),
                                ),
                            }
                        )
                        yield _sse(
                            {
                                "type": "TOOL_CALL_END",
                                "toolCallId": activity.callId,
                            }
                        )
                        yield _sse(
                            {
                                "type": "TOOL_CALL_RESULT",
                                "messageId": str(uuid4()),
                                "toolCallId": activity.callId,
                                "role": "tool",
                                "content": activity.result,
                                "metadata": {
                                    "status": (
                                        "error"
                                        if activity.status == "error"
                                        else "finished"
                                    )
                                },
                            }
                        )
                    response_text = result.text
                    if agent_mode == "domain-read":
                        run_result = {
                            "phase": "domain-read-agent",
                            "toolProtocol": result.metrics.to_dict(),
                            "projectControl": {
                                **result.project_control.to_dict(),
                                "repeatedProjectControlReads": (
                                    result.repeated_project_control_reads
                                ),
                            },
                        }
                    else:
                        run_result = {
                            "phase": "minimal-agent",
                            "toolProtocol": result.metrics.to_dict(),
                        }
                else:
                    response_text = _echo_text(run_input)
                    run_result = {
                        "phase": "sidecar-skeleton",
                        "echo": True,
                    }
                yield _sse(
                    {
                        "type": "TEXT_MESSAGE_START",
                        "messageId": message_id,
                        "role": "assistant",
                    }
                )
                yield _sse(
                    {
                        "type": "TEXT_MESSAGE_CONTENT",
                        "messageId": message_id,
                        "delta": response_text,
                    }
                )
                yield _sse({"type": "TEXT_MESSAGE_END", "messageId": message_id})
                yield _sse(
                    {
                        "type": "RUN_FINISHED",
                        "threadId": run_input.threadId,
                        "runId": run_input.runId,
                        "outcome": {"type": "success"},
                        "result": run_result,
                    }
                )

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
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
