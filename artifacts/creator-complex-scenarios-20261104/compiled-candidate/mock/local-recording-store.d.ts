import { type MockRecording } from "../mock-agent/internal.js";
export interface LocalMockRecordingSummary {
    id: string;
    title: string;
    fileName: string;
    eventCount: number;
    durationMs: number;
    status: "ready" | "invalid";
    error?: string;
}
/** Current-project user data. No watcher, registry mutation or runtime dependency. */
export declare class LocalMockRecordingStore {
    private readonly cache;
    private directory;
    private load;
    list(projectRoot: string): Promise<LocalMockRecordingSummary[]>;
    get(projectRoot: string, recordingId: string): Promise<MockRecording | undefined>;
}
//# sourceMappingURL=local-recording-store.d.ts.map