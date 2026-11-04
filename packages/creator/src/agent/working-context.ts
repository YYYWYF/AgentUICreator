import { HumanMessage } from "@langchain/core/messages";
import type { ToolContext } from "./tools.js";

export interface SourceSnapshot { path: string; hash: string; content: string; start: number; end: number; truncated: boolean }
export interface PublicApiSnapshot { module: string; packageVersion: string; symbol: Record<string, unknown> }

/** Queries do not need the unrelated Plugin inventory/ownership envelope. */
export function projectPublicApiRead(result: any, pluginId: string) {
  const sharedTypes = result?.sharedTypes ?? result?.application?.sharedTypes ?? result?.references?.sharedTypes;
  if (!sharedTypes) return result;
  return { pluginId, sharedTypes, projection: { kind: "installed_public_api", referenceOnly: true,
    pluginDetails: { tool: "inspect_ui_plugin", input: { pluginId } },
    guidance: "API signatures only. For a large exported type, query the required export.member instead of reading all domains. This query does not select an editing target or grant source ownership." } };
}

/** Retain bounded, actually returned signatures, never guessed or missing APIs. */
export function rememberPublicApiRead(context: ToolContext, result: any) {
  const shared = result?.sharedTypes ?? result?.application?.sharedTypes ?? result?.references?.sharedTypes;
  if (shared?.status !== "available" || !shared.module || !shared.packageVersion) return;
  const cache = context.publicApiSnapshots ??= new Map();
  for (const [key, value] of cache) if (value.module === shared.module && value.packageVersion !== shared.packageVersion) cache.delete(key);
  for (const symbol of shared.symbols ?? []) {
    const key = `${shared.module}:${symbol.name}`;
    if (symbol.status !== "available") { cache.delete(key); continue; }
    const snapshot = { name: symbol.name,
      ...(typeof symbol.type === "string" && symbol.type.length <= 1000 ? { type: symbol.type, truncated: symbol.truncated } : { detailsOmitted: true }),
      ...(symbol.members?.length ? { members: symbol.members.filter((member: any) => typeof member.type === "string" && member.type.length <= 500).slice(0, 4),
        membersOmitted: Boolean(symbol.membersTruncated || symbol.members.length > 4 || symbol.members.some((member: any) => typeof member.type !== "string" || member.type.length > 500)) } : {}) };
    cache.delete(key); cache.set(key, { module: shared.module, packageVersion: shared.packageVersion, symbol: snapshot });
  }
  while (cache.size > 16) cache.delete(cache.keys().next().value!);
}

export function workingPublicApiContext(context: ToolContext, maximumTokens: number) {
  const observations: PublicApiSnapshot[] = [];
  const make = () => new HumanMessage("Host same-run installed API observations (reference data, not permission or behavior verification; re-inspect after dependency changes).\n" + JSON.stringify({ observations }));
  for (const value of [...(context.publicApiSnapshots?.values() ?? [])].reverse()) {
    observations.push(value);
    if (Math.ceil(Buffer.byteLength(JSON.stringify(make().content), "utf8") / 3) + 64 > maximumTokens) observations.pop();
    if (observations.length >= 6) break;
  }
  return observations.length ? [make()] : [];
}

/** Host decisions survive lossy history summaries; they never imply fresh source or wider permission. */
export function workingDevelopmentContext(context: ToolContext, maximumTokens: number) {
  if (!context.authorizedPlugins?.size && !context.pluginOwnerships?.size) return [];
  const confirmedNewPlugins = [...(context.authorizedPlugins ?? [])];
  const owners: any[] = [];
  const implementations: any[] = [];
  const make = () => new HumanMessage("Host current development decisions and inspected ownership. This live question state is authoritative over historical summaries.\n" + JSON.stringify({
    readOnly: context.readOnly, confirmedNewPlugins, owners, implementations,
    policy: "Project-owned Agent UI code is editable for the current task, including existing Plugin behavior and supporting files. Ask only before creating a new Plugin identity or taking over an npm implementation. A confirmed new Plugin includes its necessary implementation and composition work; file lists are implementation notes, not write allowlists. Existing owned source requires no takeover. File freshness checks still apply.",
  }));
  const fits = () => Math.ceil(Buffer.byteLength(JSON.stringify(make().content), "utf8") / 3) + 64 <= maximumTokens;
  while (confirmedNewPlugins.length && !fits()) confirmedNewPlugins.shift();
  // The plan is implementation context, not a new file allowlist or grant.
  for (const pluginId of confirmedNewPlugins) {
    const plan = context.pluginPlans?.get(pluginId);
    if (plan?.status !== "authorized") continue;
    const contract = Object.fromEntries(["capability", "renderingCategory", "placement", "lifecycle", "verificationMethod"]
      .flatMap(key => typeof plan.contract?.[key] === "string" ? [[key, plan.contract[key].slice(0, 300)]] : []));
    implementations.push({ pluginId, workKind: plan.workKind, notesOnly: true, contract,
      detailsOmitted: Object.keys(plan.contract ?? {}).length !== Object.keys(contract).length || Object.values(plan.contract ?? {}).some(value => typeof value === "string" && value.length > 300) });
    if (!fits()) implementations.pop();
  }
  const ownerships = [...(context.pluginOwnerships?.values() ?? [])].reverse();
  const selected = context.editingSelection?.target?.pluginId;
  ownerships.sort((a, b) => Number(b.pluginId === selected) - Number(a.pluginId === selected));
  for (const owner of ownerships.slice(0, 4)) {
    owners.push({ ...owner, implementationTakeoverRequired: owner.implementationOwnership === "unknown" ? null : owner.implementationOwnership === "npm" });
    if (!fits()) { owners.pop(); break; }
  }
  return fits() && (confirmedNewPlugins.length || owners.length) ? [make()] : [];
}

export function workingContext(context: ToolContext, maximumTokens: number) {
  const decisions = workingDevelopmentContext(context, Math.min(1200, maximumTokens));
  const used = decisions.reduce((sum, message) => sum + Math.ceil(Buffer.byteLength(JSON.stringify(message.content), "utf8") / 3) + 64, 0);
  const apis = workingPublicApiContext(context, Math.min(700, Math.max(0, maximumTokens - used) / 3));
  const apiUsed = apis.reduce((sum, message) => sum + Math.ceil(Buffer.byteLength(JSON.stringify(message.content), "utf8") / 3) + 64, 0);
  return [...decisions, ...apis, ...workingSourceContext(context, Math.max(0, maximumTokens - used - apiUsed))];
}

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
  const previous = cache.get(key);
  const current = { path: key, hash: result.hash, content: selected.join("\n"), start: offset + 1, end: offset + selected.length,
    truncated: result.nextOffset !== null || offset !== 0 || selected.length < result.totalLines };
  cache.delete(key);
  // A narrower reread must not discard an already observed complete component.
  cache.set(key, previous?.hash === current.hash && previous.start <= current.start && previous.end >= current.end ? previous : current);
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
  const code = (file: string) => !metadata(file) && /\.[cm]?[jt]sx?$/iu.test(file);
  const recent = [...cache.keys()].reverse();
  const entry = context.editingSelection?.target?.entryPath;
  const directory = entry?.slice(0, entry.lastIndexOf("/") + 1);
  const primary = entry && code(entry) ? entry : preferred.find(file => code(file) && directory && file.startsWith(directory))
    ?? recent.find(file => code(file) && directory && file.startsWith(directory));
  // A custom Plugin is initially located through definition.ts. Keeping only
  // that file and manifest.json evicts the component and Service just inspected.
  const candidates = [...new Set([
    ...recent.filter(file => context.activity.after?.has(file) && !metadata(file)),
    ...(primary ? [primary] : []),
    ...preferred.filter(code),
    ...preferred.filter(file => !metadata(file)), ...recent.filter(file => !metadata(file)),
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
