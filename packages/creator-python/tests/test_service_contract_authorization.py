from __future__ import annotations

import asyncio

import pytest

from agent_ui_creator.service_contracts import (
    PrepareUIServiceContractChangeInput,
    ServiceContractAuthorizationService,
    ServiceContractAuthorizationStore,
    ServiceContractError,
)


class AuthorizationControl:
    def __init__(self) -> None:
        self.services = []
        self.plugin_ids = {"conversation-history", "search"}

    async def inspect_ui_services(self):
        return {"services": self.services, "plugins": [], "issues": []}

    async def list_ui_plugins(self):
        return {
            "pluginAssets": [
                {"pluginId": plugin_id} for plugin_id in sorted(self.plugin_ids)
            ]
        }


def proposal(*, evidence=None):
    return PrepareUIServiceContractChangeInput.model_validate(
        {
            "mode": "propose",
            "changeKind": "create",
            "serviceName": "conversation.navigation",
            "contractPath": "services/conversation-navigation.ts",
            "ownerPluginId": "conversation-history",
            "consumers": [
                {"pluginId": "search", "dependencyMode": "required"}
            ],
            "reason": "Search needs history navigation.",
            **(
                {"userAuthorizationEvidence": evidence}
                if evidence is not None
                else {}
            ),
        }
    )


def service(tmp_path):
    control = AuthorizationControl()
    store = ServiceContractAuthorizationStore(tmp_path, thread_id="thread-1")
    store.set_current_user_context(
        current_user_message=(
            "让 conversation-history 提供 conversation.navigation，再让 search 使用。"
        ),
        run_id="run-1",
    )
    return (
        ServiceContractAuthorizationService(
            project_root=tmp_path,
            project_control=control,
            store=store,
        ),
        store,
        control,
    )


def test_explicit_current_user_evidence_authorizes_without_confirmation(tmp_path):
    authorization, store, _control = service(tmp_path)

    result = asyncio.run(
        authorization.prepare(
            proposal(evidence="conversation-history 提供 conversation.navigation")
        )
    )

    assert result["status"] == "authorized"
    assert store.get_authorization(result["authorizationId"]).spec.owner_plugin_id == (
        "conversation-history"
    )
    assert not list((tmp_path / ".agentuicreator").rglob("*.txt"))


def test_inferred_owner_requires_confirmation_then_accepts_current_reply(tmp_path):
    authorization, store, _control = service(tmp_path)
    proposed = asyncio.run(authorization.prepare(proposal()))

    assert proposed["status"] == "confirmation-required"
    assert store.get_proposal(proposed["proposalId"]).status == "pending"

    store.set_current_user_context(
        current_user_message="可以，就这么做。", run_id="run-2"
    )
    confirmed = asyncio.run(
        authorization.prepare(
            PrepareUIServiceContractChangeInput.model_validate(
                {
                    "mode": "confirm",
                    "proposalId": proposed["proposalId"],
                    "userAuthorizationEvidence": "可以，就这么做。",
                }
            )
        )
    )
    assert confirmed["status"] == "authorized"


def test_model_cannot_fabricate_authorization_evidence(tmp_path):
    authorization, _store, _control = service(tmp_path)

    with pytest.raises(ServiceContractError) as captured:
        asyncio.run(authorization.prepare(proposal(evidence="可以")))

    assert captured.value.code == "SERVICE_CONTRACT_PROPOSAL_INVALID"


def test_confirmation_invalidates_when_service_appears(tmp_path):
    authorization, store, control = service(tmp_path)
    proposed = asyncio.run(authorization.prepare(proposal()))
    control.services = [{"name": "conversation.navigation"}]
    store.set_current_user_context(current_user_message="可以。", run_id="run-2")

    with pytest.raises(ServiceContractError) as captured:
        asyncio.run(
            authorization.prepare(
                PrepareUIServiceContractChangeInput.model_validate(
                    {
                        "mode": "confirm",
                        "proposalId": proposed["proposalId"],
                        "userAuthorizationEvidence": "可以。",
                    }
                )
            )
        )

    assert captured.value.code == "SERVICE_CONTRACT_AUTHORIZATION_STALE"
    assert store.get_proposal(proposed["proposalId"]).status == "invalidated"


@pytest.mark.parametrize(
    "service_name",
    [
        "editor",
        "theme",
        "agent-ui.theme",
        "workspace.files",
        "conversation.navigation",
        "foo-bar",
        "foo-bar.baz-qux",
        "a",
        "a.b",
    ],
)
def test_service_name_contract_accepts_typescript_valid_corpus(
    tmp_path, service_name
):
    authorization, _store, _control = service(tmp_path)
    request = proposal().model_copy(update={"serviceName": service_name})

    result = asyncio.run(authorization.prepare(request))

    assert result["status"] == "confirmation-required"


@pytest.mark.parametrize(
    "service_name",
    [
        "Editor",
        "_workspace",
        "workspace_files",
        ".workspace",
        "workspace.",
        "workspace..files",
        "workspace.Files",
        "foo_bar",
        "foo/bar",
        "foo bar",
    ],
)
def test_service_name_contract_rejects_typescript_invalid_corpus(
    tmp_path, service_name
):
    authorization, _store, _control = service(tmp_path)
    request = proposal().model_copy(update={"serviceName": service_name})

    with pytest.raises(ServiceContractError) as captured:
        asyncio.run(authorization.prepare(request))

    assert captured.value.code == "SERVICE_CONTRACT_PROPOSAL_INVALID"
