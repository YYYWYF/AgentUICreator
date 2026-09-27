// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { DemoAttachmentAdapter } from "../src/demo-attachment-adapter.js";

describe("development-only attachment adapter", () => {
  it.each(["image/png", "application/pdf"])("prepares %s using upstream attachment parts", async type => {
    const adapter = new DemoAttachmentAdapter();
    const file = new File(["demo"], type === "image/png" ? "test.png" : "test.pdf", { type });
    const pending = await adapter.add({ file });
    expect(pending.status).toEqual({ type: "requires-action", reason: "composer-send" });
    const complete = await adapter.send(pending);
    expect(complete.status).toEqual({ type: "complete" });
    const data = `data:${type};base64,ZGVtbw==`;
    expect(complete.content).toEqual(type === "image/png"
      ? [{ type: "image", image: data, filename: "test.png" }]
      : [{ type: "file", data, mimeType: type, filename: "test.pdf" }]);
    await adapter.remove();
  });
  it("rejects unsupported and oversized files before reading", async () => {
    const adapter = new DemoAttachmentAdapter();
    await expect(adapter.add({ file: new File(["x"], "a.txt", { type: "text/plain" }) })).rejects.toThrow("only images and PDF");
    await expect(adapter.add({ file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" }) })).rejects.toThrow("5 MiB");
  });
  it("honors abort before starting file preparation", async () => {
    const adapter = new DemoAttachmentAdapter();
    const pending = await adapter.add({ file: new File(["x"], "a.png", { type: "image/png" }) });
    const controller = new AbortController(); controller.abort();
    await expect(adapter.send(pending, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
