from types import SimpleNamespace
from unittest.mock import Mock

from langchain.agents.middleware import ModelRequest, ModelResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from agent_ui_creator.domain_agent.grounding_convergence import (
    COMPOSITION_GROUNDING_CONTROL,
    CompositionGroundingConvergenceMiddleware,
)
from agent_ui_creator.domain_state import DomainObservationContext
from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PolicyFilesystemBackend,
)


COMPOSITION_COVERAGE = (
    "composition.model",
    "composition.layout",
    "composition.slots",
    "composition.instances",
    "capability.inventory",
    "capability.composition-summary",
)


def test_grounded_composition_injects_short_execution_control(tmp_path):
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    observations = DomainObservationContext()
    middleware = CompositionGroundingConvergenceMiddleware(observations, backend)
    request = ModelRequest(
        model=Mock(),
        messages=[HumanMessage(content="添加会话管理")],
        tools=[SimpleNamespace(name="mutate_app_ui_model")],
    )
    seen = []

    def handler(candidate):
        seen.append(candidate.messages)
        return ModelResponse(result=[AIMessage(content="done")])

    middleware.wrap_model_call(request, handler)
    assert not any(
        isinstance(message, SystemMessage)
        and message.content == COMPOSITION_GROUNDING_CONTROL
        for message in seen[-1]
    )

    observations.observe_composition_snapshot(
        hash="a" * 64,
        revision=0,
        coverage=COMPOSITION_COVERAGE,
    )
    middleware.wrap_model_call(request, handler)
    assert sum(
        isinstance(message, SystemMessage)
        and message.content == COMPOSITION_GROUNDING_CONTROL
        for message in seen[-1]
    ) == 1

    backend.activity.touch("app-ui/app-ui.json")
    middleware.wrap_model_call(request, handler)
    assert not any(
        isinstance(message, SystemMessage)
        and message.content == COMPOSITION_GROUNDING_CONTROL
        for message in seen[-1]
    )
