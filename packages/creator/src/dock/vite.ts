import type { Plugin } from "vite";
import { readFile } from "node:fs/promises";
import { creatorDockIntegration, type CreatorDockIntegrationOptions } from "./integration.js";
import { CREATOR_WORKSPACE_API_PATH } from "../workspace/types.js";

const CLIENT_PATH = "/__agent-ui/creator-dock/client.js";
const STATUS_PATH = "/__agent-ui/creator-dock/status";

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
        if (pathname !== CLIENT_PATH && pathname !== STATUS_PATH) { next(); return; }
        response.setHeader("Cache-Control", "no-store");
        if (request.method !== "GET") { response.writeHead(405).end(); return; }
        if (pathname === CLIENT_PATH) {
          try {
            const source = await readFile(new URL("../browser/dock-client.js", import.meta.url));
            response.setHeader("Content-Type", "text/javascript; charset=utf-8");
            response.end(source);
          } catch (error) { next(error); }
          return;
        }
        // Probe through the development server: no cross-origin browser API access,
        // noisy connection-refused errors, or Python/model startup is needed.
        let online = false;
        try {
          const result = await fetch(new URL(CREATOR_WORKSPACE_API_PATH, String(integration.script.attrs.src)), {
            signal: AbortSignal.timeout(1000), redirect: "error",
          });
          const state = result.ok ? await result.json() as { workspace?: { id?: string } } : undefined;
          online = state?.workspace?.id === integration.workspaceId;
        } catch { /* An independently stopped Creator is an expected state. */ }
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ online }));
      });
    },
    transformIndexHtml() {
      return [{ ...integration.script, attrs: {
        ...integration.script.attrs,
        src: CLIENT_PATH,
        "data-creator-url": new URL(String(integration.script.attrs.src)).origin,
        "data-creator-status": STATUS_PATH,
      }, injectTo: "body" }];
    },
  };
}
