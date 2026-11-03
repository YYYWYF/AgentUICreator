import { expect, test as base } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeGeneratedPluginRegistry } from "../../../packages/creator/operator/src/generate-plugin-registry";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";
const test = base.extend<{ preview: Awaited<ReturnType<typeof createConnectionHostFixture>> }>({
  preview: async ({}, use) => {
    const fixture = await createConnectionHostFixture({ themeCommands: true, prepareHost: async root => {
      const file = path.join(root, "src/agent-ui/app-ui.json");
      const model = JSON.parse(await readFile(file, "utf8"));
      model.root = { type: "column", children: [{ type: "slot", plugins: [{ pluginId: "theme-switch" }] }, model.root] };
      await writeFile(file, JSON.stringify(model));
      await writeGeneratedPluginRegistry(root);
      await writeFile(path.join(root, "src/main.tsx"), `import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Agent } from "./agent-ui";
import "./host.css";
function Host() {
  const [mode, setMode] = useState("uncontrolled");
  const [theme, setTheme] = useState<"light" | "dark" | "violet">("light");
  return <><button onClick={() => { setTheme("light"); setMode("fixed"); }}>Fixed theme</button>
    <button onClick={() => setMode("controlled")}>Accept theme changes</button>
    <button onClick={() => setMode("uncontrolled")}>Release theme</button>
    <Agent theme={mode === "uncontrolled" ? undefined : theme} onThemeChange={mode === "controlled" ? setTheme : undefined} /></>;
}
createRoot(document.getElementById("root")!).render(<Host />);`);

    } });
    try { await use(fixture); } finally { await fixture.close(); }
  },
});
test("plugin disable, undo, reapply and enable keep the generated registry in the same transaction", async ({ page, preview }, testInfo) => {
  await page.route(`${preview.creatorOrigin}__agent-ui/creator/workspace{,/refresh}`, route => route.fulfill({ json: {
    status: "ready", workspace: { id: preview.workspaceId, name: "Plugin Commands", displayPath: preview.hostRoot },
    project: { mode: "platform", sourceRoot: "src/agent-ui" }, runtime: { status: "ready" },
  } }));
  await page.goto(preview.creatorOrigin);
  const attachment = page.frameLocator('iframe[title="Host Application"]').locator(".aui-composer-add-attachment");
  await expect(attachment).toBeVisible({ timeout: 15000 });
  const catalog = await (await page.request.get(`${preview.creatorOrigin}__creator/commands`, { headers: { "x-agent-ui-workspace-id": preview.workspaceId } })).json();
  const instance = catalog.commands.find((command: any) => command.id === "disable").options.find((option: any) => option.pluginId === "add-attachment-action");
  expect(instance).toBeTruthy();
  const modelPath = path.join(preview.hostRoot, "src/agent-ui/app-ui.json"), registryPath = path.join(preview.hostRoot, "src/agent-ui/plugins/registry.generated.ts");
  const beforeModel = await readFile(modelPath, "utf8"), beforeRegistry = await readFile(registryPath, "utf8");
  const input = page.locator("#creator-request");
  await input.fill("/");
  await expect(page.getByRole("option", { name: /启用插件/ })).toBeVisible();
  await expect(page.locator(".creator-command-menu")).not.toContainText("修改 Agent UI 项目主题");
  await page.locator(".creator-command-menu").screenshot({ path: testInfo.outputPath("creator-command-menu.jpg") });

  const response = page.waitForResponse(value => new URL(value.url()).pathname === "/__creator/commands/execute", { timeout: 15000 });
  await input.fill(`/disable ${instance.id}`);
  await expect(page.getByRole("option", { name: /添加附件/ })).toBeVisible();
  await input.press("Enter");
  const disabled = await response; expect(disabled.status(), await disabled.text()).toBe(200);
  const result = await disabled.json();
  expect(result.receipt.verification.status).toBe("changed-and-statically-verified");
  expect(result.receipt.transaction.changedPaths.sort()).toEqual(["src/agent-ui/app-ui.json", "src/agent-ui/plugins/registry.generated.ts"]);
  await expect(attachment).toHaveCount(0);
  await page.getByRole("button", { name: "撤销本次修改", exact: true }).click();
  await expect.poll(() => readFile(modelPath, "utf8")).toBe(beforeModel);
  expect(await readFile(registryPath, "utf8")).toBe(beforeRegistry);
  await expect(attachment).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "再次应用本次修改", exact: true }).click();
  await expect(attachment).toHaveCount(0);
  const enabled = page.waitForResponse(value => new URL(value.url()).pathname === "/__creator/commands/execute");
  await input.fill(`/enable ${instance.id}`);
  await expect(page.getByRole("option", { name: /添加附件/ })).toBeVisible();
  await input.press("Enter");
  const restored = await enabled; expect(restored.status(), await restored.text()).toBe(200);
  expect((await restored.json()).receipt.verification.status).toBe("changed-and-statically-verified");
  await expect(attachment).toBeVisible({ timeout: 15000 });
});
test("Agent owns theme input and an omitted theme keeps the built-in picker", async ({ page, preview }) => {
  await page.goto(preview.hostOrigin);
  const app = page.locator('.agent-ui-root').first();
  await expect(app).toHaveAttribute("data-theme", "violet", { timeout: 15000 });
  const picker = page.locator('[data-ui-plugin="theme-switch"] select');
  await picker.selectOption("dark");
  await expect(app).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(app).toHaveAttribute("data-theme", "violet");

  const draft = page.locator("textarea").first();
  await draft.fill("Unsent theme draft");
  await page.getByRole("button", { name: "Fixed theme", exact: true }).click();
  await expect(app).toHaveAttribute("data-theme", "light");
  await picker.selectOption("dark");
  await expect(picker).toHaveValue("light");
  await expect(app).toHaveAttribute("data-theme", "light");
  await expect(draft).toHaveValue("Unsent theme draft");

  await page.getByRole("button", { name: "Accept theme changes", exact: true }).click();
  await picker.selectOption("dark");
  await expect(app).toHaveAttribute("data-theme", "dark");
  await expect(picker).toHaveValue("dark");
  await expect(draft).toHaveValue("Unsent theme draft");
  await page.getByRole("button", { name: "Release theme", exact: true }).click();
  await picker.selectOption("violet");
  await expect(app).toHaveAttribute("data-theme", "violet");
  await expect(draft).toHaveValue("Unsent theme draft");

  const headers = { "x-agent-ui-workspace-id": preview.workspaceId };
  const catalog = await (await page.request.get(`${preview.creatorOrigin}__creator/commands`, { headers })).json();
  expect(catalog.commands.some((command: { id: string }) => command.id === "theme")).toBe(false);
  const rejected = await page.request.post(`${preview.creatorOrigin}__creator/commands/execute`, {
    headers, data: { id: "theme", args: { theme: "light" } },
  });
  expect(rejected.status()).toBe(409);
  expect((await rejected.json()).code).toBe("UNKNOWN_COMMAND");
});
