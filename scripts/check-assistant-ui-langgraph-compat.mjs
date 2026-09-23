import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LANGGRAPH_PACKAGE = "@assistant-ui/react-langgraph";
const REACT_PACKAGE = "@assistant-ui/react";
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

function resolveTypesEntry(value) {
  if (typeof value === "string") return value;
  if (value === null || typeof value !== "object") return undefined;
  for (const key of ["types", "import", "require", "node", "default"]) {
    const entry = resolveTypesEntry(value[key]);
    if (entry !== undefined) return entry;
  }
  return undefined;
}

function packageTypesEntry(manifest) {
  return resolveTypesEntry(manifest.exports?.["."]) ?? manifest.types ?? manifest.typings;
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
  const typeEntry = packageTypesEntry(manifest);
  const typePath = typeEntry === undefined ? undefined : path.join(packageRoot, typeEntry);
  if (typePath === undefined) throw new Error(`${LANGGRAPH_PACKAGE} does not declare a TypeScript type entry.`);
  const langGraphTypes = await readFile(typePath, "utf8");
  const reactRoot = path.join(repoRoot, "packages/runtime-conversation/node_modules/@assistant-ui/react");
  const reactManifest = await readJson(path.join(reactRoot, "package.json"));
  const reactTypeEntry = packageTypesEntry(reactManifest);
  if (reactTypeEntry === undefined) throw new Error(`${REACT_PACKAGE} does not declare a TypeScript type entry.`);
  const reactTypesPath = path.join(reactRoot, reactTypeEntry);
  const reactTypes = await readFile(reactTypesPath, "utf8");
  return {
    manifest,
    langGraphTypes,
    langGraphIndex: langGraphTypes,
    reactManifest,
    reactTypes,
    source: packageRoot,
  };
}

function inspectLangGraphExports(inputs) {
  const exportsName = (source, name) => {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\bexport\\s+(?:type\\s+)?\\{[^}]*\\b${escapedName}\\b[^}]*\\}`, "su").test(source);
  };
  const exports = {
    convertLangChainMessages: exportsName(inputs.langGraphIndex, "convertLangChainMessages"),
    LangChainMessage: exportsName(inputs.langGraphIndex, "LangChainMessage"),
    unstable_convertExternalMessages: exportsName(inputs.reactIndex, "unstable_convertExternalMessages"),
  };
  const reasons = [];
  if (!exports.convertLangChainMessages) {
    reasons.push(`${LANGGRAPH_PACKAGE} does not export convertLangChainMessages.`);
  }
  if (!exports.LangChainMessage) {
    reasons.push(`${LANGGRAPH_PACKAGE} does not export LangChainMessage.`);
  }
  if (!exports.unstable_convertExternalMessages) {
    reasons.push("@assistant-ui/react does not export unstable_convertExternalMessages.");
  }
  return { exports, reasons };
}

function inspectLangGraphApi(inputs) {
  const dependencies = inputs.manifest.dependencies ?? {};
  const { exports, reasons } = inspectLangGraphExports(inputs);
  if (inputs.manifest.name !== LANGGRAPH_PACKAGE) {
    reasons.push(`Inspected package is ${inputs.manifest.name ?? "unnamed"}, expected ${LANGGRAPH_PACKAGE}.`);
  }
  const missingDependencies = REQUIRED_DEPENDENCIES.filter((name) => typeof dependencies[name] !== "string");
  if (missingDependencies.length > 0) {
    reasons.push(`${LANGGRAPH_PACKAGE} is missing required dependency declarations: ${missingDependencies.join(", ")}.`);
  }
  return { exports, dependencies, reasons };
}

function failedInspection(error, source) {
  const reason = error instanceof Error ? error.message : String(error);
  return {
    packageName: LANGGRAPH_PACKAGE,
    status: "REVIEW REQUIRED",
    compatible: false,
    source,
    exports: {
      convertLangChainMessages: false,
      LangChainMessage: false,
      unstable_convertExternalMessages: false,
    },
    reasons: [reason],
    message: `REVIEW REQUIRED: unable to inspect ${LANGGRAPH_PACKAGE}.\n- ${reason}`,
  };
}

export async function checkAssistantUiLangGraphSourceCompatibility({
  sourceRepo,
  packageManifest,
  langGraphIndex,
  reactIndex,
} = {}) {
  try {
    const inputs = packageManifest === undefined
      ? await sourceInputs(sourceRepo)
      : {
          manifest: packageManifest,
          langGraphIndex: langGraphIndex ?? "",
          reactIndex: reactIndex ?? "",
          source: sourceRepo ?? "provided assistant-ui source",
        };
    if (inputs === undefined) {
      throw new Error("assistant-ui source repository was not provided.");
    }
    const inspection = inspectLangGraphApi(inputs);
    const compatible = inspection.reasons.length === 0;
    return {
      packageName: LANGGRAPH_PACKAGE,
      exports: inspection.exports,
      dependencies: Object.fromEntries(REQUIRED_DEPENDENCIES.map((name) => [name, inspection.dependencies[name]])),
      status: compatible ? "PASS" : "REVIEW REQUIRED",
      compatible,
      source: inputs.source,
      reasons: inspection.reasons,
      message: compatible
        ? `${LANGGRAPH_PACKAGE} source API compatibility: PASS`
        : ["REVIEW REQUIRED:", ...inspection.reasons.map((reason) => `- ${reason}`)].join("\n"),
    };
  } catch (error) {
    return failedInspection(error, sourceRepo);
  }
}

export async function checkAssistantUiLangGraphPackageCompatibility({
  repoRoot = defaultRepoRoot,
  target,
  packageManifest,
  langGraphTypes,
  reactPackageManifest,
  reactTypes,
  lockfileText,
  source = "published npm package artifacts",
  inspectionKind = "Published",
} = {}) {
  const expectedVersion = target?.packages?.[LANGGRAPH_PACKAGE];
  const expectedReactVersion = target?.packages?.[REACT_PACKAGE];
  if (packageManifest === undefined) {
    return {
      packageName: LANGGRAPH_PACKAGE,
      expectedVersion,
      status: "REVIEW REQUIRED",
      compatible: false,
      source,
      exports: {
        convertLangChainMessages: false,
        LangChainMessage: false,
        unstable_convertExternalMessages: false,
      },
      reasons: ["Published package manifest was not provided."],
      message: "REVIEW REQUIRED: published package manifest was not provided.",
    };
  }
  const apiInspection = inspectLangGraphExports({
    langGraphIndex: langGraphTypes ?? "",
    reactIndex: reactTypes ?? "",
  });
  let resolvedLockfile;
  try {
    resolvedLockfile = lockfileText ?? await readFile(path.join(repoRoot, "pnpm-lock.yaml"), "utf8");
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      packageName: LANGGRAPH_PACKAGE,
      expectedVersion,
      status: "REVIEW REQUIRED",
      compatible: false,
      source,
      exports: apiInspection.exports,
      reasons: [reason],
      message: `REVIEW REQUIRED: unable to inspect pnpm-lock.yaml.\n- ${reason}`,
    };
  }

  const manifest = packageManifest;
  const dependencies = manifest.dependencies ?? {};
  const lockfileResolvedVersions = Object.fromEntries(
    REQUIRED_DEPENDENCIES.concat(LANGGRAPH_PACKAGE, REACT_PACKAGE).map((name) => [
      name,
      collectLockfileVersions(resolvedLockfile, name),
    ]),
  );
  const snapshotDependencies = typeof expectedVersion === "string"
    ? collectLangGraphSnapshotDependencies(resolvedLockfile, expectedVersion)
    : [];
  const resolvedDependencies = Object.fromEntries(REQUIRED_DEPENDENCIES.map((name) => [
    name,
    [...new Set(snapshotDependencies.map((dependencies) => dependencies[name]).filter(Boolean))],
  ]));
  const reasons = [];
  const langGraphIdentity = `${LANGGRAPH_PACKAGE}@${manifest.version ?? "unknown"}`;
  const reactIdentity = `${REACT_PACKAGE}@${reactPackageManifest?.version ?? "unknown"}`;

  if (typeof expectedVersion !== "string") {
    reasons.push(`assistant-ui-upgrade-target.json does not pin ${LANGGRAPH_PACKAGE}.`);
  }
  if (manifest.name !== LANGGRAPH_PACKAGE) {
    reasons.push(`Inspected package is ${manifest.name ?? "unnamed"}, expected ${LANGGRAPH_PACKAGE}.`);
  }
  if (manifest.version !== expectedVersion) {
    reasons.push(`Inspected package version ${manifest.version ?? "unknown"} does not match pinned ${expectedVersion ?? "unknown"}.`);
  }
  if (typeof langGraphTypes !== "string" || langGraphTypes.length === 0) {
    reasons.push(`${inspectionKind} ${langGraphIdentity} type declarations were not provided.`);
  }
  if (!apiInspection.exports.convertLangChainMessages) {
    reasons.push(`${inspectionKind} ${langGraphIdentity} does not export convertLangChainMessages.`);
  }
  if (!apiInspection.exports.LangChainMessage) {
    reasons.push(`${inspectionKind} ${langGraphIdentity} does not export LangChainMessage.`);
  }
  if (reactPackageManifest === undefined) {
    reasons.push(`${REACT_PACKAGE} package manifest was not provided.`);
  } else {
    if (reactPackageManifest.name !== REACT_PACKAGE) {
      reasons.push(`Inspected package is ${reactPackageManifest.name ?? "unnamed"}, expected ${REACT_PACKAGE}.`);
    }
    if (typeof expectedReactVersion !== "string") {
      reasons.push(`assistant-ui-upgrade-target.json does not pin ${REACT_PACKAGE}.`);
    }
    if (reactPackageManifest.version !== expectedReactVersion) {
      reasons.push(`Inspected package version ${reactPackageManifest.version ?? "unknown"} does not match pinned ${expectedReactVersion ?? "unknown"}.`);
    }
  }
  if (typeof reactTypes !== "string" || reactTypes.length === 0) {
    reasons.push(`${inspectionKind} ${reactIdentity} type declarations were not provided.`);
  }
  if (!apiInspection.exports.unstable_convertExternalMessages) {
    reasons.push(`${inspectionKind} ${reactIdentity} does not export unstable_convertExternalMessages.`);
  }
  const missingDependencies = REQUIRED_DEPENDENCIES.filter((name) => typeof dependencies[name] !== "string");
  if (missingDependencies.length > 0) {
    reasons.push(`${LANGGRAPH_PACKAGE} is missing required dependency declarations: ${missingDependencies.join(", ")}.`);
  }
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
  if (typeof expectedVersion === "string" && !lockfileLangGraphVersions.includes(expectedVersion)) {
    reasons.push(`pnpm-lock.yaml does not resolve ${LANGGRAPH_PACKAGE}@${expectedVersion}.`);
  }
  const lockfileReactVersions = lockfileResolvedVersions[REACT_PACKAGE] ?? [];
  if (typeof expectedReactVersion === "string" && !lockfileReactVersions.includes(expectedReactVersion)) {
    reasons.push(`pnpm-lock.yaml does not resolve ${REACT_PACKAGE}@${expectedReactVersion}.`);
  }

  const compatible = reasons.length === 0;
  return {
    packageName: LANGGRAPH_PACKAGE,
    packageVersion: manifest.version,
    reactPackageVersion: reactPackageManifest?.version,
    expectedVersion,
    dependencies: Object.fromEntries(REQUIRED_DEPENDENCIES.map((name) => [name, dependencies[name]])),
    exports: apiInspection.exports,
    lockfileResolvedVersions,
    resolvedDependencies,
    status: compatible ? "PASS" : "REVIEW REQUIRED",
    compatible,
    source,
    reasons,
    message: compatible
      ? `${LANGGRAPH_PACKAGE} package compatibility: PASS (${manifest.version})`
      : ["REVIEW REQUIRED:", ...reasons.map((reason) => `- ${reason}`)].join("\n"),
  };
}

export async function checkAssistantUiLangGraphInstalledCompatibility({
  repoRoot = defaultRepoRoot,
  target,
  packageJsonPath,
  packageManifest,
  langGraphIndex,
  reactIndex,
  langGraphTypes,
  reactPackageManifest,
  reactTypes,
  lockfileText,
} = {}) {
  let inputs;
  try {
    inputs = packageManifest === undefined
      ? await installedInputs(repoRoot, packageJsonPath)
      : {
          manifest: packageManifest,
          langGraphIndex: langGraphTypes ?? langGraphIndex ?? "",
          langGraphTypes: langGraphTypes ?? langGraphIndex ?? "",
          reactManifest: reactPackageManifest,
          reactTypes: reactTypes ?? reactIndex ?? "",
          source: packageJsonPath ?? "provided installed package",
        };
  } catch (error) {
    return { ...failedInspection(error, packageJsonPath), expectedVersion: target?.packages?.[LANGGRAPH_PACKAGE] };
  }

  const packageCompatibility = await checkAssistantUiLangGraphPackageCompatibility({
    repoRoot,
    target,
    packageManifest: inputs.manifest,
    langGraphTypes: inputs.langGraphTypes ?? inputs.langGraphIndex,
    reactPackageManifest: inputs.reactManifest,
    reactTypes: inputs.reactTypes ?? inputs.reactIndex,
    lockfileText,
    source: inputs.source,
    inspectionKind: "Installed",
  });
  return {
    ...packageCompatibility,
    message: packageCompatibility.compatible
      ? `${LANGGRAPH_PACKAGE} installed compatibility: PASS (${inputs.manifest.version})`
      : ["REVIEW REQUIRED:", ...packageCompatibility.reasons.map((reason) => `- ${reason}`)].join("\n"),
  };
}

async function main({ repoRoot = defaultRepoRoot, args = process.argv.slice(2) } = {}) {
  const targetPath = option("--target", args) ?? path.join(repoRoot, "assistant-ui-upgrade-target.json");
  const target = await readJson(targetPath);
  const result = await checkAssistantUiLangGraphInstalledCompatibility({
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
