import type { Plugin } from "vite";

import {
  createMockAgentHttpHandler,
} from "./http-handler.js";
import { createScenarioRegistry } from "./scenario-registry.js";
import type { MockScenario } from "./scenario.js";

export interface MockAgentVitePluginOptions {
  endpoint?: string | undefined;
  scenarios: MockScenario[];
  defaultScenarioId: string;
}

/** Mounts the Mock Agent only in the Vite development server. */
export function createMockAgentVitePlugin({
  endpoint = "/__agent-ui/mock",
  scenarios,
  defaultScenarioId,
}: MockAgentVitePluginOptions): Plugin {
  if (!endpoint.startsWith("/")) {
    throw new Error("Mock Agent endpoint must start with '/'.");
  }

  const registry = createScenarioRegistry({ scenarios, defaultScenarioId });
  const handler = createMockAgentHttpHandler({ registry });
  const scenariosEndpoint = `${endpoint.replace(/\/$/, "")}/scenarios`;
  return {
    name: "agent-ui-mock-agent",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?", 1)[0];
        if (pathname !== endpoint && pathname !== scenariosEndpoint) {
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
