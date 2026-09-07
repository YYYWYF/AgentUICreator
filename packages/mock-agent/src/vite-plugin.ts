import type { Plugin } from "vite";

import {
  createMockAgentHttpHandler,
  type MockAgentHttpHandlerOptions,
} from "./http-handler.js";

export interface MockAgentVitePluginOptions extends MockAgentHttpHandlerOptions {
  endpoint?: string | undefined;
}

/** Mounts the Mock Agent only in the Vite development server. */
export function createMockAgentVitePlugin({
  endpoint = "/__agent-ui/mock",
  scenario,
}: MockAgentVitePluginOptions): Plugin {
  if (!endpoint.startsWith("/")) {
    throw new Error("Mock Agent endpoint must start with '/'.");
  }

  const handler = createMockAgentHttpHandler({ scenario });
  return {
    name: "agent-ui-mock-agent",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?", 1)[0];
        if (pathname !== endpoint) {
          next();
          return;
        }
        void handler(request, response).catch((error: unknown) => {
          if (response.headersSent) {
            response.end();
            return;
          }
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({
            error: error instanceof Error
              ? error.message
              : "Mock Agent request failed.",
          }));
        });
      });
    },
  };
}
