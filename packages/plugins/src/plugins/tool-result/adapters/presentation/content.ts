/** Presentation-only recognition; AG-UI decoding and message storage remain upstream. */
export type ToolResultSource =
  | { type: "url"; value: string; mimeType?: string }
  | { type: "data"; value: string; mimeType: string }
  | { type: "file"; value: string; provider?: string; mimeType?: string };
export type ToolResultPart = { id?: string; metadata?: unknown } & (
  | { type: "text"; text: string }
  | { type: "image" | "audio" | "video" | "document"; source: ToolResultSource }
);
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
export function isToolResultPart(value: unknown): value is ToolResultPart {
  if (!record(value) || (value.id !== undefined && typeof value.id !== "string")) return false;
  if (value.type === "text") return typeof value.text === "string";
  if (!["image", "audio", "video", "document"].includes(String(value.type))) return false;
  const source = value.source;
  return record(source) && typeof source.value === "string" &&
    ["url", "data", "file"].includes(String(source.type)) &&
    (source.mimeType === undefined || typeof source.mimeType === "string") &&
    (source.type !== "data" || typeof source.mimeType === "string") &&
    (source.provider === undefined || typeof source.provider === "string");
}
export function hasToolResultParts(value: unknown): value is ToolResultPart[] {
  return Array.isArray(value) && value.length > 0 && value.every(isToolResultPart);
}
