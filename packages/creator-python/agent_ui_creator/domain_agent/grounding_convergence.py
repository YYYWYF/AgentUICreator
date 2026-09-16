from __future__ import annotations

from collections.abc import Awaitable, Callable

from langchain.agents.middleware import AgentMiddleware, ModelRequest, ModelResponse
from langchain_core.messages import SystemMessage

from ..domain_state import DomainObservationContext
from ..minimal_agent.path_policy import PolicyFilesystemBackend


COMPOSITION_GROUNDING_CONTROL = """Composition grounding is sufficient.
Authoritative evidence already covers the AppUIModel hash, Layout refs and sizes,
Slots and current instances, available Plugin capability summaries, and Active
Composition. For a pure Composition change, the next side effect should be
mutate_app_ui_model. Do not read Plugin source, CSS, Services, or generated files.
Expand grounding only when the user's desired state is cross-layer or the Host
reports stale state, a missing decisive fact, or another-layer requirement."""


class CompositionGroundingConvergenceMiddleware(AgentMiddleware):
    """Inject execution control while the authoritative Composition snapshot is fresh."""

    def __init__(
        self,
        observations: DomainObservationContext,
        backend: PolicyFilesystemBackend,
    ) -> None:
        self.observations = observations
        self.backend = backend

    def _request(self, request: ModelRequest) -> ModelRequest:
        if self.observations.composition_grounding_status(
            current_revision=self.backend.mutation_revision
        ) != "grounded":
            return request
        return request.override(
            messages=[
                *request.messages,
                SystemMessage(content=COMPOSITION_GROUNDING_CONTROL),
            ]
        )

    def wrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], ModelResponse],
    ) -> ModelResponse:
        return handler(self._request(request))

    async def awrap_model_call(
        self,
        request: ModelRequest,
        handler: Callable[[ModelRequest], Awaitable[ModelResponse]],
    ) -> ModelResponse:
        return await handler(self._request(request))
