// Copied into the isolated consumer and run in a separate Node process. This
// script must resolve everything from the installed Creator, never the workspace.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readFile, realpath } from "node:fs/promises";

const [creatorRoot, projectRoot] = process.argv.slice(2);
const require = createRequire(path.join(creatorRoot, "package.json"));
const platformName = `@za38.03/agent-ui-creator-${process.platform}-${process.arch}`;
const platformRoot = path.dirname(require.resolve(`${platformName}/package.json`));
const sidecar = JSON.parse(await readFile(path.join(platformRoot, "sidecar.json"), "utf8"));
for (const command of ["python", "python3", "py", "pip", "pip3"]) {
  assert.equal(spawnSync(command, ["--version"], { env: process.env }).error?.code, "ENOENT", `${command} must be unavailable`);
}
const { PythonCreatorProcessManager, resolveCreatorPythonExecutable } = await import(pathToFileURL(path.join(creatorRoot, "dist/PythonCreatorProcessManager.js")).href);
const runtime = await resolveCreatorPythonExecutable({ environment: process.env });
assert.equal(runtime.source, "packaged_sidecar");
assert.equal(await realpath(runtime.executable), await realpath(path.join(platformRoot, sidecar.executable)));
const probe = JSON.parse(execFileSync(runtime.executable, ["-I", "-c", "import json,sys; print(json.dumps({'executable':sys.executable,'prefix':sys.prefix}))"], { env: process.env, encoding: "utf8" }));
assert.equal(await realpath(probe.executable), await realpath(runtime.executable));
assert(!path.relative(platformRoot, probe.prefix).startsWith(".."));
for (let attempt = 1; attempt <= 2; attempt++) {
  const logs = [];
  const manager = new PythonCreatorProcessManager({ projectRoot, configRoot: projectRoot, allowExternalEndpoint: false, startupTimeoutMs: 60_000, log: message => logs.push(message) });
  let url;
  try {
    const endpoint = await manager.ensureStarted();
    url = `http://${endpoint.host}:${endpoint.port}/health`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${endpoint.authToken}` } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).runtime, "python");
    assert(logs.some(message => message.includes("source=packaged_sidecar")));
    console.log(`[Creator runtime] Bundled Python start ${attempt}: health=200, source=packaged_sidecar`);
  } finally { await manager.dispose(); }
  await assert.rejects(fetch(url));
}
console.log(`[Creator runtime] System Python/pip unavailable; executable=${probe.executable}`);
