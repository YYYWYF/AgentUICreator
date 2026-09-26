import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const vendorRoot = path.join(packageRoot, "src/internal/vendor/assistant-ui");
const UPSTREAM_REPOSITORY = "https://github.com/assistant-ui/assistant-ui.git";
const UPSTREAM_REF = "refs/heads/main";
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

if (!target.releasePinned) try {
  const remote = (await execFile("git", ["ls-remote", UPSTREAM_REPOSITORY, UPSTREAM_REF], {
    cwd: repoRoot,
    encoding: "utf8",
  })).stdout.trim().split(/\s+/u)[0];
  if (!/^[a-f0-9]{40}$/u.test(remote ?? "")) {
    errors.push(`cannot resolve official assistant-ui remote ${UPSTREAM_REF}`);
  } else if (target.revision !== remote) {
    errors.push([
      "assistant-ui vendor is stale",
      `target: ${target.revision}`,
      `remote main: ${remote}`,
      "run: pnpm assistant-ui:update",
    ].join("\n"));
  }
} catch (error) {
  errors.push(`cannot resolve official assistant-ui remote ${UPSTREAM_REF}: ${error instanceof Error ? error.message : String(error)}`);
}

const repo = process.env.ASSISTANT_UI_REPO ?? (target.releasePinned ? path.resolve(repoRoot, "../assistant-ui") : undefined);
if (repo) {
  try {
    for (const [name, revision] of Object.entries(target.packageRevisions ?? {})) {
      const version = target.packages[name];
      const actual = (await execFile("git", ["-C", repo, "rev-parse", `${name}@${version}^{commit}`], { encoding: "utf8" })).stdout.trim();
      if (actual !== revision) errors.push(`${name}@${version} release revision mismatch`);
    }
    await execFile("git", ["-C", repo, "cat-file", "-e", `${target.revision}^{commit}`], {
      cwd: repoRoot,
      encoding: "utf8",
    });
  } catch (error) {
    errors.push(`cannot resolve target revision in ${repo}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (errors.length > 0) {
  console.error(["assistant-ui vendor revision guard failed:", ...errors].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`assistant-ui vendor revision guard: OK (${target.revision})`);
}
