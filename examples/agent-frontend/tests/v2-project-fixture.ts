import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { AppUIModel } from "../framework/contracts/app-ui-model";
import { resolveAgentUIProjectPaths } from "../scripts/ui-project/agent-ui-project-paths";

export async function createV2ProjectFixture() {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "agent-ui-v2-"));
  const projectConfig = { version: "2" as const, mode: "assistant" as const, sourceRoot: "src/agent-ui" };
  const paths = resolveAgentUIProjectPaths(projectRoot, projectConfig);
  const model: AppUIModel = {
    root: { type: "slot", plugins: [{ id: "foo-main", pluginId: "foo", enabled: true }] },
  };
  const modelSource = `${JSON.stringify(model, null, 2)}\n`;
  await Promise.all([
    mkdir(paths.metadataRoot, { recursive: true }),
    mkdir(path.dirname(paths.appUIModelPath), { recursive: true }),
    mkdir(path.join(paths.pluginsRoot, "foo"), { recursive: true }),
    mkdir(paths.runtimeRoot, { recursive: true }),
    mkdir(path.join(projectRoot, "plugins", "root-only"), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(paths.projectConfigPath, `${JSON.stringify(projectConfig)}\n`),
    writeFile(paths.appUIModelPath, modelSource),
    writeFile(path.join(paths.pluginsRoot, "foo", "manifest.json"), JSON.stringify({
      id: "foo", name: "Foo", description: "V2 fixture plugin", version: "1.0.0", capabilities: ["visual"],
    })),
    writeFile(path.join(paths.pluginsRoot, "foo", "definition.ts"), "const definition = {};\nexport default definition;\n"),
    writeFile(path.join(projectRoot, "plugins", "root-only", "manifest.json"), JSON.stringify({
      id: "root-only", name: "Root only", description: "Must not be discovered", version: "1.0.0",
    })),
    writeFile(path.join(projectRoot, "plugins", "root-only", "definition.ts"), "export default {};\n"),
    writeFile(path.join(projectRoot, "package.json"), JSON.stringify({ dependencies: { react: "19.2.8" } })),
    writeFile(path.join(projectRoot, "tsconfig.json"), JSON.stringify({
      compilerOptions: { module: "ESNext", moduleResolution: "Bundler", target: "ES2022" },
      include: ["src/agent-ui/**/*.ts"],
    })),
    writeFile(path.join(paths.runtimeRoot, "composition.ts"), "export const fixture = true;\n"),
  ]);
  return { projectRoot, projectConfig, paths, model, modelSource };
}
