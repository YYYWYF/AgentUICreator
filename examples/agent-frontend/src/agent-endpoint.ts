export interface ResolveAgentEndpointOptions {
  configuredEndpoint?: string | undefined;
  isDev: boolean;
  search?: string | undefined;
}

export interface MockScenarioSearchParams {
  scenario?: string | undefined;
  speed?: string | undefined;
}

export const MOCK_SCENARIO_AUTORUN_STORAGE_KEY =
  "agent-ui:mock-scenario-autorun";

export const MOCK_SCENARIO_AUTORUN_TRIGGER = "Run mock scenario.";

export function resolveMockScenarioSearchParams(
  search = "",
): MockScenarioSearchParams {
  const params = new URLSearchParams(search);
  const scenario = params.get("mockScenario")?.trim();
  const speed = params.get("mockSpeed")?.trim();
  return {
    ...(scenario ? { scenario } : {}),
    ...(speed ? { speed } : {}),
  };
}

export function isMockAgentEndpoint(endpoint: string | undefined): boolean {
  if (endpoint === undefined) return false;
  try {
    return new URL(endpoint, "http://agent-ui.local").pathname ===
      "/__agent-ui/mock";
  } catch {
    return false;
  }
}

export function shouldRenderScenarioStudio({
  endpoint,
  isDev,
}: {
  endpoint: string | undefined;
  isDev: boolean;
}): boolean {
  return isDev && isMockAgentEndpoint(endpoint);
}

export function resolveAgentEndpoint({
  configuredEndpoint,
  isDev,
  search,
}: ResolveAgentEndpointOptions): string | undefined {
  const configured = configuredEndpoint?.trim();
  if (configured) return configured;
  if (!isDev) return undefined;

  const { scenario, speed } = resolveMockScenarioSearchParams(search);
  const queryParts = [
    ...(scenario === undefined
      ? []
      : [`scenario=${encodeURIComponent(scenario)}`]),
    ...(speed === undefined ? [] : [`speed=${encodeURIComponent(speed)}`]),
  ];
  const queryString = queryParts.join("&");
  return queryString === ""
    ? "/__agent-ui/mock"
    : `/__agent-ui/mock?${queryString}`;
}
