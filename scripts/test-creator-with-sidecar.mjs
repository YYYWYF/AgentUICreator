// Keep the original correctness gate without provisioning system Python in the Node job.
import path from "node:path";
import { run, pnpm, repositoryRoot } from "./creator-distribution-helpers.mjs";
import { sidecarRoot, verifySidecarPackage } from "../packages/creator/scripts/verify-sidecar-package.mjs";

const root = sidecarRoot(`${process.platform}-${process.arch}`);
const sidecar = await verifySidecarPackage(root);
const python = path.join(root, sidecar.executable);
const environment = { ...process.env, CREATOR_PYTHON_EXECUTABLE: python, CREATOR_NODE_EXECUTABLE: process.execPath,
  PYTHONPATH: path.join(repositoryRoot, "packages/creator/python"), PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" };
delete environment.PYTHONHOME;
await run(python, ["-m", "pytest", "packages/creator/python/tests"], { cwd: repositoryRoot, env: environment });
await run(pnpm, ["test:ts"], { cwd: repositoryRoot, env: environment });
