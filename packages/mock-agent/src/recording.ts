import { EventSchemas, type AGUIEvent } from "@ag-ui/core";

export const MAX_MOCK_RECORDING_BYTES = 8 * 1024 * 1024;
export const MAX_MOCK_RECORDING_EVENTS = 20_000;
// Avoid timer overflow and recordings that accidentally wait for days.
export const MAX_MOCK_RECORDING_DURATION_MS = 24 * 60 * 60 * 1000;

export interface MockRecordingEvent { atMs: number; event: AGUIEvent }
export interface MockRecording {
  id: string;
  title: string;
  source: "local-recording";
  events: readonly MockRecordingEvent[];
}

export function validateMockRecording(recording: MockRecording): void {
  if (!recording.id || !recording.title || recording.source !== "local-recording") throw new Error("Invalid recording identity.");
  if (!Array.isArray(recording.events) || !recording.events.length) throw new Error("Recording must contain at least one event.");
  if (recording.events.length > MAX_MOCK_RECORDING_EVENTS) throw new Error("Recording exceeds the 20,000 event limit.");
  let previous = 0;
  for (const [index, entry] of recording.events.entries()) {
    if (!entry || !Number.isFinite(entry.atMs) || entry.atMs < previous || entry.atMs > MAX_MOCK_RECORDING_DURATION_MS) {
      throw new Error(`Event ${index + 1}: atMs must be nonnegative, monotonic and within 24 hours.`);
    }
    if (!EventSchemas.safeParse(entry.event).success) throw new Error(`Event ${index + 1}: invalid AG-UI event.`);
    previous = entry.atMs;
  }
}

/** Parses data only; file ownership stays with the development host. */
export function parseMockRecording(jsonl: string, identity: { id: string; title?: string }): MockRecording {
  if (new TextEncoder().encode(jsonl).byteLength > MAX_MOCK_RECORDING_BYTES) throw new Error("Recording exceeds the 8 MiB limit.");
  const events: MockRecordingEvent[] = [];
  let previous = 0;
  for (const [index, line] of jsonl.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let entry: unknown;
    try { entry = JSON.parse(line); } catch { throw new Error(`Line ${index + 1}: invalid JSON.`); }
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error(`Line ${index + 1}: expected { atMs, event }.`);
    const { atMs, event } = entry as { atMs?: unknown; event?: unknown };
    if (typeof atMs !== "number" || !Number.isFinite(atMs) || atMs < previous || atMs > MAX_MOCK_RECORDING_DURATION_MS) throw new Error(`Line ${index + 1}: invalid or decreasing atMs (maximum 24 hours).`);
    if (!EventSchemas.safeParse(event).success) throw new Error(`Line ${index + 1}: invalid AG-UI event.`);
    // Preserve the original validated payload, including extension fields.
    events.push({ atMs, event: event as AGUIEvent });
    if (events.length > MAX_MOCK_RECORDING_EVENTS) throw new Error("Recording exceeds the 20,000 event limit.");
    previous = atMs;
  }
  const recording: MockRecording = { ...identity, title: identity.title ?? identity.id, source: "local-recording", events };
  validateMockRecording(recording);
  return recording;
}
