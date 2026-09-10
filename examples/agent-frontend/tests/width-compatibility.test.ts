import { describe, expect, it } from "vitest";

import {
  WIDE_WIDTH_THRESHOLD,
  classifyContainerWidth,
  isPluginWidthCompatible,
} from "../runtime/layout";

describe("Plugin width compatibility", () => {
  it("classifies actual container width at one centralized threshold", () => {
    expect(WIDE_WIDTH_THRESHOLD).toBe(480);
    expect(classifyContainerWidth(479)).toBe("narrow");
    expect(classifyContainerWidth(480)).toBe("wide");
  });

  it.each([
    [undefined, "unknown", true],
    [undefined, "narrow", true],
    [undefined, "wide", true],
    ["narrow", "unknown", true],
    ["narrow", "narrow", true],
    ["narrow", "wide", true],
    ["wide", "unknown", true],
    ["wide", "narrow", false],
    ["wide", "wide", true],
  ] as const)(
    "maps requirement %s and container %s to %s",
    (requiredWidth, actualWidthClass, compatible) => {
      expect(isPluginWidthCompatible(requiredWidth, actualWidthClass)).toBe(
        compatible,
      );
    },
  );
});
