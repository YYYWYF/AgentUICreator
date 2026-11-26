import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { ToolDefinition } from "@assistant-ui/react";
import type { ConversationToolkit, ConversationToolkitEntry } from "../src/plugin-api/index.js";
import { createAgentUIFrontendTools } from "../src/host/frontend-tools.js";
import { createAssistantUiFrontendToolkit } from "../src/tools/assistant-ui-frontend-tool-adapter.js";
import { useFrontendToolkit } from "../src/tools/use-frontend-tool-source.js";
import { ConversationDefaultTool } from "../src/presentation.js";

const schema = { type: "object", properties: {} };
const render = () => null;
type ExecuteContext = Parameters<Extract<ConversationToolkitEntry, { type: "frontend" }>["execute"]>[1];
const context = (): ExecuteContext => ({ toolCallId: "call-1", abortSignal: new AbortController().signal, human: async () => undefined });
function entry(toolkit: ReturnType<typeof createAssistantUiFrontendToolkit>, name: string) {
  const value = toolkit[name] as ToolDefinition<Record<string, unknown>, unknown> | undefined;
  if (value === undefined) throw new Error("MISSING_TOOL");
  return value;
}

describe("unified toolkit permissions and presentation", () => {
  it.each(["inline", "standalone"] as const)("uses the selected default renderer for a renderless %s backend tool", display => {
    const toolkit: ConversationToolkit = { bash: { type: "backend", display } };
    const resolved = entry(createAssistantUiFrontendToolkit(undefined, toolkit), "bash");
    expect(resolved).toEqual({ type: "backend", display, render: ConversationDefaultTool });
    expect(resolved).not.toHaveProperty("execute");
    expect(toolkit.bash).not.toHaveProperty("render");
  });

  it("uses a backend renderer for an authorized source, then keeps only history presentation when unavailable", async () => {
    const execute = vi.fn(() => ({ opened: true }));
    const source = createAgentUIFrontendTools([{ name: "open_dialog", description: "Open", inputSchema: schema, execute }]);
    const toolkit: ConversationToolkit = { open_dialog: { type: "backend", display: "standalone", render } };
    const active = entry(createAssistantUiFrontendToolkit(source, toolkit), "open_dialog");
    expect(active).toMatchObject({ type: "frontend", render, description: "Open", parameters: schema, display: "standalone" });
    if (active.type !== "frontend") throw new Error("EXPECTED_FRONTEND");
    await expect(active.execute?.({}, context())).resolves.toEqual({ opened: true });
    expect(execute).toHaveBeenCalledOnce();
    const inactive = entry(createAssistantUiFrontendToolkit(undefined, toolkit), "open_dialog");
    expect(inactive).toEqual(toolkit.open_dialog);
    expect(inactive).not.toHaveProperty("execute");
    expect(inactive).not.toHaveProperty("parameters");
    expect(inactive).not.toHaveProperty("description");
  });

  it("accepts explicit frontend callbacks and human components, with a default frontend renderer", () => {
    const execute = vi.fn();
    const toolkit: ConversationToolkit = {
      run_action: { type: "frontend", description: "Run", parameters: schema, execute },
      ask: { type: "human", description: "Ask", parameters: schema, render },
    };
    const resolved = createAssistantUiFrontendToolkit(undefined, toolkit);
    expect(entry(resolved, "run_action")).toMatchObject({ type: "frontend", execute });
    expect(entry(resolved, "run_action").render).toBeTypeOf("function");
    expect(entry(resolved, "ask")).toEqual(toolkit.ask);
  });

  it.each(["frontend", "human"] as const)("rejects a competing %s registration for an application-owned source", type => {
    const source = createAgentUIFrontendTools([{ name: "action", description: "Run", inputSchema: schema, execute: () => null }]);
    const conflicting: ConversationToolkitEntry = type === "frontend"
      ? { type, description: "Run", parameters: schema, execute: () => null, render }
      : { type, description: "Ask", parameters: schema, render };
    expect(() => createAssistantUiFrontendToolkit(source, { action: conflicting })).toThrow('Tool name collision: "action"');
  });

  it("keeps a disabled frontend tool as history-only presentation", () => {
    const execute = vi.fn();
    const resolved = entry(createAssistantUiFrontendToolkit(undefined, {
      action: { type: "frontend", description: "Run", parameters: schema, execute, render, disabled: true },
    }), "action");
    expect(resolved).toEqual({ type: "backend", render });
    expect(resolved).not.toHaveProperty("execute");
  });

  it("rejects an incomplete JavaScript frontend registration", () => {
    const invalid = { action: { type: "frontend", description: "Run", parameters: schema, render } } as unknown as ConversationToolkit;
    expect(() => createAssistantUiFrontendToolkit(undefined, invalid)).toThrow('Invalid frontend tool: "action"');
  });
});

describe("toolkit callback cancellation", () => {
  it.each(["replace", "unmount", "run"] as const)("aborts %s and discards late callback results", async action => {
    let current: ConversationToolkit | undefined;
    let callbackSignal: AbortSignal | undefined;
    let release!: () => void;
    const execute = vi.fn(async (_input: Record<string, unknown>, options: ReturnType<typeof context>) => {
      callbackSignal = options.abortSignal;
      await new Promise<void>(resolve => { release = resolve; });
      options.abortSignal.throwIfAborted();
      return { done: true };
    });
    const toolkit: ConversationToolkit = { action: { type: "frontend", description: "Run", parameters: schema, execute } };
    function Probe({ value }: { value: ConversationToolkit }) { current = useFrontendToolkit(value); return null; }
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<Probe value={toolkit} />); });
    try {
      const tool = current?.action;
      if (tool?.type !== "frontend") throw new Error("EXPECTED_FRONTEND");
      const controller = new AbortController();
      const options = { ...context(), abortSignal: controller.signal };
      const result = Promise.resolve(tool.execute({}, options));
      const rejected = expect(result).rejects.toMatchObject({ name: "AbortError" });
      await act(async () => { await Promise.resolve(); });
      expect(callbackSignal?.aborted).toBe(false);
      if (action === "replace") await act(async () => { tree.update(<Probe value={{}} />); });
      if (action === "unmount") await act(async () => { tree.unmount(); });
      if (action === "run") controller.abort();
      expect(callbackSignal?.aborted).toBe(true);
      await rejected;
      release();
      await Promise.resolve();
      expect(execute).toHaveBeenCalledExactlyOnceWith({}, expect.objectContaining({ toolCallId: options.toolCallId, human: options.human }));
    } finally { await act(async () => tree.unmount()); }
  });

  it("does not invoke an already aborted callback", async () => {
    let current: ConversationToolkit | undefined;
    const execute = vi.fn();
    function Probe() {
      current = useFrontendToolkit({ action: { type: "frontend", description: "Run", parameters: schema, execute } });
      return null;
    }
    let tree!: ReactTestRenderer;
    await act(async () => { tree = create(<Probe />); });
    try {
      const tool = current?.action;
      if (tool?.type !== "frontend") throw new Error("EXPECTED_FRONTEND");
      const options = context();
      const controller = new AbortController(); controller.abort();
      await expect(tool.execute({}, { ...options, abortSignal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
      expect(execute).not.toHaveBeenCalled();
    } finally { await act(async () => tree.unmount()); }
  });
});
