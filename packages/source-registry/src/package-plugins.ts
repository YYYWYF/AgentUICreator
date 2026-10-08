import manifest from "../registry/items/plugin-assistant-ui-composer/files/plugins/assistant-ui-composer/manifest.json" with { type: "json" };

/** Sole runtime delivery and service metadata authority for official package Plugins.
 * Source Items own reference-source requirements; Resources own product semantics.
 * Build/release checks validate services against the official reference definition.
 * Phase 1: only Composer changes ownership. Other source plugins migrate later.
 */
export const officialPackagePlugins = [{
  pluginId: manifest.id,
  manifest,
  runtime: { type: "package" as const, package: "@agent-ui/plugins", subpath: "./assistant-ui-composer", version: "^0.1.0" },
  referenceSourceItemId: "plugin/assistant-ui-composer",
  services: { provides: [], inject: [], optionalInject: ["agent-ui.locale"] } as { provides: string[]; inject: string[]; optionalInject: string[] },
}];
export function officialPackagePlugin(pluginId: string) {
  return officialPackagePlugins.find(plugin => plugin.pluginId === pluginId);
}
