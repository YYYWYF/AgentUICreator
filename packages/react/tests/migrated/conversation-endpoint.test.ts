import { describe, expect, it } from "vitest";
import { resolveConversationDataEndpoint } from "../../../source-registry/registry/items/foundation-core-application/files/services/conversations/endpoint";

describe("resolveConversationDataEndpoint", () => {
  it("trims a configured application API", () => {
    expect(resolveConversationDataEndpoint({ configuredEndpoint: " https://backend.example/api " }))
      .toBe("https://backend.example/api");
  });
  it("leaves missing or blank endpoints unset", () => {
    expect(resolveConversationDataEndpoint({})).toBeUndefined();
    expect(resolveConversationDataEndpoint({ configuredEndpoint: "  " })).toBeUndefined();
  });
});
