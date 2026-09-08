from __future__ import annotations

import asyncio

from agent_ui_creator.activity import CreatorActivityRecorder
from agent_ui_creator.domain_agent.completion_gate import (
    CreatorDevelopmentCompletionGate,
)
from agent_ui_creator.repair import CreatorRepairState
from agent_ui_creator.service_contracts import (
    ServiceContractAuthorizationStore,
    ServiceContractAuthorizationVerifier,
    ServiceOwnershipSpec,
)
from agent_ui_creator.validation import (
    CommandExecutionResult,
    CreatorValidationService,
)


class PassingRunner:
    async def execute_known_command(self, _command):
        return CommandExecutionResult("", 0, False)


class TopologyControl:
    def __init__(self, provider="conversation-history", mode="required") -> None:
        self.provider = provider
        self.mode = mode

    async def inspect_ui_services(self):
        return {
            "services": [
                {
                    "name": "conversation.navigation",
                    "contractPaths": ["services/conversation-navigation.ts"],
                    "providers": [{"pluginId": self.provider}],
                    "requiredConsumers": (
                        [{"pluginId": "search"}] if self.mode == "required" else []
                    ),
                    "optionalConsumers": (
                        [{"pluginId": "search"}] if self.mode == "optional" else []
                    ),
                }
            ]
        }


def validation(tmp_path, control):
    activity = CreatorActivityRecorder(tmp_path)
    activity.begin("validation")
    store = ServiceContractAuthorizationStore(tmp_path, thread_id="thread-1")
    record = store.create_proposal(
        ServiceOwnershipSpec(
            change_kind="create",
            service_name="conversation.navigation",
            contract_path="services/conversation-navigation.ts",
            owner_plugin_id="conversation-history",
            consumers=(("search", "required"),),
        ),
        authorized=True,
    )
    store.update_status(record, "applied")
    verifier = ServiceContractAuthorizationVerifier(
        project_control=control, store=store
    )
    service = CreatorValidationService(
        project_root=tmp_path,
        activity=activity,
        runner=PassingRunner(),
        host_verifier=verifier,
    )
    return service, store, record


def test_wrong_provider_blocks_validation_even_when_commands_pass(tmp_path):
    service, store, record = validation(tmp_path, TopologyControl(provider="message-list"))

    result = asyncio.run(service.validate())

    assert result.status == "failed"
    assert result.host_checks[0].code == "SERVICE_OWNERSHIP_MISMATCH"
    assert store.get_proposal(record.proposal_id).status == "applied"


def test_dependency_mode_mismatch_blocks_validation(tmp_path):
    service, _store, _record = validation(tmp_path, TopologyControl(mode="optional"))

    result = asyncio.run(service.validate())

    assert result.status == "failed"
    assert result.host_checks[0].code == "SERVICE_CONSUMER_SCOPE_MISMATCH"


def test_matching_wiring_stays_applied_after_static_validation(tmp_path):
    service, store, record = validation(tmp_path, TopologyControl())

    result = asyncio.run(service.validate())

    assert result.status == "passed"
    assert result.host_checks[0].status == "passed"
    assert store.get_proposal(record.proposal_id).status == "applied"


def test_runtime_repair_rechecks_applied_authorization(tmp_path):
    control = TopologyControl()
    service, store, record = validation(tmp_path, control)

    first = asyncio.run(service.validate())
    control.mode = "optional"
    second = asyncio.run(service.validate())

    assert first.status == "passed"
    assert second.status == "failed"
    assert second.host_checks[0].code == "SERVICE_CONSUMER_SCOPE_MISMATCH"
    assert store.get_proposal(record.proposal_id).status == "applied"


class RuntimeResult:
    def __init__(self, status):
        self.status = status

    def current_result(self):
        return {"runtimeStatus": self.status, "currentErrors": []}


def completion_fixture(tmp_path, runtime_status):
    service, store, record = validation(tmp_path, TopologyControl())
    target = tmp_path / "plugins/change.ts"
    target.parent.mkdir()
    target.write_text("before\n", encoding="utf-8")
    service.activity.capture_before_content("/plugins/change.ts", "before\n")
    target.write_text("after\n", encoding="utf-8")
    service.activity.touch("/plugins/change.ts")
    asyncio.run(service.validate())
    verifier = service.host_verifier
    assert verifier is not None
    gate = CreatorDevelopmentCompletionGate(
        activity=service.activity,
        validation=service,
        runtime=RuntimeResult(runtime_status),
        repair_state=CreatorRepairState(),
        service_authorization_finalizer=verifier,
    )
    return gate, store, record


def test_final_runtime_pass_completes_authorization(tmp_path):
    gate, store, record = completion_fixture(tmp_path, "passed")

    decision = gate.review("complete")

    assert decision.accepted is True
    assert store.get_proposal(record.proposal_id).status == "completed"


def test_runtime_unavailable_accepted_completion_completes_authorization(tmp_path):
    gate, store, record = completion_fixture(tmp_path, "unavailable")

    decision = gate.review("complete")

    assert decision.accepted is True
    assert store.get_proposal(record.proposal_id).status == "completed"


def test_runtime_failure_keeps_authorization_applied(tmp_path):
    gate, store, record = completion_fixture(tmp_path, "failed")

    decision = gate.review("complete")

    assert decision.accepted is False
    assert store.get_proposal(record.proposal_id).status == "applied"
