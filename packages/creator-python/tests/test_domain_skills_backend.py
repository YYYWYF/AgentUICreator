from agent_ui_creator.domain_agent.skills import ReadOnlySkillsBackend


def test_full_skill_read_blocks_redundant_offset_reads_but_keeps_other_files_available(tmp_path):
    (tmp_path / "guide.md").write_text("first\nsecond\n", encoding="utf-8")
    (tmp_path / "other.md").write_text("other\n", encoding="utf-8")
    backend = ReadOnlySkillsBackend(root_dir=tmp_path, virtual_mode=True)

    first = backend.read("/guide.md", limit=400)
    assert first.error is None
    assert first.total_lines == 2
    assert first.next_offset is None

    repeated = backend.read("/guide.md", offset=1, limit=1)
    assert repeated.error is not None
    assert "SKILL_RESOURCE_FULLY_READ" in repeated.error
    assert backend.read("/other.md").error is None
