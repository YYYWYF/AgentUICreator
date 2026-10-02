"""Host-owned delivery evidence, independent of the agent's choice of workflow."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from ..project_paths import agent_ui_source_path


class GeometryExpectation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    instanceId: str = Field(min_length=1, max_length=200)
    property: Literal["x", "y", "width", "height"]
    expected: float = Field(allow_inf_nan=False, ge=-1_000_000, le=1_000_000)
    tolerance: float = Field(default=1, ge=0, le=10, allow_inf_nan=False)


ContractText = Annotated[str, Field(min_length=1, max_length=500)]


class PluginAuthoringContract(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    capability: str = Field(min_length=1, max_length=500)
    renderingCategory: Literal["panel", "semantic-slot", "application"]
    placement: str = Field(min_length=1, max_length=500)
    lifecycle: str = Field(min_length=1, max_length=500)
    dependencies: list[ContractText] = Field(max_length=32)
    reusedComponents: list[ContractText] = Field(default_factory=list, max_length=32)
    verificationMethod: Literal["runtime", "browser-test"]
    geometry: list[GeometryExpectation] = Field(default_factory=list, max_length=32)
    interactions: list[ContractText] = Field(default_factory=list, max_length=32)


def _read(root: Path, logical: str) -> str:
    path = root / agent_ui_source_path(root, logical).lstrip("/")
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("Delivery source escapes project root")
    return path.read_text(encoding="utf-8")


def _instances(model: dict) -> list[dict]:
    """Walk only authoring composition edges, never arbitrary config/pluginId data."""
    result: list[dict] = []
    def plugins(items: list) -> None:
        for instance in items:
            if (not isinstance(instance, dict) or instance.get("enabled") is False
                    or not isinstance(instance.get("id"), str) or not isinstance(instance.get("pluginId"), str)):
                continue
            result.append(instance)
            for children in instance.get("slots", {}).values():
                plugins(children)
    def layout(node: Any) -> None:
        if not isinstance(node, dict):
            return
        if node.get("type") == "slot":
            plugins(node.get("plugins", []))
        for child in node.get("children", []):
            layout(child)
        layout(node.get("child"))
    plugins(model.get("applicationPlugins", []))
    layout(model.get("root"))
    return result


def delivery_report(*, root: Path, plugin_id: str, contract: dict | None,
                    authorization: dict, revision: int, static_passed: bool,
                    runtime: dict | None, layout: dict | None,
                    behavior: dict | None = None, final: bool = True) -> dict:
    stages = {name: False for name in ("created", "registered", "composed", "verified")}
    blockers: list[str] = []
    instances: list[dict] = []
    application_delivery = False
    try:
        manifest = json.loads(_read(root, f"plugins/{plugin_id}/manifest.json"))
        stages["created"] = (manifest.get("id") == plugin_id and all(
            _read(root, f"plugins/{plugin_id}/{name}").strip()
            for name in ("definition.ts", "index.tsx")))
        registry = _read(root, "plugins/registry.generated.ts")
        stages["registered"] = stages["created"] and bool(re.search(
            r'''["']\./''' + re.escape(plugin_id) + r'''/definition(?:\.ts)?["']''', registry))
        if authorization.get("workKind") == "reuse-source":
            lock = json.loads((root / ".agent-ui/source-lock.json").read_text())
            stages["registered"] = stages["registered"] and isinstance(lock.get("items", {}).get(f"plugin/{plugin_id}"), dict)
        model = json.loads(_read(root, "app-ui/app-ui.json"))
        instances = [item for item in _instances(model) if item.get("pluginId") == plugin_id]
        stages["composed"] = stages["registered"] and bool(instances)
        application_ids = {item.get("id") for item in model.get("applicationPlugins", []) if isinstance(item, dict)}
        application_delivery = bool(instances) and all(item.get("id") in application_ids for item in instances)
        if contract and contract.get("renderingCategory") == "application" and not application_delivery:
            blockers.append("application 交付契约与实际挂载位置不一致")
    except (OSError, ValueError, TypeError, AttributeError):
        # Missing/malformed artifacts are incomplete delivery, never a successful fallback.
        pass
    for stage, message in (("created", "插件文件尚不完整"), ("registered", "插件尚未注册"),
                           ("composed", "插件尚未启用并挂载到 AppUIModel")):
        if not stages[stage]:
            blockers.append(message)
    if authorization.get("status") != "authorized":
        blockers.append("缺少当前开发授权")
    if contract is None:
        blockers.append("缺少插件交付契约")
    if not static_passed:
        blockers.append("当前版本 verify:ui / typecheck 尚未通过")
    runtime_passed = bool(runtime and runtime.get("runtimeStatus") == "passed"
                          and runtime.get("compositionVerified") is True)
    if not runtime_passed:
        blockers.append("当前版本运行验证尚未通过")
    geometry_passed = application_delivery and contract is not None and contract.get("renderingCategory") == "application"
    if not geometry_passed:
        observed = {item.get("instanceId"): item.get("rect") for item in (layout or {}).get("instances", [])}
        geometry_passed = bool(instances) and bool(layout and layout.get("compositionFresh") is True) and all(
            isinstance(observed.get(item.get("id")), dict)
            and observed[item["id"]].get("width", 0) > 0
            and observed[item["id"]].get("height", 0) > 0 for item in instances)
        for expectation in (contract or {}).get("geometry", []):
            rect = observed.get(expectation["instanceId"])
            actual = rect.get(expectation["property"]) if isinstance(rect, dict) else None
            if not isinstance(actual, (int, float)) or abs(actual - expectation["expected"]) > expectation.get("tolerance", 1):
                geometry_passed = False
        if not geometry_passed:
            blockers.append("缺少当前版本插件的可见 Runtime 几何证据")
    needs_behavior = bool(contract and (contract.get("interactions") or contract.get("verificationMethod") == "browser-test"))
    behavior_passed = bool(behavior and behavior.get("revision") == revision and behavior.get("status") == "passed")
    if needs_behavior and not behavior_passed:
        blockers.append("声明的交互尚未通过项目浏览器测试")
    stages["verified"] = bool(stages["composed"] and not blockers)
    reached = "planning"
    for stage, passed in stages.items():
        if not passed:
            break
        reached = stage
    return {
        "pluginId": plugin_id, "projectRevision": revision,
        "decision": {"type": authorization.get("workKind", "create-plugin")},
        "authorization": {"status": authorization.get("status", "unknown"),
                          "grantSource": authorization.get("grantSource")},
        "contract": contract,
        "delivery": {"status": "completed" if stages["verified"] else "blocked" if final else reached,
                     "lastSuccessfulStage": reached, "stages": stages, "blockers": blockers,
                     "instanceIds": [item["id"] for item in instances]},
        "verification": {"static": "pass" if static_passed else "not-passed",
                         "runtime": "pass" if runtime_passed else "not-passed",
                         "geometry": "pass" if geometry_passed else "not-passed",
                         "interaction": "pass" if behavior_passed else "not-passed" if needs_behavior else "not-required"},
    }


def create_plugin_delivery_tool(inspect_delivery):
    from langchain_core.tools import tool
    @tool("inspect_ui_plugin_delivery")
    def inspect_ui_plugin_delivery() -> str:
        """Inspect Host-derived lifecycle and missing obligations for the current development proposal. This read does not create source, grant authorization or assert verification success."""
        return json.dumps({"ok": True, "result": inspect_delivery()}, ensure_ascii=False)
    return inspect_ui_plugin_delivery


def source_delivery_contract(root: Path, plugin_id: str) -> dict | None:
    """Reuse does not need a development proposal; derive navigation from its declaration."""
    try:
        manifest = json.loads(_read(root, f"plugins/{plugin_id}/manifest.json"))
    except (OSError, ValueError):
        return None
    if not isinstance(manifest, dict):
        return None
    return {
        "capability": manifest.get("description", plugin_id),
        "renderingCategory": "application" if manifest.get("application") or manifest.get("headless") else "panel",
        "placement": json.dumps(manifest.get("authoring", {}).get("defaultPlacement", {})),
        "lifecycle": "installed-source", "dependencies": [], "verificationMethod": "runtime", "interactions": [],
    }
