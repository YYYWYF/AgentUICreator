import {
  parseUIPluginInject,
  parseUIPluginManifest,
  parseUIPluginOptionalInject,
  parseUIPluginProvides,
  type UIPluginDefinition,
  type UIPluginManifest,
} from "../../framework/contracts/ui-plugin.js";

export interface PluginCapabilityEntry<TState = unknown> {
  manifest: UIPluginManifest;
  provides: readonly string[];
  inject: readonly string[];
  optionalInject: readonly string[];
  /** Kept callable for existing project adapters and Runtime implementations. */
  loadDefinition(): Promise<UIPluginDefinition<TState>>;
  implementationExcluded?: boolean;
}

/** Accept catalogs emitted by the earlier metadata-only generator as well. */
export type PluginCapabilityInput<TState = unknown> = Omit<PluginCapabilityEntry<TState>, "loadDefinition"> & {
  loadDefinition?: PluginCapabilityEntry<TState>["loadDefinition"];
};

export interface PluginCapabilityCatalog<TState = unknown> {
  get(pluginId: string): PluginCapabilityEntry<TState> | undefined;
  list(): readonly PluginCapabilityEntry<TState>[];
}

class StaticPluginCapabilityCatalog<TState = unknown>
  implements PluginCapabilityCatalog<TState> {
  readonly #entries: readonly PluginCapabilityEntry<TState>[];
  readonly #entriesById: ReadonlyMap<string, PluginCapabilityEntry<TState>>;

  constructor(entries: readonly PluginCapabilityInput<TState>[]) {
    const entriesById = new Map<string, PluginCapabilityEntry<TState>>();
    this.#entries = entries.map((entry) => {
      const manifest = parseUIPluginManifest(entry.manifest);
      if (entriesById.has(manifest.id)) {
        throw new Error(
          `UI plugin capability "${manifest.id}" is already declared`,
        );
      }
      const normalized = {
        ...entry,
        manifest,
        implementationExcluded: entry.implementationExcluded ?? entry.loadDefinition === undefined,
        loadDefinition: entry.loadDefinition ?? (async () => {
          throw new Error(`UI plugin "${manifest.id}" has no enabled implementation. Regenerate the Plugin Registry after enabling it.`);
        }),
        provides: parseUIPluginProvides(entry.provides),
        inject: parseUIPluginInject(entry.inject),
        optionalInject: parseUIPluginOptionalInject(entry.optionalInject),
      };
      entriesById.set(manifest.id, normalized);
      return normalized;
    });
    this.#entriesById = entriesById;
  }

  get(pluginId: string): PluginCapabilityEntry<TState> | undefined {
    return this.#entriesById.get(pluginId);
  }

  list(): readonly PluginCapabilityEntry<TState>[] {
    return this.#entries;
  }
}

export function createPluginCapabilityCatalog<TState = unknown>(
  entries:
    | readonly PluginCapabilityInput<TState>[]
    | readonly PluginCapabilityInput<unknown>[],
): PluginCapabilityCatalog<TState> {
  return new StaticPluginCapabilityCatalog(
    entries as readonly PluginCapabilityInput<TState>[],
  );
}

export async function loadPluginDefinitions<TState = unknown>(
  catalog: PluginCapabilityCatalog<TState>,
  pluginIds: readonly string[] = catalog.list().filter(entry => entry.implementationExcluded !== true).map(({ manifest }) => manifest.id),
): Promise<UIPluginDefinition<TState>[]> {
  return Promise.all(pluginIds.map(async (pluginId) => {
    const entry = catalog.get(pluginId);
    if (entry === undefined) {
      throw new Error(`Unknown UI plugin capability "${pluginId}"`);
    }
    if (entry.loadDefinition === undefined) {
      throw new Error(`UI plugin "${pluginId}" has no enabled implementation. Regenerate the Plugin Registry after enabling it.`);
    }
    return entry.loadDefinition();
  }));
}
