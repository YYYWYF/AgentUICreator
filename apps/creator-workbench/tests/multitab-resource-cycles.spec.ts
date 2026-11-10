import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ServerResponse } from "node:http";
import { createControlledAgentHost, startRun, finishRun } from "./support/controlled-agent.js";
import { captureWindowErrors } from "./support/window-errors.js";

const composer = (page: Page) => page.locator(".aui-composer-root").getByRole("textbox");
const list = (page: Page) => page.locator('[data-ui-plugin="conversation-thread-list"]');
async function watch(page: Page) { const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message)); return errors; }
async function refreshButton(root: string) {
  const file = path.join(root, "src/agent-ui/plugins/conversation-thread-list/index.tsx"), source = await readFile(file, "utf8");
  const header = 'headerActions={props.renderSlot ? props.renderSlot("headerActions", props.headerActions ?? null) : props.headerActions}';
  expect(source).toContain(header);
  await writeFile(file, 'import {useConversationState} from "@za38.03/agent-ui-plugins";\n' + source
    .replace('const { refresh } = useConversationActions();', 'const { refresh } = useConversationActions(); const count=useConversationState(s=>s.threads.threadIds.length);')
    .replace(header, 'headerActions={<><span data-testid="fixture-thread-count">{count}</span><button type="button" onClick={()=>void refresh()}>Fixture refresh</button>{props.renderSlot ? props.renderSlot("headerActions", props.headerActions ?? null) : props.headerActions}</>}'));
}

test("two tabs refresh shared metadata without reviving a deleted cached row or losing their own drafts", async ({ page, context }) => {
  const errors = await watch(page), other = await context.newPage(), otherErrors = await watch(other);
  let records = [{ id: "kept", title: "Kept conversation" }];
  let holdB = false, stale: { response: ServerResponse; body: string; closed: boolean } | undefined;
  const changes: { tab: string; method: string; id: string }[] = [];
  const f = await createControlledAgentHost({
    prepareHost: refreshButton,
    application: origin => ({ imports: 'import {createHttpConversationDataSource} from "./agent-ui/services/conversations";', declarations: `const tab=new URLSearchParams(location.search).get("tab")??"a";const history=createHttpConversationDataSource({endpoint:${JSON.stringify(origin)}+"/history/"+tab});`, props: 'conversationDataSource={history} initialThreadId="kept"' }),
    other(request, response, body) {
      const parts = request.url!.split("/"), tab = parts[2]!, route = parts[3], id = parts[4];
      response.setHeader("Content-Type", "application/json");
      if (route === "conversations" && !id) {
        const data = JSON.stringify({ conversations: records });
        if (tab === "b" && holdB) { holdB = false; stale = { response, body: data, closed: false }; response.once("close", () => { stale!.closed = true; }); }
        else response.end(data);
      } else if (route === "conversation") {
        const record = records.find(item => item.id === id);
        if (!record) { response.writeHead(404); response.end('{"error":"missing"}'); return; }
        response.end(JSON.stringify({ ...record, state: { values: { messages: [{ id: `saved-${id}`, type: "human", content: `Saved content ${id}` }] } } }));
      } else if (route === "conversations" && id && ["PATCH", "DELETE"].includes(request.method!)) {
        changes.push({ tab, method: request.method!, id });
        if (request.method === "PATCH") records = records.map(item => item.id === id ? { ...item, title: JSON.parse(body.toString()).title } : item);
        else records = records.filter(item => item.id !== id);
        response.writeHead(204); response.end();
      } else { response.writeHead(404); response.end(); }
    },
    run(input, response) {
      if (!records.some(item => item.id === input.threadId)) records.push({ id: input.threadId, title: "Created from tab b" });
      startRun(response, input); finishRun(response, input, "Conversation persisted by local Agent");
    },
  });
  const row = (tab: Page, title: string) => list(tab).locator('[data-slot="aui_thread-list-item"]').filter({ has: tab.getByRole("button", { name: title, exact: true }) });
  try {
    await page.goto(`${f.hostOrigin}?tab=a`); await other.goto(`${f.hostOrigin}?tab=b`);
    await expect(list(page).getByRole("button", { name: "Kept conversation", exact: true })).toBeVisible();
    await other.getByRole("button", { name: "新建会话", exact: true }).click();
    await expect(composer(other)).toBeEditable(); await composer(other).fill("Created from tab b"); await other.locator(".aui-composer-send").click();
    await expect(other.locator(".aui-md")).toContainText("Conversation persisted by local Agent");
    const createdId = f.requests[0]!.threadId;
    await other.getByRole("button", { name: "Fixture refresh", exact: true }).click();
    await page.getByRole("button", { name: "Fixture refresh", exact: true }).click();
    await expect(row(page, "Created from tab b")).toBeVisible();
    await list(other).getByRole("button", { name: "Kept conversation", exact: true }).click();
    await expect(other.locator('[data-role="user"]')).toContainText("Saved content kept");
    await composer(other).fill("Private draft tab b"); await composer(page).fill("Private draft tab a");
    holdB = true; await other.getByRole("button", { name: "Fixture refresh", exact: true }).click(); await expect.poll(() => stale !== undefined).toBe(true);
    await row(page, "Created from tab b").hover(); await row(page, "Created from tab b").getByRole("button", { name: "更多选项", exact: true }).click();
    await page.locator('[data-slot="agent-ui-thread-action-rename"]').click();
    await list(page).locator('[data-slot="agent-ui-thread-rename-input"]').fill("Renamed in tab a");
    await list(page).locator('[data-slot="agent-ui-thread-rename-input"]').press("Enter");
    await expect(row(page, "Renamed in tab a")).toBeVisible();
    await other.getByRole("button", { name: "Fixture refresh", exact: true }).click();
    await expect(row(other, "Renamed in tab a")).toBeVisible(); await expect.poll(() => stale!.closed).toBe(true);
    await expect(other.getByTestId("fixture-thread-count")).toHaveText("2");
    stale!.response.end(stale!.body);
    await expect(composer(other)).toHaveValue("Private draft tab b"); await expect(composer(page)).toHaveValue("Private draft tab a");
    await row(page, "Renamed in tab a").hover(); await row(page, "Renamed in tab a").getByRole("button", { name: "更多选项", exact: true }).click();
    await page.locator('[data-slot="agent-ui-thread-action-delete"]').click();
    await expect(row(page, "Renamed in tab a")).toHaveCount(0);
    await other.getByRole("button", { name: "Fixture refresh", exact: true }).click();
    await expect(list(other)).toHaveAttribute("data-conversation-list-status", "ready");
    await expect(other.getByTestId("fixture-thread-count")).toHaveText("1");
    await expect(row(other, "Renamed in tab a")).toHaveCount(0);
    await expect(composer(other)).toHaveValue("Private draft tab b");
    expect(records).toEqual([{ id: "kept", title: "Kept conversation" }]);
    expect(changes).toEqual([{ tab: "a", method: "PATCH", id: createdId }, { tab: "a", method: "DELETE", id: createdId }]);
    await other.reload(); await expect(row(other, "Kept conversation")).toBeVisible(); await expect(row(other, "Renamed in tab a")).toHaveCount(0);
    expect(f.requests).toHaveLength(1); expect(f.failures).toEqual([]); expect(errors).toEqual([]); expect(otherErrors).toEqual([]);
  } finally { await other.close(); await f.close(); }
});

test("twenty root lifetimes release pending history requests and Host tool subscriptions", async ({ page }, testInfo) => {
  const errors = await watch(page); let started = 0, closed = 0, active = 0, peak = 0;
  const f = await createControlledAgentHost({
    application: origin => ({
      imports: 'import {createHttpConversationDataSource} from "./agent-ui/services/conversations";import type {AgentFrontendToolSource} from "@za38.03/agent-ui-core";',
      declarations: `const metrics={active:0,peak:0};(window as Window & {fixtureMetrics?:typeof metrics}).fixtureMetrics=metrics;const tools:AgentFrontendToolSource={getRevision:()=>0,listTools:()=>[],subscribe(){metrics.active++;metrics.peak=Math.max(metrics.peak,metrics.active);return()=>{metrics.active--;};},execute:async()=>({content:""})};const history=createHttpConversationDataSource({endpoint:${JSON.stringify(`${origin}/history`)}});`,
      props: 'conversationDataSource={history} initialThreadId="held-history" frontendTools={tools}',
    }),
    prepareHost: async root => {
      const file = path.join(root, "src/main.tsx"), source = await readFile(file, "utf8"), target = 'createRoot(document.getElementById("root")!).render(';
      const index = source.indexOf(target); expect(index).toBeGreaterThanOrEqual(0);
      const jsx = source.slice(index + target.length).replace(/\);\s*$/, "");
      await writeFile(file, source.slice(0, index) + `let fixtureRoot:ReturnType<typeof createRoot>|undefined;function mount(){if(fixtureRoot)throw new Error("Already mounted");fixtureRoot=createRoot(document.getElementById("root")!);fixtureRoot.render(${jsx});}window.addEventListener("fixture:mount",mount);window.addEventListener("fixture:unmount",()=>{fixtureRoot?.unmount();fixtureRoot=undefined;});mount();`);
    },
    other(request, response) {
      if (request.url === "/history/conversations") { response.setHeader("Content-Type", "application/json"); response.end('{"conversations":[{"id":"held-history","title":"Pending history"}]}'); }
      else if (request.url === "/history/conversations/held-history") { started++; active++; peak = Math.max(peak, active); response.once("close", () => { closed++; active--; }); }
      else { response.writeHead(404); response.end(); }
    },
    run(input, response) { startRun(response, input); finishRun(response, input, "No run expected"); },
  });
  let listenerPeak = 0;
  try {
    await page.goto(f.hostOrigin);
    for (let cycle = 0; cycle < 20; cycle++) {
      if (cycle > 0) await page.evaluate(() => window.dispatchEvent(new Event("fixture:mount")));
      await expect.poll(() => started).toBe(cycle + 1);
      await expect.poll(() => page.evaluate(() => (window as Window & { fixtureMetrics?: { active: number } }).fixtureMetrics?.active ?? 0)).toBeGreaterThan(0);
      const currentPeak = await page.evaluate(() => (window as Window & { fixtureMetrics?: { peak: number } }).fixtureMetrics!.peak);
      if (cycle === 0) listenerPeak = currentPeak; else expect(currentPeak).toBe(listenerPeak);
      await page.evaluate(() => window.dispatchEvent(new Event("fixture:unmount")));
      await expect.poll(() => closed).toBe(cycle + 1); expect(active).toBe(0);
      await expect.poll(() => page.evaluate(() => (window as Window & { fixtureMetrics?: { active: number } }).fixtureMetrics?.active)).toBe(0);
    }
    expect(peak).toBe(1); expect(f.requests).toHaveLength(0); expect(f.failures).toEqual([]); expect(errors).toEqual([]);
    const metrics = { cycles: 20, startedHistoryReads: started, closedHistoryReads: closed, peakActiveHistoryReads: peak, peakHostToolSubscriptions: listenerPeak, remainingHistoryReads: active };
    console.log("[root lifetime resources]", JSON.stringify(metrics)); await testInfo.attach("root-lifetime-resources", { body: JSON.stringify(metrics), contentType: "application/json" });
  } finally { await f.close(); }
});
