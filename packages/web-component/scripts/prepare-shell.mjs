import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareHostPackages } from "../../../scripts/prepare-host-packages.mjs";

prepareHostPackages();
const { initializeAgentUIProject } = await import("../../operator/dist/bootstrap/index.js");
const { createAgentUIInitializationHost } = await import("../../operator/dist/runtime/operator-runtime.mjs");
const projectRoot = fileURLToPath(new URL("../.generated/", import.meta.url));
const sourceRoot = path.join(projectRoot, "src");
const nodeModules = path.join(projectRoot, "node_modules");
// Disposable build input: generate the same official embedded preset, never copy
// a user's installed project or maintain a second set of feature implementations.
await rm(projectRoot, { recursive: true, force: true });
await mkdir(sourceRoot, { recursive: true });
await symlink(fileURLToPath(new URL("../node_modules/", import.meta.url)), nodeModules, "junction");
const packageSource = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await writeFile(path.join(projectRoot, "package.json"), JSON.stringify({ name: "agent-ui-bridge-shell", private: true, type: "module", dependencies: packageSource.dependencies, devDependencies: packageSource.devDependencies }));
await writeFile(path.join(projectRoot, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true } }));
const host = createAgentUIInitializationHost();
// Build input has no development control plane: only production source items.
await initializeAgentUIProject({ projectRoot, mode: "embedded", sourceRoot: "src/agent-ui" }, {
  ...host,
  installOperatorEntry: async () => [],
  installDevelopmentDefaults: async () => [],
});
