import { describe, expect, it } from "vitest";

import { resolveConversationDataEndpoint } from "../services/conversations";

describe("resolveConversationDataEndpoint", () => {
  it("prefers a configured application API", () => {
    expect(resolveConversationDataEndpoint({
      configuredEndpoint: " https://backend.example/api ",
      isDev: true,
    })).toBe("https://backend.example/api");
  });

  it("uses the application mock API only in development", () => {
    expect(resolveConversationDataEndpoint({ isDev: true }))
      .toBe("/__agent-ui/mock-data");
    expect(resolveConversationDataEndpoint({ isDev: false })).toBeUndefined();
  });
});
