import { isPluginApplication, switchApplicationImport, readApplicationPackageManifest } from "./plugin-application";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { cp, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import { resourcePaths } from "./optional-resource-paths";
import { PLUGIN_OWNERSHIP_FILE, readPluginSourceOwnership } from "./plugin-source-ownership";
import { AgentUISourceError, assertNoSymbolicLinkTraversal, assertSafeProjectRelativePath } from "./source-registry/path-policy";
import { readAgentUISourceLock, serializeAgentUISourceLock } from "./source-registry/lock";
import { commitAgentUISourceTransaction, recoverPendingAgentUISourceTransaction } from "./source-registry/transaction";
import { parseAppUIModelJson, collectAppUIPluginLocations } from "../framework/contracts/app-ui-model";
import { generatePluginRegistry } from "./registry-generator";
import { assertCreatorCommitAllowed, creatorCancelMarkerSchemaPattern } from "./creator-cancel-marker";
import { isCreatorMetadataPath } from "./creator-metadata-path";
import { detectResourcePackageManager, runResourcePackageCommand, type ResourcePackageRunner } from "./ensure-resource-packages";

const pluginId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,99}$/u);
export const planPluginSourceInputSchema = z.strictObject({ pluginId });
export const takeoverPluginSourceInputSchema = z.strictObject({ pluginId, planHash: z.string().regex(/^[a-f0-9]{64}$/u), cancelMarker: z.string().regex(creatorCancelMarkerSchemaPattern).optional() });
const fileSchema = z.strictObject({ target: z.string(), path: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/u), origin: z.string() });
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
const fail = (code: string, message: string): never => { throw new AgentUISourceError(code, message); };

/** Hash all relevant local state, including derived source and install lockfiles.
 * No logical manifest path is constructed using platform-dependent separators. */
async function stateHash(root: string) {
  const { paths } = await resourcePaths(root);
  const hash = createHash("sha256");
  async function walk(directory: string): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; })).sort((a,b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("PLUGIN_SOURCE_SYMLINK", "Managed source cannot contain symbolic links.");
      if (entry.isDirectory()) await walk(absolute);
      else hash.update(path.relative(root, absolute).split(path.sep).join("/") + "\0").update(await readFile(absolute));
    }
  }
  await walk(paths.sourceRoot);
  for (const file of [path.join(paths.metadataRoot, "project.json"), path.join(paths.metadataRoot, PLUGIN_OWNERSHIP_FILE), paths.sourceLockPath,
    ...["package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock"].map(name => path.join(root, name))]) {
    const bytes = await readFile(file).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
    hash.update(path.relative(root,file).split(path.sep).join("/") + "\0").update(bytes ?? "<missing>");
  }
  return hash.digest("hex");
}

async function prepare(root: string, id: string, sync = false) {
  planPluginSourceInputSchema.parse({ pluginId: id });
  const context = await resourcePaths(root);
  const { paths } = context;
  const ownership = await readPluginSourceOwnership(paths.metadataRoot);
  if (!sync && ownership.plugins[id]) fail("PLUGIN_ALREADY_SOURCE_OWNED", "This Plugin is already project-owned; edit its adapters directly.");
  const application = await isPluginApplication(path.join(paths.pluginsRoot, id), id);
  const target = `plugins/${id}${application ? "/source" : ""}`;
  await assertNoSymbolicLinkTraversal(paths.sourceRoot, target);
  if (sync && (!application || ownership.plugins[id]?.implementationRoot !== "source")) fail("PLUGIN_SOURCE_SYNC_UNAVAILABLE", "Source sync requires an isolated implementation subtree.");
  if (!sync && await lstat(path.join(paths.sourceRoot, target)).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; })) fail("PLUGIN_SOURCE_TARGET_EXISTS", "Existing source must be preserved; takeover requires an absent target directory.");
  // Resolve from the target project, never from Operator's own dependency tree.
  const require = createRequire(path.join(root, "package.json"));
  const catalogPath = require.resolve("@za38.03/agent-ui-plugins/catalog.json");
  const installedRoot = path.dirname(catalogPath);
  const catalogBytes = await readFile(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString("utf8"));
  const pkg = JSON.parse(await readFile(path.join(installedRoot, "../package.json"), "utf8"));
  if (catalog.schemaVersion !== 1 || pkg.name !== "@za38.03/agent-ui-plugins" || catalog.package?.name !== pkg.name || catalog.package?.version !== pkg.version) fail("PLUGIN_SOURCE_PACKAGE_MISMATCH", "Installed package and source catalog identities differ.");
  const plugin = catalog.plugins.find((entry: {id: string}) => entry.id === id);
  if (!plugin?.takeover || plugin.takeover.schemaVersion !== 1) fail("PLUGIN_SOURCE_UNAVAILABLE", "Installed Plugin has no supported complete takeover snapshot.");
  if (application && !sync) await readApplicationPackageManifest(root, id);
  const applicationContractHash = application ? digest(JSON.stringify([
    plugin.application?.component ?? null, plugin.application?.scopeKind ?? null,
    plugin.application?.registration?.kind ?? null, plugin.application?.registration?.name ?? null,
    plugin.application?.runtimeContext === true,
    ...(plugin.application?.hostApplication ? ["host-application-v1", plugin.application.services] : []),
    ...(plugin.application?.hostBindings?.length || plugin.application?.railAction ? [plugin.application.hostBindings ?? [], plugin.application.railAction ?? null] : []),
  ])) : undefined;
  const previousContract = ownership.plugins[id]?.applicationContractHash;
  if (sync && ((previousContract !== undefined && previousContract !== applicationContractHash) || (previousContract === undefined && (plugin.application?.hostApplication || plugin.application?.registration || plugin.application?.hostBindings?.length || plugin.application?.railAction)))) {
    fail("PLUGIN_SOURCE_APPLICATION_API_CHANGED", "The Plugin application contract changed; adapt and validate the application separately before adopting this source version.");
  }
  if (Object.keys(plugin.takeover.requiredDependencies).length) fail("PLUGIN_SOURCE_DEPENDENCIES_REQUIRED", "Install the planned source dependencies before requesting takeover.");
  require.resolve(`@za38.03/agent-ui-plugins/${id}`);
  const compatibility = z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/u).max(100), z.number().int().positive()).parse(plugin.takeover.compatibility);
  if (!Object.keys(compatibility).length || Object.entries(compatibility).some(([api, version]) => catalog.sharedApis?.[api] !== version)) fail("PLUGIN_SOURCE_INCOMPATIBLE", "Installed package does not support the planned shared APIs.");
  const sharedApi = z.string().regex(/^@za38\.03\/agent-ui-plugins\/[a-z][a-z-]*$/u).parse(plugin.takeover.sharedApi);
  require.resolve(sharedApi);
  for (const artifact of z.array(z.strictObject({ path: z.string(), sha256: z.string() })).min(1).parse(plugin.takeover.runtimeFiles)) {
    assertSafeProjectRelativePath(artifact.path, "Plugin runtime artifact");
    await assertNoSymbolicLinkTraversal(installedRoot, artifact.path);
    if (digest(await readFile(path.join(installedRoot, ...artifact.path.split("/")))) !== artifact.sha256) fail("PLUGIN_SOURCE_RUNTIME_INTEGRITY", "Installed runtime does not match its source catalog; rebuild or reinstall the package.");
  }
  const files = new Map<string, Buffer>();
  const targets = new Set<string>();
  const origins: Record<string, string> = {};
  for (const file of z.array(fileSchema).min(3).max(200).parse(plugin.takeover.files)) {
    assertSafeProjectRelativePath(file.target, "Plugin target");
    assertSafeProjectRelativePath(file.path, "Plugin snapshot");
    if (!file.path.startsWith(`sources/takeover/${id}/`) || targets.has(file.target.toLowerCase())) fail("PLUGIN_SOURCE_INVALID_SNAPSHOT", "Snapshot paths or ownership are invalid.");
    await assertNoSymbolicLinkTraversal(installedRoot, file.path);
    const bytes = await readFile(path.join(installedRoot, ...file.path.split("/")));
    if (digest(bytes) !== file.sha256) fail("PLUGIN_SOURCE_INTEGRITY", "Installed source snapshot checksum mismatch.");
    targets.add(file.target.toLowerCase());
    const relocated = application ? Buffer.from(bytes.toString("utf8").replaceAll('"../../framework/', '"../../../framework/').replaceAll('"../../services/', '"../../../services/').replaceAll('"../../agent-ui/', '"../../../agent-ui/').replaceAll('"../../runtime/', '"../../../runtime/')) : bytes;
    files.set(file.target, relocated); origins[file.target] = file.origin;
  }
  for (const file of ["definition.ts", "index.tsx", "manifest.json"]) if (!files.has(file)) fail("PLUGIN_SOURCE_INVALID_SNAPSHOT", "Snapshot lacks its definition or implementation.");
  const manifest = JSON.parse(files.get("manifest.json")!.toString());
  if (manifest.id !== id || manifest.version !== plugin.version) fail("PLUGIN_SOURCE_ID_MISMATCH", "Snapshot changes the Plugin ID.");
  const model = parseAppUIModelJson(await readFile(paths.appUIModelPath, "utf8"));
  const instances = collectAppUIPluginLocations(model).filter(location => location.plugin.pluginId === id).map(location => location.plugin.id).sort();
  const applicationEdits = new Map<string, Buffer>();
  if (application && !sync) {
    applicationEdits.set("index.tsx", await switchApplicationImport(path.join(paths.pluginsRoot, id, "index.tsx"), `@za38.03/agent-ui-plugins/${id}`, "./source/index"));
    applicationEdits.set("definition.ts", await switchApplicationImport(path.join(paths.pluginsRoot, id, "definition.ts"), `@za38.03/agent-ui-plugins/${id}`, "./source/definition"));
  }
  const catalogHash = digest(catalogBytes);
  const plan = { pluginId: id, package: { name: pkg.name as string, version: pkg.version as string }, pluginVersion: plugin.version as string,
    catalogHash, stateHash: await stateHash(root), applicationChanges: [...applicationEdits.keys()], files: [...files.keys()].map(file => `${target}/${file}`).sort(), instances,
    sharedDependencies: plugin.takeover.sharedDependencies as string[], dependencyChanges: [] as string[],
    compatibility, origins };
  return { context, ownership, files, model, application, applicationEdits, applicationContractHash, plan: { ...plan, planHash: digest(JSON.stringify(plan)) } };
}
export async function planPluginSourceTakeover(root: string, input: {pluginId: string}) {
  return (await prepare(root, input.pluginId)).plan;
}

/** Internal apply operation: only Creator's trusted question resume exposes this
 * to the model. A stale plan never silently becomes approval for a new plan. */
export async function takeoverPluginSource(root: string, raw: z.infer<typeof takeoverPluginSourceInputSchema>, run: ResourcePackageRunner = runResourcePackageCommand) {
  return applySource(root, raw, run);
}

async function applySource(root: string, raw: z.infer<typeof takeoverPluginSourceInputSchema>, run: ResourcePackageRunner, resolutions?: Record<string, string | null>) {
  const sync = resolutions !== undefined;
  const input = takeoverPluginSourceInputSchema.parse(raw);
  const prepared = await prepare(root, input.pluginId, sync);
  if (prepared.plan.planHash !== input.planHash) fail("PLUGIN_SOURCE_PLAN_STALE", "Package or project changed since confirmation; request a new plan and confirmation.");
  const { context: { paths, config }, ownership, files, model, application, applicationEdits, applicationContractHash, plan } = prepared;
  const changes = new Map<string, Buffer | undefined>(files);
  if (sync) {
    const previous = ownership.plugins[input.pluginId]!;
    const scope = new Set([...Object.keys(previous.base).map(file => file.slice("source/".length)), ...files.keys()]);
    for (const file of Object.keys(resolutions!)) if (!scope.has(file)) fail("PLUGIN_SOURCE_SYNC_SCOPE", "Application files and unknown paths cannot enter source merge.");
    for (const file of scope) {
      assertSafeProjectRelativePath(file, "Implementation merge path");
      await assertNoSymbolicLinkTraversal(paths.sourceRoot, `plugins/${input.pluginId}/source/${file}`);
      const local = await readFile(path.join(paths.pluginsRoot, input.pluginId, "source", ...file.split("/"))).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
      const base = previous.base[`source/${file}`];
      const baseBytes = base ? Buffer.from(base.contentBase64, "base64") : undefined;
      const target = files.get(file);
      const same = (a: Buffer | undefined, b: Buffer | undefined) => a === undefined ? b === undefined : b !== undefined && a.equals(b);
      let merged: Buffer | undefined;
      if (Object.hasOwn(resolutions!, file)) merged = resolutions![file] === null ? undefined : Buffer.from(resolutions![file]!);
      else if (same(local, baseBytes)) merged = target;
      else if (same(target, baseBytes) || same(local, target)) merged = local;
      else fail("PLUGIN_SOURCE_MERGE_REQUIRED", "Review BASE, LOCAL and TARGET and provide a merged implementation file.");
      if (merged === undefined && target !== undefined) fail("PLUGIN_SOURCE_MERGE_INCOMPLETE", "A complete version sync cannot omit a target implementation file.");
      changes.set(file, merged);
    }
  }
  const protectedApplication = application ? await applicationFiles(path.join(paths.pluginsRoot, input.pluginId)) : new Map<string, Buffer>();
  const originalLock = await readAgentUISourceLock(root, config);
  ownership.plugins[input.pluginId] = { pluginId: input.pluginId, directory: input.pluginId,
    ...(application ? { implementationRoot: "source" as const, applicationContractHash } : {}),
    package: { name: "@za38.03/agent-ui-plugins", version: plan.package.version }, pluginVersion: plan.pluginVersion,
    catalogHash: plan.catalogHash, approvedPlanHash: sync ? ownership.plugins[input.pluginId]!.approvedPlanHash : plan.planHash,
    ...(sync ? { lastSyncPlanHash: plan.planHash } : {}),
    origins: Object.fromEntries(Object.entries(plan.origins).map(([file, origin]) => [application ? `source/${file}` : file, origin])), sharedDependencies: plan.sharedDependencies, compatibility: plan.compatibility,
    base: Object.fromEntries([...files].map(([file, bytes]) => [application ? `source/${file}` : file, { sha256: digest(bytes), contentBase64: bytes.toString("base64") }])) };
  const ownershipBytes = Buffer.from(JSON.stringify(ownership, null, 2) + "\n");
  const staged = await mkdtemp(path.join(tmpdir(), "agent-ui-takeover-"));
  try {
    await cp(root, staged, { recursive: true, filter: source => !["node_modules", ".git", "dist"].includes(path.relative(root, source).split(path.sep)[0]!) && !isCreatorMetadataPath(root, source) });
    await symlink(path.join(root, "node_modules"), path.join(staged, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    const stage = await resourcePaths(staged);
    const mutations: { target: string; content?: Buffer | undefined }[] = [...changes].map(([file, content]) => ({ target: `plugins/${input.pluginId}/${application ? "source/" : ""}${file}`, content }));
    mutations.push(...[...applicationEdits].map(([file, content]) => ({ target: `plugins/${input.pluginId}/${file}`, content })));
    for (const mutation of mutations) {
      const destination = path.join(stage.paths.sourceRoot, ...mutation.target.split("/"));
      await mkdir(path.dirname(destination), {recursive: true});
      if (mutation.content === undefined) await rm(destination, { force: true });
      else await writeFile(destination, mutation.content);
    }
    await writeFile(path.join(stage.paths.metadataRoot, PLUGIN_OWNERSHIP_FILE), ownershipBytes);
    const generated = await generatePluginRegistry(staged, model, stage);
    if (generated.errors.length) throw new AgentUISourceError("PLUGIN_SOURCE_COMPOSITION_INVALID", "Source-owned composition failed validation.", generated.errors);
    const registry = { target: path.relative(paths.sourceRoot, paths.generatedPluginRegistryPath).split(path.sep).join("/"), content: Buffer.from(generated.capabilityCatalog.source) };
    mutations.push(registry);
    await writeFile(stage.paths.generatedPluginRegistryPath, registry.content);
    const pkg = JSON.parse(await readFile(path.join(staged, "package.json"), "utf8"));
    if (!pkg.scripts?.build) fail("PLUGIN_SOURCE_BUILD_REQUIRED", "Source takeover requires the Host build script.");
    const manager = await detectResourcePackageManager(root);
    const checks: string[] = [];
    for (const name of ["typecheck", "build", "test"]) if (pkg.scripts?.[name]) { await run(staged, { command: manager, args: ["run", name] }); checks.push(name); }
    if (!(await readFile(stage.paths.appUIModelPath)).equals(await readFile(paths.appUIModelPath))) fail("PLUGIN_SOURCE_STAGED_DRIFT", "Host validation changed AppUIModel.");
    // Host scripts must not alter the plan, source closure, manifest or registry.
    for (const mutation of mutations) {
      const actual = await readFile(path.join(stage.paths.sourceRoot, ...mutation.target.split("/"))).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
      if (mutation.content === undefined ? actual !== undefined : !actual?.equals(mutation.content)) fail("PLUGIN_SOURCE_STAGED_DRIFT", "Host validation changed the staged Plugin or registry.");
    }
    if (!(await readFile(path.join(stage.paths.metadataRoot, PLUGIN_OWNERSHIP_FILE))).equals(ownershipBytes)) fail("PLUGIN_SOURCE_STAGED_DRIFT", "Host validation changed source ownership.");
    if (application) {
      const stagedApplication = await applicationFiles(path.join(stage.paths.pluginsRoot, input.pluginId));
      if (stagedApplication.size !== protectedApplication.size) fail("PLUGIN_SOURCE_STAGED_DRIFT", "Validation changed application files.");
      for (const [file, bytes] of protectedApplication) if (!stagedApplication.get(file)?.equals(applicationEdits.get(file) ?? bytes)) fail("PLUGIN_SOURCE_STAGED_DRIFT", "Validation changed application customization.");
    }
    await assertCreatorCommitAllowed(root, input.cancelMarker);
    if ((await prepare(root, input.pluginId, sync)).plan.planHash !== input.planHash) fail("PLUGIN_SOURCE_PLAN_STALE", "Project changed during validation; request confirmation again.");
    await commitAgentUISourceTransaction(root, config, sync ? "sync_plugin_source" : "takeover_plugin_source", mutations.map(({ target, content }) => ({ target, ...(content === undefined ? {} : { content }) })), serializeAgentUISourceLock(originalLock.lock), { nextOwnership: ownershipBytes, cancelMarker: input.cancelMarker });
    return { pluginId: input.pluginId, ownership: "project_source" as const, packageVersion: plan.package.version,
      changedPaths: [...mutations.map(mutation => path.relative(root, path.join(paths.sourceRoot, ...mutation.target.split("/"))).split(path.sep).join("/")), path.relative(root, path.join(paths.metadataRoot, PLUGIN_OWNERSHIP_FILE)).split(path.sep).join("/")], checks };
  } finally { await rm(staged, {recursive: true, force: true}); }
}

/** Called while holding the Operator project lock, after Host journal recovery. */
export async function recoverPluginSourceTakeover(root: string) {
  const { paths, config } = await resourcePaths(root);
  const journal = "source-transaction.json";
  await assertNoSymbolicLinkTraversal(paths.metadataRoot, journal);
  const bytes = await readFile(path.join(paths.metadataRoot, journal)).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
  if (bytes && ["takeover_plugin_source", "sync_plugin_source"].includes(JSON.parse(bytes.toString("utf8")).itemId)) await recoverPendingAgentUISourceTransaction(root, config);
}

/** Explicit installed-version source synchronization. Application files never enter this plan. */
export async function planPluginSourceSync(root: string, input: { pluginId: string }) {
  const prepared = await prepare(root, input.pluginId, true);
  const previous = prepared.ownership.plugins[input.pluginId]!;
  const scope = new Set([...Object.keys(previous.base).map(file => file.slice("source/".length)), ...prepared.files.keys()]);
  const files = await Promise.all([...scope].sort().map(async file => {
    assertSafeProjectRelativePath(file, "Implementation merge path");
    await assertNoSymbolicLinkTraversal(prepared.context.paths.sourceRoot, `plugins/${input.pluginId}/source/${file}`);
    const local = await readFile(path.join(prepared.context.paths.pluginsRoot, input.pluginId, "source", ...file.split("/"))).catch(error => { if (error.code === "ENOENT") return undefined; throw error; });
    return { path: file, base: previous.base[`source/${file}`]?.contentBase64 ?? null,
      local: local?.toString("base64") ?? null, target: prepared.files.get(file)?.toString("base64") ?? null };
  }));
  return { ...prepared.plan, encoding: "base64" as const, mergeFiles: files };
}

/** Merged text is supplied only for reviewed conflicts; other files use three-way identity rules. */
export async function syncPluginSource(root: string, input: { pluginId: string; planHash: string; resolutions?: Record<string, string | null>; cancelMarker?: string }, run: ResourcePackageRunner = runResourcePackageCommand) {
  return applySource(root, { pluginId: input.pluginId, planHash: input.planHash, ...(input.cancelMarker ? { cancelMarker: input.cancelMarker } : {}) }, run, input.resolutions ?? {});
}

async function applicationFiles(directory: string, relative = "", result = new Map<string, Buffer>()): Promise<Map<string, Buffer>> {
  for (const entry of await readdir(path.join(directory, ...relative.split("/")), { withFileTypes: true })) {
    if (!relative && entry.name === "source") continue;
    const file = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail("PLUGIN_SOURCE_SYMLINK", "Application files cannot traverse symlinks during source operations.");
    if (entry.isDirectory()) await applicationFiles(directory, file, result);
    else result.set(file, await readFile(path.join(directory, ...file.split("/"))));
  }
  return result;
}
