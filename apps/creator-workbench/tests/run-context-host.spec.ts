import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

const evidence = path.resolve("../../artifacts/run-context-20261028");
async function prepareBusinessPage(hostRoot: string) {
    await writeFile(path.join(hostRoot, "src/main.tsx"), `
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { Agent } from "./agent-ui";
import "./host.css";
function BusinessPage() {
  const [selectedOrder, setSelectedOrder] = useState("order-1");
  return <div style={{height:"100%",display:"flex",flexDirection:"column"}}>
    <section style={{padding:16,borderBottom:"1px solid #ddd"}}>
      <button onClick={() => setSelectedOrder("order-2")}>Select order 2</button>
      <output aria-label="Selected order">{selectedOrder}</output>
    </section>
    <div style={{flex:1,minHeight:0}}><Agent endpoint="/run-context-acceptance"
      getRunContext={({messages}) => [{description:"selectedOrder",value:JSON.stringify({id:selectedOrder,userMessages:messages.filter(message=>message.role==="user").length})}]} />
    </div>
  </div>;
}
createRoot(document.getElementById("root")!).render(<BusinessPage />);`);
}

test("generated Agent reads current business context again when approving a run", async ({ page }) => {
  const preview = await createConnectionHostFixture({ prepareHost: prepareBusinessPage });
  const errors: string[] = [];
  const requests: Array<{ threadId: string; runId: string; messages: unknown[]; context: Array<{ description: string; value: string }>; resume?: unknown[] }> = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.route(`${preview.hostOrigin}run-context-acceptance`, async route => {
      const input = route.request().postDataJSON(); requests.push(input);
      const identity = { threadId: input.threadId, runId: input.runId };
      const events = requests.length === 1 ? [
        { type: "RUN_STARTED", ...identity },
        { type: "TEXT_MESSAGE_START", messageId: "a1", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "a1", delta: "Please confirm the selected order." },
        { type: "TEXT_MESSAGE_END", messageId: "a1" },
        { type: "TOOL_CALL_START", toolCallId: "approval1", toolCallName: "confirm_order", parentMessageId: "a1" },
        { type: "TOOL_CALL_ARGS", toolCallId: "approval1", delta: "{}" },
        { type: "TOOL_CALL_END", toolCallId: "approval1" },
        { type: "RUN_FINISHED", ...identity, outcome: { type: "interrupt", interrupts: [{ id: "confirm-order", toolCallId: "approval1", reason: "tool_call", message: "Confirm order", responseSchema: { type: "object", properties: { approved: { type: "boolean" } }, required: ["approved"] } }] } },
      ] : [
        { type: "RUN_STARTED", ...identity },
        { type: "TOOL_CALL_RESULT", messageId: "result1", toolCallId: "approval1", content: '{"approved":true}', role: "tool" },
        { type: "TEXT_MESSAGE_START", messageId: "a2", role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: "a2", delta: `Context received: ${JSON.parse(input.context.find((entry: { description: string }) => entry.description === "selectedOrder").value).id}` },
        { type: "TEXT_MESSAGE_END", messageId: "a2" },
        { type: "RUN_FINISHED", ...identity, outcome: { type: "success" } },
      ];
      await route.fulfill({ contentType: "text/event-stream", body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(preview.hostOrigin);
    await page.locator(".aui-composer-root").getByRole("textbox").fill("Analyze the selected order");
    await page.locator(".aui-composer-send").click();
    if (!(await page.getByRole("button", { name: "允许", exact: true }).isVisible())) await page.getByRole("button", { name: /1 次工具调用/ }).click();
    await expect(page.getByRole("button", { name: "允许", exact: true })).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]!.context).toEqual([{ description: "selectedOrder", value: '{"id":"order-1","userMessages":1}' }]);
    await page.getByRole("button", { name: "Select order 2", exact: true }).click();
    await expect(page.getByRole("status", { name: "Selected order" })).toHaveText("order-2");
    expect(requests).toHaveLength(1);
    await page.getByRole("button", { name: "允许", exact: true }).click();
    await expect(page.getByText("Context received: order-2", { exact: true })).toBeVisible();
    expect(requests).toHaveLength(2);
    expect(requests[1]!.context).toEqual([{ description: "selectedOrder", value: '{"id":"order-2","userMessages":0}' }]);
    expect(requests[1]!.messages).toEqual([]);
    await expect(page.locator('[data-role="user"]')).toContainText("Analyze the selected order");
    expect(requests[1]!.threadId).toBe(requests[0]!.threadId);
    expect(requests[1]!.resume).toEqual([{ interruptId: "confirm-order", status: "resolved", payload: { approved: true } }]);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, "latest-context-on-resume.png"), fullPage: true, animations: "disabled" });
    await writeFile(path.join(evidence, "browser-result.json"), JSON.stringify({ requests, errors }, null, 2));
    expect(errors).toEqual([]);
  } catch (error) {
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: path.join(evidence, "failure.png"), fullPage: true });
    throw error;
  } finally { await preview.close(); }
});
