import path from "node:path";
import { realpath, stat } from "node:fs/promises";
import { SyntaxKind } from "typescript/unstable/ast";
import { createScanner } from "typescript/unstable/ast/scanner";
import { logicalProjectPath, readProjectFile, resolveReadPath } from "./project-read.js";
import type { ToolContext } from "./tools.js";

export interface SourceNavigation {
  path?: string; role: string; from?: string; specifier?: string;
  status: "read" | "unread" | "external" | "unresolved" | "protected" | "unavailable";
  nextRead?: { tool: string; input: { file_path: string; offset: number; limit: number } };
}
export const sourceRead = (file: string, offset = 0) => ({ tool: "read_file", input: { file_path: "/" + logicalProjectPath(file), offset, limit: 120 } });

/** Literal module references only. This is navigation, never an API/behavior inference. */
export function localModuleReferences(source: string) {
  const scanner = createScanner(true, undefined, source), result = new Set<string>();
  let previous = SyntaxKind.Unknown, beforePrevious = SyntaxKind.Unknown;
  for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
    if (token === SyntaxKind.StringLiteral && (previous === SyntaxKind.FromKeyword || previous === SyntaxKind.ImportKeyword ||
      (previous === SyntaxKind.OpenParenToken && beforePrevious === SyntaxKind.ImportKeyword))) result.add(scanner.getTokenText().slice(1, -1));
    beforePrevious = previous; previous = token;
  }
  return [...result];
}

function sourceAllowed(file: string, source: string) {
  return file.startsWith(source + "/") && !/(?:^|\/)(?:upstream|vendor|vendors|framework|runtime)(?:\/|$)/iu.test(file);
}

async function resolveRelative(context: ToolContext, from: string, specifier: string, source: string) {
  const name = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  if (!sourceAllowed(name, source)) return { status: "protected" as const };
  const base = name.replace(/\.(?:[cm]?js|jsx)$/u, "");
  const candidates = [...new Set([name, ...[".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"].map(extension => base + extension),
    ...["index.ts", "index.tsx", "index.js", "index.jsx"].map(entry => path.posix.join(name, entry))])];
  for (const file of candidates) {
    try {
      const location = await resolveReadPath(context, file);
      await assertLocalSource(context, source, location.target);
      if ((await stat(location.target)).isFile()) return { status: "unread" as const, path: location.name };
    } catch (error) {
      context.signal.throwIfAborted();
      const code = (error as { code?: string }).code;
      if (code === "TOOL_PERMISSION_DENIED" || (error as Error).message === "EDITING_CONTEXT_PROTECTED_SOURCE") return { status: "protected" as const };
      if (code !== "CREATOR_PROJECT_PATH_NOT_FOUND" && code !== "ENOENT" && code !== "ENOTDIR") throw error;
    }
  }
  return { status: "unresolved" as const };
}

async function assertLocalSource(context: ToolContext, source: string, target: string) {
  const root = await realpath(path.join(context.root, ...source.split("/")));
  const relative = path.relative(root, target);
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`) ||
    relative.split(path.sep).some(part => ["upstream", "vendor", "vendors", "framework", "runtime", "node_modules"].includes(part.toLowerCase()) || part.toLowerCase().startsWith(".env"))) throw new Error("EDITING_CONTEXT_PROTECTED_SOURCE");
}

/** Return bounded fresh reads plus explicit continuation for everything omitted. */
export async function readEditingSources(context: ToolContext, source: string, seeds: { path: string; role: string }[]) {
  const queue: (SourceNavigation & { path: string })[] = seeds.map(seed => ({ ...seed, status: "unread" }));
  const seen = new Set<string>();
  const navigation: SourceNavigation[] = [], files: Awaited<ReturnType<typeof readProjectFile>>[] = [], unavailableFiles = [];
  let remaining = 24_000;
  for (let index = 0; index < queue.length; index++) {
    const item = queue[index]!;
    let name: string;
    try { name = logicalProjectPath(item.path); }
    catch { navigation.push({ role: item.role, status: "protected" }); continue; }
    if (seen.has(name)) continue;
    seen.add(name);
    if (!sourceAllowed(name, source)) { navigation.push({ path: name, role: item.role, status: "protected" }); continue; }
    if (files.length >= 8 || remaining < 1000) {
      navigation.push({ ...item, path: name, status: "unread", nextRead: sourceRead(name) }); continue;
    }
    try {
      await assertLocalSource(context, source, (await resolveReadPath(context, name)).target);
      const file = await readProjectFile(context, { file_path: name, limit: 120 }, Math.min(6000, remaining));
      files.push(file); remaining -= file.content.length;
      navigation.push({ ...item, path: name, status: "read", ...(file.nextOffset === null ? {} : { nextRead: sourceRead(name, file.nextOffset) }) });
      if (!/\.(?:[cm]?[jt]sx?|json)$/iu.test(name)) continue;
      const text = file.content.replace(/^\d+: /gmu, "");
      for (const specifier of localModuleReferences(text)) {
        if (!specifier.startsWith(".")) { navigation.push({ role: "module", from: name, specifier, status: "external" }); continue; }
        const dependency = await resolveRelative(context, name, specifier, source);
        if (dependency.path) queue.push({ path: dependency.path, from: name, specifier, role: "local_dependency", status: "unread" });
        else navigation.push({ role: "local_dependency", from: name, specifier, status: dependency.status });
      }
    } catch (error) {
      context.signal.throwIfAborted();
      const code = (error as NodeJS.ErrnoException).code ?? (error as Error).message;
      unavailableFiles.push({ path: name, code });
      navigation.push({ path: name, role: item.role, status: "unavailable" });
    }
  }
  return { files, unavailableFiles, navigation,
    sourcesComplete: files.every(file => file.nextOffset === null) && !navigation.some(item => ["unread", "unresolved", "protected", "unavailable"].includes(item.status)) };
}
