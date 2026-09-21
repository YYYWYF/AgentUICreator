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
const ELEMENT_PREFIX = "components/assistant-ui/elements/";

const NEW_FILES = [
  {
    upstreamPath: "packages/ui/src/components/react/assistant-ui/elements/agent-status.aui.tsx",
    localPath: "components/assistant-ui/elements/agent-status.aui.tsx",
    adaptations: ["official-registry-base-ui-rendering", "import-alias-to-relative"],
  },
  {
    upstreamPath: "packages/ui/src/components/react/assistant-ui/elements/task-card.tsx",
    localPath: "components/assistant-ui/elements/task-card.tsx",
    adaptations: ["official-registry-base-ui-rendering", "import-alias-to-relative"],
  },
  {
    upstreamPath: "packages/ui/src/components/react/assistant-ui/elements/task-card.aui.tsx",
    localPath: "components/assistant-ui/elements/task-card.aui.tsx",
    adaptations: ["official-registry-base-ui-rendering", "import-alias-to-relative"],
  },
  {
    upstreamPath: "packages/ui/src/components/react/assistant-ui/utils/task.ts",
    localPath: "components/assistant-ui/utils/task.ts",
    adaptations: ["import-alias-to-relative"],
  },
  {
    upstreamPath: "packages/ui/src/components/react/ui/base/popover.tsx",
    localPath: "components/ui/popover.tsx",
    adaptations: ["official-registry-base-ui-rendering", "import-alias-to-relative"],
  },
];

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

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function toRelativeImport(aliasPath, localPath) {
  const target = path.posix.normalize(aliasPath);
  const relative = path.posix.relative(path.posix.dirname(localPath), target);
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function adaptImports(source, localPath) {
  return source.replace(
    /(\bfrom\s+|\bimport\s*\(\s*)(["'])@\/([^"']+)\2/g,
    (_match, prefix, quote, aliasPath) =>
      `${prefix}${quote}${toRelativeImport(aliasPath, localPath)}${quote}`,
  );
}

function sourcePathForNewFile(localPath, previousEntries) {
  return NEW_FILES.find((entry) => entry.localPath === localPath) ??
    previousEntries.find((entry) => entry.localPath === localPath);
}

function packageMetadata(target) {
  return {
    "@assistant-ui/react": target.packages["@assistant-ui/react"],
    "@assistant-ui/react-ag-ui": target.packages["@assistant-ui/react-ag-ui"],
    "@assistant-ui/react-markdown": target.packages["@assistant-ui/react-markdown"],
    "@ag-ui/client": target.agUi["@ag-ui/client"],
  };
}

function upstreamMarkdown({ revision, oldRevision, target, files }) {
  const packageVersions = packageMetadata(target);
  return `# Vendored assistant-ui source\n\n` +
    `Repository: https://github.com/assistant-ui/assistant-ui\n` +
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
    `- ${files.filter((file) => file.localPath.startsWith(ELEMENT_PREFIX)).length} official Element files\n` +
    `- AG-UI remains at \`${target.agUi["@ag-ui/client"]}\` because it follows the react-ag-ui compatibility matrix\n\n` +
    `## Upgrade command\n\n` +
    `\`pnpm assistant-ui:update\` resolves versions, freezes a revision, syncs the vendor, and writes the impact report.\n`;
}

async function main() {
  const target = await readJson(targetPath);
  const repo = option("--repo") ?? process.env.ASSISTANT_UI_REPO ?? path.resolve(repoRoot, "../assistant-ui");
  const requestedRevision = option("--revision") ?? target.revision;
  const revision = await git(repo, ["rev-parse", `${requestedRevision}^{commit}`]);
  const [manifest, previousProvenance, previousLock] = await Promise.all([
    readJson(manifestPath),
    readJson(provenancePath),
    readJson(lockPath),
  ]);

  const previousEntries = Array.isArray(previousProvenance.files)
    ? previousProvenance.files
    : [];
  const previousByLocalPath = new Map(
    previousEntries.map((entry) => [entry.localPath, entry]),
  );
  const localPaths = new Set([
    ...previousEntries.map((entry) => entry.localPath),
    ...NEW_FILES.map((entry) => entry.localPath),
  ]);
  const files = [];

  for (const localPath of [...localPaths].sort()) {
    const mapping = sourcePathForNewFile(localPath, previousEntries);
    if (mapping === undefined) {
      throw new Error(`No upstream mapping is declared for ${localPath}`);
    }
    const source = await git(repo, ["show", `${revision}:${mapping.upstreamPath}`]);
    const installed = adaptImports(source, localPath);
    const destination = path.join(vendorRoot, localPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, installed, "utf8");
    files.push({
      upstreamPath: mapping.upstreamPath,
      localPath,
      upstreamSha256: sha256(source),
      installedSha256: sha256(installed),
      adaptations: mapping.adaptations ?? ["import-alias-to-relative"],
    });
  }

  const elementPaths = files
    .map((entry) => entry.localPath)
    .filter((localPath) => localPath.startsWith(ELEMENT_PREFIX))
    .sort();
  const packageVersions = packageMetadata(target);
  const nextManifest = {
    schemaVersion: 1,
    source: SOURCE,
    style: STYLE,
    revision,
    owned: elementPaths,
    legacyExceptions: [],
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
    }),
    "utf8",
  );

  const previousFiles = previousEntries.map((entry) => entry.localPath).sort();
  const previousByPath = new Map(previousEntries.map((entry) => [entry.localPath, entry]));
  const currentByPath = new Map(files.map((entry) => [entry.localPath, entry]));
  const added = [...currentByPath.keys()].filter((localPath) => !previousByPath.has(localPath)).sort();
  const removed = previousFiles.filter((localPath) => !currentByPath.has(localPath));
  const changed = [...currentByPath.keys()]
    .filter((localPath) => previousByPath.has(localPath) &&
      previousByPath.get(localPath).upstreamSha256 !== currentByPath.get(localPath).upstreamSha256)
    .sort();
  const report = {
    schemaVersion: 1,
    fromRevision: previousProvenance.revision,
    toRevision: revision,
    packagesChanged: Object.keys(packageVersions).filter((name) =>
      previousProvenance.packages?.[name] !== packageVersions[name]),
    vendorFilesChanged: changed,
    vendorFilesAdded: added,
    vendorFilesRemoved: removed,
    vendorFilesRenamed: [],
    newTransitiveDependencies: added.filter((localPath) => !localPath.startsWith(ELEMENT_PREFIX)),
    localFacadeFilesChanged: [],
    runtimeAdapterFilesChanged: [],
    pluginFilesChanged: [],
    appUIModelFilesChanged: [],
    creatorFilesChanged: [],
    testsChanged: [],
    _inventory: {
      fromFiles: previousFiles,
      toFiles: files.map((entry) => entry.localPath).sort(),
    },
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    fromRevision: previousProvenance.revision,
    toRevision: revision,
    changed: changed.length,
    added: added.length,
    removed: removed.length,
    report: path.relative(repoRoot, reportPath),
  }, null, 2));
}

await main();
