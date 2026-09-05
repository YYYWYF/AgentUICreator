import {
  parseUIPluginInject,
  parseUIPluginManifest,
  type UIPluginDefinition,
} from "../../framework/contracts/ui-plugin";
import type { PluginSlotCatalog } from "../../framework/contracts/app-ui-composition";

export interface PluginRegistry<TState = unknown> {
  register(plugin: UIPluginDefinition<TState>): void;
  get(pluginId: string): UIPluginDefinition<TState> | undefined;
  list(): UIPluginDefinition<TState>[];
}

export class StaticPluginRegistry<TState = unknown>
  implements PluginRegistry<TState> {
  readonly #plugins = new Map<string, UIPluginDefinition<TState>>();

  constructor(plugins: readonly UIPluginDefinition<TState>[] = []) {
    plugins.forEach((plugin) => this.register(plugin));
  }

  register(plugin: UIPluginDefinition<TState>): void {
    const manifest = parseUIPluginManifest(plugin.manifest);
    parseUIPluginInject(plugin.inject ?? []);

    if (this.#plugins.has(manifest.id)) {
      throw new Error(`UI plugin "${manifest.id}" is already registered`);
    }

    this.#plugins.set(manifest.id, plugin);
  }

  get(pluginId: string): UIPluginDefinition<TState> | undefined {
    return this.#plugins.get(pluginId);
  }

  list(): UIPluginDefinition<TState>[] {
    return [...this.#plugins.values()];
  }
}

export function createPluginRegistry<TState = unknown>(
  plugins:
    | readonly UIPluginDefinition<TState>[]
    | readonly UIPluginDefinition<unknown>[] = [],
): PluginRegistry<TState> {
  // Definitions typed with `unknown` are state-agnostic and can safely join a
  // registry whose composition root supplies a concrete application state.
  return new StaticPluginRegistry<TState>(
    plugins as readonly UIPluginDefinition<TState>[],
  );
}

export function createPluginSlotCatalog<TState = unknown>(
  registry: PluginRegistry<TState>,
): PluginSlotCatalog {
  return Object.fromEntries(
    registry.list().map((definition) => [
      definition.manifest.id,
      [...(definition.manifest.slots?.children ?? [])],
    ] as const),
  );
}
