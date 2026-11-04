import type { AGUIEvent, RunAgentInput } from "@ag-ui/core";
import { type MockRecording } from "./recording.js";
export interface MockRecordingRunnerOptions {
    signal?: AbortSignal | undefined;
    timingScale?: number | undefined;
}
export declare function runMockRecording(input: RunAgentInput, recording: MockRecording, options?: MockRecordingRunnerOptions): AsyncGenerator<AGUIEvent>;
//# sourceMappingURL=recording-runner.d.ts.map