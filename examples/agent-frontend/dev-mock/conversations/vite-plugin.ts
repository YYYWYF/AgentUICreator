import type { Plugin } from "vite";

import { createMockConversationApiHandler } from "./handler";

export interface MockConversationApiVitePluginOptions {
  endpoint?: string | undefined;
  listDelayMs?: number | undefined;
  detailDelayMs?: number | undefined;
}

export function createMockConversationApiVitePlugin(
  options: MockConversationApiVitePluginOptions = {},
): Plugin {
  const handler = createMockConversationApiHandler(options);
  return {
    name: "agent-ui-mock-conversation-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void handler(request, response)
          .then((handled) => {
            if (!handled) next();
          })
          .catch((error: unknown) => {
            if (response.headersSent) {
              response.end();
              return;
            }
            response.statusCode = 500;
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({
              error: error instanceof Error
                ? error.message
                : "Mock Conversation API request failed.",
            }));
          });
      });
    },
  };
}
