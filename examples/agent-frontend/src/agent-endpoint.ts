export interface ResolveAgentEndpointOptions {
  configuredEndpoint?: string | undefined;
  isDev: boolean;
  search?: string | undefined;
}

export function resolveAgentEndpoint({
  configuredEndpoint,
  isDev,
  search,
}: ResolveAgentEndpointOptions): string | undefined {
  const configured = configuredEndpoint?.trim();
  if (configured) return configured;
  if (!isDev) return undefined;

  const scenario = new URLSearchParams(search ?? "")
    .get("mockScenario")
    ?.trim();

  return scenario
    ? `/__agent-ui/mock?scenario=${encodeURIComponent(scenario)}`
    : "/__agent-ui/mock";
}
