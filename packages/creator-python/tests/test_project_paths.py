from __future__ import annotations

import json
from pathlib import Path

import pytest

from agent_ui_creator.project_paths import (
    agent_ui_relative_source_path,
    agent_ui_source_path,
    validate_v2_source_root,
    v2_source_root,
)


SOURCE_ROOT_CASES = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/fixtures/agent-ui-source-root.json")
    .read_text(encoding="utf-8")
)


@pytest.mark.parametrize("source_root", SOURCE_ROOT_CASES["valid"])
def test_source_root_accepts_shared_contract(source_root):
    assert validate_v2_source_root(source_root) == source_root


@pytest.mark.parametrize("source_root", SOURCE_ROOT_CASES["invalid"])
def test_source_root_rejects_shared_contract(source_root):
    with pytest.raises(ValueError):
        validate_v2_source_root(source_root)


def test_logical_source_paths_resolve_for_v1_and_v2(tmp_path):
    logical = "plugins/foo/index.ts"
    assert agent_ui_source_path(tmp_path, logical) == "/plugins/foo/index.ts"
    assert agent_ui_relative_source_path(tmp_path, "/plugins/foo/index.ts") == logical
    assert agent_ui_relative_source_path(tmp_path, "/src/App.tsx") is None

    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(
        json.dumps({"version": "2", "mode": "assistant", "sourceRoot": "src/agent-ui"}),
        encoding="utf-8",
    )
    assert v2_source_root(tmp_path) == "src/agent-ui"
    assert agent_ui_source_path(tmp_path, logical) == "/src/agent-ui/plugins/foo/index.ts"
    assert agent_ui_relative_source_path(tmp_path, "/src/agent-ui/plugins/foo/index.ts") == logical
    assert agent_ui_relative_source_path(tmp_path, "/plugins/foo/index.ts") is None


@pytest.mark.parametrize("logical", ["/plugins/foo", "../foo", "plugins//foo", "plugins/./foo"])
def test_logical_source_path_rejects_non_relative_input(tmp_path, logical):
    with pytest.raises(ValueError):
        agent_ui_source_path(tmp_path, logical)


def test_v2_source_root_rejects_symlink_escape(tmp_path):
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    (tmp_path / "src").symlink_to(outside, target_is_directory=True)
    metadata = tmp_path / ".agent-ui"
    metadata.mkdir()
    (metadata / "project.json").write_text(
        json.dumps({"version": "2", "mode": "assistant", "sourceRoot": "src/agent-ui"}),
        encoding="utf-8",
    )
    with pytest.raises(ValueError, match="escapes Project Root"):
        agent_ui_source_path(tmp_path, "plugins/foo/index.ts")
