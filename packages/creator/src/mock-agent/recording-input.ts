/** Clipboard decoding only. Never trim or rewrite values inside event JSON. */
interface CopiedObject { value: Record<string, unknown>; before: string; line: number }
interface CopiedObjects { objects: CopiedObject[]; after: string }

function jsonWhitespace(text: string): string {
  let quoted = false;
  let escaped = false;
  const chars: string[] = [];
  for (const char of text) {
    if (quoted) {
      chars.push(char);
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else {
      if (char === '"') quoted = true;
      chars.push(/[\s\u200b]/u.test(char) ? " " : char);
    }
  }
  return chars.join("");
}

function readObjects(text: string, limit: number): CopiedObjects {
  const objects: CopiedObject[] = [];
  let cursor = 0;
  let line = 1;
  while (cursor < text.length) {
    const start = text.indexOf("{", cursor);
    if (start < 0) break;
    const before = text.slice(cursor, start);
    line += before.split("\n").length - 1;
    const startLine = line;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    let end = start;
    for (; end < text.length; end++) {
      const char = text[end];
      if (char === "\n") line++;
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth++;
      else if (char === "}" && --depth === 0) { end++; break; }
    }
    let value: Record<string, unknown>;
    try { value = JSON.parse(jsonWhitespace(text.slice(start, end))) as Record<string, unknown>; }
    catch { throw new Error(`Line ${startLine}: invalid or incomplete JSON.`); }
    objects.push({ value, before, line: startLine });
    if (objects.length > limit) throw new Error("Recording exceeds the 20,000 event limit.");
    cursor = end;
  }
  return { objects, after: text.slice(cursor) };
}

const blank = (text: string) => /^[\s\u200b]*$/u.test(text);

/** Accept CRLF/CR clipboard lines and indentation, including copied NBSPs. */
function decodeSSE(text: string): string {
  let ended = false;
  return text.split("\n").map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(":")) return "";
    const field = /^\s*([\w-]+)\s*:(.*)$/u.exec(line);
    if (!field) return line; // Pretty-printed continuation; JSON validation still applies.
    if (field[1] !== "data") return ""; // SSE transport metadata is not an AG-UI event.
    const data = field[2]!;
    if (blank(data)) return "";
    if (ended) throw new Error(`Line ${index + 1}: data follows the SSE [DONE] marker.`);
    if (data.trim() === "[DONE]") { ended = true; return ""; }
    return data;
  }).join("\n");
}

// Chromium's EventStream grid uses ID / Type / Data / Time; selection may copy
// tabs, spaces, or each cell on a separate line. Only inspect text outside JSON.
function clockIn(text: string, line: number): number | undefined {
  const matches = [...text.matchAll(/(?<![\d:])(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,6}))?(?![\d:])/gu)];
  if (matches.length > 1) throw new Error(`Line ${line}: expected one EventStream time per event.`);
  const match = matches[0];
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) throw new Error(`Line ${line}: invalid EventStream time.`);
  return hours * 3_600_000 + minutes * 60_000 + seconds * 1000 + Math.round(Number(`0.${match[4] ?? "0"}`) * 1000);
}

export interface DecodedRecordingEntry { value: Record<string, unknown>; line: number; atMs: number }

export function decodeRecordingInput(input: string, limit: number, defaultIntervalMs: number): DecodedRecordingEntry[] {
  const text = input.replace(/\r\n?/gu, "\n");
  const sse = /^\s*(?:data|event|id|retry)\s*:/mu.test(text) || /^\s*:/mu.test(text);
  const { objects, after } = readObjects(sse ? decodeSSE(text) : text, limit);
  const gaps = [...objects.map(object => object.before), after];
  // Plain event JSON and the legacy timed envelopes have no column text.
  if (sse || gaps.every(blank)) {
    for (let index = 0; index < gaps.length; index++) {
      if (!blank(gaps[index]!)) throw new Error(`Line ${objects[index]?.line ?? objects.at(-1)?.line ?? 1}: invalid JSON or unexpected text outside an event.`);
    }
    return objects.map((object, index) => ({ ...object, atMs: index * defaultIntervalMs }));
  }

  const clocks = gaps.map((gap, index) => clockIn(gap, objects[index]?.line ?? objects.at(-1)?.line ?? 1));
  if (!clocks.some(time => time !== undefined)) throw new Error(`Line ${objects[0]?.line ?? 1}: invalid JSON or missing EventStream time.`);
  // Also accept Time before Data (e.g. a reordered DevTools grid).
  const timeFirst = clocks[0] !== undefined;
  if (timeFirst && clocks.at(-1) !== undefined) throw new Error("EventStream has an unmatched trailing time.");
  let first = 0;
  let previous = 0;
  let dayOffset = 0;
  return objects.map((object, index) => {
    const clock = clocks[index + (timeFirst ? 0 : 1)];
    if (clock === undefined) throw new Error(`Line ${object.line}: missing EventStream time.`);
    // A clock crossing midnight is valid; an ordinary backwards time is not.
    if (index && clock < previous) {
      if (previous < 23 * 3_600_000 || clock > 3_600_000) throw new Error(`Line ${object.line}: decreasing EventStream time.`);
      dayOffset += 86_400_000;
    }
    if (!index) first = clock;
    previous = clock;
    return { ...object, atMs: clock + dayOffset - first };
  });
}
