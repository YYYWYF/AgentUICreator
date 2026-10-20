from __future__ import annotations

import os
import stat
import tempfile
import threading
from pathlib import Path


_LEGACY_CREATOR_DIRECTORY = ".agentuicreator"
_CREATOR_DIRECTORY = Path(".agent-ui") / "creator"
_migration_lock = threading.RLock()


def _lstat(path: Path):
    try:
        return path.lstat()
    except FileNotFoundError:
        return None


def _assert_regular_tree(directory: Path) -> None:
    info = directory.lstat()
    if stat.S_ISLNK(info.st_mode) or not stat.S_ISDIR(info.st_mode):
        raise OSError(f"Creator metadata must be a regular directory: {directory}")
    for child in directory.iterdir():
        child_info = child.lstat()
        if stat.S_ISLNK(child_info.st_mode):
            raise OSError(f"Creator metadata cannot contain symbolic links: {child}")
        if stat.S_ISDIR(child_info.st_mode):
            _assert_regular_tree(child)
        elif not stat.S_ISREG(child_info.st_mode):
            raise OSError(f"Unsupported Creator metadata entry: {child}")


def _preflight_merge(source: Path, destination: Path) -> None:
    destination_info = _lstat(destination)
    if destination_info is None:
        return
    source_info = source.lstat()
    if stat.S_ISLNK(destination_info.st_mode):
        raise OSError(f"Cannot migrate Creator metadata over a symbolic link: {destination}")
    if stat.S_ISDIR(source_info.st_mode) and stat.S_ISDIR(destination_info.st_mode):
        for child in source.iterdir():
            _preflight_merge(child, destination / child.name)
        return
    if stat.S_ISREG(source_info.st_mode) and stat.S_ISREG(destination_info.st_mode):
        if source.name == ".gitignore" or source.read_bytes() == destination.read_bytes():
            return
    raise FileExistsError(f"Creator metadata migration found different files at {destination}")


def _merge_gitignore(source: Path, destination: Path) -> None:
    current = destination.read_text(encoding="utf-8").splitlines()
    old = source.read_text(encoding="utf-8").splitlines()
    merged = list(current)
    for line in old:
        if line and line not in merged:
            merged.append(line)
    descriptor, temporary = tempfile.mkstemp(prefix=".gitignore-migration-", dir=destination.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as stream:
            stream.write("" if not merged else "\n".join(merged) + "\n")
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)
    source.unlink()


def _merge_directory(source: Path, destination: Path) -> None:
    destination_info = _lstat(destination)
    if destination_info is None:
        source.rename(destination)
        return
    if stat.S_ISLNK(destination_info.st_mode) or not stat.S_ISDIR(destination_info.st_mode):
        raise OSError(f"Cannot migrate Creator metadata over an existing entry: {destination}")

    for child in source.iterdir():
        target = destination / child.name
        target_info = _lstat(target)
        if target_info is None:
            child.rename(target)
            continue
        source_info = child.lstat()
        if stat.S_ISDIR(source_info.st_mode) and stat.S_ISDIR(target_info.st_mode):
            _merge_directory(child, target)
            continue
        if stat.S_ISREG(source_info.st_mode) and stat.S_ISREG(target_info.st_mode):
            if child.name == ".gitignore":
                _merge_gitignore(child, target)
            elif child.read_bytes() == target.read_bytes():
                child.unlink()
            else:
                raise FileExistsError(f"Creator metadata migration found different files at {target}")
            continue
        raise FileExistsError(f"Creator metadata migration found different entries at {target}")
    source.rmdir()


def migrate_legacy_creator_metadata(project_root: str | Path) -> None:
    """Move legacy Creator state into .agent-ui/creator without overwriting data."""
    root = Path(project_root).resolve(strict=True)
    legacy = root / _LEGACY_CREATOR_DIRECTORY
    with _migration_lock:
        legacy_info = _lstat(legacy)
        if legacy_info is None:
            return
        _assert_regular_tree(legacy)

        metadata_root = root / ".agent-ui"
        metadata_info = _lstat(metadata_root)
        if metadata_info is not None and (stat.S_ISLNK(metadata_info.st_mode) or not stat.S_ISDIR(metadata_info.st_mode)):
            raise OSError(f"Agent UI metadata must be a regular directory: {metadata_root}")
        metadata_root.mkdir(exist_ok=True)

        destination = root / _CREATOR_DIRECTORY
        _preflight_merge(legacy, destination)
        _merge_directory(legacy, destination)
