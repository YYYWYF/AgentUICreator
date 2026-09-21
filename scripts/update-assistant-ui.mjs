import { execFile as execFileCallback } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(repoRoot, "assistant-ui-upgrade-target.json");
const UPSTREAM_REPOSITORY = "https://github.com/assistant-ui/assistant-ui.git";
const UPSTREAM_REF = "refs/heads/main";
const packagePaths = [
  path.join(repoRoot, "packages/react/package.json"),
  path.join(repoRoot, "packages/runtime-conversation/package.json"),
];

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function latest(name) {
  const result = await execFile("npm", ["view", `${name}@latest`, "version", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  const value = JSON.parse(result.stdout);
  return Array.isArray(value) ? value.at(-1) : value;
}

async function git(repo, args) {
  return (await execFile("git", ["-C", repo, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })).stdout.trim();
}

async function remoteMainRevision() {
  const output = await git(repoRoot, ["ls-remote", UPSTREAM_REPOSITORY, UPSTREAM_REF]);
  const [revision] = output.split(/\s+/u);
  if (!/^[a-f0-9]{40}$/u.test(revision ?? "")) {
    throw new Error(`Unable to resolve ${UPSTREAM_REPOSITORY} ${UPSTREAM_REF}.`);
  }
  return revision;
}

async function hasCommit(repo, revision) {
  try {
    await git(repo, ["cat-file", "-e", `${revision}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function ensureSourceCache(repo, revision) {
  await git(repo, ["fetch", "origin", "main"]);
  if (await hasCommit(repo, revision)) return;

  try {
    await git(repo, ["fetch", "origin", revision]);
  } catch {
    await git(repo, ["fetch", "origin", "main"]);
  }

  if (!(await hasCommit(repo, revision))) {
    throw new Error(`assistant-ui source cache does not contain ${revision} after fetching origin/main.`);
  }
}

const target = JSON.parse(await readFile(targetPath, "utf8"));
const repo = option("--repo") ?? process.env.ASSISTANT_UI_REPO ?? path.resolve(repoRoot, "../assistant-ui");
const skipNpm = process.argv.includes("--skip-npm");
const revision = await remoteMainRevision();
await ensureSourceCache(repo, revision);
const packages = skipNpm
  ? target.packages
  : Object.fromEntries(await Promise.all(
    Object.keys(target.packages).map(async (name) => [name, await latest(name)]),
  ));
for (const packagePath of packagePaths) {
  const manifest = JSON.parse(await readFile(packagePath, "utf8"));
  for (const [name, version] of Object.entries(packages)) {
    for (const dependencyField of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      if (manifest[dependencyField]?.[name] !== undefined) manifest[dependencyField][name] = version;
    }
  }
  await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

const workspacePath = path.join(repoRoot, "pnpm-workspace.yaml");
let workspace = await readFile(workspacePath, "utf8");
for (const [name, version] of Object.entries(packages)) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  workspace = workspace.replace(
    new RegExp(`(${escapedName}@)[^\\n'\"]+(['\"])`, "u"),
    `$1${version}$2`,
  );
}
await writeFile(workspacePath, workspace, "utf8");

const nextTarget = {
  ...target,
  source: `${UPSTREAM_REPOSITORY}#${UPSTREAM_REF}`,
  revision,
  packages,
};
await writeFile(targetPath, `${JSON.stringify(nextTarget, null, 2)}\n`, "utf8");

await execFile("pnpm", ["install", "--lockfile-only"], { cwd: repoRoot, stdio: "inherit" });
await execFile("pnpm", ["--filter", "@agent-ui/react", "sync:assistant-ui-upstream", "--", "--revision", revision, "--repo", repo], {
  cwd: repoRoot,
  stdio: "inherit",
});
await execFile(process.execPath, ["scripts/generate-assistant-ui-upgrade-report.mjs"], {
  cwd: repoRoot,
  stdio: "inherit",
});
