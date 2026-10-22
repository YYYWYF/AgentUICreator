import path from "node:path";
import { artifactEnvironment, contractSmoke, inTemporaryDirectory, run, sidecarSmoke, unpackCreator } from "./creator-distribution-helpers.mjs";
import { readFile } from "node:fs/promises";

await inTemporaryDirectory(async (temporary) => {
  const unpacked = await unpackCreator(temporary);
  const root = path.join(unpacked, "node_modules", `@za38.03/agent-ui-creator-${process.platform}-${process.arch}`);
  const sidecar = JSON.parse(await readFile(path.join(root, "sidecar.json"), "utf8"));
  const python = path.join(root, sidecar.executable);
  const pythonPackageRoot = path.join(root, sidecar.pythonPackageRoot);
  const environment = artifactEnvironment(pythonPackageRoot);
  await run(python, ["-c", contractSmoke, pythonPackageRoot], { cwd: temporary, env: environment });
  await sidecarSmoke(unpacked, temporary, environment);
  console.log("Creator npm tarball structure, contract parity, and packaged sidecar health passed.");
});
