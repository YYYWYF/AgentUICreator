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


def test_partial_skill_read_does_not_mark_the_document_fully_read(tmp_path):
    (tmp_path / "guide.md").write_text("first\nsecond\nthird\n", encoding="utf-8")
    backend = ReadOnlySkillsBackend(root_dir=tmp_path, virtual_mode=True)
    first = backend.read("/guide.md", limit=1)
    assert first.total_lines == 3
    assert first.next_offset == 1
    assert first.file_data["content"] == "first\n"
    second = backend.read("/guide.md", offset=1, limit=1)
    assert second.error is None
    assert second.file_data["content"] == "second\n"
    assert second.next_offset == 2
    assert backend.read("/guide.md", limit=3).error is None
    assert "SKILL_RESOURCE_FULLY_READ" in backend.read("/guide.md").error
