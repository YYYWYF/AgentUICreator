from __future__ import annotations

from pathlib import Path

from ..files import resolve_creator_project_file
from ..project_control import ProjectControlClient
from ..source_tools import SourceCreationError, UISourceCreationService, UISourceFile
from .authorization_store import ServiceContractAuthorizationStore
from .models import ServiceContractError
from .topology import available_plugin_ids, normalize_contract_path, service_by_name


class UIServiceContractCreationService:
    def __init__(
        self,
        *,
        project_root: str | Path,
        project_control: ProjectControlClient,
        store: ServiceContractAuthorizationStore,
        source_creation: UISourceCreationService,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.project_control = project_control
        self.store = store
        self.source_creation = source_creation
        self.activity = source_creation.activity

    async def _preflight(self, authorization_id: str) -> None:
        record = self.store.get_authorization(authorization_id)
        spec = record.spec
        normalize_contract_path(spec.contract_path)
        if spec.change_kind != "create" or record.status != "authorized":
            raise ServiceContractError(
                "SERVICE_CONTRACT_AUTHORIZATION_SCOPE_MISMATCH",
                "This authorization cannot create a Service Contract.",
            )
        topology = await self.project_control.inspect_ui_services()
        if service_by_name(topology, spec.service_name) is not None:
            self.store.update_status(record, "invalidated")
            raise ServiceContractError(
                "SERVICE_CONTRACT_AUTHORIZATION_STALE",
                f'Service "{spec.service_name}" appeared after authorization.',
            )
        inventory = await self.project_control.list_ui_plugins()
        existing = available_plugin_ids(inventory)
        required = {spec.owner_plugin_id, *(plugin for plugin, _ in spec.consumers)}
        missing = sorted(required - existing)
        if missing:
            self.store.update_status(record, "invalidated")
            raise ServiceContractError(
                "SERVICE_CONTRACT_AUTHORIZATION_STALE",
                "An authorized Owner or Consumer Plugin no longer exists.",
                {"missingPluginIds": missing},
            )
        self.store.update_status(record, "applied")

    @staticmethod
    def _assert_safe_target(target: Path, services_root: Path) -> None:
        if target.is_symlink() or (target.exists() and not target.is_file()):
            raise ServiceContractError(
                "SERVICE_CONTRACT_PATH_INVALID",
                "Service Contract target must be a non-symlink regular .ts file path.",
            )
        current = target.parent
        while current != services_root:
            if current.exists() and (not current.is_dir() or current.is_symlink()):
                raise ServiceContractError(
                    "SERVICE_CONTRACT_PATH_INVALID",
                    "Service Contract path contains an unsafe directory component.",
                )
            current = current.parent

    async def create(self, authorization_id: str, content: str) -> dict[str, object]:
        record = self.store.get_authorization(authorization_id)
        spec = record.spec
        if spec.change_kind != "create" or record.status != "authorized":
            raise ServiceContractError(
                "SERVICE_CONTRACT_AUTHORIZATION_SCOPE_MISMATCH",
                "This authorization cannot create a Service Contract.",
            )
        location = resolve_creator_project_file(self.project_root, spec.contract_path)
        services_root = self.project_root / "services"
        if services_root.exists() and (
            not services_root.is_dir() or services_root.is_symlink()
        ):
            raise ServiceContractError(
                "SERVICE_CONTRACT_PATH_INVALID",
                "The services directory must be a non-symlink directory.",
            )
        self._assert_safe_target(location.absolute_path, services_root)
        missing_directories: list[Path] = []
        current = location.absolute_path.parent
        while current != services_root:
            if not current.exists():
                missing_directories.append(current)
            current = current.parent

        try:
            result = await self.source_creation.create(
                [UISourceFile(path=f"/{spec.contract_path}", content=content)],
                preflight=lambda: self._preflight(authorization_id),
            )
        except BaseException as error:
            try:
                current_record = self.store.get_proposal(record.proposal_id)
                if current_record.status == "applied":
                    self.store.update_status(current_record, "authorized")
            except ServiceContractError:
                pass
            if isinstance(error, ServiceContractError):
                raise
            if not isinstance(error, SourceCreationError):
                raise ServiceContractError(
                    "SERVICE_CONTRACT_MUTATION_FAILED",
                    "The Creator Host could not create the Service Contract.",
                    {"cause": str(error)},
                ) from error
            code = (
                "SERVICE_CONTRACT_FILE_ALREADY_EXISTS"
                if error.code == "SOURCE_FILE_ALREADY_EXISTS"
                else "SERVICE_CONTRACT_MUTATION_ROLLBACK_FAILED"
                if error.code == "SOURCE_CREATION_ROLLBACK_FAILED"
                else "SERVICE_CONTRACT_MUTATION_FAILED"
            )
            raise ServiceContractError(code, str(error), error.details) from error
        for directory in sorted(missing_directories, key=lambda item: len(item.parts)):
            if directory.is_dir() and not directory.is_symlink():
                self.activity.record_created_directory(
                    directory.relative_to(self.project_root).as_posix()
                )
        return {
            "serviceName": spec.service_name,
            "contractPath": spec.contract_path,
            "ownerPluginId": spec.owner_plugin_id,
            "consumers": [
                {"pluginId": plugin_id, "dependencyMode": mode}
                for plugin_id, mode in spec.consumers
            ],
            "created": True,
            "mutationRevision": result.mutation_revision,
        }
