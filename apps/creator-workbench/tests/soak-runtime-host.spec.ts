import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createControlledAgentHost, startRun, finishRun, writeEvent } from "./support/controlled-agent.js";
import { captureWindowErrors } from "./support/window-errors.js";
import { installOfficialAgentUIResource } from "@za38.03/agent-ui-creator/project/dev";

for (const editor of ["textarea", "lexical"] as const) test(`${editor}: 110 streamed root lifetimes retain bounded post-GC heap, DOM and subscription counts`, async ({ page }, testInfo) => {
  const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message));
  const navigations: { url: string; at: number }[] = [];
  page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations.push({ url: frame.url(), at: Date.now() }); });
  let active = 0, closed = 0, peak = 0;
  const f = await createControlledAgentHost({
    application: () => ({
      imports: 'import type {AgentFrontendToolSource} from "@za38.03/agent-ui-core";',
      declarations: `const metrics={active:0,peak:0};(window as Window & {fixtureMetrics?:typeof metrics}).fixtureMetrics=metrics;const tools:AgentFrontendToolSource={getRevision:()=>0,listTools:()=>[],subscribe(){metrics.active++;metrics.peak=Math.max(metrics.peak,metrics.active);return()=>{metrics.active--;};},execute:async()=>({content:""})};`, props: 'frontendTools={tools}',
    }),
    prepareHost: async root => {
      if (editor === "lexical") await installOfficialAgentUIResource(root, "conversation-lexical-input", { runPackages: async () => { throw new Error("Prepared editor dependencies must be reused"); } });
      const file = path.join(root, "src/main.tsx"), source = await readFile(file, "utf8"), target = 'createRoot(document.getElementById("root")!).render(';
      const index = source.indexOf(target); expect(index).toBeGreaterThanOrEqual(0);
      const jsx = source.slice(index + target.length).replace(/\);\s*$/, "");
      await writeFile(file, source.slice(0, index) + `let fixtureRoot:ReturnType<typeof createRoot>|undefined;function mount(){if(fixtureRoot)throw new Error("Already mounted");fixtureRoot=createRoot(document.getElementById("root")!);fixtureRoot.render(${jsx});}window.addEventListener("fixture:mount",mount);window.addEventListener("fixture:unmount",()=>{fixtureRoot?.unmount();fixtureRoot=undefined;});mount();`);
    },
    run(input, response, index) {
      active++; peak = Math.max(peak, active); response.once("close", () => { active--; closed++; }); startRun(response, input);
      writeEvent(response, { type: "TEXT_MESSAGE_START", messageId: `stream-${index}`, role: "assistant" });
      for (let part = 0; part < 20; part++) writeEvent(response, { type: "TEXT_MESSAGE_CONTENT", messageId: `stream-${index}`, delta: part === 0 ? `Stream ${index}: ` : "payload " });
    },
  });
  const client = await page.context().newCDPSession(page);
  const snapshots: { cycles: number; usedHeap: number; documents: number; nodes: number; listeners: number }[] = [];
  const began = Date.now(); let controls: Record<string, number> = {};
  const record = async (cycles: number) => {
    await client.send("HeapProfiler.collectGarbage");
    const heap = await client.send("Runtime.getHeapUsage"), dom = await client.send("Memory.getDOMCounters");
    const row = { cycles, usedHeap: heap.usedSize, documents: dom.documents, nodes: dom.nodes, listeners: dom.jsEventListeners };
    snapshots.push(row); console.log("[post-GC root soak]", JSON.stringify(row));
    return row;
  };
  try {
    await page.goto(f.hostOrigin);
    for (let cycle = 0; cycle < 110; cycle++) {
      if (cycle > 0) await page.evaluate(() => window.dispatchEvent(new Event("fixture:mount")));
      // Initialization can briefly render the canonical fallback. Exercise the
      // selected application Plugin, whose activation replaces that DOM node.
      const activeComposer = page.locator('[data-ui-plugin="composer"]');
      const input = activeComposer.locator(editor === "lexical" ? '[contenteditable="true"]' : "textarea");
      await expect(input).toBeEditable();
      // Let initialization finish painting before this resource-lifetime probe
      // types into a newly mounted editor. No retry of input or sending occurs.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await expect(input).toBeEditable();
      await input.fill(`Soak turn ${cycle}`);
      if (editor === "textarea") await expect(input).toHaveValue(`Soak turn ${cycle}`);
      else await expect(input).toHaveText(`Soak turn ${cycle}`);
      await activeComposer.locator(".aui-composer-send").click();
      await expect(page.locator(".aui-md")).toContainText(`Stream ${cycle + 1}:`);
      expect(f.requests).toHaveLength(cycle + 1);
      await page.evaluate(() => window.dispatchEvent(new Event("fixture:unmount")));
      await expect.poll(() => closed).toBe(cycle + 1); expect(active).toBe(0);
      await expect.poll(() => page.evaluate(() => (window as Window & {fixtureMetrics?:{active:number}}).fixtureMetrics?.active)).toBe(0);
      if (cycle === 9) {
        const baseline = await record(10);
        // This positive control verifies that the heap probe can detect and
        // reclaim an intentional ~8 MB retained allocation on this browser.
        await page.evaluate(() => { (window as Window & {fixtureHeapControl?:number[]}).fixtureHeapControl=Array.from({length:2_000_000},(_,index)=>index); });
        await client.send("HeapProfiler.collectGarbage"); const held = await client.send("Runtime.getHeapUsage");
        await page.evaluate(() => { delete (window as Window & {fixtureHeapControl?:number[]}).fixtureHeapControl; });
        await client.send("HeapProfiler.collectGarbage"); const released = await client.send("Runtime.getHeapUsage");
        controls = { baseline: baseline.usedHeap, held: held.usedSize, released: released.usedSize };
        expect(held.usedSize - baseline.usedHeap).toBeGreaterThan(6 * 1024 * 1024);
        expect(held.usedSize - released.usedSize).toBeGreaterThan(6 * 1024 * 1024);
      }
      if ([34, 59, 84, 109].includes(cycle)) await record(cycle + 1);
    }
    const baseline = snapshots[0]!, last = snapshots.at(-1)!;
    const grew = last.usedHeap - baseline.usedHeap;
    if (process.env.AGENT_UI_TEST_SKIP_HEAP_SNAPSHOT !== "1" && (grew > 8 * 1024 * 1024 || last.nodes > baseline.nodes + 200 || last.listeners > baseline.listeners + 20)) {
      const chunks: string[] = [];
      client.on("HeapProfiler.addHeapSnapshotChunk", ({ chunk }) => chunks.push(chunk));
      await client.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
      const file = testInfo.outputPath("retained-root-heap.heapsnapshot"); await writeFile(file, chunks.join(""));
      await testInfo.attach("retained-root-heap", { path: file, contentType: "application/json" });
    }
    expect(grew).toBeLessThan(8 * 1024 * 1024);
    expect(last.nodes).toBeLessThanOrEqual(baseline.nodes + 200);
    expect(last.listeners).toBeLessThanOrEqual(baseline.listeners + 20);
    expect(last.documents).toBeLessThanOrEqual(baseline.documents + 1);
    expect(peak).toBe(1); expect(closed).toBe(110); expect(active).toBe(0);
    expect(await page.evaluate(() => (window as Window & {fixtureMetrics?:{peak:number}}).fixtureMetrics?.peak)).toBe(1);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally {
    const evidence = { editor, elapsedMs: Date.now() - began, snapshots, controls, requests: f.requests.length, closed, active, peak, errors, navigations };
    const evidenceRoot = process.env.AGENT_UI_TEST_EVIDENCE_DIR ?? fileURLToPath(new URL("../../../artifacts/soak-keyboard-20261031", import.meta.url));
    await writeFile(path.join(evidenceRoot, `heap-observations-${editor}.json`), JSON.stringify(evidence, null, 2));
    await testInfo.attach("heap-observations", { body: JSON.stringify(evidence), contentType: "application/json" });
    await client.detach(); await f.close();
  }
});

test("sixty consecutive turns preserve one thread and the complete transcript without duplicate sends", async ({ page }, testInfo) => {
  const errors: string[] = []; await captureWindowErrors(page, errors); page.on("pageerror", error => errors.push(error.message));
  const checkpoints: { turns: number; elapsedMs: number; messages: number; usedHeap: number; nodes: number }[] = [];
  const f = await createControlledAgentHost({ run(input, response, index) {
    expect(input.messages).toHaveLength(index * 2 - 1);
    expect(input.messages.filter(message => message.role === "user").map(message => message.content)).toEqual(Array.from({ length: index }, (_, turn) => `Sustained user turn ${turn + 1}`));
    expect(input.messages.filter(message => message.role === "assistant").map(message => message.content)).toEqual(Array.from({ length: index - 1 }, (_, turn) => `Sustained reply ${turn + 1}`));
    startRun(response, input); finishRun(response, input, `Sustained reply ${index}`);
  } });
  const client = await page.context().newCDPSession(page), began = Date.now();
  try {
    await page.goto(f.hostOrigin); const input = page.locator(".aui-composer-root").getByRole("textbox");
    for (let turn = 1; turn <= 60; turn++) {
      await expect(input).toBeEditable(); await input.fill(`Sustained user turn ${turn}`); await input.press("Enter");
      await expect(page.locator(".aui-md").last()).toHaveText(`Sustained reply ${turn}`);
      await expect(page.getByRole("button", { name: "停止生成", exact: true })).toHaveCount(0);
      expect(f.requests).toHaveLength(turn);
      if ([10, 30, 60].includes(turn)) {
        await client.send("HeapProfiler.collectGarbage");
        const heap = await client.send("Runtime.getHeapUsage"), dom = await client.send("Memory.getDOMCounters");
        const row = { turns: turn, elapsedMs: Date.now() - began, messages: turn * 2, usedHeap: heap.usedSize, nodes: dom.nodes };
        checkpoints.push(row); console.log("[sustained conversation]", JSON.stringify(row));
      }
    }
    expect(new Set(f.requests.map(input => input.threadId)).size).toBe(1);
    expect(new Set(f.requests.map(input => input.runId)).size).toBe(60);
    await expect(page.locator('[data-role="user"]')).toHaveCount(60);
    await expect(page.locator(".aui-md")).toHaveCount(60);
    expect(f.failures).toEqual([]); expect(errors).toEqual([]);
  } finally {
    const evidence = { checkpoints, requests: f.requests.length, errors };
    const evidenceRoot = process.env.AGENT_UI_TEST_EVIDENCE_DIR ?? fileURLToPath(new URL("../../../artifacts/soak-keyboard-20261031", import.meta.url));
    await writeFile(path.join(evidenceRoot, "sustained-conversation.json"), JSON.stringify(evidence, null, 2));
    await testInfo.attach("sustained-conversation", { body: JSON.stringify(evidence), contentType: "application/json" });
    await client.detach(); await f.close();
  }
});
