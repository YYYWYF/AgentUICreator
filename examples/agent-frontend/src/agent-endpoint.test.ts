import { describe, expect, it } from "vitest";

import { resolveAgentEndpoint } from "./agent-endpoint";

describe("resolveAgentEndpoint", () => {
  it("does not enable the mock endpoint in production", () => {
    expect(resolveAgentEndpoint({
      isDev: false,
      search: "?mockScenario=multi-tool",
    })).toBeUndefined();
  });

  it("always gives a configured real Agent endpoint highest priority", () => {
    expect(resolveAgentEndpoint({
      configuredEndpoint: " https://agent.example/api ",
      isDev: true,
      search: "?mockScenario=multi-tool",
    })).toBe("https://agent.example/api");
  });

  it("uses the default Mock Agent endpoint in development", () => {
    expect(resolveAgentEndpoint({ isDev: true })).toBe("/__agent-ui/mock");
  });

  it("selects and safely encodes a Mock Agent scenario in development", () => {
    expect(resolveAgentEndpoint({
      isDev: true,
      search: "?mockScenario=multi-tool",
    })).toBe("/__agent-ui/mock?scenario=multi-tool");
    expect(resolveAgentEndpoint({
      isDev: true,
      search: "?mockScenario=custom%20scenario",
    })).toBe("/__agent-ui/mock?scenario=custom%20scenario");
  });
});
