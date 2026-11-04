import { type IncomingMessage, type ServerResponse } from "node:http";
import { MockDurableRunStore } from "../mock-agent/internal.js";
import type { MockProjectTarget } from "./demo-compatibility.js";
import type { CreatorMockState } from "./types.js";
export declare const DEFAULT_CREATOR_MOCK_PORT = 47831;
export declare function isLocalMockOrigin(origin: string): boolean;
/** Creator-owned development service; never loaded by a generated Agent app. */
export declare class CreatorMockService {
    private readonly options;
    constructor(options?: {
        port?: number;
    });
    private server;
    private endpoint;
    private scenarioId;
    private speed;
    private selection;
    private selectedProject;
    private resolveProject;
    private recordings;
    private recordingsError;
    private catalogProject;
    private readonly recordingStore;
    setProjectResolver(resolveProject: (() => MockProjectTarget | undefined) | undefined): void;
    private sameProject;
    private syncProject;
    refreshState(): Promise<CreatorMockState>;
    selectRecording(recordingId: unknown, speed: unknown, projectId: unknown): Promise<CreatorMockState>;
    private validateSpeed;
    private disposed;
    private queue;
    private readonly registry;
    private readonly previewRegistry;
    private readonly durableStores;
    private readonly scopedHandlers;
    /** Key by project root: legacy Mock controls and workspace APIs can use different IDs. */
    getDurableStore(projectRoot?: string): MockDurableRunStore;
    private handlersFor;
    getState(): CreatorMockState;
    select(scenarioId: unknown, speed: unknown): CreatorMockState;
    private serialize;
    start(): Promise<CreatorMockState>;
    stop(): Promise<CreatorMockState>;
    dispose(): Promise<void>;
    /** Same service selection/replay at the fixed Creator preview endpoint. */
    handlePreviewRequest(request: IncomingMessage, response: ServerResponse): Promise<void>;
    private handle;
}
//# sourceMappingURL=CreatorMockService.d.ts.map