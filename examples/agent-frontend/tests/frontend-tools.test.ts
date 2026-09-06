import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import type { UIPluginServices } from "../framework/contracts/ui-plugin";
import {
  AppFrontendToolRegistry,
  AppFrontendToolRuntime,
  defineFrontendTool,
} from "../runtime/tools";

function createServices(values: Map<string, unknown>): UIPluginServices {
  return {
    get: <T = unknown>(name: string): T | undefined =>
      values.get(name) as T | undefined,
  };
}

function createEditorTool(execute = vi.fn()) {
  return defineFrontendTool({
    name: "editor_open_file",
    description:
      "Open an existing file in the visible editor. This does not modify it.",
    inputSchema: z.strictObject({ path: z.string().min(1) }),
    requires: ["editor"],
    execute: async ({ services }, input) => {
      const editor = services.get<{ openFile(path: string): void }>("editor");
      if (editor === undefined) {
        throw new Error("Editor capability unavailable");
      }
      execute(input.path);
      editor.openFile(input.path);
      return { opened: true, path: input.path };
    },
  });
}

describe("AppFrontendToolRegistry", () => {
  it("rejects invalid definitions deterministically", () => {
    const valid = createEditorTool();
    expect(() => new AppFrontendToolRegistry([valid, valid])).toThrow(
      'Duplicate frontend tool name "editor_open_file"',
    );
    expect(() => new AppFrontendToolRegistry([{
      ...valid,
      name: "Editor-Open",
    }])).toThrow("must use lower_snake_case");
    expect(() => new AppFrontendToolRegistry([{
      ...valid,
      description: "   ",
    }])).toThrow("non-blank description");
    expect(() => new AppFrontendToolRegistry([{
      ...valid,
      requires: ["editor", "editor"],
    }])).toThrow("duplicate required service");
  });
});

describe("AppFrontendToolRuntime", () => {
  it("derives JSON Schema from Zod and follows dynamic capability availability", () => {
    const services = new Map<string, unknown>();
    const runtime = new AppFrontendToolRuntime(
      new AppFrontendToolRegistry([createEditorTool()]),
    );
    const disconnect = runtime.connectServices(createServices(services));

    expect(runtime.listTools()).toEqual([]);
    services.set("editor", { openFile: vi.fn() });
    expect(runtime.listTools()).toMatchObject([{
      name: "editor_open_file",
      description: expect.stringContaining("visible editor"),
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    }]);
    services.delete("editor");
    expect(runtime.listTools()).toEqual([]);
    disconnect();
    expect(runtime.listTools()).toEqual([]);
  });

  it("validates input locally and does not echo the invalid payload", async () => {
    const handler = vi.fn();
    const services = new Map<string, unknown>([[
      "editor",
      { openFile: vi.fn() },
    ]]);
    const runtime = new AppFrontendToolRuntime(
      new AppFrontendToolRegistry([createEditorTool(handler)]),
    );
    runtime.connectServices(createServices(services));

    const result = await runtime.execute({
      id: "call-1",
      name: "editor_open_file",
      input: { path: 123, secret: "do-not-echo" },
      producer: { type: "root" },
    }, { signal: new AbortController().signal });

    expect(handler).not.toHaveBeenCalled();
    expect(result.content).toBe("Invalid frontend tool arguments");
    expect(result.error).toContain("path");
    expect(result.error).not.toContain("do-not-echo");
  });

  it("rechecks capabilities at execution and converts handler failures", async () => {
    const services = new Map<string, unknown>([[
      "editor",
      { openFile: vi.fn(() => { throw new Error("Editor is closed"); }) },
    ]]);
    const runtime = new AppFrontendToolRuntime(
      new AppFrontendToolRegistry([createEditorTool()]),
    );
    runtime.connectServices(createServices(services));
    const call = {
      id: "call-1",
      name: "editor_open_file",
      input: { path: "src/App.tsx" },
      producer: { type: "root" as const },
    };

    expect(await runtime.execute(
      call,
      { signal: new AbortController().signal },
    )).toEqual({
      content: "Frontend tool execution failed: Editor is closed",
      error: "Editor is closed",
    });

    services.delete("editor");
    expect(await runtime.execute(
      call,
      { signal: new AbortController().signal },
    )).toEqual({
      content:
        'Frontend tool execution failed: Frontend capability unavailable for tool "editor_open_file"',
      error: 'Frontend capability unavailable for tool "editor_open_file"',
    });
  });
});
