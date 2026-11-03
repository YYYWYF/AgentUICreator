import { HumanMessage } from "@langchain/core/messages";
import type { ToolContext } from "./tools.js";

export interface SourceSnapshot { path: string; hash: string; content: string; start: number; end: number; truncated: boolean }

/** Cache only text actually returned by a same-run read. This does not read files or grant evidence. */
export function rememberSourceRead(context: ToolContext, result: { path: string; hash: string; content: string; nextOffset: number | null; totalLines: number }, offset: number) {
  if (!result.content) return;
  const selected: string[] = [];
  for (const line of result.content.split("\n").slice(0, 120)) {
    if (selected.join("\n").length + line.length + 1 > 6000) break;
    selected.push(line);
  }
  if (!selected.length) return;
  const key = result.path.replace(/^\//u, ""), cache = context.sourceSnapshots ??= new Map();
  cache.delete(key);
  cache.set(key, { path: key, hash: result.hash, content: selected.join("\n"), start: offset + 1, end: offset + selected.length,
    truncated: result.nextOffset !== null || offset !== 0 || selected.length < result.totalLines });
  const protectedFiles = new Set(context.editingSelection?.filePaths ?? []);
  for (const file of cache.keys()) {
    if (cache.size <= 12) break;
    if (file !== key && !protectedFiles.has(file)) cache.delete(file);
  }
}

/** Keep the working source outside lossy summaries, within the same model-input budget. */
export function workingSourceContext(context: ToolContext, maxEstimatedTokens: number) {
  const cache = context.sourceSnapshots;
  if (!cache?.size || maxEstimatedTokens < 200) return [];
  const files: (SourceSnapshot & { readInCurrentRun: true })[] = [];
  const preferred = context.editingSelection?.filePaths ?? [];
  const metadata = (file: string) => /(?:^|\/)(?:(?:manifest|application)\.json|definition\.[cm]?[jt]s)$/u.test(file);
  const recent = [...cache.keys()].reverse();
  const primary = context.editingSelection?.target?.entryPath ?? preferred.find(file => !metadata(file));
  // A custom Plugin is initially located through definition.ts. Keeping only
  // that file and manifest.json evicts the component and Service just inspected.
  const candidates = [...new Set([
    ...recent.filter(file => context.activity.after?.has(file) && !metadata(file)),
    ...(primary && !metadata(primary) ? [primary] : []),
    ...recent.filter(file => !metadata(file)), ...preferred.filter(file => !metadata(file)),
    ...preferred, ...recent,
  ])];
  const make = () => new HumanMessage("Host same-run source observations (data, not authorization; original file-hash guards still apply):\n" + JSON.stringify({ files }));
  const fits = () => Math.ceil(Buffer.byteLength(JSON.stringify(make().content), "utf8") / 3) + 64 <= maxEstimatedTokens;
  for (const file of candidates) {
    const saved = cache.get(file);
    if (!saved || context.activity.observations.get(file)?.hash !== saved.hash ||
      !context.readRanges?.get(file)?.some(range => range.hash === saved.hash && range.start <= saved.start && range.end >= saved.end)) continue;
    const entry = { ...saved, readInCurrentRun: true as const }; files.push(entry);
    const lines = entry.content.split("\n");
    while (lines.length && !fits()) { lines.pop(); entry.content = lines.join("\n"); entry.end = entry.start + lines.length - 1; entry.truncated = true; }
    if (!lines.length) files.pop();
    if (files.length >= 4) break;
  }
  return files.length ? [make()] : [];
}
