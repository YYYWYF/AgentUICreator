import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { artifactEnvironment, inTemporaryDirectory, sidecarSmoke, unpackCreator } from "./creator-distribution-helpers.mjs";

// Deliberately heavy: a real system interpreter bootstraps all locked dependencies.
await inTemporaryDirectory(async (temporary) => {
  const unpacked = await unpackCreator(temporary);
  const cache = path.join(temporary, "python-cache");
  const environment = { ...artifactEnvironment(path.join(unpacked, "dist/python")), CREATOR_PYTHON_ENV_ROOT: cache };
  await sidecarSmoke(unpacked, temporary, environment);
  await sidecarSmoke(unpacked, temporary, environment);
  assert((await readdir(cache)).length > 0);
  console.log("Creator tarball bootstrapped an isolated cache environment and restarted successfully.");
});
