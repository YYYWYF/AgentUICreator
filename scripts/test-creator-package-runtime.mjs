import assert from "node:assert/strict";
import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { artifactEnvironment, inTemporaryDirectory, sidecarSmoke, unpackCreator } from "./creator-distribution-helpers.mjs";

// Use an empty PATH: neither system Python, pip nor a package manager can be used.
await inTemporaryDirectory(async (temporary) => {
  const unpacked = await unpackCreator(temporary);
  const cache = path.join(temporary, "python-cache");
  const emptyPath = path.join(temporary, "empty-path");
  await mkdir(emptyPath);
  const environment = { ...artifactEnvironment(""), PATH: emptyPath, Path: emptyPath, CREATOR_PYTHON_ENV_ROOT: cache, PYTHONHOME: "invalid-user-python", VIRTUAL_ENV: "invalid-user-venv" };
  await sidecarSmoke(unpacked, temporary, environment);
  await sidecarSmoke(unpacked, temporary, environment);
  await assert.rejects(access(cache), { code: "ENOENT" });
  console.log("Installed Creator started and restarted using only its bundled platform runtime, with no Python/pip on PATH and no environment bootstrap.");
});
