from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ..project_control import ProjectControlClient
from .authorization_store import ServiceContractAuthorizationStore
from .models import ServiceAuthorizationRecord
from .topology import plugin_ids, service_by_name


@dataclass(frozen=True, slots=True)
class ServiceContractHostCheck:
    command: str
    status: Literal["passed", "failed"]
    output: str
    code: str | None = None

    def to_dict(self) -> dict[str, object]:
        return {
            "command": self.command,
            "status": self.status,
            "output": self.output,
            **({"code": self.code} if self.code is not None else {}),
        }


class ServiceContractAuthorizationVerifier:
    def __init__(
        self,
        *,
        project_control: ProjectControlClient,
        store: ServiceContractAuthorizationStore,
    ) -> None:
        self.project_control = project_control
        self.store = store

    async def verify(
        self,
    ) -> tuple[
        tuple[ServiceContractHostCheck, ...],
        tuple[ServiceAuthorizationRecord, ...],
    ]:
        obligations = tuple(
            record for record in self.store.records() if record.status == "applied"
        )
        if not obligations:
            return (), ()
        topology = await self.project_control.inspect_ui_services()
        checks: list[ServiceContractHostCheck] = []
        passed: list[ServiceAuthorizationRecord] = []
        for record in obligations:
            spec = record.spec
            service = service_by_name(topology, spec.service_name)
            command = "service-contract-authorization"
            if service is None:
                checks.append(
                    ServiceContractHostCheck(
                        command,
                        "failed",
                        f'{spec.service_name} is absent from declared Service topology.',
                        "SERVICE_OWNERSHIP_MISMATCH",
                    )
                )
                continue
            providers = plugin_ids(service.get("providers"))
            if providers != (spec.owner_plugin_id,):
                checks.append(
                    ServiceContractHostCheck(
                        command,
                        "failed",
                        f'{spec.service_name} expected provider {spec.owner_plugin_id} but found {", ".join(providers) or "none"}.',
                        "SERVICE_OWNERSHIP_MISMATCH",
                    )
                )
                continue
            actual_consumers = tuple(
                sorted(
                    [(plugin, "required") for plugin in plugin_ids(service.get("requiredConsumers"))]
                    + [(plugin, "optional") for plugin in plugin_ids(service.get("optionalConsumers"))]
                )
            )
            if actual_consumers != spec.consumers:
                checks.append(
                    ServiceContractHostCheck(
                        command,
                        "failed",
                        f'{spec.service_name} consumer dependency modes do not match the authorized scope.',
                        "SERVICE_CONSUMER_SCOPE_MISMATCH",
                    )
                )
                continue
            paths = tuple(sorted(set(service.get("contractPaths") or [])))
            if paths != (spec.contract_path,):
                checks.append(
                    ServiceContractHostCheck(
                        command,
                        "failed",
                        f'{spec.service_name} expected contract path {spec.contract_path} but found {", ".join(paths) or "none"}.',
                        "SERVICE_CONTRACT_AUTHORIZATION_STALE",
                    )
                )
                continue
            checks.append(
                ServiceContractHostCheck(
                    command,
                    "passed",
                    f'{spec.service_name} ownership and Consumer wiring match the authorization.',
                )
            )
            passed.append(record)
        return tuple(checks), tuple(passed)

    def complete(self, records: tuple[ServiceAuthorizationRecord, ...]) -> None:
        for record in records:
            current = self.store.get_proposal(record.proposal_id)
            if current.status == "applied":
                self.store.update_status(current, "completed")

