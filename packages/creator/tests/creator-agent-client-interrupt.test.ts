import { afterEach, describe, expect, it, vi } from "vitest";
import { CreatorAgentClient } from "../src/agent/CreatorAgentClient.js";

const question = { id: "interrupt-1", reason: "human_input", metadata: {
  kind: "ask_user_question", schemaVersion: 1, steps: [{
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
