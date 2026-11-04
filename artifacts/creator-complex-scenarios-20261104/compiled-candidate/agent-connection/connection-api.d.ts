import { MockDurableRunStore } from "../mock-agent/internal.js";
import type { IncomingMessage, ServerResponse } from "node:http";
export interface ConnectionWorkspace {
    id: string;
    projectRoot: string;
}
export declare function createConnectionHandler(getWorkspace: () => ConnectionWorkspace | undefined, handleMock?: (request: IncomingMessage, response: ServerResponse) => Promise<void>, getMockDurableStore?: (workspace: ConnectionWorkspace) => MockDurableRunStore): (request: IncomingMessage, response: ServerResponse, next: () => void) => Promise<void>;
//# sourceMappingURL=connection-api.d.ts.map