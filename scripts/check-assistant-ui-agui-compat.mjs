import { execFile as execFileCallback } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE_NAME = "@assistant-ui/react-ag-ui";
const AG_UI_CLIENT = "@ag-ui/client";

function option(name, args) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parseVersion(value) {
  const match = String(value ?? "").trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u);
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareVersions(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) return left[key] < right[key] ? -1 : 1;
  }
  return 0;
}

function upperBoundForCaret(version) {
  if (version.major > 0) return { major: version.major + 1, minor: 0, patch: 0 };
  if (version.minor > 0) return { major: 0, minor: version.minor + 1, patch: 0 };
  return { major: 0, minor: 0, patch: version.patch + 1 };
}

function upperBoundForTilde(version) {
  return { major: version.major, minor: version.minor + 1, patch: 0 };
}

function satisfiesComparator(version, comparator) {
  const normalized = comparator.trim();
  if (normalized === "" || normalized === "*" || normalized.toLowerCase() === "x") return true;

  const wildcard = normalized.match(/^(\d+)(?:\.(\d+|x|X|\*))?(?:\.(\d+|x|X|\*))?$/u);
  if (wildcard) {
    if (Number(wildcard[1]) !== version.major) return false;
    if (wildcard[2] === undefined || /^[xX*]$/u.test(wildcard[2])) return true;
    if (Number(wildcard[2]) !== version.minor) return false;
    return wildcard[3] === undefined || /^[xX*]$/u.test(wildcard[3]) || Number(wildcard[3]) === version.patch;
  }

  const match = normalized.match(/^(<=|>=|<|>|=)?\s*(v?\d+\.\d+\.\d+)$/u);
  if (!match) return false;
  const requested = parseVersion(match[2]);
  if (requested === undefined) return false;
  const comparison = compareVersions(version, requested);
  switch (match[1] ?? "=") {
    case "<": return comparison < 0;
    case "<=": return comparison <= 0;
    case ">": return comparison > 0;
    case ">=": return comparison >= 0;
    default: return comparison === 0;
  }
}

function satisfiesSimpleRange(version, range) {
  const normalized = range.trim();
  if (normalized === "" || normalized === "*" || normalized.toLowerCase() === "latest") return true;

  if (normalized.startsWith("^")) {
    const base = parseVersion(normalized.slice(1));
    if (base === undefined) return false;
    return compareVersions(version, base) >= 0 &&
      compareVersions(version, upperBoundForCaret(base)) < 0;
  }
  if (normalized.startsWith("~")) {
    const base = parseVersion(normalized.slice(1));
    if (base === undefined) return false;
    return compareVersions(version, base) >= 0 &&
      compareVersions(version, upperBoundForTilde(base)) < 0;
  }

  return normalized
    .replaceAll(",", " ")
    .split(/\s+/u)
    .filter(Boolean)
    .every((comparator) => satisfiesComparator(version, comparator));
}

function satisfiesRange(version, range) {
  const parsedVersion = parseVersion(version);
  if (parsedVersion === undefined || typeof range !== "string") return false;
  return range.split("||").some((alternative) => satisfiesSimpleRange(parsedVersion, alternative));
}

async function readJsonIfPresent(filePath) {
  try {
    await access(filePath);
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readInstalledPackageManifest(repoRoot, expectedVersion, packageJsonPath) {
  const candidates = [
    packageJsonPath,
    path.join(repoRoot, "packages/runtime-conversation/node_modules/@assistant-ui/react-ag-ui/package.json"),
    path.join(repoRoot, "packages/react/node_modules/@assistant-ui/react-ag-ui/package.json"),
    path.join(repoRoot, "node_modules/@assistant-ui/react-ag-ui/package.json"),
  ].filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    const manifest = await readJsonIfPresent(candidate);
    if (
      manifest?.name === PACKAGE_NAME &&
      (expectedVersion === undefined || manifest.version === expectedVersion)
    ) {
      return { manifest, source: candidate };
    }
  }
  return undefined;
}

async function readRegistryPackageManifest(repoRoot, version) {
  if (version === undefined) return undefined;
  const result = await execFile("npm", ["view", `${PACKAGE_NAME}@${version}`, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const manifest = JSON.parse(result.stdout);
  return manifest?.name === PACKAGE_NAME ? { manifest, source: "npm registry" } : undefined;
}

export async function checkAssistantUiAgUiCompatibility({
  repoRoot = defaultRepoRoot,
  target,
  packageJsonPath,
  packageManifest,
  fetchRegistry = true,
} = {}) {
  const expectedVersion = target?.packages?.[PACKAGE_NAME];
  const pinnedClientVersion = target?.agUi?.[AG_UI_CLIENT];
  let resolved = packageManifest === undefined
    ? await readInstalledPackageManifest(repoRoot, expectedVersion, packageJsonPath)
    : { manifest: packageManifest, source: "provided package manifest" };

  if (resolved === undefined && fetchRegistry) {
    resolved = await readRegistryPackageManifest(repoRoot, expectedVersion);
  }

  const range = resolved?.manifest?.dependencies?.[AG_UI_CLIENT];
  const compatible =
    typeof pinnedClientVersion === "string" &&
    typeof range === "string" &&
    satisfiesRange(pinnedClientVersion, range);
  const status = compatible ? "PASS" : "REVIEW REQUIRED";
  const detail = resolved === undefined
    ? `Unable to read the target ${PACKAGE_NAME} package.json for ${expectedVersion ?? "the requested version"}.`
    : typeof range !== "string"
      ? `${PACKAGE_NAME} does not declare a readable dependencies["${AG_UI_CLIENT}"] range.`
      : `${PACKAGE_NAME} now expects ${AG_UI_CLIENT} ${range}`;
  const message = compatible
    ? [
        "assistant-ui AG-UI compatibility: PASS",
        `${PACKAGE_NAME}@${resolved.manifest.version} expects ${AG_UI_CLIENT} ${range}`,
        `AgentUICreator pins ${pinnedClientVersion}`,
      ].join("\n")
    : [
        "REVIEW REQUIRED:",
        detail,
        `AgentUICreator pins ${pinnedClientVersion ?? "an unknown version"}`,
        "Review CancellationAwareHttpAgent before upgrading.",
      ].join("\n");

  return {
    packageName: PACKAGE_NAME,
    reactAgUiVersion: resolved?.manifest?.version ?? expectedVersion,
    reactAgUiClientRange: typeof range === "string" ? range : undefined,
    pinnedClientVersion,
    status,
    compatible,
    source: resolved?.source,
    message,
  };
}

async function main({ repoRoot = defaultRepoRoot, args = process.argv.slice(2) } = {}) {
  const targetPath = option("--target", args) ?? path.join(repoRoot, "assistant-ui-upgrade-target.json");
  const target = JSON.parse(await readFile(targetPath, "utf8"));
  const result = await checkAssistantUiAgUiCompatibility({
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
