import { HumanMessage } from "@langchain/core/messages";
/** Host decisions survive lossy history summaries; they never imply fresh source or wider permission. */
export function workingDevelopmentContext(context, maximumTokens) {
    if (!context.authorizedPlugins?.size && !context.pluginOwnerships?.size)
        return [];
    const confirmedNewPlugins = [...(context.authorizedPlugins ?? [])];
    const owners = [];
    const make = () => new HumanMessage("Host current development decisions and inspected ownership. This live question state is authoritative over historical summaries.\n" + JSON.stringify({
        readOnly: context.readOnly, confirmedNewPlugins, owners,
        policy: "Project-owned Agent UI code is editable for the current task, including existing Plugin behavior and supporting files. Ask only before creating a new Plugin identity or taking over an npm implementation. A confirmed new Plugin includes its necessary implementation and composition work; file lists are implementation notes, not write allowlists. Existing owned source requires no takeover. File freshness checks still apply.",
    }));
    const fits = () => Math.ceil(Buffer.byteLength(JSON.stringify(make().content), "utf8") / 3) + 64 <= maximumTokens;
    while (confirmedNewPlugins.length && !fits())
        confirmedNewPlugins.shift();
    const ownerships = [...(context.pluginOwnerships?.values() ?? [])].reverse();
    const selected = context.editingSelection?.target?.pluginId;
    ownerships.sort((a, b) => Number(b.pluginId === selected) - Number(a.pluginId === selected));
    for (const owner of ownerships.slice(0, 4)) {
        owners.push({ ...owner, implementationTakeoverRequired: owner.implementationOwnership === "unknown" ? null : owner.implementationOwnership === "npm" });
        if (!fits()) {
            owners.pop();
            break;
        }
    }
    return fits() && (confirmedNewPlugins.length || owners.length) ? [make()] : [];
}
export function workingContext(context, maximumTokens) {
    const decisions = workingDevelopmentContext(context, Math.min(1000, maximumTokens));
    const used = decisions.reduce((sum, message) => sum + Math.ceil(Buffer.byteLength(JSON.stringify(message.content), "utf8") / 3) + 64, 0);
    return [...decisions, ...workingSourceContext(context, Math.max(0, maximumTokens - used))];
}
/** Cache only text actually returned by a same-run read. This does not read files or grant evidence. */
export function rememberSourceRead(context, result, offset) {
    if (!result.content)
        return;
    const selected = [];
    for (const line of result.content.split("\n").slice(0, 120)) {
        if (selected.join("\n").length + line.length + 1 > 6000)
            break;
        selected.push(line);
    }
    if (!selected.length)
        return;
    const key = result.path.replace(/^\//u, ""), cache = context.sourceSnapshots ??= new Map();
    const previous = cache.get(key);
    const current = { path: key, hash: result.hash, content: selected.join("\n"), start: offset + 1, end: offset + selected.length,
        truncated: result.nextOffset !== null || offset !== 0 || selected.length < result.totalLines };
    cache.delete(key);
    // A narrower reread must not discard an already observed complete component.
    cache.set(key, previous?.hash === current.hash && previous.start <= current.start && previous.end >= current.end ? previous : current);
    const protectedFiles = new Set(context.editingSelection?.filePaths ?? []);
    for (const file of cache.keys()) {
        if (cache.size <= 12)
            break;
        if (file !== key && !protectedFiles.has(file))
            cache.delete(file);
    }
}
/** Keep the working source outside lossy summaries, within the same model-input budget. */
export function workingSourceContext(context, maxEstimatedTokens) {
    const cache = context.sourceSnapshots;
    if (!cache?.size || maxEstimatedTokens < 200)
        return [];
    const files = [];
    const preferred = context.editingSelection?.filePaths ?? [];
    const metadata = (file) => /(?:^|\/)(?:(?:manifest|application)\.json|definition\.[cm]?[jt]s)$/u.test(file);
    const code = (file) => !metadata(file) && /\.[cm]?[jt]sx?$/iu.test(file);
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
            !context.readRanges?.get(file)?.some(range => range.hash === saved.hash && range.start <= saved.start && range.end >= saved.end))
            continue;
        const entry = { ...saved, readInCurrentRun: true };
        files.push(entry);
        const lines = entry.content.split("\n");
        while (lines.length && !fits()) {
            lines.pop();
            entry.content = lines.join("\n");
            entry.end = entry.start + lines.length - 1;
            entry.truncated = true;
        }
        if (!lines.length)
            files.pop();
        if (files.length >= 4)
            break;
    }
    return files.length ? [make()] : [];
}
//# sourceMappingURL=working-context.js.map