from __future__ import annotations

from pathlib import Path

from ..project_control import ProjectControlClient
from .authorization_store import ServiceContractAuthorizationStore
from .models import (
    PrepareUIServiceContractChangeInput,
    ServiceAuthorizationRecord,
    ServiceContractError,
    ServiceOwnershipSpec,
)
from .topology import (
    available_plugin_ids,
    service_by_name,
    spec_from_existing_service,
    validate_requested_spec,
)


class ServiceContractAuthorizationService:
    def __init__(
        self,
        *,
        project_root: str | Path,
        project_control: ProjectControlClient,
        store: ServiceContractAuthorizationStore,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.project_control = project_control
        self.store = store

    @staticmethod
    def _spec(request: PrepareUIServiceContractChangeInput) -> ServiceOwnershipSpec:
        assert request.changeKind is not None
        assert request.serviceName is not None
        assert request.contractPath is not None
        assert request.ownerPluginId is not None
        assert request.consumers is not None
        spec = ServiceOwnershipSpec(
            change_kind=request.changeKind,
            service_name=request.serviceName,
            contract_path=request.contractPath,
            owner_plugin_id=request.ownerPluginId,
            consumers=tuple(
                sorted(
                    (consumer.pluginId, consumer.dependencyMode)
                    for consumer in request.consumers
                )
            ),
        )
        validate_requested_spec(spec)
        return spec

    async def _assert_current(self, spec: ServiceOwnershipSpec) -> None:
        topology = await self.project_control.inspect_ui_services()
        if spec.change_kind == "mutate":
            spec_from_existing_service(spec, topology)
        elif service_by_name(topology, spec.service_name) is not None:
            raise ServiceContractError(
                "SERVICE_CONTRACT_ALREADY_EXISTS",
                f'Service "{spec.service_name}" already exists.',
            )

        inventory = await self.project_control.list_ui_plugins()
        available = available_plugin_ids(inventory)
        required = {spec.owner_plugin_id, *(plugin for plugin, _ in spec.consumers)}
        missing = sorted(required - available)
        if missing:
            raise ServiceContractError(
                "SERVICE_CONTRACT_PROPOSAL_INVALID",
                "Every authorized Owner and Consumer must already exist as a UI Plugin asset.",
                {"missingPluginIds": missing},
            )

    async def prepare(
        self, request: PrepareUIServiceContractChangeInput
    ) -> dict[str, object]:
        if request.mode == "confirm":
            assert request.proposalId is not None
            assert request.userAuthorizationEvidence is not None
            self.store.require_evidence(request.userAuthorizationEvidence)
            record = self.store.get_proposal(request.proposalId)
            if record.status != "pending":
                raise ServiceContractError(
                    "SERVICE_CONTRACT_PROPOSAL_INVALID",
                    "Only a pending ownership proposal can be confirmed.",
                )
            try:
                await self._assert_current(record.spec)
            except ServiceContractError as error:
                self.store.update_status(record, "invalidated")
                raise ServiceContractError(
                    "SERVICE_CONTRACT_AUTHORIZATION_STALE",
                    "Service topology changed after the ownership proposal was created.",
                    {"causeCode": error.code, "cause": str(error)},
                ) from error
            authorized = self.store.authorize(record)
            return self._authorized_result(authorized)

        spec = self._spec(request)
        await self._assert_current(spec)
        authorized = request.userAuthorizationEvidence is not None
        if authorized:
            assert request.userAuthorizationEvidence is not None
            self.store.require_evidence(request.userAuthorizationEvidence)
        record = self.store.create_proposal(spec, authorized=authorized)
        if authorized:
            return self._authorized_result(record)
        return {
            "status": "confirmation-required",
            "proposalId": record.proposal_id,
            "proposal": record.spec.to_dict(),
        }

    @staticmethod
    def _authorized_result(record: ServiceAuthorizationRecord) -> dict[str, object]:
        assert record.authorization_id is not None
        return {
            "status": "authorized",
            "proposalId": record.proposal_id,
            "authorizationId": record.authorization_id,
            "proposal": record.spec.to_dict(),
        }

