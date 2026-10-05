import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { QUOTE_SELECTION_FILES, SEARCH_LABELS_SEAM_ID, SEARCH_LABELS_SEAM_FILES } from "./sync-assistant-ui-upstream.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultVendorRoot = path.join(
  scriptDirectory,
  "..",
  "src",
  "internal",
  "vendor",
  "assistant-ui",
);
const MANIFEST_FILE = "upstream-elements.json";
const PROVENANCE_FILE = "UPSTREAM.json";
const LOCK_FILE = "assistant-ui-upstream.lock.json";
const EXPECTED_SOURCE = "https://r.assistant-ui.com";
const EXPECTED_STYLE = "base-nova";
const ELEMENTS_DIRECTORY = "components/assistant-ui/elements";
const ELEMENT_PATH_PREFIX = `${ELEMENTS_DIRECTORY}/`;
const IMAGE_ZOOM_PORTAL_PATH = "components/assistant-ui/elements/image.tsx";
const PORTAL_BRIDGE_FILES = [
  IMAGE_ZOOM_PORTAL_PATH,
  "components/ui/dialog.tsx",
  "components/ui/popover.tsx",
  "components/ui/sheet.tsx",
  "components/ui/tooltip.tsx",
];
const FORBIDDEN_ELEMENT_TOKENS = [
  "ThreadListPresentationPolicy",
  "agentUiDisabled",
  "navigationLocked",
  "p3r4d-thread-list-policy-seam",
];

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeRelativePath(value, label) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\\") ||
    path.posix.isAbsolute(value) ||
    path.posix.normalize(value) !== value ||
    value === "." ||
    value.startsWith("../") ||
    value.includes("/../")
  ) {
    throw new Error(`${label} must be a normalized project-relative path.`);
  }
  return value;
}

function readStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  const result = value.map((item) => safeRelativePath(item, label));
  if (new Set(result).size !== result.length) {
    throw new Error(`${label} must not contain duplicate paths.`);
  }
  return result;
}

async function readJson(filePath, label) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} is missing.`);
    }
    throw error;
  }
  try {
    return JSON.parse(source);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function sortedDifference(left, right) {
  const rightSet = new Set(right);
  return left.filter((value) => !rightSet.has(value)).sort();
}

async function collectFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, entryPath));
    } else {
      files.push(path.relative(root, entryPath).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

function elementPathsFromProvenance(provenance, errors) {
  if (!Array.isArray(provenance?.files)) {
    errors.push(`${PROVENANCE_FILE}.files must be an array.`);
    return [];
  }

  const paths = [];
  for (const [index, entry] of provenance.files.entries()) {
    if (!isRecord(entry) || typeof entry.localPath !== "string") {
      errors.push(`${PROVENANCE_FILE}.files[${index}].localPath must be a string.`);
      continue;
    }
    try {
      const relativePath = safeRelativePath(
        entry.localPath,
        `${PROVENANCE_FILE}.files[${index}].localPath`,
      );
      if (relativePath.startsWith(ELEMENT_PATH_PREFIX)) paths.push(relativePath);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (new Set(paths).size !== paths.length) {
    errors.push(`${PROVENANCE_FILE}.files must not contain duplicate Element paths.`);
  }
  return paths;
}

async function collectElementInventory(vendorRoot, errors) {
  try {
    const files = await collectFiles(path.join(vendorRoot, ELEMENTS_DIRECTORY));
    return files.map((file) => `${ELEMENT_PATH_PREFIX}${file}`);
  } catch (error) {
    if (error?.code === "ENOENT") {
      errors.push(`${ELEMENTS_DIRECTORY} directory is missing.`);
      return [];
    }
    throw error;
  }
}

export async function collectQuoteSelectionErrors(internalRoot, revision) {
  const errors = [];
  const label = "quote-selection-UPSTREAM.json";
  let record;
  try {
    record = await readJson(path.join(internalRoot, label), label);
  } catch (error) {
    return [error.message];
  }
  if (!isRecord(record) || !/^[a-f0-9]{40}$/u.test(record.revision ?? "") || record.revision !== revision) {
    errors.push(`${label}.revision must match UPSTREAM.json.revision.`);
  }
  const expectedPaths = QUOTE_SELECTION_FILES.map(({ upstreamPath, localPath }) => ({ upstreamPath, localPath }));
  const actualPaths = Array.isArray(record?.files)
    ? record.files.map(entry => ({ upstreamPath: entry?.upstreamPath, localPath: entry?.localPath }))
    : [];
  if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
    errors.push(`${label}.files must contain exactly the three approved Quote selection upstream/local paths.`);
  }
  // Read only fixed approved paths; metadata cannot redirect the guard elsewhere.
  for (const mapping of QUOTE_SELECTION_FILES) {
    const entry = (Array.isArray(record?.files) ? record.files : []).find(file => file?.localPath === mapping.localPath && file?.upstreamPath === mapping.upstreamPath);
    if (!entry || !/^[a-f0-9]{64}$/u.test(entry.upstreamSha256 ?? "") ||
        !/^[a-f0-9]{64}$/u.test(entry.installedSha256 ?? "")) {
      errors.push(`${label} requires valid upstream and installed hashes: ${mapping.localPath}.`);
    }
    try {
      const source = await readFile(path.join(internalRoot, mapping.localPath));
      if (sha256(source) !== entry?.installedSha256) {
        errors.push(`Quote selection adapter modified: ${mapping.localPath}.`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") errors.push(`Quote selection adapter missing: ${mapping.localPath}.`);
      else throw error;
    }
    if (mapping.localPath === "quote-selection-message-id.ts" && entry?.upstreamSha256 !== entry?.installedSha256) {
      errors.push("Quote selection message-id source must remain identical to upstream.");
    }
  }
  return errors;
}

export async function collectAssistantUiUpstreamErrors(
  vendorRoot = defaultVendorRoot,
  internalRoot = path.resolve(vendorRoot, "../.."),
) {
  const errors = [];
  let manifest;
  let provenance;
  let lock;
  try {
    manifest = await readJson(
      path.join(vendorRoot, MANIFEST_FILE),
      MANIFEST_FILE,
    );
    provenance = await readJson(
      path.join(vendorRoot, PROVENANCE_FILE),
      PROVENANCE_FILE,
    );
    lock = await readJson(path.join(vendorRoot, LOCK_FILE), LOCK_FILE);
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  if (!isRecord(manifest) || manifest.schemaVersion !== 1) {
    errors.push(`${MANIFEST_FILE} must use schemaVersion 1.`);
    return errors;
  }
  if (manifest.source !== EXPECTED_SOURCE) {
    errors.push(`${MANIFEST_FILE} must use ${EXPECTED_SOURCE} as source.`);
  }
  if (manifest.style !== EXPECTED_STYLE) {
    errors.push(`${MANIFEST_FILE} must use ${EXPECTED_STYLE} as style.`);
  }

  let owned;
  let legacyExceptions;
  try {
    owned = readStringArray(manifest.owned, `${MANIFEST_FILE}.owned`);
    legacyExceptions = readStringArray(
      manifest.legacyExceptions,
      `${MANIFEST_FILE}.legacyExceptions`,
    );
  } catch (error) {
    return [error instanceof Error ? error.message : String(error)];
  }

  const ownedSet = new Set(owned);
  for (const relativePath of [...owned, ...legacyExceptions]) {
    if (!relativePath.startsWith(ELEMENT_PATH_PREFIX)) {
      errors.push(`${MANIFEST_FILE} Element ownership path is outside ${ELEMENTS_DIRECTORY}: ${relativePath}`);
    }
  }
  for (const exception of legacyExceptions) {
    if (ownedSet.has(exception)) {
      errors.push(`${exception} cannot be both upstream-owned and a legacy exception.`);
    }
  }

  if (!isRecord(provenance)) {
    errors.push(`${PROVENANCE_FILE} must be an object.`);
  }
  if (typeof provenance?.revision !== "string" || !/^[a-f0-9]{40}$/.test(provenance.revision)) {
    errors.push(`${PROVENANCE_FILE}.revision must be a 40-character commit hash.`);
  }
  errors.push(...await collectQuoteSelectionErrors(internalRoot, provenance?.revision));
  try {
    const trigger = await readJson(path.join(internalRoot, "composer-trigger-UPSTREAM.json"), "composer-trigger-UPSTREAM.json");
    const installed = await readFile(path.join(internalRoot, "trigger-matcher.ts"));
    if (trigger.revision !== provenance.revision || trigger.localPath !== "trigger-matcher.ts" ||
        trigger.upstreamPath !== "packages/react/src/primitives/composer/trigger/detectTrigger.ts" ||
        sha256(installed) !== trigger.installedSha256 || trigger.installedSha256 !== trigger.upstreamSha256) {
      errors.push("Composer trigger matcher must match its frozen upstream provenance.");
    }
  } catch (error) { errors.push(`Composer trigger matcher provenance unavailable: ${error.message}`); }
  const provenanceElementPaths = elementPathsFromProvenance(provenance, errors);
  for (const entry of Array.isArray(provenance.files) ? provenance.files : []) {
    if ((Array.isArray(entry?.adaptations) && entry.adaptations.includes("agent-ui-portal-container-bridge")) !==
        PORTAL_BRIDGE_FILES.includes(entry?.localPath)) {
      errors.push(`${PROVENANCE_FILE} Portal bridge adaptation is allowed only for the five approved files: ${entry?.localPath}.`);
    }
  }

  for (const entry of Array.isArray(provenance.files) ? provenance.files : []) {
    if ((Array.isArray(entry?.adaptations) && entry.adaptations.includes("agent-ui-quote-selection-portal-bridge")) !==
        (entry?.localPath === "components/assistant-ui/elements/quote.aui.tsx")) {
      errors.push(`${PROVENANCE_FILE} Quote selection bridge adaptation is allowed only for quote.aui.tsx: ${entry?.localPath}.`);
    }
  }

  const actualElementPaths = await collectElementInventory(vendorRoot, errors);
  const declaredElementPaths = [...new Set([...owned, ...legacyExceptions])].sort();
  for (const relativePath of sortedDifference(actualElementPaths, declaredElementPaths)) {
    errors.push(`Unclassified assistant-ui Element: ${relativePath}`);
  }
  for (const relativePath of sortedDifference(declaredElementPaths, actualElementPaths)) {
    errors.push(`Declared assistant-ui Element missing: ${relativePath}`);
  }
  for (const relativePath of sortedDifference(actualElementPaths, provenanceElementPaths)) {
    errors.push(`${PROVENANCE_FILE} is missing Element: ${relativePath}`);
  }
  for (const relativePath of sortedDifference(provenanceElementPaths, actualElementPaths)) {
    errors.push(`${PROVENANCE_FILE} declares missing Element: ${relativePath}`);
  }
  for (const relativePath of owned) {
    if (!provenanceElementPaths.includes(relativePath)) {
      errors.push(`${MANIFEST_FILE}.owned Element is missing from ${PROVENANCE_FILE}: ${relativePath}`);
    }
  }

  if (manifest.revision !== provenance.revision) {
    errors.push(`${MANIFEST_FILE}.revision must match ${PROVENANCE_FILE}.revision.`);
  }

  if (!Array.isArray(provenance?.patches)) {
    errors.push(`${PROVENANCE_FILE}.patches must be an array.`);
  } else {
    const portalPatches = provenance.patches.filter((patch) => patch?.id === "agent-ui-portal-container-bridge");
    if (portalPatches.length !== 1 ||
        JSON.stringify(portalPatches[0]?.files) !== JSON.stringify(PORTAL_BRIDGE_FILES)) {
      errors.push(`${PROVENANCE_FILE} must declare exactly the five approved Portal bridge files.`);
    }
    const quotePatches = provenance.patches.filter(patch => patch?.id === "agent-ui-quote-selection-portal-bridge");
    if (quotePatches.length !== 1 || JSON.stringify(quotePatches[0]?.files) !==
        JSON.stringify(["components/assistant-ui/elements/quote.aui.tsx"])) {
      errors.push(`${PROVENANCE_FILE} must declare exactly the separate Quote selection bridge file.`);
    }
    const searchPatches = provenance.patches.filter(patch => patch?.id === SEARCH_LABELS_SEAM_ID);
    if (searchPatches.length !== 1 || JSON.stringify(searchPatches[0]?.files) !== JSON.stringify(SEARCH_LABELS_SEAM_FILES)) {
      errors.push(`${PROVENANCE_FILE} must declare exactly the two approved search presentation labels files.`);
    }
    for (const patch of provenance.patches) {
      const patchFiles = isRecord(patch) && Array.isArray(patch.files)
        ? patch.files
        : [];
      if (patchFiles.some((file) => typeof file === "string" && file.startsWith(ELEMENT_PATH_PREFIX) &&
        !(patch.id === "agent-ui-portal-container-bridge" && file === IMAGE_ZOOM_PORTAL_PATH) &&
        !(patch.id === "agent-ui-quote-selection-portal-bridge" && file === "components/assistant-ui/elements/quote.aui.tsx") &&
        !(patch.id === SEARCH_LABELS_SEAM_ID && SEARCH_LABELS_SEAM_FILES.includes(file)) &&
        !(patch.id === "agent-ui-trigger-content-seam" && file === "components/assistant-ui/elements/composer-trigger-popover.aui.tsx"))) {
        errors.push(`${PROVENANCE_FILE} must not contain Element-targeted product patches.`);
      }
      if (JSON.stringify(patch).includes("p3r4d-thread-list-policy-seam")) {
        errors.push(`${PROVENANCE_FILE} must not contain p3r4d-thread-list-policy-seam.`);
      }
    }
  }

  for (const relativePath of actualElementPaths) {
    const content = await readFile(path.join(vendorRoot, relativePath), "utf8");
    for (const token of FORBIDDEN_ELEMENT_TOKENS) {
      if (content.includes(token)) {
        errors.push(`assistant-ui vendor Element contains forbidden product token "${token}": ${relativePath}`);
      }
    }
  }

  if (!isRecord(lock) || lock.schemaVersion !== 1) {
    errors.push(`${LOCK_FILE} must use schemaVersion 1.`);
    return errors;
  }
  if (lock.source !== EXPECTED_SOURCE || lock.style !== EXPECTED_STYLE) {
    errors.push(`${LOCK_FILE} must identify the official Base UI Registry and base-nova style.`);
  }
  if (lock.revision !== provenance.revision) {
    errors.push(`${LOCK_FILE}.revision must match ${PROVENANCE_FILE}.revision.`);
  }
  const elements = lock.elements;
  if (!isRecord(elements)) {
    errors.push(`${LOCK_FILE}.elements must be an object.`);
    return errors;
  }

  const lockPaths = Object.keys(elements);
  const missingLockEntries = owned.filter((file) => !lockPaths.includes(file));
  const extraLockEntries = lockPaths.filter((file) => !ownedSet.has(file));
  if (missingLockEntries.length > 0) {
    errors.push(`Missing upstream lock entries: ${missingLockEntries.join(", ")}`);
  }
  if (extraLockEntries.length > 0) {
    errors.push(`Unexpected upstream lock entries: ${extraLockEntries.join(", ")}`);
  }

  const modified = [];
  for (const relativePath of owned) {
    const expectedHash = elements[relativePath];
    if (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      errors.push(`Invalid upstream lock hash: ${relativePath}`);
      continue;
    }
    let content;
    try {
      content = await readFile(path.join(vendorRoot, relativePath));
    } catch (error) {
      if (error?.code === "ENOENT") {
        errors.push(`assistant-ui upstream-owned Element missing: ${relativePath}`);
        continue;
      }
      throw error;
    }
    const entry = provenance.files.find((file) => file.localPath === relativePath);
    if (sha256(content) !== expectedHash || entry?.installedSha256 !== expectedHash) {
      modified.push(relativePath);
    }
  }

  for (const relativePath of modified) {
    errors.push(`assistant-ui upstream-owned Element modified: ${relativePath}`);
  }
  for (const entry of Array.isArray(provenance.files) ? provenance.files : []) {
    if (typeof entry?.localPath !== "string" || entry.localPath.startsWith(ELEMENT_PATH_PREFIX)) continue;
    let localPath;
    try {
      localPath = safeRelativePath(entry.localPath, `${PROVENANCE_FILE}.files.localPath`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    try {
      const content = await readFile(path.join(vendorRoot, localPath));
      if (sha256(content) !== entry.installedSha256) {
        errors.push(`assistant-ui tracked vendor file modified: ${localPath}`);
      }
    } catch (error) {
      if (error?.code === "ENOENT") errors.push(`assistant-ui tracked vendor file missing: ${localPath}`);
      else throw error;
    }
  }
  return errors;
}

function cliVendorRoot() {
  const optionIndex = process.argv.indexOf("--vendor-root");
  return optionIndex >= 0 && process.argv[optionIndex + 1]
    ? process.argv[optionIndex + 1]
    : defaultVendorRoot;
}

async function main() {
  const errors = await collectAssistantUiUpstreamErrors(cliVendorRoot());
  if (errors.length === 0) {
    console.log("assistant-ui upstream-owned Elements: OK");
    return;
  }

  console.error(errors.join("\n"));
  if (errors.some((error) => error.startsWith("assistant-ui upstream-owned Element modified:"))) {
      console.error("\nMove product customization to:\nagent-ui/conversation/*");
  }
  process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
