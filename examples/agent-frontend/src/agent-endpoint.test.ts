import { describe, expect, it } from "vitest";

import {
  isMockAgentEndpoint,
  resolveAgentEndpoint,
  resolveMockScenarioSearchParams,
  shouldRenderScenarioStudio,
} from "./agent-endpoint";

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
    expect(resolveAgentEndpoint({
      isDev: true,
      search: "?mockScenario=tool-long-running&mockSpeed=0.05",
    })).toBe("/__agent-ui/mock?scenario=tool-long-running&speed=0.05");
  });

  it("parses mock scenario controls without affecting real endpoints", () => {
    expect(resolveMockScenarioSearchParams(
      "?mockScenario=agent-plan&mockSpeed=0.05",
    )).toEqual({ scenario: "agent-plan", speed: "0.05" });
    expect(isMockAgentEndpoint("/__agent-ui/mock?scenario=agent-plan"))
      .toBe(true);
    expect(isMockAgentEndpoint("https://agent.example/api")).toBe(false);
  });

  it("only renders Scenario Studio for the development Mock endpoint", () => {
    expect(shouldRenderScenarioStudio({
      endpoint: "/__agent-ui/mock",
      isDev: true,
    })).toBe(true);
    expect(shouldRenderScenarioStudio({
      endpoint: "/__agent-ui/mock",
      isDev: false,
    })).toBe(false);
    expect(shouldRenderScenarioStudio({
      endpoint: "https://agent.example/api",
      isDev: true,
    })).toBe(false);
    expect(shouldRenderScenarioStudio({ endpoint: undefined, isDev: true }))
      .toBe(false);
  });
});
