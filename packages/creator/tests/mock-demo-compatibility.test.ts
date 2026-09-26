import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectMockDemoCompatibility } from "../src/mock/demo-compatibility.js";

describe("Mock Demo project requirements", () => {
  it("distinguishes absent, installed but disabled, and enabled plugins from current files", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "mock-demo-project-"));
    try {
      const source = path.join(projectRoot, "custom-ui");
      await mkdir(path.join(source, "app-ui"), { recursive: true });
      const model = path.join(source, "app-ui/app-ui.json");
      const target = { id: "project", projectRoot, sourceRoot: "custom-ui" };
      const chart = async () => (await inspectMockDemoCompatibility(target)).requirements.find(r => r.pluginId === "chart-message");
      await writeFile(model, JSON.stringify({ applicationPlugins: [] }));
      expect((await chart())?.status).toBe("missing");
      const missing = await inspectMockDemoCompatibility(target);
      for (const pluginId of ["job-progress-message", "agent-plan-message", "agent-status-message"]) {
        expect(missing.requirements.find(requirement => requirement.pluginId === pluginId)?.status).toBe("missing");
      }
      const plugin = path.join(source, "plugins/chart-message");
      await mkdir(plugin, { recursive: true });
      await writeFile(path.join(plugin, "manifest.json"), JSON.stringify({ id: "chart-message", data: { messageUI: true } }));
      await writeFile(path.join(plugin, "definition.ts"), "export default {};\n");
      expect((await chart())?.status).toBe("disabled");
      await writeFile(model, JSON.stringify({ applicationPlugins: [{ pluginId: "chart-message", enabled: false }] }));
      expect((await chart())?.status).toBe("disabled");
      await writeFile(model, JSON.stringify({ applicationPlugins: [{ pluginId: "chart-message", enabled: true }] }));
      expect((await chart())?.status).toBe("ready");
      await writeFile(model, JSON.stringify({ applicationPlugins: [{ pluginId: "another", config: { pluginId: "chart-message" } }] }));
      expect((await chart())?.status).toBe("disabled");
      await writeFile(model, JSON.stringify({ root: { type: "slot", plugins: [{ pluginId: "parent", enabled: true, slots: { body: [{ pluginId: "chart-message", enabled: true }] } }] } }));
      expect((await chart())?.status).toBe("ready");
      await writeFile(model, JSON.stringify({ root: { type: "slot", plugins: [{ pluginId: "parent", enabled: false, slots: { body: [{ pluginId: "chart-message", enabled: true }] } }] } }));
      expect((await chart())?.status).toBe("disabled");
      await mkdir(path.join(projectRoot, ".agent-ui"));
      await writeFile(path.join(projectRoot, ".agent-ui/project.json"), JSON.stringify({ sourceRoot: "custom-ui" }));
      expect((await inspectMockDemoCompatibility({ id: "legacy-host", projectRoot })).status).toBe("checked");
      await writeFile(model, "broken");
      expect((await inspectMockDemoCompatibility(target)).status).toBe("unknown");
      expect((await inspectMockDemoCompatibility({ ...target, sourceRoot: "../outside" })).status).toBe("unknown");
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it("checks basic Demo renderers in their semantic Slots and through enabled ancestors", async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "mock-renderers-"));
    try {
      await mkdir(path.join(projectRoot, "app-ui"), { recursive: true });
      const model = path.join(projectRoot, "app-ui/app-ui.json");
      const target = { id: "project", projectRoot };
      await writeFile(model, JSON.stringify({ applicationPlugins: [] }));
      const missing = await inspectMockDemoCompatibility(target);
      expect(missing.requirements.filter(r => r.scenarioIds.includes("approval-resume"))).toEqual(expect.arrayContaining([
        expect.objectContaining({ pluginId: "assistant-ui-reasoning", status: "missing" }),
        expect.objectContaining({ pluginId: "assistant-ui-tool-group", status: "missing" }),
        expect.objectContaining({ pluginId: "assistant-ui-tool-fallback", status: "missing" }),
      ]));
      const directory = path.join(projectRoot, "plugins/assistant-ui-reasoning");
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ id: "assistant-ui-reasoning" }));
      await writeFile(path.join(directory, "definition.ts"), "export default {};\n");
      const renderer = { pluginId: "assistant-ui-reasoning", enabled: true };
      const status = async () => (await inspectMockDemoCompatibility(target)).requirements.find(r => r.pluginId === renderer.pluginId)?.status;
      await writeFile(model, JSON.stringify({ applicationPlugins: [renderer] }));
      expect(await status()).toBe("disabled");
      const surface = { pluginId: "conversation-surface", enabled: true, slots: { reasoningGroup: [renderer] } };
      await writeFile(model, JSON.stringify({ root: { type: "slot", plugins: [surface] } }));
      expect(await status()).toBe("ready");
      surface.enabled = false;
      await writeFile(model, JSON.stringify({ root: { type: "slot", plugins: [surface] } }));
      expect(await status()).toBe("disabled");
    } finally { await rm(projectRoot, { recursive: true, force: true }); }
  });

  it("does not claim support when no project is selected", async () => {
    expect(await inspectMockDemoCompatibility()).toEqual({ projectId: null, status: "unknown", requirements: [] });
  });
});
