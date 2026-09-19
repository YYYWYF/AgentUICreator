/** Grid track syntax cannot be used as a CSS element width or height. */
export function isGridTrackOnlyDimension(value: number | string): boolean {
  if (typeof value !== "string") return false;
  const dimension = value.trim();
  return /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)fr|minmax\s*\(|repeat\s*\(|subgrid\b)/i.test(dimension);
}
