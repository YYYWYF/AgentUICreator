import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createConnectionHostFixture } from "./support/agent-connection-host.js";

test("a generated Host controls Agent visibility and routes workflows within the current Thread", async ({ page }) => {
  const preview = await createConnectionHostFixture({ prepareHost: async root => {
    await writeFile(path.join(root, "src/main.tsx"), `
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AgentUIProvider, useAgentUIAgents, useAgentUIAgentsState } from '@za38.03/agent-ui-runtime';
import { AgentUIApplication } from '@za38.03/agent-ui-runtime/ui';
import { agentUIProject } from './agent-ui/application/project-config';
import './host.css';
function Page() {
  const agents = useAgentUIAgents();
  const snapshot = useAgentUIAgentsState(s => s);
  const [visible, setVisible] = useState('a');
  window.agentFixture = agents;
  return <><header><button onClick={() => setVisible('a')}>Switch A</button><button onClick={() => setVisible('b')}>Switch B</button>
    <button onClick={() => void agents.createThread('a')}>New A</button>
    <button onClick={() => void agents.agent('a').sendComposer({endpoint:'/multi-orders'})}>Orders</button>
    <button onClick={() => void agents.agent('a').sendComposer({endpoint:'/multi-refund'})}>Refund</button>
    <output data-testid="threads">{JSON.stringify(snapshot.agents.map(s => ({ id:s.agentId, current:s.connection.runtime?.conversation.id, threads:s.threads.map(t => ({id:t.conversation.id,status:t.run.status})) })))}</output></header>
    <AgentUIApplication agentId="a" endpoint="/multi-a" project={agentUIProject} hidden={visible !== 'a'} />
    <AgentUIApplication agentId="b" endpoint="/multi-b" project={agentUIProject} hidden={visible !== 'b'} />
  </>;
}
createRoot(document.getElementById('root')).render(<AgentUIProvider><Page /></AgentUIProvider>);
`);
  } });
  const errors: string[] = [];
  const requests: { url: string; threadId: string; runId: string }[] = [];
  let finishA: (() => Promise<void>) | undefined;
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.route(/\/multi-(?:a|b|orders|refund)$/, async route => {
      const body = route.request().postDataJSON();
      requests.push({ url: route.request().url(), threadId: body.threadId, runId: body.runId });
      const reply = async () => route.fulfill({ contentType: "text/event-stream", body: [
        { type: "RUN_STARTED", threadId: body.threadId, runId: body.runId },
        { type: "TEXT_MESSAGE_START", messageId: body.runId, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: body.runId, delta: "Agent response" },
        { type: "TEXT_MESSAGE_END", messageId: body.runId },
        { type: "RUN_FINISHED", threadId: body.threadId, runId: body.runId },
      ].map(event => `data: ${JSON.stringify(event)}\n\n`).join("") });
      if (requests.length === 1) finishA = reply;
      else await reply();
    });
    await page.goto(preview.hostOrigin);
    const a = page.locator('div[data-agent-ui-agent="a"]').first();
    const b = page.locator('div[data-agent-ui-agent="b"]').first();
    await expect(a.locator("textarea")).toBeVisible();
    await expect(b).toBeHidden();
    await a.locator("textarea").fill("research in background");
    await a.locator(".aui-composer-send").click();
    await expect.poll(() => requests.length).toBe(1);
    const original = requests[0]!.threadId;
    await page.getByRole("button", { name: "Switch B", exact: true }).click();
    await expect(b.locator("textarea")).toBeVisible();
    await expect(a).toBeHidden();
    await b.locator("textarea").fill("write independently");
    await b.locator(".aui-composer-send").click();
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1]!.url).toContain("/multi-b");
    expect(requests[1]!.threadId).not.toBe(original);
    await expect.poll(async () => JSON.parse(await page.getByTestId("threads").textContent() ?? "[]").find((entry: { id: string }) => entry.id === "a").threads.find((thread: { id: string }) => thread.id === original).status).toBe("running");
    await finishA!();
    await expect.poll(async () => JSON.parse(await page.getByTestId("threads").textContent() ?? "[]").find((entry: { id: string }) => entry.id === "a").threads.find((thread: { id: string }) => thread.id === original).status).toBe("idle");
    await page.getByRole("button", { name: "Switch A", exact: true }).click();
    await expect(a.locator("textarea")).toBeVisible();
    await expect.poll(async () => JSON.parse(await page.getByTestId("threads").textContent() ?? "[]").find((entry: { id: string }) => entry.id === "a").current).toBe(original);
    for (const [index, workflow] of ["Orders", "Refund"].entries()) {
      await a.locator("textarea").fill(`workflow-${workflow}`);
      await page.getByRole("button", { name: workflow, exact: true }).click();
      await expect.poll(() => requests.length).toBe(index + 3);
      expect(requests[index + 2]!.threadId).toBe(original);
      expect(requests[index + 2]!.url).toContain(`/multi-${workflow.toLowerCase()}`);
      await expect(a.locator(".aui-composer-send")).toBeVisible();
    }
    await page.getByRole("button", { name: "New A", exact: true }).click();
    await expect.poll(async () => JSON.parse(await page.getByTestId("threads").textContent() ?? "[]").find((entry: { id: string }) => entry.id === "a").current).not.toBe(original);
    await page.evaluate(async id => { await (window as unknown as { agentFixture: { openThread(target: { agentId: string; threadId: string }): Promise<void> } }).agentFixture.openThread({ agentId: "a", threadId: id }); }, original);
    await expect(a.getByText("Agent response", { exact: true })).toHaveCount(3);
    expect(errors).toEqual([]);
  } finally {
    if (finishA) await finishA().catch(() => {});
    await preview.close();
  }
});
