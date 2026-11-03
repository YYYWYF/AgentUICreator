import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorAgentClient } from "../src/agent/CreatorAgentClient.js";
import { CREATOR_API_PATH } from "../src/shared.js";

const question = { id: "interrupt-1", reason: "human_input", metadata: {
  kind: "ask_user_question", steps: [{
    id: "layout", question: "Layout?", selectionMode: "single", minSelections: 1, maxSelections: 1,
    options: [{ id: "dashboard", label: "Dashboard" }, { id: "sidebar", label: "Sidebar" }],
  }],
} };

function stream(events: Record<string, unknown>[]): Response {
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    headers: { "Content-Type": "text/event-stream" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("Creator AG-UI 0.0.59 compatibility", () => {
  it("reports an expired worker run without falling back to a new execution", async () => {
    const fetcher = vi.fn(async () => Response.json({ code: "CREATOR_RUN_NOT_FOUND" }, { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(new CreatorAgentClient("workspace-1", "thread-1").reconnect("old-run", {}))
      .rejects.toMatchObject({ code: "CREATOR_RUN_NOT_FOUND" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("reconnects to the original run with GET and does not duplicate the user request", async () => {
    const fetcher = vi.fn(async () => stream([
      { type: "RUN_STARTED", threadId: "thread-1", runId: "original-run" },
      { type: "TEXT_MESSAGE_START", messageId: "reply", role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "reply", delta: "完成" },
      { type: "TEXT_MESSAGE_END", messageId: "reply" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "original-run" },
    ]));
    vi.stubGlobal("fetch", fetcher);
    const client = new CreatorAgentClient("workspace-1", "thread-1", [{ id: "user-1", role: "user", content: "修改" }]);
    await client.reconnect("original-run", {});
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${CREATOR_API_PATH}?threadId=thread-1&runId=original-run&offset=0`);
    expect(init.method).toBe("GET");
    expect(new Headers(init.headers).get("x-agent-ui-workspace-id")).toBe("workspace-1");
    expect(client.messages).toEqual([{ id: "user-1", role: "user", content: "修改" }, { id: "reply", role: "assistant", content: "完成" }]);
  });

  it("resubscribes from the exact byte after a broken UTF-8 frame without a second POST", async () => {
    const events = [
      { type: "RUN_STARTED", threadId: "thread-1", runId: "original-run" },
      { type: "TEXT_MESSAGE_START", messageId: "reply", role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "reply", delta: "小招完成" },
      { type: "TEXT_MESSAGE_END", messageId: "reply" },
      { type: "RUN_FINISHED", threadId: "thread-1", runId: "original-run" },
    ];
    const bytes = new TextEncoder().encode(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(""));
    const split = Buffer.from(bytes).indexOf(Buffer.from("小招")) + 1;
    let pulled = false;
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => init.method === "POST" ? new Response(new ReadableStream({
      pull(controller) { if (!pulled) { pulled = true; controller.enqueue(bytes.slice(0, split)); } else controller.error(new Error("network disconnected")); },
    }), { headers: { "Content-Type": "text/event-stream" } }) : new Response(bytes.slice(split), { headers: { "Content-Type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetcher);
    const client = new CreatorAgentClient("workspace-1", "thread-1");
    await client.run({}, "original-run");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe(`${CREATOR_API_PATH}?threadId=thread-1&runId=original-run&offset=${split}`);
    expect(client.messages).toEqual([{ id: "reply", role: "assistant", content: "小招完成" }]);
  });

  it("routes runtime collection requests with the current workspace and thread only", async () => {
    const request = { requestId: "12345678-1234-1234-1234-123456789abc", currentHash: "a".repeat(64), threadId: "thread-1" };
    const target = new EventTarget(), received: any[] = [];
    target.addEventListener("agent-ui-creator:runtime-observation-request", event => received.push((event as CustomEvent).detail));
    vi.stubGlobal("window", target);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body));
      return stream([{ type: "RUN_STARTED", threadId: "thread-1", runId: input.runId },
        { type: "CUSTOM", name: "creator_runtime_observation_requested", value: { ...request, threadId: "other" } },
        { type: "CUSTOM", name: "creator_runtime_observation_requested", value: request },
        { type: "RUN_FINISHED", threadId: "thread-1", runId: input.runId }]);
    }));
    await new CreatorAgentClient("workspace-1", "thread-1").run({});
    expect(received).toEqual([{ ...request, workspaceId: "workspace-1" }]);
  });
  it("sends an explicit Undo for one run and reports conflicting paths", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return requests.length === 1
        ? Response.json({ status: "undone", runId: "run-a", changedPaths: ["plugins/a/index.tsx"], reapplyable: true })
        : Response.json({ code: "CREATOR_UNDO_CONFLICT", error: "File changed", details: {
          conflicts: [{ path: "plugins/a/index.tsx" }],
        } }, { status: 409 });
    }));
    const client = new CreatorAgentClient("workspace-1", "thread-1");
    expect(await client.undo("run-a")).toEqual({ changedPaths: ["plugins/a/index.tsx"], reapplyable: true });
    await expect(client.undo("run-a")).rejects.toThrow("plugins/a/index.tsx");
    expect(requests[0]).toEqual({ action: "undo", threadId: "thread-1", runId: "run-a" });
  });

  it("sends reapply for the selected run and reports conflicts", async () => {
    const requests: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      requests.push(JSON.parse(String(init.body)) as Record<string, unknown>);
      return requests.length === 1
        ? Response.json({ status: "reapplied", runId: "run-a", changedPaths: ["plugins/a/index.tsx"] })
        : Response.json({ code: "CREATOR_REAPPLY_CONFLICT", error: "File changed", details: {
          conflicts: [{ path: "plugins/a/index.tsx" }],
        } }, { status: 409 });
    }));
    const client = new CreatorAgentClient("workspace-1", "thread-1");
    expect(await client.reapply("run-a")).toEqual(["plugins/a/index.tsx"]);
    await expect(client.reapply("run-a")).rejects.toThrow("plugins/a/index.tsx");
    expect(requests[0]).toEqual({ action: "reapply", threadId: "thread-1", runId: "run-a" });
  });

  it("acknowledges a consumed answer before later execution failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body));
      return stream([
        {type:"RUN_STARTED", threadId:"thread-1", runId:input.runId},
        {type:"CUSTOM", name:"on_interrupt_resumed", value:{interruptId:"interrupt-1"}},
        {type:"RUN_ERROR", code:"MODEL_FAILED", message:"failed after answer"},
      ]);
    }));
    const resolved: string[] = [];
    await new CreatorAgentClient("workspace-1", "thread-1").resumeInterrupt(
      "interrupt-1", {layout:["dashboard"]}, {onQuestionResumed: id => resolved.push(id)}
    ).catch(() => undefined);
    expect(resolved).toEqual(["interrupt-1"]);
  });

  it("projects on_interrupt and sends resume only through forwardedProps.command.resume", async () => {
    const inputs: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const input = JSON.parse(String(init.body)) as Record<string, unknown>;
      inputs.push(input);
      return inputs.length === 1 ? stream([
        { type: "RUN_STARTED", threadId: "thread-1", runId: input.runId },
        { type: "CUSTOM", name: "on_interrupt", value: question },
        { type: "RUN_FINISHED", threadId: "thread-1", runId: input.runId },
      ]) : stream([
        { type: "RUN_STARTED", threadId: "thread-1", runId: input.runId },
        { type: "RUN_FINISHED", threadId: "thread-1", runId: input.runId },
      ]);
    }));
    const client = new CreatorAgentClient("workspace-1", "thread-1");
    client.addMessage({ id: "user-1", role: "user", content: "Design" });
    const questions: unknown[] = [];
    const wire: string[] = [];
    await client.run({ onQuestion: value => questions.push(value), onEvent: ({ event }) => { wire.push(event.type); } });
    expect(questions).toMatchObject([{ kind: "question", interruptId: "interrupt-1", status: "pending" }]);
    expect(wire).toEqual(["RUN_STARTED", "CUSTOM", "RUN_FINISHED"]);
    expect(inputs[0]?.forwardedProps).toEqual({});
    await client.resumeInterrupt("interrupt-1", { layout: ["dashboard"] }, {});
    expect(inputs[1]?.forwardedProps).toEqual({ command: { resume: {
      interruptId: "interrupt-1", answers: { layout: ["dashboard"] },
    } } });
    expect(inputs[1]?.resume).toBeUndefined();
    expect(inputs[1]?.messages).toEqual(inputs[0]?.messages);
  });
});

// On an AG-UI 1.0 migration, replace this legacy wire assertion with
// RUN_FINISHED.outcome.interrupt and RunAgentInput.resume[] assertions.
