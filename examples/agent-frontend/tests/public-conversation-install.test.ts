import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyAgentUISourceItem,
  inspectAgentUISources,
} from "../scripts/ui-project/source-registry";

const forbiddenTokens = [
  "assistant-ui",
  "AssistantUi",
  "ASSISTANT_UI",
  "@assistant-ui/",
  "runtime-assistant-ui",
] as const;
const temporaryProjects: string[] = [];

async function collectFiles(current: string): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(current, entry.name);
    return entry.isDirectory() ? collectFiles(absolutePath) : [absolutePath];
  }));
  return files.flat().sort();
}

async function writeInstalledPackage(
  projectRoot: string,
  packageName: string,
  version: string,
): Promise<void> {
  const packageRoot = path.join(projectRoot, "node_modules", ...packageName.split("/"));
  await mkdir(packageRoot, { recursive: true });
  await writeFile(path.join(packageRoot, "package.json"), `${JSON.stringify({
    name: packageName,
    version,
  }, null, 2)}\n`);
}

afterEach(async () => {
  await Promise.all(temporaryProjects.splice(0).map((projectRoot) => rm(projectRoot, {
    recursive: true,
    force: true,
  })));
});

describe("public Conversation Source Registry install", () => {
  it("installs a generic bridge and generic direct dependencies", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "agent-ui-public-conversation-"));
    temporaryProjects.push(projectRoot);
    const packageJson = {
      name: "tmp-user-project",
      private: true,
      type: "module",
      dependencies: {
        "@agent-ui/react": "^0.1.0",
        "@agent-ui/runtime-conversation": "^0.1.0",
      },
    };
    await writeFile(
      path.join(projectRoot, "package.json"),
      `${JSON.stringify(packageJson, null, 2)}\n`,
    );
    await writeInstalledPackage(projectRoot, "@agent-ui/react", "0.1.0");
    await writeInstalledPackage(projectRoot, "@agent-ui/runtime-conversation", "0.1.0");

    const inspection = await inspectAgentUISources(projectRoot);
    const result = await applyAgentUISourceItem(projectRoot, {
      itemId: "foundation/conversation",
      expectedStateHash: inspection.stateHash,
    });

    expect(result.changedItems).toEqual(["foundation/conversation"]);
    expect(result.changedPaths).toContain(
      "agent-ui/conversation/conversation-bridge.ts",
    );
    const installedRoot = path.join(projectRoot, "agent-ui/conversation");
    const installedFiles = await collectFiles(installedRoot);
    expect(installedFiles.map((filePath) => path.relative(projectRoot, filePath).split(path.sep).join("/"))).toEqual([
      "agent-ui/conversation/conversation-bridge.ts",
    ]);
    for (const filePath of installedFiles) {
      const relativePath = path.relative(projectRoot, filePath).split(path.sep).join("/");
      const source = await readFile(filePath, "utf8");
      for (const token of forbiddenTokens) {
        expect(relativePath, token).not.toContain(token);
        expect(source, `${relativePath}: ${token}`).not.toContain(token);
      }
    }

    const installedPackageJson = JSON.parse(
      await readFile(path.join(projectRoot, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(installedPackageJson.dependencies).toEqual(packageJson.dependencies);
    for (const dependencyName of Object.keys(installedPackageJson.dependencies ?? {})) {
      for (const token of forbiddenTokens) {
        expect(dependencyName, token).not.toContain(token);
      }
    }
  });
});
