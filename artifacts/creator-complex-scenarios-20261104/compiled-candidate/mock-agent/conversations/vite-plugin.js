import { createMockConversationApiHandler } from "./handler.js";
export function createMockConversationApiVitePlugin(options = {}) {
    const handler = createMockConversationApiHandler(options);
    return {
        name: "agent-ui-mock-conversation-api",
        apply: "serve",
        configureServer(server) {
            server.middlewares.use((request, response, next) => {
                void handler(request, response)
                    .then((handled) => {
                    if (!handled)
                        next();
                })
                    .catch((error) => {
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
//# sourceMappingURL=vite-plugin.js.map