import { readFile, readdir, mkdir, writeFile, rm, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-ui-audit";
import { randomUUID } from "node:crypto";
import { readSourceLayout, sourcePath } from "../packages/plugins/scripts/materialize-plugin-sources.mjs";
import { deliveries, sourceEntries } from "../packages/plugins/scripts/plugin-source-recipes.mjs";

export const typescriptAuthoringReadyEnv = "AGENTUICREATOR_TYPESCRIPT_AUTHORING_READY";

const workspace = fileURLToPath(new URL("..", import.meta.url));
const root = path.join(workspace, "packages/plugins");
const output = path.join(root, ".typecheck");
const logical = value => value.split(path.sep).join("/");
async function files(directory) {
  const result = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(name));
    else if (entry.isFile()) result.push(name);
  }
  return result;
}

/** ESM module specifiers are logical paths, including on Windows. */
export function relativeModuleSpecifier(fromFile, toFile, pathApi = path) {
  let result = pathApi.relative(pathApi.dirname(fromFile), toFile).split(pathApi.sep).join("/").replace(/\.tsx?$/u, ".js");
  return result.startsWith(".") ? result : `./${result}`;
}

export async function prepareTypeScriptAuthoring() {
  const layout = await readSourceLayout(root);
  const generatedViews = new Set(layout.files.map(entry => entry.view));
  const modules = new Map();
  const owners = new Map();
  for (const entry of layout.files) {
    const marker = entry.view.indexOf("/files/");
    const view = marker < 0 ? `package/${entry.view}` : `project/${entry.view.slice(marker + 7)}`;
    modules.set(view, entry.source);
    owners.set(entry.source, view);
  }
  for (const file of await files(path.join(root, "src"))) {
    const relative = logical(path.relative(root, file));
    if (!modules.has(`package/${relative}`)) modules.set(`package/${relative}`, relative);
  }
  for (const file of await files(path.join(root, "resources/registry/items"))) {
    const relative = logical(path.relative(root, file));
    const marker = relative.indexOf("/files/");
    if (marker >= 0 && !generatedViews.has(relative)) {
      const view = `project/${relative.slice(marker + 7)}`;
      if (!modules.has(view)) modules.set(view, relative);
      if (!owners.has(relative)) owners.set(relative, view);
    }
  }
  const contexts = new Map();
  for (const delivery of deliveries) {
    const entries = sourceEntries(delivery).filter(([target]) => target !== "THIRD_PARTY_NOTICES.md");
    for (const [target, source] of entries) {
      const view = `project/plugins/${delivery.id}/${target}`;
      if (!modules.has(view)) modules.set(view, source);
      if (!owners.has(source)) owners.set(source, view);
    }
    for (const [target, source] of delivery.applicationSharedFiles ?? []) {
      const view = `project/${target}`;
      if (!modules.has(view)) modules.set(view, source);
      if (!owners.has(source)) owners.set(source, view);
    }
    const applications = [...(delivery.applicationFiles ?? []), ...Object.values(delivery.applicationModeFiles ?? {}).flat()];
    for (const [target, origin] of applications) {
      const source = `src/plugins/${delivery.id}/${origin}`;
      const view = `project/plugins/${delivery.id}/${target}`;
      if (!modules.has(view)) modules.set(view, source);
      if (!owners.has(source)) owners.set(source, view);
    }
    const context = new Map([
      ...applications.map(([target, origin]) => [`project/plugins/${delivery.id}/${target}`, `src/plugins/${delivery.id}/${origin}`]),
      ...entries.map(([target, source]) => [`project/plugins/${delivery.id}/${target}`, source]),
    ]);
    for (const source of owners.keys()) {
      if (source.startsWith(`src/plugins/${delivery.id}/adapters/`) && !source.includes("/adapters/project/")) contexts.set(source, context);
    }
  }
  function resolve(name, context) {
    const base = name.replace(/\.[cm]?jsx?$/u, "");
    return [name, `${base}.ts`, `${base}.tsx`, `${base}.d.ts`, `${base}.mts`, `${base}.mjs`, `${name}/index.ts`, `${name}/index.tsx`, `${name}/index.d.ts`].map(candidate => context?.get(candidate) ?? modules.get(candidate)).find(Boolean);
  }
  const bridges = new Map();
  for (const entry of layout.files) {
    if (!/\.(?:[cm]?[jt]sx?|json)$/u.test(entry.source)) continue;
    const json = entry.source.endsWith(".json");
    const bridge = json ? entry.view : entry.view.replace(/\.[cm]?[jt]sx?$/u, "") + ".ts";
    if (bridge === entry.source) continue;
    const text = json ? "" : await readFile(path.join(root, ...entry.source.split("/")), "utf8");
    const hasDefault = /\bexport\s+default\b/u.test(text);
    bridges.set(bridge, { target: entry.source, json, hasDefault });
  }
  const augmentations = [];
  const moduleSpecifier = (file, target) => relativeModuleSpecifier(file, path.join(root, ...target.split("/")));
  const augmentationFile = path.join(output, "service-map.ts");
  const augmentationImports = [];

  // Legacy tests address a merged generated-project root. Keep that same
  // logical root available to TypeScript even when runtime views are cleaned.
  for (const [view, target] of modules) {
    if (!view.startsWith("project/") || !/\.(?:[cm]?[jt]sx?|json)$/u.test(target)) continue;
    const json = target.endsWith(".json");
    const bridge = json ? view : view.replace(/\.[cm]?[jt]sx?$/u, "") + ".ts";
    const text = json ? "" : await readFile(path.join(root, ...target.split("/")), "utf8");
    bridges.set(bridge, { target, json, hasDefault: /\bexport\s+default\b/u.test(text) });
  }
  for (const [source, view] of owners) {
    if (!/\.[cm]?[jt]sx?$/u.test(source)) continue;
    const code = await readFile(path.join(root, ...source.split("/")), "utf8");
    const ast = ts.createSourceFile(source, code, ts.ScriptTarget.Latest, true);
    for (const statement of ast.statements) {
      if (!ts.isModuleDeclaration(statement) || !ts.isStringLiteral(statement.name) || !statement.body || !ts.isModuleBlock(statement.body)) continue;
      const contract = resolve(path.posix.normalize(path.posix.join(path.posix.dirname(view), statement.name.text)), contexts.get(source));
      if (!contract) continue;
      const alias = `Service${augmentations.length}`;
      const names = new Map();
      augmentationImports.push(`import * as ${alias} from ${JSON.stringify(moduleSpecifier(augmentationFile, source))};`);
      for (const declaration of ast.statements) {
        if (ts.isImportDeclaration(declaration) && ts.isStringLiteral(declaration.moduleSpecifier) && declaration.importClause?.namedBindings && ts.isNamedImports(declaration.importClause.namedBindings)) {
          const spec = declaration.moduleSpecifier.text;
          const target = spec.startsWith(".") ? resolve(path.posix.normalize(path.posix.join(path.posix.dirname(view), spec)), contexts.get(source)) : undefined;
          const importedAlias = `Import${augmentationImports.length}`;
          augmentationImports.push(`import * as ${importedAlias} from ${JSON.stringify(target ? moduleSpecifier(augmentationFile, target) : spec)};`);
          for (const binding of declaration.importClause.namedBindings.elements) names.set(binding.name.text, `${importedAlias}.${binding.propertyName?.text ?? binding.name.text}`);
        }
        if (declaration.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
          if (declaration.name && ts.isIdentifier(declaration.name)) names.set(declaration.name.text, `${alias}.${declaration.name.text}`);
          if (ts.isVariableStatement(declaration)) for (const value of declaration.declarationList.declarations) if (ts.isIdentifier(value.name)) names.set(value.name.text, `${alias}.${value.name.text}`);
        }
      }
      for (const member of statement.body.statements) {
        if (!ts.isInterfaceDeclaration(member)) throw new Error(`Unsupported authoring augmentation in ${source}`);
        const properties = member.members.map(property => property.getText(ast).replace(/\b[A-Za-z_$][\w$]*\b/gu, name => names.get(name) ?? name)).join("\n");
        augmentations.push(`declare module ${JSON.stringify(moduleSpecifier(augmentationFile, contract))} { interface ${member.name.text} { ${properties} } }`);
      }
    }
    for (const imported of [...ts.preProcessFile(code, true, true).importedFiles, ...ast.statements.filter(statement => ts.isModuleDeclaration(statement) && ts.isStringLiteral(statement.name)).map(statement => ({ fileName: statement.name.text }))]) {
      const specifier = imported.fileName;
      if (!specifier.startsWith(".")) continue;
      const target = resolve(path.posix.normalize(path.posix.join(path.posix.dirname(view), specifier)), contexts.get(source));
      if (!target) continue; // The compiler reports genuinely missing modules.
      const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(source), specifier));
      if (candidate.startsWith("../") || path.posix.isAbsolute(candidate)) throw new Error(`Authoring import escapes package: ${source}: ${specifier}`);
      const physical = resolve(`package/${candidate}`);
      if (physical === target) continue;
      const json = target.endsWith(".json");
      const bridge = json ? candidate : candidate.replace(/\.[cm]?jsx?$/u, "") + ".ts";
      const hasDefault = ast.statements.some(statement => ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === specifier && statement.importClause?.name);
      const previous = bridges.get(bridge);
      if (previous && previous.target !== target) throw new Error(`Conflicting authoring resolution: ${bridge}: ${previous.target} / ${target}`);
      bridges.set(bridge, { target, json, hasDefault: hasDefault || previous?.hasDefault });
    }
  }
  const expected = new Set([augmentationFile]);
  async function writeGenerated(file, content) {
    expected.add(file);
    await mkdir(path.dirname(file), { recursive: true });
    try { if (await readFile(file, "utf8") === String(content)) return; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content, { flag: "wx" });
      for (let attempt = 0; ; attempt++) {
        try { await rename(temporary, file); break; }
        catch (error) {
          if (attempt >= 3 || !["EPERM", "EBUSY", "EACCES"].includes(error.code)) throw error;
          await new Promise(resolve => setTimeout(resolve, 25));
        }
      }
    } finally { await rm(temporary, { force: true }); }
  }
  await writeGenerated(augmentationFile, [...augmentationImports, ...augmentations].join("\n") + "\n");
  for (const [bridge, { target, json, hasDefault }] of bridges) {
    const file = sourcePath(output, bridge);
    await mkdir(path.dirname(file), { recursive: true });
    if (json) await writeGenerated(file, await readFile(path.join(root, ...target.split("/"))));
    else {
      const specifier = moduleSpecifier(file, target);
      let augmentation = logical(path.relative(path.dirname(file), augmentationFile)).replace(/\.ts$/u, ".js");
      if (!augmentation.startsWith(".")) augmentation = `./${augmentation}`;
      await writeGenerated(file, `import ${JSON.stringify(augmentation)};\n// Generated type-only resolution bridge; implementation remains in its canonical owner.\nexport * from ${JSON.stringify(specifier)};\n${hasDefault ? `export { default } from ${JSON.stringify(specifier)};\n` : ""}`);
    }
  }
  for (const file of await files(output)) {
    if (!expected.has(file) && !file.endsWith(".tmp")) await rm(file, { force: true });
  }
  console.log(`Prepared ${bridges.size} TypeScript authoring module bridges.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepareTypeScriptAuthoring();
