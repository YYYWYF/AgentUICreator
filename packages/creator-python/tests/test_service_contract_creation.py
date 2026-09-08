from __future__ import annotations

import asyncio

import pytest

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.app_ui_model import ProjectMutationCoordinator
from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy
from agent_ui_creator.service_contracts import (
    ServiceContractAuthorizationStore,
    ServiceContractError,
    ServiceOwnershipSpec,
    UIServiceContractCreationService,
)
from agent_ui_creator.source_tools import UISourceCreationService


class CreationControl:
    def __init__(self) -> None:
        self.services = []

    async def inspect_ui_services(self):
        return {"services": self.services}

    async def list_ui_plugins(self):
        return {
            "pluginAssets": [
                {"pluginId": "conversation-history"},
                {"pluginId": "search"},
            ]
        }


def fixture(tmp_path):
    (tmp_path / "services").mkdir()
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("service-create")
    coordinator = ProjectMutationCoordinator()
    store = ServiceContractAuthorizationStore(tmp_path, thread_id="thread-1")
    record = store.create_proposal(
        ServiceOwnershipSpec(
            change_kind="create",
            service_name="conversation.navigation",
            contract_path="services/conversations/navigation.ts",
            owner_plugin_id="conversation-history",
            consumers=(("search", "required"),),
        ),
        authorized=True,
    )
    source = UISourceCreationService(
        project_root=tmp_path,
        activity=activity,
        mutation_coordinator=coordinator,
        path_policy=MinimalAgentPathPolicy.internal_source(),
    )
    service = UIServiceContractCreationService(
        project_root=tmp_path,
        project_control=CreationControl(),
        store=store,
        source_creation=source,
    )
    return service, store, record, activity


def test_create_requires_host_authorization(tmp_path):
    service, _store, _record, activity = fixture(tmp_path)

    with pytest.raises(ServiceContractError) as captured:
        asyncio.run(service.create("made-up", "export {};\n"))

    assert captured.value.code == "SERVICE_CONTRACT_AUTHORIZATION_REQUIRED"
    assert activity.revision == 0


def test_authorized_create_is_create_only_and_undoable(tmp_path):
    service, store, record, activity = fixture(tmp_path)
    assert record.authorization_id is not None
    content = (
        'export const CONVERSATION_NAVIGATION_SERVICE = "conversation.navigation" as const;\n'
    )

    result = asyncio.run(service.create(record.authorization_id, content))
    activity.finish()

    assert result["contractPath"] == "services/conversations/navigation.ts"
    assert store.get_authorization(record.authorization_id).status == "applied"
    assert (tmp_path / "services/conversations/navigation.ts").read_text() == content
    activity.transactions.undo("service-create")
    assert not (tmp_path / "services/conversations").exists()
    assert (tmp_path / "services").is_dir()


def test_authorized_create_preserves_racing_file(tmp_path):
    service, _store, record, activity = fixture(tmp_path)
    assert record.authorization_id is not None
    target = tmp_path / "services/conversations/navigation.ts"
    target.parent.mkdir()
    target.write_text("external\n", encoding="utf-8")

    with pytest.raises(ServiceContractError) as captured:
        asyncio.run(service.create(record.authorization_id, "creator\n"))

    assert captured.value.code == "SERVICE_CONTRACT_FILE_ALREADY_EXISTS"
    assert target.read_text(encoding="utf-8") == "external\n"
    assert activity.revision == 0

