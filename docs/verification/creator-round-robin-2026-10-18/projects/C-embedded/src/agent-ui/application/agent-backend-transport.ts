import { getPreviewAgentEnvironment } from "./preview-environment";

export interface AgentBackendTransport { fetch: typeof fetch }
/** Product adapters opt into this transport; paths remain product-owned. */
export function createAgentBackendTransport(options: { fetch?: typeof fetch } = {}): AgentBackendTransport {
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  return { fetch: (input, init) => {
    const prefix = getPreviewAgentEnvironment()?.backendProxyPrefix;
    if (!prefix) return request(input, init);
    // Only explicit root-relative business paths use the Agent backend origin.
    // Absolute URLs keep their product-defined destination.
    if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//") || input.includes("\\")) return request(input, init);
    return request(`${prefix}${input}`, init);
  } };
}
