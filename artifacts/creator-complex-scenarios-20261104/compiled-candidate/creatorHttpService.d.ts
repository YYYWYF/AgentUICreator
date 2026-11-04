import type { UpdateSourceProvider } from "@za38.03/agent-ui-creator/project/updates";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type CreatorProcessManagerOptions } from "./CreatorProcessManager.js";
import { CreatorWorkspaceManager } from "./workspace/CreatorWorkspaceManager.js";
import type { MockProjectInspector } from "./mock/demo-compatibility.js";
export type CreatorMiddleware = (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void | Promise<void>;
export interface CreatorMiddlewareRegistry {
    use(handler: CreatorMiddleware): unknown;
    use(route: string, handler: CreatorMiddleware): unknown;
}
export interface CreatorHttpServiceOptions {
    updateSourceProvider?: UpdateSourceProvider | undefined;
    inspectMockProject?: MockProjectInspector | undefined;
    installOfficialAgentUIResource?: ((projectRoot: string, resourceId: string) => Promise<void>) | undefined;
    projectRoot?: string | undefined;
    workspaceManager?: CreatorWorkspaceManager | undefined;
    configRoot?: string | undefined;
    runtime?: Omit<CreatorProcessManagerOptions, "projectRoot" | "configRoot"> | undefined;
}
export declare function createCreatorHttpService({ projectRoot, workspaceManager, configRoot, runtime, installOfficialAgentUIResource, inspectMockProject, updateSourceProvider, }: CreatorHttpServiceOptions): {
    runtimeDiagnosticsEnabled: boolean;
    dispose: () => Promise<void>;
    mount(middlewares: CreatorMiddlewareRegistry): void;
};
//# sourceMappingURL=creatorHttpService.d.ts.map