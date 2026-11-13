import { readFile } from "node:fs/promises";
import { z } from "zod";
import { validRange } from "semver";
import path from "node:path";
import { readPackageIdentity } from "../updates/package-identity";
import { inspectAgentUIPackages } from "./source-registry/inspector";
import { ensureResourcePackages, resourcePackageConflicts, type ResourcePackageRunner } from "./ensure-resource-packages";
import { AgentUISourceError } from "./source-registry/path-policy";

const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;
// Shared contexts are imported through these public value owners. Core/store
// reached inside the same assistant-ui/react module already share its instance;
// unrelated hoisted copies (including type-only dependencies) are not readers.
const singletonNames = ["react", "react-dom", "@za38.03/agent-ui-runtime", "@assistant-ui/react"];
const requirementsSchema = z.record(z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u), z.string().refine(value => validRange(value) !== null));

export function samePackageLocation(left: string, right: string, paths = path) {
  return paths.relative(paths.toNamespacedPath(left), paths.toNamespacedPath(right)) === "";
}
const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ?
  Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)])) : value;

/** Direct source imports must work with pnpm as well as hoisted npm installs. */
export async function inspectPluginSourceDependencies(root: string, installedRoot: string, input: unknown) {
  const requirements = requirementsSchema.parse(input);
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const inspection = await inspectAgentUIPackages(root, [{ packages: requirements }]);
  const requirementsWithDeclarations = inspection.packages.flatMap(item => {
    const declarations = fields.flatMap(field => manifest[field]?.[item.name] === undefined ? [] : [manifest[field][item.name] as string]);
    return declarations.length ? declarations.map(declared => ({ ...item, declared })) : [item];
  });
  if (resourcePackageConflicts(requirementsWithDeclarations).length) throw new AgentUISourceError("PLUGIN_SOURCE_DEPENDENCY_CONFLICT", "Source dependencies conflict with the project; prepare a separate dependency migration.", inspection.packages);
  const changes = inspection.packages.filter(item => !item.declared || !item.compatible).map(item => `${item.name}@${item.required}`);
  // Packages with the same version can still be separate Context instances.
  // Compare actual resolved locations, including the direct imports' peer trees.
  const identities: (string | null)[][] = [];
  const dependencyRoots = [installedRoot];
  for (const name of Object.keys(requirements).sort()) {
    const identity = await readPackageIdentity(root, name);
    identities.push([name, identity?.version ?? null, identity?.root ?? null]);
    if (identity) dependencyRoots.push(identity.root);
  }
  const singletons = [...singletonNames, ...(Object.keys(requirements).some(name => name === "lexical" || name.startsWith("@lexical/") || name === "@assistant-ui/react-lexical") ? ["lexical", "@lexical/react"] : [])];
  for (const name of singletons) {
    const canonical = await readPackageIdentity(installedRoot, name);
    if (!canonical) continue;
    for (const from of [root, ...dependencyRoots]) {
      const resolved = await readPackageIdentity(from, name);
      identities.push([from, name, resolved?.root ?? null]);
      if (resolved && !samePackageLocation(resolved.root, canonical.root)) throw new AgentUISourceError("PLUGIN_SOURCE_CONTEXT_DUPLICATED", "Source and npm presentation must use the same runtime and Context instances.", { name, project: resolved.root, package: canonical.root });
    }
  }
  return { requirements, changes, identities, manifest };
}

/** Dependencies are a separately visible part of the confirmed source plan.
 * A later source-validation failure leaves prepared dependencies installed;
 * source/BASE transactions do not claim to roll back package-manager effects.
 */
export async function installPluginSourceDependencies(root: string, preparation: Awaited<ReturnType<typeof inspectPluginSourceDependencies>>, run: ResourcePackageRunner) {
  await ensureResourcePackages(root, [{ packages: preparation.requirements }], (directory, command) => run(directory, { ...command, args: [...command.args, "--ignore-scripts"] }));
  const after = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  for (const name of Object.keys(preparation.requirements)) {
    if (fields.every(field => preparation.manifest[field]?.[name] === undefined)) {
      if (after.dependencies) delete after.dependencies[name];
    }
  }
  if (after.dependencies && !Object.keys(after.dependencies).length && preparation.manifest.dependencies === undefined) delete after.dependencies;
  if (JSON.stringify(canonical(after)) !== JSON.stringify(canonical(preparation.manifest))) throw new AgentUISourceError("PLUGIN_SOURCE_DEPENDENCY_STATE_CHANGED", "Dependency preparation changed unplanned package declarations; inspect before retrying.");
}
