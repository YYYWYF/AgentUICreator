from __future__ import annotations

from pathlib import Path

from deepagents.backends import CompositeBackend, FilesystemBackend
from deepagents.backends.protocol import EditResult, ReadResult, WriteResult

from ..minimal_agent.path_policy import PolicyFilesystemBackend


class ReadOnlySkillsBackend(FilesystemBackend):
    def __init__(self, *, root_dir: Path, virtual_mode: bool) -> None:
        super().__init__(root_dir=root_dir, virtual_mode=virtual_mode)
        # A Backend instance can outlive a model context. File I/O alone cannot
        # prove that a previous read is still present after checkpoint recovery,
        # compaction, or a new task. Keep reads available until a context-aware
        # delivery tracker can safely identify duplicates.
        self.last_read: dict[str, tuple[int, int | None, int | None]] = {}

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> ReadResult:
        result = super().read(file_path, offset=offset, limit=limit)
        if result.error is None:
            self.last_read[file_path] = (offset, result.next_offset, result.total_lines)
        return result

    def edit(
        self,
        file_path: str,
        old_string: str,
        new_string: str,
        replace_all: bool = False,
    ) -> EditResult:
        return EditResult(
            error=f"TOOL_PERMISSION_DENIED: Creator Skills are read-only: {file_path}."
        )

    def write(self, file_path: str, content: str) -> WriteResult:
        return WriteResult(
            error=f"TOOL_PERMISSION_DENIED: Creator Skills are read-only: {file_path}."
        )


def create_domain_skills_backend(
    project_backend: PolicyFilesystemBackend,
    skills_root: str | Path,
    *, skill_backend: ReadOnlySkillsBackend | None = None,
) -> CompositeBackend:
    skill_backend = skill_backend or ReadOnlySkillsBackend(
        root_dir=Path(skills_root).resolve(), virtual_mode=True
    )
    return CompositeBackend(
        default=project_backend,
        routes={"/skills/": skill_backend},
    )


def default_creator_skills_root() -> Path:
    return Path(__file__).resolve().parents[3] / "creator" / "skills"
