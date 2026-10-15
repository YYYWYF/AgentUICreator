import type { Plugin } from "vite";
import { creatorDockIntegration, type CreatorDockIntegrationOptions } from "./integration.js";

/** Adds only development integration; the installed CLI owns the Creator server. */
export function createCreatorDockVitePlugin(options: CreatorDockIntegrationOptions = {}): Plugin {
  let integration: ReturnType<typeof creatorDockIntegration>;
  return {
    name: "agent-ui-creator-dock", apply: "serve",
    config(config) {
      integration = creatorDockIntegration({ ...options, projectRoot: options.projectRoot ?? config.root ?? process.cwd() });
      return { server: { proxy: integration.proxies } };
    },
    transformIndexHtml() {
      return [{ ...integration.script, injectTo: "body" }];
    },
  };
}
