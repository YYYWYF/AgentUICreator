import { expect, it } from "vitest";
import { createDefaultAgentUIPresetRegistry, agentUIModeRegistry, AGENT_UI_MODES } from "../../src/bootstrap/index";
import { collectAppUIPluginLocations, parseAppUIModel } from "../../src/framework/contracts/app-ui-model";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "../../src/source-catalog/index";

const presets = createDefaultAgentUIPresetRegistry(parseAppUIModel);
const registry = await loadAgentUISourceRegistry();
const lexicalPackage = (name: string) => name === "lexical" || name.startsWith("@lexical/") || name === "@assistant-ui/react-lexical";

it.each(AGENT_UI_MODES)("%s initializes with basic editing and no Lexical package requirements", mode => {
  const preset = presets.getDefaultForMode(mode, agentUIModeRegistry);
  const plugins = collectAppUIPluginLocations(preset.createAppUIModel()).map(({ plugin }) => plugin.pluginId);
  expect(plugins).toContain("conversation-surface");
  expect(plugins).toContain("composer");
  expect(plugins).not.toContain("lexical-composer-input");
  expect(plugins).not.toContain("lexical-edit-composer");
  const items = preset.sourceItems!.flatMap(id => resolveAgentUISourceItemClosure(registry, id));
  const requirements = items.flatMap(item => Object.keys(item.packages ?? {}));
  expect(requirements.filter(lexicalPackage)).toEqual([]);
});

it.each(["lexical-composer-input", "lexical-edit-composer"])("%s retains its dependencies for explicit opt-in", pluginId => {
  const items = resolveAgentUISourceItemClosure(registry, `plugin/${pluginId}`);
  const requirements = Object.assign({}, ...items.map(item => item.packages ?? {}));
  expect(requirements).toMatchObject({ "@assistant-ui/react-lexical": "0.2.15", lexical: "0.51.0" });
});
