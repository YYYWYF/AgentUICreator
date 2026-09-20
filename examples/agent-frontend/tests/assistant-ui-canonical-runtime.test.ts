import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { parseAppUIModelJson } from "../framework/contracts/app-ui-model";
import { compileAppUIModel } from "../framework/contracts/app-ui-compiler";
import { resolveRuntimeLayoutSlotId } from "../framework/contracts/app-ui-composition";
import { pluginCapabilityCatalog } from "../plugins";
import { loadPluginDefinitions } from "../runtime/composition";
import { createPluginCompositionCatalog, createPluginRegistry } from "../runtime/plugins";

async function readModel() {
  const authoringModel = parseAppUIModelJson(
    await readFile(new URL("../app-ui/app-ui.json", import.meta.url), "utf8"),
  );
  const registry = createPluginRegistry(
    await loadPluginDefinitions(pluginCapabilityCatalog),
  );
  return compileAppUIModel(authoringModel, createPluginCompositionCatalog(registry));
}

describe("assistant-ui canonical runtime", () => {
  it("keeps canonical conversation owners enabled", async () => {
    const model = await readModel();

    expect(
      model.pluginInstances["conversation-thread-list-main"],
    ).toMatchObject({
      pluginId: "conversation-thread-list",
      enabled: true,
    });
    expect(
      model.pluginInstances["agent-conversation-surface-main"],
    ).toMatchObject({
      pluginId: "conversation-surface",
      enabled: true,
      mount: { slotId: resolveRuntimeLayoutSlotId("root.children[1].child") },
    });
    expect(model.pluginInstances["agent-conversation-service-main"]).toMatchObject({
      pluginId: "conversation-service",
      enabled: true,
    });
    expect(model.pluginInstances["theme-provider-main"]).toMatchObject({
      pluginId: "theme-provider",
      enabled: true,
    });
    expect(model.pluginInstances["locale-provider-main"]).toMatchObject({
      pluginId: "locale-provider",
      enabled: true,
    });
    expect(model.pluginInstances["theme-switch-main"]).toBeUndefined();
    expect(model.pluginInstances["agent-conversations-main"]).toBeUndefined();
    expect(
      model.pluginInstances["assistant-ui-conversation-spike-main"],
    ).toBeUndefined();

    expect(
      Object.values(model.pluginInstances)
        .filter((instance) => instance.enabled),
    ).toHaveLength(10);
    expect(
      model.pluginInstances["conversation-suggestions-main"],
    ).toMatchObject({
      pluginId: "conversation-suggestions",
      enabled: true,
      mount: { slotId: "plugin:agent-conversation-surface-main:emptySuggestions" },
    });
    expect(model.pluginInstances["assistant-ui-reasoning-main"]?.mount?.slotId)
      .toBe("plugin:agent-conversation-surface-main:reasoningGroup");
    expect(model.pluginInstances["assistant-ui-tool-group-main"]?.mount?.slotId)
      .toBe("plugin:agent-conversation-surface-main:toolGroup");
    expect(model.pluginInstances["assistant-ui-tool-fallback-main"]?.mount?.slotId)
      .toBe("plugin:agent-conversation-surface-main:toolFallback");
  });

  it("keeps App on one assistant-ui Runtime owner", async () => {
    const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");

    expect(app).toContain("function ConversationRuntimeBoundary");
    expect(app).toContain("<ConversationRuntimeProvider");
    expect(app).toContain("<ConversationRuntimeBoundary");
    expect(app.match(/<ConversationRuntimeProvider/gu)).toHaveLength(1);
    expect(app).toContain(
      'import "../agent-ui/conversation/styles.css";',
    );
    expect(app).not.toMatch(
      /createAgentRuntime|LegacyRuntimeBoundary|RuntimeModeBoundary|resolveConversationRuntimeMode|legacyRuntime|conversationSpike/u,
    );
  });

  it("keeps the canonical runtime diagnostics in the Dev Studio", async () => {
    const app = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
    const devStudio = await readFile(
      new URL("../src/dev/DevStudio/DevStudio.tsx", import.meta.url),
      "utf8",
    );
    const runtimePanel = await readFile(
      new URL("../src/dev/DevStudio/RuntimePanel.tsx", import.meta.url),
      "utf8",
    );
    const runtimePanelView = await readFile(
      new URL("../src/dev/DevStudio/RuntimePanelView.tsx", import.meta.url),
      "utf8",
    );

    expect(app).toContain("DevStudio");
    expect(app).toContain("import.meta.env.DEV");
    expect(app).not.toContain("ConversationRuntimeDebugOverlay");
    expect(devStudio).toContain("useMockScenarioAutorun");
    expect(runtimePanel).toContain("useAgentRuntimeSnapshot");
    expect(runtimePanel).toContain("useConversationRuntimeObservation");
    expect(runtimePanelView).toContain("Raw Snapshot");
    expect(runtimePanelView).toContain("conversationObservation");
  });
});
