import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import { handleUIProjectControlRequest, type AgentUISourceInspection, type UICompositionInspection } from "@agent-ui/project-control/dev";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const frontendRoot = path.join(workspaceRoot, "examples/creator-host-sandbox");
const appUIPath = path.join(frontendRoot, "src/agent-ui/app-ui/app-ui.json");
const revisionPath = path.join(frontendRoot, "src/agent-ui/app-ui/composition-revision.generated.json");
const python = path.join(workspaceRoot, "packages/creator-python/.venv/bin/python");

type CompositionReport = {
  appUIModelHash: string;
  instances: Array<{ instanceId: string; rect?: { width: number } }>;
  layoutNodes?: Array<{ nodeId: string; type: string; trackWidths?: number[] }>;
};

function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function fillVerification(composition: CompositionReport): {
  status: string;
  workspaceFillVerified: boolean;
  checks: Array<{ trackWidth: number; instanceWidth: number }>;
} {
  const program = `import json,sys
from agent_ui_creator.operations.verification import verify_expected_workspace_fill
c=json.load(sys.stdin)
r={"runtimeStatus":"passed","compositionFresh":True,"runtimeLayoutNodes":c["layoutNodes"],"runtimeInstances":c["instances"]}
print(json.dumps(verify_expected_workspace_fill(r,[{"instanceId":"agent-conversation-surface-main","region":"center","axis":"width","trackIndex":0}])))`;
  return JSON.parse(execFileSync(python, ["-c", program], {
    input: JSON.stringify(composition),
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: path.join(workspaceRoot, "packages/creator-python"),
    },
  }));
}

test("deleted sidebar reflows the real Preview and uploads its afterHash screenshot", async ({ page }) => {
  const sourceResponse = await handleUIProjectControlRequest({ operation: "inspect_agent_ui_sources", input: {} }, frontendRoot);
  if (!sourceResponse.ok) throw new Error("Could not inspect Host test sources");
  const sourceInspection = sourceResponse.result as AgentUISourceInspection;
  const installedThemeSwitch = sourceInspection.items.find(item => item.id === "plugin/theme-switch")?.status === "not-installed";
  if (installedThemeSwitch) {
    const install = await handleUIProjectControlRequest({ operation: "apply_agent_ui_source_item", input: {
      itemId: "plugin/theme-switch", expectedStateHash: sourceInspection.stateHash,
    } }, frontendRoot);
    if (!install.ok) throw new Error("Could not install the test's theme-switch source");
  }
  const compositionResponse = await handleUIProjectControlRequest({ operation: "inspect_ui_project", input: { view: "composition" } }, frontendRoot);
  if (!compositionResponse.ok) throw new Error("Could not inspect Host test composition");
  const capabilityCatalogRevision = (compositionResponse.result as UICompositionInspection).capabilityCatalogRevision;
  const originalAppUI = await readFile(appUIPath, "utf8");
  const originalRevision = await readFile(revisionPath, "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  const originalModel = JSON.parse(originalAppUI);
  const originalDescriptor = originalRevision === undefined ? {} : JSON.parse(originalRevision);
  const rightWidth = 200 + Date.now() % 100;
  const sidebar = {
    type: "panel", child: { type: "slot", plugins: [
      { id: "conversation-thread-list-main", pluginId: "conversation-thread-list", enabled: true },
    ] },
  };
  const right = {
    type: "panel", child: { type: "slot", plugins: [
      { id: "theme-switch-main", pluginId: "theme-switch", enabled: true },
    ] },
  };
  const center = originalModel.root.children.find((node: { child?: { plugins?: Array<{ pluginId: string }> } }) =>
    node.child?.plugins?.some(plugin => plugin.pluginId === "conversation-surface"));
  if (!center) throw new Error("Platform Host requires a conversation surface panel");
  const before = {
    ...originalModel,
    root: {
      type: "row", children: [sidebar, center, right], gap: 0,
      sizes: ["220px", "minmax(0, 1fr)", `${rightWidth}px`],
    },
  };
  const after = {
    ...originalModel,
    root: {
      type: "row", children: [center, right], gap: 0,
      sizes: ["minmax(0, 1fr)", `${rightWidth}px`],
    },
  };
  const host = page.frameLocator('iframe[title="Host Application"]');
  const iframe = page.locator('iframe[title="Host Application"]');
  const reports: CompositionReport[] = [];
  const diagnostics: Array<Record<string, unknown>> = [];
  const reportIdentities: Array<{ workspaceId: string | undefined; threadId: string }> = [];
  const observations: Array<Record<string, unknown>> = [];

  async function publish(model: object): Promise<string> {
    const source = `${JSON.stringify(model, null, 2)}\n`;
    const afterHash = hash(source);
    await writeFile(appUIPath, source);
    await writeFile(revisionPath, `${JSON.stringify({
      ...originalDescriptor,
      capabilityCatalogRevision,
      transactionId: randomUUID(),
      appUIModelHash: afterHash,
    }, null, 2)}\n`);
    return afterHash;
  }

  try {
    page.on("request", (request) => {
      if (request.url().endsWith("/__creator/runtime-diagnostics")) {
        try {
          const body = request.postDataJSON();
          if (body.composition) reports.push(body.composition);
          if (body.diagnostic) diagnostics.push(body.diagnostic);
          reportIdentities.push({ workspaceId: request.headers()["x-agent-ui-workspace-id"], threadId: body.threadId });
        } catch { /* Ignore unrelated requests. */ }
      }
    });
    page.on("response", (response) => {
      if (response.url().endsWith("/__creator/visual-observation") && response.status() === 202) {
        void response.json().then((body) => observations.push(body.observation));
      }
    });
    await page.setViewportSize({ width: 1440, height: 800 });
    const beforeHash = await publish(before);
    await page.goto("/");
    await expect(iframe).toBeVisible();
    await expect(page.locator("[data-agent-ui-preview-root]")).toHaveCount(0);
    await expect(page.locator(".creator-panel")).toBeVisible();
    await expect(host.locator(`[data-agent-ui-preview-root][data-app-ui-model-hash="${beforeHash}"]`)).toBeVisible();
    await expect(host.locator("[data-agent-ui-preview-root] .app-ui-layout-row > .app-ui-layout-panel")).toHaveCount(3);
    await expect.poll(() => observations.some((item) => item.currentHash === beforeHash)).toBe(true);

    const mutation = { appUIModel: { afterHash: await publish(after) } };
    const currentHash = mutation.appUIModel.afterHash;
    const preview = host.locator(`[data-agent-ui-preview-root][data-app-ui-model-hash="${currentHash}"]`);
    await expect(preview).toBeVisible();
    await expect(preview.locator(".app-ui-layout-row > .app-ui-layout-panel")).toHaveCount(2);
    await expect.poll(() => reports.some((report) => report.appUIModelHash === currentHash &&
      report.layoutNodes?.some((node) => node.nodeId === "layout-node:root" && node.trackWidths?.length === 2) &&
      report.instances.some((item) => item.instanceId === "agent-conversation-surface-main" && item.rect?.width))).toBe(true);
    const report = reports.findLast((item) => item.appUIModelHash === currentHash &&
      item.layoutNodes?.some((node) => node.nodeId === "layout-node:root" && node.trackWidths?.length === 2) &&
      item.instances.some((instance) => instance.instanceId === "agent-conversation-surface-main" && instance.rect?.width));
    expect(report?.appUIModelHash).toBe(mutation.appUIModel.afterHash);
    const fill = fillVerification(report!);
    expect(fill.status).toBe("passed");
    expect(fill.workspaceFillVerified).toBe(true);
    expect(Math.abs(fill.checks[0]!.instanceWidth - fill.checks[0]!.trackWidth)).toBeLessThanOrEqual(2);

    await expect.poll(() => observations.some((item) => item.currentHash === currentHash)).toBe(true);
    await expect.poll(() => diagnostics.some(item => item.appUIModelHash === currentHash)).toBe(true);
    expect(reportIdentities.length).toBeGreaterThan(0);
    expect(reportIdentities.every(item => /^[a-f0-9]{64}$/.test(item.workspaceId || "") && item.threadId.length > 0)).toBe(true);
    const observation = observations.find((item) => item.currentHash === currentHash)!;
    expect(observation.currentHash).toBe(mutation.appUIModel.afterHash);
    expect(Number(observation.width)).toBeGreaterThan(0);
    expect(Number(observation.height)).toBeGreaterThan(0);
    const artifact = await readFile(String(observation.artifactLocation));
    expect(artifact.subarray(0, 4).toString()).toBe("RIFF");
    expect(createHash("sha256").update(artifact).digest("hex")).toBe(observation.sha256);

    const previewBox = await preview.boundingBox();
    const panelBox = await page.locator(".creator-panel").boundingBox();
    expect(previewBox).not.toBeNull();
    expect(panelBox).not.toBeNull();
    expect(Math.abs(Number(observation.width) - Math.round(previewBox!.width))).toBeLessThanOrEqual(1);
    expect(previewBox!.x + previewBox!.width).toBeLessThanOrEqual(panelBox!.x + 1);
    expect(Number(observation.width)).toBeLessThan(1440);
    expect(await preview.locator(".creator-panel").count()).toBe(0);
    expect(await host.locator(".creator-panel").count()).toBe(0);
    expect(await host.locator("[aria-label='Agent UI Dev Studio']").count()).toBe(0);
    const reportsBeforeReload = reports.filter(item => item.appUIModelHash === currentHash).length;
    const capturesBeforeReload = observations.filter(item => item.currentHash === currentHash).length;
    await iframe.evaluate(element => { (element as HTMLIFrameElement).src = (element as HTMLIFrameElement).src; });
    await expect(host.locator(`[data-agent-ui-preview-root][data-app-ui-model-hash="${currentHash}"]`)).toBeVisible();
    await expect.poll(() => reports.filter(item => item.appUIModelHash === currentHash).length).toBeGreaterThan(reportsBeforeReload);
    await expect.poll(() => observations.filter(item => item.currentHash === currentHash).length).toBeGreaterThan(capturesBeforeReload);
  } finally {
    await writeFile(appUIPath, originalAppUI);
    if (originalRevision === undefined) await unlink(revisionPath).catch(() => undefined);
    else await writeFile(revisionPath, originalRevision);
    if (installedThemeSwitch) {
      const inspection = await handleUIProjectControlRequest({ operation: "inspect_agent_ui_sources", input: {} }, frontendRoot);
      if (!inspection.ok) throw new Error("Could not inspect test cleanup state");
      const removed = await handleUIProjectControlRequest({ operation: "remove_agent_ui_source_items", input: {
        itemIds: ["plugin/theme-switch"], expectedStateHash: (inspection.result as AgentUISourceInspection).stateHash,
      } }, frontendRoot);
      if (!removed.ok) throw new Error("Could not remove test-only theme-switch source");
    }
  }
});
