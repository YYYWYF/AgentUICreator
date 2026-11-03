import { creatorDockIntegration, type CreatorDockIntegrationOptions } from "./integration.js";

type HtmlTag = { tag: string; attrs?: Record<string, string | boolean | null | undefined>; children?: string; metadata?: Record<string, unknown> };
type HtmlTags = { headTags: HtmlTag[]; bodyTags: HtmlTag[] };
/** Structural API keeps the user's Rsbuild version owned by their tool host. */
interface CreatorDockRsbuildAPI {
  onBeforeStartDevServer(callback: () => void): void;
  onBeforeBuild(callback: () => void): void;
  onCloseDevServer(callback: () => void): void;
  modifyHTMLTags(callback: (tags: HtmlTags) => HtmlTags): void;
  modifyRsbuildConfig(callback: (config: unknown) => void): void;
}

export function createCreatorDockRsbuildPlugin(options: CreatorDockIntegrationOptions = {}) {
  return {
    name: "agent-ui-creator-dock",
    setup(api: CreatorDockRsbuildAPI) {
      let development = false;
      let integration: ReturnType<typeof creatorDockIntegration>;
      api.onBeforeStartDevServer(() => { development = true; });
      api.onBeforeBuild(() => { development = false; });
      api.onCloseDevServer(() => { development = false; });
      api.modifyRsbuildConfig(config => {
        integration = creatorDockIntegration(options);
        // These are development server routes, not generated application imports.
        const current = config as { server?: { proxy?: Record<string, unknown> | unknown[] } };
        const server = current.server ??= {};
        server.proxy = Array.isArray(server.proxy)
          ? [...server.proxy, ...Object.entries(integration.proxies).map(([pathFilter, proxy]) => ({ pathFilter, ...proxy }))]
          : { ...server.proxy, ...integration.proxies };
      });
      api.modifyHTMLTags(tags => {
        if (!development) return tags;
        return { ...tags, bodyTags: [...tags.bodyTags, integration.script] };
      });
    },
  };
}
