import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const vendorRoot = path.join(packageRoot, "src/internal/vendor/assistant-ui");
const target = JSON.parse(await readFile(path.join(repoRoot, "assistant-ui-upgrade-target.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(vendorRoot, "upstream-elements.json"), "utf8"));
const provenance = JSON.parse(await readFile(path.join(vendorRoot, "UPSTREAM.json"), "utf8"));
const lock = JSON.parse(await readFile(path.join(vendorRoot, "assistant-ui-upstream.lock.json"), "utf8"));

const revisions = [
  ["target", target.revision],
  ["upstream-elements.json", manifest.revision],
  ["UPSTREAM.json", provenance.revision],
  ["assistant-ui-upstream.lock.json", lock.revision],
];
const errors = [];
for (const [name, revision] of revisions) {
  if (revision !== target.revision) errors.push(`${name} revision is ${revision}; expected ${target.revision}`);
}
if (String(target.revision).includes("main")) errors.push("target revision must be an exact SHA, not main");

const repo = process.env.ASSISTANT_UI_REPO ?? path.resolve(repoRoot, "../assistant-ui");
try {
  const resolved = (await execFile("git", ["-C", repo, "rev-parse", `${target.revision}^{commit}`], {
    cwd: repoRoot,
    encoding: "utf8",
  })).stdout.trim();
  if (resolved !== target.revision) errors.push(`target revision resolved to ${resolved}`);
} catch (error) {
  errors.push(`cannot resolve target revision in ${repo}: ${error instanceof Error ? error.message : String(error)}`);
}

if (errors.length > 0) {
  console.error(["assistant-ui vendor revision guard failed:", ...errors].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`assistant-ui vendor revision guard: OK (${target.revision})`);
}
