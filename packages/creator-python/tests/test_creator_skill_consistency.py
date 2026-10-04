import re
from pathlib import Path


SKILLS_ROOT = Path(__file__).resolve().parents[2] / "creator" / "skills"
EXPECTED = {
    "app-ui-model", "ui-layout", "ui-plugin-development",
    "ag-ui-frontend", "ui-debugging", "ui-change-recovery",
}


def test_published_skill_names_and_direct_references_are_self_contained():
    skills = list(SKILLS_ROOT.glob("*/SKILL.md"))
    assert {path.parent.name for path in skills} == EXPECTED
    for path in skills:
        text = path.read_text(encoding="utf-8")
        assert text.startswith("---\n")
        assert re.search(rf"(?m)^name: {re.escape(path.parent.name)}$", text)
        assert re.search(r"(?m)^description: .+", text)
        assert "allowed-tools:" not in text
        assert "undo_creator_run" not in text
        for target in re.findall(r"\]\((references/[^)]+)\)", text):
            assert (path.parent / target).is_file(), f"{path}: {target}"


def test_model_facing_references_do_not_require_repository_docs():
    for path in SKILLS_ROOT.rglob("*.md"):
        text = path.read_text(encoding="utf-8")
        assert "see `docs/" not in text
        assert "`docs/creator-" not in text
