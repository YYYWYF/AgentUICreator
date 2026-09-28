import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "@assistant-ui/react-generative-ui";
const itemIds = ["agent-component-assistant-ui-generative-ui", "integration-generative-ui"];
const vendorDirectory = "packages/source-registry/registry/items/agent-component-assistant-ui-generative-ui/files/agent-ui/vendor/assistant-ui/generative-ui";

function gitContent(repoRoot, revision, relativePath) {
  return execFileSync("git", ["-C", repoRoot, "show", `${revision}:${relativePath}`], { stdio: ["ignore", "pipe", "pipe"] });
}

function patchAfter(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(version ?? "");
  if (!match || !Number.isSafeInteger(Number(match[3])) || Number(match[3]) === Number.MAX_SAFE_INTEGER) {
    throw new Error(`Invalid baseline Generative UI Source Item version ${version}.`);
  }
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

async function resourceChangedFromBaseline(repoRoot, baseGitSha, id, before, after) {
  if (before.packages?.[packageName] !== after.packages?.[packageName] ||
      before.upstream?.revision !== after.upstream?.revision) return true;
  const previousFiles = new Map((before.files ?? []).map(file => [file.target, file.source]));
  const currentFiles = new Map((after.files ?? []).map(file => [file.target, file.source]));
  if (previousFiles.size !== currentFiles.size || [...previousFiles].some(([target, source]) => currentFiles.get(target) !== source)) return true;
  for (const source of currentFiles.values()) {
    const relativePath = `packages/source-registry/registry/items/${id}/${source}`;
    if (!gitContent(repoRoot, baseGitSha, relativePath).equals(await readFile(path.join(repoRoot, relativePath)))) return true;
  }
  return false;
}

export async function checkGenerativeUiResource({ repoRoot = defaultRoot, target, baseGitSha } = {}) {
  target ??= JSON.parse(await readFile(path.join(repoRoot, "assistant-ui-upgrade-target.json"), "utf8"));
  const version = target.packages?.[packageName];
  if (!version) return [];
  const revision = target.generativeUiReleaseRevision;
  const errors = [];
  if (!/^[a-f0-9]{40}$/u.test(revision ?? "")) {
    errors.push("target.generativeUiReleaseRevision must be an exact release commit SHA");
  }
  const provenance = JSON.parse(await readFile(path.join(repoRoot, vendorDirectory, "UPSTREAM.json"), "utf8"));
  if (provenance.revision !== revision) errors.push(`Generative UI UPSTREAM.json revision is ${provenance.revision}; expected ${revision}`);
  if (provenance.packages?.[packageName] !== version) errors.push(`Generative UI UPSTREAM.json ${packageName} is ${provenance.packages?.[packageName]}; expected ${version}`);
  const expectedFiles = new Set(["styled-generative-ui.tsx", "generative-ui.css"]);
  const provenanceFiles = provenance.files ?? [];
  if (provenanceFiles.length !== expectedFiles.size) errors.push("Generative UI UPSTREAM.json must list exactly the styled component and vocabulary CSS");
  for (const file of provenanceFiles) {
    if (!expectedFiles.delete(file.localPath)) {
      errors.push(`Unexpected or duplicate Generative UI provenance file ${file.localPath}`);
      continue;
    }
    const content = await readFile(path.join(repoRoot, vendorDirectory, file.localPath));
    const installedSha256 = createHash("sha256").update(content).digest("hex");
    if (installedSha256 !== file.installedSha256) {
      errors.push(`${file.localPath} installed hash ${installedSha256} does not match provenance ${file.installedSha256}`);
    }
    if (!/^[a-f0-9]{64}$/u.test(file.upstreamSha256 ?? "")) errors.push(`${file.localPath} has invalid upstreamSha256`);
  }
  for (const missing of expectedFiles) errors.push(`Generative UI UPSTREAM.json is missing ${missing}`);
  for (const id of itemIds) {
    const relativePath = `packages/source-registry/registry/items/${id}/item.json`;
    const item = JSON.parse(await readFile(path.join(repoRoot, relativePath), "utf8"));
    if (item.packages?.[packageName] !== version) errors.push(`${id}/item.json ${packageName} is ${item.packages?.[packageName]}; expected ${version}`);
    if (item.upstream?.revision !== revision) errors.push(`${id}/item.json upstream.revision is ${item.upstream?.revision}; expected ${revision}`);
    if (baseGitSha) {
      try {
        const before = JSON.parse(gitContent(repoRoot, baseGitSha, relativePath).toString("utf8"));
        const changed = await resourceChangedFromBaseline(repoRoot, baseGitSha, id, before, item);
        const expectedVersion = changed ? patchAfter(before.version) : before.version;
        if (item.version !== expectedVersion) errors.push(`${id}/item.json Source Item version is ${item.version}; expected ${expectedVersion} after Generative UI sync`);
      } catch (error) {
        errors.push(`${id}/item.json baseline check failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return errors;
}
