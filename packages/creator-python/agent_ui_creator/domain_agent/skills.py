from __future__ import annotations

from pathlib import Path

from deepagents.backends import CompositeBackend, FilesystemBackend
from deepagents.backends.protocol import EditResult, ReadResult, WriteResult

from ..minimal_agent.path_policy import PolicyFilesystemBackend


class ReadOnlySkillsBackend(FilesystemBackend):
    def __init__(self, *, root_dir: Path, virtual_mode: bool) -> None:
        super().__init__(root_dir=root_dir, virtual_mode=virtual_mode)
        self._fully_read_paths: set[str] = set()

    def read(self, file_path: str, offset: int = 0, limit: int = 2000) -> ReadResult:
        if file_path in self._fully_read_paths:
            return ReadResult(
                error=f"SKILL_RESOURCE_FULLY_READ: {file_path} was already delivered "
                "in full. Use its content in this run; do not reread it by line "
                "or request another offset. Continue with the relevant project "
                "read or implementation step."
            )
        result = super().read(file_path, offset=offset, limit=limit)
        if (result.error is None and offset == 0 and result.next_offset is None
                and result.total_lines is not None):
            self._fully_read_paths.add(file_path)
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
) -> CompositeBackend:
    skill_backend = ReadOnlySkillsBackend(
        root_dir=Path(skills_root).resolve(), virtual_mode=True
    )
    return CompositeBackend(
        default=project_backend,
        routes={"/skills/": skill_backend},
    )


def default_creator_skills_root() -> Path:
    workspace_skills = Path(__file__).resolve().parents[3] / "creator" / "skills"
    if workspace_skills.is_dir():
        return workspace_skills
    return Path(__file__).resolve().parents[1] / "_skills"
