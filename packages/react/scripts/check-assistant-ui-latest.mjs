import { execFile as execFileCallback } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const target = JSON.parse(await readFile(path.join(repoRoot, "assistant-ui-upgrade-target.json"), "utf8"));

async function packageFiles(current) {
  const entries = await readdir(current, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      result.push(...await packageFiles(entryPath));
    } else if (entry.isFile() && entry.name === "package.json") {
      result.push(entryPath);
    }
  }
  return result;
}

async function npmLatest(name, version = "latest") {
  const result = await execFile("npm", ["view", `${name}@${version}`, "version", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  const value = JSON.parse(result.stdout);
  return Array.isArray(value) ? value.at(-1) : value;
}

const expected = target.packages;
const manifests = await packageFiles(repoRoot);
const mismatches = [];
for (const manifestPath of manifests) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const [name, version] of Object.entries(expected)) {
    const declared = manifest.dependencies?.[name] ??
      manifest.devDependencies?.[name] ??
      manifest.peerDependencies?.[name] ??
      manifest.optionalDependencies?.[name];
    if (declared !== undefined && declared !== version) {
      mismatches.push(`${path.relative(repoRoot, manifestPath)} declares ${name}=${declared}; expected ${version}`);
    }
  }
}

for (const [name, expectedVersion] of Object.entries(expected)) {
  let latest;
  try {
    latest = await npmLatest(name, target.releasePinned ? expectedVersion : "latest");
  } catch (error) {
    throw new Error(`Unable to resolve npm latest for ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (latest !== expectedVersion) {
    mismatches.push(`${name} target ${expectedVersion} is not npm latest (${latest})`);
  }
}

if (mismatches.length > 0) {
  console.error(["assistant-ui latest version guard failed:", ...mismatches].join("\n"));
  process.exitCode = 1;
} else {
  console.log("assistant-ui latest version guard: OK");
}
