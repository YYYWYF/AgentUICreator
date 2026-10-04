import { expect, test } from "@playwright/test";

// Exercise the browser presentation with deterministic AG-UI results. Selector and
// permission behavior is covered by the Python routing tests.
test("presents answers, inspection, mutation, no-op, and validation by run facts", async ({ page }) => {
  await page.route("**/__agent-ui/creator/workspace", route => route.fulfill({ json: {
    status: "ready", workspace: { id: "presentation-workspace", name: "Project", displayPath: "/project" },
    project: { mode: "platform", sourceRoot: "agent-ui" }, runtime: { status: "ready" },
  } }));
  let turn = 0;
  await page.route("**/__creator/run", async route => {
    const request = route.request().postDataJSON() as { threadId: string; runId: string };
    const turnIndex = turn++;
    const routes = ["answer_only", "read_only_general", "productized", "productized", "general-agent"] as const;
    const selectedRoute = routes[turnIndex] ?? "general-agent";
    const text = turnIndex === 0
      ? "我可以解释 Creator 的用法、检查当前 Agent UI、先给方案，也能按需求修改和验证。"
      : turnIndex === 1
        ? "当前工程有一个会话 UI Plugin。"
        : turnIndex === 2 ? "已将插件移动到右侧。"
        : turnIndex === 3 ? "当前状态已满足，无需修改。"
        : "typecheck 已通过。";
    const receipt = { files: turnIndex === 2
      ? [{ path: "app-ui/app-ui.json", status: "modified", diff: "updated", truncated: false }] : [],
      validations: turnIndex === 4
        ? [{ command: "pnpm typecheck", status: "passed", exitCode: 0, output: "", truncated: false }] : [],
      ...(turnIndex === 2 ? { transaction: { runId: "presentation-run", undoable: true } } : {}),
      diagnosticLog: { format: "jsonl", path: ".agentuicreator/logs/run.jsonl" },
      verification: { status: turnIndex === 2 ? "changed-and-statically-verified" : "no-project-change",
        projectRevision: turnIndex === 2 ? 1 : 0, auditAttempts: 0, checks: [] } };
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
  await page.route("**/__creator/control", route => {
    const { action } = route.request().postDataJSON() as { action: "undo" | "reapply" };
    return route.fulfill({ json: {
      status: action === "undo" ? "undone" : "reapplied",
      runId: "presentation-run", changedPaths: ["app-ui/app-ui.json"], reapplyable: true,
    } });
  });

  await page.goto("/dock.html");
  const request = page.locator("#creator-request");
  await expect(request).toBeVisible();

  await request.fill("你能做什么？");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.locator(".creator-panel-message--assistant")).toContainText("我可以解释 Creator 的用法");
  await expect(page.getByRole("region", { name: "运行诊断" })).toHaveCount(0);
  await expect(page.getByText("修改回执")).toHaveCount(0);
  await expect(page.getByText("已识别意图")).toHaveCount(0);
  await expect(page.getByText("诊断日志")).toHaveCount(0);

  await page.goto("/dock.html?creatorDebug=0");
  await expect(request).toBeVisible();
  await request.fill("看看当前有哪些插件");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.locator(".creator-panel-message--assistant").last()).toContainText("会话 UI Plugin");
  await expect(page.getByText("修改回执")).toHaveCount(0);

  await request.fill("把会话插件移动到右侧");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.locator(".creator-panel-message--assistant").last()).toContainText("已将插件移动到右侧");
  await expect(page.getByRole("region", { name: "修改回执" })).toBeVisible();
  await expect(page.getByText("诊断日志")).toHaveCount(0);
  const undoButton = page.getByRole("button", { name: "撤销本次修改" });
  await expect(undoButton).toBeVisible();
  await expect(page.getByText("Run presentation-run")).toHaveCount(0);
  await undoButton.click();
  await expect(page.getByText("已撤销", { exact: true })).toBeVisible();
  await expect(undoButton).toHaveCount(0);
  await page.getByRole("button", { name: "再次应用本次修改" }).click();
  await expect(page.getByText("已再次应用本次修改", { exact: false })).toBeVisible();
  await expect(undoButton).toBeVisible();
  await expect(page.getByText("本次再次应用尚未重新验证。", { exact: false })).toBeVisible();

  await request.fill("保持会话插件在右侧");
  await page.getByRole("button", { name: "发送" }).click();
  const noOpMessage = page.locator(".creator-panel-message--assistant").last();
  await expect(noOpMessage).toContainText("当前状态已满足");
  await expect(noOpMessage.getByRole("region", { name: "修改回执" })).toHaveCount(0);

  await request.fill("运行 typecheck，不要修改");
  await page.getByRole("button", { name: "发送" }).click();
  const validationMessage = page.locator(".creator-panel-message--assistant").last();
  await expect(validationMessage).toContainText("typecheck 已通过");
  await expect(validationMessage.getByRole("region", { name: "验证结果" })).toBeVisible();
  await expect(validationMessage.getByRole("region", { name: "修改回执" })).toHaveCount(0);

  await page.goto("/dock.html?creatorDebug=1");
  await expect(page.locator(".creator-stage-activity").first()).toBeVisible();
  const answerMessage = page.locator(".creator-panel-message--assistant").first();
  await expect(answerMessage.getByRole("region", { name: "运行诊断" })).toBeVisible();
  await expect(answerMessage.getByText("诊断日志")).toBeVisible();
  await expect(answerMessage.getByRole("region", { name: "修改回执" })).toHaveCount(0);
  const mutationMessage = page.locator(".creator-panel-message--assistant").nth(2);
  await expect(mutationMessage.getByRole("region", { name: "修改回执" })).toBeVisible();
  await expect(mutationMessage.getByText("诊断日志")).toBeVisible();
});
