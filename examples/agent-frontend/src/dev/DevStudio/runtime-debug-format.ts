export function formatDebugValue(value: unknown): string {
  if (value === undefined) return "undefined";

  try {
    const formatted = JSON.stringify(value, null, 2);
    if (formatted !== undefined) return formatted;
    try {
      return String(value);
    } catch {
      return "[Unable to serialize value]";
    }
  } catch {
    return "[Unable to serialize value]";
  }
}
