from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..source_tools.models import PluginSourceEdit


ChangeKind = Literal["create", "mutate"]
DependencyMode = Literal["required", "optional"]
AuthorizationStatus = Literal[
    "pending", "authorized", "applied", "completed", "invalidated"
]


class ServiceConsumerSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pluginId: str = Field(min_length=1, max_length=100)
    dependencyMode: DependencyMode


class PrepareUIServiceContractChangeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["propose", "confirm"]
    changeKind: ChangeKind | None = None
    serviceName: str | None = Field(default=None, min_length=1, max_length=200)
    contractPath: str | None = Field(default=None, min_length=1, max_length=1_000)
    ownerPluginId: str | None = Field(default=None, min_length=1, max_length=100)
    consumers: list[ServiceConsumerSpec] | None = Field(default=None, max_length=100)
    reason: str | None = Field(default=None, min_length=1, max_length=4_000)
    proposalId: str | None = Field(default=None, min_length=1, max_length=200)
    userAuthorizationEvidence: str | None = Field(
        default=None, min_length=1, max_length=4_000
    )

    @model_validator(mode="after")
    def validate_mode(self) -> "PrepareUIServiceContractChangeInput":
        if self.mode == "confirm":
            if self.proposalId is None or self.userAuthorizationEvidence is None:
                raise ValueError(
                    "confirm requires proposalId and userAuthorizationEvidence"
                )
            forbidden = (
                self.changeKind,
                self.serviceName,
                self.contractPath,
                self.ownerPluginId,
                self.consumers,
                self.reason,
            )
            if any(value is not None for value in forbidden):
                raise ValueError("confirm cannot replace the immutable proposal spec")
            return self
        required = (
            self.changeKind,
            self.serviceName,
            self.contractPath,
            self.ownerPluginId,
            self.consumers,
            self.reason,
        )
        if any(value is None for value in required):
            raise ValueError(
                "propose requires changeKind, serviceName, contractPath, "
                "ownerPluginId, consumers, and reason"
            )
        if self.proposalId is not None:
            raise ValueError("propose cannot supply proposalId")
        return self


class CreateUIServiceContractInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    authorizationId: str = Field(min_length=1, max_length=200)
    content: str = Field(max_length=1_000_000)


class MutateUIServiceContractInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    authorizationId: str = Field(min_length=1, max_length=200)
    edits: list[PluginSourceEdit] = Field(min_length=1, max_length=100)


class ServiceContractError(RuntimeError):
    def __init__(
        self, code: str, message: str, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details


@dataclass(frozen=True, slots=True)
class ServiceOwnershipSpec:
    change_kind: ChangeKind
    service_name: str
    contract_path: str
    owner_plugin_id: str
    consumers: tuple[tuple[str, DependencyMode], ...]

    def to_dict(self) -> dict[str, object]:
        return {
            "changeKind": self.change_kind,
            "serviceName": self.service_name,
            "contractPath": self.contract_path,
            "ownerPluginId": self.owner_plugin_id,
            "consumers": [
                {"pluginId": plugin_id, "dependencyMode": mode}
                for plugin_id, mode in self.consumers
            ],
        }

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "ServiceOwnershipSpec":
        return cls(
            change_kind=value["changeKind"],
            service_name=value["serviceName"],
            contract_path=value["contractPath"],
            owner_plugin_id=value["ownerPluginId"],
            consumers=tuple(
                (item["pluginId"], item["dependencyMode"])
                for item in value.get("consumers", [])
            ),
        )


@dataclass(frozen=True, slots=True)
class ServiceAuthorizationRecord:
    proposal_id: str
    authorization_id: str | None
    spec: ServiceOwnershipSpec
    status: AuthorizationStatus
    scope_hash: str
    created_at: str
    updated_at: str

    def to_dict(self) -> dict[str, object]:
        return {
            "schemaVersion": 1,
            "proposalId": self.proposal_id,
            "authorizationId": self.authorization_id,
            "spec": self.spec.to_dict(),
            "status": self.status,
            "scopeHash": self.scope_hash,
            "timestamps": {
                "createdAt": self.created_at,
                "updatedAt": self.updated_at,
            },
        }

    @classmethod
    def from_dict(cls, value: dict[str, Any]) -> "ServiceAuthorizationRecord":
        timestamps = value["timestamps"]
        return cls(
            proposal_id=value["proposalId"],
            authorization_id=value.get("authorizationId"),
            spec=ServiceOwnershipSpec.from_dict(value["spec"]),
            status=value["status"],
            scope_hash=value["scopeHash"],
            created_at=timestamps["createdAt"],
            updated_at=timestamps["updatedAt"],
        )


@dataclass(frozen=True, slots=True)
class CurrentUserAuthorizationContext:
    current_user_message: str
    thread_id: str
    run_id: str
    project_root: str
