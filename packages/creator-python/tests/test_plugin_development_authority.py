from __future__ import annotations

import pytest
import asyncio
import json
from dataclasses import replace
from types import SimpleNamespace
from pydantic import ValidationError
from agent_ui_creator.activity import CreatorActivityRecorder
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
from agent_ui_creator.plugin_development.prepare_tool import PrepareUIPluginDevelopmentInput


def authority(tmp_path, intent: str = "none") -> PluginDevelopmentAuthority:
    result = PluginDevelopmentAuthority(tmp_path, thread_id="thread-a")
    result.begin_task(
        task_id="task-a",
        request_id="request-a",
        user_message="请开发一个独立任务清单插件" if intent == "explicit" else "做一个任务清单",
        intent=intent,
    )
    return result


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
    assert "prepare_ui_plugin_development" not in offered()
    middleware._observe("list_ui_plugins", {}, json.dumps({
        "ok": True, "result": {"pluginAssets": [], "pageComplete": False, "nextCursor": "next"},
    }))
    assert "prepare_ui_plugin_development" not in offered()
    middleware._observe("list_ui_plugins", {}, json.dumps({
        "ok": True, "result": {"pluginAssets": [], "pageComplete": True, "nextCursor": None},
    }))
    assert "prepare_ui_plugin_development" in offered()


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
        ("edit_file", {"file_path": "/agent-contract/agent-tools.ts"}),
        ("edit_file", {"file_path": "/components/other.tsx"}),
    ]:
        assert json.loads(_call(middleware, name, args).content)["ok"] is False


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
