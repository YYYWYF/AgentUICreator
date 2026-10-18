import { readFile } from "node:fs/promises";
export const deliveries = JSON.parse(await readFile(new URL("../src/catalog/plugin-delivery.json", import.meta.url), "utf8"));
export function portableSource(delivery, target, text) {
  if (target === "index.tsx") text = text.replace(/import\s+(type\s+)?\{([^}]+)\}\s+from\s+"(@za38\.03\/agent-ui-plugins(?:\/lexical)?)";/gu, (statement, typeOnly = "", bindings, importSource) => {
    if (importSource !== (delivery.implementationImport ?? "@za38.03/agent-ui-plugins")) return statement;
    const names = bindings.split(",").map(name => name.trim()).filter(Boolean);
    const owned = names.filter(name => delivery.implementationExports.includes(name.replace(/^type\s+/u, "").split(/\s+/u)[0]));
    if (!owned.length) return statement;
    const shared = names.filter(name => !owned.includes(name));
    const local = `import ${typeOnly}{ ${owned.join(", ")} } from "./adapters/${delivery.implementationModule}";`;
    return shared.length ? `import ${typeOnly}{ ${shared.join(", ")} } from "${importSource}";\n${local}` : local;
  });
  if (target.startsWith("adapters/")) text = text.replaceAll(`"../../../../${delivery.supportEntry}.js"`, `"@za38.03/agent-ui-plugins/${delivery.supportEntry}"`).replaceAll('"../../../../public.js"', '"@za38.03/agent-ui-plugins"');
  return text;
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
