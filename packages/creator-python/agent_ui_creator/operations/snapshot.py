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
    MAX_CHILD_SLOT_ACCEPTED_CAPABILITIES,
    MAX_CHILD_SLOT_DESCRIPTION_CHARS,
    MAX_CHILD_SLOT_NAME_CHARS,
    MAX_PLUGIN_CAPABILITIES,
    MAX_PLUGIN_ANCHOR_ID_CHARS,
    MAX_PLUGIN_AUTHORING_SIZE_CHARS,
    MAX_PLUGIN_CAPABILITY_CHARS,
    MAX_PLUGIN_CAPABILITY_TAGS,
    MAX_PLUGIN_CHILD_SLOTS,
    MAX_PLUGIN_DESCRIPTION_CHARS,
    MAX_PLUGIN_ID_CHARS,
    MAX_PLUGIN_INSTANCE_ID_CHARS,
    MAX_PLUGIN_INTENT_CHARS,
    MAX_PLUGIN_INSTANCES,
    MAX_PLUGIN_INTENTS,
    MAX_PLUGIN_NAME_CHARS,
    MAX_PLUGIN_VISUAL_ROLE_CHARS,
    MAX_REQUIRED_SERVICE_STATUS_CHARS,
    MAX_TOTAL_PLUGIN_CHILD_SLOTS,
    MAX_TOTAL_PLUGIN_INSTANCES,
    PluginChildSlotCapability,
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
    text = _required_string(value, path)
    if len(text) > limit:
        raise _too_large(
            f"Domain snapshot field {path} exceeds its character limit.",
            {"field": path, "limit": limit, "actual": len(text)},
        )
    return text


def _optional_text(value: Any, path: str, limit: int) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise _invalid(f"Domain snapshot field {path} must be a string when present.")
    if len(value) > limit:
        raise _too_large(
            f"Domain snapshot field {path} exceeds its character limit.",
            {"field": path, "limit": limit, "actual": len(value)},
        )
    normalized = value.strip()
    if not normalized:
        return None
    return normalized


def _check_optional_size_text(value: Any, path: str, limit: int) -> None:
    if isinstance(value, str) and len(value) > limit:
        raise _too_large(
            f"Domain snapshot field {path} exceeds its character limit.",
            {"field": path, "limit": limit, "actual": len(value)},
        )


def _build_plugin_child_slots(
    value: Any,
    *,
    index: int,
) -> list[PluginChildSlotCapability]:
    if value is None:
        return []
    child_slots = _required_mapping(value, f"capabilitySummaries[{index}].childSlots")
    if len(child_slots) > MAX_PLUGIN_CHILD_SLOTS:
        raise _too_large(
            f"Plugin at capabilitySummaries[{index}] declares too many child Slots.",
            {
                "field": f"capabilitySummaries[{index}].childSlots",
                "limit": MAX_PLUGIN_CHILD_SLOTS,
                "actual": len(child_slots),
            },
        )

    result: list[PluginChildSlotCapability] = []
    for slot_name, slot_value in sorted(child_slots.items(), key=lambda item: str(item[0])):
        slot_path = f"capabilitySummaries[{index}].childSlots[{slot_name!r}]"
        bounded_slot_name = _bounded_text(
            slot_name,
            f"{slot_path}.name",
            MAX_CHILD_SLOT_NAME_CHARS,
        )
        slot = _required_mapping(slot_value, slot_path)
        description = _bounded_text(
            slot.get("description"),
            f"{slot_path}.description",
            MAX_CHILD_SLOT_DESCRIPTION_CHARS,
        )
        cardinality = _required_string(slot.get("cardinality"), f"{slot_path}.cardinality")
        if cardinality not in {"one", "many"}:
            raise _invalid(
                f"Unsupported child Slot cardinality {cardinality!r} for Plugin Slot {bounded_slot_name}."
            )
        optional = slot.get("optional", False)
        if not isinstance(optional, bool):
            raise _invalid(f"Domain snapshot field {slot_path}.optional must be a boolean.")

        accepted_capabilities: list[str] = []
        accepts_value = slot.get("accepts")
        if accepts_value is not None:
            accepts = _required_mapping(accepts_value, f"{slot_path}.accepts")
            accepted_value = accepts.get("anyOfCapabilities")
            if not isinstance(accepted_value, list) or not all(
                isinstance(capability, str) and capability.strip()
                for capability in accepted_value
            ):
                raise _invalid(
                    f"Domain snapshot field {slot_path}.accepts.anyOfCapabilities must be a string list."
                )
            if len(accepted_value) > MAX_CHILD_SLOT_ACCEPTED_CAPABILITIES:
                raise _too_large(
                    f"Child Slot {bounded_slot_name} declares too many accepted capabilities.",
                    {
                        "field": f"{slot_path}.accepts.anyOfCapabilities",
                        "limit": MAX_CHILD_SLOT_ACCEPTED_CAPABILITIES,
                        "actual": len(accepted_value),
                    },
                )
            accepted_capabilities = [
                _bounded_text(
                    capability,
                    f"{slot_path}.accepts.anyOfCapabilities[{capability_index}]",
                    MAX_PLUGIN_CAPABILITY_CHARS,
                )
                for capability_index, capability in enumerate(accepted_value)
            ]
            if len(set(accepted_capabilities)) != len(accepted_capabilities):
                raise _invalid(
                    f"Child Slot {bounded_slot_name} declares duplicate accepted capabilities."
                )

        result.append(
            PluginChildSlotCapability(
                name=bounded_slot_name,
                description=description,
                cardinality=cardinality,
                optional=optional,
                acceptedCapabilities=accepted_capabilities,
            )
        )
    return result


def _build_plugin_capability(
    value: Any,
    *,
    index: int,
) -> PluginCapability:
    item = _required_mapping(value, f"capabilitySummaries[{index}]")
    plugin_id = _bounded_text(
        item.get("pluginId"),
        f"capabilitySummaries[{index}].pluginId",
        MAX_PLUGIN_ID_CHARS,
    )
    name = _bounded_text(
        item.get("name"),
        f"capabilitySummaries[{index}].name",
        MAX_PLUGIN_NAME_CHARS,
    )
    description = _bounded_text(
        item.get("description"),
        f"capabilitySummaries[{index}].description",
        MAX_PLUGIN_DESCRIPTION_CHARS,
    )
    selected = _required_bool(
        item.get("selected"), f"capabilitySummaries[{index}].selected"
    )

    capabilities_value = item.get("capabilities", [])
    if not isinstance(capabilities_value, list) or not all(
        isinstance(capability, str) and capability.strip()
        for capability in capabilities_value
    ):
        raise _invalid(
            f"Domain snapshot field capabilitySummaries[{index}].capabilities must be a string list."
        )
    if len(capabilities_value) > MAX_PLUGIN_CAPABILITY_TAGS:
        raise _too_large(
            f"Plugin {plugin_id} declares too many capabilities.",
            {
                "field": f"capabilitySummaries[{index}].capabilities",
                "limit": MAX_PLUGIN_CAPABILITY_TAGS,
                "actual": len(capabilities_value),
            },
        )
    capabilities = [
        _bounded_text(
            capability,
            f"capabilitySummaries[{index}].capabilities[{capability_index}]",
            MAX_PLUGIN_CAPABILITY_CHARS,
        )
        for capability_index, capability in enumerate(capabilities_value)
    ]
    if len(set(capabilities)) != len(capabilities):
        raise _invalid(f"Plugin {plugin_id} declares duplicate capabilities.")

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
    intents = [
        _bounded_text(
            intent,
            f"capabilitySummaries[{index}].authoring.intents[{intent_index}]",
            MAX_PLUGIN_INTENT_CHARS,
        )
        for intent_index, intent in enumerate(intents_value)
    ]
    visual_role = _optional_text(
        authoring.get("visualRole"),
        f"capabilitySummaries[{index}].authoring.visualRole",
        MAX_PLUGIN_VISUAL_ROLE_CHARS,
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
            anchorPluginId=_bounded_text(
                placement_data.get("anchorPluginId"),
                f"capabilitySummaries[{index}].authoring.typicalPlacement.anchorPluginId",
                MAX_PLUGIN_ANCHOR_ID_CHARS,
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
            _check_optional_size_text(
                dimension,
                f"capabilitySummaries[{index}].authoring.recommendedSize.{field}",
                MAX_PLUGIN_AUTHORING_SIZE_CHARS,
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
                instanceId=_bounded_text(
                    instance.get("instanceId"),
                    f"capabilitySummaries[{index}].currentInstances[{instance_index}].instanceId",
                    MAX_PLUGIN_INSTANCE_ID_CHARS,
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
            status=_bounded_text(
                required_services_data.get("status"),
                f"capabilitySummaries[{index}].requiredServices.status",
                MAX_REQUIRED_SERVICE_STATUS_CHARS,
            )
        )

    child_slots = _build_plugin_child_slots(item.get("childSlots"), index=index)

    try:
        return PluginCapability(
            pluginId=plugin_id,
            name=name,
            description=description,
            capabilities=capabilities,
            intents=intents,
            visualRole=visual_role,
            selected=selected,
            instances=instances,
            defaultPlacement=placement,
            recommendedSize=recommended_size,
            requiredServices=required_services,
            childSlots=child_slots,
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
    total_child_slots = sum(len(plugin.childSlots) for plugin in plugins)
    if total_child_slots > MAX_TOTAL_PLUGIN_CHILD_SLOTS:
        raise _too_large(
            "Domain snapshot contains too many Plugin child Slots.",
            {
                "field": "capabilitySummaries[].childSlots",
                "limit": MAX_TOTAL_PLUGIN_CHILD_SLOTS,
                "actual": total_child_slots,
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
