from __future__ import annotations

import pytest
from langchain_core.messages import ToolMessage
import asyncio
import hashlib
import json
from dataclasses import replace
from types import SimpleNamespace
from pydantic import ValidationError
from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent.completion_gate import CreatorDevelopmentCompletionGate
from agent_ui_creator.repair import CreatorRepairState
from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
from agent_ui_creator.source_tools import (
    UIPluginCreationService, UIPluginSourceFile, UISourceCreationService,
    SourceCreationError,
)

from agent_ui_creator.plugin_development.authority import (
    PluginDevelopmentAuthority,
    PluginDevelopmentError,
)
from agent_ui_creator.plugin_development.admission_middleware import (
    PluginDevelopmentAdmissionMiddleware,
)
from agent_ui_creator.plugin_development.prepare_tool import (
    PrepareUIPluginDevelopmentInput, create_prepare_ui_plugin_development_tool,
)
from agent_ui_creator.model_protocol.tool_protocol_guard import _validate_arguments


def authority(tmp_path, intent: str = "none") -> PluginDevelopmentAuthority:
    result = PluginDevelopmentAuthority(tmp_path, thread_id="thread-a")
    result.begin_task(
        task_id="task-a",
        request_id="request-a",
        user_message="请开发一个独立任务清单插件" if intent == "explicit" else "做一个任务清单",
        intent=intent,
    )
    return result


def test_delivery_scope_is_bound_to_user_request_and_resets_for_new_mount_task(tmp_path):
    state = PluginDevelopmentAuthority(tmp_path, thread_id="thread-a")
    state.begin_task(task_id="source", request_id="source", user_message="请开发一个任务清单插件源码，先不要接入界面", intent="explicit")
    assert state.delivery_scope == "source-only"
    state.begin_task(task_id="mount", request_id="mount", user_message="把已有任务清单插件挂到右侧", intent="none")
    assert state.delivery_scope == "full"
    state.record_discovery(plugin_inventory_complete=True, plugin_ids=["task-list"])
    assert state.can_compose_existing([{"type": "insert_plugin", "plugin": {"pluginId": "task-list"}}])
    assert state.active is None


def test_model_plan_cannot_reduce_full_user_delivery_scope(tmp_path):
    state = PluginDevelopmentAuthority(tmp_path, thread_id="thread-a")
    state.begin_task(task_id="full", request_id="full", user_message="请开发并接入一个任务清单插件", intent="explicit")
    prepared = state.prepare(work_kind="create-plugin", target_plugin_id="task-list",
                             desired_outcome="只开发源码，不接入界面", missing_capabilities=["任务清单"],
                             reuse_evidence_refs=[], ui_scope="只写源码")
    assert prepared["deliveryScope"] == "full"


def test_no_grant_or_skill_cannot_create(tmp_path):
    state = authority(tmp_path)
    with pytest.raises(PluginDevelopmentError, match="授权"):
        state.require_create("task-list")


def test_conditional_prepare_is_offered_only_after_both_complete_inventories(tmp_path):
    state = authority(tmp_path, "conditional")
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    tools = [SimpleNamespace(name=name) for name in (
        "inspect_agent_ui_sources", "list_ui_plugins", "prepare_ui_plugin_development",
    )]
    offered = lambda: [tool.name for tool in middleware._visible_tools(tools)]

    assert "prepare_ui_plugin_development" not in offered()
    middleware._observe("inspect_agent_ui_sources", {}, json.dumps({
        "ok": True, "result": {"items": [], "nextCursor": None},
    }))
    assert offered() == ["list_ui_plugins"]
    middleware._observe("list_ui_plugins", {}, json.dumps({
        "ok": True, "result": {"pluginAssets": [], "pageComplete": False, "nextCursor": "next"},
    }))
    assert offered() == ["list_ui_plugins"]
    middleware._observe("list_ui_plugins", {}, json.dumps({
        "ok": True, "result": {"pluginAssets": [], "pageComplete": True, "nextCursor": None},
    }))
    assert "prepare_ui_plugin_development" in offered()


def test_complete_composition_snapshot_counts_as_installed_plugin_inventory(tmp_path):
    state = authority(tmp_path, "conditional")
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    middleware._observe("inspect_ui_project", {"view": "composition"}, json.dumps({
        "ok": True, "result": {
            "observationCoverage": ["capability.inventory"],
            "capabilitySummaries": [{"pluginId": "task-list"}],
        },
    }))
    assert state._plugin_inventory_complete
    assert state._existing_plugin_ids == {"task-list"}
    middleware._observe("inspect_agent_ui_sources", {}, json.dumps({
        "ok": True, "result": {"items": []},
    }))
    assert state.can_expose_prepare


def test_incomplete_composition_snapshot_cannot_activate_inventory_grant(tmp_path):
    state = authority(tmp_path, "conditional")
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    middleware._observe("inspect_ui_project", {"view": "composition"}, json.dumps({
        "ok": True, "result": {
            "pageComplete": False, "nextCursor": "next",
            "observationCoverage": ["capability.inventory"],
            "capabilitySummaries": [{"pluginId": "task-list"}],
        },
    }))
    assert not state._plugin_inventory_complete


def test_paged_composition_requires_every_page_before_inventory_grant(tmp_path):
    state = authority(tmp_path, "conditional")
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    full = json.dumps({"ok": True, "result": {
        "observationCoverage": ["capability.inventory"],
        "capabilitySummaries": [{"pluginId": "task-list"}],
    }})
    split = len(full) // 2
    for index, (offset, part, complete) in enumerate((
        (split, full[split:], True),
        (0, full[:split], False),
        (split, full[split:], True),
    )):
        middleware._observe("inspect_ui_project", {"view": "composition"}, json.dumps({
            "ok": True, "result": {
                "snapshotHash": "snapshot-a", "pageOffset": offset,
                "pageText": part, "totalChars": len(full),
                "pageComplete": complete,
                "nextCursor": None if complete else "next",
            },
        }))
        if index < 2:
            assert not state._plugin_inventory_complete
    assert state._plugin_inventory_complete
    assert state._existing_plugin_ids == {"task-list"}


def test_direct_grant_is_task_and_identity_scoped(tmp_path):
    state = authority(tmp_path, "explicit")
    prepared = state.prepare(
        work_kind="create-plugin",
        target_plugin_id="task-list",
        desired_outcome="本地任务清单，可勾选、筛选和重置",
        missing_capabilities=["本地任务清单交互"],
        reuse_evidence_refs=[],
    )
    assert prepared["status"] == "authorized"
    with pytest.raises(PluginDevelopmentError, match="Skill"):
        state.require_create("task-list")
    state.mark_skill_loaded()
    state.require_create("task-list")
    with pytest.raises(PluginDevelopmentError, match="目标"):
        state.require_create("other-list")
    state.begin_task(
        task_id="task-b", request_id="request-b",
        user_message="再加一个清单", intent="none",
    )
    with pytest.raises(PluginDevelopmentError, match="授权"):
        state.require_create("task-list")


def test_model_explicit_label_cannot_authorize_plain_feature_request(tmp_path):
    state = PluginDevelopmentAuthority(tmp_path, thread_id="thread-a")
    state.begin_task(
        task_id="task-a", request_id="request-a",
        user_message="在聊天区旁边给我一个任务核对清单，可勾选、筛选和重置。",
        intent="explicit",
    )

    prepared = state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )

    assert state.intent == "needs_decision"
    assert prepared["status"] == "pending"
    with pytest.raises(PluginDevelopmentError, match="授权"):
        state.require_create("task-list")
    assert list(tmp_path.iterdir()) == []


def test_pending_requires_bound_question_and_explicit_choice(tmp_path):
    state = authority(tmp_path)
    prepared = state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=["plugin-inventory:complete"],
    )
    assert prepared["status"] == "pending"
    with pytest.raises(PluginDevelopmentError):
        state.require_create("task-list")
    question = {"schemaVersion": 1, "steps": [{"id": "development-decision"}]}
    state.register_decision_question(prepared["proposalId"], question)
    with pytest.raises(PluginDevelopmentError):
        state.bind_question(prepared["proposalId"], question_id="q1", checkpoint_id="c1",
                            question={"schemaVersion": 1, "steps": [{"id": "ordinary"}]})
    state.bind_question(prepared["proposalId"], question_id="q1", checkpoint_id="c1",
                        question=question)
    with pytest.raises(PluginDevelopmentError):
        state.decide(prepared["proposalId"], question_id="wrong", checkpoint_id="c1", choice="start")
    assert state.decide(prepared["proposalId"], question_id="q1", checkpoint_id="c1", choice="start")["status"] == "authorized"
    state.mark_skill_loaded()
    state.require_create("task-list")
    with pytest.raises(PluginDevelopmentError):
        state.decide(prepared["proposalId"], question_id="q1", checkpoint_id="c1", choice="start")


@pytest.mark.parametrize("choice", ["adjust", "defer"])
def test_decline_does_not_grant_or_change_project(tmp_path, choice):
    state = authority(tmp_path)
    prepared = state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    question = {"schemaVersion": 1, "steps": [{"id": "development-decision"}]}
    state.register_decision_question(prepared["proposalId"], question)
    state.bind_question(prepared["proposalId"], question_id="q1", checkpoint_id="c1",
                        question=question)
    assert state.decide(prepared["proposalId"], question_id="q1", checkpoint_id="c1", choice=choice)["status"] == choice
    with pytest.raises(PluginDevelopmentError):
        state.require_create("task-list")
    assert list(tmp_path.iterdir()) == []


def test_conditional_grant_requires_complete_host_discovery(tmp_path):
    state = authority(tmp_path, "conditional")
    arguments = dict(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    with pytest.raises(PluginDevelopmentError, match="完整"):
        state.prepare(**arguments)
    state.record_discovery(plugin_inventory_complete=True, source_inventory_complete=False)
    with pytest.raises(PluginDevelopmentError, match="完整"):
        state.prepare(**arguments)
    state.record_discovery(plugin_inventory_complete=True, source_inventory_complete=True)
    assert state.prepare(**arguments)["status"] == "authorized"


def _creation_service(tmp_path, state):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("run-a")
    return UIPluginCreationService(
        project_root=tmp_path,
        source_creation=UISourceCreationService(
            project_root=tmp_path, activity=activity,
            mutation_coordinator=ProjectMutationCoordinator(),
        ),
        activity=activity,
        development_authority=state,
    ), activity


def _files(plugin_id):
    return [
        UIPluginSourceFile(relativePath="manifest.json", content=f'{{"id":"{plugin_id}"}}'),
        UIPluginSourceFile(relativePath="definition.ts", content="export {};"),
        UIPluginSourceFile(relativePath="index.tsx", content="export {};"),
    ]


def test_atomic_creation_service_rejects_ungranted_call_without_files(tmp_path):
    state = authority(tmp_path)
    service, activity = _creation_service(tmp_path, state)
    with pytest.raises(SourceCreationError) as error:
        asyncio.run(service.create("task-list", _files("task-list")))
    assert error.value.code == "PLUGIN_DEVELOPMENT_AUTHORIZATION_REQUIRED"
    assert activity.revision == 0
    assert not (tmp_path / "plugins").exists()


def test_atomic_creation_service_checks_bound_identity_inside_commit(tmp_path):
    state = authority(tmp_path, "explicit")
    state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    state.mark_skill_loaded()
    service, activity = _creation_service(tmp_path, state)
    with pytest.raises(SourceCreationError) as error:
        asyncio.run(service.create("other-list", _files("other-list")))
    assert error.value.code == "PLUGIN_DEVELOPMENT_AUTHORIZATION_REQUIRED"
    assert not (tmp_path / "plugins" / "other-list").exists()
    asyncio.run(service.create("task-list", _files("task-list")))
    assert activity.revision == 3
    assert (tmp_path / "plugins" / "task-list" / "manifest.json").exists()
    with pytest.raises(SourceCreationError) as repeated:
        asyncio.run(service.create("task-list", _files("task-list")))
    assert repeated.value.code == "PLUGIN_ALREADY_EXISTS"
    assert activity.revision == 3


def _call(middleware, name, args):
    return middleware.wrap_tool_call(
        SimpleNamespace(tool_call={"name": name, "args": args, "id": "tool-a"}),
        lambda _request: "allowed",
    )


def test_pending_blocks_every_target_write_but_ordinary_edit_stays_available(tmp_path):
    state = authority(tmp_path)
    (tmp_path / "plugins" / "existing").mkdir(parents=True)
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    assert _call(middleware, "edit_file", {"file_path": "/plugins/existing/index.tsx"}) == "allowed"
    prepared = state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    assert prepared["status"] == "pending"
    for name, args in [
        ("mutate_app_ui_model", {"operations": []}),
        ("apply_agent_ui_source_item", {"itemId": "plugin/x"}),
        ("mutate_ui_plugin_source", {"pluginId": "existing"}),
        ("edit_file", {"file_path": "/plugins/existing/index.tsx"}),
    ]:
        assert json.loads(_call(middleware, name, args).content)["ok"] is False


def test_existing_plugin_placeholder_copy_requires_locale_value(tmp_path):
    state = authority(tmp_path)
    (tmp_path / "plugins" / "assistant-ui-composer").mkdir(parents=True)
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    path = "/plugins/assistant-ui-composer/index.tsx"
    blocked = _call(middleware, "edit_file", {
        "file_path": path,
        "old_string": "<ConversationCanonicalComposer",
        "new_string": '<ConversationCanonicalComposer placeholder="从任务开始"',
    })
    payload = json.loads(blocked.content)
    assert payload["error"]["code"] == "PLUGIN_LITERAL_PRESENTATION_COPY"
    assert _call(middleware, "edit_file", {
        "file_path": path,
        "old_string": "<ConversationCanonicalComposer",
        "new_string": '<ConversationCanonicalComposer placeholder={t("startHint")}',
    }) == "allowed"


def test_unselected_customized_source_cannot_be_directly_edited_for_capability_request(tmp_path):
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(json.dumps({
        "version": "2", "mode": "platform", "sourceRoot": "src/agent-ui",
    }), encoding="utf-8")
    source = tmp_path / "src/agent-ui"
    plugin_file = source / "plugins/generated-file-message/generated-file-result.ts"
    plugin_file.parent.mkdir(parents=True)
    plugin_file.write_text("customized", encoding="utf-8")
    model_path = source / "app-ui/app-ui.json"
    model_path.parent.mkdir(parents=True)
    model_path.write_text(json.dumps({"applicationPlugins": [], "root": {"type": "slot", "plugins": []}}), encoding="utf-8")
    relative = "plugins/generated-file-message/generated-file-result.ts"
    (metadata / "source-lock.json").write_text(json.dumps({
        "schemaVersion": 1, "sourceRoot": "src/agent-ui", "items": {
            "plugin/generated-file-message": {"version": "0.1.0", "files": {
                relative: {"sha256": hashlib.sha256(b"official").hexdigest()},
            }},
        },
    }), encoding="utf-8")
    state = authority(tmp_path)
    state.begin_task(task_id="a11b", request_id="request-a11b", intent="none",
                     user_message="把 generate_file 结果显示为文件卡片")
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    assert middleware.customized_source_decision_required("generated-file-message")
    for name, args in (
        ("edit_file", {"file_path": "/src/agent-ui/" + relative}),
        ("mutate_ui_plugin_source", {"pluginId": "generated-file-message"}),
    ):
        blocked = json.loads(_call(middleware, name, args).content)
        assert blocked["error"]["code"] == "PLUGIN_CUSTOMIZED_SOURCE_DECISION_REQUIRED"
        assert blocked["error"]["stateChanged"] is False

    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("a11b-run")
    completion = CreatorDevelopmentCompletionGate(
        activity=activity, validation=object(), runtime=object(),
        repair_state=CreatorRepairState(), plugin_development_authority=state,
    ).review("已完成文件卡片")
    assert completion.accepted
    assert "plugin/generated-file-message" in completion.text
    assert "未运行 Mock" in completion.text
    assert activity.snapshot()["verification"]["status"] == "no-project-change"
    assert activity.snapshot()["verification"]["checks"][0]["id"] == "customized-source-boundary"

    state.begin_task(task_id="direct-edit", request_id="direct-edit", intent="none",
                     user_message="请修改已定制的 generated-file-message 插件实现")
    assert state.blocked_customized_source_plugin_id is None
    assert not middleware.customized_source_decision_required("generated-file-message")
    assert _call(middleware, "edit_file", {"file_path": "/src/agent-ui/" + relative}) == "allowed"

    state.begin_task(task_id="selected-edit", request_id="selected-edit", intent="none",
                     user_message="调整当前文件卡片")
    model_path.write_text(json.dumps({"applicationPlugins": [{
        "id": "file-main", "pluginId": "generated-file-message", "enabled": True,
    }], "root": {"type": "slot", "plugins": []}}), encoding="utf-8")
    assert not middleware.customized_source_decision_required("generated-file-message")
    assert _call(middleware, "edit_file", {"file_path": "/src/agent-ui/" + relative}) == "allowed"


def test_predecision_composition_only_reuses_observed_plugin(tmp_path):
    state = authority(tmp_path, "needs_decision")
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    layout = {"operations": [{"type": "insert_layout_node", "node": {"id": "empty"}}]}
    assert json.loads(_call(middleware, "mutate_app_ui_model", layout).content)["ok"] is False
    state.record_discovery(plugin_inventory_complete=True, plugin_ids=["reasoning"])
    reuse = {"operations": [{"type": "insert_plugin", "plugin": {
        "id": "reasoning-main", "pluginId": "reasoning", "enabled": True,
    }}]}
    assert _call(middleware, "mutate_app_ui_model", reuse) == "allowed"
    reuse["operations"][0]["plugin"]["pluginId"] = "task-list"
    assert json.loads(_call(middleware, "mutate_app_ui_model", reuse).content)["ok"] is False


def test_approved_grant_cannot_edit_other_plugin_or_agent_contract(tmp_path):
    state = authority(tmp_path, "explicit")
    state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    blocked_before_skill = _call(middleware, "mutate_app_ui_model", {"operations": []})
    assert json.loads(blocked_before_skill.content)["ok"] is False
    state.mark_skill_loaded()
    for name, args in [
        ("edit_file", {"file_path": "/plugins/task-list/manifest.json"}),
        ("mutate_ui_plugin_source", {"pluginId": "other"}),
        ("edit_file", {"file_path": "/plugins/other/index.tsx"}),
        ("edit_file", {"file_path": "/services/other-service.ts"}),
        ("edit_file", {"file_path": "/agent-contract/agent-tools.ts"}),
        ("edit_file", {"file_path": "/components/other.tsx"}),
    ]:
        assert json.loads(_call(middleware, name, args).content)["ok"] is False


def test_authorized_composition_cannot_insert_another_plugin_in_any_slot(tmp_path):
    state = authority(tmp_path, "explicit")
    state.prepare(work_kind="create-plugin", target_plugin_id="task-list",
                  desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
                  reuse_evidence_refs=[])
    state.mark_skill_loaded()
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    task = {"id": "task-main", "pluginId": "task-list", "enabled": True}
    assert _call(middleware, "mutate_app_ui_model", {"operations": [{
        "type": "insert_plugin", "plugin": task,
        "target": {"type": "layout_slot", "slotRef": "l4"},
    }]}) == "allowed"
    assert _call(middleware, "mutate_app_ui_model", {"operations": [{
        "type": "update_layout_node_props", "nodeRef": "l0",
        "set": {"sizes": ["280px", "minmax(0, 1fr)"]},
    }]}) == "allowed"

    for target in ({"type": "application"},
                   {"type": "layout_slot", "slotRef": "l4"},
                   {"type": "plugin_slot", "parentInstanceId": "task-main", "slot": "body"}):
        for instance_id in ("other-main", "task-main"):
            result = _call(middleware, "mutate_app_ui_model", {"operations": [{
                "type": "insert_plugin",
                "plugin": {"id": instance_id, "pluginId": "other", "enabled": True},
                "target": target,
            }]})
            payload = json.loads(result.content)
            assert payload["ok"] is False
            assert payload["error"]["code"] == "PLUGIN_DEVELOPMENT_AUTHORIZATION_REQUIRED"
            assert payload["error"]["stateChanged"] is False
    nested = {**task, "slots": {"body": [{"id": "other-nested", "pluginId": "other", "enabled": True}]}}
    for operation in ({"type": "insert_plugin", "plugin": nested,
                       "target": {"type": "layout_slot", "slotRef": "l4"}},
                      {"type": "insert_layout_node", "node": {"type": "slot", "plugins": [nested]},
                       "parentRef": "l0"},
                      {"type": "insert_plugin_default", "plugin": {"id": "other-default",
                       "pluginId": "other", "enabled": True}}):
        assert json.loads(_call(middleware, "mutate_app_ui_model", {
            "operations": [operation],
        }).content)["ok"] is False


def test_locale_exact_edit_error_points_to_existing_single_line_anchor(tmp_path):
    state = authority(tmp_path, "explicit")
    state.prepare(work_kind="create-plugin", target_plugin_id="task-list",
                  desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
                  reuse_evidence_refs=[])
    state.mark_skill_loaded()
    locale = tmp_path / "agent-ui/i18n/locale-types.ts"
    locale.parent.mkdir(parents=True)
    locale.write_text("export interface Messages {\n  theme: {\n  };\n}\n")
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    error = ToolMessage(content="Error: String not found in file: 'wrong indentation'",
                        tool_call_id="edit-locale", name="edit_file", status="error")
    request = SimpleNamespace(tool_call={"name": "edit_file", "id": "edit-locale", "args": {
        "file_path": "/agent-ui/i18n/locale-types.ts", "old_string": "wrong indentation",
        "new_string": "  taskChecklist: {};\n  theme: {",
    }})

    result = middleware.wrap_tool_call(request, lambda _request: error)

    assert result.status == "error"
    assert "old_string `  theme: {`" in result.content
    assert locale.read_text() == "export interface Messages {\n  theme: {\n  };\n}\n"


@pytest.mark.parametrize("source_root", [None, "src/agent-ui"])
def test_approved_plugin_grant_allows_only_canonical_locale_edits(tmp_path, source_root):
    if source_root is not None:
        config = tmp_path / ".agent-ui"
        config.mkdir()
        (config / "project.json").write_text(json.dumps({
            "version": "2", "mode": "platform", "sourceRoot": source_root,
        }), encoding="utf-8")
    state = authority(tmp_path, "explicit")
    state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    state.mark_skill_loaded()
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    prefix = f"/{source_root}" if source_root else ""
    for path in (
        "/agent-ui/i18n/locale-types.ts",
        "/agent-ui/i18n/locales/zh-CN.ts",
        "/agent-ui/i18n/locales/en-US.ts",
    ):
        assert _call(middleware, "edit_file", {"file_path": prefix + path}) == "allowed"
    blocked = _call(middleware, "edit_file", {
        "file_path": prefix + "/agent-ui/i18n/useAgentUILocale.ts",
    })
    assert json.loads(blocked.content)["ok"] is False


def test_adapted_component_change_invalidates_bound_grant(tmp_path):
    component = tmp_path / "components" / "existing.tsx"
    component.parent.mkdir()
    component.write_text("export const Existing = () => null;", encoding="utf-8")
    state = authority(tmp_path, "explicit")
    state.prepare(
        work_kind="adapt-component", target_plugin_id="existing-adapter",
        desired_outcome="复用现有组件", missing_capabilities=["Plugin 适配"],
        reuse_evidence_refs=[], component_basis_refs=["/components/existing.tsx"],
    )
    state.mark_skill_loaded()
    state.require_create("existing-adapter")
    component.write_text("export const Existing = () => <div />;", encoding="utf-8")
    with pytest.raises(PluginDevelopmentError, match="已变化"):
        state.require_create("existing-adapter")


def test_related_plugin_change_invalidates_plan_but_own_write_can_continue(tmp_path):
    plugin = tmp_path / "plugins" / "existing" / "index.tsx"
    plugin.parent.mkdir(parents=True)
    plugin.write_text("export const Existing = () => null;", encoding="utf-8")
    state = authority(tmp_path)
    plan = state.prepare(
        work_kind="extend-capability", target_plugin_id="existing",
        desired_outcome="扩展现有交互", missing_capabilities=["新交互"],
        reuse_evidence_refs=[],
    )
    question = {"schemaVersion": 1, "steps": [{"id": "development-decision"}]}
    state.register_decision_question(plan["proposalId"], question)
    state.bind_question(plan["proposalId"], question_id="q1", checkpoint_id="c1",
                        question=question)
    plugin.write_text("export const Existing = () => <div />;", encoding="utf-8")
    with pytest.raises(PluginDevelopmentError, match="已变化"):
        state.decide(plan["proposalId"], question_id="q1", checkpoint_id="c1", choice="start")
    assert state._proposals[plan["proposalId"]].status == "pending"

    state.begin_task(task_id="task-b", request_id="request-b",
                     user_message="请扩展现有插件", intent="explicit")
    state.prepare(
        work_kind="extend-capability", target_plugin_id="existing",
        desired_outcome="扩展现有交互", missing_capabilities=["新交互"],
        reuse_evidence_refs=[],
    )
    state.mark_skill_loaded()
    state.require_skill()
    plugin.write_text("export const Existing = () => <section />;", encoding="utf-8")
    state.note_authorized_target_write("existing")
    state.require_skill()


def test_unrelated_project_change_does_not_invalidate_bound_plan(tmp_path):
    state = authority(tmp_path, "explicit")
    state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    state.mark_skill_loaded()
    unrelated = tmp_path / "plugins" / "other" / "index.tsx"
    unrelated.parent.mkdir(parents=True)
    unrelated.write_text("export const Other = () => null;", encoding="utf-8")

    state.require_create("task-list")


def test_conditional_existing_source_item_returns_reuse_without_grant(tmp_path):
    state = authority(tmp_path, "conditional")
    state.record_discovery(
        plugin_inventory_complete=True, source_inventory_complete=True,
        source_plugin_ids=["generated-file-message"],
    )
    result = state.prepare(
        work_kind="create-plugin", target_plugin_id="generated-file-message",
        desired_outcome="显示文件卡片", missing_capabilities=["文件结果呈现"],
        reuse_evidence_refs=["source:plugin/generated-file-message"],
    )
    assert result["status"] == "reuse-existing"
    assert state.active is None
    with pytest.raises(PluginDevelopmentError):
        state.require_create("generated-file-message")


def test_revoked_and_expired_grants_cannot_write(tmp_path):
    state = authority(tmp_path, "explicit")
    state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    state.mark_skill_loaded()
    state.require_create("task-list")
    record = state.active
    state._proposals[record.proposal_id] = replace(record, expires_at=0)
    with pytest.raises(PluginDevelopmentError, match="过期"):
        state.require_create("task-list")
    state._proposals[record.proposal_id] = record
    state.revoke_active()
    with pytest.raises(PluginDevelopmentError):
        state.require_create("task-list")


@pytest.mark.parametrize("changed", ["project_key", "thread_id", "task_id"])
def test_decision_rejects_wrong_project_thread_or_task(tmp_path, changed):
    state = authority(tmp_path)
    plan = state.prepare(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    question = {"schemaVersion": 1, "steps": [{"id": "development-decision"}]}
    state.register_decision_question(plan["proposalId"], question)
    state.bind_question(plan["proposalId"], question_id="q1", checkpoint_id="c1",
                        question=question)
    record = state.active
    state._proposals[record.proposal_id] = replace(record, **{changed: "other"})
    with pytest.raises(PluginDevelopmentError):
        state.decide(plan["proposalId"], question_id="q1", checkpoint_id="c1",
                     choice="start")
    assert state._proposals[plan["proposalId"]].status == "pending"


@pytest.mark.parametrize("forged", [
    {"approved": True}, {"authorizationId": "fake"},
    {"permission": "domain_write"}, {"caller": "installer"},
])
def test_model_cannot_supply_grant_or_installer_identity(forged):
    with pytest.raises(ValidationError):
        PrepareUIPluginDevelopmentInput.model_validate({
            "workKind": "create-plugin", "targetPluginId": "task-list",
            "desiredOutcome": "本地任务清单", "missingCapabilities": ["清单交互"],
            **forged,
        })


def test_prepare_plan_accepts_observed_nested_plan_fields_without_grant_expansion(tmp_path):
    contract = {
        "capability": "本地任务清单", "renderingCategory": "panel",
        "placement": "聊天区旁边", "lifecycle": "页面内存",
        "dependencies": [], "verificationMethod": "runtime",
    }
    arguments = {
        "deliveryContract": {
            **contract, "targetPluginId": "task-list",
            "uiScope": "聊天区旁边", "excludedOperations": ["后端"],
            "componentBasisRefs": [],
        },
        "missingCapabilities": ["清单交互"],
    }
    parsed = PrepareUIPluginDevelopmentInput.model_validate(arguments)
    assert parsed.workKind == "create-plugin"
    assert parsed.targetPluginId == "task-list"
    assert parsed.desiredOutcome == "本地任务清单"
    assert parsed.uiScope == "聊天区旁边"
    assert parsed.excludedOperations == ["后端"]
    assert parsed.deliveryContract.model_dump()["capability"] == "本地任务清单"
    tool = create_prepare_ui_plugin_development_tool(authority(tmp_path, "explicit"))
    assert _validate_arguments(tool, arguments) == (True, None)
    result = json.loads(tool.invoke(arguments))
    assert result["ok"] is True
    assert result["result"]["targetPluginId"] == "task-list"

    with pytest.raises(ValidationError):
        PrepareUIPluginDevelopmentInput.model_validate({
            **arguments, "targetPluginId": "other-plugin",
        })
    with pytest.raises(ValidationError):
        PrepareUIPluginDevelopmentInput.model_validate({
            **arguments,
            "deliveryContract": {**contract, "targetPluginId": "task-list", "grantSource": "model"},
        })


def test_partial_or_failed_discovery_does_not_activate_conditional_grant(tmp_path):
    state = authority(tmp_path, "conditional")
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    middleware._observe("list_ui_plugins", {}, json.dumps({
        "ok": True, "result": {"pageComplete": False, "nextCursor": "next", "pluginAssets": []},
    }))
    middleware._observe("inspect_agent_ui_sources", {}, json.dumps({
        "ok": False, "error": {"code": "SOURCE_TIMEOUT"},
    }))
    arguments = dict(
        work_kind="create-plugin", target_plugin_id="task-list",
        desired_outcome="本地任务清单", missing_capabilities=["清单交互"],
        reuse_evidence_refs=[],
    )
    with pytest.raises(PluginDevelopmentError, match="完整"):
        state.prepare(**arguments)
    middleware._observe("list_ui_plugins", {}, json.dumps({
        "ok": True, "result": {"pluginAssets": []},
    }))
    middleware._observe("inspect_agent_ui_sources", {}, json.dumps({
        "ok": True, "result": {"items": []},
    }))
    assert state.prepare(**arguments)["status"] == "authorized"


def test_formal_source_installer_is_not_a_new_plugin_creation(tmp_path):
    state = authority(tmp_path)
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    assert _call(middleware, "apply_agent_ui_source_item", {
        "itemId": "plugin/generated-file-message", "expectedStateHash": "hash",
    }) == "allowed"
    with pytest.raises(PluginDevelopmentError):
        state.require_create("generated-file-message")


def test_formal_source_install_allows_only_its_plugin_composition_without_new_grant(tmp_path):
    state = authority(tmp_path, "needs_decision")
    middleware = PluginDevelopmentAdmissionMiddleware(state)
    def insert(plugin_id):
        return {"operations": [{"type": "insert_plugin", "plugin": {
            "id": plugin_id + "-main", "pluginId": plugin_id, "enabled": True,
        }}]}
    assert json.loads(_call(middleware, "mutate_app_ui_model",
                            insert("generated-file-message")).content)["ok"] is False

    response = middleware.wrap_tool_call(
        SimpleNamespace(tool_call={"name": "apply_agent_ui_source_item", "args": {
            "itemId": "plugin/generated-file-message", "expectedStateHash": "host-hash",
        }, "id": "install"}),
        lambda _request: json.dumps({"ok": True, "result": {
            "operation": "apply", "changed": True,
            "changedItems": ["plugin/generated-file-message"],
            "stateHash": "new-host-hash",
        }}),
    )
    assert json.loads(response)["result"]["changed"] is True
    assert _call(middleware, "mutate_app_ui_model",
                 insert("generated-file-message")) == "allowed"
    assert json.loads(_call(middleware, "mutate_app_ui_model",
                            insert("unrelated-plugin")).content)["ok"] is False
    assert json.loads(_call(middleware, "mutate_app_ui_model", {
        "operations": [{"type": "insert_layout_node", "node": {"id": "empty"}}],
    }).content)["ok"] is False
