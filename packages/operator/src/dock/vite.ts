import type { Plugin } from "vite";
import { readFile } from "node:fs/promises";
import { creatorDockIntegration, type CreatorDockIntegrationOptions } from "./integration.js";

const CLIENT_PATH = "/__agent-ui/creator-dock/client.js";

/** Development integration only. The user's CLI independently owns Creator. */
export function createCreatorDockVitePlugin(options: CreatorDockIntegrationOptions = {}): Plugin {
  let integration: ReturnType<typeof creatorDockIntegration>;
  return {
    name: "agent-ui-creator-dock", apply: "serve",
    config(config) {
      integration = creatorDockIntegration({ ...options, projectRoot: options.projectRoot ?? config.root ?? process.cwd() });
      return { server: { proxy: integration.proxies } };
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = request.url?.split("?", 1)[0];
        if (pathname !== CLIENT_PATH) { next(); return; }
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "GET") { response.writeHead(405).end(); return; }
        try {
          const source = await readFile(new URL("../browser/dock-client.js", import.meta.url));
          response.setHeader("Content-Type", "text/javascript; charset=utf-8");
          response.end(source);
        } catch (error) { next(error); }
      });
    },
    transformIndexHtml() {
      return [{ ...integration.script, attrs: {
        ...integration.script.attrs,
        src: CLIENT_PATH,
        "data-creator-url": new URL(String(integration.script.attrs.src)).origin,
      }, injectTo: "body" }];
    },
  };
}
