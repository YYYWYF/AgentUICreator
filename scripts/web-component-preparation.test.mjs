import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("..", import.meta.url));
test("Web Component prepares Creator before loading Bootstrap and propagates build failures", async () => {
  const stage = await mkdtemp(path.join(tmpdir(), "Agent UI 合包 preparation "));
  try {
    const script = path.join(stage, "packages/web-component/scripts/prepare-shell.mjs");
    await mkdir(path.dirname(script), { recursive: true });
    await mkdir(path.join(stage, "scripts"));
    await writeFile(script, await readFile(new URL("../packages/web-component/scripts/prepare-shell.mjs", import.meta.url)));
    for (const name of ["prepare-host-packages.mjs", "workspace-build-cache.mjs", "pnpm-process.mjs"]) {
      await writeFile(path.join(stage, "scripts", name), await readFile(path.join(root, "scripts", name)));
    }
    for (const name of ["core", "renderer", "plugins", "runtime", "creator"]) {
      await mkdir(path.join(stage, "packages", name), { recursive: true });
      await writeFile(path.join(stage, "packages", name, "package.json"), JSON.stringify({ name: `@za38.03/agent-ui-${name}` }));
    }
    const calls = path.join(stage, "calls.jsonl");
    const pnpm = path.join(stage, "pnpm.cjs");
    await writeFile(pnpm, `const fs = require("node:fs"), path = require("node:path"), args = process.argv.slice(2); fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + "\\n"); if (args.includes("@za38.03/agent-ui-creator")) process.exitCode = 42; else { const dist = path.join(${JSON.stringify(stage)}, "packages", args[1].replace("@za38.03/agent-ui-", ""), "dist"); fs.mkdirSync(dist, { recursive: true }); fs.writeFileSync(path.join(dist, "index.js"), ""); }\n`);
    const result = spawnSync(process.execPath, [script], {
      cwd: stage, encoding: "utf8", timeout: 30_000,
      env: { ...process.env, npm_execpath: pnpm },
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
