/** Product naming at the display boundary only. Never apply this to tool inputs,
 * persisted conversations, source files, IDs used for actions, or model history. */
export function creatorDisplayText(text: string): string {
  return text
    .replace(/\[([^\]]*)\]\(https?:\/\/[^\s)]*assistant-ui[^\s)]*\)/gi, "$1")
    .replace(/https?:\/\/[^\s"<>)]*assistant-ui[^\s"<>)]*/gi, "Agent UI")
    .replace(/assistant-ui-/gi, "")
    .replace(/assistant[\s_-]?ui/gi, "Agent UI");
}

/** A render-only projection; the original value remains authoritative. */
export function creatorDisplayValue<T>(value: T): T {
  if (typeof value === "string") return creatorDisplayText(value) as T;
  if (Array.isArray(value)) return value.map(creatorDisplayValue) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key, ["id", "threadId", "interruptId", "runId"].includes(key) ? child : creatorDisplayValue(child),
    ])) as T;
  }
  return value;
}
