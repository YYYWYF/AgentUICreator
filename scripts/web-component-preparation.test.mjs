import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { hostPackages, preparationState } from "./preparation-state.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
test("Web Component prepares Creator before loading Bootstrap and propagates build failures", async () => {
  const stage = await mkdtemp(path.join(tmpdir(), "Agent UI 合包 preparation "));
  try {
    const script = path.join(stage, "packages/web-component/scripts/prepare-shell.mjs");
    await mkdir(path.dirname(script), { recursive: true });
    await mkdir(path.join(stage, "scripts"));
    await writeFile(script, await readFile(new URL("../packages/web-component/scripts/prepare-shell.mjs", import.meta.url)));
    await writeFile(path.join(stage, "scripts/prepare-host-packages.mjs"), `export { prepareHostPackages } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/prepare-host-packages.mjs")).href)};\n`);
    const calls = path.join(stage, "calls.jsonl");
    const pnpm = path.join(stage, "pnpm.cjs");
    await writeFile(pnpm, `const args = process.argv.slice(2); require("node:fs").appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + "\\n"); if (args.includes("@za38.03/agent-ui-creator")) process.exitCode = 42;\n`);
    const result = spawnSync(process.execPath, [script], {
      cwd: stage, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, npm_execpath: pnpm, AGENT_UI_HOST_PACKAGES_PREPARED: preparationState(hostPackages) },
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Host package preparation failed: @za38\.03\/agent-ui-creator/);
    assert(!result.stderr.includes("ERR_MODULE_NOT_FOUND"), result.stderr);
    const commands = (await readFile(calls, "utf8")).trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(commands.at(-1), ["--filter", "@za38.03/agent-ui-creator", "build"]);
    assert(!commands.some(args => args.includes("@za38.03/agent-ui-web-component")), "Tool preparation must not recursively build the bridge");
  } finally { await rm(stage, { recursive: true, force: true }); }
});
