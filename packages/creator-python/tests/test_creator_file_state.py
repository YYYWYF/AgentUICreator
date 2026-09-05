import pytest

from agent_ui_creator.files import (
    CREATOR_MISSING_FILE_HASH,
    CreatorFileStateConflictError,
    creator_content_hash,
    read_creator_file_state,
    replace_creator_file_atomically,
    resolve_creator_project_file,
)


def test_hash_and_project_path_semantics_match_creator_contract(tmp_path):
    assert creator_content_hash("hello") == (
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    )
    assert CREATOR_MISSING_FILE_HASH == creator_content_hash("<missing>")
    assert resolve_creator_project_file(tmp_path, "/project/plugins/foo.ts").receipt_path == "plugins/foo.ts"
    assert resolve_creator_project_file(tmp_path, "/plugins/foo.ts").receipt_path == "plugins/foo.ts"
    assert resolve_creator_project_file(tmp_path, "plugins/foo.ts").receipt_path == "plugins/foo.ts"
    with pytest.raises(ValueError):
        resolve_creator_project_file(tmp_path, "../outside")
    with pytest.raises(ValueError):
        resolve_creator_project_file(tmp_path, "/")


def test_atomic_replace_checks_expected_state(tmp_path):
    target = tmp_path / "plugins" / "foo.ts"
    target.parent.mkdir()
    target.write_text("old", encoding="utf-8")
    expected = read_creator_file_state(tmp_path, "plugins/foo.ts")
    target.write_text("external", encoding="utf-8")

    with pytest.raises(CreatorFileStateConflictError):
        replace_creator_file_atomically(
            tmp_path, "plugins/foo.ts", "new", expected=expected
        )
    assert target.read_text(encoding="utf-8") == "external"


def test_file_state_rejects_symlink_escape(tmp_path):
    outside = tmp_path.parent / f"{tmp_path.name}-outside.txt"
    outside.write_text("secret", encoding="utf-8")
    link = tmp_path / "plugins" / "escape.ts"
    link.parent.mkdir()
    link.symlink_to(outside)
    try:
        with pytest.raises(ValueError):
            read_creator_file_state(tmp_path, "plugins/escape.ts")
    finally:
        outside.unlink(missing_ok=True)
