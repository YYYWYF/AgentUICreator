import { DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT } from "../../src/source-catalog/loader.js";
import { resolveSourceRelease, type UpdateSourceProvider } from "../../src/source-catalog/release.js";

/** Temporary test data derived from current sources; never a publication record. */
export function syntheticReleaseProvider(latest = "0.0.2"): UpdateSourceProvider {
  return {
    async getLatestRelease() { return (await this.resolveRelease(latest)).descriptor; },
    async resolveRelease(version) {
      if (!["0.0.1", "0.0.2", "0.1.0", "0.1.1"].includes(version)) throw new Error("Unknown synthetic release");
      const release = await resolveSourceRelease(DEFAULT_AGENT_UI_SOURCE_REGISTRY_ROOT);
      release.descriptor.releaseVersion = version;
      release.registry.sourceRelease = version;
      for (const [id, plugin] of Object.entries(release.descriptor.plugins)) {
        const upgraded = id === "conversation-surface" && ["0.0.2", "0.1.1"].includes(version);
        plugin.version = upgraded ? "0.0.2" : "0.0.1";
        release.changelogs[id] = { "0.0.1": { summary: "Synthetic baseline", changes: ["Test baseline"] } };
        if (upgraded) release.changelogs[id]!["0.0.2"] = { summary: "Synthetic update", changes: ["Test update"] };
        const item = release.registry.byId.get(`plugin/${id}`)!;
        const manifest = item.loadedFiles.find(file => file.target === `plugins/${id}/manifest.json`)!;
        const data = JSON.parse(manifest.content.toString());
        data.version = plugin.version;
        manifest.content = Buffer.from(JSON.stringify(data, null, 2) + "\n");
        if (id === "conversation-surface") {
          const source = item.loadedFiles.find(file => file.target === `plugins/${id}/index.tsx`)!;
          // Standalone legacy fixture keeps semantic slots visible to the real verifier.
          const slots = Object.keys(data.slots?.children ?? {});
          source.content = Buffer.from('import type { UIPluginComponentProps } from "../../framework/contracts/ui-plugin";\nexport function ConversationSurfacePlugin({ renderSlot, renderScopedSlot }: UIPluginComponentProps) { return <>' + slots.map(slot => data.slots.children[slot].mode === "renderer" ? `{renderScopedSlot(${JSON.stringify(slot)}, { kind: ${JSON.stringify(data.slots.children[slot].scope ?? "test")}, value: {} })}` : `{renderSlot(${JSON.stringify(slot)})}`).join("") + '</>; }\n');
        }
        if (upgraded) {
          const source = item.loadedFiles.find(file => file.target === `plugins/${id}/index.tsx`)!;
          source.content = Buffer.from(source.content.toString() + "\n// Mock release 0.0.2\n");
        }
      }
      const authContract = release.registry.byId.get("plugin/auth-gate")!.loadedFiles.find(file => file.target === "services/auth/session.ts")!;
      release.registry.byId.get("foundation/core")!.loadedFiles.push({ ...authContract });
      return release;
    },
  };
}

/** Seed an already source-managed legacy project without performing a new takeover. */
export async function installSyntheticLegacySources(
  root: string,
  config: import("../../src/project/types.js").UIOperatorConfig,
  registry: import("../../src/source-catalog/index.js").LoadedAgentUISourceRegistry,
) {
  const { resolveAgentUISourceItemClosure } = await import("../../src/source-catalog/index.js");
  const { sourceItemLock } = await import("../../src/project/source-registry/installer.js");
  const { serializeAgentUISourceLock } = await import("../../src/project/source-registry/lock.js");
  const { commitAgentUISourceTransaction } = await import("../../src/project/source-registry/transaction.js");
  const items = resolveAgentUISourceItemClosure(registry, "plugin/conversation-surface");
  await commitAgentUISourceTransaction(root, config, "initialization",
    items.flatMap(item => item.loadedFiles.map(file => ({ target: file.target, content: file.content }))),
    serializeAgentUISourceLock({ sourceRoot: config.agentUI.sourceRoot, items: Object.fromEntries(items.map(item => [item.id, sourceItemLock(item, registry)])) }));
}
