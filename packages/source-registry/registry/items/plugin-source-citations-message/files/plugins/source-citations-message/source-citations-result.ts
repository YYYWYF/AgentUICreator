import type { ConversationSourcePart } from "@agent-ui/react";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** Only search_sources owns this schema. Invalid results retain the Tool fallback. */
export function projectSourceCitationsResult(result: unknown): ConversationSourcePart[] | null {
  if (!isRecord(result) || !Array.isArray(result.sources)) return null;
  const sources: ConversationSourcePart[] = [];
  const ids = new Set<string>();
  for (const value of result.sources) {
    if (!isRecord(value) || !isText(value.id) || ids.has(value.id)) return null;
    ids.add(value.id);
    if (value.sourceType === "url") {
      if (!isText(value.url) || !/^https?:\/\//i.test(value.url) ||
          (value.title !== undefined && !isText(value.title))) return null;
      try {
        const url = new URL(value.url);
        if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      } catch {
        return null;
      }
      sources.push({ sourceType: "url", id: value.id, url: value.url,
        ...(value.title === undefined ? {} : { title: value.title }) });
    } else if (value.sourceType === "document") {
      if (!isText(value.title) || !isText(value.mediaType) ||
          (value.filename !== undefined && !isText(value.filename))) return null;
      sources.push({ sourceType: "document", id: value.id, title: value.title, mediaType: value.mediaType,
        ...(value.filename === undefined ? {} : { filename: value.filename }) });
    } else {
      return null;
    }
  }
  return sources;
}
