import { deliveries, portableSource, sourceEntries } from "./plugin-source-recipes.mjs";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnPnpmSync } from "../../../scripts/pnpm-process.mjs";
import { build } from "esbuild";
import { createHash } from "node:crypto";
const root = fileURLToPath(new URL("../", import.meta.url));
const registry = fileURLToPath(new URL("../resources/registry/items", import.meta.url));
const registryRoot = path.dirname(registry);
const registryManifest = JSON.parse(await readFile(path.join(registryRoot, "registry.json"), "utf8"));
const sourceItems = new Map(registryManifest.items.map(entry => [entry.id, entry]));
function sourceItemRoot(id) {
  const entry = sourceItems.get(id);
  if (!entry) throw new Error(`Missing source item ${id}`);
  return path.join(registryRoot, ...path.posix.dirname(entry.path).split("/"));
}
const verification = spawnPnpmSync(["exec", "node", "--import", "tsx", "../operator/scripts/source-catalog/verify-package-services.mjs"], { cwd: root, stdio: "inherit" });
if (verification.error) throw verification.error;
if (verification.status !== 0) throw new Error("OFFICIAL_PACKAGE_SERVICE_METADATA_DRIFT: reference validation failed");
const generated = path.join(root, ".generated");
await rm(generated, { recursive: true, force: true });
await rm(path.join(root, "dist/types"), { recursive: true, force: true });
// Remove the unpublished intermediate product entry when rebuilding an existing checkout.
await rm(path.join(root, "dist/conversation-composer"), { recursive: true, force: true });
await mkdir(generated, { recursive: true });
await cp(path.join(sourceItemRoot("foundation/core-contracts"), "files/framework"), path.join(generated, "framework"), { recursive: true });
// Each official plugin has one product entry point.
const plugins = deliveries;
for (const delivery of plugins) {
  const { id, component } = delivery;
  await rm(path.join(root, "dist", id), { recursive: true, force: true });
  await cp(path.join(sourceItemRoot(`plugin/${id}`), "files/plugins"), path.join(generated, "plugins"), { recursive: true });
  if (delivery.componentSource) {
    const directory = path.join(generated, "plugins", id);
    await rm(directory, {recursive:true,force:true});
    for (const [target, origin] of sourceEntries(delivery)) {
      const file=path.join(directory,...target.split("/"));await mkdir(path.dirname(file),{recursive:true});
      const text=await readFile(path.join(root,...origin.split("/")),"utf8");
      await writeFile(file,target.startsWith("adapters/") ? portableSource(delivery,target,text) : text);
    }
  }
  for (const file of delivery.projectFiles ?? []) await cp(path.join(root, "src/plugins", id, "adapters/project", file), path.join(generated, "plugins", id, file));
  if (delivery.definitionExports?.length) {
    for (const file of delivery.presentation) { const target = path.join(generated, "plugins", id, "adapters", file); await mkdir(path.dirname(target), {recursive:true}); await writeFile(target, portableSource(delivery, `adapters/${file}`, await readFile(path.join(root,"src/plugins",delivery.presentationOwner,"adapters/presentation",file),"utf8"))); }
  }
  const implementationPath = path.join(generated, "plugins", id, "index.tsx");
  await writeFile(implementationPath, (await readFile(implementationPath, "utf8")).replace('"../../agent-ui/i18n/useAgentUILocale"', '"@za38.03/agent-ui-plugins"'));
  const definitionPath = path.join(generated, "plugins", id, "definition.ts");
  if (delivery.definitionSource) await cp(path.join(root, "src/plugins", id, delivery.definitionSource), definitionPath);
  const compatibleSource = (await readFile(definitionPath, "utf8")).replace('import { AGENT_UI_LOCALE_SERVICE } from "../../services/agent-ui-locale";', 'const AGENT_UI_LOCALE_SERVICE = "agent-ui.locale";');
  if (!compatibleSource.includes('from "../../framework/contracts/ui-plugin"') || /\.\.\/\.\.\/(?:agent-ui|runtime|services)\//.test(compatibleSource)) throw new Error("Official plugin is not package compatible");
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
  const delivery = deliveries.find(delivery => delivery.id === id);
  const sourceHash = createHash("sha256").update(Buffer.concat(await Promise.all(sourceEntries(delivery).map(async ([target, origin]) => Buffer.concat([
    Buffer.from(target + "\0"), Buffer.from(portableSource(delivery, target, await readFile(path.join(root, ...origin.split("/")), "utf8"))),
  ]))))).digest("hex");
  await writeFile(path.join(root, "dist", id, "build-provenance.json"), JSON.stringify({ referenceSourceItemId: `plugin/${id}`, sourceHash, inputs: Object.keys(output.metafile.inputs) }, null, 2));

  for (const file of delivery.projectFiles ?? []) if (file.endsWith(".d.ts")) await cp(path.join(root, "src/plugins", id, "adapters/project", file), path.join(root, "dist/types/plugins", id, file));

  if (id === "composer") await cp(path.join(root, "dist", id, "build-provenance.json"), path.join(root, "dist/build-provenance.json"));

}
await rm(generated, { recursive: true, force: true });
// Bind the portable source plan to this build's matching runtime artifacts.
const catalogPath = path.join(root, "dist/catalog.json");
const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
for (const plugin of catalog.plugins.filter(plugin => plugin.takeover)) {
  const delivery = deliveries.find(delivery => delivery.id === plugin.id);
  const support = `${delivery.supportEntry}.js`;
  const presentationId = delivery.presentationOwner;
  plugin.takeover.runtimeFiles = await Promise.all([
    `${plugin.id}/index.js`, "public.js", support, "internal/composable-thread.js",
    ...(delivery.projectFiles?.some(file => file.endsWith(".css")) ? [`${plugin.id}/index.css`] : []),
    ...delivery.presentation.map(name => `plugins/${presentationId}/adapters/presentation/${name.replace(/\.tsx?$/u, ".js")}`),
  ].map(async file => ({ path: file, sha256: createHash("sha256").update(await readFile(path.join(root, "dist", file))).digest("hex") })));

}
catalog.sharedApis = Object.fromEntries(deliveries.map(delivery => [delivery.support, 1]));
await writeFile(catalogPath, JSON.stringify(catalog, null, 2) + "\n");
