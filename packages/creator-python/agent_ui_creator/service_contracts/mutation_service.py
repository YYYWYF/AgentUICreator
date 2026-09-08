from __future__ import annotations

from pathlib import Path

from ..activity import CreatorActivityRecorder
from ..app_ui_model import ProjectMutationCoordinator
from ..files import (
    CreatorFileState,
    CreatorFileStateConflictError,
    creator_content_hash,
    read_creator_file_state,
    replace_creator_file_atomically,
    resolve_creator_project_file,
)
from ..project_control import ProjectControlClient
from ..source_tools.models import PluginSourceEdit
from ..transactions import CreatorTransactionError
from .authorization_store import ServiceContractAuthorizationStore
from .models import ServiceContractError
from .topology import normalize_contract_path, spec_from_existing_service


class UIServiceContractMutationService:
    def __init__(
        self,
        *,
        project_root: str | Path,
        project_control: ProjectControlClient,
        store: ServiceContractAuthorizationStore,
        activity: CreatorActivityRecorder,
        mutation_coordinator: ProjectMutationCoordinator,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.project_control = project_control
        self.store = store
        self.activity = activity
        self.mutation_coordinator = mutation_coordinator

    async def mutate(
        self, authorization_id: str, edits: list[PluginSourceEdit]
    ) -> dict[str, object]:
        record = self.store.get_authorization(authorization_id)
        spec = record.spec
        normalize_contract_path(spec.contract_path)
        if spec.change_kind == "create" and record.status != "applied":
            raise ServiceContractError(
                "SERVICE_CONTRACT_AUTHORIZATION_SCOPE_MISMATCH",
                "A create authorization can repair only its already-created Contract.",
            )
        if spec.change_kind == "mutate" and record.status not in {
            "authorized",
            "applied",
        }:
            raise ServiceContractError(
                "SERVICE_CONTRACT_AUTHORIZATION_SCOPE_MISMATCH",
                "This authorization cannot mutate a Service Contract.",
            )
        virtual_path = f"/{spec.contract_path}"
        location = resolve_creator_project_file(self.project_root, virtual_path)
        services_root = self.project_root / "services"
        current_directory = location.absolute_path.parent
        unsafe_directory = False
        while current_directory != services_root:
            if current_directory.exists() and (
                not current_directory.is_dir() or current_directory.is_symlink()
            ):
                unsafe_directory = True
                break
            current_directory = current_directory.parent
        if (
            unsafe_directory
            or not services_root.is_dir()
            or services_root.is_symlink()
            or location.absolute_path.is_symlink()
        ):
            raise ServiceContractError(
                "SERVICE_CONTRACT_PATH_INVALID",
                "Service Contract mutation cannot target a symbolic link.",
            )

        async with self.mutation_coordinator.transaction(self.project_root):
            if spec.change_kind == "mutate":
                try:
                    topology = await self.project_control.inspect_ui_services()
                    spec_from_existing_service(spec, topology)
                except ServiceContractError as error:
                    self.store.update_status(record, "invalidated")
                    raise ServiceContractError(
                        "SERVICE_CONTRACT_AUTHORIZATION_STALE",
                        "Service topology changed after Contract mutation authorization.",
                        {"causeCode": error.code, "cause": str(error)},
                    ) from error

            observation = self.activity.file_observations.get(virtual_path)
            if observation is None or not observation.exists:
                raise ServiceContractError(
                    "SERVICE_CONTRACT_OBSERVATION_REQUIRED",
                    "Read the exact Service Contract in the current run before mutation.",
                    {"contractPath": spec.contract_path},
                )
            current = read_creator_file_state(self.project_root, virtual_path)
            if not current.exists or current.content is None:
                raise ServiceContractError(
                    "SERVICE_CONTRACT_NOT_FOUND",
                    f"Service Contract does not exist: {spec.contract_path}",
                )
            if current.hash != observation.hash:
                raise ServiceContractError(
                    "SERVICE_CONTRACT_STALE_VERSION",
                    "Service Contract changed after it was read; read and reconcile it again.",
                    {"contractPath": spec.contract_path},
                )

            content = current.content
            for edit in edits:
                old_text = edit.oldText.replace("\r\n", "\n").replace("\r", "\n")
                new_text = edit.newText.replace("\r\n", "\n").replace("\r", "\n")
                occurrences = content.count(old_text)
                if occurrences == 0:
                    raise ServiceContractError(
                        "SERVICE_CONTRACT_EDIT_TARGET_NOT_FOUND",
                        "Service Contract edit target was not found exactly.",
                        {"contractPath": spec.contract_path},
                    )
                if occurrences > 1 and not edit.replaceAll:
                    raise ServiceContractError(
                        "SERVICE_CONTRACT_EDIT_TARGET_AMBIGUOUS",
                        "Service Contract edit target occurs more than once.",
                        {
                            "contractPath": spec.contract_path,
                            "occurrences": occurrences,
                        },
                    )
                content = content.replace(
                    old_text, new_text, -1 if edit.replaceAll else 1
                )
            if spec.service_name not in content:
                raise ServiceContractError(
                    "SERVICE_CONTRACT_AUTHORIZATION_SCOPE_MISMATCH",
                    "Service Contract mutation cannot remove or rename the authorized Service Name.",
                )
            transitioned = record.status == "authorized"
            if transitioned:
                self.store.update_status(record, "applied")
            if content != current.content:
                applied = False
                try:
                    self.activity.capture_before_content(virtual_path, current.content)
                    replace_creator_file_atomically(
                        self.project_root, virtual_path, content, expected=current
                    )
                    applied = True
                    self.activity.file_observations.observe(virtual_path)
                    self.activity.touch(virtual_path)
                except BaseException as error:
                    rollback_error: BaseException | None = None
                    if applied:
                        try:
                            replace_creator_file_atomically(
                                self.project_root,
                                virtual_path,
                                current.content,
                                expected=CreatorFileState(
                                    True, creator_content_hash(content), content
                                ),
                            )
                            self.activity.file_observations.observe(virtual_path)
                        except BaseException as candidate:
                            rollback_error = candidate
                    if transitioned:
                        try:
                            self.store.update_status(
                                self.store.get_proposal(record.proposal_id), "authorized"
                            )
                        except BaseException:
                            pass
                    if rollback_error is not None:
                        raise ServiceContractError(
                            "SERVICE_CONTRACT_MUTATION_ROLLBACK_FAILED",
                            "Service Contract mutation failed and rollback was incomplete.",
                            {
                                "cause": str(error),
                                "rollbackError": str(rollback_error),
                            },
                        ) from error
                    if isinstance(error, CreatorFileStateConflictError):
                        raise ServiceContractError(
                            "SERVICE_CONTRACT_STALE_VERSION",
                            "Service Contract changed before the atomic commit completed.",
                            {"contractPath": spec.contract_path},
                        ) from error
                    if isinstance(error, CreatorTransactionError):
                        raise ServiceContractError(
                            error.code, str(error), error.details
                        ) from error
                    raise ServiceContractError(
                        "SERVICE_CONTRACT_MUTATION_FAILED",
                        "The Creator Host could not commit the Service Contract mutation.",
                        {"cause": str(error)},
                    ) from error

        return {
            "serviceName": spec.service_name,
            "contractPath": spec.contract_path,
            "changed": content != current.content,
            "mutationRevision": self.activity.revision,
        }
