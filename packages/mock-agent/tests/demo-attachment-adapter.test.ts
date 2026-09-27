// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompositeAttachmentAdapter, SimpleImageAttachmentAdapter } from "@assistant-ui/react";
import { DemoAttachmentAdapter, DemoPdfAttachmentAdapter } from "../src/demo-attachment-adapter.js";

afterEach(() => vi.restoreAllMocks());

describe("development-only attachment adapter", () => {
  it("uses the official Composite accept and routing", () => {
    const adapter = new DemoAttachmentAdapter();
    expect(adapter).toBeInstanceOf(CompositeAttachmentAdapter);
    expect(adapter.accept).toBe("image/*,application/pdf");
  });
  it.each(["image/png", "application/pdf"])("prepares %s using upstream attachment parts", async type => {
    const imageAdd = vi.spyOn(SimpleImageAttachmentAdapter.prototype, "add");
    const imageSend = vi.spyOn(SimpleImageAttachmentAdapter.prototype, "send");
    const imageRemove = vi.spyOn(SimpleImageAttachmentAdapter.prototype, "remove");
    const pdfAdd = vi.spyOn(DemoPdfAttachmentAdapter.prototype, "add");
    const pdfSend = vi.spyOn(DemoPdfAttachmentAdapter.prototype, "send");
    const pdfRemove = vi.spyOn(DemoPdfAttachmentAdapter.prototype, "remove");
    const adapter = new DemoAttachmentAdapter();
    const file = new File(["demo"], type === "image/png" ? "test.png" : "test.pdf", { type });
    const adding = adapter.add({ file });
    if (!("then" in adding)) throw new Error("Expected the demo adapters to return a Promise.");
    const pending = await adding;
    expect(pending.status).toEqual({ type: "requires-action", reason: "composer-send" });
    const complete = await adapter.send(pending);
    expect(complete.status).toEqual({ type: "complete" });
    const data = `data:${type};base64,ZGVtbw==`;
    expect(complete.content).toEqual(type === "image/png"
      ? [{ type: "image", image: data }]
      : [{ type: "file", data, mimeType: type, filename: "test.pdf" }]);
    await adapter.remove(complete);
    for (const spy of type === "image/png" ? [imageAdd, imageSend, imageRemove] : [pdfAdd, pdfSend, pdfRemove]) {
      expect(spy).toHaveBeenCalledOnce();
    }
    for (const spy of type === "image/png" ? [pdfAdd, pdfSend, pdfRemove] : [imageAdd, imageSend, imageRemove]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
  it("rejects unsupported and oversized files before reading", async () => {
    const adapter = new DemoAttachmentAdapter();
    expect(() => adapter.add({ file: new File(["x"], "a.txt", { type: "text/plain" }) })).toThrow("No matching adapter");
    for (const type of ["image/png", "application/pdf"]) {
      expect(() => adapter.add({ file: new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big", { type }) })).toThrow("5 MiB");
    }
  });
  it.each(["image/png", "application/pdf"])("honors abort before preparing %s", async type => {
    const adapter = new DemoAttachmentAdapter();
    const adding = adapter.add({ file: new File(["x"], "attachment", { type }) });
    if (!("then" in adding)) throw new Error("Expected the demo adapters to return a Promise.");
    const pending = await adding;
    const controller = new AbortController(); controller.abort();
    await expect(adapter.send(pending, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});
