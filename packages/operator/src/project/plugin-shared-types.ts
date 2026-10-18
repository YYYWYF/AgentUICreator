import { API, SignatureKind, SymbolFlags, TypeFlags, type Type } from "typescript/unstable/sync";
import { createRequire } from "node:module";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

// A public export followed by at most eight member/type operators. No code or
// filesystem expressions are evaluated. Logical query paths always use dots.
export const SHARED_TYPE_QUERY = /^[A-Za-z_$][A-Za-z0-9_$]{0,99}(?:\.[A-Za-z_$][A-Za-z0-9_$]{0,99}){0,8}$/u;

export function resolveSharedDeclaration(packageRoot: string, declaration: unknown,
  paths: Pick<typeof path, "resolve" | "relative" | "isAbsolute" | "sep"> = path) {
  if (typeof declaration !== "string" || !declaration.startsWith("./") || !declaration.endsWith(".d.ts") || declaration.includes("\\") || declaration.includes("\0")) throw new Error("Public module declaration is unavailable");
  const filePath = paths.resolve(packageRoot, declaration);
  const relative = paths.relative(packageRoot, filePath);
  if (relative === ".." || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) throw new Error("Declaration escapes installed package");
  return filePath;
}

/** Bounded public declaration query, resolved from the target installation only. */
export async function inspectPluginSharedTypes(projectRoot: string, names: readonly string[], publicModule = "@za38.03/agent-ui-plugins/plugin-support") {
  if (names.length > 8 || names.some(name => !SHARED_TYPE_QUERY.test(name))) {
    throw new Error("Invalid shared symbol query");
  }
  const api = new API();
  try {
    const catalogPath = createRequire(path.join(projectRoot, "package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
    const packageRoot = path.dirname(path.dirname(catalogPath));
    const pkg = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    if (pkg.name !== "@za38.03/agent-ui-plugins" || catalog.package?.name !== pkg.name || catalog.package?.version !== pkg.version) throw new Error("Installed catalog/package identity mismatch");
    if (!/^@za38\.03\/agent-ui-plugins(?:\/[a-z][a-z0-9-]*)?$/u.test(publicModule)) throw new Error("Invalid public module");
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
          } else if (segment === "$element") {
            type = checker.getIndexInfosOfType(type).find(index => (index.keyType.flags & TypeFlags.NumberLike) !== 0)?.valueType;
          } else {
            const member = checker.getPropertiesOfType(type).find(item => item.name === segment);
            type = member ? checker.getTypeOfSymbol(member) : undefined;
          }
          if (!type || type.isErrorType()) return { name, status: "unavailable", reason: segment === "$element" ? "$element requires an array or numeric index type; it does not unwrap a React component. Use a returned .$parameter0 path for component props." : `Unresolved query segment: ${segment}. Use a member/export actually returned by the contract`,
            ...(availableMembers.length ? {nextEvidence: `Members of ${[root, ...segments.slice(0, segmentIndex)].join(".")}: ${availableMembers.join(", ")}. Ordinary members have no $ prefix; $parameter0 expands invocation props.`} : {}) };
        }
        const properties = checker.getPropertiesOfType(type);
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
          const props = parameterType ? checker.getPropertiesOfType(parameterType) : [];
          return { query, ...(parameterType ? describe(parameterType) : {type:"unresolved",truncated:true}),
            propNames: props.slice(0, 80).map(prop => prop.name), propNamesTruncated: props.length > 80,
            members: props.slice(0, 4).map(prop => ({name:prop.name,...describe(checker.getTypeOfSymbol(prop)!)})),
            membersTruncated: props.length > 4 };
        });
        const declaredPresentation = !presentedRoots.has(root ?? "") && catalog.publicComponents?.schemaVersion === 1
          ? catalog.publicComponents.modules?.[publicModule]?.[root ?? ""] : undefined;
        // Presentation facts come from this exact installed package, never from
        // a tool-maintained component recipe. Bound both keys and total output.
        const presentationContract = declaredPresentation && typeof declaredPresentation === "object"
          ? Object.fromEntries(["presentation", "composition", "portal", "interaction", "styles"].flatMap(key =>
            typeof declaredPresentation[key] === "string" ? [[key, declaredPresentation[key].slice(0, 1200)]] : [])) : undefined;
        const result = { name, status: "available", ...describe(type),
          ...(presentationContract && Object.keys(presentationContract).length ? { presentationContract } : {}),
          ...(parameterQueries.length ? { parameterQueries, parameterContracts, parameterContractsTruncated: parameterQueries.length > parameterContracts.length,
            nextEvidence: "Invocation parameters are included in parameterContracts. Truncation flags identify omitted details; parameterQueries expand exact parameter paths." } : {}),
          members: properties.slice(0, 16).map(member => {
            const memberType = checker.getTypeOfSymbol(member);
            return { name: member.name, ...(memberType ? describe(memberType, 240) : { type: "unresolved", truncated: true }) };
          }), membersTruncated: properties.length > 16,
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
        interpretation: "Installed public types and package-owned presentation contracts, not mutation authority. Queries: export.member; $parameter0 through $parameter9 for invocation props; $return for callable return; $element for array/index values. Unresolved queries and omitted details are explicit. Each presentation contract is returned once per root export in this response." };
    } finally { snapshot.dispose(); }
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 300) : "Shared declaration inspection failed" };
  } finally { api.close(); }
}
