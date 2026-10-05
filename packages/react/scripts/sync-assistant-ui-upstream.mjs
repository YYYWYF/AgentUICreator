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
const PORTAL_BRIDGE_ID = "agent-ui-portal-container-bridge";
const PORTAL_BRIDGE_FILES = [
  "components/assistant-ui/elements/image.tsx",
  "components/ui/dialog.tsx",
  "components/ui/popover.tsx",
  "components/ui/sheet.tsx",
  "components/ui/tooltip.tsx",
];

export const QUOTE_SELECTION_FILES = [
  { upstreamPath: "packages/react/src/primitives/selectionToolbar/SelectionToolbarRoot.tsx", localPath: "quote-selection-root.tsx" },
  { upstreamPath: "packages/react/src/primitives/selectionToolbar/SelectionToolbarQuote.tsx", localPath: "quote-selection-action.tsx" },
  { upstreamPath: "packages/react/src/utils/getSelectionMessageId.ts", localPath: "quote-selection-message-id.ts" },
];
const QUOTE_SELECTION_ADAPTATIONS = [
  "Public React DOM elements replace the private Primitive helper (no asChild API is exposed).",
  "Public useAui import and local context preserve captured selection/setQuote semantics.",
  "Canonical Thread supplies the identical DOM root ref without importing a private upstream context.",
  "Only selection behavior change: portal target is AgentUIRoot; absence of its container renders nothing.",
];
const COMPOSE_EVENT_HANDLERS = `function composeEventHandlers<E extends { defaultPrevented: boolean }>(first: ((event: E) => void) | undefined, second: (event: E) => void) {
  return (event: E) => { first?.(event); if (!event.defaultPrevented) second(event); };
}`;

// Only the approved import/DOM/context/Portal substitutions are replayed.
// Selection listeners, range geometry and composer.setQuote remain upstream source.
export function adaptQuoteSelectionSource(source, localPath) {
  if (!QUOTE_SELECTION_FILES.some(file => file.localPath === localPath)) {
    throw new Error(`Quote selection upstream adaptation requires review: unknown file ${localPath}.`);
  }
  if (localPath === "quote-selection-message-id.ts") return source;
  const replace = (before, after) => {
    if (source.split(before).length !== 2) {
      throw new Error(`Quote selection upstream adaptation requires review: ${localPath}; expected exactly one ${JSON.stringify(before)}.`);
    }
    source = source.replace(before, after);
  };
  const root = localPath === "quote-selection-root.tsx";
  replace('import { Primitive } from "../../utils/Primitive";\n',
    root ? 'const Primitive = { div: "div" } as const;\n\n' : 'const Primitive = { button: "button" } as const;\n');
  replace('import { composeEventHandlers } from "radix-ui/internal";\n',
    root ? '' : COMPOSE_EVENT_HANDLERS + '\n');
  if (root) {
    replace('import { getSelectionMessageId } from "../../utils/getSelectionMessageId";',
      'import { getSelectionMessageId } from "./quote-selection-message-id.js";');
    replace('import { useThreadRootElementRef } from "../thread/ThreadRootElementContext";\n',
      'import { useThreadRootElementRef } from "./quote-thread-root.js";\n\n' +
      'import { useAgentUIPortalContainer } from "./style-boundary/AgentUIRoot.js";\n\n' + COMPOSE_EVENT_HANDLERS + '\n');
    replace('  const [info, setInfo] = useState<SelectionInfo | null>(null);',
      '  const portalContainer = useAgentUIPortalContainer();\n  const [info, setInfo] = useState<SelectionInfo | null>(null);');
    replace('  if (!info) return null;', '  if (!info || !portalContainer) return null;');
    replace('    document.body,', '    portalContainer,');
  } else {
    replace('import { useAui } from "@assistant-ui/store";', 'import { useAui } from "@assistant-ui/react";');
    replace('import { useSelectionToolbarInfo } from "./SelectionToolbarRoot";',
      'import { useSelectionToolbarInfo } from "./quote-selection-root.js";');
  }
  const primitiveNames = [...source.matchAll(/\bPrimitive\.([A-Za-z_]+)/gu)].map(match => match[1]);
  if (primitiveNames.some(name => name !== (root ? "div" : "button")) ||
      /\basChild\b|from ["'](?:\.\.\/|@assistant-ui\/store|radix-ui\/internal)/u.test(source)) {
    throw new Error(`Quote selection upstream adaptation requires review: unsupported private API in ${localPath}.`);
  }
  return source;
}

export async function prepareQuoteSelectionSync(repo, revision) {
  const installations = [];
  const files = [];
  for (const mapping of QUOTE_SELECTION_FILES) {
    let source;
    try {
      source = await gitShow(repo, revision, mapping.upstreamPath);
    } catch (error) {
      throw new Error(`Quote selection upstream adaptation requires review: cannot read ${mapping.upstreamPath} at ${revision}.`, { cause: error });
    }
    const installed = adaptQuoteSelectionSource(source, mapping.localPath);
    installations.push({ destination: path.join(packageRoot, "src/internal", mapping.localPath), installed });
    files.push({ ...mapping, upstreamSha256: sha256(source), installedSha256: sha256(installed) });
  }
  return { installations, provenance: { revision, license: "MIT", files, adaptations: QUOTE_SELECTION_ADAPTATIONS } };
}

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
  const adaptations = new Set((previous?.adaptations ?? []).filter((id) => id !== PORTAL_BRIDGE_ID));
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

function replaceExactlyOnce(source, before, after, localPath) {
  if (source.split(before).length !== 2) {
    throw new Error(`${PORTAL_BRIDGE_ID}: cannot safely adapt ${localPath}; expected exactly one ${JSON.stringify(before)}. Review the changed upstream Portal structure.`);
  }
  return source.replace(before, after);
}

function applyAgentUIPortalContainerBridge(source, localPath) {
  if (!PORTAL_BRIDGE_FILES.includes(localPath)) return source;
  const hookImport = localPath.startsWith("components/ui/")
    ? 'import { useAgentUIPortalContainer } from "../../../../style-boundary/AgentUIRoot";\n'
    : 'import { useAgentUIPortalContainer } from "../../../../../style-boundary/AgentUIRoot";\n';
  const utilsImport = localPath.startsWith("components/ui/")
    ? 'import { cn } from "../../lib/utils";\n'
    : 'import { cn } from "../../../lib/utils";\n';
  let installed = replaceExactlyOnce(source, utilsImport, utilsImport + hookImport, localPath);
  if (localPath === "components/assistant-ui/elements/image.tsx") {
    installed = replaceExactlyOnce(installed,
      '  const [isOpen, setIsOpen] = useState(false);\n',
      '  const [isOpen, setIsOpen] = useState(false);\n  const portalContainer = useAgentUIPortalContainer();\n', localPath);
    installed = replaceExactlyOnce(installed, '      {isOpen &&\n',
      '      {isOpen && portalContainer !== null &&\n', localPath);
    return replaceExactlyOnce(installed, '          document.body,\n',
      '          portalContainer ?? document.body,\n', localPath);
  }
  if (localPath === "components/ui/dialog.tsx" || localPath === "components/ui/sheet.tsx") {
    const name = localPath.includes("dialog") ? "Dialog" : "Sheet";
    const primitive = `${name}Primitive`;
    installed = replaceExactlyOnce(installed,
      `function ${name}Portal({ ...props }: ${primitive}.Portal.Props) {\n  return <${primitive}.Portal data-slot="${name.toLowerCase()}-portal" {...props} />;\n}`,
      `function ${name}Portal({ ...props }: Omit<${primitive}.Portal.Props, "container">) {\n  const portalContainer = useAgentUIPortalContainer();\n  if (portalContainer === null) return null;\n  return <${primitive}.Portal data-slot="${name.toLowerCase()}-portal" {...props} {...(portalContainer === undefined ? {} : { container: portalContainer })} />;\n}`, localPath);
    return installed;
  }
  const primitive = localPath.includes("popover") ? "PopoverPrimitive" : "TooltipPrimitive";
  installed = replaceExactlyOnce(installed,
    `) {\n  return (\n    <${primitive}.Portal>`,
    `) {\n  const portalContainer = useAgentUIPortalContainer();\n  if (portalContainer === null) return null;\n  return (\n    <${primitive}.Portal {...(portalContainer === undefined ? {} : { container: portalContainer })}>`, localPath);
  return installed;
}

export function applyApprovedAdaptations(source, localPath) {
  let installed = applyAgentUIPortalContainerBridge(adaptImports(source, localPath), localPath);
  if (localPath === "components/assistant-ui/elements/quote.aui.tsx") {
    installed = replaceExactlyOnce(installed, '  SelectionToolbarPrimitive,\n', '', localPath);
    installed = replaceExactlyOnce(installed, 'import { QuoteIcon', 'import { SelectionToolbarPrimitive } from "../../../../../quote-selection-adapter.js";\nimport { QuoteIcon', localPath);
  }
  return installed;
}

export function portalBridgePatch(files) {
  const present = PORTAL_BRIDGE_FILES.filter((localPath) => files.some((file) => file.localPath === localPath));
  if (present.length !== PORTAL_BRIDGE_FILES.length) {
    throw new Error(`${PORTAL_BRIDGE_ID}: expected all five approved Portal files in the vendor set; missing ${PORTAL_BRIDGE_FILES.filter((file) => !present.includes(file)).join(", ")}.`);
  }
  return {
    id: PORTAL_BRIDGE_ID,
    reason: "Mount Base UI overlays inside AgentUIRoot without changing presentation or runtime behavior.",
    files: [...PORTAL_BRIDGE_FILES],
  };
}

export function installedVendorEntry({ source, localPath, upstreamPath, previous }) {
  const installed = applyApprovedAdaptations(source, localPath);
  return {
    installed,
    provenance: {
      upstreamPath,
      localPath,
      upstreamSha256: sha256(source),
      installedSha256: sha256(installed),
      adaptations: [...new Set([
        ...adaptationsFor({ localPath, source, previous }),
        ...(localPath === "components/assistant-ui/elements/quote.aui.tsx" ? ["agent-ui-quote-selection-portal-bridge"] : []),
        ...(PORTAL_BRIDGE_FILES.includes(localPath) ? [PORTAL_BRIDGE_ID] : []),
      ])],
    },
  };
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
    (target.releasePinned ? `Source policy: fixed published release\n` : `Branch: \`main\`\n`) +
    `Commit: \`${revision}\`\n` +
    `Previous commit: \`${oldRevision}\`\n` +
    `License: MIT\n` +
    `Source form: official Base UI registry output plus declared mechanical import adaptations\n\n` +
    `## Runtime package versions\n\n` +
    Object.entries(packageVersions).map(([name, version]) => `- \`${name}\` = \`${version}\``).join("\n") +
    `\n\n## Ownership\n\n` +
    `The files below are copied from the frozen revision above. Vendor sync may adapt ` +
    `only upstream import aliases, registry base-ui relative paths, and the five ` +
    `recorded Agent UI Portal container bridges and the separate Quote selection import bridge. Product ` +
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
  const installations = [];
  for (const localPath of [...mappings.keys()].sort()) {
    const mapping = mappings.get(localPath);
    const source = await gitShow(repo, revision, mapping.upstreamPath);
    const { installed, provenance } = installedVendorEntry({
      source, localPath, upstreamPath: mapping.upstreamPath,
      previous: previousByLocalPath.get(localPath),
    });
    installations.push({ destination: vendorDestination(localPath), installed });
    files.push(provenance);
  }
  const portalPatch = portalBridgePatch(files);
  const quoteSelection = await prepareQuoteSelectionSync(repo, revision);
  installations.push(...quoteSelection.installations);
  for (const { destination, installed } of installations) {
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, installed, "utf8");
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
    patches: [portalPatch, ... (files.some(file => file.localPath === "components/assistant-ui/elements/quote.aui.tsx") ? [{
      id: "agent-ui-quote-selection-portal-bridge",
      reason: "Route only Quote selection primitives through the scoped upstream adapter.",
      files: ["components/assistant-ui/elements/quote.aui.tsx"],
    }] : [])],
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

  await writeFile(path.join(packageRoot, "src/internal/quote-selection-UPSTREAM.json"),
    `${JSON.stringify(quoteSelection.provenance, null, 2)}\n`, "utf8");
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
