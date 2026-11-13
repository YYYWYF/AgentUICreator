import ts from "typescript-ui-audit";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pluginTakeoverStyles } from "./plugin-takeover-styles.mjs";
import { portableSource, sourceEntries } from "./plugin-source-recipes.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const layout = JSON.parse(await readFile(path.join(root, "source-layout.json"), "utf8"));
const owners = new Map(layout.files.map(file => [file.view, file.source]));
const sources = new Map();
const packageName = "@za38.03/agent-ui-plugins";

// These modules own shared state, services or conversation behavior. Extracted
// presentation must consume their existing npm instance, never copy a Provider.
const runtimePackage = "@za38.03/agent-ui-runtime";
const boundaries = new Map([
 ["src/contracts.ts", runtimePackage + "/contracts"],
 ...["assistant-response-runtime", "assistant-response", "conversation-command-decisions", "conversation-transient-messages", "quote-thread-root", "task-disclosure-context", "tool-renderer-context", "conversation-turn", "data-message-ui"].map(name => ["src/internal/" + name + (name === "assistant-response" ? ".ts" : ".tsx"), runtimePackage + "/plugin-api"]),
 ["src/conversation-transient-message-service.ts", runtimePackage + "/plugin-api"],
 ...["ApplicationLifecycleContext", "PluginInstanceContext", "PluginRenderScope", "PluginServiceContext", "usePluginServiceSnapshot", "custom-event-name"].map(name=>["src/plugin-api/" + name + (["usePluginServiceSnapshot","custom-event-name"].includes(name) ? ".ts" : ".tsx"), runtimePackage + "/plugin-api"]),
]);
// Export identity, rather than a naming heuristic, decides the canonical owner.
const runtimeNames = new Set();
const visitedRuntime = new Set();
async function collectRuntimeExports(file) {
 if (visitedRuntime.has(file)) return; visitedRuntime.add(file);
 const text = await readFile(path.join(root, "../runtime/src", ...file.split("/")), "utf8");
 const source = ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 for (const node of source.statements) {
  if (ts.isExportDeclaration(node)) {
   if (node.exportClause && ts.isNamedExports(node.exportClause)) for (const item of node.exportClause.elements) runtimeNames.add(item.name.text);
   else if (node.moduleSpecifier?.text.startsWith(".")) {
    const stem=path.posix.normalize(path.posix.join(path.posix.dirname(file),node.moduleSpecifier.text)).replace(/\.js$/u,"");
    let target; for (const ext of [".ts",".tsx"]) try {await readFile(path.join(root,"../runtime/src",stem+ext));target=stem+ext;break;} catch(error){if(error.code!=="ENOENT")throw error;}
    if(target) await collectRuntimeExports(target);
   }
  } else if (node.modifiers?.some(modifier=>modifier.kind===ts.SyntaxKind.ExportKeyword)) {
   if (node.name) runtimeNames.add(node.name.text);
   if (ts.isVariableStatement(node)) for (const item of node.declarationList.declarations) if(ts.isIdentifier(item.name))runtimeNames.add(item.name.text);
  }
 }
}
await collectRuntimeExports("plugin-api/index.ts");
const presentationModules = new Set([
  "src/internal/style-boundary/ConversationActionMoreMenu.tsx",
  "src/internal/conversation-question-flow.tsx",
  "src/internal/conversation-thread-list-item.tsx",
  "src/internal/search-elements.tsx",
  "src/internal/conversation-composer-triggers.tsx",
  "src/internal/conversation-task-group.tsx",
  "src/internal/primitives/native-select.tsx",
]);
const selectiveModules = new Set([
  "src/public.tsx", "src/plugin-support.ts", "src/composer-support.ts",
  "src/internal/composable-thread.tsx", "src/internal/conversation-quote.tsx",
  "src/lexical.tsx", "src/locale.tsx",
]);

async function source(file) {
  const owner = owners.get(file) ?? file;
  if (!sources.has(owner)) sources.set(owner, readFile(path.join(root, ...owner.split("/")), "utf8"));
  return sources.get(owner);
}
async function resolve(file, specifier) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  const stem = base.replace(/\.[cm]?js$/u, "");
  for (const candidate of [base, stem + ".ts", stem + ".tsx", stem + "/index.ts", stem + "/index.tsx"]) {
    if (owners.has(candidate)) return candidate;
    try { await source(candidate); return candidate; } catch (error) { if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error; }
  }
  throw new Error(`Unresolved takeover source: ${file}: ${specifier}`);
}
const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const print = node => ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());

/** Select actual declarations and their local helpers from mixed facade modules.
 * The compiler binder keeps property names and shadowed locals out of the closure.
 */
function selectDeclarations(file, text, names) {
  const parsed = parse(file, text);
  const host = { getSourceFile: name => name === file ? parsed : undefined, getDefaultLibFileName: () => "",
    writeFile() {}, getCurrentDirectory: () => "", getDirectories: () => [], fileExists: name => name === file,
    readFile: name => name === file ? text : undefined, getCanonicalFileName: name => name,
    useCaseSensitiveFileNames: () => true, getNewLine: () => "\n" };
  const program = ts.createProgram([file], { noResolve: true, noLib: true, jsx: ts.JsxEmit.ReactJSX }, host);
  const checker = program.getTypeChecker();
  const selected = new Set(), bindings = new Set();
  const statement = node => { while (node?.parent && node.parent !== parsed) node = node.parent; return node; };
  const visit = node => {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      for (const declaration of symbol?.declarations ?? []) {
        if (declaration.getSourceFile() !== parsed) continue;
        const top = statement(declaration);
        if (ts.isImportDeclaration(top)) bindings.add(symbol);
        else if (top && parsed.statements.includes(top) && !selected.has(top)) { selected.add(top); visit(top); }
      }
    }
    ts.forEachChild(node, visit);
  };
  const exports = checker.getExportsOfModule(checker.getSymbolAtLocation(parsed));
  for (const name of names) {
    const symbol = exports.find(entry => entry.name === name);
    if (!symbol) throw new Error(`Missing takeover export ${file}: ${name}`);
    for (const declaration of symbol.declarations ?? []) {
      const top = statement(declaration);
      if (!selected.has(top)) { selected.add(top); if (!ts.isExportDeclaration(top)) visit(top); }
    }
  }
  const result = [];
  for (const node of parsed.statements) {
    if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) result.push(node.getText(parsed));
    else if (ts.isImportDeclaration(node) && !node.importClause) result.push(node.getText(parsed));
    else if (ts.isImportDeclaration(node) && node.importClause) {
      const clause = node.importClause;
      const used = name => name && bindings.has(checker.getSymbolAtLocation(name));
      const named = clause.namedBindings;
      const retained = named && (ts.isNamedImports(named) ?
        ts.factory.updateNamedImports(named, named.elements.filter(item => used(item.name))) : used(named.name) ? named : undefined);
      const defaultName = used(clause.name) ? clause.name : undefined;
      if (defaultName || retained && (!ts.isNamedImports(retained) || retained.elements.length)) result.push(print(ts.factory.updateImportDeclaration(node, node.modifiers,
        ts.factory.updateImportClause(clause, clause.isTypeOnly, defaultName, retained), node.moduleSpecifier, node.attributes)));
    } else if (selected.has(node)) {
      if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        result.push(print(ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly,
          ts.factory.updateNamedExports(node.exportClause, node.exportClause.elements.filter(item => names.has(item.name.text))), node.moduleSpecifier, node.attributes)));
      } else result.push(node.getText(parsed));
    }
  }
  return result.join("\n") + "\n";
}

/** One independently owned presentation closure per Plugin. Logical paths stay
 * POSIX on Windows; only filesystem reads use native paths.
 */
export async function buildPluginTakeoverSources(delivery) {
  const entries = new Map(), requests = new Map(), seeds = new Map();
  const dependencies = new Set();
  // Bundled optional adapters are needed only when their source is taken over.
  const sourceOnlyDependencies = new Set(["@assistant-ui/react-lexical"]);
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  for (const [target, origin] of sourceEntries(delivery)) {
    seeds.set(origin, target);
    entries.set(target, { target, origin, content: await portableSource(delivery, target, await source(origin)) });
  }
  const targetOf = file => seeds.get(file) ?? (file.startsWith("src/internal/vendor-generated/") ? file.replace("src/internal/vendor-generated/", "upstream/") :
    file.startsWith("src/internal/adapters-generated/") ? file.replace("src/internal/adapters-generated/", "presentation/") :
    file.replace(/^src\//u, "presentation/"));
  const relative = (from, to) => {
    const result = path.posix.relative(path.posix.dirname(from), to);
    return (result.startsWith(".") ? result : "./" + result).replace(/\.tsx?$/u, "");
  };
  const recordExternal = specifier => {
    const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
    if (name === "react" || name.startsWith("@za38.03/agent-ui-")) return;
    const required = pkg.dependencies?.[name] ?? pkg.peerDependencies?.[name] ?? (sourceOnlyDependencies.has(name) ? pkg.devDependencies?.[name] : undefined);
    if (!required) throw new Error(`Undeclared takeover dependency: ${delivery.id}: ${specifier}`);
    dependencies.add(name);
  };
  const request = async (file, names) => {
    const previous = requests.get(file);
    if (previous === null || previous && names.every(name => previous.has(name))) return targetOf(file);
    if (selectiveModules.has(file)) requests.set(file, new Set([...(previous ?? []), ...names]));
    else requests.set(file, null);
    return targetOf(file);
  };
  const route = async (file, specifier, names) => {
    if (specifier === `${packageName}/contracts`) return `${runtimePackage}/contracts`;
    let resolved;
    if ([packageName, `${packageName}/plugin-support`, `${packageName}/composer-support`, `${packageName}/lexical`, `${packageName}/theme`].includes(specifier)) {
      resolved = specifier === `${packageName}/theme` ? "src/theme/theme-contract.ts" : specifier === packageName ? "src/public.tsx" : "src/" + specifier.split("/").at(-1) + (specifier.endsWith("lexical") ? ".tsx" : ".ts");
    } else if (specifier.startsWith(".")) {
      const portable = seeds.has(file) ? path.posix.normalize(path.posix.join(path.posix.dirname(targetOf(file)), specifier)).replace(/\.js$/u, "") : undefined;
      resolved = portable === undefined ? undefined : [...seeds].find(([, target]) => [portable, portable + ".ts", portable + ".tsx"].includes(target))?.[0];
      resolved ??= await resolve(file, specifier);
    }
    else { recordExternal(specifier); return specifier; }

    if (resolved === "src/internal/composer-input-host-context.tsx" && names[0] === "ComposerTextareaInput") {
      resolved = "src/plugins/composer/adapters/presentation/textarea.tsx";
    }
    if (names.length && names.every(name=>runtimeNames.has(name)) && ["src/public.tsx","src/plugin-support.ts","src/composer-support.ts","src/internal/composer-input-host-context.tsx","src/internal/conversation-composer-guard.tsx","src/internal/conversation-quote.tsx","src/internal/conversation-transient-messages.tsx","src/internal/style-boundary/AgentUIRoot.tsx"].includes(resolved)) return runtimePackage+"/plugin-api";
    if (boundaries.has(resolved)) return boundaries.get(resolved);

    if (resolved.startsWith("src/theme/") && resolved.endsWith(".css")) return { file: resolved, target: await request(resolved, []) };
    if (!seeds.has(resolved) && !selectiveModules.has(resolved) && !presentationModules.has(resolved) &&
      !/^src\/(?:internal|locales|theme|plugin-api)\//u.test(resolved) && !/^src\/(?:shared|plugins\/[^/]+)\/adapters\/presentation\//u.test(resolved)) {
      throw new Error(`Unclassified takeover boundary: ${delivery.id}: ${file}: ${resolved}: ${names.join(",")}`);
    }
    return { file: resolved, target: await request(resolved, names) };
  };
  const processed = new Map();
  for (const [origin] of seeds) requests.set(origin, null);
  while ([...requests].some(([file, names]) => processed.get(file) !== (names === null ? "*" : [...names].sort().join(",")))) {
    for (const [file, names] of requests) {
      const signature = names === null ? "*" : [...names].sort().join(",");
      if (processed.get(file) === signature) continue;
      processed.set(file, signature);
      const target = targetOf(file), origin = owners.get(file) ?? file;
      let text = seeds.has(file) ? entries.get(target).content : await source(file);
      if (names !== null) text = selectDeclarations(file, text, names);
      if (!/\.[cm]?[jt]sx?$/u.test(file)) { entries.set(target, { target, origin, content: text }); continue; }
      const parsed = parse(file, text), edits = [];
      const imports = [];
      const walk = node => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node);
        if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) imports.push(node);
        ts.forEachChild(node, walk);
      };
      walk(parsed);
      for (const node of imports) {
        const literal = ts.isImportTypeNode(node) ? node.argument.literal : node.moduleSpecifier;
        const specifier = literal.text;
        const named = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : ts.isExportDeclaration(node) ? node.exportClause : undefined;
        let qualifier = ts.isImportTypeNode(node) ? node.qualifier : undefined;
        while (qualifier && ts.isQualifiedName(qualifier)) qualifier = qualifier.left;
        const imported = named && (ts.isNamedImports(named) || ts.isNamedExports(named)) ? named.elements.map(item => (item.propertyName ?? item.name).text) : qualifier && ts.isIdentifier(qualifier) ? [qualifier.text] : [];
        // Mixed facade imports are split so Hooks/Context keep the canonical npm
        // owner while component implementations and their props become local.
        const groups = new Map();
        const items = imported.length ? imported : [null];
        for (const name of items) {
          const destination = await route(file, specifier, name ? [name] : []);
          const next = typeof destination === "string" ? destination : relative(target, destination.target) + (/\.[cm]?js$/u.test(specifier) ? path.posix.extname(specifier) : "");
          const list = groups.get(next) ?? []; list.push(name); groups.set(next, list);
        }
        if (groups.size > 1 && named && (ts.isNamedImports(named) || ts.isNamedExports(named))) {
          const statements = [];
          for (const [next, selected] of groups) {
            const elements = named.elements.filter(item => selected.includes((item.propertyName ?? item.name).text));
            const updated = ts.isImportDeclaration(node) ? ts.factory.updateImportDeclaration(node, node.modifiers,
              ts.factory.updateImportClause(node.importClause, node.importClause.isTypeOnly, undefined, ts.factory.updateNamedImports(named, elements)), ts.factory.createStringLiteral(next), node.attributes) :
              ts.factory.updateExportDeclaration(node, node.modifiers, node.isTypeOnly, ts.factory.updateNamedExports(named, elements), ts.factory.createStringLiteral(next), node.attributes);
            statements.push(print(updated));
          }
          edits.push({ start: node.getStart(parsed), end: node.end, text: statements.join("\n") });
        } else {
          const next = [...groups.keys()][0];
          if (next !== specifier) edits.push({ start: literal.getStart(parsed) + 1, end: literal.end - 1, text: next });
        }
      }
      for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
      if (file.startsWith("src/internal/vendor-generated/") && text !== await source(file)) throw new Error(`Takeover would modify upstream source: ${file}`);
      entries.set(target, { target, origin, content: text });
    }
  }
  // TypeScript 6+ checks CSS side-effect imports even in consumers without Vite
  // ambient types. Keep these declarations private to the extracted closure.
  entries.set("styles.d.ts", { target: "styles.d.ts", origin: "src/styles.css", content: 'declare module "*.css";\n' });
  if ([...entries.values()].some(file => file.origin.includes("/upstream/assistant-ui/"))) {
    for (const name of ["UPSTREAM.json", "assistant-ui-upstream.lock.json"]) {
      const origin = `src/shared/upstream/assistant-ui/${name}`;
      entries.set(`upstream/assistant-ui/${name}`, { target: `upstream/assistant-ui/${name}`, origin, content: await source(origin) });
    }
  }
  return { files: [...entries.values()].sort((a, b) => a.target.localeCompare(b.target)),
    requiredDependencies: Object.fromEntries([...dependencies].sort().map(name => [name, pkg.dependencies?.[name] ?? pkg.peerDependencies?.[name] ?? (sourceOnlyDependencies.has(name) ? pkg.devDependencies?.[name] : undefined)])) };
}

/** The package build and verifier share the complete source/CSS recipe. */
export async function buildPluginTakeoverDistribution(delivery) {
  const takeover = await buildPluginTakeoverSources(delivery);
  const styles = await pluginTakeoverStyles(root, takeover.files);
  takeover.files.push(...styles);
  const index = takeover.files.find(file => file.target === "index.tsx");
  index.content = styles.map(file => `import "./${file.target}";`).join("\n") + "\n" + index.content;
  return takeover;
}
