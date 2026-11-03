import { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { AgentUIHost } from "@za38.03/agent-ui-runtime";

const control = vi.hoisted(() => ({ agents: 0, endpoints: [] as Array<string | undefined>, users: [] as unknown[], streams: [] as Array<{ finish(): void }> }));
vi.mock("@za38.03/agent-ui-runtime", async importOriginal => {
  const actual = await importOriginal<typeof import("@za38.03/agent-ui-runtime")>();
  const { HttpAgent } = await import("@ag-ui/client");
  const factory: NonNullable<import("@za38.03/agent-ui-runtime").ConversationRuntimeProviderProps["unstable_agentFactory"]> = ({ threadId }) => {
    control.agents++;
    return new HttpAgent({ url: "http://example.test/agent", threadId,
      fetch: async (_url, init) => {
        const input = JSON.parse(String(init?.body));
        const encoder = new TextEncoder();
        const body = new ReadableStream<Uint8Array>({ start(controller) {
          const emit = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          emit({ type: "RUN_STARTED", threadId: input.threadId, runId: input.runId });
          control.streams.push({ finish() {
            emit({ type: "TEXT_MESSAGE_START", messageId: "reply", role: "assistant" });
            emit({ type: "TEXT_MESSAGE_CONTENT", messageId: "reply", delta: "Host response" });
            emit({ type: "TEXT_MESSAGE_END", messageId: "reply" });
            emit({ type: "RUN_FINISHED", threadId: input.threadId, runId: input.runId });
            controller.close();
          } });
        } });
        return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
      },
    });
  };
  function UserProbe() { control.users.push(actual.useAgentUIUser()); return null; }
  return { ...actual, ConversationRuntimeProvider: (props: import("@za38.03/agent-ui-runtime").ConversationRuntimeProviderProps) => {
    control.endpoints.push(props.endpoint);
    return <actual.ConversationRuntimeProvider {...props} unstable_agentFactory={factory}><UserProbe />{props.children}</actual.ConversationRuntimeProvider>;
  } };
});

import { Agent } from "../../plugins/resources/registry/items/foundation/core/files";
import { AgentUIProvider, useAgentUI, useAgentUIState, useAgentUIEvent } from "@za38.03/agent-ui-runtime";
import { agentCompositionStore } from "../../plugins/resources/registry/items/foundation/core/files/application/composition-store";

async function until(predicate: () => boolean) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  }
  throw new Error("HOST_PROVIDER_TEST_TIMEOUT");
}

it("shares one real conversation with Host controls before opening, survives panel hiding and displays the streamed reply", async () => {
  expect(typeof AgentUIProvider).toBe("function");
  expect(typeof Agent).toBe("function");
  const mount = document.createElement("div"); document.body.append(mount); const root = createRoot(mount);
  let host!: AgentUIHost;
  const mounts = vi.fn(); const cleanup = vi.fn(); const ended = vi.fn();
  function Page() {
    host = useAgentUI();
    const ready = useAgentUIState(s => s.status === "ready");
    const [open, setOpen] = useState(false);
    useAgentUIEvent("run-end", ended);
    useEffect(() => { mounts(); return cleanup; }, []);
    return <><button disabled={!ready} onClick={() => setOpen(value => !value)}>toggle</button><aside hidden={!open}><Agent endpoint="/business-agent" locale="en-US" /></aside></>;
  }
  try {
    await act(async () => root.render(<AgentUIProvider><Page /></AgentUIProvider>));
    await until(() => host.getSnapshot().status === "ready").catch(error => {
      throw new Error(JSON.stringify({ state: host.getSnapshot(), agents: control.agents, composition: agentCompositionStore.getCandidateDiagnostic() }), { cause: error });
    });
    const initializedAgents = control.agents;
    expect(initializedAgents).toBeGreaterThan(0);
    expect(mount.querySelector("aside")?.hidden).toBe(true);
    expect(control.endpoints).toContain("/business-agent");
    let pending!: Promise<void>;
    await act(async () => { pending = host.sendMessage("Host question"); await Promise.resolve(); });
    await until(() => control.streams.length === 1);
    expect(host.getSnapshot().runtime?.run.status).toBe("running");
    await act(async () => mount.querySelector("button")!.click());
    expect(mount.querySelector("aside")?.hidden).toBe(false);
    await act(async () => mount.querySelector("button")!.click());
    expect(mount.querySelector("aside")?.hidden).toBe(true);
    expect(host.getSnapshot().runtime?.run.status).toBe("running");
    await act(async () => control.streams[0]!.finish());
    await act(async () => { await pending; });
    expect(ended).toHaveBeenCalled();
    expect(host.getSnapshot().runtime?.run.status).toBe("idle");
    await act(async () => mount.querySelector("button")!.click());
    await until(() => mount.textContent?.includes("Host response") === true);
    expect(control.agents).toBe(initializedAgents);
    expect(mounts).toHaveBeenCalledTimes(1); expect(cleanup).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); mount.remove(); }
  await expect(host.sendMessage("late")).rejects.toMatchObject({ code: "AGENT_UI_NOT_READY" });
});

it("runs standalone without a business Provider and updates Agent profile props without rebuilding the session", async () => {
  const mount = document.createElement("div"); document.body.append(mount); const root = createRoot(mount);
  const before = control.agents;
  try {
    await act(async () => root.render(<Agent endpoint="/standalone-agent" user={{ userName: "First" }} />));
    await until(() => control.agents > before && control.users.length > 0);
    const initialized = control.agents;
    expect(mount.querySelector("[data-agent-ui-outlet]")).not.toBeNull();
    expect(control.endpoints).toContain("/standalone-agent");
    expect(control.users.at(-1)).toMatchObject({ userName: "First" });
    await act(async () => root.render(<Agent endpoint="/standalone-agent" user={null} />));
    expect(control.users.at(-1)).toBeNull();
    expect(control.agents).toBe(initialized);
  } finally { await act(async () => root.unmount()); mount.remove(); }
});

it("inherits the npm Provider profile, lets Agent override it and ends the session when Agent is removed", async () => {
  const mount = document.createElement("div"); document.body.append(mount); const root = createRoot(mount);
  let host!: AgentUIHost;
  function Controls() { host = useAgentUI(); return null; }
  const view = (agent: boolean, override: boolean) => <AgentUIProvider user={{ userName: "Business user" }}>
    <Controls />{agent && <Agent endpoint="/business-agent" {...(override ? { user: null } : {})} />}
  </AgentUIProvider>;
  try {
    await act(async () => root.render(view(true, false)));
    await until(() => host.getSnapshot().status === "ready");
    expect(control.users.at(-1)).toMatchObject({ userName: "Business user" });
    await act(async () => root.render(view(true, true)));
    expect(control.users.at(-1)).toBeNull();
    let pending!: Promise<void>;
    await act(async () => { pending = host.sendMessage("pending question"); await Promise.resolve(); });
    const rejected = expect(pending).rejects.toMatchObject({ code: "AGENT_UI_SESSION_ENDED" });
    await act(async () => root.render(view(false, false)));
    await rejected;
    expect(host.getSnapshot().status).toBe("initializing");
    await expect(host.sendMessage("after removal")).rejects.toMatchObject({ code: "AGENT_UI_NOT_READY" });
  } finally { await act(async () => root.unmount()); mount.remove(); }
});
