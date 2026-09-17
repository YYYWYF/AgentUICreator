from __future__ import annotations

import httpx
from langchain_openai import ChatOpenAI

from .model_protocol.provider_trace import ProviderResponseTraceCollector
from .model_settings import CreatorModelSettings

CREATOR_MODEL_USER_AGENT = "agent-ui-creator/0.1"


def create_creator_chat_model(
    settings: CreatorModelSettings,
    *,
    thread_id: str | None = None,
    provider_trace_collector: ProviderResponseTraceCollector | None = None,
    http_transport: httpx.BaseTransport | None = None,
    http_async_transport: httpx.AsyncBaseTransport | None = None,
) -> ChatOpenAI:
    """Create the pre-initialized OpenAI Chat Completions model owned by Creator."""

    timeout = httpx.Timeout(timeout=settings.timeout_seconds, connect=30.0)
    sync_hooks = (
        {"response": [provider_trace_collector.on_response]}
        if provider_trace_collector is not None and provider_trace_collector.enabled
        else None
    )
    async_hooks = (
        {"response": [provider_trace_collector.on_async_response]}
        if provider_trace_collector is not None and provider_trace_collector.enabled
        else None
    )
    default_headers = {"User-Agent": CREATOR_MODEL_USER_AGENT}
    if thread_id is not None:
        default_headers["x-opencode-session"] = thread_id
    return ChatOpenAI(
        model=settings.model_name,
        base_url=settings.base_url,
        api_key=settings.api_key,
        default_headers=default_headers,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        timeout=settings.timeout_seconds,
        max_retries=0,
        streaming=False,
        use_responses_api=False,
        http_client=httpx.Client(
            timeout=timeout,
            event_hooks=sync_hooks,
            transport=http_transport,
        ),
        http_async_client=httpx.AsyncClient(
            timeout=timeout,
            event_hooks=async_hooks,
            transport=http_async_transport,
        ),
    )
