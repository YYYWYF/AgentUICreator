import { describe, expect, it } from "vitest";

import {
  isAbortLikeTransportError,
  toCanonicalAbortError,
} from "../src/errors.js";

describe("transport cancellation helpers", () => {
  it.each([
    [new DOMException("The user aborted a request.", "AbortError")],
    [Object.assign(new Error("request stopped"), { name: "AbortError" })],
    [new Error("Fetch is aborted")],
    [new Error("signal is aborted without reason")],
    [new Error("component unmounted")],
    [new Error("BodyStreamBuffer was aborted")],
    [{ cause: new Error("BodyStreamBuffer was aborted") }],
  ])("recognizes abort-shaped transport errors: %o", (error) => {
    expect(isAbortLikeTransportError(error)).toBe(true);
  });

  it.each([
    new Error("network connection failed"),
    new Error("request aborted by the server"),
    { cause: new Error("ordinary failure") },
  ])("does not classify ordinary failures: %o", (error) => {
    expect(isAbortLikeTransportError(error)).toBe(false);
  });

  it("creates a canonical AbortError while preserving the original cause", () => {
    const original = new Error("BodyStreamBuffer was aborted");
    const normalized = toCanonicalAbortError(original);

    expect(normalized).toMatchObject({
      name: "AbortError",
      message: "The operation was aborted",
      cause: original,
    });
  });
});
