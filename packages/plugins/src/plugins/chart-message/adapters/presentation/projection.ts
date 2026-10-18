export interface ChartMessageItem { label: string; value: number }
export interface ChartMessageData { title: string; items: readonly ChartMessageItem[] }
/** Data messages are external input; malformed charts render no invented values. */
export function projectChartMessage(value: unknown): ChartMessageData | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || !Array.isArray(record.items)) return null;
  const items: ChartMessageItem[] = [];
  for (const value of record.items) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (typeof item.label !== "string" || typeof item.value !== "number" || !Number.isFinite(item.value)) return null;
    items.push({ label: item.label, value: item.value });
  }
  return { title: record.title, items };
}
