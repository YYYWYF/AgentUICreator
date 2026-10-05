import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "@assistant-ui/react-generative-ui";
const itemIds = ["agent-component-assistant-ui-generative-ui", "integration-generative-ui"];
const vendorDirectory = "packages/source-registry/registry/items/agent-component-assistant-ui-generative-ui/files/agent-ui/vendor/assistant-ui/generative-ui";

export async function checkGenerativeUiResource({ repoRoot = defaultRoot, target } = {}) {
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
    if (Object.hasOwn(item, "version")) errors.push(`${id}/item.json must not declare a Source Item version`);
  }
  return errors;
}
