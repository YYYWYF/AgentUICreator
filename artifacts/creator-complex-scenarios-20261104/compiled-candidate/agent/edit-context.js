import path from "node:path";
import { z } from "zod";
import { enUS } from "../ui/i18n/en-US.js";
import { zhCN } from "../ui/i18n/zh-CN.js";
import { sourceRoot } from "./activity.js";
import { editingProjectIdentity, rememberProjectTargets, selectEditingTarget } from "./editing-session.js";
import { requestOperator } from "./operator.js";
import { forgetReadEvidence, logicalProjectPath } from "./project-read.js";
import { inspectProject } from "./inspection.js";
import { readEditingSources } from "./edit-context-sources.js";
import { readCreatorFileState } from "./files/creatorFileState.js";
import { editingDocumentation } from "./documentation.js";
import { namesRequestedPlugins } from "./plugin-target-names.js";
/** A unique explicitly named existing owner is navigation, never a mutation route. */
export function requestedEditingPlugin(context, directory) {
    if (context.readOnly)
        return undefined;
    const matches = directory.plugins?.filter(plugin => plugin.applicationPath && namesRequestedPlugins(context.userMessage, [plugin])) ?? [];
    if (matches.length !== 1)
        return undefined;
    // A later acceptance condition can name an unrelated Plugin (e.g. "still
    // works after switching theme"). Do not prefetch it as the requested owner.
    const firstSentence = context.userMessage.split(/[。！？.!?;\n]/u)[0] ?? "";
    return namesRequestedPlugins(firstSentence, [matches[0]]) ? matches[0].pluginId : undefined;
}
export const editContextInput = z.object({
    query: z.string().trim().min(1).max(300).optional(),
    targetId: z.string().trim().min(1).max(200).optional(),
    pluginId: z.string().trim().min(1).max(100).optional(),
    focus: z.string().trim().max(160).optional(),
    sharedSymbols: z.array(z.string().trim().min(1).max(200)).max(12).optional(),
    sharedModule: z.string().trim().max(200).optional(),
}).refine(input => Boolean(input.query || input.targetId || input.pluginId), "An exact target or search query is required");
function words(value) {
    const normalized = value.normalize("NFKC").toLowerCase();
    const segments = [...new Intl.Segmenter("zh", { granularity: "word" }).segment(normalized)]
        .filter(item => item.isWordLike).map(item => item.segment);
    const cjk = normalized.match(/[\p{Script=Han}]{2,}/gu) ?? [];
    return [...new Set([...segments, ...cjk.flatMap(text => Array.from(text).slice(1).map((_, index) => text.slice(index, index + 2)))])]
        .filter(word => word.length > 1 && !["change", "modify", "plugin", "修改", "调整", "插件", "一下", "一点", "按钮", "组件"].includes(word));
}
/** Retrieval ranks existing owners; it never maps request words to mutations. */
export function findEditingTargets(candidates, query) {
    const tokens = words(query), normalized = query.normalize("NFKC").toLowerCase().trim();
    const matches = candidates.map(candidate => {
        const labels = (candidate.relatedPluginIds ?? []).flatMap(id => [enUS.commands, zhCN.commands].flatMap(locale => {
            const copy = locale;
            return [copy[`plugin_${id}`], copy[`pluginDescription_${id}`]].filter((text) => typeof text === "string");
        }));
        const names = [candidate.id, candidate.name, ...labels].map(value => value.normalize("NFKC").toLowerCase());
        const text = [...names, candidate.description, ...(candidate.intents ?? [])].join(" ").normalize("NFKC").toLowerCase();
        const exact = names.includes(normalized);
        const score = exact ? 1000 : tokens.reduce((total, token) => total + (text.includes(token) ? (names.some(name => name.includes(token)) ? 2 : 1) : 0), 0);
        return { ...candidate, score };
    }).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const exact = matches.filter(candidate => candidate.score === 1000);
    return exact.length ? exact : matches;
}
function pluginTarget(inspection) {
    const asset = inspection.asset, entryPath = inspection.application?.entryPath ?? asset?.application?.entryPath
        ?? (asset?.ownership !== "official_package" ? asset?.definitionPath : undefined);
    if (!asset?.pluginId || !entryPath)
        return undefined;
    return { id: `plugin-source:${asset.pluginId}`, kind: "plugin_source", name: asset.name ?? asset.pluginId,
        entryPath, pluginId: asset.pluginId, ...(asset.definitionPath ? { definitionPath: asset.definitionPath } : {}),
        ...(asset.manifestPath ? { manifestPath: asset.manifestPath } : {}) };
}
/** Preserve inspected ownership, separately from grants and source freshness. */
export async function rememberPluginOwnership(context, inspection) {
    const asset = inspection.asset;
    if (!asset?.pluginId)
        return;
    const implementation = inspection.application?.implementationOwnership ?? asset.application?.implementationOwnership;
    const candidate = pluginTarget(inspection)?.entryPath;
    const entry = candidate ? logicalProjectPath(candidate) : undefined;
    const entryPath = entry?.startsWith(await sourceRoot(context.root) + "/") && !/(?:^|\/)(?:upstream|vendor|vendors|runtime|framework)(?:\/|$)/iu.test(entry) ? entry : undefined;
    const value = { pluginId: asset.pluginId, ...(entryPath ? { entryPath } : {}), assetOwnership: asset.ownership,
        implementationOwnership: implementation === "npm" ? "npm" : implementation === "project" || asset.ownership === "project_source" ? "project" : "unknown" };
    const known = context.pluginOwnerships ??= new Map();
    known.delete(value.pluginId);
    known.set(value.pluginId, value);
    if (known.size > 64)
        known.delete(known.keys().next().value);
    return { ...value, projectEntryEdits: context.readOnly ? "read-only" : value.entryPath ? "editable within current user request" : "no project entry inspected",
        implementationTakeoverRequired: value.implementationOwnership === "unknown" ? null : value.implementationOwnership === "npm" };
}
export async function rememberInspectedPlugin(context, inspection, options = {}) {
    await rememberPluginOwnership(context, inspection);
    if (options.referenceOnly)
        return;
    const target = pluginTarget(inspection);
    if (!target) {
        delete context.editingSelection;
        return;
    }
    target.entryPath = logicalProjectPath(target.entryPath);
    if (!target.entryPath.startsWith(await sourceRoot(context.root) + "/")) {
        delete context.editingSelection;
        return;
    }
    const styles = (inspection.files ?? []).filter((file) => file.kind === "file" && /\/(?:styles|style)\.css$/u.test(file.path)).slice(0, 1);
    const previousFiles = context.editingSelection?.target.entryPath === target.entryPath ? context.editingSelection.filePaths : [];
    await selectEditingTarget(context, target, [target.entryPath, ...previousFiles, ...styles.map((file) => file.path), target.definitionPath, target.manifestPath].filter((file) => Boolean(file)));
}
function references(inspection) {
    const application = inspection.application;
    if (!application)
        return { publicApi: inspection.asset?.ownership === "official_package"
                ? { status: "not_inspected", interpretation: "Official npm Plugin has no project application entry yet. Catalog metadata and documentation are references; no editable project implementation or installed component type inspection is implied." }
                : { status: "project_source", interpretation: "This Plugin is implemented by project source. Read its definition, component and local types; the absence of an official catalog component is not missing API evidence or a takeover requirement." }, sharedTypes: inspection.sharedTypes };
    const guide = application.usageGuide;
    const usageGuide = guide ? { ...guide, currentExample: undefined } : undefined;
    // The run-local archive handles large results without discarding API members.
    return { usageGuide, publicApi: application.publicApi, sharedTypes: application.sharedTypes ?? inspection.sharedTypes };
}
export async function inspectEditingContext(context, input) {
    const identity = await editingProjectIdentity(context.root);
    const source = await sourceRoot(context.root);
    let target, inspection, description = "";
    const pluginId = input.pluginId ?? (input.targetId?.startsWith("plugin-source:") ? input.targetId.slice("plugin-source:".length) : undefined);
    const inspectPlugin = (id) => requestOperator(context.root, "inspect_ui_plugin", { pluginId: id,
        ...(input.sharedSymbols ? { sharedSymbols: input.sharedSymbols } : {}), ...(input.sharedModule ? { sharedModule: input.sharedModule } : {}) }, context.signal);
    if (pluginId) {
        inspection = await inspectPlugin(pluginId);
        target = pluginTarget(inspection);
    }
    else {
        const project = await inspectProject(context, { view: "composition" });
        await rememberProjectTargets(context, project);
        const catalog = project.authoringTargetCatalog;
        const candidates = catalog?.candidates ?? [];
        const matches = input.targetId ? candidates.filter(candidate => candidate.id === input.targetId)
            : findEditingTargets(candidates, input.query ?? "");
        if (matches.length !== 1)
            return { status: matches.length ? "candidates" : "not_found", catalogRevision: catalog?.revision,
                candidates: matches.slice(0, 8), totalMatches: matches.length, candidatesTruncated: matches.length > 8,
                interpretation: "Search over current declared editing owners only, not proof that a capability is absent. Select a returned targetId, narrow the query, or use ordinary inspection/file tools. No target or operation has been selected for the user." };
        const candidate = matches[0];
        description = candidate.description;
        const binding = catalog.bindings?.find((item) => item.targetId === candidate.id);
        if (candidate.kind === "plugin_source" && binding?.pluginId) {
            inspection = await inspectPlugin(binding.pluginId);
            target = pluginTarget(inspection);
        }
        else if (candidate.kind === "application_config" && binding?.ownerPath) {
            target = { id: candidate.id, kind: candidate.kind, name: candidate.name, entryPath: binding.ownerPath };
        }
    }
    if (!target)
        return { status: "navigation_unavailable", pluginId,
            ...(inspection ? { plugin: { pluginId: inspection.asset?.pluginId, ownership: inspection.asset?.ownership, instances: inspection.instances,
                    manifest: inspection.manifest, definitionSource: inspection.definitionSource, services: inspection.services },
                references: { ...references(inspection), documentation: await editingDocumentation(pluginId, input.focus ?? input.query ?? "", context.documentationRoot) } } : {}),
            interpretation: "No editable project owner was resolved. Returned npm/catalog facts are references, not project source reads. Use the existing controlled application-preparation/integration tools when the task requires a local application. This does not authorize source takeover or imply that a capability is absent." };
    target.entryPath = logicalProjectPath(target.entryPath);
    if (!target.entryPath.startsWith(source + "/"))
        throw new Error("EDITING_CONTEXT_OWNER_OUTSIDE_SOURCE");
    const paths = [{ path: target.entryPath, role: "entry" }];
    if (target.definitionPath)
        paths.push({ path: target.definitionPath, role: "definition" });
    if (target.manifestPath)
        paths.push({ path: target.manifestPath, role: "manifest" });
    const applicationMetadata = inspection?.files?.find((file) => file.kind === "file" && /\/application\.json$/u.test(file.path));
    if (applicationMetadata)
        paths.push({ path: applicationMetadata.path, role: "application_metadata" });
    // File names come from the inspected owner, never from user-supplied filesystem paths.
    const styles = inspection?.files?.filter((file) => file.kind === "file" && /\.css$/u.test(file.path)) ?? [];
    for (const file of styles)
        paths.push({ path: file.path, role: "style" });
    const doc = description.match(/(?:\.\.?\/)?[\w./-]+\.md\b/u)?.[0];
    if (doc) {
        const docPath = path.posix.normalize(path.posix.join(path.posix.dirname(target.entryPath), doc));
        if (docPath.startsWith(source + "/"))
            paths.push({ path: docPath, role: "project_documentation" });
    }
    const { files, unavailableFiles, navigation, sourcesComplete } = await readEditingSources(context, source, paths);
    const documentation = await editingDocumentation(target.pluginId, input.focus ?? input.query ?? "", context.documentationRoot);
    const definition = files.find(file => logicalProjectPath(file.path) === target.definitionPath)?.content.replace(/^\d+: /gmu, "");
    const previousDefinition = inspection?.definitionSource?.content?.replace(/\r\n/gu, "\n");
    const definitionStale = typeof definition === "string" && typeof previousDefinition === "string" &&
        definition.slice(0, Math.min(definition.length, previousDefinition.length)) !== previousDefinition.slice(0, Math.min(definition.length, previousDefinition.length));
    const manifestFile = files.find(file => logicalProjectPath(file.path) === target.manifestPath);
    let manifestStale = false;
    if (manifestFile?.nextOffset === null && inspection?.manifest) {
        try {
            manifestStale = JSON.stringify(JSON.parse(manifestFile.content.replace(/^\d+: /gmu, ""))) !== JSON.stringify(inspection.manifest);
        }
        catch {
            manifestStale = true;
        }
    }
    const changed = await Promise.all(files.map(async (file) => (await readCreatorFileState(context.root, logicalProjectPath(file.path))).hash !== file.hash));
    if (definitionStale || manifestStale || changed.some(Boolean) || identity !== await editingProjectIdentity(context.root) || (inspection?.application?.entryHash && files[0]?.hash !== inspection.application.entryHash)) {
        forgetReadEvidence(context, files.map(file => file.path));
        delete context.editingSelection;
        throw new Error("EDITING_CONTEXT_STALE");
    }
    await selectEditingTarget(context, target, files.map(file => file.path), identity);
    const editingPolicy = inspection ? await rememberPluginOwnership(context, inspection) : undefined;
    return { status: files.some(file => file.path === "/" + target.entryPath) ? "resolved" : "partial", target, files, unavailableFiles,
        ...(editingPolicy ? { editingPolicy } : {}),
        ...(inspection ? { plugin: { pluginId: target.pluginId, instances: inspection.instances, manifest: inspection.manifest,
                definitionSource: inspection.definitionSource, implementationOwnership: inspection.application?.implementationOwnership ?? inspection.asset?.application?.implementationOwnership ?? "project",
                application: inspection.application ? { entryPath: inspection.application.entryPath, implementationImport: inspection.application.implementationImport,
                    implementationBoundary: inspection.application.implementationBoundary, editable: inspection.application.editable } : undefined,
                services: inspection.services, compositionParents: inspection.compositionParents }, references: { ...references(inspection), documentation } } : { references: { documentation } }),
        coverage: { sourcesComplete, sourceReadCount: files.length, fileNavigation: navigation,
            interpretation: "Source pages are bounded. Follow nextRead for unread/truncated files. Only literal relative imports were followed; package imports and aliases remain navigation, not an assertion of a complete dependency graph." },
        interpretation: "Returned source files are fresh read evidence in this run. Definition/manifest, services, instances and parents describe the actual Plugin, including custom project Plugins. References preserve available installed API and shared types; unknown/omitted detail is not evidence of an unsupported feature. Read relevant documentation sections on demand. This read grants no write/development/takeover authority. Application edits affect all instances using that application; use composition inspection for layout/instance changes." };
}
//# sourceMappingURL=edit-context.js.map