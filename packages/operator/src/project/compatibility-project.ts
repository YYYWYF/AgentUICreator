import { readFile, writeFile, mkdir, rename, unlink, readdir, lstat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { createDefaultAgentUIPresetRegistry, agentUIModeRegistry, initializeAgentUIProject, validateAgentUIProjectSetup, type AgentUIMode } from "../bootstrap/index.js";
import { parseAppUIModel } from "../framework/contracts/app-ui-model";
import { loadAgentUISourceRegistry } from "../source-catalog/index.js";
import { resolveAgentUISourceItems } from "./source-registry/installer";
import { installOptionalAgentUIResource } from "./install-optional-agent-ui-resource";
import { createAgentUIInitializationHost } from "./bootstrap-host";
import { detectResourcePackageManager } from "./ensure-resource-packages.js";
import { runUpdateCommand, type UpdateCommand } from "../updates/npm-artifact.js";
import { acquireOperatorLock } from "./operator-lock";
import { digest, optionalText, readCompatibilityBinding, resolveCompatibilityConsumer, safeCompatibilityPath, compatibilityError } from "./compatibility-binding";

const SOURCE_ROOT = "src/agent-ui";
export async function planCompatibilityProject(input: { projectRoot: string; sourceRoot: string; mode: AgentUIMode }) {
  for (let directory = path.resolve(input.projectRoot); ; directory = path.dirname(directory)) {
    const manifest = await optionalText(path.join(directory, "package.json"));
    if (await optionalText(path.join(directory, "pnpm-workspace.yaml")) !== undefined || (manifest && "workspaces" in JSON.parse(manifest))) compatibilityError("AGENT_UI_COMPATIBILITY_WORKSPACE_UNSUPPORTED");
    if (directory === path.dirname(directory)) break;
  }
  const validation = await validateAgentUIProjectSetup(input);
  if (["src", "public", "node_modules", ".agent-ui", ".agentuicreator", ".git", "dist", "build"].includes(input.sourceRoot.split("/")[0] ?? "")) {
    return { ...validation, valid: false, issues: [...validation.issues, { code: "AGENT_UI_COMPATIBILITY_DIRECTORY_INVALID", message: "AGENT_UI_COMPATIBILITY_DIRECTORY_INVALID" }], compatibilityPlan: undefined };
  }
  if (!validation.valid) return { ...validation, compatibilityPlan: undefined };
  if (await readCompatibilityBinding(input.projectRoot)) compatibilityError("AGENT_UI_PROJECT_ALREADY_INITIALIZED");
  const registry = await loadAgentUISourceRegistry();
  const preset = createDefaultAgentUIPresetRegistry(parseAppUIModel).getDefaultForMode(input.mode, agentUIModeRegistry);
  const items = resolveAgentUISourceItems(registry, [...preset.sourceItems ?? [], "integration/web-component-bridge"]);
  const requirements: Record<string, string> = {};
  for (const item of items) for (const [name, version] of Object.entries(item.packages ?? {})) {
    if (requirements[name] && requirements[name] !== version) compatibilityError("AGENT_UI_COMPATIBILITY_DEPENDENCY_CONFLICT");
    requirements[name] = version;
  }
  const react = requirements.react;
  if (!react || !/^\d+\.\d+\.\d+$/.test(react)) compatibilityError("AGENT_UI_COMPATIBILITY_REACT_VERSION_REQUIRED");
  requirements["react-dom"] = react;
  const require = createRequire(import.meta.url);
  const typescript = JSON.parse(await readFile(require.resolve("typescript/package.json"), "utf8")).version as string;
  const devNames = new Set(["vite", "@vitejs/plugin-react", "@tailwindcss/vite", "tailwindcss"]);
  const dependencies = Object.fromEntries(Object.entries(requirements).filter(([name]) => !devNames.has(name)));
  const devDependencies = { ...Object.fromEntries(Object.entries(requirements).filter(([name]) => devNames.has(name))), typescript,
    "@types/react": `^${react.split(".")[0]}.0.0`, "@types/react-dom": `^${react.split(".")[0]}.0.0`, "@types/node": ">=20 <27" };
  const manager = await detectResourcePackageManager(input.projectRoot);
  if (manager !== "npm" && manager !== "pnpm") compatibilityError("AGENT_UI_COMPATIBILITY_MANAGER_UNSUPPORTED");
  const manifest = { name: "agent-ui-frontend", private: true, type: "module", scripts: {
    dev: "vite --host 127.0.0.1", typecheck: "tsc --noEmit", test: "tsc --noEmit", build: "node scripts/build.mjs",
  }, dependencies, devDependencies };
  const context = { registryHash: digest(await optionalText(path.join(input.projectRoot, ".npmrc")) ?? ""), hostPackage: await optionalText(path.join(input.projectRoot, "package.json")), hostLock: await optionalText(path.join(input.projectRoot, manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml")) };
  const plan = { producerRoot: input.sourceRoot, sourceRoot: SOURCE_ROOT, mode: input.mode, manager, dependencies, devDependencies };
  return { ...validation, compatibilityPlan: { ...plan, id: digest(JSON.stringify({ projectRoot: path.resolve(input.projectRoot), plan, manifest, context })) } };
}
export type CompatibilityPlan = NonNullable<Awaited<ReturnType<typeof planCompatibilityProject>>["compatibilityPlan"]>;

async function atomicWrite(file: string, content: string | Buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await writeFile(temp, content, { flag: "wx" }); await rename(temp, file); }
  finally { await unlink(temp).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}

/** Dependencies are installed only in the new producer; an interrupted attempt remains inspectable. */
export async function initializeCompatibilityProject(input: { projectRoot: string; sourceRoot: string; mode: AgentUIMode; planId?: string }, run: UpdateCommand = runUpdateCommand) {
  const validation = await planCompatibilityProject(input); const plan = validation.compatibilityPlan;
  if (!plan || plan.id !== input.planId) compatibilityError("AGENT_UI_COMPATIBILITY_PLAN_STALE");
  const release = await acquireOperatorLock(input.projectRoot);
  try {
    // Check again under the consumer lock before the first write.
    const check = await planCompatibilityProject(input);
    if (check.compatibilityPlan?.id !== plan.id) compatibilityError("AGENT_UI_COMPATIBILITY_PLAN_STALE");
    const producer = await safeCompatibilityPath(path.resolve(input.projectRoot), plan.producerRoot);
    await mkdir(path.join(producer, "src"), { recursive: true });
    await mkdir(path.join(producer, "scripts"));
    const manifest = { name: "agent-ui-frontend", private: true, type: "module", scripts: { dev: "vite --host 127.0.0.1", typecheck: "tsc --noEmit", test: "tsc --noEmit", build: "node scripts/build.mjs" }, dependencies: plan.dependencies, devDependencies: plan.devDependencies };
    await writeFile(path.join(producer, "package.json"), JSON.stringify(manifest, null, 2), { flag: "wx" });
    // Reuse registry credentials without persisting them into the producer.
    const npmrc = await optionalText(path.join(input.projectRoot, ".npmrc"));
    try { await run(producer, plan.manager, ["install", ...(npmrc !== undefined ? plan.manager === "pnpm" ? [`--config.userconfig=${path.join(input.projectRoot, ".npmrc")}`] : ["--userconfig", path.join(input.projectRoot, ".npmrc")] : [])]); }
    catch { compatibilityError("AGENT_UI_COMPATIBILITY_INSTALL_FAILED"); }
    await writeFile(path.join(producer, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, skipLibCheck: false, noEmit: true, resolveJsonModule: true, esModuleInterop: true, types: ["vite/client", "node"] }, include: ["src"] }, null, 2));
    await writeFile(path.join(producer, "index.html"), '<html><head><meta charset="utf-8"><style>body{margin:0}#root{height:100dvh}</style></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>');
    await writeFile(path.join(producer, "src/main.tsx"), 'import {createRoot} from "react-dom/client";\nimport {Agent} from "./agent-ui";\ncreateRoot(document.getElementById("root")!).render(<Agent />);\n');
    await writeFile(path.join(producer, "vite.config.ts"), 'import {defineConfig} from "vite";import react from "@vitejs/plugin-react";import tailwindcss from "@tailwindcss/vite";export default defineConfig({plugins:[react(),tailwindcss()]});\n');
    await writeFile(path.join(producer, "scripts/build.mjs"), 'import {spawnSync} from "node:child_process";import {createRequire} from "node:module";import path from "node:path";const require=createRequire(import.meta.url);for(const [pkg,bin,args] of [["typescript","bin/tsc",["--noEmit"]],["vite","bin/vite.js",["build","--config","src/agent-ui/integrations/web-component-bridge/vite.config.ts"]]]){const script=path.join(path.dirname(require.resolve(pkg+"/package.json")),bin);const result=spawnSync(process.execPath,[script,...args],{stdio:"inherit"});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}\n');
    await initializeAgentUIProject({ projectRoot: producer, mode: plan.mode, sourceRoot: SOURCE_ROOT }, createAgentUIInitializationHost());
    await installOptionalAgentUIResource(producer, "integration/web-component-bridge");
    // Commit reciprocal development-only links after successful initialization.
    await atomicWrite(path.join(input.projectRoot, ".agent-ui/producer.json"), JSON.stringify({ schemaVersion: 1, producerRoot: plan.producerRoot }, null, 2));
    await atomicWrite(path.join(producer, ".agent-ui/consumer.json"), JSON.stringify({ schemaVersion: 1, hostRelativePath: path.relative(producer, input.projectRoot).split(path.sep).join("/") }, null, 2));
    return { projectRoot: producer, producerRoot: plan.producerRoot };
  } finally { await release(); }
}

async function sourceDigest(root: string): Promise<string> {
  const entries: [string, string][] = [];
  async function walk(relative: string) {
    const absolute = path.join(root, relative);
    const info = await lstat(absolute);
    if (info.isSymbolicLink()) compatibilityError("AGENT_UI_COMPATIBILITY_PATH_INVALID");
    if (info.isDirectory()) { for (const name of (await readdir(absolute)).sort()) await walk(path.posix.join(relative, name)); }
    else if (info.isFile()) entries.push([relative, digest(await readFile(absolute))]);
  }
  await walk("src");
  for (const name of ["package.json", "package-lock.json", "pnpm-lock.yaml", "tsconfig.json", "vite.config.ts", "scripts/build.mjs", ...(await readdir(root)).filter(name => /^\.env(?:\.|$)/.test(name))]) {
    const source = await optionalText(path.join(root, name)); if (source !== undefined) entries.push([name, digest(source)]);
  }
  return digest(JSON.stringify(entries));
}

export async function buildCompatibilityProject(projectRoot: string, run: UpdateCommand = runUpdateCommand) {
  const binding = await resolveCompatibilityConsumer(projectRoot);
  if (!binding) compatibilityError("AGENT_UI_COMPATIBILITY_BINDING_INVALID");
  const release = await acquireOperatorLock(binding.hostRoot);
  try {
    const before = await sourceDigest(projectRoot);
    const manager = await detectResourcePackageManager(projectRoot);
    if (manager !== "npm" && manager !== "pnpm") compatibilityError("AGENT_UI_COMPATIBILITY_MANAGER_UNSUPPORTED");
    await run(projectRoot, manager, ["run", "build"]);
    if (await sourceDigest(projectRoot) !== before) compatibilityError("AGENT_UI_COMPATIBILITY_BUILD_STALE");
    const output = await safeCompatibilityPath(projectRoot, "dist/agent-ui-web-component/agent-ui.js");
    const bytes = await readFile(output);
    if (!bytes.length) compatibilityError("AGENT_UI_COMPATIBILITY_BUILD_EMPTY");
    const target = await safeCompatibilityPath(binding.hostRoot, "public/agent-ui.js");
    const existing = await optionalText(target);
    if (existing !== undefined && digest(existing) !== binding.publishedHash) compatibilityError("AGENT_UI_COMPATIBILITY_ASSET_CONFLICT");
    await atomicWrite(target, bytes);
    await atomicWrite(path.join(binding.hostRoot, ".agent-ui/producer.json"), JSON.stringify({ schemaVersion: 1, producerRoot: binding.producerRoot, publishedHash: digest(bytes) }, null, 2));
    await atomicWrite(path.join(projectRoot, ".agent-ui/published-build.json"), JSON.stringify({ sourceDigest: before, bundleHash: digest(bytes) }, null, 2));
    return { status: "passed", bundleHash: digest(bytes), target: "public/agent-ui.js" };
  } finally { await release(); }
}

export async function compatibilityArtifactReady(hostRoot: string) {
  const binding = await readCompatibilityBinding(hostRoot);
  if (!binding) return undefined;
  const record = await optionalText(path.join(binding.projectRoot, ".agent-ui/published-build.json"));
  const asset = await optionalText(await safeCompatibilityPath(binding.hostRoot, "public/agent-ui.js"));
  if (!record || !asset || digest(asset) !== binding.publishedHash) return false;
  const parsed = JSON.parse(record) as { sourceDigest?: string; bundleHash?: string };
  return parsed.bundleHash === binding.publishedHash && parsed.sourceDigest === await sourceDigest(binding.projectRoot);
}
