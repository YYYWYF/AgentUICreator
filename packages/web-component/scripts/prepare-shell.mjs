import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "../../../scripts/prepare-host-packages.mjs";

prepareHostPackages();
const { initializeAgentUIProject } = await import("../../bootstrap/dist/index.js");
const { createAgentUIInitializationHost } = await import("../../project-control/dist/runtime/project-control-runtime.mjs");
const projectRoot = fileURLToPath(new URL("../.generated/", import.meta.url));
// Disposable build input: generate the same official embedded preset, never copy
// a user's installed project or maintain a second set of feature implementations.
await rm(projectRoot, { recursive: true, force: true });
await mkdir(`${projectRoot}/src`, { recursive: true });
await symlink(fileURLToPath(new URL("../node_modules/", import.meta.url)), `${projectRoot}/node_modules`, "junction");
const packageSource = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await writeFile(`${projectRoot}/package.json`, JSON.stringify({ name: "agent-ui-bridge-shell", private: true, type: "module", dependencies: packageSource.dependencies, devDependencies: packageSource.devDependencies }));
await writeFile(`${projectRoot}/tsconfig.json`, JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true } }));
const host = createAgentUIInitializationHost();
// Build input has no development control plane: only production source items.
await initializeAgentUIProject({ projectRoot, mode: "embedded", sourceRoot: "src/agent-ui" }, {
  ...host,
  installControlPlane: async () => [],
  installDevelopmentDefaults: async () => [],
});
