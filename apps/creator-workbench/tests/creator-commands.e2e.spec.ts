import { expect, test } from "@playwright/test";

// The HTTP fixture isolates command routing from the model and filesystem.
test("routes slash commands away from Agent and restores command activity after reload", async ({ page }) => {
  const workspace = { status: "ready", workspace: { id: "command-project", name: "Project", displayPath: "/project" }, project: { mode: "platform", sourceRoot: "src" }, runtime: { status: "ready" } };
  let modelRequests = 0;
  const commands: unknown[] = [];
  await page.route("**/__agent-ui/creator/workspace{,/refresh}", route => route.fulfill({ json: workspace }));
  await page.route("**/__creator/updates/check", route => route.fulfill({ json: { plugins: [] } }));
  await page.route("**/__agent-ui/creator/connection", route => route.fulfill({ json: { activeSource: "mock", configured: true, running: false } }));
  await page.route("**/__creator/commands", route => route.fulfill({ json: { commands: [{ id: "disable", kind: "choice", scope: "project", options: [{ id: "composer-main", pluginId: "composer", status: "installed" }, { id: "copy-main", pluginId: "copy-action", status: "installed" }] }] } }));
  await page.route("**/__creator/commands/execute", route => {
    const input = route.request().postDataJSON(); commands.push(input);
    return route.fulfill({ json: { changed: true, value: input.args.instanceId, receipt: { files: [], validations: [] } } });
  });
  await page.route("**/__creator/run", route => { modelRequests++; return route.fulfill({ status: 503, json: { error: "Agent fixture" } }); });
  await page.goto("/dock.html");
  const input = page.locator("#creator-request");
  await input.fill("/");
  await expect(page.locator("#creator-command-menu")).toContainText("停用插件");
  await input.press("Enter");
  await expect(input).toHaveValue("/disable ");
  await input.press("ArrowDown"); await input.press("Enter");
  await expect(page.locator(".creator-command-activity")).toContainText("已停用：copy-main");
  await expect(input).toHaveValue("");
  expect(commands).toEqual([{ id: "disable", args: { instanceId: "copy-main" } }]);
  expect(modelRequests).toBe(0);
  await page.reload();
  await expect(page.locator(".creator-command-activity")).toContainText("已停用：copy-main");
  await input.fill("/disable invalid"); await input.press("Enter");
  await expect(page.locator(".creator-command-menu").getByRole("status")).toHaveText("没有匹配的插件实例");
  await expect(page.locator("#creator-command-menu").getByRole("option")).toHaveCount(0);
  expect(commands).toHaveLength(1);
  await expect(page.locator(".creator-command-activity")).toHaveCount(1);
  await input.fill("/unknown"); await input.press("Enter");
  await expect(page.locator(".creator-command-activity").last()).toContainText("未知命令");
  expect(modelRequests).toBe(0);
  const history = await page.evaluate(() => JSON.parse(sessionStorage.getItem("agent-ui-creator-conversation:command-project")!));
  expect(history.agentMessages).toEqual([]);
});
