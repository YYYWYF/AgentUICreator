from __future__ import annotations

import copy
import re
import time
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from typing import Any

from ..project_control import ProjectControlClient, ProjectControlError
from .models import (
    CreatorDomainSnapshot,
    MAX_PLUGIN_CAPABILITIES,
    MAX_PLUGIN_INSTANCES,
    MAX_PLUGIN_INTENTS,
    MAX_TOTAL_PLUGIN_INSTANCES,
    PluginCapability,
    PluginCapabilityIndex,
    PluginDefaultPlacement,
    PluginInstanceSummary,
    PluginRecommendedSize,
    RequiredServiceSummary,
)

_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_REQUIRED_OBSERVATION_COVERAGE = frozenset(
    {
        "composition.model",
        "composition.layout",
        "composition.slots",
        "composition.instances",
        "capability.inventory",
        "capability.composition-summary",
    }
)
_MAX_DESCRIPTION_CHARS = 400
_MAX_VISUAL_ROLE_CHARS = 200
_MAX_INTENT_CHARS = 200


class CreatorDomainSnapshotError(RuntimeError):
    """Raised when a successful ProjectControl response is not a valid snapshot."""

    code: str
    details: Any

    def __init__(self, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.details = details


@dataclass(slots=True)
class CreatorDomainSnapshotMetrics:
    builds: int = 0
    failures: int = 0
    durationMs: int = 0

    def to_dict(self) -> dict[str, int]:
        value = asdict(self)
        value["domainSnapshotBuildMs"] = value["durationMs"]
        return value


def _invalid(message: str, details: Any = None) -> CreatorDomainSnapshotError:
    return CreatorDomainSnapshotError("DOMAIN_SNAPSHOT_INVALID", message, details)


def _too_large(message: str, details: Any = None) -> CreatorDomainSnapshotError:
    return CreatorDomainSnapshotError("DOMAIN_SNAPSHOT_TOO_LARGE", message, details)


def _required_mapping(value: Any, path: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise _invalid(f"Domain snapshot field {path} must be an object.")
    return value


def _required_string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _invalid(f"Domain snapshot field {path} must be a non-empty string.")
    return value


def _required_bool(value: Any, path: str) -> bool:
    if not isinstance(value, bool):
        raise _invalid(f"Domain snapshot field {path} must be a boolean.")
    return value


def _bounded_text(value: Any, path: str, limit: int) -> str:
    return _required_string(value, path)[:limit]


def _optional_text(value: Any, path: str, limit: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise _invalid(f"Domain snapshot field {path} must be a string when present.")
    normalized = value.strip()
    return normalized[:limit] if normalized else None


def _build_plugin_capability(
    value: Any,
    *,
    index: int,
) -> PluginCapability:
    item = _required_mapping(value, f"capabilitySummaries[{index}]")
    plugin_id = _required_string(item.get("pluginId"), f"capabilitySummaries[{index}].pluginId")
    name = _required_string(item.get("name"), f"capabilitySummaries[{index}].name")
    description = _bounded_text(
        item.get("description"),
        f"capabilitySummaries[{index}].description",
        _MAX_DESCRIPTION_CHARS,
    )
    selected = _required_bool(
        item.get("selected"), f"capabilitySummaries[{index}].selected"
    )

    authoring_value = item.get("authoring")
    authoring = (
        {}
        if authoring_value is None
        else _required_mapping(authoring_value, f"capabilitySummaries[{index}].authoring")
    )
    intents_value = authoring.get("intents", [])
    if not isinstance(intents_value, list) or not all(
        isinstance(intent, str) and intent.strip() for intent in intents_value
    ):
        raise _invalid(
            f"Domain snapshot field capabilitySummaries[{index}].authoring.intents must be a string list."
        )
    if len(intents_value) > MAX_PLUGIN_INTENTS:
        raise _too_large(
            f"Plugin {plugin_id} declares too many intents.",
            {
                "field": f"capabilitySummaries[{index}].authoring.intents",
                "limit": MAX_PLUGIN_INTENTS,
                "actual": len(intents_value),
            },
        )
    intents = [intent[:_MAX_INTENT_CHARS] for intent in intents_value]
    visual_role = _optional_text(
        authoring.get("visualRole"),
        f"capabilitySummaries[{index}].authoring.visualRole",
        _MAX_VISUAL_ROLE_CHARS,
    )

    placement_value = authoring.get("typicalPlacement")
    placement = None
    if placement_value is not None:
        placement_data = _required_mapping(
            placement_value,
            f"capabilitySummaries[{index}].authoring.typicalPlacement",
        )
        relation = _required_string(
            placement_data.get("relation"),
            f"capabilitySummaries[{index}].authoring.typicalPlacement.relation",
        )
        if relation not in {"before", "after", "above", "below"}:
            raise _invalid(
                f"Unsupported default placement relation {relation!r} for Plugin {plugin_id}."
            )
        placement = PluginDefaultPlacement(
            relation=relation,
            anchorPluginId=_required_string(
                placement_data.get("anchorPluginId"),
                f"capabilitySummaries[{index}].authoring.typicalPlacement.anchorPluginId",
            ),
        )

    size_value = authoring.get("recommendedSize")
    recommended_size = None
    if size_value is not None:
        size_data = _required_mapping(
            size_value,
            f"capabilitySummaries[{index}].authoring.recommendedSize",
        )
        if size_data.get("width") is None and size_data.get("height") is None:
            raise _invalid(
                f"Recommended size for Plugin {plugin_id} must contain width or height."
            )
        for field in ("width", "height"):
            dimension = size_data.get(field)
            if dimension is not None and not isinstance(dimension, (int, float, str)):
                raise _invalid(
                    f"Domain snapshot field capabilitySummaries[{index}].authoring.recommendedSize.{field} has an unsupported value."
                )
        recommended_size = PluginRecommendedSize(
            width=size_data.get("width"),
            height=size_data.get("height"),
        )

    instances_value = item.get("currentInstances", item.get("instances", []))
    if not isinstance(instances_value, list):
        raise _invalid(
            f"Domain snapshot field capabilitySummaries[{index}].currentInstances must be a list."
        )
    if len(instances_value) > MAX_PLUGIN_INSTANCES:
        raise _too_large(
            f"Plugin {plugin_id} declares too many instances.",
            {
                "field": f"capabilitySummaries[{index}].currentInstances",
                "limit": MAX_PLUGIN_INSTANCES,
                "actual": len(instances_value),
            },
        )
    instances: list[PluginInstanceSummary] = []
    for instance_index, instance_value in enumerate(instances_value):
        instance = _required_mapping(
            instance_value,
            f"capabilitySummaries[{index}].currentInstances[{instance_index}]",
        )
        instances.append(
            PluginInstanceSummary(
                instanceId=_required_string(
                    instance.get("instanceId"),
                    f"capabilitySummaries[{index}].currentInstances[{instance_index}].instanceId",
                ),
                enabled=_required_bool(
                    instance.get("enabled"),
                    f"capabilitySummaries[{index}].currentInstances[{instance_index}].enabled",
                ),
            )
        )

    required_services_value = item.get("requiredServices")
    required_services = None
    if required_services_value is not None:
        required_services_data = _required_mapping(
            required_services_value,
            f"capabilitySummaries[{index}].requiredServices",
        )
        required_services = RequiredServiceSummary(
            status=_required_string(
                required_services_data.get("status"),
                f"capabilitySummaries[{index}].requiredServices.status",
            )
        )

    try:
        return PluginCapability(
            pluginId=plugin_id,
            name=name,
            description=description,
            intents=intents,
            visualRole=visual_role,
            selected=selected,
            instances=instances,
            defaultPlacement=placement,
            recommendedSize=recommended_size,
            requiredServices=required_services,
        )
    except ValueError as error:
        raise _invalid(
            f"Capability summary for Plugin {plugin_id} is invalid.",
            {"cause": str(error)},
        ) from error


def _build_plugin_index(result: Mapping[str, Any]) -> PluginCapabilityIndex:
    summaries = result.get("capabilitySummaries")
    if not isinstance(summaries, list):
        raise _invalid("Domain snapshot capabilitySummaries must be a list.")
    if len(summaries) > MAX_PLUGIN_CAPABILITIES:
        raise _too_large(
            "Domain snapshot contains too many Plugin capabilities.",
            {
                "field": "capabilitySummaries",
                "limit": MAX_PLUGIN_CAPABILITIES,
                "actual": len(summaries),
            },
        )

    plugins = [_build_plugin_capability(item, index=index) for index, item in enumerate(summaries)]
    total_instances = sum(len(plugin.instances) for plugin in plugins)
    if total_instances > MAX_TOTAL_PLUGIN_INSTANCES:
        raise _too_large(
            "Domain snapshot contains too many Plugin instances.",
            {
                "field": "capabilitySummaries[].currentInstances",
                "limit": MAX_TOTAL_PLUGIN_INSTANCES,
                "actual": total_instances,
            },
        )
    plugin_ids = [plugin.pluginId for plugin in plugins]
    if len(set(plugin_ids)) != len(plugin_ids):
        raise _invalid("Domain snapshot contains duplicate Plugin ids.")

    instance_ids: set[str] = set()
    for plugin in plugins:
        for instance in plugin.instances:
            if instance.instanceId in instance_ids:
                raise _invalid(
                    f"Domain snapshot contains duplicate instance id {instance.instanceId!r}."
                )
            instance_ids.add(instance.instanceId)

    return PluginCapabilityIndex(
        plugins=sorted(plugins, key=lambda plugin: plugin.pluginId)
    )


class CreatorDomainSnapshotProvider:
    """Build the authoritative composition snapshot before any resolver call."""

    def __init__(self, project_control: ProjectControlClient) -> None:
        self.project_control = project_control
        self.metrics = CreatorDomainSnapshotMetrics()

    async def build(self) -> CreatorDomainSnapshot:
        started_at = time.monotonic()
        self.metrics.builds += 1
        try:
            result = await self.project_control.inspect_ui_project(view="composition")
            snapshot = self._parse(result)
            return snapshot
        except ProjectControlError:
            self.metrics.failures += 1
            raise
        except CreatorDomainSnapshotError:
            self.metrics.failures += 1
            raise
        except Exception as error:
            self.metrics.failures += 1
            raise CreatorDomainSnapshotError(
                "DOMAIN_SNAPSHOT_BUILD_FAILED",
                "Creator domain snapshot construction failed.",
                {"cause": str(error)},
            ) from error
        finally:
            self.metrics.durationMs += round((time.monotonic() - started_at) * 1_000)

    @staticmethod
    def _parse(value: Any) -> CreatorDomainSnapshot:
        result = _required_mapping(value, "root")
        if result.get("view") != "composition":
            raise _invalid("Domain snapshot view must be composition.")

        app_ui_model = _required_mapping(result.get("appUIModel"), "appUIModel")
        app_ui_model_hash = _required_string(
            app_ui_model.get("hash"), "appUIModel.hash"
        )
        if _SHA256.fullmatch(app_ui_model_hash) is None:
            raise _invalid("Domain snapshot appUIModel.hash must be a lowercase SHA-256 hash.")

        coverage = result.get("observationCoverage")
        if not isinstance(coverage, list) or not all(
            isinstance(item, str) for item in coverage
        ):
            raise _invalid("Domain snapshot observationCoverage must be a string list.")
        missing_coverage = sorted(_REQUIRED_OBSERVATION_COVERAGE.difference(coverage))
        if missing_coverage:
            raise _invalid(
                "Domain snapshot observationCoverage is incomplete.",
                {"missing": missing_coverage},
            )

        catalog_revision = _required_string(
            result.get("capabilityCatalogRevision"),
            "capabilityCatalogRevision",
        )
        plugin_index = _build_plugin_index(result)
        raw = copy.deepcopy(dict(result))
        return CreatorDomainSnapshot(
            raw=raw,
            app_ui_model_hash=app_ui_model_hash,
            capability_catalog_revision=catalog_revision,
            observation_coverage=tuple(coverage),
            plugin_index=plugin_index,
        )
