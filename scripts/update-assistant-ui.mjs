import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { checkAssistantUiAgUiCompatibility } from "./check-assistant-ui-agui-compat.mjs";
import {
  checkAssistantUiLangGraphInstalledCompatibility,
  checkAssistantUiLangGraphPackageCompatibility,
  checkAssistantUiLangGraphSourceCompatibility,
} from "./check-assistant-ui-langgraph-compat.mjs";
import { checkAgUiLockfile } from "./check-ag-ui-lockfile.mjs";

const execFile = promisify(execFileCallback);
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPSTREAM_REPOSITORY = "https://github.com/assistant-ui/assistant-ui.git";
const UPSTREAM_REF = "refs/heads/main";
const SESSION_FILE = ".assistant-ui-update-session.json";

function option(name, args) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function git(repo, args, cwd) {
  return (await execFile("git", ["-C", repo, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })).stdout.trim();
}

async function latest(repoRoot, name) {
  const result = await execFile("npm", ["view", `${name}@latest`, "version", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  const value = JSON.parse(result.stdout);
  return Array.isArray(value) ? value.at(-1) : value;
}

function packageTypesEntry(manifest) {
  const resolve = (value) => {
    if (typeof value === "string") return value;
    if (value === null || typeof value !== "object") return undefined;
    for (const key of ["types", "import", "require", "node", "default"]) {
      const entry = resolve(value[key]);
      if (entry !== undefined) return entry;
    }
    return undefined;
  };
  return resolve(manifest.exports?.["."]) ?? manifest.types ?? manifest.typings;
}

async function packageArtifact(name, version, packageRoot, source) {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8"));
  if (manifest.name !== name || manifest.version !== version) {
    throw new Error(`Inspected package ${manifest.name ?? "unnamed"}@${manifest.version ?? "unknown"}, expected ${name}@${version}.`);
  }
  const typeEntry = packageTypesEntry(manifest);
  if (typeof typeEntry !== "string") {
    throw new Error(`${name}@${version} does not declare a TypeScript type entry.`);
  }
  const typesPath = path.resolve(packageRoot, typeEntry);
  const relativeTypesPath = path.relative(packageRoot, typesPath);
  if (relativeTypesPath === ".." || relativeTypesPath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTypesPath)) {
    throw new Error(`${name}@${version} declares a type entry outside its package: ${typeEntry}.`);
  }
  return {
    manifest,
    types: await readFile(typesPath, "utf8"),
    source,
  };
}

async function publishedPackageArtifact(repoRoot, name, version) {
  const destination = await mkdtemp(path.join(os.tmpdir(), "assistant-ui-npm-package-"));
  try {
    const result = await execFile("npm", [
      "pack",
      `${name}@${version}`,
      "--json",
      "--pack-destination",
      destination,
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    const packed = JSON.parse(result.stdout);
    const tarball = packed[0]?.filename;
    if (typeof tarball !== "string") throw new Error(`npm pack did not return a tarball for ${name}@${version}.`);
    const tarballPath = path.join(destination, tarball);
    await execFile("tar", ["-xzf", tarballPath, "-C", destination], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
    });
    return await packageArtifact(
      name,
      version,
      path.join(destination, "package"),
      `npm tarball ${name}@${version}`,
    );
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
}

async function installedPackageArtifact(repoRoot, name, version) {
  const packageRoot = path.join(repoRoot, "packages/runtime-conversation/node_modules", name);
  return packageArtifact(
    name,
    version,
    packageRoot,
    `installed package ${name}@${version}`,
  );
}

export async function remoteMainRevision({
  repoRoot = defaultRepoRoot,
  gitRunner = git,
} = {}) {
  const output = await gitRunner(
    repoRoot,
    ["ls-remote", UPSTREAM_REPOSITORY, UPSTREAM_REF],
    repoRoot,
  );
  const [revision] = output.split(/\s+/u);
  if (!/^[a-f0-9]{40}$/u.test(revision ?? "")) {
    throw new Error(`Unable to resolve ${UPSTREAM_REPOSITORY} ${UPSTREAM_REF}.`);
  }
  return revision;
}

async function hasCommit(repo, revision, { repoRoot = defaultRepoRoot, gitRunner = git } = {}) {
  try {
    await gitRunner(repo, ["cat-file", "-e", `${revision}^{commit}`], repoRoot);
    return true;
  } catch {
    return false;
  }
}

async function upstreamChangedFiles(repo, fromRevision, toRevision, repoRoot) {
  if (!fromRevision || fromRevision === toRevision) return [];
  try {
    const output = await git(repo, ["diff", "--name-only", `${fromRevision}..${toRevision}`], repoRoot);
    return output.split("\n").filter(Boolean).sort();
  } catch {
    return null;
  }
}

async function langGraphSourceAtRevision(repo, revision, repoRoot) {
  const [packageText, langGraphIndex, reactIndex] = await Promise.all([
    git(repo, ["show", `${revision}:packages/react-langgraph/package.json`], repoRoot),
    git(repo, ["show", `${revision}:packages/react-langgraph/src/index.ts`], repoRoot),
    git(repo, ["show", `${revision}:packages/react/src/index.ts`], repoRoot),
  ]);
  return {
    packageManifest: JSON.parse(packageText),
    langGraphIndex,
    reactIndex,
  };
}

export async function ensureSourceCache(
  repo,
  revision,
  { repoRoot = defaultRepoRoot, gitRunner = git } = {},
) {
  await gitRunner(repo, ["fetch", "origin", "main"], repoRoot);
  if (await hasCommit(repo, revision, { repoRoot, gitRunner })) return;

  try {
    await gitRunner(repo, ["fetch", "origin", revision], repoRoot);
  } catch {
    await gitRunner(repo, ["fetch", "origin", "main"], repoRoot);
  }

  if (!(await hasCommit(repo, revision, { repoRoot, gitRunner }))) {
    throw new Error(`assistant-ui source cache does not contain ${revision} after fetching origin/main.`);
  }
}

export function generatedUntrackedArtifacts(status, sessionFile = SESSION_FILE) {
  return status
    .split("\n")
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3))
    .filter((file) => file !== sessionFile)
    .sort();
}

export async function main({
  repoRoot = defaultRepoRoot,
  args = process.argv.slice(2),
  remoteRevisionResolver = remoteMainRevision,
  sourceCacheEnsurer = ensureSourceCache,
  langGraphSourceResolver = langGraphSourceAtRevision,
  latestVersionResolver = latest,
  packageArtifactResolver = publishedPackageArtifact,
  installedPackageArtifactResolver = installedPackageArtifact,
  compatibilityChecker = checkAssistantUiAgUiCompatibility,
  langGraphInstalledCompatibilityChecker = checkAssistantUiLangGraphInstalledCompatibility,
  langGraphPackageCompatibilityChecker = checkAssistantUiLangGraphPackageCompatibility,
  langGraphSourceCompatibilityChecker = checkAssistantUiLangGraphSourceCompatibility,
  lockfileChecker = checkAgUiLockfile,
  commandRunner = execFile,
} = {}) {
  const status = await git(repoRoot, ["status", "--porcelain=v1"], repoRoot);
  if (status.length > 0) {
    throw new Error([
      "assistant-ui:update requires a clean worktree.",
      "Commit or stash unrelated changes before updating assistant-ui.",
    ].join("\n"));
  }

  const targetPath = path.join(repoRoot, "assistant-ui-upgrade-target.json");
  const provenancePath = path.join(repoRoot, "packages/react/src/internal/vendor/assistant-ui/UPSTREAM.json");
  const sessionPath = path.join(repoRoot, SESSION_FILE);
  const packagePaths = [
    path.join(repoRoot, "packages/react/package.json"),
    path.join(repoRoot, "packages/runtime-conversation/package.json"),
  ];

  try {
    const baseGitSha = await git(repoRoot, ["rev-parse", "HEAD"], repoRoot);
    const target = JSON.parse(await readFile(targetPath, "utf8"));
    const previousProvenance = JSON.parse(await readFile(provenancePath, "utf8"));
    const repo = option("--repo", args) ?? process.env.ASSISTANT_UI_REPO ?? path.resolve(repoRoot, "../assistant-ui");
    const skipNpm = args.includes("--skip-npm");
    const previousAgUiCompatibility = await compatibilityChecker({
      repoRoot,
      target,
    });
    const previousLangGraphInstalledCompatibility = await langGraphInstalledCompatibilityChecker({
      repoRoot,
      target,
    });
    if (!previousLangGraphInstalledCompatibility.compatible) {
      throw new Error(previousLangGraphInstalledCompatibility.message);
    }
    const revision = await remoteRevisionResolver({ repoRoot });
    await sourceCacheEnsurer(repo, revision, { repoRoot });
    const packages = skipNpm
      ? target.packages
      : Object.fromEntries(await Promise.all(
        Object.keys(target.packages).map(async (name) => [name, await latestVersionResolver(repoRoot, name)]),
      ));
    const nextTarget = {
      ...target,
      source: `${UPSTREAM_REPOSITORY}#${UPSTREAM_REF}`,
      revision,
      packages,
    };
    // A normal latest upgrade leaves the explicitly frozen release policy.
    delete nextTarget.releasePinned;
    delete nextTarget.packageRevisions;
    const resolvePackageArtifact = skipNpm
      ? installedPackageArtifactResolver
      : packageArtifactResolver;
    const [nextLangGraphPackage, nextReactPackage] = await Promise.all([
      resolvePackageArtifact(
        repoRoot,
        "@assistant-ui/react-langgraph",
        packages["@assistant-ui/react-langgraph"],
      ),
      resolvePackageArtifact(
        repoRoot,
        "@assistant-ui/react",
        packages["@assistant-ui/react"],
      ),
    ]);
    const nextLangGraphSource = await langGraphSourceResolver(repo, revision, repoRoot);
    const nextLangGraphSourceCompatibility = await langGraphSourceCompatibilityChecker({
      ...nextLangGraphSource,
    });
    if (!nextLangGraphSourceCompatibility.compatible) {
      throw new Error(nextLangGraphSourceCompatibility.message);
    }
    const nextAgUiCompatibility = await compatibilityChecker({
      repoRoot,
      target: nextTarget,
    });
    if (!nextAgUiCompatibility.compatible) {
      throw new Error(nextAgUiCompatibility.message);
    }
    const session = {
      baseGitSha,
      fromRevision: previousProvenance.revision,
      toRevision: revision,
      previousAgUi: target.agUi,
      previousAgUiCompatibility,
      previousAssistantUiPackages: target.packages,
      previousLangGraphInstalledCompatibility,
      nextAgUiCompatibility,
      nextAssistantUiPackages: packages,
      nextLangGraphSourceCompatibility,
      agUiCompatibility: nextAgUiCompatibility,
      upstreamChangedFiles: await upstreamChangedFiles(
        repo,
        previousProvenance.revision,
        revision,
        repoRoot,
      ),
    };
    await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, "utf8");
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

    await writeFile(targetPath, `${JSON.stringify(nextTarget, null, 2)}\n`, "utf8");

    await commandRunner("pnpm", ["install", "--lockfile-only"], { cwd: repoRoot, stdio: "inherit" });
    const agUiLockfileGuard = await lockfileChecker({
      repoRoot,
      target: nextTarget,
    });
    if (!agUiLockfileGuard.passed) {
      throw new Error(agUiLockfileGuard.message);
    }
    const resolvedLangGraphPackageCompatibility = await langGraphPackageCompatibilityChecker({
      repoRoot,
      target: nextTarget,
      packageManifest: nextLangGraphPackage.manifest,
      langGraphTypes: nextLangGraphPackage.types,
      reactPackageManifest: nextReactPackage.manifest,
      reactTypes: nextReactPackage.types,
      source: `${nextLangGraphPackage.source}; ${nextReactPackage.source}`,
    });
    if (!resolvedLangGraphPackageCompatibility.compatible) {
      throw new Error(resolvedLangGraphPackageCompatibility.message);
    }
    await commandRunner("pnpm", ["--filter", "@agent-ui/react", "sync:assistant-ui-upstream", "--", "--revision", revision, "--repo", repo], {
      cwd: repoRoot,
      stdio: "inherit",
    });

    const generated = {
      ...session,
      resolvedAgUiClientVersions: agUiLockfileGuard.resolvedAgUiClientVersions,
      agUiLockfileGuard,
      nextLangGraphPackageCompatibility: resolvedLangGraphPackageCompatibility,
      generatedUntrackedArtifacts: generatedUntrackedArtifacts(
        await git(repoRoot, ["status", "--porcelain=v1"], repoRoot),
      ),
    };
    await writeFile(sessionPath, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
    await commandRunner(process.execPath, [
      path.join(repoRoot, "scripts/generate-assistant-ui-upgrade-report.mjs"),
      "--base-git-sha",
      baseGitSha,
    ], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  } finally {
    await rm(sessionPath, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
