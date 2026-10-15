/** Shared static and runtime routing-name contract. */
export function isValidDataMessageUIName(name: unknown): name is string {
  return typeof name === "string" && name.length > 0 && name.trim() === name;
}
