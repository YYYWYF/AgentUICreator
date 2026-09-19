import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const frontendRoot = path.join(workspaceRoot, "examples/agent-frontend");
const appUIPath = path.join(frontendRoot, "app-ui/app-ui.json");
const revisionPath = path.join(frontendRoot, "app-ui/composition-revision.generated.json");
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
  const originalAppUI = await readFile(appUIPath, "utf8");
  const originalRevision = await readFile(revisionPath, "utf8");
  const originalModel = JSON.parse(originalAppUI);
  const originalDescriptor = JSON.parse(originalRevision);
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
  const center = originalModel.root.children[0];
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
  const reports: CompositionReport[] = [];
  const observations: Array<Record<string, unknown>> = [];

  async function publish(model: object): Promise<string> {
    const source = `${JSON.stringify(model, null, 2)}\n`;
    const afterHash = hash(source);
    await writeFile(appUIPath, source);
    await writeFile(revisionPath, `${JSON.stringify({
      ...originalDescriptor,
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
    await expect(page.locator(`[data-agent-ui-preview-root][data-app-ui-model-hash="${beforeHash}"]`)).toBeVisible();
    await expect(page.locator("[data-agent-ui-preview-root] .app-ui-layout-row > .app-ui-layout-panel")).toHaveCount(3);
    await expect.poll(() => observations.some((item) => item.currentHash === beforeHash)).toBe(true);

    const mutation = { appUIModel: { afterHash: await publish(after) } };
    const currentHash = mutation.appUIModel.afterHash;
    const preview = page.locator(`[data-agent-ui-preview-root][data-app-ui-model-hash="${currentHash}"]`);
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
    expect(await preview.locator("[aria-label='Agent UI Dev Studio']").count()).toBe(0);
  } finally {
    await writeFile(appUIPath, originalAppUI);
    await writeFile(revisionPath, originalRevision);
  }
});
