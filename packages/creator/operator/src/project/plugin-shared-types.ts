import { API, SignatureKind, SymbolFlags, TypeFlags, type Type } from "typescript/unstable/sync";
import { createRequire } from "node:module";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import type { PluginAsset } from "./types";
import { isScalarPublicType, prioritizePublicMembers, PUBLIC_MODULE_PATTERN } from "./public-type-navigation";

// A public export followed by at most eight member/type operators. No code or
// filesystem expressions are evaluated. Logical query paths always use dots.
export const SHARED_TYPE_QUERY = /^[A-Za-z_$][A-Za-z0-9_$]{0,99}(?:\.[A-Za-z_$][A-Za-z0-9_$-]{0,99}){0,8}$/u;

/** Package-owned facts, bounded identically for application and export inspection. */
export function publicComponentPresentation(catalog: any, publicModule: string, component: string) {
  const declared = catalog.publicComponents?.schemaVersion === 1
    ? catalog.publicComponents.modules?.[publicModule]?.[component] : undefined;
  if (!declared || typeof declared !== "object") return undefined;
  const contract = Object.fromEntries(["presentation", "composition", "portal", "interaction", "styles"].flatMap(key =>
    typeof declared[key] === "string" ? [[key, declared[key].slice(0, 1200)]] : []));
  return Object.keys(contract).length ? contract : undefined;
}

/** Lightweight installed facts for navigation; no type expansion or owner selection. */
export async function inspectPluginPresentations(projectRoot: string, assets: readonly Pick<PluginAsset, "pluginId" | "application">[]) {
  const facts: Record<string, { packageVersion: string; module: string; component: string; facts: Record<string, string> }> = {};
  let layout: { packageVersion: string; module: string; component: string; facts: Record<string, string> } | undefined;
  try {
    const catalogPath = createRequire(path.join(projectRoot, "package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    const pkg = JSON.parse(await readFile(path.join(path.dirname(catalogPath), "..", "package.json"), "utf8"));
    if (pkg.name !== "@za38.03/agent-ui-plugins" || catalog.package?.name !== pkg.name || catalog.package?.version !== pkg.version) return { plugins: facts };
    const sidebar = publicComponentPresentation(catalog, pkg.name, "AgentUISidebarFrame");
    if (sidebar) layout = { packageVersion: String(pkg.version), module: pkg.name, component: "AgentUISidebarFrame", facts: sidebar };
    let remaining = 12_000;
    for (const asset of assets) {
      // Installed npm facts must not describe a customized source implementation.
      if (asset.application?.implementationOwnership !== "npm") continue;
      const component = catalog.plugins?.find((item: { id: string }) => item.id === asset.pluginId)?.application?.component;
      if (typeof component !== "string") continue;
      const presentation = publicComponentPresentation(catalog, asset.application.implementationImport, component);
      if (!presentation) continue;
      const value = { packageVersion: String(pkg.version), module: asset.application.implementationImport, component, facts: presentation };
      const size = JSON.stringify(value).length;
      if (size > remaining) continue;
      remaining -= size;
      facts[asset.pluginId] = value;
    }
  } catch { /* Optional metadata is not a project admission requirement. */ }
  return { plugins: facts, ...(layout ? { layout } : {}) };
}

export function resolveSharedDeclaration(packageRoot: string, declaration: unknown,
  paths: Pick<typeof path, "resolve" | "relative" | "isAbsolute" | "sep"> = path) {
  if (typeof declaration !== "string" || !declaration.startsWith("./") || !declaration.endsWith(".d.ts") || declaration.includes("\\") || declaration.includes("\0")) throw new Error("Public module declaration is unavailable");
  const filePath = paths.resolve(packageRoot, declaration);
  const relative = paths.relative(packageRoot, filePath);
  if (relative === ".." || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) throw new Error("Declaration escapes installed package");
  return filePath;
}

/** Bounded public declaration query, resolved from the target installation only. */
export async function inspectPluginSharedTypes(projectRoot: string, names: readonly string[], publicModule = "@za38.03/agent-ui-plugins/contracts") {
  if (names.length > 8 || names.some(name => !SHARED_TYPE_QUERY.test(name))) {
    throw new Error("Invalid shared symbol query");
  }
  const api = new API();
  try {
    if (!PUBLIC_MODULE_PATTERN.test(publicModule)) throw new Error("Invalid public module");
    const packageName = publicModule.split("/").slice(0, 2).join("/");
    const require = createRequire(path.join(projectRoot, "package.json"));
    // package.json is not necessarily a public export. Resolve its installed
    // location through Node's package search paths without importing package code.
    let packageRoot: string | undefined;
    for (const directory of require.resolve.paths(packageName) ?? []) {
      const candidate = path.join(directory, packageName);
      try { await readFile(path.join(candidate, "package.json")); packageRoot = await realpath(candidate); break; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    if (!packageRoot) throw new Error(`Installed package unavailable: ${packageName}`);
    const pkg = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    if (pkg.name !== packageName) throw new Error("Installed package identity mismatch");
    const catalog = packageName === "@za38.03/agent-ui-plugins"
      ? JSON.parse(await readFile(require.resolve(`${packageName}/catalog.json`), "utf8")) : {};
    if (packageName === "@za38.03/agent-ui-plugins" && (catalog.package?.name !== pkg.name || catalog.package?.version !== pkg.version)) throw new Error("Installed catalog/package identity mismatch");
    const exportKey = publicModule === pkg.name ? "." : `./${publicModule.slice(pkg.name.length + 1)}`;
    const declaration = pkg.exports?.[exportKey]?.types;
    const filePath = resolveSharedDeclaration(packageRoot, declaration);
    const realRelative = path.relative(await realpath(packageRoot), await realpath(filePath));
    if (realRelative === ".." || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) throw new Error("Declaration symlink escapes installed package");
    const snapshot = api.updateSnapshot({ openFiles: [filePath] });
    try {
      const project = snapshot.getDefaultProjectForFile(filePath);
      const file = project?.program.getSourceFile(filePath);
      if (!project || !file) throw new Error("Installed declaration cannot be resolved");
      const checker = project.checker;
      const membersOf = (type: Type) => isScalarPublicType(type) ? [] : prioritizePublicMembers(checker.getPropertiesOfType(type));
      const module = checker.getSymbolAtLocation(file);
      if (!module) throw new Error("Public declaration has no module");
      const exports = checker.getExportsOfModule(module);
      const words = (name: string) => name.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);
      const suggestions = (name: string) => {
        const requested = new Set(words(name).filter(word => !["agent", "ui"].includes(word)));
        return exports.map(item => ({ name: item.name, score: words(item.name).filter(word => requested.has(word)).length }))
          .filter(item => item.score >= Math.min(2, Math.max(1, requested.size))).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
          .slice(0, 3).map(item => item.name);
      };
      let budget = 20_000;
      const presentedRoots = new Set<string>();
      const describe = (type: Type, limit = 480) => {
        const text = checker.typeToString(type);
        return { type: text.slice(0, limit), truncated: text.length > limit || text.includes("...") };
      };
      const symbols = [...new Set(names)].map(name => {
        const [root, ...segments] = name.split(".");
        let symbol = exports.find(item => item.name === root);
        if (!symbol) return { name, status: "unavailable", reason: `Not exported by installed module ${publicModule}`,
          exportedNameSuggestions: suggestions(root ?? ""),
          nextEvidence: "Suggestions are actual exports, not equivalent APIs. Compound members appear on the resolved parent export; other modules are not searched." };
        if (symbol.flags & SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        let type = symbol.flags & (SymbolFlags.Interface | SymbolFlags.TypeAlias)
          ? checker.getDeclaredTypeOfSymbol(symbol) : checker.getTypeOfSymbol(symbol);
        if (!type || type.isErrorType()) return { name, status: "unavailable", reason: "Export type is unresolved" };
        for (const [segmentIndex, segment] of segments.entries()) {
          const availableMembers = checker.getPropertiesOfType(type).slice(0, 16).map(member => member.name);
          type = checker.getNonNullableType(type) ?? type;
          if (segment === "$return" || /^\$parameter[0-9]$/u.test(segment)) {
            const signatures = checker.getSignaturesOfType(type, SignatureKind.Call);
            if (segment !== "$return" && type.isUnionType()) {
              // React ComponentType is callable OR constructable. Resolve a
              // parameter only when every branch declares the identical type.
              const index = Number(segment.slice(10));
              const parameters: (Type | undefined)[] = type.getTypes().map(branch => {
                const candidates = [...checker.getSignaturesOfType(branch, SignatureKind.Call), ...checker.getSignaturesOfType(branch, SignatureKind.Construct)];
                const parameter = candidates.length === 1 ? candidates[0]?.getParameters()[index] : undefined;
                return parameter ? checker.getTypeOfSymbol(parameter) : undefined;
              });
              const first: Type | undefined = parameters[0];
              if (!first || !parameters.every(parameter => parameter?.id === first.id)) return { name, status: "unavailable", reason: "Union parameter types differ or are unresolved; query a concrete exported type" };
              type = first;
            } else {
              if (signatures.length !== 1 || !signatures[0]) return { name, status: "unavailable", reason: "Expected one call signature; query a concrete exported type instead" };
              if (segment === "$return") type = checker.getReturnTypeOfSignature(signatures[0]);
              else {
                const parameter = signatures[0].getParameters()[Number(segment.slice(10))];
                type = parameter ? checker.getTypeOfSymbol(parameter) : undefined;
              }
            }
          } else if (/^\$variant[0-7]$/u.test(segment)) {
            type = type.isUnionType() ? type.getTypes()[Number(segment.slice(8))] : undefined;
          } else if (segment === "$element") {
            type = checker.getIndexInfosOfType(type).find(index => (index.keyType.flags & TypeFlags.NumberLike) !== 0)?.valueType;
          } else {
            const member = checker.getPropertiesOfType(type).find(item => item.name === segment);
            type = member ? checker.getTypeOfSymbol(member) : undefined;
          }
          if (!type || type.isErrorType()) return { name, status: "unavailable", reason: segment === "$element" ? "$element requires an array or numeric index type; it does not unwrap a React component. Use a returned .$parameter0 path for component props." : `Unresolved query segment: ${segment}. Use a member/export actually returned by the contract`,
            ...(availableMembers.length ? {nextEvidence: `Members of ${[root, ...segments.slice(0, segmentIndex)].join(".")}: ${availableMembers.join(", ")}. Ordinary members have no $ prefix; $parameter0 expands invocation props.`} : {}) };
        }
        const properties = membersOf(type);
        const branches = type.isUnionType() ? type.getTypes() : [];
        const variants = branches.slice(0, 8).map((branch, index) => {
          const members = membersOf(branch);
          const query = `${name}.$variant${index}`;
          return { ...(SHARED_TYPE_QUERY.test(query) ? { query } : {}), queryAvailable: SHARED_TYPE_QUERY.test(query), ...describe(branch),
            discriminants: members.flatMap(member => {
              const memberType = checker.getTypeOfSymbol(member);
              return memberType && (memberType.flags & (TypeFlags.StringLiteral | TypeFlags.NumberLiteral | TypeFlags.BooleanLiteral)) !== 0
                ? [{ name: member.name, ...describe(memberType, 120) }] : [];
            }).slice(0, 8),
            members: members.slice(0, 16).map(member => ({ name: member.name, ...describe(checker.getTypeOfSymbol(member)!, 240) })),
            membersTruncated: members.length > 16,
          };
        });
        const signatures = checker.getSignaturesOfType(type, SignatureKind.Call);
        // Finding an export is different from inspecting its invocation props.
        // Suggest only first-parameter paths supported by the same resolver;
        // never require another query when the caller already has enough facts.
        const hasParameter = (candidate: Type) => {
          candidate = checker.getNonNullableType(candidate) ?? candidate;
          const branches = candidate.isUnionType() ? candidate.getTypes() : [candidate];
          const parameters = branches.map(branch => {
            const calls = [...checker.getSignaturesOfType(branch, SignatureKind.Call),
              ...(candidate.isUnionType() ? checker.getSignaturesOfType(branch, SignatureKind.Construct) : [])];
            const parameter = calls.length === 1 ? calls[0]?.getParameters()[0] : undefined;
            return parameter ? checker.getTypeOfSymbol(parameter) : undefined;
          });
          const first = parameters[0];
          return Boolean(first && parameters.every(parameter => parameter?.id === first.id));
        };
        const parameterQueries = [
          ...(hasParameter(type) ? [`${name}.$parameter0`] : []),
          ...properties.slice(0, 48).flatMap(member => {
            const memberType = checker.getTypeOfSymbol(member);
            return memberType && hasParameter(memberType) ? [`${name}.${member.name}.$parameter0`] : [];
          }),
        ].filter(query => SHARED_TYPE_QUERY.test(query)).slice(0, 8);
        const parameterContracts = parameterQueries.slice(0, 1).map(query => {
          const member = query.slice(name.length + 1).split(".")[0];
          const candidate = member === "$parameter0" ? type : checker.getTypeOfSymbol(properties.find(item => item.name === member)!);
          const normalized = candidate && (checker.getNonNullableType(candidate) ?? candidate);
          const branch = normalized?.isUnionType() ? normalized.getTypes()[0] : normalized;
          const call = branch && [...checker.getSignaturesOfType(branch, SignatureKind.Call), ...checker.getSignaturesOfType(branch, SignatureKind.Construct)][0];
          const parameter = call?.getParameters()[0];
          const parameterType = parameter && checker.getTypeOfSymbol(parameter);
          const props = parameterType ? membersOf(parameterType) : [];
          return { query, ...(parameterType ? describe(parameterType) : {type:"unresolved",truncated:true}),
            propNames: props.slice(0, 512).map(prop => prop.name), propNamesTruncated: props.length > 512,
            members: props.slice(0, 4).map(prop => ({name:prop.name,...describe(checker.getTypeOfSymbol(prop)!)})),
            membersTruncated: props.length > 4 };
        });
        // Presentation facts come from this exact installed package, never from
        // a tool-maintained component recipe. Bound both keys and total output.
        const presentationContract = !presentedRoots.has(root ?? "")
          ? publicComponentPresentation(catalog, publicModule, root ?? "") : undefined;
        const result = { name, status: "available", ...describe(type),
          memberNames: properties.slice(0, 512).map(member => member.name), memberNamesTruncated: properties.length > 512,
          ...(branches.length ? { union: { commonMembersOnly: true, variants, variantsTruncated: branches.length > variants.length,
            interpretation: "Top-level members are shared by all union branches. A member absent there may exist in a variant. Query the returned exact variant path to inspect its members and invocation parameters." } } : {}),
          ...(presentationContract && Object.keys(presentationContract).length ? { presentationContract } : {}),
          ...(parameterQueries.length ? { parameterQueries, parameterContracts, parameterContractsTruncated: parameterQueries.length > parameterContracts.length,
            nextEvidence: "Invocation parameters are included in parameterContracts. Truncation flags identify omitted details; parameterQueries expand exact parameter paths." } : {}),
          members: properties.slice(0, 32).map(member => {
            const memberType = checker.getTypeOfSymbol(member);
            return { name: member.name, ...(memberType ? describe(memberType, 240) : { type: "unresolved", truncated: true }) };
          }), membersTruncated: properties.length > 32,
          returns: signatures.slice(0, 4).map(signature => {
            const result = checker.getReturnTypeOfSignature(signature);
            return result ? describe(result) : { type: "unresolved", truncated: true };
          }), signaturesTruncated: signatures.length > 4 };
        const size = JSON.stringify(result).length;
        if (size > budget) return { name, status: "unavailable", reason: "Query detail budget exceeded; request fewer symbols" };
        budget -= size;
        if (presentationContract && Object.keys(presentationContract).length) presentedRoots.add(root ?? "");
        return result;
      });
      const resolved = symbols.filter(symbol => symbol.status === "available").length;
      return { status: "available", queryResolution: {
        status: resolved === symbols.length ? "complete" : resolved ? "partial" : "unresolved",
        requested: symbols.length, resolved, unresolved: symbols.length - resolved,
      }, statusMeaning: "available means the installed declaration module was inspected; queryResolution and each symbol status describe whether the requested contracts resolved.",
        packageVersion: String(pkg.version), module: publicModule, symbols,
        interpretation: "Installed public types and package-owned presentation contracts, not mutation authority. Queries: export.member; $parameter0 through $parameter9 for invocation props; $return for callable return; $element for array/index values; returned $variant0 through $variant7 paths for union branches. Types establish signatures, not runtime semantics; missing behavior facts must remain unverified. Unresolved queries and omitted details are explicit. Each presentation contract is returned once per root export in this response." };
    } finally { snapshot.dispose(); }
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 300) : "Shared declaration inspection failed" };
  } finally { api.close(); }
}
