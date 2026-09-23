import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGGRAPH_PACKAGE = "@assistant-ui/react-langgraph";
const REQUIRED_DEPENDENCIES = [
  "@assistant-ui/core",
  "@assistant-ui/react-langchain",
  "@assistant-ui/store",
  "assistant-stream",
];

function option(name, args) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function collectLockfileVersions(lockfileText, packageName) {
  const versions = new Set();
  for (const line of String(lockfileText ?? "").split(/\r?\n/u)) {
    const key = line.trim().replace(/^['"]|['"]:$/gu, "");
    const prefix = `${packageName}@`;
    if (!key.startsWith(prefix)) continue;
    const version = key.slice(prefix.length).split(/[(:]/u, 1)[0];
    if (version) versions.add(version);
  }
  return [...versions].sort();
}

function collectLangGraphSnapshotDependencies(lockfileText, packageVersion) {
  const lines = String(lockfileText ?? "").split(/\r?\n/u);
  const snapshotsIndex = lines.findIndex((line) => line.trim() === "snapshots:");
  if (snapshotsIndex < 0) return [];
  const escapedName = LANGGRAPH_PACKAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^${escapedName}@${String(packageVersion).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\(|$)`, "u");
  const results = [];

  for (let index = snapshotsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!line.startsWith("  ") || line.startsWith("    ")) continue;
    const key = line.trim().replace(/^['"]|['"]:$/gu, "");
    if (!heading.test(key)) continue;
    const dependencies = {};
    let inDependencies = false;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nestedLine = lines[cursor] ?? "";
      if (nestedLine.startsWith("  ") && !nestedLine.startsWith("    ")) break;
      if (nestedLine === "    dependencies:") {
        inDependencies = true;
        continue;
      }
      if (inDependencies && nestedLine.startsWith("    ") && !nestedLine.startsWith("      ")) {
        inDependencies = false;
      }
      if (!inDependencies) continue;
      const dependency = nestedLine.match(/^      (?:'([^']+)'|"([^"]+)"|([^:]+)):\s+([^\s(]+)/u);
      if (dependency) {
        const name = dependency[1] ?? dependency[2] ?? dependency[3]?.trim();
        const version = dependency[4];
        if (name && version) dependencies[name] = version;
      }
    }
    results.push(dependencies);
  }
  return results;
}

function parseVersion(value) {
  const match = String(value ?? "").match(/^(\d+)\.(\d+)\.(\d+)/u);
  return match === null
    ? undefined
    : { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compareVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return 0;
}

function satisfiesRange(version, range) {
  const parsedVersion = parseVersion(version);
  if (parsedVersion === undefined || typeof range !== "string") return false;
  const normalized = range.trim();
  if (normalized === "*" || normalized === "latest") return true;
  if (normalized.startsWith("^") || normalized.startsWith("~")) {
    const base = parseVersion(normalized.slice(1));
    if (base === undefined || compareVersions(parsedVersion, base) < 0) return false;
    const upper = normalized.startsWith("^")
      ? base.major > 0
        ? { major: base.major + 1, minor: 0, patch: 0 }
        : base.minor > 0
          ? { major: 0, minor: base.minor + 1, patch: 0 }
          : { major: 0, minor: 0, patch: base.patch + 1 }
      : { major: base.major, minor: base.minor + 1, patch: 0 };
    return compareVersions(parsedVersion, upper) < 0;
  }
  return compareVersions(parsedVersion, parseVersion(normalized) ?? { major: -1, minor: -1, patch: -1 }) === 0;
}

async function sourceInputs(sourceRepo) {
  if (sourceRepo === undefined) return undefined;
  const packageRoot = path.join(sourceRepo, "packages/react-langgraph");
  return {
    manifest: await readJson(path.join(packageRoot, "package.json")),
    langGraphIndex: await readFile(path.join(packageRoot, "src/index.ts"), "utf8"),
    reactIndex: await readFile(path.join(sourceRepo, "packages/react/src/index.ts"), "utf8"),
    source: packageRoot,
  };
}

async function installedInputs(repoRoot, packageJsonPath) {
  const packageRoot = path.dirname(packageJsonPath ?? path.join(
    repoRoot,
    "packages/runtime-conversation/node_modules/@assistant-ui/react-langgraph/package.json",
  ));
  const manifest = await readJson(packageJsonPath ?? path.join(packageRoot, "package.json"));
  const typeEntry = manifest.exports?.["."]?.types ?? manifest.types;
  const typePath = typeEntry === undefined ? undefined : path.join(packageRoot, typeEntry);
  const langGraphTypes = typePath === undefined ? "" : await readFile(typePath, "utf8");
  const reactManifest = await readJson(path.join(
    repoRoot,
    "packages/runtime-conversation/node_modules/@assistant-ui/react/package.json",
  ));
  const reactTypesPath = path.join(
    repoRoot,
    "packages/runtime-conversation/node_modules/@assistant-ui/react",
    reactManifest.types ?? "dist/index.d.ts",
  );
  return {
    manifest,
    langGraphIndex: langGraphTypes,
    reactIndex: await readFile(reactTypesPath, "utf8"),
    source: packageRoot,
  };
}

export async function checkAssistantUiLangGraphCompatibility({
  repoRoot = defaultRepoRoot,
  target,
  sourceRepo,
  packageJsonPath,
  packageManifest,
  langGraphIndex,
  reactIndex,
  lockfileText,
  checkLockfile = true,
} = {}) {
  const expectedVersion = target?.packages?.[LANGGRAPH_PACKAGE];
  let inputs;
  try {
    inputs = packageManifest === undefined
      ? sourceRepo === undefined
        ? await installedInputs(repoRoot, packageJsonPath)
        : await sourceInputs(sourceRepo)
      : {
          manifest: packageManifest,
          langGraphIndex: langGraphIndex ?? "",
          reactIndex: reactIndex ?? "",
          source: packageJsonPath ?? "provided package manifest",
        };
  } catch (error) {
    return {
      packageName: LANGGRAPH_PACKAGE,
      expectedVersion,
      status: "REVIEW REQUIRED",
      compatible: false,
      source: sourceRepo ?? packageJsonPath,
      reasons: [error instanceof Error ? error.message : String(error)],
      message: `REVIEW REQUIRED: unable to inspect ${LANGGRAPH_PACKAGE}.`,
    };
  }

  const resolvedLockfile = checkLockfile
    ? lockfileText ?? await readFile(path.join(repoRoot, "pnpm-lock.yaml"), "utf8")
    : "";
  const manifest = inputs.manifest;
  const dependencies = manifest.dependencies ?? {};
  const lockfileResolvedVersions = Object.fromEntries(
    REQUIRED_DEPENDENCIES.concat(LANGGRAPH_PACKAGE).map((name) => [
      name,
      collectLockfileVersions(resolvedLockfile, name),
    ]),
  );
  const snapshotDependencies = checkLockfile
    ? collectLangGraphSnapshotDependencies(resolvedLockfile, expectedVersion)
    : [];
  const resolvedDependencies = Object.fromEntries(REQUIRED_DEPENDENCIES.map((name) => [
    name,
    [...new Set(snapshotDependencies.map((dependencies) => dependencies[name]).filter(Boolean))],
  ]));
  const reasons = [];
  if (typeof expectedVersion !== "string") {
    reasons.push(`assistant-ui-upgrade-target.json does not pin ${LANGGRAPH_PACKAGE}.`);
  }
  if (manifest.name !== LANGGRAPH_PACKAGE) {
    reasons.push(`Inspected package is ${manifest.name ?? "unnamed"}, expected ${LANGGRAPH_PACKAGE}.`);
  }
  if (manifest.version !== expectedVersion) {
    reasons.push(`Inspected package version ${manifest.version ?? "unknown"} does not match pinned ${expectedVersion ?? "unknown"}.`);
  }
  if (!inputs.langGraphIndex.includes("convertLangChainMessages")) {
    reasons.push(`${LANGGRAPH_PACKAGE} does not export convertLangChainMessages.`);
  }
  if (!inputs.langGraphIndex.includes("LangChainMessage")) {
    reasons.push(`${LANGGRAPH_PACKAGE} does not export LangChainMessage.`);
  }
  if (!inputs.reactIndex.includes("unstable_convertExternalMessages")) {
    reasons.push("@assistant-ui/react does not export unstable_convertExternalMessages.");
  }

  const missingDependencies = REQUIRED_DEPENDENCIES.filter((name) => typeof dependencies[name] !== "string");
  if (missingDependencies.length > 0) {
    reasons.push(`${LANGGRAPH_PACKAGE} is missing required dependency declarations: ${missingDependencies.join(", " )}.`);
  }
  if (checkLockfile) {
    if (snapshotDependencies.length === 0) {
      reasons.push(`pnpm-lock.yaml has no ${LANGGRAPH_PACKAGE}@${expectedVersion ?? "unknown"} dependency snapshot.`);
    }
    for (const name of REQUIRED_DEPENDENCIES) {
      const range = dependencies[name];
      const versions = resolvedDependencies[name] ?? [];
      if (typeof range === "string" && (
        versions.length === 0 || versions.some((version) => !satisfiesRange(version, range))
      )) {
        reasons.push(`${LANGGRAPH_PACKAGE} lockfile snapshot resolves ${name} as ${versions.join(", ") || "missing"}, outside ${range}.`);
      }
    }
    const lockfileLangGraphVersions = lockfileResolvedVersions[LANGGRAPH_PACKAGE] ?? [];
    if (!lockfileLangGraphVersions.includes(expectedVersion)) {
      reasons.push(`pnpm-lock.yaml does not resolve ${LANGGRAPH_PACKAGE}@${expectedVersion ?? "unknown"}.`);
    }
  }

  const compatible = reasons.length === 0;
  return {
    packageName: LANGGRAPH_PACKAGE,
    packageVersion: manifest.version,
    expectedVersion,
    dependencies: Object.fromEntries(REQUIRED_DEPENDENCIES.map((name) => [name, dependencies[name]])),
    lockfileResolvedVersions,
    resolvedDependencies,
    status: compatible ? "PASS" : "REVIEW REQUIRED",
    compatible,
    source: inputs.source,
    reasons,
    message: compatible
      ? `${LANGGRAPH_PACKAGE} history compatibility: PASS (${manifest.version})`
      : ["REVIEW REQUIRED:", ...reasons.map((reason) => `- ${reason}`)].join("\n"),
  };
}

async function main({ repoRoot = defaultRepoRoot, args = process.argv.slice(2) } = {}) {
  const targetPath = option("--target", args) ?? path.join(repoRoot, "assistant-ui-upgrade-target.json");
  const target = await readJson(targetPath);
  const result = await checkAssistantUiLangGraphCompatibility({
    repoRoot,
    target,
    packageJsonPath: option("--package-json", args),
  });
  if (result.compatible) console.log(result.message);
  else {
    console.error(result.message);
    process.exitCode = 1;
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
