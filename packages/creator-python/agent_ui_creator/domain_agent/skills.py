from __future__ import annotations

from pathlib import Path

from deepagents.backends import CompositeBackend, FilesystemBackend
from deepagents.backends.protocol import EditResult, WriteResult

from ..minimal_agent.path_policy import PolicyFilesystemBackend


class ReadOnlySkillsBackend(FilesystemBackend):
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
    return Path(__file__).resolve().parents[3] / "creator" / "skills"
