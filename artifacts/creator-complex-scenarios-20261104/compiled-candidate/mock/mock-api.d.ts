import type { IncomingMessage, ServerResponse } from "node:http";
import { CreatorMockService } from "./CreatorMockService.js";
import { type MockProjectTarget, type MockProjectInspector } from "./demo-compatibility.js";
export declare function handleCreatorMockRequest(request: IncomingMessage, response: ServerResponse, service: CreatorMockService, resolveProject?: () => MockProjectTarget | undefined, inspector?: MockProjectInspector, installResources?: (projectId: string, resourceId: string) => Promise<void>, supportsResource?: (resourceId: string) => boolean): Promise<void>;
//# sourceMappingURL=mock-api.d.ts.map