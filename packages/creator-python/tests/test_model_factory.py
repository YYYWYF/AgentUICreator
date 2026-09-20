import httpx
import pytest
import asyncio
from langchain_core.messages import AIMessage
from langchain_openai import ChatOpenAI

import agent_ui_creator.minimal_agent.agent as agent_module
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import (
    CreatorModelConfigurationError,
    CreatorModelSettings,
    CreatorSelectorModelSettings,
    load_python_agent_mode,
)
from agent_ui_creator.config import CreatorServerSettings
from agent_ui_creator.operations import CreatorActionSelector
from agent_ui_creator.server import _domain_write_agent_result
from agent_ui_creator.verification_policy import resolve_creator_verification_mode


def test_model_factory_sets_creator_user_agent_without_provider_session_header():
    requests = []
    transport = httpx.MockTransport(
        lambda request: (
            requests.append(request)
            or httpx.Response(
                200,
                json={
                    "id": "chatcmpl-test",
                    "object": "chat.completion",
                    "created": 0,
                    "model": "mimo-v2.5-pro",
                    "choices": [
                        {
                            "index": 0,
                            "message": {"role": "assistant", "content": "ok"},
                            "finish_reason": "stop",
                        }
                    ],
                },
            )
        )
    )
    model = create_creator_chat_model(
        CreatorModelSettings(
            model_name="mimo-v2.5-pro",
            base_url="https://model.example/v1",
            api_key="secret",
        ),
        thread_id="creator-thread",
        http_transport=transport,
        http_async_transport=transport,
    )

    # This fixture returns a complete JSON response; the production factory is streaming.
    model.streaming = False
    model.invoke("hello")

    assert requests[0].headers["User-Agent"] == "agent-ui-creator/0.1"
    assert "x-opencode-session" not in requests[0].headers


def test_model_factory_owns_explicit_chat_completions_configuration():
    model = create_creator_chat_model(
        CreatorModelSettings(
            model_name="mimo-v2.5-pro",
            base_url="https://model.example/v1",
            api_key="secret",
        )
    )

    assert isinstance(model, ChatOpenAI)
    assert model.model_name == "mimo-v2.5-pro"
    assert model.openai_api_base == "https://model.example/v1"
    assert model.temperature == 0.2
    assert model.max_tokens == 2048
    assert model.streaming is True
    assert model.use_responses_api is False
    assert model.max_retries == 0
    assert model.http_client._trust_env is True
    assert model.http_async_client._trust_env is True


def test_model_settings_defaults_to_agent_owned_retry_budget():
    settings = CreatorModelSettings(
        model_name="mimo-v2.5-pro",
        base_url="https://model.example/v1",
        api_key="secret",
    )

    assert settings.max_retries == 2


def test_model_settings_priority_and_compatibility(tmp_path):
    (tmp_path / ".env.creator.local").write_text(
        "MODEL_PROVIDER=openai\n"
        "MODEL_API_NAME=file-model\n"
        "MODEL_BASE_URL=https://file.example/v1\n"
        "MODEL_API_KEY=file-key\n",
        encoding="utf-8",
    )
    settings = CreatorModelSettings.from_environment(
        config_root=tmp_path,
        environment={
            "CREATOR_MODEL_NAME": "mimo-v2.5-pro",
            "CREATOR_MODEL_BASE_URL": "https://creator.example/v1/",
            "CREATOR_MODEL_API_KEY": "creator-key",
            "CREATOR_MODEL_TEMPERATURE": "0.2",
            "CREATOR_MODEL_MAX_TOKENS": "2048",
        },
    )

    assert settings.model_name == "mimo-v2.5-pro"
    assert settings.base_url == "https://creator.example/v1"
    assert settings.api_key == "creator-key"
    assert settings.temperature == 0.2
    assert settings.max_tokens == 2048


def test_selector_settings_are_independent_of_general_model_settings(tmp_path):
    (tmp_path / ".env.creator.local").write_text(
        "CREATOR_SELECTOR_MAX_TOKENS=512\nCREATOR_SELECTOR_REASONING_EFFORT=low\n",
        encoding="utf-8",
    )
    selector = CreatorSelectorModelSettings.from_environment(
        config_root=tmp_path,
        environment={"CREATOR_SELECTOR_MAX_TOKENS": "256", "CREATOR_SELECTOR_REASONING_EFFORT": "high"},
    )
    general = CreatorModelSettings(
        model_name="mimo-v2.5-pro", base_url="https://model.example/v1", api_key="secret"
    )

    assert selector.max_tokens == 256
    assert selector.reasoning_effort == "high"
    assert general.max_tokens == 2048
    assert general.temperature == 0.2


def test_general_route_creates_a_fresh_model_with_original_settings(tmp_path, monkeypatch):
    created = []
    selector_copies = []

    class ScriptedModel:
        def __init__(self, settings, effective=None):
            self.settings = settings
            self.effective = effective or {
                "max_tokens": settings.max_tokens,
                "temperature": settings.temperature,
                "streaming": True,
                "reasoning_effort": None,
            }
            self.model_name = settings.model_name

        def model_copy(self, *, update):
            copy = ScriptedModel(self.settings, {**self.effective, **update})
            selector_copies.append(copy)
            return copy

        async def ainvoke(self, _messages):
            return AIMessage(content="GENERAL")

    settings = CreatorModelSettings(
        model_name="scripted", base_url="https://unused.invalid/v1", api_key="secret"
    )
    monkeypatch.setattr(
        "agent_ui_creator.server.CreatorModelSettings.from_environment",
        classmethod(lambda cls, **kwargs: settings),
    )
    monkeypatch.setattr(
        "agent_ui_creator.server.CreatorSelectorModelSettings.from_environment",
        classmethod(lambda cls, **kwargs: CreatorSelectorModelSettings(512, "low")),
    )

    def create_model(model_settings, **_kwargs):
        model = ScriptedModel(model_settings)
        created.append(model)
        return model

    monkeypatch.setattr("agent_ui_creator.model_factory.create_creator_chat_model", create_model)

    class FakeEngine:
        def __init__(self, **kwargs):
            self.selector = CreatorActionSelector(
                model=kwargs["model"], selector_settings=kwargs["selector_settings"]
            )

        async def run(self, _messages):
            result = await self.selector.select(
                "让会话管理支持标题模糊搜索",
                {"catalogRevision": "c" * 64, "actions": [], "pluginSemantics": []},
            )
            assert result.decision == "general_change"
            return None

    class FakeGeneralAgent:
        def __init__(self, model):
            self.model = model

        async def run_messages(self, _messages):
            return self.model

    monkeypatch.setattr("agent_ui_creator.server.ProductizedOperationEngine", FakeEngine)
    monkeypatch.setattr(
        "agent_ui_creator.domain_agent.create_domain_write_creator_agent",
        lambda **kwargs: FakeGeneralAgent(kwargs["model"]),
    )
    server_settings = CreatorServerSettings(
        project_root=tmp_path, skills_root=tmp_path, auth_token="x" * 32
    )

    general_model = asyncio.run(_domain_write_agent_result(
        server_settings,
        [{"role": "user", "content": "让会话管理支持标题模糊搜索"}],
        None, None, None, "thread", None,
    ))

    assert len(created) == 2
    assert selector_copies[0].effective == {
        "max_tokens": 512,
        "temperature": None,
        "streaming": False,
        "reasoning_effort": "low",
    }
    assert general_model is created[1]
    assert general_model is not created[0]
    assert general_model.effective == {
        "max_tokens": 2048,
        "temperature": 0.2,
        "streaming": True,
        "reasoning_effort": None,
    }


def test_deep_agent_receives_the_preinitialized_model_instance(tmp_path, monkeypatch):
    model = object()
    captured = {}

    def fake_create_deep_agent(**kwargs):
        captured.update(kwargs)
        return object()

    monkeypatch.setattr(agent_module, "create_deep_agent", fake_create_deep_agent)
    monkeypatch.setattr(agent_module, "_register_minimal_harness_profile", lambda _model: None)

    agent_module.create_minimal_creator_agent(model=model, workspace=tmp_path)

    assert captured["model"] is model
    assert not isinstance(captured["model"], str)


def test_python_agent_mode_defaults_to_domain_write():
    assert load_python_agent_mode(environment={}) == "domain-write"


def test_python_agent_mode_keeps_all_diagnostic_overrides():
    for mode in ("echo", "minimal", "domain-read", "domain-write"):
        assert load_python_agent_mode(
            environment={"CREATOR_PYTHON_AGENT_MODE": mode}
        ) == mode


def test_python_agent_mode_prefers_environment_over_host_config(tmp_path):
    (tmp_path / ".env.creator.local").write_text(
        "CREATOR_PYTHON_AGENT_MODE=domain-read\n", encoding="utf-8"
    )

    assert load_python_agent_mode(
        config_root=tmp_path,
        environment={"CREATOR_PYTHON_AGENT_MODE": "minimal"},
    ) == "minimal"


def test_python_agent_mode_rejects_invalid_values():
    with pytest.raises(CreatorModelConfigurationError):
        load_python_agent_mode(
            environment={"CREATOR_PYTHON_AGENT_MODE": "other"}
        )


def test_creator_verification_mode_defaults_to_static_only():
    assert resolve_creator_verification_mode(environment={}) == "static_only"


def test_creator_verification_mode_prefers_environment_and_accepts_runtime_opt_in(
    tmp_path,
):
    (tmp_path / ".env.creator.local").write_text(
        "CREATOR_VERIFICATION_MODE=static_only\n", encoding="utf-8"
    )

    assert resolve_creator_verification_mode(
        config_root=tmp_path,
        environment={"CREATOR_VERIFICATION_MODE": "static_and_runtime"},
    ) == "static_and_runtime"


def test_creator_verification_mode_rejects_invalid_values():
    with pytest.raises(CreatorModelConfigurationError):
        resolve_creator_verification_mode(
            environment={"CREATOR_VERIFICATION_MODE": "runtime"}
        )
