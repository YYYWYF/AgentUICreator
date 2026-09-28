import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { checkAssistantUiAgUiCompatibility } from "../../../scripts/check-assistant-ui-agui-compat.mjs";
import {
  checkAssistantUiLangGraphInstalledCompatibility,
  checkAssistantUiLangGraphPackageCompatibility,
  checkAssistantUiLangGraphSourceCompatibility,
} from "../../../scripts/check-assistant-ui-langgraph-compat.mjs";
import { checkAgUiLockfile } from "../../../scripts/check-ag-ui-lockfile.mjs";
import { main as generateReport } from "../../../scripts/generate-assistant-ui-upgrade-report.mjs";
import { checkGenerativeUiResource } from "../../../scripts/check-generative-ui-resource.mjs";
import { packageManifestMismatches, updatePackageManifests } from "../../../scripts/assistant-ui-workspace-packages.mjs";
import { main as syncGenerativeUi } from "../../source-registry/scripts/sync-generative-ui-upstream.mjs";
import {
  ensureSourceCache,
  main as updateAssistantUi,
  remoteMainRevision,
  generativeUiReleaseRevision,
} from "../../../scripts/update-assistant-ui.mjs";

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

function langGraphPackageManifestFixture(version = "0.14.30") {
  return {
    name: "@assistant-ui/react-langgraph",
    version,
    dependencies: {
      "@assistant-ui/core": "^0.3.20",
      "@assistant-ui/react-langchain": "^0.0.32",
      "@assistant-ui/store": "^0.3.14",
      "assistant-stream": "^0.3.44",
    },
  };
}

function packageArtifactFixture(name, version) {
  if (name === "@assistant-ui/react-langgraph") {
    return {
      manifest: langGraphPackageManifestFixture(version),
      types: "export { convertLangChainMessages }; export type { LangChainMessage };",
      source: `npm tarball ${name}@${version}`,
    };
  }
  return {
    manifest: { name, version },
    types: "export { convertExternalMessages as unstable_convertExternalMessages };",
    source: `npm tarball ${name}@${version}`,
  };
}

function langGraphSourceFixture(version = "0.15.0-canary.1") {
  return {
    packageManifest: {
      ...langGraphPackageManifestFixture(version),
    },
    langGraphIndex: "export { convertLangChainMessages }; export type { LangChainMessage };",
    reactIndex: "export { convertExternalMessages as unstable_convertExternalMessages };",
  };
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

  it("guards installed LangGraph exports, package version, and key lockfile dependencies", async () => {
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
      "  '@assistant-ui/react@0.15.21':",
      "  '@assistant-ui/react-langchain@0.0.32':",
      "  '@assistant-ui/react-langgraph@0.14.29':",
      "  '@assistant-ui/store@0.3.14':",
      "  assistant-stream@0.3.44:",
      "",
      "snapshots:",
      "  '@assistant-ui/react-langgraph@0.14.29':",
      "    dependencies:",
      "      '@assistant-ui/core': 0.3.20",
      "      '@assistant-ui/react-langchain': 0.0.32",
      "      '@assistant-ui/store': 0.3.14",
      "      assistant-stream: 0.3.44",
    ].join("\n");
    const input = {
      target: { packages: { "@assistant-ui/react": "0.15.21", "@assistant-ui/react-langgraph": "0.14.29" } },
      packageManifest,
      langGraphIndex: "export { convertLangChainMessages }; export type { LangChainMessage };",
      reactIndex: "export { convertExternalMessages as unstable_convertExternalMessages };",
      reactPackageManifest: { name: "@assistant-ui/react", version: "0.15.21" },
      lockfileText,
    };

    await expect(checkAssistantUiLangGraphInstalledCompatibility(input)).resolves.toMatchObject({
      compatible: true,
      status: "PASS",
      packageVersion: "0.14.29",
      lockfileResolvedVersions: {
        "@assistant-ui/core": ["0.3.20"],
        "@assistant-ui/react": ["0.15.21"],
        "@assistant-ui/react-langchain": ["0.0.32"],
        "@assistant-ui/react-langgraph": ["0.14.29"],
        "@assistant-ui/store": ["0.3.14"],
        "assistant-stream": ["0.3.44"],
      },
    });

    const missingSnapshot = await checkAssistantUiLangGraphInstalledCompatibility({
      ...input,
      lockfileText: [
        "packages:",
        "  '@assistant-ui/react-langgraph@0.14.29':",
        "",
        "snapshots:",
      ].join("\n"),
    });
    expect(missingSnapshot).toMatchObject({ compatible: false, status: "REVIEW REQUIRED" });
    expect(missingSnapshot.reasons).toContain(
      "pnpm-lock.yaml has no @assistant-ui/react-langgraph@0.14.29 dependency snapshot.",
    );

    const incompatibleDependency = await checkAssistantUiLangGraphInstalledCompatibility({
      ...input,
      lockfileText: lockfileText.replace(
        "      '@assistant-ui/react-langchain': 0.0.32",
        "      '@assistant-ui/react-langchain': 0.1.0",
      ),
    });
    expect(incompatibleDependency).toMatchObject({ compatible: false, status: "REVIEW REQUIRED" });
    expect(incompatibleDependency.reasons).toContain(
      "@assistant-ui/react-langgraph lockfile snapshot resolves @assistant-ui/react-langchain as 0.1.0, outside ^0.0.32.",
    );

    const missingCriticalDependency = await checkAssistantUiLangGraphInstalledCompatibility({
      ...input,
      packageManifest: {
        ...packageManifest,
        dependencies: Object.fromEntries(Object.entries(packageManifest.dependencies)
          .filter(([name]) => name !== "assistant-stream")),
      },
    });
    expect(missingCriticalDependency).toMatchObject({ compatible: false, status: "REVIEW REQUIRED" });
    expect(missingCriticalDependency.reasons).toContain(
      "@assistant-ui/react-langgraph is missing required dependency declarations: assistant-stream.",
    );

    const packageVersionMismatch = await checkAssistantUiLangGraphInstalledCompatibility({
      ...input,
      target: { packages: { ...input.target.packages, "@assistant-ui/react-langgraph": "0.14.30" } },
    });
    expect(packageVersionMismatch).toMatchObject({ compatible: false, status: "REVIEW REQUIRED" });
    expect(packageVersionMismatch.reasons).toContain(
      "Inspected package version 0.14.29 does not match pinned 0.14.30.",
    );
  });

  it("checks GitHub source API seams without comparing the source version to npm target", async () => {
    const result = await checkAssistantUiLangGraphSourceCompatibility({
      packageManifest: {
        name: "@assistant-ui/react-langgraph",
        version: "0.15.0-canary.1",
        dependencies: {
          "@assistant-ui/core": "^0.3.20",
          "@assistant-ui/react-langchain": "^0.0.32",
          "@assistant-ui/store": "^0.3.14",
          "assistant-stream": "^0.3.44",
        },
      },
      langGraphIndex: "export { convertLangChainMessages }; export type { LangChainMessage };",
      reactIndex: "export { convertExternalMessages as unstable_convertExternalMessages };",
    });

    expect(result).toMatchObject({
      compatible: true,
      status: "PASS",
      exports: {
        convertLangChainMessages: true,
        LangChainMessage: true,
        unstable_convertExternalMessages: true,
      },
    });
    expect(result).not.toHaveProperty("packageVersion");

    const publishedLockfileText = [
      "packages:",
      "  '@assistant-ui/core@0.3.20':",
      "  '@assistant-ui/react@0.15.22':",
      "  '@assistant-ui/react-langchain@0.0.32':",
      "  '@assistant-ui/react-langgraph@0.14.30':",
      "  '@assistant-ui/store@0.3.14':",
      "  assistant-stream@0.3.44:",
      "",
      "snapshots:",
      "  '@assistant-ui/react-langgraph@0.14.30':",
      "    dependencies:",
      "      '@assistant-ui/core': 0.3.20",
      "      '@assistant-ui/react-langchain': 0.0.32",
      "      '@assistant-ui/store': 0.3.14",
      "      assistant-stream: 0.3.44",
    ].join("\n");
    const publishedPackageInput = {
      target: { packages: { "@assistant-ui/react": "0.15.22", "@assistant-ui/react-langgraph": "0.14.30" } },
      packageManifest: { ...langGraphPackageManifestFixture("0.14.30") },
      langGraphTypes: "export { convertLangChainMessages }; export type { LangChainMessage };",
      reactPackageManifest: { name: "@assistant-ui/react", version: "0.15.22" },
      reactTypes: "export { convertExternalMessages as unstable_convertExternalMessages };",
      lockfileText: publishedLockfileText,
    };
    const publishedPackage = await checkAssistantUiLangGraphPackageCompatibility(publishedPackageInput);
    expect(publishedPackage).toMatchObject({
      compatible: true,
      status: "PASS",
      packageVersion: "0.14.30",
      expectedVersion: "0.14.30",
    });

    const sourcePasses = await checkAssistantUiLangGraphSourceCompatibility(langGraphSourceFixture());
    const npmTargetMissingConverter = await checkAssistantUiLangGraphPackageCompatibility({
      ...publishedPackageInput,
      langGraphTypes: "export type { LangChainMessage };",
    });
    expect(sourcePasses).toMatchObject({ compatible: true, status: "PASS" });
    expect(npmTargetMissingConverter).toMatchObject({ compatible: false, status: "REVIEW REQUIRED" });
    expect(npmTargetMissingConverter.reasons).toContain(
      "Published @assistant-ui/react-langgraph@0.14.30 does not export convertLangChainMessages.",
    );

    const npmReactTargetMissingExternalConverter = await checkAssistantUiLangGraphPackageCompatibility({
      ...publishedPackageInput,
      reactTypes: "export {}",
    });
    expect(npmReactTargetMissingExternalConverter).toMatchObject({ compatible: false, status: "REVIEW REQUIRED" });
    expect(npmReactTargetMissingExternalConverter.reasons).toContain(
      "Published @assistant-ui/react@0.15.22 does not export unstable_convertExternalMessages.",
    );

    for (const [langGraphIndex, reactIndex, expectedReason] of [
      ["export type { LangChainMessage };", "export { unstable_convertExternalMessages };", "does not export convertLangChainMessages"],
      ["export { convertLangChainMessages }; export type { LangChainMessageChunk };", "export { unstable_convertExternalMessages };", "does not export LangChainMessage"],
      ["export { convertLangChainMessages }; export type { LangChainMessage };", "export {}", "does not export unstable_convertExternalMessages"],
    ]) {
      const incompatible = await checkAssistantUiLangGraphSourceCompatibility({
        packageManifest: {
          name: "@assistant-ui/react-langgraph",
          version: "0.15.0-canary.1",
          dependencies: {
            "@assistant-ui/core": "^0.3.20",
            "@assistant-ui/react-langchain": "^0.0.32",
            "@assistant-ui/store": "^0.3.14",
            "assistant-stream": "^0.3.44",
          },
        },
        langGraphIndex,
        reactIndex,
      });
      expect(incompatible).toMatchObject({ compatible: false, status: "REVIEW REQUIRED" });
      expect(incompatible.reasons.join("\n")).toContain(expectedReason);
    }
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

  it("resolves the exact Generative UI release tag, including annotated tags", async () => {
    const release = "b".repeat(40);
    const tagObject = "a".repeat(40);
    const revision = await generativeUiReleaseRevision({
      version: "0.0.22",
      gitRunner: async (_root, args) => {
        expect(args).toContain("refs/tags/@assistant-ui/react-generative-ui@0.0.22^{}");
        return `${tagObject}\trefs/tags/@assistant-ui/react-generative-ui@0.0.22\n${release}\trefs/tags/@assistant-ui/react-generative-ui@0.0.22^{}`;
      },
    });
    expect(revision).toBe(release);
  });

  it("requires review for an unsupported peer range before changing any manifest", async () => {
    const root = await createGitFixture();
    const exactPath = await writeFixtureFile(root, "packages/alpha/package.json", JSON.stringify({
      dependencies: { "@assistant-ui/react-generative-ui": "0.0.21" },
    }));
    await writeFixtureFile(root, "packages/zeta/package.json", JSON.stringify({
      peerDependencies: { "@assistant-ui/react-generative-ui": ">=0.0.21 <0.1" },
    }));
    const before = await readFile(exactPath, "utf8");
    await expect(updatePackageManifests(root, { "@assistant-ui/react-generative-ui": "0.0.22" }))
      .rejects.toThrow("Unsupported peer policy");
    expect(await readFile(exactPath, "utf8")).toBe(before);
  });

  it("passes the revision guard without a sibling assistant-ui checkout", async () => {
    const target = JSON.parse(await readFile(path.join(workspaceRoot, "assistant-ui-upgrade-target.json"), "utf8"));
    const fakeBin = await mkdtemp(path.join(os.tmpdir(), "assistant-ui-revision-guard-git-"));
    temporaryRoots.push(fakeBin);
    await writeFile(
      path.join(fakeBin, "git"),
      `#!/bin/sh
if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ]; then
  case "$4" in
    @assistant-ui/react@0.15.22*) printf '%s\\n' 'f008537f39f0936992b0f6d2433c092935df5faf'; exit 0 ;;
    @assistant-ui/react-ag-ui@0.0.62*) printf '%s\\n' 'da9a624496ae97864ae30e90f85c7533092a228d'; exit 0 ;;
    @assistant-ui/react-generative-ui@0.0.21*) printf '%s\\n' 'da9a624496ae97864ae30e90f85c7533092a228d'; exit 0 ;;
  esac
fi
if [ "$1" = "-C" ] && [ "$3" = "cat-file" ]; then exit 0; fi
if [ "$1" = "-C" ] && [ "$3" = "ls-remote" ] && [ "$4" = "--tags" ]; then
  printf '%s\trefs/tags/@assistant-ui/react-generative-ui@0.0.21\n' 'da9a624496ae97864ae30e90f85c7533092a228d'
  exit 0
fi
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
      packageArtifactResolver: async (_repoRoot, name, version) => packageArtifactFixture(name, version),
      langGraphSourceResolver: async () => langGraphSourceFixture(),
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
      langGraphInstalledCompatibilityChecker: async () => ({
        compatible: true,
        status: "PASS",
        message: "LangGraph installed compatibility: PASS",
      }),
      langGraphSourceCompatibilityChecker: async () => ({
        compatible: true,
        status: "PASS",
        message: "LangGraph source API compatibility: PASS",
      }),
      langGraphPackageCompatibilityChecker: async () => ({
        compatible: true,
        status: "PASS",
        message: "LangGraph package compatibility: PASS",
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
    const guardOrder = [];
    const requestedPackages = [];
    await updateAssistantUi({
      repoRoot: root,
      remoteRevisionResolver: async () => revision,
      sourceCacheEnsurer: async () => {},
      packageArtifactResolver: async (_repoRoot, name, version) => packageArtifactFixture(name, version),
      langGraphSourceResolver: async () => langGraphSourceFixture(),
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
      langGraphInstalledCompatibilityChecker: async ({ target }) => {
        guardOrder.push(`installed:${target.packages["@assistant-ui/react-langgraph"]}`);
        return {
          compatible: true,
          status: "PASS",
          message: "LangGraph installed compatibility: PASS",
        };
      },
      langGraphSourceCompatibilityChecker: async (source) => {
        guardOrder.push(`source:${source.packageManifest.version}`);
        expect(source.packageManifest.version).not.toBe("0.14.30");
        expect(source).not.toHaveProperty("target");
        return checkAssistantUiLangGraphSourceCompatibility(source);
      },
      langGraphPackageCompatibilityChecker: async ({ target, packageManifest }) => {
        guardOrder.push(`package:${packageManifest.version}`);
        expect(packageManifest.version).toBe(target.packages["@assistant-ui/react-langgraph"]);
        return {
          compatible: true,
          status: "PASS",
          message: "LangGraph package compatibility: PASS",
        };
      },
      commandRunner: async (file, args) => {
        commandCalls.push({ file, args });
        if (file === "pnpm" && args.join(" ") === "install --lockfile-only") {
          guardOrder.push("lockfile-install");
        }
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
    expect(guardOrder).toEqual([
      "installed:0.14.29",
      "source:0.15.0-canary.1",
      "lockfile-install",
      "package:0.14.30",
    ]);
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
    await writeFixtureFile(root, "examples/creator-host-sandbox/plugins/example.ts", "export const plugin = 'before';\n");
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
    await writeFixtureFile(root, "examples/creator-host-sandbox/plugins/example.ts", "export const plugin = 'after';\n");
    await writeFixtureFile(root, "examples/creator-host-sandbox/plugins/generated.ts", "export const generated = true;\n");
    await writeFixtureFile(root, ".assistant-ui-update-session.json", JSON.stringify({
      baseGitSha,
      fromRevision: "a".repeat(40),
      toRevision: "b".repeat(40),
      previousAssistantUiPackages: { "@assistant-ui/react-langgraph": "0.14.29" },
      nextLangGraphSourceCompatibility: {
        packageName: "@assistant-ui/react-langgraph",
        compatible: true,
        status: "PASS",
        exports: {
          convertLangChainMessages: true,
          LangChainMessage: true,
          unstable_convertExternalMessages: true,
        },
      },
      nextLangGraphPackageCompatibility: {
        packageName: "@assistant-ui/react-langgraph",
        packageVersion: "0.14.29",
        reactPackageVersion: "0.15.21",
        expectedVersion: "0.14.29",
        compatible: true,
        status: "PASS",
        exports: {
          convertLangChainMessages: true,
          LangChainMessage: true,
          unstable_convertExternalMessages: true,
        },
        lockfileResolvedVersions: {
          "@assistant-ui/core": ["0.3.20"],
          "@assistant-ui/react": ["0.15.21"],
          "@assistant-ui/react-langchain": ["0.0.32"],
          "@assistant-ui/react-langgraph": ["0.14.29"],
          "@assistant-ui/store": ["0.3.14"],
          "assistant-stream": ["0.3.44"],
        },
      },
      generatedUntrackedArtifacts: ["examples/creator-host-sandbox/plugins/generated.ts"],
    }, null, 2));

    await generateReport({ repoRoot: root });
    const report = JSON.parse(await readFile(path.join(root, "assistant-ui-upgrade-report.json"), "utf8"));

    expect(report.fromRevision).toBe("a".repeat(40));
    expect(report.toRevision).toBe("b".repeat(40));
    expect(report.creatorFilesChanged).toEqual([]);
    expect(report.pluginFilesChanged).toEqual([
      "examples/creator-host-sandbox/plugins/example.ts",
      "examples/creator-host-sandbox/plugins/generated.ts",
    ]);
    expect(report.pluginFilesChanged).not.toContain("packages/creator/example.ts");
    expect(report.historyCompatibility).toMatchObject({
      packageName: "@assistant-ui/react-langgraph",
      converterSeam: "@assistant-ui/react-langgraph.convertLangChainMessages",
      externalMessageSeam: "@assistant-ui/react.unstable_convertExternalMessages",
      sourceCompatibility: { compatible: true, status: "PASS" },
      packageCompatibility: { compatible: true, status: "PASS" },
      publishedPackageExports: {
        convertLangChainMessages: true,
        LangChainMessage: true,
        unstable_convertExternalMessages: true,
      },
      status: "UNCHANGED",
      reAuditRequired: false,
    });
    const impact = await readFile(path.join(root, "assistant-ui-upgrade-impact.md"), "utf8");
    expect(impact).toContain("@assistant-ui/react-langgraph 0.14.29");
    expect(impact).toContain("@assistant-ui/react-langgraph.convertLangChainMessages");
    expect(impact).toContain("Source status:\nPASS");
    expect(impact).toContain("Published package / lockfile compatibility:\nPASS");
    expect(impact).toContain("Published package API exports:");
    expect(impact).toContain("@assistant-ui/react-langgraph.convertLangChainMessages: PASS");
    expect(impact).toContain("@assistant-ui/react.unstable_convertExternalMessages: PASS");
    expect(impact).toContain("LangChain / LangGraph persisted message conversion | UNCHANGED");

    const targetPath = path.join(root, "assistant-ui-upgrade-target.json");
    const changedTarget = JSON.parse(await readFile(targetPath, "utf8"));
    changedTarget.packages["@assistant-ui/react-langgraph"] = "0.14.30";
    await writeFile(targetPath, `${JSON.stringify(changedTarget, null, 2)}\n`, "utf8");
    const sessionPath = path.join(root, ".assistant-ui-update-session.json");
    const changedSession = JSON.parse(await readFile(sessionPath, "utf8"));
    changedSession.nextLangGraphPackageCompatibility.packageVersion = "0.14.30";
    changedSession.nextLangGraphPackageCompatibility.expectedVersion = "0.14.30";
    changedSession.nextLangGraphPackageCompatibility.lockfileResolvedVersions[
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

  it("upgrades Generative UI 0.0.21 to 0.0.22 through one update and rejects a stale Resource pin", async () => {
    const upstream = await createGitFixture();
    const root = await createGitFixture();
    const writeRelease = async (version, color) => {
      await writeFixtureFile(upstream, "packages/react-generative-ui/package.json", JSON.stringify({
        name: "@assistant-ui/react-generative-ui", version,
      }));
      await writeFixtureFile(upstream, "packages/ui/src/components/react/assistant-ui/elements/generative-ui.tsx", `export const release = "${version}";\n`);
      await writeFixtureFile(upstream, "packages/ui/src/lib/generative-ui-vocabulary-css.ts", `export const generativeUiVocabularyCss = { '[data-aui="button"]': { color: "${color}" } };\nexport const isDeclarationBlock = (value: Record<string, unknown>) => Object.values(value).every(entry => typeof entry === "string");\n`);
      await git(upstream, ["add", "."]);
      await git(upstream, ["commit", "--quiet", "-m", version]);
      const sha = await git(upstream, ["rev-parse", "HEAD"]);
      await git(upstream, ["tag", `@assistant-ui/react-generative-ui@${version}`]);
      return sha;
    };
    const oldRevision = await writeRelease("0.0.21", "red");
    const nextRevision = await writeRelease("0.0.22", "blue");
    await createReportFixture(root);
    const targetPath = path.join(root, "assistant-ui-upgrade-target.json");
    const target = JSON.parse(await readFile(targetPath, "utf8"));
    target.packages["@assistant-ui/react-generative-ui"] = "0.0.21";
    target.generativeUiReleaseRevision = oldRevision;
    await writeFile(targetPath, `${JSON.stringify(target, null, 2)}\n`);
    await writeFixtureFile(root, "packages/runtime-react/package.json", JSON.stringify({
      dependencies: { "@assistant-ui/react-generative-ui": "0.0.21" },
    }, null, 2));
    await writeFixtureFile(root, "packages/project-control/package.json", JSON.stringify({
      optionalDependencies: { "@assistant-ui/react-generative-ui": "0.0.21" },
    }, null, 2));
    await writeFixtureFile(root, "packages/mock-agent/package.json", JSON.stringify({
      peerDependencies: { "@assistant-ui/react-generative-ui": "^0.0.21" },
      devDependencies: { "@assistant-ui/react-generative-ui": "0.0.21" },
    }, null, 2));
    await writeFixtureFile(root, "packages/source-registry/registry/items/agent-component-assistant-ui-generative-ui/item.json", JSON.stringify({
      packages: { "@assistant-ui/react-generative-ui": "0.0.21" }, upstream: { revision: oldRevision },
    }, null, 2));
    await writeFixtureFile(root, "packages/source-registry/registry/items/integration-generative-ui/item.json", JSON.stringify({
      packages: { "@assistant-ui/react-generative-ui": "0.0.21" }, upstream: { revision: oldRevision },
    }, null, 2));
    await writeFixtureFile(root, "packages/source-registry/registry/items/integration-a2ui/item.json", JSON.stringify({
      upstream: { revision: oldRevision },
    }, null, 2));
    await writeFixtureFile(root, "pnpm-workspace.yaml", "minimumReleaseAgeExclude:\n  - '@assistant-ui/react-generative-ui@0.0.21'\n");
    await syncGenerativeUi({ root, repo: upstream, revision: oldRevision });
    const provenancePath = path.join(root, "packages/source-registry/registry/items/agent-component-assistant-ui-generative-ui/files/agent-ui/vendor/assistant-ui/generative-ui/UPSTREAM.json");
    const before = JSON.parse(await readFile(provenancePath, "utf8"));
    await git(root, ["add", "."]);
    await git(root, ["commit", "--quiet", "-m", "Generative UI 0.0.21 baseline"]);

    const commands = [];
    await updateAssistantUi({
      repoRoot: root,
      args: ["--repo", upstream],
      remoteRevisionResolver: async () => "b".repeat(40),
      generativeUiRevisionResolver: async ({ version }) => {
        expect(version).toBe("0.0.22");
        return nextRevision;
      },
      sourceCacheEnsurer: async () => {},
      latestVersionResolver: async (_root, name) => name === "@assistant-ui/react-generative-ui" ? "0.0.22" : target.packages[name],
      packageArtifactResolver: async (_root, name, version) => packageArtifactFixture(name, version),
      langGraphSourceResolver: async () => langGraphSourceFixture(),
      compatibilityChecker: async () => ({ compatible: true, status: "PASS", pinnedClientVersion: "0.0.59" }),
      langGraphInstalledCompatibilityChecker: async () => ({ compatible: true, status: "PASS" }),
      langGraphSourceCompatibilityChecker: async () => ({ compatible: true, status: "PASS" }),
      langGraphPackageCompatibilityChecker: async () => ({ compatible: true, status: "PASS" }),
      lockfileChecker: async () => ({ passed: true, resolvedAgUiClientVersions: ["0.0.59"] }),
      commandRunner: async (file, args) => {
        commands.push({ file, args });
        if (args.includes("sync:generative-ui-upstream")) {
          expect(args).toContain(nextRevision);
          await syncGenerativeUi({ root, repo: upstream, revision: nextRevision });
        }
        if (file === process.execPath) await generateReport({ repoRoot: root, args: ["--base-git-sha", args.at(-1)] });
        return { stdout: "", stderr: "" };
      },
    });

    const upgradedTarget = JSON.parse(await readFile(targetPath, "utf8"));
    const after = JSON.parse(await readFile(provenancePath, "utf8"));
    const report = JSON.parse(await readFile(path.join(root, "assistant-ui-upgrade-report.json"), "utf8"));
    expect(upgradedTarget.packages["@assistant-ui/react-generative-ui"]).toBe("0.0.22");
    expect(upgradedTarget.generativeUiReleaseRevision).toBe(nextRevision);
    expect(upgradedTarget).not.toHaveProperty("packageRevisions");
    expect(await packageManifestMismatches(root, upgradedTarget.packages)).toEqual([]);
    expect(await readFile(path.join(root, "packages/mock-agent/package.json"), "utf8")).toContain('"@assistant-ui/react-generative-ui": "^0.0.22"');
    expect(await checkGenerativeUiResource({ repoRoot: root, target: upgradedTarget })).toEqual([]);
    expect(after.revision).toBe(nextRevision);
    expect(after.packages["@assistant-ui/react-generative-ui"]).toBe("0.0.22");
    expect(after.files[0].installedSha256).not.toBe(before.files[0].installedSha256);
    expect(report.sourceRegistryAssistantUiFilesChanged).toEqual(expect.arrayContaining([
      "packages/source-registry/registry/items/agent-component-assistant-ui-generative-ui/item.json",
      "packages/source-registry/registry/items/integration-generative-ui/item.json",
    ]));
    expect(commands.some(({ args }) => args.includes("sync:generative-ui-upstream"))).toBe(true);
    expect(await readFile(path.join(root, "assistant-ui-upgrade-impact.md"), "utf8")).toContain("## Source Registry assistant-ui Resources");
    expect(await readFile(path.join(root, "assistant-ui-upgrade-impact.md"), "utf8")).toContain("Medium");
    const a2ui = JSON.parse(await readFile(path.join(root, "packages/source-registry/registry/items/integration-a2ui/item.json"), "utf8"));
    expect(a2ui.upstream.revision).toBe(oldRevision);

    const staleItemPath = path.join(root, "packages/source-registry/registry/items/integration-generative-ui/item.json");
    const staleItem = JSON.parse(await readFile(staleItemPath, "utf8"));
    staleItem.packages["@assistant-ui/react-generative-ui"] = "0.0.21";
    await writeFile(staleItemPath, `${JSON.stringify(staleItem, null, 2)}\n`);
    expect(await checkGenerativeUiResource({ repoRoot: root, target: upgradedTarget }))
      .toContain("integration-generative-ui/item.json @assistant-ui/react-generative-ui is 0.0.21; expected 0.0.22");
  });
});
