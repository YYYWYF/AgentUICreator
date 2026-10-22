// Isolated official preset for cross-language HTTP interrupt/resume regression.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { minVersion } from "semver";
import { createDefaultAgentUIPresetRegistry, initializeAgentUIProject } from "@za38.03/agent-ui-operator/bootstrap";
import { loadAgentUISourceRegistry, resolveAgentUISourceItemClosure } from "@za38.03/agent-ui-operator/source-registry";
import { parseAppUIModel } from "../../src/framework/contracts/app-ui-model";
import { createAgentUIInitializationHost } from "../../src/project/bootstrap-host";

const root = process.argv[2]!;
await mkdir(root, { recursive: true });
const registry = await loadAgentUISourceRegistry();
const preset = createDefaultAgentUIPresetRegistry(parseAppUIModel).list().find(item => item.mode === "assistant")!;
const items = preset.sourceItems!.flatMap(id => resolveAgentUISourceItemClosure(registry, id));
const dependencies = Object.assign({}, ...items.map(item => item.packages ?? {})) as Record<string, string>;
await writeFile(path.join(root, "package.json"), JSON.stringify({ dependencies }));
for (const [name, required] of Object.entries(dependencies)) {
  const directory = path.join(root, "node_modules", name);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "package.json"), JSON.stringify({ name, version: minVersion(required)!.version }));
}
await writeFile(path.join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: {
  target: "ES2022", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", resolveJsonModule: true,
}, include: ["agent-ui"] }));
await initializeAgentUIProject({ projectRoot: root, mode: "assistant", sourceRoot: "agent-ui" }, createAgentUIInitializationHost());
const runtime = fileURLToPath(new URL("../../dist/runtime/operator-runtime.mjs", import.meta.url));
const operatorRoot = path.join(root, ".agent-ui/operator");
await mkdir(operatorRoot, { recursive: true });
await writeFile(path.join(operatorRoot, "entry.mjs"), `import { runUIOperatorCli } from ${JSON.stringify(pathToFileURL(runtime).href)};\nawait runUIOperatorCli(${JSON.stringify(root)});\n`);
