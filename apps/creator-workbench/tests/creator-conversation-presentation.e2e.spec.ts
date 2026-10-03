import { expect, test } from "@playwright/test";

// Exercise the browser presentation with deterministic AG-UI results. Selector and
// permission behavior is covered by the Python routing tests.
test("presents answers, inspection, and mutation as distinct Creator turns", async ({ page }) => {
  await page.route("**/__agent-ui/creator/workspace", route => route.fulfill({ json: {
    status: "ready", workspace: { id: "presentation-workspace", name: "Project", displayPath: "/project" },
    project: { version: "1", mode: "platform" }, runtime: { status: "ready" },
  } }));
  let turn = 0;
  await page.route("**/__creator/run", async route => {
    const request = route.request().postDataJSON() as { threadId: string; runId: string };
    const routes = ["answer_only", "read_only_general", "productized"] as const;
    const selectedRoute = routes[turn++] ?? "productized";
    const text = selectedRoute === "answer_only"
      ? "我可以解释 Creator 的用法、检查当前 Agent UI、先给方案，也能按需求修改和验证。"
      : selectedRoute === "read_only_general"
        ? "当前工程有一个会话 UI Plugin。"
        : "已将插件移动到右侧。";
    const receipt = { files: selectedRoute === "productized"
      ? [{ path: "app-ui/app-ui.json", status: "modified", diff: "updated", truncated: false }] : [],
      validations: [], diagnosticLog: { format: "jsonl", path: ".agentuicreator/logs/run.jsonl", schemaVersion: 1 },
      verification: { status: selectedRoute === "productized" ? "changed-and-statically-verified" : "no-project-change",
        projectRevision: selectedRoute === "productized" ? 1 : 0, auditAttempts: 0, checks: [] } };
    const messageId = `assistant-${turn}`;
    const events = [
      { type: "RUN_STARTED", threadId: request.threadId, runId: request.runId },
      { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId, delta: text },
      { type: "TEXT_MESSAGE_END", messageId },
      { type: "RUN_FINISHED", threadId: request.threadId, runId: request.runId,
        result: { creatorIntent: { route: selectedRoute, displayIntent: text },
          mutationAttempts: selectedRoute === "productized" ? 1 : 0, receipt } },
    ];
    await route.fulfill({ contentType: "text/event-stream",
      body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
  });

  await page.goto("/dock.html?creatorDebug=0");
  const request = page.locator("#creator-request");
  await expect(request).toBeVisible();

  await request.fill("你能做什么？");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.locator(".creator-panel-message--assistant")).toContainText("我可以解释 Creator 的用法");
  await expect(page.getByText("修改回执")).toHaveCount(0);
  await expect(page.getByText("已识别意图")).toHaveCount(0);
  await expect(page.getByText("诊断日志")).toHaveCount(0);

  await request.fill("看看当前有哪些插件");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.locator(".creator-panel-message--assistant").last()).toContainText("会话 UI Plugin");
  await expect(page.getByText("修改回执")).toHaveCount(0);

  await request.fill("把会话插件移动到右侧");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.locator(".creator-panel-message--assistant").last()).toContainText("已将插件移动到右侧");
  await expect(page.getByRole("region", { name: "修改回执" })).toBeVisible();
  await expect(page.getByText("诊断日志")).toHaveCount(0);

  await page.goto("/dock.html?creatorDebug=1");
  await expect(page.locator(".creator-stage-activity").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "修改回执" }).first()).toBeVisible();
  await expect(page.getByText("诊断日志").first()).toBeVisible();
});
