import { expect, test as base } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
const test = base.extend<{ preview: Awaited<ReturnType<typeof createConnectionHostFixture>> }>({
  preview: async ({}, use) => { const fixture = await createConnectionHostFixture({ themeCommands: true }); try { await use(fixture); } finally { await fixture.close(); } },
});
test("real command persists Violet, verifies published files, refreshes Preview and shares undo/reapply", async ({ page, preview }) => {
  // Only workspace presentation metadata is supplied. Command APIs, Python storage,
  // ProjectControl verifier, generated application and Preview all run for real.
  await page.route(`${preview.creatorOrigin}__agent-ui/creator/workspace{,/refresh}`, route => route.fulfill({ json: {
    status: "ready", workspace: { id: preview.workspaceId, name: "Theme Host", displayPath: preview.hostRoot },
    project: { mode: "platform", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
  } }));
  const browserErrors: string[] = [];
  page.on("pageerror", error => { browserErrors.push(error.message); console.error("THEME_PAGE_ERROR", error.message); });

  let modelRequests = 0;
  page.on("request", request => { if (new URL(request.url()).pathname === "/__agent-ui/creator") modelRequests++; });
  await page.goto(preview.creatorOrigin);
  const host = page.frameLocator('iframe[title="Host Application"]');
  const app = host.locator('.agent-ui-root').first();
  await expect(app).toHaveAttribute("data-theme", "light");
  const input = page.locator("#creator-request");
  await input.fill("/theme violet");
  const response = page.waitForResponse(value => new URL(value.url()).pathname === "/__creator/commands/execute");
  await input.press("Enter");
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  const body = await result.json();
  expect(body.receipt.verification.status).toBe("changed-and-statically-verified");
  expect(JSON.parse(body.receipt.validations[0].output).status).toBe("passed");
  const canonical = path.join(preview.hostRoot, "src/agent-ui/agent-ui/theme/theme-config.ts");
  expect(await readFile(canonical, "utf8")).toContain('theme: "violet"');
  await expect(app).toHaveAttribute("data-theme", "violet", { timeout: 15000 });
  const transaction = JSON.parse(await readFile(path.join(preview.hostRoot, ".agentuicreator/transactions", `${createHash("sha256").update(body.receipt.transaction.runId).digest("hex")}.json`), "utf8"));
  expect(transaction.validationRevision).toBe(1);
  expect(transaction.files[0].after.content).toContain('theme: "violet"');
  await page.reload();
  await expect(app).toHaveAttribute("data-theme", "violet", { timeout: 15000 });
  await expect(page.locator(".creator-command-activity")).toContainText("主题已改为紫罗兰");
  await page.getByRole("button", { name: "撤销本次修改", exact: true }).click();
  await expect.poll(() => readFile(canonical, "utf8")).toContain('theme: "light"');
  await expect(app).toHaveAttribute("data-theme", "light", { timeout: 15000 });
  expect(await readFile(canonical, "utf8")).toContain('theme: "light"');
  await page.getByRole("button", { name: "再次应用本次修改", exact: true }).click();
  await expect(app).toHaveAttribute("data-theme", "violet", { timeout: 15000 });
  const before = await readFile(canonical, "utf8");
  await input.fill("/theme violet");
  const noop = page.waitForResponse(value => new URL(value.url()).pathname === "/__creator/commands/execute");
  await input.press("Enter");
  const noChange = await (await noop).json();
  expect(noChange.receipt.files).toEqual([]);
  expect(noChange.receipt.transaction).toBeUndefined();
  await input.fill("/theme invalid"); await input.press("Enter");
  await expect(page.locator(".creator-command-activity").last()).toContainText("未知主题");
  expect(await readFile(canonical, "utf8")).toBe(before);
  // A real failed ProjectControl verification must roll back the published candidate.
  const modelPath = path.join(preview.hostRoot, "src/agent-ui/app-ui/app-ui.json");
  const model = await readFile(modelPath, "utf8");
  try {
    await writeFile(modelPath, "{}");
    const rejected = await page.request.post(`${preview.creatorOrigin}__creator/commands/execute`, {
      headers: { "x-agent-ui-workspace-id": preview.workspaceId }, data: { id: "theme", args: { theme: "light" } },
    });
    expect(rejected.status()).toBe(409);
    expect((await rejected.json()).error).toContain("THEME_STATIC_VALIDATION_FAILED");
    expect(await readFile(canonical, "utf8")).toBe(before);
  } finally { await writeFile(modelPath, model); }
  expect(browserErrors).toEqual([]);
  expect(modelRequests).toBe(0);
});
