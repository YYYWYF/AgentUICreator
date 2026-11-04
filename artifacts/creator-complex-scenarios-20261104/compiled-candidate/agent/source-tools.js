import path from "node:path";
import { createCreatorFileAtomically as create, replaceCreatorFileAtomically as replace, removeCreatorFile as remove, readCreatorFileState as read, creatorContentHash as hash } from "./files/creatorFileState.js";
import { sourceRoot } from "./activity.js";
export function pluginFile(pluginId, relative, source) {
    if (!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(pluginId) || !relative || /[\\:\x00]/u.test(relative) || relative.startsWith("/") || relative.split("/").some(part => ["..", "upstream", "vendor", "vendors", "node_modules", "runtime", "framework"].includes(part)))
        throw new Error("PLUGIN_SOURCE_PATH_INVALID");
    return path.posix.join(source, "plugins", pluginId, relative);
}
export function applyEdits(content, edits) {
    for (const edit of edits) {
        const old = edit.oldText, next = edit.newText;
        if (typeof old !== "string" || !old || typeof next !== "string")
            throw new Error("PLUGIN_SOURCE_EDIT_INVALID");
        const count = content.split(old).length - 1;
        if (!count || (count > 1 && edit.replaceAll !== true))
            throw new Error("EDIT_MATCH_AMBIGUOUS_OR_MISSING");
        content = edit.replaceAll ? content.replaceAll(old, next) : content.replace(old, next);
    }
    return content;
}
export async function commitBatch(context, candidates) {
    if (context.readOnly)
        throw new Error("TOOL_PERMISSION_DENIED");
    if (new Set(candidates.map(item => item.path)).size !== candidates.length)
        throw new Error("PLUGIN_FILE_DUPLICATE");
    for (const candidate of candidates) {
        const current = await read(context.root, candidate.path);
        if (current.hash !== candidate.before.hash || current.exists !== candidate.before.exists)
            throw new Error("CREATOR_FILE_STATE_CONFLICT");
        await context.activity.capture(candidate.path);
    }
    const committed = [];
    const previousAfter = new Map(candidates.map(item => [item.path, context.activity.after.get(item.path)]));
    try {
        for (const candidate of candidates) {
            context.signal.throwIfAborted();
            if (candidate.before.exists)
                await replace(context.root, candidate.path, candidate.content, candidate.before, context.signal);
            else
                await create(context.root, candidate.path, candidate.content, context.signal);
            committed.push(candidate);
            context.activity.recordAfter(candidate.path, { exists: true, hash: hash(candidate.content), content: candidate.content });
        }
    }
    catch (error) {
        for (const candidate of committed.reverse()) {
            const current = await read(context.root, candidate.path);
            if (current.content !== candidate.content)
                throw new Error(`CREATOR_ROLLBACK_CONFLICT: ${candidate.path}`);
            if (candidate.before.exists)
                await replace(context.root, candidate.path, candidate.before.content, current);
            else
                await remove(context.root, candidate.path, current);
            const previous = previousAfter.get(candidate.path);
            if (previous)
                context.activity.recordAfter(candidate.path, previous);
            else
                context.activity.after.delete(candidate.path);
        }
        throw error;
    }
    if (candidates.some(item => item.before.content !== item.content))
        context.activity.revision++;
    for (const candidate of candidates)
        await context.activity.observations.observe(candidate.path);
    return { changedPaths: candidates.map(item => item.path), revision: context.activity.revision };
}
export async function createPlugin(context, input) {
    if (!context.authorizedPlugins.has(input.pluginId))
        throw new Error("PLUGIN_DEVELOPMENT_AUTHORIZATION_REQUIRED");
    await context.validation.ensureBaseline();
    const source = await sourceRoot(context.root);
    const files = new Map();
    for (const file of input.files) {
        if (files.has(file.relativePath))
            throw new Error("PLUGIN_FILE_DUPLICATE");
        files.set(file.relativePath, file.content);
    }
    for (const required of ["manifest.json", "definition.ts", "index.tsx"])
        if (!files.has(required))
            throw new Error("PLUGIN_REQUIRED_FILE_MISSING");
    const manifest = JSON.parse(files.get("manifest.json"));
    if (manifest.id !== input.pluginId)
        throw new Error("PLUGIN_MANIFEST_ID_MISMATCH");
    const candidates = [];
    for (const [relative, content] of files) {
        const file = pluginFile(input.pluginId, relative, source);
        const before = await read(context.root, file);
        if (before.exists)
            throw new Error("PLUGIN_ALREADY_EXISTS");
        candidates.push({ path: file, before, content });
    }
    return commitBatch(context, candidates);
}
export async function mutatePlugin(context, input, authorize) {
    await context.validation.ensureBaseline();
    const source = await sourceRoot(context.root);
    const candidates = [];
    for (const change of input.changes) {
        const file = await authorize(pluginFile(input.pluginId, change.relativePath, source));
        if (change.type === "edit") {
            const before = await context.activity.observations.assertFreshForEdit(file);
            candidates.push({ path: file, before, content: applyEdits(before.content ?? "", change.edits) });
        }
        else {
            const before = await read(context.root, file);
            if (before.exists)
                throw new Error("CREATOR_FILE_ALREADY_EXISTS");
            candidates.push({ path: file, before, content: change.content });
        }
    }
    return commitBatch(context, candidates);
}
//# sourceMappingURL=source-tools.js.map