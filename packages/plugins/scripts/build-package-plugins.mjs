import { sharedStyleScanSources } from "./shared-style-sources.mjs";
import { finalizeEsmImports } from "../../../scripts/finalize-esm-imports.mjs";
import { deliveries, packageDefinitionSource, portableSource, sourceEntries } from "./plugin-source-recipes.mjs";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnPnpmSync } from "../../../scripts/pnpm-process.mjs";
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const registry = fileURLToPath(new URL("../resources/registry/items", import.meta.url));
const registryRoot = path.dirname(registry);
const registryManifest = JSON.parse(await readFile(path.join(registryRoot, "registry.json"), "utf8"));
const sourceItems = new Map(registryManifest.items.map(entry => [entry.id, entry]));
const sourceLayout = JSON.parse(await readFile(path.join(root, "source-layout.json"), "utf8"));
const sourceByView = new Map(sourceLayout.files.map(file => [file.view, file.source]));
function sourceItemRoot(id) {
  const entry = sourceItems.get(id);
  if (!entry) throw new Error(`Missing source item ${id}`);
  return path.join(registryRoot, ...path.posix.dirname(entry.path).split("/"));
}
function sourceItemFile(id, relativePath) {
  const entry = sourceItems.get(id);
  if (!entry) throw new Error(`Missing source item ${id}`);
  const itemRoot = path.posix.dirname(entry.path);
  const view = path.posix.join("resources/registry", itemRoot, relativePath.split(path.sep).join("/"));
  const canonical = sourceByView.get(view);
  if (!canonical) throw new Error(`Missing canonical Plugin source mapping: ${view}`);
  return path.join(root, ...canonical.split("/"));
}
const packageExports = JSON.parse(await readFile(path.join(root, "package.json"), "utf8")).exports;
const generated = path.join(root, ".generated");
await rm(generated, { recursive: true, force: true });
await rm(path.join(root, "dist/types"), { recursive: true, force: true });
// Remove the unpublished intermediate product entry when rebuilding an existing checkout.
await rm(path.join(root, "dist/conversation-composer"), { recursive: true, force: true });
await mkdir(generated, { recursive: true });
await mkdir(path.join(generated, "framework/contracts"), { recursive: true });
await writeFile(path.join(generated, "framework/contracts/ui-plugin.ts"), 'export * from "@za38.03/agent-ui-plugins/contracts";\n');
// Each official plugin has one product entry point.
const plugins = deliveries;
const utilityCandidatesByPlugin = new Map();
// Do not emit the utilities already guaranteed by styles-base.css a second time.
const baseCandidates = new Set(new Scanner({ sources: sharedStyleScanSources(path.join(root, "dist")) }).scan());
for (const delivery of plugins) {
  const { id, component } = delivery;
  await rm(path.join(root, "dist", id), { recursive: true, force: true });
  if (delivery.componentSource) {
    const directory = path.join(generated, "plugins", id);
    await rm(directory, {recursive:true,force:true});
    for (const [target, origin] of sourceEntries(delivery)) {
      const file=path.join(directory,...target.split("/"));await mkdir(path.dirname(file),{recursive:true});
      const text=await readFile(path.join(root,...origin.split("/")),"utf8");
      await writeFile(file,target.startsWith("adapters/") ? await portableSource(delivery,target,text) : text);
    }
  } else {
    const itemPath = path.join(sourceItemRoot(`plugin/${id}`), "item.json");
    const item = JSON.parse(await readFile(itemPath, "utf8"));
    for (const file of item.files) {
      const target = path.join(generated, ...file.target.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await cp(sourceItemFile(`plugin/${id}`, file.source), target);
    }
  }
  for (const file of delivery.projectFiles ?? []) await cp(path.join(root, "src/plugins", id, "adapters/project", file), path.join(generated, "plugins", id, file));
  if (delivery.definitionExports?.length) {
    for (const file of delivery.presentation) { const target = path.join(generated, "plugins", id, "adapters", file); await mkdir(path.dirname(target), {recursive:true}); await writeFile(target, await portableSource(delivery, `adapters/${file}`, await readFile(path.join(root,"src/plugins",delivery.presentationOwner,"adapters/presentation",file),"utf8"))); }
  }
  const implementationPath = path.join(generated, "plugins", id, "index.tsx");
  await writeFile(implementationPath, (await readFile(implementationPath, "utf8")).replace(/(["'])\.\.\/\.\.\/agent-ui\/i18n\/useAgentUILocale\1/u, '$1@za38.03/agent-ui-plugins$1'));
  const definitionPath = path.join(generated, "plugins", id, "definition.ts");
  if (delivery.definitionSource) await cp(path.join(root, "src/plugins", id, delivery.definitionSource), definitionPath);
  const compatibleSource = packageDefinitionSource(await readFile(definitionPath, "utf8"));
  await writeFile(definitionPath, compatibleSource + `\nexport { ${[component, delivery.railAction].filter(Boolean).join(", ")} } from "./index";\n`);
}
await writeFile(path.join(generated, "tsconfig.json"), JSON.stringify({ compilerOptions: {
  target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true,
  skipLibCheck: true, resolveJsonModule: true, declaration: true, emitDeclarationOnly: true,
  outDir: "../dist/types", rootDir: ".",
}, include: ["**/*.ts", "**/*.tsx"] }));
const result = spawnPnpmSync(["exec", "tsc", "-p", path.join(generated, "tsconfig.json")], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error("Official plugin type compilation failed");
for (const { id, symbol, component } of plugins) {
  const output = await build({ entryPoints: { [`${id}/index`]: path.join(generated, "plugins", id, "definition.ts") },
    outdir: path.join(root, "dist"), bundle: true, packages: "external", format: "esm", platform: "browser", jsx: "automatic", metafile: true });
  if ((deliveries.find(delivery => delivery.id === id).projectFiles ?? []).some(file => file.endsWith(".css"))) {
    const entry = path.join(root, "dist", id, "index.js");
    await writeFile(entry, 'import "./index.css";\n' + await readFile(entry, "utf8"));
  }
  await writeFile(path.join(root, "dist", id, "index.d.ts"), `export { default, ${[symbol, component, plugins.find(delivery => delivery.id === id).railAction, ...(plugins.find(delivery => delivery.id === id).definitionExports ?? [])].filter(Boolean).join(", ")} } from "../types/plugins/${id}/definition.js";\n`);
  // Analyze the tree-shaken public implementation, resolving only this package.
  // Third-party packages stay external; their own styles retain their owner.
  const utilityBundle = await build({
    entryPoints: [path.join(root, "dist", id, "index.js")], bundle: true,
    packages: "external", write: false, format: "esm", platform: "browser",
    treeShaking: true, minify: true, external: ["*.css"],
    plugins: [{ name: "local-public-apis", setup(builder) {
      builder.onResolve({ filter: /^@za38\.03\/agent-ui-plugins(?:\/|$)/ }, args => {
        const subpath = args.path.slice("@za38.03/agent-ui-plugins".length) || "/";
        const entry = packageExports[subpath === "/" ? "." : `.${subpath}`];
        const target = typeof entry === "string" ? entry : entry?.import;
        if (!target) throw new Error(`Missing public Plugin entry: ${args.path}`);
        return { path: path.resolve(root, target) };
      });
    } }],
  });
  utilityCandidatesByPlugin.set(id, new Scanner({}).scanFiles(utilityBundle.outputFiles.map(file => ({ content: file.text, extension: "js" }))));
  const delivery = deliveries.find(delivery => delivery.id === id);
  const sourceHash = createHash("sha256").update(Buffer.concat(await Promise.all(sourceEntries(delivery).map(async ([target, origin]) => Buffer.concat([
    Buffer.from(target + "\0"), Buffer.from(await portableSource(delivery, target, await readFile(path.join(root, ...origin.split("/")), "utf8"))),
  ]))))).digest("hex");
  await writeFile(path.join(root, "dist", id, "build-provenance.json"), JSON.stringify({ referenceSourceItemId: `plugin/${id}`, sourceHash, inputs: Object.keys(output.metafile.inputs) }, null, 2));

  for (const file of delivery.projectFiles ?? []) if (file.endsWith(".d.ts")) await cp(path.join(root, "src/plugins", id, "adapters/project", file), path.join(root, "dist/types/plugins", id, file));

  if (id === "composer") await cp(path.join(root, "dist", id, "build-provenance.json"), path.join(root, "dist/build-provenance.json"));

}
await rm(generated, { recursive: true, force: true });
// Keep one common utility module and one private module per Plugin. Grouping
// every possible consumer set separately creates tiny CSS requests whose gzip
// and module-preload overhead outweigh the saved selectors.
const usersByCandidate = new Map();
for (const [id, candidates] of utilityCandidatesByPlugin) {
  for (const candidate of candidates) {
    if (baseCandidates.has(candidate)) continue;
    const users = usersByCandidate.get(candidate) ?? [];
    users.push(id);
    usersByCandidate.set(candidate, users);
  }
}
const groups = new Map();
for (const [candidate, users] of usersByCandidate) {
  const shared = users.length > 1;
  const key = shared ? "shared" : users[0];
  const group = groups.get(key) ?? { users: shared ? plugins.map(plugin => plugin.id) : users, candidates: [] };
  group.candidates.push(candidate);
  groups.set(key, group);
}
await mkdir(path.join(root, "dist/utilities"), { recursive: true });
const importsByPlugin = new Map(plugins.map(({ id }) => [id, []]));
const utilityFilesByPlugin = new Map(plugins.map(({ id }) => [id, []]));
for (const [key, group] of groups) {
  const compiler = await compile('@layer properties, theme, base, components, utilities;\n@reference "./src/styles.css";\n@layer utilities { @tailwind utilities; }', { base: root, onDependency() {} });
  const css = compiler.build(group.candidates);
  // Invalid scanner tokens produce an empty utilities layer; skip those groups.
  if (!css.includes("{")) continue;
  const file = createHash("sha256").update(key).digest("hex").slice(0, 16) + ".css";
  await writeFile(path.join(root, "dist/utilities", file), css);
  for (const id of group.users) {
    importsByPlugin.get(id).push(`import "../utilities/${file}";`);
    utilityFilesByPlugin.get(id).push(`utilities/${file}`);
  }
}
for (const [id, imports] of importsByPlugin) {
  const entry = path.join(root, "dist", id, "index.js");
  await writeFile(entry, imports.join("\n") + "\n" + await readFile(entry, "utf8"));
}

// Bind the portable source plan to this build's matching runtime artifacts.
// Webpack/Rspack enforce fully specified imports in emitted ESM packages.
// Normalize before recording artifact hashes; exact source snapshots stay untouched.
await finalizeEsmImports(path.join(root, "dist"));
const catalogPath = path.join(root, "dist/catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
for (const plugin of catalog.plugins.filter(plugin => plugin.takeover)) {
  const delivery = deliveries.find(delivery => delivery.id === plugin.id);
  const support = `${delivery.supportEntry}.js`;
  const presentationId = delivery.presentationOwner;
  plugin.takeover.runtimeFiles = await Promise.all([
    `${plugin.id}/index.js`, "public.js", support, "internal/composable-thread.js",
    ...utilityFilesByPlugin.get(plugin.id),
    ...(delivery.projectFiles?.some(file => file.endsWith(".css")) ? [`${plugin.id}/index.css`] : []),
    ...delivery.presentation.map(name => `plugins/${presentationId}/adapters/presentation/${name.replace(/\.tsx?$/u, ".js")}`),
  ].map(async file => ({ path: file, sha256: createHash("sha256").update(await readFile(path.join(root, "dist", file))).digest("hex") })));

}
catalog.sharedApis = Object.fromEntries(deliveries.map(delivery => [delivery.support, 1]));
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
