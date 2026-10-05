import type { RunAgentInput } from "@ag-ui/core";
import { describe, expect, it, vi } from "vitest";
import { resolveDirectiveContexts } from "../src/context/directive-context.js";
import { createDemoUserResolver } from "../src/context/demo-roster.js";

const options = () => ({ signal: new AbortController().signal });
const input = (content: string): RunAgentInput => ({
  threadId: "thread", runId: "run", state: {}, tools: [], context: [{ description: "existing", value: "preserved" }],
  messages: [{ id: "u1", role: "user", content }], forwardedProps: {},
});

describe("backend directive context resolver", () => {
  it("uses stable IDs, deduplicates across labels and messages, and preserves input", async () => {
    const request = input(":user[CEO]{name=employee_84721} :command[总结]{name=summarize}");
    request.messages.push({ id: "u2", role: "user", content: ":user[老张]{name=employee_84721} :user[李四]{name=employee_84723}" });
    request.messages.push({ id: "a1", role: "assistant", content: ":user[x]{name=employee_84722}" });
    const snapshot = structuredClone(request);
    const resolver = vi.fn(createDemoUserResolver());
    const opts = options();
    const result = await resolveDirectiveContexts(request, { user: resolver }, opts);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(resolver.mock.calls[0]?.[0].id).toBe("employee_84721");
    expect(resolver.mock.calls[0]?.[1].signal).toBe(opts.signal);
    expect(result.context).toEqual([snapshot.context[0],
      { description: "Mentioned employee employee_84721", value: JSON.stringify({ name: "张三", department: "产品部", title: "产品经理" }) },
      { description: "Mentioned employee employee_84723", value: JSON.stringify({ name: "李四", department: "设计部", title: "产品设计师" }) },
    ]);
    expect(result).not.toBe(request);
    expect(result.context).not.toBe(request.context);
    expect(request).toEqual(snapshot);
  });
  it("supports multimodal text without touching binary parts or URLs", async () => {
    const request = input("");
    request.messages = [{ id: "u", role: "user", content: [
      { type: "text", text: ":user[张晓]{name=employee_84722}" },
      { type: "binary", mimeType: "image/png", url: "https://example.test/:user[CEO]{name=employee_84721}", data: "AQID" },
    ] }];
    const snapshot = structuredClone(request);
    const resolver = vi.fn(createDemoUserResolver());
    const result = await resolveDirectiveContexts(request, { user: resolver }, options());
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(result.messages).toEqual(snapshot.messages);
    expect(JSON.parse(result.context[1]!.value).name).toBe("张晓");
    expect(request).toEqual(snapshot);
  });
  it("deduplicates by type and ID and ignores unregistered/prototype types", async () => {
    const resolver = vi.fn(async () => null);
    await resolveDirectiveContexts(input(":user[x] :file[x] :user[x] :command[x] :constructor[x]"), { user: resolver, file: resolver }, options());
    expect(resolver).toHaveBeenCalledTimes(2);
  });
  it("treats missing and unauthorized IDs alike without using labels", async () => {
    const resolver = createDemoUserResolver(new Set(["employee_84721", "employee_missing"]));
    for (const id of ["employee_missing", "employee_84722", "__proto__", "constructor"]) {
      const request = input(`:user[张三]{name=${id}}`);
      expect((await resolveDirectiveContexts(request, { user: resolver }, options())).context).toEqual(request.context);
    }
  });
  it("propagates backend failure instead of claiming not-found", async () => {
    await expect(resolveDirectiveContexts(input(":user[x]"), { user: async () => { throw new Error("database offline"); } }, options())).rejects.toThrow("database offline");
  });
  it("rejects aborted resolution before lookup and after an in-flight lookup", async () => {
    const controller = new AbortController();
    const resolver = vi.fn(async () => null);
    controller.abort();
    await expect(resolveDirectiveContexts(input(":user[x]"), { user: resolver }, { signal: controller.signal })).rejects.toThrow();
    expect(resolver).not.toHaveBeenCalled();
    const active = new AbortController();
    await expect(resolveDirectiveContexts(input(":user[x]"), { user: async () => {
      active.abort(); return { description: "unused", value: "unused" };
    } }, { signal: active.signal })).rejects.toThrow();
  });
});
