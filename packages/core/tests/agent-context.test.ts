import { describe, expect, it, vi } from "vitest";
import { snapshotAgentUIContext, createAgentRuntime, type AgentUIContext, type AgentSendOptions, type AgentTransport } from "../src/index.js";
import { MockAgentTransport } from "../src/testing/index.js";

describe("business ctx snapshots", () => {
  it("detaches nested objects, accepts shared values and preserves JSON keys", () => {
    const nested = { selected: ["one", null, true, 2] };
    const ctx = { nested, same: nested, ...JSON.parse('{"__proto__":{"safe":true}}') };
    const snapshot = snapshotAgentUIContext(ctx)!;
    nested.selected[0] = "changed";
    expect(snapshot.nested).toEqual({ selected: ["one", null, true, 2] });
    expect(snapshot.same).toEqual(snapshot.nested);
    expect(Object.hasOwn(snapshot, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(snapshot)).toBe(Object.prototype);
    expect(snapshotAgentUIContext(undefined)).toBeUndefined();
  });

  it.each([null, [], 1, { value: undefined }, { value: BigInt(1) }, { value: NaN }, { value: Infinity }, { value: () => 1 }, { value: new Date() }, { value: new Map() }])("rejects non-JSON ctx: %s", ctx => {
    expect(() => snapshotAgentUIContext(ctx as AgentUIContext)).toThrowError("AGENT_UI_INVALID_CTX");
  });

  it("rejects cycles and snapshots options before delegating to a transport", async () => {
    const ctx: Record<string, unknown> = {};
    ctx.self = ctx;
    expect(() => snapshotAgentUIContext(ctx as AgentUIContext)).toThrowError("AGENT_UI_INVALID_CTX");
    const transport: AgentTransport = new MockAgentTransport();
    const send = vi.spyOn(transport, "sendMessage").mockResolvedValue(undefined);
    const runtime = createAgentRuntime({ transport });
    const options: AgentSendOptions = { ctx: { order: { id: "one" } } };
    await runtime.sendMessage("hello", options);
    expect(send).toHaveBeenCalledWith({ content: "hello" }, options);
    expect(send.mock.calls[0]![1]?.ctx).not.toBe(options.ctx);
    await expect(runtime.sendMessage("invalid", { ctx: ctx as AgentUIContext })).rejects.toMatchObject({ code: "AGENT_UI_INVALID_CTX" });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
