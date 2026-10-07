import { expect, test } from "@playwright/test";

// Deterministic browser regression fixture. Run separately when acceptance is requested.
test("routes slash commands away from Agent and restores command activity after reload", async ({ page }) => {
  const workspace = { status: "ready", workspace: { id: "command-project", name: "Project", displayPath: "/project" }, project: { mode: "platform", sourceRoot: "src" }, runtime: { status: "ready" } };
  let current = "light"; let modelRequests = 0;
  await page.route("**/__agent-ui/creator/workspace{,/refresh}", route => route.fulfill({ json: workspace }));
  await page.route("**/__creator/updates/check", route => route.fulfill({ json: { plugins: [] } }));
  await page.route("**/__agent-ui/creator/connection", route => route.fulfill({ json: { activeSource: "mock", configured: true, running: false } }));
  await page.route("**/__creator/commands", route => route.fulfill({ json: { commands: [{ id: "theme", kind: "choice", scope: "project", current, options: [{ id: "light" }, { id: "violet" }] }] } }));
  await page.route("**/__creator/commands/execute", route => {
    const input = route.request().postDataJSON();
    if (!["light", "violet"].includes(input.args.theme)) return route.fulfill({ status: 409, json: { code: "UNKNOWN_THEME" } });
    current = input.args.theme;
    return route.fulfill({ json: { current, receipt: { files: [], validations: [] } } });
  });
  await page.route("**/__agent-ui/creator", route => { modelRequests++; return route.fulfill({ status: 503, json: { error: "Agent fixture" } }); });
  await page.goto("/dock.html");
  const input = page.locator("#creator-request");
  await input.fill("/");
  await expect(page.locator("#creator-command-menu")).toContainText("主题");
  await input.press("Enter");
  await expect(input).toHaveValue("/theme ");
  await input.press("ArrowDown"); await input.press("Enter");
  await expect(page.locator(".creator-command-activity")).toContainText("主题已改为紫罗兰");
  await expect(input).toHaveValue("");
  expect(modelRequests).toBe(0);
  await page.reload();
  await expect(page.locator(".creator-command-activity")).toContainText("主题已改为紫罗兰");
  await input.fill("/theme invalid"); await input.press("Enter");
  await expect(page.locator(".creator-command-activity").last()).toContainText("未知主题");
  await expect(page.locator("#creator-command-menu")).toContainText("紫罗兰");
  await input.fill("/unknown"); await input.press("Enter");
  await expect(page.locator(".creator-command-activity").last()).toContainText("未知命令");
  expect(modelRequests).toBe(0);
  const history = await page.evaluate(() => JSON.parse(sessionStorage.getItem("agent-ui-creator-conversation:command-project")!));
  expect(history.agentMessages).toEqual([]);
});
