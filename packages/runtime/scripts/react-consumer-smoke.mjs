// Executed inside the isolated published-package consumer, never the workspace.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import React from "react";
import TestRenderer from "react-test-renderer";
import { Button, AgentUIRoot } from "@za38.03/agent-ui-react";
import { LayoutRenderer } from "@za38.03/agent-ui-renderer";
import {
  ConversationRuntimeProvider, createEphemeralConversationThreadBinding,
  useConversationRuntimeBridge,
} from "@za38.03/agent-ui-runtime";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { act, create } = TestRenderer;
const runtimeRequire = createRequire(import.meta.resolve("@za38.03/agent-ui-runtime"));
const uiRequire = createRequire(import.meta.resolve("@za38.03/agent-ui-react"));
assert.equal(runtimeRequire("react"), React, "Runtime must share the host React instance");
assert.equal(uiRequire("react"), React, "UI must share the host React instance");
const { HttpAgent } = runtimeRequire("@ag-ui/client");
const requests = [];
const agent = new HttpAgent({ url: "https://example.test/agent", fetch: async (_url, init) => {
  const input = JSON.parse(init.body);
  requests.push(input);
  const events = [
    { type: "RUN_STARTED", threadId: input.threadId, runId: input.runId },
    { type: "TEXT_MESSAGE_START", messageId: "reply", role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: "reply", delta: "Hello from AG-UI" },
    { type: "TEXT_MESSAGE_END", messageId: "reply" },
    { type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId },
  ];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "Content-Type": "text/event-stream" } });
} });
let bridge;
function Capture() {
  bridge = useConversationRuntimeBridge();
  return React.createElement(Button, null, "Send");
}
let renderer;
try {
  await act(async () => {
    renderer = create(React.createElement(AgentUIRoot, { theme: "light" },
      React.createElement(ConversationRuntimeProvider, {
        endpoint: "https://example.test/agent", threadBinding: createEphemeralConversationThreadBinding(),
        unstable_agentFactory: () => agent,
      }, React.createElement(LayoutRenderer, {
        root: { type: "slot", id: "conversation", slotId: "conversation" },
        theme: "light", renderSlot: () => React.createElement(Capture),
      }))));
  });
  assert(bridge, "Conversation hooks must mount under the host React");
  // React 19 can defer effects until act flushes; do not wait for the run's
  // completion inside the same act callback that schedules it.
  let sent = false;
  let sendError;
  await act(async () => {
    bridge.agentRuntime.sendMessage("Hello").then(
      () => { sent = true; }, error => { sendError = error; sent = true; },
    );
  });
  for (let attempt = 0; !sent && attempt < 100; attempt++) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  if (sendError) throw sendError;
  assert(sent, "AG-UI run must complete");
  assert.equal(requests.length, 1);
  assert(requests[0].messages.some(message => message.role === "user" && message.content === "Hello"));
  assert(bridge.agentRuntime.getSnapshot().messages.some(message => message.id === "reply"));
  assert.equal(renderer.root.findByType("button").children.join(""), "Send");
} finally {
  if (renderer) await act(async () => renderer.unmount());
}
console.log(`React ${React.version}: shared React, layout, UI and AG-UI send/stream/unmount OK`);
