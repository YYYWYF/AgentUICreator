import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { promisify } from "node:util";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { build } from "vite";

import { initializeAgentUIProject } from "../../agent-frontend/scripts/ui-project/initialize-agent-ui-project";
import { inspectCreatorProject } from "../../agent-frontend/scripts/ui-project/creator-project-inspector";
import { runtimeAliases } from "../vite.config";

const sandboxRoot = fileURLToPath(new URL("..", import.meta.url));
const hostSourceRoots = [
  sandboxRoot,
  path.join(sandboxRoot, "..", "creator-assistant-host"),
  path.join(sandboxRoot, "..", "creator-embedded-host"),
].map((root) => path.join(root, "src"));
const prohibited = /(?:\/|\\)agent-ui(?:\/|\\)(?:runtime|framework|plugins|app-ui)(?:\/|\\)/u;
const execFileAsync = promisify(execFile);

async function hostFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "agent-ui" && hostSourceRoots.includes(directory)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await hostFiles(absolute));
    else if (/\.[cm]?[jt]sx?$/u.test(entry.name)) files.push(absolute);
  }
  return files;
}

test("Host-owned source imports only the public Agent UI entry", async () => {
  for (const root of hostSourceRoots) {
    for (const file of await hostFiles(root)) {
      const source = await readFile(file, "utf8");
      assert.doesNotMatch(source, prohibited, file);
    }
  }
});

for (const mode of ["assistant", "embedded", "platform"] as const) {
  test(`a plain temporary Host can initialize ${mode} and bundle the public Agent entry without metadata`, async () => {
    const projectRoot = await mkdtemp(path.join(os.tmpdir(), "creator-host-entry-"));
    try {
      await writeFile(path.join(projectRoot, "package.json"), await readFile(path.join(sandboxRoot, "package.json")));
      await symlink(path.join(sandboxRoot, "node_modules"), path.join(projectRoot, "node_modules"), "dir");
      await mkdir(path.join(projectRoot, "src"));
      await writeFile(path.join(projectRoot, "index.html"),
        '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n');
      await writeFile(path.join(projectRoot, "src/main.tsx"),
        'import { createRoot } from "react-dom/client";\nimport { Agent } from "./agent-ui";\ncreateRoot(document.getElementById("root")!).render(<Agent />);\n');

      assert.equal((await inspectCreatorProject(projectRoot)).status, "uninitialized");
      await initializeAgentUIProject({ projectRoot, mode, sourceRoot: "src/agent-ui" });
      assert.equal((await inspectCreatorProject(projectRoot)).status, "ready");
      const runtimeConfig = await readFile(
        path.join(projectRoot, "src/agent-ui/application/runtime-config.generated.ts"),
        "utf8",
      );
      assert.ok(runtimeConfig.includes(`agentUIRuntimeConfig = { mode: "${mode}" } as const`));
      assert.doesNotMatch(
        await readFile(path.join(projectRoot, "src/agent-ui/application/Agent.tsx"), "utf8"),
        /\.agent-ui\/|import\.meta\.glob/u,
      );

      // Simulate deployment that excludes Creator control-plane metadata.
      await rm(path.join(projectRoot, ".agent-ui"), { recursive: true });

      await writeFile(path.join(projectRoot, "tsconfig.json"), JSON.stringify({
        extends: path.join(sandboxRoot, "tsconfig.json"),
        include: ["src"],
      }));
      await execFileAsync(process.execPath, [
        path.join(sandboxRoot, "node_modules/typescript/bin/tsc"),
        "--project", path.join(projectRoot, "tsconfig.json"),
        "--noEmit",
      ]);

      await build({
        root: projectRoot,
        configFile: false,
        plugins: [react(), tailwindcss()],
        resolve: { alias: runtimeAliases },
        build: { outDir: path.join(projectRoot, "dist"), emptyOutDir: true },
        logLevel: "silent",
      });
    } finally {
      await rm(projectRoot, { recursive: true, force: true });
    }
  });
}
