import { lstat, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sandboxRoot = fileURLToPath(new URL("..", import.meta.url));
const allowedTargets = [".agent-ui", "src/agent-ui"];

async function rejectLinksRecursively(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    const stat = await lstat(entryPath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Reset refused symbolic link inside generated content: ${entryPath}`);
    }
    if (stat.isDirectory()) await rejectLinksRecursively(entryPath);
  }
}

async function main() {
  const root = await realpath(sandboxRoot);
  const targets = [];
  for (const relativePath of allowedTargets) {
    const target = path.join(root, relativePath);
    const expectedParent = path.dirname(target);
    const actualParent = await realpath(expectedParent);
    if (actualParent !== expectedParent ||
        (actualParent !== root && !actualParent.startsWith(`${root}${path.sep}`))) {
      throw new Error(`Reset refused unsafe parent: ${relativePath}`);
    }
    let stat;
    try {
      stat = await lstat(target);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(target) !== target) {
      throw new Error(`Reset refused unsafe target: ${relativePath}`);
    }
    await rejectLinksRecursively(target);
    targets.push(target);
  }
  for (const target of targets) await rm(target, { recursive: true });
  console.log("Removed sandbox Agent UI source and metadata. Host-owned files were preserved.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
