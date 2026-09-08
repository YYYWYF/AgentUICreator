from __future__ import annotations

import re
from pathlib import PurePosixPath, PureWindowsPath
from typing import Any

from .models import ServiceContractError, ServiceOwnershipSpec


SERVICE_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$")
PLUGIN_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,99}$")


def normalize_contract_path(value: str) -> str:
    if (
        not value
        or value != value.strip()
        or value.startswith("/")
        or bool(PureWindowsPath(value).drive)
        or "\\" in value
        or "\x00" in value
        or ".." in PurePosixPath(value).parts
    ):
        raise ServiceContractError(
            "SERVICE_CONTRACT_PATH_INVALID",
            "Service contractPath must be a canonical relative path under services/**.",
            {"contractPath": value},
        )
    normalized = PurePosixPath(value).as_posix()
    if (
        normalized != value
        or not normalized.startswith("services/")
        or not normalized.endswith(".ts")
        or normalized.endswith(".d.ts")
    ):
        raise ServiceContractError(
            "SERVICE_CONTRACT_PATH_INVALID",
            "Service contractPath must match services/**/*.ts.",
            {"contractPath": value},
        )
    return normalized


def validate_requested_spec(spec: ServiceOwnershipSpec) -> None:
    if SERVICE_NAME_PATTERN.fullmatch(spec.service_name) is None:
        raise ServiceContractError(
            "SERVICE_CONTRACT_PROPOSAL_INVALID",
            "serviceName must be lowercase dot-separated.",
            {"serviceName": spec.service_name},
        )
    normalize_contract_path(spec.contract_path)
    plugin_ids = [spec.owner_plugin_id, *(plugin for plugin, _ in spec.consumers)]
    if any(PLUGIN_ID_PATTERN.fullmatch(plugin_id) is None for plugin_id in plugin_ids):
        raise ServiceContractError(
            "SERVICE_CONTRACT_PROPOSAL_INVALID",
            "Owner and Consumer plugin ids are invalid.",
        )
    if len(plugin_ids) != len(set(plugin_ids)):
        raise ServiceContractError(
            "SERVICE_CONTRACT_PROPOSAL_INVALID",
            "Owner and Consumer scopes must be distinct and contain no duplicates.",
        )


def service_by_name(topology: dict[str, Any], service_name: str) -> dict[str, Any] | None:
    return next(
        (
            service
            for service in topology.get("services", [])
            if service.get("name") == service_name
        ),
        None,
    )


def plugin_ids(items: Any) -> tuple[str, ...]:
    return tuple(
        sorted(
            item["pluginId"]
            for item in items or []
            if isinstance(item, dict) and isinstance(item.get("pluginId"), str)
        )
    )


def spec_from_existing_service(
    requested: ServiceOwnershipSpec, topology: dict[str, Any]
) -> ServiceOwnershipSpec:
    service = service_by_name(topology, requested.service_name)
    if service is None:
        raise ServiceContractError(
            "SERVICE_CONTRACT_NOT_FOUND",
            f'Service "{requested.service_name}" does not exist.',
        )
    paths = tuple(sorted(set(service.get("contractPaths") or [])))
    if not paths:
        raise ServiceContractError(
            "SERVICE_CONTRACT_PATH_NOT_FOUND",
            f'Service "{requested.service_name}" has no canonical contract path.',
        )
    if len(paths) > 1:
        raise ServiceContractError(
            "SERVICE_CONTRACT_PATH_AMBIGUOUS",
            f'Service "{requested.service_name}" has multiple contract paths.',
            {"contractPaths": list(paths)},
        )
    providers = plugin_ids(service.get("providers"))
    if len(providers) != 1:
        raise ServiceContractError(
            "SERVICE_OWNERSHIP_MISMATCH",
            f'Service "{requested.service_name}" must have exactly one declared Provider.',
            {"providers": list(providers)},
        )
    consumers = tuple(
        sorted(
            [(plugin, "required") for plugin in plugin_ids(service.get("requiredConsumers"))]
            + [(plugin, "optional") for plugin in plugin_ids(service.get("optionalConsumers"))]
        )
    )
    actual = ServiceOwnershipSpec(
        change_kind="mutate",
        service_name=requested.service_name,
        contract_path=paths[0],
        owner_plugin_id=providers[0],
        consumers=tuple(sorted(consumers)),
    )
    if actual != requested:
        raise ServiceContractError(
            "SERVICE_CONTRACT_AUTHORIZATION_SCOPE_MISMATCH",
            "The proposed mutation scope does not exactly match authoritative Service topology.",
            {"authoritativeSpec": actual.to_dict()},
        )
    return actual


def available_plugin_ids(inventory: dict[str, Any]) -> set[str]:
    return {
        asset["pluginId"]
        for asset in inventory.get("pluginAssets", [])
        if isinstance(asset, dict) and isinstance(asset.get("pluginId"), str)
    }
