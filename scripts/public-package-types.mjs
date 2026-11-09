/** Keep legacy TypeScript resolution aligned with the canonical public exports. */
export function publicPackageTypes(pkg) {
  const types = pkg.exports?.["."]?.types;
  if (!types) return {};
  const subpaths = Object.fromEntries(Object.entries(pkg.exports)
    .filter(([entry, target]) => entry.startsWith("./") && typeof target?.types === "string")
    .map(([entry, target]) => [entry.slice(2), [target.types]]));
  return { types, typesVersions: { "*": subpaths } };
}

/** Expand export patterns against packed filenames, including Windows paths. */
export function publicTypeEntries(entry, target, packedFiles) {
  if (!entry.includes("*")) return [entry];
  const [prefix, suffix] = target.slice(2).split("*");
  return packedFiles.map(file => file.replaceAll("\\", "/"))
    .filter(file => file.startsWith(prefix) && file.endsWith(suffix))
    .map(file => entry.replace("*", file.slice(prefix.length, file.length - suffix.length)));
}
