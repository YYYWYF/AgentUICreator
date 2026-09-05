from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Literal
from uuid import uuid4

from deepagents.backends import FilesystemBackend
from deepagents.backends.protocol import (
    EditResult,
    GlobResult,
    GrepResult,
    LsResult,
    ReadResult,
    WriteResult,
)
from deepagents.backends.utils import perform_string_replacement

from ..activity import CreatorActivityRecorder
from ..files import CreatorFileObservationError, CreatorFileStateConflictError
from ..files import replace_creator_file_atomically
from ..transactions import CreatorTransactionError

_DENIED_DIRECTORY_NAMES = frozenset(
    {".git", "node_modules", "dist", "build", "coverage", "cache"}
)


class PathPolicyViolation(ValueError):
    code = "TOOL_PERMISSION_DENIED"


@dataclass(frozen=True, slots=True)
class MinimalAgentPathPolicy:
    mode: Literal["development", "conformance"] = "development"

    @classmethod
    def development(cls) -> "MinimalAgentPathPolicy":
        return cls(mode="development")

    @classmethod
    def conformance(cls) -> "MinimalAgentPathPolicy":
        return cls(mode="conformance")

    def normalize(self, path: str) -> str:
        if not isinstance(path, str) or not path or "\x00" in path or "\\" in path:
            raise PathPolicyViolation("TOOL_PERMISSION_DENIED: invalid virtual path.")
        if path.startswith("~"):
            raise PathPolicyViolation("TOOL_PERMISSION_DENIED: home paths are unavailable.")
        virtual = path if path.startswith("/") else f"/{path}"
        parts = PurePosixPath(virtual).parts
        if ".." in parts:
            raise PathPolicyViolation("TOOL_PERMISSION_DENIED: path traversal is unavailable.")
        return "/" + "/".join(part for part in parts if part != "/")

    def assert_read(self, path: str) -> str:
        normalized = self.normalize(path)
        parts = PurePosixPath(normalized).parts[1:]
        if any(part in _DENIED_DIRECTORY_NAMES for part in parts):
            raise PathPolicyViolation(
                f"TOOL_PERMISSION_DENIED: read access is denied for {normalized}."
            )
        if any(part == ".env" or part.startswith(".env.") for part in parts):
            raise PathPolicyViolation(
                f"TOOL_PERMISSION_DENIED: read access is denied for {normalized}."
            )
        return normalized

    def assert_write(self, path: str) -> str:
        normalized = self.assert_read(path)
        if self.mode == "development":
            if not normalized.startswith("/plugins/"):
                raise PathPolicyViolation(
                    f"TOOL_PERMISSION_DENIED: writes are limited to /plugins/**, not {normalized}."
                )
            if normalized == "/plugins/registry.generated.ts":
                raise PathPolicyViolation(
                    "TOOL_PERMISSION_DENIED: plugins/registry.generated.ts is read-only."
                )
        return normalized


class PolicyFilesystemBackend(FilesystemBackend):
    """FilesystemBackend with Creator-owned read/write policy and virtual paths."""

    def __init__(
        self,
        root_dir: str | Path,
        policy: MinimalAgentPathPolicy,
        *,
        activity: CreatorActivityRecorder | None = None,
        enforce_observations: bool | None = None,
    ):
        super().__init__(root_dir=root_dir, virtual_mode=True)
        self.policy = policy
        self.activity = activity or CreatorActivityRecorder(self.cwd)
        if activity is None:
            self.activity.begin(str(uuid4()))
        self.enforce_observations = (
            policy.mode != "conformance"
            if enforce_observations is None
            else enforce_observations
        )

    @property
    def mutation_revision(self) -> int:
        return self.activity.revision

    def _authorize(self, path: str, operation: Literal["read", "write"]) -> str:
        requested = (
            self.policy.assert_read(path)
            if operation == "read"
            else self.policy.assert_write(path)
        )
        try:
            resolved = super()._resolve_path(requested)
            actual = "/" + resolved.relative_to(self.cwd).as_posix()
        except (OSError, RuntimeError, ValueError) as error:
            raise PathPolicyViolation(
                "TOOL_PERMISSION_DENIED: path escapes the workspace."
            ) from error
        return (
            self.policy.assert_read(actual)
            if operation == "read"
            else self.policy.assert_write(actual)
        )

    @staticmethod
    def _denied(error: PathPolicyViolation) -> str:
        return str(error)

    def ls(self, path: str) -> LsResult:
        try:
            self._authorize(path, "read")
        except PathPolicyViolation as error:
            return LsResult(error=self._denied(error), entries=None)
        result = super().ls(path)
        if result.entries is not None:
            result.entries = [
                entry
                for entry in result.entries
                if self._read_allowed(str(entry.get("path") or ""))
            ]
        return result

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> ReadResult:
        try:
            authorized = self._authorize(file_path, "read")
        except PathPolicyViolation as error:
            return ReadResult(error=self._denied(error))
        if not self.enforce_observations:
            return super().read(authorized, offset=offset, limit=limit)
        try:
            return self.activity.file_observations.observe_stable_read(
                authorized,
                lambda: super(PolicyFilesystemBackend, self).read(
                    authorized, offset=offset, limit=limit
                ),
                lambda result: result.error is None,
            )
        except (CreatorFileObservationError, OSError, UnicodeError, ValueError) as error:
            return ReadResult(error=str(error))

    def edit(
        self,
        file_path: str,
        old_string: str,
        new_string: str,
        replace_all: bool = False,
    ) -> EditResult:
        try:
            authorized = self._authorize(file_path, "write")
        except PathPolicyViolation as error:
            return EditResult(error=self._denied(error))
        try:
            if not self.enforce_observations:
                self.activity.file_observations.observe(authorized)
            current = self.activity.file_observations.assert_fresh_for_edit(authorized)
            content = current.content
            if content is None:
                return EditResult(error=f"Error: File '{file_path}' not found")
            normalized_old = old_string.replace("\r\n", "\n").replace("\r", "\n")
            normalized_new = new_string.replace("\r\n", "\n").replace("\r", "\n")
            replacement = perform_string_replacement(
                content, normalized_old, normalized_new, replace_all
            )
            if isinstance(replacement, str):
                return EditResult(error=replacement)
            new_content, occurrences = replacement
            if new_content == content:
                return EditResult(path=file_path, occurrences=int(occurrences))
            self.activity.capture_before_content(authorized, content)
            replace_creator_file_atomically(
                self.cwd, authorized, new_content, expected=current
            )
            self.activity.file_observations.observe(authorized)
            self.activity.touch(authorized)
            return EditResult(path=file_path, occurrences=int(occurrences))
        except CreatorFileStateConflictError:
            return EditResult(
                error=f"stale-version: {file_path} changed before Creator could commit the edit. Read it again."
            )
        except CreatorFileObservationError as error:
            return EditResult(error=str(error))
        except CreatorTransactionError as error:
            return EditResult(error=f"{error.code}: {error}")
        except (OSError, UnicodeError, ValueError) as error:
            return EditResult(error=f"Error editing file '{file_path}': {error}")

    def write(self, file_path: str, content: str) -> WriteResult:
        try:
            authorized = self._authorize(file_path, "write")
        except PathPolicyViolation as error:
            return WriteResult(error=self._denied(error))
        try:
            if not self.enforce_observations:
                self.activity.file_observations.observe(authorized)
            current = self.activity.file_observations.assert_fresh_for_write(authorized)
            if current.exists and current.content == content:
                return WriteResult(path=file_path)
            self.activity.capture_before_content(authorized, current.content)
            replace_creator_file_atomically(
                self.cwd, authorized, content, expected=current
            )
            self.activity.file_observations.observe(authorized)
            self.activity.touch(authorized)
            return WriteResult(path=file_path)
        except CreatorFileStateConflictError:
            return WriteResult(
                error=f"stale-version: {file_path} changed before Creator could commit the write. Read it again."
            )
        except CreatorFileObservationError as error:
            return WriteResult(error=str(error))
        except CreatorTransactionError as error:
            return WriteResult(error=f"{error.code}: {error}")
        except (OSError, UnicodeError, ValueError) as error:
            return WriteResult(error=f"Error writing file '{file_path}': {error}")

    def grep(
        self,
        pattern: str,
        path: str | None = None,
        glob: str | None = None,
        *,
        max_count: int | None = None,
        context_lines: int = 0,
    ) -> GrepResult:
        try:
            virtual_root = self._authorize(path or "/", "read")
        except PathPolicyViolation as error:
            return GrepResult(error=self._denied(error), matches=None)
        root = super()._resolve_path(virtual_root)
        if root.is_file():
            candidates = [root]
        else:
            candidates = self._safe_files(root)
        matches = []
        for candidate in candidates:
            virtual = "/" + candidate.relative_to(self.cwd).as_posix()
            relative = candidate.relative_to(root).as_posix() if root.is_dir() else candidate.name
            if glob and not self._matches(relative, glob):
                continue
            try:
                lines = candidate.read_text(encoding="utf-8").splitlines()
            except (OSError, UnicodeDecodeError):
                continue
            for index, text in enumerate(lines, start=1):
                if pattern in text:
                    matches.append({"path": virtual, "line": index, "text": text})
                    if max_count is not None and len(matches) >= max_count:
                        return GrepResult(matches=matches, truncated=True)
        return GrepResult(matches=matches)

    def glob(self, pattern: str, path: str | None = None) -> GlobResult:
        try:
            virtual_root = self._authorize(path or "/", "read")
        except PathPolicyViolation as error:
            return GlobResult(error=self._denied(error), matches=None)
        if ".." in PurePosixPath(pattern).parts:
            return GlobResult(error="TOOL_PERMISSION_DENIED: parent glob segments are unavailable.")
        root = super()._resolve_path(virtual_root)
        matches = []
        for candidate in self._safe_files(root):
            relative = candidate.relative_to(root).as_posix()
            if self._matches(relative, pattern):
                matches.append(
                    {
                        "path": "/" + candidate.relative_to(self.cwd).as_posix(),
                        "is_dir": False,
                        "size": candidate.stat().st_size,
                    }
                )
        matches.sort(key=lambda entry: entry["path"])
        return GlobResult(matches=matches)

    def _safe_files(self, root: Path):
        if not root.exists() or not root.is_dir():
            return []
        files: list[Path] = []
        for current, directories, names in os.walk(root, followlinks=False):
            current_path = Path(current)
            directories[:] = [
                name
                for name in directories
                if self._read_allowed(
                    "/" + (current_path / name).relative_to(self.cwd).as_posix()
                )
            ]
            files.extend(
                current_path / name
                for name in names
                if self._read_allowed(
                    "/" + (current_path / name).relative_to(self.cwd).as_posix()
                )
            )
        return files

    def _read_allowed(self, path: str) -> bool:
        try:
            self._authorize(path, "read")
        except (PathPolicyViolation, ValueError):
            return False
        return True

    @staticmethod
    def _matches(relative: str, pattern: str) -> bool:
        normalized = pattern.lstrip("/")
        candidate = PurePosixPath(relative)
        return candidate.match(normalized) or (
            "/" not in normalized and candidate.name and PurePosixPath(candidate.name).match(normalized)
        )
