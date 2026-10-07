import ts from "typescript-ui-audit";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scopes = ["packages/creator/src/ui", "packages/react/src", "packages/runtime-react/src", "packages/runtime-conversation/src", "packages/source-registry/registry/items", "examples", "apps/creator-workbench/src"];
const excluded = /\/(?:vendor|vendors|fixtures|node_modules|dist|dev)\/|(?:\.test|\.spec)\.[cm]?[jt]sx?$|\.generated\./;
async function collect(directory) {
  const results = [];
  for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (excluded.test(file) || /^examples\/[^/]+\/src\/agent-ui(?:\/|$)/.test(file)) continue;
    if (entry.isDirectory()) results.push(...await collect(file));
    else if (/\.[jt]sx?$/.test(file)) results.push(file);
  }
  return results;
}
async function dictionary(file) {
  const source = await readFile(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const presentation = source.includes("AGENT_UI_PRESENTATION_LOCALES") ? {
    "en-US": await dictionary("packages/react/src/locales/en-US.ts"),
    "zh-CN": await dictionary("packages/react/src/locales/zh-CN.ts"),
  } : undefined;
  vm.runInNewContext(output, { exports, require: specifier => {
    if (specifier === "@agent-ui/react" && presentation) return { AGENT_UI_PRESENTATION_LOCALES: presentation };
    throw new Error(`Unsupported locale dictionary import: ${specifier}`);
  } });
  return Object.values(exports)[0];
}
function flatten(value, prefix = "") {
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const name = prefix ? `${prefix}.${key}` : key;
    return typeof child === "string" ? [[name, child]] : Object.entries(flatten(child, name));
  }));
}
const dictionaries = [
  ["creator", "packages/creator/src/ui/i18n"],
  ["presentation", "packages/react/src/locales"],
  ["generated", "packages/source-registry/registry/items/foundation-core-adapters/files/agent-ui/i18n/locales"],
];
const failures = [], parity = [], duplicates = [], unusedCandidates = [];
const files = (await Promise.all(scopes.map(collect))).flat().sort();
const sources = new Map(await Promise.all(files.map(async file => [file, await readFile(path.join(root, file), "utf8")])));
const presentationSources = [...sources.entries()].filter(([file]) => !/\/i18n\/|\/locales\/|\.locale\./.test(file));
for (const [owner, directory] of dictionaries) {
  const [english, chinese] = await Promise.all(["en-US", "zh-CN"].map(async locale => flatten(await dictionary(`${directory}/${locale}.ts`))));
  const keys = new Set([...Object.keys(english), ...Object.keys(chinese)]);
  for (const key of keys) {
    if (!english[key] || !chinese[key]) failures.push(`${owner}: missing or empty ${key}`);
    const placeholders = text => [...new Set(text?.match(/\{(?:\d+|[A-Za-z][A-Za-z0-9]*)\}/g) ?? [])].sort().join(",");
    if (placeholders(english[key]) !== placeholders(chinese[key])) failures.push(`${owner}: placeholder mismatch ${key}`);
    // Advisory only: consumers can forward whole message groups through composition props.
    const leaf = key.split(".").at(-1);
    if (!presentationSources.some(([, source]) => new RegExp(`\\b${leaf}\\b`).test(source))) unusedCandidates.push(`${owner}.${key}`);
  }
  for (const [locale, messages] of [["en-US", english], ["zh-CN", chinese]]) {
    const values = new Map();
    for (const [key, value] of Object.entries(messages)) {
      const group = `${key.split(".")[0]}:${value}`;
      if (values.has(group)) duplicates.push({ owner, locale, keys: [values.get(group), key] });
      else values.set(group, key);
    }
  }
  parity.push({ owner, locales: ["en-US", "zh-CN"], keys: keys.size });
}
const inventory = [];
for (const [file, source] of presentationSources) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isJsxText(node) || ts.isTemplateExpression(node)) {
      const value = (ts.isTemplateExpression(node) ? node.getText(ast) : node.text).trim();
      if (value && /[A-Za-z\p{Script=Han}]/u.test(value)) {
        const parent = node.parent;
        const attribute = ts.isJsxAttribute(parent) && /^(aria-label|aria-description|title|placeholder|alt|tooltip|label|activeLabel|description)$/.test(parent.name.text);
        const jsx = ts.isJsxText(node) || attribute;
        let category = "protocol / identifier";
        if (/\/mock-demo-previews\.|\/mock-agent\/|\/style-isolation-test\.|\/agent-contract\//.test(file)) category = "mock/example content";
        else if (jsx) category = value === "Slot" ? "protocol / identifier" : "user-facing UI";
        else if (/[\p{Script=Han}]|[A-Za-z]+ [A-Za-z]+/u.test(value)) category = "developer-facing text";
        const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
        inventory.push({ file, line, kind: ts.SyntaxKind[node.kind], value, category, review: jsx ? "Review presentation boundary; code samples, brands, dynamic content and protocol labels may be intentional." : undefined });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const report = { policy: "Advisory AST copy inventory; semantic review decides localization. Protocol IDs, domain data, developer diagnostics, mock transcripts and upstream vendor are excluded from translation.", scopes, parity, duplicates, unusedCandidates, inventory, failures };
const outputIndex = process.argv.indexOf("--output");
if (outputIndex >= 0) {
  const destination = path.resolve(root, process.argv[outputIndex + 1]);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
}
console.log(JSON.stringify({ parity, copyCandidates: inventory.filter(item => item.category === "user-facing UI").length, duplicateValues: duplicates.length, unusedCandidates: unusedCandidates.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
