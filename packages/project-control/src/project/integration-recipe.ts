import { assertCreatorCommitAllowed } from "./creator-cancel-marker";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { readFile, readdir, realpath, mkdir, writeFile, rename, unlink, lstat, stat, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { resolveOfficialResource } from "@agent-ui/source-registry";
import { acquireProjectControlLock } from "./project-control-lock";

export const integrationOptionsSchema = z.strictObject({
  targetFile: z.string().min(1).max(200).optional(),
  moduleSpecifier: z.string().min(1).max(200).default("/agent-ui.js"),
  endpoint: z.string().min(1).max(200).default("/agent"),
  locale: z.enum(["en-US", "zh-CN"]).default("en-US"),
  theme: z.enum(["light", "dark", "violet"]).default("violet"),
});
export type IntegrationOptions = z.input<typeof integrationOptionsSchema>;
export const integrationEditSchema = z.strictObject({
  file: z.string(), operation: z.enum(["add_import", "create_file", "mount_component"]),
  before: z.string().nullable(), after: z.string(),
});
export const integrationRecipeSchema = z.strictObject({
  id: z.string(), projectId: z.string(), resourceId: z.literal("web-component-bridge"),
  host: z.strictObject({ framework: z.enum(["vue", "html", "legacy"]), frameworkVersion: z.string().optional(), toolchain: z.enum(["vite", "vue-cli", "other"]) }),
  detectedFiles: z.strictObject({ packageJson: z.string().optional(), entryFile: z.string().optional(), targetFile: z.string() }),
  integration: z.strictObject({ mode: z.literal("web-component"), moduleSpecifier: z.string() }),
  options: integrationOptionsSchema, edits: z.array(integrationEditSchema), verification: z.array(z.string()), warnings: z.array(z.string()),
});
export type IntegrationRecipe = z.infer<typeof integrationRecipeSchema>;
const literal = (value: unknown) => JSON.stringify(value).replace(/</gu, "\\u003c");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function fail(code: string): never { throw Object.assign(new Error(code), { code }); }
async function safePath(root: string, file: string) {
  if (!file || path.isAbsolute(file) || file.split(/[\\/]/u).some(part => part === ".." || part === "." || !part) || file.startsWith(".agent-ui/")) fail("INTEGRATION_PATH_INVALID");
  const absolute = path.join(root, file);
  for (let current = absolute; current !== root; current = path.dirname(current)) {
    try { if ((await lstat(current)).isSymbolicLink()) fail("INTEGRATION_SYMLINK_UNSUPPORTED"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  return absolute;
}
async function read(root: string, file: string) {
  try { const value = await readFile(await safePath(root, file), "utf8"); if (value.length > 24_000) fail("INTEGRATION_FILE_TOO_LARGE"); return value; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function inspectIntegrationHost(projectRoot: string) {
  const root = await realpath(projectRoot);
  const source = await read(root, "package.json");
  const manifest = source === null ? {} : JSON.parse(source);
  const deps = { ...manifest.dependencies, ...manifest.devDependencies } as Record<string, string>;
  const framework = deps.nuxt || deps["nuxt-edge"] ? "nuxt" : deps.react ? "react" : deps.vue ? "vue" : source === null ? "html" : "legacy";
  const configFiles = await readdir(root);
  const toolchain = deps.vite || deps["@vitejs/plugin-vue"] || configFiles.some(file => /^vite.config\.[cm]?[jt]s$/u.test(file)) ? "vite" : deps["@vue/cli-service"] || configFiles.some(file => /^vue.config\.[cm]?[jt]s$/u.test(file)) ? "vue-cli" : "other";
  const entries = [];
  for (const file of ["src/main.ts", "src/main.js"]) if (await read(root, file) !== null) entries.push(file);
  const candidates: string[] = [];
  if (framework === "vue") {
    if (await read(root, "src/App.vue") !== null) candidates.push("src/App.vue");
    for (const directory of ["src/views", "src/pages"]) {
      await safePath(root, directory);
      try { for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) if (entry.isFile() && entry.name.endsWith(".vue")) candidates.push(`${directory}/${entry.name}`); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  } else if (await read(root, "index.html") !== null) candidates.push("index.html");
  return { framework, ...(deps.vue ? { frameworkVersion: deps.vue } : {}), toolchain, ...(source !== null ? { packageJson: "package.json" } : {}), ...(entries.length === 1 ? { entryFile: entries[0] } : {}), candidates: candidates.sort(), targetRequired: true,
    recommendedResource: framework === "react" ? "canonical-react" : framework === "nuxt" ? "unsupported" : "web-component-bridge" };
}

// Templates are Host-owned. The wrapper creates the Custom Element directly so
// Vue's compiler never needs an isCustomElement or React/TSX configuration.
function vueWrapper(options: z.output<typeof integrationOptionsSchema>, major: 2 | 3) {
  const config = literal({ endpoint: options.endpoint, locale: options.locale, theme: options.theme });
  const publicModule = options.moduleSpecifier.startsWith("/");
  const registration = publicModule ? "" : `import ${literal(options.moduleSpecifier)};`;
  const loadModule = publicModule ? `const moduleUrl = new URL(${literal(options.moduleSpecifier)}, window.location.href).href;
    try { await import(/* @vite-ignore */ moduleUrl); }\n    catch (error) { if (!this._agentDisposed) this.$emit('agent-error', { code: 'AGENT_UI_MODULE_LOAD_ERROR', error }); return; }\n    if (this._agentDisposed) return;` : "";
  const props = `props: { endpoint: { type: String, default: ${literal(options.endpoint)} }, locale: { type: String, default: ${literal(options.locale)} }, theme: { type: String, default: ${literal(options.theme)} }, threadId: String },`;
  return `<template><div ref="container"></div></template>\n<script>\n${registration}\nexport default {\n  name: 'AgentUIBridge',\n  ${props}\n  ${major === 3 ? "emits: ['agent-ready', 'thread-change', 'agent-error']," : ""}\n  async mounted() {\n    ${loadModule}\n    const element = document.createElement('agent-ui');\n    this._agentElement = element;\n    element.config = { ...${config}, endpoint: this.endpoint, locale: this.locale, theme: this.theme, threadId: this.threadId };\n    this._agentListeners = ['agent-ready', 'thread-change', 'agent-error'].map(name => {\n      const listener = event => this.$emit(name, event.detail);\n      element.addEventListener(name, listener);\n      return [name, listener];\n    });\n    this.$refs.container.append(element);\n  },\n  watch: {\n    endpoint: 'updateAgentConfig', locale: 'updateAgentConfig', theme: 'updateAgentConfig', threadId: 'updateAgentConfig',\n  },\n  methods: {\n    updateAgentConfig() { if (this._agentElement) this._agentElement.config = { endpoint: this.endpoint, locale: this.locale, theme: this.theme, threadId: this.threadId }; },\n    disposeAgentElement() {\n      this._agentDisposed = true;\n      if (!this._agentElement) return;\n      for (const [name, listener] of this._agentListeners) this._agentElement.removeEventListener(name, listener);\n      this._agentElement.remove();\n      this._agentElement = undefined;\n    },\n  },\n  ${major === 3 ? "beforeUnmount" : "beforeDestroy"}() { this.disposeAgentElement(); },\n};\n</script>\n`;
}
function mountVue(before: string, target: string, major: 2 | 3) {
  if ((before.match(/<template(?:\s[^>]*)?>/gu) ?? []).length !== 1 || !before.includes("</template>")) fail("INTEGRATION_TARGET_FORMAT_UNSUPPORTED");
  const specifier = path.posix.relative(path.posix.dirname(target), "src/components/AgentUIBridge.vue");
  const statement = `import AgentUIBridge from ${JSON.stringify(specifier.startsWith(".") ? specifier : `./${specifier}`)};\n`;
  if (before.includes("<AgentUIBridge />") && before.includes(statement.trim())) return before;
  if (before.includes("AgentUIBridge")) fail("INTEGRATION_FILE_CONFLICT");
  let after = before;
  if (/<script\s[^>]*\bsetup\b[^>]*>/u.test(after)) after = after.replace(/(<script\s[^>]*\bsetup\b[^>]*>)/u, (_match, tag: string) => `${tag}\n${statement}`);
  else if (/<script(?:\s[^>]*)?>/u.test(after) && /export default\s*\{/u.test(after) && !/\bcomponents\s*:/u.test(after)) {
    after = after.replace(/(<script(?:\s[^>]*)?>)/u, (_match, tag: string) => `${tag}\n${statement}`).replace(/export default\s*\{/u, "export default {\n  components: { AgentUIBridge },");
  } else if (!after.includes("<script")) after += major === 3 ? `\n<script setup>\n${statement}</script>\n` : `\n<script>\n${statement}export default { components: { AgentUIBridge } };\n</script>\n`;
  else fail("INTEGRATION_TARGET_FORMAT_UNSUPPORTED");
  // Preserve the existing root, including Vue 2's single-root requirement.
  if (!/<\/[A-Za-z][\w-]*>\s*<\/template>/u.test(after)) fail("INTEGRATION_TARGET_FORMAT_UNSUPPORTED");
  return after.replace(/(<\/[A-Za-z][\w-]*>\s*<\/template>)/u, "  <AgentUIBridge />\n$1");
}

export async function planIntegrationRecipe(projectRoot: string, input: IntegrationOptions = {}, originals?: Map<string, string | null>) {
  const root = await realpath(projectRoot);
  const options = integrationOptionsSchema.parse(input);
  // Resolve the same official resource used by /install; never add a Vue installer.
  resolveOfficialResource("web-component-bridge");
  const host = await inspectIntegrationHost(root);
  if (host.framework === "react" || host.framework === "nuxt") return { status: host.framework === "react" ? "canonical-react" : "unsupported", host } as const;
  if (host.framework !== "vue" && host.toolchain !== "vite" && !input.moduleSpecifier) return { status: "module-required", host } as const;
  if (!options.targetFile) return { status: "target-required", host } as const;
  if (!host.candidates.includes(options.targetFile)) fail("INTEGRATION_TARGET_NOT_DISCOVERED");
  if (!/^(?:@agentui\/web-component\/register|\.{1,2}\/[^\s'"<>]+\.m?js|\/[^\s'"<>]+\.m?js)$/u.test(options.moduleSpecifier)) fail("INTEGRATION_MODULE_INVALID");
  // Planning is read-only: confirm the Host distribution before offering apply.
  if (host.framework === "vue" && options.moduleSpecifier === "/agent-ui.js" &&
      !await existingAsset(root, "public/agent-ui.js") && !await officialBridgeAsset()) {
    return { status: "module-required", host } as const;
  }
  const edits: IntegrationRecipe["edits"] = [];
  const add = async (file: string, operation: IntegrationRecipe["edits"][number]["operation"], render: (before: string | null) => string) => {
    await safePath(root, file);
    const before = originals?.has(file) ? originals.get(file)! : await read(root, file);
    edits.push({ file, operation, before, after: render(before) });
  };
  if (host.framework === "vue") {
    // Version declarations are facts; ambiguous ranges require explicit resolution.
    const version = host.frameworkVersion ?? "";
    const major = /^[~^]?3(?:\.|$)/u.test(version) ? 3 : /^[~^]?2(?:\.|$)/u.test(version) ? 2 : fail("INTEGRATION_VUE_VERSION_UNSUPPORTED");
    await add("src/components/AgentUIBridge.vue", "create_file", before => {
      const template = vueWrapper(options, major);
      if (before !== null && before !== template) fail("INTEGRATION_FILE_CONFLICT");
      return template;
    });
    await add(options.targetFile, "mount_component", before => mountVue(before ?? fail("INTEGRATION_TARGET_MISSING"), options.targetFile!, major));
  } else {
    const moduleFile = "agent-ui-integration.js";
    await add(moduleFile, "create_file", before => {
      const template = `${options.moduleSpecifier.startsWith("/") ? `await import(/* @vite-ignore */ ${literal(options.moduleSpecifier)});` : `import ${literal(options.moduleSpecifier)};`}\nconst element = document.createElement('agent-ui');\nelement.config = ${literal({ endpoint: options.endpoint, locale: options.locale, theme: options.theme })};\ndocument.getElementById('agent-ui-mount').append(element);\n`;
      if (before !== null && before !== template) fail("INTEGRATION_FILE_CONFLICT");
      return template;
    });
    await add(options.targetFile, "mount_component", before => {
      if (!before || !before.includes("</body>")) fail("INTEGRATION_TARGET_FORMAT_UNSUPPORTED");
      const snippet = '<div id="agent-ui-mount"></div>\n<script type="module" src="./agent-ui-integration.js"></script>\n';
      return before.includes(snippet) ? before : before.replace("</body>", `${snippet}</body>`);
    });
  }
  const recipe = { projectId: hash(root), resourceId: "web-component-bridge" as const,
    host: { framework: host.framework as "vue" | "html" | "legacy", ...(host.frameworkVersion ? { frameworkVersion: host.frameworkVersion } : {}), toolchain: host.toolchain as "vite" | "vue-cli" | "other" },
    detectedFiles: { ...(host.packageJson ? { packageJson: host.packageJson } : {}), ...(host.entryFile ? { entryFile: host.entryFile } : {}), targetFile: options.targetFile },
    integration: { mode: "web-component" as const, moduleSpecifier: options.moduleSpecifier }, options, edits,
    verification: ["expected-edits", "module-resolvable", "consumer-boundary"],
    warnings: ["COMPILED_BRIDGE_REQUIRED", "STATIC_VERIFICATION_ONLY"],
  };
  if (Buffer.byteLength(JSON.stringify(recipe), "utf8") > 40_000) fail("INTEGRATION_RECIPE_TOO_LARGE");
  return { status: "planned", host, integrationRecipe: { id: hash(JSON.stringify(recipe)), ...recipe } } as const;
}
async function validateRecipe(root: string, input: IntegrationRecipe) {
  const recipe = integrationRecipeSchema.parse(input);
  const regenerated = await planIntegrationRecipe(root, recipe.options, new Map(recipe.edits.map(edit => [edit.file, edit.before])));
  if (regenerated.status !== "planned" || JSON.stringify(regenerated.integrationRecipe) !== JSON.stringify(recipe)) fail("INTEGRATION_RECIPE_INVALID");
  return recipe;
}
// Resolve only from the development Host's installed official distribution.
// Never resolve/install the producer Source Item in the consumer workspace.
async function officialBridgeAsset() {
  try {
    const file = fileURLToPath(import.meta.resolve("@agentui/web-component/register"));
    const info = await stat(file);
    return info.isFile() && info.size > 0 ? file : undefined;
  } catch (error) {
    if (["ENOENT", "ERR_MODULE_NOT_FOUND"].includes((error as NodeJS.ErrnoException).code ?? "")) return undefined;
    throw error;
  }
}
async function existingAsset(root: string, file: string) {
  try { const info = await stat(await safePath(root, file)); return info.isFile() && info.size > 0; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
async function moduleResolvable(root: string, recipe: IntegrationRecipe) {
  const specifier = recipe.integration.moduleSpecifier;
  if (specifier === "@agentui/web-component/register") {
    // Check the ESM registration entry, without executing consumer code.
    for (let directory = root; ; directory = path.dirname(directory)) {
      try {
        const packageRoot = path.join(directory, "node_modules/@agentui/web-component");
        const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
        const entry = manifest.exports?.["./register"];
        const file = typeof entry === "string" ? entry : entry?.import;
        if (typeof file === "string" && file.startsWith("./")) { return (await stat(path.resolve(packageRoot, file))).isFile(); }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (directory === path.dirname(directory)) return false;
    }
  }
  const moduleFile = recipe.edits.find(edit => edit.operation === "create_file")!.file;
  const file = specifier.startsWith("/") ? `${recipe.host.toolchain === "vite" || recipe.host.framework === "vue" ? "public" : ""}${specifier}`.replace(/^\//u, "") : path.posix.normalize(path.posix.join(path.posix.dirname(moduleFile), specifier));
  try { return (await stat(await safePath(root, file))).isFile(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}
export async function verifyIntegrationRecipe(projectRoot: string, input: IntegrationRecipe) {
  const root = await realpath(projectRoot);
  const recipe = await validateRecipe(root, input);
  const checks = [];
  for (const edit of recipe.edits) checks.push({ id: `file:${edit.file}`, passed: await read(root, edit.file) === edit.after });
  checks.push({ id: "module-resolvable", passed: await moduleResolvable(root, recipe) });
  const manifest = JSON.parse(await read(root, "package.json") ?? "{}");
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };
  checks.push({ id: "consumer-boundary", passed: !deps["@assistant-ui/vue"] && !deps["@vitejs/plugin-react"] });
  return { status: checks.every(check => check.passed) ? "passed" : "failed", recipeId: recipe.id, checks, changedPaths: [] as string[] };
}
export async function applyIntegrationRecipe(projectRoot: string, input: IntegrationRecipe, locked = false, cancelMarker?: string) {
  const root = await realpath(projectRoot);
  const release = locked ? undefined : await acquireProjectControlLock(root);
  try {
    const recipe = await validateRecipe(root, input);
    const pending: IntegrationRecipe["edits"] = [];
    for (const edit of recipe.edits) {
      const current = await read(root, edit.file);
      if (current === edit.after) continue;
      if (current !== edit.before) fail("INTEGRATION_FILE_CONFLICT");
      pending.push(edit);
    }
    const manifest = JSON.parse(await read(root, "package.json") ?? "{}");
    const dependencies = { ...manifest.dependencies, ...manifest.devDependencies };
    if (dependencies["@assistant-ui/vue"] || dependencies["@vitejs/plugin-react"]) fail("INTEGRATION_CONSUMER_BOUNDARY_CONFLICT");
    const prepareAsset = recipe.host.framework === "vue" && recipe.integration.moduleSpecifier === "/agent-ui.js" && !await moduleResolvable(root, recipe);
    const assetSource = prepareAsset ? await officialBridgeAsset() : undefined;
    if (!await moduleResolvable(root, recipe) && !assetSource) fail("INTEGRATION_COMPILED_MODULE_REQUIRED");
    await assertCreatorCommitAllowed(root, cancelMarker);
    const committed: IntegrationRecipe["edits"] = [];
    let assetCreated = false;
    const assetFile = await safePath(root, "public/agent-ui.js");
    try {
      if (assetSource) {
        await mkdir(path.dirname(assetFile), { recursive: true });
        await assertCreatorCommitAllowed(root, cancelMarker);
        // Exclusive copy preserves a concurrently supplied distribution.
        await copyFile(assetSource, assetFile, constants.COPYFILE_EXCL);
        assetCreated = true;
      }
      for (const edit of pending) {
        await assertCreatorCommitAllowed(root, cancelMarker);
        const file = await safePath(root, edit.file);
        if (await read(root, edit.file) !== edit.before) fail("INTEGRATION_FILE_CONFLICT");
        await mkdir(path.dirname(file), { recursive: true });
        const staging = `${file}.agent-ui-${recipe.id}.tmp`;
        await writeFile(staging, edit.after, { flag: "wx" });
        try { await rename(staging, file); } catch (error) { await unlink(staging); throw error; }
        committed.push(edit);
      }
    } catch (error) {
      if (assetCreated) await unlink(assetFile);
      for (const edit of committed.reverse()) {
        const file = await safePath(root, edit.file);
        if (edit.before === null) await unlink(file); else await writeFile(file, edit.before);
      }
      throw error;
    }
    const verification = await verifyIntegrationRecipe(root, recipe);
    return { ...verification, changedPaths: [...(assetCreated ? ["public/agent-ui.js"] : []), ...pending.map(edit => edit.file)] };
  } finally { await release?.(); }
}
