import {
  parseUIPluginInject,
  parseUIPluginManifest,
  type UIPluginDefinition,
} from "../../framework/contracts/ui-plugin";
import type { PluginSlotCatalog } from "../../framework/contracts/app-ui-composition";

export interface PluginRegistry {
  register(plugin: UIPluginDefinition): void;
  get(pluginId: string): UIPluginDefinition | undefined;
  list(): UIPluginDefinition[];
}

export class StaticPluginRegistry implements PluginRegistry {
  readonly #plugins = new Map<string, UIPluginDefinition>();

  constructor(plugins: readonly UIPluginDefinition[] = []) {
    plugins.forEach((plugin) => this.register(plugin));
  }

  register(plugin: UIPluginDefinition): void {
    const manifest = parseUIPluginManifest(plugin.manifest);
    parseUIPluginInject(plugin.inject ?? []);

    if (this.#plugins.has(manifest.id)) {
      throw new Error(`UI plugin "${manifest.id}" is already registered`);
    }

    this.#plugins.set(manifest.id, plugin);
  }

  get(pluginId: string): UIPluginDefinition | undefined {
    return this.#plugins.get(pluginId);
  }

  list(): UIPluginDefinition[] {
    return [...this.#plugins.values()];
  }
}

export function createPluginRegistry(
  plugins: readonly UIPluginDefinition[] = [],
): PluginRegistry {
  return new StaticPluginRegistry(plugins);
}

export function createPluginSlotCatalog(
  registry: PluginRegistry,
): PluginSlotCatalog {
  return Object.fromEntries(
    registry.list().map((definition) => [
      definition.manifest.id,
      [...(definition.manifest.slots?.children ?? [])],
    ] as const),
  );
}
