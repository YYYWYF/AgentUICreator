import agent_ui_creator.minimal_agent.path_policy as path_policy_module

from agent_ui_creator.minimal_agent.path_policy import (
    MinimalAgentPathPolicy,
    PathPolicyViolation,
    PolicyFilesystemBackend,
)


def test_development_path_policy_allows_frontend_capability_contract_edits(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    (plugins / "foo.ts").write_text('export const value = "old";\n', encoding="utf-8")
    (plugins / "registry.generated.ts").write_text("generated\n", encoding="utf-8")
    (tmp_path / "app-ui").mkdir()
    (tmp_path / "app-ui" / "app-ui.json").write_text("{}\n", encoding="utf-8")
    agent_contract = tmp_path / "agent-contract"
    agent_contract.mkdir()
    (agent_contract / "agent-tools.ts").write_text("old\n", encoding="utf-8")
    (agent_contract / "agent-events.ts").write_text("old\n", encoding="utf-8")
    (agent_contract / "random.ts").write_text("old\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    assert backend.read("/plugins/foo.ts").error is None
    assert backend.edit(
        "/plugins/foo.ts", '"old"', '"new"'
    ).error is None
    assert backend.edit(
        "/agent-contract/agent-tools.ts", "old", "new"
    ).error is None
    assert backend.edit(
        "/agent-contract/agent-events.ts", "old", "new"
    ).error is None
    assert "TOOL_PERMISSION_DENIED" in backend.edit(
        "/agent-contract/random.ts", "old", "new"
    ).error
    assert (agent_contract / "random.ts").read_text(encoding="utf-8") == "old\n"
    assert "TOOL_PERMISSION_DENIED" in backend.edit(
        "/plugins/registry.generated.ts", "generated", "changed"
    ).error
    assert "TOOL_PERMISSION_DENIED" in backend.edit(
        "/app-ui/app-ui.json", "{}", '{"changed":true}'
    ).error


def test_domain_edit_file_cannot_modify_service_contract(tmp_path):
    services = tmp_path / "services"
    services.mkdir()
    target = services / "test-service.ts"
    target.write_text("before\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    assert backend.read("/services/test-service.ts").error is None
    result = backend.edit("/services/test-service.ts", "before", "after")

    assert "TOOL_PERMISSION_DENIED" in result.error
    assert "read-only to generic filesystem tools" in result.error
    assert target.read_text(encoding="utf-8") == "before\n"


def test_domain_edit_file_can_still_modify_plugin_source(tmp_path):
    target = tmp_path / "plugins" / "example" / "index.tsx"
    target.parent.mkdir(parents=True)
    target.write_text("before\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    assert backend.read("/plugins/example/index.tsx").error is None
    assert backend.edit(
        "/plugins/example/index.tsx", "before", "after"
    ).error is None
    assert target.read_text(encoding="utf-8") == "after\n"


def test_domain_edit_file_allows_agent_ui_source_but_denies_metadata(tmp_path):
    source = tmp_path / "agent-ui" / "primitives" / "button.css"
    source.parent.mkdir(parents=True)
    source.write_text("before\n", encoding="utf-8")
    metadata = tmp_path / ".agent-ui" / "source-lock.json"
    metadata.parent.mkdir()
    metadata.write_text("{}\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    assert backend.read("/agent-ui/primitives/button.css").error is None
    assert backend.edit(
        "/agent-ui/primitives/button.css", "before", "after"
    ).error is None
    denied = backend.edit("/.agent-ui/source-lock.json", "{}", '{"changed":true}')

    assert denied.error is not None
    assert "Host-managed metadata" in denied.error
    assert metadata.read_text(encoding="utf-8") == "{}\n"


def test_internal_source_policy_can_modify_service_contract(tmp_path):
    target = tmp_path / "services" / "test-service.ts"
    target.parent.mkdir()
    target.write_text("before\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.internal_source())

    assert backend.read("/services/test-service.ts").error is None
    assert backend.edit(
        "/services/test-service.ts", "before", "after"
    ).error is None
    assert target.read_text(encoding="utf-8") == "after\n"


def test_path_policy_rejects_escape_and_sensitive_paths(tmp_path):
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    assert "TOOL_PERMISSION_DENIED" in backend.read("../../etc/passwd").error
    assert "TOOL_PERMISSION_DENIED" in backend.read("~/.ssh/config").error
    assert "TOOL_PERMISSION_DENIED" in backend.read("/.env").error
    assert "TOOL_PERMISSION_DENIED" in backend.read("/node_modules/a.js").error


def test_creator_authorization_metadata_is_not_model_readable(tmp_path):
    target = tmp_path / ".agentuicreator/service-authorizations/authorization.json"
    target.parent.mkdir(parents=True)
    target.write_text("{}\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())

    result = backend.read(
        "/.agentuicreator/service-authorizations/authorization.json"
    )

    assert result.error is not None
    assert "TOOL_PERMISSION_DENIED" in result.error


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


def test_write_new_file_fails_closed_when_external_process_creates_it_before_commit(
    tmp_path, monkeypatch
):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    target = plugins / "new.ts"
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    assert backend.read("/plugins/new.ts").error is not None
    real_create = path_policy_module.create_creator_file_atomically

    def conflicting_create(project_root, file_path, content):
        target.write_text("external\n", encoding="utf-8")
        return real_create(project_root, file_path, content)

    monkeypatch.setattr(
        path_policy_module, "create_creator_file_atomically", conflicting_create
    )

    result = backend.write("/plugins/new.ts", "creator\n")

    assert "stale-version" in result.error
    assert target.read_text(encoding="utf-8") == "external\n"
    assert backend.mutation_revision == 0
    assert backend.activity.snapshot()["files"] == []
    assert "transaction" not in backend.activity.finish()


def test_write_existing_file_still_replaces_it(tmp_path):
    plugins = tmp_path / "plugins"
    plugins.mkdir()
    target = plugins / "existing.ts"
    target.write_text("before\n", encoding="utf-8")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.development())
    assert backend.read("/plugins/existing.ts").error is None

    result = backend.write("/plugins/existing.ts", "after\n")

    assert result.error is None
    assert target.read_text(encoding="utf-8") == "after\n"
    assert backend.mutation_revision == 1
