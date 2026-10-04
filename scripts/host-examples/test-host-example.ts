import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inspectCreatorProject, verifyUIProject } from "../../packages/project-control/dist/runtime/project-control-runtime.mjs";

const projects = {
  platform: "creator-host-sandbox",
  assistant: "creator-assistant-host",
  embedded: "creator-embedded-host",
} as const;
const mode = process.argv[2];
const projectName = process.argv[3];
assert.ok(mode === "platform" || mode === "assistant" || mode === "embedded",
  "Usage: test-host-example.ts platform|assistant|embedded project");
assert.equal(projectName, projects[mode], "Mode must match its named Host example");
const projectRoot = fileURLToPath(new URL(`../../examples/${projectName}/`, import.meta.url));
const sourceRoot = path.join(projectRoot, "src");
const generatedRoot = path.join(sourceRoot, "agent-ui");

async function hostSourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (absolute === generatedRoot) continue;
    if (entry.isDirectory()) files.push(...await hostSourceFiles(absolute));
    else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) files.push(absolute);
  }
  return files;
}

function sourceImports(source: string): Array<{ kind: string; clause: string; specifier: string }> {
  // Read only module references; prose examples in comments are not imports.
  const code = source.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gmu, "");
  return Array.from(code.matchAll(
    /\b(?<kind>import|export)\s+(?:(?<clause>[^;"']*?)\s+from\s*)?["'](?<specifier>[^"']+)["']|\b(?:import|require)\s*\(\s*["'](?<dynamic>[^"']+)["']/gu,
  ), match => ({ kind: match.groups?.kind ?? "dynamic", clause: match.groups?.clause ?? "", specifier: match.groups?.specifier ?? match.groups?.dynamic ?? "" }));
}

async function main() {
  const state = await inspectCreatorProject(projectRoot);
  assert.equal(state.status, "ready", JSON.stringify(state));
  assert.ok(state.status === "ready");
  assert.deepEqual(state.projectConfig, { mode, sourceRoot: "src/agent-ui" });

  // pretest ensures the Host once; a second ensure must accept the same configuration.
  execFileSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./host-project.ts", import.meta.url)), "ensure", mode, projects[mode]], {
    cwd: projectRoot,
    stdio: "pipe",
  });
  const ensuredState = await inspectCreatorProject(projectRoot);
  assert.equal(ensuredState.status, "ready", JSON.stringify(ensuredState));
  assert.ok(ensuredState.status === "ready");
  assert.deepEqual(ensuredState.projectConfig, { mode, sourceRoot: "src/agent-ui" });

  const verification = await verifyUIProject(projectRoot);
  assert.equal(verification.status, "passed", JSON.stringify(verification.errors));

  const mountImports = sourceImports(await readFile(path.join(sourceRoot, "AgentMount.tsx"), "utf8"));
  const agentImports = mountImports.filter(({ kind, clause }) => {
    const bindings = clause.match(/\{([^}]*)\}/u)?.[1]?.split(",") ?? [];
    return kind === "import" && !/^type\b/u.test(clause.trim()) &&
      bindings.some(binding => /^\s*Agent(?:\s+as\s+\w+)?\s*$/u.test(binding));
  });
  assert.ok(agentImports.length > 0, "AgentMount.tsx must import Agent from the public entry");
  for (const entry of agentImports) assert.equal(entry.specifier, "./agent-ui");

  for (const file of await hostSourceFiles(sourceRoot)) {
    for (const { specifier } of sourceImports(await readFile(file, "utf8"))) {
      const normalized = specifier.replaceAll("\\", "/");
      assert.doesNotMatch(normalized, /(?:^|\/)agent-ui\/(?:runtime|framework|plugins|app-ui)(?:\/|$)/u, file);
      if (normalized.startsWith(".")) {
        const relative = path.relative(generatedRoot, path.resolve(path.dirname(file), normalized));
        assert.doesNotMatch(relative.replaceAll("\\", "/"), /^(?:runtime|framework|plugins|app-ui)(?:\/|$)/u, file);
      }
    }
  }
  console.log(`${projectName}: ready (${mode}), UI verification passed, public integration boundary passed`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
