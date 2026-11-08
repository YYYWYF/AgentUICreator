/** Installed catalog navigation, never project source evidence or an exhaustive impact proof. */
export function presentationImpact(catalog: any, pluginId: string, localizedDefaults?: Record<string, string>) {
  const index = catalog.presentationUsage;
  if (index?.schemaVersion !== 1 || !Array.isArray(index.files)) return { status: "unavailable", coverage: "unknown", interpretation: "Installed package has no presentation reference index. Missing metadata does not establish isolated scope." };
  const keys = new Set<string>(Object.values(localizedDefaults ?? {}));
  const files = index.files as { path: string; sha256: string; pluginId?: string; dependencies: string[]; references: { key: string; line: number }[] }[];
  const owned = files.filter(file => file.pluginId === pluginId);
  for (const file of owned) for (const reference of file.references) keys.add(reference.key);
  const byPath = new Map(files.map(file => [file.path, file]));
  const dependencies = new Set<string>();
  const follow = (file: typeof files[number]) => {
    for (const dependency of file.dependencies) {
      if (dependencies.has(dependency)) continue;
      dependencies.add(dependency);
      const target = byPath.get(dependency);
      if (target) follow(target);
    }
  };
  for (const file of owned) follow(file);
  const localeReads = [...keys].sort().map(key => {
    const references = files.flatMap(file => file.references.filter(reference => reference.key === key).map(reference => ({
      packagePath: file.path, sha256: file.sha256, line: reference.line, owner: file.pluginId ?? "shared",
    })));
    return { key, references: references.slice(0, 16), truncated: references.length > 16 };
  });
  const shared = [...dependencies].filter(file => !file.startsWith(`sources/plugins/${pluginId}/`)).sort();
  return { status: "available", package: catalog.package, coverage: index.coverage,
    localeReads: localeReads.slice(0, 24), localeReadsTruncated: localeReads.length > 24,
    sharedDependencies: shared.slice(0, 24), sharedDependenciesTruncated: shared.length > 24,
    interpretation: index.interpretation,
    guidance: "Shared locale/CSS/module edits can affect other surfaces. Prefer the current application's supported props/composition for isolated changes. These are installed-package baseline references; customized local implementations require current project reads. Neither documentation search nor absence from this partial index proves exclusive use. No implementation access or takeover permission is granted." };
}
