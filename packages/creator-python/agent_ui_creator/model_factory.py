from __future__ import annotations

import httpx
from langchain_openai import ChatOpenAI

from .model_settings import CreatorModelSettings


def create_creator_chat_model(settings: CreatorModelSettings) -> ChatOpenAI:
    """Create the pre-initialized OpenAI Chat Completions model owned by Creator."""

    timeout = httpx.Timeout(timeout=settings.timeout_seconds, connect=30.0)
    return ChatOpenAI(
        model=settings.model_name,
        base_url=settings.base_url,
        api_key=settings.api_key,
        temperature=settings.temperature,
        max_tokens=settings.max_tokens,
        timeout=settings.timeout_seconds,
        max_retries=settings.max_retries,
        streaming=False,
        use_responses_api=False,
        http_client=httpx.Client(timeout=timeout),
        http_async_client=httpx.AsyncClient(timeout=timeout),
    )

