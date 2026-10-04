from agent_ui_creator.domain_agent.skills import ReadOnlySkillsBackend


def test_skill_can_be_read_again_after_prior_delivery(tmp_path):
    (tmp_path / "guide.md").write_text("first\nsecond\n", encoding="utf-8")
    (tmp_path / "other.md").write_text("other\n", encoding="utf-8")
    backend = ReadOnlySkillsBackend(root_dir=tmp_path, virtual_mode=True)

    first = backend.read("/guide.md", limit=400)
    assert first.error is None
    assert first.total_lines == 2
    assert first.next_offset is None

    repeated = backend.read("/guide.md", offset=1, limit=1)
    assert repeated.error is None
    assert backend.read("/other.md").error is None

    (tmp_path / "guide.md").write_text("changed\n", encoding="utf-8")
    refreshed = backend.read("/guide.md")
    assert refreshed.error is None
    assert "changed" in refreshed.content
