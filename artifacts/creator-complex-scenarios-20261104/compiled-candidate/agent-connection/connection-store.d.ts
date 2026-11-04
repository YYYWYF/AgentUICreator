import type { AgentConnectionState } from "./types.js";
export declare function validateConnection(value: unknown): Pick<AgentConnectionState, "activeSource" | "endpoint" | "connectionMode" | "enabled">;
export declare class ConnectionStore {
    readonly projectRoot: string;
    readonly file: string;
    constructor(projectRoot: string);
    read(): Promise<AgentConnectionState>;
    save(value: unknown): Promise<AgentConnectionState>;
}
//# sourceMappingURL=connection-store.d.ts.map