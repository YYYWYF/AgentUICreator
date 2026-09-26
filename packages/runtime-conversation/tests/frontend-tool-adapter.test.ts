import { describe, expect, it, vi } from "vitest";
import type { AgentFrontendToolSource } from "@agent-ui/runtime-core";
import { createAssistantUiFrontendToolkit } from "../src/tools/assistant-ui-frontend-tool-adapter.js";

function source() {
  return {
    listTools: () => [{ name: "open_dialog", description: "Open dialog", inputSchema: { type: "object", properties: { title: { type: "string" } } } }],
    subscribe: () => () => {}, getRevision: () => 0,
    execute: vi.fn<AgentFrontendToolSource["execute"]>(async () => ({ content: '{"opened":true}' })),
  };
}
describe("native frontend tool adapter", () => {
  it("preserves schema, identity, signal and the result roundtrip", async () => {
    const tools = source();
    const toolkit = createAssistantUiFrontendToolkit(tools);
    const tool = toolkit.open_dialog!;
    expect(tool).toMatchObject({ type: "frontend", description: "Open dialog", parameters: tools.listTools()[0]!.inputSchema });
    const signal = new AbortController().signal;
    if (tool.type !== "frontend" || tool.execute === undefined) throw new Error("Missing frontend execute");
    expect(await tool.execute({ title: "Settings" }, { toolCallId: "call-1", abortSignal: signal } as never)).toEqual({ opened: true });
    expect(tools.execute).toHaveBeenCalledWith({ id: "call-1", name: "open_dialog", input: { title: "Settings" }, producer: { type: "root" } }, { signal });
    expect(tool.render).toBeTypeOf("function");
  });
  it("returns plain text and throws execution failures", async () => {
    const tools = source();
    const tool = createAssistantUiFrontendToolkit(tools).open_dialog!;
    if (tool.type !== "frontend" || tool.execute === undefined) throw new Error("Missing frontend execute");
    const context = { toolCallId: "call-1", abortSignal: new AbortController().signal } as never;
    tools.execute.mockResolvedValueOnce({ content: "receipt" });
    expect(await tool.execute({}, context)).toBe("receipt");
    tools.execute.mockResolvedValueOnce({ content: "failed", error: "capability disappeared" });
    await expect(tool.execute({}, context)).rejects.toThrow("capability disappeared");
  });
  it("keeps backend presentation, rejects collisions and never advertises UI-only entries", () => {
    const render = () => null;
    expect(createAssistantUiFrontendToolkit(undefined, {}, { absent: { render } })).toEqual({});
    const backend = { search: { type: "backend" as const, display: "standalone" as const, render } };
    const toolkit = createAssistantUiFrontendToolkit(source(), backend);
    expect(toolkit.search).toBe(backend.search);
    expect(() => createAssistantUiFrontendToolkit(source(), { open_dialog: backend.search })).toThrow("Tool name collision");
    expect(() => createAssistantUiFrontendToolkit(undefined, backend, { search: { render } })).toThrow("Tool name collision");
  });
});
