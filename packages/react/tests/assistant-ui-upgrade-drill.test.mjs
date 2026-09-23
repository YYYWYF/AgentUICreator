import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { checkAssistantUiAgUiCompatibility } from "../../scripts/check-assistant-ui-agui-compat.mjs";
import { checkAssistantUiLangGraphCompatibility } from "../../scripts/check-assistant-ui-langgraph-compat.mjs";
import { checkAgUiLockfile } from "../../scripts/check-ag-ui-lockfile.mjs";
import { main as generateReport } from "../../scripts/generate-assistant-ui-upgrade-report.mjs";
import {
  ensureSourceCache,
  main as updateAssistantUi,
  remoteMainRevision,
} from "../../scripts/update-assistant-ui.mjs";

const execFileAsync = promisify(execFileCallback);
const packageRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const guardScript = path.join(packageRoot, "scripts/check-assistant-ui-revision.mjs");
const workspaceRoot = path.resolve(packageRoot, "../..");
const temporaryRoots = [];

async function git(root, args) {
  return (await execFileAsync("git", ["-C", root, ...args], {
    cwd: root,
    encoding: "utf8",
  })).stdout.trim();
}

async function createGitFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "assistant-ui-upgrade-drill-"));
  temporaryRoots.push(root);
  await git(root, ["init", "--quiet"]);
  await git(root, ["config", "user.email", "assistant-ui-upgrade@example.invalid"]);
  await git(root, ["config", "user.name", "assistant-ui-upgrade-test"]);
  return root;
}

async function writeFixtureFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return filePath;
}

async function createReportFixture(root) {
  await writeFixtureFile(root, "assistant-ui-upgrade-target.json", JSON.stringify({
    packages: {
      "@assistant-ui/react": "0.15.21",
      "@assistant-ui/react-ag-ui": "0.0.60",
      "@assistant-ui/react-langgraph": "0.14.29",
      "@assistant-ui/react-markdown": "0.14.16",
    },
    agUi: {
      "@ag-ui/client": "0.0.59",
    },
  }, null, 2));
  await writeFixtureFile(root, "packages/react/src/internal/vendor/assistant-ui/UPSTREAM.json", JSON.stringify({ revision: "b".repeat(40) }, null, 2));
  await writeFixtureFile(root, "assistant-ui-upgrade-report.json", JSON.stringify({
    schemaVersion: 1,
    fromRevision: "a".repeat(40),
    toRevision: "a".repeat(40),
    packagesChanged: [],
    vendorFilesChanged: [],
    vendorFilesAdded: [],
    vendorFilesRemoved: [],
    vendorFilesRenamed: [],
    newTransitiveDependencies: [],
    newAvailableElements: [],
    newlyAdoptedElements: [],
    removedUpstreamElements: [],
    changedUpstreamElements: [],
    ignoredUpstreamElements: [],
    localFacadeFilesChanged: [],
    runtimeAdapterFilesChanged: [],
    pluginFilesChanged: [],
    appUIModelFilesChanged: [],
    creatorFilesChanged: [],
    testsChanged: [],
  }, null, 2));
  await writeFixtureFile(root, "assistant-ui-upgrade-impact.md", "before\n");
  await git(root, ["add", "."]);
  await git(root, ["commit", "--quiet", "-m", "fixture"]);
  return git(root, ["rev-parse", "HEAD"]);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("assistant-ui upgrade drill", () => {
  it("passes when react-ag-ui keeps the pinned AG-UI client compatible", async () => {
    const result = await checkAssistantUiAgUiCompatibility({
      fetchRegistry: false,
      packageManifest: {
        name: "@assistant-ui/react-ag-ui",
        version: "0.0.60",
        dependencies: { "@ag-ui/client": "^0.0.59" },
      },
      target: {
        packages: { "@assistant-ui/react-ag-ui": "0.0.60" },
        agUi: { "@ag-ui/client": "0.0.59" },
      },
    });

    expect(result).toMatchObject({
      compatible: true,
      status: "PASS",
      reactAgUiClientRange: "^0.0.59",
      pinnedClientVersion: "0.0.59",
    });
  });

  it("requires review when react-ag-ui raises the AG-UI dependency floor", async () => {
    const result = await checkAssistantUiAgUiCompatibility({
      fetchRegistry: false,
      packageManifest: {
        name: "@assistant-ui/react-ag-ui",
        version: "0.0.61",
        dependencies: { "@ag-ui/client": "^0.0.60" },
      },
      target: {
        packages: { "@assistant-ui/react-ag-ui": "0.0.61" },
        agUi: { "@ag-ui/client": "0.0.59" },
      },
    });

    expect(result).toMatchObject({
      compatible: false,
      status: "REVIEW REQUIRED",
      reactAgUiClientRange: "^0.0.60",
      pinnedClientVersion: "0.0.59",
    });
    expect(result.message).toContain("Review CancellationAwareHttpAgent before upgrading.");
  });

  it("guards the LangGraph converter exports, package version, and key lockfile dependencies", async () => {
    const packageManifest = {
      name: "@assistant-ui/react-langgraph",
      version: "0.14.29",
      dependencies: {
        "@assistant-ui/core": "^0.3.20",
        "@assistant-ui/react-langchain": "^0.0.32",
        "@assistant-ui/store": "^0.3.14",
        "assistant-stream": "^0.3.44",
      },
    };
    const lockfileText = [
      "packages:",
      "  '@assistant-ui/core@0.3.20':",
      "  '@assistant-ui/react-langchain@0.0.32':",
      "  '@assistant-ui/react-langgraph@0.14.29':",
      "  '@assistant-ui/store@0.3.14':",
      "  assistant-stream@0.3.44:",
    ].join("\n");
    const input = {
      target: { packages: { "@assistant-ui/react-langgraph": "0.14.29" } },
      packageManifest,
      langGraphIndex: "export { convertLangChainMessages }; export type { LangChainMessage };",
      reactIndex: "export { convertExternalMessages as unstable_convertExternalMessages };",
      lockfileText,
    };

    await expect(checkAssistantUiLangGraphCompatibility(input)).resolves.toMatchObject({
      compatible: true,
      status: "PASS",
      packageVersion: "0.14.29",
      lockfileResolvedVersions: {
        "@assistant-ui/core": ["0.3.20"],
        "@assistant-ui/react-langchain": ["0.0.32"],
        "@assistant-ui/react-langgraph": ["0.14.29"],
        "@assistant-ui/store": ["0.3.14"],
        "assistant-stream": ["0.3.44"],
      },
    });

    const incompatible = await checkAssistantUiLangGraphCompatibility({
      ...input,
      target: { packages: { "@assistant-ui/react-langgraph": "0.14.30" } },
      langGraphIndex: "export type { LangChainMessage };",
    });
    expect(incompatible).toMatchObject({ compatible: false, status: "REVIEW REQUIRED" });
    expect(incompatible.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining("does not match pinned 0.14.30"),
      expect.stringContaining("does not export convertLangChainMessages"),
      expect.stringContaining("does not resolve @assistant-ui/react-langgraph@0.14.30"),
    ]));
  });

  it("requires re-audit when a compatible react-ag-ui dependency range changes", async () => {
    const root = await createGitFixture();
    const baseGitSha = await createReportFixture(root);
    await writeFixtureFile(root, ".assistant-ui-update-session.json", JSON.stringify({
      baseGitSha,
      fromRevision: "a".repeat(40),
      toRevision: "b".repeat(40),
      previousAgUi: { "@ag-ui/client": "0.0.59" },
      previousAgUiCompatibility: {
        reactAgUiVersion: "0.0.60",
        reactAgUiClientRange: "^0.0.59",
        pinnedClientVersion: "0.0.59",
        compatible: true,
      },
      nextAgUiCompatibility: {
        reactAgUiVersion: "0.0.61",
        reactAgUiClientRange: ">=0.0.59 <0.1.0",
        pinnedClientVersion: "0.0.59",
        compatible: true,
      },
      resolvedAgUiClientVersions: ["0.0.59"],
      upstreamChangedFiles: [],
    }, null, 2));

    await generateReport({ repoRoot: root });
    const report = JSON.parse(await readFile(path.join(root, "assistant-ui-upgrade-report.json"), "utf8"));
    const impact = await readFile(path.join(root, "assistant-ui-upgrade-impact.md"), "utf8");

    expect(report.cancellationCompatibility).toMatchObject({
      dependencyRangeChanged: true,
      duplicateClientVersions: false,
      reAuditRequired: true,
      status: "REVIEW REQUIRED",
      reasons: ["react-ag-ui AG-UI dependency range changed"],
    });
    expect(impact).toContain("Previous react-ag-ui range:\n^0.0.59");
    expect(impact).toContain("Target react-ag-ui range:\n>=0.0.59 <0.1.0");
    expect(impact).toContain("Resolved lockfile versions:\n0.0.59");
  });

  it("blocks an upgrade when the lockfile resolves multiple AG-UI client versions", async () => {
    const result = await checkAgUiLockfile({
      target: { agUi: { "@ag-ui/client": "0.0.59" } },
      lockfileText: [
        "packages:",
        "  '@ag-ui/client@0.0.59':",
        "    resolution: {}",
        "  '@ag-ui/client@0.0.63':",
        "    resolution: {}",
        "snapshots:",
        "  '@ag-ui/client@0.0.59': {}",
        "  '@ag-ui/client@0.0.63': {}",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      passed: false,
      duplicateClientVersions: true,
      resolvedAgUiClientVersions: ["0.0.59", "0.0.63"],
    });
    expect(result.message).toContain("Multiple @ag-ui/client versions are resolved:");
    expect(result.message).toContain("CancellationAwareHttpAgent targets 0.0.59.");
  });

  it("passes the lockfile guard when only the pinned AG-UI client is resolved", async () => {
    const result = await checkAgUiLockfile({
      target: { agUi: { "@ag-ui/client": "0.0.59" } },
      lockfileText: [
        "packages:",
        "  '@ag-ui/client@0.0.59':",
        "    resolution: {}",
        "snapshots:",
        "  '@ag-ui/client@0.0.59': {}",
      ].join("\n"),
    });

    expect(result).toMatchObject({
      passed: true,
      duplicateClientVersions: false,
      resolvedAgUiClientVersions: ["0.0.59"],
    });
  });

  it("resolves remote main B when a local source cache is still at A", async () => {
    const localA = "a".repeat(40);
    const remoteB = "b".repeat(40);
    let cacheRevision = localA;
    const calls = [];
    const gitRunner = async (_root, args) => {
      calls.push(args);
      if (args[0] === "ls-remote") return `${remoteB}\trefs/heads/main`;
      if (args[0] === "fetch" && args[2] === "main") {
        cacheRevision = remoteB;
        return "";
      }
      if (args[0] === "cat-file" && args[2] === `${remoteB}^{commit}` && cacheRevision === remoteB) {
        return "";
      }
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    };

    const resolved = await remoteMainRevision({ repoRoot: "/tmp/agent-ui-upgrade-test", gitRunner });
    await ensureSourceCache("/tmp/stale-assistant-ui", resolved, {
      repoRoot: "/tmp/agent-ui-upgrade-test",
      gitRunner,
    });

    expect(resolved).toBe(remoteB);
    expect(calls[0]).toEqual([
      "ls-remote",
      "https://github.com/assistant-ui/assistant-ui.git",
      "refs/heads/main",
    ]);
    expect(cacheRevision).toBe(remoteB);
  });

  it("passes the revision guard without a sibling assistant-ui checkout", async () => {
    const target = JSON.parse(await readFile(path.join(workspaceRoot, "assistant-ui-upgrade-target.json"), "utf8"));
    const fakeBin = await mkdtemp(path.join(os.tmpdir(), "assistant-ui-revision-guard-git-"));
    temporaryRoots.push(fakeBin);
    await writeFile(
      path.join(fakeBin, "git"),
      `#!/bin/sh
if [ "$1" = "ls-remote" ]; then
  printf '%s\\trefs/heads/main\\n' '${target.revision}'
  exit 0
fi
printf 'unexpected git invocation: %s\\n' "$*" >&2
exit 99
`,
      { encoding: "utf8", mode: 0o755 },
    );

    const environment = {
      ...process.env,
      PATH: `${fakeBin}${path.delimiter}${process.env.PATH ?? ""}`,
    };
    delete environment.ASSISTANT_UI_REPO;

    await expect(execFileAsync("node", [guardScript], {
      cwd: workspaceRoot,
      env: environment,
      encoding: "utf8",
    })).resolves.toMatchObject({
      stdout: expect.stringContaining("assistant-ui vendor revision guard: OK"),
    });
  });

  it("fails before touching package or vendor files on a dirty worktree", async () => {
    const root = await createGitFixture();
    const unrelatedPath = await writeFixtureFile(root, "packages/creator/example.ts", "export const example = 1;\n");
    const packagePath = await writeFixtureFile(root, "packages/react/package.json", "{\"sentinel\":true}\n");
    const vendorPath = await writeFixtureFile(root, "packages/react/src/internal/vendor/assistant-ui/UPSTREAM.json", "{\"sentinel\":true}\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "--quiet", "-m", "fixture"]);
    await writeFile(unrelatedPath, "export const example = 2;\n", "utf8");
    const packageBefore = await readFile(packagePath, "utf8");
    const vendorBefore = await readFile(vendorPath, "utf8");

    await expect(updateAssistantUi({ repoRoot: root, args: ["--skip-npm"] })).rejects.toThrow(
      "assistant-ui:update requires a clean worktree.\nCommit or stash unrelated changes before updating assistant-ui.",
    );
    expect(await readFile(packagePath, "utf8")).toBe(packageBefore);
    expect(await readFile(vendorPath, "utf8")).toBe(vendorBefore);
  });

  it("fails before changing package or vendor files when the next AG-UI range is incompatible", async () => {
    const root = await createGitFixture();
    await writeFixtureFile(root, "assistant-ui-upgrade-target.json", JSON.stringify({
      packages: {
        "@assistant-ui/react": "0.15.21",
        "@assistant-ui/react-ag-ui": "0.0.60",
        "@assistant-ui/react-langgraph": "0.14.29",
        "@assistant-ui/react-markdown": "0.14.16",
      },
      agUi: { "@ag-ui/client": "0.0.59" },
    }, null, 2));
    await writeFixtureFile(root, "packages/react/src/internal/vendor/assistant-ui/UPSTREAM.json", JSON.stringify({ revision: "a".repeat(40) }, null, 2));
    const packagePath = await writeFixtureFile(root, "packages/react/package.json", JSON.stringify({
      dependencies: {
        "@assistant-ui/react": "0.15.21",
        "@assistant-ui/react-ag-ui": "0.0.60",
        "@assistant-ui/react-markdown": "0.14.16",
      },
    }, null, 2));
    const vendorPath = await writeFixtureFile(root, "packages/react/src/internal/vendor/assistant-ui/elements.ts", "export const sentinel = true;\n");
    const targetPath = path.join(root, "assistant-ui-upgrade-target.json");
    await git(root, ["add", "."]);
    await git(root, ["commit", "--quiet", "-m", "fixture"]);

    const packageBefore = await readFile(packagePath, "utf8");
    const vendorBefore = await readFile(vendorPath, "utf8");
    const targetBefore = await readFile(targetPath, "utf8");

    await expect(updateAssistantUi({
      repoRoot: root,
      remoteRevisionResolver: async () => "b".repeat(40),
      sourceCacheEnsurer: async () => {},
      latestVersionResolver: async () => "0.0.61",
      compatibilityChecker: async ({ target }) => {
        const compatible = target.packages["@assistant-ui/react-ag-ui"] !== "0.0.61";
        return {
          compatible,
          message: compatible
            ? "assistant-ui AG-UI compatibility: PASS"
            : "REVIEW REQUIRED: incompatible AG-UI dependency",
        };
      },
      langGraphCompatibilityChecker: async () => ({
        compatible: true,
        status: "PASS",
        message: "LangGraph history compatibility: PASS",
      }),
    })).rejects.toThrow("incompatible AG-UI dependency");

    expect(await readFile(packagePath, "utf8")).toBe(packageBefore);
    expect(await readFile(vendorPath, "utf8")).toBe(vendorBefore);
    expect(await readFile(targetPath, "utf8")).toBe(targetBefore);
  });

  it("continues through vendor sync with the default lockfile checker", async () => {
    const root = await createGitFixture();
    const revision = "b".repeat(40);
    await writeFixtureFile(root, "assistant-ui-upgrade-target.json", JSON.stringify({
      packages: {
        "@assistant-ui/react": "0.15.21",
        "@assistant-ui/react-ag-ui": "0.0.60",
        "@assistant-ui/react-langgraph": "0.14.29",
        "@assistant-ui/react-markdown": "0.14.16",
      },
      agUi: { "@ag-ui/client": "0.0.59" },
    }, null, 2));
    await writeFixtureFile(root, "packages/react/src/internal/vendor/assistant-ui/UPSTREAM.json", JSON.stringify({ revision }, null, 2));
    await writeFixtureFile(root, "packages/react/package.json", JSON.stringify({
      dependencies: {
        "@assistant-ui/react": "0.15.21",
        "@assistant-ui/react-ag-ui": "0.0.60",
        "@assistant-ui/react-langgraph": "0.14.29",
        "@assistant-ui/react-markdown": "0.14.16",
      },
    }, null, 2));
    await writeFixtureFile(root, "packages/runtime-conversation/package.json", JSON.stringify({
      dependencies: {
        "@assistant-ui/react": "0.15.21",
        "@assistant-ui/react-ag-ui": "0.0.60",
        "@assistant-ui/react-langgraph": "0.14.29",
      },
    }, null, 2));
    await writeFixtureFile(root, "pnpm-workspace.yaml", [
      "minimumReleaseAgeExclude:",
      "  - '@assistant-ui/react@0.15.21'",
      "  - '@assistant-ui/react-langgraph@0.14.29'",
      "",
    ].join("\n"));
    await writeFixtureFile(root, "pnpm-lock.yaml", [
      "lockfileVersion: '9.0'",
      "",
      "packages:",
      "  '@ag-ui/client@0.0.59':",
      "    resolution: {}",
      "",
      "snapshots:",
      "  '@ag-ui/client@0.0.59': {}",
      "",
    ].join("\n"));
    await git(root, ["add", "."]);
    await git(root, ["commit", "--quiet", "-m", "fixture"]);

    const commandCalls = [];
    const requestedPackages = [];
    await updateAssistantUi({
      repoRoot: root,
      remoteRevisionResolver: async () => revision,
      sourceCacheEnsurer: async () => {},
      langGraphSourceResolver: async () => ({ packageManifest: {}, langGraphIndex: "", reactIndex: "" }),
      latestVersionResolver: async (_repoRoot, name) => {
        requestedPackages.push(name);
        return name === "@assistant-ui/react-langgraph"
          ? "0.14.30"
          : {
              "@assistant-ui/react": "0.15.21",
              "@assistant-ui/react-ag-ui": "0.0.60",
              "@assistant-ui/react-markdown": "0.14.16",
            }[name];
      },
      compatibilityChecker: async () => ({
        compatible: true,
        status: "PASS",
        reactAgUiClientRange: "^0.0.59",
        pinnedClientVersion: "0.0.59",
        message: "assistant-ui AG-UI compatibility: PASS",
      }),
      langGraphCompatibilityChecker: async () => ({
        compatible: true,
        status: "PASS",
        message: "LangGraph history compatibility: PASS",
      }),
      commandRunner: async (file, args) => {
        commandCalls.push({ file, args });
        return { stdout: "", stderr: "" };
      },
    });

    const installIndex = commandCalls.findIndex(({ file, args }) =>
      file === "pnpm" && args.join(" ") === "install --lockfile-only",
    );
    const syncIndex = commandCalls.findIndex(({ file, args }) =>
      file === "pnpm" && args.includes("sync:assistant-ui-upstream"),
    );
    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(syncIndex).toBeGreaterThan(installIndex);
    expect(requestedPackages).toEqual(expect.arrayContaining([
      "@assistant-ui/react",
      "@assistant-ui/react-ag-ui",
      "@assistant-ui/react-langgraph",
      "@assistant-ui/react-markdown",
    ]));
    await expect(readFile(path.join(root, "packages/runtime-conversation/package.json"), "utf8"))
      .resolves.toContain('"@assistant-ui/react-langgraph": "0.14.30"');
    await expect(readFile(path.join(root, "assistant-ui-upgrade-target.json"), "utf8"))
      .resolves.toContain('"@assistant-ui/react-langgraph": "0.14.30"');
    await expect(readFile(path.join(root, "pnpm-workspace.yaml"), "utf8"))
      .resolves.toContain("'@assistant-ui/react-langgraph@0.14.30'");
  });

  it("builds a clean report from the base SHA plus explicit generated artifacts", async () => {
    const root = await createGitFixture();
    await writeFixtureFile(root, "assistant-ui-upgrade-target.json", JSON.stringify({
      packages: {
        "@assistant-ui/react": "0.15.21",
        "@assistant-ui/react-ag-ui": "0.0.60",
        "@assistant-ui/react-langgraph": "0.14.29",
        "@assistant-ui/react-markdown": "0.14.16",
      },
      agUi: {
        "@ag-ui/client": "0.0.59",
      },
    }, null, 2));
    await writeFixtureFile(root, "packages/react/src/internal/vendor/assistant-ui/UPSTREAM.json", JSON.stringify({ revision: "b".repeat(40) }, null, 2));
    await writeFixtureFile(root, "examples/agent-frontend/plugins/example.ts", "export const plugin = 'before';\n");
    await writeFixtureFile(root, "packages/creator/example.ts", "export const creator = 'unchanged';\n");
    await writeFixtureFile(root, "assistant-ui-upgrade-report.json", JSON.stringify({
      schemaVersion: 1,
      fromRevision: "a".repeat(40),
      toRevision: "a".repeat(40),
      packagesChanged: [],
      vendorFilesChanged: [],
      vendorFilesAdded: [],
      vendorFilesRemoved: [],
      vendorFilesRenamed: [],
      newTransitiveDependencies: [],
      newAvailableElements: [],
      newlyAdoptedElements: [],
      removedUpstreamElements: [],
      changedUpstreamElements: [],
      ignoredUpstreamElements: [],
      localFacadeFilesChanged: [],
      runtimeAdapterFilesChanged: [],
      pluginFilesChanged: [],
      appUIModelFilesChanged: [],
      creatorFilesChanged: [],
      testsChanged: [],
    }, null, 2));
    await writeFixtureFile(root, "assistant-ui-upgrade-impact.md", "before\n");
    await git(root, ["add", "."]);
    await git(root, ["commit", "--quiet", "-m", "fixture"]);
    const baseGitSha = await git(root, ["rev-parse", "HEAD"]);
    await writeFixtureFile(root, "examples/agent-frontend/plugins/example.ts", "export const plugin = 'after';\n");
    await writeFixtureFile(root, "examples/agent-frontend/plugins/generated.ts", "export const generated = true;\n");
    await writeFixtureFile(root, ".assistant-ui-update-session.json", JSON.stringify({
      baseGitSha,
      fromRevision: "a".repeat(40),
      toRevision: "b".repeat(40),
      previousAssistantUiPackages: { "@assistant-ui/react-langgraph": "0.14.29" },
      nextLangGraphCompatibility: {
        packageName: "@assistant-ui/react-langgraph",
        packageVersion: "0.14.29",
        expectedVersion: "0.14.29",
        compatible: true,
        status: "PASS",
        lockfileResolvedVersions: {
          "@assistant-ui/core": ["0.3.20"],
          "@assistant-ui/react-langchain": ["0.0.32"],
          "@assistant-ui/react-langgraph": ["0.14.29"],
          "@assistant-ui/store": ["0.3.14"],
          "assistant-stream": ["0.3.44"],
        },
      },
      generatedUntrackedArtifacts: ["examples/agent-frontend/plugins/generated.ts"],
    }, null, 2));

    await generateReport({ repoRoot: root });
    const report = JSON.parse(await readFile(path.join(root, "assistant-ui-upgrade-report.json"), "utf8"));

    expect(report.fromRevision).toBe("a".repeat(40));
    expect(report.toRevision).toBe("b".repeat(40));
    expect(report.creatorFilesChanged).toEqual([]);
    expect(report.pluginFilesChanged).toEqual([
      "examples/agent-frontend/plugins/example.ts",
      "examples/agent-frontend/plugins/generated.ts",
    ]);
    expect(report.pluginFilesChanged).not.toContain("packages/creator/example.ts");
    expect(report.historyCompatibility).toMatchObject({
      packageName: "@assistant-ui/react-langgraph",
      converterSeam: "@assistant-ui/react-langgraph.convertLangChainMessages",
      externalMessageSeam: "@assistant-ui/react.unstable_convertExternalMessages",
      status: "UNCHANGED",
      reAuditRequired: false,
    });
    const impact = await readFile(path.join(root, "assistant-ui-upgrade-impact.md"), "utf8");
    expect(impact).toContain("@assistant-ui/react-langgraph 0.14.29");
    expect(impact).toContain("@assistant-ui/react-langgraph.convertLangChainMessages");
    expect(impact).toContain("LangChain / LangGraph persisted message conversion | UNCHANGED");

    const targetPath = path.join(root, "assistant-ui-upgrade-target.json");
    const changedTarget = JSON.parse(await readFile(targetPath, "utf8"));
    changedTarget.packages["@assistant-ui/react-langgraph"] = "0.14.30";
    await writeFile(targetPath, `${JSON.stringify(changedTarget, null, 2)}\n`, "utf8");
    const sessionPath = path.join(root, ".assistant-ui-update-session.json");
    const changedSession = JSON.parse(await readFile(sessionPath, "utf8"));
    changedSession.nextLangGraphCompatibility.packageVersion = "0.14.30";
    changedSession.nextLangGraphCompatibility.expectedVersion = "0.14.30";
    changedSession.nextLangGraphCompatibility.lockfileResolvedVersions[
      "@assistant-ui/react-langgraph"
    ] = ["0.14.30"];
    await writeFile(sessionPath, `${JSON.stringify(changedSession, null, 2)}\n`, "utf8");

    await generateReport({ repoRoot: root });
    const changedReport = JSON.parse(await readFile(path.join(root, "assistant-ui-upgrade-report.json"), "utf8"));
    expect(changedReport.historyCompatibility).toMatchObject({
      previousVersion: "0.14.29",
      targetVersion: "0.14.30",
      versionChanged: true,
      reAuditRequired: true,
      status: "REVIEW REQUIRED",
    });
  });
});
