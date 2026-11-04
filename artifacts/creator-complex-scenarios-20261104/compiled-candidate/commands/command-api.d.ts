import type { IncomingMessage, ServerResponse } from "node:http";
import type { CreatorWorkspaceManager } from "../workspace/CreatorWorkspaceManager.js";
import type { CreatorProcessManager } from "../CreatorProcessManager.js";
export declare function createCreatorCommandHandler(workspaces: CreatorWorkspaceManager | undefined, root: string | undefined, legacy: CreatorProcessManager | undefined): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
//# sourceMappingURL=command-api.d.ts.map