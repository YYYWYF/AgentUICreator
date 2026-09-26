import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
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
import { handleUIProjectControlRequest } from "../../agent-frontend/scripts/ui-project-control";
import { verifyUIProject } from "../../agent-frontend/scripts/verify-ui";
import { runtimeAliases } from "../vite.config";
import { installDemoPlugin } from "../../agent-frontend/scripts/ui-project/install-demo-plugin";

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
      await writeFile(path.join(projectRoot, "tsconfig.json"), JSON.stringify({
        extends: path.join(sandboxRoot, "tsconfig.json"),
        include: ["src"],
      }));
      await writeFile(path.join(projectRoot, "index.html"),
        '<div id="root"></div><script type="module" src="/src/main.tsx"></script>\n');
      await writeFile(path.join(projectRoot, "src/main.tsx"),
        'import { createRoot } from "react-dom/client";\nimport { Agent } from "./agent-ui";\ncreateRoot(document.getElementById("root")!).render(<Agent />);\n');

      assert.equal((await inspectCreatorProject(projectRoot)).status, "uninitialized");
      await initializeAgentUIProject({ projectRoot, mode, sourceRoot: "src/agent-ui" });
      const initializedModel = JSON.parse(await readFile(
        path.join(projectRoot, "src/agent-ui/app-ui/app-ui.json"), "utf8",
      )) as { applicationPlugins: Array<{ pluginId: string; enabled: boolean }> };
      assert.equal(initializedModel.applicationPlugins.some((plugin) =>
        plugin.pluginId === "chart-message"), false);
      await assert.rejects(readFile(path.join(projectRoot, "src/agent-ui/plugins/chart-message/definition.ts")), { code: "ENOENT" });
      assert.match(await readFile(
        path.join(projectRoot, "src/agent-ui/application/Agent.tsx"), "utf8",
      ), /<PluginDataMessageUIHost/u);
      assert.equal((await inspectCreatorProject(projectRoot)).status, "ready");
      if (mode === "platform") {
        // A foundation version upgrade must preserve byte-identical files,
        // avoiding needless HMR invalidation of shared React contexts.
        const unchangedPath = path.join(projectRoot, "src/agent-ui/runtime/plugins/PluginServiceContext.ts");
        const beforeUnchanged = await stat(unchangedPath);
        const lockPath = path.join(projectRoot, ".agent-ui/source-lock.json");
        const lock = JSON.parse(await readFile(lockPath, "utf8"));
        lock.items["foundation/core-runtime"].version = "0.0.0";
        await writeFile(lockPath, JSON.stringify(lock));
        await installDemoPlugin(projectRoot, "chart-message");
        const afterUnchanged = await stat(unchangedPath);
        assert.equal(afterUnchanged.ino, beforeUnchanged.ino);
        assert.equal(afterUnchanged.mtimeMs, beforeUnchanged.mtimeMs);
        const updatedLock = JSON.parse(await readFile(lockPath, "utf8"));
        assert.notEqual(updatedLock.items["foundation/core-runtime"].version, "0.0.0");
        await installDemoPlugin(projectRoot, "chart-message");
        const after = JSON.parse(await readFile(path.join(projectRoot, "src/agent-ui/app-ui/app-ui.json"), "utf8"));
        const charts = after.applicationPlugins.filter((plugin: { pluginId: string }) => plugin.pluginId === "chart-message");
        assert.equal(charts.length, 1);
        assert.equal(charts[0].enabled, true);
        assert.match(await readFile(path.join(projectRoot, "src/agent-ui/plugins/registry.generated.ts"), "utf8"), /chart-message\/definition/u);
        charts[0].enabled = false;
        await writeFile(path.join(projectRoot, "src/agent-ui/app-ui/app-ui.json"), JSON.stringify(after));
        await installDemoPlugin(projectRoot, "chart-message");
        const reenabled = JSON.parse(await readFile(path.join(projectRoot, "src/agent-ui/app-ui/app-ui.json"), "utf8"));
        assert.equal(reenabled.applicationPlugins.find((plugin: { pluginId: string }) => plugin.pluginId === "chart-message").enabled, true);
        for (const pluginId of ["job-progress-message", "agent-plan-message", "agent-status-message"]) {
          await installDemoPlugin(projectRoot, pluginId);
          const current = JSON.parse(await readFile(path.join(projectRoot, "src/agent-ui/app-ui/app-ui.json"), "utf8"));
          assert.equal(current.applicationPlugins.find((plugin: { pluginId: string }) => plugin.pluginId === pluginId).enabled, true);
          assert.match(await readFile(path.join(projectRoot, `src/agent-ui/plugins/${pluginId}/definition.ts`), "utf8"), /toolkit:/u);
        }
      }
      const controlResponse = await handleUIProjectControlRequest({
        schemaVersion: 3,
        operation: "inspect_ui_project",
        input: { view: "composition" },
      }, projectRoot);
      assert.equal(controlResponse.ok, true, JSON.stringify(controlResponse));
      const verification = await verifyUIProject(projectRoot);
      assert.equal(verification.status, "passed", JSON.stringify(verification.errors));
      // Exercise both sides of the composition edit in a disposable Host.
      let inspection = controlResponse.result as {
        appUIModel: { hash: string };
        creatorActions: { candidates: Array<{
          actionId: string; kind: string; status: string; target: { pluginId: string };
        }> };
      };
      const roundTripPlugin = mode === "platform" ? "conversation-thread-list" : "conversation-suggestions";
      for (let index = 0; index < 2; index += 1) {
        const action = inspection.creatorActions.candidates.find((candidate) =>
          candidate.target.pluginId === roundTripPlugin && candidate.status === "ready" &&
          (candidate.kind === "add_existing_plugin" || candidate.kind === "remove_plugin"));
        assert.ok(action, JSON.stringify(inspection.creatorActions.candidates.filter((candidate) =>
          candidate.target.pluginId === roundTripPlugin)));
        const mutation = await handleUIProjectControlRequest({
          schemaVersion: 3,
          operation: "mutate_app_ui_model",
          input: {
            appUIModelHash: inspection.appUIModel.hash,
            operations: [{ type: "execute_creator_action", actionId: action.actionId }],
          },
        }, projectRoot);
        assert.equal(mutation.ok, true, JSON.stringify(mutation));
        const result = mutation.result as { changed: boolean; changedPaths: string[] };
        assert.equal(result.changed, true);
        assert.ok(result.changedPaths.includes("src/agent-ui/app-ui/app-ui.json"));
        const verified = await verifyUIProject(projectRoot);
        assert.equal(verified.status, "passed", JSON.stringify(verified.errors));
        const refreshed = await handleUIProjectControlRequest({
          schemaVersion: 3, operation: "inspect_ui_project", input: { view: "composition" },
        }, projectRoot);
        assert.equal(refreshed.ok, true, JSON.stringify(refreshed));
        inspection = refreshed.result as typeof inspection;
      }
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
