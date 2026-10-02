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
from typing import Any, AsyncIterator, Literal
from uuid import uuid4

import uvicorn
from ag_ui.core import (
    CustomEvent,
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
from langgraph.checkpoint.memory import InMemorySaver
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
from .plugin_development.authority import PluginDevelopmentAuthority, PluginDevelopmentError
from .plugin_development.admission_middleware import PluginDevelopmentAdmissionMiddleware
from .plugin_development.prepare_tool import (
    DEVELOPMENT_DECISION_STEP_ID,
    is_development_decision_question,
)
from .run_cancellation import bind_run_cancellation
from .streaming import CreatorEventBus, CreatorEventSink, map_runtime_event
from .streaming.deepagent_v3_runner import DeepAgentInterrupted
from .human_input.models import QuestionAnswers, QuestionRequest
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
    forwardedProps: dict[str, Any] = Field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class CreatorInterruptEnvelope:
    id: str
    reason: str
    metadata: dict[str, Any]
    toolCallId: str | None = None

    def to_wire(self) -> dict[str, Any]:
        return {
            "id": self.id, "reason": self.reason, "metadata": self.metadata,
            **({"toolCallId": self.toolCallId} if self.toolCallId else {}),
        }


CreatorExecutionPermission = Literal[
    "inspect_read_only", "domain_write", "domain_read_legacy"
]


@dataclass(slots=True)
class CreatorExecutionContext:
    permission: CreatorExecutionPermission | None = None


@dataclass(frozen=True, slots=True)
class PendingCreatorQuestion:
    envelope: CreatorInterruptEnvelope
    messages: list[dict[str, str]]
    thread_id: str
    agent_mode: str
    permission: CreatorExecutionPermission
    checkpoint_id: str
    run_id: str


def _question_envelope(interrupted: DeepAgentInterrupted) -> CreatorInterruptEnvelope:
    if len(interrupted.interrupts) != 1:
        raise ValueError("Creator supports one pending question at a time.")
    raw = interrupted.interrupts[0]
    value = raw.get("value")
    if not isinstance(value, dict) or value.get("kind") != "ask_user_question":
        raise ValueError("Unsupported Creator interrupt kind.")
    request = QuestionRequest.model_validate({key: item for key, item in value.items() if key != "kind"})
    return CreatorInterruptEnvelope(
        id=str(raw["id"]), reason="human_input",
        metadata={"kind": "ask_user_question", **request.model_dump(mode="json", exclude_none=True)},
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


async def _checkpoint_input_messages(
    checkpointer: Any, thread_id: str, messages: list[dict[str, str]]
) -> list[dict[str, str]]:
    """A live graph already has its transcript; append only the new user turn."""
    if checkpointer is None or not callable(getattr(checkpointer, "aget_tuple", None)):
        return messages
    checkpoint = await checkpointer.aget_tuple({"configurable": {"thread_id": thread_id}})
    if checkpoint is None:
        return messages
    latest_user = next((message for message in reversed(messages) if message.get("role") == "user"), None)
    system_messages = [message for message in messages if message.get("role") == "system"]
    return [*system_messages, *([latest_user] if latest_user is not None else [])]


async def _checkpoint_id(checkpointer: Any, thread_id: str) -> str | None:
    if not callable(getattr(checkpointer, "aget_tuple", None)):
        return None
    try:
        saved = await checkpointer.aget_tuple(
            {"configurable": {"thread_id": thread_id}}
        )
    except Exception:
        return None
    checkpoint = getattr(saved, "checkpoint", None)
    value = checkpoint.get("id") if isinstance(checkpoint, dict) else None
    return value if isinstance(value, str) and value else None


def _permission_matches(agent_mode: str, permission: str | None) -> bool:
    return (
        (agent_mode == "domain-write" and permission in {"inspect_read_only", "domain_write"})
        or (agent_mode == "domain-read" and permission == "domain_read_legacy")
    )


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
    checkpointer: Any = None,
    resume: dict[str, Any] | None = None,
    inspect_read_only: bool = False,
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
        checkpointer=checkpointer,
        workspace=settings.project_root,
        mode="development",
        permission_scope="inspect_read_only" if inspect_read_only else "legacy",
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
    graph_messages = await _checkpoint_input_messages(checkpointer, thread_id, messages) if resume is None else messages
    return await agent.run_messages(graph_messages) if resume is None else await agent.run_messages(messages, resume=resume)


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
    checkpointer: Any = None,
    execution_context: CreatorExecutionContext | None = None,
    development_authority: PluginDevelopmentAuthority | None = None,
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
    current_user_message = next((item["content"] for item in reversed(messages)
                                 if item.get("role") == "user"), "")
    if development_authority is not None:
        development_authority.begin_task(
            task_id=activity.run_id, request_id=activity.run_id,
            user_message=current_user_message, intent="none",
        )
    productized_result = await engine.run(messages)
    if isinstance(productized_result, ProductizedOperationRun):
        return productized_result
    if not isinstance(productized_result, CreatorResolveResult):
        raise TypeError("Productized Operation Engine returned an unknown result.")
    if development_authority is not None:
        development_authority.begin_task(
            task_id=activity.run_id, request_id=activity.run_id,
            user_message=current_user_message,
            intent=productized_result.selection.developmentIntent,
        )
    if productized_result.route == "read_only_general":
        if execution_context is not None:
            execution_context.permission = "inspect_read_only"
        return await _domain_read_agent_result(
            settings,
            messages,
            activity,
            thread_id,
            event_sink,
            telemetry,
            diagnostics=diagnostics,
            checkpointer=checkpointer,
            inspect_read_only=True,
        )
    if execution_context is not None:
        execution_context.permission = "domain_write"
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
        checkpointer=checkpointer,
        development_authority=development_authority,
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
    checkpointer: Any = None,
    resume: dict[str, Any] | None = None,
    development_authority: PluginDevelopmentAuthority | None = None,
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
        checkpointer=checkpointer,
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
        plugin_development_authority=development_authority,
    )
    if (resume is None and handoff is not None and handoff.kind == "plugin_source"
            and handoff.pluginId is not None and development_authority is not None
            and PluginDevelopmentAdmissionMiddleware(
                development_authority
            ).customized_source_decision_required(handoff.pluginId)):
        development_authority.blocked_customized_source_plugin_id = handoff.pluginId
        if activity.logger is not None:
            activity.logger.record("creator_source_boundary", {
                "itemId": f"plugin/{handoff.pluginId}",
                "code": "PLUGIN_CUSTOMIZED_SOURCE_DECISION_REQUIRED",
                "projectChanged": False,
            })
        assert agent.completion_gate is not None
        decision = agent.completion_gate.review("")
        return agent._build_result(text=decision.text, completion="success")
    input_messages = _authoring_handoff_messages(messages, handoff)
    graph_messages = await _checkpoint_input_messages(checkpointer, thread_id, input_messages) if resume is None else input_messages
    return await agent.run_messages(graph_messages) if resume is None else await agent.run_messages(input_messages, resume=resume)


def _error_code(error: Exception) -> str:
    code = getattr(error, "code", None)
    if isinstance(code, str) and code:
        return code
    if isinstance(error, CreatorModelConfigurationError):
        return "MODEL_CONFIGURATION_ERROR"
    return "CREATOR_PYTHON_AGENT_ERROR"


def _failed_run_change_summary(activity: CreatorActivityRecorder) -> str:
    try:
        receipt = activity.finish()
    except Exception:
        return ""
    files = receipt.get("files")
    if not isinstance(files, list) or not files:
        return ""
    paths = [
        path.replace("\n", " ").replace("\r", " ")[:120]
        for file in files
        if isinstance(file, dict) and isinstance(path := file.get("path"), str)
    ]
    if not paths:
        return ""
    visible = "、".join(paths[:6])
    if len(paths) > 6:
        visible += f" 等共 {len(paths)} 个文件"
    verification = receipt.get("verification")
    status = verification.get("status") if isinstance(verification, dict) else None
    scope = {
        "changed-and-statically-verified": "当前版本静态检查已通过，Runtime 与浏览器未验证",
        "changed-and-verified": "当前版本的配置模式验证已通过",
        "not-run": "尚未验证",
    }.get(status, "尚未确认当前版本通过验证")
    return f"本次已提交并保留目标工程修改：{visible}。{scope}。"


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
        if isinstance(result, DeepAgentInterrupted):
            logger.finish("interrupted", verification_mode=verification_mode,
                          runtime_verification_status="not-run")
            return _AgentExecution(result=result, receipt=receipt)
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
    checkpointer = InMemorySaver()
    pending_questions: dict[str, PendingCreatorQuestion] = {}
    active_runs: dict[str, tuple[str, CreatorEventBus, asyncio.Task[Any], Path]] = {}
    stopped_requests: dict[tuple[str, str], str] = {}
    development_authorities: dict[str, PluginDevelopmentAuthority] = {}
    app.state.plugin_development_authorities = development_authorities

    def development_authority_for(thread_id: str) -> PluginDevelopmentAuthority:
        current = development_authorities.get(thread_id)
        if current is None:
            current = PluginDevelopmentAuthority(
                settings.project_root, thread_id=thread_id,
                skills_root=settings.skills_root,
            )
            development_authorities[thread_id] = current
        return current
    app.state.creator_checkpointer = checkpointer
    app.state.pending_creator_questions = pending_questions

    @app.post("/creator-control")
    async def creator_control(request: Request) -> JSONResponse:
        try:
            payload = await _json_body(request, 4096)
            if not isinstance(payload, dict) or payload.get("action") not in {"stop", "abandon"}:
                raise ValueError("Expected a stop or abandon action.")
            thread_id = payload.get("threadId")
            run_id = payload.get("runId")
            interrupt_id = payload.get("interruptId")
            if not isinstance(thread_id, str) or not thread_id:
                raise ValueError("threadId is required.")
            active = active_runs.get(thread_id)
            pending = pending_questions.get(thread_id)
            request_key = (thread_id, run_id if isinstance(run_id, str) else interrupt_id)
            if isinstance(request_key[1], str) and request_key in stopped_requests:
                return JSONResponse(status_code=200, content={"status": stopped_requests[request_key]})
            if active is not None and isinstance(run_id, str) and active[0] == run_id and not active[2].done():
                if (active[3].parents[1].is_symlink() or active[3].parent.is_symlink()):
                    raise ValueError("Creator control directory cannot be a symbolic link.")
                active[3].parent.mkdir(parents=True, exist_ok=True)
                active[3].write_text("stop\n", encoding="utf-8")
                active[1].request_stop()
                development_authority_for(thread_id).revoke_active()
                stopped_requests[request_key] = "stopping"
                if len(stopped_requests) > 128:
                    stopped_requests.pop(next(iter(stopped_requests)))
                return JSONResponse(status_code=202, content={"status": "stopping", "runId": run_id})
            if (payload["action"] == "abandon" and pending is not None
                    and isinstance(interrupt_id, str)
                    and pending.envelope.id == interrupt_id):
                pending_questions.pop(thread_id, None)
                development_authority_for(thread_id).revoke_active()
                await checkpointer.adelete_thread(thread_id)
                stopped_requests[request_key] = "abandoned"
                if len(stopped_requests) > 128:
                    stopped_requests.pop(next(iter(stopped_requests)))
                return JSONResponse(status_code=200, content={"status": "abandoned", "runId": pending.run_id})
            return JSONResponse(status_code=404, content={"error": "Creator run or question is no longer active."})
        except ValueError as error:
            return JSONResponse(status_code=400, content={"error": str(error)})

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

                def reject_interrupt(code: str, message: str) -> RunErrorEvent:
                    if activity is not None and logger is not None:
                        activity.finish()
                        logger.finish("error", verification_mode=settings.verification_mode,
                                      runtime_verification_status="not-run")
                    return RunErrorEvent(type=EventType.RUN_ERROR, code=code, message=message)

                yield encode(
                    RunStartedEvent(
                        type=EventType.RUN_STARTED,
                        thread_id=run_input.threadId,
                        run_id=run_input.runId,
                    )
                )
                command = run_input.forwardedProps.get("command")
                resume_requested = isinstance(command, dict) and "resume" in command
                pending = pending_questions.get(run_input.threadId)
                development_authority = development_authority_for(run_input.threadId)
                resume_answers: dict[str, Any] | None = None
                if resume_requested:
                    if pending is None:
                        yield encode(reject_interrupt("CREATOR_INTERRUPT_NOT_FOUND",
                            "这个问题对应的 Agent 执行状态已经失效，请重新发起请求。"))
                        return
                    if (
                        not isinstance(pending, PendingCreatorQuestion)
                        or pending.thread_id != run_input.threadId
                        or pending.agent_mode != agent_mode
                        or not _permission_matches(agent_mode, pending.permission)
                        or not isinstance(pending.checkpoint_id, str)
                        or not pending.checkpoint_id
                        or await _checkpoint_id(checkpointer, run_input.threadId)
                        != pending.checkpoint_id
                    ):
                        pending_questions.pop(run_input.threadId, None)
                        await checkpointer.adelete_thread(run_input.threadId)
                        yield encode(reject_interrupt("CREATOR_INTERRUPT_CONTEXT_INVALID",
                            "这个问题的执行权限或检查点已经失效，请重新发起请求。"))
                        return
                    payload = command["resume"]
                    try:
                        if not isinstance(payload, dict) or payload.get("interruptId") != pending.envelope.id:
                            raise ValueError("interruptId does not match the pending question")
                        request = QuestionRequest.model_validate({key: value for key, value in pending.envelope.metadata.items() if key != "kind"})
                        resume_answers = QuestionAnswers.model_validate({"answers": payload.get("answers")}).validate_for(request).model_dump(mode="json")
                        active = development_authority.active
                        if active is not None and active.status == "pending" and active.question_id is not None:
                            if not is_development_decision_question(pending.envelope.metadata):
                                raise PluginDevelopmentError("开发决策问题类型不匹配。")
                            selected = resume_answers["answers"][DEVELOPMENT_DECISION_STEP_ID]
                            development_authority.decide(
                                active.proposal_id, question_id=pending.envelope.id,
                                checkpoint_id=pending.checkpoint_id, choice=selected[0],
                            )
                    except (ValueError, ValidationError) as error:
                        yield encode(reject_interrupt("CREATOR_INTERRUPT_INVALID_ANSWER", str(error)))
                        return
                elif pending is not None:
                    yield encode(reject_interrupt("CREATOR_INTERRUPT_PENDING",
                        "请先回答当前问题，再继续 Creator 会话。"))
                    return
                if agent_mode in {"minimal", "domain-read", "domain-write"}:
                    assert activity is not None
                    assert logger is not None
                    event_bus = CreatorEventBus()
                    telemetry = CreatorRunTelemetry(activity=activity)
                    execution_context = CreatorExecutionContext()
                    with use_pending_creator_clarifications(pending_clarifications):
                        if agent_mode == "domain-write":
                            messages = pending.messages if pending is not None else _conversation_messages(run_input)
                            if resume_requested:
                                execution_context.permission = pending.permission
                                if pending.permission == "inspect_read_only":
                                    agent_result = _domain_read_agent_result(
                                        settings, messages, activity, run_input.threadId,
                                        event_bus, telemetry, diagnostics=diagnostics,
                                        checkpointer=checkpointer, resume=resume_answers,
                                        inspect_read_only=True,
                                    )
                                else:
                                    agent_result = _general_domain_write_agent_result(
                                        settings, messages, activity, mutation_coordinator,
                                        diagnostics, run_input.threadId, event_bus, telemetry,
                                        checkpointer=checkpointer, resume=resume_answers,
                                        development_authority=development_authority,
                                    )
                            else:
                                agent_result = _domain_write_agent_result(
                                    settings, messages, activity, mutation_coordinator,
                                    diagnostics, run_input.threadId, event_bus, telemetry,
                                    visual_observations=visual_observations,
                                    checkpointer=checkpointer,
                                    execution_context=execution_context,
                                    development_authority=development_authority,
                                )
                        elif agent_mode == "domain-read":
                            execution_context.permission = "domain_read_legacy"
                            agent_result = _domain_read_agent_result(
                                settings,
                                pending.messages if pending is not None else _conversation_messages(run_input),
                                activity,
                                run_input.threadId,
                                event_bus,
                                telemetry,
                                diagnostics=diagnostics,
                                checkpointer=checkpointer,
                                resume=resume_answers,
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
                        cancel_marker = settings.project_root.resolve() / ".agentuicreator" / "control" / f"cancel-{uuid4()}"
                        with bind_run_cancellation(lambda: event_bus.cancel_requested, cancel_marker):
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
                        active_runs[run_input.threadId] = (run_input.runId, event_bus, agent_task, cancel_marker)

                    def consume_background_result(task: asyncio.Task[Any]) -> None:
                        try:
                            task.exception()
                        except asyncio.CancelledError:
                            pass

                    agent_task.add_done_callback(consume_background_result)
                    agent_task.add_done_callback(lambda _task: cancel_marker.unlink(missing_ok=True))
                    try:
                        async for runtime_event in event_bus.events():
                            for ag_ui_event in map_runtime_event(runtime_event):
                                yield encode(ag_ui_event)
                        execution = await agent_task
                    except asyncio.CancelledError:
                        if event_bus.stop_requested:
                            development_authority.revoke_active()
                            pending_questions.pop(run_input.threadId, None)
                            await checkpointer.adelete_thread(run_input.threadId)
                            stopped_requests[(run_input.threadId, run_input.runId)] = "stopped"
                            changed_summary = _failed_run_change_summary(activity)
                            yield encode(RunErrorEvent(
                                type=EventType.RUN_ERROR, code="CREATOR_RUN_STOPPED",
                                message="已停止本次 Creator 执行；已提交的修改保留。"
                                        + (f" {changed_summary}" if changed_summary else " 本轮没有项目文件修改。"),
                            ))
                            return
                        event_bus.request_cancel()
                        if not event_bus.has_active_tools and not agent_task.done():
                            agent_task.cancel()
                        raise
                    except Exception as error:
                        event_bus.request_cancel()
                        if not event_bus.has_active_tools and not agent_task.done():
                            agent_task.cancel()
                        if event_bus.stop_requested and not agent_task.done():
                            await asyncio.gather(agent_task, return_exceptions=True)
                        changed_summary = (
                            _failed_run_change_summary(activity) if agent_task.done() else ""
                        )
                        if event_bus.stop_requested:
                            pending_questions.pop(run_input.threadId, None)
                            development_authority.revoke_active()
                            await checkpointer.adelete_thread(run_input.threadId)
                            stopped_requests[(run_input.threadId, run_input.runId)] = "stopped"
                        yield encode(
                            RunErrorEvent(
                                type=EventType.RUN_ERROR,
                                code="CREATOR_RUN_STOPPED" if event_bus.stop_requested else _error_code(error),
                                message=(("已停止本次 Creator 执行；已提交的修改保留。" if event_bus.stop_requested
                                          else f"Creator Agent 执行失败：{error}")
                                         + (f" {changed_summary}" if changed_summary else "")),
                            )
                        )
                        return
                    finally:
                        active_runs.pop(run_input.threadId, None)
                        if not agent_task.done():
                            event_bus.request_cancel()
                            if not event_bus.has_active_tools:
                                agent_task.cancel()
                    result = execution.result
                    if event_bus.cancel_requested:
                        pending_questions.pop(run_input.threadId, None)
                        development_authority.revoke_active()
                        await checkpointer.adelete_thread(run_input.threadId)
                        stopped_requests[(run_input.threadId, run_input.runId)] = "stopped"
                        changed_summary = _failed_run_change_summary(activity)
                        yield encode(RunErrorEvent(
                            type=EventType.RUN_ERROR, code="CREATOR_RUN_STOPPED",
                            message="已停止本次 Creator 执行；已提交的修改保留。"
                                    + (f" {changed_summary}" if changed_summary else " 本轮没有项目文件修改。"),
                        ))
                        return
                    if isinstance(result, DeepAgentInterrupted):
                        try:
                            envelope = _question_envelope(result)
                        except (ValueError, ValidationError) as error:
                            yield encode(RunErrorEvent(type=EventType.RUN_ERROR,
                                code="CREATOR_INTERRUPT_UNSUPPORTED", message=str(error)))
                            return
                        checkpoint_id = await _checkpoint_id(checkpointer, run_input.threadId)
                        if (
                            checkpoint_id is None
                            or not _permission_matches(agent_mode, execution_context.permission)
                        ):
                            pending_questions.pop(run_input.threadId, None)
                            await checkpointer.adelete_thread(run_input.threadId)
                            yield encode(RunErrorEvent(type=EventType.RUN_ERROR,
                                code="CREATOR_INTERRUPT_CONTEXT_INVALID",
                                message="无法保存这个问题的执行权限或检查点，请重新发起请求。"))
                            return
                        pending_questions[run_input.threadId] = PendingCreatorQuestion(
                            envelope=envelope,
                            messages=pending.messages if pending is not None else _conversation_messages(run_input),
                            thread_id=run_input.threadId,
                            agent_mode=agent_mode,
                            permission=execution_context.permission,
                            checkpoint_id=checkpoint_id,
                            run_id=run_input.runId,
                        )
                        active = development_authority.active
                        if (agent_mode == "domain-write" and execution_context.permission == "domain_write"
                                and active is not None and active.status == "pending"
                                and active.question_id is None
                                and is_development_decision_question(envelope.metadata)):
                            try:
                                development_authority.bind_question(
                                    active.proposal_id, question_id=envelope.id,
                                    checkpoint_id=checkpoint_id,
                                    question={key: value for key, value in envelope.metadata.items()
                                              if key != "kind"},
                                )
                            except PluginDevelopmentError as error:
                                pending_questions.pop(run_input.threadId, None)
                                await checkpointer.adelete_thread(run_input.threadId)
                                development_authority.revoke_active()
                                yield encode(RunErrorEvent(type=EventType.RUN_ERROR,
                                    code="CREATOR_INTERRUPT_CONTEXT_INVALID", message=str(error)))
                                return
                        yield encode(CustomEvent(type=EventType.CUSTOM,
                            name="on_interrupt", value=envelope.to_wire()))
                        yield encode(RunFinishedEvent(type=EventType.RUN_FINISHED,
                            thread_id=run_input.threadId, run_id=run_input.runId))
                        return
                    if resume_requested:
                        pending_questions.pop(run_input.threadId, None)
                    response_text = result.text
                    decision = development_authority.active
                    if decision is not None and decision.status == "defer":
                        response_text = "已按你的选择暂不开发；目标工程未因该方案修改。"
                    elif decision is not None and decision.status == "adjust":
                        response_text = "已结束当前开发方案；请说明调整后的需求。目标工程未因该方案修改。"
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
                        if decision is not None:
                            run_result["pluginDevelopment"] = decision.public_result()
                        if agent_mode == "domain-write" and hasattr(result, "app_ui_model_mutations"):
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
                        elif execution_context.permission == "inspect_read_only":
                            run_result["phase"] = "domain-read-agent"
                            run_result["executionPolicy"] = "read-only"
                        if agent_mode == "domain-write":
                            operation_route = getattr(telemetry, "operation_route", None)
                            if isinstance(operation_route, dict):
                                run_result["productizedRoute"] = operation_route
                            operation_presentation = getattr(result, "intent_presentation", None)
                            if operation_presentation is not None:
                                run_result["creatorIntent"] = operation_presentation.to_dict()
                            elif isinstance(getattr(telemetry, "operation_presentation", None), dict):
                                run_result["creatorIntent"] = telemetry.operation_presentation
                            for field, telemetry_field in (
                                ("actionSelector", "action_selector"),
                                ("actionSelection", "action_selection"),
                                ("selectedCreatorAction", "selected_creator_action"),
                                ("selectedCreatorIntent", "selected_creator_intent"),
                                ("authoringHandoff", "authoring_handoff"),
                            ):
                                value = getattr(telemetry, telemetry_field, None)
                                if isinstance(value, dict):
                                    run_result[field] = value
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
