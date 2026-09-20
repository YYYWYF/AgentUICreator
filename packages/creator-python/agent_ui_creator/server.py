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
    CreatorSelectorModelSettings,
    load_python_agent_mode,
)
from .runtime_diagnostics import RuntimeDiagnosticEnvelope, RuntimeDiagnosticStore
from .visual_observation import (
    MAX_VISUAL_OBSERVATION_REQUEST_BYTES,
    VisualObservationEnvelope,
    VisualObservationStore,
)
from .observability import CreatorRunLogger, CreatorRunTelemetry
from .operations import (
    CreatorAuthoringHandoff,
    PendingCreatorClarificationStore,
    CreatorResolveResult,
    ProductizedOperationEngine,
    ProductizedOperationRun,
    use_pending_creator_clarifications,
)
from .project_control import ProjectControlClient
from .streaming import CreatorEventBus, CreatorEventSink, map_runtime_event
from .verification_policy import (
    CreatorVerificationMode,
    DEFAULT_CREATOR_VERIFICATION_MODE,
)

MAX_CREATOR_REQUEST_BYTES = 512 * 1024
MAX_CREATOR_CONVERSATION_MESSAGES = 6
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


def _conversation_messages(run_input: AgUiRunInput) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    for message in run_input.messages:
        role = message.get("role")
        content = message.get("content")
        if role not in ("user", "assistant") or not isinstance(content, str):
            continue
        if content.strip():
            # Replay text only, without historical tool calls or client instructions.
            messages.append({"role": role, "content": content})
    return messages[-MAX_CREATOR_CONVERSATION_MESSAGES:]


def _authoring_handoff_messages(
    messages: list[dict[str, str]],
    handoff: CreatorAuthoringHandoff | None,
) -> list[dict[str, str]]:
    """Bind a resolved Host ownership target before invoking the General Agent."""

    if handoff is None:
        return messages
    owner = {
        "ownerPath": handoff.ownerPath,
        "ownerRoot": handoff.ownerRoot,
        "definitionPath": handoff.definitionPath,
    }
    instruction = (
        "The Creator Host has already resolved the semantic authoring target. "
        "Treat this Host ownership as authoritative; do not inspect the Composition "
        "catalog to rediscover or replace the target. Read only the supplied owner "
        "source needed for the requested change, then keep product integration within "
        "that owner boundary. For application_config, read ownerPath first. For "
        "plugin_source, read ownerRoot and definitionPath first. Do not change "
        "AppUIModel composition unless the user explicitly asks for a separate "
        "composition action. Resolved target: "
        + json.dumps(
            {
                "targetId": handoff.targetId,
                "kind": handoff.kind,
                "name": handoff.name,
                "description": handoff.description,
                **owner,
                "relatedPluginIds": handoff.relatedPluginIds,
                "pluginId": handoff.pluginId,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    return [{"role": "system", "content": instruction}, *messages]


async def _minimal_agent_result(
    settings: CreatorServerSettings,
    prompt: str,
    activity: CreatorActivityRecorder,
    thread_id: str,
    event_sink: CreatorEventSink,
    telemetry: CreatorRunTelemetry | None = None,
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
        thread_id=thread_id,
        provider_trace_collector=provider_trace_collector,
    )

    def recovery_factory():
        return create_creator_chat_model(
            model_settings,
            thread_id=thread_id,
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
        telemetry=telemetry,
        max_retries=model_settings.max_retries,
        recovery_factory=recovery_factory,
    )
    return await agent.run(prompt)


async def _domain_read_agent_result(
    settings: CreatorServerSettings,
    messages: list[dict[str, str]],
    activity: CreatorActivityRecorder,
    thread_id: str,
    event_sink: CreatorEventSink,
    telemetry: CreatorRunTelemetry | None = None,
    diagnostics: RuntimeDiagnosticStore | None = None,
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
        thread_id=thread_id,
        provider_trace_collector=provider_trace_collector,
    )

    def recovery_factory():
        return create_creator_chat_model(
            model_settings,
            thread_id=thread_id,
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
        telemetry=telemetry,
        diagnostics=diagnostics,
        thread_id=thread_id,
        max_retries=model_settings.max_retries,
        recovery_factory=recovery_factory,
        verification_mode=settings.verification_mode,
    )
    return await agent.run_messages(messages)


async def _domain_write_agent_result(
    settings: CreatorServerSettings,
    messages: list[dict[str, str]],
    activity: CreatorActivityRecorder,
    mutation_coordinator: ProjectMutationCoordinator,
    diagnostics: RuntimeDiagnosticStore,
    thread_id: str,
    event_sink: CreatorEventSink,
    telemetry: CreatorRunTelemetry | None = None,
    visual_observations: VisualObservationStore | None = None,
):
    from .model_factory import create_creator_chat_model
    from .model_protocol.provider_trace import ProviderResponseTraceCollector

    model_settings = CreatorModelSettings.from_environment(
        config_root=settings.config_root
    )
    selector_settings = CreatorSelectorModelSettings.from_environment(
        config_root=settings.config_root
    )
    provider_trace_collector = ProviderResponseTraceCollector(
        enabled=model_settings.raw_trace
    )
    model = create_creator_chat_model(
        model_settings,
        thread_id=thread_id,
        provider_trace_collector=provider_trace_collector,
    )

    def recovery_factory():
        return create_creator_chat_model(
            model_settings,
            thread_id=thread_id,
            provider_trace_collector=provider_trace_collector,
        )

    engine = ProductizedOperationEngine(
        model=model,
        project_root=settings.project_root,
        activity=activity,
        project_control=ProjectControlClient(project_root=settings.project_root),
        mutation_coordinator=mutation_coordinator,
        diagnostics=diagnostics,
        visual_observations=visual_observations,
        thread_id=thread_id,
        max_retries=model_settings.max_retries,
        recovery_factory=recovery_factory,
        selector_settings=selector_settings,
        raw_trace=model_settings.raw_trace,
        provider_trace_collector=provider_trace_collector,
        telemetry=telemetry,
        event_sink=event_sink,
        verification_mode=settings.verification_mode,
    )
    productized_result = await engine.run(messages)
    if isinstance(productized_result, ProductizedOperationRun):
        return productized_result
    if not isinstance(productized_result, CreatorResolveResult):
        raise TypeError("Productized Operation Engine returned an unknown result.")
    return await _general_domain_write_agent_result(
        settings,
        messages,
        activity,
        mutation_coordinator,
        diagnostics,
        thread_id,
        event_sink,
        telemetry,
        handoff=productized_result.handoff,
    )


async def _general_domain_write_agent_result(
    settings: CreatorServerSettings,
    messages: list[dict[str, str]],
    activity: CreatorActivityRecorder,
    mutation_coordinator: ProjectMutationCoordinator,
    diagnostics: RuntimeDiagnosticStore,
    thread_id: str,
    event_sink: CreatorEventSink,
    telemetry: CreatorRunTelemetry | None = None,
    handoff: CreatorAuthoringHandoff | None = None,
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
        thread_id=thread_id,
        provider_trace_collector=provider_trace_collector,
    )

    def recovery_factory():
        return create_creator_chat_model(
            model_settings,
            thread_id=thread_id,
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
        skills_root=settings.skills_root,
        diagnostics=diagnostics,
        thread_id=thread_id,
        automatic_completion_repair=True,
        event_sink=event_sink,
        telemetry=telemetry,
        max_retries=model_settings.max_retries,
        recovery_factory=recovery_factory,
        verification_mode=settings.verification_mode,
    )
    return await agent.run_messages(_authoring_handoff_messages(messages, handoff))


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


def _verification_telemetry(
    result: Any,
    receipt: dict[str, Any],
    telemetry: CreatorRunTelemetry,
) -> tuple[str | None, str | None]:
    static_status: str | None = None
    runtime_status: str | None = None
    if isinstance(result, ProductizedOperationRun):
        verification = (
            result.operation_result.verification
            if result.operation_result is not None
            else None
        )
        if verification is not None:
            static_status = verification.staticStatus
            runtime_status = verification.runtimeStatus
    else:
        validation = telemetry.validation
        current_result = (
            validation.current_result()
            if validation is not None
            and callable(getattr(validation, "current_result", None))
            else None
        )
        if current_result is not None:
            static_status = getattr(current_result, "status", None)
    verification_receipt = receipt.get("verification")
    if isinstance(verification_receipt, dict):
        runtime_status = verification_receipt.get("runtimeStatus", runtime_status)
    return (
        static_status if isinstance(static_status, str) else None,
        runtime_status if isinstance(runtime_status, str) else None,
    )


async def _execute_agent_run(
    agent_result: Awaitable[Any],
    *,
    activity: CreatorActivityRecorder,
    logger: CreatorRunLogger,
    event_bus: CreatorEventBus,
    telemetry: CreatorRunTelemetry | None = None,
    verification_mode: CreatorVerificationMode = DEFAULT_CREATOR_VERIFICATION_MODE,
) -> _AgentExecution:
    run_telemetry = telemetry or CreatorRunTelemetry(activity=activity)
    try:
        result = await agent_result
        receipt = activity.finish()
        completion = str(getattr(result, "completion", "success"))
        outcome = (
            completion
            if completion
            in {
                "success",
                "already_satisfied",
                "committed_unverified",
                "blocked",
                "failed",
            }
            else "success"
        )
        static_validation_status, runtime_verification_status = _verification_telemetry(
            result, receipt, run_telemetry
        )
        if isinstance(result, ProductizedOperationRun):
            logger.finish(
                outcome,
                verification_mode=verification_mode,
                static_validation_status=static_validation_status,
                runtime_verification_status=runtime_verification_status,
                metrics=result.metrics.to_dict(),
                mutation_metrics=result.app_ui_model_mutations.summary(),
                change_layer_metrics=result.change_layer_metrics,
                composition_fast_path_metrics=(
                    result.composition_fast_path_metrics.to_dict()
                    if result.composition_fast_path_metrics is not None
                    else None
                ),
                project_control_metrics=result.project_control.to_dict(),
                validation_metrics=result.validation_metrics,
                action_selector_metrics=(
                    result.action_selector_metrics
                    if result.action_selector_metrics
                    else None
                ),
                action_selection=(
                    result.selection.model_dump(mode="json")
                    if result.selection is not None
                    else None
                ),
                selected_creator_action=(
                    result.selected_action.model_dump(mode="json")
                    if result.selected_action is not None
                    else None
                ),
                selected_creator_intent=run_telemetry.selected_creator_intent,
                authoring_handoff=run_telemetry.authoring_handoff,
                creator_intent=(
                    result.intent_presentation.to_dict()
                    if result.intent_presentation is not None
                    else None
                ),
                productized_operation=(
                    result.operation_result.model_dump(
                        mode="json",
                        exclude_none=True,
                    )
                    if result.operation_result is not None
                    else None
                ),
            )
        else:
            logger.finish(
                outcome,
                verification_mode=verification_mode,
                static_validation_status=static_validation_status,
                runtime_verification_status=runtime_verification_status,
                metrics=run_telemetry.model_tool_metrics(),
                mutation_metrics=run_telemetry.mutation_metrics(),
                change_layer_metrics=run_telemetry.change_layer_metrics(),
                composition_fast_path_metrics=(
                    run_telemetry.composition_fast_path_metrics()
                ),
                project_control_metrics=run_telemetry.project_control_metrics(),
                validation_metrics=run_telemetry.validation_metrics(),
                action_selector_metrics=run_telemetry.action_selector,
                action_selection=run_telemetry.action_selection,
                selected_creator_action=run_telemetry.selected_creator_action,
                selected_creator_intent=run_telemetry.selected_creator_intent,
                authoring_handoff=run_telemetry.authoring_handoff,
                creator_intent=run_telemetry.operation_presentation,
            )
        return _AgentExecution(result=result, receipt=receipt)
    except BaseException as error:
        try:
            activity.finish()
        except Exception:
            pass
        logger.finish(
            "error",
            verification_mode=verification_mode,
            runtime_verification_status="not-run",
            metrics=run_telemetry.model_tool_metrics(),
            mutation_metrics=run_telemetry.mutation_metrics(),
            change_layer_metrics=run_telemetry.change_layer_metrics(),
            composition_fast_path_metrics=(
                run_telemetry.composition_fast_path_metrics()
            ),
            project_control_metrics=run_telemetry.project_control_metrics(),
            validation_metrics=run_telemetry.validation_metrics(),
            action_selector_metrics=run_telemetry.action_selector,
            action_selection=run_telemetry.action_selection,
            selected_creator_action=run_telemetry.selected_creator_action,
            creator_intent=run_telemetry.operation_presentation,
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
    app.state.runtime_diagnostics = diagnostics
    visual_observations = VisualObservationStore(settings.project_root)
    app.state.visual_observations = visual_observations
    pending_clarifications = PendingCreatorClarificationStore()
    app.state.pending_creator_clarifications = pending_clarifications
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
            "verificationMode": settings.verification_mode,
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

    @app.post("/visual-observation")
    async def visual_observation(request: Request) -> JSONResponse:
        try:
            payload = await _json_body(request, MAX_VISUAL_OBSERVATION_REQUEST_BYTES)
            envelope = VisualObservationEnvelope.model_validate(payload)
            metadata = visual_observations.record(envelope)
            return JSONResponse(status_code=202, content={"observation": metadata})
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
                        verification_mode=settings.verification_mode,
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
                    telemetry = CreatorRunTelemetry(activity=activity)
                    with use_pending_creator_clarifications(pending_clarifications):
                        if agent_mode == "domain-write":
                            agent_result = _domain_write_agent_result(
                                settings,
                                _conversation_messages(run_input),
                                activity,
                                mutation_coordinator,
                                diagnostics,
                                run_input.threadId,
                                event_bus,
                                telemetry,
                                visual_observations=visual_observations,
                            )
                        elif agent_mode == "domain-read":
                            agent_result = _domain_read_agent_result(
                                settings,
                                _conversation_messages(run_input),
                                activity,
                                run_input.threadId,
                                event_bus,
                                telemetry,
                                diagnostics=diagnostics,
                            )
                        else:
                            agent_result = _minimal_agent_result(
                                settings,
                                _echo_text(run_input),
                                activity,
                                run_input.threadId,
                                event_bus,
                                telemetry,
                            )
                        agent_task = asyncio.create_task(
                            _execute_agent_run(
                                agent_result,
                                activity=activity,
                                logger=logger,
                                event_bus=event_bus,
                                telemetry=telemetry,
                                verification_mode=settings.verification_mode,
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
                        tool_protocol_metrics = result.metrics.to_dict()
                        if (
                            agent_mode == "domain-write"
                            and not isinstance(result, ProductizedOperationRun)
                            and telemetry.action_selector is not None
                        ):
                            tool_protocol_metrics = telemetry.model_tool_metrics()
                        run_result = {
                            "runtime": "python",
                            "agentMode": agent_mode,
                            "phase": f"{agent_mode}-agent",
                            "toolProtocol": {
                                **tool_protocol_metrics,
                                **(
                                    getattr(result, "terminal_metrics", {})
                                    if isinstance(
                                        getattr(result, "terminal_metrics", {}), dict
                                    )
                                    else {}
                                ),
                            },
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
                            run_result.update(result.app_ui_model_mutations.summary())
                            if hasattr(result, "change_layer_metrics"):
                                run_result["changeLayer"] = (
                                    result.change_layer_metrics
                                )
                            composition_metrics = getattr(
                                result, "composition_fast_path_metrics", None
                            )
                            if composition_metrics is not None:
                                run_result["compositionFastPath"] = (
                                    composition_metrics.to_dict()
                                )
                            validation_metrics = telemetry.validation_metrics()
                            if validation_metrics is not None:
                                run_result["validationMetrics"] = validation_metrics
                            if isinstance(result, ProductizedOperationRun):
                                if result.operation_result is not None:
                                    run_result["phase"] = "productized-operation"
                                elif result.selection is not None and result.selection.decision == "unsupported_product_action":
                                    run_result["phase"] = "productized-unsupported"
                                else:
                                    run_result["phase"] = "productized-clarification"
                                if result.action_selector_metrics:
                                    run_result["actionSelector"] = (
                                        result.action_selector_metrics
                                    )
                                if result.selection is not None:
                                    run_result["actionSelection"] = (
                                        result.selection.model_dump(mode="json")
                                    )
                                if result.selected_action is not None:
                                    run_result["selectedCreatorAction"] = (
                                        result.selected_action.model_dump(mode="json")
                                    )
                                run_result["domainSnapshot"] = (
                                    result.snapshot_metrics.to_dict()
                                )
                                if result.operation_result is not None:
                                    run_result["productizedOperation"] = (
                                        result.operation_result.model_dump(mode="json")
                                    )
                                elif result.selection is not None and result.selection.decision == "needs_clarification":
                                    run_result["clarificationQuestion"] = (
                                        result.selection.clarificationQuestion
                                    )
                            operation_route = getattr(telemetry, "operation_route", None)
                            if isinstance(operation_route, dict):
                                run_result["productizedRoute"] = operation_route
                            operation_presentation = getattr(
                                result,
                                "intent_presentation",
                                None,
                            )
                            if operation_presentation is not None:
                                run_result["creatorIntent"] = (
                                    operation_presentation.to_dict()
                                )
                            elif isinstance(
                                getattr(telemetry, "operation_presentation", None),
                                dict,
                            ):
                                run_result["creatorIntent"] = (
                                    telemetry.operation_presentation
                                )
                            action_selector = getattr(
                                telemetry, "action_selector", None
                            )
                            if isinstance(action_selector, dict):
                                run_result["actionSelector"] = action_selector
                            action_selection = getattr(
                                telemetry, "action_selection", None
                            )
                            if isinstance(action_selection, dict):
                                run_result["actionSelection"] = action_selection
                            selected_creator_action = getattr(
                                telemetry, "selected_creator_action", None
                            )
                            if isinstance(selected_creator_action, dict):
                                run_result["selectedCreatorAction"] = selected_creator_action
                            selected_creator_intent = getattr(
                                telemetry, "selected_creator_intent", None
                            )
                            if isinstance(selected_creator_intent, dict):
                                run_result["selectedCreatorIntent"] = selected_creator_intent
                            authoring_handoff = getattr(
                                telemetry, "authoring_handoff", None
                            )
                            if isinstance(authoring_handoff, dict):
                                run_result["authoringHandoff"] = authoring_handoff
                    else:
                        run_result = {
                            "runtime": "python",
                            "agentMode": agent_mode,
                            "phase": "minimal-agent",
                            "toolProtocol": result.metrics.to_dict(),
                            "streaming": event_bus.metrics().to_dict(),
                        }
                    completion = str(getattr(result, "completion", "success"))
                    run_result["completion"] = completion
                    static_validation_status, runtime_verification_status = (
                        _verification_telemetry(result, execution.receipt, telemetry)
                    )
                    run_result["verificationMode"] = settings.verification_mode
                    if static_validation_status is not None:
                        run_result["staticValidationStatus"] = static_validation_status
                    if runtime_verification_status is not None:
                        run_result["runtimeVerificationStatus"] = runtime_verification_status
                    blocker = getattr(result, "blocker", None)
                    if isinstance(blocker, dict):
                        run_result["blocker"] = blocker
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
