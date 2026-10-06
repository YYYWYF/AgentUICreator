import { expect, test, type Page, type TestInfo } from "@playwright/test";

const workspace = { id: "creator-ui-design", name: "creator-host-sandbox", displayPath: "/Users/developer/Projects/AgentUICreator/examples/creator-host-sandbox" };
const ready = { status: "ready", workspace, project: { mode: "platform", sourceRoot: "agent-ui" }, runtime: { status: "ready" } };
const inspection = { releaseVersion: "0.0.2", compatibility: "compatible", fingerprint: "design", plugins: [
  { pluginId: "conversation-surface", name: "Conversation Surface", currentVersion: "0.0.1", targetVersion: "0.0.2", status: "managed", updateAvailable: true,
    changelog: [{ version: "0.0.2", entry: { summary: "优化消息与流式交互", changes: ["改进工具调用的状态展示", "修复长消息的布局"] } }] },
  { pluginId: "composer", name: "Composer", currentVersion: "0.0.1", targetVersion: "0.0.2", status: "customized", updateAvailable: true,
    changelog: [{ version: "0.0.2", entry: { summary: "完善输入能力", changes: ["优化附件与输入状态"] } }] },
] };

async function base(page: Page, state: unknown = ready, updates = false) {
  await page.setViewportSize({ width: 440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/__agent-ui/creator/workspace", route => route.fulfill({ json: state }));
  await page.route("**/__creator/updates/check", route => route.fulfill({ json: updates ? inspection : { ...inspection, plugins: [] } }));
}

async function seed(page: Page, items: unknown[]) {
  await page.addInitScript(({ id, items }) => {
    sessionStorage.setItem(`agent-ui-creator-conversation:${id}`, JSON.stringify({ threadId: "design-thread", items, agentMessages: [] }));
  }, { id: workspace.id, items });
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  // Capture the settled layout after React effects propagate between panels.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow, `${name}: page must not overflow horizontally`).toBe(false);
  const boxes = await page.locator(".creator-panel-header,.creator-panel-footer,.creator-panel-messages,.creator-project-setup,.creator-mock-panel,.creator-workspace-menu").evaluateAll(elements => elements.filter(element => getComputedStyle(element).display !== "none").map(element => {
    const rect = element.getBoundingClientRect();
    const panel = element.closest(".creator-panel")!.getBoundingClientRect();
    return { name: element.className, left: rect.left, right: rect.right, panelLeft: panel.left, panelRight: panel.right };
  }));
  for (const box of boxes) {
    expect(box.left, `${name}: ${box.name}`).toBeGreaterThanOrEqual(box.panelLeft - 1);
    expect(box.right, `${name}: ${box.name}`).toBeLessThanOrEqual(box.panelRight + 1);
  }
}

test("reviews integration, empty conversation, project picker and responsive widths", async ({ page }, info) => {
  await base(page);
  await page.goto("/dock.html");
  await expect(page.getByRole("region", { name: "接入 Agent UI" })).toBeVisible();
  await page.getByRole("button", { name: "查看接入方法", exact: true }).click();
  await capture(page, info, "01-integration");
  await page.getByRole("button", { name: "收起", exact: true }).click();
  await capture(page, info, "02-empty");
  await page.getByRole("button", { name: /当前项目/ }).click();
  await expect(page.locator(".creator-workspace-info")).not.toHaveAttribute("open", "");
  await page.getByText("项目详情", { exact: true }).click();
  await expect(page.getByText(workspace.displayPath, { exact: true })).toBeVisible();
  await page.getByText("项目详情", { exact: true }).click();
  await page.getByText("手动输入项目路径", { exact: true }).click();
  await expect(page.getByLabel("项目文件夹的绝对路径")).toHaveValue(workspace.displayPath);
  await capture(page, info, "03-project-picker");
  await page.setViewportSize({ width: 320, height: 800 });
  await capture(page, info, "03b-project-picker-320");
  await page.getByRole("button", { name: "关闭项目选择" }).click();
  await expect(page.locator(".creator-workspace-menu")).toBeHidden();
  await page.setViewportSize({ width: 440, height: 900 });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "设置" })).toBeVisible();
  await capture(page, info, "04-settings");
  await page.keyboard.press("Escape");
  for (const width of [320, 560]) {
    await page.setViewportSize({ width, height: 800 });
    await capture(page, info, `05-empty-${width}`);
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "设置", exact: true })).toBeVisible();
  await capture(page, info, "06-workbench-desktop");
});

test("reviews messages, Markdown, tool details, stage status and mutation receipts", async ({ page }, info) => {
  await base(page);
  await seed(page, [
    { kind: "message", id: "user-1", role: "user", content: "把工具详情放到右侧，消息区保留更多空间。" },
    { kind: "stage", id: "stage-1", name: "creator.productized-operation", status: "completed", displayIntent: "调整工具详情与会话区域的布局" },
    { kind: "message", id: "assistant-round", role: "assistant", content: "我先检查当前布局和插件源码，再调整工具详情的位置。" },
    { kind: "tool", id: "tool-2", name: "read_file", arguments: "{}", result: "plugin source", status: "completed" },
    { kind: "tool", id: "tool-1", name: "inspect_ui_project", arguments: '{"view":"composition"}', result: '{"slots":["conversation","tool-detail"],"status":"ready"}', status: "completed" },
    { kind: "message", id: "assistant-1", role: "assistant", content: "### 已调整布局\n\n会话区保留主要空间，工具详情显示在右侧。\n\n- 复用了现有插件\n- 保留了原有交互\n\n```tsx\n<Agent endpoint=\"/api/agent\" />\n```", receipt: {
      files: [{ path: "app-ui/app-ui.json", status: "modified", diff: '- "width": 280\n+ "width": 320', truncated: false }],
      validations: [{ command: "pnpm typecheck", status: "passed", exitCode: 0, output: "TypeScript validation passed", truncated: false }],
      verification: { status: "changed-and-statically-verified", projectRevision: 1, auditAttempts: 0, checks: [] },
      transaction: { runId: "design-run", undoable: true },
    } },
  ]);
  await page.goto("/dock.html");
  await page.locator(".creator-panel-messages").evaluate(node => { node.scrollTop = 0; });
  const group = page.locator(".creator-tool-group");
  await expect(group).not.toHaveAttribute("open", "");
  await expect(group.locator(":scope > summary")).toContainText("工具调用 · 2 次");
  await expect(page.getByText("我先检查当前布局和插件源码，再调整工具详情的位置。", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "已调整布局" })).toBeVisible();
  await expect(group.locator(".creator-tool-activity").first()).toBeHidden();
  await capture(page, info, "07-conversation");
  await group.locator(":scope > summary").click();
  await expect(group.locator(".creator-tool-activity").first()).toBeVisible();
  await group.getByText("调用参数", { exact: true }).last().click();
  await group.getByText("工具结果", { exact: true }).last().click();
  await capture(page, info, "08-tool-details");
  await page.locator(".creator-receipt-item").last().locator("summary").click();
  await page.getByRole("button", { name: "撤销本次修改" }).scrollIntoViewIfNeeded();
  await capture(page, info, "09-receipt");
  await page.setViewportSize({ width: 320, height: 800 });
  await capture(page, info, "10-conversation-320");
});

test("reviews pending questions and preserves answer submission", async ({ page }, info) => {
  await base(page);
  await seed(page, [
    { kind: "message", id: "user", role: "user", content: "帮我调整会话页面的布局。" },
    { kind: "question", id: "question-1", interruptId: "interrupt-1", status: "pending", steps: [{ id: "layout", question: "你希望工具详情显示在哪里？", description: "选择一个布局方向，Creator 会继续完成修改。", selectionMode: "single", minSelections: 1, maxSelections: 1,
      options: [{ id: "right", label: "右侧面板", description: "工具详情与消息并排显示。" }, { id: "inline", label: "消息内展开", description: "保留完整宽度的消息区。" }] }] },
  ]);
  let submitted: Record<string, unknown> | undefined;
  await page.route("**/__creator/run", route => {
    submitted = route.request().postDataJSON();
    const { threadId, runId } = submitted!;
    return route.fulfill({ contentType: "text/event-stream", body: [
      { type: "RUN_STARTED", threadId, runId },
      { type: "RUN_FINISHED", threadId, runId },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
  });
  await page.goto("/dock.html");
  await expect(page.getByRole("button", { name: "确认选择" })).toBeDisabled();
  await capture(page, info, "11-question");
  await page.getByRole("radio", { name: /右侧面板/ }).check();
  await capture(page, info, "12-question-selected");
  await page.getByRole("button", { name: "确认选择" }).click();
  await expect(page.getByRole("button", { name: "确认选择" })).toHaveCount(0);
  await expect(page.locator(".creator-question-card input")).toHaveCount(0);
  await expect(page.getByLabel("告诉 Creator")).toBeEnabled();
  expect(submitted).toMatchObject({ forwardedProps: { command: { resume: { interruptId: "interrupt-1", answers: { layout: ["right"] } } } } });
  await capture(page, info, "13-question-resolved");
});

test("reviews initialization cards, valid and invalid fields", async ({ page }, info) => {
  await base(page, { status: "uninitialized", workspace });
  await page.route("**/__agent-ui/creator/workspace/setup", route => route.fulfill({ json: {
    suggestedSourceRoot: "src/agent-ui", modes: [
      { id: "assistant", title: "Assistant", description: "" }, { id: "embedded", title: "Embedded", description: "" }, { id: "platform", title: "Platform", description: "" },
    ],
  } }));
  await page.route("**/__agent-ui/creator/workspace/setup/validate", route => {
    const { sourceRoot } = route.request().postDataJSON();
    const valid = sourceRoot !== "src/existing";
    return route.fulfill({ json: { valid, sourceRoot: { normalized: sourceRoot, parentExists: true, targetState: valid ? "missing" : "occupied" }, issues: valid ? [] : [{ code: "AGENT_UI_SOURCE_ROOT_NOT_EMPTY", message: "Occupied" }] } });
  });
  await page.goto("/dock.html");
  await expect(page.getByRole("button", { name: /Assistant/ })).toBeVisible();
  await capture(page, info, "14-setup");
  await page.getByRole("button", { name: /Assistant/ }).click();
  await expect(page.getByRole("button", { name: "初始化 Agent UI", exact: true })).toBeEnabled();
  await capture(page, info, "15-setup-selected");
  await page.getByLabel("Agent UI 源码位置").fill("src/existing");
  await expect(page.getByText("这个目录已有文件，请选择一个空目录或新的 Agent UI 目录。")).toBeVisible();
  await capture(page, info, "16-setup-invalid");
  await page.setViewportSize({ width: 320, height: 800 });
  await capture(page, info, "17-setup-320");
  await page.getByRole("button", { name: "初始化 Agent UI", exact: true }).scrollIntoViewIfNeeded();
  await capture(page, info, "17b-setup-320-bottom");
});

test("reviews Mock service, native select, search and resource errors", async ({ page }, info) => {
  await base(page);
  const scenarios = [
    { id: "simple-chat", title: "Chat", description: "验证基础消息的流式输出。" },
    { id: "multimodal-input", title: "Input", description: "发送图片和文件，验证附件体验。" },
    { id: "reasoning-chat", title: "Reasoning", description: "先展示思考过程，再输出回答。" },
    { id: "tool-long-running", title: "Tool", description: "模拟耗时工具并展示状态。" },
    { id: "data-message-chart", title: "Chart", description: "在消息中显示交互图表。", resources: ["chart-message"] },
  ];
  let mock = { status: "stopped", endpoint: null as string | null, scenarioId: "simple-chat", speed: 1, scenarios };
  await page.route("**/__agent-ui/creator/mock**", route => {
    const url = route.request().url();
    if (url.endsWith("/compatibility")) return route.fulfill({ json: { projectId: workspace.id, canInstall: true, status: "checked", requirements: [{ id: "chart-message", name: "图表", scenarioIds: ["data-message-chart"], status: "missing", installable: true }] } });
    if (url.endsWith("/install-resources")) return route.fulfill({ status: 400, json: { message: "图表资源安装失败" } });
    if (url.endsWith("/resource-diagnostics")) return route.fulfill({ json: { status: "missing", resourceId: "chart-message" } });
    if (url.endsWith("/start")) mock = { ...mock, status: "running", endpoint: "http://127.0.0.1:9999/agent" };
    if (url.endsWith("/stop")) mock = { ...mock, status: "stopped", endpoint: null };
    if (url.endsWith("/select")) mock = { ...mock, ...route.request().postDataJSON() };
    return route.fulfill({ json: mock });
  });
  await page.route("http://127.0.0.1:9999/agent/scenarios", route => route.fulfill({ json: { scenarios } }));
  await page.goto("/dock.html");
  await page.getByRole("button", { name: "打开 Mock Agent 面板" }).click();
  await expect(page.getByRole("button", { name: "启动服务" })).toBeVisible();
  await capture(page, info, "18-mock-stopped");
  await page.getByRole("button", { name: "启动服务" }).click();
  await expect(page.getByLabel("AG-UI 地址")).toHaveValue("http://127.0.0.1:9999/agent");
  await capture(page, info, "19-mock-running");
  await page.getByLabel("播放时长倍率").selectOption("0.1");
  await expect(page.getByLabel("播放时长倍率")).toHaveValue("0.1");
  await page.getByLabel("搜索 Demo").fill("chart");
  await expect(page.locator(".creator-mock-scenario")).toHaveCount(1);
  await page.getByRole("button", { name: "安装资源" }).click();
  await expect(page.locator(".creator-mock-install-status[role=alert]")).toBeVisible();
  await page.getByText("查看技术详情", { exact: true }).click();
  await expect(page.locator(".creator-mock-resource-diagnostics pre")).toContainText('"resourceId"');
  await page.locator(".creator-mock-panel").evaluate(node => { node.scrollTop = node.scrollHeight; });
  await capture(page, info, "20-mock-resource-error");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator(".creator-mock-panel").evaluate(node => { node.scrollTop = node.scrollHeight; });
  await capture(page, info, "21-mock-320");
});

test("reviews update cards and confirmation plans without executing an update", async ({ page }, info) => {
  await base(page, ready, true);
  await page.route("**/__creator/updates/plan", route => route.fulfill({ json: {
    id: "design-plan", compatibility: "compatible", requiresMerge: true, blocked: false, fileCount: 8, issues: [], items: [
      { itemId: "conversation-surface", currentVersion: "0.0.1", targetVersion: "0.0.2", status: "managed", changed: true },
      { itemId: "composer", currentVersion: "0.0.1", targetVersion: "0.0.2", status: "customized", changed: true },
    ],
  } }));
  await page.goto("/dock.html");
  await expect(page.locator(".creator-update-banner")).toBeVisible();
  await capture(page, info, "22-update-banner");
  await page.getByRole("button", { name: "查看更新" }).click();
  await expect(page.locator(".creator-update-page [data-slot=card]")).toHaveCount(2);
  await expect(page.locator(".creator-panel-messages")).toBeHidden();
  await expect(page.locator(".creator-panel-composer")).toBeHidden();
  await capture(page, info, "23-update-cards");
  const firstPlugin = page.locator(".creator-update-plugin-card").first();
  await firstPlugin.getByRole("button", { name: "查看更新内容" }).click();
  const plan = page.getByRole("region", { name: "更新方案" });
  await expect(firstPlugin.getByRole("region", { name: "更新方案" })).toBeVisible();
  await expect(plan).toBeFocused();
  await capture(page, info, "23b-inline-update-plan");
  await plan.getByRole("button", { name: "暂不更新 / 取消" }).click();
  await expect(plan).toBeHidden();
  await page.getByRole("button", { name: "全部更新" }).click();
  expect(await plan.evaluate(element => element.closest(".creator-update-plugin-card") === null)).toBe(true);
  expect(await plan.evaluate(element => !!(element.compareDocumentPosition(document.querySelector(".creator-update-plugin-card")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await page.getByRole("region", { name: "更新方案" }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: "使用模型合并" })).toBeEnabled();
  await capture(page, info, "24-update-plan");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.locator(".creator-update-page").evaluate(node => { node.scrollTop = node.scrollHeight; });
  await capture(page, info, "25-update-320");
});

test("reviews unavailable Runtime and broken-project messages", async ({ page }, info) => {
  await base(page, { ...ready, runtime: { status: "unavailable", code: "RUNTIME_UNAVAILABLE", message: "暂时无法连接 Creator 服务，请稍后重试。" } });
  await page.goto("/dock.html");
  await expect(page.locator("#creator-request")).toBeDisabled();
  await capture(page, info, "26-runtime-unavailable");
  await page.unroute("**/__agent-ui/creator/workspace");
  await page.route("**/__agent-ui/creator/workspace", route => route.fulfill({ json: { status: "broken", workspace, issues: [{ code: "PROJECT_INVALID", message: "Agent UI 项目配置需要修复，请检查项目目录。" }] } }));
  await page.goto("/dock.html");
  await expect(page.getByText("项目配置需要修复", { exact: true })).toBeVisible();
  await capture(page, info, "27-broken-project");
});

test("reviews streamed output and preserves stop execution", async ({ page }, info) => {
  await base(page);
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      if (!String(input).endsWith("/__creator/run")) return originalFetch(input, init);
      const { runId, threadId } = JSON.parse(String(init?.body));
      const stream = new ReadableStream({ start(controller) {
        const events = [
          { type: "RUN_STARTED", runId, threadId },
          { type: "TEXT_MESSAGE_START", messageId: "stream-1", role: "assistant" },
          { type: "TEXT_MESSAGE_CONTENT", messageId: "stream-1", delta: "正在检查当前布局与插件配置，接下来会调整工具详情的展示位置。" },
        ];
        controller.enqueue(new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("")));
        Object.assign(window, { __creatorDesignStop: () => {
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ type: "RUN_ERROR", message: "执行已停止", code: "CREATOR_RUN_STOPPED" })}\n\n`));
          controller.close();
        } });
        init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
      } });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
    };
  });
  let stopped = false;
  await page.route("**/__creator/control", async route => {
    stopped = route.request().postDataJSON().action === "stop";
    await route.fulfill({ json: { status: "stopping" } });
    await page.evaluate(() => (window as typeof window & { __creatorDesignStop: () => void }).__creatorDesignStop());
  });
  await page.goto("/dock.html");
  await page.getByLabel("告诉 Creator").fill("帮我检查一下当前布局。");
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page.getByRole("button", { name: "停止执行" })).toBeEnabled();
  await expect(page.locator(".creator-stream-cursor")).toBeVisible();
  await capture(page, info, "28-streaming");
  await page.getByRole("button", { name: "停止执行" }).click();
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible();
  expect(stopped).toBe(true);
  await capture(page, info, "29-stopped");
});

test("reviews the first project-selection state", async ({ page }, info) => {
  await base(page, { status: "none" });
  await page.goto("/dock.html");
  await expect(page.locator(".creator-workspace-browse")).toBeVisible();
  await capture(page, info, "30-no-project");
});
