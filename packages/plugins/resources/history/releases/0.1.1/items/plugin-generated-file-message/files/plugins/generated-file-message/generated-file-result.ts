/** Tool-local projection for the pinned stack's JSON generate_file result. */
export interface GeneratedFileResult {
  filename: string;
  mimeType: string;
  url: string;
}

export function projectGeneratedFileResult(result: unknown): GeneratedFileResult | null {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return null;
  const value = result as Record<string, unknown>;
  const { filename, mimeType, url } = value;
  if (typeof filename !== "string" || !filename.trim() ||
      typeof mimeType !== "string" || !mimeType.trim() ||
      typeof url !== "string" || !url.trim()) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { filename, mimeType, url };
}
