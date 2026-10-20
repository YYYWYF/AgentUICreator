import json
import pytest
from agent_ui_creator.minimal_agent.path_policy import MinimalAgentPathPolicy, PolicyFilesystemBackend
from agent_ui_creator.domain_tools.operator_tools import _composition_navigation, _render_project_inspection


def test_searches_real_nested_theme_files_without_silent_regex_absence(tmp_path):
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text(json.dumps({"mode":"embedded","sourceRoot":"src/agent-ui"}))
    for name, content in {"src/host.css":"color: #243247", "src/agent-ui/agent-ui/theme/theme-config.ts":"theme: violet", "src/theme.scss":"brand", "src/agent-ui/node_modules/private.css":"violet"}.items():
        target = tmp_path / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.inspect_read_only())
    assert len(backend.grep("violet").matches) == 1
    assert len(backend.grep("violet|indigo").matches) == 1
    assert len(backend.grep("#[0-9a-fA-F]{6}").matches) == 1
    assert len(backend.grep("#243247").matches) == 1
    assert len(backend.glob("**/*.{css,scss}").matches) == 2
    assert len(backend.glob("src/**/*theme*").matches) == 2
    assert backend.glob("src/**/node_modules/*").matches == []
    assert "TOOL_PERMISSION_DENIED" in backend.glob("../*").error
    assert "SEARCH_SYNTAX_UNSUPPORTED" in backend.glob("**/*.{css}").error


def test_regex_fallback_preserves_literals_and_reports_invalid_or_expensive_queries(tmp_path, monkeypatch):
    from agent_ui_creator.minimal_agent import path_policy
    (tmp_path / ".agent-ui").mkdir()
    (tmp_path / ".agent-ui/project.json").write_text('{"mode":"platform","sourceRoot":"src"}')
    (tmp_path / "src").mkdir()
    (tmp_path / "src/code.ts").write_text("a|b\na\nb\n")
    backend = PolicyFilesystemBackend(tmp_path, MinimalAgentPathPolicy.inspect_read_only())
    assert len(backend.grep("a|b").matches) == 1  # Exact code beats regex interpretation.
    assert len(backend.grep("^a$", path="/src", glob="*.ts").matches) == 1
    assert "SEARCH_SYNTAX_UNSUPPORTED" in backend.grep("[invalid").error
    assert backend.grep("^missing$", path="/src").matches == []
    class Expensive:
        def search(self, text, *, timeout):
            assert 0 < timeout <= 0.01
            raise TimeoutError
    monkeypatch.setattr(path_policy.bounded_regex, "compile", lambda _pattern: Expensive())
    result = backend.grep("(a+)+$")
    assert "SEARCH_TIMEOUT" in result.error and result.matches is None


@pytest.mark.parametrize("file,pattern,expected", [
    ("src/theme.ts", "src/**/*theme*", True),
    ("src/中文 空间/a/b/theme.css", "src/**/*theme*", True),
    ("src/a/b/file.ts", "src/*/*.ts", False),
    ("src/a.css", "src/**/*.{css,scss}", True),
    ("src/a/b/theme.css", "*.css", True),
])
def test_logical_globs_use_slashes_independently_of_native_os(file, pattern, expected):
    assert PolicyFilesystemBackend._matches(file, pattern) is expected


def test_large_composition_exposes_owner_navigation_before_first_page():
    result = {"sourceRoot":"src/agent-ui", "huge":"x"*60000,
              "creatorActions":{"revision":"a","candidates":[]},
              "authoringTargetCatalog":{"revision":"b","candidates":[{"id":"theme.brand-palette","kind":"application_config","name":"Palette"}],
                "bindings":[{"targetId":"theme.brand-palette","ownerPath":"src/agent-ui/agent-ui/conversation/styles.css"}]},
              "capabilitySummaries":[],"observationCoverage":[]}
    value = _composition_navigation(result)
    text, complete, state = _render_project_inspection(value, None, state=None, revision=0)
    page = json.loads(text)["result"]
    assert not complete
    assert page["navigation"]["applicationOwners"][0]["ownerPath"].endswith("conversation/styles.css")
    assert page["navigation"]["filesystem"]["sourceRoot"] == "/src/agent-ui"
    chunks = [page["pageText"]]
    while page["nextCursor"]:
        text, complete, state = _render_project_inspection(value, page["nextCursor"], state=state, revision=0)
        page = json.loads(text)["result"]
        chunks.append(page["pageText"])
    assert json.loads("".join(chunks))["result"] == value
