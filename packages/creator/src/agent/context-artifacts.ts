import { randomUUID } from "node:crypto";
import { ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { creatorContentHash } from "./files/creatorFileState.js";

/** Keep the queried contracts visible when a file/catalog inventory is offloaded. */
function contractPreview(result: any, artifactId: string) {
  const application = result?.application;
  const references = result?.references;
  const contractRoot = application ? ["result", "application"] : ["result", "references"];
  const shared = application?.sharedTypes ?? references?.sharedTypes ?? result?.sharedTypes;
  const sections: { path: string[]; value: unknown; previewOnly: true }[] = [];
  const pick = (value: any, keys: string[]) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));
  if (shared) {
    const value = { ...pick(shared, ["status", "module", "packageVersion", "queryResolution", "reason"]),
      symbols: Array.isArray(shared.symbols) ? shared.symbols.map((symbol: any) => ({
        ...pick(symbol, ["name", "status", "type", "truncated", "reason", "parameterQueries", "exportedNameSuggestions", "presentationContract"]),
        ...(Array.isArray(symbol.members) ? { members: symbol.members.slice(0, 12), membersTruncated: Boolean(symbol.membersTruncated || symbol.members.length > 12) } : {}),
        ...(Array.isArray(symbol.memberNames) ? { memberNames: symbol.memberNames.slice(0, 64), memberNamesTruncated: Boolean(symbol.memberNamesTruncated || symbol.memberNames.length > 64) } : {}),
      })) : [] };
    sections.push({ path: application?.sharedTypes ? ["result", "application", "sharedTypes"] : references?.sharedTypes ? ["result", "references", "sharedTypes"] : ["result", "sharedTypes"], value, previewOnly: true });
  }
  const api = application?.publicApi ?? references?.publicApi;
  if (api) sections.push({ path: [...contractRoot, "publicApi"], previewOnly: true, value: {
    ...pick(api, ["status", "component", "package", "presentationContract", "compositionContract", "localizedDefaults", "changeImpact", "publicModuleQueries", "propNames", "completePropNames", "reason"]),
    ...(Array.isArray(api.props) ? { props: api.props.slice(0, 24), detailsTruncated: api.props.length > 24 } : {}),
  } });
  let remaining = 14_000;
  const criticalKeys = ["status", "module", "component", "package", "packageVersion", "queryResolution", "presentationContract", "compositionContract", "localizedDefaults", "changeImpact", "publicModuleQueries", "reason"];
  return sections.flatMap((section, index) => {
    const reserve = sections.slice(index + 1).reduce((sum, next) => sum + Buffer.byteLength(JSON.stringify({ path: next.path, value: pick(next.value, criticalKeys) }), "utf8"), 0);
    const available = Math.max(0, remaining - reserve);
    let bytes = Buffer.byteLength(JSON.stringify(section), "utf8");
    if (bytes > available) {
      const value: any = section.value;
      // Drop expanded DOM types before the small contracts that explain where
      // and how to edit. Names and full signatures remain in the exact archive.
      section = { ...section, value: { ...pick(value, ["status", "module", "component", "package", "packageVersion", "queryResolution", "presentationContract", "compositionContract", "localizedDefaults", "changeImpact", "publicModuleQueries", "propNames", "completePropNames", "reason"]), detailsOmitted: true,
        ...(Array.isArray(value.symbols) ? { symbols: value.symbols.map((symbol: any) => pick(symbol, ["name", "status", "type", "truncated", "reason", "memberNames", "parameterQueries"])) } : {}),
      } };
      bytes = Buffer.byteLength(JSON.stringify(section), "utf8");
      if (bytes > available) {
        const { propNames: _names, symbols: _symbols, ...critical } = section.value as any;
        section = { ...section, value: { ...critical, namesOmitted: true } };
        bytes = Buffer.byteLength(JSON.stringify(section), "utf8");
      }
      if (bytes > available) {
        const compact: Record<string, unknown> = { ...pick(value, ["status", "module", "component", "package", "packageVersion"]), detailsOmitted: true };
        for (const key of ["localizedDefaults", "changeImpact", "presentationContract", "publicModuleQueries", "compositionContract", "queryResolution", "reason"]) {
          if (value[key] !== undefined && Buffer.byteLength(JSON.stringify({ ...section, value: { ...compact, [key]: value[key] } }), "utf8") <= available) compact[key] = value[key];
        }
        section = { ...section, value: compact };
      }
    }
    remaining -= Buffer.byteLength(JSON.stringify(section), "utf8");
    const read = (path: string[]) => ({ tool: "read_creator_context", input: { artifactId, path, offset: 0, limit: 4000 } });
    return [{ ...section, nextRead: read(section.path),
      detailReads: ["presentationContract", "compositionContract", "localizedDefaults", "changeImpact"].filter(key => (api && section.path.at(-1) === "publicApi") && api[key] !== undefined)
        .flatMap(key => [{ field: key, nextRead: read([...section.path, key]) },
          ...(key === "presentationContract" && api[key] && typeof api[key] === "object" ? Object.keys(api[key]).slice(0, 5).map(field => ({ field: key + "." + field, nextRead: read([...section.path, key, field]) })) : [])]) }];
  });
}

function page(text: string, start: number, limit: number) {
  start = Math.min(start, text.length);
  if (start > 0 && /[\uDC00-\uDFFF]/u.test(text[start] ?? "")) start--;
  let end = Math.min(text.length, start + limit);
  if (/[\uD800-\uDBFF]/u.test(text[end - 1] ?? "") && /[\uDC00-\uDFFF]/u.test(text[end] ?? "")) end++;
  return { content: text.slice(start, end), offset: start, nextOffset: end < text.length ? end : null, totalCharacters: text.length };
}
/** Run-local immutable tool snapshots, never filesystem reads or authorization evidence. */
export class CreatorContextArtifacts {
  private readonly scope = randomUUID();
  private readonly records = new Map<string, { content: string; toolName: string }>();
  get size() { return this.records.size; }
  /** Bind submitted dialogue to this run; never reuse a previous run's handles. */
  archiveConversation(messages: BaseMessage[]) {
    const content = JSON.stringify({ ok: true, result: { messages: messages.map((message, index) => ({ index, role: message.type, content: message.content })) } });
    const artifactId = "ctx-" + creatorContentHash(this.scope + "\0conversation\0" + content);
    this.records.set(artifactId, { content, toolName: "conversation-history" });
    return { artifactId, messageCount: messages.length,
      nextRead: { tool: "read_creator_context", input: { artifactId, path: ["result", "messages"], offset: 0, limit: 2400 } } };
  }
  archive(message: BaseMessage, toolName: string) {
    if (!ToolMessage.isInstance(message) || !/^(?:inspect_|list_|read_file$)/u.test(toolName)
      || /transaction|baseline|delivery|diagnostic|runtime_/u.test(toolName)) return undefined;
    let content: string;
    if (typeof message.content === "string") content = message.content;
    else if (Array.isArray(message.content) && message.content.every(part => typeof part === "string" || (part.type === "text" && typeof part.text === "string"))) content = message.content.map(part => typeof part === "string" ? part : part.text).join("");
    else return undefined;
    if (Buffer.byteLength(content, "utf8") < 24_000) return undefined;
    let value: any; try { value = JSON.parse(content); } catch { return undefined; }
    if (value?.ok !== true || ["error", "failed", "unavailable", "blocked"].includes(value.result?.status)) return undefined;
    const id = "ctx-" + creatorContentHash(this.scope + "\0" + content);
    const created = !this.records.has(id);
    const result = value.result;
    const contracts = ["inspect_ui_plugin", "inspect_ui_edit_context"].includes(toolName) ? contractPreview(result, id) : [];
    const fields = result && typeof result === "object" ? Object.keys(result).slice(0, 40).map(key => ({ path: ["result", key], kind: Array.isArray(result[key]) ? "array" : typeof result[key], ...(typeof result[key] === "string" && result[key].length < 300 ? { value: result[key] } : {}) })) : [];
    const projected = new ToolMessage({ ...(message.id ? { id: message.id } : {}), ...(message.name ? { name: message.name } : {}), tool_call_id: message.tool_call_id, content: JSON.stringify({ ok: true, archived: true, artifactId: id, originalTool: toolName,
      originalToolCallId: message.tool_call_id, originalCharacters: content.length, fields, preview: page(content, 0, 1800).content,
      ...(contracts.length ? { contracts } : {}),
      ...(toolName === "inspect_ui_edit_context" ? { editingNavigation: {
        previewOnly: true, target: value.result.target,
        plugin: { pluginId: value.result.plugin?.pluginId, implementationOwnership: value.result.plugin?.implementationOwnership,
          services: value.result.plugin?.services, slots: value.result.plugin?.manifest?.slots },
        sources: value.result.files?.map((file: any) => ({ path: file.path, hash: file.hash, nextOffset: file.nextOffset })),
        documentation: value.result.references?.documentation,
        relatedOwners: value.result.relatedOwners,
        nextRead: { tool: "read_creator_context", input: { artifactId: id, path: ["result", "coverage"], offset: 0, limit: 2400 } },
      } } : {}),
      guidance: "Exact snapshot of the successful tool output. Use read_creator_context with artifactId, JSON path and a bounded page for details. Archive reads do not refresh filesystem observations or grant permission; Host freshness checks still apply.",
      nextRead: { tool: "read_creator_context", input: { artifactId: id, path: ["result"], offset: 0, limit: 2400 } } }) });
    if (Buffer.byteLength(JSON.stringify(projected.content), "utf8") >= Buffer.byteLength(JSON.stringify(message.content), "utf8")) return undefined;
    if (created) this.records.set(id, { content, toolName });
    return { message: projected, artifactId: id, created, originalCharacters: content.length };
  }
  read(artifactId: string, path: (string | number)[] = [], offset = 0, limit = 2400) {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 8000 || path.length > 16) throw new Error("CREATOR_CONTEXT_ARTIFACT_RANGE_INVALID");
    if (artifactId === "list") {
      if (path.length) throw new Error("CREATOR_CONTEXT_ARTIFACT_PATH_NOT_FOUND");
      const index = [...this.records].map(([id, record]) => {
        const original = JSON.parse(record.content);
        const sourcePath = original.result?.path;
        return { artifactId: id, originalTool: record.toolName, ...(typeof sourcePath === "string" ? { sourcePath } : {}) };
      });
      return { artifactId, historical: true, grantsFreshness: false, originalTool: "archive-index", path, kind: "artifact-index", keys: [], keyCount: 0, count: index.length, ...page(JSON.stringify(index), offset, limit) };
    }
    const record = this.records.get(artifactId);
    if (!record) throw new Error("CREATOR_CONTEXT_ARTIFACT_NOT_FOUND");
    let value: any = JSON.parse(record.content);
    const resolved: (string | number)[] = [];
    for (const key of path) {
      if (!value || typeof value !== "object" || !Object.hasOwn(value, key)) {
        const keys = value && typeof value === "object" ? Object.keys(value).slice(0, 40) : [];
        throw new Error("CREATOR_CONTEXT_ARTIFACT_PATH_NOT_FOUND: " + JSON.stringify({ resolvedPath: resolved, availableKeys: keys,
          nextRead: { tool: "read_creator_context", input: { artifactId, path: resolved, offset: 0, limit: 2400 } } }));
      }
      value = value[key];
      resolved.push(key);
    }
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    const keys = value && typeof value === "object" ? Object.keys(value) : [];
    return { artifactId, historical: true, grantsFreshness: false, originalTool: record.toolName, path, kind: Array.isArray(value) ? "array" : typeof value,
      keys: keys.slice(0, 80), keyCount: keys.length, ...page(text, offset, limit) };
  }
}
