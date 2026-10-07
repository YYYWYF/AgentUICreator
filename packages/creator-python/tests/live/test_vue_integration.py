"""Real model + real managed Host protocol; no mocked recipe or tool results."""
from __future__ import annotations

import asyncio
from dataclasses import asdict
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest
from langgraph.checkpoint.memory import InMemorySaver

from agent_ui_creator.domain_agent import create_domain_read_creator_agent, create_domain_write_creator_agent
from agent_ui_creator.model_factory import create_creator_chat_model
from agent_ui_creator.model_settings import CreatorModelSettings
from agent_ui_creator.operations import CreatorActionSelector, CreatorActionSelectorContext
from agent_ui_creator.project_control.client import ProjectControlClient
from agent_ui_creator.streaming.deepagent_v3_runner import DeepAgentInterrupted

ROOT = Path(__file__).resolve().parents[4]
FIXTURE = ROOT / "examples/clean-vue-vite-host"
pytestmark = [pytest.mark.live_model, pytest.mark.skipif(os.environ.get("CREATOR_RUN_LIVE_MODEL") != "1", reason="Set CREATOR_RUN_LIVE_MODEL=1.")]


class ObservedHost(ProjectControlClient):
    def __init__(self, project):
        super().__init__(project_root=project)
        self.calls = []

    async def _request(self, operation, input):
        result = await super()._request(operation, input)
        self.calls.append({"operation": operation, "input": input, "result": result})
        print(json.dumps({"operation": operation, "status": result.get("status")}, ensure_ascii=False), flush=True)
        return result


def snapshot(project):
    return {str(file.relative_to(project)): hashlib.sha256(file.read_bytes()).hexdigest()
            for file in project.rglob("*") if file.is_file()
            and not set(file.relative_to(project).parts) & {"node_modules", ".agentuicreator", ".agent-ui", "dist"}}


def fresh(tmp_path):
    project = tmp_path / "clean-vue-vite-host"
    shutil.copytree(FIXTURE, project, ignore=shutil.ignore_patterns("node_modules", "dist", ".agent-ui", ".agentuicreator"))
    # Development tooling is installed by Host before the user request.
    subprocess.run(["node", "--input-type=module", "-e",
                    'import { installManagedProjectControl } from "./packages/project-control/src/install.mjs"; await installManagedProjectControl(process.argv[1]);', str(project)], cwd=ROOT, check=True)
    (project / ".agent-ui/project.json").write_text(json.dumps({"mode": "embedded", "sourceRoot": "src/agent-ui"}))
    assert not (project / "public/agent-ui.js").exists()
    assert not (project / "src/components/AgentUIBridge.vue").exists()
    return project


def settings():
    return CreatorModelSettings.from_environment(config_root=ROOT)


async def select(prompt):
    config = settings()
    selector = CreatorActionSelector(model=create_creator_chat_model(config, thread_id="vue-integration-selector"), max_retries=config.max_retries)
    return await selector.select(prompt, CreatorActionSelectorContext(catalogRevision="0" * 64, actions=[], pluginSemantics=[]))


def agent(project, host, write=False):
    create = create_domain_write_creator_agent if write else create_domain_read_creator_agent
    kwargs = {} if write else {"permission_scope": "inspect_read_only"}
    return create(model=create_creator_chat_model(settings(), thread_id="vue-integration"), workspace=project,
                  project_control=host, thread_id="vue-integration", checkpointer=InMemorySaver(), **kwargs)


async def run(creator, messages, resume=None):
    try:
        return await creator.run_messages(messages, resume=resume)
    except Exception:
        print(json.dumps(asdict(creator.protocol.metrics), ensure_ascii=False), flush=True)
        raise


def answer(interrupted, match):
    steps = interrupted.interrupts[0]["value"]["steps"]
    answers = {}
    for step in steps:
        choices = [option for option in step["options"] if match(option)]
        assert len(choices) == 1, step
        answers[step["id"]] = [choices[0]["id"]]
    return {"answers": answers}


def transcript(host):
    print(json.dumps(host.calls, ensure_ascii=False))


def browser_check(project):
    # Use only Vue fixture tooling; the consumer never installs producer packages.
    if not (project / "node_modules").exists():
        (project / "node_modules").symlink_to(FIXTURE / "node_modules", target_is_directory=True)
    subprocess.run(["node", str(FIXTURE / "node_modules/vue-tsc/bin/vue-tsc.js"), "--noEmit"], cwd=project, check=True)
    subprocess.run(["node", str(FIXTURE / "node_modules/vite/bin/vite.js"), "build"], cwd=project, check=True)
    script = r'''import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
const server = spawn(process.execPath, [process.argv[2], "--host", "127.0.0.1", "--port", "5197", "--strictPort"], { cwd: process.argv[1], stdio: "ignore" });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", async response => { if (response.status() >= 400) console.log(response.url(), (await response.text()).slice(0, 500)); });
  page.on("console", message => { if (message.type() === "error") console.log(message.text()); });
  for (let attempt = 0; ; attempt++) {
    try { await page.goto("http://127.0.0.1:5197"); break; }
    catch (error) { if (attempt >= 50) throw error; await page.waitForTimeout(100); }
  }
  try { await page.locator("agent-ui").getByRole("textbox").waitFor({ state: "visible", timeout: 15000 }); }
  catch (error) {
    console.log(JSON.stringify({ errors, overlay: await page.evaluate(() => document.querySelector("vite-error-overlay")?.shadowRoot?.textContent.slice(-3500)), html: await page.content(), shadow: await page.evaluate(() => document.querySelector("agent-ui")?.shadowRoot?.innerHTML.slice(-2000)) }));
    throw error;
  }
  if (!await page.evaluate(() => !!customElements.get("agent-ui"))) throw new Error("Bridge not registered");
  if (errors.length) throw new Error(JSON.stringify(errors));
  console.log("clean Vue browser: Agent UI visible; no page errors");
} finally { await browser.close(); server.kill(); }
'''
    subprocess.run(["node", "--input-type=module", "-e", script, str(project),
                    str(FIXTURE / "node_modules/vite/bin/vite.js")],
                   cwd=ROOT / "apps/creator-workbench", check=True, timeout=90)


def test_live_guide_is_read_only(tmp_path):
    async def scenario():
        project = fresh(tmp_path)
        host = ObservedHost(project)
        before = snapshot(project)
        route = await select("这个 Vue 项目怎么接入 Agent UI？")
        assert route.taskIntent == "read_only"
        creator = agent(project, host)
        result = await run(creator, [{"role": "user", "content": "这个 Vue 项目怎么接入 Agent UI？"}])
        assert snapshot(project) == before
        assert host.calls[0]["operation"] == "plan_agent_ui_integration"
        assert host.calls[0]["result"]["status"] == "target-required"
        if isinstance(result, DeepAgentInterrupted):
            result = await run(creator, [], resume=answer(result, lambda o: "src/App.vue" in o["label"] or "src/App.vue" in o["id"]))
        else:
            result = await run(creator, [{"role": "user", "content": "目标选 src/App.vue，只展示接入 Recipe，不修改文件。"}])
        plans = [call["result"]["integrationRecipe"] for call in host.calls if call["operation"] == "plan_agent_ui_integration" and call["result"]["status"] == "planned"]
        assert plans, host.calls
        assert not isinstance(result, DeepAgentInterrupted)
        for edit in plans[-1]["edits"]:
            assert edit["file"] in result.text
            assert edit["after"].strip() in result.text
        assert snapshot(project) == before
        assert all(call["operation"] == "plan_agent_ui_integration" for call in host.calls)
        transcript(host)
    asyncio.run(scenario())


def test_live_apply_and_manual_verify(tmp_path):
    async def scenario():
        project = fresh(tmp_path)
        host = ObservedHost(project)
        before = snapshot(project)
        route = await select("帮我把 Agent UI 接入这个项目")
        assert route.taskIntent == "modify"
        creator = agent(project, host, write=True)
        result = await run(creator, [{"role": "user", "content": "帮我把 Agent UI 接入这个项目"}])
        assert snapshot(project) == before
        assert host.calls[0]["operation"] == "plan_agent_ui_integration"
        assert host.calls[0]["result"]["host"]["framework"] == "vue"
        assert host.calls[0]["result"]["status"] == "target-required"
        assert isinstance(result, DeepAgentInterrupted), result
        result = await run(creator, [], resume=answer(result, lambda o: "src/App.vue" in o["label"] or "src/App.vue" in o["id"]))
        assert snapshot(project) == before
        plans = [call["result"]["integrationRecipe"] for call in host.calls if call["operation"] == "plan_agent_ui_integration" and call["result"]["status"] == "planned"]
        assert plans, host.calls
        recipe = plans[-1]
        assert recipe["integration"]["moduleSpecifier"] == "/agent-ui.js"
        if isinstance(result, DeepAgentInterrupted):
            result = await run(creator, [], resume=answer(result, lambda o: "manual" not in o["id"].lower() and (any(word in o["id"].lower() for word in ["approve", "apply"]) or any(word in o["label"].lower() for word in ["批准", "确认接入", "同意", "approve", "apply", "执行接入", "自动接入", "直接接入"]))))
        else:
            result = await run(creator, [{"role": "user", "content": "批准刚才展示的 Host Recipe，请执行接入并检查。"}])
        assert not isinstance(result, DeepAgentInterrupted)
        applied = [call for call in host.calls if call["operation"] == "apply_agent_ui_integration"]
        assert len(applied) == 1 and applied[0]["input"]["recipe"] == recipe
        assert applied[0]["result"]["status"] == "passed"
        assert (project / "public/agent-ui.js").stat().st_size > 30_000
        assert snapshot(project)["package.json"] == before["package.json"]
        assert snapshot(project)["src/main.ts"] == before["src/main.ts"]
        # apply performs Host verification before returning; a separate verify call is optional.
        assert all(check["passed"] for check in applied[0]["result"]["checks"])
        # A fresh, manually integrated copy consumes the original canonical edits.
        manual = fresh(tmp_path / "manual")
        manual_host = ObservedHost(manual)
        manual_plan = await manual_host.plan_agent_ui_integration({"targetFile": "src/App.vue"})
        manual_recipe = manual_plan["integrationRecipe"]
        for edit in manual_recipe["edits"]:
            file = manual / edit["file"]
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text(edit["after"])
        (manual / "public").mkdir()
        shutil.copyfile(project / "public/agent-ui.js", manual / "public/agent-ui.js")
        original = snapshot(manual)
        assert (await select("我改好了，帮我检查一下")).taskIntent == "read_only"
        checker = agent(manual, manual_host)
        result = await run(checker, [
            {"role": "assistant", "content": "之前的 Host Recipe：" + json.dumps(manual_recipe, ensure_ascii=False)},
            {"role": "user", "content": "我改好了，帮我检查一下"}])
        assert not isinstance(result, DeepAgentInterrupted)
        assert manual_host.calls[-1]["operation"] == "verify_agent_ui_integration"
        assert manual_host.calls[-1]["result"]["status"] == "passed"
        assert snapshot(manual) == original
        transcript(host)
        transcript(manual_host)
        browser_check(project)
        # Leave the applied temporary project available to an optional browser run.
        if destination := os.environ.get("CREATOR_VUE_VERIFICATION_OUTPUT"):
            shutil.copytree(project, destination, dirs_exist_ok=True, ignore=shutil.ignore_patterns("node_modules", "dist", ".agent-ui", ".agentuicreator"))
    asyncio.run(scenario())
