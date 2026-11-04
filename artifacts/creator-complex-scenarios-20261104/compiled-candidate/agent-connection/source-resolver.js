import { AGENT_PROXY, BACKEND_PROXY } from "./types.js";
export function resolvePreviewAgentSource(state) {
    if (state.enabled === false)
        return { type: "application" };
    if (state.activeSource === "connected" && state.endpoint)
        return {
            type: "connected", identity: `connected:${state.connectionMode ?? "proxy"}:${state.endpoint}`,
            runtimeEndpoint: state.connectionMode === "direct" ? state.endpoint : AGENT_PROXY,
            backendProxyPrefix: state.connectionMode === "direct" ? new URL(state.endpoint).origin : BACKEND_PROXY,
        };
    return { type: "mock", identity: "mock", runtimeEndpoint: "/__agent-ui/mock", conversationDataEndpointOverride: "/__agent-ui/mock-data" };
}
//# sourceMappingURL=source-resolver.js.map