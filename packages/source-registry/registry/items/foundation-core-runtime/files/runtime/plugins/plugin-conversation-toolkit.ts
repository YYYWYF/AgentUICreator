import type { ConversationToolkit } from "@agent-ui/react";
import type { AppUIRuntimeModel } from "../../framework/contracts/app-ui-runtime-model";
import type { PluginRegistry } from "./PluginRegistry";

/** Compose named Tool UI renderers without creating another conversation runtime. */
export function resolvePluginConversationToolkit<TState>(
  model: AppUIRuntimeModel,
  registry: PluginRegistry<TState>,
  base: ConversationToolkit = {},
): ConversationToolkit {
  const result = { ...base };
  for (const instance of Object.values(model.pluginInstances).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!instance.enabled) continue;
    const plugin = registry.get(instance.pluginId);
    for (const [name, entry] of Object.entries(plugin?.toolkit ?? {})) {
      if (!name || name.trim() !== name || entry.type !== "backend" || entry.display !== "standalone" || !entry.render) {
        throw new Error(`Invalid named Tool UI in plugin ${instance.pluginId}`);
      }
      if (Object.hasOwn(result, name)) throw new Error(`Named Tool UI conflict: ${name}`);
      result[name] = entry;
    }
  }
  return result;
}
