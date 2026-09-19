from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Iterator

from .models import MAX_CLARIFICATION_QUESTION_CHARS


MAX_PREVIOUS_CREATOR_REQUEST_CHARS = 500


@dataclass(frozen=True, slots=True)
class PendingCreatorClarification:
    """The one bounded Productized clarification pending for a thread."""

    previousUserRequest: str
    clarificationQuestion: str

    def to_selector_context(self) -> dict[str, str]:
        return {
            "previousUserRequest": self.previousUserRequest,
            "previousCreatorClarification": self.clarificationQuestion,
        }


class PendingCreatorClarificationStore:
    """Keep at most one bounded clarification continuation per thread."""

    def __init__(self) -> None:
        self._pending: dict[str, PendingCreatorClarification] = {}

    def consume(self, thread_id: str) -> PendingCreatorClarification | None:
        return self._pending.pop(thread_id, None)

    def replace(
        self,
        thread_id: str,
        *,
        previous_user_request: str,
        clarification_question: str,
    ) -> PendingCreatorClarification:
        if not thread_id.strip():
            raise ValueError("A clarification thread id is required.")
        previous_request = previous_user_request.strip()
        question = clarification_question.strip()
        if not previous_request or not question:
            raise ValueError("A pending clarification requires bounded non-empty text.")
        pending = PendingCreatorClarification(
            previousUserRequest=previous_request[:MAX_PREVIOUS_CREATOR_REQUEST_CHARS],
            clarificationQuestion=question[:MAX_CLARIFICATION_QUESTION_CHARS],
        )
        self._pending[thread_id] = pending
        return pending

    def restore(
        self,
        thread_id: str,
        pending: PendingCreatorClarification,
    ) -> None:
        if not thread_id.strip():
            raise ValueError("A clarification thread id is required.")
        self._pending[thread_id] = pending

    def clear(self, thread_id: str) -> None:
        self._pending.pop(thread_id, None)

    def peek(self, thread_id: str) -> PendingCreatorClarification | None:
        return self._pending.get(thread_id)


_CURRENT_STORE: ContextVar[PendingCreatorClarificationStore | None] = ContextVar(
    "creator_pending_clarification_store",
    default=None,
)


def current_pending_creator_clarifications() -> PendingCreatorClarificationStore | None:
    return _CURRENT_STORE.get()


@contextmanager
def use_pending_creator_clarifications(
    store: PendingCreatorClarificationStore,
) -> Iterator[None]:
    token = _CURRENT_STORE.set(store)
    try:
        yield
    finally:
        _CURRENT_STORE.reset(token)
