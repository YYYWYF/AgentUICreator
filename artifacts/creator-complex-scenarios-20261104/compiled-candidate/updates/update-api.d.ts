import type { IncomingMessage, ServerResponse } from "node:http";
import { type CompatibilityReleaseProvider, type UpdateSourceProvider } from "@za38.03/agent-ui-creator/project/updates";
import type { CreatorWorkspaceManager } from "../workspace/CreatorWorkspaceManager.js";
export declare const CREATOR_UPDATES_API_PATH = "/__creator/updates";
export declare function createCreatorUpdateHandler(workspaceManager?: CreatorWorkspaceManager, projectRoot?: string, provider?: UpdateSourceProvider, discovery?: {
    provider?: CompatibilityReleaseProvider | undefined;
    configRoot?: string | undefined;
    environment?: NodeJS.ProcessEnv | undefined;
}): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
//# sourceMappingURL=update-api.d.ts.map