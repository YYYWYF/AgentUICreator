from langchain_openai import ChatOpenAI

import agent_ui_creator.minimal_agent.agent as agent_module
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.model_settings import load_python_agent_mode


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
    assert model.streaming is False
    assert model.use_responses_api is False
    assert model.max_retries == 1


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


def test_python_agent_mode_accepts_domain_read_without_changing_default():
    assert load_python_agent_mode(environment={}) == "echo"
    assert load_python_agent_mode(
        environment={"CREATOR_PYTHON_AGENT_MODE": "domain-read"}
    ) == "domain-read"
