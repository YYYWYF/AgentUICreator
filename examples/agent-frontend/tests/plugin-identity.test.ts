import { describe, expect, it } from "vitest";

import { pluginCapabilityCatalog } from "../plugins";

describe("UI plugin identity", () => {
  it("keeps the generated capability catalog on the canonical seven-plugin set", () => {
    expect(pluginCapabilityCatalog.list().map(({ manifest }) => manifest.id)).toEqual([
      "conversation-data-source",
      "conversation-service",
      "conversation-suggestions",
      "conversation-surface",
      "conversation-thread-list",
      "theme-provider",
      "theme-switch",
    ]);
  });
});
