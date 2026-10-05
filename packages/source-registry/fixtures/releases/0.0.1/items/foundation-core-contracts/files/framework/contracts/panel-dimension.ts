/** CSS Grid track syntax is not a valid Panel element width or height. */
export function isGridTrackOnlyDimension(value: number | string): boolean {
  if (typeof value !== "string") return false;
  return /^(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)fr|minmax\s*\(|repeat\s*\(|subgrid\b)/i.test(value.trim());
}
