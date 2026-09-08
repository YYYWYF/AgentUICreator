from __future__ import annotations

import asyncio

import pytest

import agent_ui_creator.service_contracts.mutation_service as mutation_module

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
from agent_ui_creator.service_contracts import (
    ServiceContractAuthorizationStore,
    ServiceContractError,
    ServiceOwnershipSpec,
    UIServiceContractMutationService,
)
from agent_ui_creator.source_tools import PluginSourceEdit


class MutationControl:
    async def inspect_ui_services(self):
        return {
            "services": [
                {
                    "name": "agent-ui.conversations",
                    "contractPaths": ["services/conversations.ts"],
                    "providers": [{"pluginId": "conversation-history"}],
                    "requiredConsumers": [{"pluginId": "search"}],
                    "optionalConsumers": [],
                }
            ]
        }


def fixture(tmp_path):
    target = tmp_path / "services/conversations.ts"
    target.parent.mkdir()
    target.write_text(
        'export const NAME = "agent-ui.conversations";\nexport interface Service {}\n',
        encoding="utf-8",
    )
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("service-mutate")
    store = ServiceContractAuthorizationStore(tmp_path, thread_id="thread-1")
    record = store.create_proposal(
        ServiceOwnershipSpec(
            change_kind="mutate",
            service_name="agent-ui.conversations",
            contract_path="services/conversations.ts",
            owner_plugin_id="conversation-history",
            consumers=(("search", "required"),),
        ),
        authorized=True,
    )
    service = UIServiceContractMutationService(
        project_root=tmp_path,
        project_control=MutationControl(),
        store=store,
        activity=activity,
        mutation_coordinator=ProjectMutationCoordinator(),
    )
    return service, store, record, activity, target


def edit():
    return PluginSourceEdit(
        oldText="export interface Service {}",
        newText="export interface Service { focusConversation(id: string): void }",
    )


def test_mutation_requires_current_run_read(tmp_path):
    service, _store, record, activity, _target = fixture(tmp_path)
    assert record.authorization_id is not None

    with pytest.raises(ServiceContractError) as captured:
        asyncio.run(service.mutate(record.authorization_id, [edit()]))

    assert captured.value.code == "SERVICE_CONTRACT_OBSERVATION_REQUIRED"
    assert activity.revision == 0


def test_exact_authorized_mutation_is_undoable(tmp_path):
    service, store, record, activity, target = fixture(tmp_path)
    assert record.authorization_id is not None
    activity.file_observations.observe("/services/conversations.ts")

    result = asyncio.run(service.mutate(record.authorization_id, [edit()]))
    activity.finish()

    assert result["changed"] is True
    assert "focusConversation" in target.read_text(encoding="utf-8")
    assert store.get_authorization(record.authorization_id).status == "applied"
    activity.transactions.undo("service-mutate")
    assert "focusConversation" not in target.read_text(encoding="utf-8")


def test_exact_mutation_rejects_ambiguous_target_without_write(tmp_path):
    service, _store, record, activity, target = fixture(tmp_path)
    assert record.authorization_id is not None
    target.write_text(
        'export const NAME = "agent-ui.conversations";\nold\nold\n',
        encoding="utf-8",
    )
    before = target.read_text(encoding="utf-8")
    activity.file_observations.observe("/services/conversations.ts")

    with pytest.raises(ServiceContractError) as captured:
        asyncio.run(
            service.mutate(
                record.authorization_id,
                [PluginSourceEdit(oldText="old", newText="new")],
            )
        )

    assert captured.value.code == "SERVICE_CONTRACT_EDIT_TARGET_AMBIGUOUS"
    assert target.read_text(encoding="utf-8") == before


def test_mutation_clean_rollback_restores_authorization(tmp_path, monkeypatch):
    service, store, record, activity, target = fixture(tmp_path)
    assert record.authorization_id is not None
    before = target.read_text(encoding="utf-8")
    activity.file_observations.observe("/services/conversations.ts")
    real_replace = mutation_module.replace_creator_file_atomically
    calls = 0

    def fail_after_commit(*args, **kwargs):
        nonlocal calls
        calls += 1
        result = real_replace(*args, **kwargs)
        if calls == 1:
            raise OSError("post-commit failure")
        return result

    monkeypatch.setattr(
        mutation_module, "replace_creator_file_atomically", fail_after_commit
    )

    with pytest.raises(ServiceContractError) as captured:
        asyncio.run(service.mutate(record.authorization_id, [edit()]))

    assert captured.value.code == "SERVICE_CONTRACT_MUTATION_FAILED"
    assert target.read_text(encoding="utf-8") == before
    assert store.get_proposal(record.proposal_id).status == "authorized"
    assert activity.revision == 0


def test_service_contract_mutation_incomplete_rollback_reconciles_activity(
    tmp_path, monkeypatch
):
    service, store, record, activity, target = fixture(tmp_path)
    assert record.authorization_id is not None
    before = target.read_text(encoding="utf-8")
    activity.file_observations.observe("/services/conversations.ts")
    real_replace = mutation_module.replace_creator_file_atomically
    calls = 0

    def fail_commit_then_rollback(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            real_replace(*args, **kwargs)
            raise OSError("post-commit failure")
        raise OSError("replace rollback failed")

    monkeypatch.setattr(
        mutation_module, "replace_creator_file_atomically", fail_commit_then_rollback
    )

    with pytest.raises(ServiceContractError) as captured:
        asyncio.run(service.mutate(record.authorization_id, [edit()]))

    assert captured.value.code == "SERVICE_CONTRACT_MUTATION_ROLLBACK_FAILED"
    assert captured.value.details["residualChanged"] is True
    assert "focusConversation" in target.read_text(encoding="utf-8")
    assert store.get_proposal(record.proposal_id).status == "applied"
    assert activity.revision > 0
    receipt = activity.finish()
    assert [item["path"] for item in receipt["files"]] == [
        "services/conversations.ts"
    ]
    assert receipt["transaction"]["undoable"] is True

    activity.transactions.undo("service-mutate")
    assert target.read_text(encoding="utf-8") == before
