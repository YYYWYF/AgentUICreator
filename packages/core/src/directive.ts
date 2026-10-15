/** Product-owned plain-text contract, aligned with pinned assistant-ui 3542d602. */
export interface AgentUIDirectiveReference {
  type: string;
  label: string;
  id: string;
}

export type AgentUIDirectiveSegment =
  | { kind: "text"; text: string }
  | ({ kind: "directive" } & AgentUIDirectiveReference);

const DIRECTIVE_RE = /:([\w-]{1,64})\[([^\]\n]{1,1024})\](?:\{name=([^}\n]{1,1024})\})?/gu;

export function parseAgentUIDirectives(text: string): AgentUIDirectiveSegment[] {
  const segments: AgentUIDirectiveSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(DIRECTIVE_RE)) {
    if (match.index > lastIndex) segments.push({ kind: "text", text: text.slice(lastIndex, match.index) });
    const label = match[2]!;
    segments.push({ kind: "directive", type: match[1]!, label, id: match[3] ?? label });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) segments.push({ kind: "text", text: text.slice(lastIndex) });
  return segments;
}

/** Reject values which cannot round-trip without changing the existing wire format. */
export function trySerializeAgentUIDirective(reference: AgentUIDirectiveReference): string | undefined {
  const { type, label, id } = reference;
  if (!/^[\w-]{1,64}$/u.test(type) || !id || id.length > 1024 || /[}\r\n]/u.test(id)
    || !label || label.length > 1024 || /[\]\r\n]/u.test(label)) return undefined;
  const text = `:${type}[${label}]${id === label ? "" : `{name=${id}}`}`;
  const segments = parseAgentUIDirectives(text);
  const segment = segments[0];
  return segments.length === 1 && segment?.kind === "directive" && segment.type === type
    && segment.label === label && segment.id === id ? text : undefined;
}
