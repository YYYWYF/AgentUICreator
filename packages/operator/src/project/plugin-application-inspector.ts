import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { API, SignatureKind, TypeFlags, type Type } from "typescript/unstable/sync";
import { assertNoSymbolicLinkTraversal } from "./source-registry/path-policy";
import { inspectPluginSharedTypes } from "./plugin-shared-types";
import type { PluginAsset } from "./types";

/** Read-only type navigation through this project's resolved dependencies. Never extracts source. */
export async function inspectPluginApplication(projectRoot: string, asset: Pick<PluginAsset, "pluginId" | "application">, sharedSymbols: readonly string[] = [], sharedModule?: string) {
  if (!asset.application) return undefined;
  const entry = path.resolve(projectRoot, asset.application.entryPath);
  await assertNoSymbolicLinkTraversal(projectRoot, asset.application.entryPath);
  const source = await readFile(entry, "utf8");
  const exampleSource = Array.from(source).slice(0, 4000).join("");
  const navigation = {
    ...asset.application,
    ...(sharedSymbols.length ? { sharedTypes: await inspectPluginSharedTypes(projectRoot, sharedSymbols, sharedModule) } : {}),
    entryHash: createHash("sha256").update(source).digest("hex"),
    usageGuide: {
      entryPath: asset.application.entryPath,
      implementationImport: asset.application.implementationImport,
      currentExample: { language: "tsx", source: exampleSource, truncated: exampleSource.length < source.length },
      interpretation: "Current project application usage, not an official default or proof of runtime behavior. Read the entry before editing; this excerpt does not establish Creator file-read evidence.",
      customization: "Edit this application's props, children, composition, renderers and scoped styles first. AppUIModel only owns layout, instance identity, enablement and semantic Slots; never put component props in app-ui.json.",
      preservation: "Keep existing scope bridges, Service bindings, semantic Slots, approval/interrupt renderers and localization. Implementation takeover needs its own installed-version plan and explicit consent; public application edits do not.",
    },
    editable: "Project application props, children, composition and renderers; no takeover consent required.",
    implementationBoundary: asset.application.implementationOwnership === "npm"
      ? "npm implementation is read-only until explicit takeover; application metadata is not takeover authorization."
      : "Existing source ownership permits ordinary local implementation edits; preserve vendor, Runtime, application contract and BASE.",
  };
  const api = new API();
  try {
    const catalogPath = createRequire(path.join(projectRoot, "package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    const pkg = JSON.parse(await readFile(path.join(path.dirname(catalogPath), "..", "package.json"), "utf8"));
    if (pkg.name !== "@za38.03/agent-ui-plugins" || catalog.package?.version !== pkg.version || catalog.package?.name !== pkg.name) throw new Error("Installed catalog/package identity mismatch");
    const applicationContract = catalog.plugins?.find((item: {id: string}) => item.id === asset.pluginId)?.application;
    const component = applicationContract?.component;
    if (!component) throw new Error("No declared application component");
    const snapshot = api.updateSnapshot({ openFiles: [entry] });
    try {
      const project = snapshot.getDefaultProjectForFile(entry);
      const file = project?.program.getSourceFile(entry);
      if (!project || !file || file.text !== source) throw new Error("Application source changed or cannot be resolved");
      const checker = project.checker;
      const module = checker.getSymbolAtLocation(file);
      const symbol = module && checker.getExportsOfModule(module).find(item => item.name === component);
      const type = symbol && checker.getTypeOfSymbol(symbol);
      const signature = type && checker.getSignaturesOfType(type, SignatureKind.Call)[0];
      const props = signature && checker.getParameterType(signature, 0);
      if (!props || props.isErrorType() || props.flags & (TypeFlags.Any | TypeFlags.Unknown)) throw new Error("Component props are unresolved");
      const describe = (type: Type) => {
        const value = checker.typeToString(type);
        return { type: value.slice(0, 900), typeTruncated: value.length > 900 || value.includes("...") };
      };
      const properties = checker.getPropertiesOfType(props);
      if (!properties.length) throw new Error("No component props resolved");
      const publicProps = properties.slice(0, 64).map(property => {
        const type = checker.getTypeOfSymbol(property);
        if (!type) return { name: property.name, status: "unresolved" };
        const nonNullable = checker.getNonNullableType(type) ?? type;
        const members = checker.getSignaturesOfType(nonNullable, SignatureKind.Call).length
          ? [] : checker.getPropertiesOfType(nonNullable);
        return { name: property.name, ...describe(type),
          runtimeManaged: ["renderSlot", "renderScopedSlot"].includes(property.name),
          ...(members.length > 0 && members.length <= 24 ? { members: members.map(member => {
            const type = checker.getTypeOfSymbol(member);
            return { name: member.name, ...(type ? describe(type) : { status: "unresolved" }) };
          }) } : {}),
          ...(members.length > 24 ? { memberCount: members.length, membersOmitted: true } : {}),
        };
      });
      // Preserve the complete top-level names even when nested DOM/type
      // expansions are large. Detail omission is explicit, never a capability filter.
      let remaining = 16_000;
      const boundedProps = publicProps.map(property => {
        const size = JSON.stringify(property).length;
        if (size <= remaining) { remaining -= size; return property; }
        return { name: property.name, detailsOmitted: true };
      });
      return { ...navigation, usageGuide: {
        ...navigation.usageGuide,
        package: { name: pkg.name, version: pkg.version }, component,
        customizationProps: publicProps.filter(property => !("runtimeManaged" in property && property.runtimeManaged)).map(property => property.name),
        runtimeManagedProps: publicProps.filter(property => "runtimeManaged" in property && property.runtimeManaged).map(property => property.name),
        completePropNames: properties.length <= 64,
        ...(applicationContract?.composition ? { compositionContract: applicationContract.composition } : {}),
      }, publicApi: {
        status: "available", component, ...(applicationContract?.composition ? { compositionContract: applicationContract.composition } : {}), publicModuleQueries: { defaultModule: "@za38.03/agent-ui-plugins/plugin-support", presentationModule: "@za38.03/agent-ui-plugins", note: "Use sharedModule with an installed declared public module and sharedSymbols for its exact export/member/parameter types. No implementation access or takeover authority." }, package: { name: pkg.name, version: pkg.version },
        source: "Current application component types resolved through the target project's installed declarations",
        evidenceBoundary: "Component props only. Plugin setup, registered commands and Service bindings are described by the returned definitionSource and services, not by these props. Few props do not imply missing behavior. Neither types nor enablement prove visual visibility or successful interaction.",
        completePropNames: properties.length <= 64, props: boundedProps,
        interpretation: "Props describe supported seams, not a guarantee that all requested behavior is implemented. Nested type text may be abbreviated. Prefer application props/composition; if a required seam is absent, explain the gap before proposing implementation takeover. Do not trace Host Runtime to infer missing public APIs.",
      } };
    } finally { snapshot.dispose(); }
  } catch (error) {
    return { ...navigation, publicApi: { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 300) : "Type inspection failed", interpretation: "Unavailable contract is not evidence that the requested capability is unsupported. Report the missing fact or inspect the concrete local contract; do not guess props." } };
  } finally { api.close(); }
}
