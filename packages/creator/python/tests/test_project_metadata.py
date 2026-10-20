from __future__ import annotations

from pathlib import Path

import pytest

from agent_ui_creator.project_metadata import migrate_legacy_creator_metadata


def test_migrates_legacy_creator_data_and_merges_without_overwriting(tmp_path: Path) -> None:
    project = tmp_path / "工程 with spaces"
    project.mkdir()
    legacy = project / ".agentuicreator"
    (legacy / "logs").mkdir(parents=True)
    (legacy / "transactions").mkdir()
    (legacy / ".gitignore").write_text("*\n", encoding="utf-8")
    (legacy / "logs" / "run.jsonl").write_text("log\n", encoding="utf-8")
    current = project / ".agent-ui" / "creator"
    (current / "control").mkdir(parents=True)
    (current / ".gitignore").write_text("*\n!.gitignore\n", encoding="utf-8")
    (current / "control" / "pending.json").write_text("pending\n", encoding="utf-8")

    migrate_legacy_creator_metadata(project)
    migrate_legacy_creator_metadata(project)

    assert not legacy.exists()
    assert (current / "logs" / "run.jsonl").read_text(encoding="utf-8") == "log\n"
    assert (current / "control" / "pending.json").read_text(encoding="utf-8") == "pending\n"
    assert (current / ".gitignore").read_text(encoding="utf-8") == "*\n!.gitignore\n"


def test_migration_preserves_both_roots_when_same_path_has_different_content(tmp_path: Path) -> None:
    project = tmp_path / "host"
    project.mkdir()
    legacy = project / ".agentuicreator"
    current = project / ".agent-ui" / "creator"
    legacy.mkdir(parents=True)
    current.mkdir(parents=True)
    (legacy / "record.json").write_text("old\n", encoding="utf-8")
    (current / "record.json").write_text("new\n", encoding="utf-8")

    with pytest.raises(FileExistsError, match="different files"):
        migrate_legacy_creator_metadata(project)

    assert (legacy / "record.json").read_text(encoding="utf-8") == "old\n"
    assert (current / "record.json").read_text(encoding="utf-8") == "new\n"
