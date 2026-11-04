import { EventSchemas } from "@ag-ui/core/schemas";
import {} from "@ag-ui/core";
import { decodeRecordingInput } from "./recording-input.js";
export const MAX_MOCK_RECORDING_BYTES = 8 * 1024 * 1024;
export const MAX_MOCK_RECORDING_EVENTS = 20_000;
// Avoid timer overflow and recordings that accidentally wait for days.
export const MAX_MOCK_RECORDING_DURATION_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_MOCK_RECORDING_INTERVAL_MS = 100;
export function validateMockRecording(recording) {
    if (!recording.id || !recording.title || recording.source !== "local-recording")
        throw new Error("Invalid recording identity.");
    if (!Array.isArray(recording.events) || !recording.events.length)
        throw new Error("Recording must contain at least one event.");
    if (recording.events.length > MAX_MOCK_RECORDING_EVENTS)
        throw new Error("Recording exceeds the 20,000 event limit.");
    let previous = 0;
    for (const [index, entry] of recording.events.entries()) {
        if (!entry || !Number.isFinite(entry.atMs) || entry.atMs < previous || entry.atMs > MAX_MOCK_RECORDING_DURATION_MS) {
            throw new Error(`Event ${index + 1}: atMs must be nonnegative, monotonic and within 24 hours.`);
        }
        if (!EventSchemas.safeParse(entry.event).success)
            throw new Error(`Event ${index + 1}: invalid AG-UI event.`);
        previous = entry.atMs;
    }
}
/** Parses data only; file ownership stays with the development host. */
export function parseMockRecording(text, identity) {
    if (new TextEncoder().encode(text).byteLength > MAX_MOCK_RECORDING_BYTES)
        throw new Error("Recording exceeds the 8 MiB limit.");
    const events = [];
    let previous = 0;
    for (const entry of decodeRecordingInput(text, MAX_MOCK_RECORDING_EVENTS, DEFAULT_MOCK_RECORDING_INTERVAL_MS)) {
        const wrapped = !("type" in entry.value) && ("atMs" in entry.value || "event" in entry.value);
        const atMs = wrapped ? entry.value.atMs : entry.atMs;
        const event = wrapped ? entry.value.event : entry.value;
        if (typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < previous || atMs > MAX_MOCK_RECORDING_DURATION_MS)
            throw new Error(`Line ${entry.line}: invalid or decreasing atMs (maximum 24 hours).`);
        if (!EventSchemas.safeParse(event).success)
            throw new Error(`Line ${entry.line}: invalid AG-UI event.`);
        // Preserve the original validated payload, including extension fields.
        events.push({ atMs, event: event });
        previous = atMs;
    }
    const recording = { ...identity, title: identity.title ?? identity.id, source: "local-recording", events };
    validateMockRecording(recording);
    return recording;
}
//# sourceMappingURL=recording.js.map