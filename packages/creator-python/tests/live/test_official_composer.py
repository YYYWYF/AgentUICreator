"""Explicit real-model acceptance: official Composer -> project-owned customization.

Run with pnpm verify:creator:official-composer-live. No scripted model, fabricated
snapshot, or mocked Project Control response. Temporary Host uses real build checks.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest
from langgraph.checkpoint.memory import InMemorySaver
from langchain_core.callbacks import BaseCallbackHandler

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent import create_domain_write_creator_agent
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.observability import CreatorRunLogger
from agent_ui_creator.operations import (
    CreatorActionSelector, CreatorActionSelectorContext, CreatorDomainSnapshotProvider,
)
from agent_ui_creator.project_control.client import ProjectControlClient
from agent_ui_creator.server import _authoring_handoff_messages
from agent_ui_creator.streaming.deepagent_v3_runner import DeepAgentInterrupted

ROOT = Path(__file__).resolve().parents[4]
PROMPT = "把输入框改成我们自己的，发送按钮旁边加一个业务按钮。"
OFFICIAL_ID = "assistant-ui-composer"
pytestmark = [pytest.mark.live_model, pytest.mark.skipif(
    os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1", reason="Explicit live-model acceptance only.")]


class ObservedHost(ProjectControlClient):
    def __init__(self, project):
        super().__init__(project_root=project)
        self.calls = []

    async def _request(self, operation, input):
        # Record attempts too: a rejected forbidden call must fail acceptance.
        call = {"operation": operation, "input": input}
        self.calls.append(call)
        call["result"] = await super()._request(operation, input)
        return call["result"]


class ModelToolTrace(BaseCallbackHandler):
    """Capture proposed calls before admission, including calls the Host rejects."""
    def __init__(self):
        self.tools = []

    def on_llm_end(self, response, **kwargs):
        for batch in response.generations:
            for generation in batch:
                for call in getattr(getattr(generation, "message", None), "tool_calls", []):
                    self.tools.append({"name": call["name"], "arguments": call["args"]})


class ObservedLogger(CreatorRunLogger):
    def __init__(self, project):
        super().__init__(project)
        self.tools = []

    def record_tool_observation(self, **kwargs):
        self.tools.append({"name": kwargs["tool_name"], "arguments": kwargs["arguments"]})
        super().record_tool_observation(**kwargs)


def hashes(root):
    return {str(file.relative_to(root)): hashlib.sha256(file.read_bytes()).hexdigest()
            for file in root.rglob("*") if file.is_file() and "node_modules" not in file.relative_to(root).parts}


def instances(value):
    if isinstance(value, dict):
        if "pluginId" in value and "id" in value:
            yield value
        for child in value.values():
            yield from instances(child)
    elif isinstance(value, list):
        for child in value:
            yield from instances(child)


def fresh_host(tmp_path):
    # Build development tooling before taking immutable official-source baselines.
    subprocess.run(["node", "scripts/prepare-host-packages.mjs"], cwd=ROOT, check=True)
    template = ROOT / "examples/creator-host-sandbox"
    project = tmp_path / "composer-host"

    def ignore(directory, names):
        ignored = {name for name in names if name in {"node_modules", "dist", ".agent-ui", ".agentuicreator"}}
        if Path(directory) == template / "src":
            ignored.add("agent-ui")
        return ignored

    shutil.copytree(template, project, ignore=ignore)
    (project / "node_modules").symlink_to(template / "node_modules", target_is_directory=True)
    # Temporary consumer keeps its ordinary validation commands, without repository-relative
    # development-shell lifecycle hooks (which would initialize the shared example).
    pkg = json.loads((project / "package.json").read_text())
    pkg["scripts"] = {key: pkg["scripts"][key] for key in ("dev", "typecheck", "build")}
    (project / "package.json").write_text(json.dumps(pkg, indent=2) + "\n")
    tsconfig = json.loads((project / "tsconfig.json").read_text())
    tsconfig["compilerOptions"].pop("paths", None)
    (project / "tsconfig.json").write_text(json.dumps(tsconfig, indent=2) + "\n")
    (project / "vite-runtime-aliases.ts").write_text("export const runtimeAliases = {};\n")
    script = '''
import { initializeAgentUIProject } from "./packages/bootstrap/dist/index.js";
import { createAgentUIInitializationHost } from "./packages/project-control/dist/runtime/project-control-runtime.mjs";
await initializeAgentUIProject({ projectRoot: process.argv[1], mode: "platform", sourceRoot: "src/agent-ui" }, createAgentUIInitializationHost());
'''
    subprocess.run(["node", "--input-type=module", "-e", script, str(project)], cwd=ROOT, check=True)
    return project


def test_real_creator_customizes_official_composer_without_source_mutation(tmp_path):
    async def scenario():
        project = fresh_host(tmp_path)
        source = project / "src/agent-ui"
        reference = ROOT / "packages/source-registry/registry/items/plugin-assistant-ui-composer"
        package = ROOT / "packages/plugins"
        official_before = (hashes(reference), hashes(package))
        assert not (source / "plugins" / OFFICIAL_ID).exists()
        model_path = source / "app-ui/app-ui.json"
        before_instances = list(instances(json.loads(model_path.read_text())))
        composer_ids = {item["id"] for item in before_instances if item["pluginId"] == OFFICIAL_ID}
        assert composer_ids
        existing_ids = {file.parent.name for file in (source / "plugins").glob("*/manifest.json")}
        host = ObservedHost(project)
        snapshot = await CreatorDomainSnapshotProvider(host).build()
        settings = CreatorModelSettings.from_environment(config_root=ROOT)
        selection = await CreatorActionSelector(
            model=create_creator_chat_model(settings, thread_id="official-composer-selector"),
            max_retries=settings.max_retries,
        ).select(PROMPT, CreatorActionSelectorContext.model_validate(snapshot.action_selector_context))
        assert selection.taskIntent == "modify"
        assert selection.targetId is not None, selection
        handoff = snapshot.authoring_handoff(selection.targetId)
        assert handoff.kind == "official_plugin_reference" and handoff.pluginId == OFFICIAL_ID
        assert handoff.ownerRoot is None and handoff.definitionPath is None
        logger = ObservedLogger(project)
        logger.begin(run_id="official-composer-live", thread_id="official-composer-live")
        activity = CreatorActivityRecorder(project, logger=logger)
        activity.begin("official-composer-live")
        model_trace = ModelToolTrace()
        model = create_creator_chat_model(settings, thread_id="official-composer-live")
        model.callbacks = [model_trace]
        creator = create_domain_write_creator_agent(
            model=model,
            workspace=project, project_control=host, authoring_handoff=handoff,
            activity=activity, checkpointer=InMemorySaver(), thread_id="official-composer-live",
            skills_root=ROOT / "packages/creator/skills", max_retries=settings.max_retries,
            automatic_completion_repair=True,
        )
        try:
            result = await creator.run_messages(_authoring_handoff_messages(
                [{"role": "user", "content": PROMPT}], handoff))
            assert not isinstance(result, DeepAgentInterrupted), result
            assert result.completion == "success", result.text
            calls = host.calls
            inspections = [i for i, call in enumerate(calls) if call["operation"] == "inspect_ui_plugin"
                           and call["input"].get("pluginId") == OFFICIAL_ID]
            creations = [i for i, call in enumerate(calls) if call["operation"] == "create_custom_plugin"]
            assert inspections and creations and min(inspections) < min(creations), calls
            inspected = calls[inspections[0]]["result"]
            assert inspected["asset"]["ownership"] == "official_package"
            # The real inspect response exposes public child Slots; no fabricated API hints.
            assert inspected["manifest"]["slots"] and inspected["definitionSource"]
            inspect_at = next(i for i, tool in enumerate(logger.tools) if tool["name"] == "inspect_ui_plugin"
                              and tool["arguments"].get("pluginId") == OFFICIAL_ID)
            create_at = next(i for i, tool in enumerate(logger.tools) if tool["name"] == "create_custom_plugin")
            public_checks = logger.tools[inspect_at + 1:create_at]
            assert any(tool["name"] in {"inspect_ui_slots", "inspect_ui_plugin_source_references"} or
                       (tool["name"] == "read_file" and any(part in tool["arguments"].get("file_path", "")
                        for part in ("framework/", "conversation/", "@agent-ui/react", "assistant-ui-composer")))
                       for tool in public_checks), public_checks
            assert any(calls[i].get("result", {}).get("ownership") == "project_source" and
                       "build" in calls[i]["result"].get("checks", []) for i in creations), calls
            assert all(call["input"].get("basedOn") == OFFICIAL_ID for call in (calls[i] for i in creations))
            assert model_trace.tools, "Real model tool-call trace is required"
            tools = model_trace.tools + logger.tools + [{"name": call["operation"], "arguments": call["input"]} for call in calls]
            for tool in tools:
                args = tool["arguments"]
                assert not (tool["name"] in {"mutate_ui_plugin_source", "create_ui_plugin"}
                            and args.get("pluginId") == OFFICIAL_ID), tool
                if tool["name"] in {"write_file", "edit_file", "edit_file_from_read", "mutate_ui_plugin_source", "create_ui_plugin", "create_custom_plugin"}:
                    assert "node_modules" not in json.dumps(args), tool
                    for key in ("file_path", "path"):
                        assert f"plugins/{OFFICIAL_ID}" not in str(args.get(key, "")), tool
            final = json.loads(model_path.read_text())
            mounted = list(instances(final))
            customs = []
            for file in (source / "plugins").glob("*/manifest.json"):
                plugin_id = json.loads(file.read_text())["id"]
                if plugin_id not in existing_ids:
                    facts = await host.inspect_ui_plugin(plugin_id)
                    assert facts["asset"]["ownership"] == "project_source"
                    customs.append(plugin_id)
            assert customs
            assert any(call.get("result", {}).get("pluginId") in customs for call in (calls[i] for i in creations))
            # Full replacement preserves the Composer instance; extension mounts under one
            # of its child Slots. An unrelated or unmounted new Plugin cannot pass.
            replacement = any(item["id"] in composer_ids and item["pluginId"] in customs for item in mounted)
            extension = any(item["pluginId"] == OFFICIAL_ID and any(
                child["pluginId"] in customs for child in instances(item.get("slots", {}))) for item in mounted)
            assert replacement or extension, final
        finally:
            logger.record("official_composer_acceptance", {
                "prompt": PROMPT, "handoff": handoff.model_dump(mode="json"),
                "modelToolCalls": [{"name": tool["name"], "arguments": {
                    key: value for key, value in tool["arguments"].items()
                    if key in {"pluginId", "basedOn", "replaceInstanceId", "file_path", "path"}
                }} for tool in model_trace.tools],
                "hostOperations": [call["operation"] for call in host.calls],
            })
            assert (hashes(reference), hashes(package)) == official_before
            assert not (source / "plugins" / OFFICIAL_ID).exists()
            print(json.dumps({"prompt": PROMPT, "handoff": handoff.kind, "trajectory": str(logger.path),
                              "operations": [call["operation"] for call in host.calls]}, ensure_ascii=False))
    asyncio.run(scenario())
