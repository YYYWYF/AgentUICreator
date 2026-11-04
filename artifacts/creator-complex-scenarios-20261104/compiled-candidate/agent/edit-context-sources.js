import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { SyntaxKind } from "typescript/unstable/ast";
import { createScanner } from "typescript/unstable/ast/scanner";
import { logicalProjectPath, readProjectFile, resolveReadPath } from "./project-read.js";
export const sourceRead = (file, offset = 0) => ({ tool: "read_file", input: { file_path: "/" + logicalProjectPath(file), offset, limit: 120 } });
/** Literal module references only. This is navigation, never an API/behavior inference. */
export function localModuleReferences(source) {
    const scanner = createScanner(true, undefined, source), result = new Set();
    let previous = SyntaxKind.Unknown, beforePrevious = SyntaxKind.Unknown;
    for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
        if (token === SyntaxKind.StringLiteral && (previous === SyntaxKind.FromKeyword || previous === SyntaxKind.ImportKeyword ||
            (previous === SyntaxKind.OpenParenToken && beforePrevious === SyntaxKind.ImportKeyword)))
            result.add(scanner.getTokenText().slice(1, -1));
        beforePrevious = previous;
        previous = token;
    }
    return [...result];
}
function sourceAllowed(file, source) {
    return file.startsWith(source + "/") && !/(?:^|\/)(?:upstream|vendor|vendors|framework|runtime)(?:\/|$)/iu.test(file);
}
async function resolveRelative(context, from, specifier, source) {
    const name = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
    if (!sourceAllowed(name, source))
        return { status: "protected" };
    const base = name.replace(/\.(?:[cm]?js|jsx)$/u, "");
    const candidates = [...new Set([name, ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].map(extension => base + extension),
            ...["index.ts", "index.tsx", "index.js", "index.jsx"].map(entry => path.posix.join(name, entry))])];
    for (const file of candidates) {
        try {
            const location = await resolveReadPath(context, file);
            await assertLocalSource(context, source, location.target);
            if ((await stat(location.target)).isFile())
                return { status: "unread", path: location.name };
        }
        catch (error) {
            context.signal.throwIfAborted();
            const code = error.code;
            if (code === "TOOL_PERMISSION_DENIED" || error.message === "EDITING_CONTEXT_PROTECTED_SOURCE")
                return { status: "protected" };
            if (code !== "CREATOR_PROJECT_PATH_NOT_FOUND" && code !== "ENOENT" && code !== "ENOTDIR")
                throw error;
        }
    }
    return { status: "unresolved" };
}
async function assertLocalSource(context, source, target) {
    const root = await realpath(path.join(context.root, ...source.split("/")));
    const relative = path.relative(root, target);
    if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`) ||
        relative.split(path.sep).some(part => ["upstream", "vendor", "vendors", "framework", "runtime", "node_modules"].includes(part.toLowerCase()) || part.toLowerCase().startsWith(".env")))
        throw new Error("EDITING_CONTEXT_PROTECTED_SOURCE");
}
/** Return bounded fresh reads plus explicit continuation for everything omitted. */
export async function readEditingSources(context, source, seeds) {
    const queue = seeds.map(seed => ({ ...seed, status: "unread" }));
    const seen = new Set();
    const navigation = [], files = [], unavailableFiles = [];
    let remaining = 24_000;
    for (let index = 0; index < queue.length; index++) {
        const item = queue[index];
        let name;
        try {
            name = logicalProjectPath(item.path);
        }
        catch {
            navigation.push({ role: item.role, status: "protected" });
            continue;
        }
        if (seen.has(name))
            continue;
        seen.add(name);
        if (!sourceAllowed(name, source)) {
            navigation.push({ path: name, role: item.role, status: "protected" });
            continue;
        }
        if (files.length >= 8 || remaining < 1000) {
            navigation.push({ ...item, path: name, status: "unread", nextRead: sourceRead(name) });
            continue;
        }
        try {
            await assertLocalSource(context, source, (await resolveReadPath(context, name)).target);
            const file = await readProjectFile(context, { file_path: name, limit: 120 }, Math.min(6000, remaining));
            files.push(file);
            remaining -= file.content.length;
            navigation.push({ ...item, path: name, status: "read", ...(file.nextOffset === null ? {} : { nextRead: sourceRead(name, file.nextOffset) }) });
            if (!/\.(?:[cm]?[jt]sx?|json)$/iu.test(name))
                continue;
            const text = file.content.replace(/^\d+: /gmu, "");
            for (const specifier of localModuleReferences(text)) {
                if (!specifier.startsWith(".")) {
                    navigation.push({ role: "module", from: name, specifier, status: "external" });
                    continue;
                }
                const dependency = await resolveRelative(context, name, specifier, source);
                if (dependency.path)
                    queue.push({ path: dependency.path, from: name, specifier, role: "local_dependency", status: "unread" });
                else
                    navigation.push({ role: "local_dependency", from: name, specifier, status: dependency.status });
            }
        }
        catch (error) {
            context.signal.throwIfAborted();
            const code = error.code ?? error.message;
            unavailableFiles.push({ path: name, code });
            navigation.push({ path: name, role: item.role, status: "unavailable" });
        }
    }
    return { files, unavailableFiles, navigation,
        sourcesComplete: files.every(file => file.nextOffset === null) && !navigation.some(item => ["unread", "unresolved", "protected", "unavailable"].includes(item.status)) };
}
//# sourceMappingURL=edit-context-sources.js.map