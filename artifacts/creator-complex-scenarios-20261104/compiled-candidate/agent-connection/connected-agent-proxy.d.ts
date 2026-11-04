import { type IncomingMessage, type ServerResponse } from "node:http";
/** Byte-stream transport. No AG-UI parsing, buffering, or redirect following. */
export declare function forwardAgentRequest(request: IncomingMessage, response: ServerResponse, target: URL): Promise<void>;
//# sourceMappingURL=connected-agent-proxy.d.ts.map