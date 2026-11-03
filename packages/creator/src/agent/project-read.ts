import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { creatorContentHash } from "./files/creatorFileState.js";
import type { ToolContext } from "./tools.js";
import { readDenied } from "./tool-recovery.js";
import { rememberSourceRead } from "./working-context.js";

export function logicalProjectPath(file: string) {
  if (!file || file.includes("\\") || file.includes("\0") || file.includes(":") || file.split("/").includes("..") || file.startsWith("~")) throw readDenied("virtual_project_path_required", "virtual-path-format");
  const normalized = file.replace(/^\/+/, "");
  const protectedPart = normalized.split("/").find(part => ["node_modules", ".git", "dist", "build", "coverage", ".agentuicreator"].includes(part.toLowerCase()) || part.toLowerCase().startsWith(".env"));
  if (protectedPart || /(?:^|\/)\.agent-ui\/creator(?:\/|$)/iu.test(normalized)) throw readDenied("protected_project_area", protectedPart?.toLowerCase().startsWith(".env") ? ".env" : protectedPart?.toLowerCase() ?? ".agent-ui/creator");
  return normalized;
}

export async function resolveReadPath(context: Pick<ToolContext, "root" | "skills">, file: string) {
  const name = logicalProjectPath(file);
  const base = name.startsWith("skills/") ? context.skills : context.root;
  const relative = name.startsWith("skills/") ? name.slice(7) : name;
  let target: string;
  try { target = await realpath(path.join(base, relative)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    throw Object.assign(new Error(`CREATOR_PROJECT_PATH_NOT_FOUND: /${name}`), {
      code: "CREATOR_PROJECT_PATH_NOT_FOUND", reason: "virtual_path_absent", scope: name,
      details: { path: "/" + name }, recovery: { action: "discover_virtual_path", retryable: false,
        tool: "ls", input: { path: "/" }, instruction: "Paths are rooted at the selected virtual project, not the operating-system workspace. Use a returned project path or installed public API inspection; do not invent filesystem prefixes." },
    });
  }
  const resolvedBase = await realpath(base);
  if (target !== resolvedBase && !target.startsWith(resolvedBase + path.sep)) throw readDenied("resolved_path_outside_project", "project-boundary");
  return { target, name, skill: name.startsWith("skills/") };
}

/** All Agent source reads, including prefetched reads, share the same evidence boundary. */
export async function readProjectFile(context: ToolContext, input: { file_path: string; offset?: number; limit?: number }, maxChars = Infinity) {
  context.signal.throwIfAborted();
  const offset = input.offset ?? 0, limit = input.limit ?? 2000;
  const location = await resolveReadPath(context, input.file_path);
  const read = async () => {
    const bytes = await readFile(location.target), content = bytes.toString("utf8");
    if (content.includes("\0") || !Buffer.from(content).equals(bytes)) throw new Error("CREATOR_TEXT_FILE_REQUIRED");
    if (bytes.length > 1_000_000) throw new Error("CREATOR_FILE_TOO_LARGE");
    const lines = content.split(/\r?\n/u);
    const selected = lines.slice(offset, offset + limit).map((line, index) => `${offset + index + 1}: ${line}`);
    while (selected.length && selected.join("\n").length > maxChars) selected.pop();
    if (!selected.length && offset < lines.length) throw new Error("CREATOR_FILE_READ_LIMIT");
    return { path: "/" + location.name, content: selected.join("\n"), hash: creatorContentHash(bytes), totalLines: lines.length,
      ...(offset >= lines.length ? { rangeStatus: "past_end", firstOffset: 0, lastOffset: Math.max(0, lines.length - limit) } : {}),
      nextOffset: offset + selected.length < lines.length ? offset + selected.length : null };
  };
  if (location.skill) return read();
  const result = await context.activity.observations.observeStableRead(location.name, read, () => true);
  const observation = context.activity.observations.get(location.name)!;
  const ranges = (context.readRanges ??= new Map()).get(location.name) ?? [];
  ranges.push({ hash: observation.hash, start: offset + 1, end: result.nextOffset ?? result.totalLines });
  context.readRanges.set(location.name, ranges);
  rememberSourceRead(context, result, offset);
  const recovery = context.recovery?.file(location.name, observation.hash!, offset, result.nextOffset ?? result.totalLines, context.activity.revision, context.verificationMode === "static_and_runtime");
  return { ...result, ...(recovery ? { recovery } : {}) };
}

export function forgetReadEvidence(context: ToolContext, files: readonly string[]) {
  for (const file of files) {
    context.activity.observations.forget(file);
    context.readRanges?.delete(logicalProjectPath(file));
  }
}
