import { describe, expect, it } from "vitest";

import { isExpectedCancellationError } from "../src/errors.js";

describe("isExpectedCancellationError", () => {
  it.each([
    [new DOMException("The user aborted a request.", "AbortError")],
    [Object.assign(new Error("request stopped"), { name: "AbortError" })],
    [new Error("BodyStreamBuffer was aborted")],
    [{ cause: new Error("BodyStreamBuffer was aborted") }],
  ])("recognizes expected cancellation: %o", (error) => {
    expect(isExpectedCancellationError(error)).toBe(true);
  });

  it.each([
    new Error("network connection failed"),
    new Error("request aborted by the server"),
    { cause: new Error("ordinary failure") },
  ])("does not swallow ordinary failures: %o", (error) => {
    expect(isExpectedCancellationError(error)).toBe(false);
  });
});
