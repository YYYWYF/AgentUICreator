import type { IncomingMessage, ServerResponse } from "node:http";
import { CreatorWorkspaceManager } from "./CreatorWorkspaceManager.js";
export { CREATOR_WORKSPACE_API_PATH } from "./types.js";
export declare function handleCreatorWorkspaceRequest(request: IncomingMessage, response: ServerResponse, manager: CreatorWorkspaceManager, pickerStartDirectory?: string, pickDirectory?: (startDirectory: string) => Promise<string | undefined>): Promise<void>;
//# sourceMappingURL=workspace-api.d.ts.map