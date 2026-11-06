import { readFile } from "node:fs/promises";
import { formatProjectCode } from "../../creator/operator/src/project/generated-code-format.mjs";
export const deliveries = JSON.parse(await readFile(new URL("../src/catalog/plugin-delivery.json", import.meta.url), "utf8"));
export function packageDefinitionSource(source) {
  return source.replace(/import \{ AGENT_UI_LOCALE_SERVICE \} from (["'])@za38\.03\/agent-ui-runtime\/ui\/services\/agent-ui-locale\1;/u, 'const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale";');
}
export async function portableSource(delivery, target, text) {
  // Generated applications consume the public contract package and do not own
  // a copied framework directory. Keep extracted source independent of the
  // temporary package-build compatibility views as well.
  text = text.replace(/(["'])\.\.\/\.\.\/framework\/contracts\/ui-plugin\1/gu, '$1@za38.03/agent-ui-plugins/contracts$1');
  if (target === "index.tsx") text = text.replace(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+(["'])(@za38\.03\/agent-ui-plugins(?:\/lexical)?)\3;/gu, (statement, typeOnly = "", bindings, quote, importSource) => {
    if (importSource !== (delivery.implementationImport ?? "@za38.03/agent-ui-plugins")) return statement;
    const names = bindings.split(",").map(name => name.trim()).filter(Boolean);
    const owned = names.filter(name => delivery.implementationExports.includes(name.replace(/^type\s+/u, "").split(/\s+/u)[0]));
    if (!owned.length) return statement;
    const shared = names.filter(name => !owned.includes(name));
    const local = `import ${typeOnly}{ ${owned.join(", ")} } from ${quote}./adapters/${delivery.implementationModule}${quote};`;
    return shared.length ? `import ${typeOnly}{ ${shared.join(", ")} } from ${quote}${importSource}${quote};\n${local}` : local;
  });
  if (target.startsWith("adapters/")) text = text.replace(/(["'])\.\.\/\.\.\/\.\.\/\.\.\/(public|plugin-support|composer-support)\.js\1/gu, (statement, quote, entry) => entry === "public" ? `${quote}@za38.03/agent-ui-plugins${quote}` : entry === delivery.supportEntry ? `${quote}@za38.03/agent-ui-plugins/${entry}${quote}` : statement);
  return /\.tsx?$/u.test(target) ? formatProjectCode(text) : text;
}
export function sourceEntries(delivery) {
  return [
    ["definition.ts", `src/plugins/${delivery.id}/${delivery.definitionSource ?? "adapters/project/definition.ts"}`],
    ["manifest.json", `src/plugins/${delivery.id}/plugin.json`],
    ["index.tsx", `src/plugins/${delivery.id}/${delivery.componentSource ?? "adapters/project/index.tsx"}`],
    ...delivery.presentation.map(name => [`adapters/${name}`, `src/plugins/${delivery.presentationOwner}/adapters/presentation/${name}`]),
    ...(delivery.projectFiles ?? []).map(name => [name, `src/plugins/${delivery.id}/adapters/project/${name}`]),
    ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
  ];
}
