import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AG_UI_CLIENT = "@ag-ui/client";

function option(name, args) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function versionCompare(left, right) {
  const leftParts = left.split(/[.+-]/u).map((part) => (/^\d+$/u.test(part) ? Number(part) : part));
  const rightParts = right.split(/[.+-]/u).map((part) => (/^\d+$/u.test(part) ? Number(part) : part));
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart === rightPart) continue;
    if (typeof leftPart === "number" && typeof rightPart === "number") return leftPart - rightPart;
    return String(leftPart).localeCompare(String(rightPart), "en");
  }
  return 0;
}

export function collectResolvedAgUiClientVersions(lockfileText) {
  const versions = new Set();
  for (const line of String(lockfileText ?? "").split(/\r?\n/u)) {
    const match = line.match(/^\s*['"]?@ag-ui\/client@([^'":\s(]+)(?:\([^)]*\))?['"]?\s*:/u);
    if (match?.[1]) versions.add(match[1]);
  }
  return [...versions].sort(versionCompare);
}

export async function checkAgUiLockfile({
  repoRoot = defaultRepoRoot,
  target,
  lockfileText,
} = {}) {
  const resolvedLockfileText = lockfileText ?? await readFile(path.join(repoRoot, "pnpm-lock.yaml"), "utf8");
  const pinnedClientVersion = target?.agUi?.[AG_UI_CLIENT];
  const resolvedAgUiClientVersions = collectResolvedAgUiClientVersions(resolvedLockfileText);
  const duplicateClientVersions = resolvedAgUiClientVersions.length > 1;
  const passed =
    typeof pinnedClientVersion === "string" &&
    resolvedAgUiClientVersions.length === 1 &&
    resolvedAgUiClientVersions[0] === pinnedClientVersion;

  let message;
  if (duplicateClientVersions) {
    message = [
      "REVIEW REQUIRED:",
      `Multiple ${AG_UI_CLIENT} versions are resolved:`,
      ...resolvedAgUiClientVersions.map((version) => `- ${version}`),
      "",
      `CancellationAwareHttpAgent targets ${pinnedClientVersion ?? "an unknown version"}.`,
      "Review dependency alignment before upgrading.",
    ].join("\n");
  } else if (resolvedAgUiClientVersions.length === 0) {
    message = [
      "REVIEW REQUIRED:",
      `No resolved ${AG_UI_CLIENT} version was found in pnpm-lock.yaml.`,
      `CancellationAwareHttpAgent targets ${pinnedClientVersion ?? "an unknown version"}.`,
      "Review dependency alignment before upgrading.",
    ].join("\n");
  } else if (!passed) {
    message = [
      "REVIEW REQUIRED:",
      `Resolved ${AG_UI_CLIENT} version ${resolvedAgUiClientVersions[0]} does not match the pinned version ${pinnedClientVersion ?? "an unknown version"}.`,
      "Review dependency alignment before upgrading.",
    ].join("\n");
  } else {
    message = [
      "AG-UI lockfile guard: PASS",
      `Resolved ${AG_UI_CLIENT} version ${resolvedAgUiClientVersions[0]}`,
      `CancellationAwareHttpAgent targets ${pinnedClientVersion}`,
    ].join("\n");
  }

  return {
    packageName: AG_UI_CLIENT,
    pinnedClientVersion,
    resolvedAgUiClientVersions,
    duplicateClientVersions,
    status: passed ? "PASS" : "REVIEW REQUIRED",
    passed,
    message,
  };
}

export async function main({ repoRoot = defaultRepoRoot, args = process.argv.slice(2) } = {}) {
  const targetPath = option("--target", args) ?? path.join(repoRoot, "assistant-ui-upgrade-target.json");
  const lockfilePath = option("--lockfile", args) ?? path.join(repoRoot, "pnpm-lock.yaml");
  const target = JSON.parse(await readFile(targetPath, "utf8"));
  const lockfileText = await readFile(lockfilePath, "utf8");
  const result = await checkAgUiLockfile({ target, lockfileText });

  if (result.passed) console.log(result.message);
  else {
    console.error(result.message);
    process.exitCode = 1;
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
