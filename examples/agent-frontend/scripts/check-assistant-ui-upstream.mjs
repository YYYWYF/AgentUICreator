import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultVendorRoot = path.join(
  scriptDirectory,
  "..",
  "agent-ui",
  "vendor",
  "assistant-ui",
);
const MANIFEST_FILE = "upstream-elements.json";
const LOCK_FILE = "assistant-ui-upstream.lock.json";
const EXPECTED_SOURCE = "https://r.assistant-ui.com";
const EXPECTED_STYLE = "base-nova";
const THREAD_ELEMENT = "components/assistant-ui/elements/thread.aui.tsx";

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

export async function collectAssistantUiUpstreamErrors(
  vendorRoot = defaultVendorRoot,
) {
  const errors = [];
  let manifest;
  let lock;
  try {
    manifest = await readJson(
      path.join(vendorRoot, MANIFEST_FILE),
      MANIFEST_FILE,
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
  if (!ownedSet.has(THREAD_ELEMENT)) {
    errors.push(`${MANIFEST_FILE}.owned must include ${THREAD_ELEMENT}.`);
  }
  if (legacyExceptions.includes(THREAD_ELEMENT)) {
    errors.push(`${MANIFEST_FILE} must not list ${THREAD_ELEMENT} as a legacy exception.`);
  }
  for (const exception of legacyExceptions) {
    if (ownedSet.has(exception)) {
      errors.push(`${exception} cannot be both upstream-owned and a legacy exception.`);
    }
  }

  if (!isRecord(lock) || lock.schemaVersion !== 1) {
    errors.push(`${LOCK_FILE} must use schemaVersion 1.`);
    return errors;
  }
  if (lock.source !== EXPECTED_SOURCE || lock.style !== EXPECTED_STYLE) {
    errors.push(`${LOCK_FILE} must identify the official Base UI Registry and base-nova style.`);
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
    console.error("\nMove product customization to:\nagent-ui/adapters/assistant-ui/*");
  }
  process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
