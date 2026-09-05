from __future__ import annotations

import hashlib
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


CREATOR_MISSING_FILE_HASH = hashlib.sha256(b"<missing>").hexdigest()


@dataclass(frozen=True, slots=True)
class CreatorProjectFileLocation:
    absolute_path: Path
    receipt_path: str


@dataclass(frozen=True, slots=True)
class CreatorFileState:
    exists: bool
    hash: str
    content: str | None = None


class CreatorFileStateConflictError(RuntimeError):
    code = "CREATOR_FILE_STATE_CONFLICT"

    def __init__(self, file_path: str) -> None:
        super().__init__(f"File changed before atomic commit: {file_path}")
        self.file_path = file_path


def creator_content_hash(content: str | bytes) -> str:
    payload = content.encode("utf-8") if isinstance(content, str) else content
    return hashlib.sha256(payload).hexdigest()


def resolve_creator_project_file(
    project_root: str | Path, file_path: str
) -> CreatorProjectFileLocation:
    if not isinstance(file_path, str) or not file_path or "\x00" in file_path:
        raise ValueError("Creator project file path is invalid.")
    mounted = file_path[9:] if file_path.startswith("/project/") else file_path
    relative = mounted.lstrip("/")
    parts = PurePosixPath(relative).parts
    if not relative or ".." in parts or PurePosixPath(relative).is_absolute():
        raise ValueError(f"Path traversal not allowed: {file_path}")

    root = Path(project_root).resolve()
    absolute = (root / Path(*parts)).absolute()
    try:
        absolute.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Path traversal not allowed: {file_path}") from error
    if absolute == root:
        raise ValueError(f"Path traversal not allowed: {file_path}")
    return CreatorProjectFileLocation(
        absolute_path=absolute,
        receipt_path=PurePosixPath(*parts).as_posix(),
    )


def _assert_within(root: Path, candidate: Path) -> None:
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise ValueError(f"Resolved path leaves the Creator project: {candidate}") from error


def _nearest_existing(path: Path) -> Path:
    candidate = path
    while not candidate.exists():
        parent = candidate.parent
        if parent == candidate:
            raise FileNotFoundError(path)
        candidate = parent
    return candidate


def _assert_contained(project_root: str | Path, absolute_path: Path) -> None:
    root = Path(project_root).resolve(strict=True)
    existing = absolute_path if absolute_path.exists() else _nearest_existing(absolute_path.parent)
    _assert_within(root, existing.resolve(strict=True))


def read_creator_file_state(
    project_root: str | Path, file_path: str
) -> CreatorFileState:
    location = resolve_creator_project_file(project_root, file_path)
    _assert_contained(project_root, location.absolute_path)
    try:
        payload = location.absolute_path.read_bytes()
    except FileNotFoundError:
        return CreatorFileState(False, CREATOR_MISSING_FILE_HASH)
    if not location.absolute_path.is_file():
        raise IsADirectoryError(location.absolute_path)
    return CreatorFileState(
        exists=True,
        hash=creator_content_hash(payload),
        content=payload.decode("utf-8"),
    )


def _stage_text_file(project_root: str | Path, location: CreatorProjectFileLocation, content: str) -> Path:
    _assert_contained(project_root, location.absolute_path)
    location.absolute_path.parent.mkdir(parents=True, exist_ok=True)
    _assert_contained(project_root, location.absolute_path.parent)
    descriptor, temporary = tempfile.mkstemp(
        prefix=f".{location.absolute_path.name}.creator-",
        suffix=".tmp",
        dir=location.absolute_path.parent,
    )
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise
    return Path(temporary)


def _assert_expected(
    project_root: str | Path,
    file_path: str,
    expected: CreatorFileState | None,
) -> None:
    if expected is None:
        return
    current = read_creator_file_state(project_root, file_path)
    if current.exists != expected.exists or current.hash != expected.hash:
        raise CreatorFileStateConflictError(file_path)


def replace_creator_file_atomically(
    project_root: str | Path,
    file_path: str,
    content: str,
    expected: CreatorFileState | None = None,
) -> None:
    location = resolve_creator_project_file(project_root, file_path)
    temporary = _stage_text_file(project_root, location, content)
    try:
        _assert_expected(project_root, file_path, expected)
        os.replace(temporary, location.absolute_path)
    finally:
        temporary.unlink(missing_ok=True)


def create_creator_file_atomically(
    project_root: str | Path, file_path: str, content: str
) -> None:
    location = resolve_creator_project_file(project_root, file_path)
    temporary = _stage_text_file(project_root, location, content)
    try:
        os.link(temporary, location.absolute_path)
    except FileExistsError as error:
        raise CreatorFileStateConflictError(file_path) from error
    finally:
        temporary.unlink(missing_ok=True)


def remove_creator_file(
    project_root: str | Path,
    file_path: str,
    expected: CreatorFileState | None = None,
) -> None:
    location = resolve_creator_project_file(project_root, file_path)
    _assert_contained(project_root, location.absolute_path)
    _assert_expected(project_root, file_path, expected)
    location.absolute_path.unlink(missing_ok=True)
