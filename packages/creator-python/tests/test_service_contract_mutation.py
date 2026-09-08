from __future__ import annotations

import asyncio

import pytest

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

