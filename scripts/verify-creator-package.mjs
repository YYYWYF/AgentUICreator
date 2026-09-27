import path from "node:path";
import { artifactEnvironment, contractSmoke, inTemporaryDirectory, repositoryPython, run, sidecarSmoke, unpackCreator } from "./creator-distribution-helpers.mjs";

await inTemporaryDirectory(async (temporary) => {
  const unpacked = await unpackCreator(temporary);
  const python = await repositoryPython();
  const pythonPackageRoot = path.join(unpacked, "dist/python");
  const environment = artifactEnvironment(pythonPackageRoot);
  await run(python, ["-c", contractSmoke, pythonPackageRoot], { cwd: temporary, env: environment });
  await sidecarSmoke(unpacked, temporary, environment, python);
  console.log("Creator npm tarball structure, contract parity, and packaged sidecar health passed.");
});
