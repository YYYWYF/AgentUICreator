export interface DecodedRecordingEntry {
    value: Record<string, unknown>;
    line: number;
    atMs: number;
}
export declare function decodeRecordingInput(input: string, limit: number, defaultIntervalMs: number): DecodedRecordingEntry[];
//# sourceMappingURL=recording-input.d.ts.map