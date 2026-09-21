import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const vendorRoot = path.join(packageRoot, "src/internal/vendor/assistant-ui");
const targetPath = path.join(repoRoot, "assistant-ui-upgrade-target.json");
const manifestPath = path.join(vendorRoot, "upstream-elements.json");
const provenancePath = path.join(vendorRoot, "UPSTREAM.json");
const lockPath = path.join(vendorRoot, "assistant-ui-upstream.lock.json");
const reportPath = path.join(repoRoot, "assistant-ui-upgrade-report.json");

const SOURCE = "https://r.assistant-ui.com";
const STYLE = "base-nova";
const UPSTREAM_REPOSITORY = "https://github.com/assistant-ui/assistant-ui.git";
const UPSTREAM_ELEMENT_ROOT = "packages/ui/src/components/react/assistant-ui/elements";
const ELEMENT_PREFIX = "components/assistant-ui/elements/";
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs"];
const ELEMENT_FILE_PATTERN = /\.(?:tsx)$/u;
const TEST_FILE_PATTERN = /\.(?:test|spec)\.tsx$/u;
const UNADOPTED_ELEMENT_RATIONALE =
  "Not adopted into the tracked vendor set; adoption requires an explicit ownership decision and product contract review.";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function git(repo, args) {
  const result = await execFile("git", ["-C", repo, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function gitShow(repo, revision, upstreamPath) {
  const result = await execFile("git", ["-C", repo, "show", `${revision}:${upstreamPath}`], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return result.stdout;
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function hasCommit(repo, revision) {
  try {
    await git(repo, ["cat-file", "-e", `${revision}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

async function ensureRevision(repo, revision) {
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

async function upstreamFiles(repo, revision) {
  const output = await git(repo, ["ls-tree", "-r", "--name-only", revision, "--", UPSTREAM_ELEMENT_ROOT]);
  return output.split("\n").filter(Boolean).sort();
}

async function upstreamSourceFiles(repo, revision) {
  const output = await git(repo, [
    "ls-tree",
    "-r",
    "--name-only",
    revision,
    "--",
    "packages/ui/src",
    "templates/minimal",
  ]);
  return output.split("\n").filter(Boolean).sort();
}

function isElementPath(localPath) {
  return localPath.startsWith(ELEMENT_PREFIX);
}

function isElementSource(upstreamPath) {
  return ELEMENT_FILE_PATTERN.test(upstreamPath) && !TEST_FILE_PATTERN.test(upstreamPath);
}

function sourcePathCandidates(basePath) {
  const normalized = path.posix.normalize(basePath);
  const candidates = [normalized];
  const hasSourceExtension = SOURCE_EXTENSIONS.some((extension) => normalized.endsWith(extension));
  if (!hasSourceExtension) {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${normalized}${extension}`);
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${normalized}/index${extension}`);
  }
  return candidates;
}

function resolveSourcePath(basePath, upstreamFileSet) {
  return sourcePathCandidates(basePath).find((candidate) => upstreamFileSet.has(candidate));
}

function aliasUpstreamBases(aliasPath) {
  if (aliasPath.startsWith("components/assistant-ui/")) {
    return [
      `packages/ui/src/components/react/${aliasPath}`,
      `templates/minimal/${aliasPath}`,
    ];
  }
  if (aliasPath.startsWith("components/ui/radix/")) {
    return [`packages/ui/src/components/react/ui/radix/${aliasPath.slice("components/ui/radix/".length)}`];
  }
  if (aliasPath.startsWith("components/ui/")) {
    const relativePath = aliasPath.slice("components/ui/".length);
    return [
      `packages/ui/src/components/react/ui/base/${relativePath}`,
      `packages/ui/src/components/react/ui/${relativePath}`,
      `templates/minimal/${aliasPath}`,
    ];
  }
  if (aliasPath.startsWith("hooks/")) {
    return [`packages/ui/src/${aliasPath}`, `templates/minimal/${aliasPath}`];
  }
  if (aliasPath.startsWith("lib/")) {
    return [`packages/ui/src/${aliasPath}`, `templates/minimal/${aliasPath}`];
  }
  return [`packages/ui/src/${aliasPath}`, `templates/minimal/${aliasPath}`];
}

function extractImportSpecifiers(source) {
  const specifiers = new Set();
  const pattern = /(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)(["'])([^"']+)\1/gu;
  for (const match of source.matchAll(pattern)) specifiers.add(match[2]);
  return [...specifiers];
}

function findKnownByLocalBase(localBase, previousByLocalPath) {
  for (const candidate of sourcePathCandidates(localBase)) {
    const mapping = previousByLocalPath.get(candidate);
    if (mapping !== undefined) return mapping;
  }
  return undefined;
}

function findKnownByUpstreamPath(upstreamPath, previousByUpstreamPath) {
  return previousByUpstreamPath.get(upstreamPath);
}

function localPathForResolved(localBase, upstreamBase, resolvedUpstreamPath) {
  if (resolvedUpstreamPath === upstreamBase) return localBase;
  if (resolvedUpstreamPath.startsWith(`${upstreamBase}.`)) {
    return `${localBase}${resolvedUpstreamPath.slice(upstreamBase.length)}`;
  }
  if (resolvedUpstreamPath.startsWith(`${upstreamBase}/`)) {
    return `${localBase}${resolvedUpstreamPath.slice(upstreamBase.length)}`;
  }
  return localBase;
}

function resolveSpecifier({
  current,
  specifier,
  previousByLocalPath,
  previousByUpstreamPath,
  upstreamFileSet,
}) {
  if (specifier.startsWith("@/")) {
    const localBase = path.posix.normalize(specifier.slice(2));
    const known = findKnownByLocalBase(localBase, previousByLocalPath);
    if (known !== undefined && upstreamFileSet.has(known.upstreamPath)) {
      return known;
    }

    for (const upstreamBase of aliasUpstreamBases(localBase)) {
      const resolvedUpstreamPath = resolveSourcePath(upstreamBase, upstreamFileSet);
      if (resolvedUpstreamPath === undefined) continue;
      const knownBySource = findKnownByUpstreamPath(resolvedUpstreamPath, previousByUpstreamPath);
      if (knownBySource !== undefined) return knownBySource;
      const localResolvedPath = localPathForResolved(localBase, upstreamBase, resolvedUpstreamPath);
      return { upstreamPath: resolvedUpstreamPath, localPath: localResolvedPath };
    }
    return undefined;
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const upstreamBase = path.posix.normalize(path.posix.join(path.posix.dirname(current.upstreamPath), specifier));
    const resolvedUpstreamPath = resolveSourcePath(upstreamBase, upstreamFileSet);
    if (resolvedUpstreamPath === undefined) return undefined;
    const known = findKnownByUpstreamPath(resolvedUpstreamPath, previousByUpstreamPath);
    if (known !== undefined) return known;

    const localBase = path.posix.normalize(path.posix.join(path.posix.dirname(current.localPath), specifier));
    const sourceSuffix = resolvedUpstreamPath.startsWith(`${upstreamBase}.`)
      ? resolvedUpstreamPath.slice(upstreamBase.length)
      : resolvedUpstreamPath.startsWith(`${upstreamBase}/`)
        ? resolvedUpstreamPath.slice(upstreamBase.length)
        : "";
    return {
      upstreamPath: resolvedUpstreamPath,
      localPath: sourceSuffix ? `${localBase}${sourceSuffix}` : localBase,
    };
  }

  return null;
}

function adaptationsFor({ localPath, source, previous }) {
  const adaptations = new Set(previous?.adaptations ?? []);
  if (isElementPath(localPath)) adaptations.add("official-registry-base-ui-rendering");
  if (source.includes("@/")) adaptations.add("import-alias-to-relative");
  return [...adaptations];
}

function toRelativeImport(aliasPath, localPath) {
  const target = path.posix.normalize(aliasPath);
  const relative = path.posix.relative(path.posix.dirname(localPath), target);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function adaptImports(source, localPath) {
  return source.replace(
    /(\bfrom\s+|\bimport\s*(?:\(\s*)?)(["'])@\/([^"']+)\2/gu,
    (_match, prefix, quote, aliasPath) =>
      `${prefix}${quote}${toRelativeImport(aliasPath, localPath)}${quote}`,
  );
}

function packageMetadata(target) {
  return {
    "@assistant-ui/react": target.packages["@assistant-ui/react"],
    "@assistant-ui/react-ag-ui": target.packages["@assistant-ui/react-ag-ui"],
    "@assistant-ui/react-markdown": target.packages["@assistant-ui/react-markdown"],
    "@ag-ui/client": target.agUi["@ag-ui/client"],
  };
}

function vendorDestination(localPath) {
  const normalized = path.posix.normalize(localPath);
  if (
    normalized !== localPath ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized) ||
    normalized.includes("/../")
  ) {
    throw new Error(`Invalid vendor local path: ${localPath}`);
  }
  return path.join(vendorRoot, ...normalized.split("/"));
}

function upstreamMarkdown({ revision, oldRevision, target, files, inventory, newAvailableElements }) {
  const packageVersions = packageMetadata(target);
  return `# Vendored assistant-ui source\n\n` +
    `Repository: ${UPSTREAM_REPOSITORY}\n` +
    `Branch: \`main\`\n` +
    `Commit: \`${revision}\`\n` +
    `Previous commit: \`${oldRevision}\`\n` +
    `License: MIT\n` +
    `Source form: official Base UI registry output plus declared mechanical import adaptations\n\n` +
    `## Runtime package versions\n\n` +
    Object.entries(packageVersions).map(([name, version]) => `- \`${name}\` = \`${version}\``).join("\n") +
    `\n\n## Ownership\n\n` +
    `The files below are copied from the frozen revision above. Vendor sync may adapt ` +
    `only upstream import aliases and the registry's base-ui relative paths. Product ` +
    `presentation and policy stay in the Agent UI facade and Plugin layers.\n\n` +
    `- ${files.length} tracked vendor files\n` +
    `- ${files.filter((file) => file.localPath.startsWith(ELEMENT_PREFIX)).length} tracked official Element files\n` +
    `- ${inventory.length} official Element files discovered upstream\n` +
    `- ${newAvailableElements.length} upstream Element files not adopted into the tracked set\n` +
    `- AG-UI remains at \`${target.agUi["@ag-ui/client"]}\` because it follows the react-ag-ui compatibility matrix\n\n` +
    `## Upgrade command\n\n` +
    `\`pnpm assistant-ui:update\` resolves versions from npm, freezes the official remote ` +
    `main SHA, syncs the vendor, and writes the impact report.\n`;
}

async function main() {
  const target = await readJson(targetPath);
  const repo = option("--repo") ?? process.env.ASSISTANT_UI_REPO ?? path.resolve(repoRoot, "../assistant-ui");
  const requestedRevision = option("--revision") ?? target.revision;
  if (!/^[a-f0-9]{40}$/u.test(requestedRevision ?? "")) {
    throw new Error(`assistant-ui sync requires an exact 40-character revision, received ${requestedRevision}.`);
  }
  const revision = requestedRevision;
  await ensureRevision(repo, revision);

  const [manifest, previousProvenance] = await Promise.all([
    readJson(manifestPath),
    readJson(provenancePath),
  ]);
  const previousEntries = Array.isArray(previousProvenance.files)
    ? previousProvenance.files
    : [];
  const previousByLocalPath = new Map(
    previousEntries.map((entry) => [entry.localPath, entry]),
  );
  const previousByUpstreamPath = new Map(
    previousEntries.map((entry) => [entry.upstreamPath, entry]),
  );
  const previousOwned = [...new Set(manifest.owned ?? [])].sort();
  const upstreamElementFileList = await upstreamFiles(repo, revision);
  const upstreamFileSet = new Set(await upstreamSourceFiles(repo, revision));
  const upstreamInventory = upstreamElementFileList
    .filter(isElementSource)
    .map((upstreamPath) => `${ELEMENT_PREFIX}${upstreamPath.slice(`${UPSTREAM_ELEMENT_ROOT}/`.length)}`)
    .sort();
  const upstreamInventorySet = new Set(upstreamInventory);
  const newAvailableElements = upstreamInventory.filter((localPath) => !previousOwned.includes(localPath));
  const removedUpstreamElements = previousOwned.filter((localPath) => !upstreamInventorySet.has(localPath)).sort();
  if (removedUpstreamElements.length > 0) {
    throw new Error([
      "Tracked assistant-ui Elements were removed upstream:",
      ...removedUpstreamElements.map((file) => `- ${file}`),
      "Remove or replace the tracked ownership explicitly before syncing.",
    ].join("\n"));
  }

  const mappings = new Map();
  const queue = [];
  for (const previous of previousEntries) {
    if (previous?.localPath === undefined || previous?.upstreamPath === undefined) {
      throw new Error("Every assistant-ui provenance entry must declare localPath and upstreamPath.");
    }
    mappings.set(previous.localPath, { ...previous });
    queue.push(previous.localPath);
  }
  for (const localPath of previousOwned) {
    if (!mappings.has(localPath)) {
      throw new Error(`No upstream provenance mapping is declared for tracked Element ${localPath}.`);
    }
  }

  const missingDependencies = [];
  while (queue.length > 0) {
    const localPath = queue.shift();
    const current = mappings.get(localPath);
    const source = await gitShow(repo, revision, current.upstreamPath);
    for (const specifier of extractImportSpecifiers(source)) {
      const dependency = resolveSpecifier({
        current,
        specifier,
        previousByLocalPath,
        previousByUpstreamPath,
        upstreamFileSet,
      });
      if (dependency === null) continue;
      if (dependency === undefined) {
        missingDependencies.push({
          importer: current.localPath,
          specifier,
          upstreamPath: current.upstreamPath,
        });
        continue;
      }
      if (!mappings.has(dependency.localPath)) {
        mappings.set(dependency.localPath, dependency);
        queue.push(dependency.localPath);
      }
    }
  }

  if (missingDependencies.length > 0) {
    throw new Error([
      "Unable to close assistant-ui vendor dependency graph:",
      ...missingDependencies.map(({ importer, specifier }) => `- ${importer} imports ${specifier}`),
      "Add an explicit upstream mapping or fix the upstream source before syncing.",
    ].join("\n"));
  }

  const files = [];
  for (const localPath of [...mappings.keys()].sort()) {
    const mapping = mappings.get(localPath);
    const source = await gitShow(repo, revision, mapping.upstreamPath);
    const installed = adaptImports(source, localPath);
    const destination = vendorDestination(localPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, installed, "utf8");
    files.push({
      upstreamPath: mapping.upstreamPath,
      localPath,
      upstreamSha256: sha256(source),
      installedSha256: sha256(installed),
      adaptations: adaptationsFor({ localPath, source, previous: previousByLocalPath.get(localPath) }),
    });
  }

  const currentPaths = new Set(files.map((entry) => entry.localPath));
  const previousFiles = previousEntries.map((entry) => entry.localPath).sort();
  const removedFiles = previousFiles.filter((localPath) => !currentPaths.has(localPath));

  const elementPaths = files
    .map((entry) => entry.localPath)
    .filter(isElementPath)
    .sort();
  const packageVersions = packageMetadata(target);
  const nextManifest = {
    schemaVersion: 1,
    source: SOURCE,
    style: STYLE,
    revision,
    owned: elementPaths,
    legacyExceptions: manifest.legacyExceptions ?? [],
  };
  const nextProvenance = {
    schemaVersion: 1,
    project: "assistant-ui/assistant-ui",
    revision,
    license: "MIT",
    sourceForm: "official Base UI registry output",
    packages: packageVersions,
    files,
    patches: [],
  };
  const nextLock = {
    schemaVersion: 1,
    source: SOURCE,
    style: STYLE,
    revision,
    elements: Object.fromEntries(
      elementPaths.map((localPath) => [
        localPath,
        files.find((entry) => entry.localPath === localPath).installedSha256,
      ]),
    ),
  };

  await writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, "utf8");
  await writeFile(provenancePath, `${JSON.stringify(nextProvenance, null, 2)}\n`, "utf8");
  await writeFile(lockPath, `${JSON.stringify(nextLock, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(vendorRoot, "UPSTREAM.md"),
    upstreamMarkdown({
      revision,
      oldRevision: previousProvenance.revision,
      target,
      files,
      inventory: upstreamInventory,
      newAvailableElements,
    }),
    "utf8",
  );

  const previousByPath = new Map(previousEntries.map((entry) => [entry.localPath, entry]));
  const currentByPath = new Map(files.map((entry) => [entry.localPath, entry]));
  const added = [...currentByPath.keys()].filter((localPath) => !previousByPath.has(localPath)).sort();
  const changed = [...currentByPath.keys()]
    .filter((localPath) => previousByPath.has(localPath) &&
      previousByPath.get(localPath).upstreamSha256 !== currentByPath.get(localPath).upstreamSha256)
    .sort();
  const newlyAdoptedElements = elementPaths.filter((localPath) => !previousOwned.includes(localPath));
  const ignoredUpstreamElements = newAvailableElements
    .filter((localPath) => !newlyAdoptedElements.includes(localPath))
    .map((localPath) => ({ localPath, rationale: UNADOPTED_ELEMENT_RATIONALE }));
  const changedUpstreamElements = changed.filter(isElementPath);
  const report = {
    schemaVersion: 1,
    fromRevision: previousProvenance.revision,
    toRevision: revision,
    packagesChanged: Object.keys(packageVersions).filter((name) =>
      previousProvenance.packages?.[name] !== packageVersions[name]),
    vendorFilesChanged: changed,
    vendorFilesAdded: added,
    vendorFilesRemoved: removedFiles,
    vendorFilesRenamed: [],
    newTransitiveDependencies: added.filter((localPath) => !isElementPath(localPath)),
    newAvailableElements,
    newlyAdoptedElements,
    removedUpstreamElements,
    changedUpstreamElements,
    ignoredUpstreamElements,
    missingTransitiveDependencies: missingDependencies,
    localFacadeFilesChanged: [],
    runtimeAdapterFilesChanged: [],
    pluginFilesChanged: [],
    appUIModelFilesChanged: [],
    creatorFilesChanged: [],
    testsChanged: [],
    _inventory: {
      fromFiles: previousFiles,
      toFiles: files.map((entry) => entry.localPath).sort(),
      upstreamElements: upstreamInventory,
    },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    fromRevision: previousProvenance.revision,
    toRevision: revision,
    changed: changed.length,
    added: added.length,
    removed: removedFiles.length,
    newAvailableElements: newAvailableElements.length,
    newlyAdoptedElements: newlyAdoptedElements.length,
    ignoredUpstreamElements: ignoredUpstreamElements.length,
    report: path.relative(repoRoot, reportPath),
  }, null, 2));
}

await main();
