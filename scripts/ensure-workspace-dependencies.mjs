import { accessSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnPnpmSync } from "./pnpm-process.mjs";

const workspaceRoot = fileURLToPath(new URL("..", import.meta.url));
const viteProjects = ["apps/creator-workbench", "examples/web-component-vue3"];
function missingViteEntries(root) {
  return viteProjects.filter(project => {
    try { accessSync(path.join(root, project, "node_modules/vite/bin/vite.js")); return false; }
    catch { return true; }
  });
}
export function ensureWorkspaceDependencies({ root = workspaceRoot, platform = process.platform, architecture = process.arch, nodeAbi = process.versions.modules, nodeVersion = process.versions.node, run = spawnPnpmSync } = {}) {
  const [major, minor] = nodeVersion.split(".").map(Number);
  if (!(major > 22 || (major === 22 && minor >= 12) || (major === 20 && minor >= 19))) {
    throw new Error("Creator requires Node.js 20.19+ or 22.12+. Install Node.js 20.19.0 or later in the supported range and retry pnpm dev.");
  }
  // The dev entry is plain Node, so a source-only copy can install itself before
  // any workspace package or native Vite plugin is imported.
  accessSync(path.join(root, "pnpm-lock.yaml"));
  const modules = path.join(root, "node_modules");
  const receiptFile = path.join(modules, ".agent-ui-platform.json");
  const packageManager = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).packageManager;
  const identity = { platform, architecture, nodeAbi, packageManager };
  let modulesExist = false;
  try { accessSync(modules); modulesExist = true; } catch { /* First source-only launch. */ }
  let receipt;
  try { receipt = JSON.parse(readFileSync(receiptFile, "utf8")); } catch { /* Foreign or unverified modules. */ }
  const rebuild = modulesExist && (receipt?.platform !== platform || receipt?.architecture !== architecture || receipt?.nodeAbi !== nodeAbi || receipt?.packageManager !== packageManager || missingViteEntries(root).length > 0);
  console.log("[Creator] Preparing dependencies from pnpm-lock.yaml...");
  const result = run(["install", "--frozen-lockfile", ...(rebuild ? ["--force"] : [])], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Dependency installation failed. Check your company's npm mirror configuration and retry pnpm dev.");
  const missing = missingViteEntries(root);
  if (missing.length) throw new Error(`Vite installation is incomplete in ${missing.join(", ")}. Check your company's npm mirror and retry pnpm dev.`);
  mkdirSync(modules, { recursive: true });
  writeFileSync(receiptFile, `${JSON.stringify(identity)}\n`);
}
