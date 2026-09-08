from __future__ import annotations

from pathlib import Path

from ..activity import CreatorActivityRecorder
from ..app_ui_model import ProjectMutationCoordinator
from ..files import (
    CreatorFileState,
    CreatorFileStateConflictError,
    create_creator_file_atomically,
    creator_content_hash,
    read_creator_file_state,
    remove_creator_file,
    resolve_creator_project_file,
)
from ..minimal_agent.path_policy import MinimalAgentPathPolicy, PathPolicyViolation
from ..transactions import CreatorTransactionError
from .models import (
    MAX_SOURCE_TOTAL_BYTES,
    SourceCreationError,
    SourceCreationResult,
    UISourceFile,
)


class UISourceCreationService:
    """Create a bounded set of new UI source files as one rollback-safe mutation."""

    def __init__(
        self,
        *,
        project_root: str | Path,
        activity: CreatorActivityRecorder,
        mutation_coordinator: ProjectMutationCoordinator,
    ) -> None:
        self.project_root = Path(project_root).resolve()
        self.activity = activity
        self.mutation_coordinator = mutation_coordinator
        self.policy = MinimalAgentPathPolicy.development()

    def _authorize(self, path: str) -> tuple[str, str]:
        try:
            normalized = self.policy.assert_write(path)
        except PathPolicyViolation as error:
            raise SourceCreationError("SOURCE_PATH_DENIED", str(error)) from error
        if not (
            normalized.startswith("/plugins/")
            or normalized.startswith("/services/")
        ):
            raise SourceCreationError(
                "SOURCE_PATH_DENIED",
                "New source files are limited to /plugins/** and /services/**.",
                {"path": normalized},
            )
        if normalized == "/plugins/registry.generated.ts":
            raise SourceCreationError(
                "SOURCE_PATH_DENIED",
                "plugins/registry.generated.ts is generated and cannot be created directly.",
                {"path": normalized},
            )
        receipt_path = resolve_creator_project_file(
            self.project_root, normalized
        ).receipt_path
        return normalized, receipt_path

    def _prepare(
        self, files: list[UISourceFile]
    ) -> list[tuple[str, str, str]]:
        authorized: list[tuple[str, str, str]] = []
        seen: set[str] = set()
        total_bytes = 0
        for source in files:
            virtual_path, receipt_path = self._authorize(source.path)
            if receipt_path in seen:
                raise SourceCreationError(
                    "SOURCE_FILE_DUPLICATE",
                    "Source creation contains duplicate normalized paths.",
                    {"path": receipt_path},
                )
            seen.add(receipt_path)
            total_bytes += len(source.content.encode("utf-8"))
            if total_bytes > MAX_SOURCE_TOTAL_BYTES:
                raise SourceCreationError(
                    "SOURCE_CREATION_TOO_LARGE",
                    "Source creation payload exceeds the bounded operation limit.",
                    {"limitBytes": MAX_SOURCE_TOTAL_BYTES},
                )
            authorized.append((virtual_path, receipt_path, source.content))
        return authorized

    async def create(
        self,
        files: list[UISourceFile],
        *,
        require_absent_directory: str | None = None,
    ) -> SourceCreationResult:
        authorized = self._prepare(files)
        async with self.mutation_coordinator.transaction(self.project_root):
            absent_directory = (
                None
                if require_absent_directory is None
                else resolve_creator_project_file(
                    self.project_root, require_absent_directory
                ).absolute_path
            )
            if absent_directory is not None and absent_directory.exists():
                raise SourceCreationError(
                    "SOURCE_DIRECTORY_ALREADY_EXISTS",
                    f"Source directory already exists: {require_absent_directory}",
                    {"path": require_absent_directory.lstrip("/")},
                )
            try:
                return self._create_authorized(authorized)
            except BaseException:
                if absent_directory is not None:
                    candidate_directories = {absent_directory}
                    for virtual_path, _receipt_path, _content in authorized:
                        directory = resolve_creator_project_file(
                            self.project_root, virtual_path
                        ).absolute_path.parent
                        while (
                            directory == absent_directory
                            or absent_directory in directory.parents
                        ):
                            candidate_directories.add(directory)
                            if directory == absent_directory:
                                break
                            directory = directory.parent
                    for directory in sorted(
                        candidate_directories,
                        key=lambda path: len(path.parts),
                        reverse=True,
                    ):
                        try:
                            directory.rmdir()
                        except OSError:
                            pass
                raise

    def _create_authorized(
        self, authorized: list[tuple[str, str, str]]
    ) -> SourceCreationResult:
        for virtual_path, receipt_path, _content in authorized:
            state = read_creator_file_state(self.project_root, virtual_path)
            if state.exists:
                raise SourceCreationError(
                    "SOURCE_FILE_ALREADY_EXISTS",
                    f"Source file already exists: {receipt_path}",
                    {"path": receipt_path},
                )

        try:
            for virtual_path, _receipt_path, _content in authorized:
                self.activity.capture_before_content(virtual_path, None)
        except CreatorTransactionError as error:
            raise SourceCreationError(error.code, str(error)) from error

        created: list[tuple[str, str]] = []
        try:
            for virtual_path, _receipt_path, content in authorized:
                create_creator_file_atomically(
                    self.project_root, virtual_path, content
                )
                created.append((virtual_path, content))
            for virtual_path, _receipt_path, _content in authorized:
                self.activity.file_observations.observe(virtual_path)
            for virtual_path, _receipt_path, _content in authorized:
                self.activity.touch(virtual_path)
        except BaseException as error:
            rollback_errors: list[str] = []
            for virtual_path, content in reversed(created):
                try:
                    remove_creator_file(
                        self.project_root,
                        virtual_path,
                        CreatorFileState(
                            exists=True,
                            hash=creator_content_hash(content),
                            content=content,
                        ),
                    )
                    self.activity.file_observations.observe(virtual_path)
                except BaseException as rollback_error:
                    rollback_errors.append(f"{virtual_path}: {rollback_error}")
            if rollback_errors:
                raise SourceCreationError(
                    "SOURCE_CREATION_ROLLBACK_FAILED",
                    "Source creation failed and rollback was incomplete.",
                    {"cause": str(error), "rollbackErrors": rollback_errors},
                ) from error
            if isinstance(error, CreatorFileStateConflictError):
                raise SourceCreationError(
                    "SOURCE_FILE_ALREADY_EXISTS",
                    "A source path appeared before the create-only commit.",
                    {
                        "path": resolve_creator_project_file(
                            self.project_root, error.file_path
                        ).receipt_path
                    },
                ) from error
            if isinstance(error, SourceCreationError):
                raise
            raise SourceCreationError(
                "SOURCE_CREATION_FAILED",
                "The Creator Host could not create the requested source files.",
                {"cause": str(error)},
            ) from error

        return SourceCreationResult(
            created_paths=tuple(receipt_path for _, receipt_path, _ in authorized),
            mutation_revision=self.activity.revision,
        )
