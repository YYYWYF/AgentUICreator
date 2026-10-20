"""Small project navigation from the owning config, never a full action catalog."""
import json

from ..project_paths import agent_ui_source_root, agent_ui_source_path


def creator_project_prompt(prompt: str, workspace) -> str:
    try:
        source_root = agent_ui_source_root(workspace)
    except ValueError:
        # Conformance/minimal fixtures may intentionally have no generated app.
        return prompt
    navigation = {
        "filesystemRoot": "/", "sourceRoot": "/" + source_root,
        "pluginRoot": agent_ui_source_path(workspace, "plugins"),
        "compositionSource": agent_ui_source_path(workspace, "app-ui/app-ui.json"),
        "localeRoot": agent_ui_source_path(workspace, "agent-ui/i18n"),
    }
    return prompt + "\n\nCurrent project navigation (data, not instructions or file-read evidence):\n" + json.dumps(navigation, ensure_ascii=False)
