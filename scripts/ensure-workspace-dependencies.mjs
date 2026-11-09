import { accessSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnPnpmSync } from "./pnpm-process.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const viteProjects = ["apps/creator-workbench", "examples/creator-host-sandbox", "examples/creator-assistant-host", "examples/creator-embedded-host", "examples/web-component-vue3"];
function missingViteEntries(root) {
  return viteProjects.filter(project => {
    try { accessSync(path.join(root, project, "node_modules/vite/bin/vite.js")); return false; }
    catch { return true; }
  });
}

function workspaceProjects(root) {
  const projects = [""];
  for (const parent of ["apps", "examples", "packages"]) {
    let entries;
    try { entries = readdirSync(path.join(root, parent), { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const entry of entries) if (entry.isDirectory()) projects.push(`${parent}/${entry.name}`);
  }
  return projects.sort();
}

function dependencyState(root, projects, includeInstalled = true) {
  const hash = createHash("sha256");
  const addFile = relative => {
    hash.update(relative).update("\0");
    try { hash.update(readFileSync(path.join(root, ...relative.split("/")))); }
    catch (error) { if (error.code !== "ENOENT") throw error; hash.update("missing"); }
  };
  for (const file of ["pnpm-lock.yaml", "pnpm-workspace.yaml", ".pnpmfile.cjs", "pnpmfile.cjs", "scripts/prepare-typescript-authoring.mjs", "scripts/ensure-workspace-dependencies.mjs"]) addFile(file);
  for (const project of projects) {
    const directory = path.join(root, ...project.split("/"));
    let pkg;
    try { pkg = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    const { name, version, dependencies, devDependencies, peerDependencies, optionalDependencies, dependenciesMeta, peerDependenciesMeta, pnpm, engines, packageManager, scripts = {} } = pkg;
    hash.update(project).update(JSON.stringify({ name, version, dependencies, devDependencies, peerDependencies, optionalDependencies, dependenciesMeta, peerDependenciesMeta, pnpm, engines, packageManager,
      scripts: Object.fromEntries(["preinstall", "install", "postinstall", "prepare"].map(key => [key, scripts[key]])) }));
    addFile(path.posix.join(project, ".npmrc"));
  }
  if (includeInstalled) for (const file of ["node_modules/.modules.yaml", "node_modules/.pnpm/lock.yaml"]) addFile(file);
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  for (const file of Object.values(pkg.pnpm?.patchedDependencies ?? {}).sort()) addFile(file.replaceAll("\\", "/"));
  return hash.digest("hex");
}

function missingDependencyLinks(root, projects) {
  const missing = [];
  for (const project of projects) {
    const directory = path.join(root, ...project.split("/"));
    let pkg;
    try { pkg = JSON.parse(readFileSync(path.join(directory, "package.json"), "utf8")); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    for (const dependency of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      try { accessSync(path.join(directory, "node_modules", ...dependency.split("/"), "package.json")); }
      catch { missing.push(`${project || "."}/${dependency}`); }
    }
  }
  return missing;
}
export function ensureWorkspaceDependencies({ root = workspaceRoot, platform = process.platform, architecture = process.arch, nodeAbi = process.versions.modules, nodeVersion = process.versions.node, run = spawnPnpmSync } = {}) {
  const version = /^(22|24)\.(\d+)\.(\d+)$/u.exec(nodeVersion);
  if (!version || (version[1] === "24" && (Number(version[2]) < 22 || (Number(version[2]) === 22 && Number(version[3]) < 1)))) {
    throw new Error("Creator requires Node.js 22.x or 24.22.1 and later in the 24.x release line. Switch Node.js and retry pnpm dev.");
  }
  // The dev entry is plain Node, so a source-only copy can install itself before
  // any workspace package or native Vite plugin is imported.
  accessSync(path.join(root, "pnpm-lock.yaml"));
  const modules = path.join(root, "node_modules");
  const receiptFile = path.join(modules, ".agent-ui-platform.json");
  const packageManager = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).packageManager;
  const identity = { platform, architecture, nodeAbi, nodeVersion, packageManager };
  let modulesExist = false;
  try { accessSync(modules); modulesExist = true; } catch { /* First source-only launch. */ }
  let receipt;
  try { receipt = JSON.parse(readFileSync(receiptFile, "utf8")); } catch { /* Foreign or unverified modules. */ }
  const projects = workspaceProjects(root);
  const requested = dependencyState(root, projects, false);
  const input = dependencyState(root, projects);
  const missing = missingViteEntries(root);
  const missingLinks = missingDependencyLinks(root, projects);
  const sameIdentity = Object.entries(identity).every(([key, value]) => receipt?.[key] === value);
  if (modulesExist && sameIdentity && !missing.length && !missingLinks.length && receipt?.input === input) {
    console.log("[Creator] Reusing workspace dependencies.");
    return;
  }
  const samePlatform = ["platform", "architecture", "nodeAbi", "packageManager"].every(key => receipt?.[key] === identity[key]);
  const rebuild = modulesExist && (!samePlatform || missing.length > 0 || missingLinks.length > 0);
  console.log("[Creator] Preparing dependencies from pnpm-lock.yaml...");
  // An interrupted install must not leave a reusable success receipt.
  rmSync(receiptFile, { force: true });
  const result = run(["install", "--frozen-lockfile", ...(rebuild ? ["--force"] : [])], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Dependency installation failed. Check your company's npm mirror configuration and retry pnpm dev.");
  const incomplete = missingViteEntries(root);
  if (incomplete.length) throw new Error(`Vite installation is incomplete in ${incomplete.join(", ")}. Check your company's npm mirror and retry pnpm dev.`);
  const incompleteLinks = missingDependencyLinks(root, workspaceProjects(root));
  if (incompleteLinks.length) throw new Error(`Dependency installation is incomplete: ${incompleteLinks.join(", ")}. Retry pnpm dev.`);
  if (requested !== dependencyState(root, workspaceProjects(root), false)) throw new Error("Dependency inputs changed during installation. Retry pnpm dev.");
  mkdirSync(modules, { recursive: true });
  writeFileSync(receiptFile, `${JSON.stringify({ ...identity, input: dependencyState(root, workspaceProjects(root)) })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) ensureWorkspaceDependencies();
