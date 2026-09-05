from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PathPolicyViolation,
    PolicyFilesystemBackend,
)


def test_development_path_policy_allows_reads_but_only_plugin_edits(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    (plugins / "foo.ts").write_text('export const value = "old";\n', encoding="utf-8")
    (plugins / "registry.generated.ts").write_text("generated\n", encoding="utf-8")
    (tmp_path / "app-ui").mkdir()
    (tmp_path / "app-ui" / "app-ui.json").write_text("{}\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    assert backend.read("/plugins/foo.ts").error is None
    assert backend.edit(
        "/plugins/foo.ts", '"old"', '"new"'
    ).error is None
    assert "TOOL_PERMISSION_DENIED" in backend.edit(
        "/plugins/registry.generated.ts", "generated", "changed"
    ).error
    assert "TOOL_PERMISSION_DENIED" in backend.edit(
        "/app-ui/app-ui.json", "{}", '{"changed":true}'
    ).error


def test_path_policy_rejects_escape_and_sensitive_paths(tmp_path):
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    assert "TOOL_PERMISSION_DENIED" in backend.read("../../etc/passwd").error
    assert "TOOL_PERMISSION_DENIED" in backend.read("~/.ssh/config").error
    assert "TOOL_PERMISSION_DENIED" in backend.read("/.env").error
    assert "TOOL_PERMISSION_DENIED" in backend.read("/node_modules/a.js").error


def test_conformance_policy_allows_fixture_edits_outside_plugins(tmp_path):
    (tmp_path / "src").mkdir()
    target = tmp_path / "src" / "activity.ts"
    target.write_text('export const activity = "old";\n', encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.conformance())

    assert backend.edit("/src/activity.ts", '"old"', '"new"').error is None
    assert '"new"' in target.read_text(encoding="utf-8")


def test_backend_revision_comes_from_activity_and_noop_does_not_increment(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    target = plugins / "foo.ts"
    target.write_text("old\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    assert backend.read("/plugins/foo.ts").error is None
    assert backend.edit("/plugins/foo.ts", "old", "old").error is None
    assert backend.mutation_revision == 0
    assert backend.edit("/plugins/foo.ts", "old", "new").error is None
    assert backend.mutation_revision == backend.activity.revision == 1


def test_backend_rejects_stale_edit_without_touching_activity(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    target = plugins / "foo.ts"
    target.write_text("old\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    assert backend.read("/plugins/foo.ts").error is None
    target.write_text("external\n", encoding="utf-8")
    result = backend.edit("/plugins/foo.ts", "old", "new")

    assert "stale-version" in result.error
    assert target.read_text(encoding="utf-8") == "external\n"
    assert backend.mutation_revision == 0
