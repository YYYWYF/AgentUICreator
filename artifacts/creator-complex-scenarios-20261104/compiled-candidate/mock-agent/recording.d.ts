import { type AGUIEvent } from "@ag-ui/core";
export declare const MAX_MOCK_RECORDING_BYTES: number;
export declare const MAX_MOCK_RECORDING_EVENTS = 20000;
export declare const MAX_MOCK_RECORDING_DURATION_MS: number;
export declare const DEFAULT_MOCK_RECORDING_INTERVAL_MS = 100;
export interface MockRecordingEvent {
    atMs: number;
    event: AGUIEvent;
}
export interface MockRecording {
    id: string;
    title: string;
    source: "local-recording";
    events: readonly MockRecordingEvent[];
}
export declare function validateMockRecording(recording: MockRecording): void;
/** Parses data only; file ownership stays with the development host. */
export declare function parseMockRecording(text: string, identity: {
    id: string;
    title?: string;
}): MockRecording;
//# sourceMappingURL=recording.d.ts.map