import asyncio
import json
import os
import sys
from importlib.metadata import version

import pytest

from agent_ui_creator.minimal_agent import create_minimal_creator_agent
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings

_RUNS = []


@pytest.fixture(scope="module", autouse=True)
def conformance_report():
    yield
    if not _RUNS:
        return
    settings = CreatorModelSettings.from_environment()
    metrics = [run.metrics for run in _RUNS]
    report = {
        "model": settings.model_name,
        "base URL provider": settings.base_url,
        "temperature": settings.temperature,
        "max tokens": settings.max_tokens,
        "streaming": False,
        "python": sys.version.split()[0],
        "langchain-openai": version("langchain-openai"),
        "langchain-core": version("langchain-core"),
        "langchain": version("langchain"),
        "deepagents": version("deepagents"),
        "langgraph": version("langgraph"),
        "openai": version("openai"),
        "runs": 30,
        "model calls": sum(item.modelCalls for item in metrics),
        "tool calls": sum(item.toolCalls for item in metrics),
        "valid tool calls": sum(item.validToolCalls for item in metrics),
        "invalid tool calls": sum(item.invalidToolCalls for item in metrics),
        "pseudo tool calls": sum(item.pseudoToolCallsDetected for item in metrics),
        "pseudo recovered": sum(item.pseudoToolCallsRecovered for item in metrics),
        "repair attempts": sum(item.protocolRepairAttempts for item in metrics),
        "repair succeeded": sum(item.protocolRepairSuccesses for item in metrics),
        "repair failed": sum(item.protocolRepairFailures for item in metrics),
        "tool argument parse failures": sum(item.toolArgumentParseFailures for item in metrics),
        "missing tool call IDs": sum(item.missingToolCallIds for item in metrics),
        "no-progress failures": sum(item.repeatedToolLoops for item in metrics),
        "successful runs": len(_RUNS),
        "failed runs": 30 - len(_RUNS),
        "input tokens": sum(item.inputTokens for item in metrics),
        "output tokens": sum(item.outputTokens for item in metrics),
    }
    print("\nMiMo Tool Protocol Conformance Report")
    print(json.dumps(report, ensure_ascii=False, indent=2))


def _fixture(tmp_path, scenario):
    source = tmp_path / "src"
    source.mkdir()
    if scenario == "a":
        (source / "activity.ts").write_text(
            'export const activity = "old";\n', encoding="utf-8"
        )
        return (
            'Read /src/activity.ts. Change the exported string value from "old" to "new". '
            "Then read the file again to verify the change. Do not finish before verifying it.",
            lambda: '"new"' in (source / "activity.ts").read_text(encoding="utf-8"),
        )
    if scenario == "b":
        (source / "activity.ts").write_text(
            "export const OLD_ACTIVITY = true;\n", encoding="utf-8"
        )
        return (
            "Find occurrences of OLD_ACTIVITY under /src. Change only the declaration in "
            "activity.ts to NEW_ACTIVITY. Use grep again to confirm OLD_ACTIVITY is gone.",
            lambda: "OLD_ACTIVITY" not in (source / "activity.ts").read_text(encoding="utf-8"),
        )
    (source / "activity.ts").write_text(
        'export const activity = "old";\n', encoding="utf-8"
    )
    (source / "counter.ts").write_text(
        'export const activityName = "old";\n', encoding="utf-8"
    )
    return (
        "Read /src/activity.ts, grep for the exact string old under /src, edit only "
        "activity.ts so its value is new, read activity.ts again, then grep under /src "
        "to confirm counter.ts still contains old. Do not finish before all five steps.",
        lambda: '"new"' in (source / "activity.ts").read_text(encoding="utf-8")
        and '"old"' in (source / "counter.ts").read_text(encoding="utf-8"),
    )


@pytest.mark.live_model
@pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1",
    reason="Set CREATOR_RUN_LIVE_MODEL=1 to run external MiMo conformance.",
)
@pytest.mark.parametrize("repeat", range(10))
@pytest.mark.parametrize("scenario", ["a", "b", "c"])
def test_mimo_multi_turn_tool_protocol(tmp_path, scenario, repeat):
    del repeat
    prompt, expected = _fixture(tmp_path, scenario)
    settings = CreatorModelSettings.from_environment()
    result = asyncio.run(
        create_minimal_creator_agent(
            model=create_creator_chat_model(settings),
            workspace=tmp_path,
            mode="conformance",
            raw_trace=settings.raw_trace,
        ).run(prompt)
    )
    _RUNS.append(result)

    assert expected()
    assert result.metrics.protocolRepairFailures == 0
    assert result.metrics.toolArgumentParseFailures == 0
    assert result.metrics.missingToolCallIds == 0
    assert result.metrics.modelCalls <= 12
