from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path, PurePosixPath, PureWindowsPath

from ..activity import CreatorActivityRecorder
from ..app_ui_model import ProjectMutationCoordinator
from ..files import (
    CreatorFileState,
    CreatorFileStateConflictError,
    create_creator_file_atomically,
    creator_content_hash,
    read_creator_file_state,
    remove_creator_file,
    replace_creator_file_atomically,
    resolve_creator_project_file,
)
from ..minimal_agent.path_policy import MinimalAgentPathPolicy, PathPolicyViolation
from ..transactions import CreatorTransactionError
from .models import (
    MAX_PLUGIN_MUTATION_EDITS_PER_CALL,
    MAX_SOURCE_TOTAL_BYTES,
    CreateUIPluginSourceChange,
    EditUIPluginSourceChange,
    PluginSourceMutationError,
    PluginSourceMutationResult,
    UIPluginSourceChange,
)


_PLUGIN_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,99}$")


@dataclass(frozen=True, slots=True)
class _PreparedChange:
    change: UIPluginSourceChange
    relative_path: str
    virtual_path: str
    receipt_path: str
    absolute_path: Path


@dataclass(frozen=True, slots=True)
class _CommitChange:
    prepared: _PreparedChange
    before: CreatorFileState
    content: str

    @property
    def after(self) -> CreatorFileState:
        return CreatorFileState(True, creator_content_hash(self.content), self.content)


class UIPluginSourceMutationService:
    """Atomically edit and create bounded source files inside one existing Plugin."""

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

    @staticmethod
    def _normalize_relative_path(relative_path: str) -> str:
        if (
            not relative_path
            or relative_path != relative_path.strip()
            or relative_path.startswith("/")
            or bool(PureWindowsPath(relative_path).drive)
            or "\\" in relative_path
            or "\x00" in relative_path
            or ".." in PurePosixPath(relative_path).parts
        ):
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_PATH_INVALID",
                "Plugin source relativePath must stay inside the selected Plugin directory.",
                {"relativePath": relative_path},
            )
        normalized = PurePosixPath(relative_path).as_posix()
        if normalized in {"", "."}:
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_PATH_INVALID",
                "Plugin source relativePath must name a file inside the Plugin directory.",
                {"relativePath": relative_path},
            )
        return normalized

    def _plugin_root(self, plugin_id: str) -> Path:
        return resolve_creator_project_file(
            self.project_root, f"/plugins/{plugin_id}"
        ).absolute_path

    @staticmethod
    def _assert_plugin_exists(plugin_id: str, plugin_root: Path) -> None:
        if (
            not plugin_root.exists()
            or not plugin_root.is_dir()
            or plugin_root.is_symlink()
        ):
            raise PluginSourceMutationError(
                "PLUGIN_NOT_FOUND",
                f"Plugin directory does not exist: plugins/{plugin_id}",
                {"pluginId": plugin_id, "path": f"plugins/{plugin_id}"},
            )

    def _prepare(
        self, plugin_id: str, changes: list[UIPluginSourceChange]
    ) -> tuple[Path, list[_PreparedChange]]:
        if _PLUGIN_ID_PATTERN.fullmatch(plugin_id) is None:
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_MUTATION_INPUT_INVALID",
                "pluginId must match ^[a-z0-9][a-z0-9-]{0,99}$.",
                {"pluginId": plugin_id},
            )

        plugin_root = self._plugin_root(plugin_id)

        prepared: list[_PreparedChange] = []
        seen: set[str] = set()
        edit_count = 0
        total_bytes = len(plugin_id.encode("utf-8"))
        for change in changes:
            relative_path = self._normalize_relative_path(change.relativePath)
            virtual_path = f"/plugins/{plugin_id}/{relative_path}"
            try:
                self.policy.assert_write(virtual_path)
            except PathPolicyViolation as error:
                raise PluginSourceMutationError(
                    "PLUGIN_SOURCE_PATH_INVALID",
                    "Plugin source path is not writable Creator source.",
                    {"relativePath": change.relativePath},
                ) from error
            location = resolve_creator_project_file(self.project_root, virtual_path)
            if location.receipt_path in seen:
                raise PluginSourceMutationError(
                    "PLUGIN_SOURCE_FILE_DUPLICATE",
                    "Plugin source mutation contains duplicate normalized paths.",
                    {"path": location.receipt_path},
                )
            seen.add(location.receipt_path)
            total_bytes += len(relative_path.encode("utf-8"))
            if isinstance(change, EditUIPluginSourceChange):
                edit_count += len(change.edits)
                for edit in change.edits:
                    total_bytes += len(edit.oldText.encode("utf-8"))
                    total_bytes += len(edit.newText.encode("utf-8"))
            else:
                total_bytes += len(change.content.encode("utf-8"))
            prepared.append(
                _PreparedChange(
                    change=change,
                    relative_path=relative_path,
                    virtual_path=virtual_path,
                    receipt_path=location.receipt_path,
                    absolute_path=location.absolute_path,
                )
            )

        if edit_count > MAX_PLUGIN_MUTATION_EDITS_PER_CALL:
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_MUTATION_INPUT_INVALID",
                "Plugin source mutation contains too many text edits.",
                {"limit": MAX_PLUGIN_MUTATION_EDITS_PER_CALL},
            )
        if total_bytes > MAX_SOURCE_TOTAL_BYTES:
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_MUTATION_INPUT_INVALID",
                "Plugin source mutation payload exceeds the bounded operation limit.",
                {"limitBytes": MAX_SOURCE_TOTAL_BYTES},
            )
        self._assert_plugin_exists(plugin_id, plugin_root)
        return plugin_root, prepared

    @staticmethod
    def _assert_target_contained(
        plugin_root: Path, prepared: _PreparedChange
    ) -> None:
        candidate = prepared.absolute_path
        existing = candidate if candidate.exists() else candidate.parent
        while not existing.exists():
            existing = existing.parent
        try:
            existing.resolve(strict=True).relative_to(plugin_root.resolve(strict=True))
        except (FileNotFoundError, ValueError) as error:
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_PATH_INVALID",
                "Plugin source path resolves outside the selected Plugin directory.",
                {"path": prepared.receipt_path},
            ) from error

        current = candidate.parent
        while current != plugin_root:
            if current.exists() and (not current.is_dir() or current.is_symlink()):
                raise PluginSourceMutationError(
                    "PLUGIN_SOURCE_PATH_INVALID",
                    "Plugin source path contains an unsafe directory component.",
                    {"path": prepared.receipt_path},
                )
            current = current.parent
        if candidate.is_symlink():
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_PATH_INVALID",
                "Plugin source mutation cannot target a symbolic link.",
                {"path": prepared.receipt_path},
            )
        if candidate.exists() and not candidate.is_file():
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_PATH_INVALID",
                "Plugin source mutation target must be a regular file path.",
                {"path": prepared.receipt_path},
            )

    def _preflight(
        self, plugin_root: Path, prepared: list[_PreparedChange]
    ) -> tuple[list[_CommitChange], tuple[Path, ...]]:
        commits: list[_CommitChange] = []
        missing_directories: set[Path] = set()
        for item in prepared:
            self._assert_target_contained(plugin_root, item)
            observation = self.activity.file_observations.get(item.virtual_path)
            current = read_creator_file_state(self.project_root, item.virtual_path)
            if isinstance(item.change, EditUIPluginSourceChange):
                if observation is None:
                    raise PluginSourceMutationError(
                        "PLUGIN_SOURCE_OBSERVATION_REQUIRED",
                        "Read every existing mutation target in the current run first.",
                        {"path": item.receipt_path},
                    )
                if not observation.exists:
                    raise PluginSourceMutationError(
                        "PLUGIN_SOURCE_FILE_NOT_FOUND",
                        "Plugin source edit target does not exist.",
                        {"path": item.receipt_path},
                    )
                if (
                    current.exists != observation.exists
                    or current.hash != observation.hash
                ):
                    raise PluginSourceMutationError(
                        "PLUGIN_SOURCE_STALE_VERSION",
                        "Plugin source changed after it was read; read and reconcile it again.",
                        {"path": item.receipt_path},
                    )
                if current.content is None:
                    raise PluginSourceMutationError(
                        "PLUGIN_SOURCE_FILE_NOT_FOUND",
                        "Plugin source edit target does not exist.",
                        {"path": item.receipt_path},
                    )
                content = current.content
                for edit in item.change.edits:
                    old_text = edit.oldText.replace("\r\n", "\n").replace("\r", "\n")
                    new_text = edit.newText.replace("\r\n", "\n").replace("\r", "\n")
                    occurrences = content.count(old_text)
                    if occurrences == 0:
                        raise PluginSourceMutationError(
                            "PLUGIN_SOURCE_EDIT_TARGET_NOT_FOUND",
                            "Plugin source edit target was not found exactly.",
                            {"path": item.receipt_path},
                        )
                    if occurrences > 1 and not edit.replaceAll:
                        raise PluginSourceMutationError(
                            "PLUGIN_SOURCE_EDIT_TARGET_AMBIGUOUS",
                            "Plugin source edit target occurs more than once.",
                            {"path": item.receipt_path, "occurrences": occurrences},
                        )
                    content = content.replace(
                        old_text,
                        new_text,
                        -1 if edit.replaceAll else 1,
                    )
                if content != current.content:
                    commits.append(_CommitChange(item, current, content))
            else:
                if current.exists:
                    raise PluginSourceMutationError(
                        "PLUGIN_SOURCE_FILE_ALREADY_EXISTS",
                        "Plugin source create target already exists.",
                        {"path": item.receipt_path},
                    )
                commits.append(_CommitChange(item, current, item.change.content))
                directory = item.absolute_path.parent
                while directory != plugin_root:
                    if not directory.exists():
                        missing_directories.add(directory)
                    directory = directory.parent

        manifest = next(
            (
                commit.content
                for commit in commits
                if commit.prepared.relative_path == "manifest.json"
            ),
            None,
        )
        if manifest is not None:
            self._validate_manifest(manifest, plugin_root.name)
        return commits, tuple(missing_directories)

    @staticmethod
    def _validate_manifest(content: str, plugin_id: str) -> None:
        try:
            manifest = json.loads(content)
        except json.JSONDecodeError as error:
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_MANIFEST_INVALID",
                "Plugin manifest.json must contain valid JSON.",
                {"path": f"plugins/{plugin_id}/manifest.json", "cause": str(error)},
            ) from error
        if not isinstance(manifest, dict):
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_MANIFEST_INVALID",
                "Plugin manifest.json must contain a JSON object.",
                {"path": f"plugins/{plugin_id}/manifest.json"},
            )
        if manifest.get("id") != plugin_id:
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_MANIFEST_ID_MISMATCH",
                "Plugin manifest.id must exactly equal pluginId.",
                {"pluginId": plugin_id, "manifestId": manifest.get("id")},
            )

    @staticmethod
    def _cleanup_directories(directories: tuple[Path, ...]) -> None:
        for directory in sorted(
            directories, key=lambda path: len(path.parts), reverse=True
        ):
            try:
                directory.rmdir()
            except OSError:
                pass

    def _reconcile_incomplete_rollback(
        self, commits: list[_CommitChange], directories: tuple[Path, ...]
    ) -> None:
        residual_created = False
        for commit in commits:
            current = read_creator_file_state(
                self.project_root, commit.prepared.virtual_path
            )
            if (
                current.exists == commit.before.exists
                and current.hash == commit.before.hash
            ):
                continue
            self.activity.file_observations.observe(commit.prepared.virtual_path)
            self.activity.touch(commit.prepared.virtual_path)
            residual_created = residual_created or not commit.before.exists
        if residual_created:
            for directory in sorted(directories, key=lambda path: len(path.parts)):
                if (
                    directory.exists()
                    and directory.is_dir()
                    and not directory.is_symlink()
                ):
                    self.activity.record_created_directory(
                        directory.relative_to(self.project_root).as_posix()
                    )

    def _commit(
        self,
        plugin_root: Path,
        commits: list[_CommitChange],
        directories: tuple[Path, ...],
    ) -> None:
        try:
            for commit in commits:
                self.activity.capture_before_content(
                    commit.prepared.virtual_path, commit.before.content
                )
        except CreatorTransactionError as error:
            raise PluginSourceMutationError(
                error.code, str(error), error.details
            ) from error

        applied: list[_CommitChange] = []
        try:
            for commit in commits:
                self._assert_plugin_exists(plugin_root.name, plugin_root)
                self._assert_target_contained(plugin_root, commit.prepared)
                if isinstance(commit.prepared.change, CreateUIPluginSourceChange):
                    create_creator_file_atomically(
                        self.project_root,
                        commit.prepared.virtual_path,
                        commit.content,
                    )
                else:
                    replace_creator_file_atomically(
                        self.project_root,
                        commit.prepared.virtual_path,
                        commit.content,
                        expected=commit.before,
                    )
                applied.append(commit)
        except BaseException as error:
            rollback_errors: list[str] = []
            for commit in reversed(applied):
                try:
                    if commit.before.exists:
                        replace_creator_file_atomically(
                            self.project_root,
                            commit.prepared.virtual_path,
                            commit.before.content or "",
                            expected=commit.after,
                        )
                    else:
                        remove_creator_file(
                            self.project_root,
                            commit.prepared.virtual_path,
                            expected=commit.after,
                        )
                except BaseException as rollback_error:
                    rollback_errors.append(
                        f"{commit.prepared.receipt_path}: {rollback_error}"
                    )
            self._cleanup_directories(directories)
            if rollback_errors:
                self._reconcile_incomplete_rollback(applied, directories)
                raise PluginSourceMutationError(
                    "PLUGIN_SOURCE_MUTATION_ROLLBACK_FAILED",
                    "Plugin source mutation failed and rollback was incomplete.",
                    {"cause": str(error), "rollbackErrors": rollback_errors},
                ) from error
            if isinstance(error, CreatorFileStateConflictError):
                failed = next(
                    (
                        commit
                        for commit in commits
                        if commit.prepared.virtual_path == error.file_path
                    ),
                    None,
                )
                code = (
                    "PLUGIN_SOURCE_FILE_ALREADY_EXISTS"
                    if failed is not None and not failed.before.exists
                    else "PLUGIN_SOURCE_STALE_VERSION"
                )
                raise PluginSourceMutationError(
                    code,
                    "Plugin source changed before the atomic commit completed.",
                    {
                        "path": (
                            failed.prepared.receipt_path
                            if failed is not None
                            else str(error.file_path).lstrip("/")
                        )
                    },
                ) from error
            if isinstance(error, PluginSourceMutationError):
                raise error
            raise PluginSourceMutationError(
                "PLUGIN_SOURCE_MUTATION_FAILED",
                "The Creator Host could not commit the Plugin source mutation.",
                {"cause": str(error)},
            ) from error

        for commit in commits:
            self.activity.file_observations.observe(commit.prepared.virtual_path)
        for commit in commits:
            self.activity.touch(commit.prepared.virtual_path)
        for directory in sorted(directories, key=lambda path: len(path.parts)):
            self.activity.record_created_directory(
                directory.relative_to(self.project_root).as_posix()
            )

    async def mutate(
        self, plugin_id: str, changes: list[UIPluginSourceChange]
    ) -> PluginSourceMutationResult:
        plugin_root, prepared = self._prepare(plugin_id, changes)
        async with self.mutation_coordinator.transaction(self.project_root):
            self._assert_plugin_exists(plugin_id, plugin_root)
            commits, directories = self._preflight(plugin_root, prepared)
            if commits:
                self._commit(plugin_root, commits, directories)

        changed_paths = tuple(commit.prepared.receipt_path for commit in commits)
        modified_paths = tuple(
            commit.prepared.receipt_path
            for commit in commits
            if commit.before.exists
        )
        created_paths = tuple(
            commit.prepared.receipt_path
            for commit in commits
            if not commit.before.exists
        )
        return PluginSourceMutationResult(
            plugin_id=plugin_id,
            changed_paths=changed_paths,
            modified_paths=modified_paths,
            created_paths=created_paths,
            mutation_revision=self.activity.revision,
        )
