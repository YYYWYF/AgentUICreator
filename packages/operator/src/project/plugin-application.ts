import { createHash } from "node:crypto";
import type { AgentUIProjectPaths } from "./agent-ui-project-paths";
import type { UIOperatorConfig } from "./types";
import { createRequire } from "node:module";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { officialPackagePlugin } from "../source-catalog/index.js";
import { resourcePaths } from "./optional-resource-paths";
import { readPluginSourceOwnership } from "./plugin-source-ownership";
import { readAgentUISourceLock, serializeAgentUISourceLock } from "./source-registry/lock";
import { commitAgentUISourceTransaction } from "./source-registry/transaction";
import { assertNoSymbolicLinkTraversal, assertSafeProjectRelativePath, AgentUISourceError } from "./source-registry/path-policy";

export const applicationMarker = "application.json";

/** Do not advertise newly packaged entries against an older installed release. */
export async function installedPackagePluginIds(root: string): Promise<Set<string> | undefined> {
  let catalogPath: string;
  try {
    catalogPath = createRequire(path.join(root, "package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "MODULE_NOT_FOUND" || (error as NodeJS.ErrnoException).code === "ERR_PACKAGE_PATH_NOT_EXPORTED") return undefined;
    throw error;
  }
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const pkg = JSON.parse(await readFile(path.join(path.dirname(catalogPath), "..", "package.json"), "utf8"));
  if (catalog.schemaVersion !== 1 || pkg.name !== "@za38.03/agent-ui-plugins" || catalog.package?.name !== pkg.name || catalog.package?.version !== pkg.version) throw new Error("PLUGIN_APPLICATION_PACKAGE_MISMATCH");
  return new Set(catalog.plugins.filter((plugin: {takeover?: {schemaVersion?: number}}) => plugin.takeover?.schemaVersion === 1).map((plugin: {id: string}) => plugin.id));
}

export async function isPluginApplication(directory: string, id: string): Promise<boolean> {
  const bytes = await readFile(path.join(directory, applicationMarker), "utf8").catch(error => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (!bytes) return false;
  const value = JSON.parse(bytes);
  if (value.schemaVersion !== 1 || value.pluginId !== id) throw new Error("PLUGIN_APPLICATION_INVALID");
  return true;
}

/** Application files are deliberately absent from source-lock and implementation BASE. */
export async function ensurePluginApplication(root: string, id: string, context?: {paths: AgentUIProjectPaths; config: UIOperatorConfig}) {
  const official = officialPackagePlugin(id);
  if (!official?.application.enabled) return { changed: false, createdPaths: [] as string[] };
  const { paths, config } = context ?? await resourcePaths(root);
  if ((await readPluginSourceOwnership(paths.metadataRoot)).plugins[id]) return { changed: false, createdPaths: [] as string[] };
  const target = `plugins/${id}`;
  await assertNoSymbolicLinkTraversal(paths.sourceRoot, target);
  const directory = path.join(paths.pluginsRoot, id);
  if (await isPluginApplication(directory, id)) return { changed: false, createdPaths: [] as string[] };
  if (await lstat(directory).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; })) {
    const { lock } = await readAgentUISourceLock(root, config);
    if (Object.keys(lock.items[`plugin/${id}`]?.files ?? {}).length || (official.application.preserveLegacySource && await lstat(path.join(directory, "manifest.json")).then(file => file.isFile(), () => false) && await lstat(path.join(directory, "definition.ts")).then(file => file.isFile(), () => false) && JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8")).id === id)) return { changed: false, createdPaths: [] as string[] };
    throw new AgentUISourceError("PLUGIN_APPLICATION_EXISTS", "Existing Plugin code must be preserved; migrate it explicitly before creating the application layer.");
  }
  const component = official.application.component;
  const alias = official.application.alias;
  const scopeKind = official.application.scopeKind;
  const registration = official.application.registration;
  const runtimeContext = official.application.runtimeContext;
  const hostBindings = official.application.hostBindings ?? [];
  const railAction = official.application.railAction;
  const conversationImport = hostBindings.some(binding => binding === "conversation-list" || binding === "conversation-selection") ? 'import { usePluginService, usePluginServiceSnapshot } from "../../runtime/plugins";\nimport { AGENT_UI_CONVERSATION_SERVICE, EMPTY_CONVERSATION_SNAPSHOT, type ConversationService } from "../../services/conversations";\n' : "";
  const hostImport = conversationImport + (hostBindings.includes("theme") ? 'import { useAgentUITheme } from "../../agent-ui/theme/useAgentUITheme";\n' : "") + (hostBindings.includes("run") ? 'import { useAgentRun } from "../../runtime/context";\n' : "");
  const hostBody = (hostBindings.some(binding => binding === "conversation-list" || binding === "conversation-selection") ? '  const conversation = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);\n  const snapshot = usePluginServiceSnapshot(conversation, EMPTY_CONVERSATION_SNAPSHOT);\n' : "") + (hostBindings.includes("theme") ? '  const theme = useAgentUITheme();\n' : "") + (hostBindings.includes("run") ? '  const run = useAgentRun();\n' : "");
  const hostProps = (hostBindings.some(binding => binding === "conversation-list" || binding === "conversation-selection") ? (hostBindings.includes("conversation-list") ? " snapshot={snapshot} serviceAvailable={conversation !== undefined} onRefresh={() => conversation?.refresh()}" : " activeConversationId={snapshot.activeConversationId}") : "") + (hostBindings.includes("theme") ? " theme={theme}" : "") + (hostBindings.includes("run") ? " runStatus={run.status}" : "");
  const railSource = railAction ? `\nexport function ${railAction}(props: ComponentProps<typeof RailImplementation>) {\n  const conversation = usePluginService<ConversationService>(AGENT_UI_CONVERSATION_SERVICE);\n  return <RailImplementation enabled={conversation !== undefined} {...props} />;\n}\n` : "";
  const registrationImport = registration?.kind === "data" ? 'import { defineDataMessageUI } from "@za38.03/agent-ui-plugins";\n' : "";
  const registrationSource = registration?.kind === "tool"
    ? `toolkit: { ${JSON.stringify(registration.name)}: { type: "backend", display: "standalone", render: ${component} } }, Component: () => null`
    : registration?.kind === "data"
      ? `dataMessageUIs: [defineDataMessageUI<unknown>({ name: ${JSON.stringify(registration.name)}, render: ${component} })], Component: () => null`
      : `Component: ${component}${railAction ? `, RailAction: ${railAction}` : ""}`;
  const runtimeImport = runtimeContext ? 'import { useAgentState, useAgentRuntimeActions } from "../../runtime/context";\n' : "";
  const runtimeBody = runtimeContext ? '  const state = useAgentState();\n  const { abortRun } = useAgentRuntimeActions();\n' : "";
  const entry = official.runtime.package + official.runtime.subpath.slice(1);
  createRequire(path.join(root, "package.json")).resolve(entry);
  const installedManifest = await readApplicationPackageManifest(root, id);
  const files = new Map([
    [applicationMarker, JSON.stringify({ schemaVersion: 1, pluginId: id }, null, 2) + "\n"],
    ["manifest.json", installedManifest],
    ["index.tsx", `import { ${component} as ${alias}${railAction ? `, ${railAction} as RailImplementation` : ""} } from "${entry}";\nimport type { ComponentProps } from "react";\n${runtimeImport}${hostImport}${scopeKind ? 'import { usePluginRenderScope } from "../../runtime/plugins";\n' : ""}\nexport function ${component}(props: ComponentProps<typeof ${alias}>) {\n${runtimeBody}${hostBody}${scopeKind ? `  const scope = usePluginRenderScope<Partial<ComponentProps<typeof ${alias}>>>();\n  if (scope?.kind !== ${JSON.stringify(scopeKind)}) return null;\n  return <${alias} {...scope.value} {...props} />;` : `  return <${alias}${runtimeContext ? " state={state} abortRun={abortRun}" : ""}${hostProps} {...props} />;`}\n}\n${railSource}`],
    ["definition.ts", `import type { UIPluginDefinition } from "../../framework/contracts/ui-plugin";\nimport implementation from "${entry}";\n${registrationImport}import { ${[component, railAction].filter(Boolean).join(", ")} } from "./index";\nconst definition: UIPluginDefinition = { manifest: implementation.manifest, provides: ${JSON.stringify(official.services.provides)}, inject: ${JSON.stringify(official.services.inject)}, optionalInject: ${JSON.stringify(official.services.optionalInject)}, ${registrationSource} };\nexport default definition;\n`],
  ]);
  const sharedEdits: {target:string;content:Buffer}[]=[];
  if (official.application.hostApplication) {
    const catalogPath = createRequire(path.join(root, "package.json")).resolve("@za38.03/agent-ui-plugins/catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    const templates = catalog.plugins.find((plugin: {id:string}) => plugin.id === id)?.application?.files;
    if (!Array.isArray(templates) || templates.length < 2 || templates.length > 16) throw new Error("PLUGIN_APPLICATION_TEMPLATE_MISSING");
    const seen = new Set<string>();
    for (const template of templates) {
      assertSafeProjectRelativePath(template.target, "Application target");
      assertSafeProjectRelativePath(template.path, "Application template");
      if (seen.has(template.target.toLowerCase()) || !template.path.startsWith(`sources/plugins/${id}/`) || [applicationMarker, "manifest.json"].includes(template.target) || template.target.split("/")[0] === "source") throw new Error("PLUGIN_APPLICATION_TEMPLATE_INVALID");
      seen.add(template.target.toLowerCase());
      await assertNoSymbolicLinkTraversal(path.dirname(catalogPath), template.path);
      const bytes = await readFile(path.join(path.dirname(catalogPath), ...template.path.split("/")));
      if (createHash("sha256").update(bytes).digest("hex") !== template.sha256) throw new Error("PLUGIN_APPLICATION_TEMPLATE_INTEGRITY");
      files.set(template.target, bytes.toString("utf8"));
    }
    if (!seen.has("index.tsx") || !seen.has("definition.ts")) throw new Error("PLUGIN_APPLICATION_TEMPLATE_MISSING");
    const sharedFiles=catalog.plugins.find((plugin:{id:string})=>plugin.id===id)?.application?.sharedFiles ?? [];
    if(!Array.isArray(sharedFiles)||sharedFiles.length>16)throw new Error("PLUGIN_APPLICATION_TEMPLATE_INVALID");
    const sharedTargets=new Set<string>();
    for(const file of sharedFiles){
      assertSafeProjectRelativePath(file.target,"Shared service target");assertSafeProjectRelativePath(file.path,"Shared service template");
      if(!file.target.startsWith("services/")||(!file.path.startsWith("sources/plugins/")&&!file.path.startsWith("sources/shared/"))||sharedTargets.has(file.target.toLowerCase()))throw new Error("PLUGIN_APPLICATION_TEMPLATE_INVALID");sharedTargets.add(file.target.toLowerCase());
      await assertNoSymbolicLinkTraversal(path.dirname(catalogPath),file.path);await assertNoSymbolicLinkTraversal(paths.sourceRoot,file.target);
      const bytes=await readFile(path.join(path.dirname(catalogPath),...file.path.split("/")));if(createHash("sha256").update(bytes).digest("hex")!==file.sha256)throw new Error("PLUGIN_APPLICATION_TEMPLATE_INTEGRITY");
      const existing=await lstat(path.join(paths.sourceRoot,...file.target.split("/"))).catch(error=>{if(error.code==="ENOENT")return undefined;throw error;});
      if(existing&&!existing.isFile())throw new Error("PLUGIN_APPLICATION_TEMPLATE_INVALID");
      if(!existing)sharedEdits.push({target:file.target,content:bytes});
    }
  }
  const { lock } = await readAgentUISourceLock(root, config);
  await commitAgentUISourceTransaction(root, config, "initialize_plugin_application", [...[...files].map(([file, content]) => ({ target: `${target}/${file}`, content: Buffer.from(content) })),...sharedEdits], serializeAgentUISourceLock(lock));
  return {
    changed: true,
    createdPaths: [
      ...[...files.keys()].map(file => path.relative(paths.projectRoot, path.join(directory, file)).split(path.sep).join("/")),
      ...sharedEdits.map(file => path.relative(paths.projectRoot, path.join(paths.sourceRoot, ...file.target.split("/"))).split(path.sep).join("/")),
    ],
  };
}

/** Rewrite only parsed static module specifiers; preserve JSX, comments and CRLF. */
export async function switchApplicationImport(file: string, from: string, to: string): Promise<Buffer> {
  const { API } = await import("typescript/unstable/sync");
  const { isImportDeclaration, isExportDeclaration, isStringLiteral } = await import("typescript/unstable/ast/is");
  const api = new API();
  const snapshot = api.updateSnapshot({ openFiles: [file] });
  try {
    const source = snapshot.getDefaultProjectForFile(file)?.program.getSourceFile(file);
    if (!source) throw new Error("PLUGIN_APPLICATION_PARSE_FAILED");
    const edits: { start: number; end: number }[] = [];
    for (const node of source.statements) {
      if (!isImportDeclaration(node) && !isExportDeclaration(node)) continue;
      const specifier = node.moduleSpecifier;
      if (specifier && isStringLiteral(specifier) && specifier.text === from) {
        // Only ASCII public module paths are rewritten; escaped paths need review.
        const start = specifier.end - 1 - from.length;
        if (source.text.slice(start, specifier.end - 1) !== from) throw new Error("PLUGIN_APPLICATION_IMPORT_UNSUPPORTED");
        edits.push({ start, end: specifier.end - 1 });
      }
    }
    if (!edits.length) throw new AgentUISourceError("PLUGIN_APPLICATION_IMPORT_MISSING", "Preserve custom code and expose a static implementation import before takeover.");
    let text = source.text;
    for (const edit of edits.reverse()) text = text.slice(0, edit.start) + to + text.slice(edit.end);
    return Buffer.from(text);
  } finally { snapshot.dispose(); api.close(); }
}

/** Runtime and inventory both follow installed package metadata in npm mode. */
export async function readApplicationPackageManifest(root: string, id: string): Promise<string> {
  const require = createRequire(path.join(root, "package.json"));
  const catalogPath = require.resolve("@za38.03/agent-ui-plugins/catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const pkg = JSON.parse(await readFile(path.join(path.dirname(catalogPath), "..", "package.json"), "utf8"));
  if (catalog.schemaVersion !== 1 || pkg.name !== "@za38.03/agent-ui-plugins" || catalog.package?.name !== pkg.name || catalog.package?.version !== pkg.version) throw new Error("PLUGIN_APPLICATION_PACKAGE_MISMATCH");
  const plugin = catalog.plugins.find((plugin: { id: string }) => plugin.id === id);
  const official = officialPackagePlugin(id);
  if (id !== "composer" && (plugin?.application?.schemaVersion !== 1 || plugin.application.component !== official?.application.component || plugin.application.scopeKind !== official?.application.scopeKind)) throw new Error("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");
  if ((plugin?.application?.registration?.kind !== official?.application.registration?.kind || plugin?.application?.registration?.name !== official?.application.registration?.name) || (plugin?.application?.runtimeContext === true) !== official?.application.runtimeContext) throw new Error("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");
  if (JSON.stringify(plugin?.application?.hostBindings ?? []) !== JSON.stringify(official?.application.hostBindings ?? []) || plugin?.application?.railAction !== official?.application.railAction) throw new Error("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");
  if ((plugin?.application?.hostApplication === true) !== official?.application.hostApplication) throw new Error("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");
  if (official?.application.hostApplication && JSON.stringify(plugin?.application?.services) !== JSON.stringify(official.services)) throw new Error("PLUGIN_APPLICATION_PACKAGE_API_UNSUPPORTED");
  const file = plugin?.takeover?.files.find((file: { target: string }) => file.target === "manifest.json");
  if (!file) throw new Error("PLUGIN_APPLICATION_PACKAGE_METADATA_MISSING");
  assertSafeProjectRelativePath(file.path, "Application package manifest");
  await assertNoSymbolicLinkTraversal(path.dirname(catalogPath), file.path);
  const bytes = await readFile(path.join(path.dirname(catalogPath), ...file.path.split("/")));
  if (createHash("sha256").update(bytes).digest("hex") !== file.sha256) throw new Error("PLUGIN_APPLICATION_PACKAGE_METADATA_INTEGRITY");
  const manifest = JSON.parse(bytes.toString("utf8"));
  if (manifest.id !== id || manifest.version !== plugin.version) throw new Error("PLUGIN_APPLICATION_PACKAGE_METADATA_MISMATCH");
  return bytes.toString("utf8");
}
