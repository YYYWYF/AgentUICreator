"""Run installed project Playwright tests, with no model-supplied command or path."""
from __future__ import annotations

import json
from langchain_core.tools import tool
from ..validation.command_runner import CreatorValidationCommandRunner


def parse_behavior_result(output: str, *, plugin_id: str, interactions: list[str]) -> dict:
    try:
        report = json.loads(output)
    except ValueError:
        return {"status": "failed", "reason": "Browser runner did not return an intact JSON report"}
    if not isinstance(report, dict) or not isinstance(report.get("suites"), list):
        return {"status": "failed", "reason": "Missing browser test suites"}
    passed: set[str] = set()
    failed = bool(report.get("errors"))
    def visit(suite: dict) -> None:
        nonlocal failed
        for spec in suite.get("specs", []):
            title = spec.get("title", "")
            tests = spec.get("tests", [])
            if tests and all(test.get("status") == "expected" and test.get("results")
                             and all(result.get("status") == "passed" for result in test["results"])
                             for test in tests):
                passed.add(title)
            else:
                failed = True
        for child in suite.get("suites", []):
            visit(child)
    try:
        for suite in report.get("suites", []):
            visit(suite)
    except (TypeError, AttributeError, KeyError):
        return {"status": "failed", "reason": "Malformed browser test report"}
    required = {f"[delivery:{plugin_id}] {interaction}" for interaction in interactions}
    if not required:
        required = {f"[delivery:{plugin_id}] runtime"}
    missing = sorted(required - passed)
    return {"status": "passed" if not failed and not missing else "failed",
            "requiredTests": sorted(required), "missingTests": missing,
            "passedTests": sorted(passed)}


def create_plugin_behavior_tool(*, authority, activity, runner=None):
    runner = runner or CreatorValidationCommandRunner(activity.project_root)
    @tool("verify_ui_plugin_behavior")
    async def verify_ui_plugin_behavior() -> str:
        """Run existing project Playwright browser tests for the authorized delivery contract. Requires installed @playwright/test and a project-owned config. Each interaction must have an exact test title '[delivery:<pluginId>] <interaction>'; with no interactions use 'runtime'. Missing, skipped, flaky, stale or failed tests cannot prove completion. No arbitrary command, test path, or pass assertion is accepted."""
        active = authority.active
        if active is None or active.status != "authorized" or active.delivery_contract is None:
            return json.dumps({"ok": False, "error": "No authorized delivery contract"})
        root = activity.project_root
        try:
            package = json.loads((root / "package.json").read_text())
        except (OSError, ValueError):
            return json.dumps({"ok": False, "error": "Project package.json is unavailable"})
        dependencies = {**package.get("dependencies", {}), **package.get("devDependencies", {})}
        if "@playwright/test" not in dependencies or not any(
            (root / name).is_file() for name in ("playwright.config.ts", "playwright.config.js", "playwright.config.mjs", "playwright.config.cjs", "playwright.config.mts", "playwright.config.cts")
        ):
            return json.dumps({"ok": False, "error": "Project browser test infrastructure is unavailable; no Runtime PASS is inferred"})
        executable = root / "node_modules/.bin/playwright"
        if not executable.is_file():
            return json.dumps({"ok": False, "error": "Project Playwright executable is not installed"})
        revision = activity.revision
        result = await runner.execute_arguments((
            str(executable), "test", "--grep",
            rf"\[delivery:{active.target_plugin_id}\]", "--reporter=json",
        ))
        evidence = parse_behavior_result(result.output, plugin_id=active.target_plugin_id,
                                         interactions=active.delivery_contract.get("interactions", []))
        if (result.exit_code != 0 or result.truncated or activity.revision != revision
                or authority.active is None or authority.active.scope_hash != active.scope_hash
                or authority.active.status != "authorized"):
            evidence["status"] = "failed"
        evidence.update(revision=revision, pluginId=active.target_plugin_id, scopeHash=active.scope_hash)
        activity.record_plugin_behavior(evidence)
        activity.record_validation(command="playwright delivery", exit_code=result.exit_code,
                                   output=result.output, truncated=result.truncated, revision=revision,
                                   status=evidence["status"])
        return json.dumps({"ok": True, "result": evidence}, ensure_ascii=False)
    return verify_ui_plugin_behavior
