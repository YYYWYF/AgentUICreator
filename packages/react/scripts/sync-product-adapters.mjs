import { readFile, writeFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const localizationRecipes = JSON.parse(await readFile(new URL("./product-localization-recipes.json", import.meta.url), "utf8"));

export function applyProductLocalization(source, localPath) {
  const recipe = localizationRecipes[localPath];
  if (!recipe) return source;
  for (const { before, after, expectedCount } of recipe.replacements) {
    if (source.split(before).length - 1 !== expectedCount) throw new Error(`Product localization anchor changed: ${localPath}. Check new upstream user-facing copy; update the composition seam or record a gap, never patch vendor.`);
    source = source.replace(before, after);
  }
  return source.startsWith('"use client";')
    ? source.replace('"use client";', '"use client";\n\n' + recipe.importText.trimEnd())
    : recipe.importText + source;
}

const PORTAL_BRIDGE_ID = "agent-ui-scoped-overlay-adapter";
const PORTAL_BRIDGE_FILES = ["components/assistant-ui/elements/image.tsx", ...["dialog", "popover", "sheet", "tooltip"].map(name => `components/ui/${name}.tsx`)];
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

export const SEARCH_LABELS_SEAM_ID = "agent-ui-search-presentation-labels-seam";
export const SEARCH_LABELS_SEAM_FILES = [
  "components/assistant-ui/elements/retrieval-chunks.tsx",
  "components/assistant-ui/elements/web-search.tsx",
];

/** Explicit presentation-only seam; changed upstream source requires review. */
export function applySearchPresentationLabels(source, localPath) {
  if (!SEARCH_LABELS_SEAM_FILES.includes(localPath)) return source;
  const replace = (before, after) => {
    if (source.split(before).length !== 2) {
      throw new Error(`${SEARCH_LABELS_SEAM_ID}: cannot safely adapt ${localPath}; expected exactly one ${JSON.stringify(before)}. Review the upstream labels seam.`);
    }
    source = source.replace(before, after);
  };
  replace('  searching,\n', '  searching,\n  labels,\n');
  if (localPath.endsWith("web-search.tsx")) {
    replace('  cycle: number;\n', '  cycle: number;\n  labels?: { searching: string; complete: string };\n');
    replace('            Searching\n', '            {labels?.searching ?? "Searching"}\n');
    replace('            Read 3 sources\n', '            {labels?.complete.replace("{count}", String(results.length)) ?? "Read 3 sources"}\n');
  } else {
    replace('  searching: boolean;\n', '  searching: boolean;\n  labels?: { retrieving: string; complete: string; relevance: string; score: string };\n');
    replace('            Retrieving\n', '            {labels?.retrieving ?? "Retrieving"}\n');
    replace('            {chunks.length} passages above threshold\n', '            {labels?.complete.replace("{count}", String(chunks.length)) ?? `${chunks.length} passages above threshold`}\n');
    replace('aria-label={`${chunk.source} relevance score`}', 'aria-label={labels?.relevance.replace("{source}", chunk.source) ?? `${chunk.source} relevance score`}');
    replace('aria-valuetext={`${chunk.score.toFixed(2)} of 1.00`}', 'aria-valuetext={labels?.score.replace("{score}", chunk.score.toFixed(2)) ?? `${chunk.score.toFixed(2)} of 1.00`}');
  }
  return source;
}

export function applyProductAdaptations(source, localPath) {
  let installed = applyAgentUIPortalContainerBridge(source, localPath);
  if (localPath === "components/assistant-ui/elements/quote.aui.tsx") {
    installed = replaceExactlyOnce(installed, '  SelectionToolbarPrimitive,\n', '', localPath);
    installed = replaceExactlyOnce(installed, 'import { QuoteIcon', 'import { SelectionToolbarPrimitive } from "../../../../../quote-selection-adapter.js";\nimport { QuoteIcon', localPath);
  }
  if (localPath === "components/assistant-ui/elements/composer-trigger-popover.aui.tsx") {
    installed = replaceExactlyOnce(installed, 'type FC }', 'type FC, type ReactNode }', localPath);
    installed = replaceExactlyOnce(installed, '  iconMap?: Record<string, IconComponent>;', '  children?: ReactNode;\n  iconMap?: Record<string, IconComponent>;', localPath);
    installed = replaceExactlyOnce(installed, '  directive,\n  action,', '  directive,\n  action,\n  children,', localPath);
    installed = replaceExactlyOnce(installed, '      <Categories\n', '      {children}\n      <Categories\n', localPath);
    // Product-owned stable presentation hooks; preserve upstream anatomy and behavior.
    for (const [before, after] of [
      ['type IconComponent = FC<{ className?: string }>;', 'type IconComponent = FC<{ className?: string; "data-slot"?: string }>;'],
      ['              categoryId={cat.id}', '              categoryId={cat.id}\n              data-slot="composer-trigger-popover-category-item"'],
      ['<ComposerPrimitive.Unstable_TriggerPopoverBack className=', '<ComposerPrimitive.Unstable_TriggerPopoverBack data-slot="composer-trigger-popover-back" className='],
      ['                  item={item}', '                  data-slot="composer-trigger-popover-item"\n                  item={item}'],
      ['<div className="py-1">', '<div data-slot="composer-trigger-popover-item-list" className="py-1">'],
      ['<Icon className="text-muted-foreground size-4" />', '<Icon data-slot="composer-trigger-popover-icon" className="text-muted-foreground size-4" />'],
      ['<Icon className="text-primary size-3.5" />', '<Icon data-slot="composer-trigger-popover-icon" className="text-primary size-3.5" />'],
    ]) installed = replaceExactlyOnce(installed, before, after, localPath);
    const emptyNode = '<div className="text-muted-foreground px-3 py-2 text-sm">';
    if (installed.split(emptyNode).length !== 3) throw new Error(`Product presentation hooks: review empty nodes in ${localPath}`);
    installed = installed.replaceAll(emptyNode, '<div data-slot="composer-trigger-popover-empty" className="text-muted-foreground px-3 py-2 text-sm">');
  }
  if (localPath === "components/assistant-ui/elements/reasoning.aui.tsx") {
    installed = replaceExactlyOnce(installed, '  onAnimationStart,\n  ...props', '  onAnimationStart,\n  streaming,\n  ...props', localPath);
    installed = replaceExactlyOnce(installed, '      {...props}\n    />', '      {...props}\n      {...(streaming === undefined ? {} : { streaming })}\n      data-agent-state={streaming ? "running" : "idle"}\n    />', localPath);
  }
  return applySearchPresentationLabels(installed, localPath);
}


const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultVendorRoot = path.join(packageRoot, "src/internal/vendor/assistant-ui");
const adapterRoot = path.join(packageRoot, "src/internal/adapters/assistant-ui");
const hash = value => createHash("sha256").update(value).digest("hex");
const seeded = new Set([...PORTAL_BRIDGE_FILES, ...SEARCH_LABELS_SEAM_FILES,
  "components/assistant-ui/elements/quote.aui.tsx", "components/assistant-ui/elements/composer-trigger-popover.aui.tsx"]);
function dependency(importPath, filename, files) {
  if (!importPath.startsWith(".")) return undefined;
  const candidate = path.posix.normalize(path.posix.join(path.posix.dirname(filename), importPath.replace(/\.js$/u, "")));
  return [candidate, `${candidate}.tsx`, `${candidate}.ts`].find(value => files.has(value));
}
export async function prepareProductAdapters(vendorDirectory = defaultVendorRoot) {
  const provenance = JSON.parse(await readFile(path.join(vendorDirectory, "UPSTREAM.json"), "utf8"));
  const sources = new Map(await Promise.all(provenance.files.map(async entry => [entry.localPath, await readFile(path.join(vendorDirectory, entry.localPath), "utf8")])));
  const selected = new Set(seeded);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [filename, source] of sources) {
      // The complete upstream Thread is deliberately kept out of the product entry.
      if (filename.endsWith("/thread.aui.tsx")) continue;
      if (!selected.has(filename) && [...source.matchAll(/(?:from\s+|import\s+)["']([^"']+)["']/gu)].some(match => selected.has(dependency(match[1], filename, sources)))) {
        selected.add(filename); changed = true;
      }
    }
  }
  const files = [];
  for (const filename of [...selected].sort()) {
    const clean = sources.get(filename);
    if (clean === undefined) throw new Error(`Missing upstream adapter dependency: ${filename}`);
    let installed = applyProductAdaptations(clean, filename);
    installed = installed.replace(/((?:from\s+|import\s+))["']([^"']+)["']/gu, (match, prefix, specifier) => {
      const target = dependency(specifier, filename, sources);
      if (!target || selected.has(target)) return match;
      const relative = path.posix.relative(path.posix.dirname(filename), `../../vendor/assistant-ui/${target}`).replace(/\.tsx?$/u, ".js");
      return `${prefix}"${relative.startsWith(".") ? relative : `./${relative}`}"`;
    });
    installed = applyProductLocalization(installed, filename);
    files.push({ localPath: filename, upstreamInstalledSha256: hash(clean), installedSha256: hash(installed), source: installed });
  }
  return { revision: provenance.revision, files };
}
export async function syncProductAdapters(vendorDirectory = defaultVendorRoot) {
  const result = await prepareProductAdapters(vendorDirectory);
  let previous;
  try { previous = JSON.parse(await readFile(path.join(adapterRoot, "UPSTREAM.json"), "utf8")); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const selected = new Set(result.files.map(file => file.localPath));
  for (const file of previous?.files ?? []) {
    if (!selected.has(file.localPath)) {
      if (file.localPath.includes("..") || path.isAbsolute(file.localPath)) throw new Error("Unsafe previous adapter path.");
      await rm(path.join(adapterRoot, file.localPath), { force: true });
    }
  }
  for (const file of result.files) {
    const destination = path.join(adapterRoot, file.localPath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.source);
  }
  await writeFile(path.join(adapterRoot, "UPSTREAM.json"), JSON.stringify({ schemaVersion: 1, license: "MIT", revision: result.revision,
    owner: "AgentUICreator product integration", policy: "Generated from clean vendor; public primitives, upstream presentation, product container/locale/selection seams only.",
    files: result.files.map(({source, ...file}) => file) }, null, 2) + "\n");
}
export async function checkProductAdapters(vendorDirectory = defaultVendorRoot) {
  const expected = await prepareProductAdapters(vendorDirectory);
  const record = JSON.parse(await readFile(path.join(adapterRoot, "UPSTREAM.json"), "utf8"));
  const records = expected.files.map(({ source, ...file }) => file);
  if (record.revision !== expected.revision || JSON.stringify(record.files) !== JSON.stringify(records)) throw new Error("Product adapter provenance drift.");
  for (const file of expected.files) {
    const actual = await readFile(path.join(adapterRoot, file.localPath), "utf8");
    if (actual !== file.source) throw new Error(`Product adapter drift: ${file.localPath}. Regenerate with sync-product-adapters.mjs.`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await syncProductAdapters();
