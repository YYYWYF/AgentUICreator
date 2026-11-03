import { expect, test } from "@playwright/test";
import { mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

// Isolates the installed upstream hook from Agent UI, transport and messages.
// Both cases assert the same lifetime budget; the enabled case reproduces the
// unresolved upstream ToolInvocationTracker pipeline retention.
for (const strict of [false, true]) for (const enabled of [false, true]) test(`upstream-only empty runtime: tool invocations ${enabled ? "enabled" : "disabled"} release root lifetimes (strict=${strict})`, async ({ page }, testInfo) => {
  const fixture = await createConnectionHostFixture({
    extraOptimizeDeps: ["@assistant-ui/react"],
    prepareHost: async root => {
      const owner = await realpath(fileURLToPath(new URL("../../../packages/runtime/node_modules/@assistant-ui/react", import.meta.url)));
      const target = path.join(root, "node_modules/@assistant-ui/react");
      await mkdir(path.dirname(target), { recursive: true });
      await symlink(owner, target, process.platform === "win32" ? "junction" : "dir");
      await writeFile(path.join(root, "src/main.tsx"), `
        import {createRoot} from "react-dom/client";
        import {StrictMode} from "react";
        import {AssistantRuntimeProvider,useExternalStoreRuntime} from "@assistant-ui/react";
        const messages=[];
        function Probe(){const runtime=useExternalStoreRuntime({messages,isRunning:false,onNew:async()=>{},unstable_enableToolInvocations:${enabled}});return <AssistantRuntimeProvider runtime={runtime}><div data-testid="mounted">mounted</div></AssistantRuntimeProvider>;}
        let root;window.addEventListener("fixture:mount",()=>{root=createRoot(document.getElementById("root"));root.render(${strict ? "<StrictMode><Probe/></StrictMode>" : "<Probe/>"});});
        window.addEventListener("fixture:unmount",()=>{root.unmount();root=undefined;});
      `);
    },
  });
  const cdp = await page.context().newCDPSession(page);
  const observations: { cycles: number; heap: number; nodes: number; listeners: number }[] = [];
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  try {
    await page.goto(fixture.hostOrigin);
    for (let cycle = 1; cycle <= 110; cycle++) {
      await page.evaluate(() => window.dispatchEvent(new Event("fixture:mount")));
      await expect(page.getByTestId("mounted")).toHaveText("mounted");
      await page.evaluate(() => window.dispatchEvent(new Event("fixture:unmount")));
      if ([10, 35, 60, 85, 110].includes(cycle)) {
        await cdp.send("HeapProfiler.collectGarbage");
        const heap = await cdp.send("Runtime.getHeapUsage"), dom = await cdp.send("Memory.getDOMCounters");
        observations.push({ cycles: cycle, heap: heap.usedSize, nodes: dom.nodes, listeners: dom.jsEventListeners });
      }
    }
    console.log("[upstream-only lifetime]", JSON.stringify({ enabled, strict, observations }));
    expect(errors).toEqual([]);
    expect(observations.at(-1)!.heap - observations[0]!.heap).toBeLessThan(8 * 1024 * 1024);
    expect(observations.at(-1)!.listeners - observations[0]!.listeners).toBeLessThanOrEqual(20);
  } finally {
    const evidenceRoot = process.env.AGENT_UI_TEST_EVIDENCE_DIR ?? fileURLToPath(new URL("../../../artifacts/soak-keyboard-20261031", import.meta.url));
    await writeFile(path.join(evidenceRoot, `upstream-lifetime-${enabled}${strict ? "-strict" : ""}.json`), JSON.stringify({ enabled, strict, observations, errors }, null, 2));
    await cdp.detach(); await fixture.close();
  }
});
