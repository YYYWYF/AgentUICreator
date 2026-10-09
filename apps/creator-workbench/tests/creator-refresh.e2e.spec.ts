import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
const host = path.resolve("../../examples/creator-host-sandbox");
const evidence = path.resolve("../../docs/implementation/creator-refresh/evidence");
async function hashes() {
  const result: Record<string, string> = {};
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile()) result[path.relative(host, file)] = createHash("sha256").update(await readFile(file)).digest("hex");
    }
  }
  await walk(path.join(host, "src/agent-ui"));
  await walk(path.join(host, ".agent-ui"));
  return result;
}
test("real Sidebar workspace refresh completes all resources twice and remains usable", async ({ page }) => {
  const before = await hashes();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("iframe")).toBeVisible();
  await expect(page.frameLocator("iframe").locator("[data-layout-type=sidebar]")).toBeVisible({ timeout: 60_000 });
  const state = await (await page.request.get("/__agent-ui/creator/workspace")).json();
  expect(state).toMatchObject({ status: "ready", runtime: { status: "ready" } });
  const model = JSON.parse(await readFile(path.join(host, "src/agent-ui/app-ui/app-ui.json"), "utf8"));
  expect(model.root.type).toBe("sidebar");
  const input = page.locator("#creator-request");
  await expect(input).toBeEnabled();
  await input.fill("保留刷新验收草稿");
  const resources = ["/__agent-ui/creator/connection", "/__agent-ui/creator/mock", "/__agent-ui/creator/mock/compatibility", "/__creator/updates/check"];
  const responses: unknown[] = [];
  for (let round = 1; round <= 2; round++) {
    const waits = ["/__agent-ui/creator/workspace/refresh", ...resources].map(route => page.waitForResponse(response => new URL(response.url()).pathname === route));
    await page.getByRole("button", { name: "刷新", exact: true }).click();
    for (const response of await Promise.all(waits)) {
      const body = await response.json();
      responses.push({ round, url: response.url(), status: response.status(), body });
      expect(response.ok(), response.url()).toBe(true);
      if (response.url().includes("/workspace/refresh")) expect(body).toMatchObject({ status: "ready", runtime: { status: "ready" } });
      if (response.url().endsWith("/compatibility")) expect(body.status).toBe("checked");
    }
    await expect(page.locator(".creator-refresh-status")).toContainText("已刷新项目状态、连接设置、Mock 文件、示例资源和插件更新");
    await expect(input).toBeEnabled();
    await expect(input).toHaveValue("保留刷新验收草稿");
    await expect(page.getByText("项目配置需要修复", { exact: true })).toHaveCount(0);
  }
  await page.screenshot({ path: path.join(evidence, "after-refresh.png"), fullPage: true });
  // /sync is a separate regression through the real Python mutation guard/control plane.
  const syncResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/__creator/commands/execute", { timeout: 60_000 });
  await input.fill("/sync");
  await input.press("Enter");
  const sync = await syncResponse;
  expect(sync.ok()).toBe(true);
  await writeFile(path.join(evidence, "sync-response.json"), JSON.stringify(await sync.json(), null, 2));
  await expect(page.locator(".creator-command-activity").last()).toContainText(/Plugin Registry 已是最新|Plugin Registry 已同步|synchronized|already up to date/i, { timeout: 30_000 });
  await expect(page.locator(".creator-command-activity--error")).toHaveCount(0);
  await expect(input).toBeEnabled({ timeout: 30_000 });
  await input.fill("刷新后仍可编辑草稿");
  const after = await hashes();
  await writeFile(path.join(evidence, "refresh-responses.json"), JSON.stringify(responses, null, 2));
  await writeFile(path.join(evidence, "refresh-hashes.json"), JSON.stringify({ before, after, unchanged: JSON.stringify(before) === JSON.stringify(after) }, null, 2));
  await writeFile(path.join(evidence, "browser-errors.json"), JSON.stringify(errors));
  expect(after).toEqual(before);
  expect(errors).toEqual([]);
});
