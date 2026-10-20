export interface ContextRetrievalGroup {
  query: string;
  context: readonly string[];
}

export interface ContextRetrievalData {
  source: string;
  content: readonly ContextRetrievalGroup[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts only the wire shape used by CONTEXT_CONTENT; malformed data is omitted. */
export function projectContextRetrievalData(value: unknown): ContextRetrievalData | null {
  if (!isRecord(value)) return null;
  const source = value.source;
  const content = value.content;
  if (typeof source !== "string" || !Array.isArray(content)) return null;
  const groups: ContextRetrievalGroup[] = [];
  for (const group of content) {
    if (!isRecord(group) || typeof group.query !== "string" || !Array.isArray(group.context)) return null;
    const context = group.context.filter((snippet): snippet is string => typeof snippet === "string");
    if (context.length !== group.context.length) return null;
    groups.push({ query: group.query, context });
  }
  return { source, content: groups };
}
