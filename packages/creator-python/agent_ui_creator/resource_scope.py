from __future__ import annotations

import re
from collections.abc import Sequence
from pathlib import PurePosixPath
from string import ascii_letters, digits
from typing import Any, Literal, TypeAlias


ChangeLayer = Literal[
    "composition",
    "plugin_behavior",
    "runtime_capability",
    "agent_integration",
]

# Resource keys are semantic identities rather than arbitrary filesystem paths.
ResourceKey: TypeAlias = str

_RESOURCE_IDENTIFIER_CHARS = frozenset(ascii_letters + digits + "_.-/")
_RESOURCE_TOKEN = re.compile(
    r"(?<![A-Za-z0-9_.-])(?:app-ui-model|plugin|plugin-instance|service|agent-contract|source-item):[A-Za-z0-9][A-Za-z0-9._/-]*"
)
_RESOURCE_PATH = re.compile(
    r"(?<![A-Za-z0-9_.-])/?(?:app-ui/app-ui\.json|plugins/[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*|services/[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*|agent-contract/[A-Za-z0-9][A-Za-z0-9._-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)*)"
)


def normalize_creator_path(value: str) -> str:
    path = value if value.startswith("/") else f"/{value}"
    return "/" + "/".join(part for part in PurePosixPath(path).parts if part != "/")


def change_layer_for_path(path: str) -> ChangeLayer | None:
    normalized = normalize_creator_path(path)
    if normalized in {
        "/app-ui/app-ui.json",
        "/app-ui/composition-revision.generated.json",
        "/plugins/registry.generated.ts",
    }:
        return "composition"
    if normalized.startswith("/plugins/") or normalized.startswith("/agent-ui/"):
        return "plugin_behavior"
    if normalized.startswith("/services/"):
        return "runtime_capability"
    if normalized.startswith("/agent-contract/"):
        return "agent_integration"
    return None


def change_layers_for_paths(paths: Sequence[str]) -> tuple[ChangeLayer, ...]:
    layers: list[ChangeLayer] = []
    for path in paths:
        layer = change_layer_for_path(path)
        if layer is not None and layer not in layers:
            layers.append(layer)
    return tuple(layers)


def _resource_key(prefix: str, value: Any) -> ResourceKey | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    return f"{prefix}:{normalized}"


def resource_keys_for_path(
    path: str, *, service_name: str | None = None
) -> tuple[ResourceKey, ...]:
    """Resolve a project path to its stable semantic resource, when possible."""

    normalized = normalize_creator_path(path)
    if normalized in {
        "/app-ui/app-ui.json",
        "/app-ui/composition-revision.generated.json",
        "/plugins/registry.generated.ts",
    }:
        return ("app-ui-model",)

    parts = PurePosixPath(normalized).parts[1:]
    if len(parts) >= 2 and parts[0] == "plugins":
        resource = _resource_key("plugin", parts[1])
        return () if resource is None else (resource,)
    if len(parts) >= 2 and parts[0] == "services":
        resolved_name = service_name
        if resolved_name is None:
            filename = PurePosixPath(parts[-1])
            stem = filename.stem
            if len(parts) >= 3 and stem in {"contract", "index"}:
                resolved_name = parts[1]
            else:
                resolved_name = stem
        resource = _resource_key("service", resolved_name)
        return () if resource is None else (resource,)
    if len(parts) >= 2 and parts[0] == "agent-contract":
        resource = _resource_key("agent-contract", PurePosixPath(parts[-1]).stem)
        return () if resource is None else (resource,)
    return ()


def resource_keys_for_paths(paths: Sequence[str]) -> tuple[ResourceKey, ...]:
    resources: list[ResourceKey] = []
    for path in paths:
        for resource in resource_keys_for_path(path):
            if resource not in resources:
                resources.append(resource)
    return tuple(resources)


def contains_identifier(text: str, identifier: str) -> bool:
    """Return whether identifier occurs with semantic-identifier boundaries."""

    if not identifier:
        return False
    start = 0
    while True:
        index = text.find(identifier, start)
        if index < 0:
            return False
        before = text[index - 1] if index > 0 else ""
        after_index = index + len(identifier)
        after = text[after_index] if after_index < len(text) else ""
        if (
            before not in _RESOURCE_IDENTIFIER_CHARS
            and after not in _RESOURCE_IDENTIFIER_CHARS
        ):
            return True
        start = index + 1


def _append_resource(
    resources: list[ResourceKey], resource: ResourceKey | None
) -> None:
    if resource is not None and resource not in resources:
        resources.append(resource)


def resource_keys_for_evidence(
    evidence: str,
    *,
    known_resources: Sequence[ResourceKey] = (),
) -> tuple[ResourceKey, ...]:
    """Extract only reliable semantic resources from validation evidence."""

    resources: list[ResourceKey] = []
    for match in _RESOURCE_TOKEN.finditer(evidence):
        token = match.group(0).rstrip(".,;:)]}\"'")
        _append_resource(resources, token)
    for match in _RESOURCE_PATH.finditer(evidence.replace("\\", "/")):
        path = match.group(0).lstrip("/").rstrip(".,;:)]}\"'")
        for resource in resource_keys_for_path(path):
            _append_resource(resources, resource)
    for resource in known_resources:
        suffix = resource.split(":", 1)[-1]
        if contains_identifier(evidence, suffix):
            _append_resource(resources, resource)
    return tuple(resources)
