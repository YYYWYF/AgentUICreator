import { creatorDockIntegration } from "./integration.js";
export function createCreatorDockRsbuildPlugin(options = {}) {
    return {
        name: "agent-ui-creator-dock",
        setup(api) {
            let development = false;
            let integration;
            api.onBeforeStartDevServer(() => { development = true; });
            api.onBeforeBuild(() => { development = false; });
            api.onCloseDevServer(() => { development = false; });
            api.modifyRsbuildConfig(config => {
                integration = creatorDockIntegration(options);
                // These are development server routes, not generated application imports.
                const current = config;
                const server = current.server ??= {};
                server.proxy = Array.isArray(server.proxy)
                    ? [...server.proxy, ...Object.entries(integration.proxies).map(([pathFilter, proxy]) => ({ pathFilter, ...proxy }))]
                    : { ...server.proxy, ...integration.proxies };
            });
            api.modifyHTMLTags(tags => {
                if (!development)
                    return tags;
                return { ...tags, bodyTags: [...tags.bodyTags, integration.script] };
            });
        },
    };
}
//# sourceMappingURL=rsbuild.js.map