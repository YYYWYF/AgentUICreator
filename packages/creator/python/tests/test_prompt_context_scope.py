from pathlib import Path

from agent_ui_creator.domain_agent.prompt import DOMAIN_WRITE_AGENT_PROMPT, creator_verification_prompt
from agent_ui_creator.domain_agent.source_grounding import SOURCE_CONTROL


def test_general_policy_is_bounded_and_task_details_are_on_demand():
    # Context regression budget, not a limit on model calls or investigation.
    assert len(DOMAIN_WRITE_AGENT_PROMPT) < 25_000
    assert len(SOURCE_CONTROL) < 800
    assert "Read task-specific Skills only for the work actually being performed" in DOMAIN_WRITE_AGENT_PROMPT
    assert "There is no\nread quota or prescribed tool order" in DOMAIN_WRITE_AGENT_PROMPT
    assert "new-Plugin inventory or UI-system selection" in DOMAIN_WRITE_AGENT_PROMPT
    assert "Existing permission and validation checks still apply" in SOURCE_CONTROL
    assert "Do not search" not in SOURCE_CONTROL  # Navigation is not a second general policy.


def test_skill_reference_is_packaged_and_scope_specific():
    skills=Path(__file__).resolve().parents[2] / "skills" / "ui-plugin-development"
    text=(skills / "SKILL.md").read_text()
    assert len(text) < 9_000
    assert "authoring-contracts.md" in text
    reference=(skills / "references" / "authoring-contracts.md").read_text()
    assert "prepare_ui_plugin_development" in reference
    assert "verify_ui_plugin_behavior" in reference
    assert "componentBasisRefs" not in text
    assert "Do not load new-Plugin investigation requirements for a local presentation repair" in text


def test_verification_mode_remains_an_explicit_policy_boundary():
    static=creator_verification_prompt(DOMAIN_WRITE_AGENT_PROMPT,"static_only")
    assert "do not call inspect_runtime_errors" in " ".join(static.lower().split())
    assert "Never edit node_modules" in DOMAIN_WRITE_AGENT_PROMPT
    assert "Host must authorize" in (Path(__file__).resolve().parents[2] / "skills/ui-plugin-development/SKILL.md").read_text()
