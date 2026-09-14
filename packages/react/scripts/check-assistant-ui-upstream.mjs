import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    return await collectFiles(path.join(vendorRoot, ELEMENTS_DIRECTORY));
  } catch (error) {
    if (error?.code === "ENOENT") {
      errors.push(`${ELEMENTS_DIRECTORY} directory is missing.`);
      return [];
    }
    throw error;
  }
}

export async function collectAssistantUiUpstreamErrors(
  vendorRoot = defaultVendorRoot,
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
  const provenanceElementPaths = elementPathsFromProvenance(provenance, errors);

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
    for (const patch of provenance.patches) {
      const patchFiles = isRecord(patch) && Array.isArray(patch.files)
        ? patch.files
        : [];
      if (patchFiles.some((file) => typeof file === "string" && file.startsWith(ELEMENT_PATH_PREFIX))) {
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
    if (sha256(content) !== expectedHash) modified.push(relativePath);
  }

  for (const relativePath of modified) {
    errors.push(`assistant-ui upstream-owned Element modified: ${relativePath}`);
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
