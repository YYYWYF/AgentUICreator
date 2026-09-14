import { describe, expect, it } from "vitest";

import { pluginDefinitions } from "../plugins";

describe("UI plugin identity", () => {
  it("keeps the generated plugin registry on the canonical seven-plugin set", () => {
    expect(pluginDefinitions.map((definition) => definition.manifest.id)).toEqual([
      "assistant-ui-suggestions",
      "assistant-ui-thread-list",
      "conversation-data-source",
      "conversation-service",
      "conversation-surface",
      "theme-provider",
      "theme-switch",
    ]);
  });
});
